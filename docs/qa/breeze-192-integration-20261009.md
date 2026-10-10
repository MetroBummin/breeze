# 2026-10-10 direct integration update

Current OCR input is PR143 `f7e67d3938ea7debed4a61243f5743980f7d4249` (65 paths),
including `dbceedb53` response recovery plus the two supported JSObject boolean
API calls. Memory remains `e2bf032af786c8c26e03a8222e135cc9dc3a220f`.
The owner requested direct continuation of checks and 1.9.2 integration.
The strict contract, source ancestry, historical verification and all failure
assertions are retained. Only generated shell/worker stamps resolve overlap.

Source CI completed with 30 successes and 8 failures. Android app and test APK
compilation now pass. ML Kit execution remains blocked by existing KVM access;
WebKit offline local-Blob failure remains. Six other source failures are the
frozen 1.9.1 boundary, addressed only by this existing 1.9.2 contract.
Actual macOS Vision stress is distinct from iOS-device acceptance. Recovery tests
use controlled callbacks and do not prove recovery from a permanently hung SDK.
No main merge, release build, TestFlight availability or review submission is
claimed. Final integration-head results are reported separately in PR145.

Direct cloud-workspace checks on this integrated tree: full `npm test` passed
(exit 0), OCR unit tests 21/21 passed, Android configuration checks 6/6 passed,
PDF glyph geometry passed, and `git diff --check` passed. The full test script
includes its existing typecheck. Browser/native device acceptance is not inferred
from these checks; exact-head hosted CI is still required.

The checks and measurements below are preserved as historical results of the
previous `0b51a499` candidate, not evidence for the current source.

---

# Breeze 1.9.2 final-source candidate verification

Baseline: `83cc182db73ed1d63784e66321a066ccb2943994` (PR142).
Candidate branch: `integration/breeze-192-20261009`, existing draft PR145.
Final OCR input: PR143 `0b51a4992c5ec12c1215381a210584f6b2e66561`.
Frozen Memory input: PR144 `e2bf032af786c8c26e03a8222e135cc9dc3a220f`.

The latest parent instruction authorizes **candidate preparation and verification
only**. Main, Cloud build and review submission remain held regardless of these
checks. Existing release branches, photos and ASC records are untouched.

## Source and historical protection

The new merge preserves final OCR ancestry alongside the already integrated
Memory ancestry. Only the generated service-worker version conflicted; official
stamping resolves it. App/Share Debug/Release stay at 1.9.2 with checked-in counter
253; the existing Cloud hook is unchanged and no actual build was started.

The [strict receipt](breeze-192-integration/boundary.json) independently pins the
final OCR's 64 paths, Memory's 23 paths, exact version transformations and three
literal workflow-runner replacements. The combined contract has 91 owner/version/
runner paths plus five integration-evidence paths. All other baseline bytes and
executable modes are immutable. Original historical receipt, integration helper,
boundary test and Cloud hook remain byte-for-byte unchanged. The complete original
1.9.1 boundary executes in its exact detached baseline checkout. The new verifier
also pins the preparation-only authorization text; receipt edits cannot fabricate
release authorization. See [the decision](../decisions/022-breeze-192-integration.md).

The final OCR adds finite confidence/rectangle validation and an occurrence-scoped,
nonmodal spelling confirmation before lookup, including cached meanings. It keeps
reading/zoom available, invalidates obsolete prompts, requires fresh confirmation
after replacement/eviction/reopen, and does not enable OCR sentence lookup. These
are exact reviewed owner bytes; integration makes no product or test-harness edit.
The owner's landing change is only its reader stylesheet's generated stamp.

## Local checks on final inputs

- Full `npm test`: passed, including the expanded OCR assertions and all existing
  unit/contract suites. Typecheck passed with the existing 32 diagnostics.
- Current 1.9.2 and complete unchanged historical 1.9.1 boundaries: passed.
- Nineteen intentional mutation probes all rejected; restored guard passed. They cover source/config/native/version/history/evidence/stamp scope,
  forged source and authorization, deletion of the native execution gate, and
  deletion of the offline assertion. Only real asset attributes are normalized;
  stamp-shaped semantic HTML changes cannot hide drift.
- Chromium OCR: 30 geometry cases; responsive light/dark spelling-confirmation
  captures; actual PDF.js/IndexedDB; 60-page stress, rapid navigation, maximum one
  concurrent recognizer, live-ink exclusion, failure/retry, two cache passes,
  48-page cap, eight ordinary reopens plus one offline reopen. **Recognition is
  controlled bridge output**, not model accuracy. Offline persisted PDF bytes
  and a fresh local Blob both read successfully in this Chromium run.
- Chromium Memory: twelve responsive light/dark cases. Existing Wordbook search,
  sort/filter/edit/add/export/Home and onboarding cancel/back/swipe/skip/replay,
  rapid navigation, media and responsive themes passed.
- Existing Chromium PDF ink, pointer ink and pending-lookup pinch regressions:
  passed. Stylus/finger events are synthetic, not physical-device acceptance.
- `www`, iOS/Android Capacitor sync, native package/service-worker policy, six
  Android source/config checks, brand icons, changed JS/shell syntax and whitespace:
  passed. Android sync's machine-relative generated Gradle path is restored to
  the immutable baseline before guard verification. No local native SDK/compiler
  is available; compile results come from final candidate CI.

Final negative-probe results and exact source equality are recorded externally
at `/workspace/breeze-192-final-proof/`; final-head CI results will be posted in
PR145 and an external SHA receipt after all checks terminate. The earlier
`0af75b6` candidate's 14-workflow/34-job success is historical and does not stand
in for these new final-source checks.

## Retained source failures and acceptance limits

The parent reports final PR143 source CI as **30 success / 8 failure**: six frozen
1.9.1 guard failures, one Android KVM execution blocker, and one WebKit offline
local-Blob `NotReadableError`. The formal new boundary resolves only the historical
scope mismatch. Native execution and offline assertions remain present, enabled
and byte-identical to the owner. Their final candidate outcomes are reported as
observed, including failures; no skip, deletion, permission change or green
classification is used to conceal them.

Actual macOS Vision ran 25 owned images and 96 repeated calls under network
denial in the source workflow. It passed five clean controls, with difficult
misreads retained (including a misspelling at confidence 1.0). This is not physical
iOS or representative human-handwriting acceptance. The parent reports roughly
13 MB process RSS growth in the final-head run; bounded measurements include
framework/model caches and harness objects and do not establish a leak-free
plateau. Keep that observation even if a new bounded candidate run has different
samples. Recovery from a permanently pending native call remains unverified.

Physical iPhone/iPad/Android offline behavior, real handwriting, pen/palm timing,
long-duration memory behavior and ML Kit execution remain unverified. Memory's
real iOS keyboard/focus autozoom and intentional pinch retention remain unverified
as well. [Full OCR limitations and evidence](scanned-pdf-ocr-stress-20261009.md),
[committed confirmation screenshot](evidence/pdf-ocr-confirm-phone-light.png) and
[Memory before/after screenshots](memory-edit-filter-20261009.md) are preserved.
Local confirmation screenshots at `/workspace/breeze-192-final-proof/ocr-confirm/`
show the integrated UI with mocked native recognition, not a physical device.

No main merge, Cloud/TestFlight build, server/DB/key deployment or ASC write was
performed. Photos and any later release decision remain with their assigned owners.
