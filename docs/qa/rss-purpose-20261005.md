# Production v6 source review and fixture evidence

Follow-up to [the classifier draft](rss-purpose-20261004.md). The read-only
Supabase connector returned the exact deployed `rss-quality` source from project
`hrtfhojbhqvaoiulspto`. No source transfer or credential request is needed now.
The production auth files remain outside the implementation diff in PR95.

## Verified production boundary

[Source manifest and catalog observations](rss-purpose-20261005/v6-source-review.json)
record deployment version **6**, `verify_jwt=true`, and bundle SHA-256
`1a64f483236c770f0d2b96187798312a4b231527e764fb278fba75c67c7fc325`.
The connector's `ACTIVE` status describes the deployed function, not RSS serving
mode. A read-only control query returned `mode='shadow'` and evaluation deadline
`2026-10-04 13:41:05.173592+00`, expired on this review date. Neither was changed.
The client source still selects `RSS_QUALITY_MODE='off'`.

The deployed entrypoint awaits `operatorAuthorized(request, {url, apiKey})` before
processing an operator POST. The separate helper forwards the **caller's exact
Authorization header**, uses the public anon apikey, blocks redirects, applies a
five-second timeout, and accepts only an OK response whose JSON is boolean true
from `/rest/v1/rpc/rss_quality_operator_authorized`. It does not decode JWT roles
or replace caller authorization with a service key.

A read-only catalog query verified the RPC's actual definition, SECURITY INVOKER
(`prosecdef=false`), empty search path and `current_user = 'service_role'` check.
Its observed ACL permits only its postgres owner and `service_role`; neither
`anon` nor `authenticated` can execute it. The owner can invoke the function but
does not satisfy the service-role identity check. No database objects or grants
were modified. Current [caller auth context documentation](https://supabase.com/docs/guides/functions/auth-legacy-jwt)
describes forwarding Authorization to scope database requests; the
[gateway documentation](https://supabase.com/docs/guides/functions/auth)
describes the separate `verify_jwt` check. This review preserves that existing
design rather than changing authentication libraries or switching auth modes.

## Minimal integration plan — before any auth changes

1. Use the captured **production v6** files as the later integration base,
   checking the current version/hashes again before preparing any deployable
   bundle. Abort a stale-source overlay if the deployed version has changed.
   Main/PR95's Edge entrypoint is not a replacement for this deployed entrypoint.
2. Keep `index.ts`, `operator-auth.mjs`, gateway JWT verification, the RPC
   definition/ACL, control settings, existing cohort and all claim/budget SQL
   unchanged. The helper SHA is
   `2d612962b01784a76e1b72f5cf79de3c4972a337b6dd73b856ec67e31549ae79`;
   the entrypoint SHA is
   `aa5660048b99575957652d6b03a3a8fa984752ae17f952f379c3648bc6159bd5`.
   There is no auth fix to apply and no new migration needed for this classifier.
3. Overlay `jev.mjs` with the PR95 classifier. Production's current classifier
   is byte-identical to the original main baseline, so this is a direct rubric
   and validator diff. Preserve model pin, core thresholds, input/output bounds,
   untrusted-data framing and v3 cache identity.
4. Add only verdict reason and optional-field diagnostic logging to the v6
   `service.mjs`. The production-only cache hit/miss/busy event was missing from
   the original PR95 file; it is now retained in PR95 so an overlay cannot remove
   that telemetry. Compared with v6, the resulting service diff is only the
   verdict event's fixed `detail` and the optional diagnostic loop.
5. In a later reviewed integration, add the same two logging additions after
   the durable successful evaluation write in production `operator.mjs`.
   Preserve its authorization re-export, one-shot cohort ID selection, job
   claims, deadlines, content/version key, cache event and failure handling.
   This operator change is **planned, not applied** in this branch. Its existing
   entrypoint logger already accepts fixed `detail` and `field`, so no logger,
   entrypoint or database schema change is required. Never include paragraphs,
   excerpts, raw response values or request headers in those events.
6. After reviewing this plan, assemble and inspect an **offline** candidate bundle,
   verify preserved-file hashes, and exercise mocked operator/cache/diagnostic
   paths before requesting a deployment or live-evaluation approval. A temporary
   source-tree rehearsal is already tested below; no bundle has been deployed,
   and PR95 remains a classifier-only proposal. Leave the client OFF. Do not
   invoke `warm`, reset completed cohort jobs, extend an evaluation window,
   enable serving mode or consume the separate 235 task's budget.

The only implementation follow-up made now is retaining the existing
cache telemetry line in the local draft service; no production auth code changed.
The [auth snapshot fixture](../../tests/fixtures/rss-quality/production-v6-operator-auth.mjs)
is an exact copy for offline verification, not a new production auth module.

## Evidence and label review

[Source evidence](../../tests/fixtures/rss-quality/source-evidence.mjs) stores one
bounded quotation per six fresh pages, with locator, supporting interpretation,
counterevidence and limitations. Each page contributes at most 25 quoted words;
full publisher bodies are not committed. These records are human-review aids,
not frozen trial snapshots or inputs to Jev. Neither page quotations nor review
labels are inserted by `articleFor()` into synthetic model state.

| Source | Evidence interpretation | Label authority |
| --- | --- | --- |
| [RSS-022 bucket](https://bloody-disgusting.com/news/3970212/blumhouse-popcorn-bucket-regal-cinemas/) | Preorder and merchandise details support the supplied promotion concern; background about the studio is counterevidence to inspect. | Existing user-reviewed promotion observation. |
| [RSS-039 collaboration](https://www.dexerto.com/food/taco-bell-is-giving-duolingos-mascot-its-own-sauce-in-taco-day-collab-3414480/) | Rewards, redemption and availability dominate; factual offer terms alone do not prove editorial purpose. | Existing user-reviewed promotion observation. |
| [RSS-021 ScareScore](https://bloody-disgusting.com/news/3970198/scarescore/) | Formation, founder claims and future launches suggest campaign copy; explanation of measurements could have reader value. | Proposed uncertain, awaiting human review. |
| [RSS-002 Lange](https://allthatsinteresting.com/dorothea-lange-photos) | The fresh page includes developed biography after its large gallery, including wartime documentation and publication restrictions. | Proposed editorial preservation if that prose is extracted; the historical candidate remains uncertain. |
| [RSS-001 Cliff House](https://allthatsinteresting.com/cliff-house-san-francisco) | Developed ownership, disaster and reconstruction history concerns a commercial resort; reopening mentions alone are insufficient to reject it. | Proposed commerce/history control. |
| [RSS-014 Erie review](https://bloody-disgusting.com/movie/3969472/erie-review-plays-fast-and-loose-with-found-footage/) | Specific criticism of filmmaking perspective supplies review value despite cast names and screening information. | Proposed independent-review control. |

All 11 synthetic cases now carry `labelSource='proposed-policy'` and
`reviewStatus='pending-human-review'` individually. Their bodies no longer state
their desired policy verdict or talk about mock evaluation recipes. The long
gallery fixture uses varied chronological biography and captions rather than
repeating the same assertion of readability 24 times. Associations with real
sources explain intent only: the proposed product-review fixture is not an
archived copy of Erie, and the synthetic ambiguous launch is not the ScareScore
body. No synthetic label is promoted to human-approved ground truth.

## Verification and remaining gates

`npm run test:rss-quality` includes the existing classifier/cache/security/cost
tests, source-evidence/provenance checks, and seven additional offline v6 tests:
the helper's exact SHA; caller header forwarding; malformed inputs causing no
request; non-OK, non-boolean and malformed responses failing closed; network
failure; a forged role token unable to bypass a mocked PostgREST rejection;
and the captured RPC definition/observed ACL exercised in ephemeral PGlite.
The review-record test also checks gateway and role metadata.

HTTP tests use mocks. Local Postgres verifies the captured definition and ACL,
not the live gateway's JWT cryptography. Read-only connector/catalog observations
support the production description; no live function invocation occurred.
Typecheck and `git diff --check` also pass. Browser/recommendation tests passed
on the preceding draft; no UI behavior changed in this follow-up.

[Offline overlay verifier](../../tools/verify-rss-v6-overlay.mjs) accepts only a
nonsecret `get_edge_function` JSON capture matching every recorded v6 file hash.
It creates and removes a temporary source tree, overlays the classifier/service
and planned operator diagnostic log, and verifies all nine other files remain
byte-identical, including the auth helper and entrypoint. Run it with
`node tools/verify-rss-v6-overlay.mjs /path/to/nonsecret-v6-source.json`.
The [saved rehearsal](rss-purpose-20261005/overlay-rehearsal.json) records:
optional topic failure preserves a core approval with one mocked evaluation;
malformed core confidence produces an error with one retry *record* and no second
evaluation; a busy budget/cache claim produces pending with zero evaluations.
Fixed diagnostic events omit body text and the test key. All HTTP/source/provider
work is mocked. The gateway/Deno entrypoint and durable production budget are not
executed; no artifact was deployed. This rehearses the integration plan without
installing the planned operator file into the production implementation tree.

The saved deterministic comparison still has 11 synthetic scenarios and 17 test
cases, with the same scripted outcomes and six optional-field mutations. No
actual model response was obtained and no original schema error was numerically
reconstructed. Human labels, frozen source snapshots and approval of the bounded
live trial remain required. Exact production source availability is now resolved;
minimal operator diagnostics integration and deployment authorization remain
separate future steps. No merge, paid call, Edge deployment, SQL mutation, App
Store action or 235 release change was performed.
