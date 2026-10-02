# RSS filter verification and retention evaluation

The implementation is a draft. **Real Jev quality improvement and retained
inventory on the 106 browser-reviewed articles are unmeasured.** No live Jev
calls were made; no production changes, secret reads/copies or paid evaluations.

The independently supplied audit identifies clear coupon/promotional failures,
unsupported interactive experiences and useful prose across sources. Sensitivity,
difficulty and length alone are not negative reference labels. Gallery omissions,
minor footer clutter and publication announcements require contextual review;
missing images do not automatically mean the prose is unusable. Only the WIRED
STEM example was independently checked as truncated against its original; do not
upgrade other notes into completeness certificates. Pages can change after audit.

## Live evaluation blocker and frozen plan

The existing secret resides in Supabase. Available read-only tools list the project
and functions but cannot execute this new evaluator in that environment or verify
its secret name. No permitted local key is available. Running the comparison now
would require deployment/new server execution or exporting a secret, outside the
PR-only boundary. Existing deployed functions were not repurposed.

Freeze `rss-quality-v1`, `jev-1.13.0` and reference labels **before** a future run.
Use the supplied original 106 URLs; fetch/extract actual public content without
putting reviewer notes or labels into the model state. Split a holdout before any
tuning. Report any sample-driven tuning and do not claim general accuracy from it.
One call per successfully extracted unique content identity, at most 106 calls,
concurrency <=2 and no automatic retries for this run. Access denial/extraction
limits stay unavailable, never low-quality labels. Store metadata/results only,
not full article bodies. Record input/output usage; current documented price is
$0.042/million input tokens (output free), so calculate actual cost from usage,
not a guessed per-article cost. A 106-call run at the documented 64k total input
context maximum would be about $0.285; this is a ceiling estimate, not a bill.

`node tools/report-rss-quality.mjs reference.json results.json` produces an offline
report. Reference: `{url, source, label: positive|negative|ambiguous}`. Result:
`{url, status: approved|rejected|uncertain|pending|error, mode: live,
metadata: {topic, words}, usage: {inputTokens, outputTokens}}`.
No omitted result is assumed approved. It reports by-source status counts,
approved positives, false hard rejections, unresolved positives, rejected and
admitted negatives, measured empty sources, retained topics/lengths, and usage.
It refuses to mark improvement measured for incomplete or mocked cohorts.

Measure both semantic precision and availability: a low false-rejection rate can
hide a large uncertain/unavailable share. Compare 106 before-candidates with final
approved count, per-source counts and empty/low inventory. Count lost cover/import
failures separately. Inspect long investigative, political, medical and horror
prose among positives. Do not equate a narrower entertainment mix with quality.
The current 60,000-character operational limit and 200/day budget may defer useful
articles; their real impact needs this run before rollout approval.

## Offline evidence

- 33 quality tests: 16 original synthetic/paraphrased audit scenarios, strict
  provider output validation, injection boundaries, size/config/failure handling,
  cache identity, public extraction, Medium owner feeds, cross-reader cache reuse,
  coalescing, advancement past rejected candidates, outage retention, changed-body
  invalidation, fixed HTTP inputs and local Postgres permissions/leases/budget.
- The synthetic provider responses assert policy wiring only. They do **not** show
  that Jev correctly classifies coupons or that these percentages hold live.
- Existing 30 recommendation tests pass; the local ranking algorithm is unchanged.
- Chromium quality test covers pending/approved/rejected/outage/saved states and
  phone/tablet/desktop/short viewports in light/dark. An outage retains the same
  decoded card DOM node; pending cannot leak rejected or unreviewed cards.
- Chromium variants of existing ingestion, RSS-card and article-preview browser
  suites pass using system Chromium. Source files were temporarily restricted to
  that engine locally; committed regression suites still run Chromium + WebKit.
- WebKit unavailable locally: Playwright download returned HTTP 403 Domain
  forbidden. The new browser test is included in Integrity CI for both engines.
- Full `npm test`, browser typecheck baseline and Deno entrypoint check pass.
  No lint script exists; syntax and `git diff --check` are used.
- SQL runs only in local PGlite with anon/authenticated/service_role test roles.
  No live migration, advisors, runtime deploy or physical iOS checks were run.

Browser screenshots are local `/tmp/breeze-rss-quality-proof/`; they contain only
synthetic card metadata. Live screenshot comparison/106-article API results are
not present and must not be inferred from these fixtures.
