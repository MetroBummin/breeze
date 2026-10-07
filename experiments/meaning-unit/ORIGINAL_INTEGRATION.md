# Minimal ORIGINAL glyph-to-block integration

This experiment connects to the actual Breeze PDF ORIGINAL-mode path in a headless harness. Production scripts, deployed routes, gestures, caches and UI are unchanged. All sources and screenshots here are newly generated synthetic material; no supplied private PDF or exam text is included.

## Stages actually exercised

1. Import generated PDF bytes through Breeze's file importer and open ORIGINAL mode. PDF.js performs actual rendering and operator extraction.
2. The test harness wraps the existing `pdfOperatorEntries` function to retain its raw decoded Unicode and exact glyph cells. It calls existing `pdfTextLines(entries)` with identity normalization. No hand-supplied choice blocks, start/end offsets or approximate text widths enter the adapter.
3. `originalChoiceBlocks` infers one/two columns from aligned choice-marker origins. It requires one contiguous A–C/D/E or ①–③/④/⑤ group per column and a clear gutter. It orders raw lines within each column, splits at labels and joins supported wrapped continuations with explicit newlines. Question headers are separate context blocks. Every raw source interval retains original line-index/character-offset and glyph-cell mapping. `normalizeMapped` retains normalized-to-original intervals separately; original source is never replaced with normalized text.
4. Tap coordinates hit one indivisible original glyph cell, then resolve its enclosing raw lexical interval. Repeated spelling is never searched as a locator. Only that column's blocks enter `prepare`, with the target choice selectable and neighbors context-only.
5. `SelectionSession` makes at most one injected provider call. The **stub selects the entire derived target block** and supplies a placeholder Korean translation. This is a deterministic integration test, not AI selection or translation accuracy. Browser gold spans independently assert the adapter's derived boundaries.
6. `validate` checks source/tap agreement; `highlightGlyphs` maps the returned block interval back to the same operator glyph cells. A test-only overlay paints those cells on the actual original PDF paper. DOM rectangles are checked against glyph geometry after zoom/viewport changes. The unchanged production `pdfWordAtPoint` and PDF `sentenceAt` are evaluated at the same coordinate for the baseline comparison.

## Local results

- 20 adapter unit checks passed: grouping, source/glyph agreement, repeated occurrence offsets, context isolation, malformed labels, missing cells, nonmonotonic glyph order, unclear gutters, continuation gaps, page edge, ambiguous tap, Unicode/ligature normalization and source segment mapping.
- 64 actual-product Chromium cases passed: two columns × beginning/middle/repeated/end word probes × zoom 1/1.5 × portrait/landscape × light/dark.
- Unchanged ORIGINAL-mode baseline returned the exact wrapped choice in **0/64**. It included the question/neighbor/other column. Adapter-derived full-choice stub results matched the synthetic gold in **64/64**, by deterministic grouping and stub construction, not by model judgment.
- All coordinate probes resolved the intended production word. All selected source mappings existed; both wrapped lines were highlighted; adjacent choices and the other column were excluded. Maximum measured highlight rectangle error was 0.0234 pixels.
- Actual rendered missing-label and `/Rotate 90` PDFs were rejected before any provider call (two negative layouts per engine). Local WebKit is still unavailable; the sanctioned CI job now runs this same harness with both engines required. Do not replace that caveat with a pass until exact-head CI evidence exists.
- The 64 probes produced eight stub requests; subsequent configurations used the occurrence-scoped complete cache. External provider requests are blocked. The app's non-billable startup `warm` request is fulfilled by a local stub. No real inference, private source or provider credential access.
- JSON records actual extraction and browser-case timings. They include browser/overlay work with an immediate stub and exclude live inference/network. They are single-machine measurements, not production latency guarantees.

## CI diagnostic correction

The first connected run at `2cd7b9e` completed all 128 Chromium/WebKit coordinate cases and four unsupported-layout rejections, but the job failed at final browser-error collection on WebKit’s exact `ResizeObserver loop completed with undelivered notifications.` diagnostic. Artifact `11461064768` (SHA-256 `5a3a005790a407990f6e7a5ad4ba76a8840aa2cee3c6be4ff4c70fedcd69fac3`) preserves that failed run. The harness now follows the existing production PDF geometry test: count this exact baseline resize deferral separately per engine, keep all geometry assertions, and fail on every other page exception. This corrects error classification; it does not loosen mapping checks or establish AI accuracy. A new exact-head CI pass is required.

Artifact review of the green `42a6b639` experiment job exposed a theme setup defect: the connected harness used an unsupported data attribute, so its nominal dark cases repeated light styling. That run proves 128 geometry/source probes and four rejections, not ORIGINAL dark-theme coverage. The harness now toggles and asserts actual `html.dark`/`body.dark` classes. Corrected theme coverage requires new exact-head CI and screenshot review.

## Deliberate limits and failures

This is a narrow structural recognizer, not a general exam parser. Same-line options, separated grammar subcolumns, multiple question groups in one column, missing/noncontiguous markers, unclear gutters, missing/nonmonotonic cells, loose continuations and rotated PDF glyph axes are rejected as `unsupported_grouping:<reason>`. Rotating the viewport is tested and supported; rotating the PDF text itself is not. Circled-marker and ligature mapping is currently unit evidence, not actual rendered font coverage. Supported fixtures use horizontal Helvetica operators and conventional wrapped indentation.

A distant page continuation can remain semantically ambiguous even with a structurally valid block. Geometry/labels cannot prove semantic completeness, and the validator still cannot detect a valid span paired with a wrong translation. Every source string is an experimental block assembled from raw decoded line segments; this is not a claim of PDF byte offsets or canonical text extraction for arbitrary files. Coordinate probes call the actual hit-test/adapter functions; they are not trusted long-press gesture or physical-device tests.

The supplied private PDF remains untested here: both earlier attempts already used the resolved-reference helper with a short `/workspace/private-meaning-unit/source.pdf` destination; no readable bytes exist. Parent-provided text-only target spans are not geometry, visual-page or integration evidence. No further download retries were made, and no private source was sent to a model or public GitHub.

## Reproduce

```sh
node experiments/meaning-unit/original-adapter-test.mjs
node experiments/meaning-unit/original-browser.mjs
# Require both engines (sanctioned CI):
REQUIRE_ALL_ENGINES=1 node experiments/meaning-unit/original-browser.mjs
```

Local execution used the isolated Playwright module and installed Chromium via the same `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH` and `PLAYWRIGHT_BROWSERS_PATH` overrides documented in REPORT.md. CI artifacts contain both harness JSON files and synthetic screenshots. No production integration or rollout is authorized by a passing result.
