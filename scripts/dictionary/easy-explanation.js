/* Request-only concept help. Memory cache belongs to this page/account, never to
   the vocabulary, IndexedDB, localStorage, sync or the persisted lookup cache. */
const easyExplanationCache=new Map();
const easyExplanationContexts=new Map();
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
  if(actor!==easyExplanationActor){easyExplanationCache.clear();easyExplanationContexts.clear();easyExplanationActor=actor;}
  const node=typeof activeSelectedWordNode==='undefined'?null:activeSelectedWordNode;
  const spot=typeof textSentencePartAt==='function'?textSentencePartAt(node):null;
  const occurrence=node?.dataset.readerAnchor||JSON.stringify([spot?.block.dataset.pi,spot?.part.start]);
  const sourceSentence=String(context?.sentence||(node&&typeof sentenceOf==='function'?sentenceOf(node):'')||item.example||'');
  const input={word:String(item.word||'').slice(0,120),meaning:String(item.ko).slice(0,500),sentence:sourceSentence.slice(0,2400)};
  const key=JSON.stringify([actor,selKey,input,typeof curBook!=='undefined'?curBook?.id:null,occurrence]);
  const word=item.root||selKey,previous=easyExplanationContexts.get(word);
  // Only the last encountered context of a word may retain its transient answer.
  // A -> B -> A starts collapsed again, even if A once had an explanation.
  if(previous&&previous!==key)easyExplanationCache.delete(previous);
  easyExplanationContexts.delete(word);easyExplanationContexts.set(word,key);
  if(easyExplanationContexts.size>16){
    const oldest=easyExplanationContexts.keys().next().value;
    easyExplanationCache.delete(easyExplanationContexts.get(oldest));easyExplanationContexts.delete(oldest);
  }
  return {key,input,sourceSentence,id:selKey,snapshot:JSON.stringify([item.ko,item.example,item.book]),
    book:context?.book||curBook?.title||item.book||'',clickedIndex:Number.isInteger(context?.clickedIndex)?context.clickedIndex:typeof lookupClickedTokenIndex==='function'?lookupClickedTokenIndex(node,sourceSentence,lookupSentenceTokens(sourceSentence),spot):-1};
}
function cancelEasyExplanation(){
  easyExplanationState?.controller?.abort();
  easyExplanationState=null;
  document.getElementById('p-easy-text').textContent='';
  document.getElementById('p-easy-card').hidden=true;
  document.getElementById('p-easy-skeleton').hidden=true;
}
function renderEasyExplanation(){
  const current=easyExplanationInput(),section=document.getElementById('p-easy');
  section.hidden=!current;
  if(!current){document.getElementById('p-easy-button').hidden=true;cancelEasyExplanation();return;}
  if(easyExplanationState?.key!==current.key||easyExplanationState?.snapshot!==current.snapshot){
    cancelEasyExplanation();
    const cached=easyExplanationCache.get(current.key);
    easyExplanationState={...current,text:'',suggestion:'',applied:false,...(cached?.snapshot===current.snapshot?cached:{}),error:'',loading:false,controller:null};
  }
  const state=easyExplanationState,button=/** @type {HTMLButtonElement} */(document.getElementById('p-easy-button'));
  const expanded=!!(state.loading||state.text||state.error);
  const wasExpanded=section.classList.contains('expanded');
  const surface=section;
  const before=surface.getBoundingClientRect();
  surface.getAnimations?.().forEach(animation=>animation.cancel());
  section.classList.toggle('expanded',expanded);
  button.disabled=state.loading;button.hidden=expanded;
  document.getElementById('p-easy-retry').hidden=!state.error;
  button.setAttribute('aria-expanded',String(expanded));
  const card=document.getElementById('p-easy-card');card.hidden=!expanded;card.setAttribute('aria-busy',String(state.loading));
  const text=document.getElementById('p-easy-text');
  document.getElementById('p-easy-skeleton').hidden=!state.loading;
  text.classList.toggle('easy-loading-status',state.loading);
  document.querySelector('.p-easy-note').toggleAttribute('hidden',state.loading);
  text.textContent=state.loading?'뜻을 쉬운 말로 풀고 있어요.':state.text||state.error;
  const proposal=document.getElementById('p-easy-suggestion'),apply=/** @type {HTMLButtonElement} */(document.getElementById('p-easy-apply'));
  proposal.hidden=!state.suggestion&&!state.applied;
  const same=easySameExample(state,words[state.id]);
  document.getElementById('p-easy-proposal').textContent=state.applied?'뜻을 저장했어요.':same?`뜻을 ‘${state.suggestion}’로 바꿀까요?`:`이 문장에서는 ‘${state.suggestion}’라는 뜻으로 저장할까요?`;
  apply.hidden=!!state.applied;apply.disabled=!state.suggestion;
  apply.textContent=same?'이 뜻으로 바꾸기':'이 뜻 저장하기';
  if(expanded&&!wasExpanded)text.focus({preventScroll:true});
  if(expanded&&surface.animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    const after=surface.getBoundingClientRect();
    if(before.height>0&&Math.abs(after.height-before.height)>1){
      surface.animate([{height:before.height+'px'},{height:after.height+'px'}],{duration:260,easing:'cubic-bezier(.2,.7,.2,1)'});
    }
  }
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
      state.text=answer.explanation.trim();
      const suggestion=typeof answer.suggestedMeaning==='string'&&answer.suggestedMeaning.length<=120?answer.suggestedMeaning.replace(/\s+/g,' ').trim():'';
      state.suggestion=state.sourceSentence&&suggestion&&suggestion.toLowerCase()!==state.input.meaning.replace(/\s+/g,' ').toLowerCase()?suggestion:'';
      easyExplanationCache.set(state.key,{text:state.text,suggestion:state.suggestion,snapshot:state.snapshot});
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

document.getElementById('p-easy-retry').addEventListener('click',()=>void requestEasyExplanation());

function easySameExample(state,item){
  const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
  return !!item&&!!clean(item.example)&&clean(item.example)===clean(state.sourceSentence)&&(!item.book||item.book===state.book);
}
function applyEasyMeaning(){
  const state=easyExplanationState,current=easyExplanationInput();
  if(!state?.suggestion||state.applied||!current||current.key!==state.key||current.snapshot!==state.snapshot)return;
  const item=words[state.id];if(!item)return;
  const root=item.root||state.id,meaning=state.suggestion;
  let id=state.id;
  if(easySameExample(state,item)){
    // An explicit correction follows manual editing: preserve this card's identity,
    // stars and example; its changed meaning invalidates stale study grades.
    item.ko=meaning;item.koEdited=true;item.ai={...item.ai,ko:meaning,done:true};
    item.up=Math.max(Date.now(),(item.up||0)+1);
  }else{
    // Context B cannot rewrite the meaning/example pair from context A.
    id=createMeaning(root,meaning,{example:state.sourceSentence,book:state.book,ai:{ko:meaning,done:true}});
    if(!id)return;
  }
  // An explicitly accepted sense owns this occurrence even if a previous AI
  // lookup associated the same occurrence with another meaning.
  const hash='v2:'+sentenceHash(state.sourceSentence)+':'+state.clickedIndex;
  let reassigned=false;
  for(const [otherId,other] of Object.entries(words)){
    if(otherId===id||(otherId!==root&&other.root!==root)||!other.contextHashes?.includes(hash))continue;
    other.contextHashes=other.contextHashes.filter(value=>value!==hash);
    other.up=Math.max(Date.now(),(other.up||0)+1);reassigned=true;
  }
  rememberSenseContext(id,state.sourceSentence,state.clickedIndex);
  words[id].up=Math.max(Date.now(),(words[id].up||0)+1);
  saveWords(reassigned?undefined:id);queueSync(true);selKey=id;contextView=null;
  state.applied=true;state.suggestion='';
  const next=easyExplanationInput();
  easyExplanationCache.delete(state.key);
  if(next){easyExplanationCache.set(next.key,{text:state.text,suggestion:'',applied:true,snapshot:next.snapshot});easyExplanationState={...state,...next};}
  refreshReaderWords();renderWordLookup();
  if(wordDetailAnchored)requestAnimationFrame(placeWordDetail);
}
document.getElementById('p-easy-apply').addEventListener('click',applyEasyMeaning);
