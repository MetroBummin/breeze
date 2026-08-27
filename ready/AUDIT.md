# READY Stabilization Audit — 2026-08-27

READY is now constrained to one product path: authenticated Students read the
Passages assigned to their fixed school/grade Scope; the administrator manages
Students, the Passage Library, Scope membership, bake status, and deletion.

## Runtime classification

### ACTIVE

- `ready_students`, bcrypt PINs, opaque `ready_sessions`, login throttling
- eight permanent school/grade rows in `ready_exams` and `ready_exam_passages`
- `ready_passages`, `ready_passage_sentences`, and atomic structured-row writes
- Reader bake tables: sentence bakes/tokens, lexical concepts/aliases/occurrences
- student lookup/view events and deduplicated saved lexical/sentence records
- atomic Student and Passage delete-impact/cascade RPCs
- 19 frontend operations plus authenticated server-only `create_passage`

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
- redundant baked-word concept response and translation-view bake response
- duplicate unbaked word-lookup request and full-payload cache comparison

## API and performance contract

- Mutations execute once; only explicitly read-only operations may retry once
  after a transport failure.
- `teacher_bootstrap` loads Students, current Scopes, Passages, Sentences, and
  Scope links only.
- Reader opens from a local revision cache immediately, then revalidates.
- Baked word taps and translation views render from loaded Reader data and send
  one background event. Unbaked dictionary fallback sends one request.
- Save operations are optimistic, idempotent in the database, and invalidate the
  in-memory Review list.
- `create_passage` is an admin-session-only structured-data ingress retained for
  ChatGPT Work tooling. It accepts explicit `sentenceRows` and calls one atomic
  database RPC; READY contains no file/paste Import workflow.

## Migration verification

- Local and remote migration ledgers match for all ten migrations.
- Linked dry-run reports no pending migration.
- Remote PostgreSQL lint reports no schema error.
- Static clean-schema contracts verify that the first migration creates the
  complete current core and that StudySet/Publication are absent.
- A fresh disposable database execution was not available on this machine
  because no Docker/PostgreSQL runtime is installed. Production was not reset or
  repurposed for this check.

