# Sentence loading spinner investigation

Product source: `693488cfe25419654e91d5bf18a03cbb8d8d591c`.
Scope: diagnose the reported occasional sentence-loading spinner stop. No
production edit, merge, release-counter change, deployment or native build.

## Facts and distinctions

- The spinner is a CSS transform animation, infinite, 800 ms per rotation.
  Reduced motion uses 1,250 ms, rather than disabling it (`reader.css:204–206,
  245–249`). No application pause call was found.
- `beginSentenceWaiting` schedules one frame to expand the shared pill. The
  spinner's rotation is not a JavaScript frame loop (`sentence.js:119–126`).
- Translation waits for local cache, then auth, fetch and response body with no
  end-to-end deadline (`sentence.js:236,254–255`, `dictionary.js:1323–1341`).
  A stalled dependency can strand the *loading state*. That does not establish
  why a CSS animation would visually freeze.
- A completed translation deliberately waits for the opening pointer's release
  (`sentence.js:184–186`). A stale hold pointer can therefore hide an answer
  already received. `gesture.js` clears the hold only for matching pointerup/
  pointercancel, not lostpointercapture, blur, close/reopen or the next press.
  Injected terminal-event loss reproduces the state trap, not an actual iPad
  event loss. Lost capture alone also does not mean the finger was released.
- The loading pill combines an overflow clip, transform, size transition and
  backdrop-filter. These are compositor hypotheses, not causal evidence.
- The separately reported PDF flicker has only a small user comparison suggesting
  an association with easy explanation. It is not assumed to share this cause.

## Diagnostic coverage

`node --test tests/diagnose-sentence-wait-state.mjs` runs production sentence
state and production `dictCall` in a deterministic VM. Seven cases characterize
cache/auth/fetch/body stalls beyond 120 simulated seconds, the completed-result
pointer gate, stale completion after closing, and an orphaned production hold pointer carried
through close/reopen. These are diagnostic assertions
of current behavior, not a claim that indefinite loading is the desired contract.
The VM does not render or simulate real Safari network/storage failure.

`BREEZE_QA_ENGINE=chromium|webkit node tests/diagnose-sentence-spinner-browser.mjs`
separates:

- Mocked response pending versus already received while the finger is held
- Pointer release, repeated close/reopen, and stale completions
- A later sentence lookup after an easy-explanation lifecycle
- Animation playState/currentTime, computed transform, timestamped rAF max gaps
  and four painted snapshots taken at non-cycle intervals
- Normal/reduced motion and light/dark, at tablet size, for text and original PDF
- A labelled 350 ms injected main-thread stall to validate the cadence detector

Only fixture content/mock answers are used; external browser traffic is blocked.
Chromium uses trusted touch; Linux WebKit uses synthetic pointer events. Neither
reproduces physical iPad WKWebView, native touch tracking or momentum scrolling.
A passing test cannot exclude a device-specific compositing stall. Painted
snapshots show selected moments, not continuous native-screen capture.

## Evidence required to identify the reported cause

1. Does the answer eventually appear while/after the spinner stops, or does the
   loading state remain indefinitely? Do other controls/scrolling continue?
2. For the affected lifetime, correlate dependency stage, pointer ownership,
   response arrival, spinner clock and painted output.
3. Frame stall with animation stall calls for a profile of coincident main-thread
   work. An advancing animation clock with static native pixels calls for
   targeted compositor A/B tests on the affected iPad. A completed answer with
   an orphaned hold pointer calls for gesture-lifetime repair. Do not change
   spin speed or add forced repaint without this distinction.

Browser CI results are attached to the diagnostic pull request. The initial
local validation passed all seven VM cases and both JavaScript syntax checks.
