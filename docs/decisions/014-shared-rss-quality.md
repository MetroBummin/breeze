# Shared public RSS article quality

2026-10-02. Supersedes the no-AI/no-server-requests portion of decisions 008/010
for the built-in recommendation feeds only. User imports, word lookup, private
reading history, Preview, Reader and the local preference ranker keep their owners.

## Ownership and admission

The `rss-quality` Edge Function accepts GET with one integer `feed` ID (0–12).
It does not accept a URL, article body, judgment, device ID, history or refresh
bypass. It fetches the fixed public feed and extracts its entries server-side.
An article URL must come from that fetched feed; Reddit outbound links are taken
from the public feed, not the caller. Every fetch/redirect uses the existing
DNS-pinned public transport with private-address rejection, HTTP(S)/port checks,
3 MB streaming limits and 12-second deadlines. No cookies, login or hidden content.

Readability 0.6.0 runs in an inert LinkeDOM document. Extraction retains the
existing 500-character, 25,000-element, explicit-paywall and English-language
checks. Medium owner/publication feeds supply public full bodies; summaries,
restricted content and unsupported self-posts are withheld. Server extraction
and the browser's semantic renderer are separate adapters around the same
Readability version, so byte-for-byte parity is not promised. A verdict does not
certify original completeness, factual truth, image delivery or Reader fidelity.
Client cover decode and import checks still apply. Image counts, omitted embedded
elements, declared list counts and extracted section counts are evidence hints.

Jev receives the full bounded extracted text (never the 540-character Preview),
numbered paragraphs, bounded links and extraction facts. Text over 60,000 chars
stays unavailable for this evaluator; it is not truncated, passed, or permanently
rejected. This operational limit can reduce long-article availability and must
be measured separately from semantic rejection. Nothing enters shared storage
from private URL entry or a user's imported document.

## Rubric and output

Pin `jev-1.13.0` and `rss-quality-v1`; the cache version also includes the
Readability/adapter version. Each independent TypeSafe Choice question separates:

- Hard defects: primary coupons/promotional spam, clear extraction failure or
  unsupported interactive/gallery dependency, severe title/body mismatch.
- Ranking qualities only: substance/readability, supplied context, interest.
- Description only: topic, sensitive material, news/evergreen, word/character count.

No hard exclusion for length, difficulty, politics, horror, health or controversy.
Reviews and useful buying guides are not coupons merely because they link products.
Original synthetic audit scenarios protect this distinction in contract tests.
They are mocked provider answers, not evidence of real model accuracy.

All article-controlled fields are untrusted state, never question instructions.
No tools or link following are granted to Jev. Closed-set outputs, probability
keys/sums/ranges, selected maxima, derived confidence, evidence IDs and exact
model identity are validated. Rejections require a confident hard defect (>=.75)
and a paragraph evidence selection (>=.5). Evidence is a source excerpt capped at
180 characters, not generated reasoning. Confidence is distribution concentration,
not an empirical accuracy guarantee. Ambiguous/unsupported answers stay uncertain.
Descriptive/ranking low confidence never becomes a hard exclusion. Prompt
boundaries reduce injection risk but cannot prove model immunity; adversarial
live calibration remains necessary before rollout.

Validated private cache rows hold reason codes, evidence, uncertainty, all bounded
answers, token usage when supplied, model/rubric and content identity. Public
inventory exposes only article/card metadata and approval version/key/time;
provider answers/evidence and credentials are not exposed. The model's ranking
attributes are stored for evaluation; this PR deliberately keeps local ranking.

## Shared work and availability

A SHA-256 identity covers canonical resolved URL, title, complete extracted body,
links, extraction facts, rubric, pinned model and extraction version. Tracking
parameters/fragments are removed; meaningful query parameters survive. A new body,
title or version needs a new verdict. Equivalent unknown redirects are not guessed.

Service-role-only Postgres claims serialize through an advisory transaction lock.
They reuse completed verdicts, allow at most four concurrent evaluations and 200
attempts/day across **all readers and isolates**, and issue fencing tokens. Leases
expire after 90 seconds; Jev has a 10-second timeout, refresh a 70-second deadline.
There is also per-instance coalescing. Approved/rejected results are reused for
the same identity; uncertainty retries after a day, failures after an hour.
Crashes recover after lease expiry. Exactly-once billing across a crash after a
provider accepted a request is impossible without provider idempotency: a retry
may pay again. The durable budget counts attempts, including failures/crashes.
No immediate provider retries and no per-reader paid quotas are needed.

A database feed claim runs at most once/10 minutes, processes three candidates,
and persists a cursor so rejected/saved first entries do not block later ones.
GET returns current inventory immediately and schedules bounded background work.
Maximum inventory is 20 approved entries/feed, valid for seven days. Old approval
is removed when changed content is observed; transport failures retain last-good
inventory. Cache write failures never publish a new approval. Refresh order and
existing decoded card nodes remain stable through the local ranker.

Cold clients poll at most four times at 20-second intervals, then stop until the
next refresh. Empty/pending state says new articles are being checked. Cold start,
provider outage, extraction failure, budget exhaustion or unavailable images can
leave fewer cards or an empty rail. It never falls back to unreviewed content.
A small feed budget and cursor can defer a particular source; current live source
coverage is unmeasured. Tune budget/cadence only with measured retention and cost.
Legacy custom sources remain saved, but are not in the shared recommendation
allowlist; explicit user URL imports still work locally. This is a deliberate
availability/privacy boundary, not silent submission of custom sources for AI.

## Database and rollout boundary

All three tables enable RLS and explicitly revoke PUBLIC/anon/authenticated.
Only service_role can read/write tables or execute the SECURITY INVOKER claim RPC.
Explicit grants accommodate Supabase's changing Data API exposure defaults.
No cron job, production query/migration, deployment or key change is performed.
A local PGlite Postgres run checks SQL, role permissions, fencing, leases and caps.

Read-only project discovery found `breeze` (`hrtfhojbhqvaoiulspto`). The repository
`supabase/config.toml` still says `fqvhlyocdkwiyioiokte`. Resolve/confirm the target
before a separately authorized rollout; do not blindly run a linked deploy.
The existing key name is `JEV_API_KEY`; the function reads it server-side alongside
existing Supabase service credentials. The session could not verify secret-name
presence or live authorization without exporting a key or deploying code. Missing
key leaves inventory pending and makes no Jev calls. Do not create/rotate keys.

After review and separate rollout authorization: verify the target and existing
secret name in its dashboard; validate the migration/advisors in staging; run the
bounded real evaluation described in the QA note; apply migration and deploy
`rss-quality` before releasing the client. Warm and inspect approved inventory
before client rollout to avoid cold empty rails. Roll back the client integration
if needed; do not delete shared verdicts or modify word lookup as a workaround.
Routine retention maintenance may delete obsolete verdict versions and old budget
rows; no retention job is installed by this PR.

## Verified documentation

Checked 2026-10-02:

- https://docs.typesafe.ai/api — bearer `/v1/systemone`, state/questions, Choice response.
- https://docs.typesafe.ai/models — pinned model, context bounds and moving aliases.
- https://docs.typesafe.ai/confidence — confidence calculation and domain calibration.
- https://supabase.com/changelog — relevant new-table API exposure breaking change.
  The markdown index was unavailable; the HTML changelog and official MCP docs worked.
- https://supabase.com/docs/guides/functions/secrets — existing server environment access.
- https://supabase.com/docs/guides/database/postgres/row-level-security — privileges/RLS.

The installed CLI wrapper failed before command parsing because its home directory
was read-only; an older CLI's binary download also failed. Migration scaffolding
was created directly with a UTC timestamp and executed **only** in local PGlite.
