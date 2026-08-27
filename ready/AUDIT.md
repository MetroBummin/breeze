# READY Stabilization Audit — 2026-08-27

READY is now constrained to one product path: authenticated Students read the
Passages assigned to their fixed school/grade Scope; the administrator manages
Students, the Passage Library, Scope membership, deterministic study memory,
and deletion.

## Runtime classification

### ACTIVE

- `ready_students`, bcrypt PINs, opaque `ready_sessions`, login throttling
- eight permanent school/grade rows in `ready_exams` and `ready_exam_passages`
- `ready_passages`, `ready_passage_sentences`, and atomic structured-row writes
- on-demand dictionary lookup and simple `ready_saved_words`
- student lookup/view events and deduplicated saved word/sentence records
- atomic Student and Passage delete-impact/cascade RPCs
- 18 frontend operations plus authenticated server-only `create_passage`

### PRESERVED DORMANT

- `ready_questions` and `ready_attempts`: retained so historical data and the
  generic future Question/Attempt shape are not destroyed. They have no current
  UI, Edge dispatch operation, or bootstrap query.
- Question/Attempt cleanup remains inside Passage/Student deletion transactions
  so dormant rows cannot become orphans.

### LEGACY IN PRODUCTION ONLY

- `ready_study_sets`, `ready_publications`, and `ready_publication_questions`
  remain in the existing production database (one StudySet, one Publication,
  zero links at audit time). Clean migrations do not create them and current
  code never reads or writes them. Passage deletion retains guarded cleanup for
  these old links until the production rows can be removed deliberately.
- legacy Passage/Exam compatibility columns remain in production. Scope
  membership is sourced only from `ready_exam_passages`.

### REMOVED DEAD / DUPLICATED

- ORDER generator/editor/player, question status mutation, attempt submission,
  and Admin Analytics runtime
- admin bootstrap queries for Question, Attempt, saved-memory, lookup, and view
  datasets that no visible screen consumed (11 query groups reduced to 5)
- READY TSV parser, paste Import form, Import Preview state/modal, and related CSS
- obsolete passage/student drag, question/player/analytics/memory CSS
- every sentence/lexical bake table, status column, RPC, retry, UI, prompt, and
  Anthropic/OpenAI provider path; saved lexical data was copied to SavedWord
  before the old tables were dropped
- phrase/concept/sense-key remap machinery and persisted Reader tokens

## API and performance contract

- Mutations execute once; only explicitly read-only operations may retry once
  after a transport failure.
- `teacher_bootstrap` loads Students, current Scopes, Passages, Sentences, and
  Scope links only.
- Reader opens from a local revision cache immediately, then revalidates.
- Word taps make one on-demand dictionary request and write one lookup event.
  Sentence translation views render from teacher data and send one background event.
- Save operations are optimistic, idempotent in the database, and invalidate the
  in-memory Review list.
- `create_passage` is an admin-session-only structured-data ingress retained for
  ChatGPT Work tooling. It accepts explicit `sentenceRows` and calls one atomic
  database RPC; READY contains no file/paste Import workflow.

## Migration verification

- Local and remote migration ledgers match for all twelve migrations.
- Linked dry-run reports no pending migration.
- Remote PostgreSQL lint reports no schema error.
- Static clean-schema contracts verify that the first migration creates the
  complete current core and that StudySet/Publication are absent.
- A fresh disposable database execution was not available on this machine
  because no Docker/PostgreSQL runtime is installed. Production was not reset or
  repurposed for this check.
