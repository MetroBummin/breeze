# Breeze Dark01 brand — screenshot draft

**Provisional letterform:** 07:56 user feedback requests a less hooked, readable
`r`. That geometry awaits the design comparison and user review. Both themes now
use identical Dark01 ink; the earlier darkened WHITE preview is superseded.

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
  light/dark and reduced motion: exact proportions, no overflow, cold startup
  removes splash without a new delay. Forty real browser captures.
- Asset-catalog JSON and storyboard XML parse; 1024px icon and all 1x/2x/3x
  native wordmark dimensions verified. Dark logo contrast exceeds 10:1; the exact
  requested pale WHITE ink is decorative logo artwork, not instructional text.
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
