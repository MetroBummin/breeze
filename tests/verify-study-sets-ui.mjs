import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';

// Event-level UI checks only. Native focus trapping, browser history timing,
// pointer capture, layout and paint are covered by verify-study-sets-browser.mjs.
function harness(){
  const {window}=parseHTML('<!DOCTYPE html><html><body><section id="v-memory"><main id="study-sets-home-list"></main></section></body></html>');
  const {document}=window,storage=new Map();
  let focused=document.body;
  Object.defineProperty(document,'activeElement',{get:()=>focused});
  const history={state:{breeze:true,view:'vocab'},previous:{breeze:true,view:'vocab'},pushState(value){this.previous=this.state;this.state=value;},replaceState(value){this.state=value;},back(){
    this.state=this.previous;const event=new window.Event('popstate');event.state=this.state;window.dispatchEvent(event);
  }};
  const context={window,document,HTMLElement:window.HTMLElement,Element:window.Element,Node:window.Node,console,
    activeAppView:()=>context.currentView,currentView:'vocab',show:view=>{context.currentView=view;},history,words:{
      a:{word:'quiet',ko:'조용한',book:'One',example:'Stay quiet.',addedAt:1},
      b:{word:'quiet',ko:'조용한',book:'Two',addedAt:2},
      c:{word:'quiet',ko:'고요한',book:'Two',addedAt:3},
      d:{word:'direct',ko:'직접',book:'',addedAt:4}
    },validWordMeaning:item=>!!(item&&typeof item.ko==='string'&&item.ko.trim()),
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
  for(const path of ['scripts/core/study-sets.js','scripts/core/study-sets-storage.js','scripts/ui/study-sets.js'])
    vm.runInContext(readFileSync(new URL('../'+path,import.meta.url),'utf8'),context,{filename:path});
  const run=source=>vm.runInContext(source,context);
  const query=selector=>{const node=document.querySelector(selector);assert.ok(node,'Missing '+selector);return node;};
  const click=selector=>query(selector).click();
  const submit=selector=>query(selector).dispatchEvent(new window.Event('submit',{cancelable:true}));
  const button=label=>{const node=[...document.querySelectorAll('button')].find(item=>item.textContent===label);assert.ok(node,'Missing button '+label);node.click();};
  function createSet(name='My set',books=['One','Two']){
    run('openStudySets()');click('#study-sets-create');query('#study-sets-name').value=name;
    for(const node of document.querySelectorAll('.study-sets-book input'))if(books.includes(node.value)){
      node.checked=true;node.dispatchEvent(new window.Event('change'));
    }
    submit('#study-sets-create-form');
  }
  function createFromHome(name='Exam set',books=['One','Two']){
    context.currentView='memory';history.state={breeze:true,view:'memory'};run('renderStudySetsHome()');
    query('#study-sets-home-create').focus();click('#study-sets-home-create');query('#study-sets-name').value=name;
    for(const node of document.querySelectorAll('.study-sets-book input'))if(books.includes(node.value)){
      node.checked=true;node.dispatchEvent(new window.Event('change'));
    }
    submit('#study-sets-create-form');
  }
  return {context,storage,run,document,query,click,submit,button,createSet,createFromHome,window};
}

test('study set UI creates safe deduplicated snapshots, excludes with undo, imports explicitly, and repeats a frozen round',()=>{
  const {context,document,query,click,run,createSet}=harness();
  createSet('<img src=x onerror=alert(1)>');
  assert.equal(query('#study-sets-title').textContent,'<img src=x onerror=alert(1)>');
  assert.equal(document.querySelectorAll('img').length,0);
  assert.equal(document.querySelectorAll('#study-sets-word-list li').length,2);
  const source=JSON.stringify(context.words);
  click('.study-sets-row-action');assert.equal(document.querySelectorAll('#study-sets-word-list li').length,1);
  click('.study-sets-undo button');assert.equal(document.querySelectorAll('#study-sets-word-list li').length,2);
  click('#study-sets-start');assert.equal(query('#study-sets-progress').textContent,'1 / 2');assert.equal(query('#study-sets-answer').hidden,true);
  click('#study-sets-reveal');assert.equal(query('#study-sets-answer').hidden,false);
  assert.equal(document.activeElement.id,'study-sets-answer');click('#study-sets-grade-repeat');
  click('#study-sets-back');context.words.new={word:'new',ko:'새로운',book:'One',addedAt:8};run('studySetsReadAndRender()');
  assert.match(query('#study-sets-import').textContent,/1개/);assert.equal(document.querySelectorAll('#study-sets-word-list li').length,2);
  click('#study-sets-import');assert.equal(document.querySelectorAll('#study-sets-word-list li').length,3);
  click('#study-sets-start');assert.equal(query('#study-sets-progress').textContent,'2 / 2');
  click('#study-sets-reveal');click('#study-sets-grade-remembered');click('#study-sets-repeat-round');
  assert.equal(query('#study-sets-progress').textContent,'1 / 1');click('#study-sets-reveal');click('#study-sets-grade-remembered');
  assert.equal(document.querySelector('#study-sets-repeat-round'),null);
  assert.equal(JSON.stringify(Object.fromEntries(Object.entries(context.words).filter(([key])=>key!=='new'))),source);
  click('#study-sets-close');assert.equal(query('#study-sets-dialog').open,false);
  run('openStudySets()');assert.equal(document.querySelectorAll('.study-sets-list li').length,1);
});

test('failed storage keeps answer and form retryable; stale grade events cannot advance twice',()=>{
  const {context,query,click,run,storage,createSet}=harness();createSet();click('#study-sets-start');click('#study-sets-reveal');
  const before=storage.get('breeze.study-sets.v1'),staleGrade=query('#study-sets-grade-repeat');
  const nativeSet=context.localStorage.setItem;
  context.localStorage.setItem=()=>{throw new Error('Synthetic quota');};click('#study-sets-grade-repeat');
  assert.equal(query('#study-sets-answer').hidden,false);assert.equal(query('#study-sets-progress').textContent,'1 / 2');
  assert.equal(query('#study-sets-error').hidden,false);assert.equal(storage.get('breeze.study-sets.v1'),before);
  context.localStorage.setItem=nativeSet;click('#study-sets-error button');assert.equal(query('#study-sets-progress').textContent,'2 / 2');
  staleGrade.click();assert.equal(query('#study-sets-progress').textContent,'2 / 2');assert.equal(query('#study-sets-answer').hidden,true);
  click('#study-sets-back');run("studySetsGo('rename')");query('#study-sets-rename-input').value='Keep my input';
  context.localStorage.setItem=()=>{throw new Error('Synthetic quota');};
  query('form').dispatchEvent(new context.window.Event('submit',{cancelable:true}));
  assert.equal(query('#study-sets-rename-input').value,'Keep my input');assert.equal(query('#study-sets-error').hidden,false);
  context.localStorage.setItem=nativeSet;click('#study-sets-error button');assert.equal(query('#study-sets-title').textContent,'Keep my input');
});

test('directly-added words, exclusion restore, set deletion confirmation and source preservation',()=>{
  const {context,document,query,click,run,button,createSet}=harness();createSet('Direct',['']);
  assert.equal(document.querySelectorAll('#study-sets-word-list li').length,1);assert.match(query('#study-sets-word-list').textContent,/direct/);
  click('.study-sets-row-action');button('제외한 단어 1개');assert.equal(document.querySelectorAll('#study-sets-excluded-list li').length,1);
  click('.study-sets-row-action');click('#study-sets-back');assert.equal(document.querySelectorAll('#study-sets-word-list li').length,1);
  const source=JSON.stringify(context.words);button('세트 삭제');button('취소');assert.equal(query('#study-sets-title').textContent,'Direct');
  button('세트 삭제');button('세트 삭제');assert.equal(document.querySelectorAll('[data-set-id]').length,0);
  assert.equal(JSON.stringify(context.words),source);assert.equal(document.querySelectorAll('.study-sets-home-card').length,2);
  run('closeStudySets(true)');assert.equal(context.history.state.studySets,undefined);
});

test('horizontal swipe excludes; vertical movement and cancellation keep membership',()=>{
  const {document,query,window,createSet}=harness();createSet();
  const pointer=(row,type,x,y)=>{const event=new window.Event(type);Object.assign(event,{button:0,pointerId:1,clientX:x,clientY:y});row.dispatchEvent(event);};
  let row=query('#study-sets-word-list li');
  pointer(row,'pointerdown',240,20);pointer(row,'pointermove',230,90);pointer(row,'pointerup',140,100);
  assert.equal(document.querySelectorAll('#study-sets-word-list li').length,2);
  pointer(row,'pointerdown',240,20);pointer(row,'pointermove',130,20);pointer(row,'pointercancel',130,20);pointer(row,'pointerup',130,20);
  assert.equal(document.querySelectorAll('#study-sets-word-list li').length,2);
  pointer(row,'pointerdown',240,20);pointer(row,'pointermove',130,20);pointer(row,'pointerup',130,20);
  assert.equal(document.querySelectorAll('#study-sets-word-list li').length,1);assert.ok(query('.study-sets-undo button'));
});

test('damaged or future study storage is surfaced without replacement',()=>{
  for(const raw of ['{','null','{"version":99,"sequence":0,"sets":[]}']){
    const {storage,run,query}=harness();storage.set('breeze.study-sets.v1',raw);run('openStudySets()');
    assert.equal(query('#study-sets-error').hidden,false);assert.equal(storage.get('breeze.study-sets.v1'),raw);
    query('#study-sets-error button').click();assert.equal(storage.get('breeze.study-sets.v1'),raw);
  }
});


test('history jumps restore the destination page and forward restores modal background',()=>{
  const {context,window,query,run}=harness();
  // The real app has this independent navigation owner. The modal may consume
  // only its own one-layer dismissal, never navigation to another app view.
  window.addEventListener('popstate',event=>context.show(event.state?.breeze?event.state.view:'home'));
  const pop=state=>{context.history.state=state;const event=new window.Event('popstate');event.state=state;window.dispatchEvent(event);};
  run('openStudySets()');const modalState={...context.history.state};
  pop({breeze:true,view:'home'});
  assert.equal(query('#study-sets-dialog').open,false);assert.equal(context.currentView,'home');
  pop(modalState);assert.equal(context.currentView,'vocab');assert.equal(query('#study-sets-dialog').open,true);
  pop({breeze:true,view:'vocab'});assert.equal(context.currentView,'vocab');assert.equal(query('#study-sets-dialog').open,false);
});

test('a repeated pointer click after answer reveal is not an assessment',()=>{
  const {window,query,click,createSet}=harness();createSet();click('#study-sets-start');click('#study-sets-reveal');
  const secondClick=new window.Event('click');secondClick.detail=2;query('#study-sets-grade-repeat').dispatchEvent(secondClick);
  assert.equal(query('#study-sets-progress').textContent,'1 / 2');assert.equal(query('#study-sets-answer').hidden,false);
  click('#study-sets-grade-repeat');assert.equal(query('#study-sets-progress').textContent,'2 / 2');
});

test('Memory directory keeps all words first, appends sets and add, and enters the unchanged full wordbook',()=>{
  const {context,document,query,click,run,createFromHome}=harness();
  context.words.b.root='a';context.words.c.root='a';context.words.unresolved={word:'pending',ko:''};
  run('renderStudySetsHome()');
  assert.equal(query('#study-sets-all strong').textContent,'전체 단어 · 2개');
  assert.equal(document.querySelectorAll('.study-sets-home-cards>li').length,2);
  click('#study-sets-all');assert.equal(context.currentView,'vocab');assert.equal(document.querySelector('#study-sets-dialog'),null);
  createFromHome('시험 준비');
  const cards=[...document.querySelectorAll('.study-sets-home-card')];
  assert.equal(cards[0].id,'study-sets-all');assert.equal(cards[1].querySelector('strong').textContent,'시험 준비');
  assert.equal(cards[2].id,'study-sets-home-create');assert.match(cards[1].textContent,/2개 · 2권/);
  click('#study-sets-back');assert.equal(query('#study-sets-dialog').open,false);
  assert.equal(context.currentView,'memory');assert.equal(document.activeElement.id,'study-sets-home-create');
});

test('direct set cards preserve detail, nested Back, updated counts and focus after closing',()=>{
  const {context,document,query,click,button,submit,createFromHome}=harness();createFromHome();click('#study-sets-close');
  const card=query('.study-sets-home-card[data-set-id]');card.focus();card.click();
  assert.equal(query('#study-sets-title').textContent,'Exam set');assert.equal(context.history.state.studySetsHome,true);
  assert.equal(context.history.state.studySetsScreen,'detail');assert.equal(document.querySelector('.study-sets-list'),null);
  click('.study-sets-row-action');assert.match(query('.study-sets-home-card[data-set-id]').textContent,/1개/);
  button('제외한 단어 1개');click('.study-sets-row-action');click('#study-sets-back');
  assert.equal(query('#study-sets-title').textContent,'Exam set');assert.match(query('.study-sets-home-card[data-set-id]').textContent,/2개/);
  button('이름 변경');query('#study-sets-rename-input').value='Midterm';submit('form');
  assert.equal(query('.study-sets-home-card[data-set-id] strong').textContent,'Midterm');
  click('#study-sets-back');assert.equal(query('#study-sets-dialog').open,false);
  assert.equal(document.activeElement,query('.study-sets-home-card[data-set-id]'));assert.equal(context.currentView,'memory');
});

test('direct creation can cancel to Memory and deleting a set returns to its directory',()=>{
  const {context,document,query,click,button,createFromHome}=harness();createFromHome();click('#study-sets-close');
  query('#study-sets-home-create').focus();click('#study-sets-home-create');click('#study-sets-back');
  assert.equal(query('#study-sets-dialog').open,false);assert.equal(document.querySelectorAll('.study-sets-home-card[data-set-id]').length,1);
  const card=query('.study-sets-home-card[data-set-id]');card.focus();card.click();
  button('세트 삭제');button('취소');assert.equal(query('#study-sets-title').textContent,'Exam set');
  button('세트 삭제');button('세트 삭제');
  assert.equal(query('#study-sets-dialog').open,false);assert.equal(document.querySelectorAll('.study-sets-home-card[data-set-id]').length,0);
  assert.equal(document.activeElement.id,'study-sets-home-create');assert.equal(context.currentView,'memory');
});

test('Back and Forward restore the selected set over Memory including cross-view history jumps',()=>{
  const {context,window,query,click,createFromHome}=harness();createFromHome();
  window.addEventListener('popstate',event=>context.show(event.state?.breeze?event.state.view:'home'));
  const pop=state=>{context.history.state=state;const event=new window.Event('popstate');event.state=state;window.dispatchEvent(event);};
  const detailState={...context.history.state};assert.equal(detailState.view,'memory');
  click('#study-sets-close');assert.equal(query('#study-sets-dialog').open,false);
  pop(detailState);assert.equal(context.currentView,'memory');assert.equal(query('#study-sets-title').textContent,'Exam set');
  pop({breeze:true,view:'home'});assert.equal(query('#study-sets-dialog').open,false);assert.equal(context.currentView,'home');
  pop(detailState);assert.equal(context.currentView,'memory');assert.equal(query('#study-sets-title').textContent,'Exam set');
  click('#study-sets-back');assert.equal(query('#study-sets-dialog').open,false);
});

test('directory corruption preserves source access and recovers without mutating saved data',()=>{
  const {context,storage,document,query,click,run}=harness();const damaged='{"version":99,"sequence":0,"sets":[]}';
  storage.set('breeze.study-sets.v1',damaged);run('renderStudySetsHome()');
  assert.ok(query('.study-sets-home-error[role="alert"]'));assert.equal(query('#study-sets-home-create').disabled,true);
  click('.study-sets-home-error button');assert.equal(storage.get('breeze.study-sets.v1'),damaged);
  click('#study-sets-all');assert.equal(context.currentView,'vocab');
  storage.delete('breeze.study-sets.v1');click('.study-sets-home-error button');
  assert.equal(document.querySelector('.study-sets-home-error'),null);assert.equal(query('#study-sets-home-create').disabled,false);
});

test('storage refresh leaves an in-progress creation form intact and refreshes home set names',()=>{
  const {context,document,query,click,run,window,createFromHome}=harness();createFromHome();click('#study-sets-close');
  click('#study-sets-home-create');query('#study-sets-name').value='Keep typed Korean 한글';
  run("commitStudySets(BreezeStudySets.rename(readStudySets(),readStudySets().sets[0].id,'Renamed elsewhere',Date.now()).state)");
  const event=new window.Event('storage');event.key='breeze.study-sets.v1';window.dispatchEvent(event);
  assert.equal(query('#study-sets-name').value,'Keep typed Korean 한글');
  assert.equal(query('.study-sets-home-card[data-set-id] strong').textContent,'Renamed elsewhere');
  assert.equal(document.querySelectorAll('.study-sets-home-card[data-set-id]').length,1);assert.equal(context.currentView,'memory');
});
