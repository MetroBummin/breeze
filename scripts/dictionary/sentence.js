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

const SENT_PRESS_MS = 1000;    // 스크롤하려고 얹은 손가락과 구별되는 길이
const SENT_PRESS_SLOP = 10;    // 이만큼 움직였으면 질문이 아니라 스크롤입니다
const SENT_PRESS_GUARD = 600;  // 손을 뗀 **뒤로** 따라오는 탭 한 번을 삼킵니다

let sentPressTimer = 0, sentPressFrom = null, sentPressGuardUntil = 0;
/* 문장이 열린 그 손가락. 아직 화면에 붙어 있는 동안은 뗄 때까지 기다립니다. */
let sentPressHolding = false;

/* 꾹 누르기가 방금 열렸으면 뒤따라오는 탭은 낱말을 여는 손짓이 아닙니다.
   손가락이 아직 붙어 있는 동안에도 마찬가지입니다 — 유예를 벽시계로만 재던
   때에는, 해석이 뜬 것을 보고 잠깐 더 들고 있다가 떼면 그 뗌이 낱말 탭이 되어
   해석 창 위로 낱말 창이 겹쳐 떴습니다. */
function sentencePressBusy(){ return sentPressHolding || Date.now() < sentPressGuardUntil; }

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
    sentPressHolding = true;
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
/* 손을 뗄 때(그리고 스크롤·취소 때) 불립니다. 문장이 이미 열린 손가락이었다면
   그 순간부터 유예를 다시 겁니다 — 얼마나 오래 들고 있었든 뗀 뒤의 한 박자는
   같습니다. */
function cancelSentencePress(){
  if(sentPressTimer) clearTimeout(sentPressTimer);
  sentPressTimer = 0; sentPressFrom = null;
  if(sentPressHolding){ sentPressHolding = false; sentPressGuardUntil = Date.now() + SENT_PRESS_GUARD; }
}

/* 손을 떼는 것은 어디서 떼든 같은 뜻입니다. 그런데 해석 창은 누르고 있던 손가락
   **아래로** 올라옵니다 — 그러면 뗌은 창이 받고, 눌렀던 곳(글자판·종이)은 영영
   못 받습니다. 그 한 번을 놓치면 "아직 붙잡고 있다"가 풀리지 않아 다음 낱말이
   열리지 않습니다. 그래서 뗌만은 문서 전체에서 한 번 더 듣습니다.
   문서 capture 는 각 화면의 손짓보다 먼저 도므로, 그 뒤의 탭 판정은 이미
   다시 걸린 유예를 보게 됩니다. */
['pointerup','pointercancel'].forEach(name=>
  document.addEventListener(name, ()=>cancelSentencePress(), true));

/* 문장이 차오르는 그림은 모드를 옮길 때 쓰는 "여기 있었어요"와 같은 것입니다.
   같은 일(한 문장을 가리키는 것)에 두 가지 그림을 두지 않습니다. */
function paintPressedSentence(found){
  if(typeof clearReaderModeCue === 'function') clearReaderModeCue();
  if(found.range && typeof showRangeModeCue === 'function') showRangeModeCue(found.range, 0);
  /* 스캔본은 문단이 아니라 그 문장의 줄들만 칠합니다 — scripts/reader/pdf-original.js */
  else if(found.page && found.boxes && typeof showPdfSentenceCue === 'function') showPdfSentenceCue(found.page, found.boxes, 0);
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
/* 원본 EPUB 에서는 누른 자리가 문단 어디쯤인지를 세어 그 자리를 품은 문장을
   고릅니다. 낱말이 어느 문장에 **들어 있는지**로 찾으면 같은 낱말이 문단에 두 번
   나올 때 늘 앞의 것이 잡히고, 짧은 문단에서는 문단 전체가 통째로 넘어갔습니다 —
   "이 문장"이라고 해 놓고 다섯 문장을 물어보는 셈이었습니다. */
function sentencePressInEpub(doc, clientX, clientY){
  if(typeof epubWordRangeAtPoint !== 'function') return null;
  const hit=epubWordRangeAtPoint(doc, clientX, clientY);
  if(!hit) return null;
  const owner=hit.owner;
  const block=(owner && owner.closest && owner.closest('p,li,blockquote,h1,h2,h3,h4')) || owner;
  if(!block || typeof bridgeSentences !== 'function') return null;
  let at=0;
  try{
    const before=doc.createRange();
    before.selectNodeContents(block);
    before.setEnd(hit.range.startContainer, hit.range.startOffset);
    at=before.toString().length;
  }catch(error){ at=0; }
  const parts=bridgeSentences(block.textContent);
  const part=parts.find(item=>at>=item.start && at<item.end) || parts[0];
  const sentence=part ? part.text.replace(/\s+/g,' ').trim() : '';
  if(!sentence) return null;
  return { sentence, range:domRangeForOffsets(block, part.start, part.end), block };
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
/* 바깥을 눌러 닫는 길. 창은 누르고 있던 손가락 **아래로** 올라오므로, 손을 떼는
   그 한 번이 곧바로 "바깥을 눌렀다"가 될 수 있습니다 — 열리자마자 닫혀서
   아무 일도 안 일어난 것처럼 보이던 자리입니다. 그 한 박자만 흘려보냅니다. */
function dismissSentence(){
  if(typeof sentencePressBusy === 'function' && sentencePressBusy()) return;
  closeSentence();
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
