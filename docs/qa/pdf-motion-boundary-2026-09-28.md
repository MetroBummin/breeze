# Pencil momentum boundary: evidence before correction

PR #41 / Debug 187: user reports editing-mode first Pencil sometimes leaves a
dot/highlighter mark while stopping inertia. Earlier captured read-mode Pencil
scrolling is explicitly excluded by the user. No reading-mode policy change.

Debug 188 is diagnostic-only. Role assignment still uses the same gate-time
isDecelerating. Page eviction/shell reuse, pinch, pointer cancellation, native
admission masks, storage and history are unchanged.

Launch ONLY after installation/flag approval:
BREEZE_PDF_MOTION_TRACE=1, BREEZE_INK_TRACE=0, BREEZE_PDF_STATE_TRACE=0.
Read Library/Caches/breeze-pdf-motion.json; file includes build and up to 100
admitted contact rows. Select pen/highlighter before reproducing. No row is
expected for read mode or an out-of-scope/early-return contact.

For each contact compare touchTimestamp, gateUptime, the last four strictly
earlier native samples, isDeceleratingAtGate, assignedRole and offsets. A prior
decelerating/moving sample with gate=false and role=ink is a race candidate.
Frame sampling cannot prove the exact state in the interval before contact;
natural settlement between the last frame and the touch remains a confound.
Inspect sample age, offset deltas and observed mark, and do not infer residual
ownership merely from a recent scroll event or a fixed time window. Conversely
stopOnly plus a visible mark would indicate a different delivery/consumption
failure, not a role-classification race.

After causal evidence and a minimal fix, require 10–20 physical sequences across
weak/medium/strong flicks: moving first Pencil consumes its entire contact,
lift, next Pencil immediately draws. Include fully settled first Pencil as a
control. Do not label synthetic repetitions as physical trials.

No fix, diagnostic install, physical sequence count or acceptance is claimed yet.

Prepared validation: 33 existing production ownership checks pass. Signed
device-target Debug 188 build succeeds using the same Xcode toolchain as 187;
all 113 embedded web assets match www. No new web build or changes were needed.
