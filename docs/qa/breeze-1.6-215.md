# Breeze 1.6 (215 target): capsule transition backdrop

Home/Reader navigation transferred the live pill's 19px backdrop filter to the
browser-generated rectangular `reader-control` group. The rounded image-pair
clipped only the child, leaving a separate rectangular filtered backdrop.
Suppress that group filter with important declarations to override generated
keyframes. Live glass, intrinsic title, rounded capsule contents, soft shadow,
480/440ms durations and reduced-motion fallback retain their existing behavior.
Do not clip the entire group: that would trim the approved outer shadow.

Regression evidence: removing the fix makes the new browser test fail because
the animated group still computes `blur(19px) saturate(1.22)`. With the fix,
Chromium and WebKit pass both directions in both themes at 320x740, 390x844,
768x1024, 1440x900 and 390x480. Chromium additionally compares painted corners
with the underlying scene and the original duplicated filter at the same frozen
frame. Fixed corners show less rectangular contamination, while settled controls
remain visible and transition state cleans up. The test runs in `test:home-ui`.

Local validation: npm test, test:home-ui, Reader chrome motion/interruption suite,
npm run ios:sync and git diff --check. Before/after screenshots and complete logs
are under `/workspace/shared/breeze-215` in the task workspace.

Linux WebKit's named capsule snapshot can disappear in automation in both the
baseline and fixed captures. Computed styles and settled Reader/Home state pass,
but these checks do not verify a physical iPhone or establish on-device frame
pacing. A physical device is unavailable in this environment.

App and Share Extension project build numbers are 215; marketing version is 1.6.
Xcode Cloud uses its own counter, so 215 is expected after the previous successful
archive targeted at 214, not independently confirmed from TestFlight. Archive
success, TestFlight processing and App Store review submission are separate
states. GitHub can report the archive; this environment has no App Store Connect
submission tool or Apple API credentials. No App Store submission is claimed.
