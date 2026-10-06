# Breeze 1.8.1 combined release

## Approved scope

On October 7 KST the user chose the original production light lookup effect,
discarded all proposed light palette/motion changes, and authorized one combined
merge and Cloud build. App Review submission waits for device QA.

The integration extends #118 (ecebd1fd) and incorporates #119 (9cf6766e) on
main b631eb5c. Merge this combined branch once; do not merge the components
separately or manually trigger a second Xcode Cloud run.

- Sentence pending uses word lookup's exact original wash, blue/white gradient,
  1.65-second motion and reduced-motion fallback. No bottom loading control.
- Sentence error uses the shared word mini-pill, one retry icon and no chevron.
  Whole-sentence placement prefers entirely below, otherwise entirely above;
  only a sentence that prevents both placements uses viewport clamping.
- Existing success translation, source ownership, cancellation, scroll-idle
  lifecycle and no-forced-scroll behavior remain covered across Text/PDF/EPUB.
- Home heading chevrons no longer carry the shared downward one-pixel offset.
- RSS retains supplied article bodies and permits recovery from transient
  selected-item failures. Restricted/paywalled content still fails closed.
  This does not establish the cause of the user's unspecified Medium failure
  or guarantee that every external article can be fetched.

No server/config/quota/auth/Android release setting changes are included.

## Release version and verification

App and Share Extension Debug/Release marketing versions are 1.8.1. The checked-in
build236 baseline remains intentional: ci_post_clone applies Apple's actual
CI_BUILD_NUMBER to all four configurations. Expected246 is not a forced value.

Before merge, require the final combined head's full npm/Integrity, both-engine
sentence and original-appearance parity, heading, RSS selected-body recovery,
word retry, PDF regressions and Android build checks. Run both native asset
syncs locally and verify the synchronized source bytes. Earlier component green
checks are supporting evidence, not a substitute for combined checks.

After the one merge, verify main's tree matches the tested tree and observe the
exact commit's Xcode Cloud workflow/archive result. Confirm its actual numeric
build and Apple processing/TestFlight availability separately. A GitHub success
alone does not prove the build is available to install.

## Device QA gate

Browser proof is not physical iOS/WebView validation. Install the resulting
1.8.1 build and check sentence loading/error/retry placement, navigation/cancel,
PDF ongoing scroll and native touch/stylus behavior, and previously failing
RSS items. App Review submission remains on hold until the user completes QA.
