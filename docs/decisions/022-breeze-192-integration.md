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

The checks and measurements below are preserved as historical results of the
previous `0b51a499` candidate, not evidence for the current source.

---

# Breeze 1.9.2 integration boundary

Base: released/integrated 1.9.1 source `83cc182db73ed1d63784e66321a066ccb2943994`.
The user approved testing and merging the OCR and minor fixes into 1.9.2 while
asleep on 2026-10-09. OCR stress testing has a separate owner; its final result
and source SHA are required before this owner publishes main or starts Cloud.
Photos and App Store Connect submission have separate owners. The follow-up
handoff supplies final PR143 `0b51a4992c5ec12c1215381a210584f6b2e66561` and
keeps PR144 `e2bf032af786c8c26e03a8222e135cc9dc3a220f`. Its latest instruction
limits this task to candidate integration and verification: main merge, Cloud
build and review submission remain held even after candidate checks complete.

## Exact sources and versions

Preserve source history through merge commits for PR143 (on-device image-only
PDF OCR) and PR144 (Memory meaning editor and book-filter dismissal). Their
immutable SHAs, explicit path lists and source hashes are checked independently
of the receipt by `tools/record-192-integration-boundary.mjs`.

The two PRs overlap only in generated `index.html`/`sw.js` stamps. PR144's
semantic shell/worker bytes must equal the baseline; PR143 owns the OCR script
registration. Official asset stamping resolves the combined hashes. No UI,
recognition, lookup, import or navigation implementation is edited by integration.

Change all four App/Share Debug/Release marketing versions from 1.9.1 to 1.9.2.
The checked-in build counter remains 253. The existing Xcode Cloud hook supplies
Apple's actual unique counter to both targets. Update only literal version labels
in the release verifier, its Cloud fixtures and the optional local archive helper;
the verifier's assertions and Cloud counter logic remain intact.

## Historical and current verification

Keep the original 1.9/1.9.1 boundary JSON, all old owner receipts and the
1.9.1 integration helper byte-for-byte identical to the baseline. The new
receipt is `docs/qa/breeze-192-integration/boundary.json`.

The original `tests/verify-integration-boundary.mjs` is also unchanged in the
current tree. The three existing workflows call the new
`tests/verify-192-integration-boundary.mjs` entry point instead; their only change
is that literal filename replacement. All steps, triggers and other assertions
remain identical and this runner-only transformation is independently pinned.

The current boundary checks every baseline file's exact Git blob and executable
mode, except the explicit owner/integration/version paths. Owner paths match
immutable source bytes; only shell hashes and worker version are normalized,
then independently recomputed and required. Every untracked or changed path
outside the exact scope fails. Integration evidence is separately hashed.

After that current-tree verification, the wrapper executes the complete original
1.9.1 boundary verifier, unchanged, in a temporary detached checkout of exact
baseline `83cc182`. It removes only that disposable checkout afterwards. No
historical assertion is deleted, skipped, weakened or supplied with a new hash.
Checking the entire current baseline first ensures historical source projection
cannot hide a mutation in the app, native hooks, configuration, icons, tests,
receipts or release requests. Source ancestry is required so these checks remain
usable after contributor branches are deleted; do not squash the integration.

## Acceptance and publication

Run the full unit/type suite, both changed browser suites and existing affected
Reader/Memory/onboarding regressions. Probe unauthorized source, version,
historical receipt, stamp, worker and verifier mutations and require rejection.
Validate generated native packages locally and both platform builds in final-head
CI. Linux browser OCR uses controlled recognizer results; it cannot substitute
for actual Apple Vision/ML Kit stress evidence supplied by the OCR owner.

This follow-up publishes only the updated draft candidate and its exact-head CI
results. The immutable source's Android KVM execution gate and WebKit offline
local-Blob assertion remain enabled; failures are recorded rather than made
green by skipping them. Successful macOS Vision execution is distinct from
physical iOS acceptance. Its process RSS increase and recovery from a permanently
pending native call remain unresolved. Real handwriting, device offline behavior
and ML Kit execution also remain unverified. The receipt now pins the exact
preparation-only authorization text as well as its source contract.

Main merge, Cloud build and review submission stay held. This integration performs
no server deployment, key/database change, unrelated learning feature, review
cancellation or ASC write. Any later release is a separate owner decision after
reviewing the explicit remaining failures and risks.

## Explicit release amendment: PR146 (2026-10-10)

After the installed build 263 OCR failure, the owner authorized merging the native
bridge correction and publishing iOS TestFlight build 264 and an Android update.
The current boundary therefore overlays the exact seven-file delta from immutable
commit `40e5719457c5cf60a6545d994630d9b4fe1379d1` over parent
`f17971773eb57ffda0b17b520b3d7e57734f6a60`. It verifies that exact parent,
path set, ancestry, modes and source hashes. The PR143/144 source validation and
all historical 1.9.1 checks remain unchanged; unlisted edits still fail. The earlier
hold above describes the integration's historical authorization, not this later
explicit release instruction. Physical-device acceptance and App Store review
submission remain separate from this TestFlight/Android update authorization.

## Direct-tap implementation amendment: PR147 (2026-10-10)

After personally confirming build 264 lookup, font and scrim behavior, the owner
requested only removal of the OCR spelling-confirmation step. Pin the exact
ten-file source delta at `acdd7c580a5cb88a53049d93021dc171fa5510d5` over
`b72436a2311b9b4a78738abd2b9fa057ab529460`. The existing meaning surface opens
on one tap; no correction editor is added. Recognizer accuracy is unchanged,
including the documented confidence-1 misrecognition. Historical receipts and
all unrelated protected bytes stay exact. This amendment permits implementation,
tests and draft PR publication only; a new merge, build and release require a
separate owner instruction.

## Bookshelf preparation and next-build amendment (2026-10-10)

At 13:28 UTC the owner explicitly requested implementation of the discussed
bookshelf OCR count/progress design and upload in the next build. Pin the sixteen
source files in `8f45c9527c83d43eea9c42815d13938bb8003ccf`, exact parent
`50fe13ae3acf01d307d0af0365f8189680dd6a02`. The earlier implementation-only
hold describes the previous instruction. The tested integration and next
TestFlight upload are now authorized. No delayed tap replay is included;
App Store review submission remains separate.
