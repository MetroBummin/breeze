# Breeze 1.6 library organization and study controls

- Library organization is folder-style: one document belongs to at most one
  user-named category. Creation, renaming, deletion, assignment and removal are
  local, durable presentation metadata (`breeze.library-folders.v1`). Removing
  a category never deletes documents, progress, vocabulary or ink. Cloud-only
  placeholders are shown in All; categorization is available after local restore.
- Category controls and document management live in the Casuals and Long-form
  shelves. Home shows the full reading selection regardless of the shelf's
  active category; its cards open content without edit or delete gestures. Shelf
  category controls use a single select/add/manage row; rename and delete live
  in the selected category's manage menu with the existing confirmation dialog.
- Completed local document cards reuse the existing completion badge at top right.
- PDF navigation uses a bottom-left page icon grouped with the exit button in both original reading
  and writing. It opens a full-height translucent left sidebar without
  resizing the document. Reading keeps the book title in the bottom pill; writing
  keeps only tools there. Outside taps close without reaching the document. Opening retains page order and scrolls the current
  page into the first visible slot. The current paper has a gray overlay and centered circular ellipsis action; bookmarks are red.
  The header has a bookmarks-only filter and circular sidebar icon to close; per-page ribbons own bookmarks. Rendering is serial,
  virtualized to the viewport plus three slots, and cancelled/guarded on close or
  session change. No eager all-page thumbnail render or unbounded bitmap cache.
- Bookmarks use source hash (book ID fallback) and original page number, independent
  of ink and text. They survive reopen without mutating the source PDF.
- Vertical reading remains the default. Horizontal is a persistent global Reader
  preference. It retains original page nodes/identity and shows one page at a time;
  the source paper, SVG coordinates, source glyphs and zoom engine stay unchanged.
  Horizontal reading drops the vertical document's trailing 45vh scroll space,
  because no next page exists below the visible page. Pages shorter than the
  viewport are centered in the available height. Touch swipes and unmodified
  left/right arrow keys move pages; page-navigation header arrows are absent.
- Selecting a thumbnail navigates without closing the sidebar. The selected paper shows a centered ellipsis button that offers confirmed deletion. Long-press/context-menu deletion is removed.
  At least one page must remain. Deleted page numbers are stored on the book;
  original bytes and original ink IDs are preserved. Text is re-extracted from
  retained PDF pages, then a single IndexedDB book transaction stores text, source
  map, formatting and deleted-page metadata together. Filtering by paragraph start
  is unsafe because a paragraph may span two pages. A failed write leaves the
  previous book intact. Original bytes are not exported as a physically edited PDF.
  Reconnecting identical bytes preserves the edited text. Page deletion is local;
  no new cloud protocol or deployment is included.
- EPUB original mode gets adaptive body padding and a maximum line width. Its
  bottom mode control occupies the same position as PDF's. No new margin panel.
- Three star-grade rows own app-wide visibility/color in `breeze.study.v1`.
  Hidden grades make only presentation transparent, including EPUB CSS Highlights.
  Saved meanings, grade, per-word mark state and history are untouched. The word
  popup disables color toggling for a hidden grade. Settings survive restart and
  apply in light/dark themes. The existing selection and lookup lifecycle stays.

Validation: `npm test`, `node tests/verify-breeze16-browser.mjs`,
`npm run test:pdf-ink`, `npm run test:pdf-pinch`. Physical iPad multitasking,
Pencil admission/palm rejection and real-device latency remain a release gate.

## Task dialogs and semantic colors (2026-09-30)

Category creation, rename and deletion use the shared native task dialog. Cancel
and Escape do not mutate data; the initiating control regains focus. A pending
request cannot replace an open decision. PDF deletion expands the selected thumbnail ellipsis into inline cancel/delete controls and rechecks the original session before invoking the existing transactional delete path. No implementation-detail message or separate modal is shown. An empty bookmarks filter has no large explanatory text. Selection/bookmark appearance uses theme-aware semantic tokens;
actual ink colors and user-picked grade colors are unchanged.

## Shelf/category and page refinement (2026-09-30)
Category controls sit below the shelf heading and align with its content width.
Inbox is a computed view of documents without a valid assignment. New imports
capture their destination at initiation; duplicate/reconnected documents keep
their existing assignment. Category deletion still preserves all documents.
Thumbnail bookmarks use an outlined/filled ribbon at the upper left. Page
navigation is available in reading and writing and closes on leaving PDF original
mode; the sidebar uses a translucent light/dark glass palette. Its header has a bookmarks-only filter and circular sidebar toggle with an accessible collapse label. The page
pill disappears downward on chrome collapse.

Reader settings expose only per-grade highlight visibility through the same star
buttons as word lookup. No color picker is shown; stored custom colors and all
vocabulary data are preserved.
The heading includes a small tap-to-toggle hint. Star buttons share lookup's
36px visible height; an extra 4px hit region above and below keeps a 44px target.

The compact page control shows a sidebar-with-dots icon in a 44px target beside the exit button;
the current page remains in its accessible name. Reader settings use spacing
instead of row or star-section divider lines.
The thumbnail panel retains the same navigation, bookmarks and deletion behavior
with a quieter header and smaller visual elements; all touch targets remain 44px.
The category disclosure uses an SVG chevron so its open/closed shape is stable
across fonts and platforms. Reader and Home settings use smaller type and spacing
without reducing control hit areas.

For PDF scrolling, progress calculation owns the per-frame source-anchor read and
passes that measurement to the page pill. Unchanged page text and read direction
do not trigger DOM writes. The thumbnail viewport measures its current page once
per paint pass. Browser verification counts one PDF anchor read per progress update;
physical-device frame pacing still needs a separate same-build comparison.

Shelf and Edit category selection use the same Breeze details menu. The hidden
select retains the existing assignment contract; the visible menu owns the
selection UI. Wordbook star filters reuse lookup/Reader star button styling.

The page sidebar lays out thumbnails at its final full-height size and animates translation/opacity only. This avoids ResizeObserver-driven viewport repaint on each animation frame. One fixed-size glass surface provides backdrop blur. Ink settings position is measured only while visible and on opening. Reader settings remove the obsolete hidden mode toggle; `hidden` wins over flex-row styles.

PDF viewport rotation preserves the last source page and normalized in-page position
captured at settled viewport dimensions. Resize/scroll callbacks can refresh the
page rectangle cache before ResizeObserver runs, so that cache alone is not a
reliable pre-rotation position. A pending restoration belongs to the same PDF
session and vertical mode. Initial original-document presentation does not save
its temporary text surface over stored reading progress.

PDF paper sits above a theme-aware gray desk with 20/24px side margins,
14/16px page gaps and a subtle paper shadow. These are inside the existing zoom
layer; source/ink coordinates and vertical trailing scroll space stay intact.
The combined 88px exit/page slot is a PDF-specific dock variant. Its full-height sidebar
is absolutely positioned so it cannot move the centered title or writing tools.

## Full-page thumbnails and dock continuity (2026-10-01)

Render each thumbnail from its complete PDF viewport with an explicit source
aspect ratio, fitting the strip width and 180px maximum height. Do not crop paper
inside a fixed-height button. Variable-height virtual slots follow each source
aspect ratio, with a 12px number line and 8px gap; there is no artificial trailing
blank viewport. Page labels remain a 9px secondary line. Bookmark
targets align to the paper top and right after rendering and container resizing.
Sidebar closing uses the same fixed geometry as opening and releases inert
content after its 220ms exit. Rapid reopening cancels pending cleanup.
The writing pill remains on the bottom row, narrows between the side slots,
and scrolls only its tool strip. Narrow expanded PDF pills translate 22px right;
collapsed reading returns to the viewport center. Pen and eraser lead that strip; reading
mode exit stays visible.

Reader exit, sidebar entry and sidebar collapse use 22px outline icons with
2px strokes. Thumbnail bookmarks use a 20 by 28px ribbon with 1.8px stroke and
secondary-ink contrast; their 44px target remains aligned inside the paper.

### Compact category and Memory surfaces (2026-10-01)
Shelf grids start at the heading/category left edge rather than centering leftover columns. Category and manual-word tasks use compact 380px forms with 44px input/action targets. Memory stars match lookup/Reader visual proportions while preserving 44px hit areas. These changes do not alter assignments, vocabulary, or persistence.

## 2026-10-01: reuse Reader work

EPUB star visibility uses one persistent highlight stylesheet and changed-only root CSS variables; toggles do not rebuild chapter marks. PDF sidebar close retains its bounded virtualized strip and rendered canvases within the live document session. Reopen reuses them, updates geometry/bookmarks, and cancels stale rendering by generation. Leaving the original session releases the cache. Mode returns reuse live documents instead of retrieving their Blob again. Sentence search starts near the mapped paragraph and falls back to the full search when needed.

## EPUB original page previews (209)

The shared original-navigation entry exposes the same visual page sidebar for EPUB and PDF. EPUB source layout is sliced at each chapter width times sqrt(2); page numbers describe the current layout rather than publisher-fixed pagination. Selecting a preview scrolls to that exact source slice. Publisher typography and images come from the already-sanitized source documents; no source Blob reread, extraction or render library is added. Only visible slices plus one neighbor on each side instantiate sandboxed, inert preview frames. Cached source markup and loaded previews are reused until source geometry changes, and session release clears ownership. Chapter headings are not used as the navigation UI.

PDF-specific deletion and direction controls remain hidden on EPUB. EPUB bookmarks use source anchors rather than layout page numbers. Existing measured EPUB anchors supply the current spine without another source anchor capture. Frame geometry changes coalesce sidebar layout into one animation frame; source width/height changes invalidate slices and rotation updates page numbering.

## Shared sidebar presentation (210)

PDF bookmark ribbons and their 44px targets align inside the paper's upper-right
edge. EPUB keeps the same right-aligned collapse control even without the PDF
bookmark filter. Both formats retain the existing sidebar surface and motion.
EPUB lays out preview placeholders first, waits for the sidebar entrance to
finish, then creates one nearby source preview per frame. Close/reopen cancels
stale work by generation; loaded previews remain reusable in the live session.

EPUB navigation slices use a 1:sqrt(2) paper aspect ratio, independent of tall
phone viewport proportions. Each thumbnail uses the strip width minus 8px,
with a 12px number line, 8px inter-page gap and 6px paper corners. The source
chapter remains continuous; preview clicks and current-page detection use the
same per-chapter slice height. The last slice retains paper proportions. PDF
keeps its existing uncropped source aspect ratios. This follows the supplied
Apple Preview reference without scaling or reflowing the reading document.

EPUB bookmarks persist per source hash as chapter/element/relative-element-offset
anchors under `breeze.epub-bookmarks.v1`. Reflow remaps those anchors to the
current preview pages; a full-frame height that happens not to change does not
skip bookmark remapping. Right-hand ribbons and the bookmarks-only filter share
PDF presentation. Removing a filtered bookmark updates the list; invalid storage
or failed writes report an error and never replace the saved data.

Both formats expose the same draggable scrollbar: a 4px visual thumb with a
24px-wide touch grip and at least 44px height, pointer capture, and Home/End,
PageUp/PageDown and arrow-key support. A reserved 14px rail plus the strip's inner paper gutter separates its entire
hit target from thumbnail paper and bookmark targets. This scrollbar is
intentionally narrower than an action button to preserve the thumbnail width. It owns only the sidebar
scroll position; paper reading position and gestures remain independent.

Both sidebar header controls share a 44px circular neutral surface and 22px
icons with 2px strokes. The bookmark filter alone becomes red and filled when
selected. The header bookmark uses a square viewBox; page ribbons retain their
existing tall paper-edge geometry. This presentation is shared by PDF and EPUB.

## Horizontal progress and bounded EPUB preview viewports (211)
Horizontal PDF progress uses the retained-page ordinal plus the current paper's
scroll fraction, divided by retained page count. A paper that fits in the Reader
is fully visible and contributes its full share. A tall or zoomed paper advances
from its top alignment to its visible bottom, bounded to that page's share.
Deleted pages do not count. Source anchors still store the original page and
normalized location, and vertical-mode progress is unchanged.

EPUB previews previously transformed a full-chapter-height browsing viewport for
each page slice. Keep each viewport at one slice height (remaining height on the
last slice), scale it, and scroll its own document to the source offset on load
and font readiness. Retain source root height and eagerly load cloned images so
layout matches the source. This bounds painted surfaces independently of chapter
length; source text, sandboxing, numbered slices and navigation are unchanged.
Long-chapter regressions verify actual colored pixels on pages 43, 44 and 45 in
Chromium and WebKit. This is constructed-book evidence, not reproduction with
the user's original EPUB, which was not supplied.

A second blank-page cause was the source frame's old height: scrollHeight is
never less than its browsing viewport, so wider reflow could not shrink a chapter.
For viewport-independent chapters, reset that floor once per changed width
before measuring actual content. No reset runs on ordinary scroll or unchanged
width. A regression widens a wrapping chapter and rejects the old empty tail.

## EPUB navigation contact and motion (212)

Late chapter reflow previously replaced the whole thumbnail track, including the
button between a contact's down and click. Defer EPUB track rebuild and
virtualization until the contact finishes; process deferred work on the next
animation frame after the click. Preview creation also yields during a contact.
Closing the sidebar clears contact ownership. No gesture is cancelled or captured.

Preview selection resolves its current slice, clears obsolete pending source
restoration, and moves the existing Reader scroller over 200ms (ease out). New
selections supersede old motion through the existing reader mode token; direct
scroll interrupts it. Reduced motion applies the destination immediately. Save
the actual settled source position. CSS-pixel scroll truncation must not report
the preceding page at an exact slice boundary.

EPUB layout slices remain navigation positions rather than fixed source pages.
PDF-only deletion remains hidden. A persistent EPUB deletion feature would need
a source-content/chapter contract, not deletion by transient viewport page number.

`tests/verify-epub-navigation-input-browser.mjs` reproduces a trusted down/up
across late source reflow, repeats touchscreen selections in five sizes/themes,
and checks exact source alignment, latest selection and reduced motion. The 211
worktree fails because the pressed button is disconnected.

## Reader input ownership (214)

Collapsed chrome and sentence waiting now derive control interactivity from one
shared policy, including the reader-navigation parent. Previously word selection
called sentence cleanup while chrome was collapsed, marking that parent inert;
expansion restored only its children, leaving visible navigation unresponsive.
Reconciliation runs even when the visibility class has not changed. Opening the
page sidebar ends the previous word/sentence presentation through normal lifetime
cleanup, so pending answers cannot reappear over navigation.


## Independent shelf categories (214)

Casuals and Long-form own separate category lists, names, active filters and
assignment choices. Imported content accepts only a category belonging to its
actual shelf, even if the import began elsewhere. Categories remain device-local
metadata; no category sync contract or book/content identity changes.

After the local library loads, existing unscoped categories are assigned using
their member documents. A category used on both shelves is split into independent
IDs and its memberships retained. Unused categories are preserved on both shelves
because their original creation shelf was never stored. Migration writes the
whole metadata record atomically; failed writes preserve the previous data and
block editing until a clean reload. Deleting one shelf's category never affects
the other shelf's assignments or any document.

The Reader settings direction selection uses a separate 32px rounded neutral
background within its existing 44px button. It no longer clips a rounded fill
with transparent borders. Other setting controls keep their existing appearance.

## Original reopening owns position restoration (2026-10-02)

A cold PDF/EPUB opening is not a reading movement. Until the saved anchor has
landed, the original stays on the existing loading surface and rejects body
scroll/touch/scroll-key input. Reader chrome remains available for exit and mode
changes. Loading has no fixed deadline after which its temporary cover may save.
The central reading-position writer rejects an opening or an unpresented original
session, including lifecycle saves when leaving or backgrounding the reader.

Opening ownership is tied to that invocation and book, so a late completion cannot
unlock a newer opening. Initial input or a viewport reflow cannot invalidate its restoration token.
A failed anchor restore shows the existing error surface and retains the saved
position; leaving during preparation cannot retain that unfinished reader. After
successful landing, deliberate backward reading saves normally, including in a
previously completed book. Completion is not made permanently sticky.

Regression: `tests/verify-original-reopen-browser.mjs` uses real PDF/EPUB fixtures,
delays anchor restoration beyond the old save timeout, and checks early touch,
wheel, scroll and direct/lifecycle saves, completed/partial progress, normal backward
reading and navigation to another book, in Chromium and WebKit.


## Five illustrated Holmes stories (2026-10-04)

The five lightly modernized Doyle works retain their independent stable catalog
IDs and normal TXT import path. Final Problem is the complete story; Hound is the
complete fifteen-chapter novel with its original dedication and contents. Source
captures, full license, ordered edit replay, counts and hashes remain editorial
records in docs/content; they are not presented as raw-download hashes.

Each catalog entry uses its approved cinematic cover. Ten full-frame WebP scenes
per story decorate the reader only AFTER the verified depicted paragraph, using
the next existing block. Source paragraph indices, text bytes, saved book IDs,
vocabulary and reading positions never change. Both adjacent passage prefixes and
the canonical block index must match; edited/mismatched copies omit that scene.
Images reserve their native aspect ratio, load lazily and disappear on failure.
Preview hooks are spoiler-free and show covers alone. Existing saved covers
(including custom covers) are preserved; missing covers use the existing guarded
repair. No text migration, new storage, remote image request or paid call is added.

Assets are user-supplied verified local images. AI artwork source/derivative hashes,
resize/encoding details and generation records live under docs/content. Original
PNGs remain outside the app; derivatives preserve the complete frame. Artwork is
not attributed to Gutenberg. Original text public-domain status is stated for the
USA only, consistent with the existing source policy.

Validation: focused source/anchor/asset tests, actual Chromium and WebKit TXT
import and real IndexedDB reload, paragraph/lookup identity, offline saved-book
reopen and late-position restoration, every scene's image decode and placement,
and cover/reader light-dark screenshots at phone, tablet, desktop and short
viewport sizes. Aggregate npm test, asset stamps and native www bundle verification
remain required. Version 1.7(232), simple flashcards, dormant FSRS and Jev OFF are
unchanged. Physical-device WebView performance and release actions remain a
separate coordinated gate.

Holmes typography is scoped to those five works. Hound’s exact source title,
subtitle/author line, dedication/signature and contents retain the same source
blocks. The contents block displays its original fifteen entries on separate
lines without changing saved text or indices. All fifteen exact chapter headings
(including the long Chapter 9 heading) and Bohemia’s I–III divisions start a new
reading page with their following passage. Hound uses its source title once; the
reader’s repeated page title is hidden only for the unchanged catalog title.
Custom saved titles remain visible. The existing Reader font-size/margin/theme
settings own body metrics; no global reader typography is changed.

## Holmes-first 1.7 offering; Backrooms dormant (2026-10-04)

The existing recommendation shelves now offer only the five illustrated Holmes
works, in their established order. Backroom / Homeward Bound retains its stable
catalog record, local text, cover, scenes, lookup data, attribution and saved-copy
reader behavior, but is excluded from new recommendations. No migration, deletion,
new shelf layout or saved-book filtering is added. Previously saved copies remain
visible and readable with their custom cover and reading progress; removing a
saved Backrooms copy does not make it a new recommendation again. FSRS stays
dormant and Jev stays OFF. Public release numbering is coordinated separately.

## EPUB queued-frame clock boundary (1.7 / 234)

An rAF callback can carry a frame timestamp earlier than performance.now() at
navigation start. The prior easing extrapolated negative progress, briefly moving
backwards before the intended source move. The same product code on baseline
main 72719a2 and PR93 c2c680f reproduced 13/24 backward starts under real Chromium
12× CPU throttling, with actual timestamps and anchors recorded. Progress now
clamps to [0,1]; duration, targets, interruption/latest-choice guards and reduced
motion are unchanged. The existing monotonic assertion remains, with motion
histories on failure, exact clock-boundary unit regressions and bounded native
CPU-load browser sampling. This is an inherited product timing defect, not a
reason to weaken the fixture or rerun CI without a fix.

## Commit mode and position after restoration (1.7 / 234)

A requested Reader mode does not become the saved mode until its destination
anchor lands. The opening/mode operation owns one position-restoration record,
qualified by book identity, mode and change token. Ordinary saves, Home exit and
background lifecycle events retain the entire last committed mode/progress/anchor
while that owner is pending. Success commits the landed surface through the
ordinary writer; cold opening preserves saved progress. Failure keeps the prior
record and permits retry. A newer mode/book operation replaces the owner; stale
callbacks cannot scroll, capture or commit the new book.

Rapid reversals start from the committed source record, including text-to-text
cancellation back to its stored text anchor. Original-to-text restoration now
awaits both frames and any sentence lookup before releasing ownership. PDF page,
direction and deletion actions, opening the navigation panel, and EPUB page moves
wait while position restoration owns the Reader, preventing a navigation token
from orphaning the restoration. These actions work normally after landing.

Regression coverage: actual PDF/EPUB fixtures in Chromium and WebKit, immediate
Home exits, successful anchor/progress equality, reversals in both directions,
restoration errors, trusted wheel and lifecycle events during delayed restoration,
stale callbacks after changing book, and normal reading/completion. Reused
original sessions exercise navigation while no preparing attribute is present,
then verify navigation and saved/visible progress equality after landing.

## Text-only local position commits (234 follow-up)

Saving Text progress measures the current paragraph anchor once at commit time.
The per-frame anchor cache still avoids duplicate work during scrolling, but a
lazy illustration can grow without a scroll event and invalidate its offset.
Bohemia reproduced paragraph 43 moving from 233px to 379px while a save retained
233px; the next opening advanced 146px. A fresh commit keeps the saved progress,
paragraph and offset from the same visible surface.

Local progress also saves on hidden visibility and pagehide, independently of
cloud sign-in. Ordinary Home navigation already saves synchronously. The 800ms
scroll writer is not a durability boundary when a mobile app may suspend before
its timer runs. These saves use the existing pending-restoration guard and do
not reset progress, change completion rules or reject backward reading.

The animated Reader fill can trail its canonical target briefly; Home renders
the saved target immediately. This is distinct from a persistent numerical
Reader/Home mismatch, which was not reproduced in ordinary Bohemia navigation.
Regression: `tests/verify-bohemia-progress-browser.mjs` uses the actual bundled
261-paragraph story, delayed assets, immediate Home, backward reading, completion,
real database reopening, signed-out lifecycle saves and delayed-image offsets.

## Cold illustration reservation and Bohemia CI follow-up (234)

The illustration renderer already sets native width/height from catalog metadata.
The story-image CSS override `aspect-ratio:auto` suppressed that reserved ratio
before decode. Removing the override keeps the decoded appearance and reserves
the same image height during cold opening. Blocking Bohemia illustration 09
reproduced the CI paragraph 244 instead of 245 before any font-size change:
paragraph 245 restored at 200px while the preceding paragraph entered the probe.
With native reservation restored, the blocked image occupies 146px at the tested
phone width; paragraph 245 stays at 200px before and after decode.

The regression waits for scroll geometry, restoration and progress animation to
settle, opens Reader controls through the normal title button, then clicks Back.
This removes the fixture's dependence on an instantaneous chrome reveal while
wheel input may still hide controls during the click's stability wait. Exact
progress, paragraph and offset assertions remain. Cold
decode is tested with the real illustration blocked; a separate controlled late
layout change still proves that saving measures a fresh offset without a scroll.
Chromium and five-story light/dark viewport checks pass locally. WebKit's reported
hidden-button timeout is not reproduced locally because its binary is unavailable;
the existing both-engine CI step remains the gate. No font implementation defect
has been established by this cold-reopen failure.
