# Backrooms Tale Long Reads

`homewardbound.txt` is one static, local Breeze Text book containing Chapters 1
and 2 in order. The story bodies were extracted once from the Backrooms Wiki
pages, with paragraph breaks and Chapter 2 scene transitions kept and no
Wikidot page chrome, comments, rating, author panels, or embeds. Reader imports
it through Breeze's regular TXT import path; there is no runtime request to
Wikidot and no article, EPUB, or PDF representation.

Existing bundled Chapter 1 books are extended in place when their 61 original
paragraphs match the shipped text. Their paragraph anchors remain valid.

## Local lookup fixture

`homeward-lookup-data.js` contains the exact 107 source paragraphs, 314 reviewed
sentence spans and Korean translations, and 77 contextual lexical occurrences
(43 single words, 34 expressions). The Korean translations are adaptations of
the credited story text and follow the same CC BY-SA 3.0 attribution/license.
The user's cover and the separately created illustrations are not part of that
text fixture.

`scripts/library/homeward-lookup.js` uses the fixture only for the bundled
Homeward Bound TXT book. It compares every paragraph in the selected chapter
with the published source before returning a span or answer. Any changed text
uses the normal Reader lookup pipeline. The fixture never seeds a user's
Wordbook; only an actual Reader tap follows Breeze's existing save behavior.
Local answers keep the normal loading UI for about one second, with the normal
lookup cancellation guard. Do not edit `homewardbound.txt` without reviewing
the fixture and its translations in the same change.

## Attribution and license

The story text below, including its plain-text paragraph formatting, is
attributed to its source author and licensed under CC BY-SA 3.0. The Reader's
collapsed “출처와 라이선스” panel provides both original titles, author, source
pages, and license link. The cover is a separate asset supplied by the user.
The ten scene illustrations were newly generated for Breeze; no Backrooms Wiki
page images are included.

| Breeze title | Original title | Author | Source |
| --- | --- | --- | --- |
| Backroom - Homeward Bound | Homeward Bound: Chapters 1–2 | DivineAtlas | <https://backrooms-wiki.wikidot.com/homewardbound-ch-1>, <https://backrooms-wiki.wikidot.com/homewardbound-ch-2> |

Each source page's citation box states CC-BY-SA-3.0. The Backrooms Wiki's
[licensing guide](https://backrooms-wiki.wikidot.com/licensing-guide) states
that wiki contributions use CC BY-SA 3.0, and its
[image-use policy](https://backrooms-wiki.wikidot.com/image-use-policy) says
images require their own attribution. No images from those story pages are
included here.

## Covers

`covers/backroom-homeward-bound.png` is a lossless crop of the left panel from
the user-supplied 1536 × 1024 image. The card uses top alignment so the source
title stays visible in Breeze's shorter portrait card frame.
