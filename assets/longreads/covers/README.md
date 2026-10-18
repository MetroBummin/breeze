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

Alice and Gatsby use the same uncropped 768 × 1152 WebP frame. Both pictures
are original paintings made for Breeze: no film still, no copyrighted cover,
and no scanned illustration. Alice is a dark midnight view of a girl and a
white rabbit at a glowing hole. Gatsby is a night bay, a distant house, and
one green light at the end of a dock.

| Current asset | Bytes | Dimensions |
| --- | ---: | --- |
| `alice-in-wonderland.webp` | 126,608 | 768 × 1152 |
| `the-great-gatsby.webp` | 147,660 | 768 × 1152 |

New catalog cards and imports use these covers. Existing bundled books lacking
covers receive their catalog cover asynchronously after Home appears. Existing
saved/custom covers are preserved; source text and reading identity are never
replaced. The Backrooms cover and its licensing record are unchanged.
