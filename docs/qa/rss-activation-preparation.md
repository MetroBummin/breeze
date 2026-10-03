# RSS activation preparation (build231 base)

No activation, deployment, paid call, key export or main merge is performed by this PR.
Client `RSS_QUALITY_MODE` remains `off`; build231 version files are unchanged.
Offline verification:109 targeted quality/activation/security/recommendation tests
passed; full `npm test` passed; cached Deno typecheck passed; Chromium RSS browser
states and eight viewport/theme checks passed. WebKit was not run because its
binary is unavailable in this executor. All provider calls in these tests are
mocked. Live v2 measurements and live shared-cache proof remain not run.
Production management read-back on2026-10-03: `rss-quality` v3 is the original
503 `{mode:'off',configured:Boolean(JEV_API_KEY)}` preflight, `verify_jwt:true`.
Dashboard's default token reached it but failed an explicitly approved temporary
service-role predicate. The predicate was removed by the parent. Do not assume
Dashboard's default tester has operator permissions. The denied temporary admin
execution route must not be retried or replaced without approval.

## Files and schema

The previously applied migration `rss_readiness_shared_cache` is represented by
`server/rss-quality/schema/rss_article_quality.sql`. Do not apply it twice.
The additional reviewed schema is `server/rss-quality/schema/activation.sql`;
apply separately with the supported Supabase migration tool, only after approval.
It starts OFF and creates no new credentials, roles, public grants or definer RPCs.
RLS/private service grants cover the mode, immutable106 slots and diagnostic events.
Generate the exact full-function deployment payload offline:

```
node tools/rss-activation/bundle.mjs > /tmp/rss-deployment.json
```

All relative dependencies, pinned npm config and lock are included. Use the
supported deployment tool with `verify_jwt:true`, explicit project
`hrtfhojbhqvaoiulspto`, and this payload. Do not use the stale root config project.
Missing control/schema/key fails closed. Mode comes from the service-only DB
control; no environment-secret mutation is needed for OFF/shadow/active changes.

## Evaluation and secure execution gate

The fixed cohort is `server/rss-quality/cohort.json`:106 exact unique archived
URLs/IDs/source/title from `docs/qa/rss-106-20261002/results.json`, originally the
user's Library `libfile_12a2c06b2ea88191af6d4482e26571bd`. Only those four fields
are included; no observations, subjective review, gold labels or prior answers
are provided to the classifier. The committed baseline avoids needing a Library
download for URLs; exact URL/order identity is tested.

The POST operator endpoint additionally requires the existing service-role JWT
exactly, beyond gateway verification. Anon/user JWTs cannot evaluate or warm.
Do not paste or export that JWT to the agent, disable JWT, add a public admin
route, create credentials, or invoke through database HTTP/cron. A supported
secure admin execution method must be authorized before operator work is run.
The current Dashboard default token is insufficient; this remains a real gate.

After that gate, use service-only SQL to set shadow and a6-hour window:
`update public.rss_quality_control set mode='shadow',evaluation_until=now()+interval '6 hours' where id=true`.
Submit one POST per ID with `{"operation":"evaluate","id":"RSS-001"}` through
that approved method; at most2 concurrent requests, no retries. Fixed durable
slots are claimed once before extraction. Two running slots block further
claims; a crashed slot is never reclaimed. Stop on failure and inspect results,
not by resetting slots. Expiry blocks additional evaluation claims.

106 jobs can each cause at most one provider attempt, so maximum106 attempts;
cache hits/extraction failures consume fewer. The existing global200/day claim
budget also applies to evaluations and warmup, preventing additive overruns.
At checked Jev price $0.042/M input and64K context, reserve65536 input tokens
per attempt:106=$0.29177 (under$0.30),200=$0.55051 (under$0.56/day).
Recheck model pricing/context before running. These are conservative Jev-only
reservations, not total Supabase charges. Unknown token usage remains unknown.
Do not run baseline model again: that would need additional paid authorization.

Use `tools/rss-activation/status.sql` for per-day attempts, hit/miss/busy, status,
schema details and token/cost aggregates. Export eval id/result arrays using
`export-results.mjs`, then compare with `tools/compare-rss-quality.mjs` and the
archived baseline. Its per-source counts/causes/usable inventory and auditable
exclusions retain null accuracy/false-rejection metrics without reference labels.
Different fetched content is not a controlled same-snapshot comparison.

## Shared cache proof, inventory and client release

Cache identity is canonical URL + title/body/links/extraction + model/rubric.
Decisions are shared across users. Offline regression proves two same-content
runs invoke the mocked provider once. Before release verify live budget/cache
rows before and after repeated reads by two clients: valid feed lease reads add
zero provider attempts. After the10-minute feed lease, refresh the same unchanged
content and confirm cache hit events and unchanged budget. Changed content may
legitimately consume new attempts and must never inherit approval. Do not reset
leases solely to force paid calls. Test revocation/error retention offline too.

In shadow, operator POST `{"operation":"warm","feed":0}` through feed12.
Only3 bodies per feed per10 minutes, with existing shared feed leases. Count all
warm attempts against the same200 daily budget. First sweep<=39 attempts, but
not a guarantee of39 usable cards. Inspect all13 sources with `status.sql`;
106 historical URLs cover only9 sources. Do not activate with an unexplained
empty inventory. Resolve pending/error causes and inspect genuine exclusions.
Long/difficult/sensitive articles are not automatically poor quality.

When actual evidence and all13-source inventory have been accepted, change DB
mode to `active`, verify GET feed0..12 using the existing public anon JWT, then
have the release owner change only `RSS_QUALITY_MODE` to `active` and perform
client browser/aggregate checks and the separately coordinated release.
Successful server results are authoritative; revoked or changed approvals cannot
return through client fallback. Preserve this PR OFF until those gates pass.

Rollback: client mode OFF plus DB control mode OFF (cancel pending work by
stopping requests; already claimed work may finish). OFF prevents new work;
existing cached diagnostics remain private. Do not delete audit/cache, widen RLS,
merge old#74 gates or restore old-rubric approvals. Retain events for the user's
few-day cost review, then agree a retention period; existing code logs no bodies
or secrets. Background telemetry can fail: console `write_failed` is explicit,
so database event counts are not asserted to be complete billing records.
