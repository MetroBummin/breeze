# On-device scanned PDF word lookup (1.9.2 candidate draft)

Base: main `83cc182db73ed1d63784e66321a066ccb2943994`. PR142 was already
merged when this work started. This feature belongs to an independent 1.9.2 draft;
it changes no marketing version, build counter, release hook or deployment.
The target was changed from 2.0 to 1.9.2 by the owner; submitted 1.9.1(257)
remains frozen. This designation does not authorize a release build or submission.

## Ownership and scope

PDF.js still renders the document. When the existing operator-based word map
is empty, `getTextContent()` must also contain no non-whitespace text before the
page is an OCR candidate. Existing text PDFs, including invisible OCR layers,
non-English text and mixed image/text pages, keep the original path. We do not
infer that a text layer is bad merely because it has no English lookup words.

`BreezePdfOcr` has one global native admission across document sessions. It admits only
settled visible pages, after scroll idle, outside pinch/ink, active paper painting
and background state. There is no document-wide OCR queue or adjacent-page OCR.
A page change reprioritizes the next job. A native request already running may
finish; close, replacement, deletion and A→B→A reopen invalidate publication and
cache writes. Native work retains admission until completion, so reopening cannot
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
Missing/nonfinite confidence or confidence outside 0.3–1, zero-area/clamped or
nonfinite/out-of-page rectangles and unsupported lexical
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
and `openPdfWord`. An OCR word first opens a nonmodal spelling confirmation.
Its explicit "맞아요, 뜻 보기" action starts the existing lookup and remembers
that exact published box in a WeakSet. Repeated taps on that same live occurrence
then open lookup directly. The check is not shared by word string, another box,
cache reconstruction, page eviction or document reopening; it is never persisted.
Unconfirmed repeated source taps never count as confirmation. There is no new
spelling editor or saved user correction; "원문으로" dismisses the prompt.
Outside input, scroll, pinch, resize,
backgrounding or reader exit dismisses the prompt, and its callback rechecks the
document, occurrence and position generation. Reading and zoom remain available.
Native stress found `Bright` recognized as `Briaht` at confidence 1.0; raising a
confidence threshold alone cannot establish correctness. OCR sentence lookup is
not enabled by confirming an individual word. Text-layer PDFs keep one-tap lookup.
OCR never automatically calls the dictionary. A tap on an unrecognized page
uses the existing toast: processing, unsupported, empty or retry-on-failure.
It never waits to open lookup from an old screen coordinate. There is no automatic
retry loop after OCR failure.

## Response deadline and recovery

A 30-second response deadline ends JavaScript's wait with a failed page. This is
a configured UI policy, not a measured OCR speed claim. It does not assert that
the native operation stopped. Its result, if delivered later, is discarded without
publication or cache writes. Scheduling can then read other pages' existing OCR
cache, while uncached pages remain blocked from native admission.

On an explicit retry, one shared status probe has a 2-second deadline. The native
plugin only confirms completion for the exact request ID, after Vision/ML Kit
has returned and input/model cleanup has run. A matching receipt permits retry
even if the original Capacitor response never arrived. Busy, unknown, unsupported,
or nonresponding status never releases admission. The existing reader notice asks
the reader to completely close and reopen the app. Late status/retry callbacks
cannot revive a closed reader, and a late old response cannot release a newer job.
Natural native settlement also wakes the currently visible blocked page; the
failed timeout page itself still needs an explicit retry.

An SDK call that actually never returns cannot be safely force-restarted here.
Apple exposes `VNRequest.cancel()`, but requesting cancellation is not evidence of
completion; ML Kit's `TextRecognizer` exposes processing and resource closing,
without a matching cancellation-completion contract. No timer recycles a bitmap,
closes an active recognizer, or starts overlapping SDK work. A genuinely stuck
SDK can still require process restart. This conditional limitation is distinct
from controlled lost-response tests; no actual permanent native hang has been
observed in the executed Vision corpus, and actual ML Kit remains unexecuted.

Web/PWA and native builds missing the plugin explicitly report unsupported and
remain readable. No web OCR package, cloud OCR, paid API or original PDF upload
is introduced. Existing user-initiated dictionary behavior is unchanged.

Official API references:
- [Apple text recognition](https://developer.apple.com/documentation/vision/recognizing-text-in-images)
- [Apple range bounds](https://developer.apple.com/documentation/vision/vnrecognizedtext/boundingbox(for:))
- [Apple cancellation](https://developer.apple.com/documentation/vision/vnrequest/cancel())
- [ML Kit bundled Android model](https://developers.google.com/ml-kit/vision/text-recognition/v2/android)
- [ML Kit element bounds and confidence](https://developers.google.com/android/reference/com/google/mlkit/vision/text/Text.Element)
- [ML Kit processing and resource lifetime](https://developers.google.com/android/reference/com/google/mlkit/vision/text/TextRecognizer)
- [Capacitor iOS plugin registration](https://capacitorjs.com/docs/plugins/tutorial/ios-implementation)

See [verification and remaining acceptance](../qa/scanned-pdf-ocr-20261009.md).

## Native bridge contract correction (2026-10-10)

This static app does not import the npm `@capacitor/core` runtime. The native
iOS/Android bridge injects callable proxies into `Capacitor.Plugins`; it does not
provide the npm `registerPlugin` helper. OCR and Android tablet capability lookup
now prefer those injected proxies, with an optional helper fallback for bundled
web runtimes. Calling the absent helper previously threw before OCR page state
was recorded, explaining a silent tap path. Regression fixtures cover the native
proxy shape rather than supplying a helper absent from the shipped shell. This
contract reproduction does not establish real-device Vision accuracy or a verified
repair on the reporter's iPhone; those remain release acceptance requirements.
