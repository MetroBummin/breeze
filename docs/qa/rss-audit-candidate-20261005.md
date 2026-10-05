# Approved temporary audit: prepared candidate, gates still closed

The parent supplied transcript evidence that the user approved the temporary
service-role-only paired audit function, durable attempt ledger, previously
approved **24-attempt / USD 0.10 total** pilot and subsequent function removal.
Production RSS, client OFF and 235/QA remain outside this change. This supersedes
the earlier plan-only state; it does not remove the requirement to verify actual
credential-resident invocation **before deployment** or review/freeze inputs
before paid transport.

The [handler](../../server/rss-quality/audit.mjs),
[store adapter](../../server/rss-quality/audit-store.mjs),
[shared contract](../../server/rss-quality/audit-contract.mjs),
[private bundle builder](../../tools/prepare-rss-audit-bundle.mjs) and
[entrypoint template](../../tools/rss-audit-entrypoint.template.ts) are prepared.
They are isolated from production RSS imports. No function deployment, live
ledger initialization, provider attempt, SQL mutation, grant, credential creation,
key export, client activation or 235 action has occurred.

## Invocation checkpoint

Read-only metadata confirms production `rss-quality` remains version 6 with
`verify_jwt=true` and the recorded bundle hash. The project has neither `pg_net`
nor `pg_cron` installed. Existing `rss-eval-106` version 2 is a retired HTTP 410
stub, with no environment credential lookup or outbound calls; it is not an
executor. Current exposed tools still have no invocation action. No secret names,
values, request headers, vault contents or cron command bodies were queried.

The parent must verify the existing native caller, not merely assert a decoded
role. In the already authenticated Supabase Dashboard for project
`hrtfhojbhqvaoiulspto`, inspect **Edge Functions → rss-quality → Test**. Only if
there is a built-in `service_role` authorization choice that needs no key reveal
or copying, select it and send exactly `{"operation":"auth_probe"}`. The verified
v6 source authenticates before rejecting this unknown operation, so:

| Response | Meaning |
| --- | --- |
| HTTP 400, `{"error":"operation"}` | The request passed existing gateway/helper/PostgREST authorization; no provider or feed operation ran. |
| HTTP 403, `{"error":"operator_required"}` | The caller did not pass the operator gate. |
| Other response | Investigate the fixed status/error only; do not infer authorization. |

This is an exact preflight request whose interpretation is grounded in v6 source,
**not evidence that the UI currently offers such a selector**. Official Dashboard
documentation describes anon/user-token testing, not a verified service-role
broker. If the selector is absent, stop. An ordinary anon/user token is not a
substitute; do not paste a service key into a header field, inspect network
credentials, export a key or create a new one. Identify an already approved
trusted server job instead. The candidate remains undeployed until the parent
returns a verified credential-resident caller identity and status/error result.
Deployment alone cannot solve this missing caller.

## Private input handoff checkpoint

The parent supplied a private Library ZIP named
`breeze-rss-private-audit-inputs-20261005.zip`, 49,658 bytes, expected SHA-256
`9cbc8e6a0b4f0bf6783977378783688f90f8982d8825e3e568df93d2a5fde947`,
containing `private-visible-inputs.json` and `audit-manifest-no-full-text.json`.
The parent's description is 11 Breeze-reader captures and one Dexerto-publisher
capture, with proposed **7 retain / 4 promo / 1 uncertain** references. These are
not human-confirmed gold labels, a random sample or verified production payloads.

The resolved-reference Library materialization action returned a transfer, but
the current official download helper failed in this execution environment,
including supported additional-network and escalation paths. Automatic approval
review did not reject the action. The helper reports `download failed`; its
underlying network cause is not established. The ZIP is **not readable locally**,
its actual checksum is **not verified**, and its JSON field schema/body hashes
are **not inspected or frozen**. Do not claim that a successful preparation
response means bytes were transferred. No signed transfer URLs or publisher
bodies are committed. A consumer-readable private handoff is still required.

The builder's minimal private interchange format is one JSON object:

```json
{
  "schema": "rss-browser-capture-v1",
  "items": [
    {
      "id": "ARTICLE_ID",
      "url": "https://publisher.example/article",
      "title": "Captured title",
      "capturedAt": "UTC ISO timestamp",
      "captureMethod": "breeze-reader-visible-text",
      "bodyText": "PRIVATE full captured text",
      "bodySha256": "SHA-256 of the exact UTF-8 bodyText",
      "reference": {
        "label": "retain",
        "reviewStatus": "proposed-reviewed-before-model"
      }
    }
  ]
}
```

There must be 12 unique items. `captureMethod` may instead be
`publisher-visible-text`; reference labels may be `promotion` or `uncertain`.
Optional captured `links` are bounded `{text,url}` objects; when absent, they
remain unverified rather than inferred. Once the unchanged parent ZIP is
readable, adapt its actual schema locally to this format and retain its original
fingerprint; do not require manually retyping article prose.

Conversion normalizes line endings, trims whitespace around nonblank captured
lines, and groups contiguous lines if needed to stay within 200 paragraphs.
It preserves headings, pagination and repeated links, never truncates prose,
never fabricates HTML, and keeps the original raw-body hash alongside prepared
article/request hashes. Both arms receive exactly the same resulting state.
Body/language failures are separate extraction outcomes and skip both calls.
Checks explicitly say `productionExtractionVerified=false` and original
completeness unknown. Labels are outside requests and remain pending human
confirmation. Results assess these reader-visible captures, not extraction
parity or production population accuracy.

## One-row, one-attempt implementation

The builder emits only **private** files outside the checkout: provider inputs,
deployment file content, numeric ledger initialization, and bounded safe metadata.
It neither deploys nor initializes the live database. It requires a fresh
execution-review file documenting actual caller preflight, input/reference review,
verified context-bound billing terms and an expiry no more than one hour away.
There is no default that silently authorizes live execution. It pins old/new
source and request hashes, copies the production v6 auth helper byte-for-byte,
and requests gateway JWT verification in metadata. A later deployment must
explicitly set `verify_jwt=true` and check returned deployment metadata/source.

The existing RLS-protected `rss_quality_eval` table already grants the service
role SELECT/INSERT/UPDATE/DELETE; neither ordinary role can read it. Its ID
constraint accepts only `RSS-###`; `RSS-000` was observed unused and is outside
the fixed original cohort. After all gates are verified, insert only that row
if still vacant—never overwrite a conflicting row. No schema or grants change.
The row contains run/input/code fingerprints, expiry and numeric records, no
publisher prose. Historical cohort reports use the original manifest membership
and exclude this sentinel; supplied 46/36/1/9 accounting remains unchanged.

Every authorized `next` request reserves one slot and full cost before transport
using a conditional update on ID, queued state and the previous fencing token.
Only one caller wins. The row remains running through the single awaited direct
HTTP attempt; completion is fenced by the newly assigned token. No SDK, hidden
retry, lease timeout/reclaim or automatic reset exists. A post-call persistence
failure keeps the pending reservation and blocks subsequent work, including
across runtime restarts. Pending slots are not proven billed/successful calls.
Status reports separate reservations, confirmed client attempts and pending
reservations. Expired runs retain authorized numeric status access but refuse
new attempts. A completed run cannot restart.

The runtime writes only the sentinel, not feeds, controls, production quality
cache, production budgets or cohort jobs. Its auth probe does no provider work.
All paid operations require the unchanged caller-JWT PostgREST authorization and
gateway check; no decoded-role trust or raw key-equality check is introduced.
Per-attempt cost/usage uses the shared existing report contract. Core schema
failures retain cost when usage is reported; missing usage keeps an unknown
estimate/full reservation. Fixed diagnostics omit body, evidence, raw responses
and transport exception text. Numeric logs occur only after durable completion.

## Bounds, verification and next action

Reserve 65,536 input tokens × 42 nanodollars = **USD 0.002752512 per slot**;
24 slots reserve **USD 0.066060288** for Jev. Output is free at the documented
2026-10-05 price. Integer nanodollar accounting avoids floating-point cap drift.
The remaining approved allowance must cover applicable platform charges; verify
actual billing terms before arming the run. Unexpected response model/token
bounds close the run; unknown usage is never called zero cost. Real invoices,
means and cache savings remain unmeasured. No study cache reuse occurs.

The server tests cover unauthorized/probe paths, reviews/hashes, claim-before-call,
concurrent callers, 24 slots/replay, failed persistence/restart, stored-field
disclosure, expiry/status, provider/core/optional failures and costs, single fixed
bounded HTTP transport, capture conversion and exact helper hash. An ephemeral
Postgres test exercises real conditional updates, fencing and an untouched
neighbor cohort row. All provider HTTP is mocked. Deno/gateway/native caller,
private real inputs and production integration remain untested.

Once the caller, readable handoff, frozen hashes/references and billing terms are
verified, prepare the private bundle, recheck v6/RPC/unused sentinel, deploy only
the temporary slug, verify its JWT/auth/source, initialize its one row and invoke
one attempt at a time through the verified native caller. The existing paid/server
approval persists; do not ask for it again. Keep client OFF and do not warm feeds.
After reporting, close the sentinel, export numeric results and remove the
temporary function/private inputs. Keep the numeric ledger for reviewed cleanup;
never automatically delete/reset it to recover budget or retry failures.
