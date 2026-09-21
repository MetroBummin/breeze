# Pure-AI lookup corrections and evaluation

2026-09-21. Base: `86f5172`. Worktree: `breeze-lookup-quality`, branch `codex/lookup-quality`.

## Result

The deterministic audit defects have been corrected locally. AI quality improved substantially, but the model still makes occasional lexical-boundary and Korean-sense mistakes. This is a tested improvement, not a claim of perfect dictionary accuracy.

The implementation follows three operations: identify the tapped occurrence, ask for one short lexical result, preserve the user's saved/deleted meanings. It adds no remote judge, lexical routing service, local dictionary pipeline, or mandatory second AI call.

## Changes

1. Whole-word removal now resolves the root and deletes all its meanings, regardless of the selected sense. Meaning-only deletion remains separate. Ordinary word removal updates highlighting without rebuilding the whole book.
2. Both retry buttons use the current selected occurrence and one shared request builder. They send the current sentence and up to one previous/next sentence in separate fields; they no longer use an old saved example or force a different meaning with an avoid list.
3. Long sentences are cropped around the selected token, within character and token limits. Surrounding text cannot displace the target. The server verifies that supplied tokens match the sentence and refuses ambiguous/mismatched indices.
4. Previously confirmed sentence/occurrence meanings are reused locally. A genuinely new context is classified once. While waiting, the meaning from a different sentence is not presented as the answer.
5. Word-wrap placement selects the tapped client rect, not the union of two lines. Both upper and lower fragments are tested. EPUB already resolves word-hit fragments; frame-coordinate translation remains supported.
6. Expression persistence preserves manually edited meanings and existing learning state. New expression meanings use the same meaning creation path instead of overwriting the existing card.
7. Automatic results respect meaning tombstones. Explicit re-adds advance beyond deletion timestamps, including future timestamps from another device. Deleted root meanings are remembered even when another sense is promoted to the root.
8. Cache keys and confirmed-context records include an occurrence index and a contract version. A specifically confirmed new sense takes priority over a legacy exact-example match. Old caches are not destructively migrated.
9. Invalid expression responses are never silently converted to word responses with the old expression gloss. Schema, lemma, member count/order/range, fixed function words, and crossed repeated occurrences are validated. A simple synonym list is reduced to its first gloss without another AI call.
10. Invalid primary output can receive one bounded primary retry with a short structural correction, followed by the existing providers within the same time budget. The normal success path remains one call. Provider requests are cancellable and bounded; failures remain errors, not saved answers.
11. Input/output documentation, privacy wording, architecture decisions and regression contracts were updated with the implementation.

## Prompt selection

The selected prompt prioritizes a complete lexical unit when a literal single-word reading would lose the expression. It contrasts idioms/phrasal verbs with ordinary modifiers and transparent prepositions, anchors the selected index explicitly, includes fixed articles/prepositions, excludes variable slots and their determiners, and requires a short Korean sense.

We compared multiple variants. An overly expansive first variant over-detected ordinary combinations. A later temperature/wording variant degraded quality and was rejected. The final prompt retains the best measured decision instructions rather than accumulating a long list of phrase-specific exceptions. Output remains four fields with a 120-token ceiling; longer explanations and reasoning are not requested.

## Final measurements

| Measure | Original prompt | Final implementation |
|---|---:|---:|
| Development exact kind/canonical/members | 87/188 (46.3%) | 171/188 (91.0%) |
| Expression detection | 31/128 (24.2%) | 121/128 (94.5%) |
| Ordinary combinations incorrectly made expressions | 0/60 | 4/60 |
| Successful/valid final responses | 188/188 HTTP; 182 passed new validation | 188/188 |
| Median end-to-end latency | 908 ms | 875 ms |
| 95th percentile latency | 1919 ms | 2709 ms |

Final additional set: 43 sentences × 3 repeats = 129 calls. Exact identity: 116/129 (89.9%); expression detection: 79/84; false expressions: 1/45; valid successful responses: 128/129. Median latency 892 ms, p95 2940 ms. The failing request exhausted recovery and ended with the existing Claude credential returning 401; no invalid answer was stored.

The development set used one provider call in 185/188 requests. Two succeeded on the primary retry; one succeeded at the third attempt (Gemini). The additional set used one call in 127/129, one successful retry, and one exhausted recovery. Median/percentile figures describe these fixtures and network conditions, not a device SLA.

First-attempt development responses averaged approximately 816 input tokens and 27 output tokens, compared with roughly 595 input and 24 output tokens in the baseline. This spends more input to improve identification while keeping the output small. New contexts now cost a lookup where the old policy blindly reused an existing sense; confirmed occurrences remain local.

Across development iterations, 1,773 logical evaluation requests were recorded. The final browser-to-live-model integration added three calls. This is not the number of underlying billed provider attempts.

## Residual quality limitations

- Equivalent headword conventions (e.g. `pull one's leg` vs `pull someone's leg`, optional `something`) lower strict exact scores even when the meaning is useful. Gold labels were not altered after seeing results.
- The model can still choose a word instead of a technical expression such as `due process` or `carbon footprint`, and can occasionally promote an ordinary combination to an expression.
- In one final additional response, `run into serious difficulties` was glossed as meeting someone by chance. Some `with a grain of salt` glosses were too weak or indirect. Structural validation cannot establish semantic truth.
- The automated Korean pattern screen was 114/129 on the final additional set; it misses valid synonyms such as `업신여기다`, `손을 떼다`, or `기슭`. It is not an editorial-quality pass rate. Raw Korean responses were inspected, with the above remaining issues retained in the evidence.
- Claude fallback authentication returned 401 in live recovery. No provider credential was changed. OpenRouter primary retry and Gemini recovery were verified. A valid Claude credential is needed if that final fallback is to work.
- These are development/regression fixtures, including repeatedly used additional examples. They do not establish an unseen-corpus accuracy rate or an absolute quality ceiling.

## Local and integration verification

- `npm test`: passed, including typecheck, architecture, telemetry, 23 sync-safety tests, 200 gesture cycles, 60 lookup lifecycle cycles, word/meaning integrity, sentence lifecycle, EPUB geometry and other existing checks.
- `npm run test:lookup-quality`: passed. Includes server malformed-response/target/cancellation tests and browser whole-word deletion, context, cache, explicit/automatic tombstones, sense-priority and word-wrap tests.
- `BROWSER=webkit node tests/verify-lookup-quality-browser.mjs`: passed with a separate WebKit profile.
- Whole-word removal stress: 100 iterations, zero leftover meanings (Chromium and WebKit).
- `node tests/verify-lookup-live-browser.mjs`: passed with real AI responses in a local browser app: apple-cart expression with all four members, new-context bank sense, zero-call confirmed-context reuse, and wider retry.
- `npm run www`: passed. Source/`www` dictionary, Reader, EPUB, and index bytes match.
- `git diff --check`: passed.

Chromium/WebKit and local build success do not establish physical iPhone behavior. No physical device installation, native archive, App Store/TestFlight operation, merge, push, or production deployment was performed.

## Evidence

- Baseline and first experiment: `benchmarks/lookup-quality/results/2026-09-21T13-53-33.127Z/`
- Final development run: `benchmarks/lookup-quality/results/2026-09-21T14-14-31.597Z/`
- Final additional run: `benchmarks/lookup-quality/results/2026-09-21T14-15-26.912Z/`
- Each final run includes raw input/response records, summary, a lookup-source snapshot and source SHA-256 manifest.
- Reproduction commands and scoring rules: `benchmarks/lookup-quality/README.md`.

The authenticated temporary evaluation function was deleted after the run. The production `dict` and website were not replaced. The original checkout's uncommitted iOS work was preserved; all product edits are in the isolated worktree named above.

## PR follow-up: remove unused Claude fallback

At the user's request, the dictionary server no longer reads `ANTHROPIC_API_KEY` or calls Anthropic. OpenRouter remains primary (with the bounded lookup retry); the existing Gemini fallback remains. Exhausted recovery returns an error. Credentials and deployed functions were not changed. The contract test now verifies that no Claude route exists and that failed recovery makes at most three attempts.

The raw evaluations and source manifests above are preserved byte-for-byte: they describe the measured version before this provider-removal change, including the historical Claude 401. They are not claimed as a new live benchmark of the final PR revision. Original audit files and local verification logs are preserved under `benchmarks/lookup-quality/evidence/`.

After Claude removal, `npm test`, `npm run www`, and `git diff --check` passed again. The new test/build logs and SHA-256 manifest are included in the evidence directory.
