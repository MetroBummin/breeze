# Breeze 전체 디자인 톤 점검 — 2026-09-30

이 문서는 변경 전 점검 기록이다. 이후 사용자 승인으로 구현을 진행했으며, 결과는 [구현·릴리스 검증](../qa/design-tone-release-20260930.md)에 기록한다.

## 결론

현재 단어 룩업창과 하단 컨트롤을 기준으로, **주변 팝업과 버튼을 정리하는 방향**이 적합하다. Home/서재/단어장의 큰 구조와 Reader 본문을 새로 설계할 필요는 발견하지 못했다. 가장 눈에 띄는 차이는 작은 작업 창의 가림막·버튼 강조·닫기 크기, Aa 내부의 신구 조작부 혼합이다.

이번에는 `DESIGN.md`와 이 보고서만 작성했다. UI·동작·표시 이름 변경, 커밋, 푸시, PR 생성, 병합, 배포는 하지 않았다. 기존 main에 `DESIGN.md`나 `design.md`가 없어서 새 기준 문서를 추가했다.

## 기준과 증거

- 기준 커밋: `0c3b43db83f7940cd4686829a28075a2ffc6f0f7` — PR #55 PDF ink palette 병합. #54의 1.6 서재/학습 변경도 포함.
- `git ls-remote`와 fetch로 원격 main을 확인했다. GitHub에는 Lightning 실험 PR #44/#45/#46이 열려 있었으며 이 점검에 포함하지 않았다.
- 별도 작업 폴더: `/Users/kosangbum/Desktop/breeze/breeze-design-tone-audit.nosync`, 브랜치 `codex/design-tone-audit-20260930`.
- 증거 폴더: `/Users/kosangbum/Desktop/breeze/audits/design-tone-20260930/`. 캡처 스크립트와 JSON에 viewport별 실제 버튼 크기·색·radius를 기록했다.
- 실제 앱을 로컬 서버에서 열고 일회용 브라우저 프로필과 테스트 TXT/PDF, 번들 EPUB을 사용했다. 외부 요청은 차단했다. 사용자의 저장 자료나 로그인 세션에 접근하지 않았다.
- WebKit: 주요 15개 화면/상태 × 3개 폭(390/820/1440) × light/dark = 90개 캡처. 해당 캡처에서 문서 가로 넘침과 pageerror는 없었다.
- 추가 Chromium 캡처(총 56회, 중복 재확인 6회 포함): PDF 원본/페이지/필기, EPUB 원본, 온보딩, 기사 미리보기, 문장 결과/오류, 외부 웹 페이지. 문장 결과와 기사 요약은 렌더러에 테스트 값을 넣은 디자인 fixture이며 실제 AI 응답 검증이 아니다.
- WebKit PDF 시도는 canvas 대기 시간 초과로 중단했다. 추가 PDF 화면은 Chromium으로 확인했다. 이 실패의 원인은 이번 디자인 범위에서 확정하지 않았다.

[휴대폰 라이트 비교](/Users/kosangbum/Desktop/breeze/audits/design-tone-20260930/contact-light.jpg) · [휴대폰 다크 비교](/Users/kosangbum/Desktop/breeze/audits/design-tone-20260930/contact-dark.jpg) · [태블릿 비교](/Users/kosangbum/Desktop/breeze/audits/design-tone-20260930/contact-820.jpg) · [데스크톱 비교](/Users/kosangbum/Desktop/breeze/audits/design-tone-20260930/contact-1440.jpg) · [PDF/외부 페이지](/Users/kosangbum/Desktop/breeze/audits/design-tone-20260930/contact-extra.jpg)

## 화면별 점검 범위

| 영역 | 확인한 상태 | 판단 |
| --- | --- | --- |
| Home | 로컬 자료 있음, 추천 이미지 없음, 하단 재개 | 구조와 dock 유지. 카테고리 조작부 정리 |
| Casuals / Long-form | 내 글 빈 상태 / 책 있음, 카테고리 | 앱 바탕·제목·dock 일관. 카테고리 생성 흐름은 별도 문제 |
| 단어장 | 검색/필터/별점/목록, 단어 추가 | 목록 유지, 작은 컨트롤과 추가 dialog 정리 |
| 설정 | 비로그인 이메일/비밀번호, 온보딩 진입 | 그룹형 전체 시트 유지. 작은 버튼·닫기·CTA 정리 |
| 글 추가 | 선택/붙여넣기/URL | 이미 룩업 계열. 주요 버튼 색과 닫기 동선 정리 |
| 책 수정/삭제 | 제목/표지/카테고리/삭제 확인 | 표면은 가까움. 가림막과 저장 버튼 색, 닫기 크기 차이 |
| TXT Reader | 본문/하단/Aa/저장 단어 mini·상세 | 본문·룩업·dock 유지. Aa 내부 정리 |
| 문장 해석 | 테스트 결과/오류·재시도 | 기존 룩업 계열 유지. 실제 요청은 미검증 |
| PDF | 원본/페이지 스트립/필기/도구 옵션 | 최신 구조 유지. 선택색 token과 작은 옵션 크기 검토 |
| EPUB | 번들 Alice 원본 표지, 하단 전환 | 원본 고유 디자인 허용. 전체 EPUB 내용 검수는 아님 |
| 온보딩 | 재진입 첫 안내 | 실제 Reader 사용 원칙 유지. 이후 모든 단계는 이번에 재생하지 않음 |
| 기사 미리보기 | 표지 없음, 요약 fallback/테스트 문구 | glass 계열 유지. CTA를 다른 시작 버튼의 기준으로 활용 |
| 소개/지원/공개 문서 | 첫 화면 및 휴대폰 레이아웃, 약관/개인정보 등 | 브랜드 헤더가 서로 다름. 앱 정리 뒤 낮은 우선순위 |

로그인 후 계정/복구키/기기 이동/탈퇴 내부 상태는 live 확인하지 않았다. CSS 소유 구조만 참고했으며 해당 흐름 전체가 검수됐다고 보지 않는다. 네이티브 파일·사진·색상 선택기, 공유 확장, 실제 iPad Pencil·키보드·회전·safe area도 미검증이다. 별도 제품인 `ready/`와 테스트 fixture HTML은 Breeze 화면 범위에서 제외했다.

## 우선순위별 발견 사항

### 1. 같은 짧은 작업인데 팝업의 무게가 달라진다 — 높음

책 수정/삭제는 `--scrim`의 짙고 푸른 가림막, 글 추가/기사 미리보기는 `--sentence-glass-scrim`, 단어 추가는 `--settings-scrim`을 사용한다. 중앙에 놓인 비슷한 작업 창인데 배경이 가려지는 정도와 색이 크게 다르다. 단어 추가만 앱 바탕색과 24px 모서리를 쓰고, 글 추가/책 수정은 룩업 계열 22px이다.

근거: `styles/home.css`의 `#edit-modal/#ed-card`, `styles/home-shell.css`의 `#add-modal/#am-card`, `styles/wordbook.css`의 `#wordbook-add-dialog`. 캡처 `390-light-book-edit`, `390-light-import-pick`, `390-light-word-add` 비교.

제안: 짧은 작업 창의 표면·가림막·제목·폼을 공통화한다. 전체 화면 설정 시트는 별도 유형을 유지한다. 단어 추가 창을 우선 적용 대상으로 삼으면 작은 범위에서 차이를 확인하기 좋다.

### 2. 실행 버튼 색에 공통 의미가 부족하다 — 높음

붙여넣기 ‘읽기 시작’과 URL 가져오기는 채운 파랑, 기사 미리보기 ‘읽기 시작’은 중립 glass, 책 수정 ‘저장’은 별점 `--s1`을 섞은 노랑, 단어 추가의 ‘저장/취소’는 같은 중립 형태다. 같은 primary 동작이 화면별로 다른 규칙을 따른다.

근거: `styles/components.css: .sm-btn.primary`, `styles/home-shell.css: #add-modal .sm-btn.primary`, `styles/home.css: #ed-card .ed-acts .sm-btn.primary`, `styles/article-preview.css: .ap-start`, `styles/wordbook.css: #wordbook-add-form button`.

제안: 중립 action을 기본, 옅은 파랑을 선택/진행으로 정의한다. 넓은 주요 동작은 높이 48px/모서리 16px를 공통 기준으로 두고, 저장과 취소는 배치·선·글자 강조로 구분한다. 학습 상태의 노랑을 일반 저장 의미로 사용하지 않는다. 로그인 CTA는 별도 예외 여부를 명시한다.

### 3. Aa 설정창 안에 새 규칙과 작은 옛 버튼이 섞여 있다 — 높음

별점 표시 설정은 44px 버튼과 12px 모서리인데, 글자 크기 버튼은 약 30px 높이, 여백 선택과 다크 스위치는 약 26px, 보기 전환은 26px이다. 큰 별점 설정 아래의 나머지 조작부가 급격히 작아진다. 창은 기존 `--sheet/--shadow`, 새 별점 조작부는 `--sentence-glass-*`를 사용한다.

근거: `styles/reader.css: #aa-pop/.aa-size/.aa-seg/.aa-toggle`, `styles/study.css: .study-star-row`, `metrics.json`의 `390-light-appearance`. 실제 캡처에 새 별점 행과 작은 글자/여백/모드 버튼이 함께 보인다.

제안: 행 간격과 실제 터치 영역을 정리하고 보조 버튼의 토큰을 룩업 계열로 맞춘다. 창이 길어지면 기존 스크롤을 유지한다. 사용자 색상 선택, 본문 여백 값, 보기 모드 동작은 그대로 둔다.

### 4. 닫기 버튼·보조 버튼 크기와 형태가 제각각이다 — 중간

책 수정 닫기 30×30px, 설정 닫기 36×36px, 기사 미리보기 닫기 44×44px. 닫기 글리프도 `✕/×`로 다르다. 단어 추가 ‘취소/저장’은 약 39px, 단어장 정렬/책 필터는 38px, 별 필터는 32px 높이다. 글 추가 창에는 명시적 닫기 버튼이 없다.

근거: `styles/home.css: #ed-close`, `styles/home-shell.css: #set-close`, `styles/article-preview.css: .ap-close`, `styles/wordbook.css`; `index.html`의 `#add-modal`.

제안: 새 주변 창부터 공통 닫기 SVG와 44px 터치 영역을 적용하고 추가 창에도 분명한 닫기 수단을 둔다. 측정값은 element box이므로 이것만으로 전부 터치 결함이라고 판단하지 않는다. `.chip::after`나 `#readback::after`처럼 실제 영역을 넓히는 규칙은 따로 확인한다. 마음에 드는 기존 dock의 시각적 크기는 유지한다.

### 5. 새 카테고리 기능의 입력·확인이 시스템 팝업으로 전환된다 — 중간

목록의 select/버튼은 glass token을 쓰지만 생성·이름 변경은 `prompt`, 삭제는 `confirm`이다. 책 수정 안 카테고리 select도 바깥 카테고리 컨트롤과 크기 문맥이 다르다. PDF 페이지 삭제 역시 시스템 확인창을 사용한다.

근거: `scripts/library/folders.js: renderFolderControls/renderBookFolderChoice`, `scripts/reader/pdf-navigation.js: offerPdfPageDeletion`, `styles/study.css`. 시스템 dialog 자체는 스크린샷으로 검증하지 않았고 코드 경로를 확인했다.

제안: 카테고리 입력과 일반 확인을 공통 dialog로 먼저 정리한다. PDF 삭제 확인은 데이터 설명·초점/키보드·취소 보존을 확인하며 별도 적용한다. 운영체제 파일 선택기까지 대체할 필요는 없다.

### 6. PDF의 파랑·빨강이 별도 상수이고 일부 옵션은 작다 — 중간

페이지 선택과 북마크가 `#007aff/#ff3b30` 고정색을 사용한다. 최신 펜 팔레트는 기존 glass/outline 계열이므로 유지할 수 있다. 두께 옵션의 38px 최소 높이는 실제 터치 영역을 확인할 후속 대상이다.

근거: `styles/study.css: .pdf-thumbnail-jump/.pdf-thumbnail-bookmark/.pdf-navigation-head`, `styles/pdf-ink.css: .ink-widths/.ink-highlight-widths`.

제안: 현재 페이지/북마크를 의미 토큰으로 정의하고 light/dark를 함께 검토한다. 펜·형광펜의 실제 색상이나 PDF 원본의 흰 종이는 디자인 불일치로 취급하지 않는다. 최신 필기 dock의 두 줄 배치도 이미 기록된 반응형 예외다.

### 7. 제품 이름과 일반 라벨의 언어가 섞여 있다 — 중간

앱 브랜드는 Breeze인데 단어장만 Thunderhead다. 단어장 하단은 `Home`, 그 외 주요 라벨은 한국어다. 외부 지원 페이지는 serif ‘Breeze’, 앱/landing은 아이콘과 굵은 UI 로고, 공개 문서는 또 다른 작은 브랜드 헤더를 쓴다.

제안: 단어장 후속 이름은 **Breeze Memory / 브리즈 메모리**로 사용자가 확정했다. 저장한 단어·뜻·예문을 다시 보는 역할이므로 현재 기능에 잘 맞는다. Breeze Brain은 능동적인 AI 기능을 예상하게 할 수 있다. 확정 명칭을 디자인 문서에 반영했으며, 이번 보고 단계에서는 앱 제목을 바꾸지 않았다. 일반 `Home`은 ‘홈’으로 검토한다. 브랜드 아이콘 교체는 별도 결정이다.

### 8. 스타일 소유권이 여러 파일과 과거 override에 걸쳐 있다 — 중간

`components.css`의 단어장/설정 규칙 위에 `wordbook.css`, `home-shell.css`가 덮이고, `reader.css`의 Aa에 `study.css`가 추가된다. 한 파일의 과거 규칙만 보고 수정하면 실제 화면은 바뀌지 않거나 다른 화면이 함께 바뀔 수 있다. 토큰 주석에도 ‘문장 lookup만’처럼 현재 공유 용도와 어긋난 설명이 남아 있다.

제안: 새 화면마다 CSS를 덧붙이기 전에 최종 computed style과 load order를 확인한다. 이번 `DESIGN.md`가 표면·버튼·예외의 공통 기준을 제공하고, 후속 구현 때 해당 컴포넌트 범위의 오래된 override를 정리한다. 전체 스타일 재작성은 권하지 않는다.

## 유지 대상으로 판단한 것

- 룩업의 mini → 상세 흐름, 중립 glass, 작은 별점 action 모양과 문맥 위 표시.
- Home/서재/단어장/Reader의 공유 하단 컨트롤과 위치 계약.
- Home·목록의 중립 바탕과 Reader의 따뜻한 종이 차이. 역할이 달라 의도적으로 유지할 수 있다.
- Reader의 serif 본문, 기사 원문 제목, EPUB 원본 typography.
- 실제 Reader를 사용하는 온보딩, 최신 PDF 필기/페이지 스트립 구조.
- 사진/문서 원본·사용자 설정 색. 앱 톤에 맞추기 위해 내용을 변경하지 않는다.

## 후속 작업 순서 제안

1. 단어 추가·책 수정·글 추가: 공통 가림막, 버튼 역할, 닫기, 입력 규칙.
2. Aa·단어장 필터·설정 보조 버튼: 크기와 간격, focus 상태.
3. 카테고리 dialog·PDF 상태 token: 동작과 데이터를 보존하며 분리 적용.
4. 확정된 이름과 한국어 라벨, 외부 소개·지원·문서의 브랜드 헤더.

이번 보고에서 구현을 시작하지 않는다. 각 묶음은 라이트/다크 비교 후 작게 적용하고, 공통 dock와 룩업 회귀를 별도로 확인하는 것이 좋다.
