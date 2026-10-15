# Account-owned learning data

Words, word tombstones, pending writes, conflict journals, saved sets, set
exclusions, set deletion tombstones, current card sessions and existing saved-set
test summaries belong to the Supabase `user.id`. A phone is not an owner.
Books, their files, body text, images and reading positions remain local and are
excluded from the learning payload. Captured word/meaning snapshots make sets
usable before words arrive and on devices without their source books.

## Local ownership and imports

`account-scope.js` selects an account/guest namespace before loading words. Auth
transitions invalidate both the synchronization epoch and the local generation;
the old dictionary and study UI are cleared before exposing the next account.
Every asynchronous read/write/response captures its owner. A late A operation
cannot modify B or the subsequent A session. A logout selects a fresh guest
namespace, not the departing account's records.

Fresh guest data is claimed once for the signing-in account. A durable intent
precedes guest rotation; an IndexedDB transaction arbitrates claims between tabs.
Stable import IDs and word/set/session address maps make retries idempotent. A
partial import is resumed only by its owner, including after account changes.
The source remains intact. Failed ownership persistence leaves the source guest
unchanged and prevents account activation. Exact normalized expression/meaning
pairs can share a destination; different meanings survive, and set memberships
and records retain their references. An imported word deleted before retry is
not recreated under a new ID.

Unscoped existing records have unknown ownership. They are never relabeled as
guest or uploaded automatically. A one-time in-app confirmation claims them for
the current account, or retains them without import. Original localStorage and
IndexedDB values are preserved. Declining does not delete anything. Reinstalling
or clearing site storage is not a migration or recovery procedure.

## Synchronization and compatibility

The existing `public.words` conditional-write wordbook is retained. Conflicting
meanings remain active as deterministic additional senses and in the owner's
conflict journal. Study metadata lives in a separate `public.study_state` table;
putting arbitrary study rows in `words` would make old clients interpret them as
legacy vocabulary. Owner RLS and grants are explicit in the review SQL.

Set IDs and session IDs are globally unique for new data; legacy IDs are remapped
deterministically with their references. Set deletion tombstones survive stale
devices. Missing source vocabulary alone is not a deletion. Explicit word
tombstones remove source cards while exclusion history remains durable, so a
returning source does not silently undo an exclusion. Independent in-progress
session branches are preserved rather than interleaving answers. Existing test
data consists of recent score summaries, not recoverable question/answer sheets;
the implementation does not invent missing details.

## Cost boundary

Initial hydration, legacy import and conflict reconciliation may inspect a whole
collection. Ordinary word saves use per-item records, a small write journal,
root indexes and revisioned dirty keys. Tombstones also use per-item records.
Word deltas are batched and sent through a revision-conditional RPC that patches
the existing full server snapshot. A missing RPC retains local pending work; it
does not silently upload the whole vocabulary on each edit. Related set changes
use a vocabulary index and per-set storage/transport patches. Network ACKs never
gate local lookup or card interaction.

## Rollout and rollback

This PR does not apply SQL, deploy, merge, or transfer real user data. Review
`server/sync/study-state.sql` and `server/sync/wordbook-patch.sql`, then promote
them through the normal migration process under a separate authorization. First
validate RLS/CAS and mixed-version behavior in a disposable staging project, then
apply the additive schema/RPCs before releasing the new client. Run synthetic
multi-device/account and interrupted-import tests on physical iOS and Android.

Rollback should disable the new cloud path or revert to an account-safe client,
retaining all namespaces, source archives, receipts and server rows. Do not drop
tables or restore the old shared-local-data client on a shared device: that client
cannot enforce the new account boundary. Existing word rows stay old-client
readable, but an old app's local behavior cannot be repaired by server SQL. No
automatic downgrade copies scoped account data back into unscoped storage.

See [verification and remaining limits](../qa/account-learning-20261015.md).
