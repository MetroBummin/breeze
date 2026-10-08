# PDF lookup and highlight geometry

## Cause

The original PDF word map measured prefixes with a browser fallback font and
scaled them to `getTextContent()`'s total item width. An embedded PDF font has
different glyph advances; PDF character spacing, word spacing and TJ adjustments
also cannot be recovered by proportionally scaling browser text. Consequently a
line's total width could be correct while individual word boundaries drifted.
The former font-ascent normalization introduced a second independent correction.

## Decision

`pdf-word-geometry.js` adapts the text operators of the pinned PDF.js 3.11.174
renderer. Glyph widths, font metrics, character/word spacing, TJ adjustments,
text matrices, graphics transforms, text rise and Form transforms produce
positioned glyph bounds. Word tokenization unions those bounds; expanded
ligatures retain the original glyph's entire bounds. No application
`measureText`, character-width distribution, pixel correction, or DOM
measurement participates in PDF highlight geometry.

This intentionally uses the PDF renderer's glyph data rather than browser
selection rectangles: this PDF.js version's standard text layer also scales a
browser font to a whole text item's width and does not expose all internal
spacing as individual DOM glyph positions.

Lookup targets, selected-word markers, saved words and saved phrase members all
consume the same word boxes. Phrases retain their existing per-member semantics,
including gapped phrases; members on separate lines keep separate rectangles.
Text/EPUB marking and dictionary lifecycle remain unchanged.

Boxes are normalized against `page.getViewport({scale:1})`, including the PDF
page's intrinsic rotation. They are computed for lazily rendered pages and cached
in `session.wordBoxes`. Canvas sharpening does not rebuild them. Layout width,
viewport rotation and pinch scale transform the canvas and marker ratios together,
so they require no geometry invalidation or per-scroll/per-frame text work.
Releasing a distant page releases its map; rendering it again regenerates it.
If a future feature changes a PDF page's content or intrinsic rotation in-place,
it must release and rebuild that page, rather than reuse its old orientation.

`mix-blend-mode:multiply` on PDF word markers preserves dark canvas ink. Existing
fill colors, alpha values and page isolation remain in force. This is confined to
`.pdf-source-page`; it does not change Text/EPUB highlighting.

## Maintenance boundary

The adapter consumes PDF.js `OPS`, glyph fields and loaded font data via
`page.commonObjs`. The last two are renderer internals tied to the vendored
version. An upgrade must run the analytic operator tests and actual-canvas browser
regression, and reconcile `src/display/canvas.js` before changing the library.

Glyph advance/line-metric rectangles describe the PDF's typographic cells, not
per-glyph ink contours. Missing font outlines and inaccurate OCR coordinates
remain limitations of the source PDF/PDF renderer; the application does not
invent corrections for them. Invisible OCR text remains eligible for lookup;
soft-mask and hidden optional-content text is excluded. Annotation appearances
are excluded, as they were in the former `getTextContent()` map.

## Verification

- `npm run test:pdf-geometry`: analytic PDF text-state cases plus real PDF.js in
  Chromium/WebKit; optional `BREEZE_QA_PDF` uses an external local PDF without
  checking the user's document into the repository.
- Browser checks cover short/long/narrow/wide words, punctuation, multiline
  phrases, 80/100/150/250% geometry scaling, actual popup cycles, repeated content
  width changes, viewport resizing/rotation, scroll cache reuse, dense markers,
  sharpening, page release/reload and intrinsic PDF rotation.
- 80% is a geometry stress case: the existing UI's 100% minimum is preserved.
  The current dictionary uses overlays, so popup cycles and layout width changes
  are tested separately instead of restoring the retired side panel.

### Post-1.9 minimum-zoom feedback

Pinching below the 100% minimum adds bounded resistance to the existing paper
transform only. Logical zoom, scroll extents, landing position, glyph boxes and
stored ink stay clamped to the existing geometry. Paper, ink and pending lookup
cues share that transform. Release restores presentation over 220ms; reduced
motion restores immediately. New input, navigation, resize, blur and reader
closure cancel the return before sampling new coordinates. The animation owns
no saved state and its obsolete completion cannot change a later pinch.

This change is isolated from 1.9 on `feat/pdf-min-zoom-rubber-band`, based on
`post-1.9/pdf-gesture-base` at PR133's `644de72a974f76990bd61d95e641d935f8deedd2`.
Focused browser checks extend `verify-pdf-pinch-browser.mjs` and
`verify-pdf-ink-browser.mjs`; the pending word/sentence suite covers retained
shimmer, replies, stale completion and light/dark responsive surfaces. These
checks do not claim physical-device Pencil or WKWebView acceptance.
- With the supplied PDF, a canvas `fillText` trace independently captures the
  rendered `perspective` boundaries; a frozen legacy calculation demonstrates
  the previous drift. Screenshot pixel comparison checks that white paper gains
  color while dark glyph pixels do not lighten, in both themes.
- `npm run test:pdf-pinch`, `npm test`, and the existing word-presentation browser
  test cover gesture ownership, reader lifecycle, and Text/EPUB contracts.
- Browser WebKit and simulated touch are not physical iPhone validation.

## Observed acceptance results (2026-09-21)

The supplied 14-page worksheet retained all 2,367 English word occurrences and
order against PDF.js text extraction in both Chromium and WebKit. On page 1,
`perspective` is drawn from x=269.61022 to x=323.30432 at viewport scale 1. The
former algorithm produced x=272.36831 to x=331.05545 (maximum boundary error
7.75113 PDF viewport units); the new geometry matched the renderer trace exactly.
Across the tested CSS zoom factors, the maximum marker-versus-projected-box
rounding error was 0.07450 CSS px. This is an observed case, not a universal
promise of zero error for every PDF.

Both engines passed the 210-marker fixture, multiline phrase, repeated overlay
and width-change, resize, scroll, sharpening, release/reload and rotated-page
checks. Normal scroll and sharpening made zero additional geometry builds.
Initial per-page geometry builds measured at most 25.2 ms on the local test
machine; this is not a physical-device performance result.

Light and dark screenshot comparisons found zero lightened dark-ink pixels while
paper pixels gained highlight color. The existing 120-page pinch suite passed
12 cycles per configuration: Chromium at 390/768/1180 px and WebKit at 390 px.
The full `npm test`, word-presentation browser regression, type check and `www`
build passed. Physical iPhone validation remains open.

A transient WebKit `ResizeObserver loop completed with undelivered notifications`
was separately reproduced with the unmodified PDF implementation during rapid
layout stress. The browser test records that exact delivery deferral separately
and still asserts settled geometry; all other page errors fail. The final four
geometry runs recorded zero such deferrals.

Renderer references:
[CanvasGraphics text positioning](https://github.com/mozilla/pdf.js/blob/v3.11.174/src/display/canvas.js)
and [TextLayer layout](https://github.com/mozilla/pdf.js/blob/v3.11.174/src/display/text_layer.js).

## Security mitigation
All runtime PDF.js getDocument calls explicitly disable `isEvalSupported` to apply the published CVE-2024-4367 workaround while retaining the pinned glyph adapter. A patched renderer upgrade and physical-device geometry regression remain separate gates.

## Document ownership (2026-09-27)

The original load token, book ID and session object bind the PDF and its page
map. A delayed first getPage(1) must recheck ownership before touching the DOM
or assigning originalSession. Every async publication and page hit-test verifies
the same session; equal page numbers from other sessions are rejected. Selected
boxes must belong to that page's map, including delayed sentence cue paint and
mode-bridge searches. Shared lexical meanings and existing Wordbook data remain
shared; page positions and source sentences never migrate between documents.
The controlled delayed-page regression reproduces this race. It does not prove
that all reported device symptoms had this cause. Hidden OCR remains a separate
source-document possibility, not an explanation for cross-document source text.

## Cropped source forms reproduced on build 175 (2026-09-27)

Read-only copies of the iPad's two recent original PDFs were matched to their
IndexedDB book IDs and hashes. The 34-page document places cropped original
pages as nested Form XObjects. The installed adapter ignored Form BBox clipping:
page 11 produced 494 word boxes, including `adults` and `consists` on visibly
blank paper. These words are in excluded source streams inside this same PDF;
this does not establish that every previously reported cross-document symptom
had that cause, or negate the independently reproduced session race.

Intersect glyph cells with the viewport and every transformed enclosing Form
BBox, restoring the clip stack with graphics state. Excluded glyphs contribute
neither words nor sentence source. Partial cells retain only their intersection;
no pixel/font heuristic or vocabulary reset is used. For the reproduced page,
359 English word occurrences now match the independent PDF renderer extraction
exactly, with zero extra/missing occurrences. Synthetic nested/transformed Form
fixtures run without checking private user PDFs into the repository. Arbitrary
path clipping and inaccurate invisible OCR remain separate limitations.

A second pass found tiny font-metric ascender overlaps at adjacent answer crops.
Lookup requires the glyph's baseline midpoint to remain inside each clip; this
conservatively excludes those unreadable slivers without inventing ink geometry.
The visible portion of eligible glyph cells is still clipped. With this rule,
all 34 pages of that PDF and all 13 pages of the previous PDF match independent
renderer English-word occurrence counts exactly (47/47, no extra/missing words).
This verifies source fidelity for these files; it is not a claim that every
possible clipping path/OCR source has been covered.

The supplied 13-page case is now an optional source regression in
`verify-pdf-crop-memory-browser.mjs` (`BREEZE_QA_PDF`). It preserves the one visible
`higher` on page 9, rejects the overlapping hidden one, hits `perceptible`, and
rejects `bewildered` on page 13. A separate synthetic rendering-mode-3 fixture
checks that invisible OCR inside a Form remains selectable. Question 135 is
checked separately; question 157's current merged output is recorded as the
explicitly excluded block-segmentation issue, not a passing fix.


## Rounded display treatment (2026-09-28)

PDF selected and saved markers use 5px corners and a small matching outer shadow
for breathing room. Their left/top/width/height, glyph map and multiply blending
are unchanged. EPUB's active range marker now uses the app's selection tokens,
5px corners and a 2px outer shadow instead of hard-coded blue/3px corners.
These are display-only additions, not expansions of the selectable word area.

EPUB's persistent saved-word backgrounds still use CSS Custom Highlights, whose
supported properties do not include border-radius. They remain native rather
than wrapping/reflowing publisher text or rebuilding per-range overlay geometry.
Consequently this PR rounds EPUB's active/pending selection, not every saved
EPUB highlight. See https://www.w3.org/TR/css-pseudo-4/#highlight-styling .



## Visible-page re-entry and bounded sharpening (2026-10-06)

Eviction leaves the page shell in place, so it does not change the prefetch
IntersectionObserver's membership. A page can have no pixels while remaining
inside the 1300 px margin. Scrolling must admit missing visible paper even when
there is no new observer callback. The existing Reader scroll callback now performs
that admission, so requests coalesce through the same paint queue and
pinch/ink pause rules. The same scroll signal wakes a pending idle retry
through the scheduler, so newly visible paper does not inherit an offscreen
160 ms delay. No separate listener is added. No new input owner or text/glyph geometry work is added.

Idle sharpening requests only visible pages. Asking for both offscreen sides at
full resolution can request more page bitmaps than the 24 Mi-pixel cache holds;
those sides then repeatedly evict each other. Initial observer prefetch remains
available. Scrolling uses the existing lower-resolution first-paint path and
visible paper sharpens after idle. The cache limit and source glyph map are
unchanged.

The synthetic tablet comparison in diagnostic PR #107 separated these causes:
Chromium's visible empty-bitmap samples fell from 11 to 1 with visible admission;
WebKit's actual renders/evictions fell from 46 to 6 with visible-only sharpening.
The remaining Chromium sample was one newly exposed page beginning its render,
not the prior wait-until-idle interval. These are controlled browser findings,
not proof that the user's physical iPad report has the same complete cause.
The initial nonpersistent WebKit run did not pass fixture import and is excluded.
The calibrated persistent runs asserted actual middle-page position, visible
source selection, pending/ready help, independent rectangle visibility, and
source pixel content. Translation-only and no-popup controls showed the same
PDF scheduling mechanisms; EPUB retained stable frame geometry and cue cleanup.

`verify-pdf-visible-repaint.mjs` covers admission without an observer transition,
coalescing, no unnecessary work for settled pages, pinch pause, stale sessions,
and visible-only sharpening. `verify-pdf-visible-repaint-browser.mjs` runs the
actual product scheduler on a 12-page PDF and EPUB controls in both engines,
light/dark, before/after translation and pending/ready help. It asserts bounded
empty-frame runs, bounded actual bitmap renders, stable page/frame geometry,
cleanup and request abort. It does not claim native touch/momentum, original
user-file coverage or physical-device GPU validation.

### Same-value geometry notifications (2026-10-06)

The delayed fail-open boot cleanup can remove an already-absent HTML class.
MutationObserver still reports that no-op. Treating every root attribute record
as geometry invalidation caused an unnecessary twelve-page cache rebuild when
the cleanup coincided with the chrome-only measurement boundary. The ink scope
observer now skips only identical old/current attribute values. Actual root,
paper aspect-ratio and page-list mutations, and changed-then-restored batches,
still invalidate geometry and update native scope. The zero-paper-read chrome
contract is retained; no timing sleep or measurement allowance is added.

Production-callback tests and a browser counterfactual cover the no-op before/
after behavior plus a real-change positive control. The diagnostic keeps every
bounded attempt and fails if any attempt violates its existing assertion.
