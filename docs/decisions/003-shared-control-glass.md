# Shared floating control material

## Decision

Home, shelves, Wordbook and Reader opt into `.control-glass`. Its material is defined once in `styles/reader.css`; palette values live in `styles/tokens.css`. The shared `.control-dock`, `.control-bar`, `.control-circle` and `.control-pill` primitives own expanded placement and geometry. View-specific rules may change content, but must not override padding, alignment, size or offsets. The Reader's compact and sentence-loading geometries remain intentional variants.

Light reflection is a pointer-transparent foreground layer above the progress tint. A reflection behind the tint disappears as progress fills, especially against the Reader's nearly uniform paper background. Home's colorful covers can make the same transparent material look richer: equal computed CSS is necessary, but does not imply identical rendered pixels over different content. Do not compensate by adding independent Home/Reader color overrides.

The reflection stays subtle at the center so it does not wash out labels. Dark material is unchanged. No looping shimmer or new interaction is needed to communicate glass.

## Regression coverage

Home and Casuals category chips follow the word lookup star buttons: 12px
corners, neutral action surface and a restrained Breeze blue tint for selection. They use
the shared sentence-glass palette without the floating dock's reflection or
shadow. The expanded word lookup loading glow uses the same neutral palette,
scoped to that panel so other loading surfaces retain their own appearance.

Run `npm run test:home-ui` for the cross-view browser checks below, alongside `npm test`.

`tests/verify-home-controls-browser.mjs` checks shared material and expanded geometry in both themes at five widths, plus the compact Reader material, reflection stacking and progress fill. Visual review must include the Reader's plain background and Home's cover background at matching progress. Compare both empty and filled states; do not rely on Home alone.

`tests/verify-wordbook-browser.mjs` checks the Penpot layout's responsive bounds and control positions as well as real search, sorting, filtering, edit, manual addition, export and Home navigation. Filters never change saved records or separate a Meaning from its headword group.

Home, Wordbook and expanded Reader controls are compared as three identical slot rectangles, including computed padding and alignment. Wordbook status chips and selected filters use the same `--s1`/`--s2`/`--s3` background and ink tokens as Reader status buttons.

## Shelf pull and native canvas

Home and shelves use a bounded, damped content translation while pulling at the
upper edge. The fixed control dock stays in place. A small neutral spinner is the
only visible refresh cue; accessible status remains available without on-screen
instructions. Release settles with a short eased transition; reduced-motion users
keep static content. Horizontal, short, cancelled, multi-touch and overlay-owned
gestures do not refresh. Navigation clears the presentation and concurrent refreshes
share one operation. The Reader never participates in the shelf pull handler.
The refresh cue stays up briefly and settles within 1.2 seconds even if local
book loading is slow. Home and Casuals subscribe to RSS source updates as soon
as refresh starts; each ready source updates the rail while remaining sources
continue in the background. Repeated pulls share any ongoing book load.

In the iOS app, WKWebView's scroll view owns the pull gesture and one
`UIRefreshControl` owns the spinner. The web handler reports whether Home or a
shelf is active and runs the same refresh operation when native refresh fires.
The spinner uses the measured logo position and live safe area to sit in the
pulled gap. Browser use retains the touch gesture above. Home and Casuals refresh
their RSS cards; all three library views reload saved books.

The iOS canvas, WebView, scroll view and under-page background follow the computed
root background on view/theme changes. Home gray must not expose Reader paper
behind its native edge bounce. Colors come from the existing CSS palette.

## Home resume transition

Prepare local ligature repair and original-file lookup before starting the browser
view transition. Its update callback waits only for the Reader shell or original
loading surface; PDF/EPUB rendering and position restoration finish independently.
A slow file must not hold the snapshot callback until the browser cancels it.
The resume action remains single-flight until both animation and book opening
finish. Navigation during preparation cancels the pending open. Failures release
the busy state and allow retry. Reduced motion and unsupported browsers use the
same opening path without the animation. Live Reader geometry is never scaled.

`tests/verify-home-resume-browser.mjs` checks both engines with slow preparation,
slow original rendering, rapid repeat taps, cancelled navigation, failed opening,
reduced motion and preserved Text scroll position.

The Home/Reader transition reveals and closes a rounded surface with clip-path and
no full-screen blur, never stretching text. The Reader back control reverses the reveal
toward the current Home resume pill. Reduced motion skips both directions.

All saved-progress labels use `readingPercent`: floor the canonical ratio, with
100 reserved for an actual ratio of 1. Cards and resume controls share this rule.

Home keeps keyed card/image nodes while progress changes. RSS replacement occurs only after replacement data and images are ready. Both transition directions keep the Home snapshot opaque behind the moving Reader surface, so the animation never reveals an empty canvas.

Both morph animations use fill-mode `both`. In particular the departing Reader must retain its terminal opacity/clip until the browser removes the snapshot; resetting to the underlying opacity 1 at the animation boundary briefly restores the full Reader. Browser regression seeks past the close animation duration and asserts opacity 0.

Home long-form card reconciliation does not calculate reading time: these cards do not display it. Casual cards retain their existing reading-time labels.

Casual reading-time calculations reuse a weakly held paragraph-array cache. A
string/length comparison detects in-place edits as well as replaced source arrays;
cached counts are presentation-only and never persisted into a book.

Text Reader image Blob URLs belong to one body render. Replacing the body or
leaving Reader outside the bounded Home cache revokes them; late image reads from an abandoned render cannot
create a URL or update the detached body. Home cover URLs have separate ownership.

Library data refreshes render only the active Home/Casuals/Long-form view. While
Reader or Wordbook is active they render none of these hidden views. `show()`
already renders each destination on entry from current data, so no dirty flags
or background DOM rebuilding are required to keep later navigation up to date.


## Bounded Home round trips (1.3)

Keep at most one complete Text/PDF/EPUB Reader for 60 seconds after returning to
Home. Reuse the body, parsed original document and its live nodes for the same
unchanged book; restore the latest saved anchor. Source paragraphs, formatting,
source map, original metadata, title and kind invalidate reuse. Another destination,
another book, expiry, pagehide or hidden application releases cached DOM, original
resources and Blob URLs. Transient onboarding and unfinished original loads are
never retained. This trades a bounded period of retained memory for avoiding repeat
parsing; it is not a general multi-book cache.

Home and Reader name their visible pill `reader-control` during navigation so its
surface connects both endpoints. Both directions use 340 ms and the same easing;
the closing Reader stays opaque through 85% before its terminal fade. Full-screen
blur is removed. Fill-mode `both` remains. Compact control geometry transitions
use 260 ms; collapsing requires 24 px of downward travel (previously 12), while
44 px upward still expands it. Native interactive drag-to-dismiss is not added.

`tests/verify-reader-reuse-browser.mjs` checks actual EPUB/PDF session and DOM
identity, Text scroll restoration, source-edit invalidation and explicit release
in Chromium/WebKit. Existing Home, sentence, onboarding and lookup regressions
remain required; simulated browsers do not establish physical iPhone frame rate.

## Covers without photos

Local long-form and shared-link cards use deterministic local SVG line ornaments
when no cover is available. Casuals use the title (three lines), not a long body
excerpt. The full title remains available in card metadata; stored article
content is unchanged. Existing palette tokens supply both themes, and real covers
hide the ornament. RSS discovery cards require a working cover image. Home reserves their footprint
with a graphite glass skeleton while loading; content and interaction appear only
after the photo succeeds. Absent or failed covers are still excluded. Add/loading/cloud-recovery
controls retain their existing layout. Phone and desktop light/dark screenshots
were reviewed with WebKit.

The book edit sheet uses the expanded word lookup surface, line, ink and action
tokens. The own-photo button follows its slightly rectangular 12px controls.
Imported books can still use an image already in the article or a photo selected
from the user's library. RSS discovery cards suppress context menus and ignore
long holds.

## PDF writing variant and input focus (2026-09-26)
The iPad PDF writing mode uses the approved bottom pill variant: reading controls
and progress yield to editing controls inside the same glass material. The
expanded width remains capped at 400px with viewport clearance. Other Reader
modes keep existing geometry. Touch/pointer focus is retained semantically but
has no sticky outline; keyboard controls keep a neutral visible focus ring.

### Compact PDF tool options (2026-09-26)
The writing pill is capped at 300px. Pen and eraser each open their options above
the pill in the same control material. Color/width controls are no longer always
visible in the row. A non-modal, keyboard-accessible surface contains three
choices per setting and respects reduced motion and narrow iPad split views.


### Non-covering word lookup and persistent writing controls (2026-09-28)
Only a pending selected word animates a pale blue tint with a brighter glass sheen. General
floating controls do not shimmer. The expanded word lookup's legacy retry/login
action now uses the same neutral sentence-glass action/line/ink tokens and a
visible neutral keyboard focus ring. PDF writing controls stay expanded; their
old miniature collapse rule is removed. Reading-mode collapse remains unchanged.

AI result mini-pill reveal adds a one-time 200ms pale blue opacity bloom that
returns to the same neutral glass material. It never translates/scales the pill,
and reduced motion suppresses the bloom. Saved/cache hits retain normal glass.

## 1.6 Reader content adaptation

Reader writing content stays in one bottom row at every supported
container width. The pill narrows between the PDF navigation and settings slots;
its tool strip scrolls horizontally while the reading-mode exit remains visible.
Tool targets stay 44px and options are positioned above the measured pill height.
Home/Wordbook dock geometry remains unchanged.

## Consistent task surfaces (2026-09-30)

`styles/surfaces.css` owns short-task surface, form, close-button and action
geometry. Add/Edit use native modal dialogs with explicit close buttons and
Escape, preserving their existing submit/import/delete paths. Word addition and
category/PDF confirmations share the sentence-glass palette and 22px surface
corners. Ordinary task actions use neutral material; account sign-in keeps its
blue primary action. Learning-grade colors never indicate a general Save action.
Aa and Memory filters use 44px action targets without changing the established
Reader lookup or shared bottom-dock geometry. Settings stays an opaque grouped
sheet. The public Wordbook name is Breeze Memory; persisted identifiers and data
remain unchanged. See `DESIGN.md` for roles, responsive rules and exceptions.

Validate with `npm run test:design-tone`, `npm run test:home-ui`, onboarding and
word-presentation browser suites plus `npm test`. The former Add test that
required no close button is superseded by the explicit close requirement.

## Dialog state ownership (2026-09-30)
Add/Edit visibility uses native dialog `[open]` only. The legacy `.on` display,
visibility and pointer gating is removed, including dependent refresh/notice
selectors. Browser dismissal checks must tap the scrim and X, then reopen via
the real Home control and scroll; checking only the closed attribute is insufficient.

## Upper-left PDF navigation (2026-09-30 refinement)
The PDF page-count pill is independent of the bottom dock in both original
reading and writing. Its left vertical panel overlays without reflowing paper;
the bottom reading title and writing tools keep their own roles. The transparent
dismissal surface consumes outside taps, including Pencil admission exclusions.
Thumbnail virtualization uses the visible vertical range and a bounded buffer.

The page pill and vertical panel share one surface whose width, height and corner
radius transition. Contents never scale. Closed page controls disappear with the existing
`chrome-hidden` state, with no second scroll owner. Reduced
motion disables transitions. Closing retains inert thumbnail nodes for the 220ms exit motion, then releases them.
Reopening cancels that cleanup; reduced motion cleans up immediately.

PDF original mode has an explicit left-slot variant: back and page navigation
share an 88px pill. The page control opens a full-height glass sidebar at the left edge without changing the slot or
Reader width. The sidebar header repeats the entry icon to close it. Non-PDF slots retain their shared geometry. On narrow screens,
writing tools keep the same bottom row and scroll inside the pill.

## Unified Reader glass and responsive writing (2026-10-01)

The floating controls, PDF sidebar and Reader settings share
`--control-glass-surface`, 19px blur and the same reflection family. Light control
material uses 78 percent opacity for readable settings; Home and Memory controls
use that same shared material. Lookup surfaces keep their existing tokens.
Opaque fallback remains available without backdrop filtering.
Sidebar entry and exit animate only translation and opacity at final size.

All pills use a 50 percent viewport anchor. In narrow PDF containers (650px or
less), expanded reading/writing adds a 22px translate to clear the left PDF slot.
Collapsed reading removes that translate over 260ms and returns to viewport center.
Reduced motion skips the translation.

Reader collapse/expand uses one 260ms easing for translation, width, height,
padding and corner radius, including the PDF reading variant. Resolve the
viewport width cap inside both endpoint widths, rather than clipping an
animated larger width with max-width: clipping stalls the visible shrink while
translation is already running. The ink entry retains its layout slot while
its width and opacity transition; it becomes inert immediately on collapse and
hidden at the end. Reversals retarget the current CSS presentation without
timers or an animation queue. Reduced motion applies geometry immediately.

`tests/verify-reader-chrome-motion-browser.mjs` samples intermediate geometry in
Chromium and WebKit at phone, tablet, desktop and short viewport sizes in both
themes. It checks synchronized trajectories, interruption continuity, input
gating, writing-mode expansion and reduced motion. Browser evidence does not
establish physical iPhone frame rate.

Task/import/edit dialogs, article preview and Home settings now share Reader settings material (surface token, 19px blur and theme reflection). Layout and content contracts remain unchanged. Memory uses its original image logo at Home entry as well as inside the view.
