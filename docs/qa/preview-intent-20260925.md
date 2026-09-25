# Preview save intent and Korean metadata state — 2026-09-25

Base main: `11c40da83f2e520b2e5ea6f1c20070ef7aecec60` (integrated #24/#20/#23/#21).

## Reproduced source causes
- `importRssEntry` showed an early shell, but `ingestArticle` / `ingestFeedPost` still called `attachArticleImages` and `saveCasualBook` during preparation. `present:false` meant no Reader presentation, NOT no save. Even dismissal could leave a new Casuals record and remove its RSS recommendation.
- `homeRegularTile` unconditionally added a large ellipsis overlay for saved books. Long press and Shift+F10 already existed.
- Every metadata failure collapsed to null. The same source-only fallback hid whether AI was loading, unavailable, offline or timed out.
- Read-only Supabase management checks against the project configured in main (`hrtfhojbhqvaoiulspto`) returned no `article-preview` among deployed Edge Functions and no `article_preview_cache` among public tables. The cache migration was also absent from migration history. No production mutation or paid model request was made. A merged frontend alone cannot generate Korean introductions without this backend.

## New contract
RSS discovery preparation is memory-only, including short feed posts. It does not write books, images, reading progress, or remove recommendations. The Read CTA commits a prepared source through the existing persistence path, then enters Reader. Concurrent commits share one job. A failed save retains the draft for retry; dismissal after Read may leave an explicitly requested save, but cannot cause stale navigation. Explicit URL/paste saving retains its existing intent. Existing saved items are NEVER purged based solely on zero reading progress.

Drafts live in a WeakMap, not persistent records or hidden shelf flags. Image persistence is deferred to the CTA. The early-shell to ready-source transition updates the same dialog, without closing and reopening it. Optional AI results may finish into the bounded metadata cache only; they cannot save a book.

The visible metadata status sits beside the missing Korean content. Loading has a spinner and text; success fades in the hook/teaser; final failure displays an honest reason and manual retry. Retry never blocks the original excerpt/Read action and is never automatic. Original English title/excerpt and the existing glass design remain. No always-visible ellipsis overlays remain; long press and keyboard management remain, with a named assistive-technology action hidden until keyboard focus.

## Backend release gate
Review/apply ONLY `supabase/migrations/20260924150455_article_preview_cache.sql` to the Breeze project, confirm the existing authenticated/anonymous quota RPC contracts, configure `OPENROUTER_API_KEY` on the server, and deploy `supabase/functions/article-preview` including `generate.mjs`. Do not run all repository migrations indiscriminately: the repository also contains READY settings. Do not paste credentials into PRs or bundle them into the client.

The read-only inspection above does not establish whether the OpenRouter secret is already configured. Production deployment, migration, secrets and full AI/cache/Auth/RLS E2E are NOT performed by this PR. Validate anonymous and signed-in cache miss/hit and generated Korean output before claiming this feature live.

## Verification
- Local actual Chromium isolated resilience: 20/20 passed after the change (HTTP/Auth/Reader doubles). Typecheck did not increase the baseline.
- New `tests/verify-preview-intent-browser.mjs`: real app/DOM/IndexedDB with controlled network; dismissal before/after preparation, no hidden image writes, CTA dedupe, save failure/retry, existing saved preservation, short feed posts, rapid selections, explicit missing-function state/retry, visible loading, and keyboard menu access.
- Whole-app Chromium/WebKit, existing ingestion/Home and full npm test results must be recorded against the actual pushed functional SHA, not inferred from the isolated tests. Local full-app navigation is blocked by this environment's browser policy; remote CI is used for those checks.
- iOS/TestFlight physical-device verification and actual deployed Korean generation remain release checks.
