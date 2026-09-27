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

188 capture from the connected iPad: 32 admitted Pencil contacts; 19 stopOnly
have a moving/decelerating pre-contact sample and true gate deceleration, and
13 ink have settled pre-contact samples and false gate deceleration. No observed
misclassified motion-to-ink contact. Raw SHA256:
87aabcbb299ec1e0cc50b75814b3d4b9c2b787d8706409a56b7e660cdfbb3b6a.
The source trace is preserved outside the repository at
`../audits/pdf-input-integration-20260927/188-motion/captured-motion.json`.
The 32 records are diagnostic contact classifications, not 32 user-verified
absence-of-mark trials.

The next candidate changes only stopOnly gate arbitration: canPrevent becomes
true while that exact native contact is owned. Blocked contacts during finger
navigation remain unable to prevent competing recognizers. Test with ordinary
diagnostics OFF, varied flick strength, 10–20 first-contact stops and immediate
second-contact strokes; include highlighter and a fully settled control.

Debug 189 was built for the connected physical iPad from the main-based fix
branch. The signed 1.4 (189) app includes all 113 matching web assets, and the
production Swift ownership checks pass 35/35 with UIKit/WebKit SDK typecheck.
It was installed and launched with BREEZE_PDF_MOTION_TRACE=0,
BREEZE_INK_TRACE=0 and BREEZE_PDF_STATE_TRACE=0. User-operated physical result
FAILED: the first Pencil still left a mark. With targeted diagnostics enabled
on the connected iPad, two reproduced native contacts were both classified
stopOnly during moving deceleration. Each then entered the web stroke/start and
stroke/end path. Evidence and hashes are in
`../audits/pdf-input-integration-20260927/189-failure/reproduced-findings.md`.
This is native-to-web ownership leakage, not a demonstrated gate-time motion
classification race. No additional 189 input experiment is needed.

The next candidate requires a native reply before web ink starts. Check the
real production native role code, SDK typecheck, WebKit browser blocked/ink
reply cases, app build and exact embedded web assets. Then install one normal
diagnostics-OFF build. User physical acceptance remains: 10–20 weak/medium/
strong flicks, first moving Pencil stopOnly with no mark through lift, immediate
second Pencil ink, plus stationary first Pencil and highlighter controls.
Automated, SDK and installation checks must not be described as this physical
result. Keep the PR Draft and do not archive until the user confirms the device
trial.

Debug 190: native-to-web admission candidate built and signed for the connected
iPad. Native ownership checks 36/36, UIKit/WebKit SDK typecheck, 41 PDF unit
tests and the full WebKit synthetic ink suite pass. The signed app contains
113/113 matching web assets. Installed and launched with all PDF diagnostic
flags unset. Physical stopOnly/next-ink acceptance is awaiting the user's
device run; installation is not acceptance. The first Xcode attempt in the
Desktop audit directory failed at codesign because file-provider metadata was
added to its output; a fresh local /tmp derived-data build succeeded.

Prepared validation: 33 existing production ownership checks pass. Signed
device-target Debug 188 build succeeds using the same Xcode toolchain as 187;
all 113 embedded web assets match www. No new web build or changes were needed.
