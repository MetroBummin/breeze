# READY Question Import Workflow

이 문서는 READY에 문제를 반영할 때의 source-of-truth workflow다. **PDF 문제 import, source metadata 처리, variant passage 처리, grading contract 변경, renderer 추가·수정 작업은 먼저 [QUESTION_TYPES.md](QUESTION_TYPES.md)와 이 문서를 읽는다.**

현재 READY에는 PDF parser, upload UI, AI 자동 추출 runtime이 없다. 따라서 이 문서는 향후 승인된 import 작업에서 사람이 준비한 structured data를 검증해 반영하는 기준이며, 지금의 20·21번 Multiple Choice MVP는 manual seed로 들어가 있다.

## Required flow

```text
PDF
↓
source exam 식별
↓
passage number 식별
↓
READY canonical Passage와 연결
↓
question type 분류
↓
prompt / choices / answer 추출
↓
source passage가 변형되었는지 확인
↓
필요하면 question-specific variant 생성
↓
answer/해설 대조
↓
preview/validation
↓
import
```

PDF 전체를 바로 반영하지 않는다. 먼저 작은 sample을 structured data로 만들어 Question → student render → submit → Attempt 저장까지 end-to-end로 검증한다. 이 검증이 통과한 뒤에만 같은 패턴의 나머지를 반영한다.

## Mandatory workflow

모든 READY Question 관련 작업은 다음을 지킨다.

1. `QUESTION_TYPES.md`를 먼저 읽는다.
2. import 작업이면 이 `QUESTION_IMPORT.md`도 읽는다.
3. 문제를 기존 family로 분류한다.
4. 가능한 경우 기존 renderer를 재사용한다.
5. Question에 맞추기 위해 canonical Passage를 절대 수정하지 않는다.
6. 변형된 source text는 question-specific variant로 저장한다.
7. 현재 contract에 없는 패턴이면 구현 전에 패턴을 문서화한다.
8. contract 변경은 같은 commit에서 문서도 함께 갱신한다.

## Passage matching and source metadata

PDF에서 확인 가능한 명시적 source metadata를 1순위로 사용한다. 예를 들어 `2026년 6월 · 고2 · 20번`은 먼저 시험명·학년·월·지문 번호로 READY Passage를 찾는다. AI나 fuzzy matching으로 먼저 추측하지 않는다. 텍스트 similarity는 이미 찾은 candidate가 맞는지 검증하는 2순위 수단일 뿐이다.

각 Question은 최소한 다음 논리 metadata를 잃지 않아야 한다.

```text
source_exam
source_passage_no
source_question_no
```

현재 구현에서는 이 값이 별도 column이 아니라 `ready_questions.payload.source` JSON 안에 보관된다.

```json
{
  "source": {
    "provider": "exam4you",
    "exam": "2026-06 부산 고2",
    "passage_no": 20,
    "source_question_no": 213
  }
}
```

즉 현재 저장 key의 대응은 `source_exam → source.exam`, `source_passage_no → source.passage_no`, `source_question_no → source.source_question_no`다. 새 import도 별도 schema를 만들지 않는 한 이 실제 payload shape를 유지한다. source metadata는 현재 server가 해석하거나 검증하지 않는 provenance record이므로, import preview에서 사람이 확인해야 한다.

## Question family and renderer decision

먼저 [QUESTION_TYPES.md](QUESTION_TYPES.md)의 family로 분류한다.

- 주제·제목·요지·목적·심경·내용 일치/불일치면 Standard Multiple Choice의 기존 `multiple_choice` renderer를 쓴다.
- 빈칸·함축의미·어법·어휘는 annotation이 실제로 필요한지 확인한다. raw HTML을 저장하지 않고 structured annotation payload가 정의되기 전에는 renderer를 새로 만들지 않는다.
- 문장 삽입·무관한 문장·글의 순서는 Structural family다. Standard renderer에 억지로 넣지 말고, 실제 variation을 충분히 모은 뒤 별도 presentation contract를 문서화한다.
- 요약문 완성·서술형도 문서의 기존 family와 renderer 기준을 먼저 따른다.

새 renderer와 새 schema는 마지막 수단이다. 같은 유형의 variation을 몇 개 확인해 공통 패턴을 먼저 찾는다.

## Canonical Passage and variants

`ready_passages`와 `ready_passage_sentences`가 canonical source다. Question import는 canonical Passage를 수정하거나 덮어쓰지 않는다.

문제마다 원문이 다음처럼 달라질 수 있다.

- 빈칸
- 어법 오류
- 어휘 치환
- 문장 삽입 marker
- A/B/C 순서 표기

이 경우 Question에만 귀속된 variant를 사용한다.

```text
variant 없음 → canonical Passage 렌더링
variant 있음 → question-specific variant 렌더링
```

현재 active `multiple_choice` contract의 variant는 plain `payload.variant_text`다. 이는 canonical을 바꾸지 않고 문제 화면에서 word lookup 가능한 variant를 표시한다. 단, sentence ID와 교사 translation 연결이 없으므로 plain variant에서는 sentence translation을 제공하지 않는다. 문장 interaction까지 필요한 variant는 실제 사례를 문서화한 뒤 stable segment/sentence reference를 보존하는 structured contract가 필요하다.

## Extraction, validation, and import checklist

반영 전에 다음을 확인한다.

1. prompt, choices, answer를 source PDF와 대조한다.
2. `source_question_no`와 정답/해설을 함께 대조한다.
3. canonical Passage 연결이 명시적 metadata와 맞는지 확인한다.
4. variant가 필요하면 canonical text와 variant text가 각각 정확한지 확인한다.
5. `multiple_choice`라면 `answer`를 zero-based index 배열로 저장하고, `multi_select`를 실제 선택 규칙에 맞춘다.
6. 공개 Question payload에 정답이 없는지 확인한다.
7. submit이 server deterministic grading을 거쳐 append-only `ready_attempts`에 저장되는지 확인한다.
8. 제출 전 lookup/translation/save가 막히고, 제출 후에만 허용되는지 확인한다.
9. import preview에서 source metadata, Passage title/ID, type, prompt, choices, answer, variant 여부를 사람이 확인한다.

Question source metadata를 잃거나 canonical Passage를 문제용으로 바꾸는 import는 허용하지 않는다.

## Current code differences to preserve

- PDF import API, parser, admin import UI는 현재 없다. 이 문서는 그런 기능을 암시하거나 요구하지 않는다.
- 현재 Question schema에는 source metadata 전용 column이나 variant table이 없다. source는 `payload.source`, active variant는 `payload.variant_text`다.
- `payload.source`는 seed/import provenance용이며 현재 Edge Function이 scope authorization이나 grading에 사용하지 않는다.
- 현재 활성 renderer는 `multiple_choice` 하나다. 다른 family를 문서에 넣었다고 구현된 것은 아니다.
