# Lookup quality evaluation

The production response remains `kind`, `canonical`, `members`, and one short `ko` (120 output-token ceiling). The model, output shape, and normal one-call path were preserved. The selected prompt lives in `server/dict/lookup.ts`; validation and bounded provider recovery are exercised by `tests/verify-lookup-contract.mjs`.

## Local regression (no external AI)

```sh
npm run test:lookup-quality
BROWSER=webkit node tests/verify-lookup-quality-browser.mjs
npm test
```

The browser fixtures use a clean browser profile and synthetic book/vocabulary data. They do not read the user's account. The output directory defaults to `/tmp`; `AUDIT_OUTPUT` can select an existing artifact directory.

## Live evaluation

`run.mjs` uses a dedicated, authenticated evaluation endpoint, not the public production `dict` endpoint. The temporary endpoint used for this task was deleted after testing. It ran the same source and provider configuration, with a random evaluation token and an expiry, and did not modify user vocabulary or production quota rules.

To rerun, provision an explicitly authorized evaluation endpoint with the current lookup source and configure `BREEZE_EVAL_URL` and `BREEZE_EVAL_TOKEN`, or provide a private JSON file `{ "url": "...", "token": "..." }` via `BREEZE_EVAL_ACCESS`. Never commit credentials. The endpoint accepts ordinary lookup input plus `variant`, and returns `{answer,valid,provider,attempts,usage}`. Normal authentication/quotas on the production endpoint are not to be bypassed for these tests.

```sh
VARIANTS=baseline,candidate node benchmarks/lookup-quality/run.mjs
SUITE=holdout VARIANTS=candidate REPEATS=3 node benchmarks/lookup-quality/run.mjs
node tests/verify-lookup-live-browser.mjs
```

The last command also consumes live AI calls; it is deliberately excluded from normal npm tests.

## What the scores mean

- Exact: kind + canonical + complete member-index array, plus nonempty Korean. This is not a Korean semantic accuracy score.
- Expression recall: expression predicted for expression fixtures. False expressions on ordinary combinations are recorded separately.
- Korean pattern match: a rough screen only. It can miss correct synonyms and accept awkward wording. Raw Korean was also inspected; residual sense errors are documented.
- The 188-case development corpus predates these prompt edits. It includes some debatable lexical boundaries (e.g. optional copulas or headword variants); gold answers were not relaxed to improve the headline score.
- The additional corpus has 40 new sentences plus three targeted regressions. It was used repeatedly during development, so the final evaluation is not an untouched blind generalization test.
- `usage` describes the final successful provider response. It does not include all failed/retried attempts; do not use its sum as total billing. `attempts` records recovery activity.

Final source and exact run paths, failures, limitations, and deployment status are in [the implementation report](../../docs/lookup-quality-2026-09-21.md).
