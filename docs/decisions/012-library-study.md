# Breeze 1.6 library organization and study controls

- Library organization is folder-style: one document belongs to at most one
  user-named category. Creation, renaming, deletion, assignment and removal are
  local, durable presentation metadata (`breeze.library-folders.v1`). Removing
  a category never deletes documents, progress, vocabulary or ink. Cloud-only
  placeholders are shown in All; categorization is available after local restore.
- Completed local document cards reuse the existing completion badge at top right.
- PDF navigation is a horizontal strip above the existing bottom controls, in
  both reading and writing. Opening retains page order and scrolls the current
  page into the first visible slot. The current border is blue; bookmarks are red.
  Bookmarks-only contains only bookmarked, nondeleted pages. Rendering is serial,
  virtualized to the viewport plus three slots, and cancelled/guarded on close or
  session change. No eager all-page thumbnail render or unbounded bitmap cache.
- Bookmarks use source hash (book ID fallback) and original page number, independent
  of ink and text. They survive reopen without mutating the source PDF.
- Vertical reading remains the default. Horizontal is a persistent global Reader
  preference. It retains original page nodes/identity and shows one page at a time;
  the source paper, SVG coordinates, source glyphs and zoom engine stay unchanged.
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
