# Public web content ingestion

## Product boundary

People want something to read, not an RSS inbox. A URL is a durable source identity;
only a selected article becomes a local Breeze book. Discovery feeds stay small,
local and optional. No new content server, platform scraper or hidden-content
recovery is introduced. Existing article/image relay remains the transport.

## Pipeline

The Share Extension target and App Group inbox remain in the project, but the
extension is not embedded in the app while external sharing is dormant. The
Saved chip and pending-link cards are hidden. Existing App Group records are
neither acknowledged nor deleted; articles already imported into Casuals remain
ordinary saved books. An old persisted Saved category resets to All.

The retained handoff path, when sharing is enabled again, is Share Extension
-> atomic App Group URL record -> pending card -> explicit tap
-> `ingestArticle` -> fetch -> Readability 0.6.0 -> semantic blocks -> existing
`saveCasualBook`/IndexedDB -> existing Reader. The native record is marked opened
only after persistence and Reader opening succeed, and is never acknowledged/deleted.
Failed RSS opens keep the same card and decoded cover for retry. Medium
discovery only publishes cards after a usable public feed body is prepared. Failed shared cards are hidden from Home for
the session without deleting or marking the App Group record read; re-sharing
with a new saved time or relaunching permits another attempt. No inline failure
card or original-link button is added to these rails. Explicit URL entry retains
its original-source fallback. Read articles use the existing
Casuals shelf; re-sharing can present the URL as unread again. Canonicalization
removes fragments and common tracking keys, not arbitrary query parameters.
Concurrent requests for the same normalized URL share one job.

URL entry and feed cards call the same ingestion function. Feed discovery accepts
RSS/Atom directly, advertised HTML alternate links, and small conventional feed
URL candidates. Medium, Substack and Reddit have no article-specific parser.
The built-in sources are Dexerto Entertainment, TMZ, The Daily Dot, Bloody
Disgusting, All That’s Interesting, The Conversation, ProPublica, NASA
Technology, WIRED Top Stories, Medium Technology/Culture/Business, and Reddit
r/science. The site-add control is removed from Casuals; sources saved before
its removal continue loading from local storage. Feed
failures are isolated. Discovery omits cards without a working cover; the saved
essay remains readable after it is opened.

Home recommendation shows only the external feed discovery rail, always across
all categories. It has no category chips, locally saved article cards, or action
card at the end. The Home
shelves below it show long-form Library content and saved Casuals separately,
with their existing add cards at the end of each rail.
Home recommendation cards place source and title over the photo; Home Library
cards put the source or author inside the cover and only the title below it.
The two Library rails use the same cover and add-card footprint. Home photos
may use a cached, bounded focal point when the image can be inspected; a face
rectangle takes priority, with a small local contrast/subject heuristic and
center crop as fallbacks. Analysis happens off the scrolling path and does not
alter the source image, imported book, or feed cache.
The saved short-content Library now shows only the person's own articles. The
separate discovery shelf and category controls are absent there; recommendation
on Home remains the discovery surface. Empty saved shelves omit explanatory
copy, and Home add-card labels stay inside their covers. The saved short-content
and long-content Library screens reuse the Home regular-card cover ratio, inside
source/author label, outside title, and neutral border treatment.
Imported Share Extension articles are ordinary saved Casuals; pending App Group
links remain hidden while sharing is dormant. Old persisted discovery category
preferences no longer affect the Home recommendation rail. Reconciliation removes
every stale card even when several sources supplied the same URL. Read articles
remain in the existing Casuals shelf.
All mixes one visible card per source so the larger entertainment selection does
not bury the existing educational sources. Categories are assigned to feed
sources, not guessed from article titles: entertainment, general, society,
science/technology, culture/lifestyle, and business. The Conversation and WIRED
default to general, ProPublica to society, NASA, Medium Technology and r/science
to science/technology, Medium Culture to culture, and Medium Business to
business. Existing custom sources retain their saved category or default to
general. Casuals no longer shows a source-management form.
Live checks returned valid XML from NASA Technology (10 entries with image
metadata) and WIRED Top Stories (50 entries with image metadata). Their cards use
the same image validation and article ingestion as the other sources. Feed
metadata and covers are supported; article extraction still depends on each
public page being accessible, and paywalled content is never bypassed.
Loading uses a neutral card placeholder with a spinner and an accessible label,
without a visible loading sentence. Feed cover discovery ignores known tiny
tracking images and supports media thumbnails, image enclosures and lazy images.
TMZ's feed gives no cover, so a bounded check of the first few public article
pages may add a real cover and cache the parsed article for a fast first open.
Feeds that append non-XML after a complete RSS/Atom root are parsed by discarding
only that trailing material; malformed content within the root still fails.
Image enclosures are preferred to small thumbnails. The official Complex feed
addresses checked returned 404, so Complex is not a default source. Creepypasta's
current feed uses a repeated site logo instead of article covers; it remains
excluded under the photo-only discovery rule. Photo-free entries can still be
added with explicit URL entry. Empty categories show a message; rapid chip changes invalidate older
asynchronous card renders. Filtering cached feeds requires no new fetch.

## Content boundary

Readability selects the main content in an inert document, with document/element
limits. It is not trusted as a sanitizer: Breeze walks its output and builds plain
text plus explicit metadata. No source HTML, CSS, script, event attribute or custom
class is inserted into the Reader. Allowed HTTP(S) image/link URLs are rebuilt.
Known access-restricted pages are rejected; no credentials or hidden platform
state are used to recover their content.

Blocks use the existing paragraph-indexed representation: headings, paragraphs,
quotes, list markers, image/alt/caption, code and text table rows. Bold/italic are
character-offset metadata painted onto existing word spans. Links are explicit
references immediately below their paragraph, so tapping a word still means
lookup. Table rows preserve cell order with separators; publisher table layout,
merged-cell geometry, video and interactive content are not reproduced. Image
blobs stay local (with an ArrayBuffer record fallback for WebKit Blob write failures), and failed images leave readable text plus a notice and source
link. Author/date/source are retained locally and displayed by the original link.

Reddit's public Atom feeds expose the post URL and, for link posts, a separate
`[link]` target. The target enters the article pipeline and the Reddit permalink
stays as discovery provenance. A self post with enough text enters Reader as a
short post using only the feed's supplied body. No comments are appended.
An accessible X RSS/Atom feed can also supply a post body for the same short-post
path. X does not provide an official public profile RSS endpoint, and an X
profile URL alone cannot create a feed. Breeze does not operate a third-party
feed generator or collect X account credentials. Direct X post shares and
posts without useful feed text are omitted after a failed import. Medium public pages
use the ordinary extraction path when accessible. Login, paywall, blocked,
script-only, short/low-content responses and network failures follow the surface's
failure policy above.
A generic extractor is heuristic: it cannot guarantee complete content on every
publisher, and cannot infer all undeclared access restrictions.

Readability remains the shared main-content selector. A site's explicit
`isAccessibleForFree: false` declaration always rejects the page. Some public
WIRED articles explicitly declare `true` while shipping inactive `paywall` CSS
hooks; those classes alone no longer reject the article. This does not fetch
subscriber content. Reader still reconstructs safe semantic blocks rather than
inserting Readability's HTML. Publisher titles normalize no-break spaces before
Reader layout. When extraction retains no body photo, a declared cover can fill
one leading image block; an unavailable image is removed without losing text.
`srcset` parsing treats commas inside image URLs as URL characters and selects a
screen-sized candidate so large source images do not delay or fail the local copy.

## Interaction and verification

Paragraph text and word identity do not change when formatting is applied. Lazy
word hydration restores emphasis; vocabulary repaint keeps the same nodes. Source
links are outside lookup paragraphs. Existing gesture/sentence ownership remains
unchanged. Browser tests exercise storage handoff, duplicate URLs, parsing failures,
unsafe content, semantic blocks, images, phone viewport/themes, word tap, sentence
hold and scroll. Existing cross-format Reader regressions remain required.
Physical share sheet -> app activation -> Reader remains a separate device check;
a successful simulator build or browser-injected inbox event is not that proof.

## Source verification (2026-09-23)

- Medium documents profile/publication/topic RSS and explicitly excludes complete
  paid stories: https://help.medium.com/hc/en-us/articles/214874118
- Substack documents `/feed`: https://support.substack.com/hc/en-us/articles/360038239391
- Reddit's archived API documentation describes `.rss`; availability was checked
  against the actual subreddit response, not inferred from that old document:
  https://github.com/reddit-archive/reddit/wiki/API
- X's documented post API requires bearer authentication; RSSHub's X route uses
  its own authentication and has reported availability problems. This is why
  Breeze accepts a working user-supplied feed but does not invent one from an X
  profile: https://docs.x.com/x-api/posts/english-language-firehose-stream
  https://github.com/DIYgod/RSSHub/blob/master/lib/routes/twitter/api/web-api/utils.ts
- Mozilla documents extraction and its separate sanitation requirement:
  https://github.com/mozilla/readability

Live HTTP samples: Medium feed 10 entries, One Useful Thing/Substack 20,
Reddit r/science Atom 25, ProPublica 20, all parsed in Chromium and WebKit.
Captured public HTML produced Paul Graham's The Need to Read (12 paragraphs),
Substack's The Overhang (26 including 5 image blocks), and a ProPublica article
(29). Through the actual browser transport/relay, Paul Graham and Substack opened
as local Reader books; Substack image requests failed gracefully in that run.
The sampled Medium article returned 403 and offered original-source fallback.
Feed availability does not imply full article availability.

For the follow-up, the live r/science feed contained a Reddit permalink and a
distinct NASA article `[link]`, which the parser classified separately. Browser
fixtures covered subreddit URL discovery, a self post, link-post provenance,
an X post supplied through an external RSS feed, unsafe markup removal and
Reader opening in Chromium and WebKit. A public X feed endpoint that could be
used for a live X round trip was not available in this check; the sampled
RSSHub public route returned 404. X support is conditional on a working feed URL.

`npm test`, `npm run test:ingestion`, `npm run test:home-ui`, sentence cue browser
and word presentation browser regressions passed. `npm run ios:sync` and the iOS
simulator Debug build passed. Ingestion tests include a failed persistent write
before retry, App Group event/mark-read bridge fixtures, image decode, preserved
custom sources, duplicate URL reuse, partial feed failure, unsafe HTML/links,
phone light/dark, word tap, sentence hold, scroll and original fallback.
Share Extension delivery is simulated at its WebView event boundary in these
browser tests; no new physical-device share round trip has been performed.

## Progressive discovery and public feed bodies

Each feed publishes independently to active rails. Already decoded cards are
reused; the last slow source and cover decoding do not gate ready cards that have
a cover. Old cached candidates remain visible while refreshing. Empty-category
messaging waits for all source requests to settle. Images use no-referrer direct
loading, then the existing image transport on failure. Discovery entries without
a working cover are hidden; opening and reading an article still does not require
a cover. Lazy image attributes take precedence over placeholder src.

An explicit RSS content:encoded / Atom content body can enter the same inert
Readability/semantic pipeline directly. Summary-only, oversized, short and
visibly truncated or restricted bodies use the original article path. This is
conservative heuristic detection, not a guarantee of completeness on all feeds.
It adds no platform scraper or access bypass. Full public feed content avoids a
redundant article request, especially useful for Medium. Direct HTML transport
gets 3 seconds before relay; optional image fetching gets 2 seconds direct plus
4 seconds relay, with fallback covers fetched in the same parallel batch.
Images are still persisted before Reader opens to preserve offline semantics;
this change bounds that wait rather than changing paragraph identity mid-read.

Regression fixtures in Chromium and WebKit hold one source unresolved while
asserting another is visible, preserve card nodes through completion, recover a
blocked cover, and open a full public feed body without an article-page request.
Summary and explicit continued-reading previews are rejected by that fast path.
A fresh direct HTTP check of Medium technology/culture/business feeds returned
403 on 2026-09-23 in this environment; saved XML fixtures passing does not prove
current network accessibility. Physical-device latency remains to be checked.

## Medium topic-feed correction

Live app transport confirmed Medium topic feeds contain description-only teasers,
so the previous explicit-body fast path did not apply to those discovery cards.
For Medium sources, resolve the linked author/publication public RSS endpoint and
match the exact story ID before publishing a card. Custom publication domains use
/feed. Two workers per source and a bounded shared feed-job cache avoid duplicate
requests; ready articles publish progressively. Only substantial unrestricted
bodies accepted by the existing semantic parser are presented. No hidden content
or paywall bypass is used; absent, paid, short, or unmatched bodies are omitted
before display, not after tapping. Public feed availability still varies.

Read failures now leave RSS cards, cover nodes, and retry actions intact, with a
brief toast. refreshFeedRails no longer removes all cards before reconciliation.
This fixes the unrelated cover loss caused by re-downloading already shown images
following one failed tap. Shared inbox record policy is unchanged.

Actual app transport -> public author feed -> local Reader was verified with
current Medium business and technology articles (104 and 27 paragraphs). Opening
prepared bodies took 26 ms and 893 ms in the desktop browser sample; these are
not initial-feed latency or physical iPhone measurements. Regression tests also
cover teaser resolution, exact story matching, coalesced feed requests, and card
and decoded-cover identity after failed opens and rail refresh.

The live automatic Home rail was also exercised: clicking “7 Website Mistakes
That Can Cost Your Business Customers” opened the matching Medium article in
Reader with 73 paragraphs. Screenshot: /tmp/breeze-medium-reader-verified.png.
The initial click harness was blocked by onboarding; the completed run used the
normal onboarding-completed state and a visible Home card.

## English discovery and manual cover choice

Discovery checks feed prose for English words and rejects strong non-English
signals, including Latin-script Indonesian; it does not delete user-saved books
or shared links. The filter is heuristic because many feeds do not declare item
language. An Indonesian Medium title/body fixture is rejected while an English
article and existing Reddit link posts remain supported.

The book edit sheet keeps manual cover choice from the reader's own photos or
article images. RSS discovery cards have no edit long press. The public photo
search experiment was removed; there is no external cover search in the UI.

Feed card images come from feed cover metadata and can render independently of
the Reader body. Reader extraction retains only semantic body images and locally
stores successfully fetched blobs, with an eight-image limit. Therefore a cover
can appear outside without being an inline photo inside, especially when an
image is only `og:image` or an image download fails. A selected manual cover
changes the card jacket; it does not insert an image into the article body.

## Integrity follow-up
New article/paste identity uses SHA-256 of every paragraph with exact case and boundaries. Exact legacy content retains its existing ID. Durable book/original/owned-image deletion is one IndexedDB transaction and excludes shared references. A failed library read is not an empty library. The article relay validates and pins public DNS destinations per redirect and enforces streaming byte limits; deploy its new transport together with the entry point.

## Audit UI follow-up
Known face bounds take priority over centre bias; use contain when their union cannot fit. Crop hints use cache v2. Cover-free regular cards retain text identity. Saved-content empty states include an add action. Primary cards expose button semantics/keyboard activation; wired local cards also expose Shift+F10 editing. Native VoiceOver and real-device design QA remain required.
## Article Preview (Breeze 1.4)

Unread saved articles and newly selected discovery articles open a large Preview
before Reader. The existing `positions[book.id].t` remains the sole read-start
signal; pressing “읽기 시작” calls the unchanged Reader, which writes that time.
Already started articles enter Reader directly. Other book kinds retain their
existing route. Home card layout and Reader rendering are unchanged.

Preview uses the saved article's cover, source title, and a short opening
excerpt. It is a centered popup using the existing word/add popup glass
material; content is trimmed to fit without an inner scrollbar. Korean hook
title, faithful translated title and teaser are
requested lazily when the Preview opens. A local cache avoids repeat requests on
one device; the Edge Function stores validated metadata by source URL and text
fingerprint for reuse across devices and users. Only the server holds the AI key.
If metadata, image, server, or network is unavailable, the source title,
available body excerpt and Reader CTA still work. The translated title remains
in metadata but is not displayed in this first UI.

## Audit follow-up
Preview dismissal aborts its pending Reader navigation; a new selection is never blocked behind a hung old open. This requires the core hardening PR's `openBook(options.signal)` guard when integrated. AI loading has stable placeholders; source-only fallback promotes the excerpt while keeping the dialog/CTA geometry fixed. No model/prompt changes or provider calls in this update.

RSS first selection now opens a provisional metadata-only Preview before network/body/image preparation. CTA remains disabled until durable preparation completes. Dismissal invalidates presentation only; successful background persistence may still populate Library. Failure offers explicit retry, and completion of an old article never reopens a dismissed/other Preview. Source image preparation remains bounded by the existing importer.
