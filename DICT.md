# Breeze 사전은 어떻게 움직이나

## 한 줄 요약

낱말을 누르면 Breeze는 **그 낱말이 들어 있던 문장**을 함께 보고 현재 문맥의 뜻을 정합니다.
처음 보는 lexical item은 DeepSeek가 직접 분석하고, 이미 저장한 item을 다른 문장에서 다시
만났을 때만 Jev가 **저장된 Meaning을 그대로 재사용할 수 있는지** 고릅니다.

## 조회 흐름

```text
낱말 선택
  → 같은 문장 캐시가 있으면 즉시 사용
  → 처음 보는 문맥이면 DeepSeek mini lookup
     → word / expression
     → canonical
     → 현재 문장의 member token indexes
     → 짧은 한국어 뜻
  → 영어 사전 메타데이터(발음·음성·영어 정의)는 별도로 보완

이미 저장한 lexical item을 다른 문장에서 다시 선택
  → Jev
     → meaning_1 / meaning_2 / ... / AI_REQUIRED
     → 저장 Meaning 선택: DeepSeek 호출 없이 즉시 재사용
     → AI_REQUIRED 또는 Jev 실패: DeepSeek mini lookup

작은 뜻 필을 눌러 상세창 열기
  → detail cache가 있으면 즉시 표시
  → 없으면 DeepSeek detail lookup
     → 품사 + 짧은 한국어 gloss
```

### DeepSeek의 역할

DeepSeek가 lexical analysis의 유일한 생성 엔진입니다.

Mini lookup은 다음 네 필드만 만듭니다.

```json
{"kind":"word","canonical":"yield","members":[7],"ko":"양보하다"}
```

또는 표현이라면:

```json
{"kind":"expression","canonical":"give up","members":[4,8],"ko":"포기하다"}
```

- 기본값은 **word**입니다. 단일 단어 뜻만으로 현재 의미를 충분히 정확하게 전달할 수 있으면
  expression으로 올리지 않습니다.
- phrasal verb, idiom, fixed expression처럼 여러 단어를 하나로 보지 않으면 의미가 달라지거나
  중요한 lexical identity를 잃을 때만 expression으로 처리합니다.
- `canonical`은 저장할 표제형입니다.
- `members`는 **현재 문장에서 색칠할 lexical member token**입니다. 저장 표제어를
  `members`를 이어 붙여 만들지 않습니다.
- 연속된 표현 안의 `of`, `to`, `at` 같은 function word가 lexical identity의 일부라면
  빼지 않습니다.
- 분리 가능한 구동사의 목적어·변수는 member가 아닙니다. 예: `gave the plan up`은
  `give/up`만 member이고 저장 표제어는 `give up`입니다.
- Mini lookup에서는 긴 gloss·다른 뜻 후보·설명을 만들지 않습니다.

### Jev의 역할

Jev는 **saved Meaning selector + AI-call gate** 하나만 담당합니다.

입력은 현재 문장과 이 기기에 이미 저장된 Meaning 후보입니다. 선택지는:

```text
meaning_1
meaning_2
...
AI_REQUIRED
```

- 기존 Meaning 하나를 그대로 보여 줘도 충분히 정확하면 그것을 고릅니다.
- ordinary collocation이나 의미가 그대로 합쳐지는 전치사 결합이라는 이유만으로
  `AI_REQUIRED`를 남발하지 않습니다.
- 다른 sense이거나, 더 큰 lexical expression의 일부라서 기존 단어 뜻만 보여 주면 의미를
  오해하거나 중요한 lexical identity를 잃을 때는 `AI_REQUIRED`를 고릅니다.
- Jev는 expression 범위, token membership, canonical, 한국어 뜻을 생성하지 않습니다.
- OEWN/영영 sense DB와 lazy Korean translation 경로는 사용하지 않습니다.

## 저장 모델

lexical identity와 문장 annotation을 분리합니다.

```text
Lexical Item
canonical: give up

Meaning
ko: 포기하다

Context
sentence: He gave the whole plan up.
members: [gave, up]
```

비연속 표현은 기존 저장 포맷인 `phraseParts`와 `phraseGaps`로 보존합니다.
이 포맷은 Jev용이 아니라 Text/PDF/EPUB에서 같은 표현을 색칠하기 위한 문장 annotation입니다.

## 화면에서 할 수 있는 것

- 작은 필에는 현재 뜻 하나만 빠르게 보여 줍니다.
- 필을 눌러 상세창에 들어갈 때만 품사·gloss를 lazy-load합니다.
- IPA·음성·영어 정의는 `api.dictionaryapi.dev`에서 별도로 받으며 한국어 뜻을 결정하지 않습니다.
- 뜻에 필요한 손짓은 만들기(＋) · 고르기(칩) · 지우기(×)입니다.
- 사용자가 직접 만든 뜻을 AI가 덮어쓰지 않습니다.
- 낱말을 길게 누르는 문장 해석은 word lookup과 별개의 기능입니다.

## 로그인과 한도

| 기능 | 로그인 전 | 로그인 후 |
| --- | --- | --- |
| 영어 사전 메타데이터·기기 단어장 | 가능 | 가능 |
| AI 낱말 뜻/상세 | 기기당 체험 횟수 안에서 가능 | 서버 설정 하루 한도 안에서 가능 |
| 문장 전체 설명 | 불가 | 같은 AI 사용량 풀에서 더 높은 비용으로 차감 |
| 기기 간 동기화 | 불가 | 가능 |

로그인 전 AI 체험 횟수는 서버 설정 `AI_ANON_FREE`로 정하며 기본값은 10회입니다.
로그인 후 기본 일일 풀은 서버의 `AI_DAILY_LIMIT`/기본값으로 관리됩니다.

## 무엇이 어디에 남나

### 기기 안

- 문맥별 mini lookup 캐시
- Meaning별 detail cache
- 영어 사전 메타데이터
- 단어장: lexical item, 뜻, 별표, 예문, 책 제목
- 사용자가 직접 만든 뜻

### Breeze 서버와 AI 제공자

처음 보는 문맥이나 `AI_REQUIRED`에서는 낱말, 문장(최대 600자), token 목록과 클릭 token
index가 생성 AI 제공자에게 전달됩니다.

저장한 lexical item을 다른 문장에서 만났을 때는 현재 문장과 이 기기에 저장된 Meaning
후보가 Breeze 서버를 거쳐 TypeSafe(Jev)에 전달됩니다. Jev에는 expression membership을
찾기 위한 token-by-token 질문을 보내지 않습니다.

상세창을 처음 열어 gloss가 필요할 때는 저장된 canonical, 한국어 Meaning, 최초 예문이
생성 AI 제공자에게 전달됩니다.

Breeze 서버는 문장 본문이나 Meaning 후보를 공용 사전 데이터로 저장하지 않습니다.
운영·한도 확인을 위해 호출 종류, 제공자/모델, 성공 여부, 응답 시간, 토큰 사용량은
남을 수 있습니다.

로그인한 단어장과 읽던 자리는 기기에서 암호화되어 동기화됩니다. 자세한 데이터 처리는
[PRIVACY.md](PRIVACY.md)를 봐 주세요.

## 구현의 경계

- DeepSeek = lexical intelligence.
- Jev = saved Meaning selector + AI-call gate.
- Mini pill = 최소 생성.
- Detail = lazy enrichment.
- `dictionaryapi.dev` = IPA·음성·영어 정의 metadata only.
- OEWN/Breeze Lexicon/lazy Korean repair = lookup critical path에 없음.
- 같은 문장 캐시는 네트워크보다 먼저 확인합니다.
- 늦게 도착한 답은 닫힌 lookup을 다시 열거나 화면을 조종할 수 없습니다.

## 관련 코드

| 위치 | 역할 |
| --- | --- |
| `scripts/dictionary/dictionary.js` | mini lookup, Jev selector, detail cache, 단어장 |
| `scripts/dictionary/sentence.js` | 꾹 누르기 · 문장 해석 창 |
| `server/dict/index.ts` | DeepSeek/Jev 요청, 한도 |
| `server/dict/telemetry.ts` | 제공자 latency/token telemetry |
| `sql/supabase_dict.sql` | AI 사용량 테이블 |
