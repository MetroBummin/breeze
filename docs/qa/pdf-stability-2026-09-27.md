# PDF stabilization and iPad 176 verification

Based on GitHub main `96de779`. Scope: document ownership, preserved page gaps
and scroll cost, existing longform add card, Pencil highlighter. Choice/block
segmentation (#2) remains excluded; its supplied-source reproduction is recorded
below. No main merge, Archive, production deployment or data reset.

## Confirmed causes and fixes

- A delayed first `getPage(1)` could publish a superseded document. Controlled
  A→B→A, switch, close and deletion tests reproduce it. Existing load token,
  session, book ID and original hash guard publication and hit-testing.
- The iPad's original PDFs use cropped nested Form XObjects. The word adapter
  ignored their BBox clipping, so excluded source words appeared on blank paper
  and entered sentence context. Intersect glyph cells with page/Form boundaries
  and reject glyph baseline anchors outside those clips. Invisible OCR remains
  eligible; shared vocabulary is retained.
- On the supplied 13-page PDF, page 9 formerly mapped a hidden `higher` over
  `perceptible`; page 13 mapped a hidden `bewildered`. Both are excluded now.
  `perceptible` is correctly hit, while the genuinely visible `higher` elsewhere
  on page 9 remains. Independent renderer word-occurrence comparisons match
  all 13 pages and all 34 pages of the other recent device PDF (47/47).
- Initial page rendering could continue under a held finger while eviction was
  paused. Cache eviction now runs during that contact, keeping its DOM target
  attached. Per-page and total retained canvas limits, completed-page PDF.js
  cleanup, serialized visible work, dropped obsolete prefetch and deferred
  sharpening bound work. All page boundaries remain cached for Pencil routing;
  page gaps and the existing native first-Pencil-during-inertia policy remain.
- `96de779` already contains `longformAddCard()`. Both pre-existing build-174
  asset trees also contained it; missing source/bundle inclusion was not proved.
  The grid path lacked the surrounding tile wrapper and a shared card rule
  overrode its dashed border. Reuse the existing Add action and match card size,
  radius and border in grid/other styles. No second import pipeline.
- Pencil highlighter adds yellow/green, 12/20 widths and 0.30 opacity using the
  existing storage and geometry. Shared stroke-opacity groups prevent seams
  after partial erasure. Settings, fragments and Undo/Redo preserve tool data;
  legacy pen records remain unchanged.

## Executed validation

- `npm test` passed; targeted ownership/ink tests: 36/36. Type diagnostics fell
  37→34 with the original baseline unchanged.
- Chromium + WebKit: crop/blank hit tests, invisible OCR hit, supplied page 9/13
  regression, held-scroll jumps in both directions, highlighter/partial eraser/
  undo/redo/reload, geometry and highlight-pixel regression.
- Highlighter actual-canvas checks: zero lightened dark glyph pixels and zero
  dark seams in the tested self-overlap; existing pen remains readable.
- Pinch: 120 pages × 12 cycles at Chromium 390/768/1180px and WebKit 390px passed.
- Longform card: empty/populated/import/reload/resize cases passed in both engines.
- Held-scroll canvas allocation: installed 175 exceeded the test's 450 MiB safety
  stop after 8 jumps (487.7 MiB); fixed code completed 15 down/up jumps at about
  60 MiB. This is canvas allocation, not total process RAM or iPad latency.
- Repeated-contact layout workload: drawn-page bounds reads in read 1×/2×,
  pen 1×/2× changed from 210/220/7547/7427 to 0/2/3/2. New mixed-ratio pages still
  require real layout updates. Frame timing was mixed; one enlarged new-page
  run retained a 331ms long task. This is not proof that all jank is eliminated.
- Native Debug 1.4 (176) built and signed successfully, installed on the connected
  iPad, version queried as 176, and launched after unlock. All 113 web build files
  hash-match native public and the installed app bundle. No Archive was made.

## Remaining boundaries

A device JetsamEvent at the reported time records about 1.75 GiB in Breeze's
WebContent coalition, but does not label that process as the killed process.
The user confirmed on 176 that clipped/incorrect/blank-space words no longer
appear, and ordinary finger upward scrolling works. Native scrollbar upward
drags still stutter; this remains unresolved on the tested device build.
Browser input is not physical Pencil/palm/inertia proof. Complex arbitrary clip
paths and inaccurate OCR coordinates are not universally validated by Form tests.

The supplied question 135's punctuated choices separate correctly. Question 157
still combines unpunctuated choices and preceding word notes: reproduced and
reported, not marked as fixed. A future structure-first block/column change must
preserve multiline options and inline grammar numbers; no circled-number regex
was added here.

## Reproduction without committing private PDFs

`npm run test:pdf-stability` runs synthetic crop/OCR/memory cases. Add
`BREEZE_QA_PDF=/absolute/path/to/the-supplied-13-page.pdf` for the exact source
regression. The source identity is checked before those page-specific assertions.
Raw device databases, PDFs and logs stay outside Git.

## Follow-up: remaining native scrollbar stutter

The requested all-process 45-second device recording disconnected after about
0.9 seconds, so it cannot explain the user's reproduced stutter. A separate
20-second app-only recording succeeded but does not establish a correlated
WebContent hotspot. No physical-device cause is claimed from these recordings.

Code and the same 34-page source browser workload did show initial rendering
continuing into word-map extraction and marker creation while no-touch scroll
jumps were active. The follow-up separates those stages: visible paper and ink
remain available, automatic word maps/markers wait for scroll quiet, and explicit
lookup can promote and await the target page. Offscreen prefetch waits too.

| Same 90-frame down + 90-frame up stream | 176 | Follow-up |
| --- | --- | --- |
| Chromium map/marker calls during down/up scroll | 81 / 78 | 0 / 0 |
| WebKit map/marker calls during down/up scroll | 90 / 90 | 0 / 0 |
| Chromium maximum sampled frame interval | 40.4 ms | 27.4 ms |
| WebKit maximum sampled frame interval | 69 ms | 38 ms |
| App scroll-position writes | 0 | 0 |
| Visible canvas + lookup ready after settling | yes | yes |

These are one-run browser scheduling observations, not iPad latency measurements.
`tests/measure-pdf-scrollbar-browser.mjs` preserves the workload and asserts no
moving automatic map/marker work, no app scroll writes, visible paper and eventual
lookup. Set `BREEZE_QA_BASELINE=1` only when measuring unchanged old code.

`npm test` and both-engine actual-source clipping/OCR/held-scroll-memory and ink
browser regressions passed again. Five additional unit cases cover explicit
lookup, stationary-finger long press, stale-document rejection, resumed-scroll
interruption and bounded failure handling. Physical scrollbar confirmation on
the follow-up device build remains pending.


Device delivery: Debug **1.4 (177)** built, signature verified, installed and
launched on the wired iPad. `devicectl device info apps` reports 177. All 113 web
build files hash-match native public and App.app/public. The user reported similar scrollbar stutter on installed 177. This optimization
is not an accepted fix for the physical symptom. Native input/offset tracing is
being used for the next investigation; no Archive or production deployment was performed.


177 native diagnostic recording (user reproduced both finger and scrollbar
stutter with tracing enabled): the 13-page landscape reader retained a constant
17,869-point native content height. During the right-edge drag, the finger moved
from y=649.5 toward y=170.5. The child UIScrollView pan changed from changed (2)
to cancelled (4) about 0.77s into the contact. Its offset then stayed at 10,814.5
while the finger continued from y=472 to y=170.5. No Pencil or ink session was
active. This proves a native cancellation in that recorded contact, but not yet
which recognizer or action caused it. Diagnostic overhead can affect ordinary
scroll latency, so these runs are not a before/after performance benchmark.


The 178 diagnostic repeated the native scrollbar cancellation on three contacts,
with the same child scroll-view identity and constant content height. No completed
DOM event had defaultPrevented=true. The scrollbar long-press and child pan both
became cancelled; other observed recognizers alone do not establish causality.
The next opt-in diagnostic records the cancellation call stack through public
KVO on gesture state. No recognizer is disabled/replaced and no new production
input behavior is introduced by diagnostics.


## Final handoff after bounded follow-up

The user requested a concise stop if a safe fix was not reached. The 179 KVO
record contains three cancellation stacks. Symbolication used the exact WebKit
UUID 71A32618-A655-38E5-BB95-C55F7F36DF48 from iPadOS 26.5 (23F77):

RemoteLayerTreePropertyApplier::applyHierarchyUpdates -> UIView._web_setSubviews
-> UIView._addSubview -> UIScrollView._willMoveToWindow ->
UIApplication._cancelGestureRecognizersForView.

This confirms native layer hierarchy reparenting as the immediate cancellation
path in these contacts. It does not yet identify the specific web-layer change
that causes reparenting. A stable compositor-boundary CSS experiment was built
as 180 but NOT installed: the concurrent browser run failed the geometry-cache
and partial-highlighter-erase assertions. The CSS was restored, tests were not
weakened, and the experiment remains only as a local audit patch. No claim is
made that both test failures were independently isolated to that CSS.

The iPad remains on 179 (177 behavior plus opt-in diagnostics). Diagnostics are
turned off for handoff. Scrollbar stutter is unresolved. Suggested next work:
correlate the native layer-tree cancellation with the precise compositor/DOM
change, then validate a stable scrolling layer while preserving native scrollbar,
Pencil, pinch, gaps and active-page rendering. Avoid further glyph-map tuning as
an assumed cure for the demonstrated cancellation.


## Bounded follow-up: experiment 1, retain existing layers (181)

Status: built, installed and launched on the connected iPad; physical finger and
native-scrollbar results are pending. No root cause or fix is claimed.

Leading candidate: `releaseOriginalPdfPage` calls `BreezePdfInk.release` (which
removes SVG), zeros canvas backing dimensions, then replaces page innerHTML when
`originalPdfContacts` is zero. Even the DOM-touch branch only preserves attached
targets; it still removes ink and hides/zeros retained canvas layers. Native
scrollbar contact may leave that counter at zero.

One opt-in DEBUG experiment (`BREEZE_PDF_LAYER_HOLD=1`): skip distant-page eviction,
skip resharpen canvas replacement, and skip retired-node removal on contact end.
Hold for the entire experimental launch, including stationary scrollbar contact;
a scroll-quiet timer is deliberately not used to infer release. New page creation,
ink mounting, toolbar/chrome, lookup scheduling and native input remain unchanged.
This isolates removal/replacement of existing page resources; it does NOT freeze
all layer hierarchy changes because initial page/ink additions remain eligible.
Existing resource limits are bypassed for this diagnostic only: use the same
13-page reproduction document. Closing/reopening the document still works.
A normal launch without the environment flag restores existing behavior.

Verification: 41 existing ink/session regressions passed. A local browser probe
in Chromium and WebKit checked no-DOM-touch jumps, old canvas/SVG identity and
canvas dimensions retained, sharpening blocked, new page displayed, and eviction
working again when the flag is disabled. This is guard verification, not UIKit
cancellation proof. Debug 1.4 (181) built and signed; all 113 www files hash-match
App.app/public; devicectl installation and launch succeeded. Existing opt-in
BREEZE_INK_TRACE=1 is active to capture native cancellation during user input.

Await the same-PDF physical result before narrowing this candidate or testing
chrome. No extra failed physical experiments have been run in this follow-up.
No main merge, code push, Archive or production deployment.


### 실험 181 사용자 결과와 재실행 조건

사용자는 최초 실험 실행에서 손가락/scrollbar가 모두 끊기지 않았다고 보고했습니다. 이후 약간의 버벅임 때문에 앱을 완전히 종료하고 직접 다시 실행한 뒤, 위로 스크롤하다 멈추는 증상이 돌아왔다고 보고했습니다.

이번 스위치는 `ProcessInfo.processInfo.environment["BREEZE_PDF_LAYER_HOLD"] == "1"`일 때만 주입됩니다. devicectl로 전달한 환경변수는 아이콘을 통한 새 실행에는 유지되지 않으므로, 수동 재실행은 실험 스위치 OFF 조건입니다. 이 차이는 기존 layer 제거/교체 경로를 지지하지만, 아직 그 안의 특정 DOM 변경 하나를 확정하지는 못합니다.

회수한 실험 진단 파일은 nativeInput 443행, cancellations 배열 0건입니다. 이는 UIScrollView cancellation 관찰 기록이 없었다는 뜻이며, 모든 입력 취소·버벅임이 없었다는 증명은 아닙니다. 수동 재실행은 trace 환경변수도 없으므로 그 이후 끊김의 새 진단 로그는 이 파일에 포함되지 않습니다.

같은 181을 동일한 layer-hold + trace 환경변수로 다시 실행했습니다. 동일 조건 재확인 대기 중이며 두 번째 변경 실험은 아직 하지 않았습니다. 기존 자원을 계속 유지하는 방식은 진단용입니다. 사용자가 보고한 버벅임의 원인은 미확정이며 이 방식 자체를 정식 수정으로 채택하지 않습니다. main 병합·배포 없음.


## Experiment 1 repeat and experiment 2 preparation (182)

User repeated 181 layer-hold: scrolling/movement continues, but first contact is
sluggish and enlarged PDFs feel substantially heavier, including rapid upward
movement. The second captured trace contains 416 native input rows and zero
observed UIScrollView pan cancellations. This supports separating the cancellation
symptom from remaining sluggishness; it does not establish its performance cause.

Experiment 2 changes exactly one guard from experiment 1: restore normal resharpen
canvas replacement. Distant-page eviction and retired-node cleanup remain held
under the same DEBUG launch flag; all other paths and trace settings are unchanged.
This tests whether holding page release alone is sufficient before narrowing the
release routine further. It is not a performance fix or accepted production policy.

41 existing ink/session tests passed. Chromium and WebKit checked old page/ink
retention during no-touch jumps, restored canvas replacement on sharpening with
ink preserved, new page visibility, and eviction restored when the flag is off.
Physical results for 182 remain pending.

182 delivery: Debug build and signature passed, 113 bundled assets hash-match www; installed version 182 queried and layer-hold + trace launch succeeded. Physical result pending.


### 제한 조사 종료 — 페이지 해제 경로가 최유력, 정식 수정은 채택하지 않음

**182 사용자 결과:** 스크롤 자체는 이어지지만 버벅임이 심합니다. Pencil 첫 곡선이 늦게 직선처럼 한 번에 반영되고, 확대 후 이동·다시 축소가 크게 지연됩니다. 회수 로그는 nativeInput 463행, 관찰된 UIScrollView pan cancellation 0건입니다. 취소 감소와 실제 사용성 회귀를 구분하며 성공으로 판정하지 않습니다.

| 실험 | 제스처/사용자 결과 | 채택 여부 |
| --- | --- | --- |
| 181: 페이지 해제 + 선명화 canvas 교체 + retired cleanup 중단 | 두 번 사용자 확인에서 스크롤은 이어짐; 각 trace cancellation 0건. 첫 터치/확대 시 버벅임 발생 | 사용성 회귀로 미채택 |
| 182: 위 조건에서 선명화 canvas 교체만 복구 | 스크롤은 계속 이어짐, trace cancellation 0건. Pencil 첫 획·확대 이동·축소 지연 심함 | 사용성 회귀로 미채택 |

**가장 유력한 후보:** `releaseOriginalPdfPage`의 페이지 자원 해제 경로. ink SVG 제거 → canvas width/height 0 → DOM 접촉이 없으면 page innerHTML 교체가 이어집니다. DOM 손가락 분기에서도 ink 제거와 canvas 초기화는 실행됩니다. native scrollbar 접촉은 DOM 접촉 카운터가 0일 수 있습니다. canvas 선명화 교체를 복구한 182에서도 취소가 관찰되지 않아, 이 교체 단독보다는 페이지 해제/retired cleanup 쪽이 더 유력합니다.

**미확정:** 위 동작 중 정확히 어느 하나가 native hierarchy 재배치를 유발하는지 분리하지 못했습니다. 페이지 자원 보관량 증가와 상세 진단은 성능 비교의 교란 요인입니다. 어느 쪽이 버벅임 원인인지 단정하지 않았으며, 추가 메모리/glyph/lookup 최적화나 toolbar 실험은 하지 않았습니다. 실제 DOM 변경과 native cancellation을 직접 연결한 증거도 아직 없습니다.

**정리:** 사용자가 정한 제한에 따라 여기서 중단합니다. 실패한 진단 코드는 로컬 audit patch로 보존하고 작업 소스에서 제거했습니다. 기기에는 182 바이너리가 남아 있으나 `BREEZE_PDF_LAYER_HOLD=0`, `BREEZE_INK_TRACE=0`으로 재실행해 기본 동작으로 돌렸습니다. 이는 179 바이너리 재설치가 아니며, 기본 모드 재실행 후 Pencil/확대가 회복됐다는 실기기 판정도 아직 하지 않았습니다. 기존 scrollbar 문제는 미해결입니다.

코드 commit/push·main 병합·Archive·배포 없음. 로컬 보고서와 이 PR 결과만 남깁니다.

## 183 renewed investigation: reclaim payloads, retain page shells

User explicitly requested resuming after the 181/182 audit. Those experiments
confounded indefinite resource retention with opt-in detailed input tracing;
they do not establish an unavoidable scroll/performance tradeoff.

Candidate source change:
- Keep eviction and existing pixel budgets. Canvas dimensions still become 0×0.
- Retain canvas and outer ink SVG; clear SVG children and release clean ink state.
  Repaint reuses both shells and reloads persisted ink. No page innerHTML reset.
- Keep resharpen replacement and word marker cleanup unchanged. No toolbar,
  lookup/glyph-map, storage schema or gesture ownership changes.
- Coalesce DEBUG trace saves and move serialization/disk writes to a serial
  utility queue. Detailed tracing still walks UIKit views when explicitly on;
  the physical performance run uses BREEZE_INK_TRACE=0.

Evidence:
- 41 ink/session regressions passed.
- Chromium and WebKit crop/OCR + 120-page fixture jump tests passed. 15 jumps
  with a held DOM touch, then 6 with no DOM contact; original canvas/SVG stay
  attached, distant backing pixels become zero, revisits render again.
  Measured canvas dimensions × 4 peaked at 47.97 MiB in the held-touch phase;
  this is not measured process/GPU resident memory.
- Ink test now asserts zero backing pixels/empty SVG on release with no contacts,
  then same-node reuse plus restored persisted undo on repaint. These assertions
  passed in both engines. The full WebKit ink suite passed, including durable
  writes, erasing, undo/redo, reopen, zoom, input separation and failed-save retry.
- Full Chromium ink suite failed the later highlighter partial-erase count.
  Serving the unmodified HEAD PDF/ink sources with the original HEAD test failed
  the same assertion. This is a baseline failure, not claimed fixed or passed.
- Pinch tests passed 12 cycles each at 3 Chromium viewports and 1 WebKit viewport.
- Debug build 183 succeeded, codesign verification passed, all 113 bundled web
  assets matched www. Logs under /tmp/breeze-183-* and copied to audit directory.

Scope of conclusion: this separates removal of outer page elements from pixel
reclamation, but does not isolate SVG removal vs innerHTML as the native trigger.
Zero-sized backing stores and cleared SVG children can still affect WebKit's
internal layers. Native scrolling, enlarged pan/zoom and first Pencil input need
same-PDF physical confirmation. No source commit/push, main merge or deployment.

183 was installed on the connected iPad and launched with BREEZE_INK_TRACE=0;
devicectl read-back confirmed installed bundle version 183. Physical user result
is pending. Relaunch behavior no longer depends on a retention environment flag.

### 183 physical follow-up: intermittent highlighter input during stress
User reports ordinary behavior is good, but repeated zoom/pan/highlighting can
enter a brief interval with no highlighter output, then recover after another
contact. Do not classify this as solved or as the old layer cancellation yet.
A bounded Chromium/WebKit test repeated zoom levels 1/1.5/2.5/1.5 with 0/30/180ms
settling delays and one synthetic highlighter stroke per cycle: 24/24 strokes
in each engine, no remaining ink busy/pinch/contact state and no page errors.
This does not simulate real Pencil delivery, UIKit inertia or heavy annotated PDFs.
The existing native gate deliberately consumes the entire first Pencil contact
while UIScrollView is decelerating. That explains a single stop-only contact, but
not a demonstrated multi-contact freeze. Asked the user which sequence occurs.
No source/input-policy or installed-build change made for this follow-up.

### 184 diagnostic preparation: horizontal escape
User clarified that the enlarged document can escape horizontally, leaving only
slivers at the left and a dark blank viewport, sometimes without recovery. The
old cache trace fetched from the iPad still had 463 native inputs/4000 rows from
182; it is not evidence of this failure. 183 detailed tracing was disabled.

A synthetic browser test injecting +500px/+400px native scroll changes during
pinch produced matching unwanted paper displacement in both engines. A candidate
using current offsets plus orphan-touch reconciliation passed that constructed
case. It is NOT established as the physical root cause. At the user's request,
the candidate was saved to /tmp/breeze-184-unverified-pinch-fix.patch and removed
from the working PDF pinch source before building 184; its test is also outside
the repo. 184 keeps 183 rendering/input policy and adds only opt-in lightweight
state sampling. Native and web geometry, ownership, gate decisions and sample
intervals are exported to Library/Caches/breeze-pdf-state.json. Reproduce first,
then fetch that file without changing the screen. Do not use the old ink trace.

### 184 physical capture, partial reproduction
User reported at least one odd scroll but could not reproduce persistent full
horizontal escape this time. Pulled breeze-pdf-state.json without restarting.
Saved to audits/pdf-stability-20260927/184/breeze-184-user-scroll-anomaly.json.
60 geometry samples plus overlapping 40-event rings captured 7 distinct
stroke/cancel events. Five had a native gate consume=true within 7–8ms of the
web cancellation (approximate wall/performance clock alignment); two had a
nearby consume=false gate. This is temporal correlation, not cancellation-source
proof, since the lightweight cancel event does not tag its caller.
One consume=false case has native beforeX=2047.5 while adjacent 2.692× samples
have scrollWidth=3176 and clientWidth=1180 (nominal maxX=1996), consistent with
horizontal edge overscroll. The other is at x=0. Neither is yet explained.
No sustained escaped layer/orphan pinch was present in the sampled rows; final
rows were zoom=1, x=0, no active ink/pinch/contact. Sampling intervals were
998–1009ms. This does not exclude sub-second stalls/escapes or prove performance.
Do not promote the browser drift candidate based on this capture. Installed 184
and diagnostics remain unchanged; no new device intervention for this result.

### 185 fix candidate based on available evidence
User requested a bounded fix without additional prerequisite reproduction.
Applied the saved pinch correction: use current native-scroll offsets for preview,
refresh preview on scroller movement, and clear an orphan pinch when a new live
contact list contains none of the old owners. Native stop-inertia behavior stays
unchanged; the partial capture does not justify removing its safety boundary.
Added cancellation call-site reasons to the lightweight diagnostic ring.

New permanent test verify-pdf-pinch-interruption-browser.mjs runs through
npm run test:pdf-pinch. It injects +500/+400px scroller movement during a 2.7x
preview and verifies the paper point stays within 1px, without scroll writes.
It verifies a remaining owner keeps the gesture and a new contact after missing
terminal events restores scale-only geometry/unlocked ownership. Both Chromium
and WebKit passed (residual error under 0.001px). The earlier unmodified source
showed approximately -500/-400px error for the same injected offset change.
These are deterministic geometry/ownership checks, not physical UIKit proof.

185 validation completed: 41 unit regressions, new interruption test in both
engines, full WebKit ink suite and 12 pinch cycles in each of four engine/viewport
combinations passed. Debug build, signature and all 113 bundled web files verified.
185 installed on the same iPad; launched with detailed trace OFF and lightweight
state trace ON, matching the diagnostic mode used for 184. Installed-version
read-back confirmed 185. Physical outcome is pending; no additional reproduction
is a prerequisite to this candidate, as requested by the user.

### 185 captured persistent escape / 186 single native candidate
Preserved full capture in audits/pdf-stability-20260927/185/breeze-185-escape.json.
In rows 15–20 horizontal x grows 2372 -> ~3170 despite width=3453 and viewport=1180
(max=2273); remains there through row 59. Native and DOM offsets agree. Zoom is
2.926157, transform scale-only, pinch null, web contacts zero, ink inactive;
outer WK scroll x/y=0 and zoom=1. Native paper pan=changed, tracking=true and
isDecelerating=true persist for ~40 seconds. Two retained web stroke cancellations
are tagged reader-scroll; late Pencil gate entries report fingerPan=true and do
not stop inertia. No sustained JS sampling gap. This is direct evidence of a
native scroll state/bounds failure, not of the earlier preview hypothesis.

186 removes per-touch ignore calls into the WebKit-owned pan/pinch recognizers
and adds pan.numberOfTouches plus event touch type/phase to diagnostics. Actual
inertia stopping remains unchanged. The mutation is a suspect, not an established
sole cause. No clamping/forced recognizer reset is added to hide the symptom.
41 ink/session unit regressions passed. Browser tests cannot validate this native
change; physical Pencil/finger behavior and disappearance of persistent escape
remain the acceptance gate.

186 Debug build/codesign passed; all 113 bundled web files matched www. Installed
and launched with BREEZE_INK_TRACE=0 / BREEZE_PDF_STATE_TRACE=1; read-back confirmed
186. Physical native input correctness and non-recurrence are pending.
