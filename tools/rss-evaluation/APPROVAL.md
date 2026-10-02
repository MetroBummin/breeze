# One bounded RSS evaluation (not production rollout)

Target verified through Supabase: **breeze / hrtfhojbhqvaoiulspto** (Seoul).
Keep `supabase/config.toml` unchanged; never use its different default ref.

Deploy only `rss-eval-106` and its reviewed local dependencies from PR #74,
and apply only `tools/rss-evaluation/setup.sql` (CLI-generated temporary migration archived after cleanup) (not the #74 rollout migration).
Temporary table contains 106 public URLs/titles, statuses, hashes and result metadata;
no article bodies or user data. Service-role-only privileges + RLS, invoker RPC.
Endpoint has a random 256-bit bearer credential (only its hash deployed), six-hour
expiry and no CORS. Jev key stays in existing server environment; no key export.

Paid cap: **106 requests, concurrency <=2, no retries, Jev <=US$0.30**.
Current official price https://docs.typesafe.ai/models.md: $0.042/M input tokens,
output free, max 64k input/request; 106 * 64,000 * .042 / 1e6 = $0.284928.
Calls that time out remain spent; restarting cannot reclaim a work slot. Supabase
uses the existing project allocation; no paid plan/resource provisioning occurs.
Price changes invalidate this approval estimate; stop if observed cost/usage conflicts.

Freeze #74's `rss-quality-v1:jev-1.13.0:readability-0.6.0-v1`. Fetch current
public content with its SSRF-safe extractor; do not bypass paywalls or send notes.
Original 106 exact URLs are retained. Deterministic ~20% URL-hash holdout is frozen
before any tuning. No thresholds will be tuned in this first run.

Export all metadata and excerpts; disable the endpoint after the run, then remove
only this temporary function/table/RPC. Existing dict/article/RSS functions, client
recommendations, secrets, project settings and app production deployment stay unchanged.
All errors stay errors; uncertainty/running/queued stay pending. Human gold count is
zero, so formal false-rejection rate remains null. Reviewer notes support triage,
not a claim of measured accuracy or original-article completeness.
