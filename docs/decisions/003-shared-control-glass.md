# Shared floating control material

## Decision

Home, shelves, Wordbook and Reader opt into `.control-glass`. Its material is defined once in `styles/reader.css`; palette values live in `styles/tokens.css`. The shared `.control-dock`, `.control-bar`, `.control-circle` and `.control-pill` primitives own expanded placement and geometry. View-specific rules may change content, but must not override padding, alignment, size or offsets. The Reader's compact and sentence-loading geometries remain intentional variants.

Light reflection is a pointer-transparent foreground layer above the progress tint. A reflection behind the tint disappears as progress fills, especially against the Reader's nearly uniform paper background. Home's colorful covers can make the same transparent material look richer: equal computed CSS is necessary, but does not imply identical rendered pixels over different content. Do not compensate by adding independent Home/Reader color overrides.

The reflection stays subtle at the center so it does not wash out labels. Dark material is unchanged. No looping shimmer or new interaction is needed to communicate glass.

## Regression coverage

Home and Casuals category chips follow the word lookup star buttons: 12px
corners, neutral action surface and a restrained first-star warm tint for selection. They use
the shared sentence-glass palette without the floating dock's reflection or
shadow. The expanded word lookup loading glow uses the same neutral palette,
scoped to that panel so other loading surfaces retain their own appearance.

Run `npm run test:home-ui` for the cross-view browser checks below, alongside `npm test`.

`tests/verify-home-controls-browser.mjs` checks shared material and expanded geometry in both themes at five widths, plus the compact Reader material, reflection stacking and progress fill. Visual review must include the Reader's plain background and Home's cover background at matching progress. Compare both empty and filled states; do not rely on Home alone.

`tests/verify-wordbook-browser.mjs` checks the Penpot layout's responsive bounds and control positions as well as real search, sorting, filtering, edit, manual addition, export and Home navigation. Filters never change saved records or separate a Meaning from its headword group.

Home, Wordbook and expanded Reader controls are compared as three identical slot rectangles, including computed padding and alignment. Wordbook status chips and selected filters use the same `--s1`/`--s2`/`--s3` background and ink tokens as Reader status buttons.

## Shelf pull and native canvas

Home and shelves use a bounded, damped content translation while pulling at the
upper edge. The fixed control dock stays in place. A small neutral spinner is the
only visible refresh cue; accessible status remains available without on-screen
instructions. Release settles with a short eased transition; reduced-motion users
keep static content. Horizontal, short, cancelled, multi-touch and overlay-owned
gestures do not refresh. Navigation clears the presentation and concurrent refreshes
share one operation. The Reader never participates in the shelf pull handler.

In the iOS app, WKWebView's scroll view owns the pull gesture and one
`UIRefreshControl` owns the spinner. The web handler reports whether Home or a
shelf is active and runs the same refresh operation when native refresh fires.
The spinner uses the measured logo position and live safe area to sit in the
pulled gap. Browser use retains the touch gesture above. Home and Casuals refresh
their RSS cards; all three library views reload saved books.

The iOS canvas, WebView, scroll view and under-page background follow the computed
root background on view/theme changes. Home gray must not expose Reader paper
behind its native edge bounce. Colors come from the existing CSS palette.

## Home resume transition

Prepare local ligature repair and original-file lookup before starting the browser
view transition. Its update callback waits only for the Reader shell or original
loading surface; PDF/EPUB rendering and position restoration finish independently.
A slow file must not hold the snapshot callback until the browser cancels it.
The resume action remains single-flight until both animation and book opening
finish. Navigation during preparation cancels the pending open. Failures release
the busy state and allow retry. Reduced motion and unsupported browsers use the
same opening path without the animation. Live Reader geometry is never scaled.

`tests/verify-home-resume-browser.mjs` checks both engines with slow preparation,
slow original rendering, rapid repeat taps, cancelled navigation, failed opening,
reduced motion and preserved Text scroll position.

The Home/Reader transition reveals and closes a rounded surface with clip-path and
no full-screen blur, never stretching text. The Reader back control reverses the reveal
toward the current Home resume pill. Reduced motion skips both directions.

All saved-progress labels use `readingPercent`: floor the canonical ratio, with
100 reserved for an actual ratio of 1. Cards and resume controls share this rule.

Home keeps keyed card/image nodes while progress changes. RSS replacement occurs only after replacement data and images are ready. Both transition directions keep the Home snapshot opaque behind the moving Reader surface, so the animation never reveals an empty canvas.

Both morph animations use fill-mode `both`. In particular the departing Reader must retain its terminal opacity/clip until the browser removes the snapshot; resetting to the underlying opacity 1 at the animation boundary briefly restores the full Reader. Browser regression seeks past the close animation duration and asserts opacity 0.

Home long-form card reconciliation does not calculate reading time: these cards do not display it. Casual cards retain their existing reading-time labels.

Casual reading-time calculations reuse a weakly held paragraph-array cache. A
string/length comparison detects in-place edits as well as replaced source arrays;
cached counts are presentation-only and never persisted into a book.

Text Reader image Blob URLs belong to one body render. Replacing the body or
leaving Reader outside the bounded Home cache revokes them; late image reads from an abandoned render cannot
create a URL or update the detached body. Home cover URLs have separate ownership.

Library data refreshes render only the active Home/Casuals/Long-form view. While
Reader or Wordbook is active they render none of these hidden views. `show()`
already renders each destination on entry from current data, so no dirty flags
or background DOM rebuilding are required to keep later navigation up to date.


## Bounded Home round trips (1.3)

Keep at most one complete Text/PDF/EPUB Reader for 60 seconds after returning to
Home. Reuse the body, parsed original document and its live nodes for the same
unchanged book; restore the latest saved anchor. Source paragraphs, formatting,
source map, original metadata, title and kind invalidate reuse. Another destination,
another book, expiry, pagehide or hidden application releases cached DOM, original
resources and Blob URLs. Transient onboarding and unfinished original loads are
never retained. This trades a bounded period of retained memory for avoiding repeat
parsing; it is not a general multi-book cache.

Home and Reader name their visible pill `reader-control` during navigation so its
surface connects both endpoints. Both directions use 340 ms and the same easing;
the closing Reader stays opaque through 85% before its terminal fade. Full-screen
blur is removed. Fill-mode `both` remains. Compact control geometry transitions
use 260 ms; collapsing requires 24 px of downward travel (previously 12), while
44 px upward still expands it. Native interactive drag-to-dismiss is not added.

`tests/verify-reader-reuse-browser.mjs` checks actual EPUB/PDF session and DOM
identity, Text scroll restoration, source-edit invalidation and explicit release
in Chromium/WebKit. Existing Home, sentence, onboarding and lookup regressions
remain required; simulated browsers do not establish physical iPhone frame rate.

## Covers without photos

Local long-form and shared-link cards use deterministic local SVG line ornaments
when no cover is available. Casuals use the title (three lines), not a long body
excerpt. The full title remains available in card metadata; stored article
content is unchanged. Existing palette tokens supply both themes, and real covers
hide the ornament. RSS discovery cards require a working cover image and stay
hidden when the cover is absent or fails to load. Add/loading/cloud-recovery
controls retain their existing layout. Phone and desktop light/dark screenshots
were reviewed with WebKit.

The book edit sheet uses the expanded word lookup surface, line, ink and action
tokens. The own-photo button follows its slightly rectangular 12px controls.
Imported books can still use an image already in the article or a photo selected
from the user's library. RSS discovery cards suppress context menus and ignore
long holds.
