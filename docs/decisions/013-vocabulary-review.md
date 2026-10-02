# Local saved-Meaning review

Review reads saved Meaning records with a nonblank `word` and `ko`. It presents
their exact stored word, Korean contextual definition, source example and book.
An absent example or book stays absent. Dictionary candidates and `ai.ko` do not
become answers, and review makes no network or AI requests.

`BreezeReview` is a pure classic-script engine. Its input is the current vocabulary,
separate versioned review state and an explicit time. It never edits vocabulary,
stars, marks, word-item storage, tombstones or sync payloads. The UI persists each
returned review state as one local-only value before advancing. Failed persistence
must leave the previous card retryable. Existing vocabulary persistence remains
as described in decision 007.

The default Today start selects up to five cards. Previously reviewed cards due now
come first, ordered by due time; new cards follow, oldest saved first. Raw Meaning
key breaks ties independently of locale and object enumeration. Remembered
advances through 1, 3, 7, 14 and 30 days, capped at 30. Unknown resets that streak
and schedules ten minutes later. Uncertain schedules one hour later and lowers
the streak by one step, floored at zero. No early review of a future-due card is selected by Today.

The persisted queue, index and result counts resume an interrupted session. New
vocabulary does not change its queue. Answer visibility is transient UI state;
reopening or changing cards always conceals the answer. Completed sessions remain
a summary until the user explicitly starts again. Missing or changed queued
Meanings are skipped, never graded under the old token.

Identity uses the exact key, word, `ko`, example, book and `addedAt` tuple rather
than a collision-prone hash. Root promotion, contextual edits and key recreation
therefore invalidate stale progress. Mutable `up`, picked timestamps, stars,
marks, suggestions and metadata do not. Deleted progress is pruned when observed.
An identical delete/re-add that preserves every identity field between observations
is indistinguishable from the same card; existing creation normally changes
`addedAt`. No new vocabulary identity field is introduced.

Each grade checks the displayed opaque session/index/identity token against the
latest review state. Repeated callbacks cannot grade the next card or grade the
same card twice. The UI reads the latest persisted state before grading. This
small local storage contract does not provide cross-tab compare-and-swap; no
distributed or synchronized review guarantee is introduced.

Unknown schemas reset practice only. Bad individual progress entries are dropped;
bad sessions are discarded whole so malformed queue entries cannot shift indexes.
Progress uses a null-prototype dictionary; prototype-looking Meaning keys remain
valid. All public engine calls return fresh state and leave their inputs unchanged.

Validation: `node --test tests/verify-vocabulary-review.mjs` covers scheduling,
resumption, exactly-once sequential grading, malformed data, contextual changes,
deletion, special keys, immutability and bounded sessions over 5,000 Meanings.

## Explicit practice and entry

Memory's shared dock is Home / Today review / CSV export. Add Word lives in
its header; dock geometry remains owned by the shared control primitives.
The center action shows a recommended count or resumes unfinished practice.

Book, root-star and search filters select individual Meaning rows, not every
meaning of a matching lexical item. Selection mode adds per-Meaning checkboxes
and Select All for the visible rows. Filtered/checked practice includes exactly
that scope, including future-due cards; its size is not limited to Today's five.
A separate quiet “오늘 추천으로 복습” action bypasses the filters. Selection itself
is transient; the started queue and its practice flag persist for resumption.
Starting a different scope replaces the unfinished queue, not graded progress.
All reconciliation uses the full vocabulary so filtering cannot delete progress
outside the current scope. Manual grades use the same intervals as Today.

The saved sentence is visible and its target expression highlighted before the
meaning is revealed. This MVP practices contextual recall; it does not claim
context-free mastery or Anki/FSRS scheduling. A short cue asks users to choose
Uncertain if they inferred the answer but could not recall the word's meaning.

## Study navigation

The center action navigates to the dedicated `study` view rather than opening a
modal. Memory filters/selection stay on the Memory page; the study page contains
only the current recall task and a Memory back action. Browser Back/Forward
restore the persisted queue with its answer hidden. There is no dialog top layer,
scrim or focus trap. Leaving via Escape/Memory hides the answer and restores the
entry focus. Long content scrolls as a normal page.

## Flashcards and three grades

The front presents the saved expression in its original sentence. Tapping the
card, Enter/Space, or Show Answer flips to the exact saved meaning. Once revealed,
the user can flip back to the original sentence and grade Unknown / Uncertain /
Known. Every button shows its actual next interval from the same engine function
that applies the grade. Unknown: 10 minutes and reset. Uncertain: 1 hour and one
step down. Known: 1, 3, 7, 14, 30 days, capped. No grading before reveal.
The optional uncertain counter defaults to zero for older v1 sessions; old
queues/progress remain readable. Flashcard behavior borrows familiar recall
patterns while retaining Breeze type, surface and muted color tokens.
