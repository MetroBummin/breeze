# Breeze 1.9.2 integration boundary

Base: released/integrated 1.9.1 source `83cc182db73ed1d63784e66321a066ccb2943994`.
The user approved testing and merging the OCR and minor fixes into 1.9.2 while
asleep on 2026-10-09. OCR stress testing has a separate owner; its final result
and source SHA are required before this owner publishes main or starts Cloud.
Photos and App Store Connect submission have separate owners.

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

Only publish one main merge after the OCR final SHA/result, local checks and
all required final-head CI checks are complete. Confirm the merged tree equals
the verified candidate tree and watch its existing automatic Cloud build. Do not
manually start a duplicate build. This integration performs no server deployment,
key/database change, unrelated learning feature, review cancellation or ASC write.
