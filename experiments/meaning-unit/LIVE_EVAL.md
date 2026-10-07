# Smallest realistic live evaluation (not executed)

The checked release source pins `deepseek/deepseek-v4-flash-0731` on OpenRouter as primary and `gemini-3.5-flash-lite` as fallback (`server/dict/index.ts`). This describes repository configuration, not an independently verified deployed provider. Temperature is 0.2; reasoning is disabled. The primary route is POST `https://openrouter.ai/api/v1/chat/completions`. The existing app calls `${SB_URL}/functions/v1/dict`; its `explain` operation accepts a sentence, cuts input to 600 characters, asks only for `ko` with 600 output tokens, and cuts the result to 500 characters. It cannot carry the experimental prompt or return selected offsets/source. Sending experimental fixtures through it would not evaluate this design. No compatible permitted/unmetered selection endpoint was found.

Use an explicitly authorized isolated runner calling the same OpenRouter model directly, with a separately scoped test key injected by the operator. This needs no production route deployment or Supabase service-role key. It is a paid API route and is **not authorized yet**. Do not access existing provider secrets or sessions. If the parent instead supplies an explicitly permitted compatible test gateway, verify its model, response contract and cost scope first.

## Stage 1: 13 calls, one per reviewed fixture

Run one independent output for each existing synthetic fixture. Do not send `expected` spans/translations to the model, use an answer oracle, silently correct returned ranges, or auto-retry invalid answers. Use the actual `prepare(input).prompt`, plus Breeze's current bilingual JSON system prompt. Preserve all returned outputs and score them blindly against the reviewed source spans. Review Korean translations independently; the current stub translations are intentionally placeholders, not translation gold labels. The page-continuation source requires human review and should be scored as incomplete or an explicit insufficient-context answer. The long-output stub is a renderer stress case: judge the model's natural complete translation, not equality with the repeated placeholder Korean string.

Use model ID above; temperature 0.2; `reasoning.enabled=false`; `stream=false`; JSON response format; `provider.require_parameters=true`; `provider.allow_fallbacks=false`; no Gemini/model fallback; same throughput preference and `max_price` of $0.10 input/$0.30 output per million tokens. Log the provider actually chosen. Preflight availability and supported parameters without inference; fail closed if these constraints cannot be honored.

Bound each request to at most 6,000 input tokens (including system/message framing) and 4,096 output tokens, one inference attempt, a 30-second hard transport deadline, and no tools/search. Preflight the input with the verified tokenizer, or a documented conservative UTF-8 byte upper bound plus system/message overhead; if a trustworthy bound is unavailable, stop rather than claiming a hard token/cost ceiling. Truncation (`finish_reason=length` or other non-normal completion), errors, insufficient context and malformed JSON are recorded failures, not additional calls. Cancellation cannot guarantee zero provider charge.

At the enforced price ceilings, token charges are bounded by:

`13 × (6,000 × $0.10 + 4,096 × $0.30) / 1,000,000 = $0.0237744`

Recommend an operator-enforced **$0.05 total spending limit**, inclusive of any applicable fees, and a hard maximum of 13 requests. The inference estimate excludes account funding minimums, purchase fees, taxes and unrelated traffic; a dedicated key/budget avoids confusing those with this run. Check fees before authorization if they must fit the same limit.

As of October 7, the public model endpoint lists a DeepInfra route at $0.06 input/$0.18 output per million tokens and a Sail Research route at $0.10/$0.30, supporting relevant JSON/max-token parameters. Availability and prices can change. Public metadata was read; no inference request or credentials were used. Reverify immediately before a paid run. [Model endpoint metadata](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4-flash-0731/endpoints), [provider routing and price controls](https://openrouter.ai/docs/guides/routing/provider-selection#max-price).

## Stage 2: only after reviewing stage 1

If stage 1 warrants further evidence, separately authorize two additional outputs per fixture: **39 total calls including the first 13**, at the same limits. Maximum token charge estimate is $0.0713232; recommend a $0.10 total operator-enforced limit inclusive of fees. Three outputs per fixture reveal instability but do not establish broad accuracy or production p95 latency.

Record separately: exact source/tap validity; human-reviewed meaning-unit completeness; Korean fidelity/completeness; injection obedience; provider/finish reason; error status; token usage; actual billed cost; request latency. Compare baseline source selection with actual AI source selection, never with hand-built oracle output. Preserve every failure and context omission. Report per-case outcomes and measured median/range; p95 from 13–39 heterogeneous calls is only descriptive, not a production latency claim.

Parent decision needed before execution: approve the named model/direct route, 13-call maximum and $0.05 total budget, and arrange a scoped key or permitted gateway for the isolated runner. No paid work or credential access is included in this follow-up.
