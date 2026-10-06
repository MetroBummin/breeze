# Hybrid RSS real-browser contract

The dedicated `tests/verify-rss-catalog-hybrid-browser.mjs` runs the real app,
photo decoder, Preview, Reader and IndexedDB with synthetic intercepted network
responses. It serves explicit client configuration `[7,9,11,12]` only inside the
fixture HTTP server. Repository/production `config.js` remains unchanged.

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

- Before the held catalog resolves, all nine unmanaged feeds have published and
  decoded legacy cards remain usable; no managed feed uses direct/relay fallback
- A successful four-source catalog completes all thirteen retained source groups
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

The script checks candidate inventory separately from photo-only display. It
requires some decoded cards, never thirteen visible cards or artwork fallbacks.
Every external request is intercepted, including the intentional synthetic CORS
failure before the unchanged legacy relay. There are no live publisher,
production Supabase, server original-probe or paid requests.

Local validation: Node syntax check and workflow-structure checks only. No local
Chromium launch was retried; browser assertions are pending the integrated CI
run. The earlier 25 passing Node client tests remain a separate result.
