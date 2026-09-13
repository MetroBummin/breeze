# Touch zoom integration QA — 2026-09-13

Status: PDF integration and the Reader viewport-zoom ownership fix are complete. Physical-device reproduction remains outstanding. No push or merge.

## Baseline and scope

- Main: `d1a0e4ddb9380312387925bc91c2ebd4bada498a`.
- Source reviewed: `f140503bd1ab4c214007cce2f29b383ef45bbc9f`, including its pinch QA and architecture.
- Working branch: `codex/touch-zoom-integration` in a separate clean clone. Existing local main and pinch checkouts are untouched.
- Earlier `58972f0` replaced pinch with controls. The prior implementation changed scroll/layout during movement; the architecture records iOS viewport/scroll-anchor jumps. The selected implementation avoids those writes, retains touch targets and rejects stale mode landing.
- Selected touch-only code. No Ctrl+wheel, desktop trackpad handling, pointer-device policy, or new zoom UI.
- `originalZoomLevel` is shared by pinch and existing Aa +/- controls; limits 1–4, existing step 0.5. Preview uses rAF transforms; all-fingers-up commits geometry once. Aa reflects the committed percentage.
- `modules` remains in `tools/build-www.mjs`; a regression assertion guards inclusion.

## Automated evidence

- `npm test`: passed (type baseline 45 → 40; ownership 200 repetitions; sheet lifecycle 60; sentence, EPUB geometry, words, READY checks).
- `npm run test:pdf-pinch`: passed Chromium 390×844, Chromium 768×1024, WebKit 390×844, each with 12 in/out cycles and a 120-page mixed-aspect PDF. Chromium uses trusted CDP touch; WebKit uses synthetic DOM touch events and does **not** validate native iOS recognition.
- Repeated execution caught a deferred-script startup race: ResizeObserver could call pinch cleanup before the pinch script loaded. Observer initialization now waits for DOMContentLoaded in that case; the test deliberately delays the pinch script 250ms to cover it.
- Checks include motion/release drift, zoom limits, pan, staggered release, third finger, post-pinch word tap/long press, late second finger after native scroll, mode-change cancellation and resize cleanup.
- Shared state: pinch 132% → button + 182% → button − 132% → pinch 198%.
- `npm run test:viewport`: Text/PDF/EPUB, 40 trusted CDP double-taps per format, followed by Home; every sampled format retained `visualViewport.scale=1`, `visualViewport.width=390`, `innerWidth=390`, and `originalZoomLevel=1`. The test also verifies that the real hit path contains a non-absolute `pan-x pan-y` boundary before the absolute scroller. Editable replacement checks use Words input plus textarea/contenteditable probes within Reader. Programmatic selection + keyboard replacement does not prove iOS selection handles.
- `npm run www`: successful; `www/modules/lexical/core.js` present.
- `npx cap copy ios`: successful; source, `www`, and iOS public copies of Reader CSS, viewport diagnostics, EPUB Reader, and PDF pinch are byte-identical.
- iOS Simulator Debug build with signing disabled: `BUILD SUCCEEDED`.

## Whole-viewport zoom cause and fix

The viewport remains `width=device-width, initial-scale=1.0, viewport-fit=cover`; no `maximum-scale`, `user-scalable`, UA branch, or gesture-timing suppression was added. `touch-action: manipulation` is also absent because it permits native pinch.

The structural leak was that `touch-action:pan-x pan-y` existed only on `#reader-scroll`, which is `position:absolute`. WebKit bug 218015 documents that iOS can still double-tap zoom an absolute positioned element despite its `touch-action`. The standards model intersects the touched element and ancestor policy only to the first scroller, so a policy above the scroller is not a reliable substitute.

The minimal fix keeps the scroller policy and duplicates the same contract on the non-absolute format boundary below it: `#readwrap` for Text, `#originalwrap` for PDF and EPUB. The EPUB sanitizer also writes `touch-action:pan-x pan-y` into the iframe document's `html,body`; the current overlay skin remains the actual main-document hit target. No gesture handlers, click timing, zoom limits, or selection behavior were changed for this fix.

[Chromium baseline measurement](qa/touch-zoom-viewport-chromium.json): before the fix, all three formats, all 40 double-taps, and Home remained `visualViewport.scale=1`, `visualViewport.width=390`, `innerWidth=390`. This established that desktop Chromium emulation did not reproduce the device-only leak. The post-fix run adds the actual computed hit path and asserts its non-absolute policy boundary.

[Standalone iOS 26.4 WKWebView simulator probe](qa/touch-zoom-wkwebview-simulator.txt): limited Text-reader rapid taps retained scale 1 / width 375 / innerWidth 375. Simulator UI connection then failed; no complete native repeat/format/Home suite is claimed. This probe was not the production Capacitor app and is not physical-device proof.

The affected physical device has not yet supplied an abnormal `visualViewport` sample, so the reported instance cannot be forensically labeled from this checkout alone. The code-level ownership leak and its WebKit failure mode are isolated; the opt-in diagnostics remain so a recurrence can distinguish browser scale from Breeze scale immediately.

References considered:

- [WebKit fast-tap policy](https://webkit.org/blog/5610/more-responsive-tapping-on-ios/): responsive viewport optimization and `touch-action:manipulation` behavior.
- [Pointer Events specification](https://www.w3.org/TR/pointerevents3/): touch-action negotiation and manipulation.
- [WebKit absolute-position touch-action bug](https://bugs.webkit.org/show_bug.cgi?id=218015): open iPhone/iPad bug whose expected/actual case matches the former single-policy structure.

Existing editable selection and gesture policies remain unchanged. Device/OS/container details plus one abnormal viewport capture are still required to confirm the original recording was this browser path rather than a different native-container issue.

## Device capture and final checks

Open with `?viewport=1` to enable local diagnostic sampling; `?viewport=0` disables it. In Safari Web Inspector (or the app's inspectable WKWebView), call `breezeViewportSnapshot()` normally, during enlargement, and after Home. `breezeTouchPolicyAt(x,y)` shows the computed element chain at a point. `__breezeViewport` keeps the latest 200 samples with `scale`, `width`, `innerWidth`, `originalZoomLevel`, view/mode, and pointer target policy; logs contain no lookup or selected text.

On iPhone and iPad, in each relevant Safari / Home-screen web app / Breeze app container:

1. PDF pinch in/out, pan at zoom, and alternating pinch/+/-; percentage must match with no jump.
2. Release fingers in opposite orders; then single-word tap, sentence long press and one-finger scroll.
3. Rapid word taps on Text/PDF/EPUB, then Home/Words. Capture scale, width and innerWidth if enlarged.
4. Aa/modal/word-sheet ownership, input cursor placement, double-tap text selection, selection handles and typing.

### Device matrix

| Container | Text | PDF | EPUB | Current evidence |
| --- | --- | --- | --- | --- |
| iPhone Safari/PWA | pending | pending | pending | physical device required |
| iPad Safari/PWA | pending | pending | pending | physical device required |
| Android Chrome/PWA | pending | pending | pending | physical device required |
| Chromium mobile emulation | pass | pass | pass | 40 trusted double-taps per format; viewport stayed 1 |
| WebKit browser harness | n/a | pass | n/a | pinch/tap/long-press regression; touch is synthetic |
| iOS Simulator build | built | built | built | packaged assets match; interaction matrix not claimed |

Physical-device interaction checks remain outstanding; Simulator build and browser emulation are not presented as physical iPhone/iPad/Android proof.

## Changed files

Runtime: `scripts/reader/pdf-pinch.js`, `reader-scroll.js`, `pdf-original.js`, `original-session.js`, `gesture.js`, `frame-trace.js`; `styles/reader.css`; `index.html` and generated `sw.js` hashes.

Packaging/tests: `tools/build-www.mjs`, `package.json`, `package-lock.json`, `tests/verify-structure.mjs`, `tests/verify-pdf-pinch-browser.mjs`, `tests/verify-viewport-browser.mjs`.

Documentation: `ARCHITECTURE.md`, generated `docs/architecture.html`, this report and the two viewport evidence files.
