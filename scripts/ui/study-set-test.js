/* Saved-set recall test. The answer field stays mounted so the iOS keyboard
   does not dismiss between words. Grading never awaits before the next word. */
let studySetTestRun=null;
const studySetTestJobs=new Map();
const studySetTestQueue=[];
let studySetTestPumping=false,studySetTestKeyboardBound=false,studySetTestLeaveClosing=false;

function studySetTestPool(set){
  const listed=BreezeStudySets.listedCards(set,typeof words==='undefined'?null:words);
  const grouped=BreezeStudySets.groupedCards(listed);
  return typeof studySetsStatusMatches==='function'?grouped.filter(card=>studySetsStatusMatches(card.status)):grouped;
}
function studySetTestHistoryKey(){return typeof studyTestsKey==='function'?studyTestsKey():BreezeStudySetTest.KEY;}
function studySetTestStorage(){return BreezeStudySetTest.records(localStorage.getItem(studySetTestHistoryKey()),studySetsUI.setId);}
function studySetTestDate(at){
  const date=new Date(at);
  if(Number.isNaN(date.getTime()))return '';
  return new Intl.DateTimeFormat('ko-KR',{month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}).format(date);
}
function studySetTestReleaseStuckZoom(){
  const meta=document.querySelector('meta[name=viewport]');
  const scale=window.visualViewport?.scale||1;
  if(!meta||scale<=1.01)return;
  // The lock is permanent, so appending maximum-scale and returning early
  // cannot unstick a scale that is already above 1. Rewrite the meta.
  const canonical='width=device-width, initial-scale=1.0, maximum-scale=1, user-scalable=no, viewport-fit=cover';
  meta.setAttribute('content','width=device-width');
  requestAnimationFrame(()=>meta.setAttribute('content',canonical));
}
function studySetTestFocus(){
  const input=document.getElementById('study-set-test-answer');
  if(!(input instanceof HTMLElement))return;
  studySetTestReleaseStuckZoom();
  if(document.activeElement!==input)input.focus({preventScroll:true});
  studySetTestPlaceKeyboard();
}
function studySetTestReleaseKeyboard(){
  const host=document.getElementById('v-memory-set');
  if(!host)return;
  host.classList.remove('study-set-test-keyboard');
  host.style.removeProperty('height');
  host.style.removeProperty('top');
}
function studySetTestPlaceKeyboard(){
  const host=document.getElementById('v-memory-set'),viewport=window.visualViewport;
  if(!host||studySetsUI.screen!=='test'||!viewport||viewport.scale!==1){studySetTestReleaseKeyboard();return;}
  const overlap=Math.max(0,Math.round(window.innerHeight-(viewport.height+viewport.offsetTop)));
  if(overlap<1){studySetTestReleaseKeyboard();return;}
  host.classList.add('study-set-test-keyboard');
  host.style.height=Math.round(viewport.height)+'px';
  host.style.top=Math.round(viewport.offsetTop)+'px';
  const body=host.querySelector('.study-sets-body');
  if(body)body.scrollTop=0;
}
function studySetTestWatchKeyboard(){
  const viewport=window.visualViewport;
  if(!viewport||studySetTestKeyboardBound)return;
  studySetTestKeyboardBound=true;
  viewport.addEventListener('resize',studySetTestPlaceKeyboard,{passive:true});
  viewport.addEventListener('scroll',studySetTestPlaceKeyboard,{passive:true});
}
function studySetTestPaintFill(slider){
  const min=Number(slider.min)||0,max=Number(slider.max)||0,value=Number(slider.value)||0;
  const fill=max<=min?100:Math.round((value-min)/(max-min)*100);
  slider.style.setProperty('--study-set-test-fill',fill+'%');
  slider.setAttribute('aria-valuemin',String(min));
  slider.setAttribute('aria-valuemax',String(max));
  slider.setAttribute('aria-valuenow',String(value));
  const count=document.getElementById('study-set-test-count-value');
  if(count)count.textContent=String(value);
  for(const chip of document.querySelectorAll('.study-set-test-preset')){
    const chosen=chip.getAttribute('data-count')==='all'?value===max:Number(chip.getAttribute('data-count'))===value;
    chip.classList.toggle('on',chosen);
    chip.setAttribute('aria-pressed',chosen?'true':'false');
  }
}
function studySetTestPreset(slider,count,label){
  const chip=studySetsButton(label,()=>{
    slider.value=count==='all'?slider.max:String(count);
    studySetTestPaintFill(slider);
  });
  chip.classList.add('study-set-test-preset');
  chip.setAttribute('data-count',String(count));
  chip.setAttribute('aria-pressed','false');
  return chip;
}
function studySetTestBegin(set,cards){
  studySetTestRun={
    id:String(Date.now())+'-'+Math.random().toString(36).slice(2),
    setId:set.id,startedAt:Date.now(),questions:cards,index:0,rows:[],scope:typeof studyScopeCapture==='function'?studyScopeCapture():null
  };
  studySetTestJobs.set(studySetTestRun.id,studySetTestRun);
}
function studySetTestPersist(run){
  try{
    if(!run||!run.rows.length||run.rows.length<run.questions.length)return;
    if(run.scope&&typeof isLearningScopeCurrent==='function'&&!isLearningScopeCurrent(run.scope))return;
    const pending=run.rows.some(row=>row.status==='pending');
    const correct=run.rows.filter(row=>row.status==='correct').length;
    const record=pending?{
      id:run.id,at:run.startedAt,count:run.questions.length,correct,score:null,pending:true,
      rows:run.rows.map(row=>({word:row.word,meanings:row.meanings.slice(),answer:row.answer,status:row.status}))
    }:{id:run.id,at:run.startedAt,count:run.questions.length,correct,score:BreezeStudySetTest.score(correct,run.questions.length)};
    if(typeof saveStudySetTestRecord==='function'){
      if(saveStudySetTestRecord(run.setId,record,run.scope)&&!pending)studySetTestJobs.delete(run.id);
      return;
    }
    const saved=BreezeStudySetTest.save(localStorage.getItem(BreezeStudySetTest.KEY),run.setId,record);
    if(saved.ok)localStorage.setItem(BreezeStudySetTest.KEY,saved.raw);
    if(!pending)studySetTestJobs.delete(run.id);
  }catch(error){
    // The score is already on screen. A full disk must not become the boot banner.
    if(error&&(error.name==='QuotaExceededError'||error.code===22||error.code===1014))return;
    throw error;
  }
}
function studySetTestMaybeSave(){studySetTestPersist(studySetTestRun);}
function studySetTestResultCopy(run){
  const pending=run.rows.some(row=>row.status==='pending');
  const correct=run.rows.filter(row=>row.status==='correct').length;
  const graded=run.rows.filter(row=>row.status!=='pending').length;
  const total=run.questions.length;
  const points=BreezeStudySetTest.score(correct,total);
  return {pending,correct,graded,total,points,score:pending?'채점 중':total<1?'—':points+'점',caption:pending?`${total}개 중 ${graded}개 확인됨`:total<1?'제출한 답이 없어요.':`${total}개 중 ${correct}개 맞음`};
}
function studySetTestScoreLabel(record){return record?.pending?'채점 중':record?.score==null?'—':record.score+'점';}
function studySetTestWrongRow(row){
  const item=studySetsNode('li','study-set-test-wrong-row');
  const pair=studySetsNode('span','study-set-test-answer-pair');
  const wrote=studySetsNode('span','study-set-test-wrote',row.answer.trim()?row.answer:'—');
  wrote.title='내가 쓴 답';
  const right=studySetsNode('span','study-set-test-right',row.meanings.join(' · '));
  pair.append(wrote,right);
  item.append(studySetsNode('strong','',row.word),pair);
  return item;
}
function studySetTestPaintScore(score,copy){
  score.classList.toggle('is-grading',copy.pending);
  score.replaceChildren();
  if(!copy.pending){score.textContent=copy.score;score.removeAttribute('aria-label');return;}
  const spinner=studySetsNode('span','study-set-test-spinner');
  spinner.setAttribute('aria-hidden','true');
  const label=studySetsNode('span','study-set-test-grading-label','채점 중');
  const progress=document.createElement('progress');
  progress.className='study-set-test-grade-progress';
  progress.max=Math.max(1,copy.total);
  progress.value=copy.graded;
  progress.setAttribute('aria-label',`채점 중 ${copy.graded} / ${copy.total}`);
  score.append(spinner,label,progress);
  score.setAttribute('aria-label','채점 중');
}
function studySetTestRefreshHistory(){
  if(studySetsUI.screen!=='test-setup')return;
  const list=document.querySelector('.study-set-test-records');
  if(!list)return;
  const records=studySetTestStorage();
  list.replaceChildren();
  for(const record of records){
    const row=studySetsNode('li','study-set-test-record');
    if(record.pending)row.classList.add('is-pending');
    row.append(studySetsNode('span','',studySetTestDate(record.at)),studySetsNode('span','',record.count+'개'),studySetsNode('b','',studySetTestScoreLabel(record)));
    list.append(row);
  }
}
function studySetTestRefreshResults(){
  if(studySetsUI.screen!=='test-result'||!studySetTestRun)return;
  const score=document.getElementById('study-set-test-score');
  if(!score){renderStudySets(false);return;}
  const run=studySetTestRun,copy=studySetTestResultCopy(run);
  studySetTestPaintScore(score,copy);
  const caption=document.getElementById('study-set-test-caption');
  if(caption)caption.textContent=copy.caption;
  const list=document.getElementById('study-set-test-wrong');
  if(list){
    list.replaceChildren();
    for(const row of run.rows)if(row.status==='incorrect')list.append(studySetTestWrongRow(row));
  }
  const empty=document.getElementById('study-set-test-clear');
  const wrong=run.rows.filter(row=>row.status==='incorrect').length;
  if(empty)empty.hidden=copy.pending||wrong>0||copy.total<1;
  const retry=document.getElementById('study-set-test-retry');
  if(retry){retry.hidden=copy.pending||!wrong;retry.toggleAttribute('disabled',copy.pending||!wrong);}
  const heading=document.getElementById('study-set-test-wrong-title');
  if(heading)heading.hidden=copy.pending||!wrong;
  if(list)list.hidden=copy.pending||!wrong;
  studySetTestMaybeSave();
}
function studySetTestAfterBatch(run){
  if(!run||studySetTestRun===run)studySetTestPaintTally();
  studySetTestPersist(run||studySetTestRun);
  if(run&&studySetTestRun===run)studySetTestRefreshResults();
  studySetTestRefreshHistory();
}
function studySetTestTallyCounts(){
  const counts={correct:0,incorrect:0,pending:0};
  for(const row of studySetTestRun?.rows||[]) if(Object.prototype.hasOwnProperty.call(counts,row.status)) counts[row.status]++;
  return counts;
}
function studySetTestSetCount(item,value){
  const num=item.querySelector('b');
  const next=String(value);
  if(!num||num.textContent===next)return;
  const from=Number(num.textContent);
  const media=typeof matchMedia==='function'?matchMedia:window.matchMedia;
  const reduce=media?.('(prefers-reduced-motion: reduce)')?.matches!==false;
  if(reduce||!Number.isFinite(from)||typeof requestAnimationFrame!=='function'){num.textContent=next;return;}
  const started=performance.now();
  const frame=now=>{
    const t=Math.min(1,(now-started)/280);
    const eased=1-Math.pow(1-t,3);
    num.textContent=String(Math.round(from+(value-from)*eased));
    if(t<1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
function studySetTestPaintTally(){
  const row=document.getElementById('study-set-test-tally');
  if(!row||!studySetTestRun)return;
  const counts=studySetTestTallyCounts();
  const labels={correct:'맞음',incorrect:'틀림',pending:'채점 중'};
  for(const kind of ['correct','incorrect','pending']){
    const item=row.querySelector(`[data-kind="${kind}"]`);
    if(!(item instanceof HTMLElement))continue;
    if(kind==='pending') item.hidden=counts.pending===0;
    item.setAttribute('aria-label',labels[kind]+' '+counts[kind]);
    studySetTestSetCount(item,counts[kind]);
  }
  const spoken=[`맞음 ${counts.correct}`,`틀림 ${counts.incorrect}`];
  if(counts.pending) spoken.push(`채점 중 ${counts.pending}`);
  row.setAttribute('aria-label',spoken.join(', '));
}
function studySetTestWait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function studySetTestOffline(){const error=new Error('offline');error.name='OfflineError';return error;}
async function studySetTestGrade(items){
  const payload=items.map(row=>({word:row.word,meanings:row.meanings,answer:row.answer}));
  const grader=/** @type {{grade?:(rows:unknown)=>unknown}|undefined} */(/** @type {any} */(window).BreezeStudySetTestGrader);
  if(grader&&typeof grader.grade==='function')return studySetTestVerdicts(await grader.grade(payload),payload.length);
  if(typeof dictCall!=='function'||navigator.onLine===false)throw studySetTestOffline();
  const response=await dictCall({op:'study_set_test_grade',device:typeof deviceId==='function'?deviceId():'',items:payload});
  if(!response)throw studySetTestOffline();
  if(response.error||!Array.isArray(response.results))throw new Error(response.error||'grade_failed');
  return studySetTestVerdicts(response.results,payload.length);
}
function studySetTestVerdicts(results,count){
  if(!Array.isArray(results)||results.length!==count)throw new Error('bad grade');
  return results.map(row=>{
    if(typeof row==='boolean')return row;
    if(row&&row.ok===true)return true;
    if(row&&row.ok===false)return false;
    throw new Error('bad grade');
  });
}
function studySetTestEnqueue(run,start,end){
  const indexes=[];
  for(let i=start;i<end;i++)indexes.push(i);
  if(indexes.length)studySetTestQueue.push({id:run.id,indexes,attempts:0});
  void studySetTestPump();
}
async function studySetTestPump(){
  if(studySetTestPumping)return;
  studySetTestPumping=true;
  try{
    while(studySetTestQueue.length){
      const job=studySetTestQueue[0],run=studySetTestJobs.get(job.id);
      if(!run){studySetTestQueue.shift();continue;}
      const pending=job.indexes.filter(index=>run.rows[index]?.status==='pending');
      if(!pending.length){studySetTestQueue.shift();studySetTestAfterBatch(run);continue;}
      try{
        const verdicts=await studySetTestGrade(pending.map(index=>run.rows[index]));
        if(!studySetTestGradeApplies(run,job))continue;
        pending.forEach((index,number)=>{run.rows[index].status=verdicts[number]?'correct':'incorrect';run.rows[index].via='ai';});
        studySetTestQueue.shift();studySetTestAfterBatch(run);
      }catch(error){
        if(!studySetTestGradeApplies(run,job))continue;
        job.attempts+=1;
        const offline=error instanceof Error&&error.name==='OfflineError',limit=offline?3:4;
        if(job.attempts<limit){await studySetTestWait(offline?400:[1200,3500,8000][job.attempts-1]||8000);continue;}
        for(const index of pending)if(run.rows[index].status==='pending'){run.rows[index].status='incorrect';run.rows[index].via='exact';}
        studySetTestQueue.shift();studySetTestAfterBatch(run);
      }
    }
  }finally{
    studySetTestPumping=false;
    if(studySetTestQueue.length)void studySetTestPump();
  }
}
function studySetTestPaint(){
  const run=studySetTestRun,word=document.getElementById('study-set-test-word'),progress=document.getElementById('study-set-test-progress');
  const card=run?.questions[run.index];
  if(!card||!word)return;
  if(progress)progress.textContent=`${run.index+1} / ${run.questions.length}`;
  word.textContent=card.word;
  if(typeof word.animate==='function'&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
    word.animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:280,easing:'cubic-bezier(.2,.8,.2,1)'});
  }
}
function studySetTestSubmit(value){
  const run=studySetTestRun;
  if(!run||run.index>=run.questions.length)return;
  const card=run.questions[run.index];
  const answer=String(value??'').slice(0,BreezeStudySetTest.MAX_ANSWER);
  const exact=BreezeStudySetTest.matches(answer,card.meanings);
  run.rows.push({id:card.id,word:card.word,meanings:card.meanings.slice(),answer,status:!answer.trim()?'incorrect':exact?'correct':'pending',via:exact||!answer.trim()?'exact':''});
  run.index++;
  const answered=run.rows.length;
  if(answered%10===0)studySetTestEnqueue(run,answered-10,answered);
  if(run.index>=run.questions.length){
    const tail=answered%10;
    if(tail)studySetTestEnqueue(run,answered-tail,answered);
    studySetTestShowResults();
    return;
  }
  studySetTestPaint();
  studySetTestPaintTally();
}
function studySetTestShowResults(){
  const ui=studySetsUI;
  ui.screen='test-result';ui.notice='';
  if(history.state?.studySets===ui.historyToken)replaceStudySetsHistory({studySetsScreen:'test-result',view:'memory-set'});
  renderStudySets(true);
}
function studySetTestFinishNow(){
  const run=studySetTestRun;
  if(!run)return;
  const answered=run.rows.length;
  run.questions=run.questions.slice(0,answered);
  run.index=answered;
  const tail=answered%10;
  if(tail)studySetTestEnqueue(run,answered-tail,answered);
  studySetTestShowResults();
}
function studySetTestCloseLeave(){
  const dialog=/** @type {HTMLDialogElement|null} */(document.getElementById('study-set-test-leave'));
  if(!dialog)return;
  studySetTestLeaveClosing=true;
  if(dialog.open&&typeof dialog.close==='function')dialog.close();
  dialog.remove();
  studySetTestLeaveClosing=false;
}
function studySetTestChoose(choice){
  studySetTestCloseLeave();
  if(choice==='stay'){studySetTestFocus();return;}
  studySetTestFinishNow();
}
function studySetTestLeaveButton(label,choice,className){
  const button=studySetsButton(label,()=>studySetTestChoose(choice));
  button.className='study-set-test-leave-action'+(className?' '+className:'');
  return button;
}
function studySetTestAskLeave(){
  if(!studySetTestRun||studySetsUI.screen!=='test')return false;
  if(document.getElementById('study-set-test-leave'))return true;
  document.getElementById('study-set-test-answer')?.blur();
  const dialog=document.createElement('dialog');
  dialog.id='study-set-test-leave';
  dialog.className='study-set-test-leave';
  dialog.setAttribute('aria-labelledby','study-set-test-leave-title');
  const title=studySetsNode('h2','','정말 제출하고 나가시겠습니까?');
  title.id='study-set-test-leave-title';
  const actions=studySetsNode('div','study-set-test-leave-actions');
  const stay=studySetTestLeaveButton('취소','stay','study-set-test-leave-stay');
  actions.append(stay,studySetTestLeaveButton('나가기','leave','study-set-test-leave-go'));
  dialog.append(title,actions);
  dialog.addEventListener('cancel',event=>{
    event.preventDefault();
    if(!studySetTestLeaveClosing)studySetTestChoose('stay');
  });
  document.body.append(dialog);
  if(typeof dialog.showModal==='function')dialog.showModal();
  else dialog.setAttribute('open','');
  stay.focus();
  return true;
}
function studySetTestHoldHistory(){
  if(window.BREEZE_TARGET==='toss') return false;
  if(studySetsUI.pendingClose||studySetsUI.screen!=='test'||!studySetTestRun)return false;
  history.pushState({
    breeze:true,view:'memory-set',studySets:studySetsUI.historyToken,studySetsScreen:'test',
    studySetsSetId:studySetsUI.setId,studySetsHome:studySetsUI.homeEntry,studySetsManagement:studySetsUI.managementEntry,
    studySetsHomeScroll:studySetsUI.homeScroll,studySetsDirectoryOrigin:studySetsUI.directoryOrigin,
    studySetsDirectoryDepth:studySetsUI.directoryDepth,studySetsDirectoryScroll:studySetsUI.directoryScroll,
    studySetsVocabScroll:studySetsUI.vocabScroll,studySetsDetailEditing:studySetsUI.detailEditing
  },'');
  studySetTestAskLeave();
  return true;
}
function studySetTestSyncSystemBack(){
  const webkit=/** @type {any} */(window).webkit;
  const bridge=webkit&&webkit.messageHandlers&&webkit.messageHandlers.breezeTestBack;
  if(bridge&&typeof bridge.postMessage==='function')bridge.postMessage(studySetsUI.screen==='test');
}
function studySetTestRetryWrong(){
  const run=studySetTestRun;
  if(!run||run.rows.some(row=>row.status==='pending'))return;
  const wrong=run.rows.filter(row=>row.status==='incorrect');
  if(!wrong.length)return;
  const set=studySetsUI.state?.sets.find(item=>item.id===run.setId);
  if(!set)return;
  const cards=BreezeStudySetTest.questions(wrong.map(row=>({id:row.id,word:row.word,acceptedMeanings:row.meanings})),wrong.length);
  studySetTestBegin(set,cards);
  studySetsGo('test');
  studySetTestFocus();
}
function renderStudySetTestSetup(set){
  const pool=studySetTestPool(set),body=studySetsUI.body;
  const setup=studySetsNode('div','study-set-test-setup');
  const hero=studySetsNode('section','study-set-test-hero');
  hero.append(studySetsNode('p','study-set-test-kicker','단어 수'));
  const count=studySetsNode('p','study-set-test-count');count.id='study-set-test-count-label';
  const countValue=studySetsNode('span','study-set-test-count-value',String(Math.max(pool.length,0)));countValue.id='study-set-test-count-value';
  count.append(countValue,studySetsNode('span','study-set-test-count-total',' / '+pool.length));
  const slider=document.createElement('input');
  slider.type='range';slider.id='study-set-test-count';slider.min='1';slider.max=String(Math.max(1,pool.length));slider.value=String(Math.max(1,pool.length));
  slider.setAttribute('aria-label','테스트할 단어 수');
  if(!pool.length)slider.disabled=true;
  slider.addEventListener('input',()=>studySetTestPaintFill(slider));
  const presets=studySetsNode('div','study-set-test-presets');
  presets.setAttribute('role','group');presets.setAttribute('aria-label','단어 수 바로 선택');
  for(const preset of [10,20,50])if(preset<pool.length)presets.append(studySetTestPreset(slider,preset,preset+'개'));
  if(pool.length>1)presets.append(studySetTestPreset(slider,'all','전체'));
  const note=studySetsNode('p','study-set-test-note',pool.length?`이 세트 ${pool.length}개 중에서 뽑아요.`:'테스트할 단어가 없어요.');
  const start=studySetsButton('테스트 시작',()=>{
    const chosen=BreezeStudySetTest.questions(pool,Number(slider.value));
    studySetTestBegin(set,chosen);
    studySetsGo('test');
    studySetTestFocus();
  },'study-sets-primary');
  start.id='study-set-test-start';start.disabled=!pool.length;
  hero.append(count,slider,presets,note,start);
  const history=studySetsNode('section','study-set-test-history');
  history.append(studySetsNode('h3','','지난 테스트'));
  const records=studySetTestStorage();
  if(!records.length)history.append(studySetsNode('p','study-set-test-empty','아직 기록이 없어요.'));
  else{
    const list=studySetsNode('ol','study-set-test-records');
    for(const record of records){
      const row=studySetsNode('li','study-set-test-record');
      if(record.pending)row.classList.add('is-pending');
      row.append(studySetsNode('span','',studySetTestDate(record.at)),studySetsNode('span','',record.count+'개'),studySetsNode('b','',studySetTestScoreLabel(record)));
      list.append(row);
    }
    history.append(list);
  }
  setup.append(hero,history);body.append(setup);
  studySetTestPaintFill(slider);
}
function renderStudySetTest(set){
  const run=studySetTestRun;
  if(!run||run.setId!==set.id||run.index>=run.questions.length){renderStudySetTestSetup(set);return;}
  studySetTestWatchKeyboard();
  const body=studySetsUI.body;
  body.classList.add('study-set-test-body');
  const session=studySetsNode('div','study-set-test-session');
  const progress=studySetsNode('p','study-set-test-progress',`${run.index+1} / ${run.questions.length}`);progress.id='study-set-test-progress';
  const tally=studySetsNode('div','study-set-test-tally');
  tally.id='study-set-test-tally';
  tally.setAttribute('role','status');
  tally.setAttribute('aria-live','polite');
  const tallyLabels={correct:'맞음',incorrect:'틀림',pending:'채점 중'};
  for(const kind of ['correct','incorrect','pending']){
    const item=studySetsNode('span','study-set-test-tally-item');
    item.dataset.kind=kind;
    item.setAttribute('aria-label',tallyLabels[kind]+' 0');
    if(kind==='pending') item.hidden=true;
    const dot=studySetsNode('i');
    dot.setAttribute('aria-hidden','true');
    item.append(dot,studySetsNode('b','','0'));
    tally.append(item);
  }
  const head=studySetsNode('div','study-set-test-head');
  head.append(progress,tally);
  const card=studySetsNode('section','study-set-test-card');
  const word=studySetsNode('p','study-set-test-word',run.questions[run.index].word);word.id='study-set-test-word';
  card.append(word);
  const form=document.createElement('form');form.id='study-set-test-form';form.className='study-set-test-form';form.autocomplete='off';
  const label=studySetsNode('label','study-set-test-label','한국어 뜻');label.htmlFor='study-set-test-answer';
  const input=document.createElement('input');
  input.id='study-set-test-answer';input.type='text';input.maxLength=BreezeStudySetTest.MAX_ANSWER;
  input.placeholder='뜻을 입력';input.enterKeyHint='done';input.inputMode='text';
  input.autocomplete='off';input.spellcheck=false;
  input.setAttribute('autocapitalize','none');input.setAttribute('autocorrect','off');
  input.setAttribute('enterkeyhint','done');
  input.setAttribute('aria-label','한국어 뜻');
  form.append(label,input);
  input.addEventListener('keydown',event=>{
    if(event.key!=='Enter'||event.isComposing||event.keyCode===229)return;
    event.preventDefault();
    if(typeof form.requestSubmit==='function')form.requestSubmit();
    else form.dispatchEvent(new window.Event('submit',{cancelable:true,bubbles:true}));
  });
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const value=input.value;
    input.value='';
    studySetTestSubmit(value);
    if(studySetsUI.screen==='test')studySetTestFocus();
  });
  session.append(head,card,form);body.append(session);
}
function renderStudySetTestResult(set){
  const run=studySetTestRun;
  if(!run||run.setId!==set.id){renderStudySetTestSetup(set);return;}
  const body=studySetsUI.body,copy=studySetTestResultCopy(run),pending=copy.pending,total=copy.total;
  const result=studySetsNode('div','study-set-test-result');
  const hero=studySetsNode('section','study-set-test-hero study-set-test-score-card');
  hero.append(studySetsNode('p','study-set-test-kicker','결과'));
  const score=studySetsNode('p','study-set-test-score','');score.id='study-set-test-score';
  studySetTestPaintScore(score,copy);
  const caption=studySetsNode('p','study-set-test-note',copy.caption);caption.id='study-set-test-caption';
  hero.append(score,caption);
  const wrong=run.rows.filter(row=>row.status==='incorrect');
  const section=studySetsNode('section','study-set-test-history');
  const title=studySetsNode('h3','','틀린 단어');title.id='study-set-test-wrong-title';title.hidden=pending||!wrong.length;
  const list=studySetsNode('ol','study-set-test-records study-set-test-wrongs');list.id='study-set-test-wrong';list.hidden=pending||!wrong.length;
  for(const row of wrong)list.append(studySetTestWrongRow(row));
  const clear=studySetsNode('p','study-set-test-empty','모두 맞았어요.');clear.id='study-set-test-clear';clear.hidden=pending||wrong.length>0||total<1;
  const retry=studySetsButton('틀린 단어만 다시',()=>studySetTestRetryWrong(),'study-sets-primary');
  retry.id='study-set-test-retry';retry.hidden=pending||!wrong.length;retry.disabled=pending||!wrong.length;
  section.append(title,list,clear);
  result.append(hero,section,retry);body.append(result);
  studySetTestMaybeSave();
}
window.addEventListener('online',()=>{if(studySetTestQueue.length)void studySetTestPump();});
function studySetTestGradeApplies(run,job){
  if(!run||!studySetTestJobs.has(run.id)||(run.scope&&typeof isLearningScopeCurrent==='function'&&!isLearningScopeCurrent(run.scope))){
    if(studySetTestQueue[0]===job)studySetTestQueue.shift();
    return false;
  }
  return true;
}
window.addEventListener('breeze-learning-scope',()=>{
  studySetTestRun=null;studySetTestQueue.length=0;
  studySetTestCloseLeave();studySetTestReleaseKeyboard();studySetTestSyncSystemBack();
});
function studySetTestResumeStored(){
  let raw='';
  try{raw=localStorage.getItem(studySetTestHistoryKey())||'';}catch{return;}
  for(const job of BreezeStudySetTest.pending(raw)){
    if(studySetTestJobs.has(job.record.id))continue;
    const rows=job.record.rows.map(row=>({word:row.word,meanings:row.meanings.slice(),answer:row.answer,status:row.status,via:row.status==='pending'?'':'stored'}));
    const run={id:job.record.id,setId:job.setId,startedAt:job.record.at,questions:rows.map((row,index)=>({id:job.record.id+':'+index,word:row.word,meanings:row.meanings})),index:rows.length,rows};
    studySetTestJobs.set(run.id,run);
    const indexes=rows.map((row,index)=>row.status==='pending'?index:-1).filter(index=>index>=0);
    for(let i=0;i<indexes.length;i+=10)studySetTestQueue.push({id:run.id,indexes:indexes.slice(i,i+10),attempts:0});
  }
  if(studySetTestQueue.length)void studySetTestPump();
}
studySetTestResumeStored();
