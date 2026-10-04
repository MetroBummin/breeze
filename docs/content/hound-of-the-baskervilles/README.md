# The Hound of the Baskervilles — complete illustrated edition

Complete English work by Arthur Conan Doyle (1902), lightly modernized.
This is not Doyle’s verbatim edition, an abridgement, a graded reader or a Korean translation.

## Official source and continuous coverage

Source acknowledgment: [Project Gutenberg #2852](https://www.gutenberg.org/ebooks/2852).
Official [plain text](https://www.gutenberg.org/cache/epub/2852/pg2852.txt) inspected and retrieved on 2026-10-04 through the permitted web research tool. The executor proxy rejected direct downloads with CONNECT403; no bypass or mirror text was used.

`source-lines.json` contains every consecutive research-browser line 31–7203, with no missing indices. `source-header.txt` records the ebook header (lines0–26). `source-license.txt` preserves the complete license/footer from START: FULL LICENSE through the end of the source. These are research-browser captures, not downloaded raw-file bytes; their SHA-256 values must not be described as hashes of the official download. Browser line numbers are provenance locators, not permanent website fragments.

`original.txt` joins soft line wraps, removes plain-text italic underscore delimiters and restores structural paragraph breaks where noted. Its complete whitespace-normalized character sequence equals the captured official source sequence after removing those markup delimiters. No prose, dialogue, clue, chapter or ending is omitted or added.

The complete novel retains all fifteen chapter headings and chapter titles, the dedication, the original contents, letters, reports, diary extracts, family legend, final retrospection and THE END. The prose ending before THE END is recorded separately in manifest.json. The chapter 7, 8 and 10 title/body breaks, collapsed by the research extractor, are restored as separate blocks; this changes layout only and preserves the complete ordered source character stream after whitespace normalization.

## Audited modernization

The original baseline contains 1328 ordered blocks and 59,258 whitespace-delimited words. The adapted asset has the same 1328 blocks, 59,266 words and 324,921 UTF-8 bytes.

`edits.json` records all 9 ordered paragraph-indexed before/after changes, reasons and occurrence counts. Tests replay them to byte-for-byte equality with `assets/longreads/hound-of-the-baskervilles.txt`. Paragraphs are not split, merged, reordered, deleted or inserted during modernization. Changes are limited to current spellings, dated polite imperatives and archaic lexical expressions; Watson’s voice, British spelling, uncertainty, dialogue and period setting remain.

The older diction of the embedded family manuscript, including “betwixt,” is deliberately retained. The letter’s clipped clue words, dates, period objects, names, sums, hound explanation and all resolutions are unchanged.

- Original SHA-256: `d1d40202d1a069967b0b82768bd9c34f6c50834a33714add37182d1cc9ca899a`
- Adapted SHA-256: `19906dcd8bd6e3127bfd6676361901199dd10ba6bf3077963e6de2768d08b2c4`
- Source capture, header and license hashes: `manifest.json`

## Source reuse and attribution

The source catalog labels the original text public domain in the USA; this is not worldwide clearance. Follow the existing [distribution and attribution policy](../speckled-band/README.md#distribution-and-attribution): source boilerplate is separated from the adapted reading text, Arthur Conan Doyle remains credited, the Gutenberg source is linked in a separate acknowledgment, and the adaptation is clearly identified as lightly modernized. Do not present it as a branded Project Gutenberg edition. [Gutenberg’s policy](https://www.gutenberg.org/policy/license.html) distinguishes underlying text copyright from trademark and ebook-license conditions. Editorial source/license records under docs are excluded from the native bundle.

## Internal scene anchors — spoilers

`scene-anchors.internal.json` resolves the ten proposed scenes to unique canonical original/adapted paragraphs. It records the depicted paragraph’s SHA-256 and the next paragraph prefix for the existing before-rendered figure convention. Placement is AFTER the event being illustrated; this avoids revealing the passage before the reader reaches it. Ending/clue/mid/late scenes must not appear in covers, previews or promotional galleries. Teaser candidates are proposals, not artwork approval.

The complete text now has an independent LONG_READS catalog identity, its approved cinematic cover and ten interior illustrations. `illustration-anchors.json` records the verified final placements; `../holmes-artwork/asset-manifest.json` records source and derivative hashes. Covers alone appear in previews; no interior scene is promoted.

## Validation and handoff

`tests/verify-holmes-complete-texts.mjs` checks continuous source coverage, full source equality, exact edit replay, actual preserveParagraphs TXT parser behavior, hashes/counts/boundaries, all ten anchors, and complete source/license records. Hound checks all fifteen chapters and original frontmatter plus the true concluding paragraph. Existing three story assets are unchanged. The source audit remains independent of the illustrated catalog and renderer. Release numbers and server behavior are unchanged.

The full aggregate `npm test` and complete-text browser checks passed in Chromium and WebKit during illustrated integration: actual normal TXT import, every canonical paragraph rendered, visible word-lookup spans, real IndexedDB reload, and offline late-paragraph position restoration. Run the focused source/import checks with `npm run test:holmes-texts`. See [integration validation](../../qa/holmes-illustrated/README.md) for the five-book visual and native-bundle evidence and remaining physical-device release checks. Browser timings are not device performance evidence.
