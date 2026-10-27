# Little Women — lightly modernized edition

Little Women by Louisa May Alcott (1868), lightly modernized for Breeze.
This is not the author's verbatim edition, an abridgement, or a graded reader.

## Source

Source text: Project Gutenberg eBook #514, retrieved 2026-10-27.
Gutenberg boilerplate, contents lists, prefaces, illustration placeholders, and bare THE END markers are omitted; the story text is complete from Part 1 to Part 2, Chapter 47, in two parts and forty-seven titled chapters.

## Modernization

The baseline contains 3864 ordered blocks and 185890 words. The adapted text has 4100 blocks and 185883 words.
`edits.json` records all 107 ordered paragraph-indexed before/after changes with reasons. Changes are limited to current spellings, dated polite imperatives, archaic words whose meaning changed, and (Great Expectations only) dialect spellings and agreement; the author's voice, British spelling, and period setting remain. Paragraph order is unchanged.
The play, song, hymn, and quoted-verse diction (thou/thee/thy, hither), Mr. Bhaer's German-English speech (including the discussed word 'thou' itself), and the lowercase continuations after inserted verse are deliberately retained.

## Verse presentation

Verse presentation: 43 verse blocks (play spells, the Pickwick Club song, the cat elegy, the epitaph, the laundry song, gift verses, the hymn, the Kate Kearney song, the 'river' poem, and the keepsake poem) are split into one paragraph per line (279 verse paragraphs) and marked with verse roles in scripts/library/public-domain-layout.js, so the reader shows them as verse. Two short blocks that are not verse stay joined: the play-grading list and the telegram.
Verse roles apply only when the paragraph still matches the shipped text, so an edited copy keeps reading.

## Validation

`tests/verify-remote-classics.mjs` checks the catalog bytes and contentVersion hash. The public catalog URL serves the adapted text; the SHA-256 in `manifest.json` matches the uploaded `book.txt`.
