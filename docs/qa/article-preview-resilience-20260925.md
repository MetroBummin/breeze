# Article Preview resilience review — 2026-09-25

Reviewed PR #21 at `89ba618116de0c9bf84356ea9e472d0a88716342`.
This change preserves its model, prompt, Home layout, Reader implementation,
import routing, and unread/read contract. It does not merge or deploy anything.

## Corrections

- Keep the centered glass/X-button presentation. Use a viewport-bounded dialog
  and reserved hook/teaser slots so late AI text cannot move the dialog or CTA.
  The original title is known at open and does not need a fixed-height slot.
  Add a short opening transition only when reduced motion is not requested.
- Keep the CTA outside the content scroll area. Normal tested sizes need no
  internal scroll; extreme text sizes may scroll with hidden scrollbar chrome
  instead of losing content. At very short landscape heights omit the decorative
  hero and extra excerpt. The X hit target is 44px.
- Use the always-present original title as the dialog's accessible name, not an
  initially hidden/empty AI heading. Preserve native focus/Escape behavior.
- Deadline covers auth, fetch and JSON reading, not only a fetch AbortSignal.
  At most four client metadata jobs may be active. Same evidence shares a job.
  A closed preview's bounded job may finish into cache but cannot paint another
  article or reopen a dialog. Queued native close events cannot clear a new open.
- Cache v2 keys the actual normalized URL, title and excerpt. Validate entries,
  cap at 100 and expire local entries after 30 days. Corrupt/denied storage is
  nonfatal. Cache hits render synchronously. Read formatting.blocks before the
  legacy blocks/paragraph fallback; never manufacture new source evidence.
- Decode covers before replacing artwork, ignore stale results and release object
  URLs on failed decode/close. Backdrop dismissal requires a gesture that started
  on the backdrop, not a drag from article text.
- Reader CTA is independent of AI. Gate repeated starts; keep Preview until
  Reader's onPresented callback; recover a failed handoff with a retryable CTA.
  Once requested, the existing Reader operation itself is not abortable: closing
  the sheet does not cancel that operation. No Reader-wide cancellation refactor
  is claimed here.
- Edge handler bounds JSON input at 16 KiB, validates cached/model metadata, fails
  closed on malformed quota RPC results, and versions shared cache keys.
  Valid generated text is returned even when shared persistence fails (persisted:
  false), allowing client caching instead of throwing away a paid response.
  Up to 16 different generations share same-evidence jobs within one runtime;
  each request still passes its own quota check. This is NOT distributed
  exactly-once generation and does not deduplicate per-request quota charges.

## Tests actually run for this revision

- `node --test tests/verify-article-preview-server.mjs`: 13/13 cases passed.
  Runs the actual TypeScript Edge handler after transpilation with controlled
  Supabase/model doubles. Covers input, quota fail-closed, cache hit/read/write
  failures, concurrent generation, retries and evidence/version keys.
- `BREEZE_TEST_BROWSER=chromium BREEZE_CHROMIUM_PATH=/usr/bin/chromium node
  tests/verify-article-preview-resilience.mjs`: 20/20 cases passed.
  Actual production Preview JS/CSS and native Chromium dialog/layout/input,
  in an isolated in-memory fixture. Auth, fetch, Storage, image source and Reader
  are doubles. Normal 320x568, 390x844, 820x1024, 1280x800, 844x390 stayed centered
  with unchanged dialog/CTA geometry across metadata arrival and no inner scroll.
  Includes out-of-order responses, rapid reopen, cache invalidation, hung auth/
  response body with controlled clock, malformed cache, storage refusal, delayed
  AI after Reader entry, Reader failure/retry, duplicate CTA, invalid URL/offline,
  HTTP retry, burst bound, image cleanup, backdrop drag, focus and reduced motion.
- `node --check scripts/library/article-preview.js` passed.
- Isolated TypeScript checkJs for Preview using ES2022/DOM and ambient declarations
  of existing app dependencies passed. Not the full repository typecheck.
- Inspected the Chromium fixture screenshot. This is not a screenshot from the
  complete Breeze app, native iPad or the final combined Home/Preview build.

The sandbox could not clone/install the full repository over the network. The
system Chromium blocked localhost navigation, so the isolated browser fixture
uses setContent and controlled storage/network. WebKit is not installed here.
No live OpenRouter calls, Supabase changes, Docker downloads or disk cleanup.

## Required integration / release checks

1. On a full checkout run `npm test`, the existing
   `node tests/verify-article-preview-browser.mjs`, both new tests, and the Home/
   ingestion regressions after incorporating Home #20 / recommendations #23.
   The new browser test defaults to Chromium AND WebKit when installed.
2. Regenerate tracked asset stamps via the existing `npm run stamp` / `npm run www`
   before deployment/native sync. This isolated source edit does not synthesize
   hashes for repository assets unavailable in the sandbox. Do not deploy a stale
   index/service-worker bundle.
3. Verify actual Supabase cache/Auth/quota/RLS and persistence failures in an
   authorized environment. Mock contract success is not that E2E.
4. Check iPad/iPhone/macOS for glass styling, real font metrics, focus, image
   decode, scrolling, rapid open/close and Reader transitions. Recheck long
   titles/teasers and enlarged text, and existing saved reading progress.
5. Prior model-quality limitations still apply: this change does not prove factual
   accuracy or improve the model prompt. No fresh live latency claims are made.

References used for lifecycle/accessibility review:
- https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element
- https://dom.spec.whatwg.org/#aborting-ongoing-activities
- https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
