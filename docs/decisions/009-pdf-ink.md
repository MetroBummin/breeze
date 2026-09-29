# iPad PDF Pencil annotation

## Status

2026-09-25: the user confirmed on an iPad 10th generation (iPadOS 26.5)
that Pencil drawing, finger scrolling/pinch and position retention work. The user
also confirmed ink restoration and deletion retention after reopening the PDF.
Only after that gate, the implementation adds 3 colors, 3 widths and undo/redo.
The later inertia fix has 21 user-operated physical stop contacts with unchanged
scroll offsets through contact end. Complex contact stress, app process restart
and a complete exam session remain separate from these checks. Do not represent browser synthetic
stylus events as physical palm-rejection or latency proof.

## Decision

Keep PDF.js and the original reader. A display-only SVG per rendered page uses
`getViewport({scale:1})` width/height, including intrinsic PDF rotation, and is
inside the existing zoom layer. Client coordinates map proportionally through
that page's current bounds to the same viewport units. Widths are 0.75, 1.5 and 3 viewport
units, with black, red and blue ink. No screen-pixel corrections or PDF redraw per Pencil move. SVG is always
`pointer-events:none`. Releasing a PDF page releases its SVG and clean record;
reopening reads the page again. Failed writes retain the latest record in memory.

The existing Capacitor bridge only detected native runtime, not iPad. Add the
UIKit `.pad` idiom with an iOS-on-Mac exclusion, injected into the web document.
No screen-width/UA heuristic. Old native shells without the flag fail closed.

WebKit's `Touch.touchType === 'stylus'` remains the sole drawing input. PDF
entry now starts read-only (see the explicit reading lock follow-up). Pen/eraser only change Pencil behavior; real finger
Pointer/Touch events reach the existing word/sentence Lookup, scroll and pinch.
SVG remains display-only. No synthetic forwarding and no timer-based tap blackout.
Window capture blocks Pencil Pointer/click propagation on PDF body only; controls
and popups remain interactive. A new eligible pointerdown clears compatibility
click suppression, so a fresh finger tap immediately after Pencil can look up.

Touch identifiers and Pointer identifiers are tracked separately. During an active
stroke, new paper contacts are suppressed through their own end/cancel, even after
the Pencil lifts. Fresh fingers after Pencil lifts can proceed while an old
suppressed palm remains. Only the active stylus identifier appends/ends a stroke.
A Pencil arriving during a pre-existing contact or pinch is ignored for that whole
contact; it never steals the gesture. The existing pinch code filters out stylus
and suppressed contacts, without manufacturing replacement TouchEvents. Mixed
events with eligible fingers continue to the existing gesture handlers. A completed
finger sequence clears the prior pan flag so the next pinch can acquire normally.

Cancel unfinished strokes on pointer/touch cancellation, resize, blur, background
or scroll. Completed erasures remain undoable. Blur/background/document closure
clear contact ownership. There is no simultaneous drawing and page manipulation.
Physical palm ordering and rapid input still need WKWebView verification; browser
synthetic contacts cannot establish hardware palm rejection. Report any failure
sequence before changing architecture or restoring a mode-separation fallback.

PencilKit `.pencilOnly` was considered. It already provides native drawing input,
but using it here requires an additional native overlay synchronized with web
scrolling, zoom previews, page lifecycle and Lookup. This implementation tests the smaller
integration first and does not replace PDF.js or build a general drawing engine.

## Persistence

Dedicated local IndexedDB `breeze-pdf-ink` v1, store `pages`, key
`JSON.stringify([originalSHA256, pageNumber])`. Same titles never share records;
identical original bytes intentionally do. No original-byte mutation, book-record
mutation, export or sync integration. Existing book deletion does not erase ink
in this MVP; cleanup semantics are deferred to avoid implicit data loss.

Writes happen after each completed stroke and each erasure. A page owns one
serialized writer. Revision comparison writes the newest snapshot again when
an edit arrived during an earlier transaction. Only `transaction.oncomplete`
means saved; abort/error keeps dirty data, displays failure and offers retry.
Closing and reopening a document reuses pending/failed records. Restarting the
app cannot recover data which failed to persist; the UI explicitly warns not to
close the app. Unknown or corrupt records block annotation instead of becoming
an empty record that could overwrite stored ink.

Undo/redo is chronological within the open document, including pages whose SVG
has been released. History retains at most 50 edits using shallow page arrays
of immutable completed strokes; it does not retain DOM/canvas objects. A Pencil
eraser contact is one undoable edit, including any deletions already committed
before its interruption. New edits clear redo. Undo/redo use the same serialized
page writer and persist their final result. History is cleared on closing the
document and is never stored or synced. The writing toolbar exposes pen, eraser, color/width and history and stays expanded.
Reading mode retains its normal collapsing controls; editing state never changes from scrolling.

An in-flight page read delays history application; a deferred operation checks
that its document and stack head still match before applying, so document changes
or intervening edits cannot apply an old undo to a new session.

## References

- https://developer.apple.com/documentation/pencilkit/pkcanvasviewdrawingpolicy
- https://bugs.webkit.org/show_bug.cgi?id=161783
- https://developer.mozilla.org/en-US/docs/Web/API/Touch/touchType
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action
- `003-pdf-highlight-geometry.md` remains unchanged; this layer does not erase
  or edit existing PDF content or saved word markers.

## Inertia follow-up (2026-09-25)

### Native-to-web Pencil admission after Debug 189 reproduction (2026-09-28)

Debug 189 physically reproduced a mark on the first momentum-stopping Pencil.
The captured native gate classified both sampled contacts `stopOnly` while the
paper was decelerating, yet WebKit delivered each contact to web `stroke/start`
and `stroke/end`. This disproves the gate-time classification race for those
contacts. UIKit recognizer prevention alone does not guarantee WebKit will hide
the same Pencil from the DOM.

On iPad, web ink now waits for the native role before creating a preview,
erasing or persisting. The existing native gate remains the source of truth for
`stopOnly`, `ink` and blocked Pencil roles. A WebKit reply message matches the
native contact by birth time and paper position, never by unrelated UIKit/DOM
touch identifiers. The match is consumed once. Unknown, stale and rejected
contacts fail closed; an admitted quick tap can complete after touchend. Web
cancel, scroll, mode/document changes and blur discard pending ink. The time and
position bounds are only correlation tolerances, not a motion debounce or a
delay before assigning native ownership. Existing browser/older-shell fallback
continues to use the original web Pencil path; physical iPad acceptance applies
to the new native bridge only after device validation.

This change does not alter page eviction, drawing coordinates, persistence,
pinch, or the policy that the first Pencil during genuine inertia stops the
paper for its entire contact and the next contact immediately edits.

Debug 190 then exposed the opposite failure on the connected iPad: later
Pencil contacts sometimes made no ink. The native diagnostic observer saw the
new Pencil `began` events, but UIKit reused the same `UITouch` object identifier
and did not deliver the previous Pencil's end to this observer. The ledger
retained the old `stopOnly` role, so the native route returned its cached role
without publishing a fresh web admission; the web correctly rejected the
unmatched touch. Track each native contact's `.began` timestamp as well as its
object identifier. A new birth on a reused object retires the old role before
classification. Repeated callbacks for the same birth keep the assigned role.
This is contact lifecycle repair, not a wait or debounce, and preserves a
still-live finger's navigation ownership.

The user reports that rapid finger scrolling can make a subsequent Pencil drag
scroll the PDF rather than edit. Stationary drawing works. This supersedes the
previous basic-device confirmation for rapid-input acceptance.

The requested policy is now: consume the first Pencil contact during **actual
residual scrolling** to stop inertia, without drawing or erasing for that entire
contact. The next Pencil contact edits immediately. An existing eligible finger
pan/pinch retains ownership; rejected Pencil must never become scroll input.
Suppressed palms must not be counted as eligible active fingers. No fixed timeout,
mode switch, storage migration, input-engine replacement, or global finger lock.

Before selecting a fix, native DEBUG-only tracing records Touch/Pointer ordering,
identifiers, suppression, cancelability/default prevention, ink/pinch handler
routes, Reader offsets and PDF transform. A bounded local cache trace also stores
asynchronous native UIScrollView snapshots correlated to JS sequence numbers.
No document text/bytes or saved ink are logged. The Release build has neither the
native trace flag nor the message handler. This instrumentation is diagnostic;
it does not fix or prove momentum interruption. Native stop-inertia intervention
must be considered only after observing the actual WKWebView failure path.

The first physical reproduction (999-row trace) contains stationary stylus
starts but no new web stylus start during the reported failure. It does contain
finger release followed by WKChildScrollView deceleration with zero pan touches.
Add a DEBUG-only, non-recognizing UIKit input probe to distinguish missing web
delivery from a rejected web contact before choosing native intervention. Native
and web contact IDs are not interchangeable. This is still diagnosis, not a fix.

The second UIKit trace confirms native Pencil-only contacts during deceleration
(allTouches contains only type=pencil). The child scroll view changes offset and
its pan recognizer ends, while no corresponding web stylus start is delivered.
For example, the first such contact moves offsetY from 17408 to 17239. Thus the
observed failure is native momentum-time routing, not the web late-finger branch.

A small UIKit Pencil gate is now under physical validation. JS publishes only
PDF paper geometry, Reader dimensions and visible control/popup exclusions.
UIKit identifies the inner public UIScrollView by frame/content geometry (no
private class lookup). For a paper Pencil it calls ignore(touch,for:event) on
scroll pan/pinch recognizers, preserving other contacts. An actual decelerating
scroll with no active pan consumes the entire Pencil contact, calls
stopScrollingAndZooming on iOS 17.4+, and never reassigns an old content offset.
The contact is recognized natively, so no first ink/erase is produced. Ordinary
Pencil contacts fail the gate immediately and keep the original WebKit Touch
engine. Outside paper/UI exclusions the gate fails without intervention. No
fixed delay, synthetic Touch, pointer-based drawing, storage/schema change or
Reader rewrite. Earlier OS fallback uses a nonanimated current-offset setter;
that fallback is unverified and not covered by this iPad's acceptance results.

The web ownership check now counts eligible fingers rather than raw touches:
a previously suppressed palm does not reject a fresh Pencil. A rejected Pencil
never starts drawing midway through its sequence after the finger lifts. Browser
regressions cover both sequences. Native gate geometry and momentum behavior
still require physical proof; installation/build success is not that proof.

Physical follow-up: the user reports normal behavior across pen/eraser and
base/enlarged PDF, plus the finger Lookup-to-Pencil loop. The final native trace
contains 21 completed consumed momentum contacts; every one immediately clears
deceleration and retains identical X/Y offsets throughout its native move/end
sequence. This is user-operated physical input with agent log analysis, not
hardware automation. Complex active-finger/palm interruption cases remain
separate from that evidence. Detailed tracing now requires DEBUG plus the
BREEZE_INK_TRACE=1 process environment; the final ordinary launch is quiet.

Public API references:
- https://developer.apple.com/documentation/uikit/uigesturerecognizer/ignore(_:for:)-5f685
- https://developer.apple.com/documentation/uikit/uiscrollview/stopscrollingandzooming()
WebKit precedent (not substituted for the collected iPad trace):
- https://bugs.webkit.org/show_bug.cgi?id=251513

## Audit follow-up: explicit reading lock
Document entry defaults to read-only. The small 필기 button enables editing; 읽기 locks editing without hiding persisted ink. Folding the tool UI never changes edit state. Native scope is disabled while read-only. Native scope retains all paper rectangles in content coordinates, cached by session/layout/committed zoom; scrolling reuses those rectangles and pinch previews defer publication until committed. Relevant page/layout mutations invalidate the cache. This avoids a page-count scan on every scroll/pinch frame without dropping pages during fast inertia. This changes native scope/input behaviour and requires renewed physical iPad QA; earlier 21-contact measurements do not validate this revision.

## Production bottom pill (2026-09-26)
The merged query-only concept was never connected to the engine. Replace both
that mock state and the separate top toolbar with the approved bottom pill.
The native iPad gate remains required; no URL flag enables production ink.
The pen/book switch calls the real mode setter. Color, width, eraser and history
operate on the same engine and serialized page writer. Read mode keeps ink visible
but disables edits and native Pencil scope. Writing hides progress and removes
the invisible reading controls from keyboard focus. Entering writing expands Reader chrome immediately; its central setter refuses
collapse while the writing variant is active. Read mode still collapses normally. Save
status stays live for assistive technology; failed saves expose the retry panel.
Browser synthetic input is separate from fresh physical iPad/Pencil verification.

## Physical page-edge follow-up (2026-09-26)
Build 167 user feedback reported tools appearing without durable Pencil lines.
A same-source diagnostic run on the connected iPad received six real Pencil
strokes: four left their starting page and the out-of-bounds branch cancelled
the complete stroke; two ended inside paper. A browser regression reproduced
the deletion before the fix. This identifies a concrete failure path, not proof
that every earlier failed contact had this cause.

When a live stroke leaves its starting page, clip its final segment to that
page boundary and commit the in-page portion through the existing serialized
writer/history. Continue suppressing that contact until lift; do not connect
across page gaps or resume the stroke on re-entry. Actual touch cancellation,
scroll, resize, blur and mode changes still discard unfinished pen strokes.
The four-edge/zoom/re-entry/undo/redo/reload regression runs without tracing.
DEBUG tracing can capture native-only failures before any web trace arrives;
ordinary Release builds still contain no input trace handler.

### Tool settings, partial erasure and input cost
The user requested pen/eraser options above the pill. Switching tools selects
the new tool without opening settings; tapping the already selected tool toggles
its non-modal settings surface. Pen contains the existing three colors/widths,
eraser contains page-coordinate radii 4, 8 and 16. Tap outside, start paper
input or press Escape to close settings. The first Pencil contact on paper closes
settings and edits with that same contact. Settings never reflow the paper.

Eraser input cuts only covered polyline segments, using the swept capsule between
consecutive samples (plus half the ink width). Sparse, fast movements therefore
leave no gaps in the erased path. Retained fragments reuse the existing v1 stroke
format and remain on the same document/page. One contact is one history operation.
Persist the edited fragments on lift or cancellation, not every movement sample;
completed erasures remain undoable even when that contact is interrupted.

Cache paper bounds for one active contact: scroll/resize/blur already cancel it,
and PDF repaint is held during input. A 120-sample regression checks two page
layout reads including the harness, rather than a read per sample. Update only
history availability during drawing, not every tool/setting control. Diagnostic
logging is disabled for final device verification and Release; timing measured
with the verbose input trace enabled is not ordinary app performance evidence.

## Build 170 report: scope lifetime and canonical smoothing (2026-09-26)

The user reports a return of the inertia problem and angular ink in installed
build 170. The published base for this change is `e51a9483` (PR #35); its Xcode
project still records build 168. The installed 170 archive, its embedded web
assets and a new physical trace are not available here. Do not claim an exact
archive comparison or that a merge deleted the native gate. The native routing
body from the originally device-verified `37952f7` remains present.

The subsequent web scope cache does have deterministic lifecycle gaps: ancestor
layout changes can move paper without changing the cache key, invalidations can
be dropped during pinch, a deferred publication can have no contact-end retry,
and controls with layout rectangles can remain excluded after becoming inert,
transparent or pointer-transparent. Mode activation also only scheduled an rAF.
These are reproduced in the production-function harness, not as UIKit input.

Keep the original native gate and its policy unchanged: the first Pencil during
actual inertia stops only; the next contact edits immediately. Arm the scope in
the tool-selection event, invalidate on relevant layout ancestors (including
while pinching), and publish settled geometry on finger contact end/cancel and
CSS transition end/cancel. Refresh once at a finger-contact boundary as a safety
net for layout changes not represented by the old key. Ordinary scroll frames
reuse content-coordinate paper rectangles. Exclude only visible, interactive
controls, not invisible/inert overlays. Retain the last committed scope during
pinch previews; no per-frame full-page scan, fixed delay or synthetic touch.

New pen strokes use incremental midpoint quadratic smoothing, adaptively
flattened to a maximum normal-geometry chord departure of 0.04 PDF units (with a
bounded subdivision depth). The tail reaches the latest real sample immediately;
there is no timer, predicted touch or artificial input delay. Deliberate sharp
corners/reversals stay sharp and the curve stays in the input convex hull.
The final touchend position goes through the same page clipping path.

Unlike render-only smoothing of stored raw points, the displayed flattened
points are the canonical points committed to the existing v1 stroke record.
Partial erase, repaint, undo/redo and restoration therefore use exactly the
visible geometry. Already saved strokes and erased fragments are NOT re-smoothed
or migrated. New strokes may contain more points; dense straight input does not
receive a fixed oversampling multiplier. A contact retains only its incremental
smoothing state; release retains the canonical stroke as before.

`tests/verify-pdf-ink-regressions.mjs` is part of `npm test`. At implementation,
24/24 deterministic tests pass. Running its 10 scope tests against the exact
upstream source yields 8 failures and 2 passes. Tests cover scope publication,
ancestor/transition/pinch invalidation, exclusions, constant page reads over 200
scroll publications, curves/corners/duplicates, preview-save agreement, final
endpoints, cancellation, page clipping, erasure/history, legacy preservation and
save failure/retry. These results do not establish physical Pencil latency or
prove that scope gaps caused every reported build-170 failure.

Before release, run `npm run ios:sync` from the PR source and verify the embedded
`pdf-ink.js` and `pdf-ink-geometry.js` match it. Then use the same iPad with tracing
off for ordinary QA: pen and eraser, base and enlarged PDF, repeated finger flick
-> first Pencil stops without editing -> next Pencil edits; also test immediate
tool selection, expanded/collapsed chrome, open settings, pinch then flick,
page gaps, slow/fast curves, Undo/Redo and process restart. If momentum still
fails, capture a fresh `BREEZE_INK_TRACE=1` run before changing native routing.

## Cached layout and bounded page work (2026-09-27)

Native scope, PDF page hit-testing and visible-page scheduling share the session's
committed content-coordinate page rectangles. Layout/zoom/rotation invalidates
them; ordinary finger contact and scroll do not. Page lookup is a binary search
over every page, including unrendered paper; gaps remain excluded. Scope updates
follow layout and control changes, rather than serializing the entire scope on
every scroll frame. Tests still cover ancestor changes, transitions and pinch
commit; the old unobservable fixture rectangle mutation now emits its corresponding
layout mutation, and a 200-page repeated-contact regression checks cache reuse.

Required initial canvases are serialized and allowed during single-finger pan;
pinch and active Pencil retain input ownership. Touched placeholder nodes stay
attached. Canvas and word-map work yield between stages. Sharpening waits for
160ms without scroll and no active contact. User contact/scroll invalidates the
existing mode-change token so delayed mode landing cannot pull the view back.
The native residual-inertia gate still consumes the first moving Pencil contact
and edits a stationary page immediately. Device validation belongs to the user.

## Freehand highlighter (2026-09-27)

A third Pencil tool uses yellow (default) or green at 12/20 PDF units and fixed
0.30 opacity. Select once; tap the selected tool again for settings. Entry remains
read-only; the last selected editing tool and tool options persist locally.

Highlighter strokes reuse v1 page records, original hash, normalized viewport
coordinates, boundary clipping and serialized writes. They add `tool:highlighter`
and `opacity:0.3`; legacy pen records stay unchanged. Validation rejects unknown
tool/opacity values without overwriting the record. Partial eraser fragments
spread all stroke properties; history keeps those same immutable objects.

Each live stroke is one SVG polyline with element opacity, preventing darker
internal joins/self-overlaps. Completed highlighter fragments share a persisted
strokeId and one SVG opacity group, so partial erasure cannot darken the remaining
self-overlap. The SVG multiplies with the actual PDF; highlighter
paths precede pen paths, so existing pen remains above translucent ink. Separate
strokes intentionally accumulate where they overlap. Drawing updates only the
active path; it neither redraws the PDF canvas nor captures finger input.

## Held-scroll memory follow-up (2026-09-27)

The user reported read-mode upward scrollbar jumps freezing or returning home
on installed 1.4 (175). A same-time iPad JetsamEvent records about 1.75 GiB in the
WebContent process belonging to Breeze's process coalition. The record does not
identify that WebContent process as the killed process; it is memory-pressure
evidence, not a confirmed reason for the observed navigation/restart.

The scheduler allowed initial painting during a held finger, while distant-page
eviction still refused all finger contacts. Eviction now releases pixels during
that contact and keeps its DOM targets attached until lift. Limit each canvas to
6 Mi pixels and the retained cache to 24 Mi pixels, preferring visible pages.
Release completed PDF.js page operator/image resources through page.cleanup().
Drop obsolete queued prefetch, show initial moving pages at reduced resolution,
and sharpen after scroll settles. All paper bounds stay in the layout cache and
native scope regardless of which canvases are retained. Page gaps do not change.

Same 120-page/820px/DPR2 Chromium fixture with a continuous finger contact:
installed 175 exceeded the 450 MiB safety stop after 8 jumps (487.7 MiB canvases,
16 retained pages); the fix completed all 15 down/up jumps with 59.7 MiB peak in
both Chromium and WebKit, preserving the original contact target and rendering
every requested page. This measures canvas allocation, not total native memory
or physical scrolling latency. Fresh user-operated iPad QA remains required.

## Native scrollbar follow-up (2026-09-27)

The user confirmed build 176 no longer shows clipped words or blank-space lookup,
and ordinary finger upward scrolling works, but large upward native-scrollbar
drags still stutter. Native scrollbar movement may supply scroll events without
DOM finger contacts. Initial page rendering previously proceeded immediately
into glyph-map extraction and saved-marker generation during that movement.

Automatic page work now displays required canvases and saved ink first. It defers
word maps and markers until 160ms of scroll quiet, checking again after PDF/font
awaits. Nearby offscreen prefetch also waits; visible paper remains eligible.
Map-only preparation uses the same serialized queue, draw token and document
ownership checks. An explicit lookup promotes its page and waits for its map;
a stationary held finger can prepare a long-press target. New scroll interrupts
automatic preparation. Errors resolve without an unbounded retry loop. Page gaps,
all-page Pencil scope, native input routing and storage do not change.

A no-DOM-touch 34-page jump stream in Chromium/WebKit went from 78–90 automatic
map/marker calls per direction during scroll to zero, retaining visible canvases
and ready lookups after settling. This browser test models scheduling, not UIKit
scrollbar tracking or physical iPad latency; the user subsequently reported similar stutter on installed 177.


For the remaining physical cancellation, the existing opt-in DEBUG input trace
now snapshots recognizer class/state and scroll-view identity at pan transitions.
Cancellation call stacks are captured through opt-in public gesture-state KVO.
Read-mode DOM event completion is also recorded, including defaultPrevented,
contextmenu and selection events. These hooks remain disabled in normal launches;
they diagnose cancellation, and are not a performance fix or production telemetry.


179 device cancellation stacks, symbolicated with the matching iPadOS 26.5
symbols, identify RemoteLayerTreePropertyApplier::applyHierarchyUpdates ->
UIView._web_setSubviews -> UIView._addSubview -> UIScrollView._willMoveToWindow ->
UIApplication._cancelGestureRecognizersForView. All three cancellations share
that path. This establishes layer-tree reparenting as the immediate cause in
those recordings, rather than an app touch preventDefault or changing page height.

A translateZ(0)/isolation compositor-boundary experiment was not accepted:
its browser run failed the geometry-cache and partial-highlighter-erase checks.
The CSS was restored and that build (180) was not installed. Do not treat native
layer reparenting as resolved. Keep the existing renderer/input behavior while
a follow-up finds a stable boundary without these regressions.


## Temporary layer-retention diagnosis (181, not an accepted fix)
An opt-in DEBUG launch flag BREEZE_PDF_LAYER_HOLD=1 bypasses page eviction,
resharpen canvas replacement and retired-node removal during this diagnostic run.
This temporarily overrides the release policy only to test existing layer
removal/replacement as a native cancellation trigger, including scrollbar
contacts absent from DOM touch events. New layers and chrome remain unchanged.
Use the same 13-page reproduction; normal launches retain the original policy.
Physical confirmation is pending; see the bounded follow-up in
`docs/qa/pdf-stability-2026-09-27.md`. Do not ship this as a scrolling fix.


Experiment 182 narrows the temporary hold: resharpen canvas replacement returns
to normal; only page eviction and retired cleanup remain held. This supersedes
181's resharpen hold only for the next comparison. The resource-release decision
for ordinary launches remains unchanged. Physical result pending.


Final disposition: both 181/182 retention experiments are rejected as production
fixes. The user reports severe Pencil first-stroke and enlarged pan/zoom delays,
despite no observed pan cancellations in the 182 trace. The exact destructive
layer operation remains unisolated. Diagnostic source changes were removed and
saved outside Git as an audit patch. The installed 182 binary was relaunched with
both retention and detailed tracing disabled; this is not a reinstall of 179 or
proof of restored physical performance. Existing release policy remains in force.
The bounded investigation stops here; native scrollbar cancellation is unresolved.

## Page eviction with reusable shells (183 candidate)
The user requested a renewed fix after auditing the confounded 181/182 runs.
Eviction continues to reset canvas backing dimensions to zero and discard word
maps and clean ink records, but retains the existing canvas and outer ink SVG
within its page. SVG children are cleared; mount reads persisted ink and reuses
that shell. Page loading placeholders are reused instead of replacing innerHTML.
Dirty/pending ink writes and undo history retain their existing persistence rules.
Resharpen replacement and marker cleanup are unchanged. This tests structural
removal separately from backing-store reclamation; zero dimensions and SVG child
changes may still change WebKit compositing, so device success is not established.

DEBUG trace requests are coalesced for one second, then a value snapshot is
serialized and saved on a serial utility queue. Input callbacks no longer encode
JSON or write a file. Detailed hierarchy tracing remains opt-in and is disabled
for the 183 physical performance check. A force quit within the pending interval
can lose the last diagnostic events. There is no launch-only retention switch:
this candidate behaves the same after an icon relaunch.

## 184 diagnostic-only continuation
User reports a persistent horizontal escape/blank viewport during enlarged
pan/highlighter stress and asks for reproduce-then-read-device-logs diagnosis.
A browser candidate for pinch offset drift/orphan ownership is saved outside the
repo and is NOT included in 184. PDF pinch behavior remains identical to 183.
Opt-in DEBUG BREEZE_PDF_STATE_TRACE=1 samples geometry and input ownership once
per second, retaining 60 snapshots and 40 input/gate transitions. It records no
PDF text or stroke coordinates. No hierarchy walk is added to input callbacks;
JSON/disk export uses the serial utility queue. Full BREEZE_INK_TRACE stays off.
Sampling can still have overhead; this build is diagnostic, not a confirmed fix.

## 185 bounded pinch correction from partial evidence
The user asks to proceed using the available 184 logs rather than require more
physical reproduction. Those logs show edge overscroll and seven web stroke
cancellations, but do not prove the full horizontal escape's root cause.

Pinch preview now cancels the current scroller offset instead of its offset at
acquisition, and refreshes on scroll via one scheduled animation frame. The
paper coordinate and clamped desired position remain fixed by the gesture;
preview still never writes scrollLeft/scrollTop. A fresh touchstart with no live
original pinch owner cancels an orphan preview before accepting new contacts.
One surviving original owner still retains the pinch. This repairs a constructed
scroll-during-pinch failure and recovery after a lost terminal event without
changing page retention, native inertia policy, storage or browser zoom.

Lightweight ink cancel events now include call-site reasons for reader scroll,
pointer cancellation, touch cancellation, noncancelable movement, page release
and resize. This is needed because 184's untagged cancel events cannot establish
which route caused the two cases without native inertia consumption. Full-device
acceptance of 185 remains pending; do not claim all blank-screen cases resolved.

## 186 isolate native recognizer touch mutation
185 physically reproduced sustained horizontal escape. The DOM and native paper
scroll agree on width 3453 / viewport 1180 but x reaches ~3170 (max 2273), with
unchanged scale and no active web pinch. For roughly 40 seconds native pan stays
changed, tracking/decelerating true while web contacts/pinch/ink are empty. This
refutes treating pinch-preview drift as sufficient explanation of this incident.

Remove only the four per-contact ignore(touch,for:) calls made on WebKit-owned
pan/pinch recognizers from the custom Pencil gate. They mutate other recognizers'
tracked touch sets during live input. This is a plausible trigger, not proven by
the sampled logs. The custom gate still stops/consumes actual inertia when no
native finger pan is active. Ordinary Pencil uses existing web touch prevention;
no native offset clamps, gesture resets, delegate replacement or scroll polling
are introduced. Diagnostics add native pan touch count and event touch types/
phases to distinguish true live fingers from stuck native ownership. 185's web
geometry correction and 183 resource policy remain unchanged for this comparison.
Native Pencil routing, palm coexistence and boundary recovery require device QA.

## Integrated ownership candidate (2026-09-27, not device accepted)

The integration preserves 183 shell reuse/pixel release, deferred diagnostic IO,
crop/document ownership checks and 185 current-offset preview math. It supersedes
186's incomplete removal of Pencil exclusion with PR #40's idle-time type masks
and native contact ledger, not live `ignore(touch,for:)` calls. Stop-only remains
an entire contact; next stationary Pencil edits without a timer. Native and web
IDs are separate. Outside controls never become navigation by later movement,
and old native snapshots cannot clear newer owners. Scope binding is attempted
immediately when idle; pending binding/repeated first-stroke rejection remains a
physical acceptance gate, not a successful fallback.

Web end/cancel applies only to the pinch's owners and keeps an original remaining
finger; unrelated and stale ends cannot terminate a new pinch. Stroke cancellation
uses its own Pointer identity independently of Touch identity. Real scroll,
current cancel, blur/background and document closure retain unfinished-stroke
cancellation. No offset clamp, gesture reset or retention bypass is introduced.
See `docs/qa/pdf-input-integration-2026-09-27.md` for evidence, baseline failure,
PR relationships and the required uninterrupted physical acceptance sequence.

## 187 Pencil/momentum boundary observation (2026-09-28)

The user excludes the read-mode Pencil-scroll capture from regression scope.
Editing mode largely works, but the first Pencil during inertia sometimes leaves
a dot/highlighter mark as well as stopping. A UIKit stop-before-gate race is a
hypothesis, not established by the earlier read-mode trace.

Before changing admission, an independent DEBUG BREEZE_PDF_MOTION_TRACE=1 probe
samples only the already-bound paper scroller on display callbacks. It retains
12 native offset/deceleration/drag/tracking samples and records the four samples
strictly before the Pencil touch timestamp alongside isDeceleratingAtGate,
assignedRole, offsetBefore and offsetAfter. Missing/stale samples are observable
and not treated as proof of movement or settlement. This is observation only:
no sample enters the production role decision, no timeout/debounce is added,
and no scrolling/delegate/recognizer mutation occurs. Trace export is bounded,
coalesced and serialized on the existing utility queue. Detailed ink/state
traces can stay OFF; neither full hierarchy scanning nor web tracing is needed.

The diagnostic build is not the fix. Capture an editing-mode failure first,
then change only the confirmed boundary and check 10–20 physical flick -> first
Pencil stop-only -> lift -> immediately editable next Pencil sequences with
varied flick strength. Browser/Swift tests cannot substitute for that evidence.

## Stop-only Pencil delivery correction (2026-09-28 candidate)

The saved 188 native motion trace contains 32 admitted Pencil contacts. Every
sampled moving contact was assigned stopOnly with isDeceleratingAtGate=true;
every sampled stationary contact was assigned ink with the gate value false.
No pre-contact-moving/at-gate-false misclassification appears in that capture.
This does not rule out a rarer race, but it cannot justify changing the motion
threshold or adding a time-based hold.

The stop-only gate already stopped the scroller and claimed the Pencil contact,
but its canPrevent override unconditionally returned false. UIKit could therefore
let a competing WebKit touch recognizer deliver the same Pencil to the web ink
path. For a stopOnly role only, the gate now allows UIKit to resolve competing
recognizers in its favor. It remains non-preventing for a blocked Pencil during
owned finger navigation; a stationary ink Pencil still fails the gate and goes
to WebKit. The stopOnly prevention state clears on recognizer reset. Native
Pencil admission on scroll pan/pinch and all page/zoom/storage logic stay intact.

This is a code-level cause and a proposed narrow correction. Whether UIKit
actually suppresses the occasional dot on the physical iPad is pending the
user-operated test. A stopOnly gate row with a new saved mark after this change
would reject the correction and require a delivery trace, not another timing
guess.

## Completed path reuse (2026-09-29)
Completed stroke objects are immutable. Each attached page retains its SVG path
by stroke identity, so adding a stroke or erasing does not serialize all unchanged
points again. Replaced/removed strokes leave the map on the next paint; page
release drops the map. Highlighter grouping, layering, undo and durable records
keep their existing semantics. Browser timings are not physical Pencil latency proof.

The save snapshot copies the mutable page array only. Completed stroke objects and their coordinates are immutable, and IndexedDB serializes them at `put`. Revision tracking still writes edits arriving during database acquisition/transaction completion; failure retains dirty data. No extra deep copy is made before the storage copy.
