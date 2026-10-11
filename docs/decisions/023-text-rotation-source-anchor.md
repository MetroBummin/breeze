# Text rotation keeps the pre-layout source anchor

## Required outcome and mechanism

A width change must keep the same source paragraph and its viewport offset.
Pixel scrollTop is not a reading position after line wrapping changes.

The previous Text resize path froze `lastAnchor` only after ResizeObserver
reported a new width. A previously queued scroll/progress animation frame can
force the new layout first and overwrite that anchor with the paragraph now
under the old pixel offset. ResizeObserver then faithfully restores the wrong
paragraph. Repeated rotations compound this error. Increasing the 600ms hold
cannot fix the delivery-order gap and also discards real reading after resize.

This is an event-order defect in the generic Text width path, not evidence that
recent PDF or EPUB fixes introduced the device report.

## One owner, synchronous Text commit

`reconcileReaderWidth` owns width transitions. ResizeObserver, queued progress
measurement, and Text persistence all reconcile before sampling the viewport.
It records the current width before restoring the previously stable source
anchor, making repeated calls and observer/frame order idempotent. Text restore
is synchronous, so the Text branch needs no time-based anchor freeze. A genuine
scroll after restoration immediately becomes the next stable reading location.

Opening/mode restoration retains ownership while pending. PDF remains delegated
to its settled source-anchor logic in reader-scroll.js. Original EPUB retains
its existing asynchronous restore, save suspension and hold behavior.

## Verification and limits

The deterministic harness executes unchanged production functions and listeners,
covering 1/3/4/5 rotations, 80/350/700ms spacing, both starting orientations and
both observer/progress orders. It also covers an in-flight 800ms scroll save,
same-task exit save, immediate user scroll, pending opening, PDF exclusion and
EPUB policy. Baseline 8512e8f fails 28 of 54 assertions; the fixed source passes 54.
Existing fractional-scroll reopen/font and PDF/EPUB unit contracts also run.

The dedicated browser workflow runs Chromium and WebKit against real DOM layout
and the production Reader CSS/functions. Its baseline race must fail specifically
with source-paragraph drift before the fixed-head matrix is accepted. The matrix
includes default 700px width, a wrapping 1000px width, viewport rotation/reversal,
forced progress-before-observer ordering, exit save, real scroll, font change,
and restoring the saved anchor. Existing full-app PDF/EPUB opening/navigation
ownership tests run in each engine too.

Desktop browser viewport changes and synthetic event-order control are not
physical iPad rotation, and the source fixture does not exercise the entire
native app lifecycle. Native acceptance still requires 3–5 consecutive rotations
on an iPad, especially with wide Text margins or Split View where lines rewrap.
