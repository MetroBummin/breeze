# All Words and picker followup to build271

Baseline product: `dfdbbab45e798aabca7f64133eb170265b96a7de` (shipped 1.9.3 build271). Scope: the reported large All Words slowdown/termination and scrolling behind the set picker. No vocabulary deletion, schema change, limits, gesture tuning, visual redesign, onboarding, RSS or main merge.

## Observations and changes

The baseline synchronously creates/binds every All Words row and retains the whole list during study. Session validation uses repeated linear membership searches, yielding quadratic work. The same synthetic vocabulary workload (long examples, multiple meanings, no CPU throttling, Linux Chromium) measured:

| Meanings / words | Before next paint | After next paint | Before mounted row descendants | After descendants |
| --- | --- | --- | --- | --- |
| 2399 / 2294 | 850 ms | 83 ms | 20856 | 210 |
| 6000 / 5400 | 1787 ms | 158 ms | 49800 | 210 |
| 12000 / 10800 | 3881 ms | 466 ms | 99600 | 210 |

At 12000 meanings, validation samples fell from approximately 104–135 ms to 2–4 ms; answer reveal from 134 ms to 6 ms. The complete 12000-card queue is retained. During study, the All Words DOM now contains zero rows (previously 10800). Timings are individual browser runs, not device benchmarks. JS heap readings vary with GC and do not establish a native-memory reduction. No JavaScript error or renderer crash reproduced; the user's physical termination may be a WebView/process kill, but no native termination log is available.

The fix windows only the read-only All Words projection, reuses the approved row markup and expansion state, measures variable heights, preserves logical numbering and keyboard traversal, releases the window on departure, and uses Set membership without changing validation semantics or serialized sessions. Closing the modal now hides the background wordbook before dialog focus restoration, avoiding a full background layout on the transition.

The picker previously had no explicit document scroll owner. Chromium already contained the tested wheel/touch gestures; this report does **not** label that baseline as a reproduced physical iOS failure. The modal now owns a fixed document body and restores its exact prior position on dismissal, back, navigation or page transition. Its own scrollable list and nested book choices remain scrollable. A separate CSS class leaves other overlay locks intact. WebKit CI uses the exact shipped tree for baseline measurements; physical iOS touch remains unverified here.

## Evidence and regression coverage

Raw [before](before/chromium.json), [after](after/chromium.json), [picker baseline](before/picker-chromium.json), [picker after](after/picker-chromium.json), [window checks](after/window-chromium.json) and [picker checks](after/picker-checks-chromium.json) accompany selected phone/short light/dark captures. The test suite also captures tablet and desktop in both themes.

New browser checks cover all 2294 ordinals through the last word, 2399 meanings, multi-meaning long-example expansion/remount, 110 consecutive keyboard rows, arbitrary deep jumps, exact return scroll, Again/Remember/reload, unchanged vocabulary and legacy bytes, top/bottom overscroll, header/backdrop, nested book scrolling, Escape/back/full-page transitions, rapid reopen, another overlay's lock and a real imported long-book reader. Existing study-motion tests continue to exercise unchanged swipes, durable handoffs and PDF elasticity. Storage/quota/migration tests remain active.

The new workflow measures before and after on Chromium and WebKit, then runs the functional regressions. Local Chromium results do not prove physical WKWebView interaction, a jetsam fix, or TestFlight availability. Release272 packaging and its exact-source receipt follow only after final source validation. The unrelated baseline WebKit offline Blob/FileReader OCR failure is not waived or modified.

WebKit CI confirmed the before/after speedup and the new picker/window tests. It exposed stale height estimates when Tab follows expansion before ResizeObserver delivery; keyboard navigation now measures first and explicitly mounts its destination. A same-task regression checks this case. The existing motion test also found a Linux WebKit WAAPI flight still pending at time zero after a260ms wall-clock timer. The test now awaits the actual animation completion with a hard timeout while the durable save remains held; the same offscreen assertion and unchanged motion controller remain in force. Final-head CI is required after this test correction.

The broader simple-card browser test also pressed Back before an asynchronous opening completed, after reading an old hidden progress label. This reproduced in local Chromium. The test now requires the actual study view, completed resume and All Words history marker before exercising Back/Forward. Product navigation and cancellation ownership remain unchanged.

A subsequent WebKit run found the same wall-clock assumption in queued row-collapse presentation and a PDF touchmove's pending animation frame. Those assertions now wait for the actual completed presentation with a three-second limit. The PDF post-resize fixture also began its next pinch with the preceding viewport width still applied (436px rather than386px); the logged asynchronous anchor landing moved scrollTop32 to504 during that next gesture. Its setup now requires the actual requested viewport, observed geometry and completed page rendering before starting the post-resize pinch. Active-pinch resize cancellation, scale, exact scroll and row-count assertions are retained. No PDF or gesture product implementation changed, and this fixture correction does not establish immediate post-rotation physical input behavior.
