# 1.9.3 integration boundary

The integration baseline is released main `8512e8fd25e51d6aa06cf926bad165d5c3994865`.
Only these reviewed feature owners are included:

- PR149 `aebbad7446a5b85a794a632cfa8f5b39cd972415`: vocabulary study sets and approved UI.
- PR150 `fc8a94d20f6f4009ed89998c2627aef91c72dc23`: same-target lookup cancellation.
- PR151 `990cb810452eb80f4e819411233ca439e1f8ddaa`: source-identity anchor restoration during repeated text rotation.

Each owner's baseline and exact changed-file list are pinned. Shared dictionary
and state source must equal conflict-free three-way merges against the baseline.
The package test command keeps PR149's study-set prefix and PR151's exact
rotation-test insertion. index.html semantics come from PR149; other owners
change only generated hashes. All resource hashes are independently recomputed.

Release changes replace literal 1.9.2 with 1.9.3 in exactly four version contract
files. The checked-in build counter remains 253; Xcode Cloud supplies the actual
CI_BUILD_NUMBER to both app and extension. Three existing CI runners select the
new verifier. The old receipts, checkers and every other baseline byte remain
protected. Historical 1.9.2 checks run unchanged in a detached checkout of the
baseline, including their historical 1.9.1 checks.

The new receipt records these reproducible source expectations and hashes only
the explicitly listed new integration evidence. It cannot bless arbitrary
working-tree source changes. RSS migration/activation and App Store metadata or
review submission are excluded. A feature approval is not evidence of native
archive/signing/upload success.

The owner requested completion and TestFlight after QA. Integration remains on
a separate branch; the parent task coordinates the exact tested candidate and
any Xcode Cloud start. No main update is needed merely to construct this branch.

The boundary runs on the committed, build-253 source before cloud mutation.
It is deliberately outside npm test because ci_post_clone applies CI_BUILD_NUMBER
first. Before starting an archive, the resolved Xcode Cloud source commit must
match the exact integration commit whose boundary and CI passed. A newer branch
head must be revalidated; successful feature CI alone does not satisfy this gate.
