# Lightning lookup: branch experiment

Base: `529168ff85c09696acbf66d894bf9095fe4b6b03`.
Branch: `chatgpt/lightning-lookup-experiment-20260928`.
No main merge, deployment, secrets, database migration, provider change or paid AI call was performed.

## Behavior and limits

Reader Aa has a default-OFF, per-device switch. Its description discloses that opt-in sends reading context before a tap and consumes AI usage. Signed-in readers can prepare at most two sentences around the viewport anchor; this is not eye tracking. Long/unsupported sentences or missing units use normal lookup. The original word lookup implementation is unchanged; the experiment is a removable adapter loaded afterwards.

Prepared maps are held in a separate IndexedDB cache, scoped by account, book, mode, exact sentence, neighbors and schema version. Memory holds 32 sentences; disk is capped at 160 and records expire for reuse after 7 days. Pruning occurs on writes. Only tapped words enter the existing vocabulary/expression lifecycle. Saved/manual meanings win, deleted meanings are respected, and explicit Retry bypasses prefetch.

Warm hits have immediately readable text and a 200 ms soft-focus/opacity arrival; reduced motion skips the animation. Cold misses retain ordinary lookup. A matching in-flight preparation is joined rather than duplicated. Prefetch does not reposition or rebuild Reader content.

One speculative request runs at a time, separated by at least 1.2 seconds. The client attempts at most 200 prepared sentences per day and preserves a 10-unit foreground reserve based on the latest known quota. Each sentence consumes one existing server quota unit. Client counters are not an authorization boundary: the server validates size and uses the existing atomic quota. Cancellation cannot refund work already accepted by the provider. No speculative provider retries or free third-party routing were added.

## Validation performed

- `npm run test:lightning`: server contract and simulated-client tests pass. Covers input bounds, expression members, missing units, auth, server gate, quota, synchronous preview, no automatic Wordbook writes, persistence, deleted meanings, saved-meaning priority, Retry bypass, no tap-time disk reads, in-flight deduplication, OFF cancellation, account change, reduced motion, and unavailable backend.
- `npm run typecheck`: no new errors (34 existing diagnostics against baseline 37).
- Existing lookup architecture/contract, word lifecycle, word integrity, sentence lifecycle, EPUB geometry, word spans, lemma and READY checks pass.
- Static build/structure checks pass. Full `npm test` was attempted but did not complete within the execution timeout; do not interpret this as a full-suite pass.
- Browser harness is included, but this environment refused page navigation with `net::ERR_BLOCKED_BY_ADMINISTRATOR`. No browser rendering, real-device result, live model quality, latency or cost claim is made.

## Before physical-device QA

Build this branch, not main. A separately approved test-server deployment must include `server/dict/prefetch.ts` and the modified `server/dict/index.ts`, with `LIGHTNING_PREFETCH_ENABLED=true`. The default server gate is OFF. Keep the existing provider/auth/quota configuration. Deploying only the frontend is insufficient: an old/disabled server shows a settings notice and falls back to normal lookup. Do not enable this on production merely to run UX tests.

Use `tests/fixtures/lightning-reading.txt`, a separate test account and the existing branch build workflow. In the web build, verify the stamped script is loaded; for iOS rebuild the web bundle before syncing the native shell. No 40,000-word dictionary download or SQL import is needed.

1. OFF: ordinary behavior and no `prefetch` requests.
2. ON: wait until a preparation completes; tap bank and gave/up. Confirm immediate text, one subtle reveal, stable scroll/word geometry, and one saved meaning only after the tap.
3. Tap the same saved word, Retry repeatedly, and delete a meaning. Confirm existing saved text is never replaced by a speculative response and removed meanings do not reappear.
4. Tap while a batch is pending, scroll rapidly, switch book/mode/account, hide the app, go offline and turn OFF. Confirm no stale UI, duplicate foreground request for the same pending preparation, or continued scheduling while inactive.
5. Repeat on Text/PDF/EPUB, Safari/web, iPhone/iPad and reduced-motion mode. PDF ink and gestures need real-device regression checks; server/client tests do not establish their rendering correctness.

`BreezeLightning.stats()` reports request/prepared-sentence/hit/miss counts and returned token usage, without sentence text. Measure warm-hit rate and tap-to-first-readable-paint separately from preparation latency. A 200-tap day does not imply 200 prepared sentences; use actual counts to estimate cost. The batch prompt is new and its contextual/idiom quality still requires live evaluation against normal lookup.
