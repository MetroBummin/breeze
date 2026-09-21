# Breeze pure-AI lookup audit — 2026-09-21

조사 결과: 사용자 제보 4개 영역 모두에서 재현 가능한 문제가 확인됐다. 프롬프트만 조정해서 해결할 수 있는 상태는 아니다. 삭제 범위, 현재 클릭 위치/문맥, 캐시 식별자, 표현 저장, 응답 검증을 함께 다뤄야 한다.

## 기준과 범위

- 소스: `breeze-reader-layout-stability`, commit `86f5172`.
- 운영 웹 `https://breeze.io.kr/scripts/dictionary/dictionary.js`와 조사 소스의 SHA-256 일치: `793c2e42502d14b0413e32ea5ded28fb3c0599e6dbd8f27b9e06c8b080049dc2`.
- Supabase `dict`: ACTIVE v48. 서버를 직접 읽어 JEV/detail 제거를 확인했다. 과거 lookup 브랜치 `0bc0eb5`와 과거 벤치마크는 현재 기준으로 사용하지 않았다.
- 실제 운영 AI 호출 10회: 테스트용 단일 anonymous device의 정상 체험 한도 안에서 실행. 10/10 HTTP 200, 모두 OpenRouter. 실제 응답시간 728–1925ms. 이 작은 표본을 전체 정확도로 환산하지 않는다.
- 브라우저 재현: 별도 Chromium 프로필, 로컬 실제 앱 소스, 합성 TXT/단어 데이터, 외부 네트워크 차단, AI 응답 mock. 사용자의 실제 단어장이나 계정을 수정하지 않았다.
- 서버 방어 검증: 실제 TypeScript 소스를 transpile한 격리 VM에 비정상 AI 응답 주입. 운영 서버에 비정상 데이터를 저장하지 않았다.
- 제품 소스, 프롬프트, DB, 배포, iOS 번들은 변경하지 않았다. 체크아웃의 기존 iOS 수정/빌드 파일도 유지했다.

## 확인된 문제

### 1. P1 — ‘단어장에서 빼기’의 삭제 범위가 선택한 뜻에 따라 다름

`bank` 아래 `은행`, `강둑`을 저장하고 하위 뜻을 선택한 뒤 `p-know`를 누르면 하위 뜻만 삭제된다. 대표 `bank`는 남는다. 대표 카드에서 누를 때만 전부 삭제된다. 3개 뜻을 만든 뒤 마지막 뜻에서 삭제하는 반복 100/100회에서 다른 뜻이 남았다.

원인: [dictionary.js:863](../breeze-reader-layout-stability/scripts/dictionary/dictionary.js#L863)의 `if(!root)` 조건. ‘뜻 하나 삭제’와 ‘단어 전체 삭제’는 이미 별도 UI이므로 전체 삭제는 `words[k].root || k` 기준으로 모든 하위 카드와 삭제 기록을 처리해야 한다. 다른 단어/표현까지 광범위하게 지우라는 의미는 아니다.

### 2. P1 — 미니 pill과 상세창의 재시도 문맥이 서로 다름

- 미니 pill `retryWordPeek`: 현재 한 문장만 전송. 앞뒤 문장을 포함하지 않는다.
- 상세 `askWiderContext`: `currentContext`가 아니라 저장 당시 `w.example`을 사용한다.
- 실제 재현: 화면은 `He sat by the bank of the river.`를 보고 있는데 상세 재시도는 과거의 `He visited the bank for a loan.`부터 확장했다. 두 bank가 생기면서 `clickedIndex`는 **bank가 아닌 첫 토큰 He의 0**으로 전송됐다.

근거: [dictionary.js:548](../breeze-reader-layout-stability/scripts/dictionary/dictionary.js#L548), [dictionary.js:1275](../breeze-reader-layout-stability/scripts/dictionary/dictionary.js#L1275), `browser-results.json`의 `pillRetry`, `detailRetry`.

해결 방향: 양쪽 버튼이 하나의 요청 생성기를 사용. 현재 클릭의 문장·문단 위치·단어 occurrence를 유지하고 앞/현재/뒤 문장을 별도 필드로 전달. ‘3줄’은 화면 폭에 따라 바뀌므로 **현재 문장 + 앞뒤 한 문장**을 기준으로 삼는 것이 안정적이다. 확대된 문자열 안에서 clickedIndex를 다시 매핑해야 한다.

### 3. P1 — 문맥 확장 시 정작 질문하는 문장이 사라짐

문단 경계에서는 이전/다음 ‘문장’ 대신 문단 전체를 붙인다. 이후 앞에서 600자를 자른다. 앞 문단이 길면 현재 문장이 전부 잘린다. 테스트에서 반환 600자에 target이 없었다. 동일 문장이 여러 번 있으면 `findIndex`는 첫 번째 문단을 고른다.

근거: [dictionary.js:43](../breeze-reader-layout-stability/scripts/dictionary/dictionary.js#L43), `browser-results.json: expansion`.

서버도 sentence만 600자로 자르고 클라이언트 tokens를 별도로 받아 일치 여부를 검증하지 않는다. 긴 원문에서는 문장과 token 좌표가 어긋날 수 있다. 현재 문장/누른 토큰을 먼저 보존하고 주변 문맥만 예산에 맞춰 잘라야 한다.

### 4. P1 — 운영 AI의 숙어 판정이 같은 입력에서도 불안정

동일한 `His reckless announcement upset the apple cart.`에서 apple 클릭:

| 호출 | kind / canonical | 뜻 | members |
|---|---|---|---|
| 1 | expression / upset the apple cart | 계획을 망치다 | `[3,5,6]`: the 누락 |
| 2 | word / apple | 사과 | `[5]` |
| 앞뒤 문장 추가 | expression / upset the apple cart | 계획을 망치다 | `[10,12,13]`: the 누락 |

`a feather in your cap`도 canonical은 `a feather in one's cap`인데 members에서 고정 관사 `a`를 누락했다. `give up`의 분리된 목적어 처리는 이번 표본에서 정상. literal apple, Apple 회사, 보통 collocation도 대조군으로 호출했다.

원인 후보: 현재 prompt는 word 기본값/표현 억제 지시와 word 형태의 최종 예시를 강하게 둔다. 다만 프롬프트의 특정 문구가 원인이라는 인과관계는 아직 A/B 검증하지 않았다. 표현의 고정 구성원 누락은 prompt 지시 위반인데 서버가 그대로 수용한다.

`Apple's cart`의 정확한 원문은 제공되지 않았다. 임의로 숙어로 단정하지 않고 `upset the apple cart`, Apple 회사, 소유격 apple을 분리해 검사했다. 3문장 한 번의 성공을 개선 효과로 확정하지 않는다.

### 5. P1 — 저장된 단어는 새 문맥에서도 AI를 호출하지 않음

`은행`이 저장된 bank를 강둑 문장에서 열면 그대로 `은행`이 즉시 표시되며 AI 호출은 0회다. 같은 문맥 기록이 없으면 최근 뜻을 고르는 현재 정책이다. 따라서 표현을 못 잡는 원인에는 모델 실패뿐 아니라 **애초 모델에 묻지 않은 경우**도 있다. 이미 apple이 저장돼 있다면 숙어 속 apple에도 이 경로가 적용될 수 있다.

근거: [dictionary.js:355](../breeze-reader-layout-stability/scripts/dictionary/dictionary.js#L355), `browser-results.json: savedWrongContext`.

이는 순수 AI 전환 과정의 명시적 재사용 정책이므로 무조건 매 탭마다 요청하도록 바꾸자는 결론은 아니다. 동일 문맥/위치 캐시는 유지하고 새로운 문맥의 확인 정책을 별도로 결정해야 한다. JEV를 되살릴 필요는 없다.

### 6. P2 — 줄바꿈 단어의 pill이 두 조각 사이 중앙에 뜸

390px viewport에서 실제 inline 단어 `well-established`를 줄 끝/다음 줄에 걸치게 했다. 단어 조각은 각각 x=255–308, x=26–146인데 anchor는 두 조각의 합집합 x=26–308이다. pill은 약 x=167 중심에 놓여 누른 단어 조각과 떨어진다.

근거: [dictionary.js:394](../breeze-reader-layout-stability/scripts/dictionary/dictionary.js#L394), `browser-results.json: splitGeometry`, [재현 화면](split-word.png).

`getBoundingClientRect()`는 여러 줄을 감싼 전체 사각형이다. `getClientRects()` 중 클릭 좌표가 속한 조각을 선택해야 한다. iframe/zoom 변환도 동일 좌표계에서 검증해야 한다. 이번 재현은 Chromium이며 실제 iPhone에서의 확인은 별도다.

### 7. P1 — 표현 저장이 사용자가 직접 고친 뜻을 덮어씀

`saveDetectedExpression()`이 같은 canonical의 기존 카드를 발견하면 `ko`, `ai`, example 등을 바로 덮어쓴다. 기존 `koEdited:true`는 spread 때문에 남으면서 뜻은 AI 값으로 바뀐다. `사용자가 적은 뜻`이 `포기하다`로 바뀌는 것을 재현했다.

근거: [dictionary.js:1105](../breeze-reader-layout-stability/scripts/dictionary/dictionary.js#L1105), `browser-results.json: expressionOverwrite`.

단어의 `applyLook`에는 수동 편집 보존 규칙이 있지만 표현 저장은 이를 우회한다. 표현도 기존 뜻/새 뜻/직접 편집의 같은 저장 규칙을 지나야 한다.

### 8. P1 — 표현 재저장 시 삭제 기록을 처리하지 않음

`saveDetectedExpression()`은 `dead[phraseId]`를 제거하거나 그 시각보다 큰 `up`을 보장하지 않는다. 삭제 시간이 앞선 기기에서 넘어온 상태를 fixture로 넣으면 살아 있는 카드와 더 최신 삭제 기록이 동시에 남았다. 실제 `mergeWordState`는 삭제 시각이 더 크거나 같으면 카드를 지운다.

근거: 같은 저장 함수, [sync.js:533](../breeze-reader-layout-stability/scripts/sync/sync.js#L533), `browser-results.json: expressionTombstone`.

이 테스트는 미래 삭제 시각을 넣은 동기화 경계 재현이다. 모든 일반 재추가가 사라진다고 주장하지 않는다. 명시적 재추가와 자동 캐시 채택을 구분한 삭제 기록 정책이 필요하다.

### 9. P1 — 같은 문장 안 반복 단어의 캐시가 클릭 위치를 잃음

캐시 키는 word + sentence hash이며 occurrence가 없다. cached expression 복원 시에도 현재 node를 전달하지 않고 `lookupClickedTokenIndex(null, ...)`를 사용한다. `I take notes and take off.`의 두 take 중 take off 결과를 캐시에 두면 위치를 결정하지 못해 표현 생성이 실패한다. 결과적으로 단일 take 카드에 `떠나다`만 붙었다.

근거: [dictionary.js:1130](../breeze-reader-layout-stability/scripts/dictionary/dictionary.js#L1130), `lookKey`, `expressionFromMini`, `browser-results.json: repeatedCache`.

문맥 캐시는 token occurrence 및 응답 계약 버전을 포함해야 한다. 과거 프롬프트의 잘못된 답을 재사용하지 않도록 버전 정책도 필요하다.

### 10. P1 — 잘못된 표현 응답을 조용히 단어 뜻으로 저장할 수 있음

서버에 AI 응답 fixture `{kind:'expression', canonical:'upset the apple cart', members:[1], ko:'계획을 망치다'}`를 넣었다. clicked apple을 포함하지 않으므로 서버는 expression을 word로 바꾸지만 뜻은 유지한다. 결과: **apple = 계획을 망치다**, HTTP 200.

또한 members에 null을 넣으면 `Number(null)` 때문에 index 0으로 바뀌어 유효 구성원으로 통과한다. 정상 정수 배열을 검증하기 전에 형 변환하는 문제다.

근거: [server/dict/index.ts:89](../breeze-reader-layout-stability/server/dict/index.ts#L89), `server-results.json`.

잘못된 표현은 한정된 재검증/복구 또는 명시적 오류로 처리해야 한다. 단어로 바꾸려면 그 단어의 뜻까지 새로 검증해야 한다.

### 11. P2 — JSON/의미 검증 실패에는 provider fallback이 작동하지 않음

OpenRouter가 HTTP 성공이지만 `not json`을 반환하도록 주입했을 때 502 parse_failed, provider 호출은 OpenRouter 한 번뿐이었다. fallback 루프는 전송 실패를 잡지만 JSON 검증은 루프 바깥이다. 빈 뜻도 같은 구조다. provider fetch에는 별도 시간 제한이 없으며 클라이언트의 9초 취소가 서버 작업 취소를 보장하지 않는다. 후자는 코드 확인 사항으로, 이번 운영 표본에서 timeout을 관측한 것은 아니다.

## 테스트 결과와 한계

기존 테스트 모두 통과:

```
node tests/verify-word-lifecycle.mjs
node tests/verify-word-integrity.mjs
node tests/verify-word-spans.mjs
node tests/verify-lookup-architecture.mjs
node tests/verify-word-presentation-browser.mjs
```

기존 lifecycle에는 60회 열기/닫기 검증이 포함된다. 기존 테스트가 통과해도 위 조합들은 빠져 있었다. 새 audit는 브라우저 재현 11개 항목(삭제 100회 포함), 서버 비정상 응답 4개, 실제 운영 AI 10회를 기록한다. 부하/동시성 규모를 운영 서버에 크게 가하는 시험이나 188개 과거 벤치마크의 재실행은 하지 않았다. 과거 harness는 제거된 judge/detail을 포함해 그대로 쓰면 현재 품질 측정이 왜곡된다.

새 재현 실행:

```
cd /Users/kosangbum/Desktop/breeze/lookup-audit-2026-09-21
node browser-audit.mjs
node server-audit.mjs
```

`live-audit.mjs`는 운영 AI를 실제 10회 호출하므로 일반 로컬 회귀에는 포함하지 않는다. 그 응답은 `live-results.json`에 보존했다. UI/API의 응답 내용과 관측을 구분했고, 모델 정확도를 mock 시험으로 주장하지 않았다.

## 권장 수정 순서

1. 전체 단어 삭제 범위와 표현의 사용자 편집/삭제 기록 보존부터 수정.
2. 현재 클릭 위치를 유지하는 요청 builder와 앞뒤 문장 context를 미니/상세 재시도에 공통 적용. target 우선 길이 제한 및 occurrence 기반 캐시 적용.
3. 줄바꿈 단어 fragment anchor 적용, Text/EPUB/PDF·확대·스크롤·iPhone 검증.
4. 응답 schema/lexical identity 검증과 제한된 오류 복구 구현.
5. 그 기반에서 프롬프트 A/B. 숙어/일반 결합/고유명사/반복 단어를 분리하고 canonical·members·한국어 뜻을 각각 평가. input 증가만으로 정확도가 해결됐다고 판단하지 않음.

수정·배포 전 단계의 조사 결과다. 코드 수정 및 배포 완료를 의미하지 않는다.
