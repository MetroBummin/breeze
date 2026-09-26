# X Article import regression — 2026-09-26

Base: `a9a926f64f333cb02ac632de451453246629976e`.
Reported source: https://x.com/dsqjaffa/status/2102054148925526206?s=46

## Cause and evidence

The regression is supported by repository history and the exact public response,
not just a report of slower or incomplete importing.

- `3a92be4a735fcf9c247662da150964729debba3f` introduced X Article extraction
  and image recovery on August 9. Its commit recorded an actual article with
  its own images and no replies.
- `0cbbd1804dd9470f2f61e27539557a2fb736fd69` replaced article extraction on
  September 23. It deleted the X-specific post/root and media routines and
  rejected X URLs from generic Readability.
- `b902130649c2841c4278354adf44ce2458069827` added the social adapter on
  September 25. It accepted an official oEmbed paragraph as a complete short
  post even when that paragraph contained only a shortened URL. Success then
  skipped the public page, including its article body and photos.
- The reported post's official oEmbed response returned HTTP 200 and only the
  link `https://t.co/8UKrTHEa6N` in its paragraph. The production relay returned
  the same shape. This is insufficient article content.
- The public page and production relay HTML contained an explicit, free
  schema.org Article scope, the matching article ID and owner permalink, and
  a rendered `.x-article-body`. Its title is **Jev is INSANE for Marketing**.
  The document does not use the `data-testid` body selectors previously
  required by the adapter.

## Changes

Public HTML is tried first. A successful rich import therefore uses one source
request and does not spend its 18-second source budget on an oEmbed response
before fetching the actual article. Official oEmbed remains the fallback for a
short post without usable public DOM. Restricted, rate-limited and oversized
responses do not start an alternate request loop.

The X Article parser requires all three identities to agree: the page canonical,
the Article microdata, and the enclosing post's own permalink. It reads only
the declared rendered body and its declared cover. It preserves headings,
paragraphs, inline emphasis/links, lists, figures and captions. Image links are
traversed so an `<a><img></a>` picture is not lost as an empty text run. Public
video posters become still previews followed by the existing original-video
notice; videos are not downloaded. Cover, photos and posters share the existing
eight-image limit in document order. Replies, nested quote posts, hidden or
restricted bodies, mismatched owners and truncated bodies are rejected or
excluded. The old unscoped rich-text fallback cannot bypass this boundary.

No DraftJS/hydration-state reader, private API, account session, external mirror
or new backend is added. The generic article extractor is unchanged.

URL-only oEmbed responses are no longer successful imports. An explicit reimport
of a known saved URL-only `x-oembed` artifact refetches the source and repairs
that same local record only after its durable write succeeds. It preserves its
ID, added time, source identity, user title/cover choices and reading positions.
An explicitly chosen empty cover is preserved. The existing object is updated
after persistence so open Reader/editor references cannot later write the old
placeholder body back. Editor writes wait for an active repair; deletion wins.
If the old item disappears while source/images are being fetched, committing
that repair is cancelled instead of creating a replacement item. Ordinary saved
posts and pasted URLs are not part of this repair path.

## Initial workspace checks

An isolated JSDOM and fake-indexeddb harness executed the production parser,
loader, image attachment, storage and article save functions. **21 targeted
checks passed**, including the actual captured public response, synthetic current
DOM, owner/restriction/truncation boundaries, linked images, image-only posts,
the shared media cap, HTML-first success, ordinary oEmbed fallback, 403/429,
80 coalesced URL aliases, failed extraction/write with the old record intact,
in-place repair, customization/progress retention, deletion during a deferred
repair, and reuse without a request. All import/commit/repair jobs and active
load counts returned to zero. Fake-indexeddb is not a native WebKit storage test.

The production loader was also run against the real article relay for the exact
reported URL. Its one HTML request returned HTTP 200 in 9,148 ms; source loading
and parsing completed in 10,273 ms. The result contained **224 paragraphs,
17,570 prose characters and 8 image blocks**, with the correct title/author and
the article's final paragraph. This is one environment-specific measurement,
not an iPhone latency guarantee.

Captured-response replay through storage produced one saved book and eight image
records. That replay used synthetic successful image bytes, so it proves the
storage path rather than live photo availability or visual decoding. A separate
live image check downloaded zero of eight images within the existing 2-second
direct / 4-second relay transport deadlines in this execution environment.
A diagnostic request with a longer deadline confirmed the same image returned
HTTP 200 and 15,080 bytes of `image/webp` both directly (7,672 ms) and through
the relay (9,395 ms). These timings exceed the app's existing image budgets;
they are not evidence that the parser or image endpoint rejected the photo.
The budgets are unchanged without device evidence. Real-device/offline image
verification remains pending and must not be inferred from retained image URLs.

The editor/repair/deletion tests in `tests/verify-article-repair-edit.mjs` passed
10/10. The repository type check passed with 35 diagnostics against the existing
37-diagnostic baseline; no new per-file diagnostics were introduced. Syntax and
diff whitespace checks passed. The full `npm test` suite also completed
successfully. A separate review rechecked native-fallback rejection for a wrong
Article ID, a hidden Article body and a quoted post's text/photos; the exact
captured Article still extracted 224 paragraphs and eight image blocks.

## Initial browser and device boundary

`tests/verify-social-import-browser.mjs` now includes the public Article fixture,
short-link rejection, photo ownership, source ordering and repair regressions.
The fixture contains original synthetic prose and the observed public markup
shape; the third-party article body is not committed to the repository.
Chromium/WebKit executables are unavailable in this workspace, so the expanded
browser suite was executed through CI in the follow-up below. Real iOS
storage/rendering, device import latency and a physical share-sheet round trip
remain separate checks. A native app build is not implied by browser CI or a
web deployment.


## Follow-up: complete image responses and live offline verification

After the initial PR, the full Chromium/WebKit CI passed on `ffaacd9`, including
native IndexedDB and the corrected existing device-polish test. The user then
authorized actual photo verification followed by main merge and web deployment.

A further image-transport defect was reproduced using a real PNG in a native
Response stream: HTTP 200 headers followed by a body that exceeded the direct
two-second deadline returned null without attempting the relay. Image transport
now treats headers, the complete body, and existing MIME/nonempty validation as
one attempt. A failed or unusable direct body proceeds to the existing relay.
The two-second direct and four-second relay budgets and parallel image batch
remain unchanged. `tests/verify-article-image-transport.mjs` exercises slow and
interrupted bodies, invalid bodies, relay validation, exact successful bytes,
and bounded attempts.

`tests/verify-live-social-media-browser.mjs` is the opt-in public-network check
for the reported URL. It uses the real application, production source relay and
actual photo bytes in persistent Chromium and WebKit contexts. It requires all
eight images to be downloaded, stored in native IndexedDB and decoded; after
reloading the application it denies every HTTP(S) request, including localhost,
and verifies the saved images again through the Reader image resolver, including
their byte hashes. It does not substitute captured article HTML or synthetic
photo responses. Deliberate local/external probes must be intercepted and
rejected, and no HTTP(S) response may succeed during the final phase. All eight
images must render in the actual Reader without an application media fetch.

### WebKit offline-emulation diagnosis

The live [diagnostic run on `72c7c65`](https://github.com/MetroBummin/breeze/actions/runs/36238827267)
used the reported public Article and downloaded all eight real photos in both
engines. Native IndexedDB records survived a page reload with the same image
byte hashes, decoded dimensions, full body hash and final-paragraph hash.
Chromium also passed the full Reader and storage checks with Playwright's native
offline flag enabled.

WebKit's `context.setOffline(true)` then caused both the persisted native Blob
and a newly constructed memory Blob containing the same real photo bytes to
throw `NotReadableError` from `arrayBuffer()`. Both Blob URLs failed to decode;
the same bytes as a data URL still decoded at 1200 by 480. Disabling that flag,
while external requests remained blocked, immediately restored native and
memory Blob reads and decoding with the original SHA-256. No stored record was
changed. This separates an automation resource-loader failure from corruption
of persisted photo bytes or a Reader lifecycle failure.

The pinned [Playwright 1.63.0 WebKit patch](https://github.com/microsoft/playwright/blob/v1.63.0/browser_patches/webkit/patches/bootstrap.diff)
adds an unconditional failed-resource-load path when its emulated offline flag
is active, without restricting that branch to HTTP(S). The final check therefore
uses continuous browser request interception to deny all HTTP(S) in both
engines; Chromium additionally enables its native offline flag. WebKit reports
`http-blocked` mode and leaves `navigator.onLine` unchanged. Service workers are
blocked, persisted native Blobs are not rewritten or replaced by memory copies,
and all eight byte/hash/size/pixel/Reader assertions remain in force. This checks
saved media without network access; it is not physical iOS airplane-mode proof.

Run it with `node tests/verify-live-social-media-browser.mjs`. The Social import
workflow exposes a manual `live_media` input and the PR marker
`[verify-live-social-media]` so public service availability is checked explicitly
without making every ordinary fixture run depend on X. Live assertions remain
strict; there is no success skip or extra retry budget. Executed run links and
deployment status are recorded on PR #37. This browser verification does not
represent a physical iPhone share-sheet or native App Store build test.
