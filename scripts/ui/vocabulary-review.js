/* Review progress is device-local and never touches vocabulary/sync records. */
const VOCABULARY_REVIEW_STORAGE='breeze.vocabulary-review.v1';
const vocabularyReviewPage=document.getElementById('vocabulary-review-page');
let vocabularyReviewView=null;
let vocabularyReviewRevealed=false;
function readVocabularyReview(){
  const raw=localStorage.getItem(VOCABULARY_REVIEW_STORAGE);
  if(!raw)return BreezeReview.normalize(null);
  try{return BreezeReview.normalize(JSON.parse(raw));}catch(error){
    if(error instanceof SyntaxError)return BreezeReview.normalize(null);
    throw error;
  }
}
function commitVocabularyReview(state){
  localStorage.setItem(VOCABULARY_REVIEW_STORAGE,JSON.stringify(state));
}
function vocabularyReviewError(){
  const error=document.getElementById('review-error');
  error.textContent='복습 기록을 저장하지 못했어요. 저장 공간을 확인한 뒤 다시 시도해 주세요.';
  error.hidden=false;
}
let vocabularySelecting=false;
const vocabularySelected=new Set();
function visibleVocabularyReviewKeys(){
  return Array.from(document.querySelectorAll('#vtablewrap .vsense')).map(node=>/** @type {HTMLElement} */(node).dataset.k).filter(key=>validWordMeaning(words[key]));
}
function vocabularyReviewScope(){
  const visible=visibleVocabularyReviewKeys();
  const filtered=wordbookBooks.size>0||wordbookStars.size>0||!!/** @type {HTMLInputElement} */(document.getElementById('vsearch')).value.trim();
  return {custom:vocabularySelecting||filtered,keys:vocabularySelecting?visible.filter(key=>vocabularySelected.has(key)):visible};
}
function refreshVocabularyReviewEntry(){
  try{
    const view=BreezeReview.view(readVocabularyReview(),words,Date.now()),scope=vocabularyReviewScope();
    const button=/** @type {HTMLButtonElement} */(document.getElementById('wordbook-review'));
    button.textContent=scope.custom?`선택 복습 · ${scope.keys.length}`:view.status==='active'?`복습 이어 하기 · ${view.total-view.completed}`:`오늘 복습 · ${Math.min(5,view.eligibleCount)}`;
    button.disabled=scope.custom&&!scope.keys.length;
    document.getElementById('review-use-daily').hidden=!scope.custom;
    document.getElementById('review-plan').textContent=scope.custom?'선택한 범위의 뜻을 복습해요.':view.status==='active'?'지난 복습을 이어서 할 수 있어요.':'기한이 된 표현부터, 한 번에 최대 5개';
  }catch{/* Keep entry usable; show storage errors on the study page. */}
}
function renderVocabularySelection(){
  const visible=visibleVocabularyReviewKeys(),allowed=new Set(visible);
  for(const key of vocabularySelected)if(!allowed.has(key))vocabularySelected.delete(key);
  const wrap=document.getElementById('vtablewrap');wrap.classList.toggle('review-selecting',vocabularySelecting);
  wrap.querySelectorAll('.review-pick').forEach(node=>node.remove());
  if(vocabularySelecting)for(const node of wrap.querySelectorAll('.vsense')){
    const key=/** @type {HTMLElement} */(node).dataset.k,item=words[key];
    const label=document.createElement('label');label.className='review-pick';
    const input=document.createElement('input');input.type='checkbox';input.checked=vocabularySelected.has(key);
    input.setAttribute('aria-label',`${item.word} · ${item.ko} 선택`);
    input.addEventListener('change',()=>{if(input.checked)vocabularySelected.add(key);else vocabularySelected.delete(key);refreshVocabularySelectionState();});
    label.append(input);node.prepend(label);
  }
  refreshVocabularySelectionState();
}
function refreshVocabularySelectionState(){
  const visible=visibleVocabularyReviewKeys();
  const all=/** @type {HTMLInputElement} */(document.getElementById('review-select-all'));
  all.checked=visible.length>0&&visible.every(key=>vocabularySelected.has(key));
  all.indeterminate=vocabularySelected.size>0&&!all.checked;
  document.getElementById('review-select-all-label').hidden=!vocabularySelecting;
  document.getElementById('review-select-toggle').textContent=vocabularySelecting?'선택 완료':'선택';
  document.getElementById('review-select-toggle').setAttribute('aria-pressed',String(vocabularySelecting));
  document.getElementById('review-selection-count').textContent=vocabularySelecting?`${vocabularySelected.size}개 선택`:'';
  refreshVocabularyReviewEntry();
}
document.getElementById('review-select-toggle').addEventListener('click',()=>{
  vocabularySelecting=!vocabularySelecting;vocabularySelected.clear();renderVocabularySelection();
});
document.getElementById('review-select-all').addEventListener('change',event=>{
  for(const key of visibleVocabularyReviewKeys())if(/** @type {HTMLInputElement} */(event.target).checked)vocabularySelected.add(key);else vocabularySelected.delete(key);
  renderVocabularySelection();
});
function highlightReviewSentence(card){
  const target=document.getElementById('review-sentence');target.replaceChildren();
  if(!card.example){target.textContent='저장된 원문 문장이 없어요. 표현을 보고 뜻을 떠올려 보세요.';return;}
  const record=words[card.key]||{};
  const phrase=Array.isArray(record.phraseParts)?record:words[record.root];
  const ranges=[];
  if(phrase&&Array.isArray(phrase.phraseParts)&&phrase.phraseParts.length>1){
    // Phrase forms are members, not independent words to highlight everywhere.
    // Reuse Reader recognition, including inflection and saved intervening gaps.
    const parts=phrase.phraseParts;
    const gaps=Array.isArray(phrase.phraseGaps)&&phrase.phraseGaps.length===parts.length-1
      ? phrase.phraseGaps.map(value=>Math.max(0,Math.min(12,Number(value)||0)))
      : new Array(parts.length-1).fill(0);
    const matches=[...card.example.matchAll(new RegExp(WORD_RE.source,WORD_RE.flags))];
    for(let index=0;index<matches.length;index++){
      if(!lemmaCands(matches[index][0]).includes(parts[0]))continue;
      const found=savedPhraseMatch(matches,index,{parts,gaps});
      if(!found)continue;
      let previous=-2;
      for(const selected of found.selected){
        const token=matches[selected],end=token.index+token[0].length;
        if(selected===previous+1)ranges[ranges.length-1].end=end;
        else ranges.push({start:token.index,end});
        previous=selected;
      }
      index=found.end;
    }
  }else{
    const forms=[record.clicked,...(Array.isArray(record.forms)?record.forms:[]),card.word]
      .filter(value=>typeof value==='string'&&value.trim()).map(value=>value.trim()).sort((a,b)=>b.length-a.length);
    const alternatives=[...new Set(forms)].map(value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
    const pattern=new RegExp('(^|[^\\p{L}\\p{N}_])('+alternatives.join('|')+')(?=$|[^\\p{L}\\p{N}_])','giu');
    for(const match of card.example.matchAll(pattern)){
      const start=match.index+match[1].length;
      ranges.push({start,end:start+match[2].length});
    }
  }
  // Saved content is always text, never HTML or executable regular expressions.
  let end=0;
  for(const range of ranges){
    const start=range.start;
    target.append(document.createTextNode(card.example.slice(end,start)));
    const mark=document.createElement('mark');mark.textContent=card.example.slice(start,range.end);target.append(mark);
    end=range.end;
  }
  target.append(document.createTextNode(card.example.slice(end)));
}
function renderVocabularyReview(view,focus=true){
  vocabularyReviewView=view;vocabularyReviewRevealed=false;
  document.getElementById('review-front').hidden=false;
  document.getElementById('review-back').hidden=true;
  document.getElementById('review-flip').setAttribute('aria-label','카드를 뒤집어 뜻 보기');
  document.getElementById('review-error').hidden=true;
  document.getElementById('review-meaning').hidden=true;
  document.getElementById('review-meaning').textContent='';
  document.getElementById('review-grade').hidden=true;
  document.getElementById('review-reveal').hidden=false;
  document.getElementById('review-card').hidden=!view.card;
  document.getElementById('review-finish').hidden=!!view.card;
  document.getElementById('review-progress').textContent=view.card?`${view.completed+1} / ${view.total}`:'';
  const status=document.getElementById('review-status');status.textContent='';
  if(view.card){
    document.getElementById('review-expression').textContent=view.card.word;
    document.getElementById('review-back-expression').textContent=view.card.word;
    for(const [id,outcome] of [['confused','confused'],['uncertain','uncertain'],['remember','remembered']]){
      const ms=view.intervals[outcome];
      document.getElementById('review-'+id+'-interval').textContent=ms<3600000?`${ms/60000}분`:ms<86400000?`${ms/3600000}시간`:`${ms/86400000}일`;
    }
    document.getElementById('review-source').textContent=view.card.book||'출처 제목 없음';
    highlightReviewSentence(view.card);
    if(focus)document.getElementById('review-reveal').focus();
  }else{
    if(view.status==='complete')status.textContent=`이번 복습을 마쳤어요.\n알아요 ${view.remembered}개 · 애매해요 ${view.uncertain}개 · 모르겠어요 ${view.confused}개\n각 표현의 다음 복습 시간을 정했어요.`;
    else if(view.status==='empty')status.textContent='아직 복습할 표현이 없어요. 읽다가 단어나 표현의 뜻을 저장해 보세요.';
    else if(view.status==='waiting')status.textContent='지금 복습할 표현은 모두 마쳤어요.'+(view.nextDueAt?`\n다음 복습: ${new Date(view.nextDueAt).toLocaleString('ko-KR',{month:'long',day:'numeric',hour:'numeric',minute:'2-digit'})}`:'');
    else status.textContent='저장한 표현으로 짧게 복습해 보세요.';
    if(focus)status.focus();
  }
  refreshVocabularyReviewEntry();
}
function resumeVocabularyReview(){
  try{
    const view=BreezeReview.view(readVocabularyReview(),words,Date.now());
    document.getElementById('review-title').textContent=view.state.session?.practice?'선택한 뜻 복습':'오늘의 복습';
    renderVocabularyReview(view);
  }catch{renderVocabularyReview({card:null,status:'idle'});vocabularyReviewError();}
}
function openVocabularyReview(daily=false){
  if(activeAppView()==='study')return;
  try{
    const scope=vocabularyReviewScope(),raw=readVocabularyReview();
    if(daily&&raw.session?.practice)raw.session=null;
    const view=!daily&&scope.custom?BreezeReview.startSelection(raw,words,scope.keys,Date.now()):BreezeReview.start(raw,words,Date.now());
    commitVocabularyReview(view.state);show('study');
  }catch{
    show('study');renderVocabularyReview({card:null,status:'idle'});vocabularyReviewError();
  }
}
function resetVocabularyReviewSurface(){
  vocabularyReviewRevealed=false;document.getElementById('review-meaning').hidden=true;
}
function closeVocabularyReview(){
  if(activeAppView()!=='study')return;
  show('vocab',{replace:true});document.getElementById('wordbook-review').focus();
}
document.getElementById('review-close').addEventListener('click',closeVocabularyReview);
document.getElementById('review-finish').addEventListener('click',closeVocabularyReview);
window.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&activeAppView()==='study'){event.preventDefault();closeVocabularyReview();}
});
function revealVocabularyReview(){
  if(!vocabularyReviewView?.card||vocabularyReviewRevealed)return;
  try{
    const latest=BreezeReview.view(readVocabularyReview(),words,Date.now());
    if(latest.token!==vocabularyReviewView.token){renderVocabularyReview(latest);return;}
    vocabularyReviewView=latest;vocabularyReviewRevealed=true;
    document.getElementById('review-front').hidden=true;document.getElementById('review-back').hidden=false;
    document.getElementById('review-flip').setAttribute('aria-label','원문 문장 다시 보기');
    const meaning=document.getElementById('review-meaning');meaning.textContent=latest.card.ko;meaning.hidden=false;
    document.getElementById('review-reveal').hidden=true;document.getElementById('review-grade').hidden=false;
    meaning.focus();
  }catch{vocabularyReviewError();}
}
document.getElementById('review-reveal').addEventListener('click',revealVocabularyReview);
function flipVocabularyReview(){
  if(!vocabularyReviewRevealed){revealVocabularyReview();return;}
  const front=document.getElementById('review-front'),back=document.getElementById('review-back');
  front.hidden=!front.hidden;back.hidden=!front.hidden;
  document.getElementById('review-flip').setAttribute('aria-label',front.hidden?'원문 문장 다시 보기':'뜻 다시 보기');
}
document.getElementById('review-flip').addEventListener('click',flipVocabularyReview);
document.getElementById('review-flip').addEventListener('keydown',event=>{
  if(event.key==='Enter'||event.key===' '){event.preventDefault();flipVocabularyReview();}
});
function gradeVocabularyReview(outcome){
  if(activeAppView()!=='study'||!vocabularyReviewRevealed||!vocabularyReviewView?.token)return;
  try{
    const view=BreezeReview.grade(readVocabularyReview(),words,vocabularyReviewView.token,outcome,Date.now());
    commitVocabularyReview(view.state);renderVocabularyReview(view);
  }catch{vocabularyReviewError();}
}
document.getElementById('review-remember').addEventListener('click',()=>gradeVocabularyReview('remembered'));
document.getElementById('review-uncertain').addEventListener('click',()=>gradeVocabularyReview('uncertain'));
document.getElementById('review-confused').addEventListener('click',()=>gradeVocabularyReview('confused'));
window.addEventListener('storage',event=>{
  if(event.key!==VOCABULARY_REVIEW_STORAGE)return;
  refreshVocabularyReviewEntry();
  if(activeAppView()==='study'){try{renderVocabularyReview(BreezeReview.view(readVocabularyReview(),words,Date.now()));}catch{vocabularyReviewError();}}
});
