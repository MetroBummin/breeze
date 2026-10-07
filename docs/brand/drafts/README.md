# Home and b icon review drafts

No new direction is selected. Compare Home with PR #124 head 37c4b992 in
home-before-after.png: the actual phone light/dark Home screens and enlarged
production wordmark CSS use the same source contour and original cursive r.
The normal Home size is 132px; light now uses a brighter neutral gray, and dark
retains the prior material. Reduced motion/transparency/contrast restores the
prior opaque ink without letter effects. Tablet captures are in ../../qa/breeze-wordmark/.

icon-two-directions.png compares neutral and restrained teal-to-blue b at
200px enlarged and actual 60/40/29/20 CSS pixels on light/dark backgrounds.
Each SVG uses the identical first b contour and both counters from
assets/brand/wordmark-mask.svg. The outgoing connected-letter segment is closed
at the b's right edge; no replacement font is used. Background, shape, optical
size, reflection stops and lighting match so only ink color changes.

These SVGs are static highlight mockups. They do not demonstrate Apple's
automatic Liquid Glass icon rendering. Production br app icon assets, welcome
colors, launch artwork and auth are untouched. Review files are under docs and
are excluded from the native www application bundle.

## b optical correction and br addition

The four-way comparison is icon-four-directions.png. b shifts 14px left within
its 512px tile (2.7%); its path, height, material and lighting are unchanged.
The heavier loop/stem on the right makes geometric bounds alone look off-center.
icon-b-optical-before-after.png shows the old and corrected b; its center guide
is review-only. The older icon-two-directions.png is historical, before correction.

br reuses the entire existing assets/brand/monogram.svg outline. Both marks have
361.2px letter height in a 512px tile; br naturally needs more horizontal space.
Each mark's neutral/flow variants have exactly matching paths and transforms.
All eight SVGs were decoded in a real Chromium browser, then checked visually at
210px enlarged and 60/40/29/20px. Home production CSS/assets are unchanged.
