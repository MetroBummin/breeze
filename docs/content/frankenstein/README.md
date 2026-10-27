# Frankenstein — lightly modernized edition

Frankenstein by Mary Shelley (1818), lightly modernized for Breeze.
This is not the author's verbatim edition, an abridgement, or a graded reader.

## Source

Source text: Project Gutenberg eBook #84 (1831 edition), retrieved 2026-10-27.
Gutenberg boilerplate, contents lists, prefaces, illustration placeholders, and bare THE END markers are omitted; the story text is complete from Letter 1 to Walton's final letter, in four letters and twenty-four chapters.

## Modernization

The baseline contains 792 ordered blocks and 74975 words. The adapted text has 811 blocks and 74941 words.
`edits.json` records all 94 ordered paragraph-indexed before/after changes with reasons. Changes are limited to current spellings, dated polite imperatives, archaic words whose meaning changed, and (Great Expectations only) dialect spellings and agreement; the author's voice, British spelling, and period setting remain. Paragraph order is unchanged.
The creature's thou/thee/thy diction, the quoted verse diction, and the rhetorical 'nay' are deliberately retained.

## Verse presentation

Verse presentation: the three quoted verse blocks (Coleridge's Ancient Mariner, Shelley's Mutability, Wordsworth's Tintern Abbey) are split into one paragraph per line (22 verse paragraphs) and marked with verse roles in scripts/library/public-domain-layout.js, so the reader shows them as verse.
Verse roles apply only when the paragraph still matches the shipped text, so an edited copy keeps reading.

## Validation

`tests/verify-remote-classics.mjs` checks the catalog bytes and contentVersion hash. The public catalog URL serves the adapted text; the SHA-256 in `manifest.json` matches the uploaded `book.txt`.
