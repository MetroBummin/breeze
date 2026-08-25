# READY — Milestone 1

READY는 Breeze 저장소 안에 있지만 리더와 별개로 배포되는 고려에듀 내부용 ORDER 학습 앱입니다.
브라우저에서는 `/ready/`를 엽니다.

## 처음 한 번

1. Supabase SQL Editor에서 `sql/ready_milestone_1.sql`을 실행합니다.
2. 학생을 SQL 파일 맨 아래 예시처럼 `ready_students`에 추가합니다.
3. `server/ready`를 이름 `ready`인 Edge Function으로 배포합니다. JWT 검증은 끕니다.
4. Edge Function secrets를 설정합니다.

```text
READY_TEACHER_KEY=<학원 공용 교사용 키>
READY_AI_PROVIDER=anthropic   # 또는 openai
READY_AI_MODEL=<사용할 모델 이름>
ANTHROPIC_API_KEY=<server only>
# OPENAI provider라면 OPENAI_API_KEY=<server only>
```

브라우저에는 기존 `config.js`의 공개 Supabase anon key만 들어갑니다. AI key와 service role은
Edge Function 환경변수에만 있으며, READY 테이블은 anon/authenticated 직접 접근을 허용하지 않습니다.

## 범위와 경계

- 교사: 세트 생성 → 지문/문장 저장 → ORDER AI 생성 → 수정/재생성/승인/삭제 → Publish
- 학생: 이름 선택 → 게시 세트 → 배열/제출/즉시 채점 → 다음 문제
- Review: completed/total, accuracy, 전체 시도, 반복 오답, 최근 시도, Passage별 오답 학생
- `questions.type = 'order'`로 시작하고 유형별 내용은 `payload`에 둡니다.
- Breeze의 reader, 파일 import, word lifecycle, sync/gesture 코드는 사용하지 않습니다.
