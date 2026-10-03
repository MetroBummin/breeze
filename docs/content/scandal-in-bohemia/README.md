# A Scandal in Bohemia — Breeze edition

Complete English story by Arthur Conan Doyle, first published in 1891 and
collected in The Adventures of Sherlock Holmes (1892), story I.
This is a lightly modernized adaptation, not Doyle’s verbatim text or a graded
reader. No Korean translation or third-party modern edition is bundled.

## Source and boundaries

Acknowledgment: [Project Gutenberg eBook #1661](https://www.gutenberg.org/ebooks/1661).
The complete official [plain text](https://www.gutenberg.org/cache/epub/1661/pg1661.txt)
and [HTML](https://www.gutenberg.org/cache/epub/1661/pg1661-images.html) boundaries
were checked on 2026-10-03. The first two stories were retrieved through the web
research tool, with continuous coverage of official text lines 53–2111. Direct
Gutenberg downloads remain proxy-blocked in this executor.

The baseline contains only this story, extracted between full story headings,
not table-of-contents entries. Soft line wraps are joined and plain-text italic
underscore markers removed; source punctuation, accents and currency notation
remain. The web extractor collapses some blank lines. The older
[GITenberg mirror](https://github.com/GITenberg/The-Adventures-of-Sherlock-Holmes_1661/blob/master/1661.txt)
provides paragraph/dialogue breaks only: every word and punctuation character
comes from the current official text, not the mirror’s differing wording.
Complete concatenated text matches the official extract exactly after whitespace
normalization and removal of italic delimiters. Paragraph counts below describe
this reader layout, not a count of raw Gutenberg blank-line blocks. No source
text is omitted, reordered or added when restoring those breaks.

The three original section headings I, II and III are retained as reader blocks. Word counts include those three one-word headings (8,518 original prose words). The client’s whitespace count is 8,522 after adaptation. The intentionally German word order and paper watermark groups are unchanged; Mrs. Turner, Irene Norton née Adler, the two-person photograph and the separate portrait remain as written.

The complete concluding paragraph is recorded in `manifest.json`; no following
story, collection title, source boilerplate or summary appears in Reader.

## Audited content

| | Original baseline | Adapted reader asset |
|---|---:|---:|
| Whitespace-delimited words | 8,521 | 8,522 |
| Ordered reader paragraphs/section blocks | 261 | 261 |

- Original SHA-256: `e3dc11c807cf06fd3d9b5aa985cf5e4882fdefdf87c18231488314b531f9a42e`
- Adapted SHA-256: `ec92ace7eccf6e9b93cadbba6be46ef6d19bb27c0d183a44b094219c62e3b50e`
- Asset: `assets/longreads/scandal-in-bohemia.txt`

`edits.json` contains all 10 ordered, paragraph-indexed edits, their
reasons and occurrence counts. Tests replay them to exact equality with the
asset and verify both hashes, boundaries, counts and catalog identity. There is
no paragraph splitting, merging, removal or movement during modernization.
Changes are limited to dated polite expressions/lexical meanings and closed
spellings such as “to-night” → “tonight”; Watson’s voice, characterization,
Victorian setting, uncertainty and sequence of clues remain. Original foreign
phrases and period objects are retained, with a separate attribution glossary.

## Distribution and cover

The original is public domain in the USA; this is not worldwide clearance.
The same verified [distribution and trademark policy](../speckled-band/README.md#distribution-and-attribution)
applies: stripped source boilerplate, separate linked acknowledgment and explicit
original/adapted attribution. The modified story is not presented as a branded
Project Gutenberg edition. Editorial baselines under `docs/` are excluded from
the native app bundle; only the adapted asset is copied into `www`.

This story uses the existing title-based fallback cover. The selected artwork
for The Speckled Band is not reused, and no new visual series is selected.
