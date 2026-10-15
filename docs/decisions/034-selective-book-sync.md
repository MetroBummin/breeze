# Selective book sync, dormant

Build 289 includes opt-in book and reading-position sync, but it does not run
until `window.BREEZE_CONFIG.BOOK_CLOUD` is exactly `true`. Missing config or a
missing key stays off. While it is off, the long-press sheet has no "기기 간
연동" row, nothing is uploaded, and the app does not call R2 or the book-cloud
function.

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

## Still required before the flag can be turned on

Do not apply SQL or deploy as part of this change. The private bucket and S3
endpoint already exist. Before setting `BOOK_CLOUD: true`:

1. Set Supabase secrets `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, and
   `R2_SECRET_ACCESS_KEY`. `R2_ACCOUNT_ID` should be
   `dc26cb1d2297ca2206a0434ff88e24b4` and `R2_BUCKET` should be `breeze-books`.
   Access key values stay outside the repo.
2. Allow browser PUT and GET on the bucket from the app origins
   (`https://breeze.io.kr`, Capacitor, and localhost). That CORS change is not
   applied here.
3. Review and apply `server/sync/book-cloud.sql` in the SQL editor.
4. Deploy `server/books` as the `book-cloud` edge function, and redeploy `dict`
   so account deletion can remove R2 objects. Missing R2 secrets return 503
   `{ok:false,error:"r2_not_configured",message:"R2 설정이 없습니다."}` before
   auth and before any R2 call.

Rollback is to leave `BOOK_CLOUD` false. Do not drop `book_cloud` or
`positions` as an automatic rollback.
