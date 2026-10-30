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

The server recovers inside one lookup. Word lookups use the hedged request in
"Hedged word lookup" below: one 8 second deadline, no per-provider cap, and no
second call to the same provider. The client does not automatically repeat
the HTTP request. Each lookup still has a nine-second abort controller linked to
the existing opening lifetime. Quota/login/trial/offline/4xx are not retried.
Cancellation never starts recovery or revives a surface; an already arrived
usable response can still populate the existing cache/storage path.

Failed logical requests retain their exact payload and ID in a bounded
in-memory recovery map (32 entries, current app session, scoped by
account/device and occurrence). The manual "다시 시도" button reuses that saved
ID. A usable answer clears the map, so a later explicit quality retry is a new
ID and costs one unit when successful. Restarting the app loses this recovery
map; no client quota arithmetic or remote usage correction is introduced.

READY still waits for 250ms motion idle. Only a lookup that showed pending feedback
needs 750ms of continuous SHOWN visibility before user motion dismisses it.
An immediately available saved meaning dismisses on its first user scroll,
with no minimum display time or idle resurrection. Retapping the selected token
dismisses every word lookup immediately, including pending or freshly arrived
results; the 750ms reading window applies only to scrolling. Live AI results, re-reveals and cache hits use the normal glass pill without an arrival accent.
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
unmetered. Anonymous devices share one balance in anon_usage: words cost 1 and sentences cost 2. Sentence receipt replay shares that balance and only charges usable translations. Login defaults to 3000/day with the same costs. Existing account overrides remain. Anonymous global safety cap remains in place.

The dict function no longer passes the old per-device lifetime of 50. `ANON_FREE` and `ANON_SENT_FREE` are 1_000_000_000, inside PostgreSQL int4, so word lookups, sentence lookups, easy explanations, and saved-set grading are not stopped per device. They still share `anon_usage` and the unchanged `anon_daily` cap of 2,000 calls per Seoul day. No migration: the receipt functions already take the limit as an argument.

## Verification
`npm run test:word-recovery` executes the real migration/RPC with PGlite, the real
Edge handler with fake provider responses, recovery/cancellation unit tests, and
Chromium/WebKit AI arrival/explicit retry/cache browser tests.
`npm run test:word-scroll` covers 500ms unseen versus 750ms seen, idle, off-screen
non-resurrection and ownership. Existing reader-feedback, lookup lifecycle,
word-presentation, PDF highlight and lookup contract regressions are also checked.
Local SQL/fixtures do not establish production migration or physical-device proof.

## Retry failure investigation (2026-10-06)

The server treated the client-supplied lemma candidates as a complete allow-list.
An old client sends only `slept`, or `studi/studie/studied`; a correct model answer
`sleep` or `study` therefore failed `invalid_lemma`. All provider fallbacks and
manual retries ran the same validation. A second word could succeed because its
lemma was in the list. This is a deterministic validation failure, not a cached
negative result. The deployed `dict` v59 validator was inspected read-only and
matched the repository's pre-fix validator. The same source exists in the
repository's 1.7(216) commit; that is not independent proof of an App Store
user's precise installed build or the cause of every reported failure.

Word validation now derives candidates from the selected server-token using the
shared lexical core, including attested irregulars, `-ied`, and possessive forms.
Exact selected spelling remains valid, including acronyms. Arbitrary client
`word/cands` can no longer authorize an unrelated headword. Member alignment,
word/expression shape, Korean answer, and expression validation stay strict.
Validation uses a separate `lookupLemmaCands()` helper in the same core. It leaves
both `lemma()` and the entire existing `lemmaCands()` result unchanged: even
appending a candidate there can redirect `keyOf()` to an existing saved card.
The repair does not rename vocabulary/phrase identities. This is bounded morphology,
not a claim of a complete English dictionary.

Derivation happens only during answer validation. Normalized lookup input,
fingerprints, logical IDs, receipt replay, and success-only quota remain intact,
including for old clients with stale candidates.

`tests/verify-word-lemma-validation.mjs` uses the real server/client recovery
functions with synthetic provider responses. It covers old-client requests,
valid/invalid headwords, casing, possessives, existing word goldens, technical
failure followed by same-ID manual recovery, another-word success, and no
duplicate receipt charge. It makes no paid AI request.

For an explicitly approved future deployment, preserve repository-relative paths
in the bundle: entrypoint `server/dict/index.ts`, all its sibling imports, and
`modules/lexical/core.js`. The new shared-core import must not be omitted or
flattened. This change itself does not deploy the function or publish an app.


## Authentication-inclusive deadlines (2026-10-07)

A caller's AbortSignal previously cancelled fetch only. `dictCall` first awaited
`getSession()`, so a session refresh that never settled could keep a lookup loading
past its deadline; a late auth result could still dispatch an already-cancelled
request. This is a separately reproduced loading defect, not proof of the cause
of a reported error-pill/retry failure.

The shared transport now races the entire auth/fetch/body operation against
cancellation. Each call has a 30-second maximum; the existing nine-second word
attempt and opening cancellation win sooner. Sentence translation and both
explicit help callers use the same transport boundary. No auth SDK state is
cancelled or changed. Once the call is cancelled, late auth cannot dispatch and
late fetch/body results cannot return to its consumer. Deadline failure remains
`null`, preserving technical recovery, IDs, quota and existing error surfaces.

Word fetch and dictionary-load wrappers own their loading flags with per-record
request tokens. An older cancelled wrapper cannot clear a newer same-record or
replacement-card request. Already arrived usable answers keep the existing
cache/storage contract and never regain authority over a closed surface.

`tests/verify-word-auth-deadline.mjs` executes the real transport, recovery and
word wrappers with deterministic deadlines. It covers never-settling/late auth,
pre-aborted signals, close/navigation, same-record reopen, replacement cards,
ignored fetch/body aborts, shared auth completion, normal auth, anonymous fallback,
HTTP errors and manual retry. Providers and credentials are synthetic; these tests
make no paid or production requests.

## AI-owned word canonical (2026-10-09)

The user approved trusting the model's word canonical and contextual meaning.
The bounded morphology validator still omitted valid forms such as
`Selfies -> selfie`, `brownies -> brownie`, and `indices -> index`. A correct
model response could therefore fail every fallback and manual retry. This is a
reproduced mechanism, not proof of every reported production failure.

Word canonical is no longer compared with client or server lemma candidates.
The prompt identifies the selected surface and occurrence without supplying the
client's guessed `target_lemma`. The existing four-field response schema, text
limits, selected-member alignment, word/expression shapes and expression span
checks remain. No new provider call or part-of-speech field is introduced.
Meaning and canonical are model output; structural validation still protects
the transport and rendering contract.

Lookup input normalization, candidate hints, fingerprints, authentication,
quota RPCs, success-only receipts and same-ID recovery remain unchanged.
`lemma()`, `lemmaCands()`, `keyOf()` and all existing storage keys are untouched.
The existing 1.9(253) and 1.9.1(256) clients accept the response and apply its
`lemma` during a fresh word lookup and detail retry. The server fix restores
meaning retrieval without an iOS rebuild. Their mini retry and context-specific
meaning paths omit canonical when saving, so those paths can retain the guessed
display word. The small client companion passes canonical through those paths
and uses the existing display-update rule without renaming stored IDs or changing
meaning selection. Shipping that display correction requires an app rebuild;
neither change requires a data migration.

Fixtures cover previously rejected plurals and unknown canonical forms, schema
and source guards, failed lookup recovery, cache replay and a single charge.
Local tests use synthetic providers and local receipt SQL. Merge and production
deployment require separate approval; this change does not deploy the function.

PR CI also pins the generated asset stamps and the previous integration receipt.
Run `tools/stamp-version.mjs` after the client change. The AI canonical follow-up
receipt records its exact approved file scope and before/after hashes while
retaining the historical release checks. This only prepares source for the next
app build; the server bundle excludes client assets and receipt files.

## Provider timeout fallback (2026-10-17)

OpenRouter slowness was consuming both short-lookup attempts, so Gemini never
ran inside the 8 second budget. A compact validated lookup now caps OpenRouter
at about 4 seconds. Timeout and network errors move to Gemini with the time
that remains. The same provider is tried again only after `invalid_*` or
`missing_fixed_word`, and only when Gemini would still have about 2.5 seconds.
The client no longer auto-retries `lookup_failed`. The manual retry button
stays and reuses the saved lookup id.

Our own abort is logged as `timeout` instead of `network_error`. Persisting
that outcome requires `record_dict_ai_usage` to allow `timeout`
(`supabase/migrations/20261017130155_dict_ai_timeout_outcome.sql`). The
migration is in the repository and is not applied here. This change does not
deploy the dict function.

## Cached credential and client failure reports (2026-10-18)

Some lookups showed "뜻을 찾지 못했어요" while the dict function received no
request. The 9 second word deadline wrapped `dictCall`, including
`sb.auth.getSession()`. When the auth client was busy (lock contention or a
token refresh), that deadline aborted the lookup before `fetch`. A brief
`sbUser === null`, a scope mismatch, or a thrown `fetch` also returned null
with no telemetry.

A lookup now sends the access token already held in memory.
`onAuthStateChange` and the stored session keep that credential current,
including across a moment when `sbUser` is null but the scope is still that
user. A real sign-out has no credential and keeps the anonymous key. The
lookup does not call `getSession` first. The anonymous path still does not
require login.

If the server answers 401 to a user token, the client calls `refreshSession`
once, with its own 2.5 second limit, and retries the request once. The 9
second word deadline is armed when `fetch` starts and is not charged for that
refresh. The 30 second transport limit still bounds a fetch that ignores
cancellation. A different account's token is never sent for the active scope.

Client failures report `{op:'lookup_failure',reason}` and nothing else. A report is sent only for a reader lookup (`look`, `look_v2`, `explain`, `easy_explanation`, `sentence_easy_explanation`). Warm, account deletion, and grading stay silent, so a failed background warm is not recorded as a lookup. The
reason is one of `clicked_index_missing`, `session_timeout`, `fetch_error`,
`scope_mismatch`, `timeout`, or `server_status_N`. The report uses the anon
key so an expired user JWT cannot block it. The retired `op:'log'` path is
unchanged and still must not carry reading data. `lookup_failure` is handled
before `getUser` and writes only `client_lookup_failure` plus the allow-listed
reason to the function log. It does not write `dict_events`. Recording that
line in production requires a dict deploy, which this change does not perform.
Until then the current function answers `bad_op` and the client ignores it.

The multi-word fallback around the clicked-token search remains a separate
weakness. When the tapped surface matches more than one sentence token, or is
several words such as "smoke and mirrors", the index stays negative and the
lookup stops before `fetch`. That path now reports `clicked_index_missing`.
It still does not guess which occurrence was tapped.

## Hedged word lookup (2026-10-21)

Word lookups (`look` and `look_v2`, including seed) no longer use a per-provider
timer. OpenRouter DeepSeek starts immediately. If that attempt fails before a
valid answer — an HTTP or network error, or a malformed or invalid body —
Gemini starts at once with the same prompt. Otherwise Gemini starts when no
valid answer has arrived after `HEDGE_DELAY_MS` (2000), and DeepSeek is left
running. A DeepSeek failure after Gemini is already running just waits on
Gemini. A Gemini failure while DeepSeek is still pending waits on DeepSeek.
The first valid answer is the response; the other request is aborted with
`AbortController`. One 8 second deadline bounds the whole word lookup, so the
client 9 second cutoff still holds. There is no second call to the same
provider and no correction prompt on this path.

Sentence explanation (`explain`) and its 25 second / 15 second provider budgets
are unchanged. Response fields, `word_lookup_receipts`, and the existing
`dict_events.meta` telemetry keys are unchanged. Word attempts also carry
`hedged`, `winner`, and `loser` (`aborted`, `failed`, or `late`) inside that
same meta object. `supabase/migrations/20261021120000_dict_lookup_hedge_meta.sql`
teaches `record_dict_ai_usage` to copy those fields out of the usage payload.
This change does not apply that migration or deploy `dict`.

## Slot fillers and alignment downgrade (2026-10-21)

`validateLook` counts `one's`, `someone's`, `somebody's`, `someone`, `somebody`,
and `something` as variable slots. A possessive or object in the sentence fills
that slot and is not an extra fixed word: `my`, `your`, `his`, `her`, `its`,
`our`, `their`, `me`, `him`, `us`, `them`, and a possessive token such as
`John's` or `man's`. A noun phrase that ends in that possessive (`the old man's`)
is the same slot, including its article and modifiers. Those member indexes are
dropped. The stored members are the fixed words. A headword with no variable
slot is checked exactly as before. The prompt tells the model to omit the filler.

A lookup still does not fail when the only problem is alignment. If `canonical`
and `ko` pass the text checks but the kind or member alignment does not,
`recoverableLook` builds a word answer: `members` is the tapped index, `kind` is
`word`, and a single-word canonical is kept as written. A multi-word canonical
is replaced by the tapped token, because a word headword cannot contain a space.
The Korean gloss is kept either way. It is already one short sense, and this
path has no second gloss. The response shape is otherwise unchanged.

That fallback does not win ahead of a clean answer. The attempt is still a
hedge failure, so the other provider can return a valid expression. The fallback
is the response only when the deadline arrives, or both attempts finish, with
no clean answer. A malformed body, empty `ko`, or other shape error still
rejects the lookup.

Each provider row records `meta.reject_reason` (`parse_failed` or the validator
code) when that attempt's body was rejected. The row whose fallback is returned
also records `meta.downgraded: true`. `record_dict_ai_usage` as deployed for the
hedge only copies `hedged`, `winner`, and `loser`, so
`supabase/migrations/20261021193000_dict_lookup_reject_meta.sql` copies the two
new keys into the same meta object. Until that migration is applied the insert
still succeeds and the new keys are dropped. This change does not apply the
migration or deploy `dict`.

## Lookup-level rows in dict_events (2026-10-30, issue #316)

`dict_events` had no lookup-level rows. The edge stopped inserting them in
316d6212 (2026-09-20), and `opLog` has only validated its input since then.
After that the only writer was the per-attempt provider row from
`record_dict_ai_usage` (`telemetry_version` 2). Its `action` cannot separate a
word from a sentence: `explain` also covers easy explanations and study-set
grading. That writer swallowed errors into an `ai_metric_write_failed` log line
with only a code. Those rows stopped around the hedge deploy (#231/#232,
2026-10-21). This repository and the local hedge harness both still produce the
RPC calls, so the cause is on the deployed side (function body, grants, or
deploy). Read the function logs and `pg_get_functiondef` to confirm it. This
change does not touch production.

`opLook` (word, not seed) and `opExplain` (sentence) now record one row per
logical lookup through `record_dict_lookup`
(`supabase/migrations/20261030150100_dict_lookup_rows.sql`). The row has
`lookup_type` (`word` | `sentence`), `action` (`look`, `retry`, `explain`),
`provider`, the account id when signed in, and `meta` with `telemetry_version`
3, `request_id`, `outcome`, `duration_ms`, and `signed_in`. A retried request id
updates its own row, and another account cannot overwrite it. No headword,
sentence, or answer is stored. The write is a background task and never delays
or fails the lookup. A failed write logs `lookup_metric_write_failed` with the
database code and message. Provider-attempt telemetry is unchanged. Its failure
log now also carries the message.

Apply the migration before deploying `dict`. This change does neither.
