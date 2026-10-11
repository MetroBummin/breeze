# Breeze RSS transport

Separate from breeze-book-relay-dev. No secrets, R2/KV, Supabase bindings or cron.

Local contract checks: npm run test:rss-worker
Deployment config: server/rss-worker/wrangler.json

Use an already authorized Cloudflare deployment workflow. No credential should
be added to the repository or sent through chat. Activation requires the actual
verified deployment URL in BREEZE_CONFIG.RSS_WORKER_URL; it is intentionally not
set in this candidate. Test /health and each /feeds/{id}, including cache hits,
publisher restrictions, rejected arbitrary URLs, and Workers CPU/error metrics.

Free-tier CPU and request limits still apply. This service relays whole RSS XML;
it moves transfer off Supabase but does not claim a smaller response payload.
