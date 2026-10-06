# Android tablet PDF native touch feedback

## Report and boundaries

On October 6 the user reported a blue panel covering the viewport when tapping
words and sometimes while scrolling, on an Android tablet, probably Chrome.
The source format and exact browser version have not yet been confirmed.
This patch closes a concrete PDF feedback inconsistency. The physical symptom
has not been reproduced on the user's Android tablet, so it does not establish
that every reported blue overlay has this one cause.

## Mechanism found in the source

`styles/reader.css` gives the entire `.pdf-source-page` a pointer cursor.
Unlike text `.w` and `.epub-touch-skin`, it did not disable native tap feedback.
Chromium's `BestTapNode` deliberately selects the largest enclosing hand-cursor
node. `LinkHighlightImpl` paints that node's outline as a separate compositor
layer. A tap on the PDF canvas can therefore tint the entire paper before
Breeze has classified a gesture as word lookup or scrolling. Browser-native
feedback is not an application DOM panel and is separate from the word-sized
lookup shimmer or selected-word marker.

Primary engine sources:
- [Chromium target selection](https://chromium.googlesource.com/chromium/src/+/aa595e0ebb8c5ecd64e1598bf1359f0cf076b818/third_party/blink/renderer/core/exported/web_view_impl.cc)
- [Chromium compositor feedback](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/paint/link_highlight_impl.cc)
- [Transparent-color suppression](https://chromium.googlesource.com/chromium/src/+/9d5d0c6635b31a4534ee1ade375e7eb29da4e1ab/third_party/blink/renderer/core/frame/link_highlights.cc)

The relevant reader CSS and lookup-feedback implementation are unchanged between
main `693488cf` and the initial PR #111 head `680f1917`. This is not introduced by
the pending RSS or PDF repaint integration.

## Change

The existing PDF paper rule now owns `-webkit-tap-highlight-color: transparent`.
The canvas inherits it. Mouse cursor, pointer/touch ownership, scroll policy,
lookup lifecycle, selection tint, handwriting and PDF geometry are unchanged.
No global tap-feedback reset or gesture cancellation was added.

## Validation

- Static regression fails on the old paper rule and passes with the declaration
- Browser regression uses local synthetic PDF content, with external requests
  blocked; baseline serves the exact main reader CSS
- Chromium/WebKit verify computed paper/canvas feedback, one word-sized marker,
  unchanged cached lookup, absent native text selection and no modal scrim
- Chromium emulated touchscreen additionally verifies that moving contact still
  scrolls and does not open a lookup; screenshots record held contact and release
- Light/dark at phone, tablet, desktop and short landscape viewport sizes

CI results must be recorded after the exact-head run. Browser emulation is not
physical Android compositor proof. Persistence across a cancelled/long contact
and device-specific Samsung Internet/Chrome behavior need real-device evidence.

If the user sees the same overlay in Text/EPUB, or after this CSS reaches the
web app, inspect that case separately with a short recording and exact browser
version instead of broadening this patch by guesswork.
