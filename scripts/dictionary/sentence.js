/* ================= 문장 통째로 물어보기 =================

   낱말 하나를 누르면 그 낱말의 뜻이 뜹니다. 그런데 낱말을 다 알아도 문장이
   안 읽히는 때가 있습니다 — 관계절이 겹쳤거나, 도치됐거나, 낱말은 쉬운데
   합쳐 놓으니 다른 뜻이 되는 관용구일 때. 그럴 때 필요한 것은 사전이 아니라
   "이 문장은 이렇게 읽는다" 한 마디입니다.

   ── 손짓 하나, 자기 화면 하나 ──
   낱말 창 안의 단추였던 시절에는 뜻 하나를 보러 연 창의 절반이 문장 이야기
   (단추 · 설명 · 남은 횟수 · 답 카드)였습니다. 이제 문은 손짓입니다:

     낱말 Tap        → 단어 팝업
     낱말 Long Press → 이 문장 해석

   꾹 누르는 시간(`GESTURE_HOLD_MS` · 750ms)과 움직임 문턱(`GESTURE_SLOP`)은
   판정 계층이 들고 있습니다 — scripts/reader/gesture.js.

   ── 확정된 뒤에만 문장을 건드립니다 ──
   누르고 있는 동안에는 아무것도 칠하지 않고, DOM 도 미리 만들지 않습니다.
   문장을 찾는 일조차 타이머가 끝난 그 순간에 처음 합니다(`resolve()`).
   미리 준비해 두면 짧은 탭까지 문장 선택으로 오인되어 낱말 탭과 부딪힙니다 —
   예전 구현이 통째로 걷힌 이유가 그것이었습니다.

   확정되면 문장이 앵커 문장처럼 파랗게 차오르고(모드마다 같은 `reader-mode-cue`),
   화면 한가운데에 해석이 뜹니다. 세 화면(글자 · 원본 PDF · 원본 EPUB)이 모두
   같은 손짓, 같은 그림입니다 — 문이 하나여야 기기마다 다르게 굴지 않습니다.

   ── 문장은 서버에 남지 않습니다 ──
   AI 에게는 보냅니다(보내지 않으면 답할 것이 없습니다). 서버 기록에 남는 것은
   소금을 섞은 지문과 낱말 수뿐입니다 — 낱말 조회와 완전히 같은 규칙입니다. */

const sentKey = text => 's:' + sentenceHash(text);
const LS_SENT_LEFT = 'breeze.ai-left';

/* 서버가 답할 때마다 남은 횟수를 알려 줍니다. 화면에 몇 번 남았는지 적는 줄은
   단어 팝업에서 덜어냈습니다 — 읽는 중에 셈이 보일 이유가 없습니다. */
function rememberSentLeft(left, day){
  if(typeof left !== 'number') return;
  save(LS_SENT_LEFT, { day:day||aiDay(), left });
}

/* ---- 손짓은 여기서 재지 않습니다 ----
   꾹 누르는 시간을 재고, 움직임을 보고, 뒤따라오는 탭을 삼키는 일은 전부
   `scripts/reader/gesture.js` 한 곳으로 갔습니다. 예전에는 이 파일이 그 일을
   하면서 벽시계 유예 셋(`SENT_PRESS_GUARD` · `sentPressHolding` ·
   문서 전역 capture 리스너)을 들고 있었고, 그것이 PDF 의 450ms 와 겹쳐
   서로를 방해했습니다. 여기 남는 것은 "문장 하나를 물어보고 답을 그리는 일"
   뿐입니다. 어느 문장인지는 종이(surface)가 짚어 줍니다. */

/* ================= 해석 창 ================= */

/* ---- 치우는 일은 여기 하나뿐입니다 ----
   닫는 길은 둘입니다 — 창 바깥(scrim) · Esc. 둘 다 이 함수 하나로 끝납니다.

   한때 바깥을 눌러 닫는 길만 따로 `dismissSentence()` 라는 이름을 갖고 있었고,
   그다음에는 이름은 같아졌지만 길이 달랐습니다: X 와 바깥은 각자 `onclick` 으로
   혼자 이 함수를 불렀습니다. 두 길이 남기는 JS/DOM 상태를 떠서 비교하면 한 글자도
   다르지 않았는데도 실기기에서는 바깥으로 닫을 때만 렉이 났습니다. 다른 것은
   치우는 일이 아니라 **손짓의 한살이**였습니다 — 바깥 누르기만 판정 계층 바깥에
   있는 유일한 입력이었습니다.

   그래서 이제 `onclick` 은 어디에도 없습니다. 창이 떠 있는 동안의 손짓은 임자가
   창이고, 임자가 `DISMISS_SENTENCE` 로 판정한 그 자리에서 이 함수를 한 번
   부릅니다 (scripts/reader/gesture.js). 여기 남는 것은 "무엇을 치우는가" 뿐입니다.

   X 단추도 뗐습니다. 태블릿에서 X 로 닫은 직후 한 박자 굳는 것처럼 느껴진
   사례가 있었는데, X 가 원인이라고 확정하지는 못했습니다. 다만 닫는 길이 둘이면
   "닫은 뒤에 무엇이 남았는가"를 두 벌 확인해야 하고, 이 창은 scrim 을 깔고
   뜨므로 창이 아닌 곳은 전부 바깥입니다 — 하나로 줄여도 잃는 길이 없습니다.

   창은 누르고 있던 손가락 **아래로** 올라오므로, 손을 떼는 그 한 번이 곧바로
   "바깥을 눌렀다"가 될 수 있습니다 — 열리자마자 닫혀서 아무 일도 안 일어난 것처럼
   보이던 자리입니다. 예전에는 여기서 600ms 유예를 봤습니다. 이제 그 `click` 은
   창을 연 손짓의 꼬리로 판정되어 문서 capture 단계에서 멈추므로, 여기까지 오지
   않습니다. */
function closeSentence(){
  const modal = document.getElementById('sentence-modal');
  if(modal) modal.hidden = true;
  if(typeof clearReaderModeCue === 'function') clearReaderModeCue();
  if(sentCtrl){ try{ sentCtrl.abort(); }catch(e){} sentCtrl = null; }
}
function paintSentence(state){
  const modal = document.getElementById('sentence-modal');
  modal.hidden = false;
  document.getElementById('ps-en').textContent = state.en || '';
  document.getElementById('ps-wait').hidden = !state.waiting;
  const ko = document.getElementById('ps-ko');
  ko.textContent = state.ko || '';
  ko.hidden = !state.ko;
  const points = document.getElementById('ps-points');
  points.innerHTML = '';
  (state.points || []).forEach(line => {
    const item = document.createElement('li');
    item.textContent = line;
    points.appendChild(item);
  });
  points.hidden = !(state.points || []).length;
  const foot = document.getElementById('ps-foot');
  foot.textContent = state.foot || '';
  foot.hidden = !state.foot;
  /* 다시 물어볼 만한 실패에서만 뜹니다. 로그인이 없어서, 오늘 몫을 다 써서 막힌
     것은 다시 눌러도 같은 답이 오므로 여기서 권하지 않습니다. */
  const retry = document.getElementById('ps-retry');
  if(retry) retry.hidden = !state.retry;
  document.getElementById('ps-cap').textContent = state.cached ? '전에 물어본 문장' : '문장 통째로 · AI';
}

/* 실패한 것은 요청 하나뿐입니다. 어느 문장이었는지는 창이 떠 있는 동안 여기
   한 줄로 남습니다 — 다시 짚을 필요가 없도록. 손짓·문장 찾기·칠하기는 이미
   끝난 일이라 아무것도 다시 하지 않습니다(scripts/reader/gesture.js). */
let sentAsked = '';
function retrySentence(){ if(sentAsked) openSentence(sentAsked); }

let sentCtrl = null;
async function openSentence(text){
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if(!clean) return;
  sentAsked = clean;
  paintSentence({ en:clean, waiting:true });

  /* ① 전에 물어본 적 있는 문장이면 그대로 내놓습니다. 한도를 쓰지 않습니다. */
  const key = sentKey(clean);
  const hit = await dictGet(key);
  if(hit && hit.ko){
    paintSentence({ en:clean, ko:hit.ko, points:hit.points || [], cached:true,
                    foot:'전에 물어본 문장이라 오늘 몫을 쓰지 않았어요' });
    return;
  }

  if(!sb || navigator.onLine === false){
    paintSentence({ en:clean, retry:true, foot:'오프라인이라 문장 설명은 나중에 볼 수 있어요' });
    return;
  }
  if(!sbUser){
    paintSentence({ en:clean, foot:'문장 설명은 로그인하면 쓸 수 있어요' });
    return;
  }

  if(sentCtrl){ try{ sentCtrl.abort(); }catch(e){} }
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  sentCtrl = ctrl;
  const answer = await dictCall({ op:'explain', sentence:clean, book:(curBook && curBook.title) || '' },
                                ctrl ? ctrl.signal : null);
  if(sentCtrl === ctrl) sentCtrl = null;
  if(document.getElementById('sentence-modal').hidden) return;

  if(!answer || answer.error || !answer.ko){
    const why = answer && answer.error;
    if(why === 'quota_exceeded') rememberSentLeft(0,answer.day);
    const stuck = why === 'login_required' || why === 'quota_exceeded';
    paintSentence({ en:clean, retry:!stuck, foot:
        why === 'login_required' ? '문장 설명은 로그인하면 쓸 수 있어요'
      : why === 'quota_exceeded' ? '오늘 AI 조회가 부족해요. 문장 해석에는 2회가 필요해요'
      :                            '잠깐 문제가 있었어요' });
    return;
  }
  rememberSentLeft(answer.left,answer.day);
  await dictPut(key, { ko:answer.ko, points:answer.points || [], done:true });
  paintSentence({ en:clean, ko:answer.ko, points:answer.points || [] });
}

document.addEventListener('keydown', event=>{
  if(event.key === 'Escape' && !document.getElementById('sentence-modal').hidden) closeSentence();
});
