# Current cover in the edit chooser — 1.8(238) follow-up

Base: main `7f64075aa1a4b82c74ec7bb829409b99d09e6d81`. The user reported that
choosing a photo updated the book cover but left it absent beside None in the
long-press edit sheet. Other device QA passed. This follow-up is for a draft PR;
the parent coordinates review, merge and release.

## Cause and minimal ownership change

`pickCoverFile` already atomically persists `book.cover = book.id + '|cover'`
and image bytes through `commitBookEdit`. The chooser independently constructed
its candidates from `imgSrc` and paragraph images, omitting a custom cover that
was outside those source images. The selected key remained in `dataset.pick`
but had no corresponding button. This is a projection defect, not lost data.

The chooser now uses the existing `bookAssetKeys(book)` projection, which includes
the canonical current cover and deduplicated source images. None continues to
mean an explicitly empty cover. No cover migration, extra persisted selection,
source-content change or new photo design is added.

A file read can also finish after a sheet closes/reopens for the same book, or
after a newer photo selection. Object identity alone did not invalidate those
owners. One ephemeral generation guard now invalidates the older read before
its durable write and prevents a stale completion from repainting a new sheet.
Existing atomic storage and article-repair ordering remain the durability owners.

## Before/after and verification

- Production-function Node regressions failed before for TXT, EPUB and article
  custom covers (one cell instead of None plus current cover); all five chooser
  cases pass after. Twelve article-repair/edit cases pass, including pending
  repair, failed repair, switching books, latest picker and same-book reopen.
- Real Chromium uploaded the valid local WebP through the edit sheet's actual
  file input. Before, the book had the custom key while the chooser lacked a
  selected image and its decode assertion timed out. [Before screenshot](covers-20261005/chooser-before.png).
- After, the selected chooser image's SHA-256 equals the actual IndexedDB image
  bytes. Save/reopen, cold reload, same-key replacement and real EPUB reimport
  retain that equality. [Light](covers-20261005/chooser-after-light.png),
  [dark](covers-20261005/chooser-after-dark.png),
  [hash evidence](covers-20261005/chooser-results.json).
- Explicit None survives a cold reload. Closing/reopening invalidates a delayed
  picker; a newer photo wins against an older delayed read. Actual book deletion
  removes book metadata and all owned cover bytes.
- Chromium checked edit-sheet bounds and captured 390×844, 820×1180, 1440×900,
  320×568 and 844×390 in both themes. All ten images and runtime results are
  retained under `/tmp/breeze-cover-chooser`; CI uploads both-engine evidence.

Commands:

```sh
node --test tests/verify-cover-chooser.mjs tests/verify-article-repair-edit.mjs
BREEZE_QA_ENGINE=chromium BREEZE_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/verify-cover-chooser-browser.mjs
BREEZE_QA_ENGINE=chromium BREEZE_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/verify-import-commit-browser.mjs
npm test
```

Local WebKit installation failed with HTTP 403 `Domain forbidden` from the
Playwright browser download host. The regression defaults to both engines and
Integrity runs it explicitly in Chromium and WebKit on the final PR head. Native
iOS Photo Library, HEIC conversion and physical WKWebView behavior are not
established by this web-upload analogue. The user should confirm this exact
chooser flow on the next coordinated TestFlight build.

Combined final validation: `npm test` passed (exit 0, Node 24.19.0), including the
new chooser and RSS contracts. All fourteen existing Chromium atomic-import
cases passed. `npm run ios:sync` passed, and all three changed production scripts
match the actual `ios/App/App/public` bundle byte for byte. This verifies web
asset delivery only; it does not establish an Xcode archive or new release.

## CI fixture timeout investigation

The final-head [Integrity run 37344693979](https://github.com/MetroBummin/breeze/actions/runs/37344693979/job/111880373375)
completed all four new Chromium scripts by 16:58:21 UTC, then produced no output
until cancellation at 17:27:27. Its terminal logs show live WebKit MiniBrowser,
network and web processes during orphan cleanup. The uploaded cover proof has
32 Chromium files and no WebKit file, including no first-photo screenshot.
This locates the wait in the first WebKit chooser before that screenshot;
the old fixture did not log enough phases to identify the exact pending call.

The chooser used an ephemeral browser context, unlike the existing import,
identity and Home-reading fixtures. Those use persistent WebKit profiles because
native original-Blob IndexedDB writes failed in an ephemeral profile; the prior
failure is recorded in [Home-reading QA](home-reading-cards-20261004.md).
The chooser now uses a fresh temporary persistent profile per engine and removes
it after owned context/browser cleanup. All actual imports, native IndexedDB byte
comparisons, photo selection, reimport, None, races and deletion assertions remain.
An ordinary storage rejection alone does not explain the indefinite wait: a
Chromium probe that aborted the original write resolved in 289ms and left no
books or staged images. A pending WebKit transaction or another pre-screenshot
phase remains the probable cause until the next CI phase evidence is available.

Playwright's default timeout does not bound a never-settling `page.evaluate`
promise. The Node phase owner now bounds and logs launch/setup, navigation,
readiness, import and every asynchronous evaluated selection/storage operation.
Failure propagates after bounded context/browser/server cleanup; results and
phase receipts are written even on failure. Integrity also bounds each of the
eight cover scripts' process groups to 120 seconds, with TERM then KILL after
five seconds. A timeout fails the check and all eight cases still run. No
assertion, browser or later CI check was removed, and job timeout was not raised.

[Fault-injection evidence](cover-chooser-ci-timeouts-20261005.json) uses the
committed phase helper with real Chromium: a successful evaluate returned 42 and
exited 0 in 1.85s; a never-resolving evaluate failed its named 200ms deadline and
exited 1 in 2.02s. Both disconnected the browser and closed the server without
the probe's watchdog firing. The amended real chooser and `npm test` pass
locally. Local WebKit remains unavailable because its official download returns
403 `Domain forbidden`; exact-head WebKit CI is required before parent merge.

The next [Integrity job 111900228435](https://github.com/MetroBummin/breeze/actions/runs/37350611249/job/111900228435)
at `28ff047581702d833304de091255be048a1f72f4` passed the complete chooser in both
engines. WebKit finished in 11.76s, including import, photo byte equality,
save/reopen/reload, replacement/reimport, None, both picker races, deletion,
ten size/theme checks and cleanup (context 345ms, server 1ms). It also passed all
eight visible-cover scenarios and both current RSS comparison cases. That job
failed a separate supplied-image WebKit assertion. Its mock image relay
omitted the real relay's allowed headers/methods and OPTIONS response; Chromium
interception automatically fulfills preflights, hiding that fixture difference.
The supplied-image fixture is corrected to the existing relay contract, with
method/resource receipts and diagnostic image state before its unchanged
photo/fallback assertions. The next exact-head CI must pass all checks.
