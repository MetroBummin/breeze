# Selective book sync

Build 289 added opt-in book and reading-position sync. It runs only when
`window.BREEZE_CONFIG.BOOK_CLOUD` is exactly `true`. Missing config or a
missing key stays off. Build 292 sets that flag to true. While it was off, the
long-press sheet had no "기기 간 연동" row, nothing was uploaded, and the app
did not call R2 or the book-cloud function.

## What the flag turns on

A file book (PDF, EPUB, or TXT with its original bytes) can be linked from the
long-press sheet. Only that book is uploaded to the private R2 bucket
`breeze-books`. The object key is `${userId}/${sha256}` and is built on the
server. Reading position uses the existing `public.positions` row through
`breeze_put_book_position`. Another signed-in device of the same account can
download the original with a 10-minute signed URL, check the full SHA-256, and
open it with the existing importers. Caps are 40 books and 2 GiB
(2,147,483,648 bytes). Turning the link off, deleting the book, or deleting the
account removes that account's server original. There is no end-to-end
encryption, no cross-account sharing, and no DRM removal in this phase.

A bundled catalog story (`longReadId`) stays text without a stored original
file. It is already on every device, so the link row stays unavailable. A
user-imported TXT keeps its bytes. Those bytes are stored directly. WebKit
cannot prepare a Blob for IndexedDB after the picker releases the file, and
that failed write never published the book. Readers still receive a Blob.

## Flag on for build 292

The private bucket and S3 endpoint already existed. These steps were completed
outside the repo before `BOOK_CLOUD` was set to true:

1. Supabase secrets `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, and
   `R2_SECRET_ACCESS_KEY` are set. `R2_ACCOUNT_ID` is
   `dc26cb1d2297ca2206a0434ff88e24b4` and `R2_BUCKET` is `breeze-books`.
   Access key values stay outside the repo.
2. Browser PUT and GET are allowed on the bucket from the app origins
   (`https://breeze.io.kr`, Capacitor, and localhost).
3. `server/sync/book-cloud.sql` is applied. `authenticated` can select its own
   rows. `service_role` can select, insert, update, and delete, and can execute
   `private.enforce_book_cloud_cap`. This project's default table ACL does not
   include those grants for `service_role`. The role bypasses RLS, but Postgres
   still checks GRANT. Without them the function's first read is
   `permission denied for table book_cloud`, the handler returns 500, and no
   pending row is stored. The web shelf lists only `ready` rows from that
   table, so it stays empty while word sync (the signed-in `authenticated`
   role) continues.
4. `server/books` is deployed as the `book-cloud` edge function, and `dict` is
   redeployed so account deletion can remove R2 objects. Missing R2 secrets
   return 503 `{ok:false,error:"r2_not_configured",message:"R2 설정이 없습니다."}`
   before auth and before any R2 call.

Browser PUT and GET preflight on `breeze-books` allows `https://breeze.io.kr`,
`breeze://localhost`, `capacitor://localhost`, and localhost, for GET, PUT, and
HEAD, with request header `content-type`. `https://www.breeze.io.kr` redirects
to the apex host before the app runs. The shelf itself is the catalog query
held in memory. IndexedDB is used only when a ready book is downloaded.

## Background download

A ready book that is not already on this device downloads on its own on every
platform. The link type, a data-saver flag, and `navigator.storage.estimate`
do not choose. The native shell does not consult Capacitor Network for this
decision.

The saved place is the `public.positions` row whose `book_id` is the file
SHA-256, not the local book id. Turning the link on publishes the place
already stored on this device, and a later sync publishes it even when the
reader has not moved again. The other device copies that locator onto its
local book id before the reader opens. PDF opens through the existing page
anchor. An EPUB place is the spine, the chapter href, the element, and the
character offset. Restore resolves the chapter by href, then holds that
anchor until the element has height and the character can be placed. A cover
shown before pagination is not saved over the remote place. A hand scroll
releases the hold. TXT uses the saved paragraph. Opening a downloaded book
at the start does not count as a newer place, so that stamp cannot replace
the remote locator or be written back over it. A newer place that is no
longer the start still wins on the device where it was made.

The download stays off the sync return path and runs one book at a time.
Bytes already received are kept in a separate IndexedDB database and the next
attempt sends `Range`. A book larger than 2 GiB is not fetched. While the
device is offline the card stays, and the next sync tries again. If storing
the file fails, including a private-mode quota or an IndexedDB rejection, the
book is not added and nothing is reported. The "받아서 이어 읽기" card remains,
and opening it downloads and opens the book. An automatic download does not
open the reader. The card is the same control it was; it disappears after the
book is stored.

Rollback is to set `BOOK_CLOUD` false. Do not drop `book_cloud` or `positions`
as an automatic rollback.
