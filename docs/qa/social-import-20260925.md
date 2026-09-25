# Social-link import hardening

Base: PR #24 `dd6785e`. This PR is stacked on the audit hardening branch, not
main, so it does not discard pinned transport, atomic persistence, full-content
identity or latest-intent navigation. No production deployment or API secrets.

## Root issue
The ordinary parser rejected direct X URLs; only an external RSS body could
previously import an X post. Threads pages had no post-identity boundary and
could be offered to generic Readability. A short social post must not need 500
characters, but an OG description must not pretend to be a full long Article.

## What to verify
- 19 Node server tests: strict URL/provider/identity, fixed public endpoint,
  bounded transport, 401/403/404/410/429, malformed/oversized payloads.
- Real whole-app Chromium/WebKit fixtures: source parsing, exact identity,
  newlines/links/images, wrong body rejection, 80 concurrent alias requests,
  30 distinct requests with bounded concurrency, IndexedDB persistence/reload,
  Reader entry, failures/retry, deadline and stream limits, 500-payload stress.
  Network payloads are synthetic; the actual app/DOM/IndexedDB are used.
- At most one unauthenticated X official documentation sample is requested by
  tools/verify-social-live.mjs. Its actual status is recorded separately; a
  blocked or timed-out result is not success and does not repeatedly retry.
- Existing npm test, ingestion and RSS browser regressions must be checked.

## Not claimed
No exact failing URL was supplied by the user. Live Threads/X Article reliability,
full thread retrieval, login-restricted content, native iOS share sheet round-trip,
physical iPad performance, and Supabase runtime/deployment remain separate gates.
The current native Share Extension remains dormant. Server `article` plus
`public-fetch.mjs` and `social-embed.mjs` must be deployed together after review.
Preview #21's separate ingestion path must retain its early-shell/cancel contracts
when these changes are integrated; no existing feature PR was overwritten.

## Run
```sh
node --test tests/verify-social-import-server.mjs
node tests/verify-social-import-browser.mjs
npm run test:ingestion
npm test
```
