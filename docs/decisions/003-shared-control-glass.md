# Shared floating control material

## Decision

Home, shelves, Wordbook and Reader opt into `.control-glass`. Its material is defined once in `styles/reader.css`; palette values live in `styles/tokens.css`. The shared `.control-dock`, `.control-bar`, `.control-circle` and `.control-pill` primitives own expanded placement and geometry. View-specific rules may change content, but must not override padding, alignment, size or offsets. The Reader's compact geometry remains an intentional variant. Sentence loading uses only the selected source cue; failures reuse the word mini-pill material and placement outside the Reader controls.

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

### Page-sidebar timing alignment (2026-10-05, local follow-up)

Both directions retain 220ms and 12px translation. Entry now uses the approved
exit curve, cubic-bezier(.45,0,.8,.35), instead of cubic-bezier(.2,.75,.25,1).
Chromium measured the former entry crossing half of its travel in 28–48ms after
the button click, versus 180–198ms for the close button. Equal nominal duration
did not produce equal progress. The surface owns opacity in both directions;
the inner navigator no longer adds a separate 220ms ease fade to entry.
Exit timing, cleanup, cached previews and reduced-motion behavior are unchanged.
Reversals sample the currently drawn translation and opacity once when the
existing sidebar owner changes direction, avoiding a jump to a fixed endpoint.
There is no per-frame layout work, new timer or motion queue.
The shared PDF/EPUB surface uses this same motion. Edge input still opens on
release through the existing toggle; there is no drag-following sheet or swipe
close route. Ink ownership and zoomed edge-open exclusions remain.

`tests/verify-pdf-sidebar-motion-browser.mjs` records real frame samples and seeks
rendered trajectories, checks interrupted/repeated toggles, resize, ownership,
zoom exclusions, viewport/theme bounds and reduced motion. Browser and synthetic
contact evidence does not establish native device timing. See
`docs/qa/pdf-sidebar-motion-2026-10-05.md` for measurements and availability.

Reader pills use absolute left/right insets and auto inline margins to center
their animated width in layout. No width-relative horizontal transform is used:
on-device build 205 footage showed transient overshoot despite synchronized
CSS timing and correct DOM trajectories. In narrow PDF containers (650px or
less), expanded reading/writing uses a 44px left inset and a zero right inset,
placing its center 22px right of the viewport center. Collapsed reading returns
the left inset to zero over 260ms. Reduced motion applies geometry immediately.

Reader collapse/expand uses one 260ms easing for the left inset, width, height,
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

Task/import/edit dialogs and article preview share Reader settings material (surface token, 19px blur and theme reflection). Layout and content contracts remain unchanged. Memory uses its original image logo at Home entry as well as inside the view.

## 2026-10-01: reduce Reader transition work

Keep the existing +22 px narrow PDF expanded-pill position and centered collapsed position. Decorative control transitions must not invalidate PDF paper measurements. Original paper-growth and viewport watchers share one EPUB frame layout, coalescing paper growth in a frame and writing sizes only when changed; PDF viewport changes settle immediately to preserve pinch and rotation coordinates; hidden originals are skipped. Cached mode returns restore scroll synchronously before presenting the source.

Window resize no longer independently restores the Reader anchor. Text/EPUB width restoration stays with the Reader width observer; PDF viewport restoration stays with its paper observer. PDF width changes use the logical page anchor as well as rotation. Three competing original restorations caused scroll writes during newly started pinches.

## Home capsule continuity (208)

Both root reveal and named control geometry use one easing curve, cubic-bezier(.18,.86,.22,1), with a 480ms opening and 440ms closing duration. This extends the terminal deceleration compared with the former 340ms timing. Closing remains opaque through 90 percent and retains its terminal frame with fill-mode both. Text remains unscaled, Home snapshots remain opaque, and reduced motion follows the existing immediate path. The user supplied an Apple Music screen recording as the motion reference; this does not introduce interactive sheet dragging.

## Local resume identity and unscaled capsule snapshots (210)

The Home resume target is the most recently opened local book, persisted as one
book ID in `breeze.home-resume.v1`. Opening does not advance the cloud progress
timestamp; scrolling still owns progress updates. A deleted/missing local target
falls back to the existing saved-progress ordering, and transient onboarding is
never remembered. Titles and actions resolve the same target.

## Local recently read shelf order (2026-10-05)

Successful Reader location restoration records device-local recency per book in
`breeze.local-read.v1`, together with the existing Home resume identity. Reopening
an unchanged location moves that book to the front of Home and its book shelf;
progress `t` remains owned by location changes. Preview and cancelled preparation
and failed source presentation do not record a read. A first-open progress marker
is also deferred until the document is ready. Transient onboarding is excluded.
Existing books without local recency fall back to their saved progress timestamp,
then addition date.
Home, shelf and current-book indicators share that comparator. Deletion removes
the local recency record. Memory's independent sort selection is unchanged.

An unfinished book opening carries its once-successful read commitment on the
existing position restoration owner. A mode switch inherits that commitment;
only its successful current owner can record the read. The superseded original
open promise cannot omit a successful text landing or commit after cancellation.
The plain text open frame also checks that it still owns restoration.

Home/Reader snapshots use intrinsic-size, centered capsule contents clipped by
the moving rounded surface, so the browser does not stretch title text between
different pill widths. Both directions use cubic-bezier(.32,.72,0,1), keeping the
480/440ms durations, opaque Home, terminal fill, and reduced-motion fallback.

Unchanged Home round trips reuse lexical paint as well as document nodes. The
bounded retained Reader stores its visible mode and a small signature of saved
word keys, grades, visibility and phrase shape. Reopening the same mode skips
retokenizing text and recreating PDF/EPUB highlights unless that presentation
changed while Home was visible. A changed vocabulary or mode still refreshes
the target; source edits still invalidate the Reader. Browser regression verifies
zero refresh calls on unchanged Text/PDF/EPUB round trips and an actual repaint
after a saved-word change. No new persistent cache or sync state is introduced.

## Remove full-screen clipping (211)
The user reports stutter in both directions on build 210. Remove the animated
full-viewport clip-path and its measured inset. Reader snapshots use only a
28px translation and opacity; the named capsule still connects both controls
with intrinsic-size text, unchanged 480/440ms easing and reduced-motion behavior.
This removes per-frame clipping work without another animation coordinator.
The duplicate attribution render on book open is removed. Browser state and
animation checks do not establish physical-device frame pacing.

## Build 211: matte Home settings

Home settings intentionally use the opaque `--settings-sheet-surface` token (light `#F2F2F7`, dark `#2C2C2E`). Covers showing through the full-height sheet distracted from settings. Remove this sheet from shared glass selectors instead of adding another blur/reflection override. `styles/home-shell.css` owns the fill; `styles/tokens.css` owns its theme values. Reader Aa, bottom controls and other dialogs retain their existing glass.

## Prevent rectangular capsule backdrops (215)

The browser-generated `reader-control` group animation transfers the live pill's
backdrop filter to the rectangular transition group. Rounding its child image
pair does not constrain that outer filter, leaving a brief rectangular patch in
both navigation directions. Disable the group's additional backdrop filter with
an important declaration, which takes precedence over generated keyframes.
Keep the glass inside the captured capsule, intrinsic text, rounded image pair,
soft outer shadow, timing, and live control material unchanged. Do not clip the
whole group: doing so also cuts off the approved shadow.

Browser coverage samples both directions, themes and viewport sizes, checks the
animated filter and settled controls, and compares painted capsule corners with
the underlying scene. The regression fixture places a high-contrast pattern
behind the controls so a legacy rectangular blur has a measurable positive
signal even over the otherwise uniform dark tablet footer. Samples use the
paused transition group's animated bounds, and require both a nonzero legacy
signal and smaller fixed corner deltas; filter, shadow and settled controls
checks remain. Linux WebKit cannot establish physical iPhone rendering;
real-device confirmation remains separate from these browser checks.

## Sidebar dismissal on body manipulation

The PDF/EPUB sidebar is a nonmodal navigator. Its former full-screen transparent
button prevented body scroll and PDF pinch from reaching the existing Reader
owners. Remove that button rather than forward its contacts through another
gesture listener. Central Reader movement and the original pinch owner dismiss
through the existing sidebar close path. The existing body wheel/key listeners
handle those explicit scroll intents. A raw scroll event is insufficient: EPUB
reflow and viewport clamping can move scrollTop without user input and must keep
navigation open. Internal sidebar scroll
and UI controls keep their own contacts; programmatic restoration does not
dismiss. An outside stationary body tap preserves the previous dismiss-only
policy, with its tail click consumed by the same central gesture owner. A fresh
subsequent body tap works normally. A cancelled stationary body contact keeps
the sidebar; a pan or pinch already committed cannot restore it.

The pending Reader gesture holds the sidebar generation it began beside. A later
sidebar opening cannot be dismissed by that earlier contact, even when it reuses
the cached preview object. There is no new
listener, gesture timer, persistent state or server request. Opening/closing
reversal retains the current presentation, as described above. Browser checks
cover PDF/EPUB body versus internal movement, programmatic restoration, trusted
wheel/tap input, pinch cancellation, reopening and zoomed edge exclusions;
these do not establish physical iOS/Pencil behavior.

## Safari-proportion review candidate (separate from TestFlight267)

The user requested a separate PR with iPhone/iPad screenshots after comparing
Home, Wordbook and Reader with private Safari reference photos. Shared expanded
controls now form a centered row: 83vw capped at512px, 48px circles/capsule and
8px gaps. The narrower total row gives the phone more outer breathing room;
iPad retains the cap instead of stretching the phone arrangement to screen edges.
The row bottom is max(8px,safe-area-inset-bottom), retaining desktop clearance
while removing the former extra15px above the device safe area.

Reader controls remain inside readmain, so lookup-pane space is preserved. The
PDF/EPUB two-button capsule grows to96px and the central pill uses the remaining
width with balanced8px gaps. The sidebar expands to the readmain edge using the
centered row's real gutter. Compact Reader behavior and44px horizontally
scrollable writing targets remain. Materials, functions and gestures are unchanged.
Private photos are not committed. This branch is a review candidate; build267
source and its immutable contract remain on integrate/breeze-193-cloud. No merge,
version change, archive or upload is authorized for this geometry PR.

### Narrow recovery notices

The first geometry review reproduced the OCR recovery notice regression at
320×568 in Chromium: the two-line30px title slot had only35.6px width after
mode controls, so its content required76px height and was clipped. In a readmain
container360px or narrower, a visible Reader notice with a mode button now uses
the full capsule width above the unchanged mode target. The capsule grows upward
only for that status. Text wraps naturally without a line clamp; no font shrink,
shortened guidance, hidden mode button or weakened OCR assertion is introduced.
Compact controls retain their existing geometry and tap behavior. Ordinary controls
return to their approved dimensions when the notice clears; wider notices retain
the prior layout. The writing pill uses the shared48px outer height while its
internal controls remain44px and horizontally scrollable.

### Approved next internal candidate: lighter shared controls

The user approved a further border/shadow polish, consistent same-family circular
controls across Home, Wordbook, Reader and study sets, and inclusion in the next
internal TestFlight build268. Integration is authorized; main merge and App Store
submission remain outside scope. Parent confirmed Apple's next counter268 and
owns the single Cloud start. Historical267/266 contracts remain unchanged.

Control border/shadow tokens now own both dock glass and the study-set header.
Light edge alpha and drop-shadow weight are reduced; dark shadow/edge are also
restrained. The study header retains its existing neutral light/charcoal gradient
and44px targets; dock controls retain48px proportions. Shared outline icons use
20px boxes and1.8 strokes; Reader's existing1px optical back-chevron correction
remains. Completed badges, writing tools and unrelated functional controls retain
their own sizes. Scroll/gesture ownership and writing's always-expanded policy
are unchanged. Real captures and trusted touch tests verify the affected states.

### PDF slot regression contract

The real morph/rotation suite reproduced its old22px-center assertion at320px:
96px navigation,105.59375×48px pill,48px settings, balanced8px gaps and exactly
24px pill-center offset. The prior44px side slot implied22px; the approved48px
row implies24px at all widths, including a bounded centered tablet group. No
product geometry change is needed. The suite now requires explicit96/48px
navigation/settings,48px row heights, balanced8px gaps, a centered bounded row
and pill center in the actual free interval. Compact centering, no-overlap,
writing alignment, sidebar morph, thumbnail bounds and all later functional/
rotation checks remain. The page button is checked inside its navigation slot
rather than against the old viewport-edge assumption on centered tablet rows.

The follow-on chrome-motion suite also derives the expanded PDF anchor from
the actual free interval between the96px navigation and48px settings slots.
Its former narrow22px/wide0px and reduced-motion217px expectations are obsolete
under the approved row. Immediate continuity, synchronized easing, no overshoot,
settling, interruption/reversal, writing and reduced-motion assertions remain.

### Post268 optical review,2026-10-12 (Draft only)

Parent verified private946×2048 reference images and supplied optical targets.
The consumer's supported Library materialization failed; the consumer has not
seen those original pixels. Parent owns direct comparison and final visual review.
These are product requirements derived from screenshots, not published Safari
capsule/glyph specifications. No merge, deployment or new release is authorized.

Preserve48px row height, bottom safe-area rule,24px capsule radius,8px outer gaps,
row cap and all material tokens. The PDF/EPUB pair uses two independent44×48px
regions inside88px; the central capsule gains8px. Its center is the actual free
interval (20px offset for the balanced row), and compact controls remain34px.
The page button is anchored to the outer border edge and closed-only overflow
is visible to prevent the old1px hit-rectangle overlap. The drawer keeps its
contained overflow; no gesture owner, storage or navigation function changes.

Reader and study back glyphs share32px frames and2.1 rounded stroke. Their actual
painted area is much smaller than the SVG frame. The mode glyph uses24px/2.1
and three paragraph lines, preserving the original/text semantics and labels.
Unrelated glyphs, header44px targets and writing44px targets keep their sizes.

Paired renders use identical fixtures/viewport/theme. Geometry guards require
88px/48px slots,48px heights,8px gaps and real free-space centering. Touch tests
keep exact44px rectangles, no overlap and subpixel DOM owner checks. Chromium's
2px touch footprint straddled a0.25px seam sample and its synthesized click
rounded to an integer; actual trusted taps now use the first unambiguous whole
pixel inside each region. Assertions are retained; no delay/gesture workaround
is added to product code. Both native reference comparison and native-device
touch/rendering remain outside this browser evidence.

### PR155 follow-up: slightly bolder, balanced paired glyphs

User review asked for slightly bolder outlines and a page-finder glyph matching
the chevron's optical size/weight. Shared20px outlines now use2.0 instead of1.8;
back32px and mode24px frames use2.3 instead of2.1. The page-finder and its drawer
toggle use24px frames with stroke2.3×4/3 to match the chevron's actual32/24 SVG
scale. Nominal painted heights are20.07px (page) and19.60px (back), and both
effective strokes are3.07px. Different glyph aspect ratios keep different widths;
their bounding boxes are deliberately not forced equal.

The88×48px pair, independent44×48px targets, gaps, padding, material and all
functions remain. Full-view screenshots use the established PR155 PDF fixture
and measured22px scroll; bottom crops are actual DPR2 browser screenshot clips,
not resized/retouched artwork. The earlier126 comparison images remain intact.
Onboarding's separate WebKit timeout is unproven: its pen property resets once
the ready state removes the drawing animation. Add failure state/timeline/caption
diagnostics only; retain exact pen===1, hold/ready assertions and30s deadlines.
No product animation, deployment, merge or release boundary is changed.

### Sidebar header consistency correction

The30398694 CI comparison caught an actual asymmetry: the page-navigation
toggle alone had24px/3.07px SVG styling while its44px bookmark peer retained
22px/2px. Move both onto the shared sidebar-header rule (24px frame, matching
stroke scale); remove the one-button override. Preserve44×44 circles,50% radius,
background, fill/pressed semantics and all existing deep-equality assertions.
Before/after own-browser sidebar renders ground the change. This does not force
the differently shaped bookmark/page glyphs to equal painted widths.

### App icon family review (PR155)

Extend the reviewed general outline family (20px SVG frame, rounded 2-unit
stroke) to Home settings/add, Wordbook export, folder add, PDF thumbnail actions
and task/settings/article close buttons. Filled ellipses use a 20px frame and
1.6-unit dot radius. Keep existing button rectangles, materials, accessible
names and handlers; use centered SVG instead of the article preview's text X.
Back roles retain the reviewed 32px/2.3 chevron, while the sidebar header retains
its matched 24px/stroke-scale pair. Lookup, stars, disclosure indicators and
writing tools keep their distinct functional treatment. This is a draft visual
review; user sign-off precedes any new build or deployment. Frozen release
receipts and checkers remain unchanged.
