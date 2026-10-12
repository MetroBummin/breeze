# App family scene QA on PR155

Base: `58f4839919dcf4c3744c73e46ca6fc5843fa9dc7`. Performance (`ab8cd85a5b5a6050d4435c5f26eb11915c3f510b`) and QA are
independent commits on `perf/study-set-summary-qa-268`, intended for the parent to
cherry-pick. The existing `ui/safari-optical-controls-268` branch is untouched.
No merge, deployment, native sync or new deployment/native build was performed.

## Coverage added

The former unconditional skip of a non-visible selector is gone. Every scene has
explicit required-visible and required-hidden selectors in
`tests/helpers/app-icon-family-scenes.mjs`. A missing required target, duplicate
visible target, unexpected visible target, or unknown scene fails. Intentional
absence (for example directory Back) is recorded as hidden, instead of disappearing
from evidence. Four negative tests prove the previous folder-summary omission,
closed/open substitution, unexpected Back, early answer and duplicate reveal
cannot pass these contracts.

The fixture uses a real selected user folder with the imported TXT assigned to it.
Its `.library-folder-menu>summary` appears in all **10** device/theme pairs. Both
closed and open menus are captured; Tab reaches Rename/Delete, and Escape returns
focus to the summary. The study fixture captures detail More, open menu, front,
revealed answer and completion using the current four-card reveal/grade behavior.
It checks Enter activation, menu Arrow/Home/End focus, Escape focus return,
front/revealed focus, Tab to both grade actions and keyboard grade activation.
Reduced-motion menu open/close must settle immediately without an animation.

[chromium.json](chromium.json) contains **170 scenes**, explicit visibility results,
geometry/material values, limited interaction checks and zero page errors. Sizes:
390×844, 820×1180, 1180×820, 1440×1000 and 844×390; both themes, DPR2, Chromium
151.0.7922.173 on Linux. The 18 committed PNGs include all 10 open-folder scenes
and both-theme phone front/reveal/completion/More. The full 39 MB scene/crop set is
in `/tmp/breeze-app-family-qa-chromium` and can be reproduced with the command below.
This is browser evidence, not native iOS or physical-device proof.

The existing exact SVG dimensions, stroke/cap/join and 1.01px centering assertions
remain. A new More-dot assertion uses the current 1.6px radius. No existing
study, touch, storage or frozen268 assertion was changed. The capture and trusted
touch fixtures now explicitly read durable storage before their initial commit;
they no longer depend on the removed hidden startup-render side effect. This suite checks label
strings and the stated keyboard/motion behaviors; it is **not a full accessibility
pass**. Screen readers, contrast auditing, physical keyboards and native focus
behavior were not tested.

## Run status

| Check | Result |
| --- | --- |
| Existing core/storage/UI study tests | PASS, 65; existing assertions unchanged |
| Typecheck | PASS; 32 existing findings, no increase |
| Full `npm test` | PASS, exit 0; [npm-test.log](npm-test.log) |
| Before/after 1/10/50 list fixture and cross-tab/reload/quota retry | PASS; [performance report](../study-sets-list-20261012/README.md) |
| New scene negative tests | PASS, 4; [scene-contracts.log](scene-contracts.log) |
| Chromium app scene/capture/focus/motion matrix | PASS, 170 scenes |
| Existing Chromium study lifecycle / offline cold restart / 10 layouts | PASS; [study-browser.log](study-browser.log) |
| Existing trusted Chromium touch suite | PASS; see [study-touch.log](study-touch.log) |
| Frozen268 `044f9ff` verifier + negatives + historical 267/266/192/191 | PASS; [frozen268.log](frozen268.log) |
| Same frozen verifier on PR155 base and this follow-up | EXPECTED FAIL outside frozen boundary, `Unapproved build268 path: DESIGN.md`; unchanged guard, [base log](pr155-boundary-failure.log), [follow-up log](followup-boundary-failure.log) |
| WebKit app family launch | BLOCKED before any scene: required executable missing; [launch log](webkit-launch-failure.log) |
| WebKit browser installation | FAILED, HTTP 403 on standard CDN, Microsoft mirror and Azure mirror; [standard/mirror log](webkit-install-failure.log), [Azure log](webkit-azure-install-failure.log) |
| WebKit scene/focus/motion/learning runs | NOT EXECUTED; no WebKit pass is claimed |
| Exact final GitHub CI, native iOS/Safari, deployment/build | NOT EXECUTED |

After hidden startup was deferred, the first capture/touch reruns failed in fixture
setup with `Study sets changed. Reopen and retry.` The fixtures had committed without
reading storage, relying on the old invisible initial render to establish the read
token. Explicit fixture reads fix this; the durable unread-state rejection and all
assertions remain unchanged. Successful final reruns are reported above.

The first existing study-browser run was interrupted with exit 130 after it stopped
making progress. Full `npm test` was stamping content hashes concurrently with that
run; an isolated service-worker diagnostic subsequently reached `ready`. A fresh
unchanged study-browser run after stamping completed passed, including cold offline
restart. Concurrent stamping is a plausible cause, not a proven diagnosis. The
passed rerun is the evidence above; the interrupted attempt is not counted as a pass.

## Re-run and integration

```sh
BREEZE_BROWSER_EXECUTABLE=/usr/bin/chromium BREEZE_FAMILY_OUTPUT=/tmp/breeze-app-family-qa-chromium node tests/capture-app-icon-family.mjs
BROWSER=webkit BREEZE_FAMILY_OUTPUT=/tmp/breeze-app-family-qa-webkit node tests/capture-app-icon-family.mjs
node --test tests/verify-app-icon-family-scenes.mjs
```

`npm run test:app-icon-family` runs the negative tests and requires both engines,
writing their evidence to different directories. Missing WebKit is a failure;
the command does not silently skip it. In this environment the component commands
were run separately so successful Chromium evidence remains distinguishable from
the blocked WebKit attempt.

The QA helper deliberately does not assert a progress label/denominator or a swipe
threshold, nor modify either implementation. The other worker owns the new progress
and Tinder learning contracts. If that implementation changes reveal/grade selectors
or keyboard targets, adapt only `captureAppFamilyStudy` and its explicit scene
contracts after integration, then run both engines and recapture. Keep strict
visible/hidden checks and the existing dedicated domain/touch tests.

The independently approved Home settings 4px alignment and circular word-add X
background are outside this branch. Their integration can change geometry/material
baselines; re-run the same capture command after those commits. If an approved
control changes its optical center, update that control's explicit expected value
with evidence rather than relaxing all centering, size or stroke checks. Current
captures describe the PR155 base geometry, not those future visual changes.

The performance commit overlaps only directory refresh/summary call sites in
`scripts/ui/study-sets.js`, plus generated `index.html`/`sw.js` content hashes.
Resolve overlapping file edits at those call sites, preserving the other worker's
`renderStudySetsStudy` and gesture owners, then regenerate stamps and re-run tests.
QA changes are separate helper/capture/package/evidence files. Do not regenerate or
weaken the frozen268 receipt; this branch is not a frozen268 release candidate.
