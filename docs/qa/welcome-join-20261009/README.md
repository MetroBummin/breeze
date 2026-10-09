# Welcome b-to-r connector review — 2026-10-09

The user reported a protrusion between b and r in the first onboarding screen.
The comparison uses the unchanged authored cursive asset
`assets/brand/wordmarks/breeze-flow-{light,dark}.svg` and the actual welcome SVG
from PR136 before this repair (`437fd6f006acb62097f6737e69a4a9ad292f96bb`).

## Cause and minimal repair

After the approved b bowl retrace ends at `(161,228)`, the old quadratic exit
starts toward `(164,210)`, changing direction abruptly from the incoming bowl.
Actual Chromium SVG samples 0.2 path units either side of that joint measure
36.1977 degrees before and 0.0030 degrees after.

Only `Q164 210 178 208 Q214 202 235 139` becomes
`C187.666667 202 221 181 235 139`. The cubic starts at the same joint and ends
at the same r entry `(235,139)`. Its handles follow the incoming b and existing
r-entry tangents. All earlier b commands, its handwriting order, and all later
r/e/z commands are identical. The original brand assets remain unchanged.
This is a local continuity repair, not a replacement of the welcome path with
the authored filled outline.

Production CSS and session code are unchanged: writing 4200 ms, hold 750 ms,
fade 900 ms, with the same easing and caption behavior. The path length changes
from 2711.3569 to 2706.3477 units, so geometric progress can differ slightly
within the same total timing. No claim of identical per-letter frame timing is
made.

## Review evidence

- [Light original / before / after / overlay](reference-before-after-overlay-light.png)
  and [dark comparison](reference-before-after-overlay-dark.png): labeled asset
  comparison diagrams; gray in the fourth panel is the stored cursive asset.
- [Before light full screen](before-full-light.png),
  [after light full screen](after-full-light.png),
  [before dark full screen](before-full-dark.png),
  [after dark full screen](after-full-dark.png): actual Chromium app screens,
  390×844 CSS pixels at 2×. These are not iPhone device screenshots.
- `before/after-zoom-mid-{light,dark}.png`: enlarged actual app SVG at 1233.33 ms,
  while the connector is being written.
- `before/after-zoom-final-{light,dark}.png`: enlarged actual app SVG at 4200 ms.
  Only its review viewport and size change; production geometry/CSS are used.
- [Light before/after film](before-after-light.mp4) and
  [dark before/after film](before-after-dark.mp4): left before, right after;
  silent H.264, 30 fps, 211 frames. Actual CSS animations are paused and sought
  at exact 1/30 s intervals, then the welcome session finishes at 5.85 s.
  These films are deterministic browser captures, not live device recordings.
- [Capture receipt](capture-receipt.json): source paths, timings, pen/caption
  samples and empty browser error lists for all four captures.

Reproduce with a local server at `http://127.0.0.1:4173`, Chromium and ffmpeg:

```sh
BREEZE_BROWSER_EXECUTABLE=/usr/bin/chromium node tools/capture-welcome-join-review.mjs
```

## Regression protection

The onboarding browser test pins the baseline path and permits only this exit
replacement, checks the old discontinuity and repaired tangent continuity,
retains all 41 actual CSS animation samples, and checks the unchanged timing.
The integration boundary independently permits only the one HTML segment and
protects the welcome CSS/session code, icon catalog, Android tree, brand assets,
and approved onboarding media against PR136's pre-repair SHA.

Local Chromium onboarding regression passed, including first/final boundaries,
repeated/rapid navigation, both swipe directions, import cancellation/failure/
retry/back/skip and tutorial replay. Final commit CI and native builds are
reported on PR136. Physical-device home-screen appearance, picker behavior,
safe areas and playback remain separate checks.
