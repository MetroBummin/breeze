# Manual audit window: zero model calls, expired and retired

The approved temporary audit deployed to `hrtfhojbhqvaoiulspto` at version 1 with
JWT verification enabled. All nine uploaded files matched the read-back source.
Runtime source remained the reviewed commit
`a2cc8e88301d81fb8e0598c5a5776c082129e8c9`, including known no-call accounting
and fail-closed ambiguous fetch/body handling. Original article/request hashes,
24-attempt/USD 0.10 cap and concurrency one/zero retries remained unchanged.
The refreshed seal expired at **2026-10-05 08:47:26.234 UTC**; its pack hash was
`9e603d516700c807ebe67f55d6295816d570b12770528d215a63840d93641477`.

The user reported `{"authorized":true,"providerAttempts":0}` from the manual
native Dashboard auth probe at 08:08:18 UTC. This verified an actual manual
caller; no agent inspected, copied or exported its JWT/key/header. No autonomous
invocation or provider transport was performed by the agent.

The preceding cancellation/deadline instruction closed the still-unused ledger,
so the user's first `run` returned `audit_closed` and zero reservations. The parent
then explicitly authorized recovery only for the provably unused row. At
08:16:25 UTC a conditional update matched the exact cancelled JSONB payload,
null token and empty/zero budget history and changed **status only** to queued.
It preserved the original payload, expiry and hashes. A private provenance receipt
retains both the original closure and conditional re-arm. No schema/runtime
change, unknown-attempt reset, retry, extra ledger or new budget was introduced.

No paid run appeared afterward. Final read-only checks at 08:49–08:51 UTC found:

| Measure | Result |
| --- | ---: |
| Frozen captures | 12 (11 Breeze reader, 1 publisher) |
| Proposed reference labels | 7 retain / 4 promotion / 1 uncertain |
| Reservations / confirmed client fetches | 0 / 0 |
| Valid model decisions / complete pairs | 0 / 0 |
| Provider/schema errors / pending entries | 0 / 0 |
| Reserved cost / recorded token estimate | USD 0 / USD 0 (no attempt records) |
| Invoice-verified charges | Unmeasured; no invoice evidence |
| Model agreement / accuracy / cost per classified article | Unmeasured |

These 12 unmeasured inputs are not approvals, rejections or errors. Reference
labels are assistant-proposed, not human-gold accuracy. The supplied historical
trial remains 46 completed items = 36 approved + 1 candidate + 9 errors, or
37 valid classifications; 44 reservations still are not proven paid calls.
This window supplies no new Jev quality or cost-per-article evidence.

After actual expiry, the agent read the ledger before cleanup. No in-flight or
pending evidence existed. A conditional update closed the idle, expired ledger
without deleting/changing its result payload. The row remains `RSS-000`, done,
null token, zero reservations, zero reserved nanodollars and an empty attempt list.
No new window, reset or paid invocation was started.

The temporary function was replaced by **version 2**, a JWT-protected constant
HTTP-410 `audit_retired` stub with only `index.ts` and an empty `deno.json` import
map. Read-back verified those exact two files; there is no credential lookup,
provider request, database access, private input or retry path in the active
version. Its bundle SHA-256 is
`9b2e6659f8935f787608893878f3e956eea048aeb571980aeaab317258fd7551`.
The toolset exposes no Edge Function delete action, so this is verified retirement,
**not permanent deletion**. The function object remains listed; final Dashboard
deletion is still required under the existing cleanup approval. No prior-version
retention claim is made.

Read-back also verified production `rss-quality` is unchanged: version 6,
`verify_jwt=true`, bundle SHA-256
`1a64f483236c770f0d2b96187798312a4b231527e764fb278fba75c67c7fc325`.
Client OFF, 235, App Store and QA were untouched. The prior 115-test and typecheck
results remain code verification; Deno/live model behavior, billed charges and
quality improvement remain unmeasured because no provider attempt occurred.

A future audit requires an actual available manual window and a reviewed new
execution identity/ledger plan. Do not silently revive this completed row or
reintroduce the retired paid function. Existing inputs/proposed references and
code can remain private review evidence; reuse is not a new execution approval.
