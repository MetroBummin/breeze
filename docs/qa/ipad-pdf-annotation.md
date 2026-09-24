# iPad PDF Annotation MVP — 구현 및 검증 보고

검은 펜의 1차 검증을 먼저 구현했다. 사용자가 iPad에서 필기·스크롤·핀치·위치 유지와
문서 재열기 후 필기/삭제 유지가 정상이라고 확인한 뒤, 검정·빨강·파랑,
얇게·보통·굵게, Undo/Redo와 접히는 작은 도구 UI를 추가했다.
스크롤 직후 Pencil 입력은 최종 정책까지 수정해 iPad에서 반복 확인했다.
전체 시험지 풀이와 복합 손바닥 충돌 검증은 별도로 남아 있다.

- 브랜치: `codex/ipad-pdf-annotation`
- 기준 main: `0b1b6bb` (2026-09-25 조회), 열린 PR 0개
- 작업 위치: `/Users/kosangbum/.codex/worktrees/breeze-ipad-pdf-annotation-20260925`
- 이 문서는 구현과 검증 이력을 기록한다. 최신 Git/PR 상태는 별도로 확인한다.
- 기존 Desktop checkout은 dataless 파일 읽기가 지연되어 수정하지 않았다.
  별도 clone의 origin/main에서 전용 worktree를 생성했다.

## 구조와 변경 파일

| 파일 | 변경 |
|---|---|
| `scripts/reader/pdf-ink.js` | 3색/3굵기 펜, 전체 획 지우기, Undo/Redo, SVG, 저장/실패 재시도 |
| `styles/pdf-ink.css` | 입력을 가로막지 않는 SVG, 접히는 작은 도구와 저장 상태 |
| `scripts/reader/pdf-original.js` | 문서 열기, 페이지 렌더/해제에 연결 |
| `scripts/reader/original-session.js` | 문서 종료 시 정리 |
| `scripts/reader/pdf-pinch.js` | 캔버스 교체 유예, Pencil/억제 접촉 제외, 종료 후 pan 상태 정리 |
| `ios/App/App/SceneDelegate.swift` | 네이티브 iPad 판별 전달, Mac 제외 |
| `index.html` | 스크립트/스타일 로드, stamp 갱신 |
| `sw.js` | stamp가 생성한 캐시 버전 갱신 |
| `tests/verify-pdf-ink-browser.mjs` | PDF.js/IndexedDB 실제 사용, 합성 stylus 입력 검증 |
| `docs/decisions/009-pdf-ink.md` | 구현 선택, 저장/입력 계약, 검증 gate |
| 이 문서 | 검증 결과와 실기기 절차 |

공통 파일은 `index.html`, `sw.js`, `SceneDelegate.swift`, 위 Reader 연결 파일들이다.
Home/추천/Article Preview 코드·스타일은 변경하지 않았다. 다른 로컬 작업의 미공개
diff는 dataless 상태 때문에 완전히 읽지 못했으므로 이 파일들이 겹치지 않는다고
단정하지 않는다. 통합 시 필요한 hook만 적용해야 한다.

좌표는 기존 PDF.js scale=1 viewport 좌표이며 페이지의 실제 rotation을 포함한다.
입력은 WebKit stylus Touch만 받고 손가락은 필기로 사용하지 않는다. 어떤 도구를 선택해도
SVG가 입력을 가로막지 않는다. 저장은 원본 파일 SHA-256 + 페이지 기준의 별도
로컬 IndexedDB이고, 페이지별 직렬 저장으로 늦은 쓰기의 덮어쓰기를 막는다.
상세 계약은 decision 009를 참조한다.

## MVP 단계 확인 결과 (후속 입력 분리 결과는 아래)

- `npm test`: 통과 (타입 검사 기존 37개 지적 증가 없음).
- `npm run test:pdf-geometry`: Chromium/WebKit 통과.
- `node tests/verify-pdf-ink-browser.mjs`: Chromium/WebKit 합성 stylus 검사.
  3색 × 3굵기 9조합, Undo/Redo, 새 편집의 Redo 초기화, 해제한 페이지의 Undo,
  Redo로 지운 결과의 reload 복원, 검은 획, 손가락 제외, 합성 palm 접촉, 취소 시 임시 획 폐기, 확대/뷰포트 변경,
  PDF 자체 90도 회전, 페이지 해제/재생성, 브라우저 reload 후 복원, 지우기 후 reload,
  저장 실패의 가시적 표시/최신 상태 보존/재시도, 문서 hash 격리, 플랫폼 gate.
  오프라인 상태에서 필기/저장, 읽기 모드 복귀 후 실제 touch tap의 Lookup도 통과.
  브라우저 재시작이나 WKWebView 앱 재시작을 직접 수행한 검증은 아니다.
- `npm run test:pdf-pinch`: 단어 상세 popup의 `#word-modal-scrim` 클릭 대기에서 실패.
  수정하지 않은 main에도 동일한 실패가 재현되므로 통과로 기록하지 않는다.
- `npx cap sync ios` 후 iOS Simulator 대상 Debug 빌드: 통과.
  첫 빌드는 fresh checkout의 네이티브 번들 파일이 없어 실패했고 sync로 해결했다.
- Simulator UI 실행: 미실행. 실기기 설치/기본 흐름 확인은 아래와 같다.
  이후 사용자가 iPad 10세대(iPadOS 26.5)를 유선으로 연결하고 신뢰를 완료했다.
  사용자가 개발자 모드 활성화/재시동을 완료했고 enabled + DDI available을 확인했다.
  iPad를 포함하는 개발 프로파일로 Debug 빌드 성공 후 기존 Breeze 1.2(139)를
  삭제하지 않고 동일 bundle ID로 업데이트 설치했다. devicectl에서 설치 및 앱 실행
  성공을 확인했다. 사용자는 실제 Pencil 필기·손가락 이동/핀치 후 위치 유지,
  문서 재열기 후 필기 및 삭제 결과 유지가 모두 정상이라고 답했다.
  색상/굵기/Undo/Redo 버전도 iPad 대상 Debug 빌드 성공 후 업데이트 설치·실행했다.
  추가 버전의 편집/앱 프로세스 재실행 검증 결과는 사용자 확인을 기다리는 중이다.
  Mac Device Hub 화면 조회는 CUA timeout으로 실패해 시각적 증거로 사용하지 않았다.
- 실제 영어 시험지 문제 한 세트를 풀고 다음 날 이어 읽는 완료 기준: 미확인.
- EPUB/텍스트 구조·생명주기 검사는 npm test 통과 범위다. iPhone/Mac 실기기 UI,
  긴 문서 실제 기기 메모리/입력 지연은 미확인이다.

## 재현 명령

```sh
npm ci
npm test
node tests/verify-pdf-ink-browser.mjs
npm run test:pdf-geometry
npm run test:pdf-pinch
npm run ios:sync
```

이 브랜치를 Xcode에서 iPad에 Debug로 실행한다. Archive/업로드는 필요 없다.
자동 테스트의 `breezeInkIPad` 주입은 테스트 전용이며, 실제 앱은 UIKit 값만 사용한다.

## 자동 입력 분리 후속 변경 (2026-09-25)

기존 Git 상태는 같은 브랜치의 미커밋 MVP였다. 변경 전 tracked diff와 untracked
파일 전체를 `/Users/kosangbum/.codex/backups/breeze-ipad-ink-before-auto-input-20260925/`
아래 patch/tar.gz로 보존했다. 기준 HEAD는 `0b1b6bb8f023517e99c54cdfb0e6e1203df7c7b7`.
커밋·초기화·원격 작업 없이 이어서 수정했다.

차단 원인은 `pdf-ink.js`의 필기 모드 전체 Pointer/Click 차단과 읽기 모드의
Touch 시작 조기 반환이었다. SVG는 원래부터 pointer-events:none이었다.
기존 `gesture.js` Lookup 로직은 수정하지 않았으며 실제 손가락 이벤트를 받는다.

Pencil은 기존 WebKit stylus Touch로 그리고, Pointer/click은 본문에서의 중복
Lookup·원문 링크 동작만 막는다. 툴바·팝업은 이 범위 밖이다. 진행 중 획과 억제한
접촉은 identifier로 추적하며, 늦게 들어온 Pencil은 기존 손가락 제스처를 빼앗지
않는다. 핀치는 Pencil과 억제 접촉을 제외한다. 이전 손바닥이 남아 있더라도
Pencil을 뗀 뒤 새로 시작한 손가락은 허용하며 시간 지연 차단은 없다.

기존 UI를 둔 상태에서 Chromium/WebKit 분리 테스트를 먼저 통과한 뒤 읽기 버튼을
제거했다. PDF 진입 기본 도구는 펜이며, 도구 접기는 UI만 접는다. 저장 스키마,
좌표, SVG, 색/굵기, Undo/Redo, 기존 네이티브 iPad 판별은 유지했다.
후속 변경 파일: pdf-ink.js, pdf-pinch.js, ink 브라우저 테스트, decision/이 보고서,
빌드 stamp(index.html/sw.js). Home/추천/Article Preview 변경 없음.

### 후속 버전 검증 결과

- `npm test`: exit 0. 타입 지적은 기존 37개 유지.
- `npm run test:pdf-geometry`: exit 0, Chromium/WebKit 통과.
- `node tests/verify-pdf-ink-browser.mjs`: 두 엔진 모두 exit 0.
  기본 펜 진입, 모드 전환 없이 펜/지우개 → 실제 browser tap 단어 Lookup →
  Pencil 편집, 손가락 문장 long press(합성 Pointer), 도구 접은 상태의 필기를 확인했다.
  Pencil 편집 전후 word/sentence dispatch 및 fetch 계수가 늘지 않았고 손가락
  Lookup/scroll/pinch가 획을 추가·삭제하지 않았다.
- Chromium CDP가 생성한 실제 browser Touch로 펜/지우개 각각 native 스크롤과
  핀치를 검증했다. WebKit의 다중 접촉 및 모든 stylus/palm은 합성 이벤트다.
  Pencil 먼저/손바닥 먼저, 손바닥 해제 중 획 유지, 남은 억제 접촉과 새 손가락,
  핀치 중 늦은 Pencil, touchcancel/blur 후 잠김 해제를 검사했다.
- 좌표·3색/3굵기·Undo/Redo·저장/실패 재시도·문서 hash 격리 검사도 유지했다.
  테스트 reload 직후 책 목록 초기화 완료를 기다리도록 harness를 보완했다.
- 관성 스크롤 중 Chromium이 `cancelable:false`로 전달한 새 터치에서는 핀치를
  시작하지 않는다. 기존 스크롤을 빼앗지 않는 정책이다. 관성이 끝난 뒤 핀치는
  통과했다. 이것을 WKWebView의 모든 빠른 전환 성공 증거로 해석하지 않는다.
- `npm run test:pdf-pinch`: 이번 실행도 `#word-modal-scrim` 클릭 대기 실패.
  기존 main 재현 실패와 같은 위치이며 이 suite 전체를 통과로 표시하지 않는다.
  별도 신규 scroll/pinch 검사를 생략하지 않았다.
- `npm run ios:sync` 및 연결 iPad 대상 Debug 빌드 성공. 동일 bundle ID로
  업데이트 설치와 실행 성공. 삭제/데이터 초기화 없이 설치했다. 설치 번들의
  pdf-ink.js, pdf-pinch.js, CSS, index.html SHA-256이 현재 소스와 일치한다.
- **새 버전의 실제 Pencil/손바닥 입력과 기존 iPad 필기 보존은 사용자 확인 대기.**
  기존 MVP의 사용자 확인은 새 자동 분리 동작의 실기기 검증을 대신하지 않는다.

로그: `/tmp/breeze-auto-input-{npm,geometry,pinch,expanded,sync,device-build}.log`.
설치/실행 결과: `/tmp/breeze-auto-input-install.json`, `/tmp/breeze-auto-input-launch.json`.

### 실기기 확인 절차

1. 기존 PDF를 열어 **업데이트 전 저장한 필기**가 남아 있는지 확인한다.
2. 모드 버튼 없이 Pencil 필기 → 손가락 단어 탭 → 팝업 닫기 → Pencil 밑줄 →
   손가락 스크롤/핀치를 연속 실행한다. 손가락 길게 누르기의 문장 조회도 확인한다.
3. 지우개 선택 후 같은 순서로 반복한다. 손가락은 필기를 지우지 않아야 한다.
4. 도구를 접은 채 쓰기, Pencil로 도구/팝업 버튼 누르기, 3색·3굵기와 Undo/Redo를 확인한다.
5. 손바닥 먼저/Pencil 먼저, 손바닥을 남긴 채 Pencil 떼기, 빠르게 번갈아 쓰기,
   핀치 도중 Pencil 대기, 필기 도중 백그라운드 전환을 반복한다. 페이지 튐·유령
   Lookup·긴 연결선·중복 획·입력 잠김이 있으면 순서를 기록한다.
6. 저장됨 후 앱을 완전히 종료하고 재실행해 필기·삭제 결과를 확인한다.

위 절차는 새 입력 분리 버전의 실기기 확인이며, 이전 MVP의 사용자 확인으로
대체하지 않는다. 기기 확인을 위해 앱 삭제나 저장 데이터 초기화를 하지 않는다.

문서 세션 내 Undo/Redo는 최근 50개 편집까지이며 문서를 닫으면 이력은 비워진다.
Undo/Redo의 최종 필기는 저장된다. 원본 PDF와 기존 단어 표시는 수정하지 않는다.
미검증: 완전한 앱 재실행, 다음 날 재개, 실제 손바닥/빠른 입력/백그라운드 스트레스,
긴 PDF에서의 실기기 메모리 및 입력 지연, iPhone/Mac 실기기 회귀.

## 스크롤 직후 Pencil 오류 — 조사 진행 중 (2026-09-25)

- 사용자 실기기 보고: 정지 상태 필기는 정상. 반복 flick 중 Pencil이 필기 대신
  PDF를 스크롤하는 경우 있음. 기존 자동 입력 분리의 실기기 스트레스 통과로 볼 수 없음.
- 최종 요청 정책: 실제 관성 중 첫 Pencil 접촉은 정지 전용으로 소비하고, 해당
  접촉은 끝까지 무필기·무삭제. 다음 접촉부터 지연 없이 정상 편집.
- 작업 전 Git 확인: `codex/ipad-pdf-annotation`, 기존 수정/새 파일 모두 보존.
  체크포인트 `/Users/kosangbum/.codex/backups/breeze-before-inertia-20260925-012728/`
  (`tracked.patch`, `untracked.tar.gz`, `status.txt`).
- 코드상 확인: 실제 스크롤 요소는 `#reader-scroll` 내부 overflow. Ink는
  noncancelable start를 거절하며 mixed eligible finger 이벤트를 취소하지 않음.
  Pointer 차단은 Lookup 전파 차단이며 네이티브 pan 차단 증거가 아님.
  기존 raw touches 길이 검사에는 억제된 palm도 포함됨.
  이 조건들이 **이번 iPad 증상의 원인인지는 아직 입력 로그 확인 전**.
- 이번 단계는 기존 동작을 보존한 DEBUG 계측 추가. 실제 접촉 종류/ID/좌표,
  active/suppressed, handler route, cancelable/defaultPrevented, pan/pinch,
  scrollTop/Left, transform, stroke start를 연결해서 기록.
  native snapshot은 JS와 비동기라 동일 시점의 진실로 단정하지 않음.
- DEBUG iPad만 `breezeInkDebug` 주입. Release에는 native flag/handler 없음.
  최대 JS 4,000행/native 100 snapshot의 로컬 Cache 파일
  `Library/Caches/breeze-ink-trace.json`; 문서 텍스트와 저장 필기는 제외.
- 타입 검사 통과(기존 37개 유지), DEBUG 계측을 켠 Chromium/WebKit annotation
  회귀 검사 통과. 테스트 마지막 Lookup의 오래된 좌표 재사용을 현재 보이는
  단어 좌표 재조회로 수정. 이는 WKWebView 관성 차단 또는 물리 Pencil 검증이 아님.
- 기존 `test:pdf-pinch` main 재현 팝업 대기 실패 기록은 위에 유지. 이 조사 단계의
  annotation 회귀에는 별도 native Chromium finger pinch와 합성 충돌 검증 포함.
- 원인/동작 수정/실기기 20회 반복은 미완료. 실제 계측 재현 후 다음 단계로 진행.
- Xcode 환경 확인: 기본 `/Applications/Xcode.app`의 26.5 플랫폼 제거 상태.
  실행 중인 `/Users/kosangbum/Downloads/Xcode.app`의 Xcode 27을 이번 명령에만
  `DEVELOPER_DIR`로 지정. 기본 xcode-select는 변경하지 않음. 이전 임시 빌드
  캐시의 Capacitor artifact 누락은 새 `/tmp/breeze-ink-inertia-xcode27`에서 해결.
- Xcode 27 Debug 빌드 성공, 기존 iPad 앱에 업데이트 설치 및 실행 성공.
  번들 ID `kr.io.breeze.app`; 앱 삭제/데이터 초기화 없음. 번들 내 ink/pinch JS와
  index의 SHA256이 작업 파일과 동일. 계측 ON/OFF 모두 Chromium/WebKit 통과.
- 원래 오류의 실기기 재현을 사용자에게 요청한 상태. 수정 완료가 아님.
  로그 회수 명령(읽기 전용):
  `DEVELOPER_DIR=/Users/kosangbum/Downloads/Xcode.app/Contents/Developer xcrun devicectl device copy from --device 00008101-000E193A14A3A01E --domain-type appDataContainer --domain-identifier kr.io.breeze.app --source Library/Caches/breeze-ink-trace.json --destination /tmp/breeze-ink-trace.json`

### 첫 실기기 오류 재현 로그

사용자가 ‘또 화면이 움직였어’로 재현을 확인. 케이블로 가져온 원본:
`/tmp/breeze-ink-trace-reproduced.json` (999행).
- 정지 상태 seq 11/177: stylus touchstart, cancelable=true,
  defaultPrevented=true, stroke/start 정상.
- 재현 구간 seq 597–999: direct touch start/end 및 Reader scroll 기록은 있으나
  **새 stylus Touch/Pointer start가 웹에 기록되지 않음**. start/rejected도 0건.
- direct 종료 후 native WKChildScrollView decelerating=true, panTouches=0 관측.
  웹 pan=false/pinch=false로 정리된 이후에도 scrollTop 이동 기록 존재.
- 따라서 이 재현을 웹 noncancelable 거절 분기나 늦은 Pencil ownership 분기의
  실행 증거로 해석할 수 없음. 사용자 Pencil 동작과 native UITouch를 연결해야 함.
  기존 WebKit 이슈 251513도 momentum 중 Touch/Pointer 미전달을 기술하지만,
  해당 이슈 자체가 이 iPad의 정확한 원인이라는 증거는 아님.
- 후속 DEBUG probe는 UIKit touch type/identity/phase와 실제 UIScrollView 상태를
  기록. recognize/prevent/cancel/delay하지 않는 관찰 전용 recognizer.
  네이티브 입력은 최대 2,000행, JS 식별자와 별도 공간, timestamp로 비교.
  아직 스크롤 제어를 변경하지 않았으며 해결 완료/20회 통과 주장을 하지 않음.
- UIKit probe 포함 Debug 빌드/업데이트 설치/실행 성공. 원래 앱 데이터 유지.
  `/tmp/breeze-inertia-native-probe-build.log`, `-install.json`, `-launch.json`.
  추가 재현 요청 중. 앞선 `npm test`도 마지막 READY 검사까지 완료됨.
- 두 번째 동일 파일 회수 시 Mac 목적지 쓰기에서 일시적인 ‘No space left on
  device’ 오류 발생. 첫 999행 원본은 이미 회수됨. 이후 `df`는 6.6GiB 가용으로
  확인됐고 빌드/설치는 성공. 이를 입력 문제로 해석하지 않음.

### 네이티브 원인 확인 및 수정 후보 설치

추가 사용자 ‘또 움직임’ 재현에서 `/tmp/breeze-ink-native-input.json`을 회수.
UIKit type=2(Pencil) 시작 순간 allTouches에는 Pencil만 있었고 손가락은 없었음.
첫 관성 접촉: uptime 3620.0739, WKChildScrollView offsetY=17408,
decelerating=true, pan state=possible/0 contacts. Pencil 종료 3620.7848에는
offsetY=17239, pan state=ended. 다음 관성 Pencil에서도 17930→17700 이동.
이 접촉에 대응하는 웹 stylus start는 없음. 즉 실제 관성 중 native pan이
Pencil을 스크롤 입력으로 사용한 사례를 확인. JS 거절 분기만 고쳐서는 해당
미전달 접촉을 막을 수 없음. 원본 2개는 작업 전 백업 폴더에도 보존.

최소 네이티브 수정 후보:
- 웹은 PDF 페이지의 content 좌표, Reader frame/height, UI 제외 영역만 전송.
- UIKit gate는 Pencil만 수신. public UIScrollView를 geometry로 선택하여
  해당 Pencil을 native pan/pinch에서 ignore. 실제 finger contact는 유지.
- 실제 isDecelerating이고 active pan이 없으면 stopScrollingAndZooming으로
  현재 위치에서 멈추고 그 Pencil 접촉 전체를 native에서 소비. 이전 offset
  복원이나 시간 기반 차단 없음. 다음 일반 Pencil은 즉시 fail하여 웹에 전달.
- 평상시 WebKit Touch/SVG/좌표/DB/Undo 구조 유지. raw touches.length 대신
  eligible finger로 web ownership 판정하여 이미 억제된 palm은 제외.
- iOS 17.4 미만의 current-offset fallback은 이 iPad에서 검증 불가.
- Debug 빌드/기존 앱 업데이트/실행 성공. 첫 수정 후보 실기기 확인 요청 중.
  펜·지우개/기본·확대 20회 승인 기준은 아직 미충족.

### 수정 후보 첫 실기기 결과

사용자가 ‘정상정상정상’, ‘완전 좋아’로 새 정책의 동작을 확인.
회수한 `/tmp/breeze-ink-gate-trace.json`에는 stop-inertia 4건이 있고,
각각 시작 offsetY 24812 / 26874.5 / 29824.5 / 31455.5에서
stop 호출 직후 decelerating=false, before/after offset 동일.
각 Pencil 접촉이 끝날 때까지 native move/end의 offset 범위도 동일(변화 0).
후속 접촉의 web stroke/start도 확인. 이는 stop API 호출 여부만 본 검사가 아님.

최종 추가 회귀: Chromium/WebKit annotation 모두 통과(억제된 palm과 fresh
Pencil, finger 먼저 시작한 뒤 finger만 떼어도 늦은 Pencil은 끝까지 무필기,
native scope 게시/해제 포함). `npm test`, typecheck(기존 37), PDF geometry 통과.
전체 `test:pdf-pinch`는 기존과 동일한 invisible #word-modal-scrim click 대기 실패.
독립 annotation suite의 Chromium 실제 browser touch pinch/scroll 및 합성 pinch
충돌 검사는 통과. 물리 iPad pinch와 palm 충돌을 이 결과로 대체하지 않음.

현재 사용자에게 펜/지우개 × 기본/확대 화면에서 각 5회, 총 20회 추가 확인 요청.
‘확대’는 펜 굵기 변경이 아니라 두 손가락으로 PDF 화면 확대임을 설명함.
20회 확인과 추가 실기기 충돌/Lookup/업데이트 전 필기 확인은 아직 완료 주장하지 않음.

### 최종 실기기 결과 (사용자 입력 + 회수 로그)

- 사용자: 펜/지우개 × 기본/확대 화면 요청에 ‘다 잘 되는 것 같아’.
  추가 반복과 ‘손가락 단어 Lookup → 닫기 → Pencil’에
  ‘추가 반복과 단어 조회 모두 정상’으로 확인.
- 마지막 로그 `/tmp/breeze-ink-gate-extra-device.json`에서 실제 inertia 소비
  **21건**과 각 접촉의 native end까지 회수. 21건 모두 즉시 decelerating=false,
  호출 전후 offsetX/Y 동일, 접촉 중 native move/end의 offsetX/Y 변화 **0**.
  관성이 이미 끝나 있던 일반 접촉은 이 21건에 포함하지 않음.
- 펜/지우개, 확대 조건의 후속 web stroke/start가 로그에 있음. 도구별 5회라는
  세부 분배는 사용자 요청/응답 기준이며 21건 native stop의 도구별 독립 집계가
  아님. 자동으로 물리 Pencil을 조작한 테스트가 아니라 **사용자 실기기 실행 +
  에이전트 로그 분석**임. visual 시작점/튐 없음은 사용자 정상 응답에 근거.
- 증거 보존: 작업 전 백업 디렉터리의 `fixed-21-contacts.json`,
  `fixed-21-summary.json` (completeContacts=21, changedPosition=[]).
- 후속 최종 빌드는 핵심 제어를 유지하며 toolbar 빈 공간/readpill도 UI 제외
  영역에 포함. DEBUG 계측은 **BREEZE_INK_TRACE=1** 환경변수로 시작할 때만
  활성화되도록 전환. 기본 실행과 Release에는 상세 입력 계측 없음.
  추후 계측 재실행은 devicectl `--environment-variables '{"BREEZE_INK_TRACE":"1"}'`.
- 최종 Debug 빌드 성공. 이 검증 시점에 배포/Archive/TestFlight/commit/push/PR/merge 없음.

남은 검증 경계: 실제 finger를 계속 붙인 pan/pinch에 late Pencil을 넣는 경우,
여러 palm이 남는 복합 충돌, 백그라운드 중단, 업데이트 전 오래된 획 전체의
복원은 이번 사용자 응답만으로 모두 실기기 통과라고 하지 않음. 해당 입력
시퀀스/저장/3색·3굵기/Undo·Redo는 브라우저 회귀 통과와 구분해 기록.
iOS 17.4 미만 fallback, 다른 iPad/iOS와 장시간 시험지는 별도 미검증.
- 최종 계측 opt-in Debug 앱을 기존 앱에 업데이트 설치하고, 환경변수 없이
  재실행 완료. `/tmp/breeze-inertia-final-install.json`, `-launch.json`.
  번들 내 ink/pinch JS 및 index SHA256 일치 확인. 앱 삭제/저장 초기화 없음.
