# Scanned PDF OCR draft validation — 2026-10-09

Independent branch from main `83cc182`; no merge, deployment, version bump or
paid provider call. Original checkout `/workspace/breeze` remains untouched.
The new worktree is `/workspace/breeze-ocr`.

## Executed locally (Linux)

- Full `npm test` passed; type baseline remains 32 (no added diagnostics).
- OCR unit harness: 14 tests passed. No text-layer replacement (including
  non-English text); strict box/confidence validation; one visible native job;
  repeated taps; rapid page switching; close/replacement/A→B→A/deletion stale
  rejection; hash-bound reopening/eviction cache; explicit failure retry; empty
  and unsupported states; pinch/ink/paint/background admission; bounded cache and deletion during pending recognition.
- `BREEZE_BROWSER_EXECUTABLE=/usr/bin/chromium npm run test:pdf-ocr` passed.
  Real PDF.js reads a synthetic image-only PDF and produces the actual bounded
  page raster. Native response is a controlled test double. Independent pixel
  probes verify the upright and intrinsic 90-degree raster orientation. Thirty
  geometry cases cover light/dark, 320/390/820/1440 widths and short landscape,
  100/150/250% scale. Existing hit-testing, marker coordinates, repeated lookup,
  durable IndexedDB reopen/eviction/delete, and pending document replacement pass.
  All nonlocal requests are aborted or answered by local dictionary fixtures;
  OCR itself makes no lookup request. Startup dictionary warm is locally stubbed.
- Existing Chromium `verify-pdf-ink-browser.mjs`,
  `verify-pdf-pointer-ink-browser.mjs`, and
  `verify-pdf-pending-pinch-browser.mjs` passed with the system Chromium path.
  This covers synthetic pen/palm routing, undo/redo, rotated pages, persistence,
  and pending lookup/pinch ownership; it is not physical Pencil/Android evidence.
- Six Android source/configuration tests passed (`npm run test:android`).
- `ios:sync`, `android:sync`, native package and native service-worker checks
  passed. These package/copy assets; they do not compile or run the native plugin.
- `git diff --check` passed.

## Known blockers and unverified work

- `node tests/verify-integration-boundary.mjs` fails because the frozen 1.9.1
  receipt requires PR139's exact `index.html` bytes. This 2.0 feature adds a script
  and intentionally falls outside that old release snapshot. The receipt and
  guard are unchanged; do not interpret the draft as passing Integrity CI or
  ready to merge. A separately reviewed 2.0 integration contract is still needed.
- No Xcode/iOS SDK or Android SDK is installed here. Android compile attempt also
  stopped at Gradle download (`UnknownHostException: services.gradle.org`).
  Neither native plugin has been locally compiled or executed.
- Playwright browser download was denied (403, domain forbidden). System Chromium
  was available; local WebKit was not. The new PR-only OCR workflow covers both
  engines when CI infrastructure is available; its result must be inspected.
- `PdfOcrAccuracyTest` is an Android instrumentation fixture using the **real
  bundled ML Kit model** and the production box adapter. It draws “Bright world”,
  asserts exact words and checks word centers against independently drawn glyph
  bounds. It has **not been run here**. Run on an emulator/device with network
  disabled after installing the debug/test APKs:
  `./gradlew :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=kr.io.breeze.app.PdfOcrAccuracyTest`.
  Existing Android CI compiles instrumentation tests; it does not execute them.

## Physical acceptance before 2.0 release

On native iPhone/iPad and Android phone/tablet, use owned synthetic scan PDFs
(clean print, small print, low contrast, blur, skew, multiple columns, punctuation,
blank page, 90/180/270-degree source rotation) and equivalent text-layer controls.
Record actual recognized words against a transcript, omissions/false words,
selected-box overlays against printed word locations, and repeated identical
word occurrences. Check offline first launch (bundled models), retry on failure,
scroll/page switching while recognizing, background/foreground, reader close,
process termination/reopen, cache eviction and document deletion/replacement.

Verify native Pencil/stylus ink, finger pinch/momentum, device rotation and page
navigation remain owned by their existing handlers. Use local saved dictionary
answers or local response fixtures for acceptance to avoid paid calls. Capture
actual task duration and peak memory on each tested device if performance numbers
are needed. This draft contains no claimed OCR accuracy rate, speed or memory
measurement, and no screenshot/automated browser claim of native acceptance.
