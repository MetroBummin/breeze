# Next 1.9.3 iOS and Android internal candidate

The owner authorized finishing the previously presented vocabulary test/study
swipe work, CSV export recovery, merge, the next iOS build for review, and the
latest Android internal test. This supersedes PR160's earlier review-only draft
restriction; its video remains review evidence, not physical-device acceptance.
The existing disabled AI grading gates remain false. No SQL proposal is applied,
no Edge Function is deployed, and no paid grading call is made.

Source owners on main `5f8b178`:
- PR160 `3071b857`: local Korean recall test and visible/tappable study directions.
- PR162 `19bbb8d`: explicit browser CSV download recovery after failed/canceled share.
- PR161 `639fcd3`: approved13-image validation and bounded Apple screenshot tooling.
- PDF rotation correction: canonical topInset anchor independent of progress's
  +10px probe; same 1.5px browser bound and original pending-preview case retained.

PR162 does not provide an Android native sharing bridge. Android native export,
physical retry, native rotation and native keyboard behavior remain unverified.
The separate RSS PR148/Worker is excluded.

Android's Gradle versionName incorrectly followed the web tooling package's
1.1.0 version. It now identifies the release as1.9.3. Candidate versionCode2
follows the parent's Play Console observation of uploaded code1; recheck all
used/reserved codes immediately before uploading. The repository still creates
unsigned release bundles and does not introduce signing keys, secrets or access.
Production Android publication is outside this release.

The iOS checked-in counter is the existing272 baseline. The existing verified
Xcode Cloud bootstrap replaces App/Share counters with Apple's CI_BUILD_NUMBER;
no archive with the unchanged baseline may be uploaded. Observe the actual next
Cloud counter and source after promotion; do not select or submit reported274.

The existing status request previously inspected only fixed build240. Read-only
status now also inventories this app's builds and its associated Cloud product's
runs, including actual build relationships for the latest five runs. It reports
highest uploaded and highest Cloud counters separately. Existing trusted-main,
actor, manifest, environment and no-write gates remain in force. No private key
or JWT is returned. API docs checked2026-10-13:
- https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-builds
- https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-ciproduct
- https://developer.apple.com/documentation/appstoreconnectapi/get-v1-ciproducts-_id_-buildruns
- https://developer.apple.com/documentation/appstoreconnectapi/get-v1-cibuildruns-_id_-builds

The approved13-photo uploader still binds its manifest to272. It cannot authorize
or attest a next-build submission unchanged; the Apple operator must bind the new
verified source/build and original assets before review. Successful status, CI,
unsigned compile, upload, tester availability and review submission are separate
states. The prior WebKit offline Blob/FileReader OCR failure is addressed by the
official test-engine upgrade documented below; browser checks are not native
offline proof.

`tests/verify-next-release-boundary.mjs` pins the exact reviewed integration bytes,
rejects unapproved paths/modes/deletions, checks disabled grading and runs the
unchanged export/historical release gates on their original source commits.

The integrated swipe fixture now lengthens the current saved example instead of
inserting a sentence about `evidence` while testing `observe`. The approved
conservative prompt correctly omitted that unrelated example. Visibility and
actual overflow are asserted before the unchanged trusted vertical-scroll check.

The app-family scene contract now requires both approved revealed direction
buttons to be visible and at least44px, replacing the superseded clipped-only
expectation. Existing keyboard order, reveal gating and completion checks stay.
A missing visible direction is explicitly rejected by the scene contract test.

## Verified offline test-engine repair (2026-10-13)

The no-app persistent IndexedDB/fresh Blob/FileReader control fails on official
Playwright1.62.1 and1.63.0 WebKit on Ubuntu24.04, including a newly allocated
13-byte Blob without any Breeze/PDF/native code. The same control passes on
official1.64.0 WebKit27.2 (revision2370) on both Ubuntu24.04 and macOS15.
The unchanged80-page library regression and60-page OCR stress also pass on
both1.64.0 environments, including real `setOffline(true)`, all source bytes,
two cache passes, nine reopens and zero additional OCR on the offline reopen.
The1.63.0 Chromium control passes. Executed comparison:
https://github.com/MetroBummin/breeze/actions/runs/38412637716 (QA PR164,
be9a8b06ea474158d24644d13b688596869e406c; application bytes equal4786abb).
Old-version failures stay failed in that comparison; none is waived.

The release now pins Playwright and its lockfile to the tested stable1.64.0.
The ordinary OCR workflow retains both engines and every existing assertion,
and adds the no-app control before application regressions. No product storage
change, navigator override, HTTP-only substitute or patched browser is used.
The old offline-emulation failure branch remains in the published patch source;
its presence alone does not predict the newer binary's behavior. The measured
version comparison establishes this repair, without attributing it to an
unverified upstream commit. Official package/version notes:
https://playwright.dev/docs/release-notes#version-164

Final-commit complete CI must pass after this tooling change. These results are
browser-engine evidence with a controlled OCR bridge, not physical airplane
mode,56-page native process restart or physical retry-tap acceptance.
