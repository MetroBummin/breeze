# PR 9 / 10 / 11 release audit — 2026-09-22

## Scope and findings

Reviewed changed runtime code, decision records, async ownership and generated asset integration before merging. Work used a clean clone because the existing shared repository has an invalid duplicate ref; existing checkouts were not repaired or reset.

- PR 9: reproduced an incorrect example on a newly resolved meaning: bank/강둑 inherited the bank/은행 sentence. Fixed the sentence-to-example mapping. Reusing a saved meaning now retains the selected occurrence for presentation without replacing its saved example. Added regressions, observed the failure before the fix, and passed Chromium/WebKit after it. Checked lookup cancellation, bounded provider recovery, token/member alignment, whole-group deletion and Meaning tombstones.
- PR 10: reviewed PDF glyph text state, transforms, cached normalized boxes, release/reload, and sentence cue ownership/cleanup. No additional runtime blocker found. The adapter remains tied to vendored PDF.js 3.11.174 internals; it does not repair incorrect OCR.
- PR 11: reviewed shared controls, settings focus, filters/manual additions, progress and refresh isolation. Its intentional light material and headword-count changes invalidated two older lookup-test expectations; updated those expectations while retaining actual deletion and geometry checks.
- Reader notices: bounded FIFO (20 pending), duplicate coalescing, 60-second expiry, session cleanup, polite plain-text status, active input/lookup/dialog/pinch/restore priority, interrupt-and-resume, no scroll-time geometry work. Source book title and progress remain authoritative.

## Validation

Passed the integrated npm test suite (including 23 sync safety cases, gesture and async lookup lifecycles, PDF operators and lookup contracts; existing type diagnostic baseline: 39, no increase).

Passed Home/Reader material and geometry at five sizes in light/dark, pull refresh, reading progress and Wordbook actions. Passed Chromium/WebKit lookup context/cache/expression/deletion checks, word presentation and Meaning deletion interactions, Reader-notice priority/queue/session/visibility tests including narrow viewport, PDF geometry and ink preservation, all 12 sentence cue configurations, sentence presentation, 120-page PDF pinch (12 cycles in four browser/viewport configurations), native onboarding browser isolation, and web build.

PR 9 was then tested independently with the audit fix; PR 10 was tested with merged PR 9. PR 11's resolved source tree was compared byte-for-byte with the validated integrated tree before release metadata was added.

## Service and native handoff

Production dict v48 matched the original main source. Deployed reviewed PR 9 server as ACTIVE v49 with unchanged custom-auth/JWT configuration. Verified warm=200, invalid target=400, missing anonymous identity=401, and a real OpenRouter expression response with correct fixed token members.

Native release target: kr.io.breeze.app, 1.2 (113). Organizer confirmed prior 1.2 (109) was uploaded. Native asset sync, signed archive and Apple upload results must be recorded separately; browser checks do not establish physical iPhone/iPad behavior. No App Store review submission is included.
