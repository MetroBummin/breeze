import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function afterAction(result){const value=await result;await settle();return value;}

// Event-level UI checks only. Native focus trapping, browser history timing,
// pointer capture, layout and paint are covered by verify-study-sets-browser.mjs.
function harness(){
  const {window}=parseHTML('<!DOCTYPE html><html><body><section id="v-memory"><main id="study-sets-home-list"></main></section></body></html>');
  const {document}=window,storage=new Map();
  let focused=document.body;
  Object.defineProperty(document,'activeElement',{get:()=>focused});
  const entries=[{breeze:true,view:'vocab'}];let historyIndex=0;
  const history={state:entries[0],pushState(value){entries[historyIndex]=this.state;entries.splice(++historyIndex);entries.push(value);this.state=value;},replaceState(value){this.state=value;entries[historyIndex]=value;},go(delta){
    historyIndex=Math.max(0,Math.min(entries.length-1,historyIndex+delta));this.state=entries[historyIndex];const event=new window.Event('popstate');event.state=this.state;window.dispatchEvent(event);
  },back(){this.go(-1);},forward(){this.go(1);}};
  const context={window,document,HTMLElement:window.HTMLElement,Element:window.Element,Node:window.Node,console,setTimeout,clearTimeout,matchMedia:()=>({matches:true}),
    activeAppView:()=>context.currentView,currentView:'vocab',show:view=>{context.currentView=view;},openVocabularyReview:()=>{context.currentView='study';history.pushState({breeze:true,view:'study'});},history,words:{
      a:{word:'quiet',ko:'조용한',book:'One',example:'Stay quiet.',addedAt:1},
      b:{word:'quiet',ko:'조용한',book:'Two',addedAt:2},
      c:{word:'quiet',ko:'고요한',book:'Two',addedAt:3},
      d:{word:'direct',ko:'직접',book:'',addedAt:4}
    },esc:value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])),renderStoredStudyExample:(target,card)=>{target.textContent=card.example||'';},validWordMeaning:item=>!!(item&&typeof item.ko==='string'&&item.ko.trim()),
    localStorage:{getItem:key=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>{storage.set(key,value);}}
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
    function readStudySets(){const raw=localStorage.getItem(STUDY_SETS_STORAGE);const value=BreezeStudySets.decode(raw);fixtureRead=raw;return value;}
    async function loadStudySets(){return readStudySets();}
    function commitStudySets(next){const raw=localStorage.getItem(STUDY_SETS_STORAGE);BreezeStudySets.decode(raw);if(raw!==fixtureRead)throw Error('changed');localStorage.setItem(STUDY_SETS_STORAGE,JSON.stringify(BreezeStudySets.normalize(next)));fixtureRead=localStorage.getItem(STUDY_SETS_STORAGE);}`,context);
  for(const path of ['scripts/core/study-sets.js','scripts/ui/study-sets.js'])
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
  assert.equal(document.querySelectorAll('#study-sets-word-list li').length,2);assert.match(query('#study-sets-import').textContent,/1개/);
  await afterAction(click('#study-sets-import'));await afterAction(run("studySetsGo('detail')"));assert.equal(document.querySelectorAll('#study-sets-word-list li').length,3);
  await afterAction(click('#study-sets-start'));assert.equal(query('#study-sets-progress').textContent,'0 / 2');
  await afterAction(click('#study-sets-reveal'));await afterAction(click('#study-sets-grade-remembered'));
  assert.equal(query('#study-sets-progress').textContent,'1 / 2');await afterAction(click('#study-sets-reveal'));await afterAction(click('#study-sets-grade-remembered'));
  assert.equal(document.querySelector('#study-sets-repeat-round'),null);
  assert.equal(JSON.stringify(Object.fromEntries(Object.entries(context.words).filter(([key])=>key!=='new'))),source);
  await afterAction(click('#study-sets-back'));await afterAction(click('#study-sets-back'));assert.equal(query('#study-sets-dialog').open,false);
  await afterAction(run('openStudySets()'));assert.equal(document.querySelectorAll('.study-sets-list li').length,1);
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
  const pointer=(row,type,x,y)=>{const event=new window.Event(type);Object.assign(event,{button:0,pointerId:1,clientX:x,clientY:y});row.dispatchEvent(event);};
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
  assert.equal(cards[2].id,'study-sets-home-create');assert.match(cards[1].textContent,/2개/);
  await afterAction(click('#study-sets-back'));assert.equal(query('#study-sets-dialog').open,false);
  assert.equal(context.currentView,'memory');assert.equal(document.activeElement.id,'study-sets-home-create');
});

test('direct set cards preserve detail, nested Back, updated counts and focus after closing',async ()=>{
  const {context,document,query,click,button,submit,run,createFromHome}=harness();await afterAction(createFromHome());await afterAction(click('#study-sets-close'));
  const card=query('.study-sets-home-card[data-set-id]');card.focus();await afterAction(card.click());
  assert.equal(query('#study-sets-title').textContent,'Exam set');assert.equal(context.history.state.studySetsHome,true);
  assert.equal(context.history.state.studySetsScreen,'detail');assert.equal(document.querySelector('.study-sets-list'),null);
  await afterAction(click('.study-sets-row-action'));assert.match(query('.study-sets-home-card[data-set-id]').textContent,/1개/);
  await afterAction(run("studySetsGo('excluded')"));await afterAction(click('.study-sets-row-action'));await afterAction(click('#study-sets-back'));
  assert.equal(query('#study-sets-title').textContent,'Exam set');assert.match(query('.study-sets-home-card[data-set-id]').textContent,/2개/);
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


test('minimal detail shows examples only after tapping and keeps primary action outside scroll body',async ()=>{
  const {query,document,click,createFromHome}=harness();await afterAction(createFromHome());
  const toggle=query('.vword');
  assert.equal(document.querySelector('.vex'),null);assert.equal(toggle.getAttribute('aria-expanded'),'false');
  await afterAction(toggle.click());assert.ok(query('.vex'));await afterAction(toggle.click());assert.equal(document.querySelector('.vex'),null);
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
  const pointer=(row,type,x,y)=>{const event=new window.Event(type,{cancelable:true});Object.assign(event,{button:0,pointerId:1,clientX:x,clientY:y});row.dispatchEvent(event);};
  const row=query('.study-sets-word-row'),surface=query('.study-sets-word-surface');
  await afterAction(pointer(row,'pointerdown',240,20));await afterAction(pointer(row,'pointermove',210,20));assert.match(surface.style.transform,/-30px/);
  await afterAction(pointer(row,'pointerup',210,20));assert.equal(surface.style.transform,'');assert.equal(document.querySelectorAll('.study-sets-word-row').length,2);
  await afterAction(pointer(row,'pointerdown',240,20));await afterAction(pointer(row,'pointermove',300,20));await afterAction(pointer(row,'pointerup',350,20));assert.equal(document.querySelectorAll('.study-sets-word-row').length,2);
  await afterAction(pointer(row,'pointerdown',240,20));await afterAction(pointer(row,'pointermove',130,20));await afterAction(pointer(row,'pointercancel',130,20));assert.equal(surface.style.transform,'');
});


test('reference swipe parks its circular action, grows a capsule, and closes on another row or outside tap',async ()=>{
  const {document,query,window,createFromHome}=harness();await afterAction(createFromHome());
  const pointer=(row,type,x,y=20)=>{const event=new window.Event(type,{cancelable:true,bubbles:true});Object.assign(event,{button:0,pointerId:1,clientX:x,clientY:y});row.dispatchEvent(event);};
  const rows=[...document.querySelectorAll('.study-sets-word-row')],row=rows[0],surface=row.querySelector('.study-sets-word-surface'),action=row.querySelector('.study-sets-row-action');
  await afterAction(pointer(row,'pointerdown',280));await afterAction(pointer(row,'pointermove',220));await afterAction(pointer(row,'pointerup',220));
  assert.equal(surface.style.transform,'translateX(-72px)');assert.equal(action.style.width,'44px');assert.equal(rows.length,2);
  await afterAction(pointer(rows[1],'pointerdown',280));assert.equal(surface.style.transform,'');await afterAction(pointer(rows[1],'pointercancel',280));
  await afterAction(pointer(row,'pointerdown',280));await afterAction(pointer(row,'pointermove',220));await afterAction(pointer(row,'pointerup',220));
  await afterAction(pointer(document.body,'pointerdown',0));assert.equal(surface.style.transform,'');
  await afterAction(pointer(row,'pointerdown',280));await afterAction(pointer(row,'pointermove',180));assert.equal(action.style.width,'72px');
  await afterAction(pointer(row,'pointercancel',180));assert.equal(surface.style.transform,'');
  await afterAction(pointer(row,'pointerdown',280));await afterAction(pointer(row,'pointermove',220));await afterAction(pointer(row,'pointerup',220));await afterAction(action.click());
  assert.equal(document.querySelectorAll('.study-sets-word-row').length,1);await afterAction(query('.study-sets-undo button').click());assert.equal(document.querySelectorAll('.study-sets-word-row').length,2);
});

test('failed full swipe resets visual state and retry excludes exactly once',async ()=>{
  const {context,document,query,window,storage,createFromHome}=harness();await afterAction(createFromHome());
  const row=query('.study-sets-word-row'),surface=query('.study-sets-word-surface'),before=storage.get('breeze.study-sets.v1'),nativeSet=context.localStorage.setItem;
  const pointer=(type,x)=>{const event=new window.Event(type,{cancelable:true});Object.assign(event,{button:0,pointerId:1,clientX:x,clientY:20});row.dispatchEvent(event);};
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
  const pointer=(type,x)=>{const event=new window.Event(type,{cancelable:true});Object.assign(event,{button:0,pointerId:2,clientX:x,clientY:20});second.dispatchEvent(event);};
  await afterAction(pointer('pointerdown',280));await afterAction(pointer('pointermove',190));
  finishExit();await new Promise(resolve=>setImmediate(resolve));finishCollapse();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(second.isConnected,true);assert.equal(second.classList.contains('study-sets-dragging'),true);
  assert.equal(second.querySelector('.study-sets-word-surface').style.transform,'translateX(-90px)');
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

test('shared vocabulary status chip changes only snapshot status and retains expanded examples',async ()=>{
  const {context,document,query,run,createFromHome}=harness();await afterAction(createFromHome());
  const source=JSON.stringify(context.words);await afterAction(query('.vword').click());assert.ok(query('.vex'));
  await afterAction(query('.chip').click());assert.equal(query('.chip').textContent,'★★');assert.ok(query('.vex'));
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
  assert.match(html,/id="wordbook-review"[^>]*onclick="openStudySetsDirectory\(\)">학습하기/);
  assert.equal(html.includes('id="wordbook-sets-back"'),false);assert.equal(html.includes('id="wordbook-study-sets-entry"'),false);
});

test('a drag beginning on the status chip neither rates nor owns the row swipe',async ()=>{
  const {document,query,window,createFromHome}=harness();await afterAction(createFromHome());
  const row=query('.study-sets-word-row'),chip=query('.chip');
  const pointer=(target,type,x)=>{const event=new window.Event(type,{cancelable:true,bubbles:true});Object.assign(event,{button:0,pointerId:3,clientX:x,clientY:20});target.dispatchEvent(event);};
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

test('vocabulary share is top-right and add is bottom-right with original handlers and dock order',async ()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),{document}=parseHTML(html).window;
  const header=document.querySelector('#v-vocab .wordbook-brand'),dock=document.querySelector('#wordbook-controls .control-bar');
  assert.equal(header.querySelectorAll('#btn-export').length,1);assert.equal(header.querySelector('#wordbook-add'),null);
  assert.deepEqual([...dock.querySelectorAll('button')].map(button=>button.id),['wordbook-home','wordbook-review','wordbook-add']);
  const add=document.getElementById('wordbook-add'),share=document.getElementById('btn-export');
  assert.equal(add.getAttribute('onclick'),'openWordbookAdd()');assert.equal(add.getAttribute('aria-label'),'단어 추가');assert.equal(add.classList.contains('control-circle'),true);
  assert.equal(share.getAttribute('aria-label'),'저장한 단어를 CSV로 내보내기');assert.equal(document.querySelectorAll('#btn-export').length,1);assert.equal(document.querySelectorAll('#wordbook-add').length,1);
  assert.match(readFileSync(new URL('../scripts/dictionary/dictionary.js',import.meta.url),'utf8'),/document\.getElementById\('btn-export'\)\.onclick = async/);
  assert.match(readFileSync(new URL('../styles/wordbook.css',import.meta.url),'utf8'),/\.wordbook-brand #btn-export\{[^}]*width:44px;height:44px/);
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


test('detail imports pending words once without restoring exclusions or changing the active round',async ()=>{
  const {context,document,query,click,run,createSet}=harness();await afterAction(createSet());await afterAction(click('#study-sets-start'));await afterAction(click('#study-sets-back'));
  await afterAction(click('.study-sets-row-action'));const excluded=JSON.stringify(context.readStudySets().sets[0].excludedIds);
  const frozen=JSON.stringify(context.readStudySets().sets[0].session);
  context.words.fresh={word:'fresh',ko:'새로운',book:'One',example:'A fresh start.',addedAt:30};
  const source=JSON.stringify(context.words);await afterAction(run('studySetsReadAndRender(false)'));
  const add=query('#study-sets-import');assert.ok(add.parentNode.classList.contains('study-sets-footer'));
  assert.match(add.textContent,/새 단어 가져오기 · 1개/);await afterAction(add.click());await afterAction(add.click());
  const set=context.readStudySets().sets[0];assert.equal(set.cards.length,3);assert.equal(new Set(set.cards.map(c=>c.id)).size,3);
  assert.equal(JSON.stringify(set.excludedIds),excluded);assert.equal(JSON.stringify(set.session),frozen);assert.equal(JSON.stringify(context.words),source);
  assert.equal(document.querySelector('#study-sets-import'),null);await afterAction(run('studySetsToggleEditMenu()'));
  assert.equal(document.querySelector('.study-sets-menu #study-sets-import'),null);
  assert.deepEqual([...document.querySelectorAll('.study-sets-edit-menu button')].map(n=>n.textContent),['이름 변경','책 추가','세트 삭제']);
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
