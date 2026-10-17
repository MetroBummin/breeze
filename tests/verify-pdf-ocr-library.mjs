import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
const source=readFileSync(new URL('../scripts/reader/pdf-ocr-library.js',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
function fixture({pages=80,stored=new Set(),result='done',gate=null,ocr={}}={}){
 const book={id:'A',kind:'pdf',sourceHash:'hash-A'},timers=new Map(),calls=[],events={};let id=0,live=0,peak=0,destroyed=0;
 const context={console,Map,Set,Array,JSON,Promise,queueMicrotask,books:[book],curBook:null,originalSession:null,
  setTimeout(fn){const key=++id;timers.set(key,fn);return key;},clearTimeout:key=>timers.delete(key),
  document:{hidden:false,querySelectorAll:()=>[],addEventListener:(name,fn)=>events[name]=fn},
  originalGetForBook:async()=>({hash:'hash-A',blob:{arrayBuffer:async()=>new ArrayBuffer(0)}}),ensurePdfLib:async()=>{},
  pdfjsLib:{getDocument:()=>({promise:Promise.resolve({numPages:pages,destroy:async()=>{destroyed++;}})})},
  currentPdfSession:()=>!!context.originalSession,pdfPagesInView:()=>[17],
  BreezePdfOcr:{available:()=>true,completed:async()=>new Set(stored),
   async background(_book,n,_pdf,valid){calls.push(n);live++;peak=Math.max(peak,live);if(gate)await gate.promise;live--;
    if(valid()&&(result==='done'||result==='scan'))stored.add(n);return valid()?result:'retired';},...ocr}};
 vm.createContext(context);const api=vm.runInContext(source+'\nBreezePdfOcrLibrary;',context);
 async function tick(){const first=timers.entries().next().value;if(first){timers.delete(first[0]);first[1]();}await flush();}
 async function finish(){for(let i=0;timers.size&&i<pages+8;i++)await tick();}
 return {context,book,api,tick,finish,calls,stored,events,peak:()=>peak,destroyed:()=>destroyed};
}
const open=f=>{f.context.curBook=f.book;return f;};
test('80-page preparation persists every page with one active job and resumes after restart',async()=>{
 const f=open(fixture()),job=f.api.track(f.book);await f.finish();
 assert.equal(f.calls.length,80);assert.equal(f.stored.size,80);assert.equal(f.peak(),1);assert.equal(f.destroyed(),1);
 assert.deepEqual(JSON.parse(JSON.stringify(f.api.summary(job))),{done:80,total:80,complete:true});
 const reopen=open(fixture({stored:f.stored}));reopen.api.track(reopen.book);await reopen.finish();assert.equal(reopen.calls.length,0);
});
test('current reading page has priority and reader close does not retire book work',async()=>{
 const f=fixture();f.context.curBook=f.book;f.context.originalSession={bookId:'A'};f.api.track(f.book);
 await f.tick();assert.equal(f.calls[0],17);f.context.originalSession=null;f.context.curBook=null;
 await f.finish();assert.equal(f.stored.size,80);
});
for(const result of ['storage','failed','blocked'])test(result+' cannot claim completion',async()=>{
 const f=open(fixture({pages:3,result})),job=f.api.track(f.book);await f.finish();
 assert.equal(job.state,'paused');assert.equal(f.api.summary(job).done,0);assert.equal(f.api.summary(job).complete,false);
 assert.equal(f.calls.length,1);
});
test('deleted pages are excluded from numerator and denominator',async()=>{
 const f=open(fixture({pages:4}));f.book.deletedPdfPages=[2,4];const job=f.api.track(f.book);await f.finish();
 assert.deepEqual(f.calls,[1,3]);assert.equal(f.api.summary(job).total,2);assert.equal(f.api.summary(job).complete,true);
});
test('hidden app starts no work and resumes when visible',async()=>{
 const f=open(fixture({pages:2}));f.context.document.hidden=true;f.api.track(f.book);await f.finish();assert.equal(f.calls.length,0);
 f.context.document.hidden=false;f.events.visibilitychange();await f.finish();assert.equal(f.calls.length,2);
});
for(const action of ['delete','replace'])test('in-flight '+action+' cannot write stale results',async()=>{
 let resolve;const promise=new Promise(r=>resolve=r),f=open(fixture({pages:2,gate:{promise}}));
 f.api.track(f.book);await f.tick();assert.equal(f.calls.length,1);
 if(action==='delete'){f.api.forget('A');f.context.books=[];}else f.context.books=[{...f.book,sourceHash:'new-hash'}];
 resolve();await flush();assert.equal(f.stored.size,0);
});
test('missing local original does not download or loop',async()=>{
 const f=open(fixture());f.context.originalGetForBook=async()=>null;const job=f.api.track(f.book);await f.finish();
 assert.equal(job.state,'missing');assert.equal(f.calls.length,0);
});
test('an open reader keeps background parsing off this book until resume',async()=>{
 const f=open(fixture({pages:3})),job=f.api.track(f.book);
 f.api.yieldToReader('A');
 await f.tick();
 assert.equal(f.calls.length,0);
 assert.equal(job.state,'queued');
 f.api.resumeReader('A');
 await f.finish();
 assert.equal(f.calls.length,3);
 assert.equal(f.api.summary(job).complete,true);
});
test('the reader adopts a document background recognition already parsed',async()=>{
 const f=open(fixture({pages:2}));
 let opens=0;
 const inner=f.context.pdfjsLib.getDocument;
 f.context.pdfjsLib.getDocument=()=>{opens++;return inner();};
 f.api.track(f.book);
 await f.tick();
 const pdf=f.api.adoptForReader('A');
 assert.ok(pdf);
 assert.equal(opens,1);
 await f.tick();
 assert.equal(f.calls.length,1);
 f.api.resumeReader('A');
 await f.finish();
 assert.equal(f.api.summary(f.api.track(f.book)).complete,true);
});
test('the yield kill flag leaves background preparation on the old schedule',async()=>{
 const f=open(fixture({pages:1}));
 f.context.window={BREEZE_PDF_OCR_YIELD:false};
 f.api.track(f.book);
 f.api.yieldToReader('A');
 assert.equal(f.api.adoptForReader('A'),null);
 await f.finish();
 assert.equal(f.calls.length,1);
});
test('the cover is the shelf unless it is turned off',()=>{
 const f=fixture();
 assert.equal(f.api.coverMode(),'fill');
 f.context.location={search:'?ocrCover=off'};
 f.context.localStorage={getItem:()=>'fill'};
 assert.equal(f.api.coverMode(),'off');
 f.context.location={search:'?ocrCover=FILL'};
 f.context.localStorage.getItem=()=>'off';
 assert.equal(f.api.coverMode(),'fill');
 f.context.location={search:'?ocrCover=on'};
 assert.equal(f.api.coverMode(),'fill');
 f.context.location={search:'?ocrCover=ring'};
 assert.equal(f.api.coverMode(),'fill');
 f.context.location={search:''};
 f.context.localStorage.getItem=()=>'off';
 assert.equal(f.api.coverMode(),'off');
 f.context.localStorage.getItem=()=>'chip';
 assert.equal(f.api.coverMode(),'fill');
 f.context.localStorage.getItem=()=>{throw new Error('private');};
 assert.equal(f.api.coverMode(),'fill');
});
test('successful same-hash reconnect explicitly restarts missing original work',async()=>{
 const f=open(fixture({pages:2})),original=f.context.originalGetForBook;
 f.context.originalGetForBook=async()=>null;const job=f.api.track(f.book);await f.finish();assert.equal(job.state,'missing');
 f.context.originalGetForBook=original;f.api.track(f.book,{restart:true});await f.finish();assert.equal(f.api.summary(job).complete,true);
});
test('an unopened shelf prepares nothing, then only the opened book',async()=>{
 const f=fixture({pages:2}),other={id:'B',kind:'pdf',sourceHash:'hash-B'};
 f.context.books.push(other);f.api.track(f.book);f.api.track(other);await f.finish();
 assert.equal(f.calls.length,0);
 f.context.curBook=f.book;f.api.wake();await f.finish();
 assert.deepEqual(f.calls,[1,2]);
});
test('reading paint and shelf scroll hold preparation until idle',async()=>{
 const painting=open(fixture({pages:2}));
 painting.context.originalSession={bookId:'A',paintActive:true};
 painting.api.track(painting.book);await painting.tick();
 assert.equal(painting.calls.length,0);
 painting.context.originalSession.paintActive=false;await painting.finish();
 assert.deepEqual(painting.calls,[1,2]);
 const scrolling=open(fixture({pages:2}));
 scrolling.api.track(scrolling.book);
 scrolling.events.scroll({target:{nodeType:1,closest:()=>true}});
 await scrolling.tick();assert.equal(scrolling.calls.length,0);
 await scrolling.finish();assert.deepEqual(scrolling.calls,[1,2]);
});
test('kill flag restores shelf-wide preparation without opening a book',async()=>{
 const f=fixture({pages:2,ocr:{laneOn:()=>false}});
 f.api.track(f.book);await f.finish();
 assert.deepEqual(f.calls,[1,2]);
});
test('reuses the open reader document and never destroys it',async()=>{
 let created=0;const f=open(fixture({pages:2}));
 const shared={numPages:2,destroy:async()=>{throw new Error('shared destroy');}};
 f.context.pdfjsLib.getDocument=()=>{created++;return {promise:Promise.resolve({numPages:2,destroy:async()=>{}})};};
 f.context.originalSession={kind:'pdf',bookId:'A',hash:'hash-A',pdf:shared};
 f.api.track(f.book);await f.finish();
 assert.equal(created,0);assert.deepEqual(f.calls,[1,2]);assert.equal(f.destroyed(),0);
});
test('a reader that is still opening does not load a second document',async()=>{
 let created=0;const f=open(fixture({pages:2}));
 f.context.pdfjsLib.getDocument=()=>{created++;return {promise:Promise.resolve({numPages:2,destroy:async()=>{}})};};
 f.context.originalOpenJob={bookId:'A'};
 f.api.track(f.book);await f.tick();
 assert.equal(created,0);assert.equal(f.calls.length,0);
 f.context.originalOpenJob=null;
 f.context.originalSession={kind:'pdf',bookId:'A',hash:'hash-A',pdf:{numPages:2,destroy:async()=>{throw new Error('shared destroy');}}};
 await f.finish();
 assert.equal(created,0);assert.deepEqual(f.calls,[1,2]);
});
test('stuck native keeps retry disabled until that request finishes',async()=>{
 let settled=false;
 const f=open(fixture({pages:2,result:'blocked',ocr:{
  nativeHold:()=>({id:'req-9',expired:true}),
  nativeSettled:async id=>id==='req-9'&&settled}}));
 function HTMLElement(){}
 f.context.HTMLElement=HTMLElement;
 const span={textContent:''},bar={max:1,value:0,removeAttribute(){this.value=undefined;}},button={hidden:true,disabled:false};
 const node=Object.create(HTMLElement.prototype);
 node.dataset={ocrBook:'A'};node.hidden=false;node.setAttribute=()=>{};
 node.querySelector=sel=>sel==='span'?span:sel==='progress'?bar:button;
 f.context.document.querySelectorAll=()=>[node];
 const job=f.api.track(f.book);await f.tick();
 assert.equal(job.state,'paused');assert.equal(job.stuck,'req-9');assert.equal(f.calls.length,1);
 assert.equal(span.textContent,'앱 완전 종료 후 다시 열기 · 0/2쪽');
 assert.equal(button.hidden,false);assert.equal(button.disabled,true);
 f.api.track(f.book,{restart:true});
 assert.equal(job.state,'paused');assert.equal(f.calls.length,1);
 await f.tick();await f.tick();
 assert.equal(job.stuck,'req-9');assert.equal(f.calls.length,1);
 settled=true;await f.tick();
 assert.equal(job.stuck,'');assert.equal(job.state,'paused');assert.equal(button.disabled,false);
 assert.equal(span.textContent,'글자 인식 일시 중지 · 0/2쪽');
 assert.equal(f.calls.length,1);
 f.api.track(f.book,{restart:true});await f.tick();
 assert.equal(f.calls.length,2);assert.equal(job.stuck,'req-9');
});
function shelfDom(context){
 function HTMLElement(){}
 context.HTMLElement=HTMLElement;
 const nodes=[];
 const match=(node,sel)=>sel==='[data-ocr-book]'?!!node.dataset.ocrBook
  :sel==='[data-ocr-surface="bar"]'?node.dataset.ocrSurface==='bar'
  :sel==='[data-ocr-surface="cover"]'?node.dataset.ocrSurface==='cover'
  :sel==='.bookcard'?node.className.split(/\s+/).includes('bookcard')
  :sel==='button'?node.tag==='button'
  :sel==='.book-ocr-label'?node.className.split(/\s+/).includes('book-ocr-label')
  :sel==='.book-ocr-fill i'?node.tag==='i'
  :sel==='span'?node.tag==='span'
  :sel==='progress'?node.tag==='progress'
  :false;
 function wrap(tag){
  const node=Object.assign(Object.create(HTMLElement.prototype),{tag,className:'',hidden:false,dataset:{},children:[],style:{},textContent:'',ariaLabel:'',
   setAttribute(name,value){if(name==='aria-label')this.ariaLabel=value;},
   append(...kids){for(const kid of kids){kid.parent=this;this.children.push(kid);}},
   queryAll(sel){return (match(this,sel)?[this]:[]).concat(this.children.flatMap(kid=>kid.queryAll?kid.queryAll(sel):[]));},
   querySelector(sel){return this.queryAll(sel)[0]||null;},
   addEventListener(){},
   remove(){if(this.parent)this.parent.children=this.parent.children.filter(kid=>kid!==this);}});
  nodes.push(node);return node;
 }
 context.document.createElement=wrap;
 context.document.querySelectorAll=sel=>nodes.filter(node=>match(node,sel));
 return {createElement:wrap};
}
function mounted(f){
 const dom=shelfDom(f.context),tile=dom.createElement('div'),card=dom.createElement('div');
 card.className='bookcard editorial-cover';tile.append(card);f.api.mount(tile,f.book);
 return {tile,card,cover:()=>card.querySelector('[data-ocr-surface="cover"]')};
}
test('an epub or text file is not an OCR job',()=>{
 const f=fixture();
 assert.equal(f.api.track({id:'E',kind:'epub',sourceHash:'h'}),null);
 assert.equal(f.api.track({id:'T',kind:'txt',sourceHash:'h'}),null);
});
test('the cover stays hidden until a scanned page is pending',async()=>{
 const quiet=fixture({pages:2});const unopened=mounted(quiet);
 await quiet.finish();
 assert.equal(quiet.calls.length,0);
 assert.equal(unopened.tile.querySelector('[data-ocr-surface="bar"]'),null);
 assert.equal(unopened.cover().hidden,true);
 const text=open(fixture({pages:2}));const textShelf=mounted(text);
 await text.tick();assert.equal(textShelf.cover().hidden,true);
 await text.finish();assert.equal(textShelf.cover().hidden,true);assert.equal(text.api.summary(text.api.track(text.book)).complete,true);
 const scan=open(fixture({pages:2,result:'scan'}));const shelf=mounted(scan);
 assert.equal(shelf.cover().hidden,true);
 await scan.tick();
 assert.equal(shelf.cover().hidden,false);
 assert.equal(shelf.cover().querySelector('.book-ocr-label').textContent,'글자 스캔 중');
 await scan.finish();
 assert.equal(shelf.cover().hidden,true);
 assert.equal(scan.api.summary(scan.api.track(scan.book)).complete,true);
});
