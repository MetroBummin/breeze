# RSS selected-body regression: October 7

## What changed

The article parser and RSS implementation are byte-identical between builds 244
and 245. Against the pre-#99 base `d103bb31`, article body extraction and supplied
feed parsing remain unchanged; the later article module differs only in cover
selection. The material change was #99's selected-intent policy: Medium owner
bodies stopped being checked before publication, and legacy feed bodies were
stripped into metadata.

A controlled historical comparison supplied the same three unreadable Medium
candidates: the pre-#99 client published zero; build 245 published all three.
That explains increased exposure to failures without proving any change in
publisher availability. A photo is not a body-readiness certificate.

Two deterministic client defects were separately reproduced:

1. A downloaded explicit RSS body is discarded before ordinary selection; the
   original page is then required even when the feed supplied a usable body
2. A failed Medium owner request is cached as an empty successful result, so
   manual retry cannot retry that request until the cache is cleared

## Minimal correction

Keep supplied bodies only in bounded, ten-minute client memory and consume them
on selection through the unchanged parser. Keep persistent/shared caches as
metadata. Remove failed owner jobs with an identity guard; retain coalescing for
pending and successful jobs. Do not restore Home body prefetches or add automatic
retry/AI/server work. Decision 015 defines all memory and freshness bounds.

## Controlled transport measurement

The adjacent JSON records source SHA-256 hashes and a single non-rendering VM
trial against exact build-245 RSS source. Each of thirteen synthetic feeds has
one explicit body. Feed transport delay is 10 ms; the unavailable original page
would cost 40 ms. These are fixtures, not production egress, actual publisher
success rates, billed savings, or browser first-frame Home latency.

| Measurement | Build 245 | Fixed |
| --- | ---: | ---: |
| Cold Home feed requests | 13 | 13 |
| Cold Home uncompressed fixture bytes | 1,301,241 | 1,301,241 |
| Fixture Home load | 29.83 ms | 28.02 ms |
| Selected supplied-body article opens | No | Yes |
| Extra original-page request for that selection | 1 | 0 |
| Fixture selection latency | 40.84 ms | 0.65 ms |
| Manual retry recovers after transient owner failure | No | Yes |
| Owner requests including explicit retry | 1 | 2 |

Home timing differences are noise, not an optimization claim. The meaningful
invariant is unchanged Home request count/response bytes with removal of an
unnecessary selected-page dependency.

Reproduce with `node tests/benchmark-rss-selected-body.mjs <baseline-rss.js> <output.json>`.
The baseline is `b631eb5cbb4e9206486d0c4c176135eb798ce7da:scripts/importers/rss.js`,
Git blob `9cd807c058046b84be57fe69b65545c121cd1b27`.

## Verification and limitations

Eleven new deterministic regressions pass. They cover body reuse, actual import,
no preselection parsing, source identity, custom-source privacy, cold restart,
time expiry/rollback, refresh revocation, UTF-8 budgets, concurrent failure,
late-job identity and retry success. Full `npm test` passes. Existing focused
catalog/hybrid/egress tests pass: 54 passed, one optional old-baseline comparison
skipped.

A browser test runs the real RSS/Readability pipeline and Preview retry UI in
phone light/dark, checks no persistence, and rejects a restricted/truncated feed
preview. All non-local requests are blocked and the optional introduction
provider is stubbed. Local Chromium could not launch because this execution
runtime disallows its Unix socket; no local browser-pass claim. A dedicated
Chromium/WebKit CI job supplies that independent proof.

This does not establish readability of all pictured candidates. Unknown or
restricted original pages and metadata-only restarts still need a separately
reviewed admission/readiness design. The specific reported article's underlying
publisher/network failure has not been established. No publisher restriction
was bypassed, production setting changed, paid provider invoked, release
merged, or deployment performed in this investigation.
