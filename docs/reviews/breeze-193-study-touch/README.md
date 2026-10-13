# Study set touch follow-up review

These are actual web screenshots captured with Chromium touchscreen emulation.
They are **WEB PREVIEWS, not native iOS screenshots**. Source build stays 266;
this branch has not been uploaded or merged into the release integration.

## Phone interactions

- [Directory, equal row gaps and circular close](web-preview-phone-list-light.png)
- [Long press management](web-preview-phone-long-press-actions-light.png)
- [Row follows the finger](web-preview-phone-swipe-moving-light.png)
- [Parked exclusion action](web-preview-phone-swipe-parked-light.png)
- [Exclusion with Undo](web-preview-phone-exclusion-undo-light.png)
- [Add more books](web-preview-phone-add-books-light.png)
- [Full page detail](web-preview-phone-detail-light.png)
- [Dark directory](web-preview-phone-list-dark.png)
- [Dark detail](web-preview-phone-detail-dark.png)

## Updated management and source selection

- [Phone dark management](web-preview-phone-long-press-actions-dark.png)
- [Phone dark circular checkboxes](web-preview-phone-add-books-dark.png)
- [Tablet light management](web-preview-tablet-long-press-actions-light.png)
- [Tablet dark management](web-preview-tablet-long-press-actions-dark.png)
- [Tablet light circular checkboxes](web-preview-tablet-add-books-light.png)
- [Tablet dark circular checkboxes](web-preview-tablet-add-books-dark.png)

The menu uses thin separators and hides the excluded-word count. Import has
moved to the detail footer; its screenshot has one pending word. Excluded
identities are still preserved and cannot be imported again.

## Tablet

- [Light directory](web-preview-tablet-list-light.png)
- [Light detail](web-preview-tablet-detail-light.png)
- [Dark directory](web-preview-tablet-list-dark.png)
- [Dark detail](web-preview-tablet-detail-dark.png)

## Verification limits

65 unit/storage/UI tests and the existing Chromium lifecycle suite passed.
The trusted-touch suite passed finger-follow, capture transfer, cancellation,
park/deep swipe, immediate Undo, touch held through collapse, canceled/moved
Undo, examples, long press, rename, source addition, direct and repeated imports,
persistence and ten light/dark layouts. It checks native browser
vertical scrolling independently to avoid inertia contaminating subsequent taps.
Actual iOS interaction remains outside this evidence. Undo is shown at commit
and owns its touch release directly; collapse keeps its active target intact. No Reader/PDF/rotation code was changed.

`breeze-study-touch-before.json` reproduces the capture-transfer failure on the
full original 266 source. `breeze-study-touch-after.json` records finger-follow
after the fix. `touch-verification.json` contains the trusted event trace.
`immediate-undo-before.txt` reproduces missing Undo during animation on the
previous 70aad77 follow-up. `manifest.json` records screenshot checksums and
the captured source hashes.

Before the additional requested visual refinements, the touch-only Undo fix
left 12 of 13 screenshots pixel-identical; the remaining screenshot had six
background glyph pixels of rasterization noise, with unchanged layout. The
current screenshots include the requested checkbox/menu/import changes.

Library upload failed before prepare/transfer (hosted-apps tool discovery network
error), including one retry; no Library IDs were created. These repository
artifacts are the supported persisted fallback for cross-environment retrieval.

## CI and release gate

At 70aad77, Vocabulary study sets CI passed (including Chromium and WebKit),
and Social auth's unsigned Simulator compile passed. Design, Social browser
and Integrity contracts reject the new follow-up at the unchanged historical
266 integration boundary. These are release approval/source-contract failures,
not proof of a new native compilation error. The gate is preserved and must
be explicitly reconciled with a reviewed future release candidate. Feature
tests do not satisfy that gate. No archive, upload, version bump or merge has
been performed for this follow-up.
