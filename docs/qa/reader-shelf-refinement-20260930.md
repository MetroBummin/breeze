# Reader and shelf refinement — 2026-09-30

Base: `abe5033` (1.6 build 200). Changes are in the working checkout.

## Behavior and design

- Reading retains the book title. PDF page navigation is available in both original reading and writing,
  using an upper-left count pill and a vertical floating panel. Thumbnail bookmarks are
  outline/filled ribbons at the upper left.
- Reader settings use an opaque neutral surface. Font, margin and theme occupy
  short rows; star visibility and color share one row. Targets remain 44px.
- Shelf categories sit below the heading and align with the cards. Inbox is a
  computed unassigned filter. File and pasted/URL additions capture their category
  when started; existing imports retain their assignments.
- Add/Edit dialogs now use native `open` as the only visibility state. Removed
  legacy `.on`, delayed visibility and pointer gating, including dependent
  refresh/notification selectors and resume cancellation observers.

## Root-cause boundary: reported freeze

The user reports a freeze on cold launch after opening Add, with scrim dismissal
failing and the screen unusable after X. The connected iPad installation was read
back as 1.6 (200). The original cold-start browser sequence did not reproduce
this failure. The duplicated native-open/custom-class ownership was observed in
source and removed, but it is NOT a proven cause of the physical-device freeze.
No physical-device resolution claim is made.

The dismissal regression taps scrim/X/Escape and then actual Home/Settings
controls, both from launch and after returning from PDF writing. Chromium and
WebKit pass. Persistent WebKit contexts are necessary for the local PDF Blob
fixture; an ephemeral context lost its source and was a harness limitation.

## Validation

The page pill now morphs into the upper-left navigation panel on the same
surface. Collapsed reader chrome hides the page control completely, including
pointer interaction; it does not shrink to a smaller pill. The browser suite
asserts this visibility change and the expanded panel geometry.

The navigation header uses a bookmark ribbon and X for filtering/closing, with
44px targets and accessible labels. Horizontal PDF reading no longer inherits
the vertical document's 45vh trailing padding. A short page is centered in
the available viewport height. The browser suite checks that the computed
bottom padding is zero after switching to horizontal.

The page X now uses the same `task-close` circle and SVG as other task surfaces.
Its pill exits upward with the Reader's Aa/back buttons when chrome collapses.
The extra previous/next buttons in the navigation panel were removed. Horizontal
PDF page turns use left/right arrow keys on desktop and the existing touch swipe;
the browser suite checks both arrow directions. Switching to horizontal briefly
explains those controls.

Shelf and Edit category choices now use the same Breeze menu instead of a native
select popup. The hidden select retains the assignment value read by Edit save.
The visible menu supports Escape and outside dismissal. Wordbook star filters
share the lookup/Reader `stbtn` visual rules and keep pressed/selected state in
sync. Their tests cover category selection, edit menu, light/dark responsive
layouts and filter behavior.

Reader word-color settings now expose only three independent star visibility
buttons, sharing the lookup panel's star styling. Color pickers are removed;
existing saved colors are preserved. Browser assertions cover independent
visibility toggling and unchanged saved colors and vocabulary.

- `npm test`: passed. An intermediate Node process exited with SIGSEGV after
  printing its success output; the isolated check and full rerun passed.
- `npm run test:home-ui`: passed.
- `npm run test:design-tone`: Chromium/WebKit, light/dark, phone/tablet/desktop
  and short viewports passed, with compact/opaque Reader settings assertions.
- `node tests/verify-dialog-dismiss-browser.mjs`: passed in both engines.
- `node tests/verify-category-import-browser.mjs`: passed in both engines;
  file/paste categorization, Inbox, duplicate preservation, delete and reload.
- `node tests/verify-onboarding-browser.mjs`: passed.
- `npm run test:pdf-ink`: passed (synthetic gesture evidence).
- PDF pinch interruption and pinch browser suites: passed.
- The 1.6 browser suite passed in both engines with light/dark at 320, 390,
  507, 650, 820, 1180 and 1440px plus 844x390. It verifies reading titles, reading/writing page entry,
  upper-left placement, vertical scroll and outside dismissal, bounded thumbnails, bookmark durability and original
  page/ink preservation. Resize scenarios wait for the existing geometry and
  anchor restoration before sending the next gesture.

Evidence: `/Users/kosangbum/Desktop/breeze/audits/reader-shelf-refinement-20260930`.
Physical touch/Pencil and the reported cold-launch freeze still require on-device
verification; browser screenshots and tests do not establish that result.
