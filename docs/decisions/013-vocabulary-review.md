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

Daily new and review limits are independent, defaulting to 20 and 100; either
allows zero. A new card is counted at its first saved regular assessment, not
when queued or merely revealed. The review budget counts distinct previously
learned cards receiving a scheduled review that local calendar day. Relearning
never consumes another card slot, including on a later day. Regular response
counts include relearning; practice responses are separate. Daily identity sets
and response totals persist, with no unused allocation carried to the next day.
Local calendar dates use the device timezone and supplied time; this is not
Anki's configurable rollover hour.

Only learned cards whose due time has arrived are scheduled reviews. Unlearned
cards are not overdue. Queue priority is due relearning, due review, then new
cards within their separate budgets. Backlog counts describe inventory, not a
recommended daily workload. A batch selects 5, 10, 20 or a positive custom count.
Reducing the limits can pause an unfinished queue, never delete or complete it.
Changing batch size applies to the next batch; an already started queue stays
intact. Explicit extra study bypasses daily limits for that batch and local day;
it does not alter configured limits or authorize future batches.

Unfinished queues resume, with answer visibility reset. On regular resumption,
higher-priority work that became due while away is served first and the original
queue is parked intact. Switching to another practice scope or regular study
also parks unfinished work. New vocabulary does not silently expand a started
scope. Missing or substantively changed references skip without being graded.
Completion describes only the current batch, reports remaining due reviews and
pending relearning separately, and offers More / Stop for today. Timed relearning
is available in the next batch or on resume; a finished batch does not auto-start.

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
Large selections are split into the chosen batch size; the unprocessed selected
queue persists through completion, reload and changing the next batch size.
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
known reviewed identities conservatively reserve both daily budgets for their
recorded day; the settings disclose that ambiguity. From v2 onward, budgets and
event categories are exact. v1 zero-stage progress retains its due time and is
classified as relearning; the old format cannot distinguish every uncertain
answer from a failed one. A previously lost/reset progress record is not recoverable.

## Study entry and presentation

Memory keeps its approved shared Home / center / CSV dock geometry. Below the
star filters, one inline amount row provides a draggable range and numeric input.
The range normally spans 1–50; direct input allows larger batches and extends its
maximum. Daily new/review limits and usage/due inventory live in app settings.
Memory keeps the existing book/search/star scope controls and shows extra copy
only for practice, unfinished batches, pending relearning or a reached limit.
No duplicate preset buttons, entry dialog or dock morph is used.

The center pill shows the actual batch count and starts immediately. Amount and
limit changes save on change/release in their respective surfaces, with a
retryable storage error;
invalid input cannot start study. Controls use Memory's existing type, neutral
colors and 44px targets. Keyboard arrows and numeric entry complement dragging.
Changing settings does not replace a persisted queue or mark its cards complete.

Starting navigates to the existing `study` page. The saved sentence and its
highlighted target precede the answer. Tap, Enter/Space or Show Answer flips the
card; grades remain unavailable before reveal. Browser navigation and Escape
retain durable queues while concealing the answer. Completion celebrates only
actual responses and says “이번 묶음 완료”, not completion of all learning.

Validation and remaining limits: [2026-10-02 QA](../qa/vocabulary-review-20261002.md).
