# Breeze 244 integration candidate

Base: main `693488cfe25419654e91d5bf18a03cbb8d8d591c` (the prior combined
PR104/105 release). This candidate includes PR109 `4114917bb181faf071c524f01aef90b4d506e099`
and PR110 `eeb21fd1acc6752c25e020e131b5995b14a07d76`, preserving both histories.
Main merge and the next Xcode Cloud build remain blocked until exact combined
CI and actual backend activation/warm-up checks pass. No App Review submission.
244 is the requested target; retain Xcode Cloud's authoritative numbering and
verify the actual binary rather than reusing or forcing an occupied number.

## Included work

- PDF visible-page repaint/cleanup correction, plus dedicated Chromium/WebKit
  portrait 820×1180 and landscape 1180×820 tests at DPR2. This is browser proof,
  not a claim of physical iPad verification.
- Stable ownership of the existing two original-photo requests per discovery
  generation, including forced late feeds and Preview owner recreation.
- Restore photo-ready-only recommendation display. PR99 changed the old rule at
  [24fc7673](https://github.com/MetroBummin/breeze/commit/24fc76739cbb87ca410d2bae6da76f6a0052c4f6),
  integrated by `79784329`. Unknown candidates remain retained; only complete
  successful no-image responses create negative cache entries. Pending UI belongs
  to actually admitted work. Failed/unadmitted/absent photos cannot become
  permanently selectable artwork cards; existing supplied-photo fallback and
  bounded original-only recovery remain.
- Explicit hybrid catalog partition `[7]` (WIRED), with the
  other twelve built-ins retaining their existing local transport/cache. A managed
  error or missing record never causes a legacy feed rebuild. All thirteen source
  inventories remain represented even when no candidate is photo-ready.
  The initial four-source warm returned Medium unavailable; Medium therefore
  remains explicitly legacy-owned rather than disappearing or falling back on error.
- Existing client original-photo recovery remains available in hybrid mode under
  the same shared two-request cap. Shared-server original admission remains empty;
  there is no new publisher original-page probe permission.
- Scheduler owner-API compatibility; hosted pg_net API-isolation assumptions are
  documented without falsely claiming managed PUBLIC ACLs disappeared.
- RFC weak conditional GET matching for gateway-weakened ETags, and awaited
  fail-closed validation through the existing same-project operator RPC. No new
  RPC, grants, keys or credential export. Private scheduler credentials use
  Authorization; redirects/logging and the existing namespace advisor remain
  explicitly documented operational checks.

## Validation boundary

Both component PRs passed their exact-head workflows before this integration.
Local combined focused RSS/PDF tests and the controlled server measurement pass;
complete npm/type/native sync, Edge Deno and full browser CI must pass on this
exact integrated tree. New hybrid browser coverage runs independently so it does
not hide or crowd out the existing full regression job. Landscape proof runs in
four separate engine/orientation jobs.

The committed client opt-in is an intended release setting on the candidate
branch. It is not evidence of live activation: production main stays unchanged
until the backend's fixed reviewed sources are warmed, public/repeat reads and
weak 304 are verified, private auth/scheduler gates pass, and source ages and
coverage are checked. The unrelated Ready project is excluded.

The specific pictured Medium Business “Healthy Habits…” article rolled out of
the live feed before its URL could be identified. The user's report that its
original has no photo motivated restoration of the verified historical rule;
this report does not invent that article's request/cache history.

## First combined CI corrections

The first head `de1355c3` caught a missing declaration for the new explicit
`BREEZE_CONFIG.RSS_CATALOG_FEED_IDS` field. A local full-source TypeScript
comparison reproduces TS2339 at `rss.js:50` before the declaration and passes
the unchanged 34-diagnostic baseline afterward. No baseline increase is used.

The hybrid Preview fixture also placed its body sentinel inside the existing
bounded introduction-cache excerpt. It now distinguishes that permitted excerpt
from later body content, positively checks the bound, and retains the no-body
discovery-cache and pre-Read IndexedDB assertions. This changes no product cache.

Legacy supplied-cover/ingestion/RSS-card fixtures now explicitly select their
legacy transport with synthetic configuration; the independent hybrid suite
continues to exercise the intended production ON partition. The warm-cover
fixture waits for the existing owner/work settlement predicate, then requires
exactly two decoded ready cards, all thirteen retained candidates and unchanged
request count. A controlled renderer test reproduces the intermediate two-photo
count with a third inert queued probe, then proves zero-request cleanup.

On `cf99e880`, complete npm/type/native sync and Edge Deno OFF/active/prefix
checks passed, as did Social/import and all four PDF engine/orientation jobs.
The remaining RSS fixture corrections preserve supplied photo identity, admit
only the existing saved-Reader `{op:'warm'}` request after trusted Read intent,
and compare fresh eligible ranking before admission separately from settled
post-admission owner stability. Scroll cancellation now proves real overflow and
actual offscreen geometry with supplied photos, then waits for the exact
consumer's abort/release instead of assuming thirteen artwork slots still exist.
The metadata request cap, stale-cache prohibition and retained-data assertions
remain. Held transports replace short timing races in cancellation/reentry cases.

## Normal refresh recovery

Head `e014c998` exposed a real recovery failure after temporary relay errors:
normal Home refresh advanced the budget generation but identical feed metadata
reused an empty-rail render stamp. The stamp now includes the generation. A
production-loader/renderer regression fails before the fix with two cumulative
original requests and passes afterward with exactly four across two generations,
two decoded cards, thirteen retained candidates and no warm retry/body writes.

A separate held-feed regression confirms that replacing an entry object with
identical metadata could cancel its already admitted request. Ownership now
follows the current canonical entry only when the existing full card identity
matches. Changed title/version still aborts and cannot populate stale cache.
Confirmed-negative records keep their timestamps and are not fetched again;
the budget recovers other unknown entries. Both fixes retain two requests per
generation; the browser assertion remains exactly two decoded cards after retry.

The final candidate narrows the shared partition to WIRED `[7]`. Node contracts
read the actual config and verify one catalog plus twelve legacy sources on
success and failure, including Medium. The dedicated browser test uses that same
partition. The production runtime allowlist and scheduler must still be verified
before merge; repository settings alone do not establish server readiness.

The image-retention fixture separates completed negatives from canceled unknowns:
feed-refresh completion does not mean cover metadata has settled. A controlled
three-generation test reproduces six requests/five unique URLs when an unfinished
unknown is canceled and explicitly retried in the next generation, versus six
unique URLs for settled generations. Each generation still has two distinct
requests; confirmed negatives are requested once without timestamp renewal.
The browser's strict uniqueness check now waits for metadata settlement between
intentional refreshes and retains the exact same held image task throughout.

Navigation coverage distinguishes return from a later explicit refresh: Home
return preserves the stamp and decoded card, while deliberate refresh advances
the generation and its stamp. The image-resume case first proves both metadata
slots are admitted, then keeps its unchanged request-total assertion. A separate
controlled regression proves that returning with one unspent slot may admit a
different URL while never refetching the retained image's original.

The separate active-quality browser fixture also waits for decoded cover state
before asserting natural image width and retained-node identity. A merely visible
pending card is not decode evidence; the existing assertions are unchanged.

## Backend readiness observed

The actual 2026-10-06 10:10 UTC scheduler cycle succeeded with one fetched source,
zero failed sources and zero original jobs/HTTP attempts. Final public readback
at 10:12:40 UTC showed exactly WIRED `[7]` ready and twelve disabled shared groups,
with twenty entries, supplied photo URLs, bylines and original-source links.
GET returned 200/14,019 bytes and conditional GET returned 304/zero body bytes.
DB and the existing ten-minute job are active; deployed source is unchanged from
the tested bundle. Artificial two-caller refresh proof remains unrun after a
denial, and the existing pg_net namespace-registration advisor remains documented.
Final app CI and main merge remain independent gates.
