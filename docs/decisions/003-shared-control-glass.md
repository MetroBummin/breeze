# Shared floating control material

## Decision

Home, shelves, Wordbook and Reader opt into `.control-glass`. Its material is defined once in `styles/reader.css`; palette values live in `styles/tokens.css`. The shared `.control-dock`, `.control-bar`, `.control-circle` and `.control-pill` primitives own expanded placement and geometry. View-specific rules may change content, but must not override padding, alignment, size or offsets. The Reader's compact and sentence-loading geometries remain intentional variants.

Light reflection is a pointer-transparent foreground layer above the progress tint. A reflection behind the tint disappears as progress fills, especially against the Reader's nearly uniform paper background. Home's colorful covers can make the same transparent material look richer: equal computed CSS is necessary, but does not imply identical rendered pixels over different content. Do not compensate by adding independent Home/Reader color overrides.

The reflection stays subtle at the center so it does not wash out labels. Dark material is unchanged. No looping shimmer or new interaction is needed to communicate glass.

## Regression coverage

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

The iOS canvas, WebView, scroll view and under-page background follow the computed
root background on view/theme changes. Home gray must not expose Reader paper
behind its native edge bounce. Colors come from the existing CSS palette.
