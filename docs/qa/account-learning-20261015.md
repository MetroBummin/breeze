# Account learning verification

Base: `fd67f0a` (fresh `origin/main`, 2026-10-15). Work branch:
`feat/account-owned-study-data`. All records used for tests are synthetic. No
production database, user data, deployment, merge or real-data transfer was used.

## Evidence

- Baseline full `npm test`, sync tests, study tests and typecheck passed before
  implementation. Typecheck has 32 tracked existing diagnostics.
- `npm run test:account`: account switching, late dictionary/auth/read/write/ACK
  results, pending/conflict journals, guest50 import interruption/quota/retry,
  competing-tab ownership, stable address maps, original preservation and
  deleted-import retry; real core/storage/transport code with synthetic data.
- Model tests exercise distinct multi-device IDs, exact-vs-different meanings,
  source disappearance/return, sets-before-words, deletion/exclusion tombstones,
  concurrent frozen sessions, three-replica permutations and 12,000-card states.
- Scoped study tests retain original IndexedDB/localStorage bytes, active simple
  sessions and conflicting branches, and unions of 80 existing test summaries.
- Review SQL is tested only in disposable in-process PGlite: ownership/RLS,
  rejected cross-account writes, conditional revisions, lost-ACK replay,
  deletion and old full-row compatibility. No SQL was applied remotely.
- Chromium runs the real app: guest50, A→B→A with an open set, bookless learning
  when the set arrives before words, and original-data confirmation in ten
  light/dark phone/tablet/desktop/short layouts. Local artifacts:
  `/tmp/breeze-account-scope-proof`. CI uploads the same proof directory.
  After final asset stamping, worker34e1bfe7 also passed cold-offline install,
  new-page study, completion persistence across reload and explicit restart
  (`/tmp/breeze-study-cold-final.log`). Intermediate mixed-hash worker failures
  during concurrent editing were resolved by the final stamp.
- Existing Chromium study-create and study-quota browser suites passed, including
  an actual Web Storage quota fixture (~5,093,140 characters), 5,000 words, 2,500
  overlays, 24 sets, IDB abort/retry, reload and duplicate-input checks.
- Disabled prototype storage tests and its explicitly enabled synthetic browser
  fixture cover account isolation, late writes, 12,000-word constant-size typing
  and original unscoped database preservation. The shipping feature stays false.

## Incremental measurements

`tests/verify-incremental-word-save.mjs` separates one-time loading/indexing from
the actual meaning-create → save → queue → dirty-patch path. At 1k/5k/12k/50k
words, single additions perform zero full vocabulary/tombstone enumerations and
serializations; maximum measured local writes are 248 characters. Initial Node
measurements were ~0.086/0.044/0.046/0.045 ms median per add, versus
~8.77/30.65/71.32/297.54 ms one-time hydration. These are synthetic Node results,
not physical iPhone latency claims; counts and byte bounds are deterministic.

Transport tests use 5,000 words and 1,000 sets, with single-record requests below
500 bytes. A related-set update writes an override plus a small CAS revision,
not the aggregate study document. Slow network ACKs permit subsequent local
edits; ACKs remove only the matching dirty versions. Bootstrap, explicit full
reconciliation after revision conflicts and general set edits may still use
full snapshots. Server JSONB patching retains the existing complete snapshot;
this reduces client serialization/egress, not server row rewrite complexity.

Chromium also checks 20 visible-list cases:1k/5k/12k/50k words × recent,
oldest, alphabetic, book+star and search+alphabetic. All show zero whole-word
enumerations/serializations and zero whole-group walks, with27 mounted rows and
348–372 written characters per addition. At50k words, median times were
4.2/2.5/2.4/2.3/2.2ms respectively (maximum across all cases15.5ms). An independent
full-computation oracle verifies seven edit types across12 filter/sort settings.
Changing a filter itself can compute a new view once; subsequent saves patch it.

The UI sorted index can move O(N) array references on insertion; it does not
visit or serialize all word records. List rendering uses visible rows and a
sparse height index. Initial indexing and changing a global filter remain bulk
operations.

## Reported build 287 storage warning

The inspected main checks in iOS build 273 / marketing 1.9.4. No reliable mapping
from reported installed build 287 to its exact commit was available. Therefore
the failing key and device-specific trigger remain unconfirmed.

The original Korean “device storage is insufficient” suffix comes from the
generic `state.js` localStorage `save()` catch for `QuotaExceededError`. It is not
specific to study-set IndexedDB or evidence of physical disk exhaustion. Its
five-minute throttle is in memory and resets at every launch. Startup paths can
write onboarding/sample markers, pending-word repair, tombstones, sync metadata
and imported word records. Existing study-set migration may free its own legacy
values only after a verified IDB archive; it cannot eliminate every localStorage
quota source. The new wording identifies the app storage limit without guessing
physical free space. No user data is deleted to hide the warning.

Account imports preserve sources and require additional space for destination
records; they can still stop at quota. They retain a durable ownership claim and
retry with the same mapping, never redirecting partial A imports into B. A
failure before saving the intent leaves the original guest owner in place. This
PR does not claim to reproduce or cure the exact build 287 startup incident.

## Remaining validation limits

- WebKit download was blocked by the environment's CDN policy (HTTP 403).
  System Chromium 151 was available; physical iOS/Android and WebKit were not
  validated here.
- A Chromium-only invocation of the existing `verify-lookup-work-browser.mjs`
  fails its “row identities changed” assertion on both untouched `fd67f0a` and
  this branch. It is a separately reproduced baseline browser failure; the
  baseline default `npm test` itself passed.
- Live Supabase permissions/RPC installation, Apple build 287 identity and
  native quota behavior remain unverified. Use the staged rollout/rollback in
  [decision 033](../decisions/033-account-learning-data.md).

The separate historical next-release scope guard already contained24 stale
source hashes on fetched main (outside the default npm suite). Its current
boundary is now frozen against `fd67f0a` plus this exact feature file list; native
release files remain pinned. The original historical export guard still runs on
its original commit and all negative/tamper cases remain active.
