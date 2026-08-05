# Architecture

## 원칙

1. 원문 문단 배열은 변경하지 않습니다.
2. 포맷 정보는 원문과 별도 객체로 저장합니다.
3. 목차 UI와 전권 AI 정리는 실행 경로에 포함하지 않습니다.
4. 빌드 도구 없이도 기존 정적 배포 방식을 유지합니다.
5. 파일 간 의존성은 `index.html`의 script 순서로 명시합니다.

## 파일 책임

- `scripts/core/`: 부팅 안전장치, IndexedDB, 상태, 샘플 데이터
- `scripts/library/`: 책 목록, 추가·삭제·이름 변경
- `scripts/importers/`: TXT/PDF/EPUB 파싱
- `scripts/dictionary/`: 표제어 처리, 사전 조회, 단어장 UI
- `scripts/reader/`: 원문 보존 포맷 지도와 읽기 화면
- `scripts/ui/`: 보기 설정, 발음, 시트 제스처
- `scripts/sync/`: 로그인, 단어·위치·책 동기화
- `server/dict/`: 활성 AI 사전 Edge Function
- `legacy/`: 실행되지 않는 목차·전권 AI 정리 코드

## 호환성

이 버전은 기존 IndexedDB와 localStorage 키를 유지합니다. 예전 책의 `tidy.blocks`는 읽기 화면에서만 호환되며 새 책은 `formatting.blocks`를 사용합니다.

## 다음 단계

롤링 방식의 AI 포맷팅을 추가할 때는 `formatting.blocks` 스키마를 확장하고, AI가 글자를 반환하지 않도록 문단 위치와 역할만 저장하는 것이 안전합니다.
