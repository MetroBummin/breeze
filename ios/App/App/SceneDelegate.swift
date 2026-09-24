import UIKit
import UIKit.UIGestureRecognizerSubclass
import Capacitor
import WebKit
import AVFoundation

// Only recognizes the stop-inertia Pencil contact. Every ordinary contact fails
// immediately so WebKit keeps delivering its original stylus Touch sequence.
private final class BreezePdfPencilGate: UIGestureRecognizer {
    var begin: ((UITouch, UIEvent) -> Bool)?
    override func canBePrevented(by preventingGestureRecognizer: UIGestureRecognizer) -> Bool { false }
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        guard let pencil = touches.first, begin?(pencil, event) == true else {
            state = .failed
            return
        }
        state = .began
    }
    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) { state = .changed }
    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) { state = .ended }
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) { state = .cancelled }
}

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

final class BreezeBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler, AVSpeechSynthesizerDelegate {
    #if DEBUG
    private var inkRawInputRows: [[String: Any]] = []
    private var inkTraceEnabled = false
    private var inkTraceRows: [[String: Any]] = []
    private var inkNativeTraceRows: [[String: Any]] = []
    #endif
    private var inkNativeScope: [String: Any] = [:]
    private static let themeMessageHandler = "breezeReaderTheme"
    private static let speechMessageHandler = "breezeSpeech"
    private static let vocabularyExportHandler = "breezeVocabularyExport"
    private static let libraryRefreshHandler = "breezeRefresh"
    private static let shareInboxHandler = "breezeShareInbox"
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
            let gate = BreezePdfPencilGate(target: nil, action: nil)
            gate.allowedTouchTypes = [NSNumber(value: UITouch.TouchType.pencil.rawValue)]
            gate.requiresExclusiveTouchType = false
            gate.delaysTouchesBegan = true
            gate.delaysTouchesEnded = false
            gate.cancelsTouchesInView = true
            gate.begin = { [weak self] touch, event in self?.routePdfPencil(touch, event: event) ?? false }
            webView.addGestureRecognizer(gate)
        }

        #if DEBUG
        if inkPad && ProcessInfo.processInfo.environment["BREEZE_INK_TRACE"] == "1" {
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
                self.inkRawInputRows.append(["phase": phase, "uptime": event.timestamp,
                    "at": Date().timeIntervalSince1970, "changed": touches.map(describe),
                    "all": (event.allTouches ?? []).map(describe),
                    "scrollViews": self.inkScrollSnapshots(webView)])
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

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "breezeInkScope" {
            guard message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.protocol == "breeze",
                  message.frameInfo.securityOrigin.host == "localhost",
                  let scope = message.body as? [String: Any] else { return }
            inkNativeScope = scope
            return
        }
        #if DEBUG
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

    private func routePdfPencil(_ touch: UITouch, event: UIEvent) -> Bool {
        guard let webView, inkNativeScope["enabled"] as? Bool == true,
              let viewport = inkNativeScope["viewport"] as? Double, viewport > 0,
              let boxData = inkNativeScope["box"] as? [Double], boxData.count == 4,
              let paperData = inkNativeScope["pages"] as? [[Double]],
              let excluded = inkNativeScope["excluded"] as? [[Double]] else { return false }
        let scale = webView.bounds.width / viewport
        func rect(_ values: [Double]) -> CGRect {
            guard values.count == 4 else { return .null }
            return CGRect(x: values[0] * scale, y: values[1] * scale,
                          width: values[2] * scale, height: values[3] * scale)
        }
        let point = touch.location(in: webView), box = rect(boxData)
        guard box.contains(point), !excluded.contains(where: { rect($0).contains(point) }) else { return false }
        // Find the public UIScrollView by geometry; no WebKit private class/API.
        func collect(_ view: UIView) -> [UIScrollView] {
            var result = (view as? UIScrollView).map { [$0] } ?? []
            for child in view.subviews { result += collect(child) }
            return result
        }
        let views = collect(webView)
        let candidates = views.filter {
            let frame = $0.convert($0.bounds, to: webView)
            return abs(frame.minX-box.minX) < 3 && abs(frame.minY-box.minY) < 3
                && abs(frame.width-box.width) < 3 && abs(frame.height-box.height) < 3
        }
        let expectedHeight = (inkNativeScope["scrollHeight"] as? Double ?? 0) * scale
        guard let scroll = candidates.min(by: {
            abs($0.contentSize.height-expectedHeight) < abs($1.contentSize.height-expectedHeight)
        }), abs(scroll.contentSize.height-expectedHeight) < 4 else { return false }
        let contentPoint = CGPoint(x: point.x-box.minX+scroll.contentOffset.x,
                                   y: point.y-box.minY+scroll.contentOffset.y)
        guard paperData.contains(where: { rect($0).contains(contentPoint) }) else { return false }
        let pan = scroll.panGestureRecognizer
        let fingerPan = (pan.state == .began || pan.state == .changed) && pan.numberOfTouches > 0
        let inertia = scroll.isDecelerating && !fingerPan
        let before = scroll.contentOffset
        // Ignore this particular Pencil in scrolling, not all contacts or UI.
        // Existing direct-finger pan/pinch recognizers keep their contacts/state.
        for owner in [scroll, webView.scrollView] {
            owner.panGestureRecognizer.ignore(touch, for: event)
            owner.pinchGestureRecognizer?.ignore(touch, for: event)
        }
        if inertia {
            if #available(iOS 17.4, *) {
                scroll.stopScrollingAndZooming()
            } else {
                scroll.setContentOffset(scroll.contentOffset, animated: false)
            }
        }
        #if DEBUG
        if inkTraceEnabled {
        inkRawInputRows.append(["phase": "gate", "uptime": event.timestamp,
            "consume": inertia, "fingerPan": fingerPan,
            "beforeX": before.x, "beforeY": before.y,
            "afterX": scroll.contentOffset.x, "afterY": scroll.contentOffset.y,
            "deceleratingAfter": scroll.isDecelerating])
        writeInkTrace()
        }
        #endif
        return inertia
    }

    #if DEBUG
    private func inkScrollSnapshots(_ view: UIView) -> [[String: Any]] {
        var result: [[String: Any]] = []
        if let scroll = view as? UIScrollView {
            let frame = webView.map { scroll.convert(scroll.bounds, to: $0) } ?? .zero
            result.append(["class": String(describing: type(of: scroll)),
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
    private func writeInkTrace() {
        let payload: [String: Any] = ["rows": inkTraceRows, "native": inkNativeTraceRows,
                                      "nativeInput": inkRawInputRows, "scope": inkNativeScope]
        if let data = try? JSONSerialization.data(withJSONObject: payload),
           let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first {
            try? data.write(to: directory.appendingPathComponent("breeze-ink-trace.json"), options: .atomic)
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
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        if color.getRed(&red, green: &green, blue: &blue, alpha: &alpha) {
            let isDark = 0.2126 * red + 0.7152 * green + 0.0722 * blue < 0.5
            libraryRefreshControl.overrideUserInterfaceStyle = isDark ? .dark : .light
            libraryRefreshControl.tintColor = isDark
                ? UIColor.label
                : UIColor(red: 65 / 255, green: 105 / 255, blue: 118 / 255, alpha: 1)
        }
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

    func sceneDidBecomeActive(_ scene: UIScene) {
        (window?.rootViewController as? BreezeBridgeViewController)?.deliverSharedLinks()
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
