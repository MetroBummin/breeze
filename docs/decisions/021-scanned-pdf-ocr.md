# On-device scanned PDF word lookup (2.0 draft)

Base: main `83cc182db73ed1d63784e66321a066ccb2943994`. PR142 was already
merged when this work started. This feature belongs to an independent 2.0 draft;
it changes no marketing version, build counter, release hook or deployment.

## Ownership and scope

PDF.js still renders the document. When the existing operator-based word map
is empty, `getTextContent()` must also contain no non-whitespace text before the
page is an OCR candidate. Existing text PDFs, including invisible OCR layers,
non-English text and mixed image/text pages, keep the original path. We do not
infer that a text layer is bad merely because it has no English lookup words.

`BreezePdfOcr` has one global work lane across document sessions. It admits only
settled visible pages, after scroll idle, outside pinch/ink, active paper painting
and background state. There is no document-wide OCR queue or adjacent-page OCR.
A page change reprioritizes the next job. A native request already running may
finish; close, replacement, deletion and A→B→A reopen invalidate publication and
cache writes. Native work retains the lane until completion, so reopening cannot
stack recognizers. Page rasterization is cancelled on close when possible.

A separate raster avoids capturing annotations/lookup markers and avoids quality
changing with CSS zoom. It uses the PDF's intrinsic rotation, scale at most 2 and
longest dimension at most 2048 pixels. Canvas pixels are released in `finally`.
Only its PNG base64 crosses the in-process Capacitor bridge. Each native plugin
also validates encoded length and image dimensions before decoding pixels, and
accepts at most one request. These are configured bounds, not measured latency
or memory results.

## Native engines and geometry

- iOS: Apple Vision `VNRecognizeTextRequest`, `.accurate`, English, language
  correction disabled. Each lexical range uses `boundingBox(for:)`; bottom-left
  Vision coordinates convert with `y = 1 - maxY`.
- Android: bundled `com.google.mlkit:text-recognition:16.0.1` Latin model, with
  no model download requirement. `Text.Element` pixel rectangles divide by the
  input bitmap dimensions. Elements containing multiple lexical tokens are
  skipped instead of splitting their rectangle proportionally.

Both return top-left normalized boxes after intrinsic rotation. CSS zoom,
viewport rotation/resizing and existing hit-testing need no extra transform.
Confidence below 0.3, nonfinite/out-of-page rectangles and unsupported lexical
forms are excluded. Results are bounded to 3,000 words/page and 100 characters
per word. Native axis-aligned rectangles are approximate for skewed text.

OCR is English-word lookup in this first implementation. Context stays within
one recognized line (bounded to 2,400 characters); column order and full sentence
reconstruction are not claimed. OCR errors can produce a wrong word; no fabricated
spelling correction, glyph-width interpolation or whole-PDF AI fallback is added.

## Cache and UI

A separate local IndexedDB cache retains at most 48 pages, including empty
successes. Keys contain schema/raster revision, platform, book ID, source-byte
hash and page number. Missing byte hashes disable durable reuse. Only native
word text/confidence/positions are cached, never the page image. Cache failures
fall back to recognition; deleting PDF assets removes that book's entries.
The cache is not part of sync or export. Existing page eviction releases live
lookup maps; returning to the page can use its durable OCR entry. OS/engine model
changes require a revision bump if their cached output must be invalidated.

Completed words feed `session.wordBoxes`, the existing saved/selected markers,
and `openPdfWord`. OCR never calls the dictionary. A tap on an unrecognized page
uses the existing toast: processing, unsupported, empty or retry-on-failure.
It never waits to open lookup from an old screen coordinate. There is no automatic
retry loop after OCR failure. A native call that never settles retains the work
lane; restarting the reader process is the recovery for a stuck native SDK call.

Web/PWA and native builds missing the plugin explicitly report unsupported and
remain readable. No web OCR package, cloud OCR, paid API or original PDF upload
is introduced. Existing user-initiated dictionary behavior is unchanged.

Official API references:
- [Apple text recognition](https://developer.apple.com/documentation/vision/recognizing-text-in-images)
- [Apple range bounds](https://developer.apple.com/documentation/vision/vnrecognizedtext/boundingbox(for:))
- [ML Kit bundled Android model](https://developers.google.com/ml-kit/vision/text-recognition/v2/android)
- [ML Kit element bounds and confidence](https://developers.google.com/android/reference/com/google/mlkit/vision/text/Text.Element)
- [Capacitor iOS plugin registration](https://capacitorjs.com/docs/plugins/tutorial/ios-implementation)

See [verification and remaining acceptance](../qa/scanned-pdf-ocr-20261009.md).
