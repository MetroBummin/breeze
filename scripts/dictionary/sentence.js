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

   확정되면 문장이 앵커 문장처럼 파랗게 차오르고(모드마다 같은 문장 전용 표시),
   선택한 문장 위의 은은한 반사만 대기를 알립니다. 답은 좁은 화면에서는 바텀시트,
   넓은 화면에서는 종전 중앙 창에 뜹니다. 세 화면(글자 · 원본 PDF · 원본 EPUB)이
   모두 같은 요청 수명과 같은 표시 문법을 씁니다.

   ── 문장은 서버에 남지 않습니다 ──
   AI 에게는 보냅니다(보내지 않으면 답할 것이 없습니다). 서버 기록에 남는 것은
   소금을 섞은 지문과 낱말 수뿐입니다 — 낱말 조회와 완전히 같은 규칙입니다. */

const sentKey = text => 's:' + sentenceHash(text);
const LS_SENT_LEFT = 'breeze.ai-left';
const sentenceRecoveries=new Map();

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
   창 바깥, 시트 끌어내리기, Esc와 뒤로가기는 모두 이 함수로 끝납니다.

   한때 바깥을 눌러 닫는 길만 따로 `dismissSentence()` 라는 이름을 갖고 있었고,
   그다음에는 이름은 같아졌지만 길이 달랐습니다: X 와 바깥은 각자 `onclick` 으로
   혼자 이 함수를 불렀습니다. 두 길이 남기는 JS/DOM 상태를 떠서 비교하면 한 글자도
   다르지 않았는데도 실기기에서는 바깥으로 닫을 때만 렉이 났습니다. 다른 것은
   치우는 일이 아니라 **손짓의 한살이**였습니다 — 바깥 누르기만 판정 계층 바깥에
   있는 유일한 입력이었습니다.

   그래서 이제 `onclick` 은 어디에도 없습니다. 창이 떠 있는 동안의 손짓은 임자가
   창이고, 임자가 `DISMISS_SENTENCE` 로 판정한 그 자리에서 이 함수를 한 번
   부릅니다 (scripts/reader/gesture.js). 여기 남는 것은 "무엇을 치우는가" 뿐입니다.

   이 표면은 잠깐 보는 lookup이라 명시적인 X는 두지 않습니다. 바깥 탭과 시트의
   끌어내리기는 같은 gesture owner가 이 종료 함수로 보내므로, 닫힌 뒤 상태는 한 벌입니다.

   창은 누르고 있던 손가락 **아래로** 올라오므로, 손을 떼는 그 한 번이 곧바로
   "바깥을 눌렀다"가 될 수 있습니다 — 열리자마자 닫혀서 아무 일도 안 일어난 것처럼
   보이던 자리입니다. 예전에는 여기서 600ms 유예를 봤습니다. 이제 그 `click` 은
   창을 연 손짓의 꼬리로 판정되어 문서 capture 단계에서 멈추므로, 여기까지 오지
   않습니다. */
/* 분기 기준은 이곳 한 군데에만 둡니다. CSS는 계산 결과(body 표)만 보고 그립니다. */
const SENTENCE_COMPACT_MAX_WIDTH = 640;
const SENTENCE_COMPACT_MAX_HEIGHT = 500;
function sentenceViewport(){
  const view = typeof window !== 'undefined' && window.visualViewport;
  return { width:view ? view.width : (typeof innerWidth === 'number' ? innerWidth : 1024),
           height:view ? view.height : (typeof innerHeight === 'number' ? innerHeight : 768) };
}
function sentenceCompactViewport(){
  const view=sentenceViewport();
  return view.width < SENTENCE_COMPACT_MAX_WIDTH || view.height < SENTENCE_COMPACT_MAX_HEIGHT;
}

let sentenceResultFrame=0,sentenceResultObserver=null,sentenceResultAnimation=null;
function sentenceResultAnchored(){ return sentenceView==='anchored'; }
function stopSentenceResultPresentation(){
  if(sentenceResultFrame)cancelAnimationFrame(sentenceResultFrame);
  sentenceResultFrame=0;
  sentenceResultObserver?.disconnect();sentenceResultObserver=null;
  sentenceResultAnimation?.cancel();sentenceResultAnimation=null;
  const panel=document.getElementById('p-sentence');
  if(panel){
    for(const name of ['left','top','width','max-height','transform-origin'])panel.style.removeProperty?.(name);
    if(panel.dataset)delete panel.dataset.expandDirection;
  }
}
function scheduleSentenceResultPlacement(afterLayout=false){
  if(!sentenceResultAnchored()||sentenceResultFrame)return;
  const life=sentenceLife;
  sentenceResultFrame=requestAnimationFrame(()=>{
    sentenceResultFrame=0;
    if(!sentenceAlive(life)||!sentenceResultAnchored())return;
    if(afterLayout){scheduleSentenceResultPlacement();return;}
    placeSentenceResult();
  });
}
function placeSentenceResult(){
  if(!sentenceResultAnchored()||!sentenceOrigin?.peekTarget)return;
  const panel=document.getElementById('p-sentence'),content=document.getElementById('ps-content');
  const anchor=wordPeekNodeRect(sentenceOrigin.peekTarget);
  if(!anchor||!anchor.width||!anchor.height){closeSentence();return;}
  const viewport=window.visualViewport,edge=16,gap=8;
  const x=viewport?viewport.offsetLeft:0,y=viewport?viewport.offsetTop:0;
  const width=viewport?viewport.width:innerWidth,height=viewport?viewport.height:innerHeight;
  const css=getComputedStyle(panel),chrome=document.getElementById('readchrome').getBoundingClientRect();
  const top=y+edge+(parseFloat(css.getPropertyValue('--word-safe-top'))||0);
  const bottom=Math.max(top+1,Math.min(y+height-edge,chrome.height&&chrome.top>top?chrome.top-gap:y+height-edge));
  const left=x+edge+(parseFloat(css.getPropertyValue('--word-safe-left'))||0);
  const right=x+width-edge-(parseFloat(css.getPropertyValue('--word-safe-right'))||0);
  const available=Math.max(1,bottom-top),cap=Math.min(520,available);
  panel.style.width=Math.max(1,Math.min(600,Math.max(360,width*.64),right-left))+'px';
  panel.style.maxHeight=cap+'px';
  // Only this overlay is measured. Source adapters own/cache the sentence union;
  // placement never reads a DOM Range, resizes the Reader or writes its scroll.
  const inset=['paddingTop','paddingBottom','borderTopWidth','borderBottomWidth'].reduce((n,key)=>n+(parseFloat(css[key])||0),0);
  const desired=Math.min(cap,Math.ceil(content.getBoundingClientRect().height+inset));
  const above=Math.max(0,anchor.top-gap-top),below=Math.max(0,bottom-anchor.bottom-gap);
  const useful=Math.min(desired,160);
  let budget=desired;
  if(below<desired&&above<desired){
    if(below>=useful)budget=Math.min(desired,below);
    else if(above>=useful)budget=Math.min(desired,above);
  }
  panel.style.maxHeight=Math.max(1,Math.floor(budget))+'px';
  placeLookupPeek(panel,{...anchor,direction:null},false);
  // Horizontal safe areas matter on landscape phones; the shared placement
  // still owns the below/above choice and Reader-control boundary.
  panel.style.left=Math.max(left,Math.min(parseFloat(panel.style.left),right-panel.offsetWidth))+'px';
}
function revealAnchoredSentenceResult(){
  const panel=document.getElementById('p-sentence'),life=sentenceLife;
  placeSentenceResult();
  if(!sentenceAlive(life)||!sentenceResultAnchored())return;
  if(typeof ResizeObserver!=='undefined'){
    sentenceResultObserver=new ResizeObserver(()=>{
      if(sentenceAlive(life)&&sentenceResultAnchored())scheduleSentenceResultPlacement();
    });
    sentenceResultObserver.observe(document.getElementById('ps-content'));
  }
  if(matchMedia('(prefers-reduced-motion: reduce)').matches||!panel.animate)return;
  // The final-sized surface arrives from its sentence-facing edge. There is no
  // imaginary mini pill, no scaling of Korean text, and no per-frame reflow.
  const delta=panel.dataset.expandDirection==='above'?6:-6;
  const animation=panel.animate([{opacity:0,transform:`translateY(${delta}px)`},{opacity:1,transform:'none'}],
    {duration:220,easing:'cubic-bezier(.2,.75,.25,1)',fill:'none'});
  sentenceResultAnimation=animation;
  animation.finished.then(()=>{if(sentenceResultAnimation===animation)sentenceResultAnimation=null;}).catch(()=>{});
}

let sentenceView = 'closed';
let sentenceOrigin=null;
let sentenceOwner=null;
let sentenceScrollPosition=null;
function sentenceSurfaceAnchored(){ return sentenceLookupOpen() && !!sentenceOrigin; }
let sentencePeekAnchor=null,sentencePeekLastScroll=-Infinity,sentencePeekShownAt=null;
let sentencePeekTimer=null,sentencePresentationEnded=false;
function cancelSentencePeekReveal(){ clearTimeout(sentencePeekTimer);sentencePeekTimer=null; }
function sentencePeekVisible(){
  return !!sentenceOrigin?.peekTarget && wordPeekTargetVisible(sentenceOrigin.peekTarget);
}
function deferSentencePeekReveal(){
  cancelSentencePeekReveal();
  const life=sentenceLife;
  sentencePeekTimer=setTimeout(()=>{
    sentencePeekTimer=null;
    if(!sentenceAlive(life)||!sentenceLookupOpen())return;
    if(sentencePendingPaint)revealSentenceResult();
    else if(sentencePillErrorActive())revealSentencePeek();
  },lookupPeekScrollRemaining(sentencePeekLastScroll));
}
function sentenceReaderScrolled(userScroll){
  if(!sentenceSurfaceAnchored()) return;
  const box=readerScroller();
  const position=[box?.scrollTop||0,box?.scrollLeft||0];
  const changed=!sentenceScrollPosition || position.some((value,index)=>value!==sentenceScrollPosition[index]);
  sentenceScrollPosition=position;
  if(!changed)return;
  if(!sentenceInlineActive()){
    if(userScroll)closeSentence();else if(sentenceResultAnchored())scheduleSentenceResultPlacement();
    return;
  }
  sentencePeekLastScroll=performance.now();
  const offscreen=!sentencePeekVisible();
  const dismiss=lookupPeekScrollDismiss(offscreen,userScroll,sentencePeekShownAt,true);
  document.getElementById('sentence-peek').hidden=true;
  cancelSentencePeekReveal();
  if(dismiss){
    sentencePresentationEnded=true;
    if(!sentenceWaitingActive())closeSentence();
    return;
  }
  sentencePeekShownAt=null;
  if(sentencePendingPaint||sentencePillErrorActive())deferSentencePeekReveal();
}
function revealSentencePeek(){
  const pill=document.getElementById('sentence-peek');
  if(!sentencePillErrorActive()||sentencePresentationEnded)return;
  if(lookupPeekScrollRemaining(sentencePeekLastScroll)>0){pill.hidden=true;deferSentencePeekReveal();return;}
  const life=sentenceLife;
  requestAnimationFrame(()=>{
    if(!sentenceAlive(life)||!sentencePillErrorActive())return;
    if(lookupPeekScrollRemaining(sentencePeekLastScroll)>0){pill.hidden=true;deferSentencePeekReveal();return;}
    if(!sentencePeekVisible()){closeSentence();return;}
    const rect=wordPeekNodeRect(sentenceOrigin.peekTarget);
    sentencePeekAnchor={...rect,direction:null};
    pill.style.visibility='hidden';pill.hidden=false;
    placeLookupPeek(pill,sentencePeekAnchor,false);pill.style.visibility='';
    if(sentencePeekShownAt===null)sentencePeekShownAt=performance.now();
  });
}
let sentenceCompact = false;
let sentencePendingPaint = null;
function sentenceLookupOpen(){ return sentenceView !== 'closed'; }
function sentenceWaitingActive(){ return sentenceView === 'waiting'; }
function sentencePillErrorActive(){ return sentenceView === 'error'; }
function sentenceInlineActive(){ return sentenceWaitingActive() || sentencePillErrorActive(); }
function sentenceSheetOpen(){ return sentenceView === 'sheet'; }
function sentenceBodyClass(name,on){
  const body=document.body;
  if(body && body.classList) body.classList.toggle(name,!!on);
}
function sentenceWaitingControls(waiting){
  document.getElementById('sentence-peek').hidden=true;
  const announcement=document.getElementById('sentence-loading-status');
  if(announcement) announcement.textContent=waiting ? '문장 해석 중' : '';
  if(typeof setReaderSentencePending==='function') setReaderSentencePending(waiting);
  if(waiting&&typeof closePdfNavigation==='function')closePdfNavigation();
}
function beginSentenceWaiting(){
  sentenceView='waiting';
  sentenceWaitingControls(true);
}
function revealSentenceResult(){
  if(!sentencePendingPaint || !sentenceAlive(sentencePendingPaint.life)) return;
  if(typeof sentenceGestureStillPressed==='function' && sentenceGestureStillPressed())return;
  if(sentencePresentationEnded){closeSentence();return;}
  if(sentenceOrigin?.peekTarget && lookupPeekScrollRemaining(sentencePeekLastScroll)>0){deferSentencePeekReveal();return;}
  if(sentenceOrigin?.peekTarget && !sentencePeekVisible()){closeSentence();return;}
  const state=sentencePendingPaint;
  sentencePendingPaint=null;
  if(state.error && sentenceOrigin?.peekTarget){
    sentenceView='error';
    document.getElementById('sentence-peek-meaning').textContent=state.foot || '해석하지 못했어요';
    const retry=document.getElementById('sentence-peek-retry');
    if(state.retry)retry.removeAttribute('disabled');else retry.setAttribute('disabled','');
    sentenceWaitingControls(false);
    const announcement=document.getElementById('sentence-loading-status');
    if(announcement)announcement.textContent=state.foot || '해석하지 못했어요';
    revealSentencePeek();
    return;
  }
  const anchored=!!sentenceOrigin?.peekTarget&&!state.error;
  sentenceView=anchored?'anchored':sentenceCompact?'sheet':'modal';
  sentenceWaitingControls(false);
  sentenceBodyClass('sentence-result-anchored',anchored);
  sentenceBodyClass('sentence-compact',!anchored&&sentenceCompact);
  sentenceBodyClass('sentence-anchored',!!sentenceOrigin);
  document.getElementById('p-sentence').setAttribute('aria-modal',String(!sentenceOrigin));
  const viewport=sentenceViewport();
  sentenceBodyClass('sentence-low-viewport',!anchored&&sentenceCompact && viewport.height < SENTENCE_COMPACT_MAX_HEIGHT);
  const modal=document.getElementById('sentence-modal');
  modal.hidden=false;
  if(anchored)revealAnchoredSentenceResult();
}
/* gesture.js가 롱프레스를 확정한 손가락의 pointerup을 받으면 부릅니다. 빠른 답이
   손가락 아래에 시트를 만들고, 그 손짓의 click이 곧바로 닫는 일을 막습니다. */
function sentenceGestureReleased(){
  if(sentencePendingPaint) revealSentenceResult();
}
function closeSentence(){
  stopSentenceResultPresentation();
  sentenceLife++;
  sentenceView='closed';
  cancelSentencePeekReveal();
  sentencePeekAnchor=null;sentencePeekShownAt=null;sentencePresentationEnded=false;
  sentencePendingPaint=null;
  sentenceOrigin=null;sentenceOwner=null;sentenceScrollPosition=null;
  if(typeof cancelSentenceEasyExplanation==='function') cancelSentenceEasyExplanation();
  sentenceWaitingControls(false);
  sentenceBodyClass('sentence-compact',false);
  sentenceBodyClass('sentence-result-anchored',false);
  sentenceBodyClass('sentence-anchored',false);
  sentenceBodyClass('sentence-low-viewport',false);
  const modal = document.getElementById('sentence-modal');
  if(modal) modal.hidden = true;
  if(typeof clearReaderModeCue === 'function') clearReaderModeCue();
  if(sentCtrl){ try{ sentCtrl.abort(); }catch(e){} sentCtrl = null; }
}
function paintSentence(state){
  const modal = document.getElementById('sentence-modal');
  const english=state.en || '';
  document.getElementById('ps-en').textContent = sentenceOrigin ? '' : english;
  document.getElementById('ps-source').hidden=!!sentenceOrigin;
  if(typeof resetSentenceEasyExplanation==='function') resetSentenceEasyExplanation(state.ko || '');
  const ko = document.getElementById('ps-ko');
  ko.textContent = state.ko || '';
  ko.hidden = !state.ko;
  const foot = document.getElementById('ps-foot');
  foot.textContent = state.foot || '';
  foot.hidden = !state.foot;
  /* 다시 물어볼 만한 실패에서만 뜹니다. 로그인이 없어서, 오늘 몫을 다 써서 막힌
     것은 다시 눌러도 같은 답이 오므로 여기서 권하지 않습니다. */
  const retry = document.getElementById('ps-retry');
  if(retry) retry.hidden = !state.retry;
  if(state.waiting){
    modal.hidden=true;
    beginSentenceWaiting();
    return;
  }
  if(typeof setReaderSentencePending==='function') setReaderSentencePending(false);
  const announcement=document.getElementById('sentence-loading-status');
  if(announcement) announcement.textContent='';
  sentencePendingPaint={life:sentenceLife,error:!state.ko,retry:!!state.retry,foot:state.foot};
  if(typeof sentenceGestureStillPressed === 'function' && sentenceGestureStillPressed()) return;
  revealSentenceResult();
}

/* 실패한 것은 요청 하나뿐입니다. 어느 문장이었는지는 창이 떠 있는 동안 여기
   한 줄로 남습니다 — 다시 짚을 필요가 없도록. 손짓·문장 찾기·칠하기는 이미
   끝난 일이라 아무것도 다시 하지 않습니다(scripts/reader/gesture.js). */
let sentAsked = '';
function retrySentence(){ if(sentAsked&&!sentenceWaitingActive()) openSentence(sentAsked,sentenceOrigin); }

let sentCtrl = null;
let sentenceLife = 0;
function sentenceAlive(life){ return life===sentenceLife && (!sentenceOwner || (sentenceOwner.actor===(sbUser?.id||'anonymous') && sentenceOwner.book===curBook)); }
function paintSentenceFor(life,state){
  if(!sentenceAlive(life)) return false;
  paintSentence(state); return true;
}
async function openSentence(text,origin){
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if(!clean) return;
  stopSentenceResultPresentation();
  const life=++sentenceLife;
  cancelSentencePeekReveal();sentencePendingPaint=null;
  sentencePeekAnchor=null;sentencePeekShownAt=null;sentencePresentationEnded=false;
  sentencePeekLastScroll=-Infinity;
  if(typeof cancelSentenceEasyExplanation==='function') cancelSentenceEasyExplanation();
  sentenceOrigin=origin || null;
  if(origin?.peekTarget)sentencePeekAnchor=wordPeekNodeRect(origin.peekTarget);
  sentenceOwner={actor:sbUser?.id||'anonymous',book:curBook};
  const box=typeof readerScroller==='function'?readerScroller():null;
  sentenceScrollPosition=[box?.scrollTop||0,box?.scrollLeft||0];
  if(sentCtrl){ try{ sentCtrl.abort(); }catch(e){} sentCtrl=null; }
  sentAsked = clean;
  sentenceCompact=sentenceCompactViewport();
  sentenceLastCompact=sentenceCompact;
  sentenceBodyClass('sentence-compact',false);
  sentenceBodyClass('sentence-result-anchored',false);
  sentenceBodyClass('sentence-anchored',false);
  sentenceBodyClass('sentence-low-viewport',false);
  paintSentenceFor(life,{ en:clean, waiting:true });

  if(typeof onboardingOwnsReader==='function' && onboardingOwnsReader()){
    await explainOnboardingSentence(clean,life);
    return;
  }

  const localStarted=Date.now(),key=sentKey(clean);
  let local=typeof homewardSentenceAnswer==='function'
    ?homewardSentenceAnswer(clean,origin&&origin.pi):null;
  if(!local){
    // A previously stored answer never waits for an optional asset download.
    const hit=await dictGet(key);
    if(!sentenceAlive(life))return;
    if(hit&&hit.ko){paintSentenceFor(life,{en:clean,ko:hit.ko});return;}
    if(typeof homewardNeedsLookupData==='function'&&homewardNeedsLookupData(curBook)){
      try{await ensureHomewardLookupData();}
      catch{paintSentenceFor(life,{en:clean,retry:true,foot:'읽기 자료를 준비하지 못했어요. 연결을 확인하고 다시 시도해 주세요.'});return;}
      if(!sentenceAlive(life))return;
      local=homewardSentenceAnswer(clean,origin&&origin.pi);
    }
  }
  if(local){
    await homewardPresentationWait(localStarted,()=>sentenceAlive(life));
    paintSentenceFor(life,{en:clean,ko:local});
    return;
  }

  if(!sb || navigator.onLine === false){
    paintSentenceFor(life,{ en:clean, retry:true, foot:'오프라인이에요' });
    return;
  }

  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  sentCtrl = ctrl;
  const recoveryKey=JSON.stringify([sbUser?.id||deviceId(),clean]);
  let lookupId=sentenceRecoveries.get(recoveryKey);
  if(!lookupId){lookupId=crypto.randomUUID();sentenceRecoveries.set(recoveryKey,lookupId);}
  if(sentenceRecoveries.size>32)sentenceRecoveries.delete(sentenceRecoveries.keys().next().value);
  const answer = await dictCall({ op:'explain',lookupId,device:sbUser?'':deviceId(), sentence:clean, book:(curBook && curBook.title) || '' },
                                ctrl ? ctrl.signal : null);
  if(sentCtrl === ctrl) sentCtrl = null;

  if(!answer || answer.error || !answer.ko){
    const why = answer && answer.error;
    if(!sentenceAlive(life)) return;
    if(why === 'quota_exceeded') rememberSentLeft(0,answer.day);
    const stuck = why === 'login_required' || why === 'quota_exceeded' || why === 'anon_exhausted';
    paintSentenceFor(life,{ en:clean, retry:!stuck, foot:
        (why === 'login_required'||why === 'anon_exhausted') ? '로그인하면 해석을 이어서 볼 수 있어요'
      : why === 'quota_exceeded' ? '오늘 해석 사용량을 다 썼어요'
      :                            '해석하지 못했어요' });
    return;
  }
  sentenceRecoveries.delete(recoveryKey);
  if(sentenceAlive(life)&&sbUser)rememberSentLeft(answer.left,answer.day);
  paintSentenceFor(life,{ en:clean, ko:answer.ko });
  await dictPut(key, { ko:answer.ko, done:true });
}

document.addEventListener('keydown', event=>{
  if(event.key === 'Escape' && sentenceLookupOpen()) closeSentence();
});

/* 주소창이 드나드는 작은 높이 변화는 같은 분기에 머무는 한 아무 일도 아닙니다.
   실제 분기가 바뀔 때만 현재 조회를 끝내며 자동으로 다시 묻지 않습니다. */
let sentenceLastCompact=sentenceCompactViewport();
function sentenceViewportChanged(){
  const next=sentenceCompactViewport();
  if(next!==sentenceLastCompact && sentenceLookupOpen()&&!sentenceResultAnchored()) closeSentence();
  sentenceLastCompact=next;
  if(sentencePillErrorActive())revealSentencePeek();
  if(sentenceResultAnchored()){
    sentenceResultAnimation?.cancel();sentenceResultAnimation=null;
    if(sentenceResultFrame)cancelAnimationFrame(sentenceResultFrame);sentenceResultFrame=0;
    // The source cue's ResizeObserver refreshes its cached union after layout.
    // Reposition in the following frame even when this card stays at its cap.
    scheduleSentenceResultPlacement(true);
  }
}
if(typeof window!=='undefined'){
  window.addEventListener('resize',sentenceViewportChanged,{passive:true});
  if(window.visualViewport) window.visualViewport.addEventListener('resize',sentenceViewportChanged,{passive:true});
}
