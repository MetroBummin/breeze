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

/* ================= 꾹 누르기 ================= */

const SENT_PRESS_MS = 620;     // 스크롤하려고 얹은 손가락과 구별되는 길이
const SENT_PRESS_SLOP = 10;    // 이만큼 움직였으면 질문이 아니라 스크롤입니다
const SENT_PRESS_GUARD = 900;  // 손을 뗀 뒤 따라오는 탭 한 번을 삼킵니다

let sentPressTimer = 0, sentPressFrom = null, sentPressGuardUntil = 0;

/* 꾹 누르기가 방금 열렸으면 뒤따라오는 탭은 낱말을 여는 손짓이 아닙니다. */
function sentencePressBusy(){ return Date.now() < sentPressGuardUntil; }

/* `resolve` 는 타이머가 끝난 뒤에만 불립니다. 누르고 있는 동안에는 문장을 찾지도,
   칠하지도 않습니다. */
function beginSentencePress(event, resolve){
  cancelSentencePress();
  if(event.pointerType === 'mouse' && event.button !== 0) return;
  if(event.isPrimary === false) return;
  sentPressFrom = { id:event.pointerId, x:event.clientX, y:event.clientY };
  sentPressTimer = setTimeout(()=>{
    sentPressTimer = 0; sentPressFrom = null;
    let found = null;
    try{ found = resolve(); }catch(error){ found = null; }
    if(!found || !found.sentence) return;
    sentPressGuardUntil = Date.now() + SENT_PRESS_GUARD;
    paintPressedSentence(found);
    openSentence(found.sentence);
  }, SENT_PRESS_MS);
}
function moveSentencePress(event){
  if(!sentPressFrom || (event.pointerId != null && event.pointerId !== sentPressFrom.id)) return;
  if(Math.hypot(event.clientX - sentPressFrom.x, event.clientY - sentPressFrom.y) > SENT_PRESS_SLOP)
    cancelSentencePress();
}
function cancelSentencePress(){
  if(sentPressTimer) clearTimeout(sentPressTimer);
  sentPressTimer = 0; sentPressFrom = null;
}

/* 문장이 차오르는 그림은 모드를 옮길 때 쓰는 "여기 있었어요"와 같은 것입니다.
   같은 일(한 문장을 가리키는 것)에 두 가지 그림을 두지 않습니다. */
function paintPressedSentence(found){
  if(typeof clearReaderModeCue === 'function') clearReaderModeCue();
  if(found.range && typeof showRangeModeCue === 'function') showRangeModeCue(found.range, 0);
  else if(found.page && found.boxes && typeof showPdfModeCue === 'function') showPdfModeCue(found.page, found.boxes, 0, null);
  else if(found.block && typeof showElementModeCue === 'function') showElementModeCue(found.block, 0);
  /* 꾹 누르면 브라우저가 낱말을 선택해 두기도 합니다. 파란 문장 위에 회색 선택이
     겹치면 무엇이 골라졌는지 알 수 없습니다. */
  try{ const selection=document.getSelection(); if(selection) selection.removeAllRanges(); }catch(error){}
}

/* 한 문단 안에서 이 문장이 차지하는 자리를 찾습니다. 문단 글자와 문장 글자는
   같은 곳(`bridgeSentences`)에서 잘라 낸 것이라 자를 다시 대지 않아도 맞습니다. */
function sentenceRangeIn(block, sentence){
  if(!block || typeof bridgeSentences !== 'function') return null;
  const want=String(sentence||'').replace(/\s+/g,' ').trim();
  if(!want) return null;
  const parts=bridgeSentences(block.textContent);
  const part=parts.find(item=>item.text.replace(/\s+/g,' ').trim() === want)
    || parts.find(item=>item.text.replace(/\s+/g,' ').includes(want));
  return part ? domRangeForOffsets(block, part.start, part.end) : null;
}

/* ---- 세 화면이 각자 자기 방식으로 낱말을 짚고, 같은 모양을 돌려줍니다 ---- */
function sentencePressInText(span){
  const block=span && span.closest ? span.closest('[data-pi]') : null;
  const sentence=sentenceOf(span);
  if(!sentence) return null;
  return { sentence, range:sentenceRangeIn(block, sentence), block };
}
function sentencePressInEpub(doc, clientX, clientY){
  if(typeof epubWordRangeAtPoint !== 'function') return null;
  const hit=epubWordRangeAtPoint(doc, clientX, clientY);
  if(!hit) return null;
  const owner=hit.owner;
  const block=(owner && owner.closest && owner.closest('p,li,blockquote,h1,h2,h3,h4')) || owner;
  if(!block) return null;
  const sentence=originalSentence(block.textContent, hit.raw);
  if(!sentence) return null;
  return { sentence, range:sentenceRangeIn(block, sentence), block };
}
function sentencePressInPdf(clientX, clientY){
  if(typeof pdfPageAtPoint !== 'function' || !originalSession) return null;
  const page=pdfPageAtPoint(clientX, clientY);
  if(!page) return null;
  const box=pdfWordAtPoint(page, clientX, clientY);
  const sentence=box && box.example ? String(box.example).trim() : '';
  if(!sentence) return null;
  /* 같은 문장에서 잘라 낸 낱말 상자들이 곧 그 문장의 자리입니다
     (scripts/reader/pdf-original.js 가 상자마다 `example` 을 적어 둡니다). */
  const boxes=(originalSession.wordBoxes.get(+page.dataset.page)||[]).filter(item=>item.example===box.example);
  return { sentence, page, boxes };
}

/* ================= 해석 창 ================= */

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
