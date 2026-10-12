# Unlimited-OCR comparison experiment

This is an opt-in assessment, isolated from the reader, native plugins, caches,
release assets and deployment workflows. It is not a replacement OCR engine.
The only existing-file change is a branch-specific Integrity CI gate described
below; every production and historical release byte remains pinned.
Branch `experiment/unlimited-ocr-comparison` starts from `main`
`8512e8fd25e51d6aa06cf926bad165d5c3994865`, which includes PR147's current
scanned-PDF path. The draft targets `main` so only this experiment is reviewed;
PR156 (`followup/breeze-193-allwords-onboarding`) and its
`integrate/breeze-193-cloud` base are owned elsewhere and are untouched.

## What was verified

Sources checked on 2026-10-12:

- [Official model card](https://huggingface.co/baidu/Unlimited-OCR): 3B BF16,
  custom code, NVIDIA GPU Transformers example, single-image and multi-page
  parsing. Its example enables `trust_remote_code`. No weights or remote code
  were installed or executed in this experiment.
- [Paper, arXiv v1](https://arxiv.org/abs/2606.23050): R-SWA aims to keep the
  decoder KV cache constant during long generation. This is not a measurement
  of Breeze latency, total memory or accuracy.
- [Official vLLM recipe](https://recipes.vllm.ai/baidu/Unlimited-OCR): dedicated
  container, logits processor, literal `<image>` prompt, retained special tokens
  and n-gram arguments. The recipe claims one GPU with at least 8 GB VRAM for
  BF16; we have not measured peak VRAM. Its dedicated-image requirement takes
  precedence over generic installation snippets on the model hosting page.
- [MIT license](https://github.com/baidu/Unlimited-OCR/blob/main/LICENSE):
  copyright 2026 Baidu, notice retention required for distributed copies.
  This PR copies no implementation from Baidu.

The recipe and card describe different grounding representations (ref/det pairs
and category/box det markers). The parser accepts both for text, retains the raw
det payload, and leaves coordinate units/granularity unverified. Markdown header
and emphasis delimiters are removed for this printed-English metric; tables,
formulae, images and multilingual transcription need separate evaluation.

## Why coordinates are a separate gate

Breeze's [current decision](../../docs/decisions/021-scanned-pdf-ocr.md) uses
Apple Vision lexical range boxes and Android bundled ML Kit elements. The real
`BreezePdfOcr.boxesFromWords` adapter requires English lexical words, confidence
0.3–1, and valid top-left normalized rectangles. It rejects multi-token element
approximations. The experiment executes this unchanged adapter in a test VM to
score native words.

Unlimited-OCR block grounding does not establish that contract. We do not split
paragraph boxes, manufacture confidence, assume coordinate units, or expose
model text as tappable words. Candidate tap metrics remain `null` until an actual
word-level output contract is verified. Better text alone would not justify a
production swap; hosting would also change Breeze's on-device privacy/offline
behavior and needs a separate product decision.

## Fixtures and scores

Eight committed, independently labeled, non-private rasters are reused from
`tests/fixtures/pdf-ocr-stress`: clean print, small print, low contrast, 90-degree
rotation, two columns, repeated words, dense print and blank. SHA256 of manifest
and every raster is recorded. The corpus generator is owned code with synthetic
text; no external PDF/demo or downloaded dataset is used. These are the scanned
page pixels, not a PDF ingestion benchmark. No new fixture rendering dependency
is needed. PDF.js rendering, intrinsic PDF rotation, live ink exclusion and
reading interactions retain their existing production tests.

Reports preserve raw model/native outputs, per-case timing and resources, plus:

- Normalized word/character edit distance (WER/CER; empty denominators are
  `null`), and blank-page hallucinated word count. Case, whitespace and basic
  Markdown are normalized; punctuation is outside Breeze's lexical contract.
- Reading-order inversions among unique matching tokens. Missing and repeated
  tokens are excluded from that metric and remain visible in WER. Expected
  two-column order follows the fixture generator; it is not a claim about
  Breeze sentence reconstruction.
- Native word tapping: correct text, one expected ink center in the tap box,
  emitted center near the independent glyph bounds and IoU >=0.25. Repeated
  words are matched by location. Ambiguous broad rectangles fail. This is a
  synthetic diagnostic, not physical tap acceptance.

There is no aggregate winner or speed ratio. Native bridge timing and HTTP
wall-clock timing have different scopes. Client RSS is sampled after each HTTP
response and is explicitly separate from server/model memory. Native RSS/PSS
and snapshots are retained when present. Server peak VRAM and cost are manually
recorded observations or `null`, never estimates inferred from model size.

## Run contract checks (no model)

```sh
node --test experiments/unlimited-ocr/contract.test.mjs
node --test tests/verify-pdf-ocr.mjs tests/verify-pdf-ocr-library.mjs
```

The second command needs the repository's locked dependencies (`npm ci
--ignore-scripts --no-audit --no-fund`). Tests use authored responses to verify
scoring and a loopback mock server to verify transport. A `contract` report is
rejected by the comparison command. Mock test durations and perfect authored
words are not OCR latency/accuracy observations. Tests run in Integrity only for
this experimental branch; the product test script and release-branch gates are
unchanged. The experimental boundary checks every file against the pinned
`main` tree, permits only regular additions under this directory plus the exact
reviewed CI gate, and runs the unchanged historical 1.9.2/1.9.1 checks on the
pinned base. Negative tests reject production or receipt drift, deletion,
executable/symlink additions and unrelated workflow changes. The original
release checker and receipts are unchanged.

## Real native baseline

Use the existing harness on a supported machine against this exact checkout:

```sh
bash tests/native/run-pdf-ocr-vision.sh
# Or follow tests/native/run-pdf-ocr-android.sh on a configured Android emulator.
```

Vision here is macOS CI, not physical iOS; ML Kit's harness is emulator evidence.
Copy `environment.example.json` to an ignored/local metadata file and fill in
the actual source SHA, runtime/device, model revision if known, measured resources
and timing state. Verify the fixture bytes on the producing machine before
setting `inputProvenance` to `same-committed-fixtures`. Legacy native reports do
not include input hashes, so that assertion is recorded as operator attestation.
Use the actual recognition report, not the memory input-only control:

```sh
mkdir -p experiments/unlimited-ocr/results
node experiments/unlimited-ocr/run.mjs \
  --native /tmp/breeze-ocr-vision/vision.json \
  --metadata /tmp/native-environment.json \
  --out experiments/unlimited-ocr/results/native.json
```

Import rejects mock/control labels, explicit incomplete runs, missing/duplicate
selected cases, errors and missing/invalid timings. No historical report was
silently reused as a current baseline.

## Real Unlimited-OCR (requires an already available local GPU server)

This PR neither installs nor starts a server. Before executing upstream custom
code or a container, review its source at the exact chosen revision and follow
the required source/installation approval process. Record a model revision and
container digest rather than relying on mutable `main`/tags. Use the verified
official serving recipe, including the registered n-gram logits processor and
single-image gundam mode. Record cold startup/warmup separately; requests here
run sequentially without a hidden warmup. The recipe's 8 GB claim remains
unverified until measured. Monitor server idle/peak VRAM/RSS with a documented
sampling interval; record limitations of sampling and any actual billed cost.

Only explicitly opted-in loopback HTTP is supported. No credentials are used,
redirects fail, custom input paths/remote images are unavailable, and only the
eight fixture rasters leave this process. Bounds: one request at a time,
120 seconds per request (at most 16 minutes of request deadlines), 8192 generated
tokens, 10 MiB input and 4 MiB response per page. Requests finishing by token
limit fail rather than becoming apparently complete scores. A failed run writes
no new report; use fresh output paths so an old report is not mistaken for it.

```sh
node experiments/unlimited-ocr/run.mjs \
  --endpoint http://127.0.0.1:8000/v1/chat/completions \
  --allow-local-inference yes \
  --metadata /tmp/unlimited-environment.json \
  --out experiments/unlimited-ocr/results/unlimited.json
node experiments/unlimited-ocr/compare.mjs \
  experiments/unlimited-ocr/results/native.json \
  experiments/unlimited-ocr/results/unlimited.json \
  experiments/unlimited-ocr/results/comparison.json
```

Comparison recomputes scores from raw cases, requires matching fixture hashes
and rejects mock reports. It is offline. Runtime metadata are attestations, not
cryptographic proof that a named engine was used. Multi-page/PDF recipe behavior,
long-context throughput, device latency, thermal/memory stability and actual
word geometry remain future tests; do not infer them from this per-page run.

## Outcome of this draft

See [status.json](status.json): real Unlimited-OCR and fresh native benchmarks
were **not run** in this Linux environment (no GPU server, `nvidia-smi`, Apple
toolchain or configured Android runtime). No comparative numbers, cost estimate,
or production replacement recommendation are available. The next useful result
requires matched real outputs plus verified word coordinate semantics. The
harness makes those gaps reviewable without changing production or borrowing
another experiment's budget. See [the researched prerequisites](prerequisites.md)
for the existing official ZeroGPU demo's limited no-provisioning option and its
unverified availability and reproducibility constraints.
