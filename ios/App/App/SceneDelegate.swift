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
        if request["command"] as? String == "cancel" {
            speechSynthesizer.stopSpeaking(at: .immediate)
            return
        }
        guard request["command"] as? String == "speak",
              let raw = request["text"] as? String else { return }
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            reportSpeech(generation: generation, state: "error", message: "empty text")
            return
        }

        speechSynthesizer.stopSpeaking(at: .immediate)
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(
                .playback,
                mode: .spokenAudio,
                options: [.duckOthers, .allowBluetoothA2DP, .allowAirPlay]
            )
            try session.setActive(true)
        } catch {
            reportSpeech(generation: generation, state: "error", message: error.localizedDescription)
            return
        }

        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.95
        speechGenerations[ObjectIdentifier(utterance)] = generation
        activeSpeechGeneration = generation
        speechSynthesizer.speak(utterance)
    }

    @objc private func stopSpeechForBackground() {
        speechSynthesizer.stopSpeaking(at: .immediate)
    }

    private func finishSpeech(_ utterance: AVSpeechUtterance, state: String) {
        let generation = speechGenerations.removeValue(forKey: ObjectIdentifier(utterance)) ?? 0
        reportSpeech(generation: generation, state: state)
        guard activeSpeechGeneration == generation else { return }
        activeSpeechGeneration = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func reportSpeech(generation: Int, state: String, message: String? = nil) {
        var detail: [String: Any] = ["generation": generation, "state": state]
        if let message { detail["message"] = message }
        guard let data = try? JSONSerialization.data(withJSONObject: detail),
              let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript(
            "window.dispatchEvent(new CustomEvent('breezeNativeSpeech',{detail:\(json)}))"
        )
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        let generation = speechGenerations[ObjectIdentifier(utterance)] ?? 0
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
