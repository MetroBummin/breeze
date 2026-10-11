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

### Recovery and writing regression fixes

At the first review head `b508ca66c436ebf551ec01ef11037e8e3dfec262`, the
actual Chromium OCR suite reproduced the320×568 recovery failure:35.6px text
width,30px visible height,76px scroll height. The actual writing suite reproduced
44px outer writing height against48px reading height, both352px wide.

The narrow expanded recovery capsule now grows upward and gives the notice its
full width, while preserving the mode/Aa targets. Compact geometry remains
unchanged. Writing uses48px outer height with44px internal controls. The strict
OCR readability assertion and reading/writing geometry assertion are preserved.

[Light recovery](web-preview-320x568-pdf-recovery-light.png) and
[dark recovery](web-preview-320x568-pdf-recovery-dark.png) show the actual controlled
OCR recovery fixture at320×568. New `pdf-writing` light/dark images cover both
iPad orientations. All18 ordinary previews were regenerated against the final
CSS. These remain browser evidence; native retry taps and airplane mode remain
unverified. The local WebKit runtime is unavailable; exact-head CI must verify
that engine. Its known offline Blob failure remains an active gate.

### PDF two-button and scroll-collapse previews

Actual PDF reading now has separate `pdf-two-buttons` and `pdf-collapsed`
light/dark screenshots at390×844 and820×1180. The closed controls remain34px;
Back/sidebar and Aa are inert. Scroll reversal naturally restores48px controls.
The unchanged scroll owner and thresholds perform these transitions: the capture
never forces a chrome class, calls setReaderChrome, or seeks an animation.

[Phone scroll video](web-preview-iphone-pdf-scroll.mp4) (12.84s) and
[iPad scroll video](web-preview-ipad-pdf-scroll.mp4) (15.28s) are actual browser
recordings, including light and dark scroll-collapse/expand. Playwright recorded
WebM; system FFmpeg converted it to H264/yuv420p MP4 with faststart. No still-image
animation is synthesized. Synthetic PDF pages and Chromium touch emulation are
used; these do not establish native iOS safe-area or Pencil behavior. See
`pdf-motion-evidence.json` for actual scroll positions,48→34→48 heights and
control interactivity. The iPad preview is portrait; existing writing previews
cover both tablet orientations and writing policy is unchanged.

### Chromium trusted-touch CI investigation

The exact d1 review head failed the parked exclusion action in CI. Study UI,
swipe code and its touch test were unchanged from267. Local Chromium151 passed
the unmodified d1 suite, archived267 baseline, a CPU4x diagnostic run and the
new diagnostic suite. The target was the remove SVG path; the trusted action
reduced18 rows to17 and persisted the excluded ID. CI uses Chromium153, whose
normal download route is blocked here by403. These observations do not establish
that the CI failure is flaky or resolved. No product behavior was changed.

The touch test now records action rect, elementFromPoint, offset, exclusions and
capture/bubble pointer/click traces. On failure it saves touch-failure.json and a
screenshot before rethrowing the original error. A temporary deliberate failure
verified that evidence is preserved. Existing assertions and timeouts remain
unchanged. `study-touch-diagnosis.json` contains local evidence; exact-head CI
must still evaluate the original gate with the added diagnostics.

### Approved lighter controls for the next internal build268

Current captures were regenerated after the approved polish. Dock glass and study
header now share restrained border and shadow tokens in both themes. Outline
icons share20px boxes and1.8 stroke weight. The dock stays48px, study header44px,
compact Reader34px and writing controls44px; neutral study gradients and existing
interaction ownership remain. New `study-set` and `study-set-menu` screenshots
show phone and both iPad orientations, light/dark. This folder now has44 images
and two actual scroll videos; exact current video durations are in the manifest.
All shared material/geometry checks, trusted touch, study lifecycle, Wordbook,
Home, full PDF writing, full60-page OCR and npm test passed locally in Chromium.
`polish-validation.json` records evidence. Native coverage limits remain.

The user has now approved integrating the polished PR154 into the next internal
TestFlight candidate268. Earlier no-integration/no-upload wording describes the
initial review checkpoint. Historical267 and266 sources/contracts are preserved;
main and App Store submission remain outside scope. Parent owns one Cloud start.

### Integrity contract corrections before final268

The full PDF morph suite reproduced the stale22px offset assertion with an actual
24px center offset,96/48px targets and8px gaps at320px. The test now checks actual
free-space centering, approved sizes/gaps and bounded centered rows; compact,
non-overlap and all later functional/rotation assertions remain. Its complete
Chromium run passed. `pdf-slot-validation.json` records reading at320/390/650
and writing in eight viewports/both themes. Home's remaining selected-bookmark
override now shares20px/1.8 icons, retaining the original bookmark shape and
accessibility name. Updated Home and word presentation tests strictly verify
approved48px geometry and lighter control edges while protecting Lookup's
unchanged background/blur/edge/shadow treatment.

Correction: npm test was initially reported before checking its failed exit code
at107. Its stale structural-token guard is corrected; the final full run and
all targeted runs are now confirmed exit0, recorded in polish-validation.json.
These corrections require a new pinned UI source and a superseding268 candidate;
13b3495 is not the final upload source. Exact final Integrity/WebKit CI remains
required. No candidate Cloud start has occurred.
