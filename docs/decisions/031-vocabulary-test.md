# Local typed vocabulary tests

## 1.9.3 release hold (2026-10-13)

The owner deferred typed vocabulary testing before submitting the next1.9.3
build. `BreezeVocabularyTest.ENABLED` is false: Memory, All Words and saved sets
expose no test entry, direct/resume calls return without opening it, and old
test history falls back to Memory. No onboarding or public introduction advertises
typed tests. Existing swipe-study onboarding remains separate and available.
The source, answer database, disabled remote-grading gates and development
history remain intact. Shared multi-meaning/example helpers still serve cards.

The prototype browser suite explicitly enables its fixture and continues to
exercise retained source. A separate shipping-page browser suite uses the real
disabled configuration and verifies missing entries, blocked history/direct
navigation and byte-preserved saved test answers. Prototype evidence does not
claim that the feature ships in1.9.3.

The test is a separate full page reached from Memory's current filters, All
Words, or a saved set. Korean meaning recall is the only input mode. It asks for
retrieval before showing an answer, without claiming that spelling equality can
establish semantic correctness. English spelling/cloze testing is outside this
change. Existing swipe-card interaction, vocabulary, stars, study sessions and
FSRS records retain their separate owners.

## Scope, word groups and prompts

Start offers up to 20 questions by default, the full scope, and a custom integer
from 1 to the available **unique word count**. Empty scopes never expand. A
partial Fisher–Yates sample selects groups without replacement and shuffles the
selected order. The frozen selection, order and exact saved content resume
unchanged; later vocabulary edits are not silently imported into a running test.

Memory uses its existing `root || key` grouping. Set tests and card study share
`BreezeStudySets.groupedCards`: explicit preserved roots group their base record
and senses; old snapshots without root metadata use exact saved expression text
(NFC, trimmed and whitespace collapsed). Case and phrases are preserved and no
lemmas are guessed. New snapshots preserve optional root metadata without a
version migration; existing in-progress study queues keep their original scope.
Each representative snapshot retains all original saved senses/examples and an
explicit `acceptedMeanings` array. Multi-meaning representatives show only the
word and accept any saved meaning; results number each saved meaning on a separate
line. There is no meaning rotation or weak-meaning selection. No vocabulary or
set schema migration is needed.

Single-meaning prompts show a saved English example only when it passes a
conservative local check: sentence-like English, an identifiable whole target
or saved form, no Korean/CJK, markup or exercise directions. Otherwise the prompt
shows the word alone. No source title, hidden answer node, answer ARIA text,
translation or definition is added to the active question. A valid source uses
literal text nodes and target emphasis. It is not generated or repaired by AI.

## Answers, batches and grading boundary

Typing never shows correctness feedback. Each accepted answer advances only after
a durable transaction. Every tenth submitted answer creates a frozen batch in
that same transaction; the final 1–9 answers create a final partial batch.
Learners continue to the next question while a batch runs and can expand completed
batch results. Batch lists mount at most five summaries per page; result review
mounts at most twenty questions. Expanded batch content is created only on demand.

The shipped page has no registered remote grader. Pending batches say **연결 대기**;
final review shows saved answers and explicit self-check choices. Unchecked and
uncertain answers stay **확인 필요**, not incorrect. Self-check counts are not an
automatic accuracy score. No external requests or paid calls occur from this UI.

An optional injected `BreezeVocabularyTestGrader.grade` accepts
`{sessionId, batchId, items:[{id,word,meanings,answer,example}]}` and returns
`{results:[{id,status,reason}],model}`. `batchId` is a persistent session-specific
token. The integration owner separately gates the OpenRouter adapter/server.
Missing, duplicate, malformed or unknown result IDs become `uncertain`, never a
fabricated correct/incorrect answer. Result strings are always text content.
Only one batch dispatch runs at a time. A durable `waiting → grading` claim
rejects competing owners; a session-ID check rejects old results after a new
test starts. A crash with an in-flight claim, a lost response or a grading error
never causes blind automatic resubmission or a new billing token. Such batches
remain **확인 필요** for manual review. Live retries require the separately gated
server's idempotency/result-recovery contract.

## Local persistence and failure

The independent IndexedDB database `breeze-vocabulary-test` stores one immutable
manifest, one small revision/cursor, one row per answer, and one row per batch.
Typing coalesces outstanding edits and writes only the current bounded response
plus cursor; it never serializes the whole 2,000–12,000-word inventory. Submission
flushes the current draft and commits before moving. Failure keeps the input and
same question retryable; a failed final write cannot display completion. Exit
flushes pending edits, and background/page-hide requests a flush. As with other
browser persistence, termination before an unacknowledged transaction commits
cannot promise the latest keystroke; the UI distinguishes saving from saved.

Transactions compare session ID and revision. Corrupt/future data is refused,
not replaced with an empty success. Opening a new test explicitly confirms that
it replaces this device's prior test/answers. Vocabulary, study-set/simple-card,
dormant review/FSRS, sync keys and schemas are not read or written by this store.
No new authentication, migration or backend deployment is introduced.

## Verification

`verify-vocabulary-test.mjs` covers representative senses, scope/count boundaries,
unique randomized sampling, frozen restoration, conservative examples, malformed
state and 12,000-word manifests. `verify-vocabulary-test-storage.mjs` covers draft
resumption, exact 10/final-partial batches, injected quota failure, competing
writers/claims, late-result rejection, retained corruption and constant-size
answer writes at 12,000 words. Browser/visual evidence and gated grading validation
are recorded by the integration review; these tests do not claim physical iOS
keyboard or signed native-app validation.

## Disabled server prototype and rollout decisions

Both `VOCABULARY_TEST_REMOTE_ENABLED` and `VOCABULARY_TEST_GRADING_ENABLED` are
false. The existing authenticated dictionary route accepts the separate
`vocabulary_test_grade` operation only behind the server gate. It does not route
through the dictionary's chat-completion model, fallback or unrelated RSS Jev
integration. No API key or new authentication setting was added.

The reviewed provider contract is OpenRouter **`typesafe/jev-1.13`**, at
`POST /api/alpha/decisions`, using typed choice questions and per-choice evidence:
[official guide](https://openrouter.ai/docs/guides/community/jev),
[Decisions API](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request),
[model pricing](https://openrouter.ai/typesafe/jev-1.13), checked 2026-10-13.
Its listed input price is $0.042 per million tokens, with no output-token charge.
For illustration only, 5,000 input tokens would cost $0.00021; actual batch token
usage has not been measured. Paid evaluation must be separately authorized.
This work made **zero live grading calls**, sent **zero user vocabulary records**,
and spent **$0** on inference. No unrelated A/B-test budget was used.

A batch contains at most ten items, each with only `word`, `meanings`, `answer`
and the allowed `example`. The server sends ordinal q0–q9 correlation IDs; account,
book, source-file and local session IDs never enter provider content. Multi-sense
items send no example. The server validates bounded strings and a 40 KB combined
UTF-8 payload, requires the expected model, checks probability/confidence shape,
and maps malformed, low-confidence, timeout and provider-error responses to
uncertain. The 0.95/0.90 thresholds are **provisional, uncalibrated** gates, not a
measured semantic-accuracy claim. Synonym, paraphrase, typo, opposite, partial,
ambiguous, nonsense and adversarial examples still need a paid, reviewed Korean
rubric evaluation before enabling either gate.

`server/dict/vocabulary-test-receipts.sql` is a **local SQL review proposal, not
an applied migration**. A service-role-only receipt reserves the existing quota
once and atomically claims each authenticated owner's batch/fingerprint.
Concurrent/lost/repeated requests cannot issue a second provider call; content
changes with the same batch ID conflict. Completed results are replayed unchanged;
pending calls are never automatically reclaimed. This sacrifices automatic
recovery after an unknown paid outcome to avoid double billing. Only bounded
fixed result labels/reasons are stored, not vocabulary or typed answers. PGlite
exercises the real SQL locally; production schema, permissions, retention policy,
quota choice and Edge runtime integration remain unverified. Creating the normal
CLI migration was blocked by this environment's read-only Supabase home directory;
no database command was applied remotely.

Enabling the prototype needs review of consent/data transfer, receipt migration
and retention, quota/cost policy, calibrated Korean grading and physical iOS
keyboard/accessibility QA. Neither native package numbers nor deployment targets
are changed by this branch.

## Word-only display hold (2026-10-14 KST)

The owner requested that word learning and word tests show words and meanings
only until the example algorithm is reliable. Memory, All Words, saved-set lists,
word detail and both study cards therefore omit examples, including accessible
card labels. The retained typed-test prototype also omits example prompts and
sends an empty example field to its optional grader. The prototype remains
disabled in 1.9.3; this change does not approve enabling it.

Stored examples, source metadata, captured card manifests, answers, study history
and CSV examples remain intact. Reader original text, sentence interpretation and
easy explanation remain available. The example extraction/highlight helpers and
their algorithm tests are retained for later evaluation, but successful evaluation
cannot reenable UI presentation: restoring it requires the owner's explicit
subsequent decision and a separate implementation change.

`verify-word-only-browser.mjs` checks display policy independently of a valid
algorithm result, source metadata, CSV/data retention and 20 light/dark layouts.
Existing completion/reentry and explicitly opted-in prototype tests retain their
previous state/history contracts. Browser evidence does not prove native iOS QA.

## Saved-set recall test stays separate (2026-10-14)

Saved sets now have their own recall test, described in
[vocabulary study sets](023-vocabulary-study-sets.md). That test does not turn
this prototype on. `BreezeVocabularyTest.ENABLED`,
`VOCABULARY_TEST_REMOTE_ENABLED`, and `VOCABULARY_TEST_GRADING_ENABLED` stay
false. The IndexedDB one-session store and the jev receipt path are unchanged.
