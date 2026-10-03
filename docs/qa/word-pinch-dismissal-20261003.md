# Anchored lookup pinch dismissal — 2026-10-03

## Ownership and change

Base: `464e85a33a2f260d6c50f43a0d1d09da110a27b5` (release229 / PR85).
Read root AGENTS.md, DESIGN.md, dictionary overlay/recovery and PDF ink decisions,
existing pinch QA and Integrity workflow guidance. No scoped AGENTS.md or local
`.agents/skills` were present in this checkout or its workspace parent.

`beginOriginalPinch` checked only `wordPeekOpen`. Expansion sets that state false
and sets `wordDetailAnchored` true, so pinch left detail outside its cleanup path.
It now checks `wordSurfaceAnchored`, the same predicate used by `scrollGesture`,
and calls the existing `closePanel`. No new event listener, timer, state, gesture
owner, storage rule, zoom transform or native input policy was added.

Cleanup cancels morph/reveal work, clears selection, ends the lookup lifetime and
aborts owned requests. Late results retain existing cache/storage semantics but
cannot restore presentation. Pinch release/cancel does not open a lookup.
PDF alone admits custom pinch; text/EPUB retain existing scroll dismissal and
non-zooming multitouch policy. Unanchored Memory detail continues to block pinch.

## Regression evidence

- Aggregate `npm test`: passed; TypeScript baseline remains 34 diagnostics.
- New production-lifecycle regression: mini/pending and expanded lookup dismissal,
  request abort, late usable result cache path, saved vocabulary preservation and
  a fresh lookup. Replacing just the predicate with its pre-fix version fails at
  `pinch left an anchored lookup alive` for expanded detail.
- New Chromium browser suite: 48 pinch cases across mini/detail/in-flight morph,
  in/out, light/dark and 390×844, 820×1180, 1440×900, 844×390. Verifies acquisition,
  staggered release, committed zoom, no resurrection and preserved vocabulary.
  Also checks partial touchcancel, noncancelable interruption, blur, lost terminal
  event recovery, trailing click, explicit reopening, modal exclusion and actual
  text/EPUB scroll dismissal. Synthetic DOM contacts do not establish UIKit proof.
- Existing Chromium pinch suite: trusted CDP input, 12 in/out cycles per viewport
  at 390×844, 768×1024 and 1180×900 with 120-page PDF. Passed.
- Existing Chromium suites passed: pinch interruption/offset ownership, word
  scroll-idle, word presentation, reader input gestures and PDF ink (synthetic
  Pencil/finger separation, IDB persistence, undo/redo, erasure and reload).
- `npm run ios:sync` passed. Source `scripts/reader/pdf-pinch.js`, generated
  `www/scripts/reader/pdf-pinch.js` and `ios/App/App/public/scripts/reader/pdf-pinch.js`
  are byte-identical. Generated native assets are ignored as required by the repo.
- Browser regression is included in `test:pdf-pinch` and Integrity CI, which runs
  both Chromium and WebKit. Lifecycle coverage is already in aggregate `npm test`.

## Limits and release boundary

Local browser runs use installed `/usr/bin/chromium` because Playwright Chromium
and WebKit download endpoints returned HTTP 403 `Domain forbidden`. Local WebKit
was not run. Linux has neither Xcode nor Swift; no iOS simulator build, physical
WKWebView/Pencil check, archive or TestFlight claim is made. On iPad, check expanded
lookup → pinch both ways → staggered lift/cancel → fresh word tap, including slow
metadata and rapid expansion, then Pencil and scroll recovery.

Only a draft feature PR is authorized. No main push, merge, deployment, build-number
edit, archive or Cloud build request belongs to this change. Release229 settings
are inherited unchanged from PR85.

## Deferred geometry and CI follow-up

The first CI attempt passed contracts and native ownership, but the new WebKit
fixture timed out before creating a PDF canvas. The fixture now uses the same
temporary persistent context as existing PDF tests, required for imported Blob
storage. Assertions and engine coverage remain intact.

A focused review follow-up reproduced an older tap awaiting PDF geometry opening
lookup after pinch. Production `openPdfWordAt` now checks the existing
`readerModeChangeToken` after its await; the dispatch completion checks that same
generation before doing miss cleanup, so it cannot close a newer lookup. No new
generation, listener or gesture owner was introduced. Four production-path tests
fail without this guard and pass with it: during pinch, release, cancellation and
a fresh lookup before the old geometry resolves. Two controls retain normal
uninterrupted deferred hit/miss behavior.
