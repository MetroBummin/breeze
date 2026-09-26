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

## File-import progress (2026-09-26)

File addition and original-file reconnection own a per-operation status token.
Progress replaces that token's active or pending message; it never adds old page
counts to the FIFO. Success, duplication, a partial original-storage warning, or
failure replaces the same token and closes it, so late progress cannot overwrite
the result. A successful/partial addition is reported only after the book write
has succeeded. Other tasks and ordinary informational notices keep their FIFO
order, bounds, expiry, input priority and plain-text presentation.

Navigation/session resets invalidate an operation's notice token without
cancelling its import. No old progress or result follows the user into another
Reader session. On completion, the existing renderAllBookViews helper refreshes
the currently visible shelf; hidden Home/shelf DOM is not rebuilt. Destination
navigation still renders fresh data as before. PDF text extraction, saved book
identities, Reader/ink/lookup behavior and dormant sharing are unchanged.

Validate with node --test tests/verify-import-feedback.mjs and
node tests/verify-import-feedback-browser.mjs, plus the existing notification,
ingestion, storage, Home/Reader and ink regression suites.
