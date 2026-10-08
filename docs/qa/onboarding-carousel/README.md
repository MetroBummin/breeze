# Onboarding carousel draft evidence

Base main: e7b61d5304d20d639d45fc8dd23116db5d6446e5. Isolated branch:
`draft/onboarding-screenshot-carousel`. PR124/122 were read; no wholesale cherry-pick.
Only the approved welcome composition was preserved. Reader lookup, gestures,
auth, Memory source components, native launch, signing and release settings stay
unchanged. The previous design-only test's onboarding snapshot pins were removed
because this new revision is now explicitly authorized; its production boundaries
remain pinned, and actual onboarding behavior/geometry is covered by browser tests.

The selected option 1 PNG is Library `libfile_dc6af2d0818881918b40467fc9685787`.
Its progress is x147/y738/w96/h5 at 390×844: 18px active mark, six 5px dots and
six 8px gaps. The first video accidentally expanded the group into seven 44px
hit areas (308px). The final implementation restores the exact compact geometry
and uses Next/swipe/keyboard for accessible navigation.

Real app recordings use one authored sentence: “Every story begins with a little
curiosity.” Prepared meaning ‘호기심’, translation and easy explanation are demo
responses. PDF is generated from authored demo lines. Clips use actual Reader
lookup, chevron, long-press, Aa, SVG ink and Home/Memory owners. The pointer circle
only illustrates the recorded contact. Capture tools and receipt document the
source revision and targets. Source UI is never synthesized or rebuilt as a fake
reader. Source crops intentionally remove unrelated text/chrome from the first
four explanations; those surfaces are unchanged in the actual app.

Memory capture uses companion PR126 source 18576591a5096a217e52793c7627b699dd5bfdef
in a detached capture checkout. None of that branch's Memory CSS/DOM is included
in this branch. PDF capability uses PR128's public async `availability()` before
selecting pages, including pending Android native classification and the safe
input adapter. Until that companion lands, the verified native iPad flag is the
conservative fallback. Rejected capability queries fail closed. Existing ink data
read/write behavior is not changed by this PR.

Local Chromium onboarding and full npm tests pass. The latest source also passes
unchanged typecheck (34 diagnostics), production boundary pins and www packaging.

Visual review caught the detail scene's original y=140..540 crop cutting the
`본문 색칠` toggle (bottom 556.39) and panel (bottom 575). The refreshed light/dark
source crop is x=8, y=132, 374×450, ending at 582: the entire panel fits while the
Reader dock stays outside. Capture now verifies the panel bounds against the crop.
The final single review video includes the complete light flow followed by a
shorter dark flow; it replaces the existing Library video as a new version.
The full-flow video shows welcome → all seven scenes → Home at a narrow viewport
with native-iPad capability emulated. It is a UI review, not physical-device proof.
WebKit could not be installed locally because the download was forbidden; CI
Chromium/WebKit results must be reviewed for the exact pushed SHA.

`size-report.json` records exact on-disk MP4/poster bytes and build-www delta against
an isolated main build. These are uncompressed web bundle measurements, not an
IPA/AAB/TestFlight download claim. H264 Baseline yuv420p, silent fast-start MP4 was
chosen for inline iOS playback; no GIF or duplicate WebM is shipped. Decode memory
is not measured: only one video retains a source, and visible media/posters are
lazy. Welcome downloads no onboarding footage. Per-step theme bytes bound the
new video/poster request, while decoder buffers/browser caches remain engine-owned.

Composition references, without copying outside artwork:
- https://dribbble.com/shots/6677373-Splice-Features-Tutorial — one UI demo above a short caption, progress and Next.
- https://www.pinterest.com/pin/592645632240844954/ — spacious media/caption alignment (parent's visual scout).
- https://dribbble.com/shots/14655524-Onboarding-clean-visual — restrained pale media composition.
- https://dribbble.com/shots/11399759-App-onboarding-design-by-milkinside — dark media-first composition.

No merge, deployment, release upload or production activation performed.


## Approved 2x / 30fps media refresh — 2026-10-08

The historical draft observations above are superseded for media quality by
[30fps verification](30fps-media.md), [capture receipt](capture-receipt.json),
[player verification](30fps-player-verification.json) and [exact size report](size-report.json).
All fourteen videos and matching posters now use new production-UI frames,
with unchanged carousel layout/copy/welcome/order and original OpenStax page.
Chromium and WebKit onboarding regression suites passed unchanged locally.
No runtime/native/release code, build upload or main merge is part of this patch.
