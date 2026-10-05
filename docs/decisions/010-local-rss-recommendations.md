# Local RSS discovery recommendations

2026-09-25. Base: `0b1b6bb`. Scope: Home's RSS recommendation rail only.

## Product contract

- Recommend external RSS entries, never insert personal books, saved links, or
  Library cards into the recommendation rail. Long reads and saved light reads
  keep their existing layout, order and click behavior.
- Use a small deterministic ranking, not another AI service. No new requests,
  database tables, analytics, dependencies, or persisted preference profile.
  This does not remove the existing RSS/image transport's requests.
- Keep Article Preview/Reader routing and Smart Crop intact. No generated Korean
  titles, Preview calls, body extraction or image analysis during ranking.

## Selection and ranking

`rssRankRecommendations(groups, options)` is a pure function inside `rss.js`,
with explicit library, positions, sources and clock inputs. It stays in the
existing script to avoid a new script-load/iOS bundle dependency while Home,
Preview and Annotation PRs are being integrated.

1. Use valid HTTP(S) candidates with a title and supplied photo or the explicit
   local-artwork fallback marker from Decision 015's loader. Existing image
   decode and ingestion checks own photo display and body readability.
2. Exclude saved source/resolved/discovery URLs, including UTM, fbclid, gclid and
   fragment variants. Preserve meaningful query parameters. Deduplicate articles
   across feeds and Reddit outbound links. Do not claim semantic near-duplicate
   detection or canonicalization of unknown redirects.
3. Keep one entry per feed, as the current Home already does. Within a feed,
   retain its existing order/refresh rotation; skip saved or duplicate entries
   rather than always picking the newest and defeating the refresh button.
4. Derive preference from at most 50 unique article records read in the last 60
   days, with existing `positions[id].t > 0` and `p >= 0.1`. Preview-only/imported
   items and zero-progress accidental opens do not train preferences. PDF, EPUB,
   pasted text and transient records do not train this profile. Position is a
   reading-progress proxy, not measured dwell time, comprehension or a like.
5. Each read's weight is `min(1, progress) * 0.5^(ageDays/14)`. Prefer an explicit
   feed category; infer a publisher's category only when the configured feeds
   for that hostname have exactly one category. Do not guess which Medium topic
   an old link belongs to from its title. Unknown publishers can still provide
   a source preference without inventing a category.
6. Score = freshness + capped category/source affinity, minus repeated publisher
   and category penalties. Freshness is `2 / (1 + ageDays/3)`; invalid/future dates
   receive no bonus. Category affinity is `2*(1-exp(-weight/2))`, source affinity
   `1.5*(1-exp(-weight/2))`. Earlier selections cost 0.65 per publisher, 0.35 per
   category and 0.4 for the immediately preceding category.
7. Prefer distinct publishers in the first four slots when possible. Every fourth
   slot uses freshness/diversity rather than affinity, preferring an unread
   category (then an unfamiliar publisher) among remaining candidates. This is
   an exploration preference, not a guaranteed 25% quota when inventory is small
   or an exploratory candidate has already appeared earlier.
8. New users get freshness and diversity without a fabricated taste profile.
   Identical input and clock produce identical order; no render-time randomness.

The ranker is bounded by the existing 20-source/100-entry parser limits. It does
not infer full-article reading time from RSS snippets. Length/semantic matching,
server-side collaborative filtering, impressions and cross-device preference
sync are intentionally out of scope. Existing position sync is unchanged.

## Rendering and integration

Only `#casual-rail` in the all-category view uses the ranker; legacy explicit
category/Discover views keep their prior behavior. Home PR #20 removes those
filters and keeps the same recommendation rail ID.

The render stamp includes source configuration and existing position/URL
metadata, so a cached RSS result can still be reranked after reading changes.
The clock is snapshotted for each render and the stamp uses the RSS cache interval.
Decoded card nodes/photos are reused. While the rail is horizontally scrolled,
focused or has a busy card, surviving cards keep their relative order and new
cards append; an explicit refresh may rerank even with unchanged feed data.

This is not a new carousel/gesture implementation. Live browser behavior still
needs regression checks alongside Home and Preview; the small DOM harness is
not a substitute for a real browser or iPad.

## Verification

`npm run test:recommendation` (also included at the start of `npm test`) runs 30
Node tests against the actual production functions. Covers cold start, meaningful
reading, decay, malformed history, personal-content isolation, URL aliases,
linked-article deduplication, photo filtering, refresh rotation, diversity,
exploration, custom/ambiguous categories, stable inputs, bounded candidate work,
render cache invalidation, decoded-node reuse and browsing-order preservation.
Network/image/DOM services in the render contract tests are test doubles.

Locally verified: all 30 tests, JS syntax, isolated checkJs for the new ranking
helpers, and whitespace validation. The same 30 tests also passed against a
local three-way integration of the RSS-file changes from Home #20 (`950c5129`)
and Preview #21 (`89ba6181`); this is not a merge of either PR or whole-app E2E.

Not run here: full repository `npm test`, Chromium/WebKit suites, iPad/iPhone,
live feeds, subjective recommendation quality or on-device performance. The
execution environment could not clone/install dependencies over the network.
Before merging, integrate current Home/Preview, run `npm test`,
`npm run test:ingestion` and `npm run test:home-ui`, and check real Home refresh,
card photos, Preview/Reader routing and a few representative reading histories.

## Discovery loading presentation (2026-09-28)

Home reserves three existing 3:4 card footprints during a cold feed load.
Each arriving card occupies a footprint while its photo loads, with a theme-aware
graphite glass skeleton covering the image, publisher and headline regions.
Cards cannot be opened or keyboard-focused until the photo succeeds. Successful
loads fade the overlay over 650 ms without changing card geometry; reduced motion
disables the shimmer and fade. Existing decoded cards remain visible on refresh.
Decision 015 supersedes missing/failed-cover exclusion: local artwork keeps
cards selectable without downloading article HTML to repair their covers.
The shared control glass and Lookup materials are unchanged.

Home refresh starts at the first recommendation. When a rail already at its
start replaces skeletons/cards, CSS snapping is suspended for two animation
frames and the scroll offset is reset after layout. Ordinary updates while the
user browses later cards continue preserving their position and order.

## Opt-in RSS shadow redesign (2026-10-02)

[Decision 014](014-rss-readiness-shadow.md) adds a separate, default-off server
readiness/quality pipeline and offline paired evaluation. The existing loader
and this decision's visible ranking remain the default. A later reviewed client
activation can select its explicitly approved/candidate inventory; no rollout
is authorized by adding the code.

## Narrow promotional junk exclusion (2026-10-03)

`rssObviousPromo` rejects only a promotional headline (coupon/promo/discount/voucher
codes, or an urgent percentage-off deal) with all three supplied-text signals:
redemption/checkout instructions, explicit savings, and sales boilerplate such as
verified codes, expiry or shop-now language. Developed bodies and editorial
signals for reviews, buying guides, reporting, research, discussion or explanation
stay visible. A lone discount keyword or uncertain snippet never rejects an entry.
This is a small local rule, not a completeness or general quality judgment.

The parser excludes matching entries before publishing metadata. A cache record
written after that check carries a discovery-filtered marker; a shortened
snippet cannot overturn a decision made with supplied prose. Unfiltered
candidates are still checked by ranking/card selection. Decision 015 applies
the same lexical English/promo rules at the optional catalog boundary, without
claiming Jev approval. Saved material is unchanged; Jev stays OFF.

## Selected-article intent and optional catalog (2026-10-05)

[Decision 015](015-rss-intent-and-public-catalog.md) removes background article
cover and Medium owner-body fetches, preserves ranking and Read commitment,
and proposes a separate default-off shared metadata transport. Preference
history stays private; custom feeds never enter its server inventory.
