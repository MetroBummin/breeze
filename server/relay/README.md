# Breeze book relay — development server, OFF by default

Start with `../../docs/relay-handoff.md`. No client code is included or modified.

## Local verification (no credentials, no network)

```sh
cd server/relay
npm test
npm run check
```

Tests run the real Worker request handler through localhost HTTP, real P-256 proofs,
and dummy ciphertext. Postgres/R2/Auth are explicit test doubles. The three static
SigV4 vectors were independently generated with botocore 1.43.18; regeneration is
optional (`python test/sigv4-vectors.py`). Runtime has no npm dependencies.
`test/database-checks.sql` is a separate, NOT EXECUTED database acceptance check.
Wrangler build/deploy, real JWTs, S3 behavior and iOS are NOT established by these tests.

## Infrastructure status — Supabase applied, Cloudflare not run

1. Restore callable Cloudflare connection. Read actual account ID, Workers plan,
   R2 enablement/billing, existing Workers/buckets, usage and rate-limit namespaces.
   Confirm creating NEW `breeze-book-relay-dev` names is collision-free. Never overwrite.
   `26092001` is only a proposed namespace; replace if used. No D1/DO/KV needed.
2. Supabase relay schema was applied on 2026-09-20 to **Breeze** ref
   `hrtfhojbhqvaoiulspto`, Org `nxnssinjzlxqnkwlbwmp` as migration
   `20260920053847 / add_breeze_relay_v1`. Ready was not touched.
   `test/database-checks.sql` passed after apply. The available SQL connector runs as
   `supabase_read_only_user`, so service-role runtime RPC/CAS still requires the Worker path.
   Do not create a paid Supabase branch implicitly and do not blindly re-apply the migration.
3. Create a NEW Standard R2 bucket, PRIVATE, with r2.dev disabled and no public
   custom domain. Restrict S3 credentials to this bucket. Verify via API/dashboard;
   R2 does not implement AWS bucket ACL/public-access-block settings identically.
4. Apply the two `.s3.json` files through S3-compatible API tooling, not Wrangler's
   differently-shaped lifecycle JSON import. For example, after setting a dedicated
   AWS profile and account endpoint securely:

   ```sh
   aws --profile breeze-relay-dev --endpoint-url "$R2_ENDPOINT" s3api put-bucket-lifecycle-configuration \
     --bucket breeze-book-relay-dev --lifecycle-configuration file://r2-lifecycle.s3.json
   aws --profile breeze-relay-dev --endpoint-url "$R2_ENDPOINT" s3api put-bucket-cors \
     --bucket breeze-book-relay-dev --cors-configuration file://r2-cors.s3.json
   ```

   Read back both policies. Permit only approved actual app/dev origins in BOTH
   Worker and R2 CORS; never `*`. No multipart upload API is issued by v1, but
   incomplete multipart cleanup is still configured as a safety net.
5. Database acceptance already confirms RLS ON, no anon/authenticated grants or relay policies,
   and service-role-only RPC grants. No vault/progress tables were changed. Still run the
   real Worker/service-role CAS/JWT path once Cloudflare is available. The service-role secret
   itself has broader project privilege: isolate it.
6. Install/review Wrangler >=4.36, pin the chosen version in your deployment toolchain.
   This environment could not install/build Wrangler. Run a dry build first.
   Set names from `.dev.vars.example` with `wrangler secret put NAME` on this NEW
   Worker only; restrict allowlist to 1–5 test-account UUIDs. Never print values.
   Set actual account_id for Wrangler after read-only account verification.
7. Deploy only after approval. Keep `workers_dev:false`, `preview_urls:false`,
   `RELAY_ENABLED:false` until private ingress/access and test origin are approved.
   No public endpoint/URL exists yet. `INFRA_VERIFIED:true` is an operator assertion,
   not automatic validation: set it only after all checks succeed. Configure Cron
   and verify cleanup executes even while API grants are OFF.
8. Test real R2 PUT length enforcement, signed conditional headers, browser Blob
   upload, GET ETag, CopyObject races, URL expiry, no public read, and actual
   Supabase Auth + RLS/CAS. Enable test-account-only API after those checks.

## Cost and deletion boundaries

R2 Standard docs checked 2026-09-20 list 10 GB-month, 1M Class A and 10M Class B
monthly free included usage and free internet egress. That is NOT unlimited free
storage/requests. Stage PUT + server-side Copy cost two writes and temporarily
store two ciphertext copies. HEAD, GET, polling, Cron listing and Supabase Auth/RPC
also consume resources. At 5-minute cron cadence the baseline list count is 288/day,
plus conditional work; no guarantee this fits the user's unverified Cloudflare plan.
No paid plan or billing configuration was changed. No global hard spend cap is
implemented; short-lived leaked grants can be replayed and consume operations.

Access deadline is first upload grant + configured TTL (default/max 24h), never
extended by upload retries. Existing grants are <=60s, bounded by that deadline.
All recipients ACK/waived -> immediate delete attempt. SQL reservation remains
through the URL/in-flight quiet period; cleanup then rechecks. Cron every 5m handles
expiry/retries. R2 lifecycle is a backstop, NOT exact 24h physical deletion. Orphan
scan is bounded to 100 objects/page in the dedicated prefix; very late writes,
platform outages, or stopped Cron can delay deletion. Eight cleanup failures make
an explicit dead letter; inspect and retry. Expiry still closes an active transfer
after its stale-attempt cleanup budget is exhausted.

## Primary references

- https://developers.cloudflare.com/r2/api/s3/api/
- https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- https://developers.cloudflare.com/r2/buckets/object-lifecycles/
- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- https://supabase.com/docs/guides/auth/jwts
