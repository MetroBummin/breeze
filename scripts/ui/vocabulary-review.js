/* Review progress is device-local and never touches vocabulary/sync records. */
const VOCABULARY_REVIEW_STORAGE='breeze.vocabulary-review.v1';
const vocabularyReviewDialog=/** @type {HTMLDialogElement} */(document.getElementById('vocabulary-review-dialog'));
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
function refreshVocabularyReviewEntry(){
  try{
    const view=BreezeReview.view(readVocabularyReview(),words,Date.now());
    document.getElementById('wordbook-review').textContent=view.status==='active'?'복습 이어 하기':'오늘 5개 복습';
  }catch{/* The entry remains usable so a storage failure can be explained in the dialog. */}
}
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
  document.getElementById('review-error').hidden=true;
  document.getElementById('review-meaning').hidden=true;
  document.getElementById('review-meaning').textContent='';
  document.getElementById('review-grade').hidden=true;
  document.getElementById('review-reveal').hidden=false;
  document.getElementById('review-card').hidden=!view.card;
  document.getElementById('review-progress').textContent=view.card?`${view.completed+1} / ${view.total}`:'';
  const status=document.getElementById('review-status');status.textContent='';
  if(view.card){
    document.getElementById('review-expression').textContent=view.card.word;
    document.getElementById('review-source').textContent=view.card.book||'출처 제목 없음';
    highlightReviewSentence(view.card);
    if(focus)document.getElementById('review-reveal').focus();
  }else{
    if(view.status==='complete')status.textContent=`이번 복습을 마쳤어요.\n기억났어요 ${view.remembered}개 · 헷갈렸어요 ${view.confused}개\n헷갈린 표현은 10분 뒤, 기억난 표현은 더 나중에 다시 만나요.`;
    else if(view.status==='empty')status.textContent='아직 복습할 표현이 없어요. 읽다가 단어나 표현의 뜻을 저장해 보세요.';
    else if(view.status==='waiting')status.textContent='지금 복습할 표현은 모두 마쳤어요.'+(view.nextDueAt?`\n다음 복습: ${new Date(view.nextDueAt).toLocaleString('ko-KR',{month:'long',day:'numeric',hour:'numeric',minute:'2-digit'})}`:'');
    else status.textContent='저장한 표현으로 짧게 복습해 보세요.';
    if(focus)status.focus();
  }
  refreshVocabularyReviewEntry();
}
function openVocabularyReview(){
  if(vocabularyReviewDialog.open)return;
  vocabularyReviewDialog.showModal();
  try{
    const view=BreezeReview.start(readVocabularyReview(),words,Date.now());
    commitVocabularyReview(view.state);renderVocabularyReview(view);
  }catch{
    renderVocabularyReview({card:null,status:'idle'});vocabularyReviewError();
  }
}
function closeVocabularyReview(){
  if(vocabularyReviewDialog.open)vocabularyReviewDialog.close();
}
document.getElementById('review-close').addEventListener('click',closeVocabularyReview);
// Native modality makes the page inert, but browsers may still tab into chrome.
// Keep keyboard recall inside visible controls, including after answer/status focus.
vocabularyReviewDialog.addEventListener('keydown',event=>{
  if(event.key!=='Tab')return;
  const controls=Array.from(vocabularyReviewDialog.querySelectorAll('button:not([disabled])'))
    .filter(node=>node.getClientRects().length>0);
  if(!controls.length)return;
  event.preventDefault();
  const active=document.activeElement,index=controls.indexOf(active);
  let next;
  if(index>=0)next=controls[(index+(event.shiftKey?-1:1)+controls.length)%controls.length];
  else if(event.shiftKey)next=[...controls].reverse().find(node=>active&&(active.compareDocumentPosition(node)&Node.DOCUMENT_POSITION_PRECEDING))||controls[controls.length-1];
  else next=controls.find(node=>active&&(active.compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING))||controls[0];
  /** @type {HTMLElement} */(next).focus();
});

vocabularyReviewDialog.addEventListener('close',()=>{
  vocabularyReviewRevealed=false;document.getElementById('review-meaning').hidden=true;
  refreshVocabularyReviewEntry();
  if(activeAppView()==='vocab')document.getElementById('wordbook-review').focus();
});
document.getElementById('review-reveal').addEventListener('click',()=>{
  if(!vocabularyReviewView?.card||vocabularyReviewRevealed)return;
  try{
    const latest=BreezeReview.view(readVocabularyReview(),words,Date.now());
    if(latest.token!==vocabularyReviewView.token){renderVocabularyReview(latest);return;}
    vocabularyReviewView=latest;vocabularyReviewRevealed=true;
    const meaning=document.getElementById('review-meaning');meaning.textContent=latest.card.ko;meaning.hidden=false;
    document.getElementById('review-reveal').hidden=true;document.getElementById('review-grade').hidden=false;
    meaning.focus();
  }catch{vocabularyReviewError();}
});
function gradeVocabularyReview(outcome){
  if(!vocabularyReviewDialog.open||!vocabularyReviewRevealed||!vocabularyReviewView?.token)return;
  try{
    const view=BreezeReview.grade(readVocabularyReview(),words,vocabularyReviewView.token,outcome,Date.now());
    commitVocabularyReview(view.state);renderVocabularyReview(view);
  }catch{vocabularyReviewError();}
}
document.getElementById('review-remember').addEventListener('click',()=>gradeVocabularyReview('remembered'));
document.getElementById('review-confused').addEventListener('click',()=>gradeVocabularyReview('confused'));
window.addEventListener('storage',event=>{
  if(event.key!==VOCABULARY_REVIEW_STORAGE)return;
  refreshVocabularyReviewEntry();
  if(vocabularyReviewDialog.open){try{renderVocabularyReview(BreezeReview.view(readVocabularyReview(),words,Date.now()));}catch{vocabularyReviewError();}}
});
