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
Breeze. They are not film stills, actor likenesses, Disney designs, or
Tenniel plates. The titles are set in type on the paintings. The Home 책
card is wider than 2:3 and crops the bottom of the picture, so the title
and the main artwork sit in the upper three quarters.

Alice is a bright fall down a rabbit hole: a white rabbit in a waistcoat
with a pocket watch, a sunlit tunnel, and floating cups and cards. The
title “ALICE IN WONDERLAND” sits in the sky above the hole, with the
author line on a dark band, all inside the top of the frame. Gatsby keeps
the first mansion, dock, and green light, under an indigo-to-gold twilight
with painted fireworks, strings of party lights, and gold on the water.
“THE GREAT GATSBY” is set in an Art Deco face inside a thin gold frame.
“F. SCOTT FITZGERALD” is set in Cinzel, in the same gold, with a dark
edge so the name stays readable against the fireworks. The Home 책 card
shows about the top 829 pixels, and the preview sheet shows the whole
picture.

| Current asset | Bytes | Dimensions |
| --- | ---: | --- |
| `alice-in-wonderland.webp` | 190,178 | 768 × 1152 |
| `the-great-gatsby.webp` | 184,044 | 768 × 1152 |

New catalog cards and imports use these covers. Existing bundled books lacking
covers receive their catalog cover asynchronously after Home appears. Existing
saved/custom covers are preserved; source text and reading identity are never
replaced. The Backrooms cover and its licensing record are unchanged.
