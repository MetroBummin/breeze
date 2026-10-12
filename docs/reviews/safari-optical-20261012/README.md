# Safari optical controls review (Draft)

Baseline: `044f9ffdf610815c8d88b5ca8c816169e2815d01`, Breeze1.9.3(268).
Separate branch: `ui/safari-optical-controls-268`. No merge, archive, upload or
version change is requested. Existing268 integration/main remain preserved.

## Public guidance and measured product requirements

[Apple Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)
provides the44×44pt touch principle; [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)
describes logical grouping. [SF Symbols](https://developer.apple.com/sf-symbols/)
has nine weights/three scales and optical alignment; this does not specify a
Safari chevron's SVG frame, stroke or capsule width. [WWDC25 design system](https://developer.apple.com/videos/play/wwdc2025/356/)
and [Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)
describe adaptive system surfaces. This web implementation does not establish
native lensing/contrast equivalence.

Parent inspected private946×2048 references and reported: near-equal row height/
bottom position around y1850–1966; paired group232px Breeze versus200px Safari;
bright back ink15×27px versus27×47px; mode lines4/33px versus3/43px. Those are
**raster measurements**, not CSS units, device scale or public Apple specs.
The source CSS viewport/device DPR of the references is not established here.
Using the116px raster height only as a relative normalization to our48px row
gives an approximate83px pair goal, which is narrower than two44px targets.
The reviewed compromise is88px. Do not put literal200px into CSS or overlap
hit regions to mimic that raster.

| Item |268 baseline|Review proposal|
|---|---|---|
| Shared row height/bottom |48px / max(8px,safe area)|unchanged|
| Two-button PDF/EPUB group |96px|88px|
| Individual paired targets |48×48px|44×48px, independent|
| Central pill width |remaining row interval|gains8px|
| Back SVG frame/stroke |20px /1.8|32px /2.1, rounded|
| Text-mode SVG frame/stroke |21px /1.7|24px /2.1, three paragraph lines|
| Header/writing hit targets |44px|unchanged|
| Material, gesture/storage ownership |268|unchanged|

SVG frames are not painted glyph bounds. The proposed chevron's nominal ink is
about11×19 CSSpx; the paragraph's maximum nominal ink width is about18px. These
are implementation measurements, not Safari specifications or a fidelity verdict.
Two portrait references have different content/theme backgrounds, so no glass
opacity inference was made. Material computed values are compared on identical
own-source fixtures instead.

## Reference access and visual review

Consumer Library preparation resolved all three files, but the supported current
transfer helper failed every file with `download failed` and exit1 in three
authorized batches. No local reference PNG was created, and Library image reads
returned asset references/descriptions without inspectable pixels. No private
reference image, identifier or transfer URL is included in this repository.
Parent owns direct original comparison. The consumer inspects actual own-browser
before/after renders and makes no claim of complete Safari/native equivalence.

## Validation and evidence

Baseline files are served from an archive of the exact268 commit. After files
are rendered from the review source. Each comparison retains viewport, DPR2,
fixture, theme and capability setup. Tablet writing availability is a controlled
capability fixture, not physical iPad proof. Real browser pressed pointer input
and trusted touchscreen input are separate checks.

The paired matrix covers six viewports/both themes, PDF reading/collapse/writing,
44px independent hit owners, actual touch near both target edges,34px compact
controls, repeated portrait/landscape rotation, and Chrome's actual emulated
`env(safe-area-inset-bottom:34px)`. Native safe-area/device input remain unverified.
Twelve reading pairs measured identical material strings, unchanged48px height/
bottom and exactly8px more pill width. Full Chromium npm/type contracts, PDF
morph/rotation/navigation/bookmarks/deletion/writing, motion/interruption/reversal/
reduced-motion and shared geometry passed. Study trusted touch, simple-word cards and Reader notice hit targets also passed.
Exact Draft CI is pending; no release readiness is implied. The immutable268
release checker is preserved and can reject this unapproved review tree; it is
not disabled or rewritten to declare the changed UI an approved268 release.

Files under `before/` and `after/` are generated own-source screenshots only.
The manifest records source/capture hashes and measured geometry. Historical268
and earlier release receipts/checkers stay intact; this is an optical review,
not a replacement268 TestFlight candidate.
