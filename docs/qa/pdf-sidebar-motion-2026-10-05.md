# PDF 페이지 사이드바 열기·닫기 비교

기준 main: `93d38f2a73069910e2bc7e293a436f2702677519`, Breeze 1.8(235).
작업 브랜치: `codex/pdf-sidebar-motion`, 별도 worktree `/workspace/breeze-pdf-sidebar`.
기존 작업 공간과 QA 저장소 수정·RSS 작업은 건드리지 않았다.

## 확인 결과와 수정

열기·닫기 모두 **220ms**, 이동 거리는 모두 **12 CSS px**였다. 패널은 최종
크기로 배치되고 본문 폭은 바뀌지 않는다. 차이는 곡선이었다.

| 대상 | 수정 전 easing | 수정 후 easing | 시간 |
| --- | --- | --- | --- |
| 표면 열기 | `cubic-bezier(.2,.75,.25,1)` | `cubic-bezier(.45,0,.8,.35)` | 220ms 유지 |
| 표면 닫기 | `cubic-bezier(.45,0,.8,.35)` | 동일 | 220ms 유지 |
| 내부 목록 열기 | 별도 `ease` 페이드 | 표면의 opacity를 따름 | 중복 220ms 페이드 제거 |

열기는 같은 시간의 초반에 대부분의 이동을 마쳤다. 닫기가 좋다는 사용자의
평가에 맞춰 열기 곡선만 닫기와 같게 했다. 표면과 내부 목록의 투명도를 별도로
곱하지 않게 해서 열기·닫기 모두 한 표면이 표시를 소유한다.

기존 keyframe은 중간 반전 시 반대쪽 고정 끝점에서 다시 시작했다. 느려진
열기에서 이 점프가 커지지 않도록, 기존 toggle/close 함수가 방향 전환 시
현재 위치·투명도를 한 번 읽어 keyframe의 시작점으로 넘긴다. 새로운 타이머,
프레임 루프, 제스처 소유자나 전역 손짓 변경은 없다. 정상 닫기 경로와 220ms
정리 타이머, 캐시·세대 취소·inert·초점 복귀는 유지한다.

## 실제 Chromium 측정

Chromium 151.0.7922.173, Playwright 1.63.0, 390×844 터치 viewport,
실제 앱 CSS와 PDF.js로 생성한 3쪽 fixture PDF를 사용했다. 버튼/접기/바깥
닫기는 Playwright 실제 탭이다. 가장자리 입력은 합성 TouchEvent 및 별도로
Chromium CDP의 trusted 터치 두 경로를 측정했다.

아래 수치는 이벤트 핸들러 진입부터 **12px 이동의 절반을 넘는 두 관측 프레임
사이의 ms 범위**다. 열기는 각각 3회, 닫기 버튼은 6회, 바깥 닫기는 2회,
Escape는 1회다. 약 16.7ms 간격의 프레임으로 측정하므로 한 점의 정확한
통과 시각이나 실기기 지연으로 해석하지 않는다.

| 경로 | 수정 전 절반 이동 | 수정 후 절반 이동 |
| --- | ---: | ---: |
| 열기 버튼 | 27.1–48.5ms | 177.6–197.9ms |
| 가장자리 release, trusted Chromium 터치 | 27.0–45.2ms | 175.6–195.6ms |
| 가장자리 release, 합성 TouchEvent | 19.4–36.7ms | 168.5–188.0ms |
| 접기 버튼 | 180.6–198.4ms | 179.3–198.0ms |
| 바깥 탭 | 179.7–198.5ms | 181.3–198.6ms |
| Escape | 173.6–190.3ms | 174.2–190.7ms |

브라우저 animation.currentTime 기준 절반 이동은 수정 전 열기 약 16.6–33.4ms,
닫기 약 166.6–183.4ms 사이였다. 수정 후는 모든 경로가 약 166.6–183.4ms
사이로 같아졌다. 버튼과 release 이벤트의 프레임 위상이 달라 wall clock
수치는 조금씩 다르다. 총 220ms라는 설정만 보고 열기·닫기가 같은 속도라고
판단하지 않았다.

브라우저 애니메이션을 0/55/110/165/220ms로 seek한 실제 computed style도
확인했다. 수정 후 110ms에서 열기와 닫기 모두 전체 이동의 **17.335%**를
진행했다. 시작점 대비 2.0802px 이동이며, 열기 opacity는 0.17335, 닫기는
0.82665다. width는 계속 144px였다. 내부 opacity는 1로 유지된다.

전체 종료도 구분했다. 수정 전 열기 버튼의 최종 프레임은 약 248ms에 관측됐고
닫기 버튼의 숨김/정리는 약 230–231ms에 관측됐다. 즉, 열기가 총 수명까지
짧다는 뜻은 아니다. 열기는 초반 진행이 빠른 것이 문제였다. 기존 닫기 타이머는
핸들러에서 220ms 후 실행되므로 CSS animation 시작 프레임과 완전히 일치하지
않는다. 일부 trial에서는 90% 이동 프레임을 관측하기 전에 정리가 실행된다.
그 경우 JSON의 `ninetyTravelMs`는 null이며, 이를 220ms 완주 측정으로
표현하지 않았다. 닫기 타이머와 느껴지는 닫기 수명은 바꾸지 않았다.

## 손가락 입력과 settlement

현재 승인된 구현은 finger-tracked 패널이 아니다. 왼쪽 24px에서 시작한
오른쪽 입력을 기존 original-input 소유자가 받고, 60px 이상 이동한 뒤 손을
뗄 때 `togglePdfNavigation()`을 부른다. 이동 중에는 패널 애니메이션이 없다.
이번 테스트에서도 이동 후 약 180ms 동안 손을 유지한 채 패널이 닫혀 있음을
확인하고, release 이후의 220ms 애니메이션만 별도로 측정했다. 손가락을
움직이거나 유지한 시간은 settlement 시간에 더하지 않았다.

버튼과 가장자리 release는 같은 열기를 사용한다. 닫기는 헤더 접기 버튼,
바깥 탭, Escape, 기존 모드/세션 정리 경로다. 현재 swipe-to-close/interactive
edge completion 경로는 없다. 손가락 추적을 새로 만들거나 지연시키지 않았다.
확대·pinch·필기·선택 소유권과 원본 zoom 제외 조건을 그대로 유지했다.

## 검증

- 새 focused browser 회귀가 원래 main에서 기존 easing 차이로 실패하는 것을
  확인했고, 수정 후 Chromium에서 통과했다.
- 35/90/170ms 시점의 열기→닫기→열기 반전에서 직전·직후 위치와 opacity가
  같았다. 이전 닫기 정리가 재열림을 숨기지 않았다. 12회 빠른 토글도 최종
  hidden/inert/backdrop/aria 상태가 일치했다.
- 짧은/취소/수직/추가 손가락/resize 입력 제외와 zoom 1.5 제외를 확인했다.
- 320×568, 390×844, 650×600, 760×900, 761×900, 820×1180, 1440×900,
  844×390 각각 light/dark, 총 16개 상태에서 sidebar bounds와 본문 geometry를
  확인하고 캡처했다. 양방향 도중 resize 및 reduced motion 즉시 닫기도 통과했다.
- 기존 `verify-reader-input-gestures-browser`, `verify-epub-navigation-input-browser`,
  `verify-reader-chrome-motion-browser` Chromium 회귀가 통과했다. 공유 sidebar를
  쓰는 EPUB의 프리뷰/탭/선택, 주변 Reader control motion도 확인했다.
- reader-input/PDF ink/PDF session 단위 회귀 **61개**와 gesture ownership 검사,
  구조 검사가 통과했다. typecheck는 기존 지적 34개가 늘지 않았다.
- WebKit은 설치된 실행 파일이 없고 Playwright 다운로드의 모든 mirror가
  `403 Domain forbidden`으로 실패해 실행하지 못했다. native iPhone/iPad나
  WKWebView의 프레임 속도·Pencil 순서를 검증했다는 주장은 하지 않는다.

전체 `npm test`는 stamp/build 문서를 포함하므로 이 제한된 모션 수정에서는
실행하지 않았다. main merge, 공개 PR, push, 버전/빌드 번호 변경, 배포는 없다.

## 재실행과 증거

```sh
BREEZE_QA_ENGINE=chromium BREEZE_BROWSER_EXECUTABLE=/usr/bin/chromium npm run test:pdf-sidebar
```

기본 명령은 Chromium과 WebKit을 모두 사용한다. 브라우저가 설치된 환경에서
WebKit만 실행하려면 `BREEZE_QA_ENGINE=webkit npm run test:pdf-sidebar`를 사용한다.
`BREEZE_QA_ROOT`는 별도 baseline worktree를 읽는 용도이며 `--measure-only`는
수정 전 easing을 허용하면서 측정한다.

tracked 측정 요약은 [JSON](pdf-sidebar-motion-2026-10-05-measurements.json)에 있다.
원시 프레임·로그·16개 캡처와 공개하지 않은 PR 초안은 로컬
`/workspace/pdf-sidebar-review/`에 보관한다.
