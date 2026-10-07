# AI meaning-unit experiment — 2026-10-07

Isolated from release 1.8.1 at `129745a`. Only `experiments/meaning-unit/` is added. No production imports, server route, auth change, rollout, merge, deployment, provider credentials, or paid model calls. #120 and onboarding are separate. No Notion edits.

The experiment preserves the tapped **UTF-16 occurrence** in a trusted structural block. `prepare` sends one request containing the whole target, exact tap offsets, and one neighboring block on each side as context only. It does not split or front-cut on periods. The provider must return original offsets, verbatim original source, and the complete translation in one JSON response. Validation checks exact source equality, bounds, Unicode boundaries and tap containment. Identical text at a different offset is rejected. PDF highlights filter mapped glyph intervals by block, page and column; incomplete geometry fails closed. `normalizeMapped` retains original intervals through ligature expansion, whitespace folding and line hyphen joining; partial ligatures are rejected. Session ownership cancels old requests and rejects late results; complete cache entries are revalidated against document/revision/tap/context/language, with a 16-entry bound.

If the whole target exceeds the request budget, `insufficient_context` is exposed before any provider request. Large context neighbors may be omitted whole and `contextOmitted` remains visible in both request and result. No target window is silently translated. Output over budget, malformed JSON and declared partial results are rejected without truncation. Defaults: 20,000 prompt UTF-16 units, 32,000 output UTF-16 units; these are experiment budgets, not provider token guarantees. Provider adapters must support cancellation and enforce their own transport deadline/completion metadata before returning a JSON string.

## Evidence

- 1128 deterministic checks passed, including 1,000 out-of-bounds adversarial responses and 128 named checks. This is not 1,128 distinct semantic examples.
- 13 synthetic source fixtures: abbreviations, decimals/ellipsis, exam choices, dialogue, 3814-character sentence, repeated words/sentences, page boundary, two columns, hyphenation/ligature, malicious instructions, Unicode/Korean, and long output.
- Existing `bridgeSentenceFinder` executes unchanged from release code in a VM. It matches the reviewed fixture span in **8/13** cases. It fails abbreviations, decimals/ellipsis, dialogue, long source and original hyphen whitespace fidelity. The VM supplies NFKC normalization solely for token presence. The 600-character server input and 500-character output cuts are replicated as deterministic string operations; the production endpoint is not called.
- Long source: tapped TARGET lies past the 900/600 front cuts. Prototype preserves it. Long Korean output remains 2520 characters versus the old 500-character cut.
- Stub exact spans: 13/13 **by construction**, because the oracle returns the expected fixture answer. This measures validator acceptance, not AI selection accuracy or translation quality.
- Chromium: 112 render cases passed (13 DOM cases + one actual two-column/two-page synthetic PDF × 4 viewports × 2 themes). Viewports: 390×844, 768×1024, 1440×900 and 768×420. DOM Range text equals the selected source; translation equals the supplied stub output. PDF.js renders the actual synthetic bytes; selected left-column choice B excludes right-column choice B. No uncaught page errors.
- UTF-16 surrogate splits, fabricated source, wrong repeated occurrence, wrong block, invalid JSON, empty/partial output, output budget, missing/cross-column glyphs, stale response after a new tap, explicit cancellation, invalid cached partials, revision/tap cache isolation and bounded cache were checked.
- 1,000 timing trials per fixture: maximum fixture median for prepare+validate is 0.0203 ms; maximum fixture p95 is 0.0377 ms. This excludes network, provider inference, geometry and physical device costs. Baseline uses an already-created cached finder; the prototype serializes/clones each request. Raw per-fixture timings and browser render timings are in JSON.

## Failures and limits

**This is not yet evidence that AI selection works.** Structural validation accepts a deliberately wrong translation paired with a valid source. It also cannot prove that a span is a complete sentence/meaning unit. The page-boundary fixture deliberately demonstrates that a model/stub can claim `complete:true` for an incomplete continuation and pass structural validation. Exact source/tap checks alone do not solve either semantic failure.

The target is one block. Across-page sentences are not recoverable unless a trustworthy extraction adapter supplies one logical unit spanning pages. The controlled PDF adapter treats each positioned text item as one choice; it is not a general paragraph/column detector and is not connected to the production PDF reader. Production currently creates a flattened page text stream, so simply wiring this prompt to that stream would lose the boundaries this design depends on. DOM Range is actual rendering evidence; PDF full-choice rectangle coverage uses text-item bounds with equal-width character approximation, not proof of production glyph hit precision. Ligature/dehyphenation offsets are deterministic utility tests, not rendered PDF font coverage.

Malicious source instructions are quoted as untrusted DATA. The stub proves source/DOM handling only; model resistance to prompt injection is untested. Valid JSON with a falsely asserted completeness flag cannot reveal provider truncation; a live adapter must reject non-normal finish reasons and partial transport. The standalone session has no automatic retry or iterative selection machinery. The UI is a diagnostic surface, not approved Breeze product UI or integration with long-press/release gating.

WebKit is blocked: engine binary is absent. Browser CDN installation returned HTTP 403 “Domain forbidden”; installed system Chromium was used successfully. No physical iPhone/iPad testing. The initial browser harness failed on degenerate newline rectangles and an unescaped PDF choice parenthesis; those fixture errors were corrected and the entire matrix rerun. These were harness failures, not product regressions.

No explicitly permitted unmetered model test endpoint was found in the relevant source/tests. Existing dict provider code meters requests and uses authenticated quota/receipt paths; test providers are local stubs. No secrets were accessed and no provider calls were made. **Live accuracy, latency, tokens and monetary cost remain unmeasured.**

## Required live evaluation

Supply an explicitly authorized unmetered endpoint, or separately approve a named provider/model with a bounded call/token/cost budget. Required adapter contract: one prompt request per tap, JSON response with original UTF-16 offsets + source + translation; AbortSignal; hard transport timeout; raw finish reason; usage tokens; duration; error status. Reject truncated/non-normal completions before validation. Log only these safe synthetic fixtures, never student/private source or credentials.

Run the 13 reviewed fixtures with at least three independent model outputs each (39 calls), score source-unit selection and translation separately against human review, record context omissions, all invalid/partial returns, injection obedience, p50/p95 latency, usage and actual cost. Page continuation must be scored a failure or explicit insufficient-context answer rather than hidden inside 13/13 stub success. Do not infer provider accuracy from the safety pass counts. A general structural PDF adapter and broader reviewed documents remain separate prerequisites for any product integration.

## Reproduce

```sh
node experiments/meaning-unit/stress.mjs
# With repo npm dependencies and installed Playwright engines:
node experiments/meaning-unit/browser.mjs
# This execution environment used an isolated Playwright install:
PLAYWRIGHT_MODULE=/tmp/breeze-browser/node_modules/playwright/index.mjs \
CHROMIUM_PATH=/usr/bin/chromium \
PLAYWRIGHT_BROWSERS_PATH=/tmp/breeze-browser/browsers \
node experiments/meaning-unit/browser.mjs
# Interactive diagnostic, no model transport:
python3 -m http.server 4173 --bind 127.0.0.1
# Open /experiments/meaning-unit/demo.html
```

`browser.mjs` records missing engines in `browser-results.json`; an absent engine is not a pass. `stress-results.json` includes all counts, comparisons and timings. PNGs are actual Chromium screenshots. Selected proofs committed here: light/dark PDF, repeated occurrence and ligature source. Full viewport PDF screenshots and long-output images remain in the local artifacts directory. Production decision records stay unchanged because the release behavior is unchanged.
