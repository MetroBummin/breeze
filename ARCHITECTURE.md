# Breeze 파일 구조

## 구조 원칙

1. 원본 PDF/EPUB 파일 Blob은 기기에만 둡니다.
2. 읽기용 텍스트, 원본 위치 지도, 진행도는 서로 분리합니다.
3. 읽는 화면의 스크롤은 하나의 컨테이너가 맡습니다.
4. 정적 웹앱을 기본으로 두고, iOS 앱은 같은 웹 코드를 Capacitor로 감쌉니다.
5. 기능을 설명하는 문서와 실제 생성 문서는 같은 테스트에서 함께 갱신합니다.

## 큰 그림

```text
index.html
  ├─ scripts/core       부팅 · 저장소 · 공통 상태
  ├─ scripts/library    홈 · 책/글 추가 · 카드 관리
  ├─ scripts/importers  PDF/EPUB/TXT/URL을 읽기 데이터로 변환
  ├─ scripts/reader     글자/원본 뷰어 · 위치 · 진행도
  ├─ scripts/dictionary 문맥 사전 · 단어장 · 문장 설명
  ├─ scripts/sync       로그인 · 기기 간 동기화
  └─ scripts/ui         설정 시트 · 제스처 · 작은 UI

server/
  ├─ dict               AI 사전과 계정 삭제
  └─ article            URL 가져오기용 HTML/이미지 중계
```

`index.html`의 script 순서가 브라우저에서의 의존 순서입니다. 별도 번들러 없이 정적
파일로 배포하고, PDF.js와 JSZip은 PDF/EPUB을 처음 열 때만 불러옵니다.

## 화면과 주요 파일

| 영역 | 주요 위치 | 책임 |
| --- | --- | --- |
| 홈 | `scripts/library/` | Casuals·Books, 추가, 카드 수정·삭제 |
| 파일/URL 가져오기 | `scripts/importers/` | PDF·EPUB·TXT 파싱, 붙여넣기, 기사 본문 추출 |
| 읽기 | `scripts/reader/` | 글자/원본 모드, 위치 전환, 진행도, PDF 확대 |
| 사전 | `scripts/dictionary/` | 낱말 선택, 문맥 캐시, 단어장, 문장 설명 |
| 동기화 | `scripts/sync/` | 매직 링크/OTP 로그인, 단어·위치·책 데이터 맞추기 |
| 저장소 | `scripts/core/storage.js` | IndexedDB 원본·이미지, 로컬 책 데이터 |
| 서버 | `server/dict`, `server/article` | AI 요청·계정 삭제, URL 중계 |

## 읽기 화면

### 글자와 원본

- **글자 모드**는 추출한 문단을 읽기 좋은 흐름으로 보여 줍니다. 글자 크기·여백·테마는 `Aa`가 맡습니다.
- **원본 모드**는 PDF 캔버스 또는 정리된 EPUB을 보여 줍니다.
- 문단마다 PDF 페이지 좌표 또는 EPUB 장/요소 위치를 기록해 두 모드를 오갈 때 가능한 한
  같은 문장 근처로 돌아갑니다.
- 진행도는 화면 픽셀이 아니라 PDF 페이지·EPUB 위치·문단 위치처럼 논리적인 위치를 기준으로 저장합니다.

### PDF 확대

PDF 원본의 확대는 `#pdfzoom-out`, `#pdfzoom-in`이 `#original-zoom`의 배율을 바꾸는
방식입니다. 확대된 종이는 뷰어 안에서 가로·세로로 스크롤합니다.

핀치 확대는 iOS 홈 화면 웹앱에서 브라우저가 viewport와 스크롤 앵커를 동시에 바꾸며
페이지가 튀는 문제가 있어 사용하지 않습니다. EPUB 원본과 글자 모드는 PDF 배율을 쓰지
않고 `Aa` 설정을 사용합니다.

상단바는 아래로 읽으면 사라지지만, 파란 진행 줄은 화면 위에 남습니다. `Aa`와
원본/글자 전환 버튼은 오른쪽 아래에 고정되어 있으며 읽는 동안만 옅어집니다.

## 데이터와 동기화

| 데이터 | 기본 위치 | 서버 동기화 |
| --- | --- | --- |
| 원본 PDF/EPUB Blob | 기기 IndexedDB | 하지 않음 |
| 추출 텍스트·서식·원본 위치 | 기기 | 로그인 시 책 데이터로 가능 |
| 진행도 | 기기 | 로그인 시 가능 |
| 단어장·저장 예문·책 제목 | 기기 | 로그인 시 가능 |
| 기사 이미지 | 기기 | 기사 데이터와 함께 가능 |

다른 기기에서 원본 모드를 열려면 같은 원본 파일을 다시 연결해야 합니다. 현재 연결 검사는
추출 텍스트 지문을 사용하므로, 같은 파일이라도 파서 결과가 달라진 드문 경우 실패할 수
있습니다. 원본 파일 해시를 우선으로 쓰는 보완은 아직 작업 전입니다.

동기화는 현재 E2EE가 아닙니다. HTTPS와 RLS는 사용하지만, 서버가 읽을 수 없는 암호화
금고는 아직 구현하지 않았습니다. 자세한 내용은 [PRIVACY.md](PRIVACY.md)를 봐 주세요.

## URL 가져오기

`scripts/importers/article.js`가 브라우저에서 본문과 사진을 골라 읽기 데이터로 바꿉니다.
브라우저 CORS 제한 때문에 `server/article`이 URL의 HTML·이미지를 전달할 수 있습니다.

공개적으로 접근할 수 있고 사용자가 읽을 권리가 있는 콘텐츠에만 쓰는 기능입니다. 유료·로그인
페이지 우회, 타사 페이지 스크립트 주입, DRM 해제는 지원하지 않습니다.

## iOS와 Android

- `ios/`는 Capacitor iOS 셸입니다. `viewport-fit=cover`와 safe area를 사용해 상태바와
  홈 인디케이터를 처리합니다.
- 앱에서도 웹과 같은 리더·저장소·동기화 코드를 씁니다.
- PDF.js와 JSZip은 현재 CDN에서 지연 로드하므로, 첫 PDF/EPUB 열기에는 인터넷이 필요합니다.
- Android 네이티브 셸은 아직 없습니다. Android 8–9 지원은 기본 읽기·단어장·로그인 흐름을
  실제 기기에서 확인한 뒤 범위를 정합니다.

## 알려진 안정화 작업

- `ResizeObserver` 경고가 실제 앱 오류 화면처럼 보이지 않게 처리
- 원본 파일 재연결에서 raw file hash 우선 비교
- 문장 전체 설명의 한국 시간 한도 안내, 중복 요청·시간 초과 처리
- 대용량 PDF와 구형 Android에서의 성능 저하 경로 점검

## 문서와 검사

`README.md`, `DICT.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `PRIVACY.md`를 고치면
`npm test`가 `docs/`의 HTML을 다시 생성합니다. `docs/`는 직접 편집하지 않습니다.

```bash
npm test
```
