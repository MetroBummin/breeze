# Reader transition and duplicate-work audit — 2026-10-01

Build source: 207. Keep the expanded narrow PDF pill +22 px and collapsed center.

## Changes

- Remove the fixed 600 ms mode departure wait and its temporary source animation.
- Reuse live EPUB/PDF sessions; cached original returns restore previous scroll before the first frame. First EPUB preparation keeps a neutral loading surface until the reading anchor is restored.
- Search the mapped paragraph neighborhood first, retaining a full sentence-search fallback.
- Keep guide notices in the title pill, queue one at a time, hide the title and bound the notice to two lines. Preserve complete accessible text.
- Keep selected saved words uniformly blue with no second shadow ring; retain exact-occurrence saved-underlay suppression.
- Use one stable EPUB highlight stylesheet and changed-only CSS variables for star visibility. Avoid rerendering hidden dictionary panels.
- Retain only the existing virtualized sidebar canvases across close/reopen, cancel obsolete renders and release them with the document.
- Separate paper geometry invalidation from decorative control changes. Coalesce paper growth and skip hidden originals; viewport changes settle immediately to preserve rotation/pinch anchors.

## Measured browser checks

Chromium and WebKit mapped search: 12 paragraph walks in a 1,000-paragraph fixture.
Cached EPUB return: 0 original-store reads, same session and DOM, scrollTop 1,800 restored synchronously; first frame remained near 1,800 rather than cover.
Forty star visibility toggles: 0 stylesheet DOM mutations, 0 chapter tree walks, unchanged active selection.
Sidebar rapid reopen: retained canvas identity, interactive controls, explicit release clears cache.
Six chrome toggles: 0 PDF paper measurement reads.

WebKit ResizeObserver loop notifications were reproduced while original geometry was rewritten during observer delivery. Changed-only sizing, a shared EPUB growth scheduling path and hidden-layout guards removed them in the work fixture. Viewport settlement must remain immediate: deferring it caused rotation/pinch regressions and was corrected before publication.

Checks cover synthetic browser gestures and rendering, not physical iPad Pencil latency or a measured device frame-rate guarantee. App Store Connect external group assignment remains a separate workflow setting.

## Regression validation

npm test, Capacitor iOS sync, Chromium/WebKit feedback and notice queues, Home/Reader controls, EPUB incremental highlights and session reuse, PDF rotation/navigation/bookmarks/deletion/responsive tools, and PDF ink lifecycle passed. Pill motion trajectories passed in both engines; the overloaded parallel test run missed intermediate frames, and the isolated WebKit run captured them successfully. Device frame timing is still not inferred from this browser trajectory test.

Rapid WebKit pinch exposed stale viewport notifications cancelling a newly admitted gesture. Admission now records viewport height alongside width; observer delivery cancels only when the live gesture viewport actually differs.

Scroll-write traces identified additional duplicate source-anchor restores in the window resize preferences handler and general Reader width observer. PDF viewport restoration now has one owner; the window handler only synchronizes topbar height.

The pinch hit-test now waits for visible-page word extraction resumed on release, instead of assuming the next browser protocol command runs after the deferred extraction job. Hit-test accuracy and input ownership assertions remain unchanged. The EPUB preparation surface is not applied to PDF, whose viewport restoration may supersede initial mode presentation.
