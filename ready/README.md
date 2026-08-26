# READY — ORDER Milestone 1

READY는 Breeze 저장소 안에서 UI 토큰만 공유하는 고려에듀 내부용 웹앱입니다.

- 학생: `/ready/`
- 관리자: `/ready/admin/`
- 서버: READY 전용 Supabase 프로젝트의 `ready` Edge Function

## 인증 구조

- 학생 PIN은 PostgreSQL `pgcrypto`의 bcrypt 해시만 DB에 저장합니다.
- 관리자 비밀번호는 `READY_ADMIN_PASSWORD` Supabase Secret에서만 읽습니다.
- 로그인 성공 시 256-bit opaque session token을 한 번 반환하고 DB에는 SHA-256만 저장합니다.
- 학생 세션은 자기 `student_id`에 고정됩니다. 문제 조회·attempt 저장 API는 client의 studentId를 받지 않습니다.
- 관리자 비밀번호는 로그인할 때만 보내며 이후 요청은 8시간짜리 admin session을 사용합니다.
- 로그인 실패는 사용자별 15분 동안 5회로 제한합니다.

## 배포 순서

Supabase CLI 연결 후 아래 순서로 배포합니다. 실제 secret 값은 terminal history나 Git 파일에
넣지 말고 Supabase Dashboard의 **Project Settings → Edge Functions → Secrets**에서 입력합니다.

1. `sql/ready_milestone_1.sql`
2. `sql/ready_auth_migration.sql`
3. `ready` Edge Function (`verify_jwt = false`)
4. Supabase Secrets

Claude Sonnet 5를 사용할 때 필요한 Secrets:

```text
READY_ADMIN_PASSWORD   관리자 로그인에 사용할 충분히 긴 비밀번호
READY_AI_PROVIDER      anthropic
READY_AI_MODEL         claude-sonnet-5
ANTHROPIC_API_KEY       Anthropic Console에서 만든 API key
```

`claude-sonnet-5`에서는 `temperature`를 보내지 않습니다. 최신 Messages API의
`output_config.format` JSON Schema structured output을 사용해 ORDER JSON을 받습니다.
OpenAI로 바꾸려면 `READY_AI_PROVIDER=openai`와 `OPENAI_API_KEY`를 설정하면 됩니다.

`SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`는 배포된 Edge Function에 Supabase가 자동으로
제공합니다. frontend에는 넣지 않습니다.

배포 후 공개 Function URL만 `ready/config.js`의 `API_URL`에 넣습니다.

```text
https://<READY_PROJECT_REF>.supabase.co/functions/v1/ready
```

이 URL과 project ref는 공개 식별자입니다. 인증은 URL 은닉이 아니라 서버 세션 검증으로 처리합니다.

## 범위

- 관리자: 학생/PIN 관리 → 세트 생성 → 지문 저장 → ORDER AI 생성 → Preview/수정/재생성/승인/삭제 → Publish
- 학생: 이름+PIN → 게시 세트 → 배열/제출/즉시 채점 → 다음 문제
- Review: completed/total, accuracy, 모든 attempt, 반복 오답, Passage별 오답 학생
- `questions.type = 'order'`와 JSON payload만 사용합니다.
- Breeze reader, PDF/EPUB, word lifecycle, sync, gesture 코드는 사용하지 않습니다.
