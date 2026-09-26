import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const notices=read('scripts/ui/reader-notifications.js');
function declaration(path,name){
  const found=read(path).match(new RegExp('^(?:async )?function '+name+'\\([^]*?^\\}', 'm'));
  assert.ok(found,'Missing production function '+name);return found[0];
}
function environment(extra={}){
  let now=1000,id=0,view='home',blocked=false;
  const timers=new Map(),nodes=new Map(),listeners=new Map(),history=[];
  function node(name){
    if(!nodes.has(name)){
      let text='';const classes=new Set();
      nodes.set(name,{hidden:true,classList:{contains:key=>classes.has(key),add:key=>classes.add(key),remove:key=>classes.delete(key)},
        get textContent(){return text;},set textContent(value){text=value;history.push({at:now,node:name,text:value});}});
    }
    return nodes.get(name);
  }
  const context=createContext({console:{warn(){},error(){}},Promise,Map,Set,Uint8Array,
    Date:class extends Date {static now(){return now;}},
    setTimeout:(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id;},clearTimeout:key=>timers.delete(key),
    document:{hidden:false,body:node('body'),getElementById:node,
      querySelector:()=>blocked?{}:null,querySelectorAll:()=>[],
      addEventListener:(event,fn)=>listeners.set(event,fn)},
    window:{addEventListener(){}},MutationObserver:class{observe(){}},
    activeAppView:()=>view,curBook:null,chromePinned:false,chromeHoldUntil:0,readerScrollPauseUntil:0,
    activeGesture:null,homeResumeOpening:false,sentenceLookupOpen:()=>false,wordLookupOpen:()=>false,originalPinchBusy:()=>false,
    toast:text=>history.push({at:now,node:'toast',text}),...extra,
  });
  runInContext(notices+'\nglobalThis.notices=readerNotices;',context);
  function advance(ms){
    const target=now+ms;let count=0;
    for(;;){
      const next=[...timers].filter(([,timer])=>timer.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!next)break;assert.ok(++count<10000,'Timer failed to settle');
      timers.delete(next[0]);now=next[1].at;next[1].fn();
    }
    now=target;
  }
  return {context,history,timers,advance,node,notice:context.notices,
    text:()=>node(view==='read'?'reader-notice':'home-notice').textContent,
    block:value=>{blocked=value;},navigate:next=>{view=next;context.notices.reset();},
    input:()=>listeners.get('pointerdown')()};
}

test('fast PDF progress is replaced immediately and completion never replays old counts',()=>{
  const e=environment(),task=e.notice.task();task.progress('책을 준비하고 있어요…');
  for(const page of [1,20,40,60,80]){e.advance(100);task.progress(`${page}/80쪽`);assert.equal(e.text(),`${page}/80쪽`);}
  task.finish('추가 완료');const end=e.history.length;
  assert.equal(e.text(),'추가 완료');e.advance(60000);
  assert.ok(!e.history.slice(end).some(row=>/쪽|준비/.test(row.text)));
  assert.equal(e.timers.size,0);
});
test('blocked input retains only latest progress and then only the terminal result',()=>{
  const e=environment();e.block(true);const task=e.notice.task();
  for(let page=1;page<=500;page++)task.progress(`${page}/500쪽`);
  task.finish('저장 완료');task.progress('late progress');
  assert.equal(e.node('home-notice').hidden,true);
  e.block(false);e.advance(150);assert.equal(e.text(),'저장 완료');
  e.advance(10000);assert.ok(!e.history.some(row=>/쪽|late/.test(row.text)));
});
test('input interrupts active progress; completion replaces the requeued item',()=>{
  const e=environment(),task=e.notice.task();task.progress('1쪽');
  e.input();assert.equal(e.node('home-notice').hidden,true);
  task.progress('40쪽');task.finish('완료');
  assert.equal(e.node('home-notice').hidden,true);e.advance(750);
  assert.equal(e.text(),'완료');
});
test('terminal errors and duplicate results cannot be overwritten by late progress',()=>{
  for(const terminal of ['저장 실패','이미 있는 책이에요']){
    const e=environment(),task=e.notice.task();task.progress('20쪽');task.finish(terminal);
    task.progress('40쪽');task.finish('unexpected second finish');assert.equal(e.text(),terminal);
  }
});
test('concurrent tasks keep independent slots even with identical initial messages',()=>{
  const e=environment(),a=e.notice.task(),b=e.notice.task();
  a.progress('준비 중');b.progress('준비 중');b.progress('B 80쪽');a.finish('A 완료');
  assert.equal(e.text(),'A 완료');e.advance(4000);assert.equal(e.text(),'B 80쪽');
  b.finish('B 실패');a.progress('A stale');assert.equal(e.text(),'B 실패');
});
test('ordinary notices keep FIFO order, deduplication, expiry and queue bounds',()=>{
  const e=environment();e.notice.enqueue('First',2600);e.notice.enqueue('First',2600);
  e.notice.enqueue('Second',2600);assert.equal(e.text(),'First');e.advance(4000);assert.equal(e.text(),'Second');
  e.notice.reset();e.block(true);for(let i=0;i<25;i++)e.notice.enqueue('Queued '+i,2600);
  e.block(false);e.advance(150);assert.equal(e.text(),'Queued 5');
  e.advance(70000);assert.equal(e.timers.size,0);
});
test('finishing one task neither deletes nor preempts unrelated ordinary notices',()=>{
  const e=environment();e.notice.enqueue('Unrelated',2600);const task=e.notice.task();
  task.progress('1쪽');task.finish('Added');e.notice.enqueue('Later',2600);
  assert.equal(e.text(),'Unrelated');e.advance(4000);assert.equal(e.text(),'Added');
  e.advance(4000);assert.equal(e.text(),'Later');
});
test('navigation resets suppress old progress and results, not the next operation',()=>{
  const e=environment(),old=e.notice.task();old.progress('1쪽');
  e.navigate('longform');const current=e.notice.task();current.progress('New book');
  old.progress('Old 40쪽');old.finish('Old complete');assert.equal(e.text(),'New book');
  current.finish('New complete');assert.equal(e.text(),'New complete');
});
test('task messages are text, not markup',()=>{
  const e=environment(),task=e.notice.task();task.progress('<img src=x onerror=alert(1)>');
  assert.equal(e.text(),'<img src=x onerror=alert(1)>');
});

test('production PDF parser reports through its callback without changing its page loop',async()=>{
  const e=environment(),seen=[],fallback=[],pages=[];let destroyed=0;
  Object.assign(e.context,{toast:message=>fallback.push(message),ensurePdfLib:async()=>{},
    pdfjsLib:{getDocument:()=>({promise:Promise.resolve({numPages:80,getPage:async i=>{
      pages.push(i);return {getViewport:()=>({height:800,width:600}),getTextContent:async()=>({items:[]})};
    },destroy:async()=>destroyed++})})},pdfPageColumns:()=>[],assembleParagraphs:()=>[]});
  runInContext(declaration('scripts/importers/importers.js','parsePDF'),e.context);
  const file={arrayBuffer:async()=>new ArrayBuffer(0)};
  await e.context.parsePDF(file,message=>seen.push(message));
  assert.deepEqual(seen.map(text=>Number(text.match(/(\d+)\/80/)[1])),[1,20,40,60,80]);
  assert.equal(fallback.length,0);assert.equal(pages.length,80);assert.equal(destroyed,1);
  await e.context.parsePDF(file);assert.equal(fallback.length,5);
});

function importEnvironment({kind='pdf',parseFailure=false,saveFailure=false,originalFailure=false,existing=null,delaySave=null}={}){
  const events={persisted:[],refreshes:0,preparationOptions:null};
  const prepared={id:'file-test',title:'Test',kind,hash:'a'.repeat(64),tmpId:'tmp',paras:['English text.'],
    fingerprint:'fingerprint',textAvailable:true,size:100,lastModified:0};
  const e=environment({books:existing?[existing]:[],vaultRemoteItems:[],positions:{},
    prepareImportedFile:async(_file,options)=>{
      events.preparationOptions=options;
      for(const page of [1,20,40,80])options.onProgress(`${page}/80쪽`);
      if(parseFailure)throw Error('Parse failure');return prepared;
    },
    originalBookForHash:async()=>null,applyPreparedBook:async()=>{},
    vaultFileIdentity:async()=>null,imgRename:async()=>{},imgPurge:async()=>{},remapImportedImages:p=>p,
    storeLocalOriginal:async()=>{if(originalFailure)throw Error('Original failure');return kind==='txt'?null:{storedAt:1};},
    bookPut:async book=>{if(delaySave)await delaySave;if(saveFailure)throw Error('Save failure');events.persisted.push(book);},
    renderAllBookViews:()=>events.refreshes++,
    renderHome:()=>assert.fail('Import repainted hidden Home instead of current shelf'),
  });
  runInContext(declaration('scripts/library/library.js','importFile'),e.context);
  return {...e,events,prepared,file:{name:'Test.'+kind}};
}
for(const kind of ['pdf','epub','txt'])test(`${kind} addition completes with one result and refreshes the visible shelf`,async()=>{
  const e=importEnvironment({kind});e.navigate('longform');
  await e.context.importFile(e.file);assert.equal(e.events.persisted.length,1);assert.equal(e.events.refreshes,1);
  assert.equal(e.context.books.length,1);assert.match(e.text(),/추가 완료/);
  const end=e.history.length;e.advance(15000);assert.ok(!e.history.slice(end).some(row=>row.text.includes('쪽')));
});
for(const failure of ['parseFailure','saveFailure'])test(`${failure} does not leave progress or report success`,async()=>{
  const e=importEnvironment({[failure]:true});await e.context.importFile(e.file);
  assert.equal(e.context.books.length,0);assert.equal(e.events.refreshes,0);assert.match(e.text(),/파일을 읽지 못했어요/);
  const end=e.history.length;e.advance(15000);assert.ok(!e.history.slice(end).some(row=>/쪽|추가 완료/.test(row.text)));
});
test('partial original-storage warning is shown only after the book is actually saved',async()=>{
  let release;const pending=new Promise(done=>release=done);
  const e=importEnvironment({originalFailure:true,delaySave:pending});
  const job=e.context.importFile(e.file);await new Promise(done=>setImmediate(done));
  assert.equal(e.context.books.length,0);assert.ok(!e.history.some(row=>row.text.includes('책은 추가했지만')));
  release();await job;assert.equal(e.events.persisted.length,1);
  assert.match(e.text(),/책은 추가했지만 원본 파일/);assert.ok(!e.history.some(row=>row.text.includes('추가 완료!')));
});
test('duplicate TXT replaces progress but does not add another record',async()=>{
  const e=importEnvironment({kind:'txt',existing:{id:'file-test',title:'Saved'}});
  await e.context.importFile(e.file);assert.equal(e.events.persisted.length,0);
  assert.equal(e.context.books.length,1);assert.match(e.text(),/이미 있는 책/);
});
test('existing PDF reconnect refreshes current shelf and keeps one book',async()=>{
  const e=importEnvironment({existing:{id:'file-test',title:'Saved'}});
  await e.context.importFile(e.file);assert.equal(e.context.books.length,1);
  assert.equal(e.events.refreshes,1);assert.match(e.text(),/기존 책에 원본을 연결/);
});
test('import continues after navigation but its old notifications do not follow',async()=>{
  let release;const pending=new Promise(done=>release=done);
  const e=importEnvironment({delaySave:pending});const job=e.context.importFile(e.file);
  await new Promise(done=>setImmediate(done));e.navigate('longform');release();await job;
  assert.equal(e.context.books.length,1);assert.equal(e.events.refreshes,1);assert.equal(e.text(),'');
});
