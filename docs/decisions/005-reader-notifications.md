# Deferred Reader notifications

Reader toast, miniToast and mode notices use one bounded FIFO in the center pill.
Sentence waiting/results, word lookup, Aa/settings dialogs, pinch/restore, active
pointer gestures and typing have priority. A displayed notice yields immediately
on document input or overlay changes and resumes after at least 600 ms of quiet.
Ordinary scrolling does not reset the queue or measure layout. EPUB gestures are
also checked through the shared gesture owner. The scheduler runs only while a
notice is pending, checks visibility, and does not modify lookup state, focus,
progress, scroll position or the book title. Controls keep their event handlers.

Duplicate pending messages are coalesced; at most 20 pending notices are kept.
Notices expire after 60 seconds. Reader exit or opening another book clears them
so stale notices cannot appear in a different reading session. Home and both shelves use the same queue in the resume pill. Home notices defer
for dialogs, typing, pointer activity and opening a book, without inheriting
Reader gesture or restoration locks. Navigation clears the queue; titles,
progress and button actions are never rewritten by a notice. Wordbook retains
its existing toast surface. Messages are plain text in a polite live
region. Interruptions replay the notice with its full display duration.

Validate with `node tests/verify-reader-notifications-browser.mjs`, the Reader
lookup/gesture lifecycle tests, and shared Home/Reader controls regressions.

## Quiet feedback

Word removal is visible in the card and highlight, so it has no toast. Mode switching is visible in the document and mode button, so it has no announcement. Quota errors stay in the lookup that owns the failure, without a second delayed pill notice. Playback failures, storage failures, recovery-key and device-pairing notices remain actionable feedback.
