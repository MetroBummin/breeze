# RSS redesign: offline evidence and rollout boundary

Base: main `d3d97ea` (includes merged #75). Original #74 head inspected:
`d35a7926ae69be5caa3a4fd53eac5a55f45c5f7d`. No changes to #74/#75 branches or PRs.
The new PR is independent of #74 and does not include unrelated FSRS changes.
While CI ran, #77 merged to main `480ffe0`; this branch merged that main update
and regenerated the conflicting service-worker stamp. Study UI/release files
match main. Draft #76 `fcb0f8f` was inspected read-only: its NASA fix, safe schema
diagnostics and honest report boundary align with this redesign; its archived
results remain unchanged. #76 still depends on #74, not this PR.
Selected #74 modules and regression tests are reused with v2 policy changes;
the schema is an offline fixture, not a pending production migration.

## Actual versus not run

Reproduced from the immutable #75 artifacts: **17 pass, 4 reject, 73 pending,
12 error** over 106 exact unique URLs. Distinct pending causes: 70 extraction
confidence, 1 promotion confidence, 2 evidence confidence. Errors: 6 bad URL,
1 insufficient extracted body, 5 invalid provider responses. The old responses
cannot recover missing schema-failure details. Five of nine sources have zero
passes. These counts do not establish that the unresolved articles are bad.

[Paired per-source and per-URL report](rss-readiness-20261002/paired-baseline.json)
marks all **106 v2 results unmeasured**. No paid calls, new fetch evaluation,
accuracy, false-rejection or improvement claim. Synthetic provider fixtures
verify policy wiring only. No real-model v2 retention result exists yet.

The user Library dataset was resolved with the Library skill, but its supported
materialization download failed in this executor. No readable local bytes were
produced. The exact URLs and prior results are available in the committed
baseline, so paired tooling uses those. Korean browser observations and
subjective review were **not** reconstructed or compared and never enter prompts.

## Verification

- 46 quality tests pass, including readiness, schema, fallback, cache and paired reporting; 26 audit/security and 31 recommendation tests also pass.
- Full `npm test` passes; browser typecheck remains at the existing 34 diagnostics.
- System Chromium passes quality pending/approved/rejected/outage/saved states
  and eight viewport/theme checks. Legacy ingestion, RSS card and Article Preview
  Chromium regressions also pass. Final remote CI is recorded in the PR.
- Local PGlite executes only the offline schema fixture and checks role denial,
  RLS, claims, lease fencing, concurrency and daily budget.
- Playwright browser download returns HTTP 403 in this executor, so local
  WebKit is unavailable. Integrity CI runs Chromium and WebKit.
- No production migration, deployment, secret changes, merge or release.

Reproduce:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run test:rss-quality
npm test
node tools/compare-rss-quality.mjs docs/qa/rss-106-20261002/results.json
# Optional independently collected v2 response fixtures; no live call:
node tools/replay-rss-quality.mjs /path/to/v2-snapshots.json > /tmp/v2-results.json
node tools/compare-rss-quality.mjs docs/qa/rss-106-20261002/results.json /tmp/v2-results.json
node tests/verify-rss-quality-browser.mjs
```

[Decision and activation/rollback plan](../decisions/014-rss-readiness-shadow.md).
Remaining risks: uncalibrated confidence/evidence, extraction false withholding,
snapshot drift, cold inventory and bounded retry exhaustion. Bounded live
evaluation requires separate approval; default behavior remains off/legacy.

## Review follow-up: same-URL stale click binding

Reproduced the P2 on `eb9362d`: active refresh changed the quality key/import
URL/title, but URL-only DOM reuse retained the previous onclick entry (`old`
instead of `new`). Cards now reuse decoded DOM only when their full import
payload, visible metadata and content/version/verdict identity match. Checked-at
and ranking-only changes do not discard unchanged cards. Changed cards replace
the old node; authoritative revocation still removes them. Unit and real-browser
refresh-and-click regressions verify the new key, read URL and title.
