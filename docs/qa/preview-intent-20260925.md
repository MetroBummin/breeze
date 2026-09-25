# Preview: explicit save intent and visible Korean metadata state

Base: main 11c40da83f2e520b2e5ea6f1c20070ef7aecec60 (Home/recommendation/Preview merged).
Verified functional commit: a1564f34fa38a8db94245d9520a8a2c8467c3a3d.

## Reproduced causes
- RSS Preview preparation previously ran attachArticleImages and saveCasualBook.
  `present:false` suppressed navigation, not persistence. Closing the Preview
  therefore left a new card and removed it from recommendations.
- The regular-card management button was an always-visible bubble above artwork.
- All metadata errors became null, hiding whether AI was loading, offline,
  unauthorized, unavailable, quota-limited or slow. Preparation's null metadata
  promise could replace the preparing state; finishing preparation closed and
  reopened the same modal.

## Corrected contract
Discovery prepares an in-memory draft. No new book/images/progress are written
until Read is explicitly tapped. CTA serializes same-source commits; cancellation
before CTA, slow preparation and A/B switching cannot write a library item.
After an explicit Read, a started storage transaction may complete even if the
dialog is dismissed, but its Reader navigation is cancelled. Saved unread items
and explicit URL/paste imports are not silently deleted or treated as previews.
Optional validated Korean metadata can still fill its bounded reusable cache.
Feed posts use the same draft/commit boundary.

Loading has a spinner and “한국어 소개를 불러오는 중…” next to the skeleton;
failure is terminal, accurate and manually retryable. No fake endless loading
or automatic paid retry. Source title/excerpt and Read remain available.
Preparation changes content in the existing modal without close/reopen.
No visible ellipsis bubble; long press, Shift-F10 and a keyboard/VoiceOver
management control remain. The latter is only visibly revealed on keyboard focus.

## Read-only production investigation — 2026-09-25
The project from `config.js` is `hrtfhojbhqvaoiulspto`. Connector management reads,
not guesses from a screenshot, returned deployed functions `dict`, `tidy`,
`format`, `article`, `lookup-hypothesis-eval-0923`, and NO `article-preview`.
The `public` table list has NO `article_preview_cache`; migration history has
NO Preview cache migration either. No secrets were read, changed or logged.
No production writes, function deployment or billable AI evaluation occurred.

This PR alone cannot make live Korean generation available. After separate
approval, deploy only the existing
`supabase/migrations/20260924150455_article_preview_cache.sql`
to the correct Breeze project, verify its RLS + actual quota RPCs, set/verify
OPENROUTER_API_KEY privately, and deploy `article-preview` with `generate.mjs`.
Do not blindly db-push other READY migrations/config into Breeze.
Verify a real cache miss/hit, anonymous/authenticated quota, and UI response
before declaring production ready. Model/prompt are unchanged here.

## Executed verification
Run: https://github.com/MetroBummin/breeze/actions/runs/36136768015
Job: 108076591390. The runner checked out the staging commit 201dbdb, applied
source/output SHA-256-verified edits, and ran the following against that complete
working tree BEFORE committing and pushing it as a1564f3. Later cleanup changes
only this report and CI scaffolding; the tested runtime code is unchanged.

- `node tests/verify-preview-intent-browser.mjs`: **20/20 PASS**, ten cases each
  on Chromium and WebKit. Actual app scripts, DOM, IndexedDB and Reader; external
  HTTP/extraction/AI responses are controlled fixtures. Cases cover dismissal
  during preparation, no book/image/progress writes, same-dialog preparation,
  one CTA commit, existing saved unread preservation, storage failure/retry,
  short feed posts, 20 rapid selections, missing-function/manual-retry state,
  visible loading and keyboard management without the ellipsis overlay.
- `node tests/verify-article-preview-resilience.mjs`: **40/40 PASS**, twenty per
  browser. Actual Preview JS/CSS/dialog/input; auth/HTTP/storage/Reader doubles.
  Five viewport sizes, stable layout, response inversion, request reuse, cache,
  deadline, invalid response, failure, keyboard and reduced-motion tests.
- `npm run test:ingestion`: PASS, including the existing article-preview browser
  suite, RSS cards and persisted share-handoff fixtures on Chromium/WebKit.
- `npm run test:home-ui`: PASS, including resume/navigation cancellation,
  light/dark controls at five sizes, refresh, Reader progress and wordbook.
- Full `npm test`: PASS, including audit 25, recommendation 30, structure,
  dictionary/sync/gesture/lifecycle/geometry and 5,000-record item storage suites.
- `node --test tests/verify-article-preview-server.mjs`: **13/13 PASS** with
  Supabase/model doubles. This does not establish live Auth/RPC/RLS success.
- Typecheck passes without new per-file diagnostics, baseline 37 -> actual 35;
  asset stamps and `git diff --check` passed. This is not a claim of zero type errors.

The local container's navigation was policy-blocked; full-app results above are
from the GitHub runner, not local browser execution. No new live model calls.
Physical iPad/iPhone, production Korean generation and live Supabase integration
remain separate checks. Previously saved articles are deliberately not bulk
deleted: the old schema cannot safely identify which saves were unintentional.
