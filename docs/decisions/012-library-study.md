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
  and writing. Its surface morphs upward into a vertical floating thumbnail panel without
  resizing the document. Reading keeps the book title in the bottom pill; writing
  keeps only tools there. Outside taps close without reaching the document. Opening retains page order and scrolls the current
  page into the first visible slot. The current thumbnail has a neutral fill and stronger page label; bookmarks are red.
  Bookmarks-only contains only bookmarked, nondeleted pages. Rendering is serial,
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
- Long-pressing a thumbnail or using its context menu offers confirmed page deletion.
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
request cannot replace an open decision. PDF deletion awaits the same confirmation
surface and rechecks the original session before invoking the existing transactional
delete path. Selection/bookmark appearance uses theme-aware semantic tokens;
actual ink colors and user-picked grade colors are unchanged.

## Shelf/category and page refinement (2026-09-30)
Category controls sit below the shelf heading and align with its content width.
Inbox is a computed view of documents without a valid assignment. New imports
capture their destination at initiation; duplicate/reconnected documents keep
their existing assignment. Category deletion still preserves all documents.
Thumbnail bookmarks use an outlined/filled ribbon at the upper left. Page
navigation is available in reading and writing and closes on leaving PDF original
mode; the sheet uses an opaque preview palette. Its bookmark-only and close
actions use ribbon and the shared task-close X with accessible labels. The page
pill disappears downward on chrome collapse.

Reader settings expose only per-grade highlight visibility through the same star
buttons as word lookup. No color picker is shown; stored custom colors and all
vocabulary data are preserved.

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

The page panel lays out thumbnails at its final size before morphing its outer shell. This avoids ResizeObserver-driven viewport repaint on each animation frame. The opaque expanded surface disables inherited backdrop blur. Ink settings position is measured only while visible and on opening. Reader settings remove the obsolete hidden mode toggle; `hidden` wins over flex-row styles.

PDF viewport rotation preserves the last source page and normalized in-page position
captured at settled viewport dimensions. Resize/scroll callbacks can refresh the
page rectangle cache before ResizeObserver runs, so that cache alone is not a
reliable pre-rotation position. A pending restoration belongs to the same PDF
session and vertical mode. Initial original-document presentation does not save
its temporary text surface over stored reading progress.

PDF paper sits above a theme-aware gray desk with 20/24px side margins,
14/16px page gaps and a subtle paper shadow. These are inside the existing zoom
layer; source/ink coordinates and vertical trailing scroll space stay intact.
The combined 88px exit/page slot is a PDF-specific dock variant. Its expansion
is absolutely positioned so it cannot move the centered title or writing tools.
