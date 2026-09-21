# Shared floating control material

## Decision

Home, shelves, Wordbook and Reader opt into `.control-glass`. Its material is defined once in `styles/reader.css`; palette values live in `styles/tokens.css`. View-specific rules own placement, dimensions and content only. The Reader's compact and sentence-loading geometries remain intentional variants.

Light reflection is a pointer-transparent foreground layer above the progress tint. A reflection behind the tint disappears as progress fills, especially against the Reader's nearly uniform paper background. Home's colorful covers can make the same transparent material look richer: equal computed CSS is necessary, but does not imply identical rendered pixels over different content. Do not compensate by adding independent Home/Reader color overrides.

The reflection stays subtle at the center so it does not wash out labels. Dark material is unchanged. No looping shimmer or new interaction is needed to communicate glass.

## Regression coverage

Run `npm run test:home-ui` for the cross-view browser checks below, alongside `npm test`.

`tests/verify-home-controls-browser.mjs` checks shared material and expanded geometry in both themes at five widths, plus the compact Reader material, reflection stacking and progress fill. Visual review must include the Reader's plain background and Home's cover background at matching progress. Compare both empty and filled states; do not rely on Home alone.

`tests/verify-wordbook-browser.mjs` checks the Penpot layout's responsive bounds and control positions as well as real search, sorting, filtering, edit, manual addition, export and Home navigation. Filters never change saved records or separate a Meaning from its headword group.
