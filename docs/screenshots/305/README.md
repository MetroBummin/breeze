# #305 before/after: lookup pill with the writing dock on each edge

Captured by `tests/verify-pdf-ink-side-pill-browser.mjs` in WebKit (Playwright 27.2),
phone portrait (390×844) and iPad portrait (820×1180), light theme. The word
`minimum` on page 1 of the PDF fixture is tapped with the writing dock parked on
each edge.

- `*-before.png` / `*-before-expanded.png`: placement sources from the PR base
  (`64498c19`, pre-fix). With a left/right dock the expanded word detail is
  squeezed above the vertical bar (its top edge is treated as a bottom strip) and
  overlaps the bar.
- `*-after.png` / `*-after-expanded.png`: this PR. The mini pill stays on the
  word and the expanded detail stays inside the viewport, clear of the bar.

File names: `webkit-<edge>-<viewport>-light-<before|after>[-expanded].png`,
edge ∈ `left`, `right`, `top`, `bottom`. The full matrix (Chromium + WebKit, landscape,
dark) is uploaded by the `PDF ink side-dock lookup pill` workflow as artifacts.
