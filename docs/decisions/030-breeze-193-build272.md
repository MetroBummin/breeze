# Breeze 1.9.3(272) TestFlight packaging

The user authorized the two build271 followups and TestFlight272 on2026-10-12:
large All Words rendering/session work and background scrolling behind the
set picker. Package the final PR159 source
`bf31af5193f5a4332f40c84d2020dc7eccc9bc4f` without further product changes.
The source review includes measurements, data/history preservation, browser
regressions and explicit physical-device limitations. Gesture parameters,
onboarding, approved visuals, RSS and all historical release evidence stay exact.

App and Share Extension Debug/Release counters move together from271 to272.
Marketing version remains1.9.3. Release preflight rejects271 and lower; Apple's
CI_BUILD_NUMBER remains the cloud counter owner. The parent confirmed272 unused
at14:52UTC, with271 succeeded and no concurrent Apple build. Before promotion,
check remote integration and release state for concurrent activity; stop if272
has been used. Do not silently select another counter.

The build272 contract pins every file and mode of the tested source except the
four exact counter/preflight/archive-script deltas and three CI runner references.
Its new evidence files are individually hashed. Original build271 and older
receipts/guards remain byte-identical and run in isolated historical checkouts,
including positive and negative cases. Native packaging verifies all240 shipped
manifest files against source, the reviewed commit, www and iOS public bytes.

Final-source CI and packaging checks must pass before promotion. The unchanged
WebKit offline Blob/FileReader OCR failure from the previous release remains
unwaived; unchanged OCR paths do not trigger that workflow in this PR. No actual
native process termination was reproduced, and physical iOS picker touch,
airplane mode,56-page native restart and physical retry remain unverified.

The parent configured Xcode Cloud to build and internally distribute exact
main/integration branch pushes. This release therefore uses one fast-forward
promotion to integrate/breeze-193-cloud after verification, reports its exact SHA
and time immediately, and relies on that automatic build. No manual dispatch,
bookkeeping push after promotion, main merge or App Store submission is allowed.
Signed archive, upload and TestFlight availability remain separate Apple states;
the parent monitors those through its authorized Apple session.
