# RSS visible cover ownership during late feed arrival

Base: released main `693488cfe25419654e91d5bf18a03cbb8d8d591c`.
This is a proposed follow-up; no additional merge, Apple build, App Review or
catalog activation is included.

## Observations and attribution

The diagnostic-only PR108 changed no product file, but its Chromium RSS suite
timed out waiting for exactly two decoded covers in the supplied-photo fixture.
Its separate supplied-photo transport suite passed, as did all 29 WebKit visible
cover cases. The failed case did not capture its card state, so the precise
30-second timeout cannot be retroactively attributed from that log alone.

- [Original failure](https://github.com/MetroBummin/breeze/actions/runs/37430056465)
- [Controlled current-source diagnostic](https://github.com/MetroBummin/breeze/actions/runs/37431661666)
- [Pre-104/current comparison](https://github.com/MetroBummin/breeze/actions/runs/37432701271)

Both pre-104 `f7a2889296226f1ebca03cdcc45d09b739b05e88` (RSS SHA-256
`6a2daa4ca8078636beb8061fa4601305fb684744219b71520a54aa397d345343`)
and released main (RSS SHA-256
`f7eb48c65c0cb29e3a1266e959767aac3c624b00bc2fc6dbd7f4a76ef8cd132a`)
passed eight normal supplied-photo starts and reproduced delayed-feed ordering
and budget failures. Admission, visibility, image decode and rail ordering
functions were byte-identical before and after PR104/105.

When an early partial feed result has visible cards, the client can spend its
two original-page lookups on them. A later higher-ranked feed can move those
cards offscreen, leaving final visible candidates with no remaining lookup
budget. A supplied photo consumes no original lookup and can legitimately make
three decoded covers. The first diagnostic captured requests to feeds 1/10,
4/10 or 12/11, followed by different final visible cards. These are synthetic
feed/image/relay results, not proof of the user's particular Medium card cause.

## Minimal ownership change

After a Home rail admits original-photo work, reuse the existing scroll/focus/
press order-preservation path for that discovery generation. Current cards stay
in order and late feeds append. Explicit refresh still reranks. The existing
owner attempted set provides the condition; there is no new cache, request,
timer or budget. This trades continuous arrival-time reranking for stable visible
owners. It does not guarantee photos on every late or offscreen card.

The two-original-lookups-per-generation limit, serial transport, 128 KiB retained
prefix, cache expiry and independently loaded supplied-photo priority remain.
Client/server catalog switches remain OFF and no publisher admission changes.

## Regression contracts

The original supplied-photo fixture retains its exact two-cover/one-original
assertions, but holds metadata admission until its feed setup has settled.
Arrival-order behavior is tested separately with explicit held-feed gates:

- Late first, second and leading feed sets are released only after actual
  original-photo admission, not an arbitrary delay
- Every admitted card must remain visible and decode its photo after release
- Every lookup was visible when admitted; at most two originals in that generation
- The supplied-photo URL decodes and never causes an original-page request
- Warm render preserves order with no repeat lookup; explicit refresh applies
  current ranking and stays within its own separate two-request cap

The immediate-Preview fixture replaces its fixed 500 ms image delay with an
explicit image gate, retaining known-title/source/open and cancellation checks.
PR109 independently observed that fixture timing out after startup; a completed
load can otherwise make a later wait for a transient pending class impossible.

Local source parsing and repository asset stamping pass. Exact proposed-head
CI, native sync and full browser results are pending. No pass is inferred from
the previously green released head.
