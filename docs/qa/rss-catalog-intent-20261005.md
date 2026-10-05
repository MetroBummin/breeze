# RSS intent/catalog evidence, 2026-10-05

Dependent draft proposal on PR #97, whose head stays `d103bb31`. Baseline main
1.8(236) is `34b5dc9ba04ffe0f23c61bd89c0163908bd097c6`. No merge, deployment,
live SQL, publisher bulk fetch, paid API, configuration/secret inspection or
user-data mutation took place. Jev remains OFF; server catalog defaults OFF and
its reviewed feed ID allowlist defaults empty. See [Decision 015](../decisions/015-rss-intent-and-public-catalog.md).

## Scoped result

`scripts/importers/rss.js` publishes discovery metadata with supplied photos or
existing artwork, removing background article-cover and Medium-owner HTML work.
`rssResolveSelectedEntry` runs only after actual card selection; existing
ingestion and Read commitment still own parsing/persistence. Discovery cache
records exclude bodies and private/quality fields. An optional catalog GET
replaces default thirteen-feed transport; it cannot refresh upstream feeds or
fall back to rebuilding those feeds on failure. Custom feeds stay separate.

The server has one bounded snapshot, public read-only GET, authenticated fixed-ID
refresh, fenced global claim/cooldown, two workers, pinned public DNS, validators
and source-age expiry. SQL is an offline proposal, not a migration. Permission
and activation gates are recorded in Decision 015. Intent-only loading changes
the legacy client behavior; the shared catalog itself requires explicit opt-in.

## Controlled browser comparison

The adjacent JSON contains exact source hashes, request/body counts, individual
latencies and assertions. `benchmark-rss-catalog-browser.mjs` renders the actual
app with each version's RSS script on the same runtime shell. This isolates RSS
loading; it is not three independent deployed builds or an iPhone benchmark.
Both baselines are immutable Git inputs; PR #97 tree is
`b083c324b290dbddfdd8f43e82e95f90a89ba404`. The current script is hashed in JSON.

All fixtures are synthetic English prose: thirteen 100 KB feed responses,
usable Medium owner feed, one source without a cover, and 200 KB selected
article pages. Every nonlocal request is mocked or aborted. Preview metadata is
mocked; no paid service is called. Direct publisher attempts reject immediately.
Normal delay is 20 ms plus bytes at 1 MB/s; slow delay is 200 ms plus bytes at
200 KB/s, independently per response, without shared bandwidth contention.
Byte totals count UTF-8 uncompressed **relay response bodies**; local app assets,
images, upstream feed refresh and database legs are excluded. They are not a
Supabase bill forecast. Timing measurements are individual local trials with
CPU/browser noise and no statistical speed guarantee.

<!-- benchmark-table -->
| Version / delay | Cold Home requests / bytes | Warm Home requests / bytes | Six Homes requests / bytes | Cold Home first card (ms) | First Preview / reopen (ms) | Preview after warm Home (ms) | Read (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| main236 / normal | 17 / 2,002,024 | 17 / 2,002,024 | 102 / 12,012,144 | 1015 | 164 / 118 | 110 | 205 |
| PR97 / normal | 15 / 1,601,920 | 0 / 0 | 15 / 1,601,920 | 666 | 122 / 60 | 323 | 125 |
| catalogIntent / normal | 1 / 155,417 | 0 / 0 | 1 / 155,417 | 635 | 382 / 313 | 372 | 251 |
| main236 / slow | 17 / 2,002,024 | 17 / 2,002,024 | 102 / 12,012,144 | 1260 | 284 / 68 | 214 | 122 |
| PR97 / slow | 15 / 1,601,920 | 0 / 0 | 15 / 1,601,920 | 1334 | 288 / 76 | 1318 | 134 |
| catalogIntent / slow | 1 / 155,417 | 0 / 0 | 1 / 155,417 | 1478 | 1543 / 1282 | 1310 | 235 |
<!-- /benchmark-table -->

## Immediate shell versus body and introduction (09:40 follow-up)

The prior 1.3–1.5 second figure meant prepared body/intro, not the first dialog.
Before this follow-up, `articlePreviewPrepare` already synchronously opened title,
source and a card photo, with the existing introduction shimmer. This change
also accepts the known metadata photo when no decoded card image is available,
uses line-shaped placeholders only for the missing introduction, and keeps
body retry/article replacement in the same sheet. Existing generation guards
ignore late responses/errors and dismissal. No Home article prefetch is added.

Body parsing precedes the introduction API because it sends actual extracted
paragraphs. Read unlocks after body parsing, independently of the optional API.
Photo availability can still depend on image decode/network; failed images show
local artwork. Fast Read or slow/failed body transport still exposes the wait.

| Catalog scenario | First visible shell frame (ms) | Body / Read ready (ms) | Introduction ready (ms) |
| --- | ---: | ---: | ---: |
| normal / cold Home | 54 | 284 | 335 |
| normal / warm Home | 60 | 287 | 340 |
| slow / cold Home | 59 | 1254 | 1482 |
| slow / warm Home | 56 | 1253 | 1274 |

Timing starts at the actual click event. First shell is the first browser frame
observing an open dialog with known title and nonzero opacity; it is not a native
compositor timestamp. Body readiness observes enabled Read before the mocked
optional introduction completes. Single local trials are not uniform latency.
The JSON hashes the common Preview script as well as each RSS version.

Fourteen local Chromium Preview intent cases pass, including held-body known
title/source/photo, reduced motion, body error/retry without modal close, late
old failure and cancellation without persistence. Pending shell screenshots
cover five sizes in both themes at `/tmp/breeze-preview-shell-proof/`.
Existing four-size Preview layout and 21 resilience cases also pass.
Exact updated-head WebKit/CI results must be reported separately.

Six documents means a cold Home plus five document relaunches sharing browser
storage within ten minutes, with no reading in that sequence. Separate click
scenarios verify meaningful Preview, dismissal/reopen, and Read with exactly one
saved book. Preview alone creates no books. Catalog warm Home uses no relay
requests. Ordinary unsaved Preview reopen still refetches the article; only
in-flight article dedup and selected Medium owner-feed reuse are measured.
The first selected Preview now pays article latency that older Home preparation
could hide. Read does not refetch the selected body, but still pays local save,
image and Reader work. Report the tradeoff, not a universal latency improvement.

A cold server GET has empty metadata and zero upstream work; the browser stays
empty rather than rebuilding feeds. One authorized mocked server warm fetches
each of thirteen fixed feeds once. Subsequent client documents never refresh
upstream inventory. This excludes the deployment/warm-up cost from client totals.

Actual delayed Medium card selection fetches one owner feed, no fallback article
page; closing before it resolves keeps Preview closed and shelf empty. Retry
reuses that selected owner feed; only Read saves the book. Existing artwork is
captured at 390×844, 320×568, 834×1112, 1440×900 and 1024×600, each light/dark.
Assertions require a selectable card, one visible headline and artwork. Manual
image inspection caught and corrected photo-overlay styling on photo-less cards.
Local proof directory: `/tmp/breeze-catalog-browser-proof/`.

Reproduce with full Git history and installed Chromium:

```sh
CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node tests/benchmark-rss-catalog-browser.mjs
```

CI uses `BREEZE_CATALOG_CURRENT_ONLY=1 BREEZE_CATALOG_QUICK=1` to run the current
browser contracts independently of historical Git objects, in Chromium/WebKit.
Its proof upload includes counts, assertions and size/theme screenshots.

## Validation and limits

- Full `npm test` passed; existing checkJs allowance stayed at 34 diagnostics.
- Nineteen new Node catalog/client contracts passed, including actual PGlite SQL
  role/RPC access, oversized writes, fencing, thirty simultaneous refresh calls,
  offline/expired/corrupt/empty inventory, stream bounds and clock rollback.
- Deno 2.9.6 function type check and permission-limited OFF boot passed. OFF boot
  permits only reading the mode flag; service-key/environment/network access is
  unavailable to the test.
- Existing Chromium ingestion checks passed: article/feed parsing, Home-only
  discovery, share handoff, deduplication, fallback and mobile Reader. Existing
  Chromium RSS Home and four-size Preview checks also passed.
- Local WebKit installation is blocked by the browser CDN's HTTP 403. CI owns
  WebKit validation; exact-head results must be reported separately.

The parent production audit reported 4.791/5 GB for Sep 20–Oct 20 and an
approximate 57% PostgREST/43% Functions daily chart. Its last-day sample had 100
full wordbook GETs without response lengths and 988 article requests for 363
URLs, totaling 71.15 MB of declared bodies. Repetition and large stored blobs
explain plausible mechanisms even for solo use; they do not establish each
response size, human identity or all-cycle attribution. Never multiply all
wordbook GETs by the largest arbitrary stored row. The observed daily decline
from about 620 MB to 122 MB is not causally attributed to a commit.

Historical attribution still needs per-request actual sent bytes (including
chunked responses), selected row/account or safe hashed identity, request/feed
category, client build and cold/foreground/selection trigger over the complete
cycle. No private payload logging is needed. There is no evidence that CI caused
production article traffic: normal browser routes abort/mock external calls and
live comparison is opt-in. A matching URL or user-agent alone is insufficient.
