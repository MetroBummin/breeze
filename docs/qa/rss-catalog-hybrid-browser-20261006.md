# Hybrid RSS real-browser contract

The dedicated `tests/verify-rss-catalog-hybrid-browser.mjs` runs the real app,
photo decoder, Preview, Reader and IndexedDB with synthetic intercepted network
responses. It serves explicit client configuration `[7]` (WIRED only) inside the fixture HTTP server. The Node
release-contract test reads repository `config.js` and requires its explicit
managed IDs to be `[7]` with the catalog enabled. This test patch does not edit
production configuration; the release owner applies that reviewed switch.

Integrity CI runs the script independently for Chromium and WebKit, including
when another browser step fails. Each engine has a 120-second process-group
limit and a 110-second internal deadline. JSON receipts and screenshots go into
the existing `rss-catalog-browser-proof` artifact under each engine's `hybrid/`.

Invocation for a fully materialized checkout with installed Playwright engines:

```sh
for engine in chromium webkit; do
  BREEZE_QA_ENGINE="$engine" \
  BREEZE_HYBRID_PROOF="/tmp/breeze-catalog-browser-proof/$engine/hybrid" \
  timeout --verbose --kill-after=5s 120s node tests/verify-rss-catalog-hybrid-browser.mjs
done
```

Covered contracts:

- Before the held catalog resolves, all twelve unmanaged feeds, including the three Medium feeds, have published and
  decoded legacy cards remain usable; no managed feed uses direct/relay fallback
- A successful single-source WIRED catalog completes all thirteen retained source groups
- Article URL, source name, feed URL and supplied photo URL match each source
- One supplied photo intentionally fails both direct and image-relay retrieval;
  its candidate remains retained while its terminal card is withheld
- A separate cold catalog failure preserves legacy candidates and the retry
  cooldown, without a managed-source request herd
- Warm load and relaunch reuse both metadata caches with no discovery transport
- Discovery neither fetches article bodies nor creates books or reading progress
- A real photo-ready card click opens a transient Preview with a held selected
  body; body preparation still creates no book or IndexedDB body record
- Read persists exactly that selected article and body, without another body fetch
- The existing introduction cache may retain its bounded selected-source excerpt
  in the cache key; the full-body sentinel stays outside that excerpt and out of
  localStorage, while neither sentinel enters an RSS discovery cache

The script checks candidate inventory separately from photo-only display. It
requires some decoded cards, never thirteen visible cards or artwork fallbacks.
Every external request is intercepted, including the intentional synthetic CORS
failure before the unchanged legacy relay. There are no live publisher,
production Supabase, server original-probe or paid requests.

Local validation: Node syntax check and workflow-structure checks only. No local
Chromium launch was retried; browser assertions are pending the integrated CI
run. The earlier 25 passing Node client tests remain a separate result.

## First CI finding and fixture correction

Run `37440237187` on PR #111 head `de1355c370d8b7a77299fa1eacb3ded6fa25e2c3`
reached the prepared Preview in Chromium and WebKit, then failed the broad
localStorage sentinel assertion. `articlePreviewKey` intentionally includes the
existing bounded source excerpt. The original fixture put its sentinel at the
start of every body paragraph, including that permitted excerpt; this was a
fixture mismatch, not an IndexedDB book/body write.

The corrected fixture separates an early preview-evidence sentinel from a late
full-body sentinel. It positively checks the existing bounded introduction cache,
rejects either sentinel in RSS caches, keeps the full-body localStorage rejection,
and retains the pre-Read empty IndexedDB and post-Read single-body assertions.
No product code, display eligibility, source ownership or request budget changes.

## Reader warm request admission

Run `37441414506` on head `cf99e8807722806cf163788ba2a930bb6bd5c7d2` passed
both engines' persistence assertions and then rejected the Reader's existing
`POST /functions/v1/dict` as unexpected. `scripts/reader/reader.js` calls
`warmDict()` only after entering Reader for a non-transient book;
`scripts/dictionary/dictionary.js` sends exactly `{op:'warm'}`. This warms the
function and reports capability without performing a word lookup or spending
AI quota.

The fixture now fulfills only that exact request after a trusted Read-button
click, with matching selected/saved Reader source. Discovery and Preview must
have zero dictionary requests and zero Read admissions. The receipt records
before/after intent and the admitted warm payload. Any earlier dictionary call,
other operation, extra payload field, wrong source or method remains unexpected
and fails the unchanged final unexpected-request assertion. Product behavior,
photo display, catalog ownership and all persistence assertions stay unchanged.

## Final 244 WIRED-only rollout

The release owner narrowed the shared partition to `[7]` after the live Medium
shared-feed transport was unavailable. The twelve legacy IDs are
`[0,1,2,3,4,5,6,8,9,10,11,12]`, preserving all thirteen sources. Medium uses its
existing local transport even when the WIRED catalog succeeds; a catalog error
never changes transport ownership or fetches WIRED through the legacy path.
The cold request budget is one catalog plus twelve legacy feed requests.

The dedicated Chromium/WebKit fixture now exercises this exact rollout. Generic
Node coverage retains the explicit four-source partition to test the reusable
loader; two additional Node contracts verify the actual `config.js` switch and
the final one-plus-twelve transport behavior on both catalog success and error.
All photo-only display, photo provenance, cache, selected-body persistence and
Read-gated dictionary-warm assertions remain intact.
