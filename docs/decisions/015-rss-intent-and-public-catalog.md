# Selected-article intent and an optional public RSS catalog

2026-10-05. Dependent on PR #97 (`d103bb31`), based on main 1.8(236)
`34b5dc9`. This proposal does not merge, deploy, apply SQL or activate Jev.

## Current Home photo-only display (244, October 6)

Restore the historical ready-card invariant from `ff48c255d9cac8634f955f25a189dfe431d785ee`
(August 17), still present in `d103bb31f075404d5498dfa1a15a1e60def7c81a`:
a ready Home recommendation requires a successfully decoded usable photograph.
PR #99 (`24fc76739cbb87ca410d2bae6da76f6a0052c4f6`, integrated by
`79784329500fc1ad0e3cc2e32ef4feea25d86408`) admitted artwork through
`coverFallback`; that ready-display admission is superseded here. This is a Home
rule even with the separate Jev quality mode OFF.

Candidate retention is separate from ready display. All source metadata remains
in the existing discovery groups. Complete successful no-image metadata uses the
existing short-lived negative cache; retrieval error, cutoff, cancellation,
never-admitted metadata and failed image decode never become negative records.
A generation-local WeakMap only withholds unsuccessful display attempts. A new
explicit discovery generation may reconsider unknown candidates; a changed
photo can be decoded without rewriting or deleting its source metadata.

One unresolved original-photo candidate per rail may briefly occupy an inert,
invisible layout probe so the existing visibility check still works. Only actual
admission to the existing serial metadata job, or an actual image decode, makes
that card visible with the existing shimmer. Completed absence or exhausted
bounded decode/fallback removes it from display and refills from retained
candidates, preferring later eligible photos in the same feed before probing an
unknown. A source slot outside the viewport withholds its unresolved siblings
for that generation rather than repainting each entry. Other unresolved candidates
remain retained; they neither shimmer nor count as ready cards. A source with no
photo-ready candidate can therefore have no ready card.

The existing shared two-request generation budget, stable admitted-card order,
public-URL restrictions, positive/negative cache lifetimes, one image fallback,
cancellation and reentry ownership are preserved. No extra original request,
body preparation, article/image persistence, AI request or retry loop is added.
The render stamp includes the cover generation, so a normal Home refresh with
identical cached feed metadata can reconsider previously withheld unknowns.
Same-generation warm paints still reuse their result. When asynchronous refresh
replaces an entry object while preserving its exact card identity, its admitted
metadata consumer follows the current canonical entry without another request.
Changed titles, quality versions or other identity payloads still cancel stale
work and cannot receive its cover or cache write.

Known metadata can still open Preview immediately while its admitted photo work
is pending. Preview/body preparation and Read persistence keep selected intent.

`tests/verify-rss-photo-ready.mjs` runs the real renderer, serial admission and
image lifecycle with controlled layout/image events; the prior source fails its
restored display assertions. The existing recommendation and visible-cover
suites remain in place. Local browser execution was unavailable; browser pixels,
WebKit/device behavior and full dependency-backed suites require CI/device QA.
The artwork descriptions below document the earlier intermediate behavior and
must not be used to relax this current ready-card invariant.

## Ownership and visible behavior

Home needs discovery metadata, not a prepared article for every candidate.
Remove unbounded background article/Medium owner-body preparation passes.
Use the supplied publisher image, bounded visible cover metadata or local editorial artwork; image
failure retains the artwork. A fallback uses one headline and readable source
text, preserving card geometry and the shared dock/lookup surfaces.

Only a card selection resolves a Medium public owner feed, a feed-only social
post or an ordinary article. Existing parsers still decide whether its body is
usable. Selected owner-feed jobs coalesce within the document. Ordinary article
jobs still coalesce only while in flight: reopening an unsaved Preview can fetch
its body again. Closing during owner-feed resolution prevents a late Preview or
book save; it does not cancel the already-started public feed request. Preview
is transient. Read remains the only persistence boundary.

The preview shell opens synchronously with the known title/source and available
card or metadata photo. Only the missing Korean introduction uses the existing
reduced-motion-aware shimmer, shaped as text lines. Failed photo decode keeps
artwork; body failure keeps metadata and offers manual retry in the same sheet.
Generation checks prevent an old completion/error from changing another article
or reopening a dismissed preview. The body is fetched/parsed first, then its
actual paragraphs supply the introduction request. Read becomes available when
the body is ready, independently of the optional introduction. First-visible
shell, body/Read-ready and introduction-ready latency are distinct measurements.

The 238 device follow-up identified a first-screen regression: 236/PR97 fetched
article pages to supply photographs absent from feeds, whereas PR99 removed
that work entirely. The user authorized restoring those visible photos while
keeping discovery bounded. A discovery pass can now look up at most two
currently visible, photograph-free ordinary cards from the fixed public feeds.
Viewport/rail clipping and one generation budget cover asynchronous feed paints
and all visible rail owners; routine rerenders do not reset that budget.
Requests use the existing public-DNS relay, run serially, and coalesce by URL.
Rotation, replacement, scrolling out of view, hiding or opening Preview cancels
obsolete consumers; late results cannot change a replacement entry or cache.

Once a Home rail admits original-photo work, later feeds preserve the current
card order for that discovery generation, using the existing scroll/focus/press
order-preservation path. Late cards append instead of displacing the visible
cards that own the two-request budget. Explicit refresh still reranks and starts
its separately bounded generation. This favors stable visible ownership over
continuous reranking during one feed load; it does not promise a photo for every
late or offscreen card. Supplied photos remain independent of the original-page
request budget, so more than two decoded photos can legitimately exist.

The client retains at most 128 KiB of the relay's escaped JSON HTML prefix,
extracts OG/Twitter/first-image URLs in an inert document, and cancels the stream
after finding a photo or reaching the prefix limit. It does not run Readability,
prepare paragraphs, write IndexedDB or persist image bytes. This is a client
parsing limit, **not** an upstream, network or billing ceiling: the unchanged
relay reads the whole upstream page before emitting JSON and has its existing
3,000,000-byte HTML limit. A delivered reader chunk can exceed the retained
prefix. Two accepted final HTML bodies can total 6,000,000 bytes under that
repository limit; redirect bodies, protocol overhead, serialized response,
image traffic and buffering add separate costs. This is not an overall wire or
billing bound, and the deployed relay was not inspected. A photo
after the inspected prefix may remain artwork. No relay deployment is included.

One local metadata cache retains only public article/photo URLs and timestamps:
at most 100 entries and 64,000 UTF-8 bytes, 24-hour photo expiry and 30-minute
negative expiry. Supplied feed photos retain priority; custom sources, social
owner resolution, credentials, local names and IP literals cannot trigger this
automatic work. The unpartitioned shared catalog retains its existing single-response
metadata contract and does not initiate client cover lookups. The explicit
hybrid partition described below preserves bounded client cover recovery. Warm refresh/relaunch reuses matching photo URLs without a new
cover lookup. Actual article body preparation and Read persistence still belong
to selected intent. After selection, the parsed OG/body photo also updates that
same current discovery entry/card without another request. See the follow-up
[comparison evidence](../qa/rss-covers-20261005.md) and
[visible-cover limits](../qa/rss-visible-covers-20261005.md).

The 239 device follow-up requested the existing discovery shimmer while a cover
is being found or decoded. The thumbnail now uses that same light/dark material
only for an admitted lookup or an actual image load, independently of card
interaction. Known title/source/photo metadata opens Preview immediately.
Never-attempted, offscreen, budget-ineligible and negative-cache cards retain
artwork. Decode success replaces the shimmer; no-image, error, cancellation and
the existing timeouts end it. Same-URL refresh retains an in-flight or decoded
image, while replacement/view exit prevents a late image from painting.
The two-lookup budget, cache lifetimes, image fallback transport and release
numbering remain unchanged. See [shimmer QA](../qa/rss-cover-shimmer-20261006.md).

The 240 follow-up separates retrieval failure/unknown metadata from actual photo
absence. Only a complete successful relay HTML response with no usable image
can create a 30-minute negative record; HTTP errors, malformed JSON, timeouts,
aborts and the 128 KiB cutoff cannot. Cache v2 preserves valid v1 positive URLs
but ignores v1 negatives whose provenance cannot be recovered. Admission and
same-generation attempt guards remain bounded; errors do not start retry loops.
`server/article/cover-metadata.mjs` provides pure, public-image extraction for a
catalog-owned bounded refresh without fetching, storing a body or changing the
public `photo: string` shape. The October 6 production preparation below integrates
the catalog-owned bounded caller. Deployed population and source permissions
still need verification before catalog activation. See
[actual photo provenance](../qa/rss-photo-provenance-20261006.md).

Cover metadata uses case-insensitive HTML attributes and the first public
`<base href>` for relative URLs. Absolute public photos can survive an unsafe
base, but ambiguous relative resolution throws `cover_base_unsafe`; callers must
not cache that error as photo absence. Streamed relative declarations wait for
the first base, a real head boundary or a complete bounded response instead of
guessing a publisher path. A completed head permits the final public URL to
resolve relative photos before a long body reaches the prefix cutoff; inert
text and quoted attributes cannot fake completion. This does not increase fetch,
prefix or refresh budgets.

Legacy and catalog discovery caches retain whitelisted metadata only, never
article HTML, supplied bodies, user history or verdicts. Legacy feed transport
can still contain embedded article bodies; only the optional catalog removes
them from the client discovery response. Custom feeds remain local and separate.

## Optional transport, disabled by default

The default client continues to fetch fixed public feeds with PR #97's bounded
local reuse. `BREEZE_CONFIG.RSS_CATALOG === true` separately opts into one public
`/functions/v1/rss-catalog` metadata response. No configuration file or deployed
flag is changed. The server requires `RSS_CATALOG_MODE=active`; its OFF path
cannot initialize a database client, read service credentials or fetch a
publisher. Reviewed fixed IDs (`RSS_CATALOG_FEED_IDS`) default empty.

One service-role-only snapshot row holds at most 200,000 UTF-8 bytes and twenty
metadata entries per feed: title, URL, 280-character snippet, author/date,
source, optional photo and validated Reddit outbound URL. Public GET only reads
the snapshot. ETags incorporate source expiry/configuration; HTTP freshness is
at most sixty seconds. The client bounds the stream before parsing, retains at
most 250,000 bytes of normalized metadata, reuses it for ten minutes and accepts
last-good sources up to twenty-four hours old. Receipt time and failures never
renew source age. Empty/disabled inventory clears cards. Catalog failure cannot
trigger thirteen fallback feed rebuilds per client.

An authenticated, bodyless POST refresh uses only server-configured fixed IDs.
The catalog passes the incoming Bearer JWT unchanged to the existing
same-project `rss_quality_operator_authorized()` PostgREST RPC, using the public
`SUPABASE_ANON_KEY` only as its API routing key. The RPC verifies the effective
service role; local JWT decoding or equality against an Edge environment key
cannot grant access. Authorization is awaited and requires the exact boolean
`true`; missing/rejected RPCs, redirects, five-second timeout and malformed
responses fail closed. The existing RPC must remain STABLE SECURITY INVOKER,
empty-search-path and service-role-only EXECUTE, returning only whether
`current_user = 'service_role'`. No new RPC, grants or keys are introduced.
New projects must provision that independently reviewed existing quality
prerequisite before activation; the catalog does not create or repair it.
Malformed Bearer values, modern secret keys and apikey-only calls are unsupported;
forged/expired/user/anon JWTs cannot authorize refresh. One fenced global claim has a
two-minute lease and ten-minute cooldown, with two bounded feed workers.
The existing pinned-public-DNS transport enforces a six-second timeout and
512,000-byte feed cap. Publisher validators and `max-age` are honored;
`private`/`no-store` revokes cached metadata. Failures keep last-good metadata
without renewing age. No new credential or paid provider is used. The October 6
preparation adds a separate disabled Supabase cron setup described below.

SQL remains an offline proposal outside `supabase/migrations`. RLS and explicit
table/RPC grants deny PUBLIC, anon and authenticated access; only service_role
can read/update or claim/publish/release. PGlite tests the actual SQL. Deno checks
the function types and OFF boot with no network/service-key permissions. These
checks do not prove deployed database behavior.

## Policy and activation gates

Decision 014's Jev OFF/shadow mode, versioned eligibility, rubric, readiness,
budget, provider and schema remain unchanged. Future active quality inventory
still requires approved or explicitly eligible candidates; catalog metadata
never implies approval. Successful quality inventory remains authoritative and
excludes saved entries without prefetching their bodies.

RSS availability is not permission to redistribute a shared cache. Keep every
feed disabled until terms and attribution are reviewed. [Dexerto's terms](https://www.dexerto.com/terms-and-conditions/)
restrict networked-server storage. [WIRED's RSS guidance](https://www.wired.com/about/rss-feeds/)
does not settle shared-cache permission. [NASA's media guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/)
allows many informational uses with acknowledgement and third-party exceptions.
[Medium's RSS guide](https://help.medium.com/hc/en-us/articles/214874118-Using-RSS-feeds-of-profiles-publications-and-topics)
and [terms](https://policy.medium.com/medium-terms-of-service-9db0094a1e0f) do not
transfer authors' ownership. [Reddit's agreement](https://redditinc.com/policies/user-agreement)
needs a separate collection/permission review. [ProPublica's policy](https://www.propublica.org/steal-our-stories)
has conditions that need review. Other publishers remain unverified. These are
activation constraints, not permission obtained for this proposal.

Activation needs separately reviewed SQL/function deployment on the correct
project, source permission/attribution, an explicit refresh owner and warmed
inventory before client opt-in. Repository and production project IDs differ;
do not infer the deployment target from local CLI config. Roll back via client
opt-out and server OFF; preserve all user data.

## October 6 production preparation

Main `f7a2889` already contains the prototype. Read-only inspection of the app's
actual project `hrtfhojbhqvaoiulspto` found no catalog function, table or claim
RPC. The local CLI's `fqvhlyocdkwiyioiokte` is the unrelated Ready project.
Deployment and activation remain parent-owned, for the next TestFlight build.

The snapshot now has an owner-controlled `active=false` switch in addition to
the existing environment OFF gate and empty fixed-ID allowlist. service_role
can read and update cache/lease columns but cannot toggle `active`; anon and
authenticated have neither table nor RPC access. A control transition clears
the snapshot, claim and cooldown, fencing in-flight workers even through rapid
OFF/ON. Reactivation always needs warm-up. No user/account tables are involved.

The separately applied scheduling SQL enables `pg_cron` and `pg_net`, revokes
public/service access to credential-bearing network queues/functions and cron
jobs, and installs one postgres-owned ten-minute job **disabled**. Its private
SECURITY INVOKER enqueue function accepts no URL or body input. It references
the existing service credential in Vault at runtime without returning it. That
Vault reference did not exist at inspection; the owner must configure it through
a secure supported path before enabling the job. The private request now carries the Vault JWT in `Authorization: Bearer`,
never a secret-valued `apikey`; SQL NULL produces a bodyless
POST; the endpoint rejects any nonempty stream, caller URLs and source lists.
The actual extension/HTTP/job behavior must be proved after parent deployment;
PGlite tests the grants and SQL with modeled extension interfaces.
pg_net 0.20.4 follows redirects; this is not a redirect-disabled transport.
Its libcurl >=7.83 dependency protects Authorization when host, scheme or port
changes, unlike arbitrary custom headers. Same-origin redirects can still carry
the credential, and the hosted net queue boundary and fixed endpoint remain
required. The Edge-to-RPC verification fetch separately uses `redirect: error`.
See the production runbook for the dependency checks and residual risks.

The server parser preserves the current client's supplied photo choices across
content, description, summary, lazy attributes, responsive widths and media
types. Unpartitioned catalog mode skips the client's visible-cover fetches, so the
optional server path can own bounded original-photo metadata lookup under the
same global SQL claim. The explicit hybrid release keeps server originals
disabled and retains the existing bounded client lookup instead.
It consumes PR #104's unchanged pure extractor from `7121c0f`, with its case,
safe-base and malformed-input fixtures. Only missing-photo ordinary entries
from a separately reviewed `RSS_CATALOG_ORIGINAL_FEED_IDS` subset qualify; it
defaults empty independently of RSS caching's `RSS_CATALOG_FEED_IDS`. Feed
approval never authorizes original-page probing. Removing a probe ID withholds
previous original-photo hints while supplied feed photos remain available.
The parent's source-policy review separates supported RSS-reader use, shared
metadata transformations, original automation and image/attribution rights.
TMZ stays outside initial admission until its unchanged-excerpt/copyright
requirements are resolved against the current normalized summary. No blanket
all-source permission or prohibition follows from the fixed feed inventory.
Every original/redirect must be HTTPS on
the feed publisher's hostname (allowing www aliases), with public DNS answers
pinned before connection and no credential-bearing URL.

Each ten-minute refresh permits at most six distinct original jobs, two workers,
four seconds per job including DNS/redirects, two redirects (three HTTP attempts),
and a retained 128 KiB identity-encoded HTML prefix. It cancels after an
unambiguous complete photo tag or the prefix limit; unresolved relative metadata
waits for a safe base, real head close or complete response. The pure head scanner
is copied from `7121c0f` and ignores fake closure inside comments/attributes/raw
text/templates. It never runs article-body parsing,
downloads images or publishes HTML. Delivered chunks may exceed the retained
prefix; headers/TLS and failed transfers are not covered by that parsing cap.

Service-only snapshot hints retain status/time/photo/final public URL: positives
reuse for 24 hours; only complete successful cacheable public HTML establishes a
30-minute `noimage`; transient, truncated and blocked states retry no sooner
than the ten-minute global cooldown. Supplied feed photos win. Oldest attempts
are prioritized, shared URLs coalesce, and public metadata strips internal hints.
ETags and HTTP expiry also track original-photo expiry. Existing client public
metadata reuse/offline-age rules still apply. Selected article bodies remain
selected-intent work; unknown/failed photos keep local artwork. Parent must
verify actual deployed source/photo provenance before activation. The initial client preparation changed catalog retry state and
`rssCatalogFetch`; the hybrid client changes below add explicit transport ownership.

Source age is fresh for less than ten minutes, stale after that, and unavailable
after twenty-four hours. A publisher max-age can defer revalidation without
renewing that source timestamp. Successful 304 revalidation renews the timestamp
and retains absent validators. ETags/HTTP TTL track freshness and expiry.
Oversized inventories drop tail entries from the largest source until the
snapshot has 10 KiB of JSONB separator headroom under its 200,000-byte cap.
Failed clients retry after ten to eleven minutes with jitter, including forced
Home refreshes, while keeping unexpired last-good metadata without renewing age.
Public readers never trigger refresh or per-client built-in feed fallback.

Exact migration/function arguments, security changes, warm-up proof, switches
and remaining parent gates are in the
[deployment runbook](../qa/rss-catalog-production-20261006.md).

## October 6 explicit hybrid partition

The reviewed release preserves all thirteen built-in sources while assigning
only the successfully warmed WIRED ID `[7]` to the shared catalog. Client opt-in needs
both `BREEZE_CONFIG.RSS_CATALOG === true` and the explicit
`BREEZE_CONFIG.RSS_CATALOG_FEED_IDS = [7]` array. The candidate branch contains
this intended setting; main merge still requires the backend, security and
warm-inventory gates. The initial four-source pilot warmed WIRED but Medium IDs
9, 11 and 12 returned unavailable. The explicit release partition therefore
keeps Medium on its existing legacy path instead of suppressing those sources.
This is fixed transport ownership, not fallback inferred from an error. Server
`RSS_CATALOG_ORIGINAL_FEED_IDS` stays empty; the client switch grants no server
original-probing admission.

The explicit nonempty array accepts only unique fixed integer IDs. A malformed
partition fails before either transport starts. Omitting the key preserves the
older all-catalog contract, so omission is not the shipping hybrid configuration.
Transport ownership follows the configured fixed source ID, never the presence,
absence or status of a response record. A custom alias of the same managed URL
also cannot bypass that ownership. Missing, disabled, malformed and failed
managed inventory never triggers a legacy feed fetch. The existing thirteen-
record catalog response validation, stream/cache byte limits, source-age cap,
conditional refresh and ten-to-eleven-minute failure cooldown remain intact.

The other twelve IDs `[0,1,2,3,4,5,6,8,9,10,11,12]` keep their existing local metadata cache
and per-feed transport. Their jobs and genuine custom feeds start alongside the
single catalog request, and publish independently even while it is stalled.
Legacy and catalog caches retain separate freshness/age owners. Warm load and
restart reuse both caches; a warm repeated consumer does not advance the cover
generation. Rotation or an explicit refresh still owns a new bounded generation.

Hybrid mode retains client original-photo eligibility for ordinary entries from
all thirteen fixed sources, preserving the existing supplied-photo, linked,
social, unsafe-URL and custom-source exclusions. Every visible rail uses the
same unchanged serial lookup pipeline and shared two-request generation budget.
Supplied photos take priority and consume none of that original-page budget.
Warm original metadata hydrates the canonical entry without another request.
These transport changes do not decide photo-only card display eligibility;
that separate restoration still owns which retained candidates are shown.
Selected article/Medium owner-body resolution remains deferred to selection.

Focused synthetic tests are in `tests/verify-rss-catalog-hybrid.mjs`; opt-in
values and the local verification scope are in the
[hybrid client QA note](../qa/rss-catalog-hybrid-20261006.md).

## Evidence and limits

[QA report](../qa/rss-catalog-intent-20261005.md) compares three versions with real
browser rendering and synthetic transports: empty cold-server state, normal/slow
delays, warm documents, Preview/Read, delayed Medium selection and ten artwork
size/theme combinations. Timings are local trials, not a speed guarantee.
Bytes are mocked relay response bodies, not billed egress. Server refresh/DB
legs, images and other traffic need separate measurement after authorized
deployment. These fixtures cannot fully attribute the historical 4.791 GB.


## October 7 selected-body recovery

The metadata-only discovery change removed the prior Medium pre-publication
body gate. It also discarded `content:encoded` that a legacy feed had already
transferred, leaving ordinary article selection dependent on the original page.
Photo readiness does not establish article readability. The current client fixes
these avoidable failures without resuming per-candidate background fetching.

Legacy feed responses retain supplied explicit article bodies and feed-only
social text in a separate memory-only cache: at most 200,000 serialized UTF-8 bytes per
source and 1,000,000 in total (including identity and provenance), expiring after ten minutes. Successful source
refresh replaces that source's evidence; a transient failure does not invent an
empty successful feed. Cache budget eviction can remove old bodies. No body is
added to discovery metadata, localStorage, the shared catalog, or a saved book.
Readability and access/truncation checks still run only after selection. Reuse
requires matching source provenance and canonical article identity. A cold
restart with only persisted metadata cannot reconstruct these bodies.

Medium owner-feed jobs continue to coalesce while in flight and after success.
Transport or parsing failures remove only their own job, so a manual retry can
make one fresh request. A stale rejected job cannot erase a replacement job.
Successful empty or missing-story results remain distinct from transient error.
There are no automatic retry loops, new requests during Home loading, paid
provider calls, server changes or access-restriction workarounds.

This is a partial reliability correction, not a new readability-admission gate.
An article can still have a photo while its public body is unavailable. A shared
readiness service would need a separately reviewed publisher allowlist and a
bounded refresh owner. Evidence should distinguish usable, confirmed restricted
or absent, and unknown/transient failure, with URL/body identity, parser version,
check time and expiry. Reuse one source check across readers, never treat unknown
as a confirmed negative, and do not infer shared-storage permission from public
RSS availability. Keeping exact approved body bytes would make evidence stronger
but additionally requires publisher permission, storage/retention policy and a
cost budget. None of that service or policy is activated by this client fix.

See [the controlled regression report](../qa/rss-selected-body-20261007.md).
