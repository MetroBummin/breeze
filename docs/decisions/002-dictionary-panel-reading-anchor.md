# Dictionary panel reading anchor

## Problem and confirmed cause

Opening or closing the side panel changes the reader width. The old path preserved only a paragraph top in Text, a page/intra-page point in PDF, or a spine/element in EPUB. A long Text paragraph therefore reflowed while the clicked word could move inside the preserved paragraph. The f644fd8 baseline reproduced a 72.19 px clicked-word shift at a 900×900 headless viewport.

The current side-panel CSS has no width animation; it changes layout when `display` changes. The prior ResizeObserver still owned restoration for every observed width change. The earlier hypothesis that an 800 ms save debounce or an animated panel width was the root cause was not confirmed.

The remaining PDF jump had a separate confirmed order: the panel operation restored the PDF source anchor on the next frame, while `#original-stage` was still allowed to adopt the new Reader width later through its own ResizeObserver. The anchor restoration was correct for the old stage geometry, but the later stage height change made that scroll position point at a later page.

## Decision

Treat each panel layout change as one cancellable operation:

1. Capture the clicked source position and its screen y before changing layout.
2. Change the panel layout.
3. For PDF, wait for the Reader width's actual ResizeObserver notification to lay out `#original-zoom` and `#original-stage` against the new width.
4. Restore that same source position once in the final geometry.
5. Let that operation, not the generic ResizeObserver path, own the corresponding width change.

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
- The PDF button and pinch zoom remain available with a desktop/tablet side panel open; the mobile sheet continues to own covered gestures.
- Reader bottom controls stay inside `#readmain`, so their center follows the remaining Reader area rather than the browser viewport.
- Rapid taps on the pronunciation button belong to that control through its local `touch-action: manipulation`; no global gesture or audio behavior changes.

## Verification

- Headless regression covers Text open/close, panel-only scroll, reader scroll, latest selection, rapid open/close, PDF panel plus button/pinch zoom stress, and EPUB character anchors. At least one PDF panel path starts from browser pointer input rather than calling `openPdfWord()` directly.
- On the same long Text document/action, f644fd8 shifted 72.19 px on open; the new path shifted 0.19 px. Both used one restoration per open and close. Five-frame settling was 99.2/83.9 ms before and 101.6/82.4 ms after; there was no measured delay regression.
- Physical-device smoothness and scroll-limit behavior remain user checks.
- The project has no Home bottom navigation/control; Home navigation is the top bar. There is therefore no Home bottom baseline to unify. Reader controls continue to use their existing safe-area rule.
