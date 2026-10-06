# Shared RSS catalog preparation for the next TestFlight build

Based on main `f7a2889296226f1ebca03cdcc45d09b739b05e88` (PR #103).
The parent owns production execution, activation, combined integration and merge.
No production write, publisher fetch, paid call, credential export, Apple action
or release-counter change was performed by this preparation.

## Verified inventory

Read-only connector inspection on October 6 found the app project
`hrtfhojbhqvaoiulspto` has no `rss-catalog` Edge Function, no
`public.rss_public_catalog` table, and no `rss_catalog_claim(uuid)` RPC.
`pg_cron` and `pg_net` are absent; Vault is installed. Existence-only checks found
neither the proposed `rss_catalog_service_role` nor conventional
`service_role_key` Vault reference. No secret value was queried.
Repeat role checks deny anon/authenticated Vault schema/read privileges;
service_role already has decrypted-view read privilege. The new reference uses
the existing service-wide credential, not a newly scoped key, so owner entry and
action-time approval are necessary security steps.
The repo already contains the PR #99 prototype, and the client opt-in is absent.
CLI config points to `fqvhlyocdkwiyioiokte`, the separate Ready project, whose
function inventory contains only Ready. Always name the app project explicitly.

## Changes requiring parent review before production writes

- Snapshot schema: RLS enabled, no anon/authenticated/PUBLIC table or RPC access,
  service-only read/cache/lease writes. Only the database owner can update the
  `active` switch, default false. Either transition clears cached inventory and
  fences previous workers. All functions use SECURITY INVOKER and empty search
  paths. No user, account, history or custom-feed table is touched.
- Edge Function: `verify_jwt=false` intentionally exposes a public metadata GET.
  POST compares the existing server service key directly and accepts no URL,
  feed list, query or nonempty body. Forged roles and public/user credentials do
  not authorize it. Public reads never claim, fetch or write.
- Optional refresh ownership: enable `pg_cron`/`pg_net` on the existing project,
  install a private postgres-owned enqueue function and one disabled job.
  Explicitly revoke public/service access to network queues, functions and cron
  schema so queued authorization headers cannot be read through the Data API.
  This affects the newly installed extension schemas; reinspect existing uses
  if another worker installs them before this plan executes.
- Runtime settings: environment mode stays OFF; reviewed feed IDs default empty;
  database switch and scheduler default OFF; client configuration stays OFF.
  Reuse the owner's existing service credential through Vault; create no key,
  credential, project, branch, external scheduler or paid service.

## Exact deployment and warm-up order

1. Reinspect project and existing objects, source permissions/attribution and
   PR #104's final photo policy. Use the parent's reviewed fixed-ID list; the
   thirteen sources in synthetic tests are not a live permission decision.
   These are the existing Decision 015 gates, with the user's standing approval
   and the parent's production ownership preserved.
2. Generate connector arguments from the exact integrated commit:
   `node tools/rss-catalog-bundle.mjs > /tmp/breeze-rss-catalog-bundle.json`.
   `migration` is the argument object for `supabase_apply_migration`, named
   `rss_public_catalog`. `deployment` is the complete argument object for
   `supabase_deploy_edge_function`: app project, function name, exact entrypoint,
   import map, lockfile and all relative dependencies, with custom POST auth.
   The existing schema file is the reviewed migration input; it is not added to
   automatic CLI migrations against the unrelated Ready project.
3. Apply `migration` and deploy `deployment` while environment mode is OFF.
   Read back function files/hashes, `verify_jwt`, schema, RLS and grants. Check
   advisors for this change and perform actual role/RPC denial checks. OFF must
   return 503 without initializing DB/credential clients or fetching publishers.
4. Through the parent's secure supported settings path, set
   `RSS_CATALOG_MODE=active` and `RSS_CATALOG_FEED_IDS=<reviewed CSV IDs>`.
   No setting tool is supplied by this repository. Database `active=false`
   still produces empty disabled inventory and POST `reason=off`.
5. Store the existing service credential securely as Vault
   `rss_catalog_service_role` if the reference is absent. This requires separate
   action-time approval and owner entry in the project's secure Dashboard Vault
   UI; general catalog deployment consent does not authorize copying a service
   credential or changing extension permissions. Never ask the owner to paste
   the key into chat, a PR, a shell command or a tool argument. Do not query,
   print, export, read or inject its value. Separately obtain action-time approval
   for the exact pg_cron/pg_net installation, net/cron permission changes and
   disabled job setup, then apply `optionalScheduleMigration` from the bundle.
   Verify actual pg_net version/bodyless SQL NULL behavior, job ownership and
   queue/schema denial before activation. All calls must explicitly target
   `hrtfhojbhqvaoiulspto`; never infer a project from the Ready CLI config.
   Owner UI input: open this project's Vault screen, choose Add/New secret,
   enter Name `rss_catalog_service_role`, enter the existing service-role key in
   the Secret field, optionally describe the fixed catalog refresh purpose, and
   save. [Supabase's Vault UI documentation](https://supabase.com/docs/guides/database/vault)
   verifies UI secret entry; authenticated Dashboard navigation labels were not
   inspected here. The private job uses this credential only for the fixed
   bodyless POST. The credential itself retains service-wide privileges.
6. As database owner, set `public.rss_public_catalog.active=true` for id 1.
   Invoke `select rss_catalog_private.enqueue_refresh();` once; only its request
   ID is returned. Inspect `net._http_response` for that ID's status, timeout and
   safe count-only response. Do not inspect the request queue or headers.
   Expected refresh counters are `fetchedSources`, `reusedSources`,
   `failedSources`, `successfulFeedBodyBytes` and `snapshotBytes`; measured bytes
   cover successful final feed responses only. Original counters separately
   report jobs, HTTP attempts, retained-prefix bytes, delivered-body chunks,
   unknown-byte jobs, cache hits and status counts. Failed partial transfers,
   blocked/redirect socket overread, headers/TLS and database traffic are not
   fully measured; no counter is a billing total.
7. Verify actual populated snapshot counts, source IDs/timestamps, metadata/photo
   provenance and payload size, with no stored HTML/body/private fields. Verify
   GET, conditional 304, failure/stale/expired behavior and simultaneous reads.
   Concurrent authorized refreshes must share the SQL claim; repeat refreshes
   during cooldown must make no source fetch. Record actual request/body bytes
   on each leg separately. The adjacent local result does not replace this gate.
8. Enable `cron.job.active` for `breeze-rss-catalog-refresh`. Observe a successful
   scheduled run and reuse across multiple readers; failed source timestamps
   must remain unchanged. The ten-minute job can skip a tick if the fenced
   cooldown is still active; cached sources become stale and never renew by GET.
9. Only after these gates and combined Chromium/WebKit photo/fallback tests,
   parent adds `RSS_CATALOG:true` to the app config and runs full checks,
   `ios:sync`, and the already chosen cloud TestFlight workflow at the exact
   integrated commit. Parent merges. PR #102, Apple key setup, App Store version
   numbering and App Review are separate from this work.

Readiness queries should expose only safe metadata/counts: RLS/grant booleans,
`active`, snapshot byte count, entry counts by fixed feed ID, source timestamps,
refresh status/counts and cron run status. Raw credentials/private rows are never
needed. Client cache is fresh for ten minutes; server source age is fresh for
less than ten minutes, stale up to twenty-four hours, then unavailable. Failures
never renew source or cache receipt age. Source `max-age` can defer revalidation;
304 validation retains prior validators when the response omits them.

## Photo integration boundary

Server supplied-photo parity now covers description versus image-less content,
Atom summary, lazy attributes, responsive widths, media type/case, video versus
thumbnail and unsafe/tracking image exclusion. The catalog consumes PR #104's
unchanged pure `extractPublicArticleCover` at `2d1f942`, plus its case/base/entity
fixtures and four audited feed-empty public OG snippets. PR #104 still owns the
client cover policy/UI; this PR owns the server fetch/cache and deploy bundle.

Original lookup occurs only inside an authorized claimed refresh, for missing
photos on ordinary entries from enabled fixed feeds. Article and every redirect
must be HTTPS on the feed hostname (www aliases permitted); public DNS answers
are validated together and pinned. Custom feeds, social/read targets, credentials
and cross-publisher redirects never qualify. Supplied feed photos win.

Limits per refresh: six distinct original jobs, two workers, four seconds per
job including DNS/redirects, at most two redirects (18 total HTTP attempts for
six jobs), and 128 KiB retained HTML per job. Fixed identity encoding and safe
cache/content headers are required. A complete unambiguous photo tag cancels the
remaining page; relative metadata waits for a safe base or complete response.
No Readability/body extraction, image download or client eager-body work occurs.
The feed phase has at most thirteen six-second jobs with two workers, followed
by at most twelve seconds of original-job waits; parsing/database overhead is
additional. The existing two-minute SQL lease fences late publication; the
60-second pg_net response timeout can report timeout without authorizing a
second refresh during cooldown. This is a bounded request/retained-prefix budget,
not a wire-byte/billing ceiling; delivered chunks can exceed retained bytes.

Only service-side status/time/photo/final-public-URL hints persist, inside the
existing 200,000-byte snapshot cap. Positive originals reuse for 24 hours.
Only a complete successful public cacheable page establishes `noimage` for
30 minutes. `transient`, `truncated` and `blocked` retain distinct provenance
and retry after ten minutes under the global cooldown; none becomes absence.
Shared URLs coalesce and oldest attempts run first. Public metadata strips hints,
and its ETag/HTTP expiry track photo expiry; existing client public metadata
reuse/offline limits still apply. Actual source permissions, original access and
photo decode/hotlink behavior remain deployed activation gates.

The only overlapping client area is the added retry variable and
`rssCatalogFetch` failure/success paths in `scripts/importers/rss.js`. Cover
admission, extraction, render ownership and UI files were not changed here.

## Controlled evidence

The [server result](rss-catalog-server-20261006.json) uses actual HTTP GET/POST,
the actual schema/RPCs on PGlite, thirteen synthetic 100,000-byte feeds, and
actual local pinned Node HTTP original-prefix cancellation. Four originals use
audited public share tags; two additional originals are synthetic. DNS is
modeled; live publishers and TLS are not exercised. Exact source hashes persist.

| Scenario | Client requests / body bytes | Publisher feed calls / body bytes |
| --- | ---: | ---: |
| Cold empty server GET | 1 / 702 | 0 / 0 |
| 30 concurrent refresh calls | Service responses excluded | 13 / 1,300,000 (one claim; max two workers) |
| First reader of warmed 260-entry catalog | 1 / 142,079 | 0 / 0 |
| 30 concurrent new readers | 30 / 4,262,370 | 0 / 0 |
| Conditional reader | 1 / 0 (304) | 0 / 0 |
| 30 warm rotations/relaunches within ten minutes | 0 / 0 | 0 / 0 |

The same claimed refresh performs six original jobs with two workers: 29,004
retained prefix bytes and 29,004 delivered body bytes in this controlled run.
Thirty callers in the next refresh share one feed validator pass (zero feed
body bytes), reuse six positive original hints, and perform zero original jobs.
Separate tests prove complete/noimage, transient, truncated, blocked, mixed/private
DNS, redirects, signed URLs, relative/base ambiguity and expiry behavior.

For thirty cold readers, legacy fixture feed bodies alone total 39,000,000
bytes/390 feed calls; catalog adds one server feed pass of 1,300,000 bytes and
29,004 original prefix/delivered body bytes and 4,262,370 client metadata body
bytes. These are distinct uncompressed body legs,
not total network traffic, Supabase billed egress, or a causal explanation of
the previous 4.791 GB. Database responses, service refresh replies, redirects,
HTTP/TLS overhead, images, selected article bodies and unrelated traffic are
excluded. No percentage billing-savings claim is made.

Validation at the prepared source:

- Full `npm test`: 516 Node-runner tests, zero failures, plus existing script
  checks. Catalog subset: 38 tests, including actual SQL role denial/control
  fencing, modeled disabled scheduler/grants, publisher validators, long-URL
  snapshot trimming, supplied/original-photo policy and provenance, transport
  cancellation, base/case parity, cache/concurrency, client failure bounds and expiry.
- `npm run typecheck`: unchanged 34 existing checkJs diagnostics. `npm run
  ios:sync`: web build and Capacitor sync complete; no release-counter diff.
- Deno 2.9.6 check, OFF boot with only mode permission, and active boot using
  synthetic credentials/REST with no network permission pass; four actual Deno
  socket tests pass with network permission confined to loopback.
- Chromium catalog Home/Preview/Read, body-intent and artwork checks pass, plus
  RSS supplied-photo and visible-cover/failure/hotlink/shimmer/return regressions.
  Phone, narrow phone, tablet, desktop and short sizes were checked in both
  themes; four audited original photo URLs render directly through catalog Home
  using fixture image bytes, with no client cover/body lookup. This is local
  rendering evidence, not a live website/photo decode claim.
- WebKit download attempts failed with CDN HTTP 403 (Domain forbidden). Local
  catalog launch is blocked by the missing binary. CI remains responsible for
  exact-head WebKit proof; no WebKit pass is claimed here.
- Public `breeze.io.kr` HTML/config read attempts were inaccessible to this
  environment's web tool. Parent owns the requested actual website baseline and
  post-deployment validation. Neither fixture results nor failed page access
  establish deployed client behavior.

Local proof: `/tmp/breeze-catalog-browser-integrated/chromium/`,
`/tmp/breeze-rss-covers-integrated/chromium/`, `/tmp/breeze-rss-visible-covers-integrated/chromium/`.
Reproduce server proof with `BREEZE_CATALOG_SERVER_REPORT=/tmp/result.json node
tests/measure-rss-catalog-server.mjs`. Integrity CI includes that test and both
the OFF/active synthetic Edge boot tests.

## Rollback

Disable the cron job and set database `active=false`; this clears public
snapshots/leases and prevents any old worker publication. Keep the endpoint in
active environment mode long enough to return authoritative disabled metadata
to connected opted-in clients, then restore environment OFF if desired. Parent
sets client opt-in false in the next app configuration/build. Cached public
cards cannot be revoked instantly on offline devices: source-age expiry is
twenty-four hours, and connected client reuse/retry windows are ten to eleven
minutes. No user/history/custom-feed data is deleted.

Remaining gates are parent production setup/population/refresh/cache proof,
source review, combined PR #104 client checks, exact-head CI/WebKit, actual live
website validation after deployment/activation, and
the combined next TestFlight build. This draft does not claim production
catalog population or activation.

Primary documentation checked: [Supabase Edge authentication](https://supabase.com/docs/guides/functions/auth),
[RLS/service credentials](https://supabase.com/docs/guides/database/postgres/row-level-security),
[scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions),
[pg_net interfaces](https://supabase.com/docs/guides/database/extensions/pg_net),
and [pg_net source for SQL NULL bodies](https://github.com/supabase/pg_net/blob/master/sql/pg_net.sql).
The markdown changelog fetch was blocked; the [HTML changelog](https://supabase.com/changelog)
was reviewed instead. No applicable breaking change to this pinned client's
basic table/RPC access was identified.
