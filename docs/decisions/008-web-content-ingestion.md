# Public web content ingestion

## Product boundary

People want something to read, not an RSS inbox. A URL is a durable source identity;
only a selected article becomes a local Breeze book. Discovery feeds stay small,
local and optional. No new content server, platform scraper or hidden-content
recovery is introduced. Existing article/image relay remains the transport.

## Pipeline

The Share Extension is embedded for PDF/EPUB file intake only (see the file
handoff below). External web-link sharing remains dormant: the Saved chip and
pending-link cards are hidden. Existing App Group URL records are neither
acknowledged nor deleted; articles already imported into Casuals remain ordinary
saved books. An old persisted Saved category resets to All.

The retained handoff path, when sharing is enabled again, is Share Extension
-> atomic App Group URL record -> pending card -> explicit tap
-> `ingestArticle` -> fetch -> Readability 0.6.0 -> semantic blocks -> existing
`saveCasualBook`/IndexedDB -> existing Reader. The native record is marked opened
only after persistence and Reader opening succeed, and is never acknowledged/deleted.
Failed RSS opens keep the same card and decoded cover for retry. Current discovery admission verifies a usable photo, not an article body.
Selected-body resolution and its limits are specified in Decision 015. Failed shared cards are hidden from Home for
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
TMZ's feed gives no cover, so a bounded public article check may add a real cover
and cache the parsed article for a fast first open. A source that already has an
unsaved pictured candidate does not fetch extra cover pages. Each discovery load
repairs at most three sources, with one article page per source. Remaining
photo-free entries stay available through explicit URL entry.
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
An image attempt includes the complete body read and validation, not only HTTP
headers. A direct body timeout, empty image or non-image response still tries
the existing relay within its four-second budget; the two-second direct budget
is unchanged. A complete valid direct image needs no relay request.

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

File imports keep their existing in-memory ID/full-file-hash checks. On a miss,
the duplicate fallback reads direct original records in book order within one
readonly transaction, using keys first to avoid reading nonexistent originals.
Persisted hashes remain checked even when book metadata exists, preserving legacy
and inconsistent-metadata matches. Orphan originals do not become new books. The
fallback does not load the full originals collection at once or repair unrelated aliases; the
existing Reader/reconnect path still performs legacy hash recovery when needed.
Storage failures remain observable and the transaction must complete before the
import can proceed. `tests/verify-import-identity.mjs` covers these boundaries.

On Supabase Edge Runtime, the Node HTTP shim rejects a custom socket `lookup`.
The relay therefore connects to the validated IP via Deno TCP, upgrades the
same socket to TLS with the original hostname for SNI and certificate checking,
and bounds the HTTP/1.1 response. Node tests keep the original pinned lookup
transport. Never fall back to an unpinned `fetch` after a socket failure.

## Audit UI follow-up
Known face bounds take priority over centre bias; use contain when their union cannot fit. Crop hints use cache v2. Cover-free regular cards retain text identity. Saved-content empty states include an add action. Primary cards expose button semantics/keyboard activation; wired local cards also expose Shift+F10 editing. Native VoiceOver and real-device design QA remain required.
## Article Preview (Breeze 1.4)

Unread saved articles and newly selected discovery articles open a large Preview
before Reader. The existing `positions[book.id].t` remains the sole read-start
signal; pressing “읽기 시작” calls the unchanged Reader, which writes that time.
Already started articles enter Reader directly. Other book kinds retain their
existing route. Home card layout and Reader rendering are unchanged.

Preview uses the saved article's cover, source, and original English title.
It is a centered popup using the existing word/add popup glass material;
the image leads into scrollable content under a fixed Read action. A natural
two-to-three-sentence Korean summary is requested lazily when Preview opens.
A local cache avoids repeat requests on
one device; the Edge Function stores validated metadata by source URL and text
fingerprint for reuse across devices and users. Only the server holds the AI key.
If metadata, image, server, or network is unavailable, the source title and
Reader CTA still work. The summary is optional and can be retried.

## Audit follow-up
Preview dismissal aborts its pending Reader navigation; a new selection is never blocked behind a hung old open. This requires the core hardening PR's `openBook(options.signal)` guard when integrated. AI loading has stable placeholders; source-only fallback promotes the excerpt while keeping the dialog/CTA geometry fixed. No model/prompt changes or provider calls in this update.

RSS first selection now opens a provisional metadata-only Preview before network/body/image preparation. CTA remains disabled until durable preparation completes. Dismissal invalidates presentation only; successful background persistence may still populate Library. Failure offers explicit retry, and completion of an old article never reopens a dismissed/other Preview. Source image preparation remains bounded by the existing importer.

## Preview save-intent correction (2026-09-25)

Discovery taps now prepare a memory-only draft rather than a saved Casuals book.
Closing Preview before Read does not persist text/images or create reading
progress. Explicit Read commits the source and images once before Reader entry.
Explicit URL/paste saving is unchanged. Existing saved-but-unread items are not
automatically deleted. See `docs/qa/preview-intent-20260925.md` for the backend
deployment gate and regression evidence.

## Preview reading decision layout (2026-09-25)

The Preview answers whether the article is worth reading within a short glance.
Its image occupies about half the initial scroll area. The source sits above the
original English title and a two-to-three-sentence Korean summary. The content scrolls
under a fixed Read action on narrow phones, tablets and desktop windows.
Successful metadata appears inside a neutral card labeled 짧게 살펴보기. Loading reserves the summary
space; failure keeps the English title and offers summary retry. The server
response contract is version 4 (`summaryKo`) with a new cache key. The shared
table retains its existing columns and stores the summary in `teaser` without
exposing historical title fields. The prompt must preserve the source's
uncertainty and avoid inventing a reason to read when the supplied excerpt does
not support one. Reading state,
save intent and Reader navigation remain the same.
The numeric validator accepts digits, explicit English number words and month
names when rendered as Korean numerals; it still rejects numbers absent from
the supplied title and excerpt. A failed generation is never cached.

## Direct social permalinks — 2026-09-25 follow-up

This supersedes the direct-X rejection above. Social source handling is isolated
in `scripts/importers/social.js`; generic Readability still never consumes X or
Threads timelines. Supported canonical identities are X status / i-web-status
(including twitter.com/mobile and media suffixes), X Article, and Threads
@handle/post on threads.net or threads.com. Profiles/search/Spaces are rejected.

X status imports try one public HTML response first, preserving the requested
post's full Article body and owned photos when present. Official public oEmbed
remains a short-post fallback when HTML does not provide a usable body, within
the same 18-second source deadline. Link-only embeds, including opaque t.co
links, are incomplete content and cannot become saved books. The relay exposes only
`as=x-oembed`, constructs a fixed publish.x.com/oembed target, and reuses pinned
public-DNS, redirect, byte and concurrency defenses. It is not a generic JSON
proxy. It uses no API key, cookies, account login, private GraphQL or mirror.
The oEmbed HTML is parsed in an inert document, never injected or executed.

Threads and X Articles require explicit target-matching public JSON-LD body or
an identified public DOM body. OG description is not full article evidence.
X's public Article microdata can identify a full article inside a status share:
the canonical page, Article identity and enclosing post permalink must agree.
Only its rendered article body and declared cover are parsed; nested posts and
Article scopes are excluded. No hydration state or private endpoint is used.
Login, declared restricted content, malformed/oversized input, target mismatch
and obvious truncation fail with an original-link recovery path. No empty
book is saved. Short posts do not use the normal article 500-character floor.
X Articles keep that minimum and are not accepted from an Article-card teaser.

Line breaks, safe inline links/emphasis, author/date and available image URLs
are preserved in ordinary Reader blocks. Unsupported video/audio remains an
original-source reference, not downloaded or transcribed. The importer
also preserves linked body images and public video poster thumbnails in source
order within the existing eight-image limit, including the cover. Imported content
records `social.platform/id/scope/extraction`. Scope is explicitly single-post
or article; replies, quotes from other people and a thread's unseen continuation
are not stitched or represented as a complete thread. The user receives a
single-post notice. Share Extension delivery/embedding is not re-enabled here.

Concurrent URL aliases share the existing ingestion job, up to four distinct
social loads run at once, and the entire source-load operation has an 18-second
abort budget. Failures clear the job for user retry; 403/429 do not trigger
alternate-provider loops. Real text is not synthetically expanded by an LLM.
Source IDs participate in social book identity so identical posts from different
authors are not misattributed through whole-text deduplication. Ordinary article
and paste identity, latest-intent navigation, offline image storage and read
progress remain the shared contracts from PR #24.

An explicit reimport may repair an existing X oEmbed record whose body contains
only URLs. It fetches and validates the source before a durable in-place update,
retaining the local ID, added time, reading positions and manual title/cover
choices. Failed retrieval or persistence leaves the prior book intact. Ordinary
short posts, manually pasted links and image-bearing books are not migrated.

### Evidence and release boundary

Official X reference: https://docs.x.com/x-for-websites/oembed-api
That endpoint supplies an embed of one post, not all conversation replies or a
guaranteed complete X Article. Threads public HTML can omit the required body;
no universal Threads-import success is claimed. Platform availability is not
proven by fixtures. See `docs/qa/social-import-20260925.md`.

## Device polish and numeric validation repair (2026-09-26)

Decision 015's 2026-10-05 selected-body flow opens the existing Preview shell
with known discovery title/source/photo before awaiting article HTML. Metadata
photo is usable even when a decoded card image is absent. Missing introduction
uses the existing shimmer as text lines, with reduced-motion fallback. Body
failure/retry and switching use the same open sheet and generation guards.
Introduction API input depends on the fetched body; Read unlocks after parsing
and does not wait for that optional API. No preselection article fetch is added.

The summary card owns loading shimmer and a short content reveal, disabled for
reduced motion. Read uses the neutral action color. Dialog entry focuses the
named dialog, with Tab continuing into its controls. Actual pointer input hides
sticky WebKit button/card focus rings; keyboard navigation keeps a neutral ring.
The deployed v4 logs recorded four unsupported_number failures. Exact numeric
strings rejected punctuation, abbreviated months and Korean unit conversion.
Compare normalized quantities and explicit English words/months; reject amounts
without source evidence. A failed numeric/JSON validation gets one fresh,
number-free repair in the same 12-second budget and quota charge. Other upstream
failures never retry automatically. Both attempts must pass validation; failed
results are not cached. HTTP failures expose only bounded reason codes so the
client distinguishes validation, timeout and server availability.


## File-only share intake (1.7)

The embedded extension accepts one PDF or EPUB, up to 100 MiB. The activation
rule advertises files, not web URL/text intake; unsupported files get an explicit
message. A provider's temporary/security-scoped URL is copied inside the load
completion before it expires. The Save action copies that owned file into a
private staging directory in the existing App Group and atomically publishes
its complete payload and metadata. The extension does not parse books or attempt
to force-launch the containing app. It tells the reader to open Breeze.

On startup after library loading, or on foreground delivery, the main app reads
pending file metadata. A main-frame, breeze://localhost-only reply bridge reads
256 KiB chunks by validated UUID and offset, never by a web-supplied path. One
file at a time enters the existing importFile pipeline and its full-byte hash
identity checks. New files enter the unassigned Books shelf; importing again
retains the existing book's identity, reading position and category.

importFile now returns a receipt only after its durable writes complete. The
file inbox acknowledges/removes a payload only when the book AND original are
stored. Parse/DRM/storage/bridge failures and partial original-storage failures
retain the source. Re-entering the app retries; repeated deliveries during the
same foreground do not loop a failed import. Cleanup failure retries just cleanup
in that session; a relaunch safely reruns the hash-deduplicated importer. Legacy
URL records and the dormant article UI remain separate and untouched. Files and
originals remain local; no new server upload or sync payload is added.

Verification: tests/verify-shared-files.mjs covers startup ordering, chunk bounds,
concurrent deliveries, failure retention, foreground retry and acknowledgement.
tests/verify-shared-files-browser.mjs exercises real PDF/EPUB parsing and durable
IndexedDB originals, duplicate bytes, write failures and corrupt input through
the simulated native bridge. Native compilation and a KakaoTalk/Files share-sheet
round trip still require Xcode and physical iOS devices; browser fixtures do not
establish that those native paths work on device.

## Bundled long-read previews and reading invitations (2026-10-03)

All four provided local long reads (Backrooms and three Holmes stories) open the shared Preview dialog before import.
They use authored spoiler-free Korean hooks, original English title, author,
edition/source acknowledgment and estimated minutes at the existing 180 words
per minute convention. English story text is unchanged by preview localization.
The cover is contained rather than cropped in Preview. Opening/closing Preview
performs no story fetch, book/image persistence or progress write. The explicit
Read action owns import; a saved bundled item offers Read/Continue
through the same dialog and resumes the normal Reader. User-imported books retain
their existing behavior. Existing Home resume remains a direct reading shortcut.

The normal `importFile`/IndexedDB path owns identity, persistence and source
paragraphs. Stable `longReadId` avoids fetching already imported bundled stories;
normal source hashing also deduplicates an independently imported identical TXT.
The Holmes asset checksum rejects truncated or unexpected successful responses;
its versioned URL also uses the existing worker's pre-cache verification so a
truncated response cannot poison subsequent retries.
Dismissal, browser Back and navigation away cancel pending fetch/preparation and
Reader presentation. Abort guards run before durable book writes; an already
started write may finish, and saved books are never deleted on dismissal. Failure
keeps Preview open with retry. Optional cover failure never discards readable text.

Short-article descriptions now aim to invite reading through a grounded tension,
question, contrast or surprising fact and enough context to choose accurately.
They must not manufacture mystery, hide an important news result, exaggerate,
invent claims or spoil a narrative ending. This supersedes summary-first wording.
The response field remains `summaryKo` for compatibility; local and shared cache
keys advance to v5. The prompt is prepared in source only. A separate future Edge
Function deployment is required for the new generated wording; no live paid call
or production deployment is part of this change. RSS selection/ranking is untouched.

The provided-story CTA now reads `읽기`, with `이어서 읽기` for existing progress.
There is no separate download prerequisite or download-on-card-tap action.
The normal local fetch/import remains an implementation detail behind Read.
Closing Preview before Read saves nothing; repeated reads reuse the saved book.
A Scandal in Bohemia and The Red-Headed League have separate catalog identities,
complete source/edit audits and title-based fallback covers; the selected Speckled
Band artwork belongs only to that story.


## File import durability and first-session offline use (1.8 QA)

The file SHA-256 owns preparation through durable commit across file pickers,
native inbox intake and reconnect. Same-file operations run in order; unrelated
files remain independent. A failed/cancelled owner does not cancel later imports.
EPUB preparation uses a temporary image prefix. Promotion, book metadata and
original bytes commit in one IndexedDB transaction; only completion publishes
live book state or an import receipt. Aborting any store preserves previous
bytes, images, metadata and reading position. Temporary preparation failures are
observable; no image write failure is swallowed as a successful import.

Reimporting identical bytes preserves the existing cover asset, including a user
image stored under the source EPUB's cover key. The transaction reads the latest
durable cover revision. Home's card signature includes that revision, so replacing
bytes under an unchanged image key refreshes its picture. File IDs, progress,
source hashes, folders and sync representation remain unchanged.

A new import that cannot persist its original now fails without publishing a
partial book. Previously a text-only book could be published with a warning.
Native inbox release continues to require a committed original receipt.

The first web document is not controlled just because its service worker is
ready. When a lazy library is needed there, its immutable versioned script (and
PDF worker) is cached before use. The worker can read this runtime cache across
shell generations. Controlled pages keep their existing fetch caching; native
bundles skip this web path. This does not precache libraries on launch or claim a
running Reader. Cache preparation failure is retryable and reports import failure.

Regression checks: `verify-import-commit-browser.mjs` uses real IndexedDB aborts,
byte hashes, parallel file imports and cover screenshots; `verify-offline-import-browser.mjs`
imports TXT/EPUB/PDF in first and controlled sessions, then closes the document and
opens stored content offline. Browser results do not establish native/iOS behavior.


### Cover edit/import transaction boundary (1.8 QA follow-up)

Cover selection persists the image bytes and metadata in one books/imgs
transaction, merging only edited fields into the latest stored book. Live state
changes after completion. The old split image write -> metadata write allowed a
reimport in between to overwrite the new image before the pointer was saved.
A user-selected null cover with coverUpdatedAt is explicit intent, not a request
for the EPUB fallback. Cover/title edit revisions increase monotonically from
the durable record; an import prepared earlier preserves later presentation edits.
No in-memory cover/import lock or last-writer full-record restoration is added.

Browser regressions reproduce that split-write interval, no-cover reimport, both
snapshot/commit orderings, and actual cover-edit transaction aborts on each store.


## Bounded public discovery reuse (2026-10-05)

Only the thirteen built-in public feeds may persist parsed entries in
`breeze.rss-public.v1` local storage. The allowlist is exact; custom feeds and
arbitrary/authenticated article fetches are never added. Entries include public
feed metadata only; Decision 015 excludes supplied bodies. Up to 100
entries fit within 64,000 UTF-8 bytes per feed and 1,000,000 bytes overall. An
oversized body is omitted with `bodyProvided:false`, never truncated into a
claimed full article. Unknown fields, credential-bearing URLs, corrupt, oversized
and future-dated cache records are discarded. Storage failure leaves discovery
usable through bounded memory reuse. Reading history/ranking is never persisted.

Fresh entries last ten minutes across document launches. Card rotation invalidates
the displayed grouping but reuses fresh public entries. Explicit `loadRss(true)`
still refetches online; ordinary rotation refetches only expired feeds. Last-good
public data up to one day old remains usable offline or after transport failure
without renewing its timestamp. Returning online after an offline load rechecks
freshness. The stale limit also applies in an already-open document; its displayed
groups cannot bypass expiry after a transport failure. Backward clock jumps
invalidate future-dated memory freshness. Each source still publishes independently;
concurrent loads coalesce.

Decision 015 removes background Medium body and cover-page preparation. Rotation
advances metadata only; selected Medium owner feeds resolve after card intent.
Its October 6 ready-display restoration withholds photo-less cards while keeping
their candidate metadata. Only actual bounded cover work shows temporary shimmer;
a decoded usable photo is required for a ready recommendation. Preview/Read
commitment, selected-article images, Smart Crop, import persistence and the
off/shadow Jev rollout remain unchanged. The shared catalog is a separate,
default-off transport with an offline schema proposal.

Verification: `npm run test:egress` covers clean/dirty/changed wordbook state,
concurrency and failed saves, account changes, public feed restart/offline/expiry,
cache limits, custom-source isolation and preparation budgets with mocked network.
Set `BREEZE_EGRESS_COMPARE_BASE=34b5dc9` to write separate before/after request and
uncompressed response-body byte totals. These fixtures do not predict billed
production egress or establish historical attribution.

### Staged native image promotion (2026-10-05)

The WebKit base/current byte comparison reproduced readable native staged Blobs
becoming unreadable immediately after the completed copy/delete promotion
transaction. Direct-key reads also failed; single-browser ownership did not
prevent it. The same boundary failed on build 238 before these cover changes.

`commitImportedBook` now reads only its private staging-prefix records and
materializes native Blob bytes before opening the atomic write transaction.
It writes the already-supported `{imageBytes,imageType}` representation for
promoted images. A byte-read failure rejects before any durable publication.
The final transaction still owns staged deletion, original/book persistence,
and preservation of the latest custom-cover revision. Existing image records
are not migrated, and unrelated/custom covers are not materialized or replaced.
No asynchronous Blob read runs inside an IndexedDB transaction callback. This
adds transient memory proportional to the current EPUB's staged image bytes.

The original abort/preservation assertions remain. An additional browser case
promotes 40 native image records through the production owner and compares
all bytes immediately and after reload; another rejects an unreadable staged
Blob and verifies the existing book and image bytes are unchanged. The bounded
base/current diagnostic retains every baseline failure as evidence and requires
all current-head attempts to pass; the ordinary full Integrity gate is unchanged.

## Deferred HTML parser and shell continuity (2026-10-08)

Readability is loaded through the existing shared lazy-library loader at article,
selected RSS, vault restoration, or HTML-paste preparation. Plain-text paste and
normal startup do not load it. The pure parsing functions remain synchronous;
callers own readiness. HTML preview ignores an obsolete input after awaiting the
parser. Paste commit captures its input/folder and checks navigation ownership.
Failures preserve the input and permit another attempt.

Readability and Homeward lookup data retain their former content-hashed shell
URLs. An uncontrolled first document caches these exact bytes before use; worker
activation carries these exact addresses from an older shell, just as immutable
PDF/ZIP libraries already survive upgrades. Other versioned application scripts
are not copied. Native bundles include the deferred files and skip web runtime
caching; Android HTTPS and iOS both skip worker registration via Capacitor.
`verify-deferred-resources-browser.mjs` and `verify-deferred-offline-browser.mjs`
exercise failure/retry, HTML import, old-shell carryover and cold offline lookup.
