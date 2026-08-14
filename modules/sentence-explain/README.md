# 문장 해석 — 접어 둔 일 (2026-08-14)

문장 하나를 통째로 AI 에게 물어보는 기능입니다. 낱말을 다 알아도 안 읽히는
문장 — 관계절이 겹쳤거나, 도치됐거나, 낱말은 쉬운데 합쳐 놓으니 다른 뜻이
되는 관용구 — 앞에서 필요한 한 마디를 받아 옵니다.

**지금은 접어 두었습니다.** 코드는 지우지 않고 여기로 옮겨 연결만 끊었습니다 —
`modules/dict-seed/`, `modules/exam-shorts/` 와 같은 방식입니다.

## 왜 접었나

단어 팝업 안에 살고 있었기 때문입니다. 팝업 안에는 단추 하나(`#p-explain`),
왜 못 쓰는지 알려 주는 설명 한 줄(`#p-explain-note`), 오늘 몇 번 남았는지 세는
줄, 그리고 답이 뜨는 카드(`#p-sentence`)까지 네 가지가 있었습니다. 팝업이 다뤄야
하는 것은 **뜻 하나**인데, 화면의 절반이 문장 이야기였습니다.

문장 해석은 낱말의 곁가지가 아니라 그 자체로 하나의 기능입니다. 그래서 팝업에서
덜어내고, 자기 손짓·자기 화면을 가진 별개의 기능으로 다시 세우기로 했습니다.

**없어도 앱은 그대로 돕니다.** 서버의 `op:"explain"` 갈래도, 캐시 열쇠(`s:<해시>`)도
그대로 살아 있습니다. 잃은 것은 들어가는 문 하나뿐입니다.

## 무엇이 남아 있나

| 어디 | 무엇 | 상태 |
|---|---|---|
| `modules/sentence-explain/sentence.js` | 캐시 확인 → 서버 질문 → 카드 그리기 | **떼어 둠** — 앱이 읽지 않습니다 |
| `modules/sentence-explain/sentence.css` | 카드의 모양 | **떼어 둠** — 되살릴 때 함께 싣습니다 |
| 낱말 팝업 안의 단추·설명·횟수 줄 | 들어가는 문 | **제거됨** — 꾹 누르기로 다시 만듭니다 |
| `server/dict/index.ts` 의 `op:"explain"` | 서버 갈래 (2회 소모) | **살아 있음** |
| `.aurora` (styles/dictionary.css) | 기다리는 동안의 빛 | **살아 있음** — 낱말과 문장이 같은 것을 씁니다 |

## 되살리는 순서

1. `index.html` 에 두 줄을 더합니다. 스크립트는 `scripts/dictionary/dictionary.js`
   **뒤에** 와야 합니다 — `sentenceHash`, `dictGet/dictPut`, `dictCall`, `aiDay` 를
   그쪽에서 빌려 씁니다.
   ```html
   <link rel="stylesheet" href="modules/sentence-explain/sentence.css">
   <script defer src="modules/sentence-explain/sentence.js"></script>
   ```

2. 손짓을 답니다. **낱말 Tap = 단어 팝업, 낱말 Long Press = 문장 해석** 입니다.
   `openSentence(문장)` 하나만 부르면 되고, 카드는 모듈이 스스로 만들어
   `document.body` 에 붙입니다. 물어볼 문장은 `sentenceOf(누른 낱말 span)`
   (scripts/dictionary/dictionary.js) 가 알려 줍니다.

3. 들어오는 문은 세 곳입니다 — 글자 화면(`#rtext` 의 `.w`), 원본 PDF, 원본 EPUB.
   **한 곳에만 달지 마세요.** 예전에 폰에서만 되는 문을 만들었다가, 같은 기능이
   기기마다 다르게 굴어 결국 통째로 걷어냈습니다.

## 꾹 누르기에서 반드시 지킬 것

- **누르는 동안 문장 선택·강조 DOM 을 미리 켜지 않습니다.** 꾹 누르기가 확정된
  뒤에만 문장 해석 UI 를 엽니다. 예전 구현은 손가락이 닿는 순간부터 문장 전체를
  칠할 준비를 해서, 짧은 탭까지 문장 선택으로 오인되어 낱말 탭과 부딪혔습니다.
- **iOS 의 기본 동작을 빼앗지 않습니다.** 예전에는 복사·찾아보기를 막으려고
  `-webkit-touch-callout:none` 을 깔았는데, 그 바람에 읽는 화면에서 글자를 고르는
  일까지 함께 잃었습니다. `tests/verify-structure.mjs` 가 이 규칙이 돌아오지
  않았는지 지금도 지켜보고 있습니다.
- **스크롤하다 멈춘 손가락은 질문이 아닙니다.** 문장 해석은 하루 몫을 2회 씁니다.
  움직임이 있었으면 취소해야 합니다.

## 한도

문장 해석 한 번은 AI 조회 2회(`EXPLAIN_COST`)를 씁니다. 하루 몫은 100회
(`DAILY_LIMIT`)이고, 서버가 답할 때마다 남은 수를 알려 줍니다 —
`rememberSentLeft(left, day)` 가 `breeze.ai-left` 에 적어 둡니다. 같은 문장을 다시
물으면 기기 캐시(`s:<문장해시>`)에서 꺼내므로 한도를 쓰지 않습니다.
