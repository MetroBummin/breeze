# Single 1.9.1 follow-up integration

The user requested a new TestFlight build on 2026-10-09 at 12:25 UTC, with App
Review only after reviewing TestFlight: “새빌드 ㄱㄱ 테스트플라이트보고 괜찮으면 다시심사”.
Combine the reviewed Home/Wordbook Breeze logo (PR139), AI canonical ownership
(PR140) and Text sentence ink underlay (PR141) in one isolated branch based on
main b55f3df. Publish one verified integration to main after parent release
coordination, so the existing automatic Xcode Cloud workflow starts only once.

The formal integration contract pins each immutable PR head and exact owner
files. Product code remains byte-identical to its owner; index.html combines
PR139's semantic heading with official content stamps, and sw.js changes only
its generated version. All older release/follow-up receipts remain unchanged.
Historical checks project independently verified owner bytes back to the old
baseline; they never replace current-source verification. Unrelated paths,
changed source ink/dictionary behavior, weakened article assertions or altered
native/config/release settings fail the guard. No check is disabled.

Keep version 1.9.1 and checked-in baseline counter 253. The release owner must
inspect the actual Cloud counter (last reported 257) before main publication;
CI_BUILD_NUMBER remains the counter authority. Never start a duplicate manual
Cloud run. Dict v61 is already deployed and needs no redeploy. User confirmation
on TestFlight is still required before cancelling build256 review or submitting
the new build. Store marketing-image replacement is outside this approval.

A later 12:39 UTC actual dark The Toll screenshot requires the sentence owner
to confirm the installed rendering path and colored-word overlap. Prepare and
verify the integration, but hold main publication/new build start until the
parent resumes after that investigation. A successful fixture/CI does not
establish that the physical screenshot's mechanism is covered by this fix.
