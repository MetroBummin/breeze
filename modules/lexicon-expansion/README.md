# Expansion source acquisition and verification

This is build/QA metadata, not a runtime module. Do not put raw source audits into
an iOS bundle. The runtime needs only the dictionary JSONs and required notices;
full provenance/source-form downloads should remain accessible to recipients.

The 2026-09-28 audit streamed the English-only Kaikki export (1,492,836 rows),
retaining 2,553 records with explicit Korean translations and 808,052 records
with at least one non-inflection lexical sense. It also acquired Kengdic at the
exact commit in source-lock.json. Raw snapshot files are checked by SHA-256
before builds; the production API, user library and billing are never queried.

The English export is rolling. Never silently accept changed bytes when
rebuilding. A future source refresh requires a new reviewed lock and QA run.
GitHub Actions acquisition artifacts have a limited retention period; save them
before expiry to rerun the full-source build. The distributed selected provenance
is permanent and supports the offline hash/ordering/reconstruction verifier.
Full-source and offline-provenance checks are explicitly different modes.

Rebuild with retained source artifacts:

```sh
python3 tools/build-lightning-expansion.py --audit /path/to/source-audit \
  --ko-source /path/to/kowiktionary-en.jsonl
python3 tests/verify-lexicon-expansion-source.py --audit /path/to/source-audit \
  --ko-source /path/to/kowiktionary-en.jsonl
```

Offline integrity/provenance reconstruction (no network):

```sh
python3 tests/verify-lexicon-expansion-source.py
node --test tests/verify-local-lexicon.mjs tests/verify-lexicon-expansion.mjs
node --expose-gc tests/benchmark-lexicon-expansion.mjs
```

Kengdic's README offers MPL 2.0 / LGPL; its datapackage CC label conflicts. This
experiment selects the explicit README MPL option and keeps the pack separate.
A third-party "48K English-Korean" derivative was not used: its lineage/license
assertions and generated additions were not sufficiently verifiable. The
untraceable StarDict package was also not used. No extra word count was invented.
