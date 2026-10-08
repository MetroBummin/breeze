# Breeze 1.9 integration checkpoint

Isolated checkout: `/Users/kosangbum/Documents/Codex/2026-10-08/task-4/release-integration`.
Branch: `integration/breeze-1.9-20261008`. Final local candidate after offline artwork repair: **1.9 (247)**. Build 246 remains preserved as an earlier candidate.
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

## Final offline artwork repair

Final PDF source `2dd2384` initially failed Integrity and failed the single browser-job retry at the same WebKit Red-Headed League anchor (saved 174, visible 193). Investigation found that `img.onerror` removed failed bundled illustrations without preserving a source anchor. The exact removal path was reproduced with browser automatic anchoring disabled: paragraph 174 moved to 184. The repair explicitly captures/restores the current source anchor around removal, including pending initial restoration. The same probe now retains paragraph 174. A strict additional assertion covers this path for every Holmes story; the original real offline paragraph assertion is unchanged.

A new archive uses build 247, above the actual locally preserved 246 archive, without claiming ASC reservation or Cloud counter uniqueness. No source paragraphs, stored IDs, auth, PDF tools or other onboarding media change in this repair.


## Cloud CI timeout correction (2026-10-08)

On validation source `556f539ca598f8f5912040e8d43217fde5a66556`, Integrity
[run 37738471453 / browser job 113183526533](https://github.com/MetroBummin/breeze/actions/runs/37738471453/job/113183526533)
ran from 06:37:45 UTC to the cancellation at 07:07:51 UTC. Full decoded logs
contain no assertion failure, ERR_ASSERTION, TimeoutError or failed test; the only
error annotation is `The operation was canceled.` Steps 1–33 succeeded; sentence
help/lifecycle step 34 was cancelled, proof upload 35 succeeded, and saved original
reopening step 36 did not run. Step 34 began at 07:06:24 UTC and was still making
progress through WebKit cases when the job budget expired.

Only Integrity's browser job timeout increases from 30 to 45 minutes, providing
15 minutes for the remaining checks and runner variability. Every test, assertion,
step condition and other job budget is preserved. Final-head CI results will be
recorded in PR #132 after completion.

Source comparison against signed archive source
`7490ba3457acd8771d8100319be3a837448e5f2d`: the only paths changed before this
correction were `tests/verify-onboarding-browser.mjs` and its
`docs/qa/breeze-1.9-integration/boundary.json` receipt. This correction adds only
`.github/workflows/integrity.yml`, its exact boundary hash and this verification
record. Runtime source,
assets, native projects and version/build metadata remain byte-identical. The
existing 1.9 (251) archive remains the runtime build; no new build number or
archive is needed for these test/CI/documentation changes. Archive creation,
signing, upload, review submission and main merge are outside this task.


## Build252 Social import installation budget (2026-10-08)

On archive source `a342409f84fca61fd1474ed8afe985fdfaac6c04`,
[Social import run37762299205 retry job113269076646](https://github.com/MetroBummin/breeze/actions/runs/37762299205/job/113269076646)
started10:36:49 UTC and was cancelled10:49:33 UTC while downloading Ubuntu
packages for `playwright install --with-deps chromium webkit`. Setup, npm install,
type check and server contracts passed. Browser, ingestion and full npm tests
were not run; there is no assertion failure in the retry log.

Only the verify job budget increases from12 to25 minutes, the lower authorized
budget, to accommodate the observed installation delay and remaining suites.
Every test command/assertion/condition and the live-media job remain unchanged.
The integration receipt pins the exact workflow change and its previous hash.

Runtime, assets, native projects and build metadata remain identical to the
preserved signed1.9(252) archive source. No new archive or upload is performed.
Exact updated-head CI must complete before parent-coordinated upload.


## Approved complete onboarding media integration (2026-10-08)

Source `981bd754c2b983af2029ee9e45dfb083ecdb8680` replaces14clips and14posters
with the user-approved 2x/actual30fps versions. Capture/provenance tooling and
documentation are included unchanged. The boundary receipt pins the new exact
asset/decision/tool hashes and retains previous hashes where present. Production
JS/CSS, UI text/layout, welcome animation, auth and native/version metadata remain
byte-identical to `2dec555`. Existing1.9(252) has no distribution/upload event;
rebuild252 under a distinct source-named archive path, preserving the old archive.
Full/type/media/onboarding/pending-pinch/native-asset/signature checks and final
exact-head CI are required before the authorized TestFlight upload. No main merge
or App Review submission is permitted.
