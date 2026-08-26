# READY — Golden Path

READY는 Breeze 저장소 안에서 UI 토큰만 공유하는 고려에듀 내부용 웹앱입니다.

- 학생: `/ready/`
- 관리자: `/ready/admin/`
- 서버: READY 전용 Supabase 프로젝트의 `ready` Edge Function

현재 운영 경로는 하나입니다.

```text
영어/한국어 TSV 붙여넣기 → Preview/Edit → Passage 저장
→ Passage 여러 개 선택 → Exam 생성
→ 학생 PIN 로그인 → Exam → Passage Reader
```

## 데이터 계약

- TSV 한 행은 `PassageSentence` 한 개입니다.
- 1열은 영어, 2열은 한국어 해석이며 서버가 다시 분리하거나 번역하지 않습니다.
- Passage와 모든 문장/해석은 `ready_create_passage_with_sentences` 한 transaction으로 저장합니다.
- Exam과 선택 Passage 연결은 `ready_create_exam_with_passages` 한 transaction으로 저장합니다.
- Passage 소속의 Source of Truth는 `ready_exam_passages`입니다.
- StudySet/Publication은 과거 attempt 감사용 데이터일 뿐 신규 runtime에서 사용하지 않습니다.

## 로컬 확인

```bash
npm run ready:dev
```

그다음 `http://127.0.0.1:4173/ready/admin/`을 엽니다. 로컬 frontend도
`ready/config.js`에 설정된 READY Supabase backend를 사용하므로 Pages 배포 전에 바로 검증할 수 있습니다.

핵심 정적/계약 테스트:

```bash
npm run ready:test
```

## 인증과 Secrets

- 학생 PIN은 PostgreSQL bcrypt hash만 저장합니다.
- 관리자 비밀번호는 로그인 시 한 번만 보내고 이후 opaque admin session을 사용합니다.
- API key, 관리자 비밀번호, service-role key는 frontend나 Git에 넣지 않습니다.
- AI key는 ORDER 기능을 다시 노출할 때도 Supabase Secret에서만 읽습니다.

## 배포

`supabase/migrations/`의 migration을 순서대로 적용한 뒤 `ready` Edge Function을 배포합니다.
새 READY DB는 migration 디렉터리만으로 현재 schema를 만들 수 있어야 하며 `sql/ready_*.sql`
수동 실행에 의존하지 않습니다.

```bash
npx supabase db push --linked
npx supabase functions deploy ready --no-verify-jwt
```

삭제는 서버의 `delete_impact` 결과를 먼저 보여줍니다. Attempt나 학습 이벤트가 없을 때만
`DELETE` 확인 후 hard delete하며, 기록이 있으면 연결 수와 함께 차단합니다.
