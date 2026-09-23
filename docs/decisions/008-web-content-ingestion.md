# Public web content ingestion

## Product boundary

People want something to read, not an RSS inbox. A URL is a durable source identity;
only a selected article becomes a local Breeze book. Discovery feeds stay small,
local and optional. No new content server, platform scraper or hidden-content
recovery is introduced. Existing article/image relay remains the transport.

## Pipeline

Share Extension -> atomic App Group URL record -> unread Home card -> explicit tap
-> `ingestArticle` -> fetch -> Readability 0.6.0 -> semantic blocks -> existing
`saveCasualBook`/IndexedDB -> existing Reader. The native record is marked opened
only after persistence and Reader opening succeed, and is never acknowledged/deleted.
Failed RSS imports are omitted from discovery for the session (manual feed
refresh allows another attempt). Failed shared cards are hidden from Home for
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
The two existing default feeds remain, with Medium Technology and Reddit
r/science plus Medium Culture and Business added as automatic discovery sources; users can add/remove a small local set of
sources without folders, unread counts, or a new RSS management screen. Feed
failures are isolated. Missing photos do not suppress otherwise useful essays.

Home and Casuals discovery share a persisted category chip selection. Categories
are assigned to feed sources, not guessed from article titles: general, society,
science/technology, culture/lifestyle, and business. The Conversation defaults to
general and ProPublica to society; Medium Technology and r/science use
science/technology. Both new default endpoints returned valid XML in a live
check (10 and 25 entries respectively). Existing custom sources default to general;
source addition and the custom source list allow category selection/editing.
Default sources are not listed as editable form rows; the collapsed site-add
control shows only a compact address/category form and any custom sources.
Culture and Business defaults returned 10 and 9 entries in a live check.
Loading uses a neutral card placeholder with a spinner and an accessible label,
without a visible loading sentence. Feed cover discovery ignores known tiny
tracking images and supports media thumbnails, image enclosures and lazy images.
Filtering affects only discovery cards, preserving current reading and saved
links. Empty categories show a message; rapid chip changes invalidate older
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
before retry, App Group event/mark-read bridge fixtures, image decode, source
addition/removal, duplicate URL reuse, partial feed failure, unsafe HTML/links,
phone light/dark, word tap, sentence hold, scroll and original fallback.
Share Extension delivery is simulated at its WebView event boundary in these
browser tests; no new physical-device share round trip has been performed.
