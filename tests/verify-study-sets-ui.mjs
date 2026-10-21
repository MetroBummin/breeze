import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function afterAction(result){const value=await result;await settle();return value;}

// Displacement-only pointer fixtures use a stationary clock; velocity/trajectory
// belongs to the trusted/synthetic browser motion suite, not Node scheduling.
// Event-level UI checks only. Native focus trapping, browser history timing,
// pointer capture, layout and paint are covered by verify-study-sets-browser.mjs.
// Gesture fixtures use two distinct words; representative multi-meaning cases below
// explicitly replace the second word so a real two-row drag remains meaningful.
function harness(){
  const {window}=parseHTML('<!DOCTYPE html><html><body><section id="v-memory"><main id="study-sets-home-list"></main></section></body></html>');
  const {document}=window,storage=new Map();
  let focused=document.body;
  Object.defineProperty(document,'activeElement',{get:()=>focused});
  const entries=[{breeze:true,view:'vocab'}];let historyIndex=0;
  const history={state:entries[0],pushState(value){entries[historyIndex]=this.state;entries.splice(++historyIndex);entries.push(value);this.state=value;},replaceState(value){this.state=value;entries[historyIndex]=value;},go(delta){
    historyIndex=Math.max(0,Math.min(entries.length-1,historyIndex+delta));this.state=entries[historyIndex];const event=new window.Event('popstate');event.state=this.state;window.dispatchEvent(event);
  },back(){this.go(-1);},forward(){this.go(1);}};
  const context={window,document,HTMLElement:window.HTMLElement,Element:window.Element,Node:window.Node,console,setTimeout,clearTimeout,performance,requestAnimationFrame:callback=>setTimeout(()=>callback(performance.now()),16),cancelAnimationFrame:clearTimeout,matchMedia:()=>({matches:true}),
    activeAppView:()=>context.currentView,currentView:'vocab',show:view=>{context.currentView=view;},openVocabularyReview:()=>{context.currentView='study';history.pushState({breeze:true,view:'study'});},history,words:{
      a:{word:'quiet',ko:'조용한',book:'One',example:'Stay quiet.',addedAt:1},
      b:{word:'quiet',ko:'조용한',book:'Two',addedAt:2},
      c:{word:'calm',ko:'고요한',book:'Two',addedAt:3},
      d:{word:'direct',ko:'직접',book:'',addedAt:4}
    },esc:value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])),renderStoredStudyExample:(target,card)=>{target.textContent=card.example||'';},validWordMeaning:item=>!!(item&&typeof item.ko==='string'&&item.ko.trim()),
    dead:{},LS_DEAD:'breeze.dead',
    save:(key,value)=>{storage.set(key,JSON.stringify(value));return true;},
    saveWords(keys){context.lastSaveKeys=keys;context.lastSync=typeof context.scheduleStudySetsVocabularySync==='function'&&context.studySetsIsOpen?.()?context.scheduleStudySetsVocabularySync():null;return true;},
    queueSync(){context.queuedSync=(context.queuedSync||0)+1;},paintWord(){},refreshReaderWords(){},
    senseCardKey:(root,meaning)=>`${root}::sense:${meaning}`,
    localStorage:{getItem:key=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>{storage.set(key,value);}},
    ResizeObserver:window.ResizeObserver||class{observe(){}unobserve(){}disconnect(){}}
  };
  const create=document.createElement.bind(document);
  document.createElement=tag=>{
    const node=create(tag);
    if(tag==='dialog'){
      node.showModal=function(){this.open=true;};
      node.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
    }
    if(tag==='input'){node.setCustomValidity=function(value){this.qaValidity=value;};node.reportValidity=()=>true;}
    node.setPointerCapture=()=>{};node.focus=function(){focused=this;};
    return node;
  };
  vm.createContext(context);
  const dictionary=readFileSync(new URL('../scripts/dictionary/dictionary.js',import.meta.url),'utf8');
  vm.runInContext(dictionary.slice(dictionary.indexOf('function vocabMoreHtml('),dictionary.indexOf('function renderVocab(){')),context,{filename:'shared-vocabulary-renderer'});
  const createGroup=context.createVocabularyGroup;
  context.createVocabularyGroup=(...args)=>{const group=createGroup(...args);for(const node of group.querySelectorAll('[tabindex],button'))node.focus=function(){focused=this;this.dispatchEvent(new window.Event('focus'));};return group;};
  // DOM/event contracts use a storage facade. The separate storage and browser
  // suites exercise real IDB completion, migration, rollback and concurrent writes.
  vm.runInContext(`const STUDY_SETS_STORAGE='breeze.study-sets.v1';let fixtureRead;
    function studyScopeCapture(){return null;}function studyScopeAssert(){}function studyScopeKey(key){return key;}
    function readStudySets(){const raw=localStorage.getItem(STUDY_SETS_STORAGE);const value=BreezeStudySets.decode(raw);fixtureRead=raw;return value;}
    async function loadStudySets(){return readStudySets();}
    function commitStudySets(next){const raw=localStorage.getItem(STUDY_SETS_STORAGE);BreezeStudySets.decode(raw);if(raw!==fixtureRead)throw Error('changed');localStorage.setItem(STUDY_SETS_STORAGE,JSON.stringify(BreezeStudySets.normalize(next)));fixtureRead=localStorage.getItem(STUDY_SETS_STORAGE);}`,context);
  for(const path of ['scripts/core/study-sets.js','scripts/core/vocabulary-test.js','scripts/ui/study-motion.js','scripts/ui/study-sets.js'])
    vm.runInContext(readFileSync(new URL('../'+path,import.meta.url),'utf8'),context,{filename:path});
  const run=source=>vm.runInContext(source,context);
  const query=selector=>{const node=document.querySelector(selector);assert.ok(node,'Missing '+selector);return node;};
  const click=selector=>query(selector).click();
  const submit=selector=>query(selector).dispatchEvent(new window.Event('submit',{cancelable:true}));
  const button=label=>{const node=[...document.querySelectorAll('button')].find(item=>item.textContent===label);assert.ok(node,'Missing button '+label);node.click();};
  async function createSet(name='My set',books=['One','Two']){
    await afterAction(run('openStudySets()'));await afterAction(click('#study-sets-create'));query('#study-sets-name').value=name;
    for(const node of document.querySelectorAll('.study-sets-book input'))if(books.includes(node.value)){
      node.checked=true;node.dispatchEvent(new window.Event('change'));
    }
    await afterAction(submit('#study-sets-create-form'));
  }
  async function createFromHome(name='Exam set',books=['One','Two']){
    context.currentView='memory';history.state={breeze:true,view:'memory'};await afterAction(run('renderStudySetsHome()'));
    query('#study-sets-home-create').focus();await afterAction(click('#study-sets-home-create'));query('#study-sets-name').value=name;
    for(const node of document.querySelectorAll('.study-sets-book input'))if(books.includes(node.value)){
      node.checked=true;node.dispatchEvent(new window.Event('change'));
    }
    await afterAction(submit('#study-sets-create-form'));
  }
  return {context,storage,run,document,query,click,submit,button,createSet,createFromHome,window};
}

test('study set UI creates safe deduplicated snapshots, excludes with undo, imports explicitly, and repeats a frozen round',async ()=>{
  const {context,document,query,click,run,createSet}=harness();
  await afterAction(createSet('<img src=x onerror=alert(1)>'));
  assert.equal(query('#study-sets-title').textContent,'<img src=x onerror=alert(1)>');
  assert.equal(document.querySelectorAll('img').length,0);
  assert.equal(document.querySelectorAll('#study-sets-word-list li').length,2);
  const source=JSON.stringify(context.words);
  await afterAction(click('.study-sets-row-action'));assert.equal(document.querySelectorAll('#study-sets-word-list li').length,1);
  await afterAction(click('.study-sets-undo button'));assert.equal(document.querySelectorAll('#study-sets-word-list li').length,2);
  await afterAction(click('#study-sets-start'));assert.equal(query('#study-sets-progress').textContent,'0 / 2');assert.equal(query('#study-sets-answer').hidden,true);
  await afterAction(click('#study-sets-reveal'));assert.equal(query('#study-sets-answer').hidden,false);
  assert.equal(document.activeElement.id,'study-sets-flashcard');await afterAction(click('#study-sets-grade-repeat'));
  await afterAction(click('#study-sets-back'));context.words.new={word:'new',ko:'새로운',book:'One',addedAt:8};await afterAction(run('studySetsReadAndRender()'));
  assert.equal(document.querySelector('#study-sets-import'),null);
  assert.equal(document.querySelectorAll('#study-sets-word-list li').length,3);
  await afterAction(click('#study-sets-start'));assert.equal(query('#study-sets-progress').textContent,'0 / 2');
  await afterAction(click('#study-sets-reveal'));await afterAction(click('#study-sets-grade-remembered'));
  assert.equal(query('#study-sets-progress').textContent,'1 / 2');await afterAction(click('#study-sets-reveal'));await afterAction(click('#study-sets-grade-remembered'));
  assert.equal(document.querySelector('#study-sets-repeat-round'),null);
  assert.equal(JSON.stringify(Object.fromEntries(Object.entries(context.words).filter(([key])=>key!=='new'))),source);
  await afterAction(click('#study-sets-back'));await afterAction(click('#study-sets-back'));assert.equal(query('#study-sets-dialog').open,false);
  await afterAction(run('openStudySets()'));assert.equal(document.querySelectorAll('.study-sets-list li').length,1);
});

test('incomplete study resumes, completion has one terminal pair, and leaving preserves completed history',async ()=>{
  const h=harness();await afterAction(h.createSet());
  assert.equal(h.query('#study-sets-start').textContent,'학습');
  assert.equal(h.query('#study-sets-test').textContent,'테스트');
  const words=JSON.stringify(h.context.words);
  await afterAction(h.click('#study-sets-start'));
  await afterAction(h.click('#study-sets-reveal'));await afterAction(h.click('#study-sets-grade-remembered'));
  const partial=h.storage.get('breeze.study-sets.v1');
  await afterAction(h.click('#study-sets-back'));
  assert.equal(h.query('#study-sets-start').textContent,'이어서 학습 · 1/2');
  assert.equal(h.storage.get('breeze.study-sets.v1'),partial);
  await afterAction(h.click('#study-sets-start'));assert.equal(h.query('#study-sets-progress').textContent,'1 / 2');
  await afterAction(h.click('#study-sets-reveal'));await afterAction(h.click('#study-sets-grade-remembered'));
  assert.deepEqual([...h.query('.study-sets-complete').querySelectorAll('button')].filter(b=>!b.hidden).map(b=>b.textContent),['세트로 돌아가기','다시 시작하기']);
  const complete=h.storage.get('breeze.study-sets.v1'),completed=JSON.parse(complete).sets[0].session;
  assert.equal(completed.answers.length,2);
  await afterAction(h.click('#study-sets-complete-back'));
  assert.equal(h.query('#study-sets-start').textContent,'학습');
  await afterAction(h.run('studySetsReadAndRender()'));
  assert.equal(h.storage.get('breeze.study-sets.v1'),complete,'leaving and rereading do not clear completion history');
  await afterAction(h.click('#study-sets-start'));
  assert.equal(h.query('#study-sets-progress').textContent,'0 / 2');
  assert.notEqual(JSON.parse(h.storage.get('breeze.study-sets.v1')).sets[0].session.id,completed.id);
  for(let i=0;i<2;i++){await afterAction(h.click('#study-sets-reveal'));await afterAction(h.click('#study-sets-grade-remembered'));}
  const stale=h.query('#study-sets-restart');stale.click();stale.click();await afterAction();
  const restarted=h.storage.get('breeze.study-sets.v1');await afterAction(stale.click());
  assert.equal(h.storage.get('breeze.study-sets.v1'),restarted,'a detached completion action cannot restart again');
  assert.equal(JSON.stringify(h.context.words),words);
});

test('failed storage keeps answer and form retryable; stale grade events cannot advance twice',async ()=>{
  const {context,query,click,run,storage,createSet}=harness();await afterAction(createSet());await afterAction(click('#study-sets-start'));await afterAction(click('#study-sets-reveal'));
  const before=storage.get('breeze.study-sets.v1'),staleGrade=query('#study-sets-grade-repeat');
  const nativeSet=context.localStorage.setItem;
  context.localStorage.setItem=()=>{throw new Error('Synthetic quota');};await afterAction(click('#study-sets-grade-repeat'));
  assert.equal(query('#study-sets-answer').hidden,false);assert.equal(query('#study-sets-progress').textContent,'0 / 2');
  assert.equal(query('#study-sets-error').hidden,false);assert.equal(storage.get('breeze.study-sets.v1'),before);
  context.localStorage.setItem=nativeSet;await afterAction(click('#study-sets-error button'));assert.equal(query('#study-sets-progress').textContent,'0 / 2');
  await afterAction(staleGrade.click());assert.equal(query('#study-sets-progress').textContent,'0 / 2');assert.equal(query('#study-sets-answer').hidden,true);
  await afterAction(click('#study-sets-back'));await afterAction(run("studySetsGo('rename')"));query('#study-sets-rename-input').value='Keep my input';
  context.localStorage.setItem=()=>{throw new Error('Synthetic quota');};
  await afterAction(query('form').dispatchEvent(new context.window.Event('submit',{cancelable:true})));
  assert.equal(query('#study-sets-rename-input').value,'Keep my input');assert.equal(query('#study-sets-error').hidden,false);
  context.localStorage.setItem=nativeSet;await afterAction(click('#study-sets-error button'));assert.equal(query('#study-sets-title').textContent,'Keep my input');
});

test('directly-added words, exclusion restore, set deletion confirmation and source preservation',async ()=>{
  const {context,document,query,click,run,button,createSet}=harness();await afterAction(createSet('Direct',['']));
  assert.equal(document.querySelectorAll('#study-sets-word-list li').length,1);assert.match(query('#study-sets-word-list').textContent,/direct/);
  await afterAction(click('.study-sets-row-action'));await afterAction(run("studySetsGo('excluded')"));assert.equal(document.querySelectorAll('#study-sets-excluded-list li').length,1);
  await afterAction(click('.study-sets-row-action'));await afterAction(click('#study-sets-back'));assert.equal(document.querySelectorAll('#study-sets-word-list li').length,1);
  const source=JSON.stringify(context.words);await afterAction(run('studySetsToggleEditMenu()'));await afterAction(button('세트 삭제'));await afterAction(button('취소'));assert.equal(query('#study-sets-title').textContent,'Direct');
  await afterAction(run('studySetsToggleEditMenu()'));await afterAction(button('세트 삭제'));await afterAction(button('세트 삭제'));assert.equal(document.querySelectorAll('[data-set-id]').length,0);
  assert.equal(JSON.stringify(context.words),source);assert.equal(document.querySelectorAll('.study-sets-home-card').length,2);
  await afterAction(run('closeStudySets(true)'));assert.equal(await afterAction(run('studySetsIsOpen()')),false);
});

test('horizontal swipe excludes; vertical movement and cancellation keep membership',async ()=>{
  const {document,query,window,createSet}=harness();await afterAction(createSet());
  const pointer=(row,type,x,y)=>{const event=new window.Event(type);Object.assign(event,{timeStamp:0,button:0,pointerId:1,clientX:x,clientY:y});row.dispatchEvent(event);};
  let row=query('#study-sets-word-list li');
  await afterAction(pointer(row,'pointerdown',240,20));await afterAction(pointer(row,'pointermove',230,90));await afterAction(pointer(row,'pointerup',140,100));
  assert.equal(document.querySelectorAll('#study-sets-word-list li').length,2);
  await afterAction(pointer(row,'pointerdown',240,20));await afterAction(pointer(row,'pointermove',130,20));await afterAction(pointer(row,'pointercancel',130,20));await afterAction(pointer(row,'pointerup',130,20));
  assert.equal(document.querySelectorAll('#study-sets-word-list li').length,2);
  await afterAction(pointer(row,'pointerdown',280,20));await afterAction(pointer(row,'pointermove',40,20));await afterAction(pointer(row,'pointerup',40,20));
  assert.equal(document.querySelectorAll('#study-sets-word-list li').length,1);assert.ok(query('.study-sets-undo button'));
});

test('damaged or future study storage is surfaced without replacement',async ()=>{
  for(const raw of ['{','null','{"version":99,"sequence":0,"sets":[]}']){
    const {storage,run,query}=harness();storage.set('breeze.study-sets.v1',raw);await afterAction(run('openStudySets()'));
    assert.equal(query('#study-sets-error').hidden,false);assert.equal(storage.get('breeze.study-sets.v1'),raw);
    await afterAction(query('#study-sets-error button').click());assert.equal(storage.get('breeze.study-sets.v1'),raw);
  }
});


test('history jumps restore the destination page and forward restores modal background',async ()=>{
  const {context,window,query,run}=harness();
  // The real app has this independent navigation owner. The modal may consume
  // only its own one-layer dismissal, never navigation to another app view.
  window.addEventListener('popstate',event=>context.show(event.state?.breeze?event.state.view:'home'));
  const pop=state=>{context.history.state=state;const event=new window.Event('popstate');event.state=state;window.dispatchEvent(event);};
  await afterAction(run('openStudySets()'));const modalState={...context.history.state};
  await afterAction(pop({breeze:true,view:'home'}));
  assert.equal(query('#study-sets-dialog').open,false);assert.equal(context.currentView,'home');
  await afterAction(pop(modalState));assert.equal(context.currentView,'vocab');assert.equal(query('#study-sets-dialog').open,true);
  await afterAction(pop({breeze:true,view:'vocab'}));assert.equal(context.currentView,'vocab');assert.equal(query('#study-sets-dialog').open,false);
});

test('a repeated pointer click after answer reveal is not an assessment',async ()=>{
  const {window,query,click,createSet}=harness();await afterAction(createSet());await afterAction(click('#study-sets-start'));await afterAction(click('#study-sets-reveal'));
  const secondClick=new window.Event('click');secondClick.detail=2;await afterAction(query('#study-sets-grade-repeat').dispatchEvent(secondClick));
  assert.equal(query('#study-sets-progress').textContent,'0 / 2');assert.equal(query('#study-sets-answer').hidden,false);
  await afterAction(click('#study-sets-grade-repeat'));assert.equal(query('#study-sets-progress').textContent,'0 / 2');
});

test('Memory directory keeps all words first, appends sets and add, and enters the unchanged all-word card study',async ()=>{
  const {context,document,query,click,run,createFromHome}=harness();
  context.words.b.root='a';context.words.c.root='a';context.words.unresolved={word:'pending',ko:''};
  await afterAction(run('renderStudySetsHome()'));
  assert.equal(query('#study-sets-all strong').textContent,'전체 단어');
  assert.equal(document.querySelectorAll('.study-sets-home-cards>li').length,2);
  await afterAction(click('#study-sets-all'));assert.equal(context.currentView,'memory-set');assert.equal(!!query('#study-sets-dialog').open,false);await afterAction(click('#study-all-words-start'));assert.equal(context.currentView,'study');await run('closeStudySets(true)');
  await afterAction(createFromHome('시험 준비'));
  const cards=[...document.querySelectorAll('.study-sets-home-card')];
  assert.equal(cards[0].id,'study-sets-all');assert.equal(cards[1].querySelector('strong').textContent,'시험 준비');
  assert.equal(cards[2].id,'study-sets-home-create');assert.match(cards[1].querySelector('.study-sets-home-caption').textContent,/단어 1 · ★ 1 · ★★ 0 · ★★★ 0/);
  assert.equal(cards[1].querySelector('.study-sets-home-badge').textContent,'One');
  assert.equal(cards[0].querySelector('.study-sets-home-badge').textContent,'기본');
  assert.equal(cards[0].querySelector('.study-sets-home-studied'),null);
  assert.equal(cards[1].querySelector('.study-sets-home-studied'),null);
  await afterAction(click('#study-sets-back'));assert.equal(query('#study-sets-dialog').open,false);
  assert.equal(context.currentView,'memory');assert.equal(document.activeElement.id,'study-sets-home-create');
});

test('direct set cards preserve detail, nested Back, updated counts and focus after closing',async ()=>{
  const {context,document,query,click,button,submit,run,createFromHome}=harness();await afterAction(createFromHome());await afterAction(click('#study-sets-close'));
  const card=query('.study-sets-home-card[data-set-id]');card.focus();await afterAction(card.click());
  assert.equal(query('#study-sets-title').textContent,'Exam set');assert.equal(context.history.state.studySetsHome,true);
  assert.equal(context.history.state.studySetsScreen,'detail');assert.equal(document.querySelector('.study-sets-list'),null);
  await afterAction(click('.study-sets-row-action'));assert.match(query('.study-sets-home-card[data-set-id] .study-sets-home-caption').textContent,/단어 1 ·/);
  await afterAction(run("studySetsGo('excluded')"));await afterAction(click('.study-sets-row-action'));await afterAction(click('#study-sets-back'));
  assert.equal(query('#study-sets-title').textContent,'Exam set');assert.match(query('.study-sets-home-card[data-set-id] .study-sets-home-caption').textContent,/단어 2 ·/);
  await afterAction(run('studySetsToggleEditMenu()'));await afterAction(button('이름 변경'));query('#study-sets-rename-input').value='Midterm';await afterAction(submit('form'));
  assert.equal(query('.study-sets-home-card[data-set-id] strong').textContent,'Midterm');
  await afterAction(click('#study-sets-back'));assert.equal(query('#study-sets-dialog').open,false);
  assert.equal(document.activeElement,query('.study-sets-home-card[data-set-id]'));assert.equal(context.currentView,'memory');
});

test('direct creation can cancel to Memory and deleting a set returns to its directory',async ()=>{
  const {context,document,query,click,button,run,createFromHome}=harness();await afterAction(createFromHome());await afterAction(click('#study-sets-close'));
  query('#study-sets-home-create').focus();await afterAction(click('#study-sets-home-create'));await afterAction(click('#study-sets-back'));
  assert.equal(query('#study-sets-dialog').open,false);assert.equal(document.querySelectorAll('.study-sets-home-card[data-set-id]').length,1);
  const card=query('.study-sets-home-card[data-set-id]');card.focus();await afterAction(card.click());
  await afterAction(run('studySetsToggleEditMenu()'));await afterAction(button('세트 삭제'));await afterAction(button('취소'));assert.equal(query('#study-sets-title').textContent,'Exam set');
  await afterAction(run('studySetsToggleEditMenu()'));await afterAction(button('세트 삭제'));await afterAction(button('세트 삭제'));
  assert.equal(query('#study-sets-dialog').open,false);assert.equal(document.querySelectorAll('.study-sets-home-card[data-set-id]').length,0);
  assert.equal(document.activeElement.id,'study-sets-home-create');assert.equal(context.currentView,'memory');
});

test('Back and Forward restore the selected set over Memory including cross-view history jumps',async ()=>{
  const {context,window,query,click,createFromHome}=harness();await afterAction(createFromHome());
  window.addEventListener('popstate',event=>context.show(event.state?.breeze?event.state.view:'home'));
  const pop=state=>{context.history.state=state;const event=new window.Event('popstate');event.state=state;window.dispatchEvent(event);};
  const detailState={...context.history.state};assert.equal(detailState.view,'memory-set');
  await afterAction(click('#study-sets-close'));assert.equal(query('#study-sets-dialog').open,false);
  await afterAction(pop(detailState));assert.equal(context.currentView,'memory-set');assert.equal(query('#study-sets-title').textContent,'Exam set');
  await afterAction(pop({breeze:true,view:'home'}));assert.equal(query('#study-sets-dialog').open,false);assert.equal(context.currentView,'home');
  await afterAction(pop(detailState));assert.equal(context.currentView,'memory-set');assert.equal(query('#study-sets-title').textContent,'Exam set');
  await afterAction(click('#study-sets-back'));assert.equal(query('#study-sets-dialog').open,false);
});

test('directory corruption preserves source access and recovers without mutating saved data',async ()=>{
  const {context,storage,document,query,click,run}=harness();const damaged='{"version":99,"sequence":0,"sets":[]}';
  storage.set('breeze.study-sets.v1',damaged);await afterAction(run('renderStudySetsHome()'));
  assert.ok(query('.study-sets-home-error[role="alert"]'));assert.equal(query('#study-sets-home-create').disabled,true);
  await afterAction(click('.study-sets-home-error button'));assert.equal(storage.get('breeze.study-sets.v1'),damaged);
  await afterAction(click('#study-sets-all'));assert.equal(context.currentView,'memory-set');await afterAction(click('#study-all-words-start'));assert.equal(context.currentView,'study');
  storage.delete('breeze.study-sets.v1');await afterAction(click('.study-sets-home-error button'));
  assert.equal(document.querySelector('.study-sets-home-error'),null);assert.equal(query('#study-sets-home-create').disabled,false);
});

test('storage refresh leaves an in-progress creation form intact and refreshes home set names',async ()=>{
  const {context,document,query,click,run,window,createFromHome}=harness();await afterAction(createFromHome());await afterAction(click('#study-sets-close'));
  await afterAction(click('#study-sets-home-create'));query('#study-sets-name').value='Keep typed Korean 한글';
  await afterAction(run("commitStudySets(BreezeStudySets.rename(readStudySets(),readStudySets().sets[0].id,'Renamed elsewhere',Date.now()).state)"));
  const event=new window.Event('storage');event.key='breeze.study-sets.v1';await afterAction(window.dispatchEvent(event));
  assert.equal(query('#study-sets-name').value,'Keep typed Korean 한글');
  assert.equal(query('.study-sets-home-card[data-set-id] strong').textContent,'Renamed elsewhere');
  assert.equal(document.querySelectorAll('.study-sets-home-card[data-set-id]').length,1);assert.equal(context.currentView,'memory');
});


test('minimal detail shows source metadata without examples after tapping and keeps primary action outside scroll body',async ()=>{
  const {query,document,click,createFromHome}=harness();await afterAction(createFromHome());
  const toggle=query('.vword');
  assert.equal(document.querySelector('.vex'),null);assert.equal(toggle.getAttribute('aria-expanded'),'false');
  await afterAction(toggle.click());assert.ok(query('.vmeta'));assert.equal(document.querySelector('.vex'),null);await afterAction(toggle.click());assert.equal(document.querySelector('.vex'),null);
  assert.ok(query('.chip'));assert.equal(document.querySelector('[contenteditable]'),null);assert.equal(document.querySelector('.rowdel'),null);
  assert.ok(query('.study-sets-footer #study-sets-start'));
  assert.equal(document.querySelector('#study-sets-content #study-sets-start'),null);
  assert.equal(document.querySelector('#study-sets-content #study-sets-import'),null);
  assert.equal(document.querySelector('.study-sets-manage'),null);
});

test('directory cards have no competing long-press, context or keyboard edit menu',async()=>{
  const {query,click,window,context,document,run,createFromHome}=harness();await afterAction(createFromHome());await afterAction(click('#study-sets-close'));
  context.currentView='vocab';await afterAction(run('openStudySetsDirectory()'));const card=query('.study-sets-home-card[data-set-id]');
  const keyboard=new window.Event('keydown',{cancelable:true});keyboard.key='F10';keyboard.shiftKey=true;await afterAction(card.dispatchEvent(keyboard));
  await afterAction(card.dispatchEvent(new window.Event('contextmenu',{cancelable:true})));
  const press=new window.Event('pointerdown');Object.assign(press,{button:0,clientX:20,clientY:20,pointerId:1});await afterAction(card.dispatchEvent(press));
  await new Promise(resolve=>setTimeout(resolve,530));assert.equal(context.history.state.studySetsScreen,'directory');
  assert.equal(document.querySelector('.study-sets-home-menu-trigger'),null);assert.equal(query('#study-sets-edit').hidden,true);
  await afterAction(card.click());assert.equal(query('#study-sets-edit').hidden,false);
});

test('swipe follows the finger, only commits leftward, and clears transform on cancellation',async ()=>{
  const {query,document,window,createFromHome}=harness();await afterAction(createFromHome());
  const pointer=(row,type,x,y)=>{const event=new window.Event(type,{cancelable:true});Object.assign(event,{timeStamp:0,button:0,pointerId:1,clientX:x,clientY:y});row.dispatchEvent(event);};
  const row=query('.study-sets-word-row'),surface=query('.study-sets-word-surface');
  await afterAction(pointer(row,'pointerdown',240,20));await afterAction(pointer(row,'pointermove',210,20));assert.match(surface.style.transform,/-30px/);
  await afterAction(pointer(row,'pointerup',210,20));assert.equal(surface.style.transform,'');assert.equal(document.querySelectorAll('.study-sets-word-row').length,2);
  await afterAction(pointer(row,'pointerdown',240,20));await afterAction(pointer(row,'pointermove',300,20));await afterAction(pointer(row,'pointerup',350,20));assert.equal(document.querySelectorAll('.study-sets-word-row').length,2);
  await afterAction(pointer(row,'pointerdown',240,20));await afterAction(pointer(row,'pointermove',130,20));await afterAction(pointer(row,'pointercancel',130,20));assert.equal(surface.style.transform,'');
});


test('reference swipe parks its circular action, grows a capsule, and closes on another row or outside tap',async ()=>{
  const {document,query,window,createFromHome}=harness();await afterAction(createFromHome());
  const pointer=(row,type,x,y=20)=>{const event=new window.Event(type,{cancelable:true,bubbles:true});Object.assign(event,{timeStamp:0,button:0,pointerId:1,clientX:x,clientY:y});row.dispatchEvent(event);};
  const rows=[...document.querySelectorAll('.study-sets-word-row')],row=rows[0],surface=row.querySelector('.study-sets-word-surface'),action=row.querySelector('.study-sets-row-action');
  await afterAction(pointer(row,'pointerdown',280));await afterAction(pointer(row,'pointermove',220));await afterAction(pointer(row,'pointerup',220));
  assert.equal(surface.style.transform,'translate3d(-72px,0,0)');assert.equal(action.style.width,'44px');assert.equal(rows.length,2);
  await afterAction(pointer(rows[1],'pointerdown',280));assert.equal(surface.style.transform,'');await afterAction(pointer(rows[1],'pointercancel',280));
  await afterAction(pointer(row,'pointerdown',280));await afterAction(pointer(row,'pointermove',220));await afterAction(pointer(row,'pointerup',220));
  await afterAction(pointer(document.body,'pointerdown',0));assert.equal(surface.style.transform,'');
  await afterAction(pointer(row,'pointerdown',280));await afterAction(pointer(row,'pointermove',180));assert.equal(action.style.width,'72px');assert.equal(action.style.transform,'');
  await afterAction(pointer(row,'pointercancel',180));assert.equal(surface.style.transform,'');
  await afterAction(pointer(row,'pointerdown',280));await afterAction(pointer(row,'pointermove',220));await afterAction(pointer(row,'pointerup',220));await afterAction(action.click());
  assert.equal(document.querySelectorAll('.study-sets-word-row').length,1);await afterAction(query('.study-sets-undo button').click());assert.equal(document.querySelectorAll('.study-sets-word-row').length,2);
});

test('failed full swipe resets visual state and retry excludes exactly once',async ()=>{
  const {context,document,query,window,storage,createFromHome}=harness();await afterAction(createFromHome());
  const row=query('.study-sets-word-row'),surface=query('.study-sets-word-surface'),before=storage.get('breeze.study-sets.v1'),nativeSet=context.localStorage.setItem;
  const pointer=(type,x)=>{const event=new window.Event(type,{cancelable:true});Object.assign(event,{timeStamp:0,button:0,pointerId:1,clientX:x,clientY:20});row.dispatchEvent(event);};
  context.localStorage.setItem=()=>{throw new Error('Synthetic quota');};
  await afterAction(pointer('pointerdown',280));await afterAction(pointer('pointermove',20));await afterAction(pointer('pointerup',20));
  assert.equal(surface.style.transform,'');assert.equal(storage.get('breeze.study-sets.v1'),before);assert.equal(document.querySelectorAll('.study-sets-word-row').length,2);
  context.localStorage.setItem=nativeSet;await afterAction(query('#study-sets-error button').click());assert.equal(document.querySelectorAll('.study-sets-word-row').length,1);
});


test('finishing a committed row animation preserves a later failed row retry',async()=>{
  const {context,document,query,createFromHome}=harness();await afterAction(createFromHome());
  const rows=[...document.querySelectorAll('.study-sets-word-row')],first=rows[0],surface=first.querySelector('.study-sets-word-surface');
  let finishExit,finishCollapse;
  const exit=new Promise(resolve=>{finishExit=resolve;}),collapse=new Promise(resolve=>{finishCollapse=resolve;});
  first.getBoundingClientRect=()=>({width:320,height:62});first.animate=()=>({finished:collapse});surface.animate=()=>({finished:exit});
  await afterAction(first.querySelector('.study-sets-row-action').click());assert.equal(first.classList.contains('study-sets-exiting'),true);
  const nativeSet=context.localStorage.setItem;context.localStorage.setItem=()=>{throw new Error('Synthetic quota');};
  await afterAction(rows[1].querySelector('.study-sets-row-action').click());assert.equal(query('#study-sets-error').hidden,false);
  finishExit();await new Promise(resolve=>setImmediate(resolve));finishCollapse();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(document.querySelectorAll('.study-sets-word-row').length,1);assert.equal(query('#study-sets-error').hidden,false);
  context.localStorage.setItem=nativeSet;await afterAction(query('#study-sets-error button').click());assert.equal(document.querySelectorAll('.study-sets-word-row').length,0);
});


test('a second row keeps pointer ownership while the first committed row collapses',async()=>{
  const {document,query,window,createFromHome}=harness();await afterAction(createFromHome());
  const rows=[...document.querySelectorAll('.study-sets-word-row')],first=rows[0],second=rows[1];
  let finishExit,finishCollapse;const exit=new Promise(resolve=>{finishExit=resolve;}),collapse=new Promise(resolve=>{finishCollapse=resolve;});
  first.getBoundingClientRect=()=>({width:320,height:62});first.animate=()=>({finished:collapse});first.querySelector('.study-sets-word-surface').animate=()=>({finished:exit});
  await afterAction(first.querySelector('.study-sets-row-action').click());
  const pointer=(type,x)=>{const event=new window.Event(type,{cancelable:true});Object.assign(event,{timeStamp:0,button:0,pointerId:2,clientX:x,clientY:20});second.dispatchEvent(event);};
  await afterAction(pointer('pointerdown',280));await afterAction(pointer('pointermove',190));
  finishExit();await new Promise(resolve=>setImmediate(resolve));finishCollapse();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(second.isConnected,true);assert.equal(second.classList.contains('study-sets-dragging'),true);
  assert.equal(second.querySelector('.study-sets-word-surface').style.transform,'translate3d(-90px,0,0)');
  await afterAction(pointer('pointermove',20));await afterAction(pointer('pointerup',20));assert.equal(document.querySelectorAll('.study-sets-word-row').length,0);assert.ok(query('.study-sets-undo button'));
});


test('set detail and study are real pages with no modal close control and return home with scroll intact',async ()=>{
  const {context,window,document,query,click,run,createFromHome}=harness();
  window.scrollY=420;let restored=-1;window.scrollTo=(x,y)=>{restored=y;};
  await afterAction(createFromHome());assert.equal(context.currentView,'memory-set');assert.equal(query('#study-sets-dialog').open,false);
  assert.equal(query('#v-memory-set').contains(query('#study-sets-content')),true);assert.equal(query('#study-sets-close').hidden,true);
  assert.deepEqual([...document.querySelectorAll('.study-sets-number')].map(node=>node.textContent),['1','2']);
  await afterAction(click('.study-sets-row-action'));assert.deepEqual([...document.querySelectorAll('.study-sets-number')].map(node=>node.textContent),['1']);
  await afterAction(click('.study-sets-undo button'));assert.deepEqual([...document.querySelectorAll('.study-sets-number')].map(node=>node.textContent),['1','2']);
  await afterAction(click('#study-sets-start'));assert.equal(context.history.state.studySetsScreen,'study');assert.equal(context.currentView,'memory-set');assert.equal(query('#study-sets-dialog').open,false);
  await afterAction(context.history.back());assert.equal(context.history.state.studySetsScreen,'detail');assert.ok(query('#study-sets-word-list'));
  await afterAction(click('#study-sets-back'));assert.equal(context.currentView,'memory');assert.equal(await afterAction(run('studySetsIsOpen()')),false);assert.equal(restored,420);assert.equal(document.activeElement.id,'study-sets-home-create');
});

test('shared vocabulary status chip changes only snapshot status and retains expanded source metadata',async ()=>{
  const {context,document,query,run,createFromHome}=harness();await afterAction(createFromHome());
  const source=JSON.stringify(context.words);await afterAction(query('.vword').click());assert.ok(query('.vmeta'));assert.equal(document.querySelector('.vex'),null);
  await afterAction(query('.chip').click());assert.equal(query('.chip').textContent,'★★');assert.ok(query('.vmeta'));assert.equal(document.querySelector('.vex'),null);
  assert.equal(await afterAction(run('readStudySets().sets[0].cards[0].status')),2);assert.equal(JSON.stringify(context.words),source);
  assert.equal(document.querySelector('[contenteditable]'),null);assert.equal(document.querySelector('.rowdel'),null);
  await afterAction(run('studySetsReadAndRender(false)'));assert.equal(query('.chip').getAttribute('aria-label'),'quiet 별점 2개');
});


test('older page history retains its own home scroll and restarting study does not stack frames',async ()=>{
  const {context,window,query,click,run,createFromHome}=harness();window.scrollY=360;let restored=-1;window.scrollTo=(x,y)=>{restored=y;};
  await afterAction(createFromHome());const firstPage={...context.history.state};assert.equal(firstPage.studySetsHomeScroll,360);
  await afterAction(click('#study-sets-start'));await afterAction(run('studySetsStart(studySetsUI.setId,true)'));await afterAction(context.history.back());assert.equal(context.history.state.studySetsScreen,'detail');
  await afterAction(click('#study-sets-back'));window.scrollY=70;await afterAction(query('.study-sets-home-card[data-set-id]').click());assert.equal(context.history.state.studySetsHomeScroll,70);
  const event=new window.Event('popstate');context.history.state=firstPage;event.state=firstPage;await afterAction(window.dispatchEvent(event));
  const home=new window.Event('popstate');home.state={breeze:true,view:'memory'};context.history.state=home.state;await afterAction(window.dispatchEvent(home));
  assert.equal(restored,360);assert.equal(context.currentView,'memory');
});


test('bottom study entry keeps its directory sheet over vocabulary and all-word cards return to that sheet',async ()=>{
  const {context,window,document,query,run}=harness();let restored=-1;window.scrollY=250;window.scrollTo=(x,y)=>{restored=y;};
  context.show=(view,options={})=>{context.currentView=view;if(!options.fromHistory){if(options.replace)context.history.replaceState({breeze:true,view});else context.history.pushState({breeze:true,view});}if(options.fromHistory&&view==='vocab')window.scrollTo(0,context.history.state.studySetsVocabScroll||0);};
  window.addEventListener('popstate',event=>context.show(event.state.view,{fromHistory:true}));
  const button=document.createElement('button');button.id='wordbook-review';document.body.append(button);
  const review=readFileSync(new URL('../scripts/ui/vocabulary-review.js',import.meta.url),'utf8');
  vm.runInContext(review.slice(review.indexOf('function closeVocabularyReview(){'),review.indexOf("document.getElementById('review-close').addEventListener")),context);
  await afterAction(run('openStudySetsDirectory()'));assert.equal(context.currentView,'vocab');assert.equal(context.history.state.studySetsScreen,'directory');assert.equal(query('#study-sets-dialog').open,true);
  query('#study-sets-content').scrollTop=70;await afterAction(query('#study-sets-all').click());assert.equal(context.currentView,'memory-set');await afterAction(query('#study-all-words-start').click());assert.equal(context.currentView,'study');assert.equal(context.history.state.studySetsAllWords,true);
  await afterAction(run('closeVocabularyReview()'));assert.equal(context.currentView,'memory-set');await afterAction(query('#study-sets-back').click());assert.equal(context.currentView,'vocab');assert.equal(query('#study-sets-dialog').open,true);assert.equal(query('#study-sets-content').scrollTop,70);
  await afterAction(run('closeStudySetsDirectory()'));assert.equal(context.currentView,'vocab');assert.equal(query('#study-sets-dialog').open,false);assert.equal(restored,250);
  context.openVocabularyReview();await afterAction(run('closeVocabularyReview()'));assert.equal(context.currentView,'vocab');assert.equal(document.activeElement.id,'wordbook-review');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/id="wordbook-review"[^>]*onclick="show\('memory'\)">학습하기/);
  assert.equal(html.includes('id="btn-export"'),false);
  assert.equal(html.includes('id="wordbook-sets-back"'),false);assert.equal(html.includes('id="wordbook-study-sets-entry"'),false);
});

test('a drag beginning on the status chip neither rates nor owns the row swipe',async ()=>{
  const {document,query,window,createFromHome}=harness();await afterAction(createFromHome());
  const row=query('.study-sets-word-row'),chip=query('.chip');
  const pointer=(target,type,x)=>{const event=new window.Event(type,{cancelable:true,bubbles:true});Object.assign(event,{timeStamp:0,button:0,pointerId:3,clientX:x,clientY:20});target.dispatchEvent(event);};
  await afterAction(pointer(chip,'pointerdown',280));await afterAction(pointer(row,'pointermove',80));await afterAction(pointer(row,'pointerup',80));
  assert.equal(query('.study-sets-word-surface').style.transform,undefined);assert.equal(chip.textContent,'★');assert.equal(document.querySelectorAll('.study-sets-word-row').length,2);
});


test('rating rerender retains chip focus without revealing exclusion; removed rows focus the next word',async ()=>{
  const {document,query,createFromHome}=harness();await afterAction(createFromHome());
  const chip=query('.chip');chip.focus();await afterAction(chip.click());
  assert.equal(document.activeElement===query('.chip'),true);assert.equal(query('.chip').textContent,'★★');
  assert.equal(document.querySelector('.study-sets-revealed'),null);
  const action=query('.study-sets-row-action');action.focus();await afterAction(action.click());
  assert.equal(document.activeElement===query('.vword'),true);assert.equal(document.querySelector('.study-sets-revealed'),null);
});


test('swipe rows cancel native text selection and drag without claiming original vocabulary or pointer scrolling',async ()=>{
  const {document,query,window,createFromHome}=harness();await afterAction(createFromHome());
  const meaning=query('#study-sets-word-list .vko');
  for(const type of ['selectstart','dragstart']){
    const event=new window.Event(type,{cancelable:true,bubbles:true});await afterAction(meaning.dispatchEvent(event));assert.equal(event.defaultPrevented,true);
  }
  const original=document.createElement('div');original.className='vko';document.body.append(original);
  for(const type of ['selectstart','dragstart']){
    const event=new window.Event(type,{cancelable:true,bubbles:true});await afterAction(original.dispatchEvent(event));assert.equal(event.defaultPrevented,false);
  }
  const down=new window.Event('pointerdown',{cancelable:true,bubbles:true});Object.assign(down,{button:0,pointerId:7,clientX:200,clientY:20});await afterAction(meaning.dispatchEvent(down));assert.equal(down.defaultPrevented,false);
  const vertical=new window.Event('pointermove',{cancelable:true,bubbles:true});Object.assign(vertical,{pointerId:7,clientX:200,clientY:70});await afterAction(meaning.dispatchEvent(vertical));assert.equal(vertical.defaultPrevented,false);
  assert.equal(document.querySelectorAll('.study-sets-word-row').length,2);
});


test('content rerenders spend no history writes; screen transitions update route once',async ()=>{
  const {context,query,click,run,createFromHome}=harness();await afterAction(createFromHome());
  const replace=context.history.replaceState,push=context.history.pushState;let replacements=0,pushes=0;
  context.history.replaceState=function(value){replacements++;return replace.call(this,value);};
  context.history.pushState=function(value){pushes++;return push.call(this,value);};
  const route=JSON.stringify(context.history.state);
  for(let index=0;index<30;index++){await afterAction(query('.chip').click());await afterAction(run('studySetsReadAndRender(false)'));}
  assert.equal(replacements,0);assert.equal(pushes,0);assert.equal(JSON.stringify(context.history.state),route);
  await afterAction(click('#study-sets-start'));assert.equal(pushes,1);assert.equal(replacements,0);assert.equal(context.history.state.studySetsScreen,'study');
  await afterAction(click('#study-sets-reveal'));await afterAction(click('#study-sets-grade-remembered'));await afterAction(click('#study-sets-reveal'));await afterAction(click('#study-sets-grade-repeat'));
  assert.equal(replacements,0);assert.equal(pushes,1);
  await afterAction(click('#study-sets-back'));assert.equal(context.history.state.studySetsScreen,'detail');assert.equal(replacements,0);
  await afterAction(run('studySetsToggleEditMenu()'));assert.equal(replacements,0);assert.equal(context.history.state.studySetsScreen,'detail');assert.equal(context.history.state.view,'memory-set');
  await afterAction(run('studySetsReadAndRender(false)'));assert.equal(replacements,0);
  await afterAction(run("studySetsGo('rename')"));assert.equal(replacements,1);assert.equal(context.history.state.studySetsScreen,'rename');
});


test('ordinal uses a separate clipped leading gutter without becoming a fourth vocabulary column',async ()=>{
  const {document,query,createFromHome}=harness();await afterAction(createFromHome());
  const row=query('.study-sets-word-row'),clip=query('.study-sets-word-clip'),surface=query('.study-sets-word-surface');
  assert.equal(row.firstElementChild,clip);assert.equal(surface.parentElement,clip);assert.equal(query('.study-sets-row-action').parentElement,clip);
  assert.equal(query('.vordinal').parentElement,query('.vrow'));
  const shared=readFileSync(new URL('../styles/wordbook.css',import.meta.url),'utf8');
  assert.match(shared,/\.vrow\.vrow-numbered\{position:relative;\}/);assert.doesNotMatch(shared,/vrow-numbered\{[^}]*grid-template-columns/);
  const style=readFileSync(new URL('../styles/study-sets.css',import.meta.url),'utf8');
  assert.match(style,/#v-memory-set \.study-sets-body\{flex:1;padding:8px 20px 24px;/);
  assert.match(style,/study-sets-word-clip\{[^}]*margin-left:-20px;[^}]*width:calc\(100% \+ 20px\)/);
});

test('vocabulary share is the first set-menu action and add stays in the bottom dock',async ()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),{document}=parseHTML(html).window;
  const header=document.querySelector('#v-memory .memory-home-header'),dock=document.querySelector('#wordbook-controls .control-bar'),memoryDock=document.querySelector('#memory-home-controls .control-bar');
  assert.equal(header.querySelector('#btn-export'),null);assert.equal(header.querySelector('#wordbook-add,#memory-add'),null);
  assert.deepEqual([...dock.querySelectorAll('button')].map(button=>button.id),['wordbook-home','wordbook-review','wordbook-add']);
  assert.deepEqual([...memoryDock.querySelectorAll('button')].map(button=>button.id),['memory-home','memory-last-set','memory-add']);
  const add=document.getElementById('wordbook-add');
  assert.equal(add.getAttribute('onclick'),'openWordbookAdd()');assert.equal(add.getAttribute('aria-label'),'단어 추가');assert.equal(add.classList.contains('control-circle'),true);
  assert.equal(document.querySelectorAll('#btn-export').length,0);assert.equal(document.querySelectorAll('#wordbook-add').length,1);
  const dictionary=readFileSync(new URL('../scripts/dictionary/dictionary.js',import.meta.url),'utf8');
  assert.match(dictionary,/function vocabularyCsv\(list\)/);assert.match(dictionary,/function deliverVocabularyCsv\(csv\)/);
  assert.doesNotMatch(dictionary,/getElementById\('btn-export'\)/);
  const sets=readFileSync(new URL('../scripts/ui/study-sets.js',import.meta.url),'utf8');
  assert.match(sets,/dataset\.action='share'/);assert.match(sets,/deliverVocabularyCsv\(vocabularyCsv\(list\)\)/);
});

test('directory, create, cancel and save reuse one continuously open native sheet',async ()=>{
  const {context,document,window,query,click,submit,run}=harness();await afterAction(run('openStudySetsDirectory()'));
  const dialog=query('#study-sets-dialog');let closes=0;dialog.addEventListener('close',()=>{closes++;});
  const choose=()=>{query('#study-sets-name').value='Sheet created';const checkbox=query('.study-sets-book input');checkbox.checked=true;checkbox.dispatchEvent(new window.Event('change'));};
  await afterAction(click('#study-sets-home-create'));assert.equal(context.currentView,'vocab');assert.equal(context.history.state.studySetsScreen,'create');assert.equal(context.history.state.studySetsDirectoryDepth,1);
  await afterAction(click('#study-sets-back'));assert.equal(context.history.state.studySetsScreen,'directory');assert.equal(document.activeElement.id,'study-sets-home-create');
  await afterAction(context.history.forward());assert.equal(context.history.state.studySetsScreen,'create');
  await afterAction(dialog.dispatchEvent(new window.Event('cancel',{cancelable:true})));assert.equal(context.history.state.studySetsScreen,'directory');
  await afterAction(click('#study-sets-home-create'));choose();await afterAction(submit('#study-sets-create-form'));
  assert.equal(context.history.state.studySetsScreen,'directory');assert.equal(context.history.state.studySetsDirectoryDepth,0);assert.equal(context.currentView,'vocab');
  assert.equal(query('#study-sets-dialog')===dialog,true);assert.equal(dialog.open,true);assert.equal(closes,0);assert.equal(document.querySelectorAll('#study-sets-dialog').length,1);
  assert.equal(query('.study-sets-home-card[data-set-id] strong').textContent,'Sheet created');assert.equal(document.activeElement===query('.study-sets-home-card[data-set-id]'),true);
  await afterAction(click('#study-sets-home-create'));choose();await afterAction(click('#study-sets-close'));assert.equal(dialog.open,false);assert.equal(context.currentView,'vocab');assert.equal(document.querySelectorAll('.study-sets-home-card[data-set-id]').length,1);
});

test('custom page and its study Back reopen the directory sheet at its scroll and selected card',async ()=>{
  const {context,document,window,query,click,run,createFromHome}=harness();await afterAction(createFromHome());await afterAction(click('#study-sets-close'));context.currentView='vocab';await afterAction(run('openStudySetsDirectory()'));
  const list=query('#study-sets-content');list.scrollTop=185;await afterAction(list.dispatchEvent(new window.Event('scroll')));
  const card=query('.study-sets-home-card[data-set-id]'),id=card.dataset.setId;await afterAction(card.click());assert.equal(context.currentView,'memory-set');assert.equal(query('#study-sets-dialog').open,false);
  await afterAction(click('#study-sets-start'));assert.equal(context.history.state.studySetsDirectoryDepth,2);await afterAction(context.history.back());assert.equal(context.history.state.studySetsScreen,'detail');
  await afterAction(click('#study-sets-back'));assert.equal(context.currentView,'vocab');assert.equal(query('#study-sets-dialog').open,true);assert.equal(context.history.state.studySetsScreen,'directory');assert.equal(query('#study-sets-content').scrollTop,185);
  assert.equal(document.activeElement.getAttribute('data-set-id'),id);
  await afterAction(context.history.forward());assert.equal(context.history.state.studySetsScreen,'detail');await afterAction(context.history.back());assert.equal(query('#study-sets-dialog').open,true);
});

test('detail editing returns to detail and confirmed deletion preserves source vocabulary',async ()=>{
  const {context,query,click,submit,button,run,createFromHome}=harness();await afterAction(createFromHome());await afterAction(click('#study-sets-close'));context.currentView='vocab';await afterAction(run('openStudySetsDirectory()'));
  await afterAction(click('.study-sets-home-card[data-set-id]'));const source=JSON.stringify(context.words);assert.equal(context.history.state.studySetsDirectoryDepth,1);
  await afterAction(click('#study-sets-edit'));await afterAction(button('이름 변경'));assert.equal(context.history.state.studySetsDirectoryDepth,2);query('#study-sets-rename-input').value='Renamed in detail';await afterAction(submit('form'));
  assert.equal(context.history.state.studySetsScreen,'detail');assert.equal(context.history.state.studySetsDirectoryDepth,1);assert.equal(context.currentView,'memory-set');
  await afterAction(click('#study-sets-edit'));await afterAction(button('세트 삭제'));await afterAction(button('취소'));assert.equal(context.history.state.studySetsScreen,'detail');
  await afterAction(click('#study-sets-edit'));await afterAction(button('세트 삭제'));await afterAction(button('세트 삭제'));assert.equal(context.history.state.studySetsScreen,'directory');assert.equal(context.history.state.studySetsDirectoryDepth,0);assert.equal(JSON.stringify(context.words),source);
  await afterAction(context.history.forward());assert.equal(context.history.state.studySetsScreen,'directory');assert.ok(query('#study-sets-all'));assert.ok(query('#study-sets-home-create'));
});

test('global history dispatch preserves the study-set surface for its owning handler',async ()=>{
  const source=readFileSync(new URL('../scripts/core/state.js',import.meta.url),'utf8');
  const start=source.indexOf("window.addEventListener('popstate',event=>{");
  const end=source.indexOf("\n});",start)+4;
  let handler;const calls=[];
  const context={window:{addEventListener:(_type,fn)=>{handler=fn;}},document:{getElementById:()=>null},show:(...args)=>calls.push(args)};
  vm.runInNewContext(source.slice(start,end),context);
  handler({state:{breeze:true,view:'vocab',studySets:'same-sheet'}});
  assert.equal(calls[0][0],'vocab');assert.equal(calls[0][1].studySetsTransition,true);
  handler({state:{breeze:true,view:'home'}});
  assert.equal(calls[1][0],'home');assert.equal(calls[1][1].studySetsTransition,false);
});


test('Undo is available at commit and keeps its pointer target through row collapse',async()=>{
  const {context,document,query,createFromHome}=harness();await afterAction(createFromHome());
  const first=query('.study-sets-word-row');let finishExit,finishCollapse;
  first.getBoundingClientRect=()=>({width:320,height:62});
  first.querySelector('.study-sets-word-surface').animate=()=>({finished:new Promise(resolve=>{finishExit=resolve;})});
  first.animate=()=>({finished:new Promise(resolve=>{finishCollapse=resolve;})});
  await afterAction(first.querySelector('.study-sets-row-action').click());
  const undo=query('.study-sets-undo button');assert.equal(first.isConnected,true);
  assert.equal(context.readStudySets().sets[0].excludedIds.length,1);
  finishExit();await new Promise(resolve=>setImmediate(resolve));finishCollapse();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(query('.study-sets-undo button'),undo,'collapse must not replace the active touch target');
  await afterAction(undo.click());assert.equal(context.readStudySets().sets[0].excludedIds.length,0);
  assert.equal(document.querySelectorAll('.study-sets-word-row').length,2);
});

test('Undo during row exit restores membership and obsolete animation cannot remove the restored row',async()=>{
  const {context,document,query,createFromHome}=harness();await afterAction(createFromHome());
  const first=query('.study-sets-word-row');let finishExit;
  first.getBoundingClientRect=()=>({width:320,height:62});
  first.querySelector('.study-sets-word-surface').animate=()=>({finished:new Promise(resolve=>{finishExit=resolve;})});
  first.animate=()=>({finished:Promise.resolve()});
  await afterAction(first.querySelector('.study-sets-row-action').click());await afterAction(query('.study-sets-undo button').click());
  assert.equal(first.isConnected,false);assert.equal(context.readStudySets().sets[0].excludedIds.length,0);
  finishExit();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(document.querySelectorAll('.study-sets-word-row').length,2);
  assert.equal(document.querySelectorAll('.study-sets-exiting').length,0);
});


test('detail adopts a new book word once without restoring exclusions or changing the active round',async ()=>{
  const {context,document,query,click,run,createSet}=harness();await afterAction(createSet());await afterAction(click('#study-sets-start'));await afterAction(click('#study-sets-back'));
  await afterAction(click('.study-sets-row-action'));const excluded=JSON.stringify(context.readStudySets().sets[0].excludedIds);
  const frozen=JSON.stringify(context.readStudySets().sets[0].session);
  context.words.fresh={word:'fresh',ko:'새로운',book:'One',example:'A fresh start.',addedAt:30};
  const source=JSON.stringify(context.words);await afterAction(run('studySetsReadAndRender(false)'));
  await afterAction(run('studySetsReadAndRender(false)'));
  const set=context.readStudySets().sets[0];assert.equal(set.cards.length,3);assert.equal(new Set(set.cards.map(c=>c.id)).size,3);
  assert.equal(JSON.stringify(set.excludedIds),excluded);assert.equal(JSON.stringify(set.session),frozen);assert.equal(JSON.stringify(context.words),source);
  assert.equal(document.querySelector('#study-sets-import'),null);assert.equal(query('#study-sets-start').closest('.study-sets-footer')?.contains(query('#study-sets-start')),true);
  await afterAction(run('studySetsToggleEditMenu()'));
  assert.equal(document.querySelector('.study-sets-menu #study-sets-import'),null);
  assert.deepEqual([...document.querySelectorAll('.study-sets-edit-menu button')].map(n=>n.textContent),['공유','이름 변경','책 추가','세트 삭제']);
});

test('a save while the set is open appears in the list and leaves the current round unchanged',async ()=>{
  const {context,document,query,click,run,createSet}=harness();await afterAction(createSet());
  assert.equal(document.querySelectorAll('#study-sets-word-list li').length,2);
  context.words.live={word:'live',ko:'바로',book:'One',addedAt:9};
  await afterAction(run('scheduleStudySetsVocabularySync()'));
  assert.equal(document.querySelector('#study-sets-import'),null);
  assert.equal([...document.querySelectorAll('#study-sets-word-list .vword')].some(node=>node.textContent==='live'),true);
  await afterAction(click('#study-sets-start'));assert.equal(query('#study-sets-progress').textContent,'0 / 3');
  context.words.during={word:'during',ko:'도중',book:'One',addedAt:10};
  delete context.words.live;
  await afterAction(run('scheduleStudySetsVocabularySync()'));
  assert.equal(query('#study-sets-progress').textContent,'0 / 3');
  assert.equal(query('#study-sets-expression').textContent!=='during',true);
  await afterAction(click('#study-sets-back'));
  const labels=[...document.querySelectorAll('#study-sets-word-list .vword')].map(node=>node.textContent);
  assert.equal(labels.includes('during'),true);assert.equal(labels.includes('live'),true,'a deleted word stays until this round ends');
});

test('create quota failure preserves prior bytes and retries once; selection order is stable by card count',async ()=>{
  const h=harness(),{context,storage,run,query,click,document,submit}=h;
  await afterAction(h.createSet('Existing'));await afterAction(run("studySetsGo('create')"));
  assert.deepEqual([...document.querySelectorAll('.study-sets-book input')].map(node=>node.value),['Two','One','']);
  assert.equal(query('#study-sets-save').disabled,true);
  const checkbox=query('.study-sets-book input');checkbox.checked=true;await afterAction(checkbox.dispatchEvent(new context.window.Event('change')));
  assert.equal(query('#study-sets-save').disabled,false);checkbox.checked=false;await afterAction(checkbox.dispatchEvent(new context.window.Event('change')));assert.equal(query('#study-sets-save').disabled,true);
  checkbox.checked=true;await afterAction(checkbox.dispatchEvent(new context.window.Event('change')));query('#study-sets-name').value='New';
  const before=storage.get('breeze.study-sets.v1'),write=context.localStorage.setItem;
  const error=new Error('Synthetic quota');error.name='QuotaExceededError';context.localStorage.setItem=()=>{throw error;};await afterAction(submit('#study-sets-create-form'));
  assert.equal(storage.get('breeze.study-sets.v1'),before);assert.equal(await afterAction(run('studySetsUI.lastError')),error);assert.equal(await afterAction(run('studySetsUI.diagnostic.phase')),'commit');assert.equal(await afterAction(run('studySetsUI.diagnostic.committed')),false);
  context.localStorage.setItem=write;await afterAction(click('#study-sets-error button'));assert.equal(JSON.parse(storage.get('breeze.study-sets.v1')).sets.length,2);
});

test('post-commit create render failure retries display without creating another set',async ()=>{
  const h=harness();const render=h.context.renderStudySets;const error=new Error('Synthetic display');
  await afterAction(h.run('openStudySets()'));await afterAction(h.click('#study-sets-create'));h.query('#study-sets-name').value='Three';
  h.context.words.e={word:'third',ko:'셋째',book:'Two',addedAt:5};
  for(const checkbox of h.document.querySelectorAll('.study-sets-book input'))if(['One','Two'].includes(checkbox.value)){checkbox.checked=true;await afterAction(checkbox.dispatchEvent(new h.window.Event('change')));}
  const staleForm=h.query('#study-sets-create-form');h.context.renderStudySets=()=>{throw error;};await afterAction(h.submit('#study-sets-create-form'));await afterAction(staleForm.dispatchEvent(new h.window.Event('submit',{cancelable:true})));
  const before=h.storage.get('breeze.study-sets.v1');assert.equal(JSON.parse(before).sets.length,1);assert.equal(await afterAction(h.run('studySetsUI.lastError')),error);assert.equal(await afterAction(h.run('studySetsUI.diagnostic.committed')),true);
  h.context.renderStudySets=render;await afterAction(h.click('#study-sets-error button'));assert.equal(h.storage.get('breeze.study-sets.v1'),before);await afterAction(h.click('#study-sets-start'));assert.equal(h.query('#study-sets-progress').textContent,'0 / 3');
  await afterAction(h.click('#study-sets-back'));await afterAction(h.run('studySetsReadAndRender()'));await afterAction(h.click('#study-sets-start'));assert.equal(h.query('#study-sets-progress').textContent,'0 / 3');
});

test('post-commit start history failure retries the committed session without another start',async ()=>{
  const h=harness();await afterAction(h.createSet());const push=h.context.history.pushState,error=new Error('Synthetic history');h.context.history.pushState=()=>{throw error;};
  await afterAction(h.click('#study-sets-start'));const before=h.storage.get('breeze.study-sets.v1');assert.ok(JSON.parse(before).sets[0].session);assert.equal(await afterAction(h.run('studySetsUI.diagnostic.phase')),'navigation');assert.equal(await afterAction(h.run('studySetsUI.lastError.stack')),error.stack);
  h.context.history.pushState=push;await afterAction(h.click('#study-sets-error button'));assert.equal(h.storage.get('breeze.study-sets.v1'),before);assert.equal(h.query('#study-sets-progress').textContent,'0 / 2');
});


test('release velocity follows the final turn even when the complete reversal fits inside70ms',()=>{
  const {run}=harness();
  const right=run('studyReleaseVelocity([{x:0,t:0},{x:-80,t:15},{x:-210,t:30},{x:-140,t:45},{x:-90,t:60}],61)');
  const left=run('studyReleaseVelocity([{x:0,t:0},{x:80,t:15},{x:210,t:30},{x:140,t:45},{x:90,t:60}],61)');
  assert.equal(right,4);assert.equal(left,-4);
  assert.equal(run('studyReleaseVelocity([{x:0,t:0},{x:50,t:25},{x:100,t:50}],51)'),2);
  assert.equal(run('studyReleaseVelocity([{x:0,t:0},{x:50,t:25},{x:100,t:50}],131)'),0,'held release has no stale velocity');
  assert.equal(run('studyReleaseVelocity([{x:0,t:0},{x:50,t:0}],0)'),0,'zero-time fixture cannot invent infinite velocity');
});

test('multi-meaning list actions cover one representative and every saved member without source edits',async()=>{
  const h=harness();h.context.words.c.word='quiet';h.context.words.c.example='The forest was quiet after the storm.';
  const before=JSON.stringify(h.context.words);await afterAction(h.createSet('All meanings'));
  assert.equal(h.document.querySelectorAll('#study-sets-word-list li').length,1);
  assert.equal(h.context.readStudySets().sets[0].cards.length,2);
  assert.match(h.query('#study-sets-word-list').textContent,/조용한/);assert.match(h.query('#study-sets-word-list').textContent,/고요한/);
  await afterAction(h.click('.chip'));assert.deepEqual([...h.context.readStudySets().sets[0].cards].map(card=>card.status),[2,1],'group chip changes its representative star, preserving other saved stars');
  await afterAction(h.click('.study-sets-row-action'));assert.equal(h.document.querySelectorAll('#study-sets-word-list li').length,0);assert.equal(h.context.readStudySets().sets[0].excludedIds.length,2);
  await afterAction(h.click('.study-sets-undo button'));assert.equal(h.document.querySelectorAll('#study-sets-word-list li').length,1);assert.equal(h.context.readStudySets().sets[0].excludedIds.length,0);
  assert.equal(JSON.stringify(h.context.words),before);
});

test('multi-meaning recall hides all answers and examples until reveal, numbers meanings and repeats the whole word',async()=>{
  const h=harness();h.context.words.c.word='quiet';h.context.words.a.example='The room stayed quiet all morning.';h.context.words.c.example='The forest was quiet after the storm.';
  await afterAction(h.createSet());await afterAction(h.click('#study-sets-start'));
  assert.equal(h.query('#study-sets-progress').textContent,'0 / 1');assert.equal(h.query('#study-sets-answer').textContent,'');
  assert.doesNotMatch(h.query('#study-sets-flashcard').textContent,/조용한|고요한|forest|morning/);assert.doesNotMatch(h.query('#study-sets-flashcard').getAttribute('aria-label'),/조용한|고요한|forest|morning/);
  assert.equal(h.document.querySelector('.study-sets-card-example'),null);
  await afterAction(h.click('#study-sets-reveal'));assert.equal(h.query('#study-sets-answer').textContent,'1. 조용한\n2. 고요한');
  assert.equal(h.query('#study-sets-grade-repeat').hidden,false);assert.equal(h.query('#study-sets-grade-remembered').hidden,false);
  await afterAction(h.click('#study-sets-grade-repeat'));assert.equal(h.query('#study-sets-progress').textContent,'0 / 1');assert.equal(h.query('#study-sets-answer').textContent,'');
  await afterAction(h.click('#study-sets-reveal'));await afterAction(h.click('#study-sets-grade-remembered'));assert.equal(h.query('.study-sets-result').textContent,'1 / 1');
  assert.equal(h.run('BreezeStudySets.view(studySetsUI.state,studySetsUI.setId).rememberedMeaningIds.length'),2);
});

test('single-meaning examples stay stored but are omitted even when the prompt algorithm accepts them',async()=>{
  const h=harness();h.context.words.a.example='The room stayed quiet all morning.';
  await afterAction(h.createSet('One meaning',['One']));await afterAction(h.click('#study-sets-start'));
  assert.equal(h.run('BreezeVocabularyTest.prompt(words.a).text'),'The room stayed quiet all morning.');
  assert.equal(h.document.querySelector('.study-sets-card-example'),null);assert.equal(h.context.words.a.example,'The room stayed quiet all morning.');
  assert.doesNotMatch(h.query('#study-sets-flashcard').getAttribute('aria-label'),/room stayed/);
  assert.equal(h.query('#study-sets-answer').textContent,'');assert.equal(h.query('#study-sets-error').hidden,true);
  const bad=harness();bad.context.words.a.example='Choose the correct answer for quiet.';await afterAction(bad.createSet('Instructions',['One']));await afterAction(bad.click('#study-sets-start'));
  assert.equal(bad.document.querySelector('.study-sets-card-example'),null);assert.equal(bad.query('#study-sets-expression').textContent,'quiet');
});

test('test scope and study scope share representative roots, meanings and exclusions',async()=>{
  const h=harness();h.context.words.c.root='a';h.context.words.c.word='quieter';
  await afterAction(h.createSet('Same scope'));
  const source=readFileSync(new URL('../scripts/ui/vocabulary-test.js',import.meta.url),'utf8');
  h.run(source.slice(source.indexOf('function vocabularyTestScope('),source.indexOf('async function openVocabularyTest(')));
  const compare=()=>h.run(`(()=>{const set=studySetsUI.state.sets[0],study=BreezeStudySets.groupedCards(set),test=vocabularyTestScope({kind:'set',setId:set.id}).cards;return JSON.stringify({study:study.map(card=>card.acceptedMeanings),test:[...BreezeVocabularyTest.groups(test).values()].map(senses=>[...new Set(senses.map(card=>card.ko))])});})()`);
  let groups=JSON.parse(compare());assert.deepEqual(groups.test,groups.study);assert.equal(groups.study.length,1);
  await afterAction(h.click('.study-sets-row-action'));groups=JSON.parse(compare());assert.deepEqual(groups,{study:[],test:[]});
});

test('a long word list does not remeasure rows while the mounted window stays put',async()=>{
  const h=harness();
  const words={};
  for(let i=0;i<150;i++)words['w'+i]={word:'word'+i,ko:'뜻'+i,book:'Book',addedAt:i+1};
  h.context.words=words;
  const box=(top,height)=>({top,left:0,right:390,bottom:top+height,width:390,height,x:0,y:top});
  Object.defineProperty(h.window.HTMLElement.prototype,'clientHeight',{configurable:true,get:()=>600});
  Object.defineProperty(h.window.HTMLElement.prototype,'clientWidth',{configurable:true,get:()=>390});
  await afterAction(h.run('openStudySetsAllWords()'));
  const body=h.query('#study-sets-content'),list=h.query('#study-all-words-list');
  assert.equal(list.dataset.total,'150');
  let reads=0;
  body.getBoundingClientRect=()=>{reads++;return box(0,600);};
  list.getBoundingClientRect=()=>{reads++;return box(80-body.scrollTop,150*64);};
  const proto=h.window.HTMLElement.prototype,original=proto.getBoundingClientRect;
  proto.getBoundingClientRect=function(){reads++;const base=original.call(this);return box(base.top||0,base.height||64);};
  h.run('studySetsUI.allWordsList.refresh(null,true)');
  const mounted=h.document.querySelectorAll('.study-all-words-row').length;
  assert.ok(mounted>1&&mounted<150);
  reads=0;body.scrollTop=10;body.dispatchEvent(new h.window.Event('scroll'));
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(reads,0);
  assert.equal(h.document.querySelectorAll('.study-all-words-row').length,mounted);
  body.scrollTop=80+64*40;body.dispatchEvent(new h.window.Event('scroll'));
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.ok(reads>0);
  const indexes=[...h.document.querySelectorAll('.study-all-words-row')].map(row=>Number(row.dataset.index));
  assert.ok(Math.min(...indexes)>0);
  proto.getBoundingClientRect=original;
});

test('a saved set uses the same bounded window as 전체 단어 after 100 words',async()=>{
  const openSized=async count=>{
    const h=harness();
    const sample={};
    for(let i=0;i<count;i++)sample['w'+i]={word:'word '+i,ko:'뜻 '+i,book:'Book',addedAt:i+1};
    h.context.words=sample;
    Object.defineProperty(h.window.HTMLElement.prototype,'clientHeight',{configurable:true,get:()=>600});
    Object.defineProperty(h.window.HTMLElement.prototype,'clientWidth',{configurable:true,get:()=>390});
    await afterAction(h.run(`(async()=>{const created=BreezeStudySets.create(await loadStudySets(),{name:'큰 세트',bookTitles:['Book']},words,10);await commitStudySets(created.state);await openStudySet(created.set.id);})()`));
    return h;
  };
  const full=await openSized(100);
  assert.equal(full.document.querySelectorAll('#study-sets-word-list .study-sets-word-row').length,100);
  assert.equal(full.run('studySetsUI.allWordsList'),null);
  const windowed=await openSized(200);
  const mounted=windowed.document.querySelectorAll('#study-sets-word-list .study-sets-word-row').length;
  assert.ok(mounted>1&&mounted<200,'a 200-word set mounts a viewport, not every word');
  assert.equal(windowed.query('#study-sets-word-list').dataset.total,'200');
  assert.equal(windowed.run('typeof studySetsUI.allWordsList.removeId'),'function');
  const removedId=windowed.query('.study-sets-word-row').dataset.cardId;
  const kept=windowed.run(`(()=>{const row=document.querySelector('.study-sets-word-row[data-index="1"]');row.classList.add('study-sets-exiting');return row.dataset.cardId;})()`);
  windowed.run(`studySetsUI.allWordsList.removeId(${JSON.stringify(removedId)})`);
  assert.equal(windowed.query('#study-sets-word-list').dataset.total,'199');
  assert.equal(windowed.run(`!!document.querySelector(${JSON.stringify('.study-sets-word-row')})&&![...document.querySelectorAll('.study-sets-word-row')].some(row=>row.dataset.cardId===${JSON.stringify(removedId)})`),true);
  assert.equal(windowed.run(`[...document.querySelectorAll('.study-sets-word-row')].some(row=>row.dataset.cardId===${JSON.stringify(kept)}&&row.dataset.index==='0')`),true,'a row already leaving keeps its identity and moves up one index');
  windowed.run(`document.querySelector('.study-sets-exiting')?.classList.remove('study-sets-exiting')`);
  const box=(top,height)=>({top,left:0,right:390,bottom:top+height,width:390,height,x:0,y:top});
  const body=windowed.query('#study-sets-content'),list=windowed.query('#study-sets-word-list');
  body.getBoundingClientRect=()=>box(0,600);
  list.getBoundingClientRect=()=>box(80-body.scrollTop,199*64);
  body.scrollTop=80+64*40;body.dispatchEvent(new windowed.window.Event('scroll'));
  await new Promise(resolve=>setTimeout(resolve,40));
  const indexes=[...windowed.document.querySelectorAll('.study-sets-word-row')].map(row=>Number(row.dataset.index));
  assert.ok(Math.min(...indexes)>0,'scrolling a saved set mounts a later window');
});

test('전체 단어 cannot be deleted and the filter card is gone',async()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/wordbook-filters|id="vsort"|id="vbooks"|id="vfilter-clear"/);
  assert.match(html,/id="vstars"/);
  assert.match(html,/id="nav-vocab"[^>]*onclick="show\('memory'\)"/);
  assert.match(html,/id="memory-last-set"/);
  const h=harness();
  await afterAction(h.run('renderStudySetsHome()'));
  const all=h.query('#study-sets-all');
  assert.equal(all.parentElement.querySelector('button:not(#study-sets-all)'),null);
  assert.equal([...h.document.querySelectorAll('button')].some(button=>button.textContent.includes('삭제')),false);
  await afterAction(h.run('openStudySetsAllWords()'));
  assert.equal(h.run('studySetsUI.editButton.hidden'),false);
  assert.deepEqual([...h.document.querySelectorAll('.study-sets-edit-menu button')].filter(node=>!node.hidden).map(node=>node.textContent),['공유']);
  assert.equal(h.query('#study-sets-edit-menu').hidden,true);
  const saved=JSON.stringify(h.context.words);
  await afterAction(h.run("studySetsGo('delete','')"));
  assert.equal(JSON.stringify(h.context.words),saved);
  assert.equal(h.context.dead.c,undefined);
});

test('star chips filter 전체 단어 and a saved set, and none pressed shows every word',async()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/id="vocab-star-filter"[^>]*hidden><div class="wordbook-filter-row"><span>별점<\/span><div id="vstars"[^>]*aria-label="별점 필터"/);
  assert.match(html,/data-status="1"[^>]*aria-label="별 1개 필터"/);
  assert.match(html,/data-status="3"[^>]*aria-label="별 3개 필터"/);
  assert.doesNotMatch(html,/wordbook-filters|id="vsort"|id="vbooks"|id="vfilter-clear"/);
  const starCss=readFileSync(new URL('../styles/study-sets.css',import.meta.url),'utf8');
  assert.doesNotMatch(starCss,/\.study-set-tools #vstars\{[^}]*flex:\s*none/);
  assert.match(starCss,/flex-direction:column/);
  assert.match(readFileSync(new URL('../scripts/ui/wordbook.js',import.meta.url),'utf8'),/studySetsRefreshStarFilter/);
  const h=harness();
  h.document.body.insertAdjacentHTML('beforeend','<label class="wordbook-search" id="vocab-search-field" hidden><input id="vsearch"></label><div id="vocab-star-filter" hidden><div class="wordbook-filter-row"><span>별점</span><div id="vstars"><button class="stbtn" type="button" data-status="1" aria-pressed="false">★</button><button class="stbtn" type="button" data-status="3" aria-pressed="false">★★★</button></div></div></div>');
  h.context.words.a.status=1;h.context.words.c.status=3;h.context.words.d.status=2;
  await afterAction(h.run('openStudySetsAllWords()'));
  assert.equal(h.query('#study-sets-edit').hidden,false);
  assert.equal(h.query('#study-sets-edit').getAttribute('aria-label'),'더보기');
  assert.deepEqual([...h.document.querySelectorAll('.study-sets-edit-menu button')].filter(node=>!node.hidden).map(node=>node.textContent),['공유']);
  assert.equal(h.query('#vstars').hidden,false);
  assert.equal(h.query('#vocab-star-filter').parentElement.id,'study-set-tools');
  assert.equal(h.query('#vstars').parentElement.className,'wordbook-filter-row');
  assert.equal(h.query('#vocab-star-filter .wordbook-filter-row > span').textContent,'별점');
  assert.equal(h.query('#vocab-search-field').parentElement.id,'study-set-tools');
  assert.equal(h.query('#study-set-tools').firstElementChild.id,'vocab-search-field');
  assert.equal(h.query('#study-set-tools').lastElementChild.id,'vocab-star-filter');
  assert.equal(h.query('#study-set-tools').parentElement.classList.contains('study-sets-header'),true);
  assert.equal(h.document.querySelectorAll('.study-all-words-row').length,4);
  h.run('wordbookStars=new Set([3])');
  await afterAction(h.run('studySetsRefreshStarFilter()'));
  assert.deepEqual([...h.document.querySelectorAll('.study-all-words-row .vword')].map(node=>node.textContent),['calm']);
  assert.match(h.query('.study-sets-caption').textContent,/1개 표시/);
  h.run('wordbookStars.clear()');
  await afterAction(h.run('studySetsRefreshStarFilter()'));
  assert.equal(h.document.querySelectorAll('.study-all-words-row').length,4);
  await afterAction(h.run('closeStudySets()'));
  await afterAction(h.createSet('Stars',['Two']));
  assert.equal(h.run('studySetsUI.screen'),'detail');
  assert.equal(h.query('#vstars').hidden,false);
  assert.equal(h.query('#vocab-star-filter').parentElement.id,'study-set-tools');
  assert.equal(h.query('#vocab-search-field').hidden,true);
  assert.equal(h.query('#vocab-search-field').parentElement,h.document.body);
  assert.equal(h.document.querySelectorAll('.study-sets-word-row').length,2);
  h.run('wordbookStars=new Set([1])');
  await afterAction(h.run('studySetsRefreshStarFilter()'));
  assert.deepEqual([...h.document.querySelectorAll('.study-sets-word-row .vword')].map(node=>node.textContent),['quiet']);
  h.run('wordbookStars.clear()');
  await afterAction(h.run('studySetsRefreshStarFilter()'));
  assert.equal(h.document.querySelectorAll('.study-sets-word-row').length,2);
});

test('a different star filter asks once before replacing the one saved round',async()=>{
  const h=harness();
  h.context.words.a.status=1;h.context.words.c.status=3;
  await afterAction(h.createSet());
  await afterAction(h.run('studySetsStart(studySetsUI.setId)'));
  assert.equal(h.query('#study-sets-progress').textContent,'0 / 2');
  assert.equal(h.run('readStudySets().sets[0].session.stars'),undefined);
  await afterAction(h.run("studySetsGo('detail')"));
  h.run('wordbookStars=new Set([3]);breezeTaskDialog=async()=>null');
  await afterAction(h.run('studySetsStart(studySetsUI.setId)'));
  assert.equal(h.run('studySetsUI.screen'),'detail');
  assert.equal(h.run('wordbookStars.size'),0);
  assert.equal(h.run('readStudySets().sets[0].session.queue.length'),2);
  assert.equal(h.run('readStudySets().sets[0].session.stars'),undefined);
  h.run('wordbookStars=new Set([3]);breezeTaskDialog=async()=>"confirmed"');
  await afterAction(h.run('studySetsStart(studySetsUI.setId)'));
  assert.equal(h.query('#study-sets-progress').textContent,'0 / 1');
  assert.equal(JSON.stringify(h.run('readStudySets().sets[0].session.stars')),'[3]');
});

test('set cards count each star level, name the book with the most words, and show last study time only when a session already has one',async()=>{
  const h=harness();
  h.context.words.a.status=3;
  await afterAction(h.createFromHome('Exam set',['One']));
  await afterAction(h.run('closeStudySets()'));
  const at=Date.now()-3*86400000-3600000;
  await afterAction(h.run(`(()=>{const set=studySetsUI.state.sets[0];set.archivedSessions=[{startedAt:${at},answers:[{at:${at}}]}];return renderStudySetsHome(studySetsUI.state);})()`));
  const card=h.query('.study-sets-home-card[data-set-id]');
  assert.equal(card.querySelector('.study-sets-home-caption').textContent,'단어 1 · ★ 0 · ★★ 0 · ★★★ 1');
  assert.equal(card.querySelector('.study-sets-home-copy').contains(card.querySelector('.study-sets-home-studied')),true);
  assert.equal(card.querySelector('.study-sets-home-caption').previousElementSibling,card.querySelector('.study-sets-home-copy'));
  assert.equal(card.querySelector('.study-sets-home-shape'),null);
  assert.equal(card.querySelector('.study-sets-home-badge').textContent,'One');
  assert.match(card.querySelector('.study-sets-home-studied').textContent,/3일 전/);
  assert.equal(h.document.querySelector('#study-sets-all .study-sets-home-studied'),null);
  assert.equal(h.query('#study-sets-all .study-sets-home-badge').textContent,'기본');
  const longTitle='아주 긴 위대한 개츠비 원서 제목';
  Object.assign(h.context.words,{
    g1:{word:'gatsby',ko:'개츠비',book:longTitle,status:1,addedAt:10,example:''},
    g2:{word:'daisy',ko:'데이지',book:longTitle,status:2,addedAt:11,example:''},
    g3:{word:'nick',ko:'닉',book:longTitle,status:1,addedAt:12,example:''},
    sea:{word:'sea',ko:'바다',book:'노인과 바다',status:3,addedAt:13,example:''},
    demian:{word:'demian',ko:'데미안',book:'데미안',status:1,addedAt:14,example:''}
  });
  await afterAction(h.run(`(async()=>{let state=await loadStudySets();const made=BreezeStudySets.create(state,{name:'고전',bookTitles:['데미안','노인과 바다',${JSON.stringify(longTitle)}]},words,50);if(!made.accepted)throw Error('create failed');await commitStudySets(made.state);return renderStudySetsHome();})()`));
  const classic=[...h.document.querySelectorAll('.study-sets-home-card[data-set-id]')].find(card=>card.querySelector('strong').textContent==='고전');
  assert.ok(classic);
  assert.equal(classic.querySelector('.study-sets-home-caption').textContent,'단어 5 · ★ 3 · ★★ 1 · ★★★ 1');
  assert.equal(classic.querySelector('.study-sets-home-badge-start').textContent+classic.querySelector('.study-sets-home-badge-end').textContent,longTitle);
  assert.equal(classic.querySelector('.study-sets-home-badge-end').textContent,longTitle.slice(-6));
  assert.equal(classic.querySelector('.study-sets-home-badge-more').textContent,' 외 2권');
});

test('the last-viewed set button opens that set and falls back to 전체 단어',async()=>{
  const h=harness();
  const button=h.document.createElement('button');button.id='memory-last-set';button.setAttribute('aria-label','전체 단어로 이동');
  const label=h.document.createElement('span');label.id='memory-last-set-label';label.textContent='전체 단어';
  button.append(label);h.document.body.append(button);
  await afterAction(h.run('openMemoryLastSet()'));
  assert.equal(h.run('studySetsUI.screen'),'all');
  assert.equal(h.run('memoryLastSetId()'),'@all');
  assert.equal(label.textContent,'전체 단어');
  await afterAction(h.run('closeStudySets()'));
  await afterAction(h.createSet('Evening'));
  const id=h.run('studySetsUI.setId');
  assert.equal(h.run('memoryLastSetId()'),id);
  await afterAction(h.run('closeStudySets()'));
  h.run('refreshMemoryLastSetButton()');
  assert.equal(label.textContent,'Evening');
  assert.equal(button.getAttribute('aria-label'),'Evening 세트로 이동');
  await afterAction(h.run('openMemoryLastSet()'));
  assert.equal(h.run('studySetsUI.screen'),'detail');
  assert.equal(h.run('studySetsUI.setId'),id);
  await afterAction(h.run(`(async()=>{const state=await loadStudySets();await commitStudySets(BreezeStudySets.remove(state,${JSON.stringify(id)}).state);})()`));
  await afterAction(h.run('closeStudySets()'));
  await afterAction(h.run('openMemoryLastSet()'));
  assert.equal(h.run('studySetsUI.screen'),'all');
  assert.equal(h.run('memoryLastSetId()'),'@all');
  assert.equal(label.textContent,'전체 단어');
});

test('전체 단어 swipe deletes the saved word, keeps book sets in step, and reuses undo',async()=>{
  const h=harness();await afterAction(h.createSet());
  assert.deepEqual([...h.context.readStudySets().sets[0].cards].map(card=>card.word).sort(),['calm','quiet']);
  await afterAction(h.run("studySetsGo('all')"));
  const row=[...h.document.querySelectorAll('.study-all-words-row')].find(item=>item.querySelector('.vword')?.textContent==='calm');
  assert.ok(row);assert.equal(row.querySelector('[contenteditable],.rowdel'),null);
  const star=row.querySelector('button.chip');assert.ok(star);
  await afterAction(star.click());
  assert.equal(h.context.words.c.status,2);assert.equal(h.context.words.c.word,'calm');
  await afterAction(row.querySelector('.study-sets-row-action').click());
  assert.equal(h.context.words.c,undefined);assert.ok(h.context.dead.c);
  assert.equal(h.document.querySelector('.study-sets-undo span').textContent,'“calm” 삭제됨');
  assert.equal(h.document.querySelector('.study-sets-undo button').textContent,'실행 취소');
  await h.context.lastSync;
  assert.deepEqual([...h.context.readStudySets().sets[0].cards].map(card=>card.word),['quiet']);
  await afterAction(h.query('.study-sets-undo button').click());
  assert.equal(h.context.words.c.word,'calm');assert.equal(h.document.querySelector('.study-sets-undo'),null);
  await h.context.lastSync;
  assert.deepEqual([...h.context.readStudySets().sets[0].cards].map(card=>card.word).sort(),['calm','quiet']);
  assert.ok([...h.document.querySelectorAll('.study-all-words-row')].some(item=>item.textContent.includes('calm')));
});

function loadRecall(h){
  h.context.navigator={onLine:true};
  h.context.dictCall=()=>null;
  for(const path of ['scripts/core/study-set-test.js','scripts/ui/study-set-test.js'])
    vm.runInContext(readFileSync(new URL('../'+path,import.meta.url),'utf8'),h.context,{filename:path});
}
function recallAnswer(h,text){
  const field=h.query('#study-set-test-answer');
  field.value=text;
  h.query('#study-set-test-form').dispatchEvent(new h.window.Event('submit',{cancelable:true}));
  return field;
}

test('saved-set recall keeps one field, counts on the score row, and stores the score',async()=>{
  const h=harness();loadRecall(h);
  for(let i=0;i<10;i++)h.context.words['extra'+i]={word:'word'+i,ko:'뜻'+i,book:'One',example:'Hidden example '+i,addedAt:20+i};
  await afterAction(h.createSet());
  await afterAction(h.click('#study-sets-test'));
  const slider=h.query('#study-set-test-count');
  assert.equal(slider.value,slider.max);
  assert.ok(Number(slider.max)>=12);
  slider.value='12';slider.dispatchEvent(new h.window.Event('input'));
  assert.equal(h.query('#study-set-test-count-label').textContent,'12 / 12');
  assert.equal(h.query('.study-set-test-preset[data-count="all"]').classList.contains('on'),true);
  assert.equal(h.query('.study-set-test-preset[data-count="10"]').textContent,'10개');
  h.click('.study-set-test-preset[data-count="10"]');
  assert.equal(slider.value,'10');
  assert.equal(h.query('#study-set-test-count-value').textContent,'10');
  assert.equal(h.query('.study-set-test-preset[data-count="10"]').classList.contains('on'),true);
  assert.equal(h.query('.study-set-test-preset[data-count="all"]').classList.contains('on'),false);
  slider.value='12';slider.dispatchEvent(new h.window.Event('input'));
  await afterAction(h.click('#study-set-test-start'));
  const field=h.query('#study-set-test-answer');
  assert.equal(h.document.querySelector('#study-set-test-submit'),null);
  assert.equal([...h.document.querySelectorAll('button')].some(button=>button.textContent==='제출'),false);
  assert.equal(field.enterKeyHint,'done');
  assert.equal(h.document.activeElement,field);
  h.window.visualViewport={height:420,offsetTop:80,scale:1,addEventListener(){}};
  h.window.innerHeight=844;
  h.run('studySetTestPlaceKeyboard()');
  assert.equal(h.query('#v-memory-set').style.height,'420px');
  assert.equal(h.query('#v-memory-set').style.top,'80px');
  assert.equal(h.query('#v-memory-set').classList.contains('study-set-test-keyboard'),true);
  assert.equal(h.query('.study-set-test-card').textContent.includes('Hidden'),false);
  for(let i=0;i<12;i++){
    const word=h.query('#study-set-test-word').textContent;
    const meaning=Object.values(h.context.words).find(item=>item.word===word).ko;
    const same=recallAnswer(h,i<8||i>=10?meaning:'');
    if(i<11){
      assert.equal(same,h.query('#study-set-test-answer'));
      assert.equal(same.value,'');
      assert.equal(h.document.activeElement,same);
    }
    if(i===9){
      assert.equal(h.document.querySelector('#study-set-test-toast'),null);
      assert.equal(h.query('#study-set-test-tally [data-kind="correct"] b').textContent,'8');
      assert.equal(h.query('#study-set-test-tally [data-kind="incorrect"] b').textContent,'2');
      assert.equal(h.query('#study-set-test-tally [data-kind="pending"]').hidden,true);
    }
  }
  assert.equal(h.query('#study-set-test-score').textContent,'83점');
  assert.equal(h.document.querySelectorAll('#study-set-test-wrong li').length,2);
  assert.equal(h.query('#study-sets-title').textContent,'결과');
  const stored=JSON.parse(h.storage.get('breeze.study-set-tests.v1'));
  const setId=h.run('studySetsUI.setId');
  assert.deepEqual(stored.sets[setId].map(row=>({count:row.count,correct:row.correct,score:row.score})),[{count:12,correct:10,score:83}]);
  await afterAction(h.click('#study-set-test-retry'));
  assert.equal(h.query('#study-set-test-progress').textContent,'1 / 2');
  assert.equal(h.document.activeElement.id,'study-set-test-answer');
  recallAnswer(h,'');recallAnswer(h,'');
  assert.equal(stored.sets[setId].length,1);
  assert.equal(JSON.parse(h.storage.get('breeze.study-set-tests.v1')).sets[setId][0].count,2);
  await afterAction(h.click('#study-sets-back'));
  assert.equal(h.document.querySelectorAll('.study-set-test-record').length,2);
  assert.match(h.document.querySelector('.study-set-test-record').textContent,/2개/);
  assert.match(h.document.querySelector('.study-set-test-record').textContent,/0점/);
});

test('lenient grading stays off the field, and a failed grade falls back without a toast',async()=>{
  const h=harness();
  const seen=[];
  loadRecall(h);
  h.window.BreezeStudySetTestGrader={grade(items){seen.push(items);return items.map(()=>({ok:true}));}};
  h.context.dictCall=()=>{throw new Error('live call');};
  await afterAction(h.createSet('Lenient',['One']));
  await afterAction(h.click('#study-sets-test'));
  h.query('#study-set-test-count').value='1';
  await afterAction(h.click('#study-set-test-start'));
  const word=h.query('#study-set-test-word').textContent;
  recallAnswer(h,'비슷한 말');
  for(let n=0;n<6;n++)await afterAction();
  assert.equal(seen.length,1);
  assert.deepEqual(Object.keys(seen[0][0]).sort(),['answer','meanings','word']);
  assert.equal(seen[0][0].word,word);
  assert.equal(JSON.stringify(seen[0]).includes('example'),false);
  assert.equal(h.query('#study-set-test-score').textContent,'100점');
  assert.equal(h.document.querySelector('#study-set-test-toast'),null);

  const offline=harness();loadRecall(offline);
  delete offline.window.BreezeStudySetTestGrader;
  offline.context.setTimeout=fn=>fn();
  offline.context.dictCall=async()=>null;
  await afterAction(offline.createSet('Offline',['One']));
  await afterAction(offline.click('#study-sets-test'));
  offline.query('#study-set-test-count').value='1';
  await afterAction(offline.click('#study-set-test-start'));
  recallAnswer(offline,'전혀 다름');
  for(let n=0;n<8;n++)await afterAction();
  assert.equal(offline.query('#study-set-test-score').textContent,'0점');
  assert.equal(offline.document.querySelectorAll('#study-set-test-wrong li').length,1);
  assert.match(offline.query('#study-set-test-wrong').textContent,/전혀 다름/);
  assert.match(offline.query('.study-set-test-right').textContent,/.+/);
  assert.equal(offline.document.querySelector('#study-set-test-retry').disabled,false);
  const raw=offline.storage.get('breeze.study-set-tests.v1');
  const record=JSON.parse(raw).sets[Object.keys(JSON.parse(raw).sets)[0]][0];
  assert.equal(offline.run(`BreezeStudySetTest.save('{', 'set', ${JSON.stringify(record)}).ok`),false);
});

test('recall back asks before saving the answers so far',async()=>{
  const h=harness();loadRecall(h);
  await afterAction(h.createSet());
  await afterAction(h.click('#study-sets-test'));
  h.query('#study-set-test-count').value='2';
  await afterAction(h.click('#study-set-test-start'));
  const field=h.query('#study-set-test-answer');
  const word=h.query('#study-set-test-word').textContent;
  const meaning=Object.values(h.context.words).find(item=>item.word===word).ko;
  field.value=meaning;
  const enter=new h.window.Event('keydown',{bubbles:true,cancelable:true});
  Object.defineProperty(enter,'key',{value:'Enter'});
  field.dispatchEvent(enter);
  assert.equal(h.query('#study-set-test-progress').textContent,'2 / 2');
  assert.equal(h.storage.has('breeze.study-set-tests.v1'),false);
  await afterAction(h.click('#study-sets-back'));
  assert.equal(h.query('#study-set-test-leave-title').textContent,'정말 제출하고 나가시겠습니까?');
  assert.deepEqual([...h.document.querySelectorAll('#study-set-test-leave button')].map(button=>button.textContent),['취소','나가기']);
  await afterAction(h.button('취소'));
  assert.equal(h.document.querySelector('#study-set-test-leave'),null);
  assert.equal(h.query('#study-set-test-word').textContent,h.run(`studySetTestRun.questions[1].word`));
  assert.equal(h.storage.has('breeze.study-set-tests.v1'),false);
  await afterAction(h.click('#study-sets-back'));
  await afterAction(h.button('나가기'));
  assert.equal(h.query('#study-set-test-score').textContent,'100점');
  assert.equal(h.query('#study-set-test-caption').textContent,'1개 중 1개 맞음');
  const setId=h.run('studySetsUI.setId');
  assert.deepEqual(JSON.parse(h.storage.get('breeze.study-set-tests.v1')).sets[setId].map(row=>({count:row.count,score:row.score})),[{count:1,score:100}]);
  await afterAction(h.click('#study-sets-back'));
  assert.equal(h.document.querySelector('#study-set-test-leave'),null);
  assert.equal(h.run('studySetsUI.screen'),'test-setup');
  await afterAction(h.click('#study-set-test-start'));
  await afterAction(h.context.history.back());
  assert.equal(h.run('studySetsUI.screen'),'test');
  assert.equal(h.query('#study-set-test-leave-title').textContent,'정말 제출하고 나가시겠습니까?');
  await afterAction(h.button('취소'));
  assert.equal(h.run('studySetsUI.screen'),'test');
  assert.ok(h.run('studySetTestRun'));
  assert.equal(h.document.querySelector('#study-set-test-leave'),null);
  assert.equal(JSON.parse(h.storage.get('breeze.study-set-tests.v1')).sets[setId].length,1);
});

test('recall tally shows a pending count, then moves it into correct and wrong',async()=>{
  const h=harness();loadRecall(h);
  let release=()=>{};
  const gate=new Promise(resolve=>{release=resolve;});
  h.window.BreezeStudySetTestGrader={grade(items){return gate.then(()=>items.map(item=>({ok:item.answer!=='오답'})));}};
  for(let i=0;i<12;i++)h.context.words['tally'+i]={word:'tally'+i,ko:'뜻'+i,book:'One',example:'Hidden',addedAt:40+i};
  await afterAction(h.createSet('Tally',['One']));
  await afterAction(h.click('#study-sets-test'));
  h.query('#study-set-test-count').value='12';
  await afterAction(h.click('#study-set-test-start'));
  const tally=kind=>h.query(`#study-set-test-tally [data-kind="${kind}"]`);
  assert.equal(h.query('#study-set-test-tally').previousElementSibling.id,'study-set-test-progress');
  assert.equal(tally('pending').hidden,true);
  assert.equal(tally('correct').querySelector('b').textContent,'0');
  for(let i=0;i<10;i++){
    const word=h.query('#study-set-test-word').textContent;
    const meaning=Object.values(h.context.words).find(item=>item.word===word).ko;
    recallAnswer(h,i<6?meaning:i<8?'':'오답');
  }
  assert.equal(h.query('#study-set-test-progress').textContent,'11 / 12');
  assert.equal(tally('correct').querySelector('b').textContent,'6');
  assert.equal(tally('incorrect').querySelector('b').textContent,'2');
  assert.equal(tally('pending').hidden,false);
  assert.equal(tally('pending').querySelector('b').textContent,'2');
  assert.equal(h.query('#study-set-test-tally').getAttribute('aria-label'),'맞음 6, 틀림 2, 채점 중 2');
  release();
  for(let n=0;n<6;n++)await afterAction();
  assert.equal(tally('pending').hidden,true);
  assert.equal(tally('correct').querySelector('b').textContent,'6');
  assert.equal(tally('incorrect').querySelector('b').textContent,'4');
  assert.equal(h.query('#study-set-test-tally').getAttribute('aria-label'),'맞음 6, 틀림 4');
});

test('an old account grader cannot save its result or shift the new account queue',async()=>{
  const h=harness();loadRecall(h);const waits=[];
  h.window.BreezeStudySetTestGrader={grade(){return new Promise(resolve=>waits.push(resolve));}};
  h.run(`let testScope={id:'user:A',generation:1};studyScopeCapture=()=>({...testScope});
    function isLearningScopeCurrent(scope){return scope.id===testScope.id&&scope.generation===testScope.generation;}
    studyScopeAssert=scope=>{if(scope&&!isLearningScopeCurrent(scope))throw Object.assign(Error('changed account'),{syncCancelled:true});};`);
  await afterAction(h.createSet('A',['One']));await afterAction(h.click('#study-sets-test'));h.query('#study-set-test-count').value='1';await afterAction(h.click('#study-set-test-start'));recallAnswer(h,'old pending answer');
  assert.equal(waits.length,1);h.run(`testScope={id:'user:B',generation:2};`);h.window.dispatchEvent(new h.window.Event('breeze-learning-scope'));
  assert.equal(h.run('studySetTestRun'),null);
  h.run(`studySetTestBegin({id:'b-set'},[{id:'b-word',word:'new',meanings:['새로운']}]);studySetsUI.screen='test';studySetTestSubmit('new pending answer');`);
  const pendingBefore=JSON.parse(h.storage.get('breeze.study-set-tests.v1'));
  const oldSetId=Object.keys(pendingBefore.sets)[0];
  const pendingRow=pendingBefore.sets[oldSetId][0];
  assert.equal(pendingRow.pending,true);assert.equal(pendingRow.score,null);
  waits[0]([{ok:true}]);for(let i=0;i<5;i++)await settle();
  assert.equal(waits.length,2,'new account batch must remain queued after old response');
  const afterOld=JSON.parse(h.storage.get('breeze.study-set-tests.v1'));
  assert.equal(afterOld.sets[oldSetId][0].pending,true,'a finished grade from the previous account must not replace 채점 중');
  assert.equal(afterOld.sets[oldSetId][0].score,null);
  waits[1]([{ok:false}]);for(let i=0;i<5;i++)await settle();
  const saved=JSON.parse(h.storage.get('breeze.study-set-tests.v1'));
  assert.equal(saved.sets['b-set'][0].correct,0);
  assert.equal(saved.sets[oldSetId][0].pending,true);
});

test('queued duplicate restart replaces a completed round once and failed restart remains retryable',async()=>{
  const h=harness();await afterAction(h.createSet('One card',['One']));
  await afterAction(h.click('#study-sets-start'));await afterAction(h.click('#study-sets-reveal'));await afterAction(h.click('#study-sets-grade-remembered'));
  const completed=h.run('readStudySets().sets[0].session.id'),restart=h.query('#study-sets-restart');
  const native=h.context.localStorage.setItem;let writes=0;
  h.context.localStorage.setItem=(key,value)=>{if(key==='breeze.study-sets.v1')writes++;return native(key,value);};
  restart.click();restart.click();await afterAction(h.run('studySetsWriteChain'));
  const fresh=h.run('readStudySets().sets[0].session.id');assert.notEqual(fresh,completed);assert.equal(writes,1);
  restart.click();await afterAction(h.run('studySetsWriteChain'));assert.equal(writes,1);assert.equal(h.run('readStudySets().sets[0].session.id'),fresh);
  await afterAction(h.click('#study-sets-reveal'));await afterAction(h.click('#study-sets-grade-remembered'));
  const before=h.storage.get('breeze.study-sets.v1');
  h.context.localStorage.setItem=()=>{throw Error('Synthetic failed restart');};
  await afterAction(h.click('#study-sets-restart'));assert.equal(h.storage.get('breeze.study-sets.v1'),before);assert.equal(h.query('#study-sets-error').hidden,false);
  h.context.localStorage.setItem=native;await afterAction(h.click('#study-sets-error button'));
  assert.notEqual(h.run('readStudySets().sets[0].session.id'),fresh);assert.equal(h.query('#study-sets-progress').textContent,'0 / 1');
});

test('a one-time storage conflict during a flashcard grade retries without the changed banner',async()=>{
  const h=harness();
  await afterAction(h.createSet());
  await afterAction(h.click('#study-sets-start'));
  await afterAction(h.click('#study-sets-reveal'));
  const original=h.context.commitStudySets;
  let thrown=false;
  h.context.commitStudySets=function(next){
    if(!thrown){thrown=true;throw new Error('Study storage changed. Reopen and retry.');}
    return original(next);
  };
  await afterAction(h.click('#study-sets-grade-remembered'));
  assert.equal(thrown,true);
  assert.equal(h.query('#study-sets-error').hidden,true);
  assert.equal(h.query('#study-sets-progress').textContent,'1 / 2');
  assert.equal(JSON.parse(h.storage.get('breeze.study-sets.v1')).sets[0].session.answers.length,1);
});

test('leaving mid-grade keeps 채점 중, then the same history row becomes the score',async()=>{
  const h=harness();loadRecall(h);
  let release=()=>{};
  const gate=new Promise(resolve=>{release=resolve;});
  h.window.BreezeStudySetTestGrader={grade(items){return gate.then(()=>items.map(item=>({ok:item.answer==='사과'})));}};
  await afterAction(h.createSet());
  await afterAction(h.click('#study-sets-test'));
  h.query('#study-set-test-count').value='1';
  await afterAction(h.click('#study-set-test-start'));
  const word=h.query('#study-set-test-word').textContent;
  const meaning=Object.values(h.context.words).find(item=>item.word===word).ko;
  recallAnswer(h,'배');
  assert.ok(h.query('#study-set-test-score .study-set-test-spinner'));
  assert.equal(h.query('#study-set-test-score progress').getAttribute('aria-label'),'채점 중 0 / 1');
  const setId=h.run('studySetsUI.setId');
  assert.equal(JSON.parse(h.storage.get('breeze.study-set-tests.v1')).sets[setId][0].pending,true);
  await afterAction(h.click('#study-sets-back'));
  assert.match(h.query('.study-set-test-record').textContent,/채점 중/);
  h.run('studySetTestRun=null');
  release();
  for(let n=0;n<8;n++)await afterAction();
  assert.equal(h.query('.study-set-test-record b').textContent,'0점');
  const settled=JSON.parse(h.storage.get('breeze.study-set-tests.v1')).sets[setId][0];
  assert.equal(settled.pending,undefined);
  assert.equal(settled.score,0);
  assert.equal(h.run('studySetTestJobs.size'),0);
  const again=JSON.parse(h.storage.get('breeze.study-set-tests.v1'));
  again.sets[setId][0]={id:'later',at:9,count:1,correct:0,score:null,pending:true,rows:[{word,meanings:[meaning],answer:'배',status:'pending'}]};
  h.storage.set('breeze.study-set-tests.v1',JSON.stringify(again));
  h.run('studySetTestJobs.clear();studySetTestQueue.length=0;studySetTestResumeStored()');
  assert.equal(h.run('studySetTestJobs.size'),1);
  for(let n=0;n<8;n++)await afterAction();
  const resumed=JSON.parse(h.storage.get('breeze.study-set-tests.v1')).sets[setId][0];
  assert.equal(resumed.pending,undefined);
  assert.equal(resumed.score,0);
  assert.match(h.query('.study-set-test-record').textContent,/0점/);
});
