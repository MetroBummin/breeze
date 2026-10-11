# Safari-proportion dock review

These are actual Chromium app renders at iPhone390×844, iPad820×1180 and
1180×820 viewport sizes, DPR2, with synthetic book/vocabulary fixtures. They
are browser previews, not Simulator or physical-device screenshots. Their
safe-area env is0; native home-indicator clearance is specified by CSS and
requires device confirmation. User reference photos are not published.

| Viewport | Home | Wordbook | Reader |
|---|---|---|---|
| iPhone | [Home](web-preview-iphone-home-light.png) | [Wordbook](web-preview-iphone-wordbook-light.png) | [Reader](web-preview-iphone-reader-light.png) |
| iPad portrait | [Home](web-preview-ipad-portrait-home-light.png) | [Wordbook](web-preview-ipad-portrait-wordbook-light.png) | [Reader](web-preview-ipad-portrait-reader-light.png) |
| iPad landscape | [Home](web-preview-ipad-landscape-home-light.png) | [Wordbook](web-preview-ipad-landscape-wordbook-light.png) | [Reader](web-preview-ipad-landscape-reader-light.png) |

Matching dark screenshots are included with `-dark.png` filenames.

The reference measurements are screenshot pixels, not CSS pixels. Normalized
by946px image width, Safari has approximately8.6% outer margins,12.5% circle
width,54.1% capsule width and1.8–1.9% gaps. The new390px layout has8.5% margins,
12.3% circles,54.3% capsule and2.1% gaps. This preserves the reference balance
without assuming a screenshot-to-CSS scale.

| CSS measurement | Previous267,390px | New390px | Previous267,820px | New820px |
|---|---:|---:|---:|---:|
| Outer margin | 14 | 33.16 | 22 | 154 |
| Side circle | 42×42 | 48×48 | 42×42 | 48×48 |
| Center capsule | 218.4×44 | 211.69×48 | 400×44 | 400×48 |
| Circle/capsule gap | 29.8 | 8 | 146 | 8 |
| Overall row width | 362 | 323.69 | 776 | 512 |

Home, Wordbook and expanded text Reader share identical geometry. The row is
83vw capped at512px; unlike the old layout, iPad controls form a centered group.
Bottom placement changes from safe-area+15px to max(8px,safe-area). At a native
34px safe area, the row center moves12px lower; browser previews have no device
home indicator. Desktop still retains8px bottom breathing room.

PDF/EPUB uses a96px two-button navigation capsule and preserves8px gaps to the
central capsule and Aa. Its sidebar still expands to the readmain edge. Compact
Reader retains34px height and inert hidden side controls. Tablet writing retains
44px targets and horizontal scrolling. Capability classification is a controlled
bridge fixture for the writing check, not actual iPad/Pencil evidence.

Validation: full npm test, type checks, Home/Wordbook/Reader parity at five sizes
in both themes, wordbook functions, PDF sidebar motion and PDF/EPUB body gestures
pass. The new capture check covers phone, both iPad orientations, narrow and
desktop in both themes, compact controls, PDF geometry/sidebar edges and writing
policy. Source/capture hashes and before/after measurements are in the manifest
and geometry JSON files. No version change, native build, upload or merge.

This is a separate UI review branch on top of the immutable267 candidate. The
267 release boundary intentionally rejects this later source; its gate and
receipt are preserved and require a separately approved release integration.
