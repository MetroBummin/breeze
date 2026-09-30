# Design tone and Breeze Memory — implementation and release

Base: main `0c3b43d` (2026-09-30). Release target: Breeze 1.6 (199),
`kr.io.breeze.app`. App Store Connect was checked before choosing the number:
1.5 (197) is Ready for Distribution; the latest 1.6 upload is 198, Complete.
User authorized implementation, web publication, archive and App Store Connect
upload. App Review submission is outside this request.

## Changes

- Short Add/Edit/word-add/category/confirmation surfaces share neutral glass,
  borders, 22px corners and readable forms. Add/Edit now use native modal dialogs
  with focus containment, Escape and explicit 44px close controls.
- General task actions use neutral material. Save no longer borrows a grade color.
  Destructive actions retain danger color; sign-in retains its blue primary action.
- Aa actions and Memory filters have 44px targets. Controls wrap on narrow widths;
  surfaces scroll in short viewports. The approved lookup and bottom-dock geometry
  remain unchanged.
- Categories use the shared asynchronous dialog. Cancellation preserves data.
  PDF deletion rechecks the source session after confirmation before running the
  existing transaction. No source PDF bytes or persistence identifiers changed.
- Wordbook is named Breeze Memory; its Home action is Korean. Landing examples,
  support and generated documentation use the Breeze brand consistently.
- Landing retains its six-scene layout. Detail morph uses transform-only animation
  like the Reader; long press uses 750ms, and words support keyboard activation.
  CTA colors use shared neutral/selection tokens. Demo-only meaning data is labeled.
- Public entrypoint styles/scripts are content-hashed alongside the app so shared
  lookup CSS does not remain at an earlier cached version.
- `DESIGN.md` is the durable UI guide, linked by `AGENTS.md`. Shared control and
  library/study decisions describe the implemented contract.

## Verification

Passed on the implementation:

- `npm test` (full contracts, source structure, generation and typecheck).
- `npm run test:design-tone`: Chromium and WebKit, light/dark at
  320×740, 390×844, 820×1180, 1180×820, 1440×900 and 844×390;
  category create/rename/delete/cancel/focus, short 320×360 input viewport,
  PDF confirmation cancel/commit/stale-session protection (Chromium), all six
  landing scenes and detail bounds at five viewport sizes.
- Home resume, shared controls (five widths/both themes), library refresh,
  Reader progress, Wordbook add/edit/search/filter/export and lookup-work tests.
- Word presentation in Chromium and WebKit; real-Reader onboarding suite.
- `npm run test:ingestion`, including import progress/identity, social fixtures,
  article ingestion, dormant sharing, RSS and article-preview tests.
- `node tests/verify-breeze16-browser.mjs` in Chromium/WebKit: PDF navigation,
  bookmark/deletion, reading direction, adaptive tools, grades and folders.
- `npm run test:pdf-ink`: Chromium/WebKit and static contracts, synthetic stylus
  and highlighter/eraser/undo/redo/persistence. Physical-device proof is separate.
- `npm run ios:sync` completed. Final source/www/native hash verification and
  archive/upload results are recorded in the release evidence directory.

The old Home assertion requiring the absence of an Add close button was changed
with the explicitly approved accessible-close behavior. No product failures were
waived as baseline failures.

Evidence: `/Users/kosangbum/Desktop/breeze/audits/design-tone-20260930/implementation/`.
Local tests use isolated browser profiles, authored fixtures and blocked external
requests. No user library or account data is modified. Real iPhone/iPad rotation,
keyboard/safe areas, Pencil palm rejection and latency remain unverified; browser
viewport tests and a signed archive do not establish those properties.
