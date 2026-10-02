/* Review progress is device-local and never touches vocabulary/sync records. */
const VOCABULARY_STAGE_ASSETS=Object.freeze(Object.fromEntries(
  [1,2,3,4,5].map(stage=>[stage,`assets/brand/review/thunderhead-stage-${stage}.png`])
));
const VOCABULARY_REVIEW_STORAGE='breeze.vocabulary-review.v1';
const vocabularyReviewPage=document.getElementById('vocabulary-review-page');
let vocabularyReviewView=null;
let vocabularyReviewRevealed=false;
function decodeVocabularyReview(raw){
  let parsed=null;
  try{parsed=JSON.parse(raw);}catch{/* Commit backs up the exact damaged bytes. */}
  if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)){
    if(Number.isFinite(parsed.version)&&parsed.version>3)throw new Error('Unsupported review schema');
    // Salvage recognizable records independently; never fabricate answers.
    if(![1,2,3].includes(parsed.version))parsed={...parsed,version:2};
  }
  return BreezeReview.normalize(parsed);
}
function readVocabularyReview(){
  return decodeVocabularyReview(localStorage.getItem(VOCABULARY_REVIEW_STORAGE));
}
function commitVocabularyReview(state){
  const previous=localStorage.getItem(VOCABULARY_REVIEW_STORAGE);
  if(previous!==null){
    const normalized=decodeVocabularyReview(previous);
    // Keep a separate exact snapshot for each recovery, including damaged v3.
    // Backup failure blocks the write and leaves the original available to retry.
    if(JSON.stringify(normalized)!==previous){
      const base=VOCABULARY_REVIEW_STORAGE+'.backup';let key=base,index=0;
      while(localStorage.getItem(key)!==null&&localStorage.getItem(key)!==previous)key=base+'.'+(++index);
      if(localStorage.getItem(key)===null)localStorage.setItem(key,previous);
      state.recovery={backupKey:key};
    }
  }
  localStorage.setItem(VOCABULARY_REVIEW_STORAGE,JSON.stringify(state));
}
function vocabularyReviewError(){
  const error=document.getElementById('review-error');
  error.textContent='복습 기록을 저장하지 못했어요. 저장 공간을 확인한 뒤 다시 시도해 주세요.';
  error.hidden=false;
}
let vocabularySelecting=false;
let vocabularySelectionActive=false;
const vocabularySelected=new Set();
function visibleVocabularyReviewKeys(){
  return Array.from(document.querySelectorAll('#vtablewrap .vsense')).map(node=>/** @type {HTMLElement} */(node).dataset.k).filter(key=>validWordMeaning(words[key]));
}
function vocabularyReviewScope(){
  const visible=visibleVocabularyReviewKeys();
  const filtered=wordbookBooks.size>0||wordbookStars.size>0||!!/** @type {HTMLInputElement} */(document.getElementById('vsearch')).value.trim();
  return {custom:vocabularySelectionActive||filtered,keys:vocabularySelectionActive?visible.filter(key=>vocabularySelected.has(key)):visible};
}
function refreshVocabularyReviewEntry(){
  try{refreshReviewSetup();}catch{/* Explicit actions show persistence errors. */}
}
function renderVocabularySelection(){
  // Filters only narrow the visible scope; finishing selection never clears it.
  for(const key of vocabularySelected)if(!validWordMeaning(words[key]))vocabularySelected.delete(key);
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
  document.getElementById('review-selection-count').textContent=vocabularySelectionActive?`${vocabularyReviewScope().keys.length}개 선택`:'';
  document.getElementById('review-select-cancel').hidden=!vocabularySelectionActive;
  refreshVocabularyReviewEntry();
}
document.getElementById('review-select-toggle').addEventListener('click',()=>{
  vocabularySelecting=!vocabularySelecting;vocabularySelectionActive=true;renderVocabularySelection();
});
document.getElementById('review-select-cancel').addEventListener('click',()=>{
  vocabularySelecting=false;vocabularySelectionActive=false;vocabularySelected.clear();renderVocabularySelection();
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
function renderReviewJourney(journey){
  const wrap=document.getElementById('review-journey');wrap.hidden=!journey?.target;
  if(!journey?.target)return;
  const stage=journey.milestone||journey.stage,percent=journey.milestone?100:journey.percent;
  document.getElementById('review-stage-label').textContent=`${stage}/${journey.stages}단계 · ${percent}%`;
  document.getElementById('review-day-count').textContent=`${journey.done}/${journey.target}개`;
  const track=document.getElementById('review-stage-track');track.replaceChildren();
  track.setAttribute('aria-valuemax',String(journey.target));track.setAttribute('aria-valuenow',String(journey.done));
  track.setAttribute('aria-valuetext',`${stage}단계 ${percent}%, 오늘 ${journey.done}/${journey.target}개`);
  for(let n=1;n<=journey.stages;n++){
    const part=document.createElement('span'),start=n>1?journey.ends[n-2]:0,end=journey.ends[n-1];
    part.style.setProperty('--stage-fill',`${Math.max(0,Math.min(100,(journey.done-start)/(end-start)*100))}%`);
    part.setAttribute('aria-hidden','true');track.append(part);
  }
}
function renderReviewIntervals(view){
  if(!view.card)return;
  if(vocabularyReviewView?.token===view.token)vocabularyReviewView.intervals=view.intervals;
    for(const [id,outcome] of [['confused','confused'],['uncertain','uncertain'],['remember','remembered'],['easy','easy']]){
      const ms=view.intervals[outcome];
      const label=view.state?.session?.practice?'일정 유지':ms<3600000?`${Math.round(ms/60000*10)/10}분`:ms<86400000?`${Math.round(ms/3600000*10)/10}시간`:`${ms/86400000}일`;
      document.getElementById('review-'+id+'-interval').textContent=label;
      const button=document.getElementById('review-'+id);
      button.setAttribute('aria-label',`${button.querySelector('span').textContent}: ${button.title}, 다음 복습 ${label}`);
    }
}
function renderVocabularyReview(view,focus=true){
  vocabularyReviewView=view;vocabularyReviewRevealed=false;
  document.getElementById('review-recovery').hidden=!view.state?.recovery;
  document.getElementById('review-front').hidden=false;
  document.getElementById('review-back').hidden=true;
  document.getElementById('review-flip').setAttribute('aria-label','카드를 뒤집어 뜻 보기');
  document.getElementById('review-error').hidden=true;
  document.getElementById('review-meaning').hidden=true;
  document.getElementById('review-meaning').textContent='';
  document.getElementById('review-grade').hidden=true;
  document.getElementById('review-reveal').hidden=false;
  document.getElementById('review-card').hidden=!view.card;
  document.getElementById('review-progress').textContent=view.card?`${view.journey?'이번 ':''}${view.completed+1} / ${view.total}`:'';
  const graded=(view.remembered||0)+(view.uncertain||0)+(view.confused||0)+(view.easy||0);
  const complete=view.status==='complete'&&graded>0;
  const journey=view.journey,milestone=journey?.milestone||0;
  renderReviewJourney(journey);
  const mascot=/** @type {HTMLImageElement} */(document.getElementById('review-stage-mascot'));
  mascot.hidden=!milestone;
  const scene=document.getElementById('review-mascot-scene');scene.hidden=!milestone;
  scene.style.setProperty('--review-stage',String(milestone||1));
  if(milestone){mascot.src=VOCABULARY_STAGE_ASSETS[milestone];mascot.dataset.stage=String(milestone);mascot.alt=`썬더헤드 · ${milestone}단계 완료`;}
  document.querySelector('.review-complete-mark').toggleAttribute('hidden',!!milestone);
  document.getElementById('review-result-title').textContent=milestone?(journey.done>=journey.target?'오늘 목표 달성':`${milestone}단계 완료`):'이번 묶음 완료';
  vocabularyReviewPage.classList.toggle('complete',complete);
  vocabularyReviewPage.classList.toggle('milestone',!!milestone);
  document.getElementById('review-result').hidden=!!view.card;
  document.getElementById('review-celebration').hidden=!complete||!!journey&&!milestone;
  document.getElementById('review-results').hidden=!complete||!!journey&&!milestone;
  const practice=view.state?.session?.practice;
  document.getElementById('review-mode').hidden=!practice;
  document.getElementById('review-mode').textContent=practice?'연습 · 복습 일정에 영향 없음':'정규 학습';
  document.getElementById('review-more').hidden=!!view.card;
  document.getElementById('review-more').textContent=view.status==='paused'?'학습량 조절':milestone?(journey.done>=journey.target?'추가 학습':'다음 단계 도전'):'계속하기';
  document.getElementById('review-extra').hidden=!!view.card||practice||!view.limitReached||!!milestone&&journey.done>=journey.target;
  document.getElementById('review-pending').textContent=reviewWaitingText(view);
  const results={remembered:view.remembered||0,uncertain:view.uncertain||0,confused:view.confused||0,easy:view.easy||0};
  if(milestone){
    const latest=new Map(),today=new Date().toDateString();
    for(const event of view.state.history)if(event.kind!=='practice'&&new Date(event.at).toDateString()===today)latest.set(event.identity,event.outcome);
    results.remembered=0;results.uncertain=0;results.confused=0;results.easy=0;
    for(const outcome of latest.values())results[outcome]++;
  }
  document.getElementById('review-result-easy').textContent=String(results.easy);
  document.getElementById('review-result-known').textContent=String(results.remembered);
  document.getElementById('review-result-uncertain').textContent=String(results.uncertain);
  document.getElementById('review-result-unknown').textContent=String(results.confused);
  const status=document.getElementById('review-status');status.textContent='';
  if(view.card){
    document.getElementById('review-expression').textContent=view.card.word;
    document.getElementById('review-back-expression').textContent=view.card.word;
    renderReviewIntervals(view);
    document.getElementById('review-source').textContent=view.card.book||'출처 제목 없음';
    highlightReviewSentence(view.card);
    if(focus)document.getElementById('review-reveal').focus();
  }else{
    if(complete&&journey){status.textContent=milestone?`오늘 ${journey.done}/${journey.target}개${journey.repeats?` · 다시 연습 ${journey.repeats}회`:''}${journey.done>=journey.target&&view.dueReviewCount+view.dueRelearningCount?` · 남은 복습 ${view.dueReviewCount+view.dueRelearningCount}개`:''}`:`이번 ${graded}개 완료 · ${journey.stage}단계 ${journey.percent}%`; }
    else if(complete)status.textContent=practice?`이번 ${graded}개 연습 완료 · 남은 선택 연습 ${view.practiceRemaining}개`:`이번 ${graded}개 완료 · 남은 복습 ${view.dueReviewCount+view.dueRelearningCount}개\n오늘 신규 ${view.newUsed}개 · 정규 복습 ${view.reviewUsed}개 · 총 응답 ${view.responses}회`;
    else if(view.status==='paused')status.textContent='일일 한도에 도달했어요. 미응답 카드는 보관했어요.';
    else if(view.status==='complete')status.textContent='복습할 표현이 더 없어요.';
    else if(view.status==='empty')status.textContent='아직 복습할 표현이 없어요. 읽다가 단어나 표현의 뜻을 저장해 보세요.';
    else if(view.status==='waiting')status.textContent=view.limitReached?'일일 한도에 도달했어요. 추가 학습은 직접 선택할 수 있어요.':'지금 예정된 복습이 없어요.'+(view.nextDueAt?`\n다음 복습: ${new Date(view.nextDueAt).toLocaleString('ko-KR',{month:'long',day:'numeric',hour:'numeric',minute:'2-digit'})}`:'');
    else status.textContent='저장한 표현으로 짧게 복습해 보세요.';
    if(focus)status.focus();
  }
  refreshVocabularyReviewEntry();
}
function resumeVocabularyReview(){
  try{
    const view=BreezeReview.view(readVocabularyReview(),words,Date.now());
    renderVocabularyReview(view);
  }catch{renderVocabularyReview({card:null,status:'idle'});vocabularyReviewError();}
}
let reviewControlsReady=false;
function reviewInput(id){return /** @type {HTMLInputElement} */(document.getElementById(id));}
function reviewWaitingText(view){
  if(!view.relearningCount)return '';
  const future=view.relearningCount-view.dueRelearningCount;
  const minutes=view.nextRelearningAt?Math.max(1,Math.ceil((view.nextRelearningAt-Date.now())/60000)):0;
  return [view.dueRelearningCount?`지금 학습·재학습 ${view.dueRelearningCount}개`:'',future?`${minutes}분 뒤부터 학습·재학습 ${future}개`:''].filter(Boolean).join(' · ');
}
function reviewSetupValues(){const raw=readVocabularyReview();return {batchSize:5,dailyLimit:raw.settings.dailyLimit??raw.settings.reviewLimit};}
function restoreReviewControls(){
  const raw=readVocabularyReview();
  reviewInput('review-daily-limit').value=String(raw.settings.dailyLimit??raw.settings.reviewLimit);
  reviewControlsReady=true;
}
function reviewScope(raw,daily=false){
  const scope=vocabularyReviewScope();
  if(daily)return {custom:false,keys:[]};
  if(!scope.custom&&raw.session?.practice&&raw.session.index<raw.session.queue.length)return {custom:true,keys:raw.session.queue.map(ref=>ref.key)};
  return scope;
}
function reviewSetupPreview(daily=false,extra=false){
  const raw=BreezeReview.configure(readVocabularyReview(),reviewSetupValues()),scope=reviewScope(raw,daily);
  return scope.custom?BreezeReview.startSelection(raw,words,scope.keys,Date.now(),raw.settings.batchSize):BreezeReview.startJourney(raw,words,Date.now(),extra);
}
function refreshReviewSetup(){
  if(!reviewControlsReady)restoreReviewControls();
  const raw=readVocabularyReview(),scope=reviewScope(raw),view=reviewSetupPreview();
  const button=/** @type {HTMLButtonElement} */(document.getElementById('wordbook-review'));
  const remaining=scope.custom&&!scope.keys.length?0:view.total-view.completed;
  const resume=view.state.session?.index>view.state.session?.batchStart;
  const label=scope.custom?`${remaining}개 연습${resume?' 이어 하기':''}`:view.card?(resume?'학습 이어 하기':'학습 시작'):'학습 현황';
  // Keep the button's text node stable through input blur (WebKit click target).
  if(button.textContent!==label)button.textContent=label;
  button.disabled=scope.custom&&!scope.keys.length;
  document.getElementById('review-use-daily').hidden=!scope.custom;
  document.getElementById('wordbook-review-entry').hidden=!scope.custom;
  document.getElementById('review-setup-scope').textContent=scope.custom?'연습 · 복습 일정에 영향 없음':'';
  document.getElementById('review-limit-usage').textContent=`오늘 ${view.uniqueUsed}개 학습`+(view.legacyUsage?' · 이전 기록 포함':'');
  document.getElementById('review-setup-waiting').textContent=reviewWaitingText(view);
  document.getElementById('review-inventory').textContent=`예정 복습 ${view.dueReviewCount}개 · 학습 중 ${view.learningCount}개 · 재학습 ${view.relearningCount-view.learningCount}개 · 신규 ${view.newCount}개`;
  document.getElementById('review-setup-plan').textContent=view.status==='paused'?'한도에 도달했어요. 미응답 카드는 보관돼요.':resume?'이어서 학습할 수 있어요.':'';
  document.getElementById('review-setup-extra').hidden=scope.custom||!view.limitReached;
}
function reviewSettingsError(){
  document.getElementById('review-setup-error').textContent='저장하지 못했어요. 학습 시작을 눌러 재시도해 주세요.';
  document.getElementById('review-setup-error').hidden=false;
}
function openVocabularyReview(daily=false,extra=false){
  try{
    if(!reviewControlsReady)restoreReviewControls();
    const scope=reviewScope(readVocabularyReview(),daily);
    if(scope.custom&&!scope.keys.length)return;
    const view=reviewSetupPreview(daily,extra);
    commitVocabularyReview(view.state);document.getElementById('review-setup-error').hidden=true;
    show('study');renderVocabularyReview(view);
  }catch{if(activeAppView()==='study')vocabularyReviewError();else reviewSettingsError();}
}
const reviewLimitForm=/** @type {HTMLFormElement} */(document.getElementById('review-limit-form'));
function saveReviewLimits(){
  if(!reviewLimitForm.checkValidity())return;
  try{
    commitVocabularyReview(BreezeReview.configure(readVocabularyReview(),{
      dailyLimit:Number(reviewInput('review-daily-limit').value)}));
    document.getElementById('review-limit-error').hidden=true;refreshVocabularyReviewEntry();
  }catch{document.getElementById('review-limit-error').textContent='저장하지 못했어요. 값을 다시 입력해 재시도해 주세요.';document.getElementById('review-limit-error').hidden=false;}
}
reviewLimitForm.addEventListener('change',saveReviewLimits);
reviewLimitForm.addEventListener('submit',event=>{event.preventDefault();saveReviewLimits();});
document.querySelectorAll('[data-review-limit]').forEach(button=>button.addEventListener('click',()=>{
  reviewInput('review-daily-limit').value=/** @type {HTMLElement} */(button).dataset.reviewLimit;saveReviewLimits();
}));
document.getElementById('review-setup-extra').addEventListener('click',()=>openVocabularyReview(true,true));
document.getElementById('review-extra').addEventListener('click',()=>openVocabularyReview(true,true));
document.getElementById('review-more').addEventListener('click',()=>{
  if(vocabularyReviewView?.status==='paused'){closeVocabularyReview();openSettings();reviewInput('review-daily-limit').focus();return;}
  const journey=vocabularyReviewView?.journey;
  openVocabularyReview(!vocabularyReviewView?.state?.session?.practice,!!journey?.milestone&&journey.done>=journey.target);
});
function resetVocabularyReviewSurface(){
  vocabularyReviewRevealed=false;document.getElementById('review-meaning').hidden=true;
}
function closeVocabularyReview(){
  if(activeAppView()!=='study')return;
  show('vocab',{replace:true});document.getElementById('wordbook-review').focus();
}
document.getElementById('review-close').addEventListener('click',closeVocabularyReview);
window.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&activeAppView()==='study'){event.preventDefault();closeVocabularyReview();}
});
function revealVocabularyReview(){
  if(!vocabularyReviewView?.card||vocabularyReviewRevealed)return;
  try{
    const latest=BreezeReview.view(readVocabularyReview(),words,Date.now());
    if(latest.token!==vocabularyReviewView.token){renderVocabularyReview(latest);return;}
    vocabularyReviewView=latest;vocabularyReviewRevealed=true;renderReviewIntervals(latest);
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
    const raw=readVocabularyReview(),at=Date.now(),preview=BreezeReview.view(raw,words,at);
    // A card left open across a day boundary must display the current schedule
    // before accepting an answer with a different interval.
    if(preview.token===vocabularyReviewView.token&&JSON.stringify(preview.intervals)!==JSON.stringify(vocabularyReviewView.intervals)){
      vocabularyReviewView=preview;renderReviewIntervals(preview);return;
    }
    const view=BreezeReview.grade(raw,words,vocabularyReviewView.token,outcome,at);
    commitVocabularyReview(view.state);renderVocabularyReview(view);
  }catch{vocabularyReviewError();}
}
document.getElementById('review-easy').addEventListener('click',()=>gradeVocabularyReview('easy'));
document.getElementById('review-remember').addEventListener('click',()=>gradeVocabularyReview('remembered'));
document.getElementById('review-uncertain').addEventListener('click',()=>gradeVocabularyReview('uncertain'));
document.getElementById('review-confused').addEventListener('click',()=>gradeVocabularyReview('confused'));
window.addEventListener('storage',event=>{
  if(event.key!==VOCABULARY_REVIEW_STORAGE)return;
  try{restoreReviewControls();}catch{/* Keep existing controls on read failure. */}
  refreshVocabularyReviewEntry();
  if(activeAppView()==='study'){try{renderVocabularyReview(BreezeReview.view(readVocabularyReview(),words,Date.now()));}catch{vocabularyReviewError();}}
});

// Update due/limit copy across minute and local-date boundaries without revealing
// answers or replacing an active card. Starting and grading always re-read time.
setInterval(()=>{
  if(document.hidden)return;
  if(activeAppView()==='vocab')refreshVocabularyReviewEntry();
  if(activeAppView()==='study'&&vocabularyReviewView){
    try{const latest=BreezeReview.view(readVocabularyReview(),words,Date.now());
      if(!vocabularyReviewView.card)renderVocabularyReview(latest,false);
      else {document.getElementById('review-pending').textContent=reviewWaitingText(latest);if(latest.token===vocabularyReviewView.token)renderReviewIntervals(latest);}
    }catch{/* Explicit actions surface persistence errors. */}
  }
},30000);
