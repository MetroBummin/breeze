import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
const source=readFileSync(new URL('../scripts/reader/pdf-ocr.js',import.meta.url),'utf8');
const word=(word='Bright',extra={})=>({word,line:0,x:.1,y:.2,w:.2,h:.04,confidence:.9,...extra});
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {resolve,reject,promise};};
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function fixture({supported=true,cache=new Map()}={}){
 const timers=new Map(),calls=[],paints=[],canvases=[],toasts=[];let next=0;
 const session={kind:'pdf',bookId:'A',hash:'hash-A',pages:[1,2,3].map(n=>({isConnected:true,dataset:{page:String(n)}})),wordBoxes:new Map([[1,[]],[2,[]],[3,[]]]),settled:new Set([1,2,3])};
 const native={recognize(args){const job=defer();calls.push({args,...job});return job.promise;}};
 const context={Map,Set,WeakMap,console,Number,Date,
  setTimeout(fn){const id=++next;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
  openDb:()=>async()=>({}),localTransaction:async(_db,_store,mode,run)=>{
   let result;const pending=[];
   const request=value=>{const rq={result:value};pending.push(()=>rq.onsuccess?.());return rq;};
   const cursor=(entries)=>{
    let i=0;const rq={};const step=()=>{const row=entries[i++];rq.result=row?{primaryKey:row[0],value:row[1],delete:()=>cache.delete(row[0]),continue:()=>pending.push(step)}:null;rq.onsuccess?.();};pending.push(step);return rq;
   };
   const store={count:()=>request(cache.size),index:()=>({openKeyCursor:()=>cursor([...cache].sort((a,b)=>a[1].at-b[1].at))}),openCursor:()=>cursor([...cache]),get:k=>request(cache.get(k)),put:(v,k)=>cache.set(k,v),delete:k=>cache.delete(k),
    getAll:()=>request([...cache.values()]),getAllKeys:()=>request([...cache.keys()])};
   run({objectStore:()=>store},value=>result=value);for(const fn of pending)fn();return result;
  },
  window:{Capacitor:{isNativePlatform:()=>supported,getPlatform:()=> 'ios',isPluginAvailable:()=>supported,registerPlugin:()=>native}},
  document:{hidden:false,addEventListener(){},createElement(){const canvas={width:0,height:0,getContext:()=>({}),toDataURL:()=> 'data:image/png;base64,cGFnZQ=='};canvases.push(canvas);return canvas;}},
  originalSession:session,visible:[1],paused:false,busy:false,
  currentPdfSession:s=>!!s&&s===context.originalSession,ownsPdfPage:(p,s)=>s===context.originalSession&&s.pages.includes(p)&&p.isConnected,
  pdfPagesInView:()=>context.visible,originalPdfPaintPaused:()=>context.paused,pdfScrollBusy:()=>context.busy,
  renderPdfSavedWordMarkers:(p,boxes)=>paints.push({p,boxes}),toast:m=>toasts.push(m),pdfjsLib:{AnnotationMode:{DISABLE:0}}};
 session.pdf={getPage:async()=>({getViewport:({scale})=>({width:600*scale,height:800*scale}),
   render:()=>({promise:Promise.resolve(),cancel(){}}),cleanup(){}})};
 vm.createContext(context);const ocr=vm.runInContext(source+'\nBreezePdfOcr;',context);
 async function inspect(n=1,items=[],boxes=[]){await ocr.inspect(session,n,{getTextContent:async()=>({items})},boxes,()=>context.originalSession===session);}
 async function tick(){const item=timers.entries().next().value;if(item){timers.delete(item[0]);item[1]();}await flush();}
 async function start(){ocr.schedule(session);await tick();}
 return {context,session,ocr,inspect,tick,start,calls,paints,timers,cache,canvases,toasts};
}
test('word adapter rejects unsafe/uncertain geometry and preserves line/occurrence positions',()=>{
 const f=fixture();const boxes=f.ocr.boxesFromWords([word(),word('world',{x:.5}),word('Other',{line:1,y:.3}),word('wrong',{confidence:.1}),word('bad',{x:-1}),word('bad',{w:NaN}),word('<img>'),word('bad',{x:.99,w:.2})]);
 assert.deepEqual(Array.from(boxes,b=>b.word),['Bright','world','Other']);
 assert.equal(boxes[0].example,'Bright world');assert.equal(boxes[1].tokenIndex,1);
 assert.equal(boxes[2].sentenceStart,13);assert.equal(boxes[2].example,'Other');
 assert.throws(()=>f.ocr.boxesFromWords({words:[]}));assert.throws(()=>f.ocr.boxesFromWords(Array(3001).fill(word())));
});
test('existing text, including non-English text with zero English boxes, never invokes OCR',async()=>{
 const f=fixture();await f.inspect(1,[{str:'한글'}]);await f.inspect(2,[],[{word:'text'}]);await f.start();
 assert.equal(f.calls.length,0);assert.equal(f.session.pages[0].dataset.ocr,undefined);
});
test('only the visible page enters OCR; repeated taps and scheduling share one native call',async()=>{
 const f=fixture();await f.inspect(1);await f.inspect(2);await f.start();
 for(let i=0;i<8;i++){assert.equal(f.ocr.tap(f.session,1),true);await f.tick();}
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].args.image,'cGFnZQ==');
 assert.ok(f.canvases.every(c=>c.width===0&&c.height===0));
 f.calls[0].resolve({words:[word()]});await flush();await f.tick();
 assert.equal(f.paints.length,1);assert.equal(f.session.wordBoxes.get(1)[0].word,'Bright');assert.equal(f.session.wordBoxes.get(2).length,0);
});
test('fast page switching defers old-page paint and starts only the latest visible page',async()=>{
 const f=fixture();for(const n of [1,2,3])await f.inspect(n);await f.start();
 f.context.visible=[2];await f.start();f.context.visible=[3];await f.start();assert.equal(f.calls.length,1);
 f.calls[0].resolve({words:[word('Old')]});await flush();await f.tick();
 assert.equal(f.paints.length,0);assert.equal(f.calls.length,2);
 f.calls[1].resolve({words:[word('Current')]});await flush();
 assert.equal(f.paints[0].p,f.session.pages[2]);assert.equal(f.session.wordBoxes.get(1).length,0);
 f.context.visible=[1];await f.start();assert.equal(f.calls.length,2);assert.equal(f.session.wordBoxes.get(1)[0].word,'Old');
});
for(const action of ['close','replace','A-B-A','delete'])test(`late OCR cannot publish or cache after ${action}`,async()=>{
 const f=fixture();await f.inspect();await f.start();
 if(action==='delete')f.session.deletedPages=new Set([1]);
 else if(action==='replace')f.context.originalSession={...f.session,hash:'changed'};
 else {f.ocr.close(f.session);f.context.originalSession=action==='A-B-A'?{...f.session}:null;}
 f.calls[0].resolve({words:[word('Stale')]});await flush();
 assert.equal(f.paints.length,0);assert.equal(f.cache.size,0);
});
test('finished cache survives reopen and page eviction; different bytes miss cache',async()=>{
 const cache=new Map(),f=fixture({cache});await f.inspect();await f.start();f.calls[0].resolve({words:[word()]});await flush();
 f.ocr.close(f.session);const reopened=fixture({cache});await reopened.inspect();await reopened.start();
 assert.equal(reopened.calls.length,0);assert.equal(reopened.session.wordBoxes.get(1)[0].word,'Bright');
 reopened.ocr.release(reopened.session,1);reopened.session.wordBoxes.set(1,[]);await reopened.start();
 assert.equal(reopened.calls.length,0);assert.equal(reopened.paints.length,2);
 const changed=fixture({cache});changed.session.hash='different-bytes';await changed.inspect();await changed.start();assert.equal(changed.calls.length,1);
});
test('OCR failure has no automatic retry storm; explicit tap retries and empty recognition settles',async()=>{
 const f=fixture();await f.inspect();await f.start();f.calls[0].reject(Error('native failure'));await flush();await f.tick();
 assert.equal(f.calls.length,1);assert.equal(f.session.pages[0].dataset.ocr,'failed');
 f.ocr.tap(f.session,1);await f.tick();assert.equal(f.calls.length,2);
 f.calls[1].resolve({words:[]});await flush();await f.tick();
 assert.equal(f.session.pages[0].dataset.ocr,'empty');f.ocr.tap(f.session,1);assert.equal(f.calls.length,2);
});
test('web and missing-plugin paths are explicit and send no image',async()=>{
 const f=fixture({supported:false});await f.inspect();await f.start();assert.equal(f.calls.length,0);
 assert.equal(f.ocr.tap(f.session,1),true);assert.match(f.toasts[0],/iOS·Android/);
});
test('pinch/ink, active paint and background pause admission; completion cannot paint during a gesture',async()=>{
 const f=fixture();await f.inspect();
 for(const kind of ['paused','busy']){f.context[kind]=true;await f.start();assert.equal(f.calls.length,0);f.context[kind]=false;}
 f.session.paintActive={};await f.start();assert.equal(f.calls.length,0);f.session.paintActive=null;
 f.context.document.hidden=true;await f.start();assert.equal(f.calls.length,0);f.context.document.hidden=false;
 await f.start();f.context.paused=true;f.calls[0].resolve({words:[word()]});await flush();assert.equal(f.paints.length,0);
 f.context.paused=false;await f.start();assert.equal(f.calls.length,1);assert.equal(f.paints.length,1);
});
test('a bounded durable cache evicts oldest pages without retaining image bytes',async()=>{
 const cache=new Map(Array.from({length:48},(_,n)=>[String(n),{words:[word()],bookId:'old',at:n}]));
 const f=fixture({cache});await f.inspect();await f.start();f.calls[0].resolve({words:[word()]});await flush();
 assert.equal(cache.size,48);assert.ok(!cache.has('0'));assert.ok(!JSON.stringify([...cache]).includes('cGFnZQ'));
});

test('deleting assets retires pending work before clearing the durable cache',async()=>{
 const f=fixture();await f.inspect();await f.start();await f.ocr.forget({id:'A'});
 f.calls[0].resolve({words:[word('Deleted')]});await flush();
 assert.equal(f.cache.size,0);assert.equal(f.paints.length,0);
});

test('a failed durable PDF deletion keeps recognition alive for the retained book',async()=>{
 const f=fixture();await f.inspect();await f.start();
 const storage=readFileSync(new URL('../scripts/core/storage.js',import.meta.url),'utf8');
 vm.runInContext(storage.match(/async function bookDeleteAssets\(book\)\{[^]*?\n\}/)[0],f.context);
 f.context.idb=async()=>({});const localTransaction=f.context.localTransaction;
 f.context.localTransaction=async(db,stores,...args)=>{
  if(Array.isArray(stores))throw Error('durable deletion aborted');
  return localTransaction(db,stores,...args);
 };
 await assert.rejects(f.context.bookDeleteAssets({id:'A',kind:'pdf'}),/durable deletion aborted/);
 f.calls[0].resolve({words:[word('Retained')]});await flush();
 assert.equal(f.session.wordBoxes.get(1)[0]?.word,'Retained','failed deletion must not retire the current reader');
 assert.equal(f.cache.size,1);
});
