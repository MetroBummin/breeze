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
