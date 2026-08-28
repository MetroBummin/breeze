# READY Question Type Contract

이 문서는 READY의 Question 계약 기준이다. **Question과 관련된 모든 작업은 이 문서를 먼저 읽고**, import 작업이면 이어서 [QUESTION_IMPORT.md](QUESTION_IMPORT.md)도 읽는다. 현재 학생 runtime에서 활성화된 type은 `multiple_choice`뿐이다. 아래의 미래 유형은 구현 약속이 아니라, 실제 사례를 조사할 때 서로 다른 문제를 같은 renderer에 억지로 넣지 않기 위한 분류다.

## Mandatory workflow

Question 관련 작업은 다음 순서를 따른다.

1. 먼저 `QUESTION_TYPES.md`를 읽는다.
2. import 작업이면 `QUESTION_IMPORT.md`도 읽는다.
3. 문제를 기존 family 중 하나로 분류한다.
4. 가능한 경우 기존 renderer를 재사용한다.
5. Question에 맞추기 위해 canonical Passage를 수정하지 않는다.
6. 변형된 원문은 question-specific variant로 저장한다.
7. 현재 contract가 다루지 않는 새 패턴이면 구현 전에 패턴과 contract를 문서화한다.
8. contract가 바뀌면 같은 commit에서 두 문서를 함께 갱신한다.

## 공통 원칙

1. `ready_passages`와 `ready_passage_sentences`가 canonical source다.
2. Question은 canonical Passage나 PassageSentence를 수정하지 않는다.
3. 문제용 변형 지문은 `payload.variant_text` 또는 향후 검증된 structured variant로 별도 저장한다.
4. renderer 수는 가능한 한 적게 유지한다. `skill`이 다르다는 이유만으로 renderer를 추가하지 않는다.
5. 정답은 제출 전 학생 payload에 포함하지 않는다. `publicQuestion()`이 공개 필드만 반환한다.
6. 채점은 가능한 한 서버에서 deterministic하게 수행한다.
7. `ready_attempts`는 append-only raw event다. 오답을 정답 attempt로 덮어쓰지 않는다.
8. Question 진입은 곧 `solving` 시작이다. 현재 Home의 `문제풀기` 버튼이 시작 경계이므로 별도 시작 화면을 만들지 않는다.
9. `solving` 동안 word lookup, sentence translation, word/sentence save, 기존 저장 highlight를 비활성화한다.
10. 현재 문제를 제출해 `submitted`가 된 뒤에만 lookup, translation, save, highlight를 허용한다.
11. 제출 후에도 같은 문제 화면을 유지하고, READY가 축소 재사용한 Breeze lexical/sentence interaction layer로 바로 복습한다.
12. Question UI는 시험 중심의 compact prose이고 Reader UI는 학습 중심의 sentence card다.
13. 학생이 실제로 속한 현재 Exam/Scope와 Passage 관계를 서버가 검증한다. client가 보낸 `examId`만 신뢰하지 않는다.
14. Question authoring/import/AI 생성은 현재 runtime 범위가 아니다.

## 현재 상태 모델

| 상태 | 진입 | 선택/제출 | 단어·문장 학습 |
| --- | --- | --- | --- |
| `solving` | Home에서 `문제풀기` | 가능 | 불가, 기존 저장 highlight도 숨김 |
| `submitted` | 서버가 Attempt를 저장하고 채점 결과를 반환 | 답 변경 불가 | lookup, translation, save, highlight 가능 |

`before_start`용 별도 화면은 현재 만들지 않는다. `문제풀기` 클릭 전 Home이 그 역할을 하며, 불필요한 클릭과 상태를 추가하지 않는다.

## 실제 데이터 계약

### Database: `ready_questions`

| column | 역할 |
| --- | --- |
| `id uuid` | Question stable ID |
| `passage_id uuid` | canonical Passage FK |
| `type text` | 현재 활성값은 `multiple_choice` |
| `difficulty smallint?` | 선택 metadata. 현재 renderer 분기에 사용하지 않음 |
| `payload jsonb` | 문제별 구조와 server-only 정답 |
| `status text` | `draft` 또는 `available` |
| `generation integer` | 기존 generic Question 세대 값 |
| `created_at`, `updated_at` | 생성/수정 시각 |

현재 `multiple_choice` payload:

```json
{
  "skill": "topic",
  "prompt": "다음 글의 주제로 가장 적절한 것은?",
  "choices": ["...", "...", "...", "...", "..."],
  "answer": [1],
  "multi_select": false,
  "position": 1,
  "variant_text": null,
  "source": {
    "provider": "exam4you",
    "exam": "2026-06 부산 고2",
    "passage_no": 20,
    "source_question_no": 213
  }
}
```

- `answer`는 zero-based choice index 배열이며 server-only grading data다.
- single-select도 배열 하나로 표현한다. multi-select는 같은 renderer와 set 비교 채점을 사용한다.
- `variant_text`가 없으면 canonical PassageSentence를 사용한다.
- plain `variant_text`는 현재 word lookup만 지원한다. 문장 번역까지 필요하면 canonical sentence reference를 보존하는 structured variant가 먼저 설계되어야 한다.
- `source`는 현재 JSON metadata로 추적한다. import가 실제로 시작되기 전에는 별도 source table을 만들지 않는다.
- 현재 20·21번 seed는 `source.exam`, `source.passage_no`, `source.source_question_no`를 사용한다. 이는 import workflow의 논리적 `source_exam`, `source_passage_no`, `source_question_no`에 각각 대응한다. 아직 별도 DB column도 server-side metadata validation도 없다.

### Student public contract

`student_questions`는 다음만 반환한다.

```text
id, type, skill, prompt, choices, choiceTokens,
multiSelect, variantText?, variantTokens
```

`answer`와 다른 server-only payload는 반환하지 않는다.

`submit_attempt` 입력:

```json
{
  "examId": "uuid",
  "questionId": "uuid",
  "selected": [1],
  "elapsedMs": 12400
}
```

서버는 학생 세션, 현재 Scope, Passage 연결, Question 상태, 선택 개수를 다시 검증한 뒤 `ready_attempts`에 다음을 append한다.

```text
student_id, question_id, exam_id,
response = { selected }, correct, elapsed_ms, created_at
```

## A. Standard Multiple Choice — 활성

대상:

- 주제, 제목, 요지, 목적, 심경
- 내용 일치, 내용 불일치

공통 UI:

```text
prompt
compact passage prose
compact inline choices
submit
feedback + submitted review interactions
```

renderer는 `multiple_choice` 하나다. `skill`은 분석/분류 metadata이며 UI renderer를 나누지 않는다. `multi_select`만 radio-like/checkbox-like selection behavior를 데이터로 바꾼다.

## B. Annotated Multiple Choice — 미구현

대상:

- 빈칸
- 함축 의미
- 어법
- 어휘

기본 뼈대는 Standard Multiple Choice와 같지만 Passage의 특정 영역에 annotation이 필요하다. 예: blank, underline, labeled span, A/B choice. raw HTML은 DB에 저장하지 않는다. 실제 문제 사례를 더 조사한 후 start/end offset, stable token/segment reference, label, options 중 최소 structured annotation payload를 선택한다.

## C. Structural Questions — 미구현

대상과 별도 UI 요구:

- 문장 삽입: 주어진 문장 block과 insertion points
- 무관한 문장: sentence marker와 sentence selection
- 글의 순서: intro, A/B/C blocks, order choices 또는 ordering interaction

Standard Multiple Choice renderer에 억지로 넣지 않는다. 특히 과거 ORDER milestone 코드를 현재 runtime으로 되살리지 않는다.

## D. Summary Completion — 미구현

요약문 block, blank slots, paired choices 또는 structured answer가 필요하다. Question/Attempt 기반은 공유할 수 있지만 presentation은 실제 사례를 확인한 뒤 별도 renderer가 될 수 있다.

## E. Written Response — 미구현

대상:

- 영작
- 배열
- 어법 고쳐쓰기
- 조건형 서술형

deterministic grading이 가능한 형태부터 검토한다. free-response AI grading을 기본 전제로 두지 않는다.

## Renderer 추가 체크리스트

1. 기존 renderer와 정말 다른 interaction인가?
2. canonical Passage를 수정하지 않는가?
3. raw HTML 없이 구조를 표현하는가?
4. 제출 전 공개 payload에서 정답이 제거되는가?
5. server deterministic grading과 append-only Attempt가 가능한가?
6. `solving`/`submitted` lookup gate를 공통으로 지키는가?
7. desktop/mobile에서 같은 의미의 interaction을 제공하는가?
8. Breeze lexical layer를 재사용하고 별도 dictionary를 만들지 않는가?
9. contract test와 실제 공개 E2E가 추가됐는가?
