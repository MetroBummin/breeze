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
targets align to the paper top and left after rendering and container resizing.
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

The shared original-navigation entry exposes the same visual page sidebar for EPUB and PDF. EPUB source layout is sliced at the stable Reader viewport height; page numbers describe the current layout rather than publisher-fixed pagination. Selecting a preview scrolls to that exact source slice. Publisher typography and images come from the already-sanitized source documents; no source Blob reread, extraction or render library is added. Only visible slices plus one neighbor on each side instantiate sandboxed, inert preview frames. Cached source markup and loaded previews are reused until source geometry changes, and session release clears ownership. Chapter headings are not used as the navigation UI.

PDF-specific bookmarks, deletion and direction controls remain hidden on EPUB. Existing measured EPUB anchors supply the current spine without another source anchor capture. Frame geometry changes coalesce sidebar layout into one animation frame; source width/height changes invalidate slices and rotation updates page numbering.
