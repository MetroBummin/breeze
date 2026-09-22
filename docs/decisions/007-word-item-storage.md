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
