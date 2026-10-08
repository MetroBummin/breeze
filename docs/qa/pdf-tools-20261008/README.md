# PDF tool screenshots — 2026-10-08

Captured from production Reader code at `98fa83fd9fbfb420ac9abce295fa86f1327409f6`,
using Chromium, an 820×1180 tablet viewport and mocked native-iPad eligibility.
These are real browser-rendered Reader screenshots, not physical iPad photos.
The PDF is `tests/helpers/pdf-geometry-fixture.mjs`: generated test text only.
There are no personal documents, account details, credentials or private data.

- [Light comparison](comparison-light.png)
- [Dark comparison](comparison-dark.png)

The comparison PNGs are browser captures of the accompanying comparison HTML,
which displays the six original screenshots unchanged. No generated design or
image retouching is used. Each original reading/pen/highlighter screenshot is
included here at its full 820×1180 resolution.

Browser assertions measured identical expanded pill geometry for reading, pen
and highlighter in both themes: width 400px, height 44px, padding 4px 9px,
corner radius 24px. Writing buttons measure 44×44px. Active writing tools have
transparent backgrounds, no selection shadow, brand-colored icons and 2px
short underlines. The circular color-chip selection ring is a separate control.

The pen and highlighter each offer six fixed color chips, with no custom picker.
All chips remain reachable through horizontal scrolling; the selected chip is
revealed when settings reopen. The real PDF/IndexedDB browser suite checks new
colors, independent remembered tool colors, reload, unchanged existing stroke
colors, light/dark responsive layouts, pen/palm/pinch, erasure and history.
PDF content stays at its original colors in both themes.

Validation for the captured code:
- [PDF Chromium/WebKit CI](https://github.com/MetroBummin/breeze/actions/runs/37717171760)
- [Android tests, lint and builds](https://github.com/MetroBummin/breeze/actions/runs/37717171781)

Library search did not find these six filenames. One requested retry of the
official Library upload helper failed during connection discovery, before file
preparation/finalization. No successful Library ID is claimed and no alternate
API combination was used. These repository copies provide the delivery path.
