# Explicit hybrid RSS client verification

2026-10-06. Prepared from the combined 244 snapshot, preserving PR #110's
stable-owner and generation-budget code. No production configuration, database,
server source admission, scheduler, credential, deployment or release is changed.

## Reviewed opt-in, pending backend gates

After the backend security and warm-inventory gates pass, the release owner can
add these two properties to the existing `window.BREEZE_CONFIG` object:

```js
RSS_CATALOG: true,
RSS_CATALOG_FEED_IDS: [7, 9, 11, 12],
```

Do not ship only `RSS_CATALOG: true`: omitting the explicit ID array intentionally
retains the older all-catalog behavior. This client patch leaves `config.js`
untouched, so the catalog remains OFF by default. Keep the existing public
Supabase URL/key unchanged. No new credentials are needed.

The matching managed server inventory is IDs 7, 9, 11 and 12 (WIRED and Medium).
Server `RSS_CATALOG_ORIGINAL_FEED_IDS` remains empty. The other nine sources keep
the current client transport and local cache; shared server approval is neither
required nor inferred for those unchanged client requests. Rollback is client
`RSS_CATALOG: false`, with no deletion of user data.

## Verification

Executed locally without a browser or external data requests:

- `node --test tests/verify-rss-catalog-client.mjs tests/verify-rss-catalog-hybrid.mjs`
- 25 tests passed: 10 unchanged compatibility tests and 15 new hybrid tests
- `node --check scripts/importers/rss.js`
- `node --check tests/verify-rss-catalog-hybrid.mjs`

The unchanged fixture `tests/egress-rss-transport.mjs` was fetched from main
`693488cfe25419654e91d5bf18a03cbb8d8d591c`, because the supplied local snapshot is
partial. It is not part of the implementation diff.

Covered behavior:

- Exactly one catalog request plus nine legacy feed requests supplies all13
- Concurrent consumers coalesce; legacy/custom publication does not await catalog
- Errors, missing records, disabled sources and a duplicate managed custom alias
  never fetch managed feeds through the legacy path
- Forced refreshes and rotations preserve catalog retry cooldown while allowing
  the existing independent legacy refresh behavior
- Separate catalog/legacy warm caches survive rotation and restart; source age,
  offline expiry and backward-clock rejection remain effective
- Duplicate, sparse, empty, string and out-of-range partitions fail closed
- Catalog stream/cache bounds, URL validation and metadata whitelisting remain
  isolated from healthy legacy inventory
- Medium owner/body fetching is selected-intent-only and coalesces
- All13 fixed feeds can use existing client original-photo recovery in hybrid
  mode; supplied, custom, social, linked and unsafe cases keep their exclusions
- Supplied photos take priority and spend zero original-page requests
- Concurrent managed/legacy rail owners share two serialized original lookups;
  a warm repeated consumer does not reset the exhausted budget

The focused tests execute the actual RSS loader and cover ownership code with
synthetic transport. They do not prove browser rendering, image decoding, live
publisher reliability, deployed backend security, source permission, inventory
warmth or billing. Chromium was not retried after the known local startup
failure. Full browser and repository CI remain the integrator's release gates.
