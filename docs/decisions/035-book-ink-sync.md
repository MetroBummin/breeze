# PDF pen and highlighter sync

Pen and highlighter strokes for a linked PDF can follow the same account to
another device. This does not upload the PDF again and does not change reading
position. It runs only when `window.BREEZE_CONFIG.INK_SYNC` is exactly `true`
and `BOOK_CLOUD` is exactly `true`. Each call reads the flag again, so setting
`INK_SYNC` false stops the next upload and the next remote merge. Local ink in
`breeze-pdf-ink` stays on the device.

## Who is included

Only a book whose `bookCloudLink.on` is true, whose `kind` is `pdf`, and whose
bytes hash to the SHA-256 already used by book cloud. The same file under two
titles is one ink book. Two files with the same title are two ink books. An
EPUB spine, CFI, or percent locator never selects an ink page.
`inkPageFromLocator` stays null.

## When work runs

Drawing does not call the network. A few seconds after the pen lifts, the open
page uploads in the background. Hiding the page or leaving the app uploads in
that same turn. A timer scheduled for later does not run once iOS has suspended
the web view, so that is the only way a stroke drawn on one device is on the
server before the other device opens the page. A resting finger does not hold
the upload. Only a stroke that is still on the glass does. While that stroke
is active the timer only reschedules. Remote strokes are folded into a page
that is already open and
already painted from local ink. A page that is busy keeps the folded result
until the pen lifts, then paints and saves it. Rendering does not wait on the
request.

## Merge

Each completed pen stroke and each highlighter stroke gets a UUID `id` before
it is stored. Highlighter fragments keep the shared `strokeId` used for one
opacity group; that value is not the sync identity. An eraser split retires
the original id and gives each surviving fragment a new id. The retired id is
a tombstone only if this device had already recorded it.

`public.book_ink` stores one row per `(user, sha256, page, stroke id)` with a
revision and an optional payload. `private.merge_book_ink`, called through
`public.breeze_merge_book_ink`, applies a higher revision. An equal revision
keeps a tombstone over a live stroke. A later undo is a higher revision and
can restore the stroke. Different ids are a union. The client never replaces
the whole page with one device's snapshot.

Legacy strokes with no id are assigned ids once, written locally, and uploaded
in that same flush. A duplicate id in one page is split so only the first keeps
it. The worker's transient numeric transport ids still never enter disk.

## Queue, caps, and failure

The outbox is IndexedDB `breeze-ink-sync`, separate from `breeze-pdf-ink`,
keyed by `userId|sha256|page`. Memory is updated first. If IndexedDB is
missing, private mode rejects it, or a write throws `QuotaExceededError`, the
queue stays in memory for the session and the upload still runs. The queue
does not use localStorage. A private window can drop that memory when it
closes; that is the browser limit.

Uploads go out in batches of 40. A stroke over 24,000 JSON bytes is omitted
and stays local. A page stops accepting new ids at 4,000 rows. A book stops
at 8,000,000 payload bytes. The server returns `{ok:true,error:"ink_cap"}` and
the client backs off for 30 seconds. A rejected stroke is omitted. Ops applied
before that rejection stay applied. A failed later batch leaves the earlier
batch acknowledged, and the retry sends only what is still unacked.

`not_linked` blocks that book's queue until the link is turned on again.
Turning the link off clears this device's queue after the server remove
succeeds and does not delete local strokes. The `book_ink_forget` trigger
deletes server ink when that `book_cloud` row is deleted or becomes
`deleted`. Logout and account switch clear timers. An in-flight result from
the previous user is ignored and cannot acknowledge the next user's queue.

## Server

`server/sync/book-ink.sql` is additive: a new table, owner `SELECT`, a merge
function, and the forget trigger. Authenticated clients cannot insert directly.
`service_role` can. Account deletion cascades through `auth.users`. Apply it
on a database that already has `book_cloud`. Do not drop `book_ink`,
`book_cloud`, or `positions` to roll back. Set `INK_SYNC` false instead.
