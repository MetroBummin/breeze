# RSS purpose and validator review

Draft from main `0e72a35be0fa663167acd7de2c7dd9a8dfbdfc4c` in a fresh worktree
on `codex/rss-purpose-validation`. PR89 was inspected at
`714625e6c71aec5e55a31aca38d53a340f81e41e`. Its operator compares the raw
Authorization header to the configured service key. It is stale relative to the
user-reported production v6 fix and must not be deployed. No files from that PR
were copied into this branch. No release/build/App Store files change.

## Observations and limits

The supplied trial has 46 completed cohort items: 36 approved, one candidate,
and nine errors. That is 37 valid classifier decisions, zero reported quality
rejections, seven schema failures and two source failures. Errors are neither
rejected articles nor evidence of poor content. The 44 provider reservations are
budget claims, not proof of 44 completed provider responses or actual billed
calls. Earlier RSS055 is included in the 46; do not add it again.

Schema IDs: RSS005, 008, 010, 026, 035, 037, 043 reported
`invalid_evaluation/probability_consistency`. Source IDs: RSS044 and 045 reported
`source_unavailable`. The exact offending field and numeric values were not
retained in this handoff. It is unproven whether any of the seven failures was
optional, whether probabilities summed incorrectly, whether the selected option
was not maximal, or whether confidence disagreed with the formula. The formula
and current tolerances match the documented Choice contract and remain unchanged.

The user identified RSS022 and RSS039 as promotional false accepts. Current
read-only page inspection supports the policy concern: the
[Blumhouse bucket story](https://bloody-disgusting.com/news/3970212/blumhouse-popcorn-bucket-regal-cinemas/)
centers on collectible features and ordering; the
[Taco Bell/Duolingo story](https://www.dexerto.com/food/taco-bell-is-giving-duolingos-mascot-its-own-sauce-in-taco-day-collab-3414480/)
centers on campaign availability and rewards. These are fresh page observations,
not preserved trial snapshots. RSS021
[ScareScore](https://bloody-disgusting.com/news/3970198/scarescore/) stays borderline;
RSS002 Dorothea Lange stays uncertain pending body review because biography plus
gallery may have substantial standalone value. Neither is labeled a confirmed
negative. No new title regex or brand/domain ban was added.

## Policy and validation changes

The v3 promotion rubric asks about primary purpose and independent value. Fluent
launch copy, promoter quotations and background paragraphs do not automatically
establish editorial substance. Developed reporting, tested reviews, critical
comparisons and useful historical analysis remain eligible even with product
links or commerce topics. A substantive gallery remains readable without images.
These rubric edits are hypotheses to test with actual model judgments.

Mandatory model identity, answer envelope, promotion, readability, mismatch and
evidence retain strict validation. Missing core answers, unknown fields, unknown
core choices, malformed core confidence/distributions or inconsistent core
probabilities fail closed. Approval still needs all three negative hard-gate
judgments at confidence >=0.75. Positive defect allegations stay withheld without
sufficient confidence/evidence. Evidence is still a validated paragraph ID and
bounded private excerpt, with confidence >=0.5; no generated explanation is used.

Ranking (`substance`, `context`, `interest`) and descriptive (`topic`,
`sensitivity`, `timeliness`) fields are optional to eligibility. Bad optional
fields are discarded and receive `optional_metadata_invalid`, a fixed field
name and detail. Missing ranking adds zero; missing metadata becomes `unknown`.
No coercion, invented confidence, relaxed core tolerances or automatic paid retry
was introduced. New errors distinguish `probability_sum`, `choice_not_top` and
`confidence_mismatch`. Existing historical consistency errors retain their label.
`reasonCodes` distinguish promotion, body readability, mismatch, uncertainty and
missing supporting evidence. The service emits fixed reasons and optional schema
diagnostics without article text, raw answers, excerpts or credentials. Private
verdicts retain the existing evidence excerpt for audit. Production v6's separate
cohort operator should emit optional diagnostics too during later integration;
its source has not been transferred into this checkout.

`rss-quality-v3:jev-1.13.0:readability-0.6.0-v1` changes the content cache key and
client compatibility identity. This v3 is the rubric identity, distinct from the
production Edge Function's v6 deployment number. V2 approvals cannot seed v3 inventory. Client mode
remains `off`; the only client diff is version parity for a future reviewed
activation. The existing 200/day durable attempt cap, four global evaluation
slots, maximum three lifetime attempts per identity, cooldowns, local concurrency
two, three bodies/feed/ten minutes and bounded body/response sizes remain tested.
Those operating caps do not authorize this evaluation or additional spending.

## Fixture evidence and deterministic comparison

[Fixture source](../../tests/fixtures/rss-quality/purpose.mjs) contains four
user-reviewed trial observations and 11 original synthetic policy cases covering
promotion, independent reporting, tested reviews, commerce history, a substantial
gallery, coherent sensitive news, uncertainty, missing evidence, source failure
and extraction failure. Only the supplied trial observations have human-review
provenance. Synthetic labels are explicit proposals pending human confirmation;
they must not be presented as a completed human gold set. Mock response recipes
are separate from article construction and labels are never sent in model state.

Run `npm run test:rss-quality` and `node tools/compare-rss-purpose.mjs`.
The comparison reads the exact baseline validator from local git; no network,
credentials or model calls are used. A shallow checkout must first contain the
baseline commit. The
[saved comparison](rss-purpose-20261004/validator-comparison.json) has 11 distinct
synthetic input scenarios and 17 validator cases: six optional-field mutations
reuse one news article. They are not six additional articles.

| Deterministic scripted outcome | Baseline v2 | Proposed v3 |
| --- | ---: | ---: |
| Distinct-scenario approved / rejected / uncertain | 5 / 2 / 2 | 5 / 2 / 2 |
| Distinct-scenario source errors / extraction unavailable | 1 / 1 | 1 / 1 |
| Optional-field mutation cases failing schema | 6 | 0 |
| Optional-field mutation cases preserving core approval | 0 | 6 |

The promotional core answers are scripted `yes` in both arms; this table measures
validator behavior only. It does not establish that Jev now catches RSS022/039,
that the seven original errors would recover, or that the rubric improves
accuracy. Approved case totals across all 17 include duplicate article inputs.
The report explicitly separates classified articles, candidates, withheld
uncertainty, errors and unavailability.

## Proposed bounded live evaluation — parent approval required

1. Obtain only the nonsecret deployed v6 entrypoint/operator/authorization SQL.
   Integrate this classifier on that verified source. Preserve caller JWT
   forwarding to Supabase PostgREST and the service-role-only
   `public.rss_quality_operator_authorized()` RPC, `SECURITY INVOKER`,
   `current_user = 'service_role'`, and `verify_jwt=true`. Never restore raw key
   comparison, trust decoded roles alone, export keys or deploy PR89 wholesale.
   This draft intentionally changes no Edge entrypoint, auth code or SQL.
2. Have a human review frozen source snapshots and independently label a small
   set before seeing model results: 12 readable articles covering the two known
   promotions, ambiguous RSS021, substantial RSS002, and independent reporting,
   reviews, commerce/history and coherent news across sources. Reserve four as
   held-out cases; known failures are development cases. Add deterministic source
   and extraction failure fixtures outside the paid article set. Freeze hashes,
   fetch time, split, model and rubric.
3. After rechecking actual pricing and input token estimates, propose at most
   24 total provider attempts (12 exact same snapshots x v2/v3), concurrency one,
   zero paid retries, a hard provider spend ceiling of $0.10 including both arms,
   and a time-bounded service-only evaluation window. Do not start unless the
   secure executor can enforce *both* the attempt cap and dollar ceiling; reduce
   the set if estimates exceed the ceiling. Use the existing server secret in
   place. Fresh v3 content keys require a reviewed run namespace; do not reset or
   reuse completed one-shot cohort job IDs or the separate 235 task's budget.
4. Retain only safe numerical schema diagnostics (fixed field/detail, sum, top
   probability, reported/derived confidence) if separately approved, never raw
   response/body/key logs. At present this draft emits fixed reasons only, so a
   recurring numeric issue would still need a secure bounded diagnostic capture.
5. Report article decisions separately from transport/extraction/schema errors;
   inspect every exclusion and every promotional accept against human labels.
   Review preserved gallery/commerce inventory and per-source counts. Compare
   schema recovery separately from classifier accuracy; candidates are not
   approvals. A 12-article pilot estimates no reliable production error rate.
   Keep client OFF, server serving mode unactivated and no warming/background
   paid calls. Parent approval of the plan authorizes only that bounded trial,
   never merge, deployment or activation.

Validation: RSS policy/security/cache/cost contracts and recommendation tests,
typecheck, and mocked Chromium browser checks are recorded in the draft PR.
No live model evaluation, remote SQL, migration, Edge deployment, App Store
action, build-number change or release command ran. Full app release tests and
Deno checks are outside this classifier-only verification. Missing exact v6
source and human confirmation of the synthetic labels remain integration and
evaluation gates, not reasons to redeploy the stale branch.

Contracts rechecked: [TypeSafe API](https://docs.typesafe.ai/api),
[Choice confidence](https://docs.typesafe.ai/confidence),
[Supabase Edge authentication](https://supabase.com/docs/guides/functions/auth)
and [Supabase changelog](https://supabase.com/changelog). The markdown changelog
endpoint was blocked in this environment; the public HTML changelog was read.
