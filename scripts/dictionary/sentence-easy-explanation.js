/* Explicit, transient sentence help. Shared word-help material; no vocabulary or
   durable cache writes. The distinct op fails closed on an undeployed backend. */
let sentenceEasyAvailable=false;
const sentenceEasyCache=new Map();
const sentenceEasyOccurrences=new WeakMap();
let sentenceEasyOccurrenceSequence=0;
function setSentenceEasyCapability(available){
  sentenceEasyAvailable=available===true;
  if(sentenceLookupOpen()) renderSentenceEasyExplanation();
}
let sentenceEasyState=null;
function cancelSentenceEasyExplanation(){
  sentenceEasyState?.controller?.abort();sentenceEasyState=null;
  const section=document.getElementById('ps-easy');
  section.getAnimations?.().forEach(animation=>animation.cancel());
  section.hidden=true;section.classList.remove('expanded');
  document.getElementById('ps-easy-text').textContent='';
  document.getElementById('ps-easy-card').hidden=true;
  document.getElementById('ps-easy-skeleton').hidden=true;
}
function clearSentenceEasyCache(){ cancelSentenceEasyExplanation();sentenceEasyCache.clear(); }
function resetSentenceEasyExplanation(translation){
  cancelSentenceEasyExplanation();
  if(!translation)return;
  const owner=sentenceOrigin?.owner;
  if(owner&&!sentenceEasyOccurrences.has(owner))sentenceEasyOccurrences.set(owner,++sentenceEasyOccurrenceSequence);
  const key=JSON.stringify([owner?sentenceEasyOccurrences.get(owner):null,sbUser?.id||'anonymous',curBook?.id,sentAsked,translation,sentenceOrigin?.pi,sentenceOrigin?.page,sentenceOrigin?.start]);
  sentenceEasyState={key,life:sentenceLife,translation,text:sentenceEasyCache.get(key)||'',error:'',loading:false,blocked:false,controller:null};
  renderSentenceEasyExplanation();
}
function renderSentenceEasyExplanation(){
  const state=sentenceEasyState;if(!state||!sentenceAlive(state.life))return;
  if(!sentenceEasyAvailable){document.getElementById('ps-easy').hidden=true;return;}
  finishEasyExplanationSurface(renderEasyExplanationSurface('ps-easy',state,'문장을 쉬운 말로 풀고 있어요.'));
}

async function requestSentenceEasyExplanation(){
  const state=sentenceEasyState;
  if(!sentenceEasyAvailable||!state||state.loading||state.text||state.blocked||!sentenceAlive(state.life))return;
  if(navigator.onLine===false){state.error=easyExplanationError(null);renderSentenceEasyExplanation();return;}
  const controller=new AbortController();state.controller=controller;state.loading=true;state.error='';renderSentenceEasyExplanation();
  const timeout=setTimeout(()=>controller.abort(),30000);
  const alive=()=>sentenceEasyState===state&&sentenceAlive(state.life);
  try{
    // Resolve source context only after the explicit click; ambiguous repeated
    // sentences never borrow context from another occurrence.
    const context=sentenceOrigin?.context?sentenceOrigin.context():curBook?.paras?easySentenceWindow(curBook.paras,sentAsked,sentenceOrigin):{before:[],after:[]};
    const answer=await dictCall({op:'sentence_easy_explanation',sentence:sentAsked,translation:state.translation,...context,device:deviceId()},controller.signal);
    if(!alive()||controller.signal.aborted)return;
    rememberAiLeft(answer?.left);
    if(!answer?.error&&typeof answer?.explanation==='string'&&answer.explanation.trim().length>=10&&answer.explanation.length<=600){
      state.text=answer.explanation.trim();sentenceEasyCache.set(state.key,state.text);
      if(sentenceEasyCache.size>16)sentenceEasyCache.delete(sentenceEasyCache.keys().next().value);
    }else{
      state.blocked=['bad_op','login_required','anon_exhausted','quota_exceeded'].includes(answer?.error);
      state.error=answer?.error==='bad_op'?'문장 쉬운 설명은 아직 준비 중이에요.':easyExplanationError(answer);
    }
  }catch{if(alive())state.error=easyExplanationError(null);}
  finally{
    clearTimeout(timeout);
    if(alive()){
      state.loading=false;state.controller=null;
      if(!state.text&&!state.error)state.error='설명이 지연됐어요. 다시 시도할 수 있어요.';
      renderSentenceEasyExplanation();
    }
  }
}
document.getElementById('ps-easy-button').addEventListener('click',()=>void requestSentenceEasyExplanation());
document.getElementById('ps-easy-retry').addEventListener('click',()=>void requestSentenceEasyExplanation());
