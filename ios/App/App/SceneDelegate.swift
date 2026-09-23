import UIKit
import Capacitor
import WebKit
import AVFoundation

// Preserve UIKit's spinner and pull animation while placing it in the
// visible gap. UIKit owns the control's frame, so recalculate after layout.
private final class BreezeRefreshControl: UIRefreshControl {
    var verticalPlacement: ((UIRefreshControl) -> CGFloat)?

    override func layoutSubviews() {
        super.layoutSubviews()
        let placement = CATransform3DMakeTranslation(0, verticalPlacement?(self) ?? 0, 0)
        if !CATransform3DEqualToTransform(layer.sublayerTransform, placement) {
            layer.sublayerTransform = placement
        }
        clipsToBounds = false
        // The target can overlap the web page's empty safe-area padding.
        // Keep the system spinner above the opaque WKWebView content there.
        if superview?.subviews.last !== self { superview?.bringSubviewToFront(self) }
    }
}

final class BreezeBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler, AVSpeechSynthesizerDelegate {
    private static let themeMessageHandler = "breezeReaderTheme"
    private static let speechMessageHandler = "breezeSpeech"
    private static let vocabularyExportHandler = "breezeVocabularyExport"
    private static let libraryRefreshHandler = "breezeRefresh"
    private static let lightReaderBackground = UIColor(red: 250 / 255, green: 248 / 255, blue: 242 / 255, alpha: 1)
    private static let darkReaderBackground = UIColor(red: 23 / 255, green: 24 / 255, blue: 22 / 255, alpha: 1)
    private let speechSynthesizer = AVSpeechSynthesizer()
    private var speechGenerations: [ObjectIdentifier: Int] = [:]
    private var activeSpeechGeneration: Int?
    private var speechStartDeadline: DispatchWorkItem?
    private let libraryRefreshControl = BreezeRefreshControl()
    private var libraryRefreshLogoTop: CGFloat?
    private var libraryRefreshScrollObservation: NSKeyValueObservation?
    private var libraryRefreshLayoutSize = CGSize.zero
    private var libraryRefreshSafeTop: CGFloat = -1
    private var libraryRefreshSequence = 0
    private var activeLibraryRefreshSequence: Int?
    private static let speechCategory = "playback"
    private static let speechMode = "default"
    private static let speechOptions = ["duckOthers"]

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        // Capacitor disables WKWebView rubber-banding by default. Breeze's
        // reader is an inner web scroller, so restoring the native setting
        // brings the same edge bounce to Text, EPUB, and PDF without JS.
        guard let webView else { return }

        webView.scrollView.bounces = true
        libraryRefreshControl.tintColor = UIColor(red: 65 / 255, green: 105 / 255, blue: 118 / 255, alpha: 1)
        libraryRefreshControl.addTarget(self, action: #selector(refreshLibraryFromScroll), for: .valueChanged)
        libraryRefreshControl.verticalPlacement = { [weak self] control in
            guard let self, let webView = self.webView else { return 0 }
            let safeTop = self.view.safeAreaInsets.top
            guard let logoTop = self.libraryRefreshLogoTop else { return safeTop }
            let logoScreenTop = webView.scrollView.convert(CGPoint(x: 0, y: logoTop), to: self.view).y
            let target = (safeTop + logoScreenTop) / 2
            let center = control.convert(CGPoint(x: control.bounds.midX, y: control.bounds.midY), to: self.view).y
            return max(0, target - center)
        }
        libraryRefreshScrollObservation = webView.scrollView.observe(\.contentOffset, options: [.new]) { [weak self] scrollView, _ in
            guard let self, scrollView.refreshControl === self.libraryRefreshControl else { return }
            self.libraryRefreshControl.setNeedsLayout()
        }
        applyReaderBackground(isDark: false)
        webView.configuration.userContentController.add(self, name: Self.themeMessageHandler)
        webView.configuration.userContentController.add(self, name: Self.speechMessageHandler)
        webView.configuration.userContentController.add(self, name: Self.vocabularyExportHandler)
        webView.configuration.userContentController.add(self, name: Self.libraryRefreshHandler)
        speechSynthesizer.delegate = self
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(stopSpeechForBackground),
            name: UIApplication.willResignActiveNotification,
            object: nil
        )
        webView.configuration.userContentController.addUserScript(
            WKUserScript(
                source: Self.themeReporterScript,
                injectionTime: .atDocumentEnd,
                forMainFrameOnly: true
            )
        )
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == Self.libraryRefreshHandler {
            guard message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.protocol == "breeze",
                  message.frameInfo.securityOrigin.host == "localhost",
                  let request = message.body as? [String: Any] else { return }
            if let enabled = request["enabled"] as? Bool {
                if enabled {
                    if webView?.scrollView.refreshControl !== libraryRefreshControl {
                        webView?.scrollView.refreshControl = libraryRefreshControl
                        measureLibraryRefreshLogo()
                    }
                } else {
                    finishLibraryRefresh(activeLibraryRefreshSequence)
                    webView?.scrollView.refreshControl = nil
                    activeLibraryRefreshSequence = nil
                }
            } else if let finished = (request["finished"] as? NSNumber)?.intValue,
                      finished == activeLibraryRefreshSequence {
                finishLibraryRefresh(finished)
            }
            return
        }
        if message.name == Self.vocabularyExportHandler {
            guard message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.protocol == "breeze",
                  message.frameInfo.securityOrigin.host == "localhost",
                  let request = message.body as? [String: Any],
                  let id = request["id"] as? String,
                  let csv = request["csv"] as? String else { return }
            exportVocabulary(csv, id: id)
            return
        }
        if message.name == Self.themeMessageHandler {
            guard let rgb = message.body as? [Double], rgb.count == 3,
                  rgb.allSatisfy({ $0.isFinite && (0...255).contains($0) }) else { return }
            applyPageBackground(UIColor(red: CGFloat(rgb[0] / 255), green: CGFloat(rgb[1] / 255),
                                        blue: CGFloat(rgb[2] / 255), alpha: 1))
            return
        }
        guard message.name == Self.speechMessageHandler,
              let request = message.body as? [String: Any] else { return }
        handleSpeechRequest(request)
    }

    @objc private func refreshLibraryFromScroll() {
        libraryRefreshSequence += 1
        let sequence = libraryRefreshSequence
        activeLibraryRefreshSequence = sequence
        webView?.evaluateJavaScript("typeof window.breezeNativeRefresh === 'function' && (window.breezeNativeRefresh(\(sequence)), true)") { [weak self] result, error in
            if error != nil || (result as? Bool) != true {
                self?.finishLibraryRefresh(sequence)
            }
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        if libraryRefreshLayoutSize != view.bounds.size || libraryRefreshSafeTop != view.safeAreaInsets.top {
            libraryRefreshLayoutSize = view.bounds.size
            libraryRefreshSafeTop = view.safeAreaInsets.top
            measureLibraryRefreshLogo()
        }
        libraryRefreshControl.setNeedsLayout()
    }

    private func measureLibraryRefreshLogo() {
        guard webView?.scrollView.refreshControl === libraryRefreshControl else { return }
        // Measure once when enabled or the viewport changes, never on touchmove.
        // Adding scrollY gives a stable document coordinate even during a pull.
        webView?.evaluateJavaScript("(() => { const logo = document.getElementById('logo'); return logo ? logo.getBoundingClientRect().top + window.scrollY : null; })()") { [weak self] result, _ in
            guard let self, let top = (result as? NSNumber)?.doubleValue, top.isFinite, top >= 0 else { return }
            self.libraryRefreshLogoTop = CGFloat(top)
            self.libraryRefreshControl.setNeedsLayout()
        }
    }

    private func finishLibraryRefresh(_ sequence: Int?) {
        guard let sequence, activeLibraryRefreshSequence == sequence else { return }
        libraryRefreshControl.endRefreshing()
        activeLibraryRefreshSequence = nil
    }

    private func reportVocabularyExport(id: String, error: String? = nil) {
        let payload: [String: Any] = ["id": id, "error": error ?? ""]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('breeze-vocabulary-export',{detail:\(json)}))", completionHandler: nil)
    }

    private func exportVocabulary(_ csv: String, id: String) {
        guard presentedViewController == nil else {
            reportVocabularyExport(id: id, error: "Another sheet is open")
            return
        }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let file = directory.appendingPathComponent("breeze_vocab.csv")
            try csv.write(to: file, atomically: true, encoding: .utf8)
            let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
            sheet.popoverPresentationController?.sourceView = view
            sheet.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.maxY - view.safeAreaInsets.bottom - 44, width: 1, height: 1)
            sheet.completionWithItemsHandler = { [weak self] _, _, _, error in
                try? FileManager.default.removeItem(at: directory)
                self?.reportVocabularyExport(id: id, error: error?.localizedDescription)
            }
            present(sheet, animated: true)
        } catch {
            try? FileManager.default.removeItem(at: directory)
            reportVocabularyExport(id: id, error: error.localizedDescription)
        }
    }

    private func handleSpeechRequest(_ request: [String: Any]) {
        let generation = (request["generation"] as? NSNumber)?.intValue ?? 0
        logSpeech(stage: "bridge-received", generation: generation)
        if request["command"] as? String == "cancel" {
            speechSynthesizer.stopSpeaking(at: .immediate)
            return
        }
        guard request["command"] as? String == "speak",
              let raw = request["text"] as? String else { return }
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            reportSpeechError(generation: generation, stage: "request-text", message: "empty text")
            return
        }

        speechStartDeadline?.cancel()
        speechSynthesizer.stopSpeaking(at: .immediate)
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(
                .playback,
                mode: .default,
                options: [.duckOthers]
            )
        } catch {
            reportSpeechError(generation: generation, stage: "audio-session-category", error: error)
            return
        }
        logSpeech(stage: "audio-session-category", generation: generation, message: "ok")
        do {
            try session.setActive(true)
        } catch {
            reportSpeechError(generation: generation, stage: "audio-session-activate", error: error)
            return
        }
        logSpeech(stage: "audio-session-activate", generation: generation, message: "ok")

        let utterance = AVSpeechUtterance(string: text)
        guard let voice = AVSpeechSynthesisVoice(language: "en-US") else {
            reportSpeechError(generation: generation, stage: "voice-selection", message: "en-US voice unavailable")
            try? session.setActive(false, options: .notifyOthersOnDeactivation)
            return
        }
        utterance.voice = voice
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.95
        speechGenerations[ObjectIdentifier(utterance)] = generation
        activeSpeechGeneration = generation
        speechSynthesizer.speak(utterance)
        logSpeech(stage: "speak-called", generation: generation, message: voice.identifier)
        let deadline = DispatchWorkItem { [weak self, weak utterance] in
            guard let self, let utterance,
                  self.activeSpeechGeneration == generation,
                  self.speechGenerations[ObjectIdentifier(utterance)] == generation else { return }
            self.reportSpeechError(
                generation: generation,
                stage: "delegate-didStart-timeout",
                message: "didStart was not received within 5 seconds"
            )
            self.speechGenerations.removeValue(forKey: ObjectIdentifier(utterance))
            self.activeSpeechGeneration = nil
            self.speechSynthesizer.stopSpeaking(at: .immediate)
            try? session.setActive(false, options: .notifyOthersOnDeactivation)
        }
        speechStartDeadline = deadline
        DispatchQueue.main.asyncAfter(deadline: .now() + 5, execute: deadline)
    }

    @objc private func stopSpeechForBackground() {
        speechStartDeadline?.cancel()
        speechSynthesizer.stopSpeaking(at: .immediate)
    }

    private func finishSpeech(_ utterance: AVSpeechUtterance, state: String) {
        let generation = speechGenerations.removeValue(forKey: ObjectIdentifier(utterance)) ?? 0
        logSpeech(stage: state == "end" ? "delegate-didFinish" : "delegate-didCancel", generation: generation)
        reportSpeech(generation: generation, state: state)
        // stopSpeaking() can deliver the previous utterance's cancellation after
        // a new request has activated its session. Only the active generation may
        // tear that session down.
        guard activeSpeechGeneration == generation else { return }
        speechStartDeadline?.cancel()
        activeSpeechGeneration = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func reportSpeechError(generation: Int, stage: String, error: Error) {
        let nsError = error as NSError
        logSpeech(stage: stage, generation: generation, message: nsError.localizedDescription)
        reportSpeech(
            generation: generation,
            state: "error",
            stage: stage,
            message: nsError.localizedDescription,
            errorDomain: nsError.domain,
            errorCode: nsError.code
        )
    }

    private func reportSpeechError(generation: Int, stage: String, message: String) {
        logSpeech(stage: stage, generation: generation, message: message)
        reportSpeech(generation: generation, state: "error", stage: stage, message: message)
    }

    private func logSpeech(stage: String, generation: Int, message: String? = nil) {
        NSLog("[BreezeSpeech] generation=%d stage=%@ %@", generation, stage, message ?? "")
    }

    private func reportSpeech(
        generation: Int,
        state: String,
        stage: String? = nil,
        message: String? = nil,
        errorDomain: String? = nil,
        errorCode: Int? = nil
    ) {
        var detail: [String: Any] = ["generation": generation, "state": state]
        if let stage { detail["stage"] = stage }
        if let message { detail["message"] = message }
        if let errorDomain { detail["errorDomain"] = errorDomain }
        if let errorCode { detail["errorCode"] = errorCode }
        detail["audioSession"] = [
            "category": Self.speechCategory,
            "mode": Self.speechMode,
            "options": Self.speechOptions
        ]
        detail["app"] = [
            "version": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown",
            "build": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown"
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: detail),
              let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript(
            "window.dispatchEvent(new CustomEvent('breezeNativeSpeech',{detail:\(json)}))"
        )
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        let generation = speechGenerations[ObjectIdentifier(utterance)] ?? 0
        guard activeSpeechGeneration == generation else {
            logSpeech(stage: "delegate-didStart-stale", generation: generation)
            return
        }
        speechStartDeadline?.cancel()
        logSpeech(stage: "delegate-didStart", generation: generation)
        reportSpeech(generation: generation, state: "start")
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        finishSpeech(utterance, state: "end")
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        finishSpeech(utterance, state: "cancel")
    }

    private func applyReaderBackground(isDark: Bool) {
        applyPageBackground(isDark ? Self.darkReaderBackground : Self.lightReaderBackground)
    }

    private func applyPageBackground(_ color: UIColor) {
        view.backgroundColor = color
        webView?.backgroundColor = color
        webView?.scrollView.backgroundColor = color
        webView?.underPageBackgroundColor = color
    }

    private static let themeReporterScript = """
    (() => {
      let previous = '';
      const report = () => {
        const color = getComputedStyle(document.documentElement).backgroundColor;
        if (color === previous) return;
        const rgb = color.match(/[0-9.]+/g)?.slice(0, 3).map(Number);
        if (!rgb || rgb.length !== 3) return;
        previous = color;
        window.webkit?.messageHandlers?.breezeReaderTheme?.postMessage(rgb);
      };
      report();
      window.addEventListener('load', report, {once:true});
      const observer = new MutationObserver(report);
      observer.observe(document.documentElement, {attributes:true, attributeFilter:['class']});
      document.querySelectorAll('.view').forEach(view =>
        observer.observe(view, {attributes:true, attributeFilter:['class']}));
    })();
    """
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = BreezeBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
