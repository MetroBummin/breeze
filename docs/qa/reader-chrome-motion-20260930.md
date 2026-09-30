# Reader chrome motion — 2026-09-30

Base: main `850ac91cf0558a7e2b99ec9e3a36e642f84c2423` (1.6, source build 202).
The user approved retaining the expanded PDF pill's 22px right offset and
returning to viewport center on collapse, with smoother motion. Source build
203 is prepared for the next archive; App Store Connect numbering has not been
queried from this environment.

## Changes

- Translation, width, height, padding and radius share the same 260ms easing.
  The PDF reading variant no longer overrides shape transitions to 380ms.
- Resolve narrow-layout width caps in the endpoint width expressions. A
  max-width clamp can otherwise hold the visible width still while translation
  has already started.
- The ink entry fades while its layout slot shrinks instead of immediately
  switching to display:none. Collapse makes it inert immediately and transfers
  focus to the reading title when needed. Visibility changes after the motion.
- Responsive geometry supplies the expanded offset independently of the
  collapsed state. CSS retargets interrupted transitions from the current
  presentation; no timer, spring queue or per-frame JavaScript layout writer is
  added. Writing stays expanded; reduced motion applies geometry immediately.
- Update the shared-control decision, design contract, cache hashes and service
  worker version. Home/Memory geometry and the existing glass material are kept.

## Validation

- `npm test`: passed, including typechecking against the existing baseline.
- `npm run test:home-ui`: passed, including Chromium/WebKit Home navigation and
  lookup checks and shared geometry across five sizes in both themes.
- `npm run test:design-tone`: passed in Chromium and WebKit.
- `tests/verify-breeze16-browser.mjs`: passed in both engines, including PDF
  rotation anchors, page navigation, bookmarks, deletion, directions, responsive
  tools and settings.
- `tests/verify-reader-chrome-motion-browser.mjs`: passed in both engines.
  Samples intermediate position/size, checks width/height/translation timing,
  no overshoot, interruption continuity, input gating, writing and reduced motion.
  Covers 320, 390, 507, 650, 820, 1440 and short 844×390 viewports in both themes.
- `npm run ios:sync`: passed; the same command is used by the existing Xcode
  Cloud post-clone script to prepare the Capacitor bundle.
- `git diff --check`: passed.

Local screenshots: `/tmp/breeze-reader-chrome-motion/` and `/tmp/breeze16-qa/`.
Local Chromium uses the installed system browser. WebKit uses Playwright's
WebKit 26.6 bundle with runtime libraries extracted into the workspace. Browser
checks do not establish physical iPhone frame rate or native archive success.

## Xcode Cloud handoff

`ios/App/ci_scripts/ci_post_clone.sh` already installs Node 22 when needed, runs
`npm ci`, and prepares the web/native bundle with `npm run ios:sync`. The GitHub
Xcode Cloud integration is installed. At the base commit its check suite was
queued with zero actual check runs; this does not establish an enabled Archive
workflow or TestFlight post-action. Main publication should be followed by a
check for an actual Xcode Cloud run. Workflow configuration and successful
archive/upload must be confirmed in App Store Connect; no such completion is
claimed by these local checks.
