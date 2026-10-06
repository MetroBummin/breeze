# RSS photo provenance after 1.8 (240)

Base: main `f7a2889296226f1ebca03cdcc45d09b739b05e88`.
RSS source SHA-256: `66eb363409d541239dddaedfcff8591aba234d0a69cf2845b1697965555173da`.

The required outcome is a publisher photograph when usable metadata/image bytes
exist, a finite pending state during genuine work, and the existing artwork
otherwise. RSS photo absence, failed retrieval, unattempted budget-limited work
and actual no-image originals are different facts.

## Actual originals

[Read-only public audit](https://github.com/MetroBummin/breeze/actions/runs/37409797315/artifacts/11388632154)
captured seven fixed public feeds at 2026-10-06 03:37 UTC. All returned 200.
Four parsed entries had empty supplied photo metadata but accessible original
OG photos. The received photos decoded in Chromium. No original body or image
bytes are committed; [minimal metadata fixtures](../../tests/fixtures/rss-original-cover-metadata.json)
preserve URLs, the actual OG tag, byte position and HTTP/decode evidence.

| Source/example | Parsed feed photo | Original OG position | Image response/decoded size |
| --- | --- | ---: | --- |
| [TMZ / Halle Berry](https://www.tmz.com/2026/10/05/halle-berry-claims-shes-been-a-dv-victim-and-would-never-hurt-child/) | Empty | 10,041 bytes | 200, JPEG, 2048×1152 |
| [TMZ / Jim Bakker](https://www.tmz.com/2026/10/05/televangelist-jim-bakker-dies-at-86/) | Empty | 6,764 bytes | 200, JPEG, 2048×1152 |
| [TMZ / Cornell](https://www.tmz.com/2026/10/05/cornell-fraternity-brother-lawyer-criticizes-the-school/) | Empty | 7,553 bytes | 200, JPEG, 2048×1152 |
| [Conversation / Gaza](https://theconversation.com/three-years-after-october-7-global-attention-on-gaza-has-receded-the-real-test-will-come-after-israels-election-292360) | Empty | 1,631 bytes | 200, JPEG, 1356×668 |

Supplied-photo Dexerto and Conversation controls also returned/decode correctly.
This sample rules out a late-prefix/decoder defect in these received originals;
it does not prove every article has a photo or reproduce the user's device's
authenticated relay/cache history. The cloud workspace proxy blocked raw live
HTTP/DNS, so the bounded opt-in CI audit used the repository's pinned public
transport. Its source responses, hashes and decoder evidence are distinct from
deployed relay and device provenance. A follow-up audit records supplied-field
image inputs, both-engine decoding and two unauthenticated current-client relay
GETs. [That audit](https://github.com/MetroBummin/breeze/actions/runs/37411517237/artifacts/11389137684)
at 04:00 UTC receives 200 from six feeds and 429 from NASA; the earlier 03:37
audit received 200 from all seven. It confirms TMZ's three entries have no image/media fields; Gaza's
Atom body contains only a 1px tracking image. All four original OG JPEGs and
both supplied-photo controls decode in Chromium and WebKit without a referrer.
The two anonymous relay GETs return 401; this cannot establish signed-app failures.

## Confirmed mechanisms and fix

The old code stored non-200 relay responses and photo-less truncated prefixes
as 30-minute negative records. Retrieval failures and uninspected trailing HTML
therefore blocked later successful metadata recovery. Only complete, valid,
successful no-image HTML responses now create negatives. Cache v2 preserves
valid old positive photos and ignores unverifiable old negatives. Same-generation
attempt guards prevent automatic retry loops; an explicit new discovery pass
can recover a temporary failure under the same two-request budget.

Metadata extraction skips unsafe/hidden candidates and continues past an invalid
duplicate OG declaration. Public share images remain distinct from restricted
body-image fallback. The pure server export
`extractPublicArticleCover(html, finalPublicUrl)` in
`server/article/cover-metadata.mjs` performs no network, state, DB or body storage.
Its caller must establish successful public HTTP provenance, fixed-source
allowlisting, body/time/request bounds, staleness and cache ownership.

Pinned LinkeDOM preserves uppercase attribute names, so attribute access is now
case-insensitive and retains HTML's first-duplicate precedence. The first
`<base href>` resolves relative candidates against a validated public base;
target-only and later bases do not override it. Empty bases use the final public
URL. Client and server reject credentials, private/IP/local destinations, signed
URLs and nonstandard ports. A safe absolute photo remains usable independently
of an unsafe base. Unresolved relative candidates under an unsafe base throw
`cover_base_unsafe`, which the caller must treat as unknown/error, never a
successful no-image negative. The legacy stream defers relative metadata until
the first base appears, the head ends, or the bounded JSON response is complete.
A real closed head or body opening permits the final public URL to resolve
relative OG photos before a long body reaches the 128 KiB cutoff. Quoted
attributes, comments, raw-text elements and nested templates cannot fake that
head boundary. Early absolute photos and prefix limits remain unchanged.

The two-lookups-per-discovery-generation limit still means never-attempted cards
can retain artwork. Catalog mode currently disables those legacy client lookups;
PR #105's feed-only parser cannot recover the four original-only photos above.
The catalog integration must fill its existing `photo: string` metadata using
bounded shared original-photo lookup, or explicitly choose the existing bounded
client fallback. A pure extractor alone does not populate server snapshots.
This PR does not activate or mutate a catalog, change its schema or increase
legacy request/prefix budgets.

## Validation

- Related Node regression tests: 33 passed, including captured metadata,
  old-cache migration, failure/partial-response recovery, in-flight coalescing,
  stale ownership, private/signed URLs and restricted body candidates. Shared
  case/head/base/entity/malformed fixtures cover server/client parser parity;
  streamed relative metadata and unsafe bases cannot poison the negative cache.
- Chromium: 29 real-app scenarios pass. Four replay captured OG tags at their
  original byte offsets and URLs with synthetic image transport. The live audit
  separately validates the original image bytes. Two replay old positive and
  poisoned negative caches. Existing budget, refresh, no-image/error/timeout,
  image-failure, canceled-return, light/dark geometry and reduced-motion checks
  remain. An error does not automatically retry; explicit refresh recovers.
- Full `npm test`: 505 Node-runner tests, 504 passed, zero failures, one existing
  skip, plus the existing script checks. Typecheck passes its current baseline.
- `ios:sync` passes. Source, `www` and Capacitor public RSS/CSS/index bytes align.
- Exact-head Chromium/WebKit CI and catalog-path integration are pending.
  Local WebKit installation remains blocked by the download proxy.

Marketing 1.8 and Cloud build-number logic are unchanged. Parent owns integration,
merge, production preparation and the next TestFlight-only build. No activation,
App Review, Apple build, paid provider, API key or PR #102 action is performed.
