# Slower continuous welcome preview — 2026-10-08

Base: `4da56f4e0f4d6971badb694733bd16dd24f84f1c` (verified PR132).
Branch: `codex/welcome-handwriting-smooth-preview`.
Final checkout: `/Users/kosangbum/Documents/Codex/2026-10-08/task-6/breeze-welcome-smooth.nosync`.
This cumulative preview supersedes the earlier `9ceb9bf` two-second candidate.
No push, merge, deployment, native version/signing change or TestFlight upload.

## Motion

The user rejected the quick two-second preview and requested a slower, very
smooth Apple hello rhythm. The existing Breeze light/dark wordmark SVGs, UI
font, geometry, copy and materials remain unchanged. Only their reveal changes.

Six Breeze centerline masks share a single inherited numeric pen timeline.
Their geometric lengths determine each letter's portion of the timeline. The
pen uses one cubic-bezier(.35,.02,.25,1) acceleration/deceleration envelope,
without six separate speed resets. Writing takes 4200ms. The completed word
stands alone for 750ms. Existing welcome copy, note and Start button then appear
together over 900ms, opacity plus 8px movement; total 5850ms. The extra time is
in actual pen progression, not just a longer finished-video hold.

Tap completes immediately and consumes the completion tap without navigating.
First-entry marker, close/reload/restart, static Settings replay, reduced motion
and live reduced-motion changes retain their previous behavior. Backgrounding
and cancellation clear the session timer. Browsers without numeric custom
property registration show the static welcome immediately.

## Reference and precision limit

Selected reference: Apple's installed macOS hello setup/welcome renderer,
`SetupAssistantSupportUI.HelloView` / `HelloMetalLayer` on macOS 27.0 (26A428),
not the iMac marketing film or a third-party recreation.

Read-only inspection found Apple's English Hello/HelloText resources and the
runtime's initialized HelloMetrics. The actual default `writeInHold` Float is
0.75 seconds (also `writeInDelay` 0, logoFadeIn .25, wipeDuration 2.5). Only the
0.75-second completed-word hold is used as the timing reference here. Inspection
ran in a separate process with activation policy Prohibited and a never-ordered
window; it did not open Setup Assistant, activate apps or touch user inputs.

The hidden view did not start its display-driven provider, so the real English
stroke duration and frame-by-frame velocity were not measurable there. Web
search did not yield an immediately measurable official setup/welcome clip.
Further investigation was stopped rather than blocking the preview. Breeze's
4.2-second writing time, easing and .9-second copy fade are explicitly a review
candidate. Do not claim identical Apple speed or measured full motion matching.
No Apple logo, font, glyph coordinates, shaders or lettering were copied into
Breeze; its original brand asset remains authoritative.

## Verification

- Final `tests/verify-onboarding-browser.mjs`: Chromium and WebKit passed.
  New actual intermediate pen/cumulative letter progress, delayed caption and
  completed-word hold assertions passed, plus first entry, tap completion,
  repeated taps, close/restart/reload, replay, live/static reduced motion and
  older-browser static fallback. Existing whole carousel, async native PDF
  capability, six/seven pages, media ownership, visibility and decoder fallback,
  Reader/data/history isolation, and light/dark phone/tablet/desktop/narrow/short
  layouts passed.
- `node tools/typecheck.mjs`: passed; original 32 diagnostics unchanged.
- All existing `npm test` steps passed across the prefix, lookup-performance
  retry with `--jitless`, and the remaining sequential tail. Both installed Node
  24.13.1 and bundled 24.21.0 terminated with signal 11 in the unchanged
  `verify-lookup-performance.mjs`; that test and imported lookup-work checks
  passed when run with `--jitless`. Do not describe this as one uninterrupted
  green npm test run. Logs are retained with the preview.
- `npm run www`: passed, 226 files / 15.88MB. index resource stamps and service
  worker version are generated metadata only. `git diff --check`: passed.
- `git diff --exit-code BASE -- assets scripts/reader ios package.json
  package-lock.json`: clean. OpenStax example media/PDF, selected-icon-only pen
  colors, Reader, native versions and dependencies remain identical to base.
- The exact source has no `.agents/skills`. AGENTS.md, DESIGN.md and decisions
  006/019 are the applicable guidance. Historical integration hash receipts were
  retained; they are not rewritten to bless this new preview scope.

## Deliverable

Actual wall-clock headless Chromium capture of the production app, light then
dark. External requests blocked; fonts/assets ready before each fresh-install
run. 320 real source frames, H.264 Baseline, silent, 390×844, 24fps, 15.2 seconds.
MP4 decoded again and both theme frames inspected. Capture and encoding scripts
are included in tools/. Browser preview is not physical-device acceptance.

Local MP4:
`/Users/kosangbum/Documents/Codex/2026-10-08/task-6/breeze-welcome-proof-v2.nosync/breeze-welcome-light-dark.mp4`
Size: 359614 bytes.
SHA-256: `f631a5b25171b60bee94351d690e87d48f4638ee8b429493e9cc07eef35da635`.
Library path: `/breeze-welcome-light-dark.mp4`.
Library ID: `libfile_2c4d1b92a0f881919dfadf0e905d3cea` (same item).
New version: 1; file ID: `file_0000000065a481fd9acb3dca61155d5e`.
Official replacement used expected_current_version 0 and succeeded. Library
identity/version xattrs were persisted using the current official helper.

The original Documents checkout was evicted to iCloud dataless placeholders
mid-session, blocking synchronous file reads. Only this task's stalled
processes were stopped. This final source was rebuilt from the verified local
base object pack in /tmp, tested there, then preserved in a .nosync directory.
The previous Documents checkout is not the authoritative smooth preview.
