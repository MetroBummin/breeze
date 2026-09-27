# PDF stabilization and iPad 176 verification

Based on GitHub main `96de779`. Scope: document ownership, preserved page gaps
and scroll cost, existing longform add card, Pencil highlighter. Choice/block
segmentation (#2) remains excluded; its supplied-source reproduction is recorded
below. No main merge, Archive, production deployment or data reset.

## Confirmed causes and fixes

- A delayed first `getPage(1)` could publish a superseded document. Controlled
  A→B→A, switch, close and deletion tests reproduce it. Existing load token,
  session, book ID and original hash guard publication and hit-testing.
- The iPad's original PDFs use cropped nested Form XObjects. The word adapter
  ignored their BBox clipping, so excluded source words appeared on blank paper
  and entered sentence context. Intersect glyph cells with page/Form boundaries
  and reject glyph baseline anchors outside those clips. Invisible OCR remains
  eligible; shared vocabulary is retained.
- On the supplied 13-page PDF, page 9 formerly mapped a hidden `higher` over
  `perceptible`; page 13 mapped a hidden `bewildered`. Both are excluded now.
  `perceptible` is correctly hit, while the genuinely visible `higher` elsewhere
  on page 9 remains. Independent renderer word-occurrence comparisons match
  all 13 pages and all 34 pages of the other recent device PDF (47/47).
- Initial page rendering could continue under a held finger while eviction was
  paused. Cache eviction now runs during that contact, keeping its DOM target
  attached. Per-page and total retained canvas limits, completed-page PDF.js
  cleanup, serialized visible work, dropped obsolete prefetch and deferred
  sharpening bound work. All page boundaries remain cached for Pencil routing;
  page gaps and the existing native first-Pencil-during-inertia policy remain.
- `96de779` already contains `longformAddCard()`. Both pre-existing build-174
  asset trees also contained it; missing source/bundle inclusion was not proved.
  The grid path lacked the surrounding tile wrapper and a shared card rule
  overrode its dashed border. Reuse the existing Add action and match card size,
  radius and border in grid/other styles. No second import pipeline.
- Pencil highlighter adds yellow/green, 12/20 widths and 0.30 opacity using the
  existing storage and geometry. Shared stroke-opacity groups prevent seams
  after partial erasure. Settings, fragments and Undo/Redo preserve tool data;
  legacy pen records remain unchanged.

## Executed validation

- `npm test` passed; targeted ownership/ink tests: 36/36. Type diagnostics fell
  37→34 with the original baseline unchanged.
- Chromium + WebKit: crop/blank hit tests, invisible OCR hit, supplied page 9/13
  regression, held-scroll jumps in both directions, highlighter/partial eraser/
  undo/redo/reload, geometry and highlight-pixel regression.
- Highlighter actual-canvas checks: zero lightened dark glyph pixels and zero
  dark seams in the tested self-overlap; existing pen remains readable.
- Pinch: 120 pages × 12 cycles at Chromium 390/768/1180px and WebKit 390px passed.
- Longform card: empty/populated/import/reload/resize cases passed in both engines.
- Held-scroll canvas allocation: installed 175 exceeded the test's 450 MiB safety
  stop after 8 jumps (487.7 MiB); fixed code completed 15 down/up jumps at about
  60 MiB. This is canvas allocation, not total process RAM or iPad latency.
- Repeated-contact layout workload: drawn-page bounds reads in read 1×/2×,
  pen 1×/2× changed from 210/220/7547/7427 to 0/2/3/2. New mixed-ratio pages still
  require real layout updates. Frame timing was mixed; one enlarged new-page
  run retained a 331ms long task. This is not proof that all jank is eliminated.
- Native Debug 1.4 (176) built and signed successfully, installed on the connected
  iPad, version queried as 176, and launched after unlock. All 113 web build files
  hash-match native public and the installed app bundle. No Archive was made.

## Remaining boundaries

A device JetsamEvent at the reported time records about 1.75 GiB in Breeze's
WebContent coalition, but does not label that process as the killed process.
The user confirmed on 176 that clipped/incorrect/blank-space words no longer
appear, and ordinary finger upward scrolling works. Native scrollbar upward
drags still stutter; this remains unresolved on the tested device build.
Browser input is not physical Pencil/palm/inertia proof. Complex arbitrary clip
paths and inaccurate OCR coordinates are not universally validated by Form tests.

The supplied question 135's punctuated choices separate correctly. Question 157
still combines unpunctuated choices and preceding word notes: reproduced and
reported, not marked as fixed. A future structure-first block/column change must
preserve multiline options and inline grammar numbers; no circled-number regex
was added here.

## Reproduction without committing private PDFs

`npm run test:pdf-stability` runs synthetic crop/OCR/memory cases. Add
`BREEZE_QA_PDF=/absolute/path/to/the-supplied-13-page.pdf` for the exact source
regression. The source identity is checked before those page-specific assertions.
Raw device databases, PDFs and logs stay outside Git.

## Follow-up: remaining native scrollbar stutter

The requested all-process 45-second device recording disconnected after about
0.9 seconds, so it cannot explain the user's reproduced stutter. A separate
20-second app-only recording succeeded but does not establish a correlated
WebContent hotspot. No physical-device cause is claimed from these recordings.

Code and the same 34-page source browser workload did show initial rendering
continuing into word-map extraction and marker creation while no-touch scroll
jumps were active. The follow-up separates those stages: visible paper and ink
remain available, automatic word maps/markers wait for scroll quiet, and explicit
lookup can promote and await the target page. Offscreen prefetch waits too.

| Same 90-frame down + 90-frame up stream | 176 | Follow-up |
| --- | --- | --- |
| Chromium map/marker calls during down/up scroll | 81 / 78 | 0 / 0 |
| WebKit map/marker calls during down/up scroll | 90 / 90 | 0 / 0 |
| Chromium maximum sampled frame interval | 40.4 ms | 27.4 ms |
| WebKit maximum sampled frame interval | 69 ms | 38 ms |
| App scroll-position writes | 0 | 0 |
| Visible canvas + lookup ready after settling | yes | yes |

These are one-run browser scheduling observations, not iPad latency measurements.
`tests/measure-pdf-scrollbar-browser.mjs` preserves the workload and asserts no
moving automatic map/marker work, no app scroll writes, visible paper and eventual
lookup. Set `BREEZE_QA_BASELINE=1` only when measuring unchanged old code.

`npm test` and both-engine actual-source clipping/OCR/held-scroll-memory and ink
browser regressions passed again. Five additional unit cases cover explicit
lookup, stationary-finger long press, stale-document rejection, resumed-scroll
interruption and bounded failure handling. Physical scrollbar confirmation on
the follow-up device build remains pending.


Device delivery: Debug **1.4 (177)** built, signature verified, installed and
launched on the wired iPad. `devicectl device info apps` reports 177. All 113 web
build files hash-match native public and App.app/public. The user reported similar scrollbar stutter on installed 177. This optimization
is not an accepted fix for the physical symptom. Native input/offset tracing is
being used for the next investigation; no Archive or production deployment was performed.


177 native diagnostic recording (user reproduced both finger and scrollbar
stutter with tracing enabled): the 13-page landscape reader retained a constant
17,869-point native content height. During the right-edge drag, the finger moved
from y=649.5 toward y=170.5. The child UIScrollView pan changed from changed (2)
to cancelled (4) about 0.77s into the contact. Its offset then stayed at 10,814.5
while the finger continued from y=472 to y=170.5. No Pencil or ink session was
active. This proves a native cancellation in that recorded contact, but not yet
which recognizer or action caused it. Diagnostic overhead can affect ordinary
scroll latency, so these runs are not a before/after performance benchmark.


The 178 diagnostic repeated the native scrollbar cancellation on three contacts,
with the same child scroll-view identity and constant content height. No completed
DOM event had defaultPrevented=true. The scrollbar long-press and child pan both
became cancelled; other observed recognizers alone do not establish causality.
The next opt-in diagnostic records the cancellation call stack through public
KVO on gesture state. No recognizer is disabled/replaced and no new production
input behavior is introduced by diagnostics.
