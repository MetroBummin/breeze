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
- Explicit hybrid catalog partition `[7,9,11,12]` (WIRED and Medium), with the
  other nine built-ins retaining their existing local transport/cache. A managed
  error or missing record never causes a legacy feed rebuild. All thirteen source
  inventories remain represented even when no candidate is photo-ready.
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
