# Sentence lookup feedback and translation-only results

## Problem

Sentence lookup reused the temporary mode-switch cue. PDF and the DOM fallback
faded out after six/ten seconds even while a translation was pending; Custom
Highlight API rendering had square corners and no entry animation. PDF sentence
matching also selected every occurrence with identical example text.

## Decision

A confirmed long press paints a dedicated sentence cue for Text, PDF and EPUB.
The gesture threshold, request ownership, cache policy and release-before-result
behavior stay in their existing owners. The blue cue remains visible until the
lookup closes, including slow requests and errors with retry.

For the bundled Homeward Bound Text book, exact chapter source matching enables
reviewed sentence spans and Korean translations. A local hit keeps the same
waiting presentation for about one second and does not call the AI endpoint.
Changed source text or a missing span uses the existing cache/network path.
Other Text, EPUB and PDF books keep their original sentence segmentation.

The visual surface consists of rounded, borderless line rectangles with a
260 ms eased opacity/vertical expansion and a 160 ms dismissal fade. Reduced
motion removes both motion and delayed cleanup. A fading layer owns its own
removal callback, so it cannot erase a newer selection. Cleanup uses the parent
Reader timer: WebKit can defer timers in sandboxed EPUB frames, which otherwise
left an outgoing cue attached after dismissal. The surface has no
pointer events and cannot alter line wrapping or steal scrolling/touch.

PDF uses the cached glyph boxes and their line IDs, with page-relative
coordinates and no added position/width corrections. Sentence-start offsets
identify the occurrence; identical sentences elsewhere on a page stay unmarked.
Text and EPUB use the actual selected DOM Range. Overlapping/adjacent fragments
are joined per line. Geometry is read on selection and when the selected
sentence's layout changes through ResizeObserver, never on ordinary scroll.
EPUB receives the same style in its owning document. This does not change saved
word/phrase highlights or the mode-switch landing cue.

Blue blends with the source using multiply on PDF/light text and screen on dark
text, preserving the source ink. Existing sentence result glass/sheet presentation
is retained. Successful results contain only English source and Korean
translation. Grammar/expression details are removed from DOM, CSS, renderer and
new client cache writes. Old cache entries remain readable; their extra fields
are ignored. Failures retain necessary status and retry controls. The backend now requests and returns only `ko` (plus provider/quota metadata),
without generating unused grammar `points`. The 600-token ceiling is retained
to protect long translations. Authentication, quota and legacy cache handling
are unchanged. This server change requires a separate deployment.

## Verification

- `tests/verify-sentence-cue-browser.mjs`: confirmed touch long presses on phone
  and tablet sizes, Text/PDF/EPUB, exact occurrence, multi-line blue cues, slow
  PDF response beyond the former timeout, scroll without range reads,
  translation-only results, selected-range reflow, dark blending, cleanup and
  reduced motion. Chromium uses trusted CDP touches; WebKit uses synthetic
  pointer events through the existing gesture owner.
- `tests/verify-sentence-presentation-browser.mjs`: cached grammar fields do not
  reappear, successful cache hits add no footer, sheet/modal layout, dismissal,
  theme surfaces and stale response behavior.
- `tests/verify-sentence-lifecycle.mjs`: asynchronous cache/network ownership,
  release gating and close/resize cancellation.
- PDF glyph/highlight regression, gesture ownership, full suite and build remain
  required. Browser touch and WebKit are not physical iPhone/iPad validation.

Observed on 2026-09-21: all 12 cue configurations passed (Chromium/WebKit ×
390/768 px × Text/PDF/EPUB), along with the sentence presentation/lifecycle
regressions, supplied-PDF geometry regression, `npm test`, `npm run www`, and
`git diff --check`. Physical iPhone/iPad testing remains open.
