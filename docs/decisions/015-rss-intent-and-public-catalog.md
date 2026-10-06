# Selected-article intent and an optional public RSS catalog

2026-10-05. Dependent on PR #97 (`d103bb31`), based on main 1.8(236)
`34b5dc9`. This proposal does not merge, deploy, apply SQL or activate Jev.

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
automatic work. The optional shared catalog retains its existing single-response
metadata contract and does not initiate client cover lookups. Warm refresh/relaunch reuses matching photo URLs without a new
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
public `photo: string` shape. The existing catalog does not yet call it; original
photos absent from feeds still need that separately integrated ownership before
catalog activation. See [actual photo provenance](../qa/rss-photo-provenance-20261006.md).

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
The existing service credential is compared directly; forged role claims and
anonymous keys cannot authorize refresh. One fenced global claim has a
two-minute lease and ten-minute cooldown, with two bounded feed workers.
The existing pinned-public-DNS transport enforces a six-second timeout and
512,000-byte feed cap. Publisher validators and `max-age` are honored;
`private`/`no-store` revokes cached metadata. Failures keep last-good metadata
without renewing age. No scheduler, new credentials or paid provider is added.

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

## Evidence and limits

[QA report](../qa/rss-catalog-intent-20261005.md) compares three versions with real
browser rendering and synthetic transports: empty cold-server state, normal/slow
delays, warm documents, Preview/Read, delayed Medium selection and ten artwork
size/theme combinations. Timings are local trials, not a speed guarantee.
Bytes are mocked relay response bodies, not billed egress. Server refresh/DB
legs, images and other traffic need separate measurement after authorized
deployment. These fixtures cannot fully attribute the historical 4.791 GB.
