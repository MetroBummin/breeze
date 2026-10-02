# Breeze 1.7 (221) review

Base main `8d302df5e570192779dba09859766aa827fc9b0c`, PR #73 head
`6d071a3b3eccd39f818e9faeb05dcff3c8e6746a`. Both #73 and #74 were unmerged.
This branch includes #73 and supersedes its fixed-interval implementation.
PR #72 is excluded. No main merge or production RSS rollout is authorized.

## Implemented

- Pinned MIT ts-fsrs 5.4.2 / FSRS-6, retention .90, upstream defaults,
  1m/10m learning and 10m relearning; four honest recall ratings and exact previews.
- v3 migration retains legacy due dates and actual history with unknown memory,
  and initializes FSRS only at a real answer. Timestamp, rating, before/after
  memory and library log persist atomically with the response and unique budget.
- The same safe decoder owns reads and commits. Exact damaged/v1/v2 bytes are
  backed up before write; independent valid records survive; failed backup/write
  never advances. Recovery is announced. Future schemas are refused.
- Existing distinct daily goal, five growing stages, five-card batches, parked
  queues, explicit extra study and pending short steps remain. No overdue deferral,
  duplicate reward, fabricated answers or personal optimization.
- Static yellow aurora grows through stages 1–5; existing mascots remain.
- App and Share Extension: **1.7 (221)**. Shared Archive scheme, explicit upload
  export options and a validated Xcode Cloud post-clone pipeline.

The full [decision record](../decisions/013-vocabulary-review.md) defines accounting,
parameters, data migration and limitations.

## Evidence

- Full `npm test` passes, including 62 review/highlight cases (53 engine + 9 highlight).
  Four ratings are compared against the pinned upstream package across Learning,
  Review, Relearning and delayed returns, including serialization and actual answer time.
- Local dates in UTC, Asia/Seoul and America/New_York across spring/fall DST dates,
  next-day budget, cap changes, interruptions, v1/v2 migration and corrupted storage.
- Chromium and WebKit each pass 27 browser scenarios, including all seven damaged
  input variants: malformed JSON, null, array, number, string, v2 and partial records.
  Start → settings change → grade → refresh → resume preserves words and real history.
  Backup failure, write failure, duplicate callbacks and future schema refusal are tested.
- Light/dark at 320, 390, 820, 1440px, landscape and short viewports; >=44px targets,
  no horizontal overflow, reduced-motion static mascot/aurora and real PNG decode.
- Typecheck remains at the pre-existing 34 diagnostics (no increase).
- `npm run ios:sync` succeeds; vendored scheduler/license are included in the native
  bundle. `verify-fsrs-vendor.mjs` compares exact distribution/license bytes.
- WebKit's missing Linux system libraries were downloaded from the configured
  Debian snapshot into a temporary directory, then linked into Playwright's private
  runtime. Its dlopen host precheck could not find GLES outside the system cache;
  only that precheck was skipped. Actual WebKit execution and all assertions ran.

## Captures

| Stage | Light | Dark |
|---|---|---|
| 1 | [PNG](breeze-1.7-221/chromium-stage-1-light.png) | [PNG](breeze-1.7-221/chromium-stage-1-dark.png) |
| 2 | [PNG](breeze-1.7-221/chromium-stage-2-light.png) | [PNG](breeze-1.7-221/chromium-stage-2-dark.png) |
| 3 | [PNG](breeze-1.7-221/chromium-stage-3-light.png) | [PNG](breeze-1.7-221/chromium-stage-3-dark.png) |
| 4 | [PNG](breeze-1.7-221/chromium-stage-4-light.png) | [PNG](breeze-1.7-221/chromium-stage-4-dark.png) |
| 5 | [PNG](breeze-1.7-221/chromium-stage-5-light.png) | [PNG](breeze-1.7-221/chromium-stage-5-dark.png) |
| Four ratings | [PNG](breeze-1.7-221/chromium-four-grades-light.png) | [PNG](breeze-1.7-221/chromium-four-grades-dark.png) |

## RSS evaluation

#74 is not enabled in this build. [Actual 106-article evaluation](rss-106-20261002.md):
**17 pass / 4 reject / 73 pending / 12 errors**, with five of nine sources empty.
94 validated model responses; 99 paid attempts; known input usage $0.02104,
upper bound including missing usage $0.03449. No human gold labels, so false-rejection
and quality-improvement rates are null. User confirmed #74 is deferred. The 85 pending/error cases are unresolved, not low quality; the source/stage diagnosis is recorded in the linked report. The separately
approved temporary evaluator is disabled and its table/RPC removed. No production
RSS migration/client gate was applied, and the mismatched config ref is unchanged.

## Xcode Cloud / TestFlight

The existing **App / Default / Archive - iOS** main check is successful:
[existing Cloud build](https://appstoreconnect.apple.com/teams/39091a3f-cb93-4b26-95f6-b3a372956334/apps/6804570182/ci/builds/1f88be4e-225e-4445-8cb5-0ecda9a43f7d).
The current environment is Linux; native Archive/signing cannot be claimed from
`ios:sync`. GitHub exposes Cloud status but no App Store Connect execution token
or workflow edit tool is connected. PR #73 had no Cloud check.

Select this PR branch in the existing Default workflow, Archive App for iOS and
its existing TestFlight post-action. Ensure the Cloud build counter is **221**;
Cloud can override project CFBundleVersion. Post-clone fails if its counter differs,
runs the full tests, and syncs Capacitor before Archive. Confirm processing in
TestFlight for app `6804570182` / `kr.io.breeze.app` / team `YQA5DP2KLZ`.
Do not merge main merely to trigger the workflow.

On a signed-in Mac, `npm run ios:archive` creates an archive and
`npm run ios:testflight` validates, archives and uploads it. Optional ASC API key
inputs are paths/environment selectors; no credentials are committed or printed.
The script refuses an existing archive instead of silently replacing it.

## Risks and recommendation

Recommend #73 + these changes for 1.7 TestFlight validation after a successful
signed Cloud Archive. Physical iPhone/iPad, VoiceOver and TestFlight processing
remain unverified until that run. Concurrent multi-tab localStorage writes are not
compare-and-swap; long histories/backups can exhaust storage (writes visibly stop).
No cloud FSRS sync or personalized optimizer is introduced. Legacy memory is
unknown, so migrated cards may need short learning again.
