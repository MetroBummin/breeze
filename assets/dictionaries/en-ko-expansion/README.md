# Additive local English→Korean dictionary experiment

Built 2026-09-28 on top of PR #45's immutable 10K data. This directory adds
**30,000 distinct headwords**; with the baseline it contains **40,000 headwords
and 56,255 Korean senses**. It is not an English-frequency top-40K dictionary.

| Pack | New headwords | Senses | License | Role |
|---|---:|---:|---|---|
| ko-additional | 1,828 | 2,190 | CC-BY-SA-4.0 | Remaining eligible Korean Wiktionary English entries |
| en-translations | 570 | 768 | CC-BY-SA-4.0 | Explicit Korean translations of English Wiktionary entries |
| kengdic-fallback | 27,602 | 39,177 | MPL-2.0 | Experimental, lower-priority, **unknown-POS** fallback |

The unchanged baseline has 10,000 headwords / 14,120 senses. All four dictionary
JSONs together: **3,404,212 bytes**. Sum of their gzip files: **772,208 bytes**.
Provenance files and runtime heap are additional; these figures are not RAM usage.
There are 11,729 headwords with at least one source-backed POS and 28,271 with
unknown POS only across the combined data. No POS tagger can recover absent
sense-level POS reliably merely from the English spelling.

## Quality boundary

Kengdic's own README warns that its data needs cleaning. We use only an ENTIRE
lowercase single-English-word gloss paired with a short Korean field. We do not
split English definitions into words or machine-translate missing entries.
Each added Kengdic headword is independently present as a lexical headword in
the English Wiktionary extraction; this checks English spelling/lexical identity,
**not translation accuracy or sense POS**. Obvious unsuitable strings and several
reviewed defects are excluded. Alternate Korean translations are deduplicated,
with at most three per POS. They are not necessarily three distinct semantic
senses and the first is not statistically the most frequent meaning.

Kengdic remains opt-in through `allowExperimentalFallback: true`. The default
pack loader uses only the baseline and the two Wiktionary extensions (12,398
headwords). Do not silently switch a production Reader to the 40K preset.
Manual bilingual review and device testing are still required before release.

## Provenance and licenses

Each pack has its own dictionary JSON, gzip and `provenance.jsonl.gz` with a
source URL, raw Korean text and exact source row/translation index. Kengdic proof
also includes original record ID, raw English field and separate English-lemma
evidence via a line reference. English-lemma evidence is kept in a separate
CC-licensed `en-lemma-evidence.jsonl.gz`, not embedded in MPL records. No literary quotation examples, user reading text or API secrets are
included in the shipped provenance.

Do not relabel the combined collection as CC-BY-SA. Keep the MPL and CC data in
separate files and preserve the notices below and in each subdirectory. This
bundle is an aggregate of separately licensed datasets, not a relicensing grant
for third-party data. The adapter does not change the repository's code license.

- Korean and English Wiktionary contributors; extraction by Kaikki/Wiktextract.
  Text adaptations in `ko-additional` and `en-translations`: CC BY-SA 4.0.
  https://creativecommons.org/licenses/by-sa/4.0/
  https://en.wiktionary.org/wiki/Wiktionary:Copyrights
- Joe Speigle and Kengdic contributors. We select the **MPL 2.0 option explicitly
  offered in the pinned upstream README**. Its datapackage metadata names a
  different CC license; we do NOT rely on or repeat that CC attribution.
  https://github.com/garfieldnate/kengdic/blob/793de2369c9a98b944154eb4695d26854d2de59b/README.md
  https://www.mozilla.org/MPL/2.0/
- English-lemma evidence in the separate root evidence file is Wiktionary metadata under
  CC BY-SA 4.0, not Kengdic POS metadata. The CC evidence file and MPL translation provenance remain separate;
  a numeric source-line reference links them.

Modification: selecting rows; normalizing whitespace; reducing source synonym
lists only where the existing builder permits it; deduplication; per-POS cap;
source-first default; no generated Korean meanings. Full build scripts and
human-readable JSON source form are included in this repository and handoff ZIP.
`modules/lexicon-expansion/source-lock.json` identifies the exact acquired bytes.
