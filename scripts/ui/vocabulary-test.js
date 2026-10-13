/* Full-page typed recall. No answer or automated judgement is rendered while typing. */
const vocabularyTestUI={
  session:null,scope:null,candidates:[],screen:'setup',page:0,busy:false,loading:false,
  saveJob:null,draft:'',dirty:false,returnFocus:null,epoch:0,lastError:null,ai:null,batchPage:-1
};
const vocabularyTestPage=document.getElementById('v-vocabulary-test');
document.getElementById('wordbook-test').hidden=!BreezeVocabularyTest.ENABLED;
function vocabularyTestNode(tag,className='',text=''){
  const node=document.createElement(tag);node.className=className;if(text)node.textContent=text;return node;
}
function vocabularyTestButton(label,id,action,className=''){
  const button=document.createElement('button');button.type='button';button.textContent=label;button.id=id;
  button.className='vocabulary-test-button '+className;button.addEventListener('click',action);return button;
}
function vocabularyTestScope(options){
  if(options.kind==='set'){
    const set=studySetsUI.state?.sets.find(item=>item.id===options.setId);
    if(!set)throw new Error('The selected study set is unavailable');
    const excluded=new Set(set.excludedIds),active=set.cards.filter(card=>!excluded.has(card.id));
    return {label:set.name,cards:BreezeVocabularyTest.cards(BreezeStudySets.groupedCards(active).flatMap(group=>group.senses.map(card=>[card.key,{...card,root:group.group}])))};
  }
  const entries=Object.entries(words).filter(([,item])=>validWordMeaning(item)&&typeof item.word==='string'&&item.word.trim());
  if(options.kind!=='filtered')return {label:'전체 단어',cards:BreezeVocabularyTest.cards(entries)};
  const groups=new Map();for(const entry of entries){const root=entry[1].root||entry[0];if(!groups.has(root))groups.set(root,[]);groups.get(root).push(entry);}
  const query=/** @type {HTMLInputElement} */(document.getElementById('vsearch')).value.trim().toLowerCase();
  const filtered=filterWordbookGroups([...groups],query).flatMap(([,items])=>items);
  const narrowed=wordbookBooks.size||wordbookStars.size||query;
  return {label:narrowed?'현재 필터의 단어':'전체 단어',cards:BreezeVocabularyTest.cards(filtered)};
}
async function openVocabularyTest(options={kind:'all'}){
  if(!BreezeVocabularyTest.ENABLED)return;
  const ui=vocabularyTestUI;if(ui.loading||ui.busy)return;
  ui.returnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  try{ui.scope=vocabularyTestScope(options);ui.candidates=ui.scope.cards;}catch(error){return;}
  ui.screen='setup';ui.page=0;ui.ai=null;ui.batchPage=-1;
  show('vocabulary-test',{vocabularyTestPrepared:true});
  await loadVocabularyTestPage();
}
async function loadVocabularyTestPage(){
  if(!BreezeVocabularyTest.ENABLED)return;
  const ui=vocabularyTestUI,epoch=++ui.epoch;ui.loading=true;renderVocabularyTest();
  try{
    // A failed pending draft stays in memory and must be retried, not replaced by
    // an older durable response when the user returns from another app view.
    if(ui.dirty)await flushVocabularyTestDraft();
    const session=await readVocabularyTest();if(epoch!==ui.epoch)return;
    ui.session=session;ui.lastError=null;queueVocabularyTestBatches();
  }catch(error){if(epoch===ui.epoch)ui.lastError=error;}
  finally{if(epoch===ui.epoch){ui.loading=false;renderVocabularyTest();}}
}
function resumeVocabularyTestPage(){
  if(!BreezeVocabularyTest.ENABLED)return;
  const ui=vocabularyTestUI;
  if(!ui.scope){ui.scope=vocabularyTestScope({kind:'all'});ui.candidates=ui.scope.cards;}
  ui.screen='setup';return loadVocabularyTestPage();
}
function vocabularyTestLeaving(){
  if(vocabularyTestUI.dirty)flushVocabularyTestDraft().catch(error=>{vocabularyTestUI.lastError=error;});
}
async function closeVocabularyTest(){
  const ui=vocabularyTestUI;if(ui.busy)return;
  try{await flushVocabularyTestDraft();}catch(error){vocabularyTestError(error);return;}
  history.back();
  setTimeout(()=>{if(ui.returnFocus?.isConnected&&activeAppView()!=='vocabulary-test')ui.returnFocus.focus({preventScroll:true});},0);
}
function vocabularyTestError(error){
  vocabularyTestUI.lastError=error;
  const box=document.getElementById('vocabulary-test-error');if(!box)return;
  box.replaceChildren();box.hidden=false;
  const changed=/changed/.test(String(error?.message||''));
  box.append(vocabularyTestNode('p','',changed?'다른 창에서 테스트가 바뀌었어요. 입력은 이 화면에 남아 있어요. 다른 창을 확인한 뒤 다시 열어 주세요.':'답안을 저장하지 못했어요. 입력은 그대로예요. 저장 후 계속할 수 있어요.'));
  if(!changed)box.append(vocabularyTestButton('저장 다시 시도','vocabulary-test-retry',async()=>{
    try{if(vocabularyTestUI.dirty)await flushVocabularyTestDraft();else await loadVocabularyTestPage();clearVocabularyTestError();}catch(cause){vocabularyTestError(cause);}
  }));
}
function clearVocabularyTestError(){vocabularyTestUI.lastError=null;const box=document.getElementById('vocabulary-test-error');if(box){box.hidden=true;box.replaceChildren();}}
function renderVocabularyTest(){
  if(!BreezeVocabularyTest.ENABLED)return;
  const ui=vocabularyTestUI;vocabularyTestPage.replaceChildren();
  const shell=vocabularyTestNode('main','vocabulary-test-shell');
  const header=vocabularyTestNode('header','vocabulary-test-header');
  const back=vocabularyTestButton('','vocabulary-test-close',closeVocabularyTest,'vocabulary-test-back');
  back.setAttribute('aria-label','테스트 나가기');back.append(studySetsIcon('back'));
  const title=vocabularyTestNode('h1','','단어 테스트');title.id='vocabulary-test-title';title.tabIndex=-1;
  header.append(back,title);shell.append(header);
  const error=vocabularyTestNode('div','vocabulary-test-error');error.id='vocabulary-test-error';error.hidden=true;error.setAttribute('role','alert');shell.append(error);
  const body=vocabularyTestNode('div','vocabulary-test-body');body.id='vocabulary-test-content';shell.append(body);vocabularyTestPage.append(shell);
  if(ui.loading){body.append(vocabularyTestNode('p','vocabulary-test-note','저장된 테스트를 불러오는 중…'));return;}
  if(ui.screen==='setup')renderVocabularyTestSetup(body);
  else if(ui.session?.meta.phase==='results')renderVocabularyTestResults(body);
  else if(ui.session)renderVocabularyTestQuestion(body);
  if(ui.lastError)vocabularyTestError(ui.lastError);
}
function renderVocabularyTestSetup(body){
  const ui=vocabularyTestUI;
  body.append(vocabularyTestNode('h2','',ui.scope?.label||'전체 단어'),vocabularyTestNode('p','vocabulary-test-note','영어 표현을 보고 한국어 뜻을 직접 써 보세요. 10문항씩 묶어서 채점하고, 다음 문제를 계속 풀 수 있어요.'));
  if(ui.session){
    const saved=ui.session,box=vocabularyTestNode('section','vocabulary-test-resume');
    box.append(vocabularyTestNode('p','',`${saved.manifest.scope} · ${saved.meta.index} / ${saved.manifest.cards.length}문항`));
    box.append(vocabularyTestButton(saved.meta.phase==='results'?'지난 결과 보기':'이어서 테스트','vocabulary-test-resume',()=>{ui.screen='test';ui.page=0;renderVocabularyTest();focusVocabularyTestQuestion();}));body.append(box);
  }
  const total=BreezeVocabularyTest.groups(ui.candidates).size;
  if(!total){body.append(vocabularyTestNode('p','vocabulary-test-empty','이 범위에 테스트할 단어가 없어요. 단어를 저장하거나 필터를 직접 바꿔 주세요.'));return;}
  const fieldset=document.createElement('fieldset');fieldset.className='vocabulary-test-options';
  fieldset.append(vocabularyTestNode('legend','','새 테스트 범위'));
  for(const [value,label] of [['sample',`${Math.min(20,total)}문항`],...(total>20?[['all',`전체 ${total.toLocaleString()}문항`]]:[]),['custom','직접 정하기']]){
    const option=document.createElement('label'),radio=document.createElement('input');radio.type='radio';radio.name='vocabulary-test-size';radio.value=value;radio.checked=value==='sample';option.append(radio,document.createTextNode(label));fieldset.append(option);
  }
  const countLabel=document.createElement('label');countLabel.className='vocabulary-test-count-label';countLabel.textContent=`문항 수 (1–${total.toLocaleString()})`;
  const count=document.createElement('input');count.type='number';count.inputMode='numeric';count.id='vocabulary-test-count';count.min='1';count.max=String(total);count.step='1';count.value=String(Math.min(20,total));count.required=true;
  count.addEventListener('input',()=>{const custom=/** @type {HTMLInputElement} */(fieldset.querySelector('input[value="custom"]'));custom.checked=true;});countLabel.append(count);
  body.append(fieldset,countLabel,vocabularyTestNode('p','vocabulary-test-note','단어마다 한 번 출제해요. 여러 뜻이 있으면 그중 하나를 써 주세요. 시작한 범위와 순서는 그대로 이어져요.'));
  const start=vocabularyTestButton('테스트 시작','vocabulary-test-start',async()=>{
    if(ui.session){
      const confirm=document.getElementById('vocabulary-test-replace');if(confirm){confirm.focus();return;}
      const note=vocabularyTestNode('div','vocabulary-test-replace');note.append(vocabularyTestNode('p','','새 테스트를 시작하면 이 기기의 이전 테스트와 답안을 바꿔요.'));
      note.append(vocabularyTestButton('이전 기록을 바꾸고 시작','vocabulary-test-replace',startVocabularyTest,'vocabulary-test-primary'),vocabularyTestButton('취소','vocabulary-test-cancel-replace',()=>note.remove()));body.append(note);note.querySelector('button').focus();return;
    }
    await startVocabularyTest();
  },'vocabulary-test-primary');start.disabled=!!ui.lastError;body.append(start);
}
async function startVocabularyTest(){
  const ui=vocabularyTestUI;if(ui.busy)return;ui.busy=true;
  const buttons=[...vocabularyTestPage.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
  try{
    const choice=/** @type {HTMLInputElement} */(vocabularyTestPage.querySelector('input[name="vocabulary-test-size"]:checked')).value,total=BreezeVocabularyTest.groups(ui.candidates).size;
    const count=/** @type {HTMLInputElement} */(document.getElementById('vocabulary-test-count'));
    if(choice==='custom'&&!count.reportValidity()){buttons.forEach(b=>b.disabled=false);return;}
    const size=choice==='all'?total:choice==='custom'?Number(count.value):Math.min(20,total);
    const manifest=BreezeVocabularyTest.start(ui.candidates,ui.scope.label,size,Math.random,Date.now());
    const next=await replaceVocabularyTest(manifest,ui.session?.meta||null);
    ui.session=next;ui.screen='test';ui.dirty=false;ui.draft='';ui.lastError=null;ui.ai=null;ui.page=0;
    renderVocabularyTest();focusVocabularyTestQuestion();
  }catch(error){vocabularyTestError(error);buttons.forEach(b=>b.disabled=false);}
  finally{ui.busy=false;}
}
function focusVocabularyTestQuestion(){
  // Focus the prompt, not the input: opening a test must not summon the mobile keyboard.
  document.getElementById('vocabulary-test-prompt')?.focus({preventScroll:true});
}
function renderVocabularyTestQuestion(body){
  const ui=vocabularyTestUI,session=ui.session,index=session.meta.index,card=session.manifest.cards[index];
  ui.draft=session.answers.get(index)?.text||'';
  const progress=vocabularyTestNode('p','vocabulary-test-progress',`${index+1} / ${session.manifest.cards.length}`);progress.id='vocabulary-test-progress';progress.setAttribute('aria-label',`${session.manifest.cards.length}문항 중 ${index+1}번째`);body.append(progress);
  const prompt=vocabularyTestNode('section','vocabulary-test-prompt');prompt.id='vocabulary-test-prompt';prompt.tabIndex=-1;
  const word=vocabularyTestNode('h2','',card.word);word.lang='en';prompt.append(word);
  const source=BreezeVocabularyTest.prompt(card);
  if(source.text){
    const sentence=vocabularyTestNode('p','vocabulary-test-sentence');sentence.id='vocabulary-test-sentence';sentence.lang='en';let end=0;
    for(const range of source.ranges){sentence.append(document.createTextNode(source.text.slice(end,range.start)));sentence.append(vocabularyTestNode('strong','',source.text.slice(range.start,range.end)));end=range.end;}
    sentence.append(document.createTextNode(source.text.slice(end)));prompt.append(sentence);
  }
  body.append(prompt);
  const form=document.createElement('form');form.className='vocabulary-test-form';
  const label=vocabularyTestNode('label','','한국어 뜻');label.htmlFor='vocabulary-test-answer';
  const input=document.createElement('textarea');input.id='vocabulary-test-answer';input.rows=2;input.maxLength=BreezeVocabularyTest.MAX_ANSWER;input.value=ui.draft;input.placeholder='떠오르는 뜻을 써 주세요';input.autocomplete='off';input.spellcheck=false;input.setAttribute('aria-describedby','vocabulary-test-answer-note vocabulary-test-save-status');
  const note=vocabularyTestNode('p','vocabulary-test-note','모르겠으면 비워 두어도 괜찮아요.');note.id='vocabulary-test-answer-note';
  const saved=vocabularyTestNode('span','vocabulary-test-save-status','저장됨');saved.id='vocabulary-test-save-status';saved.setAttribute('role','status');
  input.addEventListener('input',()=>{ui.draft=input.value;ui.dirty=true;saved.textContent='저장 중…';flushVocabularyTestDraft().catch(vocabularyTestError);});
  const next=vocabularyTestButton(index+1===session.manifest.cards.length?'제출하고 결과 보기':'다음','vocabulary-test-next',()=>{},'vocabulary-test-primary');next.type='submit';
  // The form owns Return/IME. A newline never submits an unfinished Korean composition.
  form.addEventListener('submit',event=>{event.preventDefault();submitVocabularyTestAnswer();});
  form.addEventListener('keydown',event=>event.stopPropagation());
  form.append(label,input,note,saved,next);body.append(form);renderVocabularyTestBatches(body);
}
async function flushVocabularyTestDraft(){
  const ui=vocabularyTestUI;if(ui.saveJob)return ui.saveJob;
  if(!ui.dirty||!ui.session||ui.session.meta.phase!=='answering')return;
  const session=ui.session;
  ui.saveJob=(async()=>{
    while(ui.dirty){
      const value=ui.draft,index=session.meta.index,answer={index,text:value,submitted:false,verdict:null,at:Date.now()};
      const meta=await writeVocabularyTestAnswer(session,answer);
      session.meta=meta;session.answers.set(index,answer);ui.dirty=ui.draft!==value;
    }
    clearVocabularyTestError();const saved=document.getElementById('vocabulary-test-save-status');if(saved)saved.textContent='저장됨';
  })();
  try{await ui.saveJob;}finally{ui.saveJob=null;}
}
async function submitVocabularyTestAnswer(){
  const ui=vocabularyTestUI;if(ui.busy)return;ui.busy=true;
  const input=/** @type {HTMLTextAreaElement} */(document.getElementById('vocabulary-test-answer')),next=/** @type {HTMLButtonElement} */(document.getElementById('vocabulary-test-next'));
  input.disabled=true;next.disabled=true;
  try{
    await flushVocabularyTestDraft();const session=ui.session,index=session.meta.index;
    const answer={index,text:input.value,submitted:true,verdict:null,at:Date.now()},meta=await writeVocabularyTestAnswer(session,answer,true);
    session.meta=meta;session.answers.set(index,answer);
    if(index%10===9||meta.phase==='results'){const batch=vocabularyTestBatch(session,index+1);session.batches.set(batch.start,batch);}
    ui.lastError=null;ui.page=0;renderVocabularyTest();focusVocabularyTestQuestion();
    if(meta.phase==='results')document.getElementById('vocabulary-test-result-title')?.focus();
    queueVocabularyTestBatches();
  }catch(error){vocabularyTestError(error);input.disabled=false;next.disabled=false;}
  finally{ui.busy=false;}
}
function renderVocabularyTestResults(body){
  const ui=vocabularyTestUI,session=ui.session,total=session.manifest.cards.length;
  const title=vocabularyTestNode('h2','','답안 확인');title.id='vocabulary-test-result-title';title.tabIndex=-1;
  body.append(title,vocabularyTestNode('p','vocabulary-test-note',`${total}문항을 제출했어요. 저장된 뜻과 내 답을 비교하고 직접 확인해 주세요. 표현이 달라도 같은 뜻일 수 있어요.`));
  const counts={remembered:0,revisit:0,unsure:0};for(const answer of session.answers.values())counts[answer.verdict||'unsure']++;
  const summary=vocabularyTestNode('p','vocabulary-test-summary',`기억했어요 ${counts.remembered} · 다시 볼게요 ${counts.revisit} · 확인 필요 ${counts.unsure}`);summary.id='vocabulary-test-summary';summary.setAttribute('role','status');body.append(summary);
  const aiNote=vocabularyTestNode('p','vocabulary-test-note',window['BreezeVocabularyTestGrader']?'묶음 채점 결과와 저장된 뜻을 함께 확인해 주세요.':'AI 채점은 아직 연결되지 않았어요. 자동 정답률을 표시하지 않아요.');aiNote.id='vocabulary-test-ai-note';body.append(aiNote);renderVocabularyTestBatches(body);
  const list=document.createElement('ol');list.className='vocabulary-test-results';list.start=ui.page*20+1;
  for(let index=ui.page*20;index<Math.min(total,(ui.page+1)*20);index++){
    const card=session.manifest.cards[index],answer=session.answers.get(index),row=vocabularyTestNode('li','vocabulary-test-result');row.dataset.index=String(index);
    row.append(vocabularyTestNode('h3','',card.word));
    const own=vocabularyTestNode('p','vocabulary-test-own');own.append(vocabularyTestNode('span','','내 답'),document.createTextNode(answer.text.trim()?answer.text:'답하지 않음'));
    const expected=vocabularyTestNode('p','vocabulary-test-expected');expected.append(vocabularyTestNode('span','','저장된 뜻'),document.createTextNode(card.acceptedMeanings.map((meaning,i)=>card.acceptedMeanings.length>1?`${i+1}. ${meaning}`:meaning).join('\n')));row.append(own,expected);
    const actions=vocabularyTestNode('div','vocabulary-test-verdicts');actions.setAttribute('role','group');actions.setAttribute('aria-label',`${index+1}번 답안 직접 확인`);
    for(const [verdict,label] of [['remembered','기억했어요'],['revisit','다시 볼게요'],['unsure','확인 필요']]){
      const button=vocabularyTestButton(label,`vocabulary-test-verdict-${index}-${verdict}`,async()=>{
        if(ui.busy)return;ui.busy=true;actions.querySelectorAll('button').forEach(b=>b.disabled=true);
        try{const next={...answer,verdict},meta=await writeVocabularyTestAnswer(session,next);session.meta=meta;session.answers.set(index,next);ui.lastError=null;renderVocabularyTest();document.getElementById(button.id)?.focus({preventScroll:true});}
        catch(error){vocabularyTestError(error);actions.querySelectorAll('button').forEach(b=>b.disabled=false);}finally{ui.busy=false;}
      });button.setAttribute('aria-pressed',String((answer.verdict||'unsure')===verdict));actions.append(button);
    }
    row.append(actions);list.append(row);
  }
  body.append(list);
  if(total>20){
    const nav=vocabularyTestNode('nav','vocabulary-test-pagination');nav.setAttribute('aria-label','답안 결과 페이지');
    const previous=vocabularyTestButton('이전','vocabulary-test-results-previous',()=>{ui.page--;renderVocabularyTest();document.getElementById('vocabulary-test-result-title')?.focus();});previous.disabled=ui.page===0;
    const next=vocabularyTestButton('다음','vocabulary-test-results-next',()=>{ui.page++;renderVocabularyTest();document.getElementById('vocabulary-test-result-title')?.focus();});next.disabled=(ui.page+1)*20>=total;
    nav.append(previous,vocabularyTestNode('span','',`${ui.page+1} / ${Math.ceil(total/20)}`),next);body.append(nav);
  }
  body.append(vocabularyTestButton('새 테스트','vocabulary-test-new',()=>{ui.screen='setup';renderVocabularyTest();}));
}
vocabularyTestPage.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeVocabularyTest();}event.stopPropagation();});
window.addEventListener('pagehide',vocabularyTestLeaving);
document.addEventListener('visibilitychange',()=>{if(document.hidden)vocabularyTestLeaving();});

// Remote grading is deliberately unregistered in the shipped app. A verified
// adapter can be injected for local tests; only completed frozen batches leave
// this boundary. In-flight claims survive reload and are never blindly resent.
const vocabularyTestGradingJobs=new Map();
function queueVocabularyTestBatches(){
  const ui=vocabularyTestUI,session=ui.session,grader=window['BreezeVocabularyTestGrader'];
  if(!session||!grader||typeof grader.grade!=='function')return;
  for(const batch of session.batches.values()){
    if(vocabularyTestGradingJobs.size>=1)break;
    if(batch.status!=='waiting'||vocabularyTestGradingJobs.has(batch.token))continue;
    const job=(async()=>{
      let claimed=false;
      try{
        const running={...batch,status:'grading'};await writeVocabularyTestBatch(session,running,'waiting');claimed=true;
        session.batches.set(batch.start,running);refreshVocabularyTestBatches();
        const items=session.manifest.cards.slice(batch.start,batch.end).map((card,offset)=>({id:card.id,word:card.word,meanings:card.acceptedMeanings,answer:session.answers.get(batch.start+offset).text,example:BreezeVocabularyTest.prompt(card).text}));
        const response=await grader.grade({sessionId:session.manifest.id,batchId:batch.token,items});
        const received=Array.isArray(response?.results)?response.results:[],byId=new Map();
        for(const result of received){if(result&&typeof result.id==='string'){if(byId.has(result.id))byId.set(result.id,null);else byId.set(result.id,result);}}
        const results=items.map(item=>{const result=byId.get(item.id);return {id:item.id,status:['correct','incorrect','uncertain'].includes(result?.status)?result.status:'uncertain',reason:typeof result?.reason==='string'?result.reason.slice(0,300):'채점 결과를 확인해 주세요.'};});
        const complete={...running,status:'complete',results};await writeVocabularyTestBatch(session,complete,'grading');session.batches.set(batch.start,complete);
      }catch(error){
        if(!claimed)session.batches.set(batch.start,{...batch,status:'error'});
        if(claimed){
          // A dispatched request may have cost money even when its response was
          // lost. No automatic retry or fresh request ID is created here.
          const failed={...batch,status:'error'};
          try{await writeVocabularyTestBatch(session,failed,'grading');session.batches.set(batch.start,failed);}catch{}
        }
      }finally{
        vocabularyTestGradingJobs.delete(batch.token);
        if(ui.session===session)refreshVocabularyTestBatches();
        queueVocabularyTestBatches();
      }
    })();vocabularyTestGradingJobs.set(batch.token,job);
  }
}
function refreshVocabularyTestBatches(){
  const target=document.getElementById('vocabulary-test-batches');
  if(target){const parent=target.parentElement;target.remove();renderVocabularyTestBatches(parent);}
}
function renderVocabularyTestBatches(body){
  const session=vocabularyTestUI.session;if(!session?.batches?.size)return;
  const region=vocabularyTestNode('section','vocabulary-test-batches');region.id='vocabulary-test-batches';region.setAttribute('aria-label','10문항 묶음 채점');
  const batches=[...session.batches.values()],lastPage=Math.floor((batches.length-1)/5),page=vocabularyTestUI.batchPage<0?lastPage:Math.min(lastPage,vocabularyTestUI.batchPage);
  for(const batch of batches.slice(page*5,page*5+5)){
    const live=vocabularyTestGradingJobs.has(batch.token),status=batch.status==='waiting'?'연결 대기':batch.status==='grading'?(live?'채점 중':'확인 필요'):batch.status==='complete'?'완료':'오류 · 확인 필요';
    const details=document.createElement('details');details.dataset.batch=String(batch.start);details.dataset.status=batch.status;
    const summary=vocabularyTestNode('summary','',`${batch.start+1}–${batch.end}번 · ${status}`);details.append(summary);
    // Only an explicitly expanded batch mounts its responses, keeping large
    // complete sessions bounded even when thousands of questions were tested.
    details.addEventListener('toggle',()=>{
      const old=details.querySelector('.vocabulary-test-batch-detail');if(old)old.remove();if(!details.open)return;
      const content=vocabularyTestNode('div','vocabulary-test-batch-detail');
      if(batch.status!=='complete')content.append(vocabularyTestNode('p','vocabulary-test-note',batch.status==='waiting'?'AI 채점 연결을 기다리고 있어요. 다음 문제를 계속 풀 수 있어요.':'채점 결과를 확인하지 못했어요. 자동으로 다시 보내지 않아요. 마지막에 직접 확인할 수 있어요.'));
      else for(let index=batch.start;index<batch.end;index++){
        const card=session.manifest.cards[index],result=batch.results[index-batch.start],answer=session.answers.get(index);
        const row=vocabularyTestNode('div','vocabulary-test-batch-answer');row.append(vocabularyTestNode('h3','',card.word),vocabularyTestNode('p','',`내 답: ${answer.text||'답하지 않음'}`),vocabularyTestNode('p','',`저장된 뜻: ${card.acceptedMeanings.map((meaning,i)=>card.acceptedMeanings.length>1?`${i+1}. ${meaning}`:meaning).join('\n')}`),vocabularyTestNode('p','',result.status==='correct'?'정답':result.status==='incorrect'?'오답':'확인 필요'));if(result.reason)row.append(vocabularyTestNode('p','vocabulary-test-note',result.reason));content.append(row);
      }
      details.append(content);
    });region.append(details);
  }
  if(batches.length>5){
    const nav=vocabularyTestNode('nav','vocabulary-test-pagination');nav.setAttribute('aria-label','채점 묶음 페이지');
    const previous=vocabularyTestButton('이전 묶음','vocabulary-test-batches-previous',()=>{vocabularyTestUI.batchPage=page-1;refreshVocabularyTestBatches();});previous.disabled=page===0;
    const next=vocabularyTestButton('다음 묶음','vocabulary-test-batches-next',()=>{vocabularyTestUI.batchPage=page+1;refreshVocabularyTestBatches();});next.disabled=page===lastPage;
    nav.append(previous,vocabularyTestNode('span','',`${page+1} / ${lastPage+1}`),next);region.append(nav);
  }
  body.append(region);
}
