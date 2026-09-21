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
