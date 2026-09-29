# Word lookup recovery and usable-answer quota

## Problem and verified boundary
Both the PR base and the deployed Breeze `dict` function debit `take_ai_quota`
(or anonymous trial quota) before the provider runs. A client retry can therefore
spend another unit without delivering a usable meaning. The deployed three-arg
quota RPC has account-specific overrides; the default is now 3000 quota/day in Seoul.
This change preserves that RPC and its overrides,
existing usage rows, meaning replacement rules and provider telemetry/fallbacks.

## Contract
The new client uses `op: look_v2` with a random UUID `lookupId`. A service-role-only
Postgres RPC owns receipt replay and the quota debit. Its subject is the
server-authenticated account, or the existing anonymous device identity; the ID
is bound to SHA-256 of normalized lookup input (including retry/context/candidates).
Reusing it with different input fails with request_conflict. Receipts store only
the validated lexical answer, fingerprint and owner, not source sentences/books.
User receipts cascade on account deletion and are not exposed to client roles.

Before provider work the RPC checks for replay and available quota without
consuming it. After a usable answer it atomically debits one unit for words or two for sentences and
persists the answer. Same-ID calls serialize with a transaction advisory lock;
usage upserts retain the cap across different IDs. A lost HTTP response replays
that answer, including when the user has since reached quota. Technical failures
never reach the debit. Anonymous trial/global caps use the same success-only
rule. A concurrent request that loses the last quota slot receives the quota
error, not a meaning that exceeded the cap. Failed attempts can still incur
provider cost; telemetry records them independently of user quota.

The client has one automatic HTTP retry per logical lookup for timeout, 5xx,
transport or unusable contract. Each attempt has a nine-second abort controller
linked to the existing opening lifetime. Quota/login/trial/offline/4xx are not
retried. Cancellation never starts recovery or revives a surface; an already
arrived usable response can still populate the existing cache/storage path.

Failed logical requests retain their exact payload/ID and automatic-attempt
budget in a bounded in-memory recovery map (32 entries, current app session,
scoped by account/device and occurrence). A manual retry after technical failure
recovers that request without another automatic retry. A usable answer clears
recovery, so subsequent explicit quality retry is a new ID and costs one unit
when successful. Restarting the app loses this recovery map; no client quota
arithmetic or remote usage correction is introduced.

READY still waits for 250ms motion idle. Only a lookup that showed pending feedback
needs 750ms of continuous SHOWN visibility before user motion dismisses it.
An immediately available saved meaning dismisses on its first user scroll or
same-word retap, with no minimum display time or idle resurrection. Live AI results, re-reveals and cache hits use the normal glass pill without an arrival accent.
The mini pill entry animation also uses opacity only, preserving live placement.

## Deployment boundary
The two scoped migrations were applied to production and dict v53 deployed on 2026-09-29. The user approved main integration and a local iOS archive on 2026-09-29, with the arrival accent removed. The scoped deployment consists of
`supabase/migrations/20260928152749_word_lookup_receipts.sql` to the **Breeze**
project (`hrtfhojbhqvaoiulspto`), then deploy `dict` including `logical-lookup.ts`,
and `20260928160147_lookup_trial_limits.sql`. The repository's existing Supabase config references a
separate project; do not blindly push all repository migrations.

`look_v2` deliberately fails closed against the old Edge function's bad_op.
It must not fall back to unprotected legacy look and automatically retry there.
Old clients still use look, which the new Edge handles with success-only debit
and a generated request ID, but cannot recover a lost response by ID. Seed stays
unmetered. Anonymous devices have one shared lifetime 50-quota balance in anon_usage, preserving existing consumption: words cost 1 and sentences cost 2. Sentence receipt replay shares that balance and only charges usable translations. Login defaults to 3000/day with the same costs. Existing account overrides remain. Anonymous global safety cap remains in place.

## Verification
`npm run test:word-recovery` executes the real migration/RPC with PGlite, the real
Edge handler with fake provider responses, recovery/cancellation unit tests, and
Chromium/WebKit AI arrival/explicit retry/cache browser tests.
`npm run test:word-scroll` covers 500ms unseen versus 750ms seen, idle, off-screen
non-resurrection and ownership. Existing reader-feedback, lookup lifecycle,
word-presentation, PDF highlight and lookup contract regressions are also checked.
Local SQL/fixtures do not establish production migration or physical-device proof.
