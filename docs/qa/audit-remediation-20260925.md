# Audit remediation — 2026-09-25

## Scope
Core changes are separate from Home #20, Preview #21 and iPad Annotation #22 follow-ups. No production deployment, data migration, app upload or main merge is part of this work.

## Implemented
- F01: local record failures reject; writes resolve on transaction commit/error/abort. Blocked DB open is bounded. Book/original/unreferenced-image deletion is one transaction, respecting shared image references. UI removal/success follows commit. Failed reads keep the previous list and expose retry; paste input survives failure.
- F02: every redirect validates HTTP(S), public address families and credentials/ports. DNS results are pinned into the socket lookup with original TLS hostname. Bounded streaming reads, abort budget and per-runtime concurrency cap replace whole-response buffering. Deploy `server/article/public-fetch.mjs` with the entry point. This transport needs Supabase/Deno staging compatibility validation before deployment.
- F03: error/null/malformed quota RPC refuses a new paid model call with 503; valid spent responses still mean 429.
- F04: new shell requires every version-hashed script/style and font before activation. Failure preserves old worker. No automatic takeover of running readers; don't refresh old-generation HTML behind the worker. Cleanup only touches owned version caches and retains one rollback generation.
- F05: Reader continuations and article ingestion respect latest navigation intent; optional AbortSignal lets Preview cancel a pending Reader transition.
- F06: new paste/article IDs digest the complete exact paragraph sequence. Existing IDs are not migrated, exact legacy duplicates retain their ID.
- F07: every runtime PDF.js load disables isEvalSupported per the published CVE-2024-4367 workaround. Pinned library is not blindly upgraded; patched version adoption remains separate.
- F08: read-only pull_request Integrity workflow runs npm test, including 25 new targeted audit tests. Repository branch-protection/required-check administration was NOT changed.
- F09: preserve different definitions in a local exportable conflict journal before record-level LWW; `breezeExportWordConflicts()` exports both. This is not automatic field-level merging. A failed local save stops remote CAS and dirty clearing.
- F12/F13: current data-flow notice distinguishes current plaintext wordbook sync from legacy vault/progress paths; describes Preview title/excerpt processing and shared metadata cache. Legacy backup normalizes imageBytes records.

## Coordinated feature follow-ups
Home: edge-subject crop bounds, contain fallback for unfittable unions, no-cover text identity, explicit empty-state action, keyboard/card/menu access.
Preview: early RSS metadata shell before body/images; cancelled preparation cannot replace a newer Preview; Reader wait is abortable/bounded; loading skeleton vs source-first final fallback.
Annotation: explicit read-only default/edit lock, tool collapse independent of lock, native scope disabled while locked. All paper rectangles remain cached in content coordinates; don't rescan all pages on scroll or pinch preview. Relevant layout changes invalidate committed geometry.

## Executed verification
- 25/25 Node audit tests execute production helpers with transaction/network/DOM doubles: read/write/delete failure, shared-image deletion, image-byte normalization, full content digest, quota verdicts, IP/redirect/DNS/stream/cancel policy, partial shell, conflict journal, Reader A/B race.
- Home crop functions: 4/4 Node cases.
- Preview: 20/20 real Chromium isolated resilience fixture cases with auth, metadata HTTP, images and Reader doubles. No live model calls. This does not prove live Supabase or entire app integration.
- Core and three feature worktrees typecheck: no baseline increase (core reduces 37 to 36). JS syntax/diff whitespace checked.
- Full local npm test progressed through dictionary/sync/word lifecycle suites, but the 5000-record vocabulary item-storage test exceeded the local command budget. No full-suite PASS is claimed from this local attempt; consult PR CI for the exact pushed SHA.

## Release gates
1. Resolve overlapping library/import/ADR changes when core/Home/Preview/recommendation are integrated; preserve present:false, latest-intent, Preview routing, full-content identity and atomic-delete hooks together. Do not replace a whole shared file with one branch's copy.
2. Run full npm test and entire app Chromium/WebKit on the integrated SHA. Regenerate index/SW stamps at integration.
3. Validate Node-compatible pinned article transport in a non-production Supabase runtime; actual Auth/quota/shared Preview cache/RLS remain outside these tests.
4. iPad read lock/native-scope changes require fresh physical Pencil, inertia, palm, active pinch, app restart/save and long-document tests. The earlier 21-contact result is NOT proof for this revision.
5. Required-check enforcement still needs a repository administrator decision. Draft status is intentional until integration gates close.
