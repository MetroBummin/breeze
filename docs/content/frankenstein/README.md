# Frankenstein — lightly modernized edition

Frankenstein by Mary Shelley (1818), lightly modernized for Breeze.
This is not the author's verbatim edition, an abridgement, or a graded reader.

## Source

Source text: Project Gutenberg eBook #84 (1831 edition), retrieved 2026-10-27.
Gutenberg boilerplate, contents lists, prefaces, illustration placeholders, and bare THE END markers are omitted; the story text is complete from Letter 1 to Walton's final letter, in four letters and twenty-four chapters.

## Modernization

The baseline contains 792 ordered blocks and 74975 words. The adapted text has the same 792 blocks and 74941 words.
`edits.json` records all 94 ordered paragraph-indexed before/after changes, reasons, and occurrence counts. Paragraphs are not split, merged, reordered, deleted, or inserted during modernization. Changes are limited to current spellings, dated polite imperatives, and archaic words whose meaning changed; the author's voice, British spelling, dialect, verse and quoted diction, and period setting remain.
The creature's thou/thee/thy diction, the quoted verse (Coleridge, Wordsworth), and the rhetorical 'nay' are deliberately retained.
The quoted verse blocks keep their joined-line rendering, matching the rest of the remote catalog; display line breaks are a separate reader task.

## Validation

`tests/verify-remote-classics.mjs` checks the catalog bytes and contentVersion hash. The public catalog URL serves the adapted text; the SHA-256 in `manifest.json` matches the uploaded `book.txt`.
