# Social-link import hardening

Base: PR #24 `dd6785e`. PR #25 is stacked on the audit hardening branch, not
main, so it preserves pinned transport, atomic persistence, full-content
identity and latest-intent navigation. No production deployment or API secrets.

## Root issue and implementation
The ordinary parser rejected direct X URLs; only an external RSS body could
previously import an X post. Threads pages had no post-identity boundary and
could be offered to generic Readability. A short social post must not need 500
characters, but an OG description must not pretend to be a full long Article.

The new adapter normalizes known X/Threads permalink aliases, uses fixed official
public X oEmbed for single posts, and accepts public HTML only when an explicit
body matches the requested post. Newlines, links, evidenced images, author and
source are kept. Scripts are not inserted into Reader. Replies/quotes are not
silently joined to the root. The timestamp/permalink and body must belong to the
same post element, including nested quoted posts. X Articles require actual
articleBody rather than a card description. Incomplete content fails explicitly.

The retrieval budget is 18 seconds with four distinct concurrent social jobs;
identical canonical URLs share a job. Failures release jobs for retry and never
persist an empty placeholder. Same text at different social URLs retains separate
source identity. Unsupported media remains an original-source reference.

## Executed verification
Final production source: `848db3e88ba44632f14fe29a6868227bbc06b6a6`.
[Final GitHub Actions run](https://github.com/MetroBummin/breeze/actions/runs/36121062209)
checked out the preceding workflow commit, applied the owner-scope fix, printed
and pushed this source SHA, then executed every check below successfully. The
final follow-up changes documentation and removes the one-time write workflow
only; production code is unchanged. Persistent PR checks are read-only.

- Repository typecheck passed: baseline 37, actual 36, no new diagnostics. This
  is not a claim of zero TypeScript errors.
- `node --test tests/verify-social-import-server.mjs`: **19/19 passed**. Strict
  URL/provider/identity, fixed public endpoint, bounded transport, upstream
  401/403/404/410/429/500, malformed/oversized output. Transport is a test double.
- `node tests/verify-social-import-browser.mjs`: **68 checks passed**, 34 each
  in actual Chromium and WebKit running the app. Network responses are fixtures;
  the real parser, DOM, IndexedDB, reload and Reader are used.
- Stress within that suite: **80 concurrent URL aliases** shared one fetch and
  one persisted book; **30 distinct requests** exercised the four-job cap and
  explicit busy responses without stale navigation; **500 mixed valid/invalid
  payloads per browser** stayed isolated. This is not a live social-platform
  success rate or a load test against X/Threads.
- Covered newlines/link offsets/media, exact target selection, unrelated replies,
  nested quote ownership, missing/truncated body rejection, failures/retry,
  deadline/stream cancellation, saved aliases after reload and Reader entry.
- `npm run test:ingestion` passed all three existing suites, including Chromium/
  WebKit ingestion and RSS checks and dormant native Share Extension contracts.
- **Full `npm test` passed**, including the inherited 25 audit contracts and
  dictionary, sync, vocabulary, Reader/EPUB and READY contract suites. These are
  checks on the #24-based branch, not on a merge of Home/Preview/Annotation/#23.
- Source asset stamps were regenerated; staged diff whitespace check passed.

## Separate public sample (one request)
[Earlier candidate run](https://github.com/MetroBummin/breeze/actions/runs/36120584962)
requested the X official-documentation sample once, without credentials:
`https://x.com/Interior/status/463440424141459456`.
Official public oEmbed returned **HTTP 200**, measured at **140 ms** for that
single upstream request. The response was also parsed by the actual browser
adapter. This is not end-to-end Supabase latency and is not representative of
all posts. Artifact `social-import-proof` / `social-live.json` records the result.
No repeated live requests were used for stress testing. No live Threads/X Article
success was measured. The final nested-owner fix does not change the oEmbed path.

## Supabase runtime follow-up — 2026-09-26
The production `article` function was deployed with the pinned transport.
Supabase's Node shim rejected `ClientRequest.options.lookup`; a direct-IP Node
request also failed its TLS handshake. The Deno TCP/TLS transport keeps the
validated IP socket and verifies the original hostname. With this transport,
the production function returned HTTP 200 for the IANA ordinary HTML sample
and the public X oEmbed sample above. Private IP and private-redirect requests
returned `bad_url` (400), and an X profile URL returned `social_unsupported`
(400). These were one-off live smoke calls, not a throughput or Threads test.

## Not claimed / release gates
No exact failing URL was supplied by the user, so that incident is unverified.
Live Threads/X Article availability, complete multi-post thread retrieval,
login-restricted content, native iOS share-sheet round-trip, physical iPad
performance remain separate gates. The current native Share Extension remains
dormant. Deploy `article`, `public-fetch.mjs` and `social-embed.mjs` together.
The integrated Preview keeps the deferred-save boundary until Read is pressed.
PR CI on bot-originated commits may require GitHub approval; a pending or
approval-required run is not represented as a successful run. See the exact
completed verification run above. No repository approval policy was weakened.

## Run
```sh
node --test tests/verify-social-import-server.mjs
node tests/verify-social-import-browser.mjs
npm run test:ingestion
npm test
```
