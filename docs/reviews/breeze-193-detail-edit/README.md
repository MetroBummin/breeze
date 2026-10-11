# Detail ellipsis review

Actual Chromium WEB PREVIEWS, not native iOS screenshots. Editing is now owned
by the set detail page. Directory long press/context editing and its hidden
edit trigger are removed. Top-left Back remains, with a 44px circular glass
ellipsis on the right. Its anchored surface morphs into three separated actions:
Rename, Add books and Delete set. The existing row DOM stays intact while it opens.

- [Phone closed, light](web-preview-phone-detail-light.png)
- [Phone open, light](web-preview-phone-edit-open-light.png)
- [Phone closed, dark](web-preview-phone-detail-dark.png)
- [Phone open, dark](web-preview-phone-edit-open-dark.png)
- [Tablet closed, light](web-preview-tablet-detail-light.png)
- [Tablet open, light](web-preview-tablet-edit-open-light.png)
- [Tablet closed, dark](web-preview-tablet-detail-dark.png)
- [Tablet open, dark](web-preview-tablet-edit-open-dark.png)
- [Circular book selection, phone](web-preview-phone-add-books-light.png)
- [Circular book selection, tablet dark](web-preview-tablet-add-books-dark.png)

The detail import action is retained with its pending count. Hidden exclusion
counts, deduplication, frozen sessions, stable row rendering and immediate Undo
remain. Actual set deletion still requires confirmation and preserves original
vocabulary; the built-in All Words has no editing entry.

65 study model/storage/UI tests pass. Chromium lifecycle tests pass. Trusted
Chromium touchscreen tests cover interrupted/repeated morph toggles, outside
ownership without opening a word, Back, keyboard focus/Escape, programmatic and
native scrolling, reduced motion, directory long-press remnants, rename,
source addition, direct/repeated import, immediate/canceled/moved Undo and ten
light/dark layouts. `touch-verification.json` records trusted input evidence.
`manifest.json` records captured source and image SHA-256 values.

Historical 126145ca CI is separate: eight terminal workflows, five passed,
three failed only at the unchanged historical build-266 integration boundary.
Integrity browser passed. The new ellipsis source requires its own CI. The
historical boundary is preserved; a reviewed new release candidate must have
an explicit new source contract before archive/upload. No build/version change,
main merge, Cloud archive or TestFlight upload is performed by this follow-up.

The prior Library helper failed before prepare/transfer, including one retry.
These committed PNGs provide a persisted route for the parent to download and
attach through its working Library connection. Raw links must name the exact
commit whose source hashes match the manifest.
