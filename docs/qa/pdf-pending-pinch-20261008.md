# PDF pending lookup through pinch — 2026-10-08

Base: PR132 candidate `ef5669b17213cd61c2899220f90418697f4db29d`.
Archive-source comparison: `7490ba3457acd8771d8100319be3a837448e5f2d`, iOS 1.9 (251).
The user's installed build is unknown. All work used the cloud Linux workspace;
no connection to the user's Mac, signing, upload, deployment or merge occurred.

## Reproduction and cause

The controlled real-PDF Chromium fixture reproduces both word and sentence
pending shimmer removal at pinch acquisition on both sources. Their entire
runtime/assets/native trees are identical: the four intervening changed files
are CI, the onboarding test and integration evidence, not runtime.

`beginOriginalPinch` unconditionally called `closePanel`/`closeSentence` for
anchored lookups. These retire the lifetime, abort unfinished transport and
remove the owned cue. This is a pre-existing pinch dismissal rule, not evidence
that this particular user's transport/request remained alive or that a PDF text
layer repaint lost an otherwise-owned cue. Previously completed/cached results
may remain stored; the installed-device symptom still needs device confirmation.

## Repair and scope

Retain only waiting word/sentence owners at pinch acquisition. Their existing
page-relative marker/line cue scales naturally with the paper. Completion uses
the existing saving/ownership path and stops pending shimmer; presentation waits
for release or cancellation of the pinch, then uses existing visibility and
scroll-idle rules. Ready mini/detail/morph/error surfaces still dismiss on pinch.
No new state, API request, retry, gesture listener or source geometry is added.
No change to viewport, ink, palette/keyframes, onboarding, brand or release metadata.
`index.html`/`sw.js` receive the normal generated content-version stamps.

The integration receipt pins precisely the changed runtime/decision files and
retains their previous baseline hashes; existing tests/assertions are unchanged.
A separate workflow adds the new real-PDF test in Chromium and WebKit.

## Local evidence

- Full `npm test` passed, including type check, lookup lifetimes, request recovery,
  gesture ownership, sentence feedback and PDF contracts.
- 97 PDF ink/session/repaint/scope contract cases passed.
- New Chromium PDF test passed in light/dark at 390×844, 820×1180, 1440×900,
  844×390. Word and sentence each cover pinch in/out, repeated preview changes,
  consecutive pinches, completion during pinch, touchcancel/blur/noncancelable
  interruption, explicit close, different lookup, same-target reopening, stale
  completion, and saved-word/cached-sentence reopening without another API call.
  It asserts continuous running animation time, connected cue identity, retained
  lifetime, no transport abort during pinch, exact request counts, deferred result
  presentation and complete pending cleanup on cancellation.
- Existing Chromium word pinch dismissal/morph/text/EPUB tests passed.
- Existing Chromium PDF glyph/highlight geometry and ink browser tests passed.
- Existing PDF pinch/interruption and responsive sentence success tests are run
  separately; their final results and exact-head CI are reported with the PR.

Controlled transport mirrors production `dictCall`'s abort-to-null contract;
late gate resolution cannot return an answer through an aborted request. It
uses authored synthetic PDFs, no user document and no external dictionary API.
This is real PDF.js DOM/canvas UI with synthetic touch lists, not native hardware.
Local WebKit download returned 403 Domain forbidden for the Playwright mirrors;
WebKit is covered by the added CI job, with strict unchanged assertions.

Browser video/JSON evidence: `/tmp/breeze-pending-pinch-proof/` (fixed) and
`/tmp/breeze-pending-pinch-baseline/` (archive-source reproduction); CI uploads
engine-specific evidence as `pdf-pending-pinch-chromium` / `pdf-pending-pinch-webkit`.
Physical iPhone/iPad TestFlight acceptance remains open: native finger pinch,
Pencil/ink coexistence, viewport/safe areas and actual installed-build identity.
