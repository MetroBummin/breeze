# Great Expectations — lightly modernized edition

Great Expectations by Charles Dickens (1861), lightly modernized for Breeze.
This is not the author's verbatim edition, an abridgement, or a graded reader.

## Source

Source text: Project Gutenberg eBook #1400, retrieved 2026-10-27.
Gutenberg boilerplate, contents lists, prefaces, illustration placeholders, and bare THE END markers are omitted; the story text is complete from Chapter 1 to Chapter 59, in fifty-nine chapters, including Dickens's two stage markers.

## Modernization

The baseline contains 3894 ordered blocks and 184336 words. The adapted text has the same 3894 blocks and 184333 words.
`edits.json` records all 141 ordered paragraph-indexed before/after changes, reasons, and occurrence counts. Paragraphs are not split, merged, reordered, deleted, or inserted during modernization. Changes are limited to current spellings, dated polite imperatives, and archaic words whose meaning changed; the author's voice, British spelling, dialect, verse and quoted diction, and period setting remain.
Joe Gargery's dialect spellings (wot, oncommon), the grammar-lesson 'thou', and Dickens's two stage markers ('THIS IS THE END OF THE FIRST/SECOND STAGE OF PIP'S EXPECTATIONS.') are deliberately retained.
The 'Lunnon town' song keeps its joined-line rendering, matching the rest of the remote catalog; display line breaks are a separate reader task.

## Validation

`tests/verify-remote-classics.mjs` checks the catalog bytes and contentVersion hash. The public catalog URL serves the adapted text; the SHA-256 in `manifest.json` matches the uploaded `book.txt`.
