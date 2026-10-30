# Web-novel covers

These three movie-poster style covers are **original art made for Breeze, not
the authors' covers.** Each shows the English title and the author's name in its
exact case. They were supplied as finished files (issue #313) and replace the
earlier typographic covers; the old generator `tools/make-webnovel-covers.mjs`
is retired so nothing rewrites them. `tests/verify-web-novels.mjs` checks the
path, WebP header, size and SHA-256 below.

| File | Work | Bytes | Dimensions | SHA-256 |
| --- | --- | ---: | --- | --- |
| `cinnamon-bun.webp` | Cinnamon Bun — RavensDagger | 221,094 | 768 × 1152 | `593bf962401d696b17da22b0b7a0802b708e4515c3088c176ef2fb1aeb24cd2e` |
| `chasing-sunlight.webp` | Chasing Sunlight — InadvisablyCompelled | 118,820 | 768 × 1152 | `fac5dd6eb00cd80fd17239c99c015a062470b3a4c28c82f02124da9000e33c83` |
| `mr-penn.webp` | The Unexpected Engagement of the Marvelous Mr. Penn — R. K. Goff | 146,670 | 768 × 1152 | `dde62d063ae60076b8bf884c517f1d3f69d70b42ec8e964b1b1f0cb19e6093ff` |

All are lossy WebP (quality 85). The Home 웹소설 cards and the preview sheet read
these paths directly (`WEB_NOVELS[].cover`). Web novels are not saved into 내 책,
so there is no stored cover Blob to repair. To change a cover, replace the file
and update the SHA-256 in this table and in the test.
