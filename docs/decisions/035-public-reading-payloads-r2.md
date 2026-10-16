# Public reading payloads on Cloudflare R2

2026-10-16. The Worker, bucket binding, and client read path are in the tree.
`BREEZE_CONFIG.READING_CACHE_URL` stays unset, so the app still uses the
Supabase relay. Do not treat a missing key as a failed deploy. Private book
bytes stay on `breeze-books` from Decision 034. This change does not create the
bucket or deploy the Worker.

## What is served today

Home discovery loads the thirteen built-in feeds. `fetchArticleHtml` tries the
publisher for three seconds, then `GET /functions/v1/article?url=…` on Supabase.
The function returns the feed or article as JSON (`{url,html}`, up to 3 MB) with
`Cache-Control: no-store`. Images try the publisher first; failures use
`?as=image` (up to 2 MB, also `no-store`). The Preview invitation is
`POST /functions/v1/article-preview`. A hit reads `article_preview_cache` and
returns `summaryKo`. A miss calls OpenRouter and inserts one row. Lookup
“쉬운 설명” is a separate on-demand dict call.

With `READING_CACHE_URL` set to the Worker origin, built-in feeds, articles, and
images are read from this bucket instead. A 404 or network failure uses the
on-device last-good copy and does not call `/functions/v1/article`. Custom feed
URLs stay on the device: they are not written to the bucket and, while the flag
is on, they are not sent to the relay either. Invitations are read from
`previews/v5/` first. A 404 still calls `article-preview`, which generates the
text and, when its write secret is set, PUTs the JSON. A network failure of the
preview object uses the on-device invitation and does not start a second
generation through the relay.

The bytes that make Supabase egress matter are the relayed feed XML, article
HTML, and images. Decision 015 records an unattributed historical 4.791 GB
figure; this decision does not claim that number as a current bill.

## Bucket and keys

Public bucket `breeze-public-reading`, served by Worker `breeze-reading-cache`.
Not `breeze-books`. Objects:

| Payload | Key | Cache-Control | Written by |
| --- | --- | --- | --- |
| Feed XML | `feeds/v1/{feedId}.xml` | `public, max-age=600` | cron, every 10 minutes |
| Feed stamp | `feeds/v1/{feedId}.json` | same, plus `fetchedAt` and final URL | same write |
| Article HTML | `articles/v1/{sha256(canonicalUrl)}.html` | `public, max-age=86400` | on first selected miss |
| Article stamp | `articles/v1/{sha256}.json` | final URL, status, `fetchedAt` | same write |
| Image | `images/v1/{sha256(url)}` | `public, max-age=86400`, stored content-type | on image miss |
| Invitation | `previews/v5/{sha256("article-preview-v5\\n"+url+"\\n"+title+"\\n"+excerpt)}.json` | `public, max-age=2592000` | article-preview after a valid `summaryKo` |

`feedId` is the fixed index 0–12 in `server/reading-cache/src/feeds.mjs`, the
same order as `RSS_FEEDS`. The preview hash is the Edge Function’s cache key.
No account ids, cookies, or custom-feed URLs go in this bucket. Clients have no
write credentials. Preview PUT and `POST /feeds/refresh` require
`PREVIEW_WRITE_TOKEN`.

## Kill switch

Leave `READING_CACHE_URL` unset, or remove it, and the next call uses the relay
again. The check reads `window.BREEZE_CONFIG` on each request. No Worker deploy
is required to stop clients. Unset the article-preview secrets
`READING_CACHE_PUT_URL` and `READING_CACHE_WRITE_TOKEN` to stop invitation
writes. The cron can stay; it only writes the public feeds.

While the flag is on, discovery metadata may keep a supplied `contentHtml` that
fits the existing per-feed byte budget, and Medium owner feeds are resolved
before a card is shown. Those reads go to this Worker. The wordbook revision
check, the two-request cover budget, and the 128 KiB cover prefix stay.

## Deploy

Run these from a checkout that contains `server/reading-cache/wrangler.jsonc`,
in the Cloudflare account that already owns `breeze-books`
(`dc26cb1d2297ca2206a0434ff88e24b4`). Wrangler must be logged in as a member who
can create R2 buckets and Workers. This repository does not run them.

1. Create the bucket. Do not enable a public r2.dev URL; the Worker is the only
   reader and writer clients use.

   ```sh
   npx wrangler r2 bucket create breeze-public-reading
   ```

2. Set the preview write token. Use a long random value. The same value is the
   Supabase secret in step 5. Do not commit it.

   ```sh
   npx wrangler secret put PREVIEW_WRITE_TOKEN --config server/reading-cache/wrangler.jsonc
   ```

3. Deploy the Worker. The config’s cron is `*/10 * * * *`.

   ```sh
   npx wrangler deploy --config server/reading-cache/wrangler.jsonc
   ```

4. Prime the feeds before pointing clients at the Worker. Replace the origin
   with the deployed workers.dev host or the custom hostname you attach.

   ```sh
   curl -X POST -H "Authorization: Bearer $PREVIEW_WRITE_TOKEN" \
     https://breeze-reading-cache.<account>.workers.dev/feeds/refresh
   ```

   Confirm `GET /feeds/v1/0.xml` returns XML and `cache-control: public, max-age=600`.

5. Redeploy the `article-preview` Edge Function with two secrets:
   `READING_CACHE_PUT_URL` is the Worker origin with no trailing path, and
   `READING_CACHE_WRITE_TOKEN` is the same token as step 2. Without those
   secrets the function still returns invitations and does not write R2.

6. Set `READING_CACHE_URL` in `config.js` to that https origin and ship the
   app. Until this key exists, clients keep using the relay.

Rollback for clients is step 6 in reverse: delete `READING_CACHE_URL` and ship.
To stop the cron, deploy again with `triggers.crons` set to `[]`. Do not delete
the bucket as part of rollback.

## Cost shape

Published R2 rates used as an order-of-magnitude check: about $0.015/GB-month,
$4.50 per million Class A writes, and $0.36 per million Class B reads, with no
egress charge. Thirteen feeds every ten minutes is under 60,000 writes a month.
A few hundred thousand article, image, and invitation writes stays under about
$4.50 of Class A. Ten thousand daily sessions at thirteen feeds plus a couple of
article reads is a few million Class B reads, about $1–$3. Thirty days of
articles and images is under about $1 of storage. The comparable Supabase cost
is the byte egress of every client pulling those same feeds.
