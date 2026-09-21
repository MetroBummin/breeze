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
so stale notices cannot appear in a different reading session. Outside Reader,
the existing toast surfaces remain. Messages are plain text in a polite live
region. Interruptions replay the notice with its full display duration.

Validate with `node tests/verify-reader-notifications-browser.mjs`, the Reader
lookup/gesture lifecycle tests, and shared Home/Reader controls regressions.
