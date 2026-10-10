import UIKit
import UIKit.UIGestureRecognizerSubclass
import Capacitor
import WebKit
import AVFoundation
import AuthenticationServices
import CryptoKit

// BEGIN AUTH_CALLBACK_POLICY
// Foundation-only boundary exercised by the unsigned native CI job.
private enum BreezeAuthCallbackPolicy {
    static func authorize(_ url: URL, request: String) -> Bool {
        guard UUID(uuidString: request) != nil,
              url.scheme == "https", url.host == "hrtfhojbhqvaoiulspto.supabase.co",
              url.user == nil, url.password == nil, url.port == nil, url.fragment == nil,
              url.path == "/auth/v1/authorize",
              let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return false }
        let providers = parts.queryItems?.filter { $0.name == "provider" } ?? []
        let redirects = parts.queryItems?.filter { $0.name == "redirect_to" } ?? []
        return providers.count == 1 && ["apple", "google"].contains(providers[0].value ?? "")
            && redirects.count == 1
            && redirects[0].value == "kr.io.breeze.app://auth/callback?request=\(request)"
    }

    static func callback(_ url: URL, request: String) -> Bool {
        guard UUID(uuidString: request) != nil,
              url.scheme == "kr.io.breeze.app", url.host == "auth", url.path == "/callback",
              url.user == nil, url.password == nil, url.port == nil,
              let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return false }
        let requests = parts.queryItems?.filter { $0.name == "request" } ?? []
        return requests.count == 1 && requests[0].value == request
    }
}
// END AUTH_CALLBACK_POLICY

// BEGIN APPLE_TOKEN_POLICY
// These checks bind the OS reply to this request. Supabase verifies the JWT
// signature and the raw nonce before accepting the existing Apple identity.
private enum BreezeAppleTokenPolicy {
    static func accepts(_ token: String, nonceHash: String, subject: String, now: TimeInterval = Date().timeIntervalSince1970) -> Bool {
        let parts = token.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3, !parts[0].isEmpty, !parts[2].isEmpty, !subject.isEmpty else { return false }
        var payload = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        payload += String(repeating: "=", count: (4 - payload.count % 4) % 4)
        guard let data = Data(base64Encoded: payload),
              let claims = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              claims["iss"] as? String == "https://appleid.apple.com",
              claims["aud"] as? String == "kr.io.breeze.app",
              claims["sub"] as? String == subject,
              claims["nonce"] as? String == nonceHash,
              let expiry = claims["exp"] as? Double, expiry > now else { return false }
        return true
    }
}
// END APPLE_TOKEN_POLICY

// BEGIN PDF_CONTACT_POLICY
// Native identities only: never compare these with DOM Touch/Pointer IDs.
// Roles are assigned on admission and cannot change until that contact ends.
private struct BreezePdfContactLedger<ID: Hashable> {
    enum Role { case navigation, suppressed, ink, stopOnly, blocked, outside }
    private(set) var roles: [ID: Role] = [:]
    private(set) var live: Set<ID> = []
    var hasNavigation: Bool { roles.values.contains(.navigation) }
    var pencilOwnsPaper: Bool { roles.values.contains(.ink) || roles.values.contains(.stopOnly) }
    var hasPencil: Bool { pencilOwnsPaper || roles.values.contains(.blocked) }

    mutating func observe(live: Set<ID>, nonPencil: Set<ID>, navigation: Set<ID>? = nil) {
        // Classify new palms BEFORE retiring the lifting Pencil in a mixed event.
        let suppressNewContacts = pencilOwnsPaper
        for id in nonPencil where roles[id] == nil {
            roles[id] = !(navigation ?? nonPencil).contains(id) ? .outside : (suppressNewContacts ? .suppressed : .navigation)
        }
        roles = roles.filter { live.contains($0.key) }
        self.live = live
    }

    mutating func beginPencil(_ id: ID, ready: Bool, decelerating: Bool) -> Role {
        if let role = roles[id] { return role }
        let role: Role
        if !ready || hasNavigation || hasPencil { role = .blocked }
        else if decelerating { role = .stopOnly }
        else { role = .ink }
        roles[id] = role
        return role
    }

    mutating func interrupt() {
        // A surviving contact must lift before it can enter a different mode.
        for (id, role) in roles {
            if role != .navigation && role != .suppressed && role != .outside { roles[id] = .blocked }
        }
    }
    mutating func forget(_ id: ID) {
        roles.removeValue(forKey: id)
        live.remove(id)
    }
}
// END PDF_CONTACT_POLICY

// BEGIN PDF_INPUT_ADAPTERS
// Observe native touch lifetimes even when WebKit emits no DOM touch events
// (notably the native scrollbar). This observer never recognizes a gesture.
private final class BreezePdfContactObserver: UIGestureRecognizer {
    var report: ((UIEvent) -> Void)?
    override func canPrevent(_ preventedGestureRecognizer: UIGestureRecognizer) -> Bool { false }
    override func canBePrevented(by preventingGestureRecognizer: UIGestureRecognizer) -> Bool { false }
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) { report?(event) }
    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) { report?(event) }
    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) { finish(event) }
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) { finish(event) }
    private func finish(_ event: UIEvent) {
        report?(event)
        if !(event.allTouches ?? []).contains(where: { $0.phase != .ended && $0.phase != .cancelled }) {
            state = .failed
        }
    }
}

// Consume only this Pencil's stop-only/rejected sequence. A stop-only contact
// must also win WebKit's competing touch recognizers, or JS may save a dot after
// native momentum stops. A blocked Pencil during finger navigation cannot win.
private final class BreezePdfPencilGate: UIGestureRecognizer {
    var begin: ((UITouch, UIEvent) -> Bool)?
    var isStopOnly: ((UITouch) -> Bool)?
    private var owned: ObjectIdentifier?
    private var preventsCompetingTouch = false
    override func canPrevent(_ preventedGestureRecognizer: UIGestureRecognizer) -> Bool {
        preventsCompetingTouch
    }
    override func canBePrevented(by preventingGestureRecognizer: UIGestureRecognizer) -> Bool { false }
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        guard owned == nil else { return }
        guard let pencil = touches.first(where: { $0.type == .pencil }), begin?(pencil, event) == true else {
            state = .failed
            return
        }
        owned = ObjectIdentifier(pencil)
        preventsCompetingTouch = isStopOnly?(pencil) == true
        state = .began
    }
    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        if touches.contains(where: { ObjectIdentifier($0) == owned }) { state = .changed }
    }
    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        if touches.contains(where: { ObjectIdentifier($0) == owned }) { state = .ended }
    }
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        if touches.contains(where: { ObjectIdentifier($0) == owned }) { state = .cancelled }
    }
    override func reset() { super.reset(); owned = nil; preventsCompetingTouch = false }
}

// Configure admission BETWEEN native contact sequences, not by removing a live
// Pencil from WebKit's recognizers. Preserve every non-Pencil input type and
// restore only values still owned by us. No delegate/recognizer replacement.
@MainActor private final class BreezePdfNavigationAdmission {
    @MainActor private final class Entry {
        weak var recognizer: UIGestureRecognizer?
        let original: [NSNumber]
        let installed: [NSNumber]
        init(_ recognizer: UIGestureRecognizer) {
            self.recognizer = recognizer
            original = recognizer.allowedTouchTypes
            installed = original.filter { $0.intValue != UITouch.TouchType.pencil.rawValue }
        }
    }
    private var entries: [ObjectIdentifier: Entry] = [:]
    var isEmpty: Bool { entries.isEmpty }
    private func busy(_ recognizer: UIGestureRecognizer) -> Bool {
        recognizer.state == .began || recognizer.state == .changed
    }
    func reconcile(_ wanted: [UIGestureRecognizer], contactsActive: Bool) -> Bool {
        guard !contactsActive,
              !wanted.contains(where: busy),
              !entries.values.contains(where: { $0.recognizer.map(busy) ?? false }) else { return false }
        let ids = Set(wanted.map(ObjectIdentifier.init))
        for (id, entry) in Array(entries) where !ids.contains(id) {
            if let recognizer = entry.recognizer, recognizer.allowedTouchTypes == entry.installed {
                recognizer.allowedTouchTypes = entry.original
            }
            entries.removeValue(forKey: id)
        }
        for recognizer in wanted {
            let id = ObjectIdentifier(recognizer)
            // WebKit may have updated its type policy; preserve its new baseline.
            if entries[id]?.recognizer !== recognizer || entries[id]?.installed != recognizer.allowedTouchTypes {
                let entry = Entry(recognizer)
                entries[id] = entry
                if recognizer.allowedTouchTypes != entry.installed { recognizer.allowedTouchTypes = entry.installed }
            }
        }
        return true
    }
    func covers(_ recognizer: UIGestureRecognizer) -> Bool {
        let entry = entries[ObjectIdentifier(recognizer)]
        return entry?.recognizer === recognizer && entry?.installed == recognizer.allowedTouchTypes
            && !recognizer.allowedTouchTypes.contains { $0.intValue == UITouch.TouchType.pencil.rawValue }
    }
}
// END PDF_INPUT_ADAPTERS

#if DEBUG
// Observation only: never feeds admission or writes scroll positions.
private final class BreezePdfMotionProbe: NSObject {
    private final class TickTarget: NSObject {
        weak var owner: BreezePdfMotionProbe?
        @objc func tick() { owner?.sample() }
    }
    private weak var scroll: UIScrollView?
    private var link: CADisplayLink?
    private var samples: [[String: Any]] = []
    private var previousOffset: CGPoint?
    deinit { link?.invalidate() }
    func bind(_ next: UIScrollView?) {
        guard scroll !== next else { return }
        link?.invalidate(); link = nil
        scroll = next; samples.removeAll(); previousOffset = nil
        guard next != nil else { return }
        let target = TickTarget(); target.owner = self
        let display = CADisplayLink(target: target, selector: #selector(TickTarget.tick))
        display.add(to: .main, forMode: .common)
        link = display
    }
    private func sample() {
        guard UIApplication.shared.applicationState == .active, let scroll else {
            samples.removeAll(); previousOffset = nil; return
        }
        let offset = scroll.contentOffset
        let delta = previousOffset.map { [offset.x - $0.x, offset.y - $0.y] }
        samples.append(["uptime": ProcessInfo.processInfo.systemUptime,
                        "offset": [offset.x, offset.y],
                        "offsetDelta": delta as Any? ?? NSNull(),
                        "decelerating": scroll.isDecelerating,
                        "dragging": scroll.isDragging, "tracking": scroll.isTracking,
                        "panState": scroll.panGestureRecognizer.state.rawValue])
        if samples.count > 12 { samples.removeFirst() }
        previousOffset = offset
    }
    func before(_ timestamp: TimeInterval, scroll expected: UIScrollView) -> [[String: Any]] {
        guard scroll === expected else { return [] }
        return Array(samples.filter { ($0["uptime"] as? Double ?? .infinity) < timestamp }.suffix(4))
    }
}
#endif

#if DEBUG
// Observes UIKit delivery without recognizing, cancelling, delaying, or preventing
// any gesture. Needed when WKWebView does not send a momentum-time touch to JS.
private final class BreezeInkInputProbe: UIGestureRecognizer {
    var report: ((String, Set<UITouch>, UIEvent) -> Void)?
    override func canPrevent(_ preventedGestureRecognizer: UIGestureRecognizer) -> Bool { false }
    override func canBePrevented(by preventingGestureRecognizer: UIGestureRecognizer) -> Bool { false }
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        report?("began", touches, event)
    }
    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        report?("moved", touches, event)
    }
    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        report?("ended", touches, event)
        if !(event.allTouches ?? []).contains(where: { $0.phase != .ended && $0.phase != .cancelled }) { state = .failed }
    }
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        report?("cancelled", touches, event)
        if !(event.allTouches ?? []).contains(where: { $0.phase != .ended && $0.phase != .cancelled }) { state = .failed }
    }
}
#endif

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

final class BreezeBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler, WKScriptMessageHandlerWithReply, AVSpeechSynthesizerDelegate, ASWebAuthenticationPresentationContextProviding, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    #if DEBUG
    private let pdfMotionProbe = BreezePdfMotionProbe()
    private var pdfMotionTraceEnabled = false
    private var pdfMotionRows: [[String: Any]] = []
    private var pdfMotionSavePending = false
    private var inkRawInputRows: [[String: Any]] = []
    private var inkTraceEnabled = false
    private var pdfStateRows: [[String: Any]] = []
    private var pdfGateRows: [[String: Any]] = []
    private var pdfStateEnabled = false
    private weak var pdfStateScroll: UIScrollView?
    private var inkTraceSavePending = false
    private let inkTraceWriter = DispatchQueue(label: "kr.io.breeze.ink-trace", qos: .utility)
    private var inkTraceRows: [[String: Any]] = []
    private var inkNativeTraceRows: [[String: Any]] = []
    private var inkLastPanSignature = ""
    private var inkObservedPans = Set<ObjectIdentifier>()
    private var inkPanObservations: [NSKeyValueObservation] = []
    private var inkCancellationRows: [[String: Any]] = []
    #endif
    // BEGIN PDF_ROUTING_STATE
    private var inkNativeScope: [String: Any] = [:]
    private var pdfContacts = BreezePdfContactLedger<ObjectIdentifier>()
    private let pdfNavigationAdmission = BreezePdfNavigationAdmission()
    private weak var pdfPaperScroller: UIScrollView?
    private var pdfLastContactTimestamp: TimeInterval = -1
    // UIKit may recycle a UITouch object after its end callback was consumed
    // by another recognizer. A fresh .began timestamp separates the contacts.
    private var pdfContactBirths: [ObjectIdentifier: TimeInterval] = [:]
    private var pdfRoutingNeedsRefresh = false
    private var pdfRoutingRefreshScheduled = false
    // Native and DOM touch IDs are unrelated. Match the birth time and paper
    // point supplied by the web touchstart, then reply before any ink is made.
    private var pdfRecentPencilRoles: [(at: TimeInterval, point: CGPoint, role: BreezePdfContactLedger<ObjectIdentifier>.Role)] = []
    // END PDF_ROUTING_STATE
    private static let themeMessageHandler = "breezeReaderTheme"
    private static let speechMessageHandler = "breezeSpeech"
    private static let vocabularyExportHandler = "breezeVocabularyExport"
    private static let libraryRefreshHandler = "breezeRefresh"
    private static let pencilAdmissionHandler = "breezePencilAdmission"
    private static let shareInboxHandler = "breezeShareInbox"
    private static let authHandler = "breezeAuth"
    private var authSession: ASWebAuthenticationSession?
    private var authRequest: String?
    private var authReply: ((Any?, String?) -> Void)?
    private var authDeadline: DispatchWorkItem?
    private var appleAuthController: ASAuthorizationController?
    private var appleAuthNonce: String?
    private static let sharedFileHandler = "breezeSharedFile"
    private let sharedFileQueue = DispatchQueue(label: "kr.io.breeze.shared-files", qos: .userInitiated)
    private static let readerSelectionHandler = "breezeReaderSelection"
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
        bridge?.registerPluginInstance(BreezePdfOcrPlugin())
        // Capacitor disables WKWebView rubber-banding by default. Breeze's
        // reader is an inner web scroller, so restoring the native setting
        // brings the same edge bounce to Text, EPUB, and PDF without JS.
        guard let webView else { return }

        // Stop native selection at its owner, before it can take touches away
        // from DOM gestures. CSS/selectionchange remain the browser fallback.
        webView.configuration.userContentController.add(self, name: Self.readerSelectionHandler)
        webView.configuration.userContentController.addUserScript(
            WKUserScript(source: Self.readerSelectionScript, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )
        refreshReaderSelectionPolicy()

        // Native idiom, not viewport width or desktop-mode user agent.
        // Mac Catalyst / iPad apps running on Mac must not expose Pencil tools.
        let inkPad = UIDevice.current.userInterfaceIdiom == .pad && !ProcessInfo.processInfo.isiOSAppOnMac
        let inkPlatformScript = "window.breezeInkIPad = \(inkPad ? "true" : "false"); window.dispatchEvent(new Event('breeze-ink-platform'));"
        webView.configuration.userContentController.addUserScript(
            WKUserScript(source: inkPlatformScript, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )
        webView.evaluateJavaScript(inkPlatformScript, completionHandler: nil)

        if inkPad {
            webView.configuration.userContentController.add(self, name: "breezeInkScope")
            webView.configuration.userContentController.addScriptMessageHandler(
                self, contentWorld: .page, name: Self.pencilAdmissionHandler)
            let contacts = BreezePdfContactObserver(target: nil, action: nil)
            contacts.requiresExclusiveTouchType = false
            contacts.delaysTouchesBegan = false
            contacts.delaysTouchesEnded = false
            contacts.cancelsTouchesInView = false
            contacts.report = { [weak self] event in self?.observePdfContacts(event) }
            webView.addGestureRecognizer(contacts)
            let gate = BreezePdfPencilGate(target: nil, action: nil)
            gate.allowedTouchTypes = [NSNumber(value: UITouch.TouchType.pencil.rawValue)]
            gate.requiresExclusiveTouchType = false
            gate.delaysTouchesBegan = true
            gate.delaysTouchesEnded = false
            gate.cancelsTouchesInView = true
            gate.begin = { [weak self] touch, event in self?.routePdfPencil(touch, event: event) ?? false }
            gate.isStopOnly = { [weak self] touch in
                self?.pdfContacts.roles[ObjectIdentifier(touch)] == .stopOnly
            }
            webView.addGestureRecognizer(gate)
        }

        #if DEBUG
        pdfMotionTraceEnabled = inkPad && ProcessInfo.processInfo.environment["BREEZE_PDF_MOTION_TRACE"] == "1"
        if inkPad && ProcessInfo.processInfo.environment["BREEZE_PDF_STATE_TRACE"] == "1" {
            pdfStateEnabled = true
            webView.configuration.userContentController.add(self, name: "breezePdfState")
            webView.configuration.userContentController.addUserScript(WKUserScript(
                source: "window.breezePdfStateDebug=true;", injectionTime: .atDocumentStart, forMainFrameOnly: true))
            webView.configuration.userContentController.addUserScript(WKUserScript(
                source: Self.pdfStateScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
            webView.evaluateJavaScript("window.breezePdfStateDebug=true;" + Self.pdfStateScript, completionHandler: nil)
        }
        if inkPad && ProcessInfo.processInfo.environment["BREEZE_INK_TRACE"] == "1" {
            inkTraceEnabled = true // Capture native-only failures before any web trace arrives.
            let probe = BreezeInkInputProbe(target: nil, action: nil)
            probe.cancelsTouchesInView = false
            probe.delaysTouchesBegan = false
            probe.delaysTouchesEnded = false
            probe.requiresExclusiveTouchType = false
            probe.report = { [weak self] phase, touches, event in
                guard let self, self.inkTraceEnabled, let webView = self.webView else { return }
                func describe(_ touch: UITouch) -> [String: Any] {
                    let point = touch.location(in: webView)
                    return ["id": String(describing: ObjectIdentifier(touch)), "type": touch.type.rawValue,
                            "phase": touch.phase.rawValue, "x": point.x, "y": point.y,
                            "timestamp": touch.timestamp]
                }
                if phase == "began" { self.observeInkPanCancellation(webView) }
                let scrolls = self.inkScrollSnapshots(webView)
                let signature = scrolls.map { "\($0["panState"] ?? "")/\($0["tracking"] ?? "")" }.joined(separator: "|")
                var row: [String: Any] = ["phase": phase, "uptime": event.timestamp,
                    "at": Date().timeIntervalSince1970, "changed": touches.map(describe),
                    "all": (event.allTouches ?? []).map(describe), "scrollViews": scrolls]
                // Record recognizer ownership only at transitions, not every move.
                // This identifies native cancellation without guessing from JS fps.
                if phase != "moved" || signature != self.inkLastPanSignature {
                    row["recognizers"] = self.inkGestureSnapshots(webView)
                    row["touchViews"] = touches.map { touch in touch.view.map { String(describing: type(of: $0)) } ?? "nil" }
                }
                self.inkLastPanSignature = signature
                self.inkRawInputRows.append(row)
                if self.inkRawInputRows.count > 2000 { self.inkRawInputRows.removeFirst() }
                if phase != "moved" { self.writeInkTrace() }
            }
            webView.addGestureRecognizer(probe)
            let traceFlag = "window.breezeInkDebug = true;"
            webView.configuration.userContentController.addUserScript(
                WKUserScript(source: traceFlag, injectionTime: .atDocumentStart, forMainFrameOnly: true)
            )
            webView.configuration.userContentController.add(self, name: "breezeInkTrace")
            webView.evaluateJavaScript(traceFlag, completionHandler: nil)
        }
        #endif

        webView.scrollView.bounces = true
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
        webView.configuration.userContentController.add(self, name: Self.shareInboxHandler)
        webView.configuration.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: Self.authHandler)
        webView.configuration.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: Self.sharedFileHandler)
        speechSynthesizer.delegate = self
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(stopSpeechForBackground),
            name: UIApplication.willResignActiveNotification,
            object: nil
        )
        webView.configuration.userContentController.addUserScript(
            WKUserScript(source: Self.shareInboxScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        )
        webView.configuration.userContentController.addUserScript(
            WKUserScript(
                source: Self.themeReporterScript,
                injectionTime: .atDocumentEnd,
                forMainFrameOnly: true
            )
        )
    }

    // System consent browser only; credentials stay with Apple/Google and
    // Supabase. Google retains browser OAuth; Apple uses the native flow below.
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        view.window ?? ASPresentationAnchor()
    }

    private func finishAuth(request: String, callback: URL? = nil, value: Any? = nil, error: String? = nil) {
        guard authRequest == request else { return }
        let reply = authReply
        let session = authSession
        let apple = appleAuthController
        authRequest = nil
        authReply = nil
        authSession = nil
        appleAuthController = nil
        appleAuthNonce = nil
        authDeadline?.cancel()
        authDeadline = nil
        if callback == nil { session?.cancel() }
        apple?.delegate = nil
        apple?.presentationContextProvider = nil
        if error != nil, #available(iOS 16.0, *) { apple?.cancel() }
        reply?(value ?? callback?.absoluteString, error)
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        view.window ?? ASPresentationAnchor()
    }

    private func appleNonceHash(_ nonce: String) -> String {
        SHA256.hash(data: Data(nonce.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard controller === appleAuthController, let request = authRequest, let nonce = appleAuthNonce else { return }
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              credential.state == request,
              let data = credential.identityToken, let token = String(data: data, encoding: .utf8),
              BreezeAppleTokenPolicy.accepts(token, nonceHash: appleNonceHash(nonce), subject: credential.user) else {
            finishAuth(request: request, error: "Apple 로그인 응답을 확인할 수 없어요.")
            return
        }
        finishAuth(request: request, value: ["request": request, "nonce": nonce, "identityToken": token])
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard controller === appleAuthController, let request = authRequest else { return }
        let cancelled = (error as? ASAuthorizationError)?.code == .canceled
        finishAuth(request: request, error: cancelled ? "로그인을 취소했어요." : "Apple 로그인을 마치지 못했어요. 다시 시도해 주세요.")
    }

    private func handleAuthMessage(_ message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.protocol == "breeze",
              message.frameInfo.securityOrigin.host == "localhost",
              let body = message.body as? [String: Any],
              let request = body["request"] as? String, UUID(uuidString: request) != nil,
              let action = body["action"] as? String else {
            replyHandler(nil, "로그인 요청을 확인할 수 없어요.")
            return
        }
        if action == "cancel" {
            finishAuth(request: request, error: "로그인을 취소했어요.")
            replyHandler(true, nil)
            return
        }
        if action == "apple" {
            guard view.window != nil, authRequest == nil,
                  let nonce = body["nonce"] as? String, nonce.count == 64,
                  nonce.allSatisfy({ "0123456789abcdef".contains($0) }) else {
                replyHandler(nil, "Apple 로그인 요청을 확인할 수 없어요.")
                return
            }
            let appleRequest = ASAuthorizationAppleIDProvider().createRequest()
            appleRequest.requestedScopes = [.email]
            appleRequest.nonce = appleNonceHash(nonce)
            appleRequest.state = request
            let controller = ASAuthorizationController(authorizationRequests: [appleRequest])
            controller.delegate = self
            controller.presentationContextProvider = self
            authRequest = request
            authReply = replyHandler
            appleAuthNonce = nonce
            appleAuthController = controller
            let timeout = DispatchWorkItem { [weak self] in
                self?.finishAuth(request: request, error: "로그인 시간이 지났어요. 다시 시도해 주세요.")
            }
            authDeadline = timeout
            DispatchQueue.main.asyncAfter(deadline: .now() + 120, execute: timeout)
            controller.performRequests()
            return
        }
        guard action == "start", view.window != nil,
              let rawURL = body["url"] as? String, let url = URL(string: rawURL),
              BreezeAuthCallbackPolicy.authorize(url, request: request) else {
            replyHandler(nil, "로그인 연결을 확인할 수 없어요.")
            return
        }
        if let previous = authRequest {
            finishAuth(request: previous, error: "새 로그인 요청으로 바뀌었어요.")
        }
        authRequest = request
        authReply = replyHandler
        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "kr.io.breeze.app") { [weak self] callback, _ in
            DispatchQueue.main.async {
                guard let self, self.authRequest == request else { return }
                guard let callback,
                      BreezeAuthCallbackPolicy.callback(callback, request: request) else {
                    self.finishAuth(request: request, error: "로그인을 마치지 못했어요.")
                    return
                }
                self.finishAuth(request: request, callback: callback)
            }
        }
        session.presentationContextProvider = self
        authSession = session
        let timeout = DispatchWorkItem { [weak self] in
            self?.finishAuth(request: request, error: "로그인 시간이 지났어요. 다시 시도해 주세요.")
        }
        authDeadline = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 120, execute: timeout)
        if !session.start() { finishAuth(request: request, error: "로그인 창을 열지 못했어요.") }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == Self.readerSelectionHandler {
            guard message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.protocol == "breeze",
                  message.frameInfo.securityOrigin.host == "localhost",
                  let enabled = message.body as? Bool,
                  let webView else { return }
            if #available(iOS 14.5, *) {
                let preferences = webView.configuration.preferences
                if preferences.isTextInteractionEnabled != enabled {
                    preferences.isTextInteractionEnabled = enabled
                }
            }
            return
        }
        if message.name == "breezeInkScope" {
            guard message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.protocol == "breeze",
                  message.frameInfo.securityOrigin.host == "localhost",
                  let scope = message.body as? [String: Any] else { return }
            applyPdfScope(scope)
            return
        }
        #if DEBUG
        if message.name == "breezePdfState" {
            guard pdfStateEnabled, message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.protocol == "breeze",
                  message.frameInfo.securityOrigin.host == "localhost",
                  var row = message.body as? [String: Any] else { return }
            row["nativeAt"] = Date().timeIntervalSince1970
            func scrollState(_ scroll: UIScrollView?) -> [String: Any] {
                guard let scroll else { return [:] }
                return ["x": scroll.contentOffset.x, "y": scroll.contentOffset.y,
                    "width": scroll.contentSize.width, "height": scroll.contentSize.height,
                    "boundsWidth": scroll.bounds.width, "boundsHeight": scroll.bounds.height,
                    "tracking": scroll.isTracking, "decelerating": scroll.isDecelerating,
                    "pan": scroll.panGestureRecognizer.state.rawValue,
                    "panTouches": scroll.panGestureRecognizer.numberOfTouches, "zoom": scroll.zoomScale,
                    "insetLeft": scroll.adjustedContentInset.left, "insetRight": scroll.adjustedContentInset.right,
                    "minX": -scroll.adjustedContentInset.left,
                    "maxX": max(-scroll.adjustedContentInset.left,
                                scroll.contentSize.width-scroll.bounds.width+scroll.adjustedContentInset.right)]
            }
            row["outerNative"] = scrollState(webView?.scrollView)
            row["paperNative"] = scrollState(pdfPaperScroller ?? pdfStateScroll)
            row["nativeRoles"] = pdfContacts.roles.values.map { String(describing: $0) }
            row["routingPending"] = pdfRoutingNeedsRefresh
            pdfStateRows.append(row)
            if pdfStateRows.count > 60 { pdfStateRows.removeFirst() }
            let payload: [String: Any] = ["build": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") ?? "",
                "rows": pdfStateRows, "gate": pdfGateRows]
            // One small sample per second; never serialize/write from an input callback.
            inkTraceWriter.async {
                if let data = try? JSONSerialization.data(withJSONObject: payload),
                   let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first {
                    try? data.write(to: directory.appendingPathComponent("breeze-pdf-state.json"), options: .atomic)
                }
            }
            return
        }
        if message.name == "breezeInkTrace" {
            guard message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.protocol == "breeze",
                  message.frameInfo.securityOrigin.host == "localhost",
                  let request = message.body as? [String: Any],
                  let rows = request["rows"] as? [[String: Any]], rows.count <= 4000 else { return }
            // Read-only snapshots: the Reader is an inner overflow scroller.
            // Report every UIKit scroll view rather than assume WKWebView's outer
            // scrollView owns its momentum. Native delivery is asynchronous.
            inkTraceEnabled = true
            inkTraceRows += rows
            if inkTraceRows.count > 4000 { inkTraceRows.removeFirst(inkTraceRows.count - 4000) }
            inkNativeTraceRows.append(["afterSeq": rows.last?["seq"] ?? 0,
                "receivedAt": Date().timeIntervalSince1970,
                "scrollViews": webView.map { inkScrollSnapshots($0) } ?? []])
            if inkNativeTraceRows.count > 100 { inkNativeTraceRows.removeFirst() }
            writeInkTrace()
            return
        }
        #endif
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
        if message.name == Self.shareInboxHandler {
            guard message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.protocol == "breeze",
                  message.frameInfo.securityOrigin.host == "localhost",
                  let request = message.body as? [String: Any],
                  let action = request["action"] as? String else { return }
            if action == "list" { deliverSharedLinks() }
            if action == "open", let id = request["id"] as? String,
               UUID(uuidString: id) != nil,
               let item = try? ShareInboxStore.pending().first(where: { $0.id == id }),
               let url = URL(string: item.url),
               let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme),
               url.host != nil {
                UIApplication.shared.open(url)
            }
            if action == "read", let id = request["id"] as? String, UUID(uuidString: id) != nil {
                do { try ShareInboxStore.markOpened(id: id) }
                catch { NSLog("[BreezeShareInbox] mark read failed: %@", error.localizedDescription) }
                deliverSharedLinks()
            }
            if action == "ack", let ids = request["ids"] as? [String] {
                do { try ShareInboxStore.acknowledge(ids: ids) }
                catch { NSLog("[BreezeShareInbox] acknowledge failed: %@", error.localizedDescription) }
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

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        if message.name == Self.authHandler {
            handleAuthMessage(message, replyHandler: replyHandler)
            return
        }
        if message.name == Self.sharedFileHandler {
            guard message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.protocol == "breeze",
                  message.frameInfo.securityOrigin.host == "localhost",
                  let request = message.body as? [String: Any],
                  let id = request["id"] as? String, UUID(uuidString: id) != nil,
                  let action = request["action"] as? String else {
                replyHandler(nil, "파일 요청을 확인할 수 없어요.")
                return
            }
            sharedFileQueue.async {
                do {
                    let result: Any
                    switch action {
                    case "chunk":
                        guard let offset = request["offset"] as? Int else {
                            throw NSError(domain: "BreezeShareInbox", code: 4,
                                userInfo: [NSLocalizedDescriptionKey: "파일 읽기 위치가 올바르지 않아요."])
                        }
                        result = try ShareInboxStore.readFileChunk(id: id, offset: offset)
                    case "ack":
                        try ShareInboxStore.acknowledgeFile(id: id)
                        result = true
                    default:
                        throw NSError(domain: "BreezeShareInbox", code: 4,
                            userInfo: [NSLocalizedDescriptionKey: "지원하지 않는 파일 요청이에요."])
                    }
                    DispatchQueue.main.async { replyHandler(result, nil) }
                } catch {
                    DispatchQueue.main.async { replyHandler(nil, error.localizedDescription) }
                }
            }
            return
        }
        guard message.name == Self.pencilAdmissionHandler,
              message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.protocol == "breeze",
              message.frameInfo.securityOrigin.host == "localhost",
              let request = message.body as? [String: Any] else {
            replyHandler("blocked", nil)
            return
        }
        replyHandler(roleForWebPencil(request), nil)
    }

    // BEGIN PDF_ROUTING_METHODS
    private func applyPdfScope(_ scope: [String: Any]) {
        if inkNativeScope["enabled"] as? Bool == true && scope["enabled"] as? Bool != true {
            pdfContacts.interrupt()
            pdfRecentPencilRoles.removeAll()
        }
        inkNativeScope = scope
        pdfRoutingNeedsRefresh = true
        // Bind immediately when idle; defer changes if UIKit is still ending a contact.
        refreshPdfRouting()
        schedulePdfRoutingRefresh()
    }
    private func observePdfContacts(_ event: UIEvent) {
        guard event.timestamp >= pdfLastContactTimestamp, let touches = event.allTouches else { return }
        pdfLastContactTimestamp = event.timestamp
        for touch in touches where touch.phase == .began {
            let id = ObjectIdentifier(touch)
            if let prior = pdfContactBirths[id], prior != touch.timestamp {
                pdfContacts.forget(id)
            }
            pdfContactBirths[id] = touch.timestamp
        }
        let live = touches.filter { $0.phase != .ended && $0.phase != .cancelled }
        let liveIDs = Set(live.map(ObjectIdentifier.init))
        pdfContactBirths = pdfContactBirths.filter { liveIDs.contains($0.key) }
        let nonPencil = live.filter { $0.type != .pencil }
        let geometry = pdfScopeGeometry()
        let excluded = inkNativeScope["excluded"] as? [[Double]] ?? []
        let navigation = nonPencil.filter { touch in
            guard let webView, let geometry else { return false }
            let point = touch.location(in: webView)
            return geometry.box.contains(point) && !excluded.contains { data in
                guard data.count == 4 else { return false }
                return CGRect(x: data[0]*geometry.scale, y: data[1]*geometry.scale,
                              width: data[2]*geometry.scale, height: data[3]*geometry.scale).contains(point)
            }
        }
        pdfContacts.observe(live: liveIDs,
                            nonPencil: Set(nonPencil.map(ObjectIdentifier.init)),
                            navigation: Set(navigation.map(ObjectIdentifier.init)))
        if live.isEmpty && pdfRoutingNeedsRefresh { schedulePdfRoutingRefresh() }
    }

    private func schedulePdfRoutingRefresh() {
        guard pdfRoutingNeedsRefresh, !pdfRoutingRefreshScheduled else { return }
        pdfRoutingRefreshScheduled = true
        // Let UIKit finish delivering end/cancel before changing admission masks.
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.pdfRoutingRefreshScheduled = false
            self.refreshPdfRouting()
        }
    }

    private func pdfScopeGeometry() -> (scale: CGFloat, box: CGRect, height: CGFloat)? {
        guard let webView, inkNativeScope["enabled"] as? Bool == true,
              let viewport = inkNativeScope["viewport"] as? Double, viewport.isFinite, viewport > 0,
              let data = inkNativeScope["box"] as? [Double], data.count == 4,
              data.allSatisfy(\.isFinite), data[2] > 0, data[3] > 0,
              let height = inkNativeScope["scrollHeight"] as? Double, height.isFinite, height > 0 else { return nil }
        let scale = webView.bounds.width / CGFloat(viewport)
        return (scale, CGRect(x: data[0] * scale, y: data[1] * scale,
                              width: data[2] * scale, height: data[3] * scale), CGFloat(height) * scale)
    }

    private func pdfScrollerMatches(_ scroll: UIScrollView) -> Bool {
        guard let webView, scroll.isDescendant(of: webView), let geometry = pdfScopeGeometry() else { return false }
        let frame = scroll.convert(scroll.bounds, to: webView), box = geometry.box
        return abs(frame.minX-box.minX) < 3 && abs(frame.minY-box.minY) < 3
            && abs(frame.width-box.width) < 3 && abs(frame.height-box.height) < 3
            && abs(scroll.contentSize.height-geometry.height) < 4
    }

    private func refreshPdfRouting() {
        guard pdfContacts.live.isEmpty, let webView else { return }
        let enabled = inkNativeScope["enabled"] as? Bool == true
        var wanted: [UIGestureRecognizer] = []
        var paper: UIScrollView?
        if enabled {
            if let cached = pdfPaperScroller, pdfScrollerMatches(cached) { paper = cached }
            else {
                // Scope/layout changes only: never walk the layer tree in a
                // Pencil callback or on every move, and never use private classes.
                func find(_ view: UIView) -> UIScrollView? {
                    if let scroll = view as? UIScrollView, scroll !== webView.scrollView, pdfScrollerMatches(scroll) { return scroll }
                    for child in view.subviews { if let scroll = find(child) { return scroll } }
                    return nil
                }
                paper = find(webView)
            }
            guard let paper else { return } // Keep dirty; the next layout/scope retries.
            for scroll in [paper, webView.scrollView] {
                wanted.append(scroll.panGestureRecognizer)
                if let pinch = scroll.pinchGestureRecognizer { wanted.append(pinch) }
            }
        }
        if pdfNavigationAdmission.reconcile(wanted, contactsActive: !pdfContacts.live.isEmpty) {
            pdfPaperScroller = paper
            #if DEBUG
            if pdfMotionTraceEnabled { pdfMotionProbe.bind(paper) }
            #endif
            pdfRoutingNeedsRefresh = false
        }
    }

    private func routePdfPencil(_ touch: UITouch, event: UIEvent) -> Bool {
        observePdfContacts(event)
        let id = ObjectIdentifier(touch)
        if let role = pdfContacts.roles[id] { return role == .stopOnly || role == .blocked }
        guard touch.type == .pencil, let webView, let geometry = pdfScopeGeometry(),
              let paperData = inkNativeScope["pages"] as? [[Double]],
              let excluded = inkNativeScope["excluded"] as? [[Double]] else { return false }
        func rect(_ values: [Double]) -> CGRect {
            guard values.count == 4, values.allSatisfy(\.isFinite) else { return .null }
            return CGRect(x: values[0] * geometry.scale, y: values[1] * geometry.scale,
                          width: values[2] * geometry.scale, height: values[3] * geometry.scale)
        }
        let point = touch.location(in: webView)
        guard geometry.box.contains(point), !excluded.contains(where: { rect($0).contains(point) }) else { return false }
        guard let scroll = pdfPaperScroller, pdfScrollerMatches(scroll),
              pdfNavigationAdmission.covers(scroll.panGestureRecognizer),
              scroll.pinchGestureRecognizer.map(pdfNavigationAdmission.covers) ?? true,
              pdfNavigationAdmission.covers(webView.scrollView.panGestureRecognizer),
              webView.scrollView.pinchGestureRecognizer.map(pdfNavigationAdmission.covers) ?? true else {
            // Do not edit or alter live recognizers while a fresh web scroller
            // is still being bound. This entire contact is rejected, not retried
            // halfway through a stroke. The next contact uses the ready scope.
            let role = pdfContacts.beginPencil(id, ready: false, decelerating: false)
            rememberPdfPencilRole(touch, role: role)
            pdfRoutingNeedsRefresh = true
            recordPdfAdmission(role: "blocked-not-ready", event: event, scroll: webView.scrollView, before: webView.scrollView.contentOffset)
            return true
        }
        let contentPoint = CGPoint(x: point.x-geometry.box.minX+scroll.contentOffset.x,
                                   y: point.y-geometry.box.minY+scroll.contentOffset.y)
        var low = 0, high = paperData.count
        while low < high {
            let middle = (low + high) / 2
            if rect(paperData[middle]).maxY < contentPoint.y { low = middle + 1 }
            else { high = middle }
        }
        guard low < paperData.count, rect(paperData[low]).contains(contentPoint) else { return false }
        let before = scroll.contentOffset
        let isDeceleratingAtGate = scroll.isDecelerating
        #if DEBUG
        let preContactMotion = pdfMotionTraceEnabled ? pdfMotionProbe.before(touch.timestamp, scroll: scroll) : []
        #endif
        let role = pdfContacts.beginPencil(id, ready: true, decelerating: isDeceleratingAtGate)
        rememberPdfPencilRole(touch, role: role)
        if role == .stopOnly {
            if #available(iOS 17.4, *) { scroll.stopScrollingAndZooming() }
            else { scroll.setContentOffset(scroll.contentOffset, animated: false) }
        }
        #if DEBUG
        if pdfMotionTraceEnabled {
            recordPdfMotion(touch: touch, event: event, scroll: scroll, before: before,
                            preContactMotion: preContactMotion, atGate: isDeceleratingAtGate,
                            role: String(describing: role))
        }
        #endif
        recordPdfAdmission(role: String(describing: role), event: event, scroll: scroll, before: before)
        return role == .stopOnly || role == .blocked
    }

    private func rememberPdfPencilRole(_ touch: UITouch,
                                       role: BreezePdfContactLedger<ObjectIdentifier>.Role) {
        guard let webView else { return }
        // UITouch.timestamp and the web Event.timeStamp describe the contact's
        // birth, even if WebKit dispatches the DOM event after UIKit has ended it.
        let at = Date().timeIntervalSince1970 - ProcessInfo.processInfo.systemUptime + touch.timestamp
        pdfRecentPencilRoles.append((at, touch.location(in: webView), role))
        if pdfRecentPencilRoles.count > 8 { pdfRecentPencilRoles.removeFirst() }
    }

    private func roleForWebPencil(_ request: [String: Any]) -> String {
        guard let webView, inkNativeScope["enabled"] as? Bool == true,
              let eventAt = request["eventAt"] as? Double, eventAt.isFinite,
              let x = request["x"] as? Double, x.isFinite,
              let y = request["y"] as? Double, y.isFinite,
              let viewport = request["viewport"] as? Double, viewport.isFinite, viewport > 0 else {
            return "blocked"
        }
        let scale = webView.bounds.width / CGFloat(viewport)
        let point = CGPoint(x: x * scale, y: y * scale)
        let candidates = pdfRecentPencilRoles.indices.filter {
            abs(pdfRecentPencilRoles[$0].at - eventAt) <= 0.25 &&
                hypot(pdfRecentPencilRoles[$0].point.x - point.x,
                      pdfRecentPencilRoles[$0].point.y - point.y) <= 24
        }
        guard let index = candidates.min(by: {
            abs(pdfRecentPencilRoles[$0].at - eventAt) < abs(pdfRecentPencilRoles[$1].at - eventAt)
        }) else {
            return "blocked" // Unknown native owner must never become web ink.
        }
        // An admission is one-use: a later, unmatched web event cannot borrow
        // an earlier ink contact's role just because it started nearby.
        return pdfRecentPencilRoles.remove(at: index).role == .ink ? "ink" : "blocked"
    }
    // END PDF_ROUTING_METHODS

    private func recordPdfAdmission(role: String, event: UIEvent, scroll: UIScrollView, before: CGPoint) {
        #if DEBUG
        guard pdfStateEnabled || inkTraceEnabled else { return }
        pdfStateScroll = scroll
        let row: [String: Any] = ["at": Date().timeIntervalSince1970, "phase": "gate",
            "uptime": event.timestamp, "role": role, "consume": role != "ink",
            "navigation": pdfContacts.hasNavigation, "beforeX": before.x, "beforeY": before.y,
            "afterX": scroll.contentOffset.x, "afterY": scroll.contentOffset.y,
            "deceleratingAfter": scroll.isDecelerating]
        if pdfStateEnabled { pdfGateRows.append(row); if pdfGateRows.count > 40 { pdfGateRows.removeFirst() } }
        if inkTraceEnabled { inkRawInputRows.append(row); writeInkTrace() }
        #endif
    }

    #if DEBUG
    private func recordPdfMotion(touch: UITouch, event: UIEvent, scroll: UIScrollView,
                                 before: CGPoint, preContactMotion: [[String: Any]],
                                 atGate: Bool, role: String) {
        pdfMotionRows.append(["at": Date().timeIntervalSince1970,
            "touchTimestamp": touch.timestamp, "eventTimestamp": event.timestamp,
            "gateUptime": ProcessInfo.processInfo.systemUptime,
            "contact": String(describing: ObjectIdentifier(touch)),
            "scroller": String(describing: ObjectIdentifier(scroll)),
            "preContactMotion": preContactMotion,
            "isDeceleratingAtGate": atGate, "assignedRole": role,
            "offsetBefore": [before.x, before.y],
            "offsetAfter": [scroll.contentOffset.x, scroll.contentOffset.y],
            "deceleratingAfter": scroll.isDecelerating])
        if pdfMotionRows.count > 100 { pdfMotionRows.removeFirst() }
        guard !pdfMotionSavePending else { return }
        pdfMotionSavePending = true
        // Only diagnostic export is coalesced; admission has no delay/debounce.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
            guard let self else { return }
            self.pdfMotionSavePending = false
            let payload: [String: Any] = ["build": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") ?? "unknown",
                                         "rows": self.pdfMotionRows]
            self.inkTraceWriter.async {
                if let data = try? JSONSerialization.data(withJSONObject: payload),
                   let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first {
                    try? data.write(to: directory.appendingPathComponent("breeze-pdf-motion.json"), options: .atomic)
                }
            }
        }
    }

    private static let pdfStateScript = #"""
    (()=>{
      if(window.breezePdfStateTimer)return;
      let last=performance.now();
      window.breezePdfStateTimer=setInterval(()=>{
        try{
          if(typeof originalSession==='undefined'||originalSession?.kind!=='pdf')return;
          const box=readerScroller(),layer=originalZoomLayer(),stage=originalZoomStage();
          const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();
            return {x:r.x,y:r.y,width:r.width,height:r.height};};
          const now=performance.now(),p=originalPinch,s=originalSession;
          const row={at:Date.now(),ms:now,gap:now-last,hidden:document.hidden,zoom:originalZoom(),
            scroll:{x:box.scrollLeft,y:box.scrollTop,width:box.scrollWidth,height:box.scrollHeight,
              clientWidth:box.clientWidth,clientHeight:box.clientHeight},
            box:rect(box),layer:rect(layer),stage:rect(stage),firstPage:rect(s.pages[0]),
            transform:layer.style.transform,stageStyle:[stage.style.width,stage.style.height],
            pinch:p?{ids:p.ids,next:p.next,level:p.level,position:p.position,center:p.center,
              paper:p.paper,origin:p.origin,left:p.left,top:p.top}:null,
            pinchTouches:originalPinchTouches,pan:originalPinchPan,contacts:originalPdfContacts,
            render:{active:s.paintActive?.pageNumber??null,queue:s.paintQueue?.size??0,settled:s.settled.size},
            ink:BreezePdfInk.diagnosticState(),viewport:{scale:visualViewport.scale,
              x:visualViewport.offsetLeft,y:visualViewport.offsetTop},windowScroll:[scrollX,scrollY]};
          last=now;window.webkit.messageHandlers.breezePdfState.postMessage(row);
        }catch(_){}
      },1000);
    })();
    """#

    private func inkScrollSnapshots(_ view: UIView) -> [[String: Any]] {
        var result: [[String: Any]] = []
        if let scroll = view as? UIScrollView {
            let frame = webView.map { scroll.convert(scroll.bounds, to: $0) } ?? .zero
            result.append(["class": String(describing: type(of: scroll)),
                "id": String(describing: ObjectIdentifier(scroll)),
                "frame": [frame.minX,frame.minY,frame.width,frame.height],
                "contentHeight": scroll.contentSize.height,
                "offsetX": scroll.contentOffset.x, "offsetY": scroll.contentOffset.y,
                "dragging": scroll.isDragging, "tracking": scroll.isTracking,
                "decelerating": scroll.isDecelerating,
                "panState": scroll.panGestureRecognizer.state.rawValue,
                "panTouches": scroll.panGestureRecognizer.numberOfTouches])
        }
        for child in view.subviews { result += inkScrollSnapshots(child) }
        return result
    }
    private func observeInkPanCancellation(_ view: UIView) {
        if let scroll = view as? UIScrollView {
            let pan = scroll.panGestureRecognizer
            if inkObservedPans.insert(ObjectIdentifier(pan)).inserted {
                inkPanObservations.append(pan.observe(\.state, options: [.new]) { [weak self, weak scroll] pan, _ in
                    guard let self, let scroll, pan.state == .cancelled else { return }
                    self.inkCancellationRows.append(["at": Date().timeIntervalSince1970,
                        "view": String(describing: type(of: scroll)), "offset": scroll.contentOffset.y,
                        "stack": Thread.callStackSymbols])
                    if self.inkCancellationRows.count > 30 { self.inkCancellationRows.removeFirst() }
                })
            }
        }
        for child in view.subviews { observeInkPanCancellation(child) }
    }
    private func inkGestureSnapshots(_ view: UIView) -> [[String: Any]] {
        var result = (view.gestureRecognizers ?? []).map { recognizer -> [String: Any] in
            ["class": String(describing: type(of: recognizer)), "state": recognizer.state.rawValue,
             "view": String(describing: type(of: view)), "enabled": recognizer.isEnabled,
             "touches": recognizer.numberOfTouches]
        }
        for child in view.subviews { result += inkGestureSnapshots(child) }
        return result
    }
    private func writeInkTrace() {
        guard inkTraceEnabled, !inkTraceSavePending else { return }
        inkTraceSavePending = true
        // Coalesce input callbacks. Take a value snapshot on main later; JSON
        // encoding and disk IO belong to the serial utility queue, never input.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
            guard let self else { return }
            self.inkTraceSavePending = false
            let payload: [String: Any] = ["rows": self.inkTraceRows, "native": self.inkNativeTraceRows,
                "nativeInput": self.inkRawInputRows, "scope": self.inkNativeScope,
                "cancellations": self.inkCancellationRows]
            self.inkTraceWriter.async {
                if let data = try? JSONSerialization.data(withJSONObject: payload),
                   let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first {
                    try? data.write(to: directory.appendingPathComponent("breeze-ink-trace.json"), options: .atomic)
                }
            }
        }
    }
    #endif

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
        if inkNativeScope["enabled"] as? Bool == true,
           pdfPaperScroller.map({ !pdfScrollerMatches($0) }) ?? true {
            pdfRoutingNeedsRefresh = true
        }
        schedulePdfRoutingRefresh()
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

    func deliverSharedLinks() {
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(ShareInboxStore.pendingFiles())
            if let json = String(data: data, encoding: .utf8) {
                webView?.evaluateJavaScript("window.breezeSharedFilesPending = \(json); window.dispatchEvent(new CustomEvent('breeze-shared-files',{detail:window.breezeSharedFilesPending}))", completionHandler: nil)
            }
        } catch {
            NSLog("[BreezeShareInbox] file listing failed: %@", error.localizedDescription)
        }
        do {
            let items = try ShareInboxStore.pending()
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(items)
            guard let json = String(data: data, encoding: .utf8) else { return }
            NSLog("[BreezeShareInbox] loaded %d pending links", items.count)
            webView?.evaluateJavaScript("window.breezeShareInboxPending = \(json); window.dispatchEvent(new CustomEvent('breeze-share-inbox',{detail:window.breezeShareInboxPending}))") { _, error in
                if let error { NSLog("[BreezeShareInbox] delivery failed: %@", error.localizedDescription) }
            }
        } catch {
            NSLog("[BreezeShareInbox] read failed: %@", error.localizedDescription)
        }
    }

    private static let shareInboxScript = """
    window.breezeShareInboxPending = [];
    window.breezeSharedFilesPending = [];
    window.breezeSharedFiles = {
      readChunk: (id, offset) => window.webkit.messageHandlers.breezeSharedFile.postMessage({action:'chunk', id, offset}),
      acknowledge: id => window.webkit.messageHandlers.breezeSharedFile.postMessage({action:'ack', id})
    };
    window.breezeShareInbox = {
      list: () => window.webkit.messageHandlers.breezeShareInbox.postMessage({action:'list'}),
      acknowledge: ids => window.webkit.messageHandlers.breezeShareInbox.postMessage({action:'ack', ids}),
      markRead: id => window.webkit.messageHandlers.breezeShareInbox.postMessage({action:'read', id}),
      open: id => window.webkit.messageHandlers.breezeShareInbox.postMessage({action:'open', id})
    };
    window.addEventListener('load', () => window.breezeShareInbox.list(), {once:true});
    """

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
        pdfContacts.interrupt()
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
        // Follow the app's actual background, even when its theme differs
        // from the device setting. UIKit's spinner also needs the local trait.
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 1
        if color.getRed(&red, green: &green, blue: &blue, alpha: &alpha) {
            let isDark = 0.2126 * red + 0.7152 * green + 0.0722 * blue < 0.5
            libraryRefreshControl.overrideUserInterfaceStyle = isDark ? .dark : .light
            libraryRefreshControl.tintColor = isDark
                ? UIColor.label
                : UIColor(red: 65 / 255, green: 105 / 255, blue: 118 / 255, alpha: 1)
        }
    }

    // BEGIN READER_NATIVE_SELECTION
    func refreshReaderSelectionPolicy() {
        // Also handles the already-loaded document and app resume. The script
        // is idempotent; no polling or gesture-recognizer replacement is used.
        webView?.evaluateJavaScript(Self.readerSelectionScript, completionHandler: nil)
    }

    private static let readerSelectionScript = #"""
    (() => {
      if (location.protocol !== 'breeze:' || location.hostname !== 'localhost') return;
      if (window.__breezeReaderSelectionPolicy) {
        window.__breezeReaderSelectionPolicy();
        return;
      }
      let previous;
      const textControl = element => {
        if (!element || !element.isConnected) return false;
        if (element.isContentEditable) return true;
        if (element.disabled) return false;
        if (element.tagName === 'TEXTAREA') return true;
        return element.tagName === 'INPUT' &&
          ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].includes(element.type);
      };
      const report = (force = false) => {
        const enabled = !document.body?.classList.contains('reading') || textControl(document.activeElement);
        if (!force && enabled === previous) return;
        const handler = window.webkit?.messageHandlers?.breezeReaderSelection;
        if (!handler) return;
        try {
          handler.postMessage(enabled);
          previous = enabled;
        } catch (_) { /* Retry on the next state/lifecycle event, not a timer. */ }
      };
      window.__breezeReaderSelectionPolicy = () => report(true);
      const observeBody = () => {
        if (document.body) {
          new MutationObserver(() => report()).observe(document.body,
            {attributes: true, attributeFilter: ['class']});
        }
        report();
      };
      // A global permanent false also disables typing on some iOS releases.
      // Actual text controls keep cursor, IME, selection and paste. Read-only
      // controls also retain copying; contenteditable=false is not an editor.
      document.addEventListener('focusin', () => report(), true);
      document.addEventListener('focusout', () => queueMicrotask(() => report()), true);
      document.addEventListener('visibilitychange', () => report(true));
      window.addEventListener('pageshow', () => report(true));
      if (document.body) observeBody();
      else document.addEventListener('DOMContentLoaded', observeBody, {once: true});
    })();
    """#
    // END READER_NATIVE_SELECTION

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

    func sceneDidBecomeActive(_ scene: UIScene) {
        (window?.rootViewController as? BreezeBridgeViewController)?.refreshReaderSelectionPolicy()
        (window?.rootViewController as? BreezeBridgeViewController)?.deliverSharedLinks()
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
