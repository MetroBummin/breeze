# Design-only brand release

User authorizes main merge and one new Cloud/TestFlight build for selected
brand designs, explicitly excluding new onboarding. Extract from PR124 onto
main c649047d: selected teal b platform icons, original-contour neutral Home
wordmark, single bookmark outline in existing glass circle. No visible Home
label; Breeze Memory name/tooltip and navigation remain. Home-only selectors
prevent changing the tutorial Reader/header.

Keep main onboarding DOM/script/styles, Reader/auth ownership, native launch
and release configuration unchanged. Flow wordmarks and variants are reusable
assets with no onboarding UI reference; PNG variants/icon sources are excluded
from native www. Guided onboarding stays in PR122/124, neither merged/deleted.

Cloud owns the unique build counter through CI_BUILD_NUMBER. Checked-in 1.8.1
(236) baseline remains; do not force a guessed build number or start a second
Cloud run. One main merge triggers existing Cloud workflow. App Review is
excluded.

Previous draft Integrity failed WebKit offline Holmes anchor restoration,
which predates bookmark selection. Preserve the strict assertion and add only
failure diagnostics; Reader behavior unchanged. Exact design-only checks must
finish before merge. Local native/physical installation unavailable.

## TestFlight feedback follow-up (2026-10-08)

The Memory header no longer displays the decorative Thunder image. Title and
controls stay intact. Align its visible title ink to Home's wordmark using
safe-area + 24px top spacing and a -4px title optical correction; the add control
uses shared glass in its existing 44px circle. This follow-up is PR-only, with no
new merge or Cloud/TestFlight authorization. Review mascots and onboarding remain
unchanged. Measurement and screenshot evidence: ../qa/memory-header-20261008.md.
