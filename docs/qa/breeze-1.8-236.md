# Breeze 1.8 (236) preparation

The user approved publishing the QA fix PR and preparing TestFlight build 236.
This follows the private integration recorded in
`import-durability-integration-20261005.md`; that document's 235/no-publication
statements describe the earlier integration checkpoint.

App and Share Extension Debug/Release are 1.8 (236). The post-clone Cloud counter
guard, release validator, archive directory/name and archive-version check all
require 236. Parent release coordination owns review, main merge and the single
Cloud/TestFlight build trigger. This branch does not start a native build or
request App Store review.

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
WebKit downloads were blocked by HTTP 403 locally. Native archive/device/Pencil
behavior is not established by browser tests. PR CI results must be assessed on
the published exact head; local results do not substitute for those checks.

Device checks once 236 is available:

1. EPUB: choose a personal cover, reimport the same file and relaunch. Repeat with
   None; both choices must remain.
2. Import EPUB/PDF online, relaunch in airplane mode and open originals. Read,
   exit and reopen; content and reading position must remain.
3. Add/share the same file twice quickly; keep one library entry and its position.
4. Read forward/backward in Bohemia and PDF. Home card and center percentage must
   agree; a started story opens the Reader at its saved position.
