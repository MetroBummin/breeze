# READY Question Import Workflow

이 문서는 PDF를 private structured Question bundle로 바꾸고 READY에 원자적으로 반영하는 절차다. 콘텐츠 추출은 teacher-side에서 수행하며 READY 학생/Admin UI에 PDF parser나 AI pipeline을 넣지 않는다.

## Required flow

```text
PDF
→ source exam / Section / source question number 확인
→ source passage number 확인
→ READY canonical Passage ID 연결
→ Question family 분류
→ canonical / variant 결정
→ prompt / choices 또는 response slots 추출
→ 뒤쪽 정답·해설과 대조
→ private JSON bundle dry-run
→ atomic import
→ student solve / Attempt / Review E2E
```

명시적 시험·지문 번호를 identity로 사용한다. 텍스트 similarity는 연결 후 검증용일 뿐이며 fuzzy/AI matching을 우선하지 않는다.

## Private bundle

문제 본문, 보기, 정답이 포함된 bundle은 공개 저장소에 커밋하지 않는다. 저장소에는 contract와 source-number inventory만 둔다.

각 row:

```json
{
  "passage_id": "canonical READY Passage UUID",
  "type": "multiple_choice",
  "status": "available",
  "payload": {
    "family": "annotated",
    "skill": "grammar",
    "prompt": "...",
    "choices": ["..."],
    "answer": [2],
    "multi_select": false,
    "variant_segments": [],
    "position": 11,
    "source": {
      "provider": "exam4you",
      "exam": "2026-06 부산 고2 예상문제",
      "passage_no": 20,
      "source_question_no": 11,
      "section": "1"
    },
    "source_kind": "textbook_main"
  }
}
```

`passage_id + exam + passage_no + source_question_no + section`이 import identity다. 같은 identity를 다시 import하면 새 Question을 중복 생성하지 않고 기존 row를 갱신한다.

## Validation

1. canonical Passage ID가 명시적 `source.passage_no`와 맞는지 확인한다.
2. prompt와 모든 choice를 문제 쪽과 대조한다.
3. `answer` 또는 `accepted_answers`를 정답/해설 쪽과 대조한다.
4. single/multi를 문제 지시문과 대조한다.
5. canonical 문제는 variant를 넣지 않는다.
6. 문제용 변형은 `variant_text`, `variant_segments`, `content_blocks` 중 최소 표현을 사용한다.
7. raw HTML을 payload에 넣지 않는다.
8. Passage 25 chart처럼 외부 asset이 없으면 `draft`로 유지한다.
9. public response에 `answer`/`accepted_answers`가 없는지 contract test로 확인한다.
10. 교과서 bundle은 본문 일치 검증 후 `source_kind`를 넣고, 대화문과 본문 외
    자료는 각각 `dialogue`, `supplemental`로 보존하되 학생 풀이에서 제외한다.

Dry-run:

```bash
npm run ready:import -- /absolute/path/to/private-bundle.json
```

Apply에는 runtime 환경변수가 필요하다. 값은 명령행, JSON, Git, 로그에 넣지 않는다.

```bash
READY_API_URL=... READY_ADMIN_PASSWORD=... \
  npm run ready:import -- /absolute/path/to/private-bundle.json --apply
```

서버는 admin session을 만든 뒤 `ready_import_question_bundle` RPC 하나로 bundle 전체를 transaction 처리한다. 한 row라도 검증에 실패하면 전체 import가 rollback된다.

## E2E acceptance

1. Passage 목록의 Question count가 import 수와 일치한다.
2. standard, annotated, structural, summary, written 대표 문제를 mobile/desktop에서 푼다.
3. 제출 전 network payload에 정답이 없다.
4. 제출 후 `ready_attempts`에 새 row가 하나 추가된다.
5. 일부러 오답 제출 → `복습 문제` count 증가 → 복습에서 재풀이 → 정답 제출 → queue에서 제거를 확인한다.
6. generated fixture 1~2개도 같은 import RPC와 renderer를 사용한다. `ready/fixtures/generated-question-smoke.json`은 contract 예시이며 실제 Passage ID로 바꾸기 전에는 import하지 않는다.

## 18~28 status

- 조사: 137문항 완료.
- contract 표현 가능: 137문항.
- private asset 없이 import 가능: 136문항.
- Passage 25 source question 32는 라이선스가 보존된 graph asset 또는 structured chart representation이 필요하다.
- 상세 inventory: `ready/inventory/2026-06-busan-18-28.md`.
