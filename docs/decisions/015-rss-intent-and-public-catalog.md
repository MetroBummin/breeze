# Selected-article intent and an optional public RSS catalog

2026-10-05. Dependent on PR #97 (`d103bb31`), based on main 1.8(236)
`34b5dc9`. This proposal does not merge, deploy, apply SQL or activate Jev.

## Ownership and visible behavior

Home needs discovery metadata, not a prepared article for every candidate.
Remove the background cover-page and Medium owner-body preparation passes.
Use the supplied publisher image or existing local editorial artwork; image
failure retains the artwork. A fallback uses one headline and readable source
text, preserving card geometry and the shared dock/lookup surfaces.

Only a card selection resolves a Medium public owner feed, a feed-only social
post or an ordinary article. Existing parsers still decide whether its body is
usable. Selected owner-feed jobs coalesce within the document. Ordinary article
jobs still coalesce only while in flight: reopening an unsaved Preview can fetch
its body again. Closing during owner-feed resolution prevents a late Preview or
book save; it does not cancel the already-started public feed request. Preview
is transient. Read remains the only persistence boundary.

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
