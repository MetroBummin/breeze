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
safe-area + 24px top spacing and a -3.25px title optical correction; the add control
uses shared glass in its existing 44px circle. This follow-up is PR-only, with no
new merge or Cloud/TestFlight authorization. Review mascots and onboarding remain
unchanged. Measurement and screenshot evidence: ../qa/memory-header-20261008.md.

## Appearance follow-up (2026-10-09 draft, based on 1.9 / 253)

The approved flow b contour and existing light/dark PNGs are reused unchanged.
The iOS AppIcon catalog supplies the existing light PNG as Any and the submitted
`AppIcon-512@2x.png` as luminosity Dark. iOS chooses these native appearance
assets according to the user's Home Screen Light/Dark/Automatic choice; the app
does not call alternate-icon APIs or couple icons to its reading theme. Tinted
appearance is left to the system's generated treatment; no new tint artwork is
claimed. Earlier iOS uses the Any/light fallback.

Android's approved adaptive foreground/background, API33 monochrome, legacy
fallback and manifest remain byte-identical. Themed tint depends on the user's
themed-icon choice and launcher support; app dark mode does not guarantee an
Android launcher light/dark icon switch. No component toggle is introduced.

This follow-up is isolated from the submitted 253 branch. Its release metadata,
launch, welcome lettering/timing, videos, auth and shared Reader controls are
preserved. No build-number bump, native upload, merge, deployment or review change
is performed. Whole-app theme settings remain a separate proposal.

References: [Apple asset-catalog appearances](https://developer.apple.com/documentation/xcode/configuring-your-app-icon),
[Android adaptive/themed icons](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive).
