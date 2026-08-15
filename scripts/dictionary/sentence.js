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

   꾹 누르는 시간을 넉넉히(`SENT_PRESS_MS`) 둡니다. 예전에 짧게 잡았다가
   스크롤하려고 손가락을 얹은 것까지 질문으로 읽혀 하루 몫이 새 나갔습니다.
   손가락이 조금이라도 움직이면(`SENT_PRESS_SLOP`) 그것은 스크롤입니다.

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

/* 닫는 길은 셋입니다 — X 단추 · 바깥(scrim) · Esc. 셋 다 이 함수 하나로 끝납니다.

   한때 바깥을 눌러 닫는 길만 따로 `dismissSentence()` 라는 이름을 갖고 있었습니다.
   속은 `closeSentence()` 한 줄이라 하는 일은 같았지만, 이름이 둘이면 "두 길이
   다른 일을 한다"는 의심이 계속 되살아납니다. 실제로 그 의심을 확인하려고 두 길이
   남기는 상태를 떠서 비교했고, 한 글자도 다르지 않았습니다. 그래서 이름도 하나로
   합칩니다 — 같음을 주석으로 약속하는 것보다 갈라질 자리를 없애는 편이 낫습니다.

   창은 누르고 있던 손가락 **아래로** 올라오므로, 손을 떼는 그 한 번이 곧바로
   "바깥을 눌렀다"가 될 수 있습니다 — 열리자마자 닫혀서 아무 일도 안 일어난 것처럼
   보이던 자리입니다. 예전에는 여기서 600ms 유예를 봤습니다. 이제 그 `click` 은
   창을 연 손짓의 꼬리로 판정되어 문서 capture 단계에서 멈추므로, 여기까지 오지
   않습니다 (scripts/reader/gesture.js). */
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
  if(document.getElementById('sentence-modal').hidden) return;

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

document.addEventListener('keydown', event=>{
  if(event.key === 'Escape' && !document.getElementById('sentence-modal').hidden) closeSentence();
});
