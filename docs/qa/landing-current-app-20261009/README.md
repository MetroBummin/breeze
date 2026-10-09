# Landing aligned with submitted Breeze 1.9

## Source and scope

- PR base: main `e7b61d5304d20d639d45fc8dd23116db5d6446e5`.
- Current app reference: submitted 1.9 (253), `7bed00f9f5e1bb5cbba68f7d921081b5be7f7d65` on `integration/breeze-1.9-20261008`.
- PR132 is open/unmerged. PR136 `437fd6f006acb62097f6737e69a4a9ad292f96bb` is stacked directly on that reference and is not released. This branch is based on main and contains no PR132/136 app changes.
- Read `AGENTS.md`, `DESIGN.md`, design-only brand and sentence-result decisions, and the current reference's PDF platform and social-auth decisions. No `.agents/skills` files were present in this checkout.

The six-scene sticky story, “Stay with the story.” / “Breeze handles the rest.”,
paper/glass materials, existing teal b assets and two CTA destinations are preserved.
All production Reader, Memory, auth, onboarding, native/Android assets and release
metadata remain byte-identical to main. There is no merge, deployment or release action.

## Observed differences and correction

| Surface | Evidence in existing landing | Current app / correction |
| --- | --- | --- |
| Reader | Existing word mini/detail already uses shared styles; easy help is absent | Add an explicitly authored offline easy-help example with the existing shared material. No live AI, login or saving. |
| Sentence | Repeated English source, modal scrim, 18px translation and desktop side placement | Current Reader keeps source in the text and anchors a neutral result next to the selected sentence. Match responsive width, source-free content, 16/17px shared type and easy help; outside/Escape dismissal remains. |
| Memory | Handmade three-row device tables and staggered “arrival” imply unrestricted cross-device sync | Replace with real 1.9 search/filter/word-card PNGs; remove sync arrival/dots. Describe saved words/cards without promising full account separation or sync of all state. |
| Layout | Desktop heading is behind the device artwork; short screens overlap content | Restore a left text/right artwork arrangement within the original scene. Fit images above the 44px support anchor; short phones show the phone image. |
| Devices/PDF | Generic “anywhere” and format note offer no writing boundary | Explain web/iPhone/iPad reading and native iPad Pencil writing. Do not advertise Android availability or a Play link; Android public launch remains pending. Current code also gates unreleased native Android tablet writing, which is not a public-launch claim. |
| Login | No accurate account/provider guidance | Describe existing email link/code/password login, guest local reading, and Google/Apple preparation. Current iOS social code is browser OAuth through the system consent session, not native Apple token login; provider configuration/live consent remains unverified and is not promoted. |
| Language/theme | Root `lang` flips to English while most copy stays Korean; system dark mode is ignored | Scope `lang` to the changing Hero; use system light/dark tokens and matching image source. Cancel stale text fades when users quickly cross scenes. |
| CTA/links | Web CTA has an unused `?start=library` parameter | Link directly to the existing app root. Add a support anchor and checked local support/privacy/terms links. Existing App Store URL is retained. |

## Actual screenshots

Public `https://breeze.io.kr/landing` could not be opened with either web retrieval
or local Chromium. The environment proxy rejected the connection (HTTP 403 CONNECT;
Chromium `ERR_TUNNEL_CONNECTION_FAILED`). These are **local reproductions**, not
proof of the currently deployed page or evidence that the public service is down.
The App Store destination also could not be fetched here; only its preserved
URL, secure target attributes and CTA behavior are verified.

Before PNGs render main at the base above. After PNGs render this PR. Original
PNG output is retained individually, without image generation or compositing:

| Scene | Phone | Desktop |
| --- | --- | --- |
| Sentence, light | [before](before-phone-light-scene3.png) / [after](after-phone-light-scene3.png) | [before](before-desktop-light-scene3.png) / [after](after-desktop-light-scene3.png) |
| Sentence, dark | [before](before-phone-dark-scene3.png) / [after](after-phone-dark-scene3.png) | [before](before-desktop-dark-scene3.png) / [after](after-desktop-dark-scene3.png) |
| Memory, light | [before](before-phone-light-scene5.png) / [after](after-phone-light-scene5.png) | [before](before-desktop-light-scene5.png) / [after](after-desktop-light-scene5.png) |
| Memory, dark | [before](before-phone-dark-scene5.png) / [after](after-phone-dark-scene5.png) | [before](before-desktop-dark-scene5.png) / [after](after-desktop-dark-scene5.png) |

Current app PNGs: [Reader light](app-reader-light.png), [dark](app-reader-dark.png);
[word detail light](app-word-detail-light.png), [dark](app-word-detail-dark.png);
[sentence light](app-sentence-light.png), [dark](app-sentence-dark.png);
[PDF tools light](app-pdf-tools-light.png), [dark](app-pdf-tools-dark.png).

The four Memory PNGs used on the landing total **166,137 bytes**, with intrinsic
sizes, lazy loading, async decoding and one theme selected by `<picture>`. Source,
viewport, byte size and SHA256 receipts are in
[capture-receipt.json](../../../landing/assets/screens/capture-receipt.json).
They show the real production UI with authored local TXT/PDF and prepared Korean
lookup answers. The PDF UI uses an emulated native iPad capability signal; it
does not prove real Pencil input, palm rejection or native hardware performance.

Reproduce captures from an unchanged detached checkout of the pinned app:

```sh
BREEZE_CAPTURE_ROOT=/path/to/pinned-1.9-checkout BREEZE_BROWSER_EXECUTABLE=/usr/bin/chromium node tools/capture-landing-app.mjs
BREEZE_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/verify-landing-browser.mjs
```

## Validation

- Full `npm test` passed on Node 24.19.0.
- Typecheck passed with the unchanged main baseline of 34 diagnostics.
- Design-only boundary, original icon pixel/catalog checks, JavaScript syntax, asset stamps and `git diff --check` passed. Root app index and worker were unchanged by stamping.
- Chromium: **60 scenes + 10 support views**, 390×844 / 820×1180 / 1440×900 / 320×568 / 844×390 in both themes. Both Hero languages, system theme changes, no heading/artwork or image/anchor overlap, no horizontal overflow, 44px CTA/anchor targets, keyboard/pointer lookup and help, outside/Escape close, rapid language transitions, rotation, support anchor and all local links passed.
- Landing performed zero external requests, app-storage mutations or IndexedDB opens during the focused matrix. No user account, live provider or paid API was used.
- Local WebKit installation was blocked by HTTP 403 on the Playwright download domain. The dedicated Landing workflow retains both Chromium and WebKit checks; its original assertions are run on CI.

[Local browser receipt](local-browser-results.json) records all ten viewport/theme
cases. The PR description/checks record the final published SHA and completed CI
results separately; local results are not represented as remote CI success.
