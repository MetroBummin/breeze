# 1.9.1 single follow-up integration — 2026-10-09

Base main: b55f3df241607c95855a53009aceaa903e1da164.

| Owner | Immutable final source |
| --- | --- |
| PR139 — Home/Wordbook Breeze logo | 63c79d28e850b5e0c21c67be38e98641aa2390ef |
| PR140 — AI canonical server/client | da0d935098c89a0d4482bd8d65463c93690ebf4d |
| PR141 — sentence Text ink + article completion fixture | 902af5c3544b94e6b9c2787559aea5a4b76cd33e |

PR141's current source includes the parent-reported 4de9bc1 boundary commit
and a later deterministic article-test completion-wait repair. All nine
workflows on the remote current head are successful. The reviewed sentence
freeze 9f292c1 remains identical for its runtime, workflow and browser evidence.
The article test retains its original assertion and all bytes except one wait.

The merge conflicts affect boundary metadata/verifier and generated worker
version. Owner product sources have no conflicting edits. Regenerate the formal
receipt and content stamps with node tools/record-191-followups-boundary.mjs,
then execute node tests/verify-integration-boundary.mjs. The receipt pins exact
owner bytes, historical receipt equality and integration verification evidence.

Final combined local tests, browser evidence and terminal final-SHA CI are
reported in the integration PR/handoff. Original owner screenshots and source
investigations remain in PR139/140/141; browser pixels do not establish physical
iOS/WKWebView/VoiceOver or production semantic accuracy.

Local combined checks completed before publication: full npm test (32 existing
type diagnostics, no increase), eleven rejecting boundary mutation probes and
restored-boundary pass, Home/Memory/Wordbook responsive browser regressions,
word canonical arrival/recovery/presentation, 28 same-condition Chromium Text
ink cases on both original main and combined source, native asset sync/package,
native worker exclusion, and original platform icon asset verification. All 60
sentence inline states/lifetime interruptions (66 screenshots), sentence cue
and article preview/cache/fallback/Reader at four sizes passed. The article
check initially could not start the browser because its local executable-path
variable differs from the other tests; setting its documented existing variable
ran only that check successfully, without a source/test change. Local WebKit and
Xcode are unavailable; final integration PR CI runs both engines and the existing
unsigned Simulator compile. Logs and captures: /workspace/breeze-191-integration-proof/.

Version/native/release/Cloud hooks stay identical to main. Server dict v61 is
already deployed; no paid provider calls or server redeploy is needed. One main
publication is held for parent release timing coordination. Before that update,
the release owner confirms current Cloud counter/workflow state. No automatic
plus manual duplicate archive, marketing-image replacement or App Review action.

At 12:39 UTC the user supplied an actual dark The Toll screenshot with lower
contrast selected sentence text overlapping existing colored words. The parent
requested another owner investigation of the actual rendering path/overlap.
This is not evidence of a regression in the new source, which has not shipped.
Keep main publication and new build start held until that investigation and
the parent's explicit resume notice, in addition to release timing/counter
coordination. The provider-free source-ink fixtures do not resolve this new
physical/saved-word overlap report by themselves.
