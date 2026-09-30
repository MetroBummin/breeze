# Reader sidebar and centered dock verification — 2026-10-01

Local preview: http://127.0.0.1:4180/

- Sidebar entry and exit retain final geometry and animate translation/opacity. Closing disables interaction before delayed DOM cleanup; reduced motion cleans up immediately.
- Thumbnail slots follow source aspect ratio. Full portrait, landscape and tall pages fit the strip width and 180px maximum height, with a 9px/12px page number and 8px gap. No fixed 224px slot or artificial trailing viewport remains.
- Bookmark targets align to the paper top/left; visible ribbons are 20×28px. Exit and sidebar icons share 22px size and 2px strokes. Source ratio caches are session-local; source bytes, vocabulary and ink storage contracts are unchanged.
- Floating controls, sidebar and Reader settings share glass surface/blur/reflection tokens; light control opacity is 78%. Home/Memory use the same floating material.
- Expanded narrow PDF pills sit 22px right of the viewport center; collapsed reading returns smoothly to center. Narrow layouts reduce pill width and scroll only the writing tools, retaining the reading-mode exit.

Validation:

- `node tests/verify-breeze16-browser.mjs`: Chromium and WebKit passed. Includes 320, 390, 507, 650, 820, 1180, 1440 and short landscape viewports, both themes, expanded/collapsed dock offsets, no overlaps, full-page ratios, thumbnail gaps, bookmarks, deletion, rotation and keyboard navigation. Opening required three bounded thumbnail layout passes rather than per-frame layout.
- `npm run test:home-ui`: passed, including shared control material/geometry across Home, Memory and Reader.
- `npm run test:design-tone`: Chromium and WebKit passed. Reader settings now compare against shared glass instead of the superseded opaque requirement.
- `npm test` under Node 22: passed.
- `git diff --check`: passed.

Browser evidence is stored in the local Codex visualization directory under `reader-responsive`: five dock-size captures, full viewport captures, a comparison sheet, light/dark sidebar and Reader settings. No native archive or device frame-rate claim is part of this verification.

## Compact shelves and Memory follow-up

- Home Memory entry uses the cloud outline without lightning. The original Thunderhead image inside Memory is retained per the user's correction.
- Shelf grids align left with their headings/category controls. Shared heading size is 22px; category add/manage uses quiet SVG actions with 44px targets.
- Category/manual-word dialogs use 380px maximum width, 20px padding, 18px titles and 44px fields/actions. Book import/edit geometry is preserved.
- Memory stars use lookup/Reader 36px visual height with 44px touch areas; list grade colors remain unchanged. Book-filter popup width is bounded to keep its checkboxes inside small viewports.
- Wordbook browser verification passed: responsive themes, search, sort, filters, edit, add, export and Home. Home controls passed five sizes in both themes. Design-tone verification exercises Chromium/WebKit, 320/390/820/1180/1440 widths and short landscape, cancellation/focus and category persistence.
- Final Memory screenshot: `/Users/kosangbum/.codex/visualizations/2026/09/30/01a0efdd-ee53-75d2-b4dc-61bdb40ac231/reader-responsive/memory-compact-final.png`.

## Shared dialog material and final Memory correction

Home Memory entry now uses the original Thunderhead image, per the latest request; the image inside Memory is retained. Star filters expand into three equal-width lookup-style buttons. Sort/book selectors use vertically centered SVG chevrons. Import/edit/task/word-add/preview/Home-settings surfaces share Reader settings background color and 19px blur; a browser read-back confirmed identical material values for seven surfaces in both themes. Chromium/WebKit design-tone, Wordbook interactions, and Home controls at five responsive sizes passed. Current proof: `memory-wide-stars-final.png`, `word-add-glass-final.png`, and `home-memory-logo-final.png` in the existing reader-responsive artifact directory.
