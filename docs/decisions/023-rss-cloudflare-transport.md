# Public RSS transport on Cloudflare Workers

2026-10-10. Owner requested moving RSS traffic to Cloudflare, referencing the
older book-file relay. Keep the two services separate: no book keys, R2 bucket,
account grants or device pairing are reused by this service.

## Scope and product invariant

First move built-in RSS transport only. Existing browser parsing, selected-read
supplied-body reuse, photo admission, local metadata cache, WIRED catalog [7],
custom feeds and article import retain their owners. Do not silently reroute a
failed enabled Worker back to Supabase. A failed feed may use existing bounded
last-good metadata; it must not renew its timestamp.

The earlier metadata-only catalog remains a possible later improvement. Existing
server parsing depends on Node/linkedom and has not been shown to fit Workers
Free's 10 ms CPU budget. A fixed per-feed byte relay avoids introducing that
unverified parser. This reduces Supabase egress, not the XML byte count sent to
the phone. Article HTML/photo lookup still uses existing paths and is not claimed
migrated by this change.

## Boundaries

- GET /feeds/{id} uses the repository's fixed public inventory only; no URL input,
  query variants, caller cookies, Authorization or private data are forwarded.
- HTTPS exact reviewed publisher redirect aliases, at most three, public-network compatibility
  flag; no Node DNS/socket shim or private network/service bindings.
- 8-second fetch deadline, actual streamed 3 MB cap matching legacy transport,
  successful XML MIME only. Never cache errors or Set-Cookie responses.
- Respect publisher private/no-store/no-cache and shorter shared max-age, subtracting upstream Age. Otherwise
  cache at most 10 minutes in Cloudflare's local, evictable Cache API.
- Cache hits preserve source fetchedAt; client rejects missing/future/>24h age.
  No new stale-on-error cache policy or persistent body store is introduced.
- No Response, stream or in-flight fetch is shared across Worker invocations.
  Cold requests may each fetch until Cache API fills. No global quota or
  rate-limit guarantee is claimed. CORS is not access control.

## Activation and evidence

RSS_WORKER_URL is opt-in and must stay unset until a real Worker URL has been
verified. Never invent a production URL. Deploy only reviewed exact bytes, test
all enabled feeds and CPU/request behavior on the free tier, then activate with
recorded rollback (unset RSS_WORKER_URL). Existing app builds retain old config
until updated; web activation does not change installed native assets.

No new token, secret, paid plan, R2 or KV binding is required by this design.
Account login and any new agreement/permission require their normal checks.
Unit tests use controlled public responses; they do not establish publisher
availability, actual Cloudflare CPU usage, or production deployment success.
