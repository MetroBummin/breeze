# Approved web integration — 2026-10-09

The user approved merging and deploying both PR136 (icons/onboarding) and PR137
(landing). PR136's verified `bdc2222315cad490cdcd3d4f1ddb4139bd7f2bce` contains
submitted 1.9 (253) `7bed00f9f5e1bb5cbba68f7d921081b5be7f7d65`, while PR137's
verified `e4b49a00e893bad9ae34264d58a79ca5f344a6a9` is independently based on
main `e7b61d5304d20d639d45fc8dd23116db5d6446e5`.

An isolated web integration branch combines both histories. The submitted 253
branch remains unchanged. The production app/native tree matches PR136 except the
service-worker site-navigation fix below;
landing code, captures and assets match PR137, except content-hash query strings
in landing HTML resolve the newer approved shared app CSS. The integration
boundary independently enforces both source sets.

An installed real app worker reproduced a public-site navigation defect: visiting
`/landing` returned cached app HTML. Its navigation fallback is now restricted to
the two app entry paths (`/`, `/index.html`); READY keeps its existing network-first
rule. Landing, support, privacy and terms use normal browser document navigation.
The app's generation/cache ownership, offline Reader and no-forced-worker-activation
policy are preserved. A real Chromium worker regression covers both landing URL
forms, all three other public pages, the phone CTA and durable book retention.
Integrity runs that regression beside its existing offline worker checks.

Deployment follows the existing main GitHub Pages build, observed in successful
run 37652315566. A previous main also has Xcode Cloud's Default iOS Archive check.
Merge the combined source into main once to avoid separate app/landing main
updates. Do not manually start Xcode Cloud, change remote version/build metadata,
submit/cancel review, or modify Apple requests, credentials or account settings.

Both App and Share Debug/Release retain 1.9 (253). The cloud post-clone hook applies
Apple's CI_BUILD_NUMBER to both targets before npm tests and native sync. Actual
App Store version/review status and the next version/counter require the iOS
owner's confirmation; the checked-in version is not evidence of current Store
state. A main-triggered archive is not a claim of a new reviewed release.

Public service retrieval was proxy-blocked during preparation. Deployment run
and served-byte/cache/mobile/browser verification are reported separately after
the final source is merged; local screenshots do not prove public deployment.
