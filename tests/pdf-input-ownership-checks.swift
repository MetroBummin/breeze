@main @MainActor private struct OwnershipChecks {
    static var passed = 0
    static func test(_ name: String, _ check: () -> Void) { check(); passed += 1; print("PASS \(name)") }
    static func fixture() -> (RoutingHost, UIScrollView) {
        let host = RoutingHost(), web = WKWebView(), paper = UIScrollView()
        web.scrollView.contentSize.height = 800
        web.scrollView.addSubview(paper); host.webView = web
        host.setScope(["enabled":true,"viewport":600.0,"box":[0.0,0.0,600.0,800.0],
                       "scrollHeight":2000.0,"pages":[[0.0,0.0,600.0,900.0],[0.0,922.0,600.0,900.0]],
                       "excluded":[[500.0,0.0,100.0,80.0]]])
        return (host,paper)
    }
    static func main() {
        typealias Ledger = BreezePdfContactLedger<Int>
        test("stationary first Pencil owns ink") {
            var l=Ledger(); l.observe(live:[1],nonPencil:[])
            assert(l.beginPencil(1,ready:true,decelerating:false) == .ink)
        }
        test("stop-only does not turn into ink after inertia stops") {
            var l=Ledger(); l.observe(live:[1],nonPencil:[])
            assert(l.beginPencil(1,ready:true,decelerating:true) == .stopOnly)
            assert(l.beginPencil(1,ready:true,decelerating:false) == .stopOnly)
        }
        test("next Pencil after stopping edits immediately") {
            var l=Ledger(); l.observe(live:[1],nonPencil:[])
            _=l.beginPencil(1,ready:true,decelerating:true)
            l.observe(live:[],nonPencil:[]); l.observe(live:[2],nonPencil:[])
            assert(l.beginPencil(2,ready:true,decelerating:false) == .ink)
        }
        test("existing finger beats later Pencil even with deceleration flag") {
            var l=Ledger(); l.observe(live:[1,2],nonPencil:[1])
            assert(l.beginPencil(2,ready:true,decelerating:true) == .blocked)
        }
        test("rejected Pencil stays rejected after finger lifts") {
            var l=Ledger(); l.observe(live:[1,2],nonPencil:[1]); _=l.beginPencil(2,ready:true,decelerating:false)
            l.observe(live:[2],nonPencil:[])
            assert(l.beginPencil(2,ready:true,decelerating:false) == .blocked)
        }
        test("two-finger navigation owns both contacts") {
            var l=Ledger(); l.observe(live:[1,2,3],nonPencil:[1,2]); _=l.beginPencil(3,ready:true,decelerating:false)
            l.observe(live:[2,3],nonPencil:[2]); assert(l.hasNavigation)
            assert(l.roles[3] == .blocked)
        }
        test("late palm remains suppressed after Pencil lift") {
            var l=Ledger(); l.observe(live:[1],nonPencil:[]); _=l.beginPencil(1,ready:true,decelerating:false)
            l.observe(live:[1,2],nonPencil:[2]); assert(l.roles[2] == .suppressed)
            l.observe(live:[2,3],nonPencil:[2]); assert(!l.hasNavigation)
            assert(l.beginPencil(3,ready:true,decelerating:false) == .ink)
        }
        test("fresh finger can navigate with an old suppressed palm remaining") {
            var l=Ledger(); l.observe(live:[1],nonPencil:[]); _=l.beginPencil(1,ready:true,decelerating:false)
            l.observe(live:[1,2],nonPencil:[2]); l.observe(live:[2],nonPencil:[2])
            l.observe(live:[2,3],nonPencil:[2,3]); assert(l.roles[2] == .suppressed && l.roles[3] == .navigation)
        }
        test("mixed Pencil end and new palm do not transfer ownership") {
            var l=Ledger(); l.observe(live:[1],nonPencil:[]); _=l.beginPencil(1,ready:true,decelerating:false)
            l.observe(live:[2],nonPencil:[2]); assert(l.roles[2] == .suppressed)
        }
        test("mode interruption quarantines Pencil without stealing finger") {
            var l=Ledger(); l.observe(live:[1,2],nonPencil:[1]); _=l.beginPencil(2,ready:true,decelerating:false)
            l.interrupt(); assert(l.roles[1] == .navigation && l.roles[2] == .blocked)
        }
        test("held scrollbar is navigation without DOM contacts or movement") {
            var l=Ledger(); l.observe(live:[1],nonPencil:[1])
            for _ in 0..<1000 { l.observe(live:[1],nonPencil:[1]) }
            l.observe(live:[1,2],nonPencil:[1]); assert(l.beginPencil(2,ready:true,decelerating:true) == .blocked)
        }
        test("native live snapshot retires a missed end without a timer") {
            var l=Ledger(); l.observe(live:[1],nonPencil:[]); _=l.beginPencil(1,ready:true,decelerating:false)
            l.observe(live:[2],nonPencil:[]); assert(l.beginPencil(2,ready:true,decelerating:false) == .ink)
        }
        test("not-ready contact cannot become ink when binding arrives") {
            var l=Ledger(); l.observe(live:[1],nonPencil:[])
            assert(l.beginPencil(1,ready:false,decelerating:false) == .blocked)
            assert(l.beginPencil(1,ready:true,decelerating:false) == .blocked)
        }
        test("second Pencil does not steal the current Pencil") {
            var l=Ledger(); l.observe(live:[1,2],nonPencil:[]); _=l.beginPencil(1,ready:true,decelerating:false)
            assert(l.beginPencil(2,ready:true,decelerating:false) == .blocked)
        }
        test("admission removes only Pencil and restores every original type") {
            let admission=BreezePdfNavigationAdmission(), pan=UIPanGestureRecognizer()
            assert(admission.reconcile([pan],contactsActive:false)); assert(pan.allowedTouchTypes == [0,1,3])
            assert(admission.covers(pan)); assert(admission.reconcile([],contactsActive:false))
            assert(pan.allowedTouchTypes == [0,1,2,3])
        }
        test("admission never changes a physically held contact") {
            let a=BreezePdfNavigationAdmission(), p=UIPanGestureRecognizer()
            assert(!a.reconcile([p],contactsActive:true)); assert(p.allowedTouchTypes.contains(2))
            p.state = .changed
            assert(!a.reconcile([p],contactsActive:false)); assert(p.allowedTouchTypes.contains(2))
        }
        test("mode restoration waits for pan end") {
            let a=BreezePdfNavigationAdmission(), p=UIPanGestureRecognizer()
            _=a.reconcile([p],contactsActive:false); p.state = .began
            assert(!a.reconcile([],contactsActive:false)); assert(!p.allowedTouchTypes.contains(2))
            p.state = .ended; assert(a.reconcile([],contactsActive:false)); assert(p.allowedTouchTypes.contains(2))
        }
        test("external admission changes are not overwritten on restore") {
            let a=BreezePdfNavigationAdmission(), p=UIPanGestureRecognizer()
            _=a.reconcile([p],contactsActive:false); p.allowedTouchTypes=[0,3]
            assert(a.reconcile([],contactsActive:false)); assert(p.allowedTouchTypes == [0,3])
        }
        test("new scroller gets a separate admission binding") {
            let a=BreezePdfNavigationAdmission(), p=UIPanGestureRecognizer(), q=UIPanGestureRecognizer()
            _=a.reconcile([p],contactsActive:false); assert(a.reconcile([q],contactsActive:false))
            assert(p.allowedTouchTypes.contains(2) && !q.allowedTouchTypes.contains(2))
        }
        test("gate and observer never prevent navigation recognizers") {
            let gate=BreezePdfPencilGate(), observer=BreezePdfContactObserver(), pan=UIPanGestureRecognizer()
            assert(!gate.canPrevent(pan) && !gate.canBePrevented(by:pan))
            assert(!observer.canPrevent(pan) && !observer.canBePrevented(by:pan))
        }
        test("gate owns only its admitted Pencil through end/reset") {
            let g=BreezePdfPencilGate(), pen=UITouch(.pencil), other=UITouch(.direct), event=UIEvent([pen,other])
            var decisions=0; g.begin={_,_ in decisions+=1; return true}
            g.touchesBegan([pen],with:event); assert(g.state == .began)
            g.touchesEnded([other],with:event); assert(g.state == .began)
            g.touchesMoved([pen],with:event); assert(g.state == .changed)
            g.touchesEnded([pen],with:event); assert(g.state == .ended && decisions == 1)
            g.reset(); g.begin={_,_ in false}; g.touchesBegan([UITouch(.pencil)],with:UIEvent([])); assert(g.state == .failed)
        }
        test("production routing: stationary Pencil goes to web with no stop") {
            let (h,s)=fixture(), p=UITouch(.pencil)
            assert(!h.route(p,UIEvent([p])) && s.stops == 0)
            assert(!s.panGestureRecognizer.allowedTouchTypes.contains(2))
        }
        test("production routing: raw changed/Pencil-only count cannot hide inertia") {
            let (h,s)=fixture(), p=UITouch(.pencil)
            s.isDecelerating=true; s.panGestureRecognizer.state = .changed; s.panGestureRecognizer.numberOfTouches=1
            assert(h.route(p,UIEvent([p])) && s.stops == 1)
            p.phase = .moved; assert(h.route(p,UIEvent([p])) && s.stops == 1)
        }
        test("production routing: stop, lift, next Pencil immediately draws") {
            let (h,s)=fixture(), p=UITouch(.pencil); s.isDecelerating=true
            assert(h.route(p,UIEvent([p]))); p.phase = .ended; h.observe(UIEvent([p]))
            let next=UITouch(.pencil); assert(!h.route(next,UIEvent([next])) && s.stops == 1)
        }
        test("production routing: native finger retains pan and later Pencil is consumed") {
            let (h,s)=fixture(), f=UITouch(.direct), p=UITouch(.pencil)
            h.observe(UIEvent([f])); s.isDecelerating=true
            assert(h.route(p,UIEvent([f,p])) && s.stops == 0)
            f.phase = .ended; assert(h.route(p,UIEvent([f,p])) && s.stops == 0)
        }
        test("production routing: UI exclusion and page gaps never stop motion") {
            let (h,s)=fixture(); s.isDecelerating=true
            let control=UITouch(.pencil,550,30); assert(!h.route(control,UIEvent([control])))
            control.phase = .ended; h.observe(UIEvent([control])); s.contentOffset.y=850
            let gap=UITouch(.pencil,100,60); assert(!h.route(gap,UIEvent([gap])) && s.stops == 0)
        }
        test("production routing: read mode restores admission between contacts") {
            let (h,s)=fixture(); h.setScope(["enabled":false])
            let p=UITouch(.pencil); assert(!h.route(p,UIEvent([p])))
            assert(s.panGestureRecognizer.allowedTouchTypes == [0,1,2,3])
        }
        test("production routing: interruption does not reinterpret surviving Pencil") {
            let (h,s)=fixture(), p=UITouch(.pencil); s.isDecelerating=true
            assert(h.route(p,UIEvent([p]))); h.setScope(["enabled":false])
            assert(h.route(p,UIEvent([p])) && s.stops == 1)
        }
        test("native observer reports end/cancel and never begins a gesture") {
            let o=BreezePdfContactObserver(), p=UITouch(.direct); var reports=0
            o.report={_ in reports+=1}; o.touchesBegan([p],with:UIEvent([p])); assert(o.state == .possible)
            p.phase = .cancelled; o.touchesCancelled([p],with:UIEvent([p]))
            assert(o.state == .failed && reports == 2)
        }
        print("\(passed) native ownership checks passed; UIKit delivery/latency still needs device QA.")
    }
}
