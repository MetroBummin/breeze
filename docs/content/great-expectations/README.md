# Great Expectations — lightly modernized edition

Great Expectations by Charles Dickens (1861), lightly modernized for Breeze.
This is not the author's verbatim edition, an abridgement, or a graded reader.

## Source

Source text: Project Gutenberg eBook #1400, retrieved 2026-10-27.
Gutenberg boilerplate, contents lists, prefaces, illustration placeholders, and bare THE END markers are omitted; the story text is complete from Chapter 1 to Chapter 59, in fifty-nine chapters, including Dickens's two stage markers.

## Modernization

The baseline contains 3894 ordered blocks and 184336 words. The adapted text has 3899 blocks and 184381 words.
`edits.json` records all 646 ordered paragraph-indexed before/after changes with reasons. Changes are limited to current spellings, dated polite imperatives, archaic words whose meaning changed, and (Great Expectations only) dialect spellings and agreement; the author's voice, British spelling, and period setting remain. Paragraph order is unchanged.
Joe Gargery's dialect spellings and agreement are normalized to current spelling and grammar (562 changes, recorded in edits.json), keeping his word choice, repetitions, politeness, double negatives, and 'ain't'. Deliberately retained: Joe's phonetic letter, Magwitch's and Orlick's dialect grammar, 'wittles', the 'for to' infinitive, the a- progressive prefix, and Dickens's two stage markers ('THIS IS THE END OF THE FIRST/SECOND STAGE OF PIP'S EXPECTATIONS.').

## Verse presentation

Verse presentation: the 'Lunnon town' song is split into one paragraph per line (6 verse paragraphs) and marked with verse roles in scripts/library/public-domain-layout.js, so the reader shows it as verse.
Verse roles apply only when the paragraph still matches the shipped text, so an edited copy keeps reading.

## Validation

`tests/verify-remote-classics.mjs` checks the catalog bytes and contentVersion hash. The public catalog URL serves the adapted text; the SHA-256 in `manifest.json` matches the uploaded `book.txt`.
