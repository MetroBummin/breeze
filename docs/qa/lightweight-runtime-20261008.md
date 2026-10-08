# Breeze runtime and package lightweighting — 2026-10-08

Baseline: main `e7b61d5304d20d639d45fc8dd23116db5d6446e5`.
Measurements come from actual `tools/build-www.mjs` output and local browser
requests. [Machine-readable evidence](lightweight-runtime-20261008.json).

## Result

| Boundary | Before | After | Saved |
|---|---:|---:|---:|
| Unpacked native `www`, bytes | 20,811,775 (205 files) | 15,604,417 (190 files) | 5,207,358 (25.02%) |
| Native files, individual gzip-9 sum | 17,772,107 | 12,750,290 | 5,021,817 |
| Native files, individual Brotli-11 sum | 17,537,819 | 12,531,951 | 5,005,868 |
| Synthetic `www` ZIP, DEFLATE-9 | 17,792,522 | 12,769,868 | 5,022,654 |
| Eager JavaScript, raw bytes | 1,656,530 (62 files) | 1,352,621 (57 files) | 303,909 |
| Eager JavaScript, gzip-9 sum | 523,849 | 441,065 | 82,784 |
| Eager JavaScript, Brotli-11 sum | 444,760 | 376,308 | 68,452 |
| Worker shell including fonts, raw bytes | 2,046,535 (82 files) | 1,741,983 (77 files) | 304,552 |
| Fresh onboarding, local response bytes | 2,814,563 (87 responses) | 1,787,158 (81 responses) | 1,027,405 |
| Returning Home, local response bytes | 3,492,419 (92 responses) | 2,465,014 (86 responses) | 1,027,405 |

The shell is HTML, eager scripts/styles and CSS font dependencies. Startup CSS
is unchanged at 251,212 raw bytes. Browser measurements use Chromium
151.0.7922.173, 390×844, empty contexts, no-store local HTTP, blocked service
workers and external requests, measured after `homeReady` plus 1.5 seconds.
These are byte counts, not launch-speed results, production CDN transfer sizes,
or signed IPA/APK sizes. ZIP and per-file compression are separate estimates.

## Five actions and safeguards

1. **Exclude dormant assets from native packaging.** Five stage PNGs and their
   manifest (3,953,057 bytes), unreferenced round Thunderhead (1,128,989), parked
   exam/dictionary-seed modules (37,311), and dormant FSRS/engine scripts (95,211)
   total 5,214,568 excluded bytes. Added runtime safeguards leave a net 5,207,358
   saving. All source assets remain. No approved b/br/monochrome/logo alternative
   was removed. `tools/build-www.mjs` refuses an advanced-review ON package until
   its required entry scripts/assets are deliberately restored.
2. **Stop loading the OFF review engine and hidden mascot.** `index.html` removes
   its two script tags and the hidden stage image source; advanced UI keeps its
   guard and creates no polling timer. This saves 95,211 eager JS bytes and the
   formerly hidden 722,853-byte stage-1 request. These numbers are subsets of the
   totals above, not additional package savings. The ON browser fixture explicitly
   supplies its dependencies; simple-card behavior and stored records remain.
3. **Use the existing loader for optional code.** Readability (89,980 bytes)
   loads at HTML/article preparation, Homeward data (100,533) before that local
   book opens, and frame instrumentation (26,038) only on debug opt-in. All three
   still ship for native offline use. Shared promises coalesce work; failed loads
   permit retry. Version stamping updates deferred URLs before hashing the loader.
   New/old worker caches retain exact Homeward and Readability addresses, without
   carrying obsolete application scripts. Missing Homeward data keeps reading
   available and does not silently fall back to paid AI/metadata requests.
4. **Remove legacy Homeward migration from launch.** Only the selected local
   61-paragraph edition is considered. A 3-second source timeout, exact source
   comparison, transactional durable-record comparison, navigation/account/book
   ownership and a small position checkpoint preserve local text and progress.
   Failed preparation retains the readable edition. This adds correctness code;
   no speed claim is inferred from line count. See decision 012 for the ownership
   and post-commit cancellation contract.
5. **Avoid native service-worker duplication; measure before redesigning storage.**
   Capacitor Android HTTPS and iOS skip worker registration and runtime-library
   caching; web behavior remains. Synthetic `loadBooks()` measurements for 10,
   100 and 500 books (1.02/10.23/51.18 MB text) were 4.9–15.2, 13.9–20.7 and
   50.9–74.1 ms across three Chromium warm IndexedDB reads. This is not rendering,
   total startup or device evidence; splitting book metadata/body remains a
   separate architectural decision.

## Validation and boundaries

Local checks passed: full `npm test`, typecheck (existing diagnostic baseline
34→32), `npm run ios:sync`, native package/source retention, native worker guard;
Chromium deferred resource/failure/retry/debug/import cases, two cold offline
worker-cache cases, existing TXT/EPUB/PDF offline import and shell upgrade,
Homeward preparation/cancellation (13 cases), existing local lookup
(314 sentences, 43 words, 34 phrases, no AI requests), HTML/RSS ingestion,
advanced ON review and shipped OFF simple-card suites.

CI adds Chromium/WebKit deferred-resource and Homeward-preparation jobs and
native package checks. Remote results belong to the PR's exact head; this local
report does not assert they passed. Local WebKit installation returned CDN 403.
Physical iOS/Android and signed archive sizes remain unmeasured.

No book text asset, source paragraph normalization, Memory visual design,
onboarding concept, auth flow, PDF behavior or release number changed. Source
Homeward opening/migration boundaries overlap `main.js`, `longreads.js`,
`reader.js`; importer readiness also touches `library.js`, `article.js`, `rss.js`.
Coordinate these specific files with concurrent work. PR124 onboarding and PR126
Memory work are not included; no merge, deploy or release upload is requested.

Keep: offline Long Reads content/illustrations/covers, legacy EPUB recovery,
approved brand alternatives, vocabulary write journal, sync consistency checks,
existing 950 ms local-answer presentation, auth startup, and PDF/ZIP lazy loading.
No identical-byte duplicate exists inside the audited native package. Identical
native icon slots have platform semantics and are not treated as removable.

Reproduce byte accounting after `npm run www`:

```sh
node tests/measure-runtime-footprint.mjs www
node tests/verify-native-package.mjs
BROWSER=chromium node tests/verify-deferred-resources-browser.mjs
node tests/verify-deferred-offline-browser.mjs
BROWSER=webkit node tests/verify-homeward-open-preparation-browser.mjs
node tests/measure-library-startup-browser.mjs
```
