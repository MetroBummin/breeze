# Android internal-test integration (October 6, 2026)

## Scope and source ownership

This draft combines the Android test work on the already-green main
`0fe688655a7af58d43d2b60bab0cee7f4c215b3e` (the iOS 244/RSS integration).
It does not alter iOS 244 numbering, Apple release automation, production switches,
Play account settings, release credentials, signing permissions, or store releases.

- PR #112 (`4eaed0c3`): transparent native PDF tap feedback; product change limited to PDF paper CSS
- PR #113 (`524dab50`): email OTP form state survives settings dismissal, rerender and password-mode round trips, with bounded resend handling
- PR #114 (`2d7d61e7`): stylus Pointer Events use the existing PDF geometry/history/storage path; iPad native Touch ownership remains preferred, and missing safe event delivery fails closed
- PR #115 (`74d23b7e`): official Capacitor 8.5 Android shell, SDK 36, debug APK and unsigned release AAB builds

The merged main's RSS fixtures and same-value PDF observer guard are preserved.
Auth changes are replayed onto current package/Integrity contracts. Android scripts
and dependency are added without replacing those contracts. The pointer browser
suite is appended to `test:pdf-ink`. All source fingerprints are regenerated once
against the combined files, with no old-branch index/service-worker override.

## Verification gates

The full immutable main snapshot was verified against all 821 tracked Git blobs.
Every imported feature file was checked against its published blob SHA before
integration. The exact final commit is the identity for CI and artifact receipts.

Required automated gates before recommending the combined draft:

- Full `npm test`, existing typecheck baseline, Android contracts and native sync
- Email interruption/resend browser regression across phone, tablet, desktop and short light/dark layouts
- PDF tap feedback baseline/fix checks in Chromium and WebKit, preserving word/scroll behavior
- Pointer pen, cancellation, palm ordering, eraser/history, finger scroll/pinch, real PDF.js and IndexedDB/offline persistence coverage
- Full Integrity browser suite and the inherited main diagnostics
- Native Android lint, debug APK, app device-test APK compile, unsigned release AAB, and comparison of all 195 bundled runtime assets

The earlier standalone wrapper artifact passed native checks but did not contain
these combined features. Use only the new integration build and its source/SHA-256
provenance when preparing the internal test. Signing remains a separate step.

## Remaining human/device gates

No emulator or physical Android device result is inferred from a successful web
suite or native compilation. A real stylus tablet must validate pointer/Touch
ordering, palm rejection, pen during inertia, local ink persistence and recovery.
A phone/tablet must validate launch, system bars, keyboard, rotation, native file
picking, offline reopen and email login. Physical Chrome/WebView tap feedback must
be compared on the user's reproduction device before claiming its cause resolved.

Play Console/account readiness, package identity and an unused version code still
need verification. The AAB is unsigned; release upload signing must use an approved
owner-controlled key and secure setup. No key is generated or uploaded here. Play
internal-test submission and its tester link are not complete until the Console
accepts the signed bundle and a tester installs it. Internal testing is not public
production publication, and no guaranteed review or availability date is asserted.

See the [Android wrapper runbook](android-internal-test-20261006.md) for build commands,
artifact interpretation, device cases and official Play/Capacitor requirements.

## Final integration review corrections

- Pointer admission now rejects an intervening palm/second pen before a missing
  companion Touch can admit drawing or erasure. Native and pointer resize ownership
  are covered; the independent reproduction no longer triggers the defect.
- Email send completion is owned by its request. An old OTP promise spanning
  password sign-in, logout and a new send cannot unlock or overwrite that newer send.
  The exact overlapping-request regression failed before the correction and passes
  after it.
