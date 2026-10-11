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

## Tablet

- [Light directory](web-preview-tablet-list-light.png)
- [Light detail](web-preview-tablet-detail-light.png)
- [Dark directory](web-preview-tablet-list-dark.png)
- [Dark detail](web-preview-tablet-detail-dark.png)

## Verification limits

62 unit/storage/UI tests and the existing Chromium lifecycle suite passed.
The trusted-touch suite passed finger-follow, capture transfer, cancellation,
park/deep swipe, Undo after removal settles, examples, long press, rename,
source addition, persistence and ten light/dark layouts. It checks native browser
vertical scrolling independently to avoid inertia contaminating subsequent taps.
Immediate taps during exit animation and actual iOS interaction remain outside
this evidence. No Reader/PDF/rotation code was changed.

`breeze-study-touch-before.json` reproduces the capture-transfer failure on the
full original 266 source. `breeze-study-touch-after.json` records finger-follow
after the fix. `touch-verification.json` contains the trusted event trace.
`manifest.json` records the screenshot checksums.

Library upload failed before prepare/transfer (hosted-apps tool discovery network
error), including one retry; no Library IDs were created. These repository
artifacts are the supported persisted fallback for cross-environment retrieval.
