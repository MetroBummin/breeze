# Breeze 1.7 (222)

Study now follows its five saved stage boundaries without five/ten-card completion screens. Old short queues continue into remaining eligible work. Selected practice runs continuously and resumes after exit. Daily caps, real FSRS due times, history and honest Again credit are unchanged.

The study surface removes the enclosing card box, duplicate batch count, inventory, per-rating result counts and redundant recall copy. Stage/day progress, saved content, four equal-weight answer buttons and actual intervals remain. Pending learning appears on completion; storage errors still stop advancement.

Easy explanation requests show a three-line skeleton in the existing lookup card. Reduced motion is static; success/error/cancellation remove it, and retry restores it. Screen-reader status and aria-busy remain. No new AI request or storage behavior.

Validation on 2026-10-02:

- Full `npm test` passed, including 63 review/highlight tests and unchanged typecheck baseline.
- Chromium and WebKit: 27 review scenarios each, including uninterrupted stage progression, legacy queue continuation, cap changes, reload, corrupt recovery and failed saves.
- Explanation loading/result at 320/390/820/1440 widths, landscape and short viewport, light/dark; success, failure, retry, cancellation and reduced motion verified in both engines.
- `npm run ios:sync` passed. App and Share Extension Debug/Release all 1.7 (222).
- Native signed Archive and TestFlight availability must be verified separately through Xcode Cloud; browser/native sync success alone is not upload evidence.

| Screen | Light | Dark |
| --- | --- | --- |
| Four answers | [PNG](breeze-1.7-222/four-grades-light.png) | [PNG](breeze-1.7-222/four-grades-dark.png) |
| Stage five | [PNG](breeze-1.7-222/stage-5-light.png) | [PNG](breeze-1.7-222/stage-5-dark.png) |
| Explanation loading | [PNG](breeze-1.7-222/easy-loading-light.png) | [PNG](breeze-1.7-222/easy-loading-dark.png) |

Release scope: merge this change into main after CI; run the existing Xcode Cloud Default workflow for 1.7 (222). #72 and #74 remain excluded. Physical-device and VoiceOver checks remain separate from browser automation.
