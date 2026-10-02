# Reader pill centering — build 205 device follow-up

The user's 8-second build 205 recording shows transient horizontal overshoot on
collapse and expansion while PDF paper is scrolling. Build 205's browser tests
sampled correct DOM trajectories; they did not establish displayed WKWebView
compositor geometry. The width-relative horizontal centering transform combined
with an independent animated translate is a plausible source of this mismatch;
a native compositor trace was not captured.

## Change

Use left/right insets and auto inline margins for Reader horizontal centering.
Remove the horizontal percentage transform and the independent translate.
Animate the left inset with width/height/padding/radius using the existing 260ms
curve. Narrow expanded PDF uses left 44px/right 0px, so its center remains 22px
right of viewport center. Collapsed reading uses zero insets. Writing, Home,
Memory, material, scrolling ownership and reduced motion retain their contracts.
No timer, per-frame position writer, spring or new dependency is introduced.
Source app/extension build numbers advance together to 206.

## Verification

- `npm test`: passed.
- Reader chrome motion: Chromium and WebKit passed at 320/390/507/650/820/1440
  widths and short landscape in both themes. Includes monotonic center travel,
  reversal, six rapid interruptions while paper/progress updates, writing input
  gating and reduced motion. Wait for the emulated media style before testing it.
- PDF navigation/responsive browser regression: Chromium and WebKit passed.
- `npm run test:home-ui`: passed, including Home resume, shared controls,
  refresh, Reader progress, Wordbook and lookup work in both engines where supported.
- `npm run ios:sync`: passed.
- Home/Reader comparison allows 1/64px position rounding between transform and
  auto-margin centering; material and reflection comparisons remain exact.
- Physical iPhone verification remains required. Browser tests do not prove that
  the device compositor symptom has been eliminated.

Local logs: `/tmp/breeze-centering-*.log`. Browser screenshots are in
`/tmp/breeze-reader-chrome-motion/` and `/tmp/breeze16-qa/`.
