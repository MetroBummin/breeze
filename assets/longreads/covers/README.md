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
`object-position: center top`. The Home 책 card is wider than 2:3 and
crops the bottom of the picture, so the title and the main artwork sit in
the upper three quarters. The preview sheet shows the whole picture.

Alice is the chosen garden painting: Alice on the path, the White Rabbit,
the tea table, and the cat in the roses. The painted title “ALICE in
WONDERLAND” and the “LEWIS CARROLL” line stay as they are. The small
tagline and its ornament are gone, and the path continues through that
spot. The Home card shows the title and the characters; it may crop the
author line. Gatsby keeps the first mansion, dock, and green light, under
an indigo-to-gold twilight with painted fireworks, strings of party lights,
and gold on the water. “THE GREAT GATSBY” is set in an Art Deco face inside
a thin gold frame. “F. SCOTT FITZGERALD” is set in Cinzel, in the same gold,
with a dark edge so the name stays readable against the fireworks. The Home
책 card shows about the top 829 pixels.

| Current asset | Bytes | Dimensions |
| --- | ---: | --- |
| `alice-in-wonderland.webp` | 201,374 | 768 × 1152 |
| `the-great-gatsby.webp` | 184,044 | 768 × 1152 |

New catalog cards and imports use these covers. Existing bundled books lacking
covers receive their catalog cover asynchronously after Home appears. Existing
saved/custom covers are preserved; source text and reading identity are never
replaced. The Backrooms cover and its licensing record are unchanged.
