# RSS readiness, judgments and shadow evaluation

2026-10-02. Based on main `d3d97ea` after #75 merged. This is a clean-base
replacement proposal for #74, not a dependency on or modification of that PR.
Do not merge #74's active gate on top of this implementation. #75's FSRS work,
release version and existing evaluation artifacts remain unchanged. Later main
`480ffe0` (#77) is integrated only to keep this branch conflict-free; no unrelated
study UI changes are introduced relative to main. Draft #76 diagnostics were
inspected without changing its branch or immutable evaluation results.

## Default and ownership

Decision 010 remains the visible behavior: the original loader is preserved as
`loadRssLegacy`; `RSS_QUALITY_MODE = 'off'` routes to it without quality requests.
No private history, user imports or custom source enters the server classifier.
The new function also defaults off, without initializing DB/secret clients.
Public off/shadow requests cannot schedule evaluation. An authorized server job
may instantiate the service with `mode:'shadow'`; it has no public trigger.
Only a separately reviewed activation of both server and client selects the new
inventory. Neither this PR nor its tests deploy, migrate or call paid Jev.

## Separate decisions

1. Transport and extraction own readiness. Public DNS is checked for every hop,
   all answers must be public, and validated addresses stay pinned to sockets.
   `192.0.0/24` and `192.0.2/24` remain blocked; public `192.0.66.*` is allowed.
   Deprecated 192.88.99/24 is blocked too. Private, link-local, documentation,
   mapped IPv6 and other existing prohibited ranges remain blocked.
2. Existing DOM/body caps, restricted-access checks, English availability,
   minimum extracted bytes and encoding checks describe the available body.
   Readiness records characters, words and paragraph count. It explicitly says
   original completeness is unknown. These checks do not prove completeness;
   list counts, missing images and length do not establish a missing original.
3. Jev sees untrusted title, supplied paragraphs, links and extraction facts.
   The v3 rubric judges primary-purpose promotion/spam without substantive
   independent editorial value, including readable merchandise/campaign copy.
   Brand mentions and commerce/history topics alone are insufficient.
   It separately judges
   whether supplied prose is readable, and severe title/body mismatch. It must
   not infer completeness. Readability failure is `unavailable`, not poor quality.
   Sensitive, long, difficult, political and medical prose is not excluded for
   those traits. Optional images and incidental product links are not defects.
   Developed biography/history in a gallery remains readable without pictures.
4. Evidence-backed confident promotion/mismatch is `rejected`. A positive defect
   allegation without sufficient evidence stays `uncertain` and withheld.
   Low confidence or an unknown choice with **no positive defect allegation**
   can enter a separate `candidate` pool after successful deterministic readiness.
   Candidate is not approval. Fetch/schema failures and unsafe/unreadable bodies
   cannot enter that pool. This is a conservative policy hypothesis, not a claim
   of calibrated model confidence or measured accuracy.
5. Substance, context and interest contribute a confidence-weighted 0–6 ranking
   score. Approved entries precede candidates, then score orders each group.
   Topic, sensitivity and length are descriptive metadata, not hard filters.
   Promotion, readability, mismatch and evidence answers are mandatory and keep
   the same strict probability/confidence checks. Invalid or missing optional
   ranking/topic/sensitivity/timeliness answers are discarded with a fixed schema
   diagnostic; missing ranking contribution is zero and missing description is
   unknown. They cannot change eligibility or rescue a defective core answer.
   The existing local source/diversity preference ranker still owns cross-feed
   selection. If later activated, the client accepts only versioned approved or
   explicitly eligible uncertain entries, never arbitrary pending/error rows.

## Cache, retention, cost and diagnostics

Canonical URL + title/body/links/extraction facts + pinned `jev-1.13.0` + v3 rubric
form a SHA-256 key. New body/title/version cannot inherit old approval. Shared
service-role-only claims preserve RLS, fencing and four global slots/200 attempts
per day; at most three attempts per identity, no immediate paid retry, one-hour
failure delay and one-day uncertainty delay. Feed work is three bodies per ten
minutes. Old uncertain decisions are reusable during cooldown without approval.
The SQL is an **offline schema fixture** outside `supabase/migrations`; no new
automatic migration is installed. A future migration needs explicit review.

Inventory is capped at 20/feed and seven days. Same-content transport/provider
outages retain valid prior entries. Observed changed content invalidates the old
key before evaluation. A cached rejected/unavailable verdict removes the entry.
The client treats successful inventory as authoritative: missing/revoked/changed
Medium approvals cannot return through prepared-body fallback. Decoded cards are
reused only when their import payload, visible metadata and verdict identity
match; same-URL changed content cannot retain an old click closure. Invalid content
never gets an approval merely because the provider is unavailable.

Safe structured events carry stage, fixed reason/detail codes, content hash,
feed ID and validated token usage. Schema diagnostics distinguish model,
answer shape/count, choice shape, probability consistency, empty/oversized
response and invalid JSON. New consistency diagnostics separate probability sum,
selected-choice maximum and confidence mismatch; optional anomalies are counted
separately from failed classifier decisions. Fixed quality reason codes identify
primary-purpose promotion, unreadable body, mismatch and unsupported evidence.
No raw provider payload, secret or full article is
logged. Private verdicts retain a bounded 180-character evidence excerpt for
human audit. A paragraph selection is evidence to inspect, not proof that the
model's conclusion is correct. Response/transport failures may lack usage.

## Evaluation and activation

`tools/compare-rss-quality.mjs` pairs exact URLs in archived baseline and optional
new results. It reports per-source pass/reject/pending/error/unmeasured, distinct
unresolved causes, approved/candidate usable inventory and auditable exclusions.
It does not reinterpret v1 answers as v2 judgments. `replay-rss-quality.mjs`
validates independently captured v2 article/response fixtures offline, checks
readiness and emits safe decisions. Neither tool accesses credentials/network.
Reviewer observations and human labels never go into classifier prompts.
Historical fetches versus new fetches are not controlled same-content pairs;
record content keys/fetch times and inspect changed snapshots before comparing.
No gold labels means accuracy/false-rejection/quality improvement stay null.

Before any live run, separately approve a server-side path on the correct project
(the repository and app project IDs differ), max 106 v2 calls, concurrency <=2,
no retries, and an explicit dollar cap such as $0.30 after rechecking pricing.
Use the existing server key without export or rotation. Freeze inputs/split and
rubric first; inspect exclusions and source inventory, especially long/sensitive
articles, with independent labels. The historical 106 baseline can be paired,
but a new same-snapshot v1/v2 study needs a separate two-arm call/cost budget.
Only after review should a migration/function deployment and intentional client
activation be authorized. Warm inventory first. Roll back by restoring client
`off` and disabling server active mode; keep cache for audit, never revive old
rubric approvals or merge the original #74 gate as a fallback.

Sources checked: [IANA IPv4 special registry](https://www.iana.org/assignments/iana-ipv4-special-registry/),
[TypeSafe API](https://docs.typesafe.ai/api), [confidence](https://docs.typesafe.ai/confidence),
[Supabase changelog](https://supabase.com/changelog) and
[server secrets](https://supabase.com/docs/guides/functions/secrets).

2026-10-04 v3 follow-up: see [purpose/validation review](../qa/rss-purpose-20261004.md).
This classifier-only draft does not import PR89's stale Edge entrypoint or
operator token comparison. Production v6's caller-JWT PostgREST authorization,
service-role-only `rss_quality_operator_authorized()` SECURITY INVOKER RPC and
`verify_jwt=true` must survive any later integration. No deployment, migration,
paid run or client activation is authorized by this change.

2026-10-05: the [read-only v6 review](../qa/rss-purpose-20261005.md) verified those
production auth invariants and the exact source. Synthetic fixture labels stay
proposed, with bounded source quotations kept outside model state. The offline
overlay rehearsal preserves auth/entrypoint hashes and retains v6 cache telemetry;
it does not authorize production integration, deployment or paid evaluation.

2026-10-05 headless follow-up: [preparation and cost reporting](../qa/rss-headless-20261005.md)
records the user's subsequently approved **24-attempt / USD 0.10** two-arm pilot,
concurrency one and zero retries. That specific cap supersedes the broader
historical evaluation proposal above for this task; it does not authorize
deployment/activation or credential export. The headless module has no live
adapter or credential access. Every physical attempt is reserved before transport;
failed attempts count, pending attempts are not resent, unknown usage retains a
full reservation and estimates never masquerade as invoice charges. Existing
private executor and publisher capture paths are unresolved, so no paid attempt
or full real-input freeze has occurred. Selected source labels remain proposed
except the supplied historical promotion observations; accuracy is unmeasured.

Subsequent explicit user approval permits the isolated temporary paired-audit
function and one service-only sentinel ledger row, with the same 24-attempt /
USD 0.10 cap and cleanup. [Prepared candidate and live gates](../qa/rss-audit-candidate-20261005.md)
document one-shot conditional claims, expiry, crash withholding, private input
conversion and the unchanged v6 authorization helper. No production RSS module
imports the audit code. Approval requires verifying the existing native caller
before deployment; private input availability/review and billing terms also
remain gates. Local preparation does not imply a function, row or paid run exists.

The parent subsequently supplied body-only manual Dashboard authorization evidence:
`{"error":"operation"}` after the user personally used an existing service JWT;
HTTP status is unreported. The preparation records that distinction, with the
unchanged runtime gate. Complete private JSON text reads now reproduce both
original handoff hashes, 12 body hashes, and proposed 7/4/1 references; 11 reader
captures and one publisher capture stay distinct. The input adapter preserves
capture-window uncertainty and excludes labels/notes from model state. `run`
adds a bounded sequential foreground batch using the same per-attempt durable
claim, 3-second DB abort signals, 10-second provider timeout and pending withholding.
The Mac is closed, so the temporary function remains undeployed pending a runnable
manual window; no autonomous executor or live result is implied.


Independent exact-bundle review found that pre-fetch configuration failures were
miscounted as calls and incomplete fetch/body transports could unlock another
slot while remote work continued. Ledger v2 separates known no-call, unknown,
uncertain and complete transport states. Unknown/uncertain stays pending/running
under the original fence, without reclaim or retry; pre-fetch no-call closes the
run with a held reservation and zero confirmed calls. Both defects are reproduced
against the previous committed code in offline before/after tests. Reports use
reservation counts and proposed-reference agreement, never inferred billing or
human-gold accuracy. The private bundle update preserves its original expiry
until a manual Mac invocation window is actually planned.

The [manual-window outcome](../qa/rss-audit-window-20261005.md) records actual
JWT-protected temporary deployment and successful user-operated auth probe, but
zero provider reservations/fetches/decisions. The unused row's mistaken deadline
closure was conditionally re-armed under explicit parent recovery instruction,
with original payload/expiry/caps intact and private provenance preserved. After
actual expiry the idle ledger was closed without result deletion. The active
temporary function is a verified v2 410 stub; permanent Dashboard deletion remains
because the toolset has no function-delete action. Production v6 and client OFF
remain unchanged. No quality or per-article cost conclusion follows from this run.
