import UIKit
import Capacitor
import WebKit
import AVFoundation

final class BreezeBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler, AVSpeechSynthesizerDelegate {
    private static let themeMessageHandler = "breezeReaderTheme"
    private static let speechMessageHandler = "breezeSpeech"
    private static let lightReaderBackground = UIColor(red: 250 / 255, green: 248 / 255, blue: 242 / 255, alpha: 1)
    private static let darkReaderBackground = UIColor(red: 23 / 255, green: 24 / 255, blue: 22 / 255, alpha: 1)
    private let speechSynthesizer = AVSpeechSynthesizer()
    private var speechGenerations: [ObjectIdentifier: Int] = [:]
    private var activeSpeechGeneration: Int?
    private var speechStartDeadline: DispatchWorkItem?
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
        applyReaderBackground(isDark: false)
        webView.configuration.userContentController.add(self, name: Self.themeMessageHandler)
        webView.configuration.userContentController.add(self, name: Self.speechMessageHandler)
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
        if message.name == Self.themeMessageHandler, let theme = message.body as? String {
            applyReaderBackground(isDark: theme == "dark")
            return
        }
        guard message.name == Self.speechMessageHandler,
              let request = message.body as? [String: Any] else { return }
        handleSpeechRequest(request)
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
        let color = isDark ? Self.darkReaderBackground : Self.lightReaderBackground
        view.backgroundColor = color
        webView?.backgroundColor = color
        webView?.scrollView.backgroundColor = color
    }

    private static let themeReporterScript = """
    (() => {
      const report = () => window.webkit?.messageHandlers?.breezeReaderTheme
        ?.postMessage(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
      report();
      new MutationObserver(report).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class']
      });
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
