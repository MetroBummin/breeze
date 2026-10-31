# #313 web-novel covers: Home 웹소설 tab with the supplied poster art

These shots show the three supplied original covers (Cinnamon Bun, Chasing
Sunlight, The Unexpected Engagement of the Marvelous Mr. Penn) rendered on the
Home **추천 → 웹소설** tab, replacing the old text-only covers. The covers are
original art made for Breeze, not the authors' covers (see
`assets/webnovels/covers/README.md`).

| File | Device / viewport | Theme | Surface |
| --- | --- | --- | --- |
| `webnovel-home-390x844-light.png` | iPhone, 390×844 | light | Home, 웹소설 tab |
| `webnovel-home-390x844-dark.png` | iPhone, 390×844 | dark | Home, 웹소설 tab |
| `webnovel-home-820x1180-light.png` | iPad, 820×1180 | light | Home, 웹소설 tab |

Each cover loads at its native 768×1152 (`img.cover.naturalWidth === 768`) in
the capture, so the frames below show the final supplied art.

## How these were captured

Served the repo root over a local static HTTP server and drove a real headless
Chromium against it (no external network; covers come from the local
`assets/webnovels/covers/*.webp`). The page is booted past onboarding, the
`웹소설` tab is selected, and the capture waits until all three
`#casual-rail .webnovel img.cover` images report `naturalWidth === 768` before
the screenshot.

Repro steps (any environment with a browser; the repo's own
`tests/verify-home-rows-browser.mjs` uses the same selectors under Playwright):

1. Serve the repo root over HTTP, e.g. `python3 -m http.server 8713` (or the
   tiny static server used by the browser tests).
2. Open `http://127.0.0.1:8713/` in a browser at the viewport in the table
   (`light` or `dark` color scheme).
3. In the page, set `localStorage` and reload:
   - `breeze.onboarding.v1 = '"done"'` (skip onboarding)
   - `breeze.dark = '"light"'` or `'"dark"'`
   - `breeze.home-recommend = '"webnovels"'` (open on the 웹소설 tab)
4. Wait for `homeReady`, then wait until
   `[...document.querySelectorAll('#casual-rail .webnovel img.cover')].filter(i => i.naturalWidth === 768).length === 3`.
5. Screenshot the viewport into this directory with the matching name.

The three required shots for issue #313 are: iPhone 390×844 light, iPhone
390×844 dark, and iPad 820×1180 light — all of the Home 웹소설 tab.
