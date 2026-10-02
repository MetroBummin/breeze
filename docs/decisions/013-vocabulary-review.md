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

## Limits, batches and due work

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
recommended daily workload. Microbatches automatically select five cards.
Reducing the limits can pause an unfinished queue, never delete or complete it.
An already started queue stays intact. Explicit extra study bypasses daily limits for that batch and local day;
it does not alter configured limits or authorize future batches.

Unfinished queues resume, with answer visibility reset. On regular resumption,
higher-priority work that became due while away is served first and the original
queue is parked intact. Switching to another practice scope or regular study
also parks unfinished work. New vocabulary does not silently expand a started
scope. Missing or substantively changed references skip without being graded.
Completion describes only the current batch, reports remaining due reviews and
pending relearning separately, and offers continuation; the back arrow ends study. Timed relearning
is available in the next batch or on resume; a finished batch does not auto-start.

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
claim. Stage percentage reflects actual distinct responses within that stage;
the separate day counter shows actual completed cards against the full goal.

All accepted regular answers, including failures, earn unique-card progress.
Same-card retries count as responses, not more goal cards or additional rewards.
Practice earns no daily journey progress. Each stage pauses on its saved
achievement until Next Stage; the back arrow and reload preserve it. Five stages remain
visible, while five-card microbatches keep long stages interruptible. The final
message celebrates today's goal, not mastery or completion of pending relearning.

The five transparent Thunderhead PNGs from main `8d302df` map to stage numbers;
no new artwork is generated. Their manifest's percentages document the nominal
100-card boundaries, not runtime scheduling. Sources for the product pattern:
[Duolingo flashcards](https://blog.duolingo.com/duolingo-flashcards/) and
[Practice Hub](https://blog.duolingo.com/guide-to-duolingo-practice-hub/).

## Three assessments, without an algorithm claim

Judge the answer recalled **before** revealing the saved meaning:

- **다시 학습**: failed recall / incorrect. Reset the stage, mark relearning and
  schedule 10 minutes later. Repeated failures repeat the same step.
- **어렵게 맞힘**: correct recall with difficulty. Retain the current day stage,
  with a one-day minimum for new cards or completed relearning. No one-hour
  penalty, stage demotion or failure classification.
- **기억함**: correct normal recall. Advance through 1, 3, 7, 14, 30 days, capped
  at 30. Successful relearning returns to one day.

Buttons publish the exact delay applied by the engine. The first successful new
or relearning answer has a one-day interval for both success grades; later Hard
retains the interval while normal recall advances it. These are Breeze's fixed
rules, **not FSRS and not the Anki scheduling algorithm**. FSRS, its parameters,
retention controls and validated history migration are a separate follow-up.
Principles: [daily limits](https://docs.ankiweb.net/deck-options.html#daily-limits),
[answer buttons](https://docs.ankiweb.net/studying.html#answer-buttons).

## Explicit practice and selection

Book, root-star and search filters select individual Meaning rows. Selection
completion preserves checks; only explicit cancellation/unchecking clears them.
Filtering narrows their visible intersection without expanding an empty scope.
An explicit action opens regular study over all books without filters.

Filtered/checked practice includes precisely that scope, including future-due
cards. It is labeled “연습 · 복습 일정에 영향 없음”. Assessments are recorded as
practice events and do not change progress, due dates or regular daily budgets.
Large selections are split into the automatic batch size; the unprocessed selected
queue persists through completion and reload.
All reconciliation uses the full vocabulary so filtering cannot prune progress.

## Identity and safe v1 migration

Schema v2 remains under the existing local-only storage key. The first successful
migration saves the original v1 JSON to a `.backup` key before replacing the
working value. A failed backup or main write prevents advancement. Newer schemas
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
actual responses and says “이번 묶음 완료”, not completion of all learning.

Validation and remaining limits: [2026-10-02 QA](../qa/vocabulary-review-20261002.md).

Stage completion uses a large 200–260px mascot (140px in short viewports), one
heading, today's count and three unboxed outcome counts. These classify each
unique card by its latest regular answer today; retries do not duplicate cards.
Redundant mode/percentage labels are hidden on the celebration. A single Next
Stage CTA uses user-requested vivid blue (#008DF0) and bold white 20px text,
matching the supplied “Add 1 item” reference. This is a scoped exception to the
normal neutral button tone; all other controls retain the shared design tokens.
The duplicate Stop button is removed: the existing back arrow saves the same
progress. Pending relearning remains visible even after goal completion.

A static cyan/mint/lilac aurora behind the mascot increases in radius and opacity
with stages 1–5. It has no looping motion, does not cover text or intercept input,
and the mascot entrance respects reduced-motion preferences.
