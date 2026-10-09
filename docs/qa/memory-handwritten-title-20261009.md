# Memory header uses the Home Breeze logo — 2026-10-09 PR139 revision

Base: main `b55f3df241607c95855a53009aceaa903e1da164`.
Supersedes the screenshot-reviewed Memory lettering commit
`602aa155e894e0bb590c2d58f5085c885d3c9a7e`, retained in branch history.

The user's final direction is to display the same Breeze logo on Home and
Wordbook, with no visible Memory lettering. Wordbook now uses the unchanged
`breeze-neutral-light.svg` / `breeze-neutral-dark.svg`, exactly as Home does:
132px wide, 841/258 aspect ratio, identical neutral gradients and actual y
coordinate. The same original mask/ink fallback is used for reduced motion,
reduced transparency and increased contrast. No new font or asset is added.
Only the unused companion mask introduced by the earlier PR139 commit is
removed; no asset from the main baseline is deleted or changed.

The semantic h1/nav retain the functional `Breeze Memory` name. Home source
is unchanged. Wordbook keeps its 44px add button/header row, safe-area + 24px,
20px content inset and 32px gap below the header. Home's lower spacing is
12px header padding plus 20px view padding, totaling the same 32px. Wide-screen
Wordbook's centered 1160px content column remains; its inset is relative to
that column. On phone/iPad, Home and Wordbook logo bounding boxes and cropped
pixels are exactly identical, with a 0px visible-ink center delta.

Local validation passed:

- Full `npm test`; existing type baseline is 32, with no increase.
- Existing Wordbook and Home browser regressions: responsive themes,
  search/sort/filter/edit/add/export, controls and navigation unchanged.
- Memory regression: twelve light/dark layouts at 390×844, safe-top 59px,
  320×568, 820×1180, 1440×900 and 844×390; exact asset/proportions/y coordinate,
  content inset, same-position logo pixel equality, no clipping, accessible
  name, add/repeated taps/Escape/cancel/reopen/save/navigation.
- Four preference cases compare Home's and Wordbook's actual mask/color and
  screenshot pixels in both themes (reduced motion / increased contrast).
- Delayed SVG plus blocked fonts at 320×568 in both themes preserve the
  accessible heading and header geometry.
- Syntax/whitespace and strict integration boundaries. Only the same heading,
  title CSS block and explicit regression/decision evidence are permitted;
  the worker change is limited to its generated content-hash version.
- Static www packaging and native-package/service-worker contracts preserve
  source bytes and exclude the removed companion mask.

Actual Home/Wordbook comparisons use production UI and the same six synthetic
saved words, at DPR 2. Phone: 390×844, safe top 59px; iPad: 820×1180, safe top
24px. CSS safe-area emulation is the only app modification. The comparison
labels are outside the unchanged app images; no fake status bar or device
frame is added. Both themes and devices were visually inspected locally.

| Home / Wordbook comparison | Library ID |
| --- | --- |
| iPhone light — full screens | `libfile_b741ed14d6888191bfde205294a51a63` |
| iPhone light — headers | `libfile_ff8b1d1db4b08191b6ef4f1d87a7a604` |
| iPhone dark — full screens | `libfile_2454620cb41881919845f2fd12edea41` |
| iPhone dark — headers | `libfile_1ebcb3c359bc8191b023718111273178` |
| iPad light — full screens | `libfile_af6a15ae2860819184a2c50365ae98fa` |
| iPad dark — full screens | `libfile_4736ef3a7ecc819188ad6e6f5db252ba` |

Current captures, receipt and complete test logs are in
`/workspace/breeze-memory-home-logo-20261009/`. Existing CI retains browser
proof as `design-brand-{chromium,webkit}` artifacts. The previous Memory
lettering Library images are superseded; they remain in the earlier commit's
QA record/history and are not deleted or replaced.

Local WebKit/Xcode/physical VoiceOver remain unavailable; existing PR CI runs
WebKit and an unsigned Simulator compile. Final-SHA terminal CI results are
reported in the PR/handoff. The visual-confirmation gate forbids integration,
main merge, Cloud/release build, deployment, ASC or review changes.
