# Sync safety verification

Run `npm run test:sync` (also included in `npm test`). The stateful transport
executes the production sync functions in isolated Node VM devices. It clones
reads, checks conditional updates at commit time, and can delay/fail individual
requests. It is not a substitute for an iPhone network trace or a live PostgREST
integration test. It never contacts production Supabase or handles real users.

## Storage contract

- `__breeze_vault_meta_v2__` remains recovery/key metadata. Old version/migration
  fields remain readable for compatibility with previously stored rows.
- The authoritative version of a new vocabulary snapshot is its own random
  `data.revision`; a small projection reads this without fetching `envelope`.
  `data.sync` on the SAME row contains migration status. Completing the vault
  write and its status therefore cannot be split by a crash.
- Both vocabulary and progress use conditional UPDATE against the revision they
  read. Rows predating revisions are guarded by a null revision AND the original
  `updatedAt`. First writes use INSERT; a unique-key conflict triggers a reread.
- A losing writer rereads, merges, and retries (at most four attempts). There is
  no unconditional overwrite fallback. Exhaustion keeps local dirty data for
  the next sync. Per-word conflicts retain the existing word/tombstone timestamp
  rule; this does not introduce per-sense merging for simultaneous edits to the
  same word. Old application binaries do NOT implement CAS and must be updated.
- Initial progress separation copies/merges progress with a successful CAS BEFORE
  removing embedded positions and committing `progressSeparatedAt` in the vault.
  A failure preserves the old encrypted server source, even for remote-only books.
- Account changes invalidate queued and in-flight work with a session epoch.
  This resets remote caches, not the user's intentionally device-local library.

## Application-level request counts after initialization

| Path | Requests | Full vocabulary download |
| --- | ---: | ---: |
| Unchanged combined sync | 3 small reads (recovery metadata, vault header, progress) | 0 |
| Vocabulary edit, no collision | 4 (metadata, header, snapshot, conditional save) | 1 |
| Progress-only edit, no collision | 2 (progress read, conditional save) | 0 |
| Idle without user changes | 0 | 0 |

The extra small header read avoids needing a server SQL/RPC deployment or an
unsafe separately-written version marker. Conditional writes return only `key`,
not the vault. Initial migration and conflict retries take additional requests;
wire-level SDK retries are not counted by this test double.

## Regression coverage

Concurrent vocabulary additions; delete versus stale write; racing initial
inserts; legacy rows without revisions; repair with a clean local dirty flag;
migration failure and restart; interruption between progress and vault writes;
lost acknowledgement after commit; active-reader protection; concurrent progress
for different books; logout and account-change cache clearing; late responses
including same-account relogin; same-millisecond local writes; progress changes
during identity collection; bounded conflict retry; 402 cooldown; unchanged and
progress-only egress; failed legacy reads; collision-free snapshot revisions.
