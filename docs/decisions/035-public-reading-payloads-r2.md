# Public reading payloads on Cloudflare R2

2026-10-16. Plan only. Do not create the bucket, deploy a Worker, change
`BREEZE_CONFIG`, or point clients at R2 in this change. Private book bytes stay
on the separate `breeze-books` bucket from Decision 034.

## What is served today

Home discovery loads the thirteen built-in feeds. `fetchArticleHtml` tries the
publisher for three seconds, then `GET /functions/v1/article?url=…` on Supabase.
The function returns the feed or article as JSON (`{url,html}`, up to 3 MB) with
`Cache-Control: no-store`. A warm `breeze.rss-public.v1` entry skips that fetch
for ten minutes, but the stored entry has had `contentHtml` removed since
`24fc7673`. Images try the publisher first; failures use `?as=image` (up to 2 MB,
also `no-store`). The Preview invitation is `POST /functions/v1/article-preview`.
A hit reads `article_preview_cache` through the Edge Function and returns a few
hundred bytes of `summaryKo`. A miss calls OpenRouter and inserts one row.
Lookup “쉬운 설명” is not this payload: it is an on-demand dict call with no
content cache.

The bytes that make Supabase egress matter are the relayed feed XML, article
HTML, and images. The invitation text is small, but it still leaves through the
same project and is cached in Postgres. Decision 015 records an unattributed
historical 4.791 GB figure; this plan does not claim that number as a current
bill. A rough current shape, not a measurement: one cold Home load is thirteen
feed bodies (often a few hundred KB each). Each selected article that no longer
has its feed body adds another HTML body. Image misses add more. Multiplied by
daily opens, feed XML dominates. R2 egress is free; the bill is storage plus
Class A writes and Class B reads.

## Bucket and keys

Use a new public bucket `breeze-public-reading`, not `breeze-books`. Serve it
from a dedicated hostname once the Worker is verified. Objects:

| Payload | Key | Cache-Control | Written by |
| --- | --- | --- | --- |
| Feed XML | `feeds/v1/{feedId}.xml` | `public, max-age=600` | cron Worker |
| Feed stamp | `feeds/v1/{feedId}.json` | same, plus `fetchedAt` and final URL | same write |
| Article HTML | `articles/v1/{sha256(canonicalUrl)}.html` | `public, max-age=86400` | on first selected miss |
| Article stamp | `articles/v1/{sha256}.json` | final URL, status, `fetchedAt` | same write |
| Image | `images/v1/{sha256(url)}` | `public, max-age=86400`, stored content-type | on image miss |
| Invitation | `previews/v5/{sha256("article-preview-v5\\n"+url+"\\n"+title+"\\n"+excerpt)}.json` | `public, max-age=2592000` | article-preview after a valid `summaryKo` |

`feedId` is the existing fixed index 0–12. The preview hash is the Edge
Function’s current cache key, so a title or excerpt change does not reuse an
older invitation. Do not put account ids, cookies, or custom-feed URLs in this
bucket. Custom feeds stay on the device.

## Writer and client read

One Worker, `breeze-reading-cache`, cron-fetches the thirteen publisher feeds
and writes the XML plus stamp. It does not run Readability. On a cache miss the
same Worker may fetch one public article or image, with the existing size and
type limits, and write the object. The article-preview function keeps calling
OpenRouter on a miss, then PUTs the validated JSON. Clients do not get write
credentials.

Client read, behind an unset `BREEZE_CONFIG.READING_CACHE_URL`: `GET` the object
with `credentials: 'omit'`. A 404 or network failure uses the on-device last-good
copy. It does not silently fall back to the Supabase relay once the flag is on;
that fallback is how a broken cache would put the egress back. Until the flag is
set, the current relay stays in place.

## Cost shape

Cloudflare’s published R2 rates are about $0.015/GB-month, $4.50 per million
Class A writes, and $0.36 per million Class B reads, with no egress charge.
Thirteen feeds every ten minutes is under 60,000 writes a month. A few hundred
thousand article, image, and invitation writes stays well under a million Class
A operations (about $4.50). Reads are one Class B per cold client fetch; a ten
minute HTTP cache makes a Home session one read per feed. Ten thousand daily
sessions at thirteen feeds, plus a couple of article reads, is on the order of
a few million Class B reads a month (about $1–$3). Retaining articles and images
for thirty days is single-digit to low tens of GB (under about $1). The
comparable Supabase cost is the byte egress of every client pulling those same
feeds and pages. Treat these as order-of-magnitude checks, not a bill.

## Optimizations to revert once this bucket serves the data

Revert these. They were attempts to spend fewer Supabase bytes, and they are
what made Preview unreliable:

- `b3a2ecf6` (2026-10-05) and `24fc7673` (2026-10-05) strip `contentHtml` from
  the discovery cache. After a restart inside the fresh window the card is still
  there, but the body that the feed already sent is gone, so open depends on a
  second origin fetch.
- `24fc7673` also stopped resolving Medium owner bodies before a card could
  appear. Selection then fetches the owner feed, and a failure falls through to
  the article URL, which Medium often refuses.
- `aeae18b6` (2026-10-05) waits for that body before requesting the Korean
  invitation. When the body fails or is slow, the invitation never starts.
- The Preview handler from `a1564f34` (2026-09-25) drops an invitation that
  arrives while Read is in flight. That only became visible once Read started
  failing more often.

Do not revert the wordbook revision check from `b3a2ecf6`, the two-request cover
budget, or the 128 KiB cover prefix. Those are separate from this Preview
failure. This change keeps the cover limits and does not turn Medium prefetch
back on while the bytes would still cross Supabase. It does keep a built-in
feed body on device for the metadata’s twenty-four-hour window, and it lets the
feed summary request the invitation before the body returns.
