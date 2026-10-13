# Central swipe study review

Tap reveals. Right = 기억나요; left = 다시 볼게요. Repeat rotates to the tail
without earning progress; the last card remains active. Progress is distinct
passed cards / initial cards in this session. Undo restores the last card and
response; exit/reload conceal the answer and preserve progress. Fresh study
includes passed cards again. No permanent mastery, new scheduler or word/star/
sync changes. Normal screens use direction text and Undo; rating controls remain
available to keyboard/assistive users, including focused alternatives.

Logic source: `1d77ce7a14d1a7d1732e79d6ee522c2fe5b92fcf`. Learning optics and
capture source: `f6d98aa4cf9feb6b859f87a0bfa627c8c0725327`. Separate Home/X
correction: `b33132860a0ad89bb6a7b4245c833f2b6c740d91`; it does not change the
learning screen. v2 set collections preserve unique frozen inventory, replay
responses and use monotonic tokens. Exact v1 bytes are backed up before the
first migration write; failures/corruption/future formats do not replace data.

Local targeted69 unit/storage/UI contracts, npm/type/packaging contracts,
all-word2100-card/history/reload tests, full study lifecycle/offline/failure
recovery, existing trusted set-touch, and new10-layout trusted swipe suite passed
with exit0. The new suite covers front/reveal, ungraded front drag, short return,
cancel, both directions, queue tail, Undo, last-card repeat, duplicate input,
exit/reload, completion/Undo, new sessions, reduced motion, large text/long
examples and native browser vertical scrolling. Chromium151/CDP is browser
evidence, not physical iOS. `1d77ce7` exact CI ran and passed contracts, Chromium
and WebKit study jobs; Chromium ran the new trusted swipe suite, WebKit retained
its existing lifecycle/simple-card tests. Latest-head CI is tracked in PR155.
No frozen release gate/assertion was waived. One local suite stalled while source
was changing; the final unchanged-source suite passed with a bounded service
worker readiness failure diagnostic. No baseline cause is claimed for the stall.

[Phone front](screens/phone-light-front.png) /
[revealed](screens/phone-light-revealed.png) /
[short-drag return](screens/phone-light-returned.png) /
[remember drag](screens/phone-light-drag-remember.png).
[iPad portrait front](screens/ipad-portrait-dark-front.png) /
[revealed](screens/ipad-portrait-dark-revealed.png) /
[landscape](screens/ipad-landscape-dark-revealed.png).
Full sources include five viewports, both themes, DPR2, completion and long text.

Actual recordings (no animation seeking or simulated UI):
[Phone light](videos/phone-light-swipe.mp4),
[phone dark](videos/phone-dark-swipe.mp4),
[iPad light](videos/ipad-portrait-light-swipe.mp4),
[iPad dark](videos/ipad-portrait-dark-swipe.mp4). Original WebM files remain.
MP4 is a codec conversion with no crop or overlays, not an App Store app preview.

## Store-design handoff

`store-sources/` contains12 actual front/revealed/drag captures from sourcef6d98aa:
iPhone viewport440×956/DPR3 →1320×2868, iPad1032×1376/DPR2 →2064×2752. Each
original has its exact size and SHA256 in the source manifest. There is no native
status-bar fabrication. These are source-browser captures, not a new iOS build.

`store-drafts/` contains12 RGB PNG editorial drafts using those captures as
uniformly scaled image layers. App UI is not redrawn. The user-provided measured
layout is reproduced with a white canvas, centered two-line headline,
#1B3036/#668A8A, black device frame, and no upper Breeze logo:
모아 둔 단어를 / 한 장씩 익혀요. Title ink/placement, frame, source hash and scale
are recorded. The original editable template was unavailable: Noto Sans CJK KR
Bold and the plain black frame are approximations for separate pixel review.
The source aspect ratio is preserved to integer-pixel rounding; only the device
screen corners are masked. All final drafts are RGB with no alpha. Sizes and
alpha constraints match [Apple's screenshot specification](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).

[iPhone draft](store-drafts/store-iphone-69-light-revealed.png) /
[iPad draft](store-drafts/store-ipad-13-light-revealed.png). Both themes and
front/revealed/drag variants are included; sources remain unchanged beside them.

Pending: final visual/pixel sign-off, latest-head CI, separately delegated list
optimization integration once its commit is supplied, and physical/native QA.
main/integration and268/267/266 release receipts/checkers remain untouched.
No merge, new build, Cloud start, TestFlight/App Store upload or deployment.
