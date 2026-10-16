import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
const source=readFileSync(new URL('../scripts/reader/pdf-ocr-library.js',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
function fixture({pages=80,stored=new Set(),result='done',gate=null}={}){
 const book={id:'A',kind:'pdf',sourceHash:'hash-A'},timers=new Map(),calls=[],events={};let id=0,live=0,peak=0,destroyed=0;
 const context={console,Map,Set,Array,JSON,Promise,queueMicrotask,books:[book],curBook:null,originalSession:null,
  setTimeout(fn){const key=++id;timers.set(key,fn);return key;},clearTimeout:key=>timers.delete(key),
  document:{hidden:false,querySelectorAll:()=>[],addEventListener:(name,fn)=>events[name]=fn},
  originalGetForBook:async()=>({hash:'hash-A',blob:{arrayBuffer:async()=>new ArrayBuffer(0)}}),ensurePdfLib:async()=>{},
  pdfjsLib:{getDocument:()=>({promise:Promise.resolve({numPages:pages,destroy:async()=>{destroyed++;}})})},
  currentPdfSession:()=>!!context.originalSession,pdfPagesInView:()=>[17],
  BreezePdfOcr:{available:()=>true,completed:async()=>new Set(stored),
   async background(_book,n,_pdf,valid){calls.push(n);live++;peak=Math.max(peak,live);if(gate)await gate.promise;live--;
    if(valid()&&result==='done')stored.add(n);return valid()?result:'retired';}}};
 vm.createContext(context);const api=vm.runInContext(source+'\nBreezePdfOcrLibrary;',context);
 async function tick(){const first=timers.entries().next().value;if(first){timers.delete(first[0]);first[1]();}await flush();}
 async function finish(){for(let i=0;timers.size&&i<pages+8;i++)await tick();}
 return {context,book,api,tick,finish,calls,stored,events,peak:()=>peak,destroyed:()=>destroyed};
}
test('80-page preparation persists every page with one active job and resumes after restart',async()=>{
 const f=fixture(),job=f.api.track(f.book);await f.finish();
 assert.equal(f.calls.length,80);assert.equal(f.stored.size,80);assert.equal(f.peak(),1);assert.equal(f.destroyed(),1);
 assert.deepEqual(JSON.parse(JSON.stringify(f.api.summary(job))),{done:80,total:80,complete:true});
 const reopen=fixture({stored:f.stored});reopen.api.track(reopen.book);await reopen.finish();assert.equal(reopen.calls.length,0);
});
test('current reading page has priority and reader close does not retire book work',async()=>{
 const f=fixture();f.context.curBook=f.book;f.context.originalSession={bookId:'A'};f.api.track(f.book);
 await f.tick();assert.equal(f.calls[0],17);f.context.originalSession=null;f.context.curBook=null;
 await f.finish();assert.equal(f.stored.size,80);
});
for(const result of ['storage','failed','blocked'])test(result+' cannot claim completion',async()=>{
 const f=fixture({pages:3,result}),job=f.api.track(f.book);await f.finish();
 assert.equal(job.state,'paused');assert.equal(f.api.summary(job).done,0);assert.equal(f.api.summary(job).complete,false);
 assert.equal(f.calls.length,1);
});
test('deleted pages are excluded from numerator and denominator',async()=>{
 const f=fixture({pages:4});f.book.deletedPdfPages=[2,4];const job=f.api.track(f.book);await f.finish();
 assert.deepEqual(f.calls,[1,3]);assert.equal(f.api.summary(job).total,2);assert.equal(f.api.summary(job).complete,true);
});
test('hidden app starts no work and resumes when visible',async()=>{
 const f=fixture({pages:2});f.context.document.hidden=true;f.api.track(f.book);await f.finish();assert.equal(f.calls.length,0);
 f.context.document.hidden=false;f.events.visibilitychange();await f.finish();assert.equal(f.calls.length,2);
});
for(const action of ['delete','replace'])test('in-flight '+action+' cannot write stale results',async()=>{
 let resolve;const promise=new Promise(r=>resolve=r),f=fixture({pages:2,gate:{promise}});
 f.api.track(f.book);await f.tick();assert.equal(f.calls.length,1);
 if(action==='delete'){f.api.forget('A');f.context.books=[];}else f.context.books=[{...f.book,sourceHash:'new-hash'}];
 resolve();await flush();assert.equal(f.stored.size,0);
});
test('missing local original does not download or loop',async()=>{
 const f=fixture();f.context.originalGetForBook=async()=>null;const job=f.api.track(f.book);await f.finish();
 assert.equal(job.state,'missing');assert.equal(f.calls.length,0);
});
test('an open reader keeps background parsing off this book until resume',async()=>{
 const f=fixture({pages:3}),job=f.api.track(f.book);
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
 const f=fixture({pages:2});
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
 const f=fixture({pages:1});
 f.context.window={BREEZE_PDF_OCR_YIELD:false};
 f.api.track(f.book);
 f.api.yieldToReader('A');
 assert.equal(f.api.adoptForReader('A'),null);
 await f.finish();
 assert.equal(f.calls.length,1);
});
test('cover flag stays off unless ring, fill, or chip is selected',()=>{
 const f=fixture();
 assert.equal(f.api.coverMode(),'off');
 f.context.location={search:'?ocrCover=RING'};
 f.context.localStorage={getItem:()=>'chip'};
 assert.equal(f.api.coverMode(),'ring');
 f.context.location={search:''};
 assert.equal(f.api.coverMode(),'chip');
 f.context.localStorage.getItem=()=>'shimmer';
 assert.equal(f.api.coverMode(),'off');
 f.context.localStorage.getItem=()=>{throw new Error('private');};
 assert.equal(f.api.coverMode(),'off');
});
test('successful same-hash reconnect explicitly restarts missing original work',async()=>{
 const f=fixture({pages:2}),original=f.context.originalGetForBook;
 f.context.originalGetForBook=async()=>null;const job=f.api.track(f.book);await f.finish();assert.equal(job.state,'missing');
 f.context.originalGetForBook=original;f.api.track(f.book,{restart:true});await f.finish();assert.equal(f.api.summary(job).complete,true);
});
