// Test doubles for executing the PRODUCTION adapter and routing code on Linux.
// They model public API boundaries, not UIKit arbitration or physical input.
import Foundation

@MainActor class UIGestureRecognizer {
    enum State { case possible, began, changed, ended, cancelled, failed }
    var state: State = .possible
    var numberOfTouches = 0
    var allowedTouchTypes: [NSNumber] = [0, 1, 2, 3]
    init(target: Any? = nil, action: String? = nil) {}
    func canPrevent(_ other: UIGestureRecognizer) -> Bool { true }
    func canBePrevented(by other: UIGestureRecognizer) -> Bool { true }
    func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {}
    func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {}
    func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {}
    func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {}
    func reset() { state = .possible }
}
@MainActor class UIPanGestureRecognizer: UIGestureRecognizer {}
@MainActor class UIPinchGestureRecognizer: UIGestureRecognizer {}
@MainActor class UIView: NSObject {
    var bounds = CGRect(x: 0, y: 0, width: 600, height: 800)
    var frame = CGRect(x: 0, y: 0, width: 600, height: 800)
    var subviews: [UIView] = []
    weak var superview: UIView?
    func addSubview(_ view: UIView) { view.superview = self; subviews.append(view) }
    func isDescendant(of view: UIView) -> Bool {
        self === view || superview?.isDescendant(of: view) == true
    }
    func convert(_ rectangle: CGRect, to view: UIView) -> CGRect { frame }
}
@MainActor class UIScrollView: UIView {
    let panGestureRecognizer = UIPanGestureRecognizer()
    var pinchGestureRecognizer: UIPinchGestureRecognizer? = UIPinchGestureRecognizer()
    var contentSize = CGSize(width: 600, height: 2000)
    var contentOffset = CGPoint.zero
    var isDecelerating = false
    var stops = 0
    func stopScrollingAndZooming() { stops += 1; isDecelerating = false }
    func setContentOffset(_ point: CGPoint, animated: Bool) { contentOffset = point; stops += 1; isDecelerating = false }
}
@MainActor class WKWebView: UIView {
    let scrollView = UIScrollView()
    override init() { super.init(); addSubview(scrollView) }
}
@MainActor class UITouch: NSObject {
    enum TouchType: Int { case direct = 0, indirect = 1, pencil = 2, indirectPointer = 3 }
    enum Phase { case began, moved, stationary, ended, cancelled }
    var type: TouchType
    var phase: Phase = .began
    var point: CGPoint
    init(_ type: TouchType, _ x: CGFloat = 100, _ y: CGFloat = 100) {
        self.type = type; point = CGPoint(x: x, y: y)
    }
    func location(in view: UIView) -> CGPoint { point }
}
@MainActor class UIEvent {
    var allTouches: Set<UITouch>?
    init(_ touches: Set<UITouch>) { allTouches = touches }
}
