# PDF input integration candidate — physical acceptance pending

## Source and preservation

Base: PR #39 `9d638c5db06e6c8aa36682690381dd2971e62e7a`.
Checkpoint commit `1a68a5d` preserves all twelve modified/untracked files from
`breeze-pdf-review-20260927.nosync`; that checkout is not reset or edited.
Local audit: `../audits/pdf-input-integration-20260927/source-checkpoint.tar`,
`local-before.patch`, `working-manifest.json`, and `git-before.txt`.
PR #40 at `bb0ef3360d9f283e086d2f4937e83fd4fdfaccd2` is integrated as a diff,
with the native routing hunk reconciled against the local diagnostic writer.
This PR supersedes #40 as an integration candidate; it does not claim #40
contained the 183–186 changes. Neither existing PR is merged or closed.

Connected physical iPad read-back: Breeze 1.4 (186). This is version evidence,
not a hash of the installed executable. The preserved local Debug app is also
186; its pdf-original/pdf-ink/pdf-pinch assets hash-match the original checkout.
The recorded 186 launch used
BREEZE_INK_TRACE=0 and BREEZE_PDF_STATE_TRACE=1; current process environment is
not inferred from that historical launch. No install, restart, flags, archive,
release build number, main, deployment or user data changed in this work.

## Evidence and causal limits

- 179 cancellation stacks identify UIKit cancellation during WebKit layer
  hierarchy updates. 181/182 held resources and changed diagnostic conditions;
  neither experiment establishes which cost dominated the latency.
- 183 retains outer canvas/SVG/loading nodes while releasing pixels, maps and
  clean ink state. Preserve that change and deferred diagnostic serialization.
- The saved raw 185 capture (also available as `/private/tmp/breeze-185-escape.json`)
  records width 3453, viewport 1180, x approximately 3170 versus nominal max 2273.
  Web pinch is null and its transform is scale-only while native pan/tracking
  and deceleration remain active. Two retained stroke cancellations name
  `reader-scroll`. This proves a persistent native/web offset failure and
  interrupted strokes in that recording, not the first operation causing it.
  That old trace did not record adjusted insets; nominal bounds are not an
  inset-aware proof. New optional samples include inset-aware min/max X.
- 186 removed per-contact recognizer `ignore` without replacing Pencil admission
  exclusion; retaining stopScrollingAndZooming alone did not preserve both jobs.
  #40 repairs that contract without restoring live recognizer touch mutation.
- Additional source defects: web touchcancel ended all pinch owners regardless
  of which contact ended; any pen pointercancel could cancel a newer stroke.
  New tests exercise both actual production paths.

## Integrated contract

Native owns native identities and actual momentum. Web owns DOM Touch IDs,
Pointer IDs, pinch preview and stroke persistence; these IDs are never equated.
The gate takes only its admitted Pencil through end/cancel. Roles are fixed until
lift, including stop-only and blocked contacts; an existing native navigation
owner cannot be stolen by a late Pencil. A held native scrollbar is not ended by
DOM touch count zero or scroll quiet. Outside-control contacts are tracked as
outside for their whole lifetime instead of becoming navigation on movement.
Older native event snapshots cannot retire newer owners.

Apply Pencil-only exclusion to paper/outer pan and pinch between sequences,
preserving original direct/indirect input masks and restoring only owned values.
Scope arrival binds immediately if idle, with deferred refresh after UIKit ends
contacts; no hierarchy walk or recognizer reset in input callbacks. No per-frame
position clamp or repeated offset restoration is added. Scroll still cancels
unfinished ink. The optional small transition diagnostic keeps reasons/roles;
serialization and disk writes retain the utility-queue writer.

Web partial end/cancel retains a remaining original pinch owner, ignores old
terminal callbacks, and releases a pinch when its own owners end even if an
unrelated new finger remains. A stroke records its Pointer identity separately
from its Touch identity so a stale pointercancel cannot erase the new stroke;
current pointercancel and real touchcancel still cancel it.

## Automated verification

- Production Swift ledger/gate/admission/routing: 33 checks pass, including a
  same-host pen → flick → stop-only → next pen → palm → two-finger partial cancel
  → held scrollbar → next pen chain. Public API doubles do not emulate UIKit.
- Actual UIKit/WebKit Simulator SDK typecheck and whole SceneDelegate parse pass.
- Existing npm test passes; pre-existing typecheck diagnostics remain reported
  by that suite's baseline policy. Ink/session unit regressions: 41 pass.
- Chromium/WebKit interruption regression passes: +500/+400 scroll during pinch,
  preview does not write offsets, orphan recovery, surviving original owner,
  partial touchcancel, stale terminal event and unrelated remaining contact.
- Chromium/WebKit 120-page fixture: 15 held-contact jumps plus six native-scrollbar
  scheduling jumps, with released backing stores, preserved shells and revisit.
  Canvas-byte peak 50,304,096 (~47.97 MiB), not process/GPU resident memory.
- Full WebKit ink regression passes: new stale/current Pointer cancellation,
  highlighter pixels/partial eraser/history/reload, document isolation, save retry,
  page release/reload and synthetic palm/finger separation.
- Chromium full ink suite fails the pre-existing highlighter partial-erase count
  assertion also documented in the 183 baseline. Assertion is retained; this is
  an unresolved automated failure, not a passing suite or native causality proof.
- Repeated pinch passes 12 cycles at three Chromium viewports and one WebKit
  viewport. The WebKit harness had populated changedTouches with survivors;
  it now sends ended identities on end/cancel, preserving every geometry assertion.

## Physical gate before accepting this candidate

No physical Pencil tests or signed integrated app build/install have been done.
Binding readiness on new scrollers, rapid read/edit/reopen, actual palm exclusion,
UIKit scrollbar arbitration, first-stroke latency, native bounce recovery and
process/GPU memory remain unverified. A pending binding consumes a contact;
repeated stationary first-stroke rejection is a failure, never an accepted UX.
No synthetic test is evidence that persistent page escape is resolved.

With installation approval, use ONE integrated candidate, ordinary diagnostics
conditions first, same PDF and same execution:

1. Stationary first curve → finger flick → first Pencil stops only → lift → next
   curve → zoom → horizontal edge/bounce → vertical travel far enough to evict
   pages → highlighter → scrollbar hold still/re-move → next Pencil.
2. Repeat round trips and zoom levels, pen/eraser/highlighter, Undo/Redo, save and
   reopen. Check resident memory settles rather than monotonically accumulating.
3. Relaunch, read/edit, reopen, old palm plus new input, and partial two-finger
   release; verify controls/popups and indirect input still work.
4. Fail on unexpected scroll cancellation, Pencil pan, repeated rejected first
   strokes, ink freeze or persistent escape. Intentional stop-only is separate.

If failure remains, correlate input role → native state and inset-aware bounds →
DOM offsets → transform → content sizes. Do not erase the scroll-cancel safety
check, retain every canvas, clamp every frame or flip recognizers to hide it.
