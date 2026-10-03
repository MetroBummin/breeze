# Sentence help and Memory cleanup — 2026-10-03

Base: released main `51b83253a70b7ab437adbb3d05807cf8723fa3b2`, 1.7 (230).
Read root AGENTS.md, DESIGN.md, shared control, dictionary anchor/recovery,
sentence lookup and vocabulary-review decisions. No scoped AGENTS.md or
workspace `.agents/skills` were present. One worker; no model delegation.

## Behavior and ownership

- Removed the whole Memory selection row and unreachable checkbox state/CSS.
  Search, book/star filters, daily start and filtered practice remain. Existing
  study queues/history, FSRS, limits, vocabulary, CSV and sync are preserved.
- Reader-origin sentence results show Korean only and leave the source available
  to scroll/pinch. Unanchored results retain English and modal input ownership.
  Retry retains the occurrence. Existing sheet/modal sizes remain.
- Existing scroll and PDF pinch owners dismiss anchored waiting/result/help via
  `closeSentence`. Scroll compares actual position; duplicate/programmatic events
  do not dismiss. Cancellation/lifetime guards reject stale release, translation
  and explanation. Account reset ends sentence ownership and clears help cache.
- Sentence “쉬운 설명” reuses word help's renderer and CSS, including skeleton,
  motion, focus, retry and reduced motion. Only an explicit click sends source,
  translation and bounded exact-occurrence context. No saved-word mutation,
  automatic retry, prefetch or explanation persistence. Cache is at most 16.
- The non-billable existing warm response advertises backend support. Older or
  unavailable backends do not expose the button; a subsequent bad_op fails closed.

## Local evidence

Passed:

- Aggregate `npm test`, including sentence server contracts and existing lookup,
  FSRS, sync, storage, gesture and word/sentence lifecycle suites. Typecheck stays
  at 34 existing diagnostics. Server help modules also pass standalone tsc.
- Real revised Edge handler with fake providers: verified account ownership (not
  caller-supplied identity), anonymous quota, one-unit reservation, no-store,
  invalid input, denied/unavailable quota, cancellation and capability response.
- Chromium sentence-help regression: normal/pending/slow/error/retry/offline,
  unavailable capability, duplicate suppression, literal text, cache bounds,
  account/document changes, programmatic/duplicate/user scroll, late translation
  cache writes, PDF pinch release/cancel/blur/noncancelable endings, no-pinch
  text/EPUB controls and unanchored source distinction.
- Existing Chromium sentence presentation and all six cue configurations
  (390/768 × TXT/PDF/EPUB), word easy explanation, word pinch dismissal and
  vocabulary-review browser suites. Reader input suite verifies optional
  two-finger double-tap undo and existing input ownership; this is automated
  browser evidence, not the user's physical build-230 test.
- Both themes at 390×844, 820×1180, 1440×900, 320×568 and 844×390 for sentence
  help. Representative light phone and dark short-viewport captures inspected.
  Evidence: `/tmp/breeze-sentence-help-proof`, `/tmp/breeze-review-proof`,
  `/tmp/breeze-easy-proof`, `/tmp/breeze-input-gestures`.
- `npm run ios:sync`; new sentence script and PDF pinch source match generated
  www/native assets byte for byte. iOS app/extension versions remain 1.7 (230).

Local Chromium uses `/usr/bin/chromium`; temporary browser executable links live
only under `/tmp`. Playwright download endpoints returned 403 Domain forbidden.
WebKit is unavailable locally; Integrity CI runs the new sentence and existing
Memory/word-help/gesture regressions in both Chromium and WebKit. The complete
home-ui command also needs WebKit; its Chromium subset is run separately.

## Deployment/release handoff

Deploy **only** the revised `server/dict` bundle (including
`sentence-easy-explanation.ts` and the shared `easy-explanation.ts`) to Breeze
project **hrtfhojbhqvaoiulspto**. Preserve current secrets, auth and quota RPCs;
no schema migration is required. Do not blindly use the repository's other
Supabase project config. Verify deployed `warm` returns the new capability,
pre-provider invalid-input rejection and route/quota behavior. A bounded paid
provider smoke requires its own agreed allowance; no paid call was made here.

Parent owns final merge, coordinated backend deployment, verified next release
counter, signed archive/upload and TestFlight delivery. This draft changes no
release number and publishes no main commit. Linux has no Xcode/Swift, simulator
or physical WKWebView/Pencil proof. Physical iPhone/iPad scroll, pinch, interruption,
keyboard, native blur and double-tap undo remain release verification. RSS was
not changed; its rollout is separate.
