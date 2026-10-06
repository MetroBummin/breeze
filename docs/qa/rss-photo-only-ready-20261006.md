# Home photo-only ready-card restoration

## Change

Ready Home recommendations require the existing usable-image decode (minimum
60×60). Pending metadata/image work stays selectable with known Preview metadata,
but only actual admission or image work shows shimmer. Complete absence, failed
bounded image fallback, and unadmitted probes are withheld from the rail; later
retained photos in the same source refill the slot. Candidate metadata is not
deleted or rewritten as no-image evidence.

One generation-local WeakMap controls display withholding. The existing serial
metadata owner, global two-request generation budget, positive/negative cache,
one image transport fallback, stable admitted-card order, and selected-only body
preparation remain in place. There is no additional original request or queue.

## Local evidence

- node --check passed for RSS production code, visible-cover unit/browser files,
  and the new photo-ready tests
- tests/verify-rss-photo-ready.mjs: 15/15 passed using production render, admission,
  cache ownership and decode lifecycle with controlled DOM geometry/image events
- The initial eight-test photo-ready set on the prior combined rss.js failed
  seven cases; the existing blob-fallback success case passed. Failures included
  artwork-ready budget-exhausted cards, no-image/error display, no same-source
  refill, cancellation display and metadata retention/display separation
- Four focused Node suites pass 94/94: recommendation 46, supplied covers 14,
  visible covers 19, and photo-ready lifecycle 15. The missing linkedom dependency
  was reused from another verified workspace; no canceled install was retried.
  No dependency manifest or lockfile changes were needed
- No browser engine was launched. The existing known socket restriction remains;
  phone/tablet/desktop light/dark and short viewport pixels need CI/device QA

The 15 new controlled tests cover positive recovery of two original-only covers,
admission-only shimmer, complete no-image versus transient unknown, budget and
offscreen withholding, full thirteen-source metadata retention, same-feed refill,
direct/blob decode success, tiny/failed decode, fallback error, image and metadata
cancellation/reentry, stale completion, generation recreation and late-feed order. A 100-unknown-entry source settles
without repeated probes: available photo siblings take priority, while a source
slot outside the viewport withholds its unresolved siblings only for that
generation. Saved/promo filtering still permits original-only recovery.
They also assert no book, image or article-body preparation writes.

The browser regression now waits for thirteen retained source groups rather than
thirteen ready cards. It still checks the original request count, serial work,
visibility, source metadata, Preview, cancellation, late-feed order, geometry and
cache bounds. Terminal failed-state JSON is written before display assertions.
This script has syntax validation only here and must run in CI before release.

The ingestion, supplied-cover, catalog benchmark, Preview-intent fixture and
shimmer-cost browser scripts were audited for obsolete artwork/count assumptions.
They now separate retained metadata from decoded display; their network, body
intent and persistence checks remain. All changed browser scripts pass syntax
checks but were not executed in this environment.
