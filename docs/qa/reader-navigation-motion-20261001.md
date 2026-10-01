# Reader navigation and motion — build 208

The user's Apple Music recording supplies the Home-to-Reader motion reference. This pass addresses the missing EPUB original navigation entry and PDF sentence-waiting chrome without changing reading geometry.

- EPUB original exposes the existing page entry as chapter navigation. It reuses source chapter headings and reading anchors; PDF page thumbnails, bookmarks and direction controls stay PDF-only. Initial restoration blocks navigation until the source is ready. PDF-only thumbnail observation does not run on EPUB entries.
- Sentence waiting closes navigation and hides the complete back/page group, settings and ink controls. The single 48px center pill displays `문장 해석 중` in read and writing modes, whether controls were expanded or collapsed.
- Home opening uses 480ms and returning uses 440ms with a shared decelerating curve. The returning snapshot stays opaque through 90% and retains its terminal frame. Reader DOM identity and reading position remain stable. Reduced-motion behavior remains covered.

Chromium and WebKit browser verification passed: reader work, PDF navigation, reader reuse, Home UI, sentence presentation/cues, reader chrome motion and notice priority. Geometry and screenshots cover 320, 390, 820, 1440 and short landscape 844px widths, light/dark themes, EPUB chapter navigation, and 40 sentence-waiting combinations per engine. The WebKit intermediate-shape timing check passed on an isolated rerun after a concurrent-run failure.

Unit checks passed. Type checking retained 34 existing diagnostics without additions; structure checks, native Capacitor synchronization, documentation generation and whitespace checks passed. Native build counters are 208.

These checks establish state, layout and animation timing in browser engines. Physical-device frame pacing and TestFlight group availability require device/Apple-side observation and are not established by these results.
