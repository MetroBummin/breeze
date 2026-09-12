# PDF pinch zoom verification — 2026-09-12

Branch: `codex/pdf-pinch-zoom`. Separate worktree: `breeze-pdf-pinch-zoom`.
The original `breeze-refactored` worktree and its existing edits were preserved.

## History considered

- `7b81a59`: browser viewport zoom and inverse scaling of floating controls had
  left the controls drifting or stuck. PDF-only transforms and a dedicated
  scroll container replaced that approach.
- `58972f0` (2026-08-10, “Replace PDF pinch zoom with controls”): the new code
  explicitly avoided repeated `scrollTop` changes during a gesture because
  they conflicted with iOS momentum scrolling. The architecture document also
  recorded viewport/scroll-anchor jumps in an iOS home-screen web app.
- `6f0389e`: moved the replacement buttons into Aa. This change removes that
  row, its styles, event handlers, and visibility update calls.

## Implementation and regressions found

The gesture keeps an initial PDF coordinate under the moving finger midpoint.
During the preview it updates only a transform, at most once per animation frame.
The stage clips transformed overflow and keeps its committed scroll extents.
All fingers must be released before scale, scroll position and sharper rendering
are committed. Zoom is clamped to 1–4×; two-finger panning also works at the limits.

Two failures were reproduced by browser testing and fixed:

1. A delayed mode landing restore at 900 ms moved `scrollTop` from 28 to 0 during
   the first pinch. Starting a pinch now invalidates that mode-change token;
   stale anchor restores reject the token before changing the scroll position.
2. Sharpening after the first finger lifted replaced the canvas beneath the
   remaining finger. Its final `touchend` no longer reached the document.
   Rendering/eviction waits while the paper is touched, including an in-flight
   render completing during a later gesture. Final release resumes deferred work.

## Executed browser checks

Each row passed 12 full in/out cycles, followed by boundary and gesture checks.
Chromium used trusted `Input.dispatchTouchEvent` browser input. WebKit used
synthetic DOM touch-shaped events to test the handlers and browser layout.
The generated 120-page PDF includes alternating page proportions; the 8-page
source was the local 2022 September high-school English mock examination PDF.
Source PDF bytes were not committed or uploaded.

| PDF | Engine | Viewport | In/out cycles | Result |
| --- | --- | --- | --- | --- |
| 120 pages | Chromium | 390 × 844 | 12 | Passed |
| 120 pages | Chromium | 768 × 1024 | 12 | Passed |
| 120 pages | WebKit, synthetic events | 390 × 844 | 12 | Passed |
| 8 pages | Chromium | 390 × 844 | 12 | Passed |
| 8 pages | Chromium | 768 × 1024 | 12 | Passed |
| 8 pages | WebKit, synthetic events | 390 × 844 | 12 | Passed |

Checks included:

- Moving midpoint; stable scroll position during preview; under 1.2 CSS pixels
  of position difference at release; fixed chrome size and viewport scale 1.
- Min/max zoom, two-finger pan at max zoom, staggered finger release, a remaining
  finger held beyond the long-press threshold, and a third finger on the chrome.
- A delayed second finger, cancellation, mode switching and viewport resize
  during a pinch, followed by another successful pinch.
- No word action or sentence popup from a pinch. A fresh tap resolves one word
  exactly once; a fresh long press opens only the sentence modal (trusted
  Chromium input). One-finger native scrolling still works after pinching.
- Adding a second finger after native scrolling begins keeps that gesture a
  scroll. Lift and start a new two-finger gesture to zoom.
- Deep-page navigation, scaled word hit testing, Aa ownership, absent zoom
  buttons, and the Chromium Ctrl-wheel trackpad path.

`npm test` passed, including type checking, 200 gesture-ownership repetitions,
word/sentence lifecycle checks, EPUB geometry and existing READY regressions.

## Reproduce

```sh
npm ci
npx playwright install chromium webkit
npm run test:pdf-pinch
# Optional: run against an existing local PDF instead of the generated fixture.
BREEZE_QA_PDF=/absolute/path/document.pdf npm run test:pdf-pinch
# Optional: select one engine.
BREEZE_QA_ENGINE=chromium npm run test:pdf-pinch
```

The test uses temporary persistent browser profiles and a local HTTP server;
profiles and the server are cleaned up after the run. Persistent WebKit profiles
are required here for IndexedDB Blob storage.

Physical iPhone Safari/PWA/WKWebView and Android touch arbitration, device GPU
memory pressure and subjective smoothness have not been verified. Synthetic
WebKit tests do not establish those results. No commit, push or deployment was
performed.
