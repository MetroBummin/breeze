# 기출 Shorts (연결 해제됨)

수능·모의고사 **문제지 PDF**를 읽기 문항 단위로 잘라, 한 화면에 한 문항씩
타이머와 함께 보여 주는 기능입니다. 동작하지만 지금은 앱에 연결되어 있지
않습니다 — `index.html`이 이 폴더의 파일을 읽지 않습니다.

## 왜 떼어 놓았나

메인 제품은 **캐주얼 리딩**입니다. 기출 문제지는 그 흐름과 관계가 없고,
쓰지 않는 화면 하나를 상단 네비게이션에 늘 띄워 두는 값이 기능값보다
컸습니다. 지우지는 않았습니다 — 규칙 자체가 자산이라서요(아래 참고).

## 무엇이 검증되어 있나

기출 10종(2026 수능, 2022 대수능 9월 모평, 2025 고3 9월, 2022·2023·2026
고1/고2 3·9월)으로 측정했습니다. **조판·문항 분리에 AI를 쓰지 않습니다.**

| | 결과 |
|---|---|
| 목표 문항 검출 (읽기 18~24, 29~45) | 240 / 240 |
| 발문·지문·선택지 누락 | 0 |
| 좌우 단 접합 줄 | 1,931 → 26 |

`exam.js`의 규칙은 `npm test`가 계속 검사합니다. 떼어 놓은 동안에도 깨지지
않습니다. 규칙 목록은 [ROADMAP.md](../../ROADMAP.md)에 있습니다.

## 다시 연결하는 법

의존하는 것은 이미 앱에 남아 있습니다 — `parsePDF()`가 돌려주는
`sheets`(쪽별 줄 + 내어쓰기 + 세로 위치), `pdfPageColumns()`의 단 가르기,
`wordSpans()`, `openWord()`. 아래 다섯 군데만 되돌리면 됩니다.

**1. `index.html`** — 스타일 하나와 스크립트 둘을 되살립니다.

```html
<link rel="stylesheet" href="modules/exam-shorts/shorts.css">
<!-- importers.js 뒤, dictionary.js 앞 -->
<script defer src="modules/exam-shorts/exam.js"></script>
<!-- sync.js 뒤, interactions.js 앞 -->
<script defer src="modules/exam-shorts/shorts.js"></script>
```

**2. `index.html`** — 화면과 타이머 자리, 네비게이션 버튼을 넣습니다.

```html
<button class="navbtn" id="nav-shorts" onclick="show('shorts')">Shorts</button>

<div class="view" id="v-shorts"><div id="shorts-feed"></div></div>
<div id="shorts-timer"></div>
```

**3. `scripts/core/state.js`** — `show()`에 세 줄, 그리고 진행도 저장을 막는
`shortsActive` 플래그를 되살립니다.

```js
let shortsActive = false;                       // saveReadingState() 위
function saveReadingState(){ if(!curBook || shortsActive) return; … }

// show() 안
document.getElementById('nav-shorts').classList.toggle('on', v === 'shorts');
document.body.classList.toggle('shorts', v === 'shorts');
if(v === 'shorts') openShorts(); else closeShorts();
```

**4. `scripts/library/library.js`** — `prepareImportedFile()`의 반환값에 시험지
판정을 더하고, `importFile()`에서 갈라 보냅니다.

```js
// prepareImportedFile() 안, return 직전
const exam = kind === 'pdf' && parsed.sheets ? parseExam(parsed.sheets) : null;
// …return {…, exam};

// importFile() 안, prepareImportedFile 바로 뒤
if(prepared.exam){ await importExam(prepared); return; }
```

`importExam()`은 `shorts.js` 아래쪽에 함께 옮겨 두었습니다.

**5. `scripts/library/library.js`** — 시험지는 책장에 두지 않습니다.

```js
const list = allBooks().filter(book => book.kind !== 'exam');   // renderHome() 안
```

## 남은 숙제

- **채점.** 문제지 PDF에는 정답표가 없습니다. 지금 코드는 고른 답을 표시만
  하고 맞았다고도 틀렸다고도 말하지 않습니다. 정답표를 넣는 경로가 정해져야
  채점할 수 있습니다.
- AI 쌍둥이 변형 문제, 해설.
