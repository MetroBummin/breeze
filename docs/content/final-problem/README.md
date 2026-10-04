# The Final Problem — complete illustrated edition

Complete English work by Arthur Conan Doyle (1893), lightly modernized.
This is not Doyle’s verbatim edition, an abridgement, a graded reader or a Korean translation.

## Official source and continuous coverage

Source acknowledgment: [Project Gutenberg #834](https://www.gutenberg.org/ebooks/834).
Official [plain text](https://www.gutenberg.org/cache/epub/834/pg834.txt) inspected and retrieved on 2026-10-04 through the permitted web research tool. The executor proxy rejected direct downloads with CONNECT403; no bypass or mirror text was used.

`source-lines.json` contains every consecutive research-browser line 10337–11132, with no missing indices. `source-header.txt` records the ebook header (lines0–26). `source-license.txt` preserves the complete license/footer from START: FULL LICENSE through the end of the source. These are research-browser captures, not downloaded raw-file bytes; their SHA-256 values must not be described as hashes of the official download. Browser line numbers are provenance locators, not permanent website fragments.

`original.txt` joins soft line wraps, removes plain-text italic underscore delimiters and restores structural paragraph breaks where noted. Its complete whitespace-normalized character sequence equals the captured official source sequence after removing those markup delimiters. No prose, dialogue, clue, chapter or ending is omitted or added.

The complete story runs from “It is with a heavy heart” through Watson’s final “the best and the wisest man whom I have ever known.” No preceding Naval Treaty text, collection heading or ebook wrapper is present. The actual collection section is XII. The Final Problem; the source catalog and source edition numbering differ, so extraction follows the full story heading in the text, not the catalog contents number.

## Audited modernization

The original baseline contains 123 ordered blocks and 7,150 whitespace-delimited words. The adapted asset has the same 123 blocks, 7,150 words and 39,124 UTF-8 bytes.

`edits.json` records all 6 ordered paragraph-indexed before/after changes, reasons and occurrence counts. Tests replay them to byte-for-byte equality with `assets/longreads/final-problem.txt`. Paragraphs are not split, merged, reordered, deleted or inserted during modernization. Changes are limited to current spellings, dated polite imperatives and archaic lexical expressions; Watson’s voice, British spelling, uncertainty, dialogue and period setting remain.

Moriarty’s dates, the escape instructions, the names of trains/towns, the farewell letter, police papers and Watson’s inferred conclusion are unchanged. An illustration must not turn the inferred final struggle into a witnessed event.

- Original SHA-256: `0f4b845ae27eeae7a3bee9edbf31c4a8002ee338e2efed3bfef35f72ccabf838`
- Adapted SHA-256: `9d1f3c4140d80894937695add3b1ca60e6054ac03bbd081d4dedc55733556b90`
- Source capture, header and license hashes: `manifest.json`

## Source reuse and attribution

The source catalog labels the original text public domain in the USA; this is not worldwide clearance. Follow the existing [distribution and attribution policy](../speckled-band/README.md#distribution-and-attribution): source boilerplate is separated from the adapted reading text, Arthur Conan Doyle remains credited, the Gutenberg source is linked in a separate acknowledgment, and the adaptation is clearly identified as lightly modernized. Do not present it as a branded Project Gutenberg edition. [Gutenberg’s policy](https://www.gutenberg.org/policy/license.html) distinguishes underlying text copyright from trademark and ebook-license conditions. Editorial source/license records under docs are excluded from the native bundle.

## Internal scene anchors — spoilers

`scene-anchors.internal.json` resolves the ten proposed scenes to unique canonical original/adapted paragraphs. It records the depicted paragraph’s SHA-256 and the next paragraph prefix for the existing before-rendered figure convention. Placement is AFTER the event being illustrated; this avoids revealing the passage before the reader reaches it. Ending/clue/mid/late scenes must not appear in covers, previews or promotional galleries. Teaser candidates are proposals, not artwork approval.

The complete text now has an independent LONG_READS catalog identity, its approved cinematic cover and ten interior illustrations. `illustration-anchors.json` records the verified final placements; `../holmes-artwork/asset-manifest.json` records source and derivative hashes. Covers alone appear in previews; no interior scene is promoted.

## Validation and handoff

`tests/verify-holmes-complete-texts.mjs` checks continuous source coverage, full source equality, exact edit replay, actual preserveParagraphs TXT parser behavior, hashes/counts/boundaries, all ten anchors, and complete source/license records. Hound checks all fifteen chapters and original frontmatter plus the true concluding paragraph. Existing three story assets are unchanged. The source audit remains independent of the illustrated catalog and renderer. Release numbers and server behavior are unchanged.

The full aggregate `npm test` and complete-text browser checks passed in Chromium and WebKit during illustrated integration: actual normal TXT import, every canonical paragraph rendered, visible word-lookup spans, real IndexedDB reload, and offline late-paragraph position restoration. Run the focused source/import checks with `npm run test:holmes-texts`. See [integration validation](../../qa/holmes-illustrated/README.md) for the five-book visual and native-bundle evidence and remaining physical-device release checks. Browser timings are not device performance evidence.
