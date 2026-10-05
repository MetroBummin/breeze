# Temporary paired audit: inputs frozen, batch tested, undeployed

The parent supplied explicit user approval for one temporary service-role-only
function and one durable ledger row, **24 physical provider attempts / USD 0.10
total**, concurrency one, zero retries and subsequent function removal. Production
RSS, client OFF, release 235 and QA remain outside this change. No deployment,
live ledger initialization, SQL mutation, provider attempt, grant, credential
creation/export or client activation has occurred.

The isolated [handler](../../server/rss-quality/audit.mjs),
[store](../../server/rss-quality/audit-store.mjs),
[contract](../../server/rss-quality/audit-contract.mjs),
[private builder](../../tools/prepare-rss-audit-bundle.mjs) and
[entrypoint](../../tools/rss-audit-entrypoint.template.ts) are prepared. The
production v6 auth helper is copied byte-for-byte, SHA-256
`2d612962b01784a76e1b72f5cf79de3c4972a337b6dd73b856ec67e31549ae79`.
Gateway `verify_jwt=true` remains mandatory. Caller JWT forwarding to the
service-role-only SECURITY INVOKER/current_user RPC remains the runtime gate.

## Actual caller evidence and remaining manual step

At 2026-10-05 04:57 UTC, the parent reported that the user personally entered
an existing service-role JWT in the official Mac Supabase Dashboard Test UI and
sent `{"operation":"auth_probe"}` to production `rss-quality`. The user reported
exact response body `{"error":"operation"}`. HTTP status was **not reported**.
Verified v6 source authenticates before returning this unknown-operation body;
this supports that particular manual caller. It is not evidence of a native
service-role selector, key access by an agent, or autonomous cloud invocation.
Preparation records `status:null` and `user-reported-response-body`, rather than
inventing HTTP 400. Runtime authorization is unchanged and runs on every request.

The Mac is now closed. There is no exposed Supabase invocation tool, `pg_net`,
`pg_cron`, or usable existing executor (`rss-eval-106` is a retired 410 stub).
Deployment remains on hold until the parent has a runnable manual window. No
agent may inspect/copy/export JWTs, request headers, environment keys or vault
values. The user can personally operate their existing authenticated Dashboard;
no new credential or grant is needed. Approval of the already approved audit
scope must not be requested again.

Once that window is available, refresh the private execution review and expiry,
recheck production v6/RPC and the unused sentinel, deploy only
`rss-quality-paired-audit`, and verify returned JWT/source metadata. The user's
paid-work-free `{"operation":"auth_probe"}` on that temporary function should
return `{"authorized":true,"providerAttempts":0}`. After its one ledger row is
initialized, the manual paid request is `{"operation":"run"}`. A response with
`pausedReason:"request_window"` allows another manual Send to continue untouched
slots. Do not promise that all 24 attempts fit one Send. Error/pending responses
require status review, never an automatic retry or reset. A foreground request
can also be killed by a reused worker; pending then stays withheld.

## Exact private handoff and input freeze

The earlier ZIP materialization failure is superseded by the parent's explicitly
authorized complete Library **text reads** of the two JSON originals. Each read
returned all lines, no remaining chunk. Restoring the missing final LF reproduced
both expected original byte counts and hashes exactly:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| private-visible-inputs.json | 125621 | `12f319e0aa31993aa475bbbe331ba6dc61500ca58fd45119aa17123170bc9850` |
| audit-manifest-no-full-text.json | 10539 | `26c213caedd0b679fd7059a9a813cf66c621b0ec2d7e321d72844ff2a4ade710` |

All 12 raw body hashes and Unicode character counts match the manifest. The
[adapter](../../tools/prepare-rss-audit-bundle.mjs) checks every manifest field
against the matching sample, keeps raw-body fingerprints, and converts the
actual parent schema without retyping prose. Adapted capture SHA-256 is
`015c4a2ea69d7d2fc223f7301cab1611572d3815619a2dd28731650f9d2ee2fc`.
Bodies and deployment inputs remain mode-600 files in a mode-700 directory outside
the checkout; none is committed or printed.

There are **12 ready captures**, no local extraction failures: 11 Breeze-reader
visible captures plus one publisher-only Taco Bell/Duolingo capture. Proposed
references are **7 retain / 4 promotion / 1 uncertain**, not human-confirmed gold
or a random/publisher-independent sample. The unavailable historical popcorn URL
is recorded outside this 12-input pack, not a model quality rejection. Its
replacement does not erase that source failure or create an archived cohort pair.
The supplied historical trial remains 46 completed: 36 approved, 1 candidate,
9 errors (37 valid classifications); 44 reservations are not proven paid calls.

Conversion trims nonblank line whitespace, normalizes line endings and groups
contiguous lines within 200 paragraphs. It preserves all prose, pagination and
repetition, with no truncation or invented HTML. All raw originals remain
available for inspection. Eleven samples report only a capture window; its upper
bound is explicitly marked as an approximate capture instant. Captured links
are absent/unverified, original completeness unknown, and
`productionExtractionVerified=false`. Both arms receive identical state; labels
and reviewer notes never enter requests. The publisher-only result must be
reported separately from reader captures. The longest prepared body is 55,397
characters / 60,066 serialized state UTF-8 bytes; no tokenizer/context acceptance
is asserted. An over-context response consumes one reservation and is not retried.

## Durable bounds and batch behavior

Only the preexisting service-role-only `rss_quality_eval` table's sentinel
`RSS-000` is writable. Recheck vacancy and insert once without overwriting.
No schema/grants/control/feed/cache/budget/cohort job change is needed. Original
cohort reports must use original manifest membership and exclude this sentinel.
The initial row contains only fingerprints, expiry, numeric records and IDs.

Each attempt claims a conditional queued-to-running update fenced by its prior
UUID, before one direct HTTP call. Completion is fenced by its new UUID. Running
never times out into queued; post-call write failure or runtime termination keeps
a pending reservation and blocks further calls across restarts. Concurrent
requests can win only one current claim. A completed run cannot restart. Status
separates reservations, confirmed fetch entries, known no-call reservations,
completed transports and ambiguous/pending reservations, with
expiry still allowing authorized numeric status access.

`next` performs one attempt. `run` uses the same one-attempt transaction in a
sequential foreground loop. Its target window is 85 seconds, including auth;
it starts no further attempt after 65 seconds, leaving 20 seconds for read/claim,
provider and completion. Every PostgREST read/write has a 3-second abort signal;
the provider HTTP timeout is 10 seconds. No SDK retries, background task, schedule,
self-invocation, auth-header replication or lease recovery is used. Fixed bounded
reason/diagnostic fields reject unexpected stored text before status disclosure.
Logs omit article/evidence/raw answers/exceptions and follow durable completion.

At the documented 2026-10-05 Jev price, reserve 65,536 input tokens × 42
nanodollars = **USD 0.002752512 per attempt**, or **USD 0.066060288 for 24**.
Output is free; no cache discount is assumed. Integer reservations prevent cap
drift. Unknown usage retains full reservation and unknown estimate; token estimates
are not invoices. Unexpected model/token bounds close the run. The remaining
USD 0.033939712 must cover applicable platform charges. Actual invoices and model
latency remain unmeasured. Sources: [Jev terms](https://docs.typesafe.ai/models),
[Supabase pricing](https://supabase.com/pricing), and
[Edge limits](https://supabase.com/docs/guides/functions/limits), checked October 5.

Supabase documents 150-second Free/400-second Paid worker wall-clock limits,
150-second request idle timeout and 2-second CPU limit per request excluding I/O.
The bounded loop is a preparation, not proof of Deno/worker timing; reused workers
can terminate earlier. The private execution window expires within one hour and
must be regenerated for the actual manual window before deployment.

## Verification and cleanup

**115 RSS tests pass** via `npm run test:rss-purpose`, including 23 isolated audit-server cases and a real local
Postgres CAS/fencing check that leaves neighboring `RSS-055` unchanged. Tests cover
batch completion/continuation, concurrent calls, fixed 24-slot cap, auth before
DB/paid work, body-only proof accuracy, JSON/body fingerprints, Unicode counts,
expiry, pending withholding, bounded transport and diagnostic privacy. All provider
calls are mocked. Typecheck passes with the same 34 existing findings. The original
17-case deterministic comparison still separates 11 synthetic articles from six
optional-field mutations; six validator recoveries are not an accuracy gain.

Deno execution, live gateway/native UI, provider behavior, exact production
extraction and real billing are untested. No real before/after classifier result
exists yet. When the manual run finishes or stops, export numeric ledger results,
report reader versus publisher results and errors separately, and remove the
temporary function/private deployed inputs. Keep the ledger closed for reviewed
cleanup; never reset/delete it to recover budget or retry an unknown call. Verify
function absence, production v6/RPC unchanged and client OFF afterward.


## Independent transport review and correction

Review of the earlier exact private bundle found two defects. Missing runtime
`JEV_API_KEY` threw before fetch but the handler counted a confirmed client call;
its batch could consume 24 reservations while making zero fetches. Fetch or body
read timeout/abort was also recorded as complete, unlocking the next slot despite
possible continuing remote processing. Neither case has occurred live.

Ledger schema v2 now records explicit adapter states `unknown`, `not_started`,
`uncertain` and `complete`. Missing configuration performs zero fetches, closes
the run after one held reservation, reports zero confirmed client attempts and
one known no-call reservation, and records `billableStatus:"no attempt"` with
unknown invoice/estimate. The full reservation stays allocated and cannot be
reused. Fetch initiation confirms only local entry into fetch, not acceptance,
provider completion or billing. A worker/persistence failure can leave that fact
unknown in the durable row; unknown is never counted as confirmed.

Fetch errors and incomplete response body reads (abort, timeout, network failure,
or response-limit cancellation) retain running/pending and the full reservation.
A fenced `hold` saves fixed diagnostics without changing the row state. Failure
to save that detail still leaves the original unknown pending reservation. Later
`run` or `next`, including a fresh handler, returns 409 and sends nothing. There
is no reclaim, retry or recovery that assumes remote cancellation. Completed
body with invalid JSON remains a schema error; receiving headers alone does not
establish transport completion.

Executable before/after tests load the exact previous handler and contract from
`b6a0a2d657a5fa888eac33705c85e5323d5fbebc`. Missing-key baseline reproduces
0 fetches/24 falsely confirmed attempts; revised behavior is 0 fetches/0 confirmed
attempts/1 known no-call held reservation. For fetch timeout/abort and body
abort/network failure/limit, the simulated server remains active: baseline can
start 24 overlapping operations; revised behavior starts one and refuses the
next operation across restart. All transport is mocked. An actual Jev call,
remote cancellation, billed charge and Deno timing remain unmeasured.

Reports name record counts **reservations**, separate fetch confirmations,
known no-calls and ambiguity, and calculate means per reservation rather than
pretending every reservation is a physical attempt. Model output comparison
against the 7/4/1 assistant-proposed references is labeled agreement; it is not
human-gold accuracy. No human review is inferred from a preparation flag.

The parent additionally verified account evidence: Supabase organization Free,
41,096/500,000 Edge invocations, no billed overages, spend cap enabled and no
extra usage charges. Reported egress was 4.791/5 GB (96%), an operational limit
for the eventual manual window. No billing settings or plan changed here.
Existing v6/RPC/auth helper were byte-equal and RSS-000 vacant in that parent's
read-only review. Recheck before an eventual live action.

The replacement private bundle is **review-only**. Its runtime files and source
provenance are refreshed while the original input-pack creation time/expiry stay
unchanged. No fresh execution expiry is invented while the Mac window is absent.
Only a planned manual invocation window permits regenerating the expiring
execution review. The deployment hold and zero-live-action state remain intact.
