# Breeze 1.8 (236) preparation

The user approved publishing the QA fix PR and preparing TestFlight build 236.
This follows the private integration recorded in
`import-durability-integration-20261005.md`; that document's 235/no-publication
statements describe the earlier integration checkpoint.

App and Share Extension Debug/Release remain 1.8 (236) in Git. In Xcode Cloud,
`ci_post_clone.sh` applies the valid `CI_BUILD_NUMBER` to all four build settings
before npm test and Capacitor sync. The release validator checks the expected
Cloud counter when supplied, otherwise the checked-in baseline 236. Missing,
invalid, inconsistent or incomplete settings fail rather than hiding drift.
Marketing version and signing settings are preserved. The Mac-only local archive
helper still uses 236; it is not the Xcode Cloud deployment path.

The Cloud counter is not pinned to 236: 237 and 238 are supported. Those numbers
are regression fixtures, not evidence of an uploaded or testable Apple build.
The old post-clone guard demonstrably rejects them; the actual Apple failure log
has not been obtained, so that guard is a confirmed defect rather than a verified
explanation of Apple's reported failure.

This follow-up starts from main `346cfafb37a54ba7c6608f841438f43e92e57f37`,
including PR97/98/99 and sidebar fixes. Publication and merge after passing CI
are explicitly authorized by the user. Observe the automatic Cloud build after
merge before considering a manual retry; do not create duplicate builds or
submit for App Store review. Native build success, Apple processing and tester
availability must each be verified separately.

Follow-up local validation (2026-10-05): all 17 Cloud build-number regression
cases and aggregate `npm test` passed (exit 0, Node 24.19.0). The actual post-clone
script was exercised in disposable checkouts for 236/237/238 and missing, empty,
zero, nonnumeric and decimal counters; npm was stubbed for these control-flow
checks. Valid counters updated exactly four settings and ran the three npm
commands; invalid counters changed nothing and never invoked npm. Shell syntax
and whitespace checks passed. This does not establish an Xcode archive result.

Deployment status at this checkpoint: GitHub REST and GraphQL requests returned
`Forbidden`; no authenticated Apple/Xcode Cloud capability was available in the
cloud environment. The actual Cloud build number, Apple failure log, archive
outcome and TestFlight tester availability remain unverified. Do not report the
236/237/238 fixture numbers as deployment results.

QA includes atomic original/book/image import, atomic cover edits, preserved
explicit None/latest presentation edits, same-file import ownership, Home cover
revision refresh and first-session offline originals. PR94's retained progress
callback and exact started-story routing are preserved. Sidebar animation and
RSS changes are separate and are not part of this preparation.

Final-tree local validation: aggregate `npm test` exit 0, 14/14 Chromium durability
cases, cold-offline TXT/EPUB/PDF and worker update, PR94 Home/routing browser suite,
release validator, shell syntax and whitespace checks. Generated source/www/iOS
payloads match across 195 files; cache stamp is b52a8d67. Application JS/CSS/assets
are identical to the reviewed integration 741eae5.

Local browser verification uses installed Chromium 151 with Playwright 1.63.0.
WebKit downloads were blocked by HTTP 403 locally. CI ran the import/cover suite
and passed all 14 cases in each of Chromium and WebKit. Cold-offline shell and
worker lifecycle use Chromium only: Playwright documents worker automation as
Chromium-only, and the attempted WebKit cold navigation returned an internal
error. This is an explicit WebKit offline coverage limit, not a passed check.
See [Playwright BrowserContext](https://playwright.dev/docs/api/class-browsercontext#browser-context-service-workers).
Native archive/device/Pencil behavior is not established by browser tests. PR CI results must be assessed on
the published exact head; local results do not substitute for those checks.

Device checks once the actual Cloud build is available:

1. EPUB: choose a personal cover, reimport the same file and relaunch. Repeat with
   None; both choices must remain.
2. Import EPUB/PDF online, relaunch in airplane mode and open originals. Read,
   exit and reopen; content and reading position must remain.
3. Add/share the same file twice quickly; keep one library entry and its position.
4. Read forward/backward in Bohemia and PDF. Home card and center percentage must
   agree; a started story opens the Reader at its saved position.
