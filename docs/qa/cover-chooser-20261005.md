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
