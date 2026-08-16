/* ================= 한 손짓, 한 판정 =================

   사용자가 읽는 화면에서 하는 일은 넷뿐입니다 — 탭하거나, 꾹 누르거나,
   밀거나, 떠 있는 UI 를 누릅니다. 그런데 브라우저는 그 하나를
   `pointerdown → pointermove → pointerup → click` 으로 쪼개어 내놓습니다.

   예전에는 그 조각들을 여섯 군데가 각자 주워서 각자 판정했습니다:

     · 글자판의 `click` 이 낱말을 열고
     · 종이의 `pointerup` 이 낱말을 열고
     · 종이의 `click` 도 낱말을 열고 — 그래서 450ms 로 서로를 걸렀습니다
     · EPUB 틀의 `pointerup` 이 또 낱말을 열고
     · 꾹 누르기가 그 넷과 별개로 시간을 재고
     · 넷이 부딪히지 않게 벽시계 유예가 여섯 개 돌았습니다
       (`sentPressGuardUntil` `sentPressHolding` `lastPdfTap` `lastPdfAttempt`
        `readerScrollPauseUntil` `readerAnchorHoldUntil`)

   판정하는 곳이 여럿이면 새로 만든 예외가 옛 예외와 부딪힙니다. 실제로
   "상단바 뒤의 낱말이 함께 열린다"를 막으려고 넣은 규칙이 "EPUB 에서 낱말이
   안 열린다"를 만들었습니다. 그래서 판정은 여기 한 곳에서만 합니다.

   한 손짓은 정확히 하나로 끝납니다:

     UI        종이가 아니라 그 위에 떠 있는 것에서 시작했다 — 관통하지 않습니다
     SCROLL    손가락이 움직였다 — 읽는 중이지 고르는 중이 아닙니다
     SENTENCE  제자리에서 오래 눌렀다
     WORD      제자리에서 뗐다
     CANCEL    브라우저가 손짓을 가져갔다

   확정된 뒤에 오는 조각들(`pointerup` 뒤의 `click`)은 다시 판정하지 않습니다.
   시계로 거르는 것이 아니라, 그 조각이 **이미 끝난 손짓의 꼬리**임을 알기
   때문에 삼킵니다. 그래서 이 파일에는 450ms 도 600ms 도 없습니다.

   ---- 한 손짓 · 한 임자 · 한 뜻 ----
   판정을 한 곳으로 모았어도, 화면 위에 떠 있는 것들이 여전히 제 길을 따로
   갖고 있었습니다 — 떠 있는 창의 바깥(scrim)은 `onclick` 한 줄로 혼자
   닫혔습니다. 그래서 "바깥을 눌러 닫는 손짓"만은 이 파일이 본 적 없는
   손짓이었고, 그 뒤에 렉·빈 화면·다음 꾹 누르기 오판이 함께 따라왔습니다.

   손짓에는 시작하는 순간 **임자**가 정해집니다:

     SENTENCE_MODAL  해석 창이 떠 있는 동안의 모든 손짓
     WORD_SHEET      낱말 시트가 화면을 덮고 있는 동안의 모든 손짓
     READER          종이(surface) 위에서 시작한 손짓
     UI              그 밖에서 시작한 손짓

   임자는 손짓이 끝날 때까지 바뀌지 않습니다. 손짓 도중에 창이 닫혀 눌렀던
   자리가 사라져도 마찬가지입니다 — 사라진 자리 밑에서 종이가 드러난다고 해서
   임자가 reader 로 넘어가지 않습니다. 시계로 막는 것이 아니라(`300ms`,
   `ignoreNextClickUntil` 같은 것은 여기 없습니다) 애초에 남의 손짓이라서
   해석하지 않는 것입니다.

   "덮고 있는 동안"이 조건인 이유가 있습니다. 낱말 창은 두 가지 물건입니다 —
   폰에서는 화면을 덮는 바텀시트, 넓은 화면에서는 본문 옆에 나란히 서는 칸.
   옆 칸일 때는 덮은 것이 없으므로 종이의 손짓은 그대로 종이 것입니다.
   임자를 정하는 것은 "무엇이 열려 있는가"가 아니라 **무엇이 손가락을 받는가**
   입니다.

   ---- 형식을 모릅니다 ----
   여기서는 "이번 손짓은 WORD 다"까지만 정합니다. 그 자리의 낱말을 실제로
   찾아내는 방법은 종이마다 다르고, 그것은 surface 가 압니다 —
   글자판은 DOM 에서, PDF 는 좌표표에서, EPUB 은 iframe 의 caret 에서.
   이 파일이 `originalSession.kind` 를 보는 일은 없어야 합니다
   (`tests/verify-structure.mjs` 가 지킵니다). */

/* 이만큼 움직였으면 고르는 것이 아니라 미는 것입니다. */
const GESTURE_SLOP = 10;
/* 스크롤하려고 얹은 손가락과 구별되는 길이. 예전에 짧게 잡았다가 얹기만 한
   것까지 질문으로 읽혀 하루 몫이 새 나갔습니다. */
const GESTURE_HOLD_MS = 1000;

/* 시트를 손잡이로 끌어내려 닫는 거리. `scripts/ui/interactions.js` 가 들고 있던
   값 그대로 옮겨 왔습니다 — 시계가 아니라 거리라서 이 파일의 규칙에 맞습니다. */
const SHEET_PULL_DISMISS = 90;

const GESTURE_UI = 'UI', GESTURE_SCROLL = 'SCROLL', GESTURE_WORD = 'WORD',
      GESTURE_SENTENCE = 'SENTENCE', GESTURE_CANCEL = 'CANCEL',
      GESTURE_DISMISS_SENTENCE = 'DISMISS_SENTENCE', GESTURE_DISMISS_WORD = 'DISMISS_WORD',
      GESTURE_DISMISS_AA = 'DISMISS_AA', GESTURE_MODAL_UI = 'MODAL_UI';

/* ---- 종이는 허용 목록입니다 ----
   예전에는 "떠 있는 것"을 하나씩 세어 걸렀고, 새 UI 가 생길 때마다 목록이
   한 줄씩 길어졌습니다. 반대로 둡니다 — 종이라고 적힌 곳에서 시작한 손짓만
   reader 의 것입니다. 그 바깥은 무엇이든 UI 이고, 자기 일만 합니다. */
const READER_PAPER = '#rtext, #originalwrap';

const READER_SURFACES = [];
/* 종이마다 자기를 등록합니다. 등록 순서는 상관없습니다 — 한 손짓은
   `claims()` 가 참인 종이 하나에만 속합니다. */
function registerReaderSurface(surface){ READER_SURFACES.push(surface); }
function readerSurfaceFor(event){
  for(const surface of READER_SURFACES){
    try{ if(surface.claims(event)) return surface; }catch(error){}
  }
  return null;
}

/* ================= 임자 =================

   지금 화면에 해석 창이 떠 있으면, 어디를 눌렀든 그 손짓의 임자는 창입니다.
   창 안의 X 를 눌렀든 창 밖을 눌렀든 똑같습니다 — 둘은 UI 요소로서는 다르지만
   임자가 같아야 reader 가 같은 손짓에 끼어들 수 없습니다.

   낱말 시트도 같습니다. 다만 시트는 폰에서만 화면을 덮습니다 — 넓은 화면에서는
   본문 옆의 칸이라 종이를 가리지 않으므로, 그때는 종이의 손짓을 가져가지
   않습니다. 옆 칸일 때도 임자가 되는 것은 그 칸의 닫기 단추 하나뿐입니다. */
const OWNER_READER = 'READER', OWNER_SENTENCE_MODAL = 'SENTENCE_MODAL',
      OWNER_WORD_SHEET = 'WORD_SHEET', OWNER_AA = 'AA', OWNER_UI = 'UI';

function sentenceModalOpen(){
  const modal = document.getElementById('sentence-modal');
  return !!modal && !modal.hidden;
}
/* 창을 닫는 자리는 둘입니다 — 오른쪽 위의 X, 그리고 창 바깥. */
function sentenceDismissTarget(target){
  if(!target || typeof target.closest !== 'function') return false;
  return !!(target.closest('#ps-close') || target.closest('#sentence-scrim'));
}

function wordPanelOpen(){
  const panel = document.getElementById('panel');
  return !!panel && panel.classList.contains('on');
}
/* 화면을 덮고 있는가. 덮고 있을 때만 그 동안의 손짓이 통째로 시트의 것입니다. */
function wordSheetCovers(){
  return wordPanelOpen() && typeof panelIsSheet === 'function' && panelIsSheet();
}
/* 시트를 닫는 자리는 셋입니다 — 시트 바깥(`#sheetbg`), 넓은 화면의 X(`#p-close`),
   그리고 끌어내리는 손잡이(`#p-handle`). 손잡이만 제자리가 아니라 거리로 닫습니다. */
function wordDismissTarget(target){
  if(!target || typeof target.closest !== 'function') return false;
  return !!(target.closest('#sheetbg') || target.closest('#p-close'));
}
function wordPullTarget(target){
  if(!target || typeof target.closest !== 'function') return false;
  return !!target.closest('#p-handle');
}

/* ---- Aa 도 임자입니다 ----
   보기 설정은 화면을 덮지 않는 작은 창이라, 그 바깥에는 scrim 이 없습니다 —
   바깥이 곧 읽는 종이입니다. 그래서 닫는 일만 판정 계층 **바깥의** document
   click 하나가 맡고 있었고(`scripts/ui/preferences.js`), 그 한 손짓이 종이의
   손짓이기도 했습니다: 뒤에 글자가 있는 자리를 눌러 Aa 를 닫으면 같은 터치가
   낱말 창까지 함께 열었습니다. 해석 창·낱말 시트에서 이미 한 번씩 겪은 그
   자리이고, 고치는 방법도 같습니다.

   임자를 정하는 규칙은 넓은 화면의 낱말 칸과 같습니다 — 덮지 않으므로 창
   자신(과 그 창을 연 단추)에서 시작한 손짓만 창의 몫으로 두면 안쪽 단추들이
   제 `onclick` 을 받고, 그 밖에서 시작한 손짓은 통째로 "닫기" 하나가 됩니다. */
function aaPopOpen(){
  const pop = document.getElementById('aa-pop');
  return !!pop && pop.classList.contains('on');
}
/* 창 안과 그 창을 연 Aa 단추는 자기 일을 합니다. 그 밖은 전부 닫는 자리입니다. */
function aaOutside(target){
  if(!target || typeof target.closest !== 'function') return true;
  return !(target.closest('#aa-pop') || target.closest('#aafab'));
}

/* ================= 지금 판정 중인 손짓 ================= */

let gestureSeq = 0;
let activeGesture = null;
/* 방금 끝난 손짓. 뒤따라오는 `click` 이 새 손짓인지 꼬리인지 이것으로 압니다. */
let lastGesture = null;

/* 손짓이 일어난 문서. EPUB 은 장마다 제 문서라, 좌표를 물어볼 곳이 어디인지
   종이가 이것으로 압니다. */
let gestureDocument = null;
function readerGestureDocument(){ return gestureDocument; }

function gestureLog(gesture, note){
  if(!readerGestureDebug()) return;
  const lines = [
    `Gesture #${gesture.id}`,
    `owner: ${gesture.owner || '—'}`,
    `source: ${gesture.surface ? gesture.surface.name : '—'}`,
    `start target: ${gesture.startTag}`,
    `move: ${Math.round(gesture.moved)}px`,
    `duration: ${Math.round((gesture.endedAt || performance.now()) - gesture.startedAt)}ms`,
    `decision: ${gesture.decision || '(pending)'}`,
    `actions dispatched: ${gesture.dispatched}`,
  ];
  if(gesture.adapterCall) lines.push(`adapter call: ${gesture.adapterCall}`);
  if(gesture.decision === GESTURE_SENTENCE) lines.push('WORD dispatched: no');
  if(gesture.surface && typeof gesture.surface.trace === 'function'){
    try{ lines.push(gesture.surface.trace()); }catch(error){}
  }
  if(gesture.completed != null) lines.push(`completed: ${gesture.completed ? 'yes' : 'no'}`);
  if(note) lines.push(note);
  console.log(lines.join('\n'));
}

/* ---- 이 리팩터링이 지키려는 단 하나의 약속 ----
   한 손짓에서 뜻 있는 action 은 많아야 하나입니다. 이 줄이 울리면 새 버그가
   어느 계층인지 물을 필요가 없습니다 — 판정 계층이 깨진 것입니다.
   개발 모드가 아니어도 셉니다. 세는 값은 숫자 하나라 값이 싸고, 이 약속이
   깨진 것을 조용히 넘기는 것이 이 구조를 만든 이유를 지웁니다. */
function countDispatch(gesture, what){
  gesture.dispatched = (gesture.dispatched || 0) + 1;
  if(gesture.dispatched > 1){
    console.error(`[breeze] gesture invariant broken: #${gesture.id} dispatched `
      + `${gesture.dispatched} actions (latest: ${what}, decision: ${gesture.decision})`);
  }
}

/* 개발/디버그에서만 켭니다. `?gesture=1` 로 한 번 켜면 이 기기에 남습니다. */
let gestureDebugFlag = null;
function readerGestureDebug(){
  if(gestureDebugFlag === null){
    let stored = false;
    try{
      if(/[?&]gesture=1/.test(location.search)) localStorage.setItem('breeze.debug.gesture','1');
      if(/[?&]gesture=0/.test(location.search)) localStorage.removeItem('breeze.debug.gesture');
      stored = localStorage.getItem('breeze.debug.gesture') === '1';
    }catch(error){}
    gestureDebugFlag = stored;
  }
  return gestureDebugFlag;
}

function finishGesture(gesture, decision, completed){
  if(gesture.decision) return;
  gesture.decision = decision;
  gesture.completed = completed === undefined ? null : !!completed;
  gesture.endedAt = performance.now();
  if(gesture.holdTimer){ clearTimeout(gesture.holdTimer); gesture.holdTimer = 0; }
  if(activeGesture === gesture) activeGesture = null;
  /* ---- 끝난 손짓은 모두 꼬리를 남깁니다 ----
     처음에는 낱말·문장으로 끝난 것만 남겼습니다. 그러자 밀어서 SCROLL 로 끝난
     손짓의 뒤에 오는 `click` 이 **앞선 손짓이 없는 것처럼** 보여서, 아래의
     "click 만 오는 기기" 길로 빠져 낱말이 열렸습니다. 실기기에서 이것은
     "밀었는데 낱말 창이 떴다" 입니다.
     무엇으로 끝났든 손가락이 닿았던 사실은 남겨야 합니다. UI 에서 시작한
     손짓만 예외입니다 — 그 click 은 UI 가 받아야 할 자기 것입니다. */
  lastGesture = decision === GESTURE_UI ? null : gesture;
  gestureLog(gesture);
}

/* ================= 손짓의 한살이 ================= */

function beginGesture(event){
  /* 앞의 손짓이 아직 살아 있다면 그것은 끝난 것입니다 — 손가락 하나가
     기준이므로 새 pointerdown 은 곧 앞것의 끝입니다. */
  if(activeGesture) finishGesture(activeGesture, GESTURE_CANCEL);
  lastGesture = null;

  /* 마우스의 오른쪽·가운데 단추는 우리 손짓이 아닙니다. Touch PointerEvent 의
     `button` 은 브라우저마다 0/-1 로 달라서, 마우스일 때만 봅니다. */
  if(event.pointerType === 'mouse' && event.button !== 0) return;
  if(event.isPrimary === false) return;

  const target = event.target;
  if(!target || typeof target.closest !== 'function') return;

  gestureDocument = target.ownerDocument || document;
  const gesture = {
    id: ++gestureSeq,
    pointerId: event.pointerId,
    x: event.clientX, y: event.clientY,
    moved: 0,
    startedAt: performance.now(),
    startTag: (target.tagName || '?').toLowerCase(),
    owner: null, surface: null, decision: null, completed: null, dispatched: 0,
    adapterCall: '', holdTimer: 0, tailClickUsed: false, dismisses: false,
    pulls: false, dy: 0,
  };

  /* ---- 창이 떠 있으면 임자는 창입니다 ----
     여기서 정한 임자는 손짓이 끝날 때까지 그대로입니다. 아래에서 창을 닫아
     scrim 이 사라져도 이 손짓은 계속 창의 것이고, 그래서 뒤따라오는
     `pointerup` 도 `click` 도 종이로 내려가지 않습니다.

     둘 다 떠 있을 수 있습니다 — 낱말 시트 위에 해석 창이 겹칩니다. 위에 있는
     것이 손가락을 받으므로 해석 창을 먼저 봅니다. */
  if(sentenceModalOpen()){
    gesture.owner = OWNER_SENTENCE_MODAL;
    gesture.dismisses = sentenceDismissTarget(target);
    activeGesture = gesture;
    return;
  }

  /* 시트가 덮고 있으면 그 동안의 모든 손짓이 시트의 것이고, 옆 칸일 때는
     그 칸의 닫기 단추에서 시작한 손짓만 시트의 것입니다. */
  if(wordSheetCovers() || (wordPanelOpen() && wordDismissTarget(target))){
    gesture.owner = OWNER_WORD_SHEET;
    gesture.dismisses = wordDismissTarget(target);
    gesture.pulls = wordPullTarget(target);
    activeGesture = gesture;
    return;
  }

  /* Aa 가 열려 있고 그 바깥에서 시작했으면, 이 손짓은 통째로 Aa 의 것입니다.
     종이를 보기 전에 봅니다 — 뒤에 글자가 있는 자리가 바로 그 "바깥"이라, 종이가
     먼저 가져가면 애초에 고치려는 것이 안 고쳐집니다. */
  if(aaPopOpen() && aaOutside(target)){
    gesture.owner = OWNER_AA;
    gesture.dismisses = true;
    activeGesture = gesture;
    return;
  }

  const surface = readerSurfaceFor(event);
  if(!surface){
    gesture.owner = OWNER_UI;
    /* 종이가 아닙니다. 상단바·확대 단추·낱말 창·해석 창에서 시작한 손짓은
       그 뒤에 무엇이 깔려 있든 reader 로 내려가지 않습니다. 예전에는 좌표만
       보고 판단해서, 상단바의 "단어장"을 누르면 그 뒤의 낱말이 함께 열렸습니다. */
    gesture.decision = GESTURE_UI;
    gesture.endedAt = performance.now();
    gestureLog(gesture);
    return;
  }

  gesture.owner = OWNER_READER;
  gesture.surface = surface;
  activeGesture = gesture;
  gesture.holdTimer = setTimeout(()=>holdGesture(gesture), GESTURE_HOLD_MS);
}

/* ---- 창의 손짓이 끝나는 자리 ----
   시작할 때 X 나 바깥을 짚고 있었고 손가락이 제자리였다면 닫습니다. 짚은 자리는
   시작할 때 정해 두었으므로, 창 안에서 눌러 바깥에서 뗀 손짓은 닫지 않습니다.
   움직였다면 창 안에서 무언가를 밀거나 고른 것이니 그냥 놓아 둡니다 — 여기서
   SCROLL 로 넘기면 읽는 화면이 남의 손짓을 해석하는 셈이 됩니다. */
function endSentenceModalGesture(gesture){
  if(gesture.moved > GESTURE_SLOP || !gesture.dismisses){
    finishGesture(gesture, GESTURE_MODAL_UI);
    return;
  }
  finishGesture(gesture, GESTURE_DISMISS_SENTENCE, true);
  countDispatch(gesture, 'DISMISS_SENTENCE');
  gesture.adapterCall = 'closeSentence()';
  if(typeof closeSentence === 'function') closeSentence();
}

/* ---- 낱말 시트의 손짓이 끝나는 자리 ----
   닫는 길이 둘입니다. 바깥이나 X 를 짚고 제자리에서 뗐거나, 손잡이를 잡고
   `SHEET_PULL_DISMISS` 만큼 끌어내렸거나. 끌어내리는 그림(시트가 손가락을
   따라 내려오는 것)은 여전히 `scripts/ui/interactions.js` 가 그리지만, 닫을지
   말지를 정하는 일은 이제 여기 하나뿐입니다 — 예전에는 그 파일이 제 손으로
   `closePanel()` 을 불러서, 한 손짓이 두 곳에서 판정됐습니다. */
function endWordSheetGesture(gesture){
  const tapped = gesture.dismisses && gesture.moved <= GESTURE_SLOP;
  const pulled = gesture.pulls && gesture.dy > SHEET_PULL_DISMISS;
  if(!tapped && !pulled){
    finishGesture(gesture, GESTURE_MODAL_UI);
    return;
  }
  finishGesture(gesture, GESTURE_DISMISS_WORD, true);
  countDispatch(gesture, 'DISMISS_WORD');
  gesture.adapterCall = 'closePanel()';
  if(typeof closePanel === 'function') closePanel();
}

/* ---- Aa 의 손짓이 끝나는 자리 ----
   창 바깥을 제자리에서 눌렀으면 닫고, 그 손짓은 거기서 끝납니다 — 닫는 데 쓴
   터치가 종이로 이어지지 않습니다. 밀었다면 읽던 글을 굴린 것이니 창은 그대로
   둡니다(예전의 document click 도 민 손짓에는 울리지 않았습니다). 종이의
   SCROLL 로 넘기지도 않습니다 — 임자가 다른 손짓이기 때문입니다. */
function endAaGesture(gesture){
  if(gesture.moved > GESTURE_SLOP){
    finishGesture(gesture, GESTURE_MODAL_UI);
    return;
  }
  finishGesture(gesture, GESTURE_DISMISS_AA, true);
  countDispatch(gesture, 'DISMISS_AA');
  gesture.adapterCall = 'closeAa()';
  if(typeof closeAa === 'function') closeAa();
}

/* ---- 꾹 누르기가 확정되는 그 순간 ----
   누르고 있는 동안에는 아무것도 찾지 않고 아무것도 칠하지 않습니다. 문장을
   짚는 일조차 여기서 처음 합니다 — 미리 준비해 두면 짧은 탭까지 문장 선택으로
   오인되어 낱말 탭과 부딪힙니다. */
function holdGesture(gesture){
  gesture.holdTimer = 0;
  if(activeGesture !== gesture || gesture.decision) return;
  gesture.adapterCall = `${gesture.surface.name}.sentenceAt(${Math.round(gesture.x)},${Math.round(gesture.y)})`;
  let found = null;
  try{ found = gesture.surface.sentenceAt(gesture.x, gesture.y); }catch(error){ found = null; }
  if(!found || !found.sentence){
    /* 문장을 못 찾았으면 아직 아무것도 정하지 않은 것입니다. 오래 눌렀다는
       이유만으로 손짓을 죽이면, 좌표표가 아직 안 만들어진 쪽에서 꾹 누른
       사람은 아무 답도 못 받습니다. 떼는 순간 낱말로 갑니다. */
    return;
  }
  finishGesture(gesture, GESTURE_SENTENCE, true);
  countDispatch(gesture, 'SENTENCE');
  /* 꾹 누르면 브라우저가 낱말을 선택해 두기도 합니다. 파란 문장 위에 회색
     선택이 겹치면 무엇이 골라졌는지 알 수 없습니다. */
  clearReaderSelection(gesture.surface);
  /* 무엇을 물어봤는지 칠하는 일은 종이가 합니다 — 글자판은 Range 로, 스캔본은
     낱말 상자의 줄로, EPUB 은 iframe 안의 Range 로. 여기서는 부르기만 합니다. */
  if(typeof clearReaderModeCue === 'function') clearReaderModeCue();
  if(typeof found.paint === 'function'){ try{ found.paint(); }catch(error){} }
  if(typeof openSentence === 'function') openSentence(found.sentence);
}

function moveGesture(event){
  const gesture = activeGesture;
  if(!gesture || gesture.decision) return;
  if(event.pointerId != null && event.pointerId !== gesture.pointerId) return;
  gesture.moved = Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y);
  /* 아래로 얼마나 왔는지는 부호가 있어야 압니다 — 시트를 끌어내리는 손짓만
     닫고, 올리는 손짓은 시트 안의 스크롤이기 때문입니다. */
  gesture.dy = event.clientY - gesture.y;
  /* 움직였다는 사실은 누구의 손짓이든 적어 둡니다. 다만 그것을 "밀었다"로
     읽는 것은 종이의 손짓일 때뿐입니다. */
  if(gesture.moved > GESTURE_SLOP && gesture.owner === OWNER_READER){
    finishGesture(gesture, GESTURE_SCROLL);
  }
}

function endGesture(event){
  const gesture = activeGesture;
  if(!gesture) return;
  if(event.pointerId != null && event.pointerId !== gesture.pointerId) return;
  if(gesture.decision) return;
  if(gesture.owner === OWNER_SENTENCE_MODAL){ endSentenceModalGesture(gesture); return; }
  if(gesture.owner === OWNER_WORD_SHEET){ endWordSheetGesture(gesture); return; }
  if(gesture.owner === OWNER_AA){ endAaGesture(gesture); return; }
  finishGesture(gesture, GESTURE_WORD);
  gesture.adapterCall = `${gesture.surface.name}.openWordAt(${Math.round(event.clientX)},${Math.round(event.clientY)})`;
  dispatchWord(gesture, event.clientX, event.clientY);
}

/* 낱말 찾기는 종이에 따라 기다림이 있을 수 있습니다 — PDF 는 캔버스가 먼저
   보이고 좌표표는 그 뒤에 생깁니다. 끝났는지는 손짓 기록에만 적고, 그 사이에
   새 손짓이 시작되어도 이 일은 자기 자리로 돌아옵니다. */
function dispatchWord(gesture, clientX, clientY){
  countDispatch(gesture, 'WORD');
  let result;
  try{ result = gesture.surface.openWordAt(clientX, clientY); }
  catch(error){ result = false; }
  if(result && typeof result.then === 'function'){
    result.then(ok=>{ gesture.completed = !!ok; gestureLog(gesture,'(async)'); },
                ()=>{ gesture.completed = false; });
    return;
  }
  gesture.completed = !!result;
}

/* pointer 조각 없이 `click` 하나만 오는 길(일부 모바일 캔버스, 그리고 자판의
   Enter)을 위한 손짓 한 벌. 조각이 없었으니 꼬리도 없습니다. */
function syntheticGesture(event, owner, dismisses){
  return {
    id: ++gestureSeq, pointerId: null, x: event.clientX, y: event.clientY, moved: 0, dy: 0,
    startedAt: performance.now(), startTag: (event.target.tagName||'?').toLowerCase(),
    owner, surface: null, decision: null, completed: null, dispatched: 0,
    adapterCall: '', holdTimer: 0, tailClickUsed: true, dismisses, pulls: false,
  };
}

function cancelGesture(reason){
  if(activeGesture) finishGesture(activeGesture, GESTURE_CANCEL, false);
  if(reason && readerGestureDebug()) console.log(`Gesture cancelled: ${reason}`);
}

/* ---- 꼬리 조각은 다시 판정하지 않습니다 ----
   한 손짓이 WORD 나 SENTENCE 로 끝나면, 그 뒤에 오는 `click` 은 같은 손짓의
   꼬리입니다. 예전에는 그 꼬리를 시계로 걸렀습니다(450ms · 600ms). 시계는
   느린 기기에서 늦게 오는 click 을 놓치고, 빠른 두 번 탭을 하나로 삼킵니다.
   지금은 시계가 아니라 **누구의 꼬리인지**로 거릅니다.

   꼬리는 여기서 완전히 멈춥니다. 그래야 해석 창이 손가락 **아래로** 올라온
   뒤 그 손가락을 떼면서 나오는 click 이 "바깥을 눌렀다"가 되어 창을 도로
   닫아 버리는 일이 없습니다 — 예전에 열리자마자 닫히던 자리입니다. */
function clickGesture(event){
  if(lastGesture && !lastGesture.tailClickUsed){
    lastGesture.tailClickUsed = true;
    /* 이미 뜻 있는 일을 한 손짓의 꼬리는 여기서 완전히 멈춥니다. 그래야 해석
       창이 손가락 아래로 올라온 뒤 그 손가락을 떼면서 나오는 click 이
       "바깥을 눌렀다"가 되어 창을 도로 닫아 버리지 않습니다. 민 손짓·취소된
       손짓의 꼬리는 삼키기만 하고 길은 막지 않습니다 — 막을 이유가 없습니다. */
    if(lastGesture.decision === GESTURE_WORD || lastGesture.decision === GESTURE_SENTENCE
       || lastGesture.decision === GESTURE_DISMISS_SENTENCE
       || lastGesture.decision === GESTURE_DISMISS_WORD
       || lastGesture.decision === GESTURE_DISMISS_AA){
      event.stopPropagation();
      event.preventDefault();
    }
    return;
  }
  /* pointerup 을 웹뷰에 넘기지 않고 click 만 남기는 종이가 있습니다(일부 모바일
     PDF 캔버스). 앞선 손짓의 꼬리가 아니라면 그것 자체가 하나의 탭입니다. */
  if(activeGesture) return;
  /* 창이 떠 있는데 pointer 조각 없이 click 만 왔다면, 그 한 번이 통째로 창의
     손짓입니다. scrim 의 `onclick` 을 지웠으므로 이 길이 없으면 그런 기기에서는
     바깥을 눌러 닫을 수 없게 됩니다. 자판의 Enter 로 X 를 누르는 길도 여기입니다. */
  if(sentenceModalOpen()){
    const modalGesture = syntheticGesture(event, OWNER_SENTENCE_MODAL,
                                          sentenceDismissTarget(event.target));
    endSentenceModalGesture(modalGesture);
    if(modalGesture.decision === GESTURE_DISMISS_SENTENCE){
      event.stopPropagation();
      event.preventDefault();
    }
    return;
  }
  if(wordSheetCovers() || (wordPanelOpen() && wordDismissTarget(event.target))){
    const sheetGesture = syntheticGesture(event, OWNER_WORD_SHEET,
                                          wordDismissTarget(event.target));
    endWordSheetGesture(sheetGesture);
    if(sheetGesture.decision === GESTURE_DISMISS_WORD){
      event.stopPropagation();
      event.preventDefault();
    }
    return;
  }
  if(aaPopOpen() && aaOutside(event.target)){
    const aaGesture = syntheticGesture(event, OWNER_AA, true);
    endAaGesture(aaGesture);
    if(aaGesture.decision === GESTURE_DISMISS_AA){
      event.stopPropagation();
      event.preventDefault();
    }
    return;
  }
  const surface = readerSurfaceFor(event);
  if(!surface) return;
  gestureDocument = event.target.ownerDocument || document;
  const gesture = {
    id: ++gestureSeq, pointerId: null, x: event.clientX, y: event.clientY, moved: 0,
    startedAt: performance.now(), startTag: (event.target.tagName||'?').toLowerCase(),
    surface, decision: null, completed: null, dispatched: 0,
    adapterCall: '', holdTimer: 0, tailClickUsed: true,
  };
  finishGesture(gesture, GESTURE_WORD);
  gesture.adapterCall = `${surface.name}.openWordAt(${Math.round(event.clientX)},${Math.round(event.clientY)}) [click-only]`;
  dispatchWord(gesture, event.clientX, event.clientY);
}

/* ---- 화면이 움직이면 그것은 스크롤입니다 ----
   손가락이 제자리에 있어도 마찬가지입니다. 다만 **우리가** 옮긴 화면은
   스크롤이 아닙니다 — 낱말 창이 닫히며 보던 자리를 되돌리는 중이거나, 모드를
   옮기며 자리를 맞추는 중입니다. 예전에는 그것을 벽시계 셋으로 구분했고
   (`chromePinned` · `readerAnchorHeld` · `readerScrollPauseUntil`), 그 셋이
   먼저 끝나 버리면 되돌리는 스크롤이 "손으로 밀었다"로 읽혀 누르던 손짓이
   조용히 죽었습니다.

   시계 대신 값을 봅니다. 우리가 마지막으로 적어 넣은 `scrollTop` 과 지금 값이
   같으면 그 스크롤은 우리가 낸 것입니다. 정확하고, 얼마나 걸리든 맞습니다
   (`readerScrollTo` 가 적어 둡니다 — scripts/reader/reader-scroll.js). */
function scrollGesture(){
  if(!activeGesture) return;
  /* 창이 임자인 손짓은 화면이 움직여도 창의 것입니다. */
  if(activeGesture.owner !== OWNER_READER) return;
  if(typeof readerScrollWasProgrammatic === 'function' && readerScrollWasProgrammatic()) return;
  finishGesture(activeGesture, GESTURE_SCROLL);
}

function clearReaderSelection(surface){
  try{
    const doc = (surface && surface.document && surface.document()) || document;
    const selection = doc.getSelection();
    if(selection) selection.removeAllRanges();
  }catch(error){}
}

/* ================= 귀를 다는 곳 =================

   문서 하나에 한 벌씩입니다. EPUB 은 장마다 제 문서(iframe)를 가지므로
   그 문서에도 같은 한 벌을 답니다 — 판정하는 코드는 그대로 이 파일 하나입니다.

   capture 로 듣습니다. 종이 위에는 캔버스·저장 표시·전환 표시가 번갈아
   올라오므로, 어느 겹을 눌러도 같은 한 번의 손짓이어야 하기 때문입니다. */
function attachReaderGestures(doc){
  if(!doc || doc.__breezeGestures) return;
  doc.__breezeGestures = true;
  doc.addEventListener('pointerdown', beginGesture, true);
  doc.addEventListener('pointermove', moveGesture, true);
  doc.addEventListener('pointerup', endGesture, true);
  doc.addEventListener('pointercancel', ()=>cancelGesture('pointercancel'), true);
  doc.addEventListener('click', clickGesture, true);
  /* iOS 의 Copy/Look Up 메뉴는 DOM 이벤트가 아니라 그 아래 UIKit 이 만드는
     선택을 보고 뜹니다. 읽는 종이 안에서만 끕니다 — 입력칸과 사전 칸은
     평소의 메뉴를 그대로 씁니다. */
  doc.addEventListener('contextmenu', event=>{
    const target = event.target;
    if(target && target.closest && !readerSurfaceFor(event)) return;
    event.preventDefault();
  });
}

attachReaderGestures(document);

/* 읽는 칸이 구르면 누르던 손짓을 놓습니다. 듣는 곳은 실제로 구르는 칸이어야
   합니다 — `#readmain` 은 읽는 동안 아예 구르지 않으므로, 거기 걸어 둔 귀는
   한 번도 울린 적이 없었습니다. */
document.addEventListener('DOMContentLoaded', ()=>{
  const scroller = typeof readerScroller === 'function' ? readerScroller() : null;
  if(scroller) scroller.addEventListener('scroll', scrollGesture, {passive:true});
});

/* ---- iOS 가 몰래 만든 선택은 그 자리에서 지웁니다 ----
   `contextmenu` 한 줄로는 부족합니다. CSS 의 `user-select:none` 이 그 경합에서
   매번 이기지도 않고, 무엇보다 그 선언은 WebKit 의 caret hit-test 를 함께
   꺼 버립니다 — EPUB 에서 낱말이 안 열리던 진짜 까닭이 그것이었습니다
   (scripts/reader/epub-original.js). 선택은 **끄지 않고 지웁니다**.
   `preventDefault` 를 쓰지 않으므로 스크롤(팬)에는 손대지 않습니다. */
function suppressReaderSelection(doc, inPaper){
  doc.addEventListener('selectionchange', ()=>{
    const selection = doc.getSelection();
    if(!selection || selection.isCollapsed) return;
    const node = selection.anchorNode;
    const element = node && (node.nodeType === 1 ? node : node.parentElement);
    if(element && inPaper(element)) selection.removeAllRanges();
  });
}
