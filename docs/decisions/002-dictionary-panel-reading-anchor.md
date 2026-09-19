# Dictionary panel reading anchor

## Problem and confirmed cause

Opening or closing the side panel changes the reader width. The old path preserved only a paragraph top in Text, a page/intra-page point in PDF, or a spine/element in EPUB. A long Text paragraph therefore reflowed while the clicked word could move inside the preserved paragraph. The f644fd8 baseline reproduced a 72.19 px clicked-word shift at a 900×900 headless viewport.

The current side-panel CSS has no width animation; it changes layout when `display` changes. The prior ResizeObserver still owned restoration for every observed width change. The earlier hypothesis that an 800 ms save debounce or an animated panel width was the root cause was not confirmed.

## Decision

Treat each panel layout change as one cancellable operation:

1. Capture the clicked source position and its screen y before changing layout.
2. Change the panel layout.
3. Restore that same source position once on the next rendering frame.
4. Let that operation, not the generic ResizeObserver path, own the corresponding width change.

Text stores paragraph plus character offset. PDF stores page plus normalized page y. EPUB stores spine, indexed element, and character offset. When the reader has not moved, close reuses the latest clicked-word anchor. When the reader has moved, close captures a new source point at the reader viewport center. Only a non-programmatic change in the reader scroller marks movement; panel scrolling does not. A generation and book/mode checks cancel stale work.

## Alternatives reviewed

- Keep the paragraph-top anchor: rejected because it cannot preserve a word within a reflowed paragraph.
- Capture a new center point on every close: rejected because open-then-close would abandon the clicked reading position.
- Add a correction loop or longer timeout: rejected because it can fight user scrolling, repeat work, and create delayed jumps.
- Change the panel to an overlay: rejected as an out-of-scope UI redesign.

## Invariants

- Open and no-scroll close preserve the latest clicked source word.
- Panel-only scrolling is not reader movement.
- Reader scrolling closes around a fresh, consistent viewport-center source point.
- Programmatic correction is not saved as user reading progress.
- PDF zoom and the existing Text/PDF/EPUB anchor structures remain authoritative.

## Verification

- Headless regression covers Text open/close, panel-only scroll, reader scroll, latest selection, rapid open/close, PDF at 200% zoom, and EPUB character anchors.
- On the same long Text document/action, f644fd8 shifted 72.19 px on open; the new path shifted 0.19 px. Both used one restoration per open and close. Five-frame settling was 99.2/83.9 ms before and 101.6/82.4 ms after; there was no measured delay regression.
- Physical-device smoothness and scroll-limit behavior remain user checks.
