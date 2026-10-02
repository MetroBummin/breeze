/* Request-only concept help. Memory cache belongs to this page/account, never to
   the vocabulary, IndexedDB, localStorage, sync or the persisted lookup cache. */
const easyExplanationCache=new Map();
let easyExplanationState=null,easyExplanationActor='';
// Resolve neighbors only on an explicit request. Exact occurrence hints win over
// text search; repeated sentences without an anchor never borrow another scene.
function easySentenceWindow(paragraphs,sentence,hint){
  const clean=text=>String(text||'').replace(/\s+/g,' ').trim();
  const parts=text=>bridgeSentences(String(text||''));
  let pi=-1,at=-1,current=[];
  if(hint&&Number.isInteger(hint.pi)&&paragraphs[hint.pi]!==undefined){
    pi=hint.pi;current=parts(paragraphs[pi]);
    at=current.findIndex(part=>part.start===hint.start&&clean(part.text)===clean(sentence));
  }
  if(at<0){
    const matches=[];
    for(let i=0;i<paragraphs.length;i++){
      if(!clean(paragraphs[i]).includes(clean(sentence)))continue;
      for(const [j,part] of parts(paragraphs[i]).entries())if(clean(part.text)===clean(sentence))matches.push([i,j]);
      if(matches.length>1)return {before:[],after:[]};
    }
    if(matches.length!==1)return {before:[],after:[]};
    [pi,at]=matches[0];current=parts(paragraphs[pi]);
  }
  let before=current.slice(Math.max(0,at-2),at).map(part=>clean(part.text));
  let after=current.slice(at+1,at+3).map(part=>clean(part.text));
  for(let i=pi-1;i>=0&&before.length<2;i--)before=parts(paragraphs[i]).map(part=>clean(part.text)).concat(before).slice(-2);
  for(let i=pi+1;i<paragraphs.length&&after.length<2;i++)after=after.concat(parts(paragraphs[i]).map(part=>clean(part.text))).slice(0,2);
  return {before:before.map(text=>text.slice(-2400)),after:after.map(text=>text.slice(0,2400))};
}
function easyExplanationContext(sentence){
  const node=activeSelectedWordNode;
  const spot=typeof textSentencePartAt==='function'?textSentencePartAt(node):null;
  if(spot&&curBook?.paras)return easySentenceWindow(curBook.paras,sentence,{pi:Number(spot.block.dataset.pi),start:spot.part.start});
  // Original EPUB keeps an exact DOM Range owner even though its marker is an overlay.
  const target=node&&wordLookupTargets.get(node),owner=target?.owner;
  if(owner&&typeof target.start==='number'){
    const selector='p,li,blockquote,h1,h2,h3,h4',block=(owner.nodeType===3?owner.parentElement:owner)?.closest(selector);
    if(block){
      const blocks=Array.from(block.ownerDocument.querySelectorAll(selector)).filter(el=>el===block||!el.querySelector(selector));
      const range=block.ownerDocument.createRange();range.selectNodeContents(block);range.setEnd(owner,Number(target.start));
      const offset=range.toString().length,part=bridgeSentences(block.textContent).find(part=>offset>=part.start&&offset<part.end);
      return easySentenceWindow(blocks.map(el=>el.textContent),sentence,part?{pi:blocks.indexOf(block),start:part.start}:null);
    }
  }
  const found=curBook?.paras?easySentenceWindow(curBook.paras,sentence,null):{before:[],after:[]};
  if(found.before.length||found.after.length)return found;
  try{return {before:JSON.parse(node?.dataset.easyBefore||'[]'),after:JSON.parse(node?.dataset.easyAfter||'[]')};}catch{return found;}
}
function easyExplanationInput(){
  const item=selKey&&words[selKey];
  if(!item||previewWordCard||!String(item.ko||'').trim())return null;
  const context=currentContext(selKey);
  if(context&&(context.loading||context.error))return null;
  const actor=sbUser?.id||'anonymous';
  if(actor!==easyExplanationActor){easyExplanationCache.clear();easyExplanationActor=actor;}
  const node=typeof activeSelectedWordNode==='undefined'?null:activeSelectedWordNode;
  const spot=typeof textSentencePartAt==='function'?textSentencePartAt(node):null;
  const occurrence=node?.dataset.readerAnchor||JSON.stringify([spot?.block.dataset.pi,spot?.part.start]);
  const sourceSentence=String(context?.sentence||(node&&typeof sentenceOf==='function'?sentenceOf(node):'')||item.example||'');
  const input={word:String(item.word||'').slice(0,120),meaning:String(item.ko).slice(0,500),sentence:sourceSentence.slice(0,2400)};
  return {key:JSON.stringify([actor,selKey,input,typeof curBook!=='undefined'?curBook?.id:null,occurrence]),input,sourceSentence};
}
function cancelEasyExplanation(){
  easyExplanationState?.controller?.abort();
  easyExplanationState=null;
  document.getElementById('p-easy-text').textContent='';
  document.getElementById('p-easy-card').hidden=true;
}
function renderEasyExplanation(){
  const current=easyExplanationInput(),section=document.getElementById('p-easy');
  section.hidden=!current;
  if(!current){cancelEasyExplanation();return;}
  if(easyExplanationState?.key!==current.key){
    cancelEasyExplanation();
    easyExplanationState={...current,text:easyExplanationCache.get(current.key)||'',error:'',loading:false,controller:null};
  }
  const state=easyExplanationState,button=/** @type {HTMLButtonElement} */(document.getElementById('p-easy-button'));
  const expanded=!!(state.loading||state.text||state.error);
  button.disabled=state.loading||!!state.text;
  button.textContent=state.loading?'설명하는 중…':state.text?'쉽게 설명':state.error?'다시 설명':'쉽게 설명';
  button.setAttribute('aria-expanded',String(expanded));
  const card=document.getElementById('p-easy-card');card.hidden=!expanded;card.setAttribute('aria-busy',String(state.loading));
  document.getElementById('p-easy-text').textContent=state.loading?'뜻을 쉬운 말로 풀고 있어요.':state.text||state.error;
}
function easyExplanationError(answer){
  if(navigator.onLine===false)return '오프라인이에요. 연결한 뒤 다시 눌러 주세요.';
  if(answer?.error==='anon_exhausted'||answer?.error==='login_required')return '무료 체험을 다 썼어요. 설정에서 로그인한 뒤 다시 이용해 주세요.';
  if(answer?.error==='quota_exceeded')return '오늘 AI 사용량을 다 썼어요. 내일 다시 이용해 주세요.';
  if(answer?.error==='bad_op')return '쉬운 설명을 아직 사용할 수 없어요. 잠시 후 다시 이용해 주세요.';
  return '설명을 가져오지 못했어요. 다시 시도할 수 있어요.';
}
async function requestEasyExplanation(){
  renderEasyExplanation();
  const state=easyExplanationState;if(!state||state.loading||state.text)return;
  if(navigator.onLine===false){state.error=easyExplanationError(null);renderEasyExplanation();return;}
  const life=wordLookupLife,controller=new AbortController(),owner=wordLookupSignal();
  if(owner?.aborted)return;
  const cancel=()=>controller.abort();owner?.addEventListener('abort',cancel,{once:true});
  state.controller=controller;state.loading=true;state.error='';renderEasyExplanation();
  const timeout=setTimeout(cancel,30000);
  try{
    const neighbors=easyExplanationContext(state.sourceSentence);
    const answer=await dictCall({op:'easy_explanation',...state.input,...neighbors,device:deviceId()},controller.signal);
    if(controller.signal.aborted||!wordLookupAlive(life)||easyExplanationState!==state||easyExplanationInput()?.key!==state.key)return;
    rememberAiLeft(answer?.left);
    if(!answer?.error&&typeof answer?.explanation==='string'&&answer.explanation.trim().length>=10&&answer.explanation.length<=600){
      state.text=answer.explanation.trim();easyExplanationCache.set(state.key,state.text);
      if(easyExplanationCache.size>16)easyExplanationCache.delete(easyExplanationCache.keys().next().value);
    }else state.error=easyExplanationError(answer);
  }catch{
    if(easyExplanationState===state)state.error=easyExplanationError(null);
  }finally{
    clearTimeout(timeout);owner?.removeEventListener('abort',cancel);
    if(easyExplanationState===state&&wordLookupAlive(life)){
      state.loading=false;state.controller=null;
      if(!state.text&&!state.error)state.error='설명이 지연됐어요. 다시 시도할 수 있어요.';
      renderEasyExplanation();
      if(wordDetailAnchored)requestAnimationFrame(placeWordDetail);
    }
  }
}
document.getElementById('p-easy-button').addEventListener('click',()=>void requestEasyExplanation());
