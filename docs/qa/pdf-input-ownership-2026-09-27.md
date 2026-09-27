# PDF native input ownership candidate

## Scope and integration boundary

Based on PR #39 head `9d638c5db06e6c8aa36682690381dd2971e62e7a`.
This is a **stacked, native-input-only candidate**, not a replacement build for
183–186. Their page-node reuse, deferred diagnostics and pinch fixes exist only
in the user's local tree according to PR comments; they were not available as
committed source. Apply/reconcile this diff with those local changes before an
iPad build. Do not overwrite the local SceneDelegate wholesale with the remote
file. Do not reset the local branch to this remote branch or install the remote
base as a known-good 186 replacement.

No page eviction, canvas/SVG lifetime, web pinch math, saved ink, Undo/Redo,
lookup, input engine, build number or deployment changes are included here.
The existing 183 lifecycle fix must be preserved during integration. Full DEBUG
tracing in the old remote base is still expensive: keep it OFF, and preserve
183's asynchronous trace writer when resolving local conflicts.

## What changes

The former native route used `pan.numberOfTouches > 0` as a finger predicate,
then invoked `ignore(touch,for:)` on WebKit's already-live recognizers. Removing
ignore in 186 removed Pencil exclusion without a replacement. This candidate
instead configures `allowedTouchTypes` between contact sequences: remove only
Pencil from the identified paper and outer scroll view's pan/pinch recognizers.
Retain all original direct/indirect/pointer types; restore the original masks
when editing is disabled, only while idle and only if we still own the value.
No gesture delegate replacement, forced recognizer reset, global bounce switch,
synthetic Touch forwarding or per-frame scroll-offset correction is used.

A non-recognizing native observer records native contact lifetimes, including
contacts not forwarded to DOM (such as a held scrollbar). It does not log or
traverse the view tree. The ledger assigns roles once: navigation, suppressed
late contact, ink, stop-only or blocked. A late non-Pencil contact while Pencil
owns paper retains its suppression role through lift; this mirrors the existing
web palm policy, not a claim to infer anatomical palms from touch hardware.
Simultaneous previously unknown finger/Pencil arrivals conservatively prefer
navigation. No native ID is compared with a DOM Touch/Pointer ID.

The gate consumes a stop-only or rejected Pencil for its entire contact. It
cannot prevent other recognizers, so an already-owned finger gesture continues.
A stop-only contact calls the existing native stop API exactly once. An ink
contact fails the gate immediately and uses the unchanged real WebKit Touch
input. UIKit's native tracking/arbitration and delivery still require device QA.

Routing bindings are discovered on scope/layout changes, not per Pencil.
Admission masks are not changed while native contacts or recognizers are active.
If a new scroller has not yet bound, a paper-area Pencil is rejected for that
whole contact, never promoted midway. Once bound the next contact may edit.
This pending-bind case must be rare and must be checked on real iPad: repeated
first-touch rejection is a failed candidate, not an acceptable workaround.

## Invariants

- Stationary paper: first Pencil edits immediately and does not become pan input.
- Residual motion, no navigation owner: first Pencil stops only; next Pencil edits.
- Existing finger/scrollbar/pinch: owns its sequence; a late Pencil neither stops
  it nor begins editing after the finger lifts without lifting Pencil first.
- A suppressed contact cannot become navigation merely because Pencil lifts.
- End/cancel retires that contact; scope disable/background quarantines surviving
  Pencil contacts. Native live snapshots retire missed ends without a timer.
- DOM contact count zero and a quiet scroll interval are not native touch end.
- Normal edge bounce remains. After input/bounce settles, the paper must return
  to legal bounds. Persistent escape is NOT marked fixed by passing these tests.

## Verification performed here

`node tests/verify-pdf-input-ownership.mjs` executes 29 Swift checks. It extracts
production policy, gate, admission and routing code, compiles/runs them with
explicit public-API test doubles, and syntax-parses the entire SceneDelegate.
Coverage includes immutable stop/reject roles, next-stroke recovery, mixed ends,
late palms, native-only scrollbar contacts, type-mask restore/deferred updates,
new scroller bindings, gate non-interference, UI/page-gap exclusions and the
changed-pan/Pencil-only counterexample. The doubles do NOT emulate WebKit's
private gesture arbitration, native layer-tree changes, inertia or real latency.

`node tests/verify-pdf-input-ownership.mjs --ios-typecheck` checks those same
production sections with the real iOS Simulator UIKit/WebKit SDK on macOS.
A path-filtered PR workflow runs both. SDK typecheck is not a full app build,
and neither command is physical device proof. The Linux authoring environment
cannot run the SDK step or a signed iPad app; workflow results are separate.
No claim is made to have rerun the entire npm/Chromium/WebKit application suite.

## Required combined physical acceptance (one uninterrupted session)

Stationary pen -> finger flick -> first Pencil stops without ink -> lift ->
next curved stroke -> two-finger zoom -> horizontal edge bounce -> vertical
movement -> highlighter -> native scrollbar held still and moved again ->
next curved stroke. Repeat in pen/eraser/highlighter, read/edit transitions,
base/enlarged PDF, and after application restart. A new/late finger while Pencil
is down, a suppressed palm remaining after Pencil lifts, UI controls/popup
scrolling, document close and indirect-pointer input require explicit checking.

Reject this candidate if it restores inertia swallowing, cancels an existing
finger sequence, repeatedly rejects stationary first strokes, allows Pencil
pan, loses saved edits, or escapes legal bounds. Do not "pass" by disabling
scroll cancellation of unfinished ink, eviction, bounce, pinch or scrollbar.
Use lightweight bounded observations; no full-trace IO in touch callbacks.

## Root-cause claim boundary and primary references

This repairs concrete admission/lifetime contracts. The exact operation that
first caused the build-185 persistent native bounds failure is unproven; do not
turn this design hypothesis into a confirmed causal statement.

- PR #39, 183 lifecycle: https://github.com/MetroBummin/breeze/pull/39#issuecomment-5854108249
- 185/186 failure and isolation: https://github.com/MetroBummin/breeze/pull/39#issuecomment-5854452953
- Existing acceptance: `docs/decisions/009-pdf-ink.md`
- https://developer.apple.com/documentation/uikit/uigesturerecognizer/allowedtouchtypes
- https://developer.apple.com/documentation/uikit/uigesturerecognizer/numberoftouches
- https://developer.apple.com/documentation/uikit/uigesturerecognizer/ignore(_:for:)-5f685

## Local integration follow-up

This document above records PR #40's original scope and 29 checks. The combined
candidate now preserves 183–186 and adds focused lifetime regressions (33 Swift
checks). Current results and limitations are in
`pdf-input-integration-2026-09-27.md`; #40 alone must not be installed as a
replacement for that integration.
