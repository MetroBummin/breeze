# READY — Golden Path

READY는 Breeze 저장소 안에서 UI 토큰만 공유하는 고려에듀 내부용 웹앱입니다.

- 학생: `/ready/`
- 관리자: `/ready/admin/`
- 서버: READY 전용 Supabase 프로젝트의 `ready` Edge Function

이번 시험 기간 READY의 운영 경계는 분명합니다.

```text
원본 자료 → ChatGPT Work에서 정리·분석 → 구조화된 Passage 데이터
→ 검증된 원자적 저장 계약으로 READY에 반영
→ Passage 여러 개 선택 → 학교/학년 시험범위에 배정
→ 학생 PIN 로그인 → 현재 시험범위 Passage → Reader
```

READY 안에는 PDF/DOCX/Excel/TSV Import UI, 파일 parser, AI 지문·문제 추출 workflow를
두지 않습니다. Work가 콘텐츠를 준비하고 READY는 저장·읽기·Review·기록만 책임집니다.

## Question 작업 필수 절차

**Any READY question-related task must read `ready/QUESTION_TYPES.md` and `ready/QUESTION_IMPORT.md` first.**

다음 작업은 두 문서를 source of truth로 삼습니다.

- PDF 문제 import
- 새로운 question type 추가
- question renderer 수정·추가
- variant passage 처리
- grading contract 변경
- question source metadata 처리

기존 renderer 재사용을 먼저 검토하고, Question에 맞추기 위해 canonical Passage를 수정하지
않습니다. 새 패턴이나 contract 변경은 구현과 같은 commit에서 두 문서에 기록합니다.

## 데이터 계약

- 구조화된 `sentenceRows` 항목 하나는 `PassageSentence` 한 개입니다.
- 각 항목은 영어 `text`와 한국어 `translation`을 가지며 서버가 다시 분리하거나 번역하지 않습니다.
- Passage와 모든 문장/해석은 `ready_create_passage_with_sentences` 한 transaction으로 저장합니다.
- 저장과 문장 학습은 AI와 독립적입니다. 문장 sheet는 원문·교사 해석·저장만 즉시 보여줍니다.
- Reader 토큰은 지문을 열 때 결정적으로 계산하며 DB 전처리나 AI 호출이 없습니다.
- 단어는 누른 순간에만 Breeze와 같은 Gemini 문맥 사전을 조회합니다. 원형·실제 문장으로 문맥 뜻, 품사, 짧은 설명, 표현 후보를 받고 대표 문맥 뜻은 즉시 `ready_saved_words`에 자동 저장합니다. 다른 뜻을 누르면 같은 lemma에 복수 뜻을 추가로 저장할 수 있습니다. `아는 단어 빼기`는 해당 지문의 학습 저장·강조를 제거하되 되돌릴 수 있는 `ready_word_states` 상태로 남깁니다. 지문을 열거나 문장을 저장할 때 AI를 호출하지 않습니다.
- 저장 highlight는 lemma 기준이라 `made`로 저장한 `make`가 다른 지문에서도 유지됩니다.
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
- READY Edge Function은 단어 lookup에만 `GEMINI_API_KEY`, `AI_PROVIDER=gemini`, Breeze와 같은 `gemini-3.5-flash-lite`를 사용합니다. API key는 Edge Function Secret에서만 읽고 client·git·로그에 넣지 않습니다.
- `AI_DAILY_LIMIT`은 학생 한 명의 하루 Gemini 단어 lookup 상한입니다. 없으면 100회이며, 무료 API 예산에 맞게 Secret으로 조정합니다.

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
