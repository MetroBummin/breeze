# Breeze 1.9 integration checkpoint

Isolated checkout: `/Users/kosangbum/Documents/Codex/2026-10-08/task-4/release-integration`.
Branch: `integration/breeze-1.9-20261008`. Local candidate: **1.9 (246)**.
No main mutation, deployment, upload, TestFlight or App Review action occurred.

## Integrated source heads

- PR #126: `9afbaf499ed3a747d839e982a8dca4704bb9f7fe`
- PR #127: `e388efd509a47361fcc201faa73282c2dab0e0f9`
- PR #128: `1f7a70e2d39094c91a579b73c4b7a7fcd6927f1c`
- PR #129: `116d3adda261e9dd9e13223b30abcde155f8a4ad`
- PR #130: `8b91fa076fbb3c4d31054acd52aac80e6cbe3200`
- PR #131: `9bf7f4e1d0f977021b7c4bdd3d5d6e055935d5cb`

PR130's final two commits change browser fixtures only. PR128's final head
removes the selected-tool underline and preserves icon color and chip rings.
Original owner scope guards remain unchanged; combined boundaries verify exact
single-owner bytes, reviewed shared files, all paths and unchanged source text.
Integration fixes document-capture keyboard ownership after Mac WebKit touch;
auth fixtures use the real completed marker and wait for actual sheet transform
completion. Auth production code equals PR127; providers remain disabled and
external setup unfinished. No Android signing material or task-2 was touched.

## Completed verification

- Full `npm test`: passed, including rerun after auth artwork/keyboard correction.
- Typecheck: passed with 32 existing diagnostics; no standalone lint script.
- Diff whitespace, combined boundaries, native package exclusions/worker guard:
  passed. Owner auth-only and onboarding-only guards passed on exact snapshots.
- Chromium/WebKit: onboarding, availability gates, device polish, Pointer pen,
  deferred resources, 13 Homeward preparation races, all five Holmes stories
  (2,181 paragraphs), Memory geometry, updated PR130 fixtures, auth artwork and
  actual bundled-SDK callback/session/reload fixtures passed.
- Chromium deferred cold-offline import/cache transition: passed.
- Production Foundation auth URL policy: 36 checks passed.
- Xcode 27 unsigned Simulator build and signed Release build: passed.
- Signed intermediate app: `/tmp/breeze-1.9-20261008-derived/Build/Products/Release-iphoneos/App.app`.
  Verified bundle `kr.io.breeze.app`, 1.9 (246), deep/strict signature and all
  226 packaged files matching `www`; Share Extension embedded as in baseline.
  This build predates the last icon-only selection commit; it is intermediate.
- Release initially failed because File Provider added FinderInfo to generated
  bundles. Using `/tmp` derived data resolved it; no credential changes.
- Final icon-only selection focused browser results: see task `browser-results.txt`.

## Remaining work / verified blockers

Final PDF media captured directly on the Mac from the verified OpenStax source. Only PDF clips/posters changed; source footer and all other scenes are preserved. Credits and capture limits are in `../onboarding-carousel/pdf-media-credits.md`. Final archive validation follows native sync. Active checkout is `/tmp/breeze-1.9-integration` because Documents File Provider stalled reads.

Previous-main Holmes worker migration **passed on settled sources**: real e7b61d5
old Reader remains active through update, then the new complete worker shell
opens cold offline with all five unchanged books/covers/fingerprints and anchors.
PR130 8b91fa0 is fixture-only and its focused WebKit suite passed.

Initial integration CI contracts and design iOS compilation failed before tests
because checkout depth 1 omitted the explicitly pinned base commit. Their
checkout now fetches history; scope assertions remain unchanged. The earlier
deferred WebKit failure is addressed by PR130's exact fixture update.

Mac UI was locked when inspected, so current ASC build uniqueness remains
unverified. 246 is a local candidate above observed 245, not a reserved or
guessed Cloud number. Verify actual ASC metadata before any later upload.
Physical devices, OS consent, distribution export and App Review are not run.

Task-level logs and receipts live one directory above this checkout, including
`npm-test-final.log`, `browser-results.txt`, `signed-release-evidence.json`,
`ios-build.log`, `ios-release-build-retry.log`, PR checkpoint JSONs, and packaged
asset evidence. File Provider's identical untracked `config 2.xml` is preserved
and locally excluded; it is not committed.

User requests continuing with GPT-6.1 Sol and no further scope expansion.
