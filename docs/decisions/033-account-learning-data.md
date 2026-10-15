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
cannot modify B or the subsequent A session. A logout returns to the same device
guest namespace. It shows that device collection, not the departing account's records.

Device-local words and history stay on the device. Logging in copies them into
the active account. Logging out shows that same device collection again, not the
account's private words. A later account receives the same device collection.
Nothing in this copy is reserved for the first account, and there is no
confirmation prompt. A previous "retained" choice does not block the copy.

The device original is not deleted. Account-only words are not written back into
the device collection. Data already stored under a different `user:` id is not
read. Exact normalized expression/meaning pairs are not duplicated; a meaning
deleted in one account is not recreated there on the next login. Stable import
ids keep set and session addresses idempotent. An older in-progress exclusive
claim is finished only for the account that already owns that claim.

WebKit allows about 5MB of localStorage for the whole origin. After a logged-in
account has its copy, the unscoped device original moves into IndexedDB
(`breeze-learning-archive`) so the same vocabulary is not stored twice in that
5MB. The live guest collection and the active account's word records stay in
localStorage, because logout and ordinary saves read them synchronously. A
failed archive write leaves the original keys where they are. The next account
still receives that device collection.

Saved-set test summaries stay complete. The newest 40 per set stay in
localStorage; older summaries move to IndexedDB. Disposable caches (discovery,
article previews, crop hints, debug pads) are the first thing removed when a
write hits the quota. The write is retried. Word records are not deleted to
make room, and a quota failure is not reported as a failure to boot.

The first launch after an update copies leftover localStorage records into
IndexedDB, reads each copy back, and removes the localStorage bytes only when
they still match. Saved sets, card sessions and test summaries already kept in
IndexedDB are left in place when the local leftover differs. A launch killed
during the move leaves the remaining localStorage copies until the next launch
repeats the same steps. Words, saved sets, study progress and account records
are not removed unless that read-back matches. The move does not write a new
localStorage receipt, so a device that is already full can still finish it.

The browser site is this same tree. GitHub Pages serves the repository root at
breeze.io.kr, so Chrome, Safari, Firefox and mobile Safari run the same move
as the iOS shell. A private window whose IndexedDB is missing or refuses writes
keeps the localStorage copies and still opens the app; that failure is not a
boot error. When learning records are already on the device,
`navigator.storage.persist()` is requested once where the browser offers it, so
the browser is less free to evict them. An empty first visit does not ask. Two
open tabs take one Web Locks turn for the move. The archive write also unions
with the record already in IndexedDB inside a single transaction, so a second
tab cannot replace a complete copy with a fragment.

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
