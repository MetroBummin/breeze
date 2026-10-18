# Approved long-read covers

The five Holmes catalog entries use the user-approved cinematic cover series,
encoded as uncropped WebP derivatives. The former three Gothic PNG catalog covers
were replaced in the illustrated collection; their provenance remains in Git
history. User originals are preserved outside the checkout.

Exact current source/derivative hashes, dimensions, byte counts and generation
records live in [the artwork manifest](../../../docs/content/holmes-artwork/asset-manifest.json).
Browser cover tests compare repaired stored Blobs against that manifest, including
SHA-256 and decoded dimensions.

| Current asset | Bytes | Dimensions |
| --- | ---: | --- |
| `final-problem.webp` | 176,008 | 768 × 1152 |
| `hound-of-the-baskervilles.webp` | 99,430 | 768 × 1152 |
| `red-headed-league.webp` | 120,184 | 768 × 1152 |
| `scandal-in-bohemia.webp` | 122,122 | 768 × 1152 |
| `speckled-band.webp` | 160,112 | 768 × 1152 |

Alice and Gatsby use the same uncropped 768 × 1152 WebP frame, with
`object-position: center top`. Both pictures are original paintings made for
Breeze. They are not film stills, film posters, actor likenesses, Disney
designs, or Tenniel plates. The Home 책 card is wider than 2:3 and crops the
bottom of the picture, so the figures sit in the upper three quarters.

Alice is a bright pastel garden: a girl in a blue dress and white apron,
full length on a path, with a waistcoated white rabbit and a pocket watch.
A smaller queen in a heart-patterned gown and a hatter in a tall hat stand
behind them, with curling flowering trees and a rabbit hole. Roses,
mushrooms, a teapot, and heart-marked cards fill the lower foreground.
Gatsby is a bright gold-and-black 1920s party: a generic gentleman, full
length on a marble terrace and seen in three-quarter view, raises a
champagne coupe among flappers in headbands. Fireworks, mansion lights, a
small green dock light, and inset gold geometric corners sit above a
foreground of a vintage car, a lantern-lit pool, champagne, and roses.
The figures end inside the top three quarters of the frame.

| Current asset | Bytes | Dimensions |
| --- | ---: | --- |
| `alice-in-wonderland.webp` | 199,080 | 768 × 1152 |
| `the-great-gatsby.webp` | 177,492 | 768 × 1152 |

New catalog cards and imports use these covers. Existing bundled books lacking
covers receive their catalog cover asynchronously after Home appears. Existing
saved/custom covers are preserved; source text and reading identity are never
replaced. The Backrooms cover and its licensing record are unchanged.
