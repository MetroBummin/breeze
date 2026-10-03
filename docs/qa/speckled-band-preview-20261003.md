# Bundled reading previews and Holmes edition — draft verification

Base: `480ffe005e2aebf06d49171d28753a5cfabda7e0` (main, FSRS included).
Branch: `feat/speckled-band`. RSS PR #78 files/ranking logic are untouched.

Implemented: separate Holmes catalog identity and complete local TXT; 25 audited
modernization edits; accurate edition/source credits; previews and explicit
Read actions for all four provided long reads; spoiler-free authored hooks;
grounded invitation prompt and v5 caches for short-article introductions.

Local verification on Chromium using `/usr/bin/chromium`:

- `npm test`: passed, including content replay/hash and existing FSRS/contracts.
- `node --test tests/verify-article-preview-server.mjs`: 17 passed (injected
  Supabase/model doubles, no deployed-service or paid-model claim).
- `npm run test:longreads` with Chromium selected: passed. Backrooms has its
  original 107 paragraphs, ten scene images, lookups and chapter-upgrade anchors.
- New preview suite: all four provided stories; open/cancel with no story download or
  persistence; light/dark at 320×568, 390×844, 820×1024, 1440×900, 844×390;
  reachable CTA; HTTP error, truncation, cancellation, failed IndexedDB save,
  retry and duplicate taps; browser Back during held downloads cancels without
  book persistence or late Reader navigation; all 251 Speckled Band paragraphs imported exactly;
  progress after reload; saved-book offline reopen; real service-worker cold
  offline reload and runtime text caching.
- `verify-homeward-lookup-browser.mjs`: 314 sentences, 43 words, 34 phrases,
  existing local lookup timing, no AI requests.
- `verify-preview-intent-browser.mjs`: eleven passed; opening/closing short-article
  previews still creates no saved book/images/progress.
- `verify-article-preview-browser.mjs`: Chromium, cache/fallback/Reader/four sizes.
- `verify-article-preview-resilience.mjs`: twenty-one passed, controlled dependencies.
- Typecheck: baseline unchanged at 34 existing diagnostics; no new diagnostics.
- `build-www.mjs`: complete adapted TXT copied byte-for-byte into the native bundle.
- `git diff --check`: clean.

## Remaining gates

1. User selected cover option 1, Library
   `libfile_16281071d8948191a3f67c8fff03ef42`. Supported materialization and one
   bounded retry both failed in this executor. The catalog uses the normal
   no-cover fallback; no alternative cover was chosen. Materialize the selected
   image, inspect pixels, optimize without cropping, assign its asset path,
   then verify thumbnail/preview/offline stored-cover behavior. Options 2 and 3
   remain preserved in Library and are not bundled.
2. Current proof images under `/tmp/breeze-holmes-proof/` show the actual app but
   the fallback artwork. They are interim only. Capture and save final-cover app
   screenshots to Library after successful transfer; do not present interim
   screenshots as final artwork proof.
3. Local Playwright browser downloads are proxy-blocked. Chromium ran using the
   installed system binary; WebKit runs in the draft PR's Integrity browser job.
   Playwright [supports service-worker control only in Chromium](https://playwright.dev/docs/service-workers).
   WebKit covers saved-book offline reopen, but cold offline service-worker reload
   is verified in Chromium only; a WebKit device check remains. No physical
   iOS/WebView verification is claimed.
4. Article-preview prompt v5 is prepared, not deployed. A later authorized Edge
   Function deployment is required to change live generated introductions.
   Existing deployed v4 responses remain readable, but missing/mismatched
   `promptVersion` cannot populate the v5 client cache. Both generated and cached
   server responses now declare `promptVersion: 5`; unversioned local v5 entries
   are ignored. Prefer an authorized server-first rollout, verify the response
   marker on hit and miss, then ship the client. Client-first rollout remains
   compatible but legacy responses are transient until the server update.
   v4 client/server cache keys are not reused; correct v5 client entries keep the
   existing 30-day lifetime. No schema, quota or model changes are required.
5. Exact-head CI is recorded in the task handoff after draft publication. This
   document does not imply pending CI has passed. No merge/release/deployment.

Source, paragraph boundaries, complete edit log, rights/trademark handling and
hashes: [editorial record](../content/speckled-band/README.md).

## Expanded collection and Casual-style action

A Scandal in Bohemia: 8,522 words, 261 reader blocks including the original three
section headings, 10 logged edits. The Red-Headed League: 9,106 words, 218 reader
blocks, 13 logged edits. Separate manifests and source audits live alongside the
Speckled Band record. Blank-line source blocks and reader paragraphs are explicitly
distinguished. All source text remains complete.

All provided story cards open Preview without importing. `읽기` saves through the
normal importer and opens Reader; `이어서 읽기` reuses existing reading progress.
New browser coverage checks both added stories, including 30 total Holmes
viewport/theme states with actual app captures: preview-only dismissal, no fetch
before Read, failed save and retry, duplicate taps, every imported paragraph,
reload/offline reopen and retained progress. The selected cover transfer and final
cover screenshot gates above remain open.
