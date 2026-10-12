# Smallest real-comparison prerequisite — research only, 2026-10-12

A valid first **text/order** comparison needs a complete real Unlimited-OCR
response and a fresh native response for the same committed `print-48` raster,
with engine/source provenance and timing scope recorded. The eight-case harness
requires complete matched outputs for all eight. This environment has neither
an available GPU server nor an Apple/configured Android runtime. The existing
native harness can produce the baseline on an already available Mac or
configured Android emulator without a paid OCR service. No native/cloud run
was performed in this research follow-up.

There is an existing official no-provisioning option for exploratory text:

- [Baidu's official Space](https://huggingface.co/spaces/baidu/Unlimited-OCR)
  is currently listed as running on ZeroGPU.
- [Its app source](https://huggingface.co/spaces/baidu/Unlimited-OCR/blob/main/app.py)
  exposes `run_ocr` with streamed text and a final completion flag. It uses
  gundam by default, an 8192-token cap and a 60-second GPU allocation per page.
  It loads mutable model revisions with remote-code trust and installs packages
  at runtime. Reading this file is not a complete audit of model/dependency code.
  We did not copy or execute it.
- [Hugging Face's ZeroGPU policy](https://huggingface.co/docs/hub/spaces-zerogpu)
  documents free use of existing Spaces, including a two-minute unauthenticated
  daily GPU quota with low queue priority. Eight successful runs cannot be
  promised within it. No account/subscription is needed for the documented
  unauthenticated tier; no account was created or credentials used.

**Usability remains unverified:** the browser tool read the Space listing and
source, but opening `https://baidu-unlimited-ocr.hf.space` returned an internal
retrieval error. No inference/API call, upload or quota use was made. The earlier
direct shell Hugging Face metadata HTTP 403 remains respected; no alternate
proxy, credential workaround or changed security setting was used. The
[model card](https://huggingface.co/baidu/Unlimited-OCR) reports no hosted
Inference Provider deployment, so generic provider widgets do not establish
another usable free endpoint.

If reachable through ordinary allowed access, this Space could accept only the
owned synthetic raster for a limited text-quality smoke test without private
PDFs or provisioning. It uses a different API from this PR's loopback vLLM
harness. A separately reviewed bounded Space client/import contract would be
needed for reproducible reports; the loopback guard must remain intact. A UI
completion flag alone does not establish untruncated output, an immutable model
revision or absence of partial generation errors.

For the **current eight-case harness**, the smallest direct prerequisite is an
already available local GPU server using the reviewed official vLLM recipe,
plus fresh native output. [The recipe](https://recipes.vllm.ai/baidu/Unlimited-OCR)
claims at least 8 GB GPU VRAM; this is not measured here. Record exact model
revision/container digest and decoding settings, then raw outputs and server
memory/timing observations. Paid hardware is unnecessary if suitable existing
hardware is available, but no such runtime was found or provisioned.

Neither route alone resolves the **word-tapping** gate. Actual word-level
coordinates, coordinate units, confidence and line semantics must be established
before geometry can be tested; block grounding is insufficient. The hosted demo
does not provide verifiable peak server VRAM, stable throughput or deployment
cost. Free access is a quota policy, not a measured inference-cost result. A full
product comparison remains blocked on native evidence, accessible/pinned
inference and word-box semantics.
