import UIKit
import Capacitor
import WebKit

final class BreezeBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {
    private static let themeMessageHandler = "breezeReaderTheme"
    private static let lightReaderBackground = UIColor(red: 250 / 255, green: 248 / 255, blue: 242 / 255, alpha: 1)
    private static let darkReaderBackground = UIColor(red: 23 / 255, green: 24 / 255, blue: 22 / 255, alpha: 1)

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        // Capacitor disables WKWebView rubber-banding by default. Breeze's
        // reader is an inner web scroller, so restoring the native setting
        // brings the same edge bounce to Text, EPUB, and PDF without JS.
        guard let webView else { return }

        webView.scrollView.bounces = true
        applyReaderBackground(isDark: false)
        webView.configuration.userContentController.add(self, name: Self.themeMessageHandler)
        webView.configuration.userContentController.addUserScript(
            WKUserScript(
                source: Self.themeReporterScript,
                injectionTime: .atDocumentEnd,
                forMainFrameOnly: true
            )
        )
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == Self.themeMessageHandler,
              let theme = message.body as? String else { return }
        applyReaderBackground(isDark: theme == "dark")
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
