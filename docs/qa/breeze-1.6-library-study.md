# Breeze 1.6 verification — 2026-09-30

Base: `65b2bc3` (PR #53). Scope and storage semantics are recorded in
[012-library-study](../decisions/012-library-study.md).

## Passed

- `npm test`: existing unit, lifecycle, integrity, storage, structure, geometry,
  quota and typecheck suite. Typecheck reports 34 existing diagnostics versus the
  unchanged 37-diagnostic baseline; no file's baseline increased.
- `node tests/verify-breeze16-browser.mjs`: Chromium and WebKit, persistent local
  profiles, real PDF.js/IndexedDB. 120-page PDF with bounded thumbnail DOM,
  current-page opening, bookmarks/all filtering and empty state; direction changes,
  finger swipe versus Pencil/cancel, ink-coordinate preservation; no false
  completion at an intermediate horizontal page's bottom; 320/390/507/650/820/1180px
  writing controls within all four viewport edges, plus 320px horizontal reading.
  Confirmed page deletion hides only that source page and removes its text while
  retaining the neighboring page; reload preserves deletion, bookmarks and settings.
  A simulated book transaction failure preserves the previous document.
  Folder rename/assignment/reload/removal retains the book. Actual Alice EPUB
  import checks adaptive margins, bottom mode access, star CSS and text font size.
  Completed cards display the existing badge. No browser page errors.
- `npm run test:pdf-ink`: 43 unit regressions plus Chromium/WebKit synthetic stylus
  regressions for pen/highlighter, eraser fragments, Undo/Redo, eviction, save/reload,
  failure/retry, document isolation and finger/Pencil ownership. Highlighter pixel
  checks retain dark ink and avoid overlap seams. The reload check now explicitly
  waits for the existing serialized redo transaction's saved status.
- `npm run test:pdf-pinch`: interruption suite in both engines; 120 pages × 12
  cycles at Chromium widths 390/768/1180 and WebKit width 390. Tests now expand the
  PDF page indicator, which replaces the title while viewing original PDFs.
  Expanded settings use `touch-action:pan-y` to prevent native browser pinch there.
- `npm run test:home-ui`: both-engine Home resume, shared material at five sizes
  and both themes, library refresh, reading progress, Wordbook and lookup-work
  regression suites.
- `npm run www` and `git diff --check`.

Visual inspection used synthetic document screenshots at 320px and 820px.
The strip stays above the measured writing bar; tools stay above the viewport
bottom. No user documents were included in fixtures.

## Not established by these checks

Physical iPad/WKWebView Pencil admission, palm rejection, inertia, real multitasking
resize and latency need device testing before release. Browser synthetic input,
build success and source inspection are not that evidence. No native archive,
installation, TestFlight upload, merge or deployment was performed.

Page deletion is an app-local edited view with regenerated Text content. Original
PDF bytes and ink keyed by original page number are retained. Exporting a rewritten
PDF and cross-device synchronization of the new preferences/categories/bookmarks
are outside this change.
