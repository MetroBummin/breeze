// 1.7 ships simple cards; scheduled review remains dormant for 1.8.
const ADVANCED_VOCABULARY_REVIEW_ENABLED=false;
// Simple session engine: no schedules or permanent learned-card flags.
const SimpleStudySession=(()=>{
  const start=keys=>({version:1,initial:[...new Set(keys)],queue:[...new Set(keys)],passed:[],history:[],serial:0});
  const token=s=>JSON.stringify([s.serial,s.queue[0]]);
  const grade=(s,expected,outcome)=>{
    if(!s.queue.length||token(s)!==expected||!['remember','again'].includes(outcome))return s;
    const next=JSON.parse(JSON.stringify(s)),key=next.queue.shift();
    next.history.push({key,outcome});
    if(outcome==='again')next.queue.push(key);else next.passed.push(key);
    next.serial++;return next;
  };
  const undo=s=>{
    if(!s.history.length)return s;
    const next=JSON.parse(JSON.stringify(s)),last=next.history.pop();
    if(last.outcome==='again')next.queue.splice(next.queue.lastIndexOf(last.key),1);
    else next.passed.splice(next.passed.indexOf(last.key),1);
    next.queue.unshift(last.key);next.serial++;return next;
  };
  const restore=raw=>{
    try{const s=JSON.parse(raw);if(s?.version!==1||!Array.isArray(s.initial)||!s.initial.every(k=>typeof k==='string')||new Set(s.initial).size!==s.initial.length||!Array.isArray(s.queue)||!Array.isArray(s.passed)||!Array.isArray(s.history)||!Number.isSafeInteger(s.serial)||s.serial<0)return null;
      const initial=new Set(s.initial),all=[...s.queue,...s.passed];if(all.length!==s.initial.length||new Set(all).size!==all.length||all.some(k=>!initial.has(k))||s.history.some(h=>!initial.has(h.key)||!['again','remember'].includes(h.outcome)))return null;return s;
    }catch{return null;}
  };
  return {start,token,grade,undo,restore};
})();
const SIMPLE_STUDY_STORAGE='breeze.simple-study-session.v1';
let simpleStudySession=null,simpleStudyBusy=false,simpleStudyTimer=0,simpleStudySuppressClickUntil=0;
let simpleStudyReadValue,simpleStudyEpoch=0,simpleStudyResumeJob=Promise.resolve();
let simpleWordCards={keys:[],index:0,flipped:false};
let simpleStudyMeanings=new Map(),simpleStudyKeys=[];
function decodeSimpleStudySession(raw){
  if(raw===null)return null;
  const session=SimpleStudySession.restore(raw);
  if(!session)throw new Error('Invalid saved study session. The saved value was not changed.');
  return session;
}
async function loadSimpleStudySession(){
  const raw=await readStudyStorage(SIMPLE_STUDY_STORAGE,decodeSimpleStudySession);
  if(raw!==simpleStudyReadValue){simpleStudySession=decodeSimpleStudySession(raw);simpleStudyReadValue=raw;}
  return ensureSimpleStudySession();
}
function ensureSimpleStudySession(){
  const keys=Object.keys(words).filter(key=>validWordMeaning(words[key])&&typeof words[key].word==='string'&&words[key].word.trim());
  const groups=new Map();simpleStudyMeanings=new Map();
  for(const key of keys){const root=words[key].root||key;if(!groups.has(root))groups.set(root,[]);groups.get(root).push(key);}
  for(const members of groups.values()){const meanings=[...new Set(members.map(key=>words[key].ko))];for(const key of members)simpleStudyMeanings.set(key,meanings);}
  const representatives=[...groups.values()].map(members=>members[0]);simpleStudyKeys=representatives;
  const available=new Set(keys);
  // Removed records invalidate the old scope; added vocabulary waits for the next session.
  if(!simpleStudySession||simpleStudySession.initial.some(k=>!available.has(k))||!simpleStudySession.initial.length&&keys.length)simpleStudySession=SimpleStudySession.start(representatives);
  return simpleStudySession;
}
async function commitSimpleStudySession(next){
  const serialized=JSON.stringify(next),expected=simpleStudyReadValue;
  await commitStudyStorage(SIMPLE_STUDY_STORAGE,serialized,expected,decodeSimpleStudySession);
  simpleStudyReadValue=serialized;simpleStudySession=next;
}
/* Review progress is device-local and never touches vocabulary/sync records. */
const VOCABULARY_STAGE_ASSETS=Object.freeze(Object.fromEntries(
  [1,2,3,4,5].map(stage=>[stage,`assets/brand/review/thunderhead-stage-${stage}.png`])
));
const VOCABULARY_REVIEW_STORAGE='breeze.vocabulary-review.v1';
const vocabularyReviewPage=document.getElementById('vocabulary-review-page');
let vocabularyReviewView=null;
let vocabularyReviewRevealed=false;
let vocabularyReviewLastError=null;
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
  if(!ADVANCED_VOCABULARY_REVIEW_ENABLED)throw new Error('Scheduled review disabled');
  return decodeVocabularyReview(localStorage.getItem(VOCABULARY_REVIEW_STORAGE));
}
function commitVocabularyReview(state){
  if(!ADVANCED_VOCABULARY_REVIEW_ENABLED)throw new Error('Scheduled review disabled');
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
function vocabularyReviewError(cause=null){
  vocabularyReviewLastError=cause;
  const error=document.getElementById('review-error');
  error.textContent=/Invalid|newer|version/i.test(String(cause?.message||''))?'저장된 학습 기록을 읽을 수 없어요. 원본은 그대로 보관하고 있어요.':
    cause?.name==='QuotaExceededError'?'앱 저장소의 한도에 도달해 학습 기록을 저장하지 못했어요. 이전 기록은 그대로예요.':'학습 기록을 저장하지 못했어요. 다시 시도해 주세요.';
  error.hidden=false;
}
function visibleVocabularyReviewKeys(){
  return Array.from(document.querySelectorAll('#vtablewrap .vsense')).map(node=>/** @type {HTMLElement} */(node).dataset.k).filter(key=>validWordMeaning(words[key]));
}
function vocabularyReviewScope(){
  const visible=visibleVocabularyReviewKeys();
  const filtered=wordbookBooks.size>0||wordbookStars.size>0||!!/** @type {HTMLInputElement} */(document.getElementById('vsearch')).value.trim();
  return {custom:filtered,keys:visible};
}
function refreshVocabularyReviewEntry(){
  document.getElementById('review-setup').hidden=!ADVANCED_VOCABULARY_REVIEW_ENABLED;
  document.getElementById('review-settings').hidden=!ADVANCED_VOCABULARY_REVIEW_ENABLED;
  /** @type {HTMLFieldSetElement} */(document.getElementById('review-settings-controls')).disabled=!ADVANCED_VOCABULARY_REVIEW_ENABLED;
  if(!ADVANCED_VOCABULARY_REVIEW_ENABLED){
    document.getElementById('wordbook-review-entry').hidden=true;
    document.getElementById('wordbook-review').textContent='학습하기';
    /** @type {HTMLButtonElement} */(document.getElementById('wordbook-review')).disabled=false;
    return;
  }
  try{refreshReviewSetup();}catch{/* Explicit actions show persistence errors. */}
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
function renderReviewJourney(journey){
  const wrap=document.getElementById('review-journey');wrap.hidden=!journey?.target;
  if(!journey?.target)return;
  const stage=journey.milestone||journey.stage,percent=journey.milestone?100:journey.percent;
  document.getElementById('review-stage-label').textContent=`${stage}단계`;
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
function renderSimpleWordCards(){
  clearTimeout(simpleStudyTimer);simpleStudyBusy=false;simpleCardMotion.reset();
  const session=ensureSimpleStudySession(),key=session.queue[0],record=key?words[key]:null;
  const meanings=simpleStudyMeanings.get(key)||[],meaningText=meanings.length>1?meanings.map((value,index)=>`${index+1}. ${value}`).join('\n'):record?.ko||'';
  // Keep stored examples intact, but never render them in word study.
  const sentence=document.getElementById('review-sentence');sentence.replaceChildren();sentence.hidden=true;
  simpleWordCards.keys=session.queue;simpleWordCards.index=0;
  document.body.classList.add('simple-word-cards');
  vocabularyReviewPage.classList.toggle('complete',!record&&session.initial.length>0);
  vocabularyReviewPage.classList.remove('milestone');
  for(const id of ['review-journey','review-grade','review-celebration','review-recovery','review-pending','review-more','review-extra','review-error','review-mode'])document.getElementById(id).hidden=true;
  document.getElementById('review-card').hidden=!record;
  const nextCard=document.getElementById('simple-next-card');nextCard.hidden=!record;nextCard.textContent='';
  document.getElementById('review-result').hidden=!!record;
  document.getElementById('simple-study-completion').hidden=!!record||!session.initial.length;
  document.getElementById('review-status').textContent=record?'':session.initial.length?`이번 세션 ${session.passed.length} / ${session.initial.length} 완료`:'저장된 단어가 없어요. 읽다가 뜻을 저장하거나 Memory에서 단어를 추가해 보세요.';
  const progress=document.getElementById('review-progress');progress.hidden=false;
  progress.textContent=`${session.passed.length} / ${session.initial.length}`;
  progress.setAttribute('aria-label','이번 세션에서 기억한 카드');
  progress.setAttribute('role','progressbar');progress.setAttribute('aria-valuemin','0');progress.setAttribute('aria-valuemax',String(session.initial.length));progress.setAttribute('aria-valuenow',String(session.passed.length));
  document.getElementById('simple-word-navigation').hidden=!record||!simpleWordCards.flipped;
  const hint=document.getElementById('simple-study-hint');hint.hidden=!record||simpleWordCards.flipped;hint.textContent='탭하여 정답 확인';
  /** @type {HTMLButtonElement} */(document.getElementById('simple-word-previous')).disabled=!session.history.length;
  document.getElementById('simple-word-previous').hidden=true;
  for(const id of ['simple-word-next','simple-word-again'])/** @type {HTMLButtonElement} */(document.getElementById(id)).disabled=!record||!simpleWordCards.flipped;
  if(record){
    document.getElementById('review-expression').textContent=record.word;
    document.getElementById('review-back-expression').textContent=record.word;
    document.getElementById('review-source').textContent=record.book||'';
    document.getElementById('review-source').hidden=!record.book;
    document.getElementById('review-meaning').textContent=simpleWordCards.flipped?meaningText:'';
    document.getElementById('review-meaning').hidden=!simpleWordCards.flipped;
  }
  document.getElementById('review-front').hidden=false;
  document.getElementById('review-back').hidden=!simpleWordCards.flipped;
  document.getElementById('review-source').hidden=true;
  document.getElementById('review-reveal').hidden=!record||simpleWordCards.flipped;
  document.getElementById('review-reveal').textContent='정답 확인';
  const card=document.getElementById('review-flip');card.style.removeProperty('transform');card.style.removeProperty('--study-drag');card.removeAttribute('data-direction');card.removeAttribute('data-dragging');card.setAttribute('aria-label',`${record?.word||''}. ${simpleWordCards.flipped?meaningText+'. 오른쪽 알아요, 왼쪽 다시 보기':'탭하여 정답 확인'}`);
}
function flipSimpleWordCard(){
  if(ADVANCED_VOCABULARY_REVIEW_ENABLED||activeAppView()!=='study'||!simpleWordCards.keys.length||simpleStudyBusy||Date.now()<simpleStudySuppressClickUntil||simpleWordCards.flipped)return;
  simpleWordCards.flipped=true;renderSimpleWordCards();
}
async function restartSimpleWordStudy(){
  if(ADVANCED_VOCABULARY_REVIEW_ENABLED||activeAppView()!=='study'||simpleStudyBusy)return;
  simpleStudyBusy=true;const epoch=simpleStudyEpoch;
  try{
    const current=await loadSimpleStudySession();
    if(epoch!==simpleStudyEpoch||activeAppView()!=='study'||current.queue.length||!current.initial.length)return;
    await commitSimpleStudySession(SimpleStudySession.start(simpleStudyKeys));
    if(epoch===simpleStudyEpoch&&activeAppView()==='study'){simpleWordCards.flipped=false;renderSimpleWordCards();document.getElementById('review-flip').focus();}
  }catch(error){if(epoch===simpleStudyEpoch&&activeAppView()==='study')vocabularyReviewError(error);}
  finally{if(epoch===simpleStudyEpoch)simpleStudyBusy=false;}
}
document.getElementById('simple-study-complete-back').addEventListener('click',closeVocabularyReview);
document.getElementById('simple-study-restart').addEventListener('click',restartSimpleWordStudy);
async function gradeSimpleWordCard(outcome){
  if(ADVANCED_VOCABULARY_REVIEW_ENABLED||activeAppView()!=='study'||simpleStudyBusy||!simpleWordCards.flipped)return;
  simpleStudyBusy=true;
  const token=SimpleStudySession.token(ensureSimpleStudySession()),epoch=simpleStudyEpoch;
  let next;
  const card=document.getElementById('review-flip');card.dataset.direction=outcome==='remember'?'remembered':'repeat';
  const handoff=simpleCardMotion.exit(outcome==='remember'?1:-1);
  try{
    const current=await loadSimpleStudySession();
    if(epoch!==simpleStudyEpoch||activeAppView()!=='study')return;
    next=SimpleStudySession.grade(current,token,outcome);
    if(next===current){simpleWordCards.flipped=false;renderSimpleWordCards();return;}
    await commitSimpleStudySession(next);
    await handoff;
  }catch(error){simpleCardMotion.reset();vocabularyReviewLastError=error;if(epoch===simpleStudyEpoch&&activeAppView()==='study')vocabularyReviewError(error);else toast('학습 기록을 저장하지 못했어요. 다시 열어 시도해 주세요.');return;}
  finally{if(epoch===simpleStudyEpoch)simpleStudyBusy=false;}
  if(epoch!==simpleStudyEpoch||activeAppView()!=='study')return;
  simpleWordCards.flipped=false;renderSimpleWordCards();document.getElementById(next.queue.length?'review-flip':'review-status').focus({preventScroll:true});
}
async function undoSimpleWordCard(){
  if(ADVANCED_VOCABULARY_REVIEW_ENABLED||activeAppView()!=='study'||simpleStudyBusy)return;
  simpleStudyBusy=true;const epoch=simpleStudyEpoch;
  try{const current=await loadSimpleStudySession(),next=SimpleStudySession.undo(current);
    if(epoch!==simpleStudyEpoch||activeAppView()!=='study'||next===current)return;
    await commitSimpleStudySession(next);
    if(epoch===simpleStudyEpoch&&activeAppView()==='study'){simpleWordCards.flipped=false;renderSimpleWordCards();document.getElementById('review-flip').focus();}
  }catch(error){vocabularyReviewLastError=error;if(epoch===simpleStudyEpoch&&activeAppView()==='study')vocabularyReviewError(error);else toast('학습 기록을 저장하지 못했어요. 다시 열어 시도해 주세요.');}
  finally{if(epoch===simpleStudyEpoch)simpleStudyBusy=false;}
}
document.getElementById('simple-word-previous').addEventListener('click',undoSimpleWordCard);
document.getElementById('simple-word-next').addEventListener('click',()=>gradeSimpleWordCard('remember'));
document.getElementById('simple-word-again').addEventListener('click',()=>gradeSimpleWordCard('again'));
window.addEventListener('keydown',event=>{
  if(!ADVANCED_VOCABULARY_REVIEW_ENABLED&&activeAppView()==='study'&&!event.altKey&&!event.ctrlKey&&!event.metaKey&&['ArrowLeft','ArrowRight'].includes(event.key)){
    event.preventDefault();gradeSimpleWordCard(event.key==='ArrowLeft'?'again':'remember');
  }
});
const simpleCardMotion=studyCardMotion(document.getElementById('review-flip'),{
 ready:()=>simpleWordCards.flipped,
 enabled:()=>!ADVANCED_VOCABULARY_REVIEW_ENABLED&&!simpleStudyBusy&&activeAppView()==='study',
 reveal:flipSimpleWordCard,
 grade:outcome=>gradeSimpleWordCard(outcome==='remembered'?'remember':'again')
});
function renderVocabularyReview(view,focus=true){
  if(!ADVANCED_VOCABULARY_REVIEW_ENABLED){renderSimpleWordCards();return;}
  const sentence=document.getElementById('review-sentence');sentence.replaceChildren();sentence.hidden=true;
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
  document.getElementById('review-progress').hidden=!!view.journey;
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
  document.getElementById('review-result-title').textContent=milestone?(journey.done>=journey.target?'오늘 목표 달성':`${milestone}단계 완료`):'연습 완료';
  vocabularyReviewPage.classList.toggle('complete',complete);
  vocabularyReviewPage.classList.toggle('milestone',!!milestone);
  document.getElementById('review-result').hidden=!!view.card;
  document.getElementById('review-celebration').hidden=!complete||!!journey&&!milestone;
  const practice=view.state?.session?.practice;
  document.getElementById('review-mode').hidden=!practice;
  document.getElementById('review-mode').textContent=practice?'연습 · 복습 일정에 영향 없음':'정규 학습';
  document.getElementById('review-more').hidden=!!view.card;
  document.getElementById('review-more').textContent=view.status==='paused'?'학습량 조절':milestone?(journey.done>=journey.target?'추가 학습':'다음 단계 도전'):'계속하기';
  document.getElementById('review-extra').hidden=!!view.card||practice||!view.limitReached||!!milestone&&journey.done>=journey.target;
  document.getElementById('review-pending').hidden=!!view.card;
  document.getElementById('review-pending').textContent=reviewWaitingText(view);
  const status=document.getElementById('review-status');status.textContent='';
  if(view.card){
    document.getElementById('review-expression').textContent=view.card.word;
    document.getElementById('review-back-expression').textContent=view.card.word;
    renderReviewIntervals(view);
    document.getElementById('review-source').textContent=view.card.book||'';
    document.getElementById('review-source').hidden=!view.card.book;
    if(focus)document.getElementById('review-reveal').focus();
  }else{
    if(complete&&journey){status.textContent=milestone?`오늘 ${journey.done}/${journey.target}개${journey.repeats?` · 다시 연습 ${journey.repeats}회`:''}${journey.done>=journey.target&&view.dueReviewCount+view.dueRelearningCount?` · 남은 복습 ${view.dueReviewCount+view.dueRelearningCount}개`:''}`:`이번 ${graded}개 완료 · ${journey.stage}단계 ${journey.percent}%`; }
    else if(complete)status.textContent=practice?`이번 ${graded}개 연습 완료 · 남은 선택 연습 ${view.practiceRemaining}개`:`${graded}개 학습했어요. 남은 복습 ${view.dueReviewCount+view.dueRelearningCount}개`;
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
  simpleStudyResumeJob=resumeVocabularyReviewNow();
  return simpleStudyResumeJob;
}
async function resumeVocabularyReviewNow(){
  if(!ADVANCED_VOCABULARY_REVIEW_ENABLED){
    const epoch=++simpleStudyEpoch;simpleStudyBusy=true;
    try{await loadSimpleStudySession();if(epoch!==simpleStudyEpoch||activeAppView()!=='study')return;renderSimpleWordCards();document.getElementById(simpleWordCards.keys.length?'review-flip':'review-status').focus();}
    catch(error){if(epoch===simpleStudyEpoch&&activeAppView()==='study'){document.getElementById('review-card').hidden=true;vocabularyReviewError(error);}}
    finally{if(epoch===simpleStudyEpoch)simpleStudyBusy=false;}
    return;
  }
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
function reviewSetupValues(){const raw=readVocabularyReview();return {dailyLimit:raw.settings.dailyLimit??raw.settings.reviewLimit};}
function restoreReviewControls(){
  if(!ADVANCED_VOCABULARY_REVIEW_ENABLED)return;
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
  return scope.custom?BreezeReview.startSelection(raw,words,scope.keys,Date.now()):BreezeReview.startJourney(raw,words,Date.now(),extra);
}
function refreshReviewSetup(){
  if(!ADVANCED_VOCABULARY_REVIEW_ENABLED){refreshVocabularyReviewEntry();return;}
  if(!reviewControlsReady)restoreReviewControls();
  const raw=readVocabularyReview(),scope=reviewScope(raw),view=reviewSetupPreview();
  const button=/** @type {HTMLButtonElement} */(document.getElementById('wordbook-review'));
  // This entry opens the set directory even when the current vocabulary filter is empty.
  if(button.textContent!=='학습하기')button.textContent='학습하기';
  button.disabled=false;
  document.getElementById('review-use-daily').hidden=!scope.custom;
  document.getElementById('wordbook-review-entry').hidden=!scope.custom;
  document.getElementById('review-setup-scope').textContent=scope.custom?'연습 · 복습 일정에 영향 없음':'';
  document.getElementById('review-limit-usage').textContent=`오늘 ${view.uniqueUsed}개 학습`+(view.legacyUsage?' · 이전 기록 포함':'');
  document.getElementById('review-setup-plan').textContent=view.status==='paused'?'한도에 도달했어요. 미응답 카드는 보관돼요.':'';
  document.getElementById('review-setup-extra').hidden=scope.custom||!view.limitReached;
}
function reviewSettingsError(){
  document.getElementById('review-setup-error').textContent='저장하지 못했어요. 학습 시작을 눌러 재시도해 주세요.';
  document.getElementById('review-setup-error').hidden=false;
}
async function openVocabularyReview(daily=false,extra=false){
  if(!ADVANCED_VOCABULARY_REVIEW_ENABLED){
    if(daily||extra)return;
    const origin=activeAppView(),entry=history.state;
    try{
      await loadSimpleStudySession();if(activeAppView()!==origin||history.state!==entry)return;
      if(ensureSimpleStudySession().initial.length&&!simpleStudySession.queue.length)await commitSimpleStudySession(SimpleStudySession.start(simpleStudyKeys));
      if(activeAppView()!==origin||history.state!==entry)return;
      simpleWordCards.flipped=false;show('study');await simpleStudyResumeJob;
    }catch(error){if(activeAppView()===origin){show('study');vocabularyReviewError(error);}}
    return;
  }
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
  if(!ADVANCED_VOCABULARY_REVIEW_ENABLED)return;
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
  if(!ADVANCED_VOCABULARY_REVIEW_ENABLED)return;
  reviewInput('review-daily-limit').value=/** @type {HTMLElement} */(button).dataset.reviewLimit;saveReviewLimits();
}));
document.getElementById('review-setup-extra').addEventListener('click',()=>openVocabularyReview(true,true));
document.getElementById('review-extra').addEventListener('click',()=>openVocabularyReview(true,true));
document.getElementById('review-more').addEventListener('click',()=>{
  if(!ADVANCED_VOCABULARY_REVIEW_ENABLED)return;
  if(vocabularyReviewView?.status==='paused'){closeVocabularyReview();openSettings();reviewInput('review-daily-limit').focus();return;}
  const journey=vocabularyReviewView?.journey;
  openVocabularyReview(!vocabularyReviewView?.state?.session?.practice,!!journey?.milestone&&journey.done>=journey.target);
});
function resetVocabularyReviewSurface(){
  ++simpleStudyEpoch;simpleCardMotion.reset();
  clearTimeout(simpleStudyTimer);simpleStudyBusy=false;simpleWordCards.flipped=false;
  vocabularyReviewRevealed=false;document.getElementById('review-meaning').hidden=true;
}
function closeVocabularyReview(){
  if(activeAppView()!=='study')return;
  if(history.state?.studySetsAllWords){history.back();return;}
  show('vocab',{replace:true});document.getElementById('wordbook-review').focus();
}
document.getElementById('review-close').addEventListener('click',closeVocabularyReview);
window.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&activeAppView()==='study'){event.preventDefault();closeVocabularyReview();}
});
function revealVocabularyReview(){
  if(!ADVANCED_VOCABULARY_REVIEW_ENABLED){flipSimpleWordCard();return;}
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
  if(!ADVANCED_VOCABULARY_REVIEW_ENABLED){flipSimpleWordCard();return;}
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
  if(!ADVANCED_VOCABULARY_REVIEW_ENABLED)return;
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
  if(!ADVANCED_VOCABULARY_REVIEW_ENABLED)return;
  if(event.key!==VOCABULARY_REVIEW_STORAGE)return;
  try{restoreReviewControls();}catch{/* Keep existing controls on read failure. */}
  refreshVocabularyReviewEntry();
  if(activeAppView()==='study'){try{renderVocabularyReview(BreezeReview.view(readVocabularyReview(),words,Date.now()));}catch{vocabularyReviewError();}}
});

// Update due/limit copy across minute and local-date boundaries without revealing
// answers or replacing an active card. Starting and grading always re-read time.
if(ADVANCED_VOCABULARY_REVIEW_ENABLED)setInterval(()=>{
  if(document.hidden)return;
  if(activeAppView()==='vocab')refreshVocabularyReviewEntry();
  if(activeAppView()==='study'&&vocabularyReviewView){
    try{const latest=BreezeReview.view(readVocabularyReview(),words,Date.now());
      if(!vocabularyReviewView.card)renderVocabularyReview(latest,false);
      else {document.getElementById('review-pending').textContent=reviewWaitingText(latest);if(latest.token===vocabularyReviewView.token)renderReviewIntervals(latest);}
    }catch{/* Explicit actions surface persistence errors. */}
  }
},30000);
