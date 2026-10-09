# Local saved-Meaning review

Review reads saved Meaning records with a nonblank `word` and `ko`. It presents
their exact saved word, contextual definition, source example and book. Missing
source stays missing. Dictionary candidates and `ai.ko` never become answers.
Review makes no network/AI requests and never edits vocabulary, stars, marks,
word-item storage, tombstones or sync payloads (decision 007).

`BreezeReview` is a classic-script engine with explicit vocabulary, review state
and time inputs. All calls return fresh state. The UI reads the latest durable
state and commits one local value before advancing; a failed write leaves the
same revealed answer retryable. The opaque session/index/identity token rejects
repeated callbacks. A grade commits progress, daily counters, event history and
queue advancement together. This is not cross-tab compare-and-swap; concurrent
writers across tabs remain a limitation of the existing local storage contract.

## Limits and due work

The final UI has one **daily maximum unique-card count**, default 100, with
50/100/200/300 presets and custom input including zero. It combines new and
scheduled review cards; due work has priority and new cards use the remaining
slots. Same-day repetitions consume no additional slots. First relearning on a
later day consumes one slot. Regular/practice response history and new/review
categories remain separate internally; no unused allocation carries over.

Old v2 settings retain separate new/review fields for compatibility. The UI
initializes the unified maximum from the saved review limit (100 if absent) and
commits it on the next explicit start/settings save, without changing records or
queues. The engine honors the legacy split only when `dailyLimit` is absent.
Local dates follow the device timezone; this is not Anki's configurable rollover.

Only learned cards whose due time has arrived are scheduled reviews. Unlearned
cards are not overdue. Queue priority is due relearning, due review, then new
cards within the daily maximum. Backlog counts describe inventory, not a
recommended daily workload. Regular study follows stage boundaries without an additional batch limit.
Reducing the limits can pause an unfinished queue, never delete or complete it.
An already started queue stays intact. Explicit extra study bypasses daily limits for that session and local day;
it does not alter configured limits or authorize future sessions.

Unfinished queues resume, with answer visibility reset. On regular resumption,
higher-priority work that became due while away is served first and the original
queue is parked intact. Switching to another practice scope or regular study
also parks unfinished work. New vocabulary does not silently expand a started
scope. Missing or substantively changed references skip without being graded.
Completion describes the earned stage or daily goal. Pending relearning remains visible on completion; the back arrow ends study at any card. Timed relearning is served on resume or when the current queue runs out. Legacy short queues bridge directly into remaining eligible work, without a batch-complete screen.

## Five-stage daily journey

The first regular start freezes today's eligible unique-card goal, respecting
the combined daily maximum. Added cards
or a higher cap after progress do not move the earned finish line. A reduced cap
or removed inventory can shrink it without deleting queued work. Extra study is
explicit; overdue inventory above the cap remains pending.

Stages use increasing weights **5 / 10 / 20 / 30 / 35**. For 100 cards, cumulative
boundaries are 5 / 15 / 35 / 65 / 100; for 300 they are 15 / 45 / 105 / 195 / 300.
Whole-card allocation is positive and nondecreasing; goals below five use fewer
stages with no empty achievements. Boundaries are saved with the goal. This is a
product hypothesis about an easy start, not an empirically validated motivational
claim. The segmented track reflects distinct responses; one stage label and day counter show progress without duplicate per-batch counts.

All accepted regular answers, including failures, earn unique-card progress.
Same-card retries count as responses, not more goal cards or additional rewards.
Practice earns no daily journey progress. Each stage pauses on its saved
achievement until Next Stage; the back arrow and reload preserve it. Five stages remain visible; there are no extra five- or ten-card stops. The final
message celebrates today's goal, not mastery or completion of pending relearning.

The five transparent Thunderhead PNGs from main `8d302df` map to stage numbers;
no new artwork is generated. Their manifest's percentages document the nominal
100-card boundaries, not runtime scheduling. Sources for the product pattern:
[Duolingo flashcards](https://blog.duolingo.com/duolingo-flashcards/) and
[Practice Hub](https://blog.duolingo.com/guide-to-duolingo-practice-hub/).

## FSRS-6 scheduling and four ratings (1.7 / 221)

Use upstream **ts-fsrs 5.4.2**, MIT, published by open-spaced-repetition; npm
metadata checked 2026-10-02 (modified 2026-09-29). Node >=20 is required by its
package; Breeze tooling uses Node >=22. The unmodified UMD distribution runs
as a classic script in browsers and Capacitor WKWebView, with no network or
runtime npm dependency. `verify-fsrs-vendor.mjs` checks exact package and license
bytes. Its library version reports FSRS-6.0. Browser checks cover Chromium/WebKit;
physical iOS and signed archive validation remain separate.

Settings are pinned per scheduler version: requested retention **0.90**, the
upstream default 21 FSRS-6 weights, maximum interval 36,500 days, short-term mode
on, fuzz off. 90% is the Anki/FSRS default starting tradeoff between retention and
workload, not a measured guarantee for Breeze learners. Fuzz is disabled so
previews and commits agree deterministically; this differs from Anki's workload
spreading. Default weights are:
`[0.212,1.2931,2.3065,8.2956,6.4133,0.8334,3.0194,0.001,1.8722,0.1666,0.796,1.4835,0.0614,0.2629,1.6483,0.6014,1.8729,0.5425,0.0912,0.0658,0.1542]`.

Upstream handles learning steps `[1m,10m]` and relearning `[10m]`; Breeze does
not approximate FSRS formulas or override its due dates. These short steps give
immediate recall practice; FSRS stability/difficulty and real elapsed time govern
the long intervals once a card graduates. Persist New (no response yet), Learning
(1), Review (2), Relearning (3). Pending learning is included with relearning in
short-step work priority and remains visible after the daily goal is earned.

Judge recall **before** seeing the answer, not familiarity after reading it:

- **다시** / Again (1): incorrect or no recall. New cards restart at 1 minute;
  a Review lapse enters Relearning at 10 minutes.
- **어려움** / Hard (2): correct but slow/effortful. Never a substitute for failure.
- **알겠음** / Good (3): normal correct recall.
- **쉬움** / Easy (4): immediate, confident correct recall.

All four earn the same unique-card effort credit. Button intervals use the same
upstream calculation as commit. A stale interval across a time boundary is
refreshed before accepting an answer with a changed interval. A normal new card
previews 1m / 6m / 10m / 8d under the pinned parameters. Future intervals adapt.
Store each actual response's timestamp, rating, preceding scheduled due time,
FSRS state before/after, library review log and scheduler version. Practice keeps
its real response event but never updates regular FSRS memory or budgets.

There is **no personal parameter optimizer in this release**. Insufficient legacy
history must never be optimized or reconstructed. A future optimizer needs enough
real regular dated ratings, upstream optimizer support and held-out calibration;
there is no automatic enablement based on a guessed small history threshold.

Sources: https://github.com/open-spaced-repetition/ts-fsrs (MIT),
https://docs.ankiweb.net/deck-options.html#fsrs,
https://docs.ankiweb.net/studying.html#answer-buttons.

## Explicit filtered practice

Book, root-star and search filters scope individual Meaning rows. The visible
selection row and manual checkbox state were removed at user request on
2026-10-03. Filtering narrows the visible intersection without expanding an empty
scope.
An explicit action opens regular study over all books without filters.

Filtered practice includes precisely that scope, including future-due
cards. It is labeled “연습 · 복습 일정에 영향 없음”. Assessments are recorded as
practice events and do not change progress, due dates or regular daily budgets.
Practice runs continuously; its unprocessed queue persists through exit and reload.
Previously saved manual-practice sessions and their history remain readable; no
queue or study-engine storage is removed with the unreachable checkbox controls.
All reconciliation uses the full vocabulary so filtering cannot prune progress.

## Identity, v1/v2 migration and damaged storage recovery

Schema v3 remains under the existing local-only storage key. Each migration/recovery saves the exact original bytes to `.backup` (or a free numbered backup) before replacing the working value. Both read and commit share one safe decoder; malformed JSON, JSON null, arrays and scalar values never get reparsed unsafely during commit. Recognizable objects preserve individually valid records and real history. The UI announces recovery; a future numeric schema is refused. A failed backup or main write prevents advancement. Newer schemas
are rejected by the UI instead of being overwritten. Malformed individual
progress records are dropped; invalid sessions are discarded whole.

Identity is the exact `[key, word, ko, addedAt]` tuple. v1's six-field tuple is
projected to it, preserving due times, stages and queued work. Editing the book
name or example no longer resets progress. Editing the word/definition, root
promotion or reusing a key with a changed creation time still invalidates stale
answers. Identical deletion/recreation between observations remains
indistinguishable when all identity fields are preserved. No vocabulary schema
or cloud migration is introduced.

v1 stored only the latest assessment time, not complete response history or
new/review classification. Migration does not fabricate those events. Its last
known reviewed identities conservatively reserve both legacy category sets for
their recorded day, but their union consumes the unified maximum only once.
Settings identify the included legacy records. From v2 onward, budgets and
event categories are exact. v1 zero-stage progress retains its due time and is
classified as relearning; the old format cannot distinguish every uncertain
answer from a failed one. A previously lost/reset progress record is not recoverable.

## Study entry and presentation

Memory keeps its approved shared Home / center / CSV dock geometry. The center
pill starts immediately. There is no slider, quantity input, setup sheet or
separate batch setting. The one daily maximum lives in existing app settings.
Book/search/star scopes remain; only practice, interrupted work, pending
relearning, storage failure or a reached limit adds contextual copy.

Settings save on change, with a retryable storage error. Invalid input is not
saved; starts use the last saved limit. Reducing the maximum never deletes an
unanswered queue or marks cards complete. All controls retain 44px targets.

Starting navigates to the existing `study` page. The saved sentence and its
highlighted target precede the answer. Tap, Enter/Space or Show Answer flips the
card; grades remain unavailable before reveal. Browser navigation and Escape
retain durable queues while concealing the answer. Completion celebrates only
actual responses: stage completion, today’s goal, or “연습 완료”, never mastery.

Validation and remaining limits: [2026-10-02 QA](../qa/vocabulary-review-20261002.md).

Stage completion uses a large 200–260px mascot (140px in short viewports), one
heading and today's count. Outcome breakdowns and inventory diagnostics are removed from the study surface; history remains intact.
Redundant mode/percentage labels are hidden on the celebration. A single Next
Stage CTA uses user-requested vivid blue (#008DF0) and bold white 20px text,
matching the supplied “Add 1 item” reference. This is a scoped exception to the
normal neutral button tone; all other controls retain the shared design tokens.
The duplicate Stop button is removed: the existing back arrow saves the same
progress. Pending relearning remains visible even after goal completion.

A static warm yellow aurora behind the mascot increases in radius and opacity
with stages 1–5. It has no looping motion, does not cover text or intercept input,
and the mascot entrance respects reduced-motion preferences.


v1/v2 dates, streak metadata, real history and unfinished queues survive migration.
Legacy `streak` is retained only for provenance, never used for an FSRS interval.
`fsrs:null` explicitly means unknown memory; existing due dates stay in force until
the next real answer initializes FSRS as New. No fabricated old answers or
inverse inference from fixed intervals. Invalid memory is treated as unknown;
its exact original is retained by the recovery backup. Valid vocabulary storage
is never rewritten by this process. Pending legacy cards may need learning steps
again because their true FSRS memory was never observed.

Daily cap accounting (tested): new first answer = one unique slot; scheduled
review first answer = one; same-day Learning/Relearning repeats = zero extra;
first Learning/Relearning answer on another local date = one review slot; practice
= zero; explicit extra = may exceed today's cap without changing due times.
The screen separately shows scheduled review inventory, Learning, Relearning,
new inventory, and today's unique goal. Excess due cards remain overdue tomorrow.
Timezone changes affect the local day budget; due timestamps stay absolute.

Known storage limits: localStorage cannot provide multi-tab compare-and-swap;
backup or history quota failure stops advancement and requires space/retry.
History is intentionally not silently trimmed. There is no cloud FSRS sync.

## Minimal study surface (1.7 / 222)

Keep the stage track, saved content and four equal-weight rating buttons with actual intervals. Remove the enclosing card box, duplicate batch counter, inventory and outcome breakdowns. A single brief pre-answer recall hint remains with the answer; errors and storage recovery stay visible when relevant. Pending learning is shown after study rather than beneath every card. Daily limits, FSRS, saved history, mascot and warm aurora are unchanged.


## Memory entry copy cleanup (2026-10-03)

Remove the Memory list's learning/relearning waiting row and redundant “이어서
학습할 수 있어요” sentence. The existing start/resume button remains the entry.
Paused-limit and storage-error messages remain actionable; study completion still
shows pending short-step learning. Queue persistence, FSRS ratings/due times,
unique-card budgets and all vocabulary records are unchanged.

## 1.7 simple cards; scheduled review deferred to 1.8 (2026-10-03)

`ADVANCED_VOCABULARY_REVIEW_ENABLED=false` ships an all-saved-Meaning deck through
Memory's center **단어 카드** control. One card per saved nonblank word/meaning,
including distinct saved meanings of the same word. Memory search/book/star filters
never narrow this deck. It uses the existing literal word, meaning, source/example
and saved-expression highlighting. Front/back, previous/next and arrow keys are
available; the ends stop navigation without completion/stage progression. Empty
Memory has an actionable message. Current position is in memory for exit/reopen;
app reload starts at the first card. Collection edits are reflected when rendering.

Simple mode never calls `BreezeReview`, reads review storage, grades, schedules,
counts daily usage, migrates records or writes vocabulary/review data. Scheduled
review reads/writes reject while dormant; explicit daily/extra/settings/grade
entrypoints do nothing. Old study history routes resume simple cards. The advanced
settings section is hidden and its fieldset disabled; lookup, meaning additions,
Memory browsing/filtering/edit/export and reader study preferences remain intact.
The engine, its data and advanced UI remain for 1.8; no review-record cleanup occurs.

The browser review suite explicitly serves an ON fixture to retain advanced
regression coverage, while `verify-simple-word-cards-browser.mjs` tests the actual
shipped OFF source and asserts zero review-storage access. Both modes run in CI
Chromium/WebKit. Simple-card flips use a short fade to avoid perspective overflow
on tablet and respect reduced motion. No AI/backend changes accompany this scope.

## Do not ship dormant review resources (2026-10-08)

The shipped OFF page no longer loads the FSRS vendor or scheduling engine,
assigns no source to the hidden stage mascot, and schedules no advanced review
timer. Native packaging excludes those two scripts, the five stage PNGs and
manifest, the unreferenced round Thunderhead PNG, and parked exam/dictionary-seed
modules. Their source files remain intact. Packaging rejects an ON flag until
its entry scripts/assets are deliberately restored. The advanced browser fixture
explicitly inserts its engine scripts; OFF tests still exercise the real page.
No saved Meaning, review history, branded alternative or experimental source is
deleted. `verify-native-package.mjs` checks source retention, exclusion, and all
entry dependencies after the actual package build.
