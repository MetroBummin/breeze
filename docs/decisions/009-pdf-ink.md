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
document and is never stored or synced. The compact toolbar exposes pen, eraser, color/width and history. Collapsing it
changes only visibility; it never disables Pencil or finger Lookup.

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
the invisible reading controls from keyboard focus. The existing Reader chrome
collapse reveals a mini tool button and does not change editing state. Save
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
