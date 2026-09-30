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

An explicit start selects up to five cards. Previously reviewed cards due now
come first, ordered by due time; new cards follow, oldest saved first. Raw Meaning
key breaks ties independently of locale and object enumeration. Remembered
advances through 1, 3, 7, 14 and 30 days, capped at 30. Confused resets that streak
and schedules ten minutes later. No early review of a future-due card is selected.

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
