# Client integration — 2026-10-03

Base: released main `464e85a33a2f260d6c50f43a0d1d09da110a27b5` (1.7 / 229).
Includes parent-approved final PR86 head
`a09f1a48051836fa8fbe17b6ccf96f828c633df8`, not its unfinished predecessor.
PR86's `gesture.js` and `pdf-original.js` remain byte-identical to that head.
Only generated index/service-worker hashes conflicted during integration; they
were regenerated from the combined source.

## Final behavior

- Memory removes the list's learning/relearning waiting row and redundant resume
  sentence. Existing start/resume, paused-limit/error messages and completion
  waiting information remain. No vocabulary, FSRS parameters or ratings changed.
- Again is 1 minute for a new card; a failed Review card enters Relearning at
  10 minutes. Unit/oracle and both-engine browser tests verify this.
- User-selected gothic artwork applies only to The Speckled Band. Exact original
  PNG: 2,563,098 bytes, SHA-256
  `800b87d1e50a18fd622b9f8df1162bebf94c4f2e158bb470855bcd2c3fb13da2`.
  Existing coverless bundled books receive missing artwork after startup without
  blocking Home. Custom covers, deleted books and original text remain intact.
  The later user-requested Scandal in Bohemia and Red-Headed League covers are
  also applied to their exact catalog identities; source hashes and Library
  provenance are recorded in `assets/longreads/covers/README.md`.
- Scribble erase is removed, superseding the earlier request to simplify it.
  Scratch/loop strokes remain ordinary ink. Reader Aa settings expose the default
  OFF “두 손가락 더블탭 실행 취소” for supported PDF original view. Exactly two
  fingers tapped twice undo one edit in writing mode. Toolbar Undo/Redo remains.
- Existing pinch ownership reserves stationary pairs; real movement immediately
  cancels undo and continues pinch/pan with the same geometry. Stable zoom above
  1 allows stationary undo, while edge swipes continue to pan instead of opening
  the page sidebar. No change to that user-preferred navigation policy.
- PR86 dismisses anchored word UI on pinch and rejects stale deferred PDF lookup
  coordinates, including stale completion attempting to dismiss a fresh lookup.

## Validation

Passed on the connected Mac in isolated `/tmp/breeze-client-integration-20261003.nosync`:

- Aggregate `npm test`; typecheck stays within existing 34-diagnostic baseline.
- Two-finger timing/ownership unit tests: single pair/finger, skew, duration,
  movement, native scroll, zoom, viewport/session change, cancellation, third
  touch, stylus/palm, modal, reading mode, OFF, selection and existing pinch.
- Both Chromium/WebKit reader-input browser matrices: OFF/ON, exactly one undo,
  toolbar redo, zoom motion, cancel, third touch, stable enlarged zoom, reading
  exclusion, preference persistence, real IndexedDB reopen and session history.
  Stationary completion releases pinch, transform frames and queued PDF paint.
  Chromium also passes browser-generated trusted CDP pointer/touch delivery of
  two paired taps, undoing exactly one edit.
- Existing `npm run test:pdf-ink` in both engines: highlighter, partial eraser,
  undo/redo, evicted pages, failed-save recovery, document isolation and synthetic
  stylus/palm ownership. Dense scribble remains ordinary ink and is undoable.
- Existing `npm run test:pdf-pinch`: interruption tests in both engines and
  trusted Chromium input over 120 pages / 12 cycles at three viewport sizes.
- PR86 `verify-word-pinch-browser.mjs` passes both engines after integration.
- `npm run test:vocabulary-review`: FSRS oracle/contracts and both-engine UI,
  resume/history/budget/storage recovery and interval tests.
- `npm run test:home-ui`: shared dock, resume, refresh, reading progress, Memory
  search/filter/edit/export and lookup lifecycle suites.
- New client-polish browser test in both engines: exact cover load, old-book
  repair, retained text/identity, custom-cover preservation, removed copy,
  persisted schedule and resume entry. Async cover repair unit test rejects
  concurrent custom cover or deletion during image storage.
- Both themes at 390×844, 820×1180, 1440×900, 320×568 and 844×390 for Reader
  settings, Memory and cover surfaces. Screenshots under `/tmp/breeze-input-gestures`
  and `/tmp/breeze-client-polish`; representative images visually inspected.
- 37 native PDF input ownership checks and UIKit/WebKit SDK typecheck pass.

The build-229 pen-settings screenshot was captured before removal at
`/Users/kosangbum/Documents/Codex/2026-10-03/task/evidence/229/pen-settings.png`.
229 path was PDF original → writing mode → tap already-selected Pen again →
휘갈겨 지우기. This is historical evidence, not the new control's location.

## Boundaries

Synthetic WebKit and trusted desktop Chromium input are not physical iPad
WKWebView/Pencil/palm-delivery proof. Verify on device before release, including
native inertia, rapid zoom, two-finger double tap in each writing tool, OFF,
rotation, cancellation, interruptions and undo/redo persistence.

RSS remains OFF. No secrets, release number, archive, upload, production rollout
or main merge is part of this draft. The integration owner waits for parent
coordination before merging or selecting a release number.


## CI fixture follow-up and remaining covers

CI on `00fec12` passed contracts, native ownership and the new undo matrix in
both engines, but WebKit failed the PR86 non-PDF control at line 117. Its combined
assertion `!originalPinchBusy() && wordDetailAnchored` did not distinguish an
unexpected pinch from an unprepared detail view.

The original fixture called `expandWordDetail()` after two animation frames.
That function intentionally does nothing while the mini pill is hidden. The
production mini pill waits for 250 ms of scroll idle; late mode/viewport scrolls
can therefore leave the fixture unprepared. A focused recent-scroll reproduction
on both unchanged PR86 `a09f1a4` and PR87 records `pillHidden: true`,
`expanded.detail: false`, `pinch: false`: the same composite assertion fails
without any PDF zoom acquisition. Normal local full runs passed both revisions.
This establishes an inherited timing flaw; the original CI did not record the
individual booleans, so its exact timing cannot be reconstructed from that log.

The fixture now deliberately exercises recent scroll, waits for a visible mini
pill, expands it and asserts the anchored-detail precondition before multitouch.
Post-touch no-pinch and retained-detail assertions are separate and carry state
snapshots; actual scroll must still dismiss the lookup. The targeted reproduction
passes against PR86 and PR87 with this correction. Application behavior and
contracts are unchanged; no fixed sleep increase or weakened assertion.

Both subsequently approved covers were materialized through Library on the Mac
and visually checked. Catalog identity and exact checksum tests protect all
three titles; browser tests cover new and existing-book artwork and responsive
shelf previews. Final combined verification includes these assets.
