# Breeze OEWN Korean sense PoC

This directory is a frozen, local-data proof of concept. It does not change the
existing word-lookup/JEV runtime and is not stored in Supabase.

- `source/oewn-500.jsonl` preserves every OEWN 2025 sense for the selected 500
  headwords, one sense per line.
- `ko/senses-ko.jsonl` adds 1–3 Korean dictionary equivalents and a short
  sense-disambiguating Korean gloss, one sense per line.
- `headwords.json` records the three selection buckets.
- `manifest.json` fixes source release, download, checksum, counts, provenance,
  and licensing.

Run `npm run lexicon:validate` and then `npm run lexicon:build`. The build is
deterministic and writes `public/lexicon/lexicon.min.json`.

The Korean text is a PoC editorial layer, not an official OEWN translation.
It should receive native-speaker editorial review before being treated as a
production dictionary.
