# Breeze 1.9.3(271) TestFlight packaging

The user authorized the next TestFlight upload on 2026-10-12. Package the exact
tested PR158 source `78967ed9f61091f25fa42a9df0eebdb11e770e82`: readonly All Words
rows, durable study handoff, set-detail ellipsis, study/custom-set gestures and
PDF under-minimum elasticity. No product code, media or test behavior changes
are part of this packaging step. Separate RSS work remains excluded.

App and Share Extension Debug/Release counters move together from270 to271.
Marketing version remains1.9.3. Release preflight rejects270 and lower; Apple's
CI_BUILD_NUMBER remains the owner of the dispatched cloud build counter. The
parent verifies live Apple counter availability and is the sole dispatcher.

The build271 contract pins every file and mode of the reviewed source except
the exact counter/preflight/local archive-script updates and three CI runner
references to the new guard. Historical guards and receipts stay byte-identical.
The existing post270 guard runs in an isolated checkout of its reviewed commit,
including the unchanged nested build270 and older positive/negative contracts.

All16 reviewed-source workflows are terminal:15 passed. The sole WebKit offline
OCR NotReadableError result exactly matches the shipped baseline and remains
unwaived. Chromium/WebKit study and motion suites, Integrity and unsigned iOS
compilation passed. Native two-finger/120Hz feel, Pencil/scroll coexistence,
airplane mode,56-page native restart and physical retry tap remain unverified.

The parent owns manual Xcode Cloud dispatch, signed archive/upload and actual
TestFlight availability checks. This repository preparation dispatches nothing.
No main merge or App Store review submission is authorized.
