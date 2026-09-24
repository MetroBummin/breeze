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

## Prompt improvements proposed, not applied

The 18 outputs above were generated with the current prompt. Changing it now would invalidate this sample, so these are recommendations for a later bounded A/B run:

1. Require the hook to preserve the **strength and attribution** of each claim. A source describing a rebuttal as “old news” must not become a claim of “오보”; a possibility or allegation must not become a confirmed event.
2. Ban empty intensifiers such as “충격적인,” “초대형,” and “숨겨진” unless the supplied title or excerpt specifically justifies them. Ask for concrete curiosity through the article's actors, question, or consequence instead.
3. Ask for two natural Korean teaser sentences without generic scaffolding such as “이 기사는 … 설명합니다” or “확인하세요.” Translate names and technical terms faithfully, and avoid stock phrases such as “막중한 도전.”
4. Require a final self-check against the supplied title and excerpt for invented numbers, trends, causes, and quotations. The existing numeric validator remains useful, but the rejected #14 response was not retained, so its specific cause cannot be diagnosed from this run.

Proposed added instruction: “Write a short, specific Korean hook and two natural teaser sentences. Keep the source's level of certainty and attribution. Never strengthen ‘possible’, ‘alleged’, ‘old news’, or similar wording into a confirmed event or an accusation of false reporting. Do not add sensational adjectives or a number unless the source supports them. Before returning JSON, compare every concrete claim with the supplied title and excerpt.”

## Reproduce the AI-only evaluation

Store the key in the gitignored `supabase/.env.article-preview.local` file using hidden terminal input. Then run `node tools/evaluate-article-preview-ai.mjs` for a single article. Run `node tools/evaluate-article-preview-ai.mjs --remaining` only after the first succeeds; that evaluates the other 17 without repeating the first. Results are written under `/tmp` with mode `0600` and contain no API key.

Shared cache, Auth, quota RPC, actual RSS click, Preview rendering of real metadata, and fallback after a real Edge Function error remain separate integration checks immediately before rollout. The isolated `/tmp/breeze-article-preview-local-20260925` configuration and migrations were prepared, but its container stack did not complete startup. The local VM was removed after the disk failure. No additional VM or image work is planned in this evaluation.
