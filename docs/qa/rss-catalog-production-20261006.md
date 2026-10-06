# Shared RSS catalog preparation for the next TestFlight build

Based on main `f7a2889296226f1ebca03cdcc45d09b739b05e88` (PR #103).
The parent owns production execution, activation, combined integration and merge.
No production write, publisher fetch, paid call, credential export, Apple action
or release-counter change was performed by this preparation.

## Initial inventory before parent installation

Read-only connector inspection on October 6 initially found the app project
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
  POST forwards the incoming legacy Bearer JWT to the existing same-project
  `rss_quality_operator_authorized()` RPC, using the public `SUPABASE_ANON_KEY`
  as `apikey`. Only awaited boolean `true` authorizes refresh. No local claim
  decoding, secret equality or server-admin substitution authorizes it.
  It accepts no URL, feed list, query or nonempty body. Public reads never
  invoke operator validation, claim, fetch or write.
- Optional refresh ownership: enable `pg_cron`/`pg_net` on the existing project,
  install a private postgres-owned enqueue function and one disabled job.
  Retain the reviewed owner-scope network/cron REVOKEs. On hosted pg_net,
  supabase_admin-owned PUBLIC grants can remain; successful SQL does not prove
  role-level queue denial. Verify the hosted boundary below and reinspect
  existing extension uses before applying this setup.
- Runtime settings: environment mode stays OFF; reviewed feed IDs and separate
  original-probe feed IDs default empty;
  database switch and scheduler default OFF; client configuration stays OFF.
  Reuse the owner's existing service credential through Vault; create no key,
  credential, project, branch, external scheduler or paid service.

## Hosted pg_net boundary accepted after parent verification

[Supabase's pg_net permissions documentation](https://supabase.com/docs/guides/database/extensions/pg_net#permissions)
describes default PUBLIC access to net objects and the hosted protection:
`net` is outside the Data API, and client roles cannot log into Postgres directly.
The parent accepted this supported boundary after reviewing the following live
checks on October 6. These are parent-reported production results, separate from
this patch's owned/mock PGlite checks; no role-level net ACL denial is claimed.

- The net schema/queue objects are owned by `supabase_admin`. PUBLIC grants
  remained effective after the reviewed REVOKEs, which could warn or be no-ops.
  No additional grant, ownership change or elevated privilege is part of this fix.
- The exposed Data API schemas were only `public` and `graphql_public`.
  Public-anon-key REST GETs for `net.http_request_queue` and `net._http_response`
  with `Accept-Profile: net` returned HTTP 406 / `PGRST106`.
  The private schema was also rejected with 406; the public-schema queue route
  returned 404. The checks did not read request headers or credential values.
- `anon`, `authenticated` and `service_role` were `NOLOGIN`. The scan found zero
  ordinary exposed RPC bridges to arbitrary SQL or the queue; `rls_auto_enable`
  was an event-trigger-only function, not an ordinary callable RPC bridge.
  Client roles had no EXECUTE access to the private enqueue function.
- The private enqueue path remained postgres-owned, fixed-endpoint and bodyless.
  Readback showed zero queued requests, job 1 disabled and database catalog OFF.
  This establishes the installation checkpoint, not a successful scheduled run
  or catalog activation.

Residual risk remains if net becomes exposed through the Data API, an exposed
arbitrary-SQL/queue bridge is added, or an untrusted principal gains a database
login/role-switching path. Recheck schema exposure, actual REST denial, role
login attributes, exposed RPC bridges and private EXECUTE rights after relevant
schema, API, function or role changes and before activation. Keep the job and
catalog OFF if this boundary no longer holds. The strict PGlite ACL tests and
no-op-REVOKE negative control remain useful for an owned/mock environment; they
do not prove hosted object-level denial. This acceptance adds no privileges and
does not replace source, credential, warm-up or release gates.

## Operator RPC dependency and protected scheduler transport

The parent’s October 6 controlled checks returned 401 from catalog refresh with
both the previous apikey transport and the stored JWT in Authorization alone.
The same stored JWT returned HTTP 200 / boolean true from the existing
same-project `rss_quality_operator_authorized()` RPC. Thus changing transport
alone cannot fix refresh; raw equality rejects a verified service-role identity.
These are parent-reported production findings; this patch makes no live calls.

Before deployment/activation, read back this existing zero-argument function and
verify its only result is `current_user = 'service_role'`. It must return boolean,
be STABLE, SECURITY INVOKER, set `search_path=''`, grant EXECUTE to service_role,
and deny EXECUTE to PUBLIC, anon and authenticated. Do not broaden privileges,
rename it, recreate it or add a second catalog RPC. A safe metadata-only check:

```sql
select p.provolatile = 's' as stable,
       not p.prosecdef as invoker,
       p.proconfig @> array['search_path=""'] as empty_path,
       p.prorettype = 'boolean'::regtype as boolean_result,
       has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as user_execute,
       exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
         where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute,
       pg_get_functiondef(p.oid) as operator_definition
from pg_proc p
where p.oid=to_regprocedure('public.rss_quality_operator_authorized()');
```

Expect exactly one row: the first five booleans true, the last three false,
with the reviewed role-check-only definition. Zero rows or a mismatched result
blocks activation. A new project must already have the separately reviewed
quality-operator prerequisite; neither catalog migration supplies it. Missing
public API-key configuration, absent/unexecutable RPC, false/non-boolean JSON,
invalid/expired/forged JWTs, network error, redirect or a five-second timeout all
fail closed with 401 and no refresh. Modern secret keys and apikey-only requests
are intentionally unsupported. Never use the catalog database service key as a
validation fallback. [Supabase role verification](https://supabase.com/docs/guides/database/postgres/roles)
explains the PostgREST authenticator’s verified-role boundary.

The scheduler sends `Authorization: Bearer <Vault reference>` to its fixed HTTPS
catalog endpoint with SQL NULL body, omitting apikey. The secret is never copied
into migration text or cron commands. Validate the rewritten enqueue function
and keep the job disabled before the parent’s authorized warm-up.
[pg_net 0.20.4 transport source](https://github.com/supabase/pg_net/blob/v0.20.4/src/core.c)
sets FOLLOWLOCATION and does not enable UNRESTRICTED_AUTH; its
[worker source](https://github.com/supabase/pg_net/blob/v0.20.4/src/worker.c)
requires libcurl >=7.83.0. It has no per-request redirect-disable option here.
[libcurl redirect behavior](https://curl.se/libcurl/c/CURLOPT_FOLLOWLOCATION.html)
protects Authorization, whereas arbitrary custom headers such as apikey can
follow redirects. [curl’s 7.83.0 fix](https://curl.se/docs/CVE-2022-27776.html)
extends that protection to changed scheme and port as well as hostname.

This is source/version-based protection, not an independently captured hosted
redirect trace. A same-origin redirect can still receive Authorization, and
redirects may change POST to GET. Keep the fixed trusted endpoint, reviewed
pg_net/runtime version, accepted queue/Data API boundary, and normal non-debug
pg_net logging: DEBUG2 or more verbose mode enables curl verbose header output.
Treat unexpected redirects or runtime/endpoint changes as a stop-and-review
condition. The Edge’s own RPC validation fetch is stricter: redirect:error and
a five-second AbortSignal, with the original incoming Authorization unchanged.
The parent’s 08:51 UTC read-only checkpoint found `log_min_messages=warning`
(default/reset value warning), no database/role overrides, database and job OFF,
and queue count zero. It did not read queued headers or log contents. Recheck
if logging settings change; this checkpoint is not a warm-up or activation.
No new privileges, credential material, persistent access or RPCs are added.

## Existing pg_net namespace advisor remains unresolved

The parent's 08:29 UTC October 6 readback found pg_net 0.20.4 registered in
`public`, managed by `supabase_admin`, with its operational objects in `net`.
The queue and response tables each had zero rows; the job and catalog were OFF.
The metadata-only external-dependency check was cancelled at 08:30 UTC, so a
complete dependency review was not established. No live correction or retry is
authorized by this patch, and the namespace advisor has not been repaired.

[Supabase's troubleshooting guidance](https://supabase.com/docs/guides/database/extensions/pg_net#troubleshooting)
recommends registration in `extensions`. New installs now create that schema if
needed and use `create extension if not exists pg_net with schema extensions;`.
For an existing installation, `IF NOT EXISTS` leaves its registration and objects
unchanged. pg_net is non-relocatable; this setup never automatically drops or
moves it, and it does not convert an existing public registration.

An explicit owner-approved manual correction needs a fresh OFF-state check,
a complete external-dependency review, a fresh empty-queue check and an informed
decision about stored responses before any destructive step. Dropping pg_net
removes its queue and response objects: queued requests are lost and stored
responses are deleted. Preserve any required response data through an approved
safe path without exposing credentials. If dependencies or permissions are
uncertain, stop and resolve them with the managed owner/support; do not use
CASCADE, add privileges, or infer approval from an earlier empty checkpoint.
Only after separate authorization and those checks should the owner consider
the documented drop/recreate flow in `extensions`. Reverify registration,
version, dependencies, hosted API/role/RPC protections, private enqueue behavior
and the still-disabled scheduler afterward; namespace registration alone does
not establish credential safety or authorize activation.

## Exact deployment and warm-up order

1. Reinspect project and existing objects, source permissions/attribution and
   PR #104's final photo policy. Use the parent's reviewed fixed-ID list; the
   thirteen sources in synthetic tests are not a live permission decision.
   Recheck the existing operator RPC dependency and trusted redirect/runtime
   assumptions above; absence or mismatch blocks activation.
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
   Read back function files/hashes (including `operator-auth.mjs`), `verify_jwt`,
   schema, RLS and grants. Ensure the built-in `SUPABASE_ANON_KEY` is present;
   do not provision a key or substitute the service key for RPC validation. Check
   advisors for this change and perform actual role/RPC denial checks. OFF must
   return 503 without initializing DB/credential clients or fetching publishers.
4. Through the parent's secure supported settings path, set
   `RSS_CATALOG_MODE=active` and `RSS_CATALOG_FEED_IDS=<reviewed CSV IDs>`.
   `RSS_CATALOG_ORIGINAL_FEED_IDS=<separately reviewed CSV IDs>` is an independent
   empty-by-default subset of the feed IDs. Leave it empty for approved RSS
   caching that has no reviewed original-page probing permission. Removing a
   probe ID withholds its prior original-photo hints from public GET and clears
   them on the next refresh, without removing supplied feed photos.
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
   New pg_net installs register in `extensions`; existing installations are left
   untouched and need the separate namespace-advisor procedure above if flagged.
   The setup calls `cron.alter_job(cron.schedule(...), active := false)` in one
   transaction. Managed postgres can own a job without direct `cron.job` UPDATE
   rights; use pg_cron's owner APIs and do not add table grants to work around it.
   Verify exactly one `breeze-rss-catalog-refresh` job, owned by `postgres`, with
   schedule `*/10 * * * *`, command `select rss_catalog_private.enqueue_refresh();`
   and `active=false`. Verify actual pg_net version/bodyless SQL NULL behavior and
   the accepted hosted boundary above before activation. Record effective ACLs
   accurately: PUBLIC net grants may remain, and SQL success or modeled denial
   is not proof of managed role-level denial. Recheck Data API exclusion, NOLOGIN
   roles, absence of an exposed SQL/queue bridge and private EXECUTE denial;
   stop if those protections no longer hold. Do not expand privileges to force
   hosted net ACLs to match the owned/mock fixture. All calls must explicitly target
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
8. As the postgres job owner, enable the job through its supported API:
   `select cron.alter_job(jobid, active := true) from cron.job where
   jobname='breeze-rss-catalog-refresh';`. Read back the named job's `active=true`.
   Observe a successful scheduled run and reuse across multiple readers; failed
   source timestamps must remain unchanged. The ten-minute job can skip a tick if
   the fenced cooldown is still active; cached sources become stale and never renew by GET.
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

Source admission is operation-specific. Ordinary public RSS reader use and
server-shared feed caching are distinct from automated original-page HTML probes;
public image display/attribution also needs its own review. Several sources
expressly support RSS readers, so this plan does not label all built-ins
prohibited. Synthetic inclusion of all thirteen feeds and Conversation/TMZ
originals is never permission to enable them in production.

The parent's source-policy reviewer reports that TMZ's conditional commercial
reposting grant requires original links, unchanged excerpts and a copyright
notice. This catalog's current 280-character normalized summary and stripped
copyright metadata have not been reviewed against that grant. Keep TMZ (ID 2)
outside the initial production feed/probe lists until the exact operations are
approved with required rights/attribution preservation or separate permission.
No copyright/rights schema or blanket source ban is invented here. The parent
and `review_shared_rss_catalog` reviewer own the initial per-operation source
matrix; activation of all thirteen IDs is not an authorized default.

Server supplied-photo parity now covers description versus image-less content,
Atom summary, lazy attributes, responsive widths, media type/case, video versus
thumbnail and unsafe/tracking image exclusion. The catalog consumes PR #104's
unchanged pure `extractPublicArticleCover` at `7121c0f`, plus its case/base/entity
fixtures and four audited feed-empty public OG snippets. PR #104 still owns the
client cover policy/UI; this PR owns the server fetch/cache and deploy bundle.
The helper bytes remain identical to `2d1f942`; latest `7121c0f` also supplies
the pure head-completion scanner copied unchanged into catalog-owned
`photo-head.mjs`. Root/path-relative share metadata resolves at the final redirect
URL after a real head close, without consuming the large article tail. Comments,
quoted attributes, raw text, templates and incomplete bases cannot fake closure.

Original lookup occurs only inside an authorized claimed refresh, for missing
photos on ordinary entries from separately approved original-probe IDs. Article and every redirect
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

- Full `npm test`: 519 Node-runner tests, zero failures, plus existing script
  checks. Catalog subset: 41 tests, including actual SQL role denial/control
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
  Specifically, `assets/favicon/icon-512.png` stands in for each original photo
  URL: that part proves URL propagation and renderer readiness, not publisher
  image decoding. PR #104's live original/image audit is separate evidence.
- WebKit download attempts failed with CDN HTTP 403 (Domain forbidden). Local
  catalog launch is blocked by the missing binary. CI remains responsible for
  exact-head WebKit proof; no WebKit pass is claimed here.
- Integrity run 37413914024 at `b29660a` passed contracts and its WebKit
  supplied/visible-photo suites. Chromium's legacy visible-cover fixture failed
  `maxActive=1` with 2; that unchanged counter waits for the server socket close,
  which can lag the client's awaited reader cancellation. This is referred to
  PR #104's owner. Catalog browser CI now runs even after earlier step failures;
  a prior failure remains a failed job and is not suppressed. Exact-head catalog
  WebKit and combined client proof must still pass before activation.
  The added diagnostic wrapper preserves the original serial/budget assertions
  and adds strict client fetch/reader ownership plus lifecycle timestamps.
  [Local timing proof](rss-catalog-serial-20261006.json): first cancellation and
  fetch settlement at t=0, next client start at t=2 ms, previous server close at
  t=9 ms, next server arrival at t=30 ms. Client and server maxima are both 1 in
  that run, but the observed close acknowledgement lag explains why server-close
  accounting can overlap while client ownership is serial. This does not prove
  the absent client timestamps in the earlier failing CI run; instrumented CI
  retains both assertions so a real overlap still fails and exposes evidence.
  [Instrumented failing CI proof](rss-catalog-serial-ci-20261006.json), run
  37414684684 at `9942d0c`: Chromium client ownership maximum 1, cancel/fetch
  settle t=0, next client start t=2 ms, next server arrival t=52 ms, prior server
  close t=55 ms. The 3 ms server acknowledgement overlap reproduces server
  `maxActive=2`; client fetch/reader work remains serial. No assertion was removed
  or relaxed. WebKit supplied/visible checks pass; independent catalog
  Chromium/WebKit CI passes at that head. PR #104's owner must reconcile the
  fixture metric while preserving strict serial ownership and request budgets.
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

As the postgres job owner, disable the job with
`select cron.alter_job(jobid, active := false) from cron.job where
jobname='breeze-rss-catalog-refresh';` and verify `active=false`. Do not directly
update the extension table. Set database `public.rss_public_catalog.active=false`
for id 1; this clears public snapshots/leases and prevents any old worker
publication. Keep the endpoint in active environment mode long enough to return
authoritative disabled metadata to connected opted-in clients, then restore environment OFF if desired. Parent
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
[pg_cron owner APIs](https://github.com/citusdata/pg_cron#altering-a-cron-job),
and [pg_net source for SQL NULL bodies](https://github.com/supabase/pg_net/blob/master/sql/pg_net.sql).
The markdown changelog fetch was blocked; the [HTML changelog](https://supabase.com/changelog)
was reviewed instead. No applicable breaking change to this pinned client's
basic table/RPC access was identified.
