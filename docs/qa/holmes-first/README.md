# Holmes-first shelf; Backrooms dormant

Base main: `72719a2cfa9a7242b15d24cd0cc72f9753310dbe`.

Only the new-recommendation filter changes. Home and Long-form offer the five
Holmes works in their established order. Backrooms retains its catalog identity,
text, cover, ten scenes, local lookup data and attribution; saved copies still
use the same preview and reader. No storage migration/deletion, shelf redesign,
native build, merge or release is included in the offering change; coordinated
release-number preparation is recorded below. FSRS remains
dormant; RSS/Jev configuration is untouched.

## Validation

- Full `npm test`: passed, including canonical structure/catalog integrity and
  existing vocabulary/sync/lifecycle regressions.
- `npm run test:holmes`: Chromium and WebKit pass exact five-story Home and
  Long-form offerings, all fifty scene placements/decodes, full previews/imports,
  saved positions, and five viewport sizes in light/dark with no overflow.
- `npm run test:longreads`: both engines pass previously imported Backrooms
  saved-card preview/read, complete 107 paragraphs, ten scenes, word/sentence
  taps, study highlights, light/dark, attribution/license and database/progress
  reload; Holmes previews pass failure/retry/truncation/cancel/duplicate cases.
- Strengthened saved-copy reload checks compare exact book ID, paragraphs and
  custom-cover reference; cover-repair concurrency and dormant-offering after
  removing a saved copy remain covered by unit tests.
- `npm run test:homeward-lookup`: both engines retain 314 source-backed sentences,
  43 words, 34 phrases, edited-copy guards and no AI request for local hits.
- `git diff --check`: passed. No content/image assets are changed or removed.

Browser checks do not establish physical-device performance. WebKit cold
service-worker control is unsupported in this harness; native release/device
verification remains with parent coordination.

## Visual proof

Synthetic empty-library fixtures, using approved covers:

- [Tablet dark / Chromium](chromium-shelf-820x1180-dark.png)
- [Phone light / WebKit](webkit-shelf-390x844-light.png)

## Verified 1.6 to current 1.7 release facts

These are editorial inputs, not a claim of new deployment in this PR:

- Five complete lightly modernized Holmes works with approved covers and ten
  illustrations per work; spoiler-free preview before normal import, source-led
  chapter/frontmatter typography. See the illustrated-collection QA and source
  audits; the five works are now the only bundled new recommendations.
- Saved word/meaning cards in Breeze Memory, with flip and previous/next, including
  all saved meanings regardless of list filters. Scheduled/FSRS review is dormant
  and should not be advertised as a shipped 1.7 feature. See decision 013 and
  `docs/qa/simple-word-cards/README.md`.
- Context-aware word and sentence easy explanations, explicit meaning-correction
  acceptance, and safer cancellation when leaving an occurrence. See sentence-help
  QA, meaning-suggestion QA and dictionary decision 004. AI help retains its
  existing access/quota/backend capability requirements.
- File-only PDF/EPUB import from the iOS share sheet, plus protection of saved
  original-reading positions while reopening. See `docs/qa/breeze-1.7-release.md`,
  `docs/qa/breeze-1.7-reopen.md` and the Share Extension implementation. Link
  sharing and new Backrooms availability should not be advertised.

## Coordinated 1.7 (234) release preparation

Parent release coordination verified Next Build Number 234 in the authenticated
Xcode Cloud UI. App and Share Extension Debug/Release, the existing release
verifier, the post-clone `CI_BUILD_NUMBER` guard, and local archive/output naming,
archive build validation and upload status wording are aligned to **1.7 (234)**.
Marketing version remains 1.7. No product behavior, signing/Cloud settings, main
merge, native archive or Cloud build is changed or started by this preparation.

Release preparation checks passed: full `npm test`, 1.7 (234) release verifier,
shell syntax checks, `npm run ios:sync`, exact native-bundle comparison for all
long-read text/image files including dormant Backrooms, and `git diff --check`.

## Final TestFlight-only 234 scope

The latest user scope requires final 1.7 (234) TestFlight validation, followed by
user confirmation before any public App Store release. Parent owns final CI,
merge, Cloud build and TestFlight delivery; this worker starts none of those.

PDF +/- zoom controls are removed; existing pinch/pan, scale limits and gesture
owners remain. Existing pinch shrink reaches 100%, and the existing Text-mode
transition resets zoom. Text font size and page direction/navigation controls
remain. Desktop button-based enlargement is intentionally unavailable.

Two-finger double-tap undo moves from Reader Aa to the eraser settings directly
below radius controls. Default OFF, the existing persisted preference, undo
transaction, pen/eraser/highlighter and pinch/ink ownership remain. The control
has a named 46×44px hit target, theme tokens and reduced-motion switch behavior.

### EPUB failure diagnosis

CI 37181791085 failed the unchanged monotonic-motion assertion in Chromium before
WebKit ran. Baseline 72719a2 and PR c2c680f use identical navigation product code
and fixture; both ordinary local two-engine runs passed. Under supported CDP
12× CPU throttling with actual browser rAF timestamps (none injected), each
reproduced 13 backward starts in 24 moves. [Before evidence](epub-clock-before.json)
records exact time/token/scroll/frame/inset anchors: baseline began at
16403.899999976158ms, first queued frame timestamp 16400.766ms, scroll 32→0;
PR began at 16181.399999976158ms, timestamp 16180.1ms, scroll 32→8. This proves an
inherited product clock-boundary bug rather than a catalog regression or a basis
for a blind rerun.

Easing now clamps progress to [0,1]. Existing monotonic, intermediate-position,
exact source settling, latest-choice, reflow/pressed-target and reduced-motion
assertions remain; forward/backward clock-boundary contracts fail on baseline
and pass after the fix. Browser coverage includes eight actual throttled moves,
plus per-frame timing/source histories for failures. No target, duration or
interruption ownership changes.

### UI proof

- [Phone light eraser setting](eraser-chromium-390-844-light.png)
- [Short landscape dark eraser setting](eraser-webkit-844-390-dark.png)

Synthetic local PDF fixtures, not user documents. Browser touch/Pencil tests do
not establish physical palm rejection, hardware latency or native inertia.

Final local validation passed: full `npm test` (including new forward/backward
clock-boundary contracts), EPUB input/motion both engines and eight real
12× CPU-load movements, relocated eraser preference/real database reopen and
ten theme/viewport states per engine, full PDF ink both engines, full PDF pinch
(phone/tablet/desktop Chromium and phone WebKit), word-pinch dismissal and PDF
interruption/owner recovery both engines. Device-polish controls, `ios:sync`,
all 72 native long-read asset bytes, 1.7 (234) release verification and whitespace
checks passed. Trusted CDP touch and synthetic WebKit/Pencil evidence are distinct
from physical-device testing. CI on the final exact head remains the merge gate.
