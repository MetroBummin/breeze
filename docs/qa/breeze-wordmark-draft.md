# Home neutral gray refinement — review draft

Compared with PR #124 head 37c4b992. Light Home is brighter neutral gray with
subtle alpha and thin reflections inside the unchanged letter contours; no
drop shadow, plate or blur. Dark Home retains its appearance. Opaque reduced
transparency/motion/contrast fallback retains the original stronger ink.
Phone/iPad actual screens and enlarged exact CSS rendering are in
docs/brand/drafts/home-before-after.png. Both icon directions share the original
wordmark b contour, two counters, scale and light source; 60/40/29/20px examples
are in icon-two-directions.png. These are static SVG mockups, not iOS automatic
Liquid Glass previews; no shipped icon assets are replaced. No design selected.

The full local npm test passed (existing typecheck baseline unchanged).
The existing Chromium guided onboarding suite also passed word/sentence,
keyboard alternative, interruption/reopening, Back, Skip, completion, cancellation,
storage isolation and responsive themes.
Local Chromium brand checks passed all ten light/dark layouts (390/820/1440/320
and short landscape), cold launch, proportions, overflow, motion, contrast and
actual CDP reduced-transparency emulation. Real native icon installation,
physical-device accessibility appearance and local WebKit are unverified.
First-entry colors, auth PR #122 head 0e6ed20, extraction and release remain
untouched. PR #124 stays draft. PR #122 advanced during review; its exact 0e6ed20 head was integrated into
the brand branch to resolve the generated service-worker version conflict.
Auth source and native policy match that base exactly. The auth branch itself
is unchanged. New exact-head CI evidence will be recorded after push; historical
evidence below belongs to earlier heads.

---

## Earlier brand draft evidence

Final reviewed direction: original cursive r (08:15), WHITE palette B (08:48),
and monochrome Home with letter-only Liquid Glass highlights/shallow depth.
WHITE stops are #63acb5 at 0%, #699bbc at 80%/100%; Dark01 stops stay unchanged.
Start/Next uses the shared control-glass material; tutorial interactions stay
minimal. There is no wordmark plate, backdrop blur or animation. The historical
palette comparison is in `white-palette-variants/library-images.json`.

The original `26266e8` CI attempt passed onboarding/branding on Chromium and
WebKit, sentence responsive on both engines and Integrity contract/diagnostic
jobs. Sentence inline WebKit failed because its synthetic pointerup was sent
to a detached PDF canvas after repaint. The test now releases on the current
hit-tested surface when its old target has detached, preserving the assertion
that the document gesture owner receives release. Reader production code is
unchanged. Forced synthetic-pointer TXT/PDF/EPUB checks pass locally in Chromium;
actual WebKit verification passed on `d21f233` (sentence inline run 37593967303,
both engines, all 16 job steps). Subsequent visual styling does not change it.

**Letterform approved at 08:15:** keep the original cursive `r`. No plain-r
alternative is implemented. Selected B is applied to WHITE onboarding/splash
and the static native WHITE wordmark. Dark artwork and br icon ink are unchanged.

Stacked on guided onboarding/auth PR #122 (`04056222`). Base main remains
`c649047d`. No merge, deployment, release build or App Review submission.

The actual approved source board was inspected after authorized local download.
Library pixel reading was unavailable and its signed transfer download failed;
the supported authorized file-download tool successfully materialized the exact
backing image. This is resolved, not an outstanding brand access blocker.

Changes: source-traced connected wordmark in light/dark, `br` app icon, welcome
and completion wordmark, Home header, static web boot and iOS LaunchScreen.
Home content, navigation, Reader operations and authentication are unchanged.
Demo interaction words remain real selectable text, not a logo image.

Local validation passed:

- Full `npm test`.
- `npm run typecheck`: existing 34 findings, no increase.
- Existing `test:onboarding`: interruption/reopening, Back, Skip, both successful
  endings, keyboard alternative, cancellation, returning data and storage isolation.
- Brand browser checks at 390×844, 820×1180, 1440×900, 320×568 and 844×390 in
  light/dark: exact proportions, no overflow, cold startup removes splash without
  a new delay, no wordmark plate/blur, neutral opaque Home ink. Reduced motion and
  increased contrast remove letter material effects; Chromium additionally uses
  actual CDP media emulation for reduced transparency, including opaque CTA and
  static logo captures. WebKit transparency preference cannot be emulated through
  the public Playwright API; its shared motion/contrast fallback is checked.
- Asset-catalog JSON and storyboard XML parse; 1024px icon and all 1x/2x/3x
  native wordmark dimensions verified. Dark logo base contrast exceeds 10:1;
  selected WHITE B base endpoints are 2.52/2.91 on #FBFCFC, decorative logo ink.
  Shared-token reflections are confined to contours; reduced settings remove
  them. Home base ink is #1C1C1E / #F2F2F7, readable on existing Home paper.
  The surrounding Korean instructions retain their readable ink. Logo text is accessible
  by the Breeze name, not color or animation.

Phone/iPad screenshots in this folder are actual Chromium renderings. Files
named `splash-preview` deliberately hold JavaScript delivery to show the actual
web boot surface; **they are not native execution evidence**. Native LaunchScreen,
installed icon, cold launch on device and native appearance switching require a
later approved native run. This environment has no Xcode or Simulator, and this
stacked draft deliberately skips iOS/Android build jobs. Normal main-targeting
PRs retain those jobs. Browser CI still runs Chromium and WebKit.

The existing official Apple/Google button-artwork blocker is separate and remains:
no substitute marks, provider credentials or security settings were introduced.
Live auth/provider consent and account persistence on a physical device remain
outside this visual draft's evidence.

Screenshots were uploaded as individual native Library image files (dark version
0; corrected WHITE version 1).
See `library-screenshots.json` for persistent IDs and backing IDs. CI status should
be read for this draft's exact head; PR #122's previous green run is not proof
of this branch.

## Subsequent icon draft and WebKit fixture review

Added original br in neutral/flow colors and shifted b 14px left at 512px.
Four-way and optical before/after boards are in docs/brand/drafts. No installed
icon, Home CSS, welcome artwork, auth source or provider settings change.

At ae556a6, both Chromium and WebKit passed guided onboarding and Home branding;
sentence inline/responsive passed. Guided WebKit then failed in the social-login
fixture when a mocked background words POST reported a CORS error during its reload
scenario. Navigation interrupting that request is the current diagnosis. Auth source matches the already reviewed 0e6ed20 base.
The fixture now awaits the existing remoteSyncPromise before navigation and after
restored startup, retaining all callback, persisted-user and page-error assertions.
This avoids interrupting the real startup sync owner; no response/security policy
or production auth behavior is changed. New exact-head CI will verify the diagnosis.
