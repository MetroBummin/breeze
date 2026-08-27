# READY — Golden Path

READY는 Breeze 저장소 안에서 UI 토큰만 공유하는 고려에듀 내부용 웹앱입니다.

- 학생: `/ready/`
- 관리자: `/ready/admin/`
- 서버: READY 전용 Supabase 프로젝트의 `ready` Edge Function

이번 시험 기간 READY의 운영 경계는 분명합니다.

```text
원본 자료 → ChatGPT Work에서 정리·분석 → 구조화된 Passage 데이터
→ 검증된 원자적 저장 계약으로 READY에 반영 → 필요할 때 어휘 Bake
→ Passage 여러 개 선택 → 학교/학년 시험범위에 배정
→ 학생 PIN 로그인 → 현재 시험범위 Passage → Reader
```

READY 안에는 PDF/DOCX/Excel/TSV Import UI, 파일 parser, AI 지문·문제 추출 workflow를
두지 않습니다. Work가 콘텐츠를 준비하고 READY는 저장·읽기·Review·기록만 책임집니다.

## 데이터 계약

- 구조화된 `sentenceRows` 항목 하나는 `PassageSentence` 한 개입니다.
- 각 항목은 영어 `text`와 한국어 `translation`을 가지며 서버가 다시 분리하거나 번역하지 않습니다.
- Passage와 모든 문장/해석은 `ready_create_passage_with_sentences` 한 transaction으로 저장합니다.
- 저장과 문장 학습은 AI와 독립적입니다. 문장 sheet는 원문·교사 해석·저장만 즉시 보여줍니다.
- AI Bake는 단어·숙어 후보만 만들며 실패해도 원문과 해석 Reader는 계속 동작합니다.
- Bake된 어휘는 `kind + canonical lemma/phrase + stable sense key`로 식별합니다.
- rebake는 동일 문장·동일 occurrence의 기존 concept UUID를 재사용하고 새 sense key는 alias로 기록해, SavedWord/SavedPhrase와 highlight를 보존합니다.
- 학교/학년별 현재 시험범위와 Passage 연결은 `ready_set_current_scope_passages` 한 transaction으로 저장합니다.
- Passage 소속의 Source of Truth는 `ready_exam_passages`입니다.
- `ready_exams`는 기록 분리를 위한 내부 구현이며 학생과 관리자에게 생성·선택 개념을 노출하지 않습니다.
- Question/Attempt는 과거 기록 보존을 위해 DB에만 남기며 현재 runtime에서 읽거나 쓰지 않습니다.
- StudySet/Publication은 신규 runtime과 clean migration에서 사용하지 않습니다.

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
- AI key와 provider/model 설정은 Supabase Secret에서만 읽습니다.

## 배포

`supabase/migrations/`의 migration을 순서대로 적용한 뒤 `ready` Edge Function을 배포합니다.
새 READY DB는 migration 디렉터리만으로 현재 schema를 만들 수 있어야 하며 `sql/ready_*.sql`
수동 실행에 의존하지 않습니다.

```bash
npx supabase db push --linked
npx supabase functions deploy ready --no-verify-jwt
```

삭제 전 서버의 `delete_impact`가 연결 수를 계산합니다. 관리자가 확인하면 Student와 Passage
cascade RPC가 Attempt와 학습 이벤트까지 하나의 transaction에서 함께 삭제합니다. 학교/학년
시험범위는 영구 슬롯이므로 삭제하지 않고 포함 Passage만 교체합니다.
