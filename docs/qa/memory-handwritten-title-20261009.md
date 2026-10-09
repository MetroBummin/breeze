# Breeze Memory handwritten title — 2026-10-09 draft

Base: main `b55f3df241607c95855a53009aceaa903e1da164`.

The existing Memory title was ordinary UI text. The authored Breeze wordmark
is an SVG path, with no underlying cursive font available in the repository.
The new 7,346-byte companion mask copies its Breeze path exactly and adds
Memory lettering at the existing welcome's 26-unit pen weight, repeating its
e/r loop construction. No new font or third-party font license is introduced.
The original wordmark, welcome animation and existing font/license files are
unchanged. The semantic h1 still reads `Breeze Memory`.

The CSS mask retains `--settings-ink`, the original 44px header/add geometry,
safe-area + 24px top spacing and 32px space below. Its 226px flexible width
fits a 320px screen while retaining the existing 10px add-button gap. Actual
visible ink centers differ from Home by -1.014px in local Chromium, within the
existing 2px tolerance. Both themes use their original high-contrast ink.

Local checks passed:

- `npm test` (all existing unit/structural contracts; type baseline remains 32).
- `node tests/verify-integration-boundary.mjs`: only the single heading,
  its title CSS block, companion asset and explicit validation/decision files;
  service-worker changes are limited to the generated content-hash version.
- `node --check` on both changed browser/boundary scripts and `git diff --check`.
- `BREEZE_CHROMIUM=/usr/bin/chromium node tests/verify-design-memory-browser.mjs`:
  390×844, safe-top 59px, 320×568, 820×1180, 1440×900 and 844×390 in both themes;
  actual ink bounds/alignment, no overflow, accessible heading, add-button
  placement, repeated taps, Escape/cancel/reopen, navigation and save.
- The same regression blocks fonts and delays the lettering asset at 320×568
  in both themes: accessible name remains, header bounds do not change.
- Existing Wordbook browser regression: responsive themes, search, sort,
  filters, edit, add, CSV export and return Home.
- Existing Home browser regression: ten layouts, original wordmark/bookmark,
  accessibility/keyboard navigation and unchanged 42px dock controls.
- `node tools/build-www.mjs`, native-package/service-worker contracts and exact
  source/www comparisons: the companion SVG ships unchanged in native www.

Actual before/after Wordbook screenshots use the same six synthetic saved words
and production app UI, at DPR 3. CSS safe-area fixtures are the only emulation;
there is no decorative native status bar or device frame. Phone viewport is
390×844; iPad is 820×1180. Both themes were visually inspected locally.
Pixel comparisons are identical outside the 44px header in all four
phone/iPad and light/dark before/after pairs.

Requested Library deliverables, in order:

| Screenshot | Library ID |
| --- | --- |
| Before — full Wordbook | `libfile_98d8df7e7f788191abbc5e642da448f2` |
| After — full Wordbook | `libfile_50dc28949008819196506b49153f3d9a` |
| Before — header enlargement | `libfile_8a895d878078819194abcb340a4c883d` |
| After — header enlargement | `libfile_b23c48698690819194a540aca9558f18` |

Capture receipt, both-device/theme PNGs, browser measurement JSON and complete
local test logs are in `/workspace/breeze-memory-title-20261009/` and
`/tmp/breeze-memory-proof/`. CI also saves its browser screenshots/measurements
as the existing `design-brand-{chromium,webkit}` artifacts.

Local WebKit/Xcode/physical VoiceOver are unavailable in this Linux environment;
the existing PR workflow runs WebKit and an unsigned iOS Simulator compile.
Final-SHA terminal CI conclusions are reported in the draft PR and handoff.
This task does not merge, deploy, modify ASC, change release metadata or
create/upload a TestFlight release build.
