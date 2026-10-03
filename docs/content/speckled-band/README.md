# The Adventure of the Speckled Band — Breeze edition

Arthur Conan Doyle's complete 1892 story, in English, lightly modernized for
Breeze. This is an adaptation, not a verbatim Doyle edition or a graded reader.
The user selected cover option 1; its Library identity is
`libfile_16281071d8948191a3f67c8fff03ef42`. Cover integration remains blocked by
transfer into this executor. No substitute artwork has been selected.

## Source and boundaries

Acknowledgment: [Project Gutenberg, eBook #1661](https://www.gutenberg.org/ebooks/1661),
*The Adventures of Sherlock Holmes*, story VIII. The story begins “On glancing
over my notes” and ends with Holmes's statement about his conscience. It includes
the complete explanation after the climax. Neither the table of contents, the
next story (IX), the collection title nor Gutenberg's header/footer enters Reader.

Primary text checked 2026-10-03:
[plain text](https://www.gutenberg.org/cache/epub/1661/pg1661.txt) and
[HTML](https://www.gutenberg.org/cache/epub/1661/pg1661-images.html).
The executor's proxy denied direct Gutenberg downloads. The complete official
text was instead retrieved through the web research tool (lines 6604–7704).
A [GITenberg mirror](https://github.com/GITenberg/The-Adventures-of-Sherlock-Holmes_1661/blob/master/1661.txt)
provided the 251-paragraph layout. Every character of the entire story was
compared to the official text after normalizing whitespace, straight/curly
quotes, em dashes to double hyphens and pound-symbol notation to “pounds”.
Seven local textual/capitalization differences in that older mirror were resolved
to the current official text before the baseline was saved: five “Doctor”
capitalizations, “had my say”, and “footpath”. The baseline is a normalized story
extract, not a claim to reproduce the raw download's bytes or collection hash.

`original.txt` preserves all 251 ordered paragraphs and 9,805 whitespace-delimited
words. SHA-256:
`255679f12fe1e457f7b5ee664389de1e507c8a557ccacd088508f330c433e2c7`.

`assets/longreads/speckled-band.txt` has 251 paragraphs and 9,804 words. SHA-256:
`9b9b230612dc39e67f18e86d1c71d4146adce8a677a15444938d619396ff50e2`.
It has no inserted headings, glossary paragraphs or story summaries. Reader's
separate attribution disclosure carries edition notes and a small period glossary.

## Editorial audit

`edits.json` is the complete ordered change log: one-based paragraph number,
original phrase, replacement, reason and count (default one). The test replays all
25 logged edits and requires exact equality with the delivered asset. Examples:
“knock you up” → “wake you”; “would fain have said” → “would have liked to say”;
“ejaculation” → “exclamation”; “capital sentence” → “death sentence”.

No paragraph is deleted, added, moved, combined or split. Watson's voice,
British spelling, dialect, uncertainty, characterization and Victorian setting
are retained. Names, dates, quantities, inheritance conditions and period objects
are unchanged. Dog-carts, the trap, currency and weapons are not replaced with
modern equivalents. The ambiguous “band” language, room arrangement, locks,
windows, timings, sounds, bell-rope, ventilator, bed, safe and the final explanation
remain intact. Animal behaviour and scientific claims integral to the fictional
solution have not been corrected. Historical ethnic references and characters'
attitudes remain source language, not new editorial assertions.

## Distribution and attribution

The [catalog](https://www.gutenberg.org/ebooks/1661) identifies the original as
public domain in the USA. This is not a claim of worldwide clearance. The app's
web and native asset-copy paths distribute this local adaptation; no new service,
paid system, modern translation or third-party published cover is bundled.
The normalized original is an editorial reference under `docs/`, excluded from
the native `www` asset copy; the adapted text is the reader asset.

Following the [Gutenberg license explanation](https://www.gutenberg.org/policy/license.html)
and [permission guidance](https://www.gutenberg.org/policy/permission.html), the
adapted story omits Gutenberg branding and license boilerplate. A linked source
acknowledgment is separate from the story, in preview credits and Reader's
attribution disclosure. The title, cover and series do not market it as a
Gutenberg edition. The license explanation expressly distinguishes linked
acknowledgments/reference sections from trademark use. Do not apply Backrooms'
CC BY-SA license or its “unchanged original” statement to this adaptation.

## Reproduce checks

- `node --test tests/verify-speckled-band.mjs`
- `npm run test:longreads` (Backrooms and the new preview lifecycle suite)
- `node --test tests/verify-article-preview-server.mjs`
- `npm test`

Final cover visual and offline-image validation are pending until the selected
image reaches the executor. No release, merge or deployment is authorized here.
