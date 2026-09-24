# Article Preview OpenRouter local evaluation — 2026-09-25

## Scope and limits

The Article Preview generator was changed from direct Gemini to the same OpenRouter request pattern and model ID used by Breeze's dictionary Edge Function: `deepseek/deepseek-v4-flash-0731`. The provider, prompt, validator, and response contract in `supabase/functions/article-preview/generate.mjs` were called from Node with real OpenRouter traffic. The 18 inputs are public RSS articles saved in `/tmp/breeze-article-preview-e2e-corpus-20260925.json`.

This is **AI-only quality verification**, not an Edge Function, local DB, shared cache, Auth, RSS click, or browser E2E. Two attempts to start an isolated Supabase stack exhausted local disk. The second began with about 12 GB free, but the CLI also pulled Realtime during schema initialization despite service exclusions; extraction failed with an I/O error when free space reached about 156 MB. No production Supabase project was changed. The failed VM and its download were removed. The existing Preview UI was not changed.

## Calls and latency

- 18 distinct articles requested once each; 17 returned validated metadata, 1 failed the numeric grounding check (`unsupported_number`). There were no retries.
- Successful calls: 8,083 input and 2,964 output tokens reported by OpenRouter. Token usage for the rejected response was not captured, so this is a lower bound for all 18 calls.
- Successful call latency: 3,525–10,697 ms; median 4,778 ms. The first article took 3,747 ms. These are local AI-only measurements, not Preview or production latency.
- No cache-hit latency or server AI call-count evidence is available without the local DB/function stack.

## Existing UI fallback and browser verification

The unchanged `scripts/library/article-preview.js` opens the Preview dialog and fills the original title and opening excerpt before requesting metadata. Its metadata request returns `null` on offline, missing Supabase config, HTTP failure, timeout, and fetch failure; the `읽기 시작` button remains wired to the existing Reader entry. This is a code-path inspection, not a successful end-to-end fallback demonstration in this run.

The existing `tests/verify-article-preview-browser.mjs` was attempted twice with installed Playwright dependencies. Both runs timed out at `page.goto(..., waitUntil: 'domcontentloaded')` before any Preview assertion. A minimal Playwright `data:` page did load, so the browser executable itself was available. The full UI regression and actual fallback behavior remain unverified in this run.

## Manual quality review

Judgments compare each output with the title and excerpt actually sent to the model. “Risk” means wording that should be edited or further checked; it is not a claim that the entire article is false.

| # | Source | Hook / result | Review |
|---|---|---|---|
| 1 | The Conversation | AI 에이전트가 메디케어를 해킹했다… 책임은 누구에게? | Mostly grounded; teaser's “개인 통계 데이터” risks implying personal medical data, which the source expressly distinguishes. |
| 2 | The Conversation | 신임 UN 사무총장, 신뢰 위기와 파산 위험 속 '초대형 과제' | Grounded, but “막중한 도전” and “암울한 현실” read like generic translated editorial copy. |
| 3 | The Conversation | 브라질 대선, 조용한 디지털 캠페인 속 불확실성 증대 | Grounded but very close to an ordinary summary; weak hook. |
| 4 | The Conversation | 파키스탄 모스크 테러, 국경 너머의 위기 | Grounded and readable. |
| 5 | The Conversation | 독일 극우의 은밀한 상징: 금지된 나치 기호를 우회하는 법 | Grounded and specific. |
| 6 | The Conversation | 후세인이 제임스 본드 감독과 올리버 리드를 고용한 이유 | Grounded and engaging. |
| 7 | ProPublica | 트럼프의 문화 전쟁, 스미스소니언을 겨냥하다 | Grounded; “이념적 포로” in teaser is unnatural Korean. |
| 8 | ProPublica | 콜린스, '오보'라며 부인했지만... 사실은? | **Factual wording error:** source says she dismissed the reporting as “old news,” not that she called it an “오보.” |
| 9 | ProPublica | 소비자 보호 기관의 충격적인 결정: 불만 신고 공개 중단 | Grounded event, but “충격적인” is unsupported sensational packaging. |
| 10 | ProPublica | 콜린스 상원의원을 둘러싼 부패 스캔들, 트럼프가 개입했다 | Grounded in title/excerpt. |
| 11 | ProPublica | 그림자 재판부: 대법원의 숨겨진 권력 행사 | The source discusses the shadow docket; “숨겨진 권력 행사” overdramatizes the mechanism. |
| 12 | ProPublica | 러시아 부호의 텔레그램 영상, 트럼프 주니어 결혼식의 비밀을 밝히다 | Grounded in excerpt; slightly tabloid phrasing. |
| 13 | NASA | 북서부를 덮은 구름의 장막 | Faithful but little added curiosity beyond the source title. |
| 14 | NASA | `unsupported_number` | No metadata accepted. Numeric grounding validator blocked this result. It may also reject digits that paraphrase source number words; raw rejected text was not retained. |
| 15 | NASA | NASA 기술, 바다 한가운데서 구조 신호를 울리다 | Grounded and readable. |
| 16 | NASA | 아낙 크라카타우, 24시간 폭발…수천 편의 항공편 중단 | The 24-hour eruption and thousands of disrupted flights both appear in the supplied excerpt. |
| 17 | NASA | NASA, 달 기지 건설 위한 기술 제안 공모 시작 | Grounded but plain. |
| 18 | NASA | NASA 기술로 고대 벽화의 숨겨진 그림을 발견하다 | Grounded and readable. |

The main quality issues are 3 bland hooks (#3, #13, #17), 2 overly dramatic hooks (#9, #11), 1 clear meaning change (#8), 1 personal-data nuance (#1), and 2 translationese/cliché teasers (#2, #7). Some articles have more than one issue.

## Prompt changes and focused follow-up

The 18 outputs above were generated with the original prompt. The PR follow-up changed the prompt to preserve the source's certainty, speaker, quantity, and meaning; avoid unsupported intensifiers and numerical claims; and request more natural Korean. The original 18 results remain a baseline, not results of the revised prompt.

The final prompt was run on 11 selected corpus items (#1, #2, #3, #6, #7, #8, #9, #11, #13, #14, #17), once each. Eight returned accepted metadata and three hit `unsupported_number`. The accepted calls took 2,965–5,994 ms. No prompt run was retried as if it were a cache hit. The #13 failure was traced to a faithful `September 19` → `9월 19일` date translation: the validator recognized source digits but not the English month name. The validator now recognizes a month number only when that named month appears with a day in the source; a mock test accepts September → 9 and rejects September → 12. A fresh #13 call then passed in 4,208 ms. Separate focused runs of #14 and #17 also passed, so their numeric failures were variable model outputs, not a permanent inability to preview those articles. Rejected metadata still falls back to the original preview.

The original meaning change `old news` → `오보` did not recur in the final #8 sample. #9 no longer uses the unsupported adjective `충격적인`; #11 no longer says the court exercises “hidden power.” #7's hook stayed with the title's Smithsonian conflict instead of assigning the exhibit's conjecture to the White House. Remaining quality limits are visible: #3's “결과를 흔든다” is stronger than the source's uncertainty, #6 uses vague dramatic wording, #7's “이념적 포획” remains translationese, and #8's hook can imply more of Collins's response was false than the source's “some.” Prompt constraints and numeric validation reduce risk but do not prove every future generation is factually faithful.

The evaluated corpus and outputs live in local `/tmp` files and are not committed. The script accepts `--indices=1,8,9` for a bounded rerun; each run replaces `/tmp/breeze-article-preview-ai-prompt-targeted-20260925.json`.

## PR-stage browser and regression checks

The Playwright test initially timed out at `DOMContentLoaded`. A diagnostic local server showed several checkout files taking over a second to read, with one RSS script taking about 18 seconds. Raising the navigation limit from 30 to 120 seconds let the existing test complete. It passed in Chromium and WebKit at 320, 390, 820, and 1280 px: first-read Preview, centered layout without inner scrolling, local metadata reuse, Reader entry, previously-read Reader bypass, and source-only fallback after an aborted metadata request.

A separate one-shot browser run routed an actual Preview request to the same OpenRouter generator, using the browser's own title and opening excerpt. The generated Korean hook and teaser appeared beside the original title; closing and reopening caused no second AI call; `읽기 시작` entered Reader and subsequent entry bypassed Preview. The model took 4,433 ms. This proves real AI generation and browser display together, but the HTTP route was intercepted: the Supabase Edge Function, shared database cache, Auth, and quota RPC were not exercised.

`npm run typecheck` passed with 37 existing diagnostics unchanged. `verify-reader-progress-browser.mjs` passed its 1, 5, and 70 paragraph cases. `verify-home-controls-browser.mjs` passed five widths in light and dark. The Preview client request timeout was increased from 9 to 15 seconds because the original 18-call evaluation included a valid 10.7 second AI response; the Edge generator itself has a 12 second timeout. No Preview CSS, Home layout, or Reader UI changed.

Before integration, run one isolated dev/test Supabase E2E through the actual Edge Function and migration: new RSS article → shared cache miss → OpenRouter metadata → Preview display → Reader → same article from another session/device → shared cache hit, plus a forced AI failure. This remains unverified. Do not treat the intercepted browser route or local cache as proof of server cache/Auth/RPC behavior.

## Reproduce the AI-only evaluation

Store the key in the gitignored `supabase/.env.article-preview.local` file using hidden terminal input. Then run `node tools/evaluate-article-preview-ai.mjs` for a single article. Run `node tools/evaluate-article-preview-ai.mjs --remaining` only after the first succeeds; that evaluates the other 17 without repeating the first. Results are written under `/tmp` with mode `0600` and contain no API key.

Shared cache, Auth, quota RPC, and fallback after a real Edge Function error remain separate integration checks immediately before rollout. The isolated `/tmp/breeze-article-preview-local-20260925` configuration and migrations were prepared, but its container stack did not complete startup. The local VM was removed after the disk failure. No additional VM or image work is planned in this evaluation.
