# Breeze 1.9.2 candidate: meaning focus and book filter

Base: `83cc182db73ed1d63784e66321a066ccb2943994`, confirmed against remote
main on 2026-10-09. Branch: `codex/1.9.2-memory-edit-filter`. This draft is
independent of OCR PR143. Submitted 1.9.1(257), native marketing/build settings,
release workflows, Reader/OCR sources and historical release receipts are unchanged.
Only content-derived web asset/cache hashes are regenerated; no build, merge,
deployment, TestFlight upload or submission was performed.

## Findings and repair

The actual meaning editor is `.vko[contenteditable="true"]`, not an input or
textarea. `wordbook.css` declared 15px, then later-loaded `surfaces.css` changed
the effective size to 14px. Chromium measured 14px both before and after focus
in all twelve baseline light/dark layouts. This confirms the small-font condition,
but Chromium did **not** reproduce iPhone automatic zoom or retained zoom.

iOS WebKit's [focused-element reveal](https://github.com/WebKit/WebKit/blob/788c351ba61e1d93235984aa2e1f5a3436014e9b/Source/WebKit/UIProcess/ios/WKContentViewInteraction.mm#L2984)
passes the node font size to its [focus scale calculation](https://github.com/WebKit/WebKit/blob/788c351ba61e1d93235984aa2e1f5a3436014e9b/Source/WebKit/UIProcess/API/ios/WKWebViewIOS.mm#L1819),
which uses 16/fontSize when scaling is permitted. This supports the small-font
cause as an inference, not a reproduction on the submitted app or iPhone.

The component now owns both display and editing typography: collapsed text
stays 14px; editable text is `max(16px,1rem)` with proportional line height **before
focus**, including newly expanded and rerendered rows. A larger 20px root-font
fixture produces 20px/30px editing text. No viewport reset, forced blur, global
zoom limit, pinch gesture change or Reader font-preference change was added.

The book filter is an existing `<details>` multi-select disclosure, not a modal
sheet. The neighboring sort menu and shelf category menus already dismiss on
outside click and Escape. Only the book filter lacked those listeners. Both
Memory menus now share the existing dismissal policy; inside selection stays
open, Escape returns focus without scrolling, and view navigation closes hidden
disclosures. Browser Back still follows the existing Home navigation; no modal
history entry or new filter cancellation transaction was introduced. Closing
does not clear selections. The filter has no separate Cancel button; its summary
toggle and Escape close it. The existing add dialog's Cancel path was also checked.

## Executed verification

All browser results below are **system Chromium on Linux** with local vocabulary
fixtures and external requests blocked. This is mobile emulation, not iOS Safari
or WKWebView. `keyboard-sized` is a resized viewport, not a real soft keyboard.

- `npm test`: exit 0; [complete output](memory-edit-filter-20261009/npm-test.log).
- `npm run typecheck`: passed with the existing 32 diagnostics, no increase.
- `BREEZE_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/verify-wordbook-browser.mjs`:
  existing search, sort, filter, editing, manual add, export and Home regression passed.
- `BREEZE_CHROMIUM=/usr/bin/chromium node tests/verify-design-memory-browser.mjs`:
  twelve light/dark layouts, simulated safe area, header and controls passed.
- New `verify-memory-edit-filter-browser.mjs`: before and after twelve cases each
  at 390×844, 320×568, 820×1180, 1440×900, 844×390 and 390×400, light/dark.
  Baseline was served from an isolated checkout of exact main `83cc182`.
  Actual touch taps focus the meaning and dismiss the book menu in Chromium.
  Tests cover typing/blur persistence, collapse, inside selection, outside tap,
  Escape/focus return, summary toggle, sort selection, Back/Forward, navigation
  and reopening, selection retention, long Korean meanings/titles, menu wheel
  scrolling, larger root font, add-dialog Cancel, and single menu/dialog instances.
- Chromium CDP scale 1.5 remains 1.5 across focus and blur. This is a simulated
  page-scale positive control, **not** a physical accessibility pinch test.
- Whitespace, current asset stamping and protected native/Reader/release-source
  diffs passed. No type baseline or frozen boundary verifier was modified.

| Observation | Before, all 12 cases | After, all 12 cases |
| --- | --- | --- |
| Editable meaning before/at focus | 14px / 14px | 16px / 16px |
| Collapsed meaning | 14px | 14px |
| Outside touch tap closes book menu | false | true |
| Escape closes book menu | false | true |
| Default visualViewport scale at focus/blur/collapse | 1 / 1 / 1 | 1 / 1 / 1 |
| Open native dialogs in the inline meaning editor | 0 | 0 |

[Before measurements](memory-edit-filter-20261009/before/chromium.json) and
[after measurements](memory-edit-filter-20261009/after/chromium.json) include
computed font/line height, focus/contenteditable, viewport meta, visualViewport
scale/dimensions/offsets, scroll and disclosure/dialog state. The test creates
full-size screenshots for every case; representative phone images are committed.

| Surface | Before | After |
| --- | --- | --- |
| Meaning focused, light | [14px](memory-edit-filter-20261009/before/phone-light-meaning-focused.png) | [16px](memory-edit-filter-20261009/after/phone-light-meaning-focused.png) |
| Meaning focused, dark | [14px](memory-edit-filter-20261009/before/phone-dark-meaning-focused.png) | [16px](memory-edit-filter-20261009/after/phone-dark-meaning-focused.png) |
| Book menu after outside tap, light | [Still open](memory-edit-filter-20261009/before/phone-light-book-outside-tap.png) | [Closed](memory-edit-filter-20261009/after/phone-light-book-outside-tap.png) |
| Book menu after outside tap, dark | [Still open](memory-edit-filter-20261009/before/phone-dark-book-outside-tap.png) | [Closed](memory-edit-filter-20261009/after/phone-dark-book-outside-tap.png) |

## Remaining gates

**Actual iOS is unverified.** This Linux environment has no iPhone, Xcode or iOS
Simulator. Local Playwright WebKit installation failed with HTTP 403/domain
forbidden from both download hosts. The dedicated PR workflow runs Chromium
and Linux WebKit and uploads measurements/screenshots; even a green WebKit job
does not demonstrate native iOS keyboard or focus zoom recovery.

Before a release, use the installed iPhone app and Safari to record font size and
visualViewport scale/dimensions/offsets before focus, while typing, after native
keyboard dismissal and after closing/reopening the word row. Test long Korean
text, a lower-screen row, rotation, light/dark, larger accessibility text and a
deliberate user pinch. Confirm editing never triggers unintended zoom and never
resets an intentional user zoom. Repeat book-filter inside/outside taps, Escape
where available, Back, reopen, preserved selections and long-list touch scrolling.
The user's persistent-zoom symptom remains **unconfirmed**, pending that run.

**The frozen 1.9.1 integration boundary intentionally rejects this candidate.**
Exact main passes `node tests/verify-integration-boundary.mjs` in the isolated
checkout. The changed candidate fails with `Reviewed PR139 source bytes changed:
styles/wordbook.css` ([output](memory-edit-filter-20261009/frozen-boundary.log)).
That receipt and verifier stay intact. A separately reviewed 1.9.2 scope contract
is required before integration; do not regenerate 1.9.1 historical hashes, add a
branch-name bypass, or merge this draft as release-ready.
