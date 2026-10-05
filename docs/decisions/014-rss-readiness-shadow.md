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

Decision 015 (2026-10-05) moves client article/Medium resolution to card intent
and adds a separate default-off public metadata catalog. It does not change this
pipeline's mode, eligibility, rubric, readiness, provider, budgets or SQL.
Future active client inventory still accepts only versioned approved/explicitly
eligible candidates; successful missing/revoked inventory remains authoritative.
Cards publish metadata without background bodies, exclude saved entries, and
resolve selected content through existing import/Preview/Read ownership.

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
   It judges coupon-only/promo-only/spam without independent editorial substance,
   whether supplied prose is readable, and severe title/body mismatch. It must
   not infer completeness. Readability failure is `unavailable`, not poor quality.
   Sensitive, long, difficult, political and medical prose is not excluded for
   those traits. Optional images and incidental product links are not defects.
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
   The existing local source/diversity preference ranker still owns cross-feed
   selection. If later activated, the client accepts only versioned approved or
   explicitly eligible uncertain entries, never arbitrary pending/error rows.

## Cache, retention, cost and diagnostics

Canonical URL + title/body/links/extraction facts + pinned `jev-1.13.0` + v2 rubric
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
response and invalid JSON. No raw provider payload, secret or full article is
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
