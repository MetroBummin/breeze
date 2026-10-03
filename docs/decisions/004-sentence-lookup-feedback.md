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
is retained. Anchored Reader results show only Korean translation because the source is
already visible. Unanchored results retain English source context. Automatically
generated grammar/expression details are removed from translation DOM and new
client cache writes. Explicit easy explanation is a separate transient request. Old cache entries remain readable; their extra fields
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

## Ready result and cache persistence (2026-09-29)
A usable network translation is presented through the existing lifetime/release gate before awaiting its cache write. Valid stale answers are still cached, but cache completion never paints or reopens a closed lookup.

## One waiting surface across original formats (208)

Sentence waiting closes source navigation and makes the complete back/page slot inert and invisible, alongside settings/mode controls. It hides PDF writing entry/tools and centers the 48px waiting pill with full available width, overriding original-navigation offsets and writing geometry. Closing or result presentation restores the existing chrome and tool state. No request, cue or release policy changes.


## Context-only Reader result and explicit help (2026-10-03)

The Reader surface supplies the source occurrence to the same sentence lifetime.
Its result keeps the existing sheet/modal geometry but removes the English block
and scrim, leaving source input available. Unanchored/history-style openings keep
English and modal ownership. Retry retains the source occurrence. Translation
storage remains `{ko, done}`; old grammar fields remain ignored.

Actual user scroll displacement closes anchored waiting/result/help through
`scrollGesture`; duplicate events and programmatic motion do not dismiss it.
The PDF pinch owner's admission allows anchored sentence UI and acquisition calls
`closeSentence`, just like anchored word detail. Release, cancel, backgrounding,
late translation/cache completion and late explanation cannot restore it. Text
and EPUB still do not acquire PDF zoom. Account reset and document/mode/navigation
cleanup end the same lifetime; no competing input listener was added.

“쉬운 설명” sits below Korean translation and uses the **same renderer and CSS**
as word help: neutral button, in-place expansion, three-line skeleton, live status,
retry, focus and reduced motion. Only its explicit click calls
`sentence_easy_explanation`, with current source, translation and at most two
neighbors per side. Text offsets, PDF's existing word-box context and EPUB's exact
block supply the occurrence. Ambiguous source matches omit neighbors. The server
asks for short Korean meaning/structure help, avoiding repeated translation or a
full grammar lecture. No meaning suggestion or vocabulary write exists here.

The explanation has one pending request, a 30-second timeout, existing auth/quota
and provider path, and at most 16 session/account cache entries. A failed request
has only manual retry; login/quota errors do not invite retry. The existing
non-billable `warm` response advertises `sentenceEasyExplanation:true`; the button
stays hidden without that capability. An old server's `bad_op` fails closed and
shows a brief unavailable message if support disappears after advertisement.

Deploy the revised `server/dict` bundle to Breeze **hrtfhojbhqvaoiulspto** before
release. No migration or auth relaxation is required. One explicit explanation
reserves one shared AI quota unit before provider work, as word help does; a
failed/disconnected provider request can consume it. Translation receipt replay
and success-only translation charging are unchanged. This task prepares code;
parent release coordination owns deployment and bounded paid smoke approval.

Validation: `verify-sentence-easy-explanation.mjs` tests the real route with fake
providers, authenticated owner and anonymous quota; `verify-sentence-help-browser`
checks capability, source distinction, duplicate calls, failure/retry/offline,
stale results, cache bounds, scroll/pinch endings and text/EPUB controls. Existing
cue/presentation and word-help regressions remain required in both engines.
