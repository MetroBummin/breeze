# Breeze 사전은 어떻게 움직이나

## 한 줄 요약

처음 보는 lexical item은 DeepSeek가 문맥을 보고 분석합니다.
같은 문장의 같은 단어 위치에서 확인한 Meaning은 기기에서 즉시 재사용합니다.
처음 만나는 문맥은 같은 짧은 AI lookup으로 확인합니다.

## 조회 흐름

```text
처음 보는 낱말 선택
  → 같은 문장 cache가 있으면 즉시 사용
  → 없으면 DeepSeek mini lookup
     → word / expression
     → canonical
     → 현재 문장의 member token indexes
     → 짧은 한국어 뜻
  → 영어 사전 metadata(발음·음성·영어 정의)는 별도로 보완

이미 저장한 lexical item을 다시 선택
  → 확인한 문장/단어 위치면 저장 Meaning 즉시 표시
  → 새 문맥이면 DeepSeek mini lookup 한 번
  → 다시 찾기는 현재 문장과 앞뒤 문장으로 재확인

작은 뜻 필에서 상세창 열기
  → 저장된 짧은 한국어 Meaning을 그대로 표시
  → IPA·음성·영어 정의는 dictionaryapi.dev metadata를 사용
  → 추가 AI 호출 없음
```

### DeepSeek의 역할

DeepSeek가 lexical analysis의 생성 엔진입니다.

Mini lookup은 다음 네 필드만 만듭니다.

```json
{"kind":"word","canonical":"yield","members":[7],"ko":"양보하다"}
```

또는 표현이라면:

```json
{"kind":"expression","canonical":"give up","members":[4,8],"ko":"포기하다"}
```

- 먼저 문맥 안의 고정 표현을 확인합니다. 숙어를 짧게 번역할 수 있어도 단어로 쪼개지 않습니다.
  일반 수식어나 의미가 그대로 합쳐지는 전치사 결합은 word입니다.
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

## 저장된 Meaning 재사용

- 같은 문장과 같은 클릭 위치에서 확정된 Meaning은 즉시 보여 줍니다.
- 새 문맥은 한 번 분석해 저장된 같은 뜻을 재사용하거나 새 Meaning을 만듭니다.
- 미니필과 상세창의 다시 찾기는 모두 현재 문장과 앞뒤 한 문장을 입력으로 사용합니다.
- 캐시는 문장뿐 아니라 클릭 위치와 계약 버전을 구분합니다.
- 단어 전체 빼기는 모든 뜻을 함께 지우며, 뜻 하나의 삭제와 구분합니다.
- 자동 분석은 지운 뜻을 되살리지 않고 표현 분석도 직접 수정한 뜻을 덮어쓰지 않습니다.

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
이 포맷은 Text/PDF/EPUB에서 같은 표현을 색칠하기 위한 문장 annotation입니다.

## 화면에서 할 수 있는 것

- 저장한 뜻은 작은 필에서 즉시 보여 줍니다.
- 처음 보는 문장/단어 위치나 사용자가 다시 찾기를 요청한 경우에만 AI mini lookup을 기다립니다.
- 필을 눌러 상세창에 들어가도 별도의 AI lookup을 시작하지 않습니다.
- IPA·음성·영어 정의는 `api.dictionaryapi.dev`에서 별도로 받으며 한국어 뜻을 결정하지 않습니다.
- 외부 사전으로 보내는 링크는 제공하지 않습니다.
- 뜻에 필요한 손짓은 만들기(＋) · 고르기(칩) · 지우기(×)입니다.
- 사용자가 직접 만든 뜻을 AI가 덮어쓰지 않습니다.
- 낱말을 길게 누르는 문장 해석은 word lookup과 별개의 기능입니다.

## 로그인과 한도

| 기능 | 로그인 전 | 로그인 후 |
| --- | --- | --- |
| 영어 사전 metadata·기기 단어장 | 가능 | 가능 |
| AI 낱말 뜻 | 기기당 체험 횟수 안에서 가능 | 서버 설정 하루 한도 안에서 가능 |
| 문장 전체 설명 | 불가 | 같은 AI 사용량 풀에서 더 높은 비용으로 차감 |
| 기기 간 동기화 | 불가 | 가능 |

로그인 전 AI 체험 횟수는 서버 설정 `AI_ANON_FREE`로 정하며 기본값은 10회입니다.
로그인 후 기본 일일 풀은 서버의 `AI_DAILY_LIMIT`/기본값으로 관리됩니다.

## 무엇이 어디에 남나

### 기기 안

- 문맥별 mini lookup cache
- 영어 사전 metadata
- 단어장: lexical item, 뜻, 별표, 예문, 책 제목
- 사용자가 직접 만든 뜻

기존 기기에 남아 있는 `ai.note`/`ai.gloss` 또는 과거 detail cache는 파괴적으로
마이그레이션하지 않습니다. 새 런타임은 이 값을 읽거나 표시하거나 새로 만들지 않습니다.

### Breeze 서버와 AI 제공자

처음 보는 문맥이나 새 뜻 찾기에는 낱말, 현재 문장(클릭 위치 중심 최대 2400자),
token 목록과 클릭 token index가 생성 AI 제공자에게 전달됩니다. 재시도는 앞뒤 한 문장을
각각 최대 400자까지 추가합니다. 출력은 기존 네 필드와 짧은 뜻 하나를 유지합니다.

확인한 문장/위치의 Meaning을 다시 보여 주는 것만으로는 문장이나 Meaning 후보를
외부 판정 제공자에게 보내지 않습니다.

Breeze 서버는 문장 본문이나 Meaning 후보를 공용 사전 데이터로 저장하지 않습니다.
운영·한도 확인을 위해 호출 종류, 제공자/모델, 성공 여부, 응답 시간, 토큰 사용량은
남을 수 있습니다.

로그인한 단어장과 읽던 자리는 기기에서 암호화되어 동기화됩니다. 자세한 데이터 처리는
[PRIVACY.md](PRIVACY.md)를 봐 주세요.

## 구현의 경계

- DeepSeek = lexical intelligence.
- Saved Meaning reuse = local-only.
- Mini pill = 최소 생성.
- Detail popup = 이미 가진 Meaning과 dictionaryapi.dev metadata만 표시.
- `dictionaryapi.dev` = IPA·음성·영어 정의 metadata only.
- OEWN/Breeze Lexicon/lazy Korean repair = lookup critical path에 없음.
- 같은 문장 cache는 네트워크보다 먼저 확인합니다.
- 늦게 도착한 답은 닫힌 lookup을 다시 열거나 화면을 조종할 수 없습니다.

## 관련 코드

| 위치 | 역할 |
| --- | --- |
| `scripts/dictionary/dictionary.js` | mini lookup, local Meaning reuse, 단어 상세창, 단어장 |
| `scripts/dictionary/sentence.js` | 꾹 누르기 · 문장 해석 창 |
| `server/dict/index.ts` | DeepSeek/fallback 요청, 한도 |
| `server/dict/telemetry.ts` | 제공자 latency/token telemetry |
| `sql/supabase_dict.sql` | AI 사용량 테이블 |
