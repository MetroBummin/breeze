# Header icon consistency review

Only real cropped Chromium header screenshots are included, with the same
fixture title in light and dark. These are web previews, not native iOS images.

- [Light header crop](web-preview-phone-header-light.png)
- [Dark header crop](web-preview-phone-header-dark.png)

Both icons are SVGs, not font glyphs. The former ellipsis used nearly zero-length
strokes and appeared lighter than the chevron. It now uses filled round dots
with optical weight matched to the rounded chevron. Both use a centered 20px
SVG grid; the chevron's path is centered instead of shifted left. The 44px
circles, theme materials, button positions and shared-surface morph remain.

The capture test checks icon geometry, centering, shared ink and rounded stroke
settings in phone/tablet light/dark, alongside existing touch, theme-switch,
morph, Back/focus, swipe, Undo and persistence checks across ten layouts.
The manifest records source and crop hashes. No full-screen image is included.
No version change, build, upload or merge is performed.

Validation: 65 study model/storage/UI tests, type checks, Chromium lifecycle
and trusted touchscreen checks pass.
