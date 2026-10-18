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

Alice is cinematic key art: a young woman, waist-up and sharply lit, in a
blue dress and white apron, with a white rabbit and a pocket watch beside
her. A queen in a heart-patterned gown and a hatter in a tall hat sit
softer behind them, among sunlit curling trees. Mushrooms, roses, and
heart-marked cards fill the lower foreground.
Gatsby is cinematic key art: a gentleman, waist-up and facing the viewer,
raises a champagne coupe. Flappers stand behind him. Fireworks, a lit
mansion, a small green dock light, and inset gold geometric corners frame
the scene. A vintage car, a pool, and champagne fill the lower foreground.
Both faces sit inside the top three quarters of the frame. No title text.

| Current asset | Bytes | Dimensions |
| --- | ---: | --- |
| `alice-in-wonderland.webp` | 184,770 | 768 × 1152 |
| `the-great-gatsby.webp` | 155,506 | 768 × 1152 |

New catalog cards and imports use these covers. Existing bundled books lacking
covers receive their catalog cover asynchronously after Home appears. Existing
saved/custom covers are preserved; source text and reading identity are never
replaced. The Backrooms cover and its licensing record are unchanged.
