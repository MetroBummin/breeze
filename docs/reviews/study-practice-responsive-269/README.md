# Responsive isolated study practice

Actual source4feec2387e75f88f69ba2dee870c32320c64ac31. Only the added
study lesson changes its short-landscape composition; the previous carousel
pages preserve their design. Card, pause, Back, Next and Skip must remain inside
844×390, and the motion hint must not overlap the revealed meaning in all10
light/dark layouts. These assertions and the existing41-sample welcome/carousel
suite passed locally. Source/type baseline32 and native package/sync checks
passed; native interaction/signing/upload are separate.

A repeated real-touch recording exposed trustedpointerdown/pointerup with no
compatibilityclick after an unrevealed drag; waiting alone did not solve it.
The exercise now owns an unmoved primary touch release inside its card, consumes
its compatibilityclick and preserves mouse/assistive click/keyboard paths.
The regression deliberately drops one compatibilityclick while actual touch
input still reveals. Wrong/short/cancelled gestures, vertical ownership, Back,
replay, interruption/resume, reduced motion and unchanged real study data remain
checked. These screenshots/videos came from a complete final-source recording.

Candidatec7455ea is a separate frozen269 CI baseline. Its first Integrity
attempt passed RSS but failed a WebKit PDF100% progress snapshot as0 after the
wait succeeded; full browser job is being rerun with every assertion unchanged.
No initial physical iPhone exception or full-screen freeze root cause is claimed.
Separate annotation work is not included in this source. Parent owns Xcode
Cloud dispatch; main and integration have not been advanced for these changes.
Library saving is blocked by its hosted connection, so no Library IDs exist for
these new screenshots. No private mockup frame substitution is made.
