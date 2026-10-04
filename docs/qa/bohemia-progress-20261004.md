# Bohemia text-only progress follow-up, 2026-10-04

Scope: actual bundled `scandal-in-bohemia.txt`, 261 paragraphs, ten catalog
illustrations, TXT, no original bytes or source map. The independent investigation
below tested locally against main `72719a2cfa9a7242b15d24cd0cc72f9753310dbe`,
with the earlier mode-restoration candidate preserved. Its results do not verify
integrated PR93 head `60a45ab`; integration checks are recorded separately below.

## Findings and limits

- A persistent numerical mismatch during ordinary Reader → Home was not
  reproduced. Reader has an animated fill, not a numeric percentage label.
  `readerPillRawProgress` is its canonical target; `readerPillVisualProgress`
  paints `#readpill-progress` using `scaleX`. Home renders the committed `p`
  immediately as a fill and floors `p*100` for its numeric label.
- A real wheel scroll to 16.54% yielded visual fill fractions 5.28% at 30ms and
  14.19% at 150ms, settling within roughly a second in that Chromium run.
  These are animation fractions, not Reader numeric labels or device timings.
  Home immediately showed 16%, unchanged after waiting.
- Delaying actual illustration 03, then scrolling to 14000px, left the cached
  paragraph43 offset at 233px after image decode moved its actual offset to
  379px. Unchanged main persisted 233px; the next opening scrolled to 14146px.
  The candidate commits 379px and preserves the actual anchor on Home/reopen.
- Signed-out hidden/pagehide events did not flush local reading before the 800ms
  timer. The separate probe changed visible progress 16.54% → 23.46% while those
  events retained 16.54% until the timer ran. This proves an event-save gap;
  terminating/suspending a native process was not reproduced in this environment.
- The candidate freshly measures the text anchor when saving and invokes the
  existing guarded local writer on hidden visibility/pagehide. No progress
  monotonicity clamp is added. Backward reading 55% → 49% and 100% → 99% remains
  valid. The earlier original-mode preparation guard still rejects transient saves.

## Verification

`tests/verify-bohemia-progress-browser.mjs` imports through the actual catalog
Preview/Read path, gates UI fonts and the real illustration, exercises immediate
Home, decoded images, forward/backward scrolling, completion, actual Home controls,
real database reopening, font changes, signed-out hidden/pagehide persistence,
and delayed-image save/reopen offsets. Defaults to Chromium and WebKit; use
`BREEZE_QA_ENGINE=chromium BREEZE_CHROMIUM_PATH=/usr/bin/chromium` here.

The independent unchanged-main runs failed separately at the lifecycle commit
(99.27% retained instead of 95%) and image offset (233 instead of 379). That
candidate passed both. Native suspension and the user's original symptom remain
unverified; these fixes are not claimed to conclusively explain that symptom.

## PR93 integration

The release follow-up uses a separate worktree based on exact PR93 head
`60a45ab98b19a70de783f5267e913ee9f43a5796`, build 1.7(234). It carries only the
fresh text save, signed-out lifecycle saves, this regression and CI registration.
Existing mode-restoration/navigation patches are preserved. RSS quality work
remains on a separate local branch; Jev RSS stays OFF in this release.

The Integrity browser job explicitly runs the new test for both Chromium and
WebKit and attempts both even if one fails. Local checks on this integrated base:

- Full `npm test` passed, including typecheck and release checks.
- Bohemia Chromium regression passed: immediate Home, completion/backward reading,
  real database reopening, signed-out hidden/pagehide saves and delayed image
  offset/reopening. The actual offset changed 233px → 379px and saved 379px.
- Existing progress-handoff and restoration-navigation Chromium regressions
  passed for PDF and EPUB, preserving the mode ownership and navigation guards.
- `npm run ios:sync` regenerated hashes, `www/` and iOS copied assets successfully.
  The app and Share Extension remain 1.7(234); RSS remains OFF.
- `git diff --check` passed. RSS/server/Supabase files and existing mode/navigation
  source files are unchanged relative to PR93 `60a45ab`.

WebKit binaries are unavailable locally; final-head WebKit remains a CI check.
Native process suspension is not assumed from Chromium checks; `ios:sync`
prepares assets, not an archive or device test. The parent owns CI review,
merge and TestFlight publication.

## Final-head CI follow-up

Integrity run `37192090059` at `4685dff` reported Chromium paragraph 244 instead
of 245 on cold reopening, at the assertion before the font-size change. A local
controlled reproduction blocked actual illustration 09: CSS `aspect-ratio:auto`
overrode the native width/height ratio, leaving a zero-height unloaded image.
Paragraph 245 restored at 200px, but the preceding paragraph entered the anchor
probe. This does not establish a font-change implementation defect.

Removing that CSS override restores native catalog-dimension reservation without
changing decoded appearance. The strengthened test blocks illustration 09 on
cold opening, requires an incomplete image with positive reserved height, and
asserts exact paragraph/offset and unchanged height both before and after decode.
It now also asserts the saved offset after the font-size change. Illustration 03
decode separately preserves its reserved layout; a controlled 80px late-layout
change then invalidates the cached offset and proves a fresh save/reopen.

WebKit reported a Back-click timeout while controls became hidden. Local WebKit
is unavailable, so this is not claimed as a reproduced engine defect. The fixture
now observes settled scroll/progress/restoration and clicks the ordinary Reader
title to open controls before the actual Back click. No forced click or relaxed
progress/anchor assertion is used. The both-engine Integrity step is unchanged.

Local follow-up checks passed:

- Full `npm test`, including typecheck and release checks.
- Bohemia Chromium: all existing progress/lifecycle checks; cold illustration 09
  reserves 146px and retains paragraph 245 at 200px before/after decode; late
  layout changes paragraph 43's offset from 200px to 280px and saves/reopens 280px.
- Existing five-story illustrated Holmes Chromium browser verification, including
  all scenes, import/database/offline restoration, light/dark at 390×844,
  820×1180, 1440×900, 320×568 and 844×390. The installed system Chromium was
  selected through a launcher-only preloader; assertions and product code ran
  unchanged.
- `npm run ios:sync`, exact source/www/iOS asset comparisons, release validation
  for both 1.7(234) targets, RSS OFF confirmation and `git diff --check`.

Final-head WebKit and CI review remain the parent's release gate. The follow-up
does not change mode/navigation source, enable RSS, or archive/publish the app.

## WebKit reopened end-ramp assertion follow-up

At CI head `7b7cda9`, Chromium completed the entire regression. WebKit passed
normal Back and five wheel cases, then reported reopened progress
0.9926904848705796 versus saved 0.9926995989792199 after backward scrolling from
completion. Exact paragraph and offset-within-one-pixel checks had passed.
The source rounds saved `dy` but uses raw scroll position in the final viewport.
For paragraph 258/260 and reach 844px, the difference is exactly one pixel's ramp
slope. The actual production function reproduces both reported values at 801px
and 802px remaining scroll.

The revised fixture records pre/post raw scroll, extent, reach, base progress,
rounded anchors and raw paragraph top. Save/Home equality remains exact. Reopen
requires the same paragraph, offset within one pixel, raw scroll drift no greater
than one pixel, unchanged viewport/extent/base and the same displayed percentage.
A nonzero float difference is accepted only within the continuous end ramp, with
its full signed value explained by observed scroll drift and the exact slope;
only machine arithmetic roundoff is added. Counterexamples reject wrong signed
progress, two-pixel drift, changed layout and wrong paragraphs. Completion and
ordinary paragraph progress retain exact equality.

The production-ramp oracle and complete Bohemia Chromium regression pass locally.
WebKit's remaining lifecycle, font and cold-decode cases still require final-head
CI. This follow-up changes only the fixture and its decision/QA records; product
assets, both 1.7(234) targets and RSS OFF are unchanged.

## Idempotent restoration follow-up

WebKit CI at `df92e81` reached the font check after passing ordinary navigation,
the conditional end-ramp contract and lifecycle checks. It reported rounded
paragraph top 4px versus saved 2px after reload and font change. This is an offset
contract failure, not a paragraph-ID failure or a harmless float difference.

The real `captureAnchor`/`restoreAnchor`/`keepPlace` functions, evaluated with
controlled native scroll quantization, reproduce one-pixel drift when a
fractional target is truncated or floored. The new focused test fails against the
prior source for those two semantics and passes when only Text restoration's
target is rounded to the nearest integer. It covers 20 reopen/font-layout cycles,
five fractional coordinates, four positive/negative offsets and four scroll
semantics. This proves the mechanism in a controlled surface; it is not a native
WebKit reproduction. The supported WebKit CDN download returned HTTP 403 and
that route was stopped without fallbacks or retries.

The product change is limited to nearest-integer normalization at the Text
restoration boundary. The browser regression retains exact paragraph and offset
after reload/font changes, adds eight actual reopen and font-size round trips,
and reports all font/cold-image/late-layout assertion failures before failing.
No arbitrary offset or progress tolerance was added. The new source regression
is registered in aggregate `npm test`. Final-head WebKit remains required before
release, and the parent continues to own merge/publication.

Local validation passed: focused source regression (four scroll semantics), full
`npm test`, complete Bohemia Chromium including eight exact-offset font/reopen
cycles, five illustrated Holmes stories across ten light/dark viewport layouts
each, existing PDF/EPUB progress-handoff and restoration-navigation Chromium
regressions, `ios:sync`, copied asset equality, 1.7(234) release validation, RSS OFF
confirmation and `git diff --check`. Local logs retain the prior-source failure,
corrected-source success and per-cycle raw browser geometry.
