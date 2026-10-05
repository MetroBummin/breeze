# Headless paired evaluation preparation

The user approved **at most 24 paid physical attempts, USD 0.10 total**, for 12
real sources paired against the old and new rubrics, concurrency one and zero
paid retries. This approval does not authorize deployment, a new admin endpoint,
production control changes, credential export, client activation or any 235 work.
The approved budget is **unspent: zero provider attempts**. The
[readiness record](rss-purpose-20261005/headless-readiness.json) records the exact
implementation and label-selection hashes, infrastructure observations and limits.

## Current execution blockers

The exposed Supabase tools support source retrieval, catalog queries and
deployment, but no credential-resident function invocation or Jev executor.
A presence-only check found no provider/service credentials in the workspace;
their values were never requested or read. A read-only public catalog name query
found `claim_rss_eval`, `claim_rss_quality` and `rss_quality_operator_authorized`,
with no RSS/Jev execution function. No secret stores or credentials were queried.

Production v6's existing POST operation accepts a fixed cohort ID and refetches
its live page using the deployed old rubric. It cannot accept frozen article
inputs or select the proposed rubric. The observed evaluation window is expired
and completed one-shot jobs cannot be reused without a reset. Calling it cannot
perform this experiment. No code was deployed, jobs reset, window extended, mode
changed or auth relaxed to create a substitute path.

The normal pinned public-fetch transport also failed local DNS with `EAI_AGAIN`.
The managed HTTPS proxy returned `CONNECT tunnel 403`; requesting the supported
additional network permission and escalation path did not resolve it. Automatic
approval review did **not** reject the action; the network request still failed.
The attempted 12-source capture has zero complete publisher snapshots. These
are **infrastructure failures**, not 12 publisher/source failures or classifier
rejections. An early preflight manifest was moved out of the repository as
invalid; the freeze command now aborts on capture infrastructure failures. Web
page summaries used for review cannot replace the full frozen HTML/extracted
Readability inputs. No usable private paid request pack has been produced.

The remaining input is the identity of an **existing supported private executor**
and a supported source-capture path or nonsecret frozen source handoff. Credentials
must stay resident there. A Mac is not an inherent requirement for this Node/Python
workflow; availability of such a runner and network path has not been verified.

## Pre-model source and reference selection

[Twelve selected sources](../../tests/fixtures/rss-quality/real-source-seeds.json)
are fixed before any model call. Two supplied historical promotion observations
remain user-reviewed; the other ten labels are proposed and await human review.
There are no freshly human-confirmed gold labels or frozen real article bodies
yet. Source and label-selection hashes are recorded independently from model
inputs. Neither reference labels nor reviewer rationales enter either request.

| Source | Role in the pilot | Reference status |
| --- | --- | --- |
| RSS-022, RSS-039 | Known narrative promotion false accepts | User's historical promotion review; fresh input still needs inspection |
| RSS-002 | Long gallery with developed biography | Proposed retain if extracted biography is present |
| RSS-021 | Borderline campaign/explanation | Proposed uncertain |
| RSS-001 | Commerce/history preservation | Proposed retain |
| RSS-014 | Critical independent review | Proposed retain |
| RSS-025 | Brand merchandise criticism and response | Proposed retain |
| RSS-038 | Reporting on disputed brand pricing claims | Proposed retain |
| RSS-055 | Coherent institutional robotics reporting | Proposed retain |
| RSS-061 | Interactive quiz versus standalone prose | Proposed uncertain; extraction failure is a separate result |
| RSS-065 | Substantive sensitive regulation reporting | Proposed retain |
| RSS-044 | Previously unavailable source | Source check; failure supplies no quality label |

This is a purposive diagnostic set, not a blinded held-out set or a production
accuracy sample. Many URLs were already in the historical cohort. Do not tune
the rubric after looking at these paired results and then call them held out.
If an input fails source/extraction readiness after capture, retain that separate
failure record and skip both model attempts. Twelve URLs do not guarantee twelve
readable articles; replacing one requires a new pre-model selection/label freeze.

## Offline workflow and runner contract

1. `python3 tools/capture-rss-real-public.py /PRIVATE/public-capture.json`
   captures only the fixed seed URLs through standard managed HTTPS egress.
   Redirects must stay on each seed's exact host (optional `www`). It respects
   ordinary HTTP failures, has a 20-second timeout and 3 MB limit, and performs
   no paywall/challenge bypass. Private full HTML is mode 0600 outside the repo.
   This capture transport differs from production's pinned-DNS transport; the
   same repository extractor is then used. No production fetch code changed.
2. `node tools/freeze-rss-real-inputs.mjs /PRIVATE/pack.json /PUBLIC/manifest.json
   /PRIVATE/public-capture.json` performs extraction/readiness and seals the pack.
   Use these three paths on a single command line. Public output has URLs,
   counts and hashes only. Full articles and request states stay private. The
   freeze refuses existing output files, in-checkout private packs and capture
   infrastructure failures. It creates no fake article or fabricated HTML.
3. [The paired module](../../tools/rss-paired-eval.mjs) verifies the exact pack,
   classifier source hashes and request hashes before transport. Old/new requests
   contain identical article state and independently pinned v2/v3 questions.
   Known source/extraction failures never invoke the executor. Cache reuse is
   disabled for the study; old refetched trial verdicts cannot stand in for
   controlled same-snapshot pairs. First-arm order alternates deterministically.
4. `runPaired` accepts an adapter supplied by the reviewed existing private runner,
   not a key, environment file or SDK. There is no live CLI or provided adapter.
   The adapter must verify current billing terms and enforce durable run-wide
   attempt/spend claims, single physical attempts, no hidden SDK retries and
   idempotent attempt IDs. Its contract declaration is **not proof** that its
   implementation does so; review the actual runner before invoking it.
   The local harness reserves and checkpoints before every awaited call. A
   pending/crashed attempt stays reserved and is never resent. It rejects
   altered/duplicate journals, stops on model/billing-bound violations and does
   not log transport exception messages, raw responses or article text.

The old baseline is `0e72a35be0fa663167acd7de2c7dd9a8dfbdfc4c`; its classifier is
byte-identical to captured production v6. The new classifier is the PR95 v3
source. Exact source hashes in the pack prevent a moving branch silently changing
an arm. This workflow does not assemble or deploy a new Edge entrypoint.

## Cost per judgment and reporting

The [official model price](https://docs.typesafe.ai/models), checked **2026-10-05**,
is USD 0.042 per million input tokens for `jev-1.13.0`, with free output tokens.
The documented request context is 64k tokens. A conservative **65,536-token**
reservation is about **USD 0.0028 per physical attempt**, or **USD 0.0661 for 24**,
below the approved USD 0.10 ceiling. This is a context-bound reservation at the
documented price, not a measured input count or billing guarantee. The private
executor must verify those terms and enforce both caps. No cached-input discount
is documented, so none is assumed.

Every attempt records requested/recognized response model, rubric/cache version,
request hash, status, cache hit, provider-reported input/output/cached tokens when
available, pricing source/date, token-based USD estimate and full reservation.
Invoice charge remains null unless separately reconciled; this harness has no
invoice access. Missing/invalid usage or an unrecognized model produces an
**unknown estimate**, retains the full reservation, and never gets a zero-cost
label. Reported cached tokens are kept as metadata without an invented discount.
Provider/schema failures with valid usage are included in aggregate cost.

The report includes per-attempt records, old/new arm totals, each article's paired
cost, failed-attempt known cost, unknown-usage counts and aggregate reservations.
Mean cost per attempt divides the total estimate by all physical attempts.
Mean cost per successful article divides total cost, including failures, by
distinct articles with at least one valid classifier decision; each arm also
reports its own denominator. A valid rejection/uncertainty/unreadability decision
counts as a completed classification, not an approval. Complete means remain
null when any usage is unknown. Fully valid paired articles are counted separately.
Caching effects remain **unmeasured**; the deterministic cache tests establish
identity/reuse behavior, not real token/billing savings.

Current paid execution has no attempt records, no reported token usage, no
measured per-attempt/per-article mean and no invoice measurement. Nothing about
cost or classifier accuracy was inferred from the mocked harness's token counts.

## Verification and remaining validation

`npm run test:rss-quality`: **92 pass**, including nine new headless checks for
label-free paired state, snapshot/code integrity, 24 sequential single attempts,
pre-transport journaling, resume without retries, failure cost accounting,
missing/cached usage, contract-bound stop conditions and infrastructure failures
remaining outside source/classifier outcomes. All provider transport is mocked.
Typecheck passes with 34 pre-existing diagnostics; `git diff --check` passes.

The earlier deterministic comparison remains 11 synthetic scenarios / 17 cases:
six optional-metadata mutations recover the same valid core article; core
outcomes are unchanged. That is validator behavior, not real classifier accuracy.
Historical counts remain **46 completed = 36 approved + 1 candidate + 9 errors**,
with 37 valid classifier decisions, seven schema errors, two source errors and
44 provider reservations. Reservations do not establish billed/successful calls.
The seven original malformed numeric responses remain unreconstructed.

After safe execution becomes available, freeze complete inputs and obtain human
label review before either arm. Compare promotion false accepts, substantial
gallery/independent-report retention, candidates and valid core exclusions;
separate provider/schema/source/extraction failures. Human-confirmed false
exclusions remain unmeasured until positive reference labels are reviewed.
Keep client OFF. No production mutation, merge/deploy, paid call or 235 action
has occurred during this headless preparation.
