/* ================= 문장 통째로 물어보기 — 떼어 둔 모듈 (2026-08-14) =================

   낱말 하나를 누르면 그 낱말의 뜻이 뜹니다. 그런데 낱말을 다 알아도 문장이
   안 읽히는 때가 있습니다 — 관계절이 겹쳤거나, 도치됐거나, 낱말은 쉬운데
   합쳐 놓으니 다른 뜻이 되는 관용구일 때. 그럴 때 필요한 것은 사전이 아니라
   "이 문장은 이렇게 읽는다" 한 마디입니다.

   **지금은 접어 두었습니다.** 코드는 지우지 않고 여기로 옮겨 연결만 끊었습니다 —
   `modules/dict-seed/` 와 같은 방식입니다. 왜, 그리고 어떻게 되살리는지는
   같은 폴더의 README.md 에 있습니다. 요약하면: 문장 해석은 낱말 팝업 안의
   단추가 아니라 낱말을 **꾹 누르는** 손짓으로 열리는 별개의 기능이 됩니다.
   팝업은 뜻 하나만 다루고, 그 안에는 문장 해석의 단추도 남은 횟수도 없습니다.

   ── 문장은 서버에 남지 않습니다 ──
   AI 에게는 보냅니다(보내지 않으면 답할 것이 없습니다). 서버 기록에 남는 것은
   소금을 섞은 지문과 낱말 수뿐입니다 — 낱말 조회와 완전히 같은 규칙입니다. */

const sentKey = text => 's:' + sentenceHash(text);
const LS_SENT_LEFT = 'breeze.ai-left';

/* 남은 횟수는 낱말 조회와 같은 자리에 삽니다(`aiDay()` 는 dictionary.js).
   화면에 몇 번 남았는지 적는 일은 이제 이 기능의 몫이 아닙니다 — 팝업에서
   덜어낸 것이 바로 그 줄입니다. 서버가 알려 주면 조용히 적어 두기만 합니다. */
function rememberSentLeft(left, day){
  if(typeof left !== 'number') return;
  save(LS_SENT_LEFT, { day:day||aiDay(), left });
}

/* 카드는 자기가 만듭니다. 되살릴 때 낱말 패널 안에 markup 을 다시 심지 않도록,
   붙이는 쪽은 `openSentence(문장)` 하나만 부르면 되게 두었습니다. */
function sentenceCard(){
  let card=document.getElementById('p-sentence');
  if(card) return card;
  card=document.createElement('section');
  card.id='p-sentence'; card.hidden=true; card.setAttribute('aria-live','polite');
  card.innerHTML=`<div class="cap"><span class="dot"></span><span id="ps-cap">문장 통째로 · AI</span></div>
    <div id="ps-en"></div>
    <div class="aurora" id="ps-wait" aria-hidden="true" hidden><span class="glow"></span></div>
    <div id="ps-ko" hidden></div>
    <ul id="ps-points" hidden></ul>
    <div id="ps-foot" hidden></div>`;
  document.body.appendChild(card);
  return card;
}

function closeSentence(){
  const card = document.getElementById('p-sentence');
  if(card) card.hidden = true;
  if(sentCtrl){ try{ sentCtrl.abort(); }catch(e){} sentCtrl = null; }
}
function paintSentence(state){
  const card = sentenceCard();
  card.hidden = false;
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
  document.getElementById('ps-cap').textContent = state.cached ? '전에 물어본 문장' : '문장 통째로 · AI';
}

let sentCtrl = null;
async function openSentence(text){
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if(!clean) return;
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
    paintSentence({ en:clean, foot:'오프라인이라 문장 설명은 나중에 볼 수 있어요' });
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
  if(sentenceCard().hidden) return;

  if(!answer || answer.error || !answer.ko){
    const why = answer && answer.error;
    if(why === 'quota_exceeded') rememberSentLeft(0,answer.day);
    paintSentence({ en:clean, foot:
        why === 'login_required' ? '문장 설명은 로그인하면 쓸 수 있어요'
      : why === 'quota_exceeded' ? '오늘 AI 조회가 부족해요. 문장 해석에는 2회가 필요해요'
      :                            '잠깐 문제가 있었어요. 다시 눌러 보세요' });
    return;
  }
  rememberSentLeft(answer.left,answer.day);
  await dictPut(key, { ko:answer.ko, points:answer.points || [], done:true });
  paintSentence({ en:clean, ko:answer.ko, points:answer.points || [] });
}
