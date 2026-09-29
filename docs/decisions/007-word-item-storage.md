# Local vocabulary item persistence

Keep the legacy `breeze.words` snapshot readable and unchanged. Load per-item
`breeze.word-item.*` overrides on top; an explicit JSON null means deletion.
Existing learning records, tombstones and sync payloads retain their shape.

`saveWords(key)` serializes only that Meaning for frequent pick/star/mark changes.
Bulk callers compare against the last persisted values and write only changed or
deleted entries. They still scan the vocabulary, which is a deliberate fallback
for operations that change several related meanings or receive a sync merge.

Before writing items, save the whole small transaction to
`breeze.word-write.pending`. Startup overlays this transaction last, so interrupted
multi-Meaning edits remain coherent. Keep it until all item writes succeed; retry
pending changes on the next save. An unsuccessful write never advances the in-memory
persisted-value cache. Unresolved lookup placeholders are never saved.

The legacy snapshot remains a fallback, not a second current copy; older app code
cannot read new overrides. No server migration or deployment is part of this change.
`tests/verify-word-item-storage.mjs` checks legacy loading, one-item writes among
5,000 records, interrupted batches, retry, deletion and unresolved lookups.

## 2026-09-25 integrity follow-up
Local persistence failure now stops sync before CAS/dirty clearing. Different concurrent Korean definitions are preserved in a local conflict journal before record-level LWW replaces a value; export with `breezeExportWordConflicts()`. This is conflict preservation, not automatic field-level merge.

Single-word lookup startup, cancellation, AI result and English metadata completion
also pass the changed key. These paths must not serialize unrelated saved cards
before starting a request or revealing its result. Multi-meaning operations keep
the bulk fallback and interrupted-transaction recovery remains unchanged.

Lookup mutations with known changes mark the existing sync dirty flag immediately
and retain the four-second upload debounce, without first serializing the whole
vocabulary. Generic sync callers keep snapshot comparison; a known mutation
invalidates that comparison baseline. Offline dirty state is preserved.
