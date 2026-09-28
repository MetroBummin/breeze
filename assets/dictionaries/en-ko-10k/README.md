# Lightning EN→KO 10K — preview dataset

## Contents

Exactly **10,000 distinct lowercase single-word headwords**, **14,120 short senses**; at most three senses per POS and one source-backed default. **9,824** headwords have source POS, **176** only unknown POS, and **730** have multiple known POS. **268** inflected aliases are separate and NOT counted as extra headwords.

`dictionary.json` is **858,549 bytes** (about 0.86 MB); gzip is about **0.20 MB**. See `manifest.json` for exact compressed size and hashes. gzip size is not a guarantee of HTTP transfer size or runtime memory.

This is NOT the most frequent 10,000 English words, a complete bilingual dictionary, or a real-user coverage measurement.

## Attribution and license

Adapted from **Korean Wiktionary contributors**, extracted by **Kaikki / Wiktextract**. This dictionary dataset, compressed versions and provenance are distributed under **Creative Commons Attribution-ShareAlike 4.0 International**.

- Source: https://kaikki.org/kowiktionary/
- Raw extraction: https://kaikki.org/dictionary/downloads/ko/ko-extract.jsonl.gz
- License: https://creativecommons.org/licenses/by-sa/4.0/
- Legal code: https://creativecommons.org/licenses/by-sa/4.0/legalcode.en
- Copyright: https://en.wiktionary.org/wiki/Wiktionary:Copyrights

Every shipped sense is traced in `provenance.jsonl.gz` to the original Korean Wiktionary page, raw gloss, English-source line and sense index. The linked article/history identifies the contributors. `source.json` pins source gzip and canonical English-only JSONL SHA-256. No AI-generated meanings or scraped commercial dictionaries are included.

Changes: English/lowercase single-headword filtering; punctuation/qualifier normalization; omission of examples, quotations, audio and form-only/rare/no-gloss entries; conservative shortening of simple synonym lists; POS recovery only from an unambiguous explicit source category; deduplication; three senses per POS; a few documented source-backed first-sense preferences.

Retain attribution, license/source links and this change notice. Distribute adapted dictionary data under CC BY-SA 4.0. Keep dataset licensing distinct from the app code and review release-specific packaging/DRM obligations before App Store distribution. Plain JSON is available alongside gzip without additional technical restrictions.

## Selection and limits

Eligible words found in the three bundled classic EPUBs are prioritized using build-time surface counts; source POS and a stable hash break ties. Corpus hashes are in the manifest. These counts are NOT a runtime frequency system or unbiased coverage test.

`default` normally means first acceptable source sense, NOT empirically most-frequent sense. Source-backed preferences reorder existing matching glosses only. POS/senses may be incomplete even for familiar words; unknowns are not invented. Abbreviated/composite definitions still need human review. Treat output as provisional and keep AI authoritative for final contextual meaning.

## Rebuild

Python 3.10+, standard library only. The English-only source is canonicalized using `json.dumps(..., ensure_ascii=False)` and newline, as recorded by the acquisition workflow. Changed source bytes are rejected.

```sh
python3 tools/build-lightning-lexicon.py --input /path/to/kowiktionary-en.jsonl --manifest assets/dictionaries/en-ko-10k/source.json --corpus-root .
python3 tests/verify-local-lexicon-source.py /path/to/kowiktionary-en.jsonl
node --test tests/verify-local-lexicon.mjs
```

Fewer than 10,000 eligible entries is a hard failure, never padding or form-count inflation.
