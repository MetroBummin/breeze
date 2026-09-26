# Pencil input and tool follow-up — 2026-09-26

## Observed cause
- Connected iPad 10th generation on iPadOS 26.5 had build 1.4 (167).
- The user clarified that the toolbar opens but Pencil lines did not appear.
- A same-source diagnostic build received six real Pencil starts. Four crossed a page boundary and cancelled their entire stroke; two completed inside paper. The user then explicitly reproduced disappearance at the inter-page gap. A new WebKit regression failed on the pre-fix implementation.
- Removing the gap would not fix the same cancellation at the other page edges. The fix retains the in-page portion, clips the last segment and suppresses the remaining contact until lift.

## Changes
- Pen and eraser each expose a small options surface above the 300px pill. Pen retains three colors/widths; eraser has three sizes and a visible footprint during use.
- Erasure cuts only covered polyline segments, with continuous swept coverage between sparse input samples. One contact remains one undo/redo operation. Stored v1 records, document hashes and original PDFs are unchanged.
- Per-contact paper bounds replace per-sample layout reads. Drawing updates only history availability, not the full toolbar. Eraser persistence occurs at lift/cancellation rather than each movement sample.
- Native-only DEBUG tracing starts before web events for diagnosis; Release has no trace handler. The final physical test build runs without tracing.

## Validation
- Geometry: six cases pass for tap cuts, sparse swept movement, radii, multiple retained fragments, dots/full coverage/misses/tangencies and diagonal sweeps.
- Chromium and WebKit ink suites pass: partial erase, sizes, one-contact undo/redo, durable fragments, all four page edges at two zooms, no joining on re-entry, retained edge strokes after reload, existing storage failure/retry, palm/contact ownership, native scope, pan/pinch and platform gating. These use synthetic Pencil events.
- A 120-sample regression uses two page-bound reads including the test harness; this bounds DOM work and is not a physical latency measurement.
- Tool popovers pass responsive layout, outside/paper/Escape dismissal and unchanged PDF geometry. WebKit screenshots reviewed at 390 and 820 widths.
- npm test passed without new type findings. Source/www/native 113-file hashes match. Release build succeeded and was installed on the connected iPad without removing its app data.
- User confirmation of the final Release build, archive and upload status will be recorded with release evidence.
