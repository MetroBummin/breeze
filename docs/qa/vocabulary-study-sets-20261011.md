# Vocabulary study sets MVP verification

Baseline: `8512e8fd25e51d6aa06cf926bad165d5c3994865` (current main, 1.9.2 source).
Target: 1.9.3 feature integration. This change does not bump, merge, upload, or
submit a native release. RSS activation and Reader lookup/rotation changes are
outside this change.

## Implemented

- A single-column Memory set-card home and accessible set-management sheet
- Multiple-book snapshot creation with semantic duplicate counts
- Set-local swipe/keyboard exclusion, Undo, excluded list and restoration
- Explicit imports that preserve exclusions and source independence
- Offline captured word/meaning/example/source review
- Saved reveal/self-assessment progress, fixed rounds and repeat-only rounds
- Strict storage decoding, failure retry and stale-write/callback guards

Contract and known source-identity limits are in decision 023.

## Local checks

- `node --test tests/verify-study-sets.mjs tests/verify-study-sets-storage.mjs`:
  26 passed, zero failures.
- `node --test tests/verify-study-sets-ui.mjs`: 20 event-level DOM tests pass (46 total focused tests).
  This harness is not a browser layout or native gesture simulator.
- `npm test`: passed the existing aggregate suite, including typecheck
  (32 existing diagnostics, unchanged), saved vocabulary lifecycle, simple-card
  contracts, sync safeguards, OCR and Reader regression contracts. Existing
  intentionally skipped tests retain their skip state.
- `npm run www`: generated the native web bundle. Model, storage, UI and CSS
  bytes match their source files in the bundle.
- `git diff --check`: passed.

## Browser verification

`tests/verify-study-sets-browser.mjs` covers real-browser creation and duplicates,
swipe/Undo/restoration, import/exclusion, deleted sources, persistence reload,
offline review, fixed rounds, failed writes and retry, modal history, deletion,
and Chromium cold offline relaunch through the service worker, plus ten light/dark viewport combinations (390×844, 820×1180, 1440×900, 320×568,
844×390). The dedicated Vocabulary study sets workflow runs Chromium and WebKit
and uploads screenshots/JSON under `study-sets-{engine}`. It also runs the
existing simple-word-card browser regression.

The local container's installed Chromium could not launch: its local process
socket returned `Operation not permitted`, also after the supported escalation.
No local rendered screenshots are claimed. CI render results must be checked on
the exact published commit before release integration. Physical iPad safe-area,
keyboard and native WebView interaction are not established by a DOM harness.

## Historical release boundary

`tests/verify-192-integration-boundary.mjs` intentionally rejects this feature's
new paths/changed Memory integration. Its 1.9.2 immutable receipt and checker
remain unchanged. This is a known release-integration gate, not a passing
historical-boundary claim. A coordinated 1.9.3 boundary must pin the reviewed
feature source separately; this PR does not regenerate an old receipt to hide
new feature changes.

## Minimal UI revision verification

The first candidate at `9286d7b` passed dedicated Chromium, WebKit and aggregate
CI in run 38102780936; the independent iOS Simulator compile also passed
(no signing, archive, or upload). The owner requested a subsequent minimal
visual/gesture revision. Its exact final commit and browser artifacts must be
verified separately; prior screenshots are not evidence for this revision.

The revised browser suite adds pointer-follow translation, canceled/short/right
drags, vertical direction locking, repeated exclusions and last-action Undo,
tap suppression, keyboard equivalents and reduced motion. Synthetic touch
PointerEvents test handler ownership separately from trusted mouse input; they
do not claim native iPhone scrolling physics. The footer is checked against
content bounds and the fully scrolled final row in all ten viewport/theme cases.

Minimal candidate `51cf1418` passed contracts, Chromium and WebKit in Actions
run 38103843607. Its reviewed phone screenshots precede the owner's additional
round-action/capsule swipe reference. The latest local gesture revision and
124px minimum word column are separate pending verification/publication work.

The additional swipe revision uses durable commit before visual exit/collapse.
Animation completion removes only its own row, retaining a neighboring active
pointer capture and any later failed-write retry. Both overlapping cases have
DOM regressions; browser coverage holds the second trusted pointer through the
first row's collapse. Short reveal/action tap and deep capsule commit are
separate tested paths, with real-pointer capture frames for UI review.
