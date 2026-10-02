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

## Linear integrity cleanup (2026-09-29)

Startup and sync cleanup group records once. A group without empty meanings needs
no repair work. When an invalid root needs promotion, its existing group supplies
the first surviving meaning in the original enumeration order; current records
are rechecked for earlier legacy-chain repairs. Cleanup never enumerates the
entire vocabulary again for each root. No persistent index, invalidation cache,
worker, storage schema or synchronization contract is introduced.

Wordbook inline edits persist their one changed key; an unchanged blur is a no-op.
Row disclosure changes only that row's extra details and editable state, preserving
other rows, focus and the existing multi-meaning deletion rules. Structural
filter/sort/deletion and remote changes still use the full render path.

## Saved meaning/example pair and transient help

Opening a saved Meaning in a second sentence does not overwrite its example. A
retry that resolves to the same Meaning keeps its original pair; a different
meaning is saved with its own sentence. Reader-only context overlays are not a
write contract. Easy explanations must never enter word items, journals, legacy
snapshots, lookup receipts or sync payloads. They are bounded page/account memory.

## Explicit meaning suggestions from easy explanations (1.7 follow-up)

The same explanation request may return a bounded `suggestedMeaning` only for
clear semantic mismatch, not stylistic rewrites or uncertain interpretations.
A quiet proposal and one action appear inside the expanded explanation. Nothing
is saved until acceptance. For the same source sentence/book, acceptance edits
the saved card like a manual meaning edit. In another context it saves/selects a
separate sense, retaining the original meaning/example pair. The accepted sense
owns that occurrence. Existing study identity checks reject obsolete grades.
Apply validates account, occurrence, selected item and its meaning/example/book
snapshot; stale/deleted records cannot be overwritten. Repeated clicks are no-ops.
Explanation prose and unaccepted proposals remain bounded transient memory only;
accepting does not call AI or consume another quota unit.
