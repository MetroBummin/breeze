import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
const source=readFileSync(new URL('../scripts/reader/pdf-ocr.js',import.meta.url),'utf8');
const word=(word='Bright',extra={})=>({word,line:0,x:.1,y:.2,w:.2,h:.04,confidence:.9,...extra});
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {resolve,reject,promise};};
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function fixture({supported=true,cache=new Map(),nativeProxy=false}={}){
 const timers=new Map(),calls=[],statusCalls=[],paints=[],canvases=[],toasts=[];let next=0,now=0;
 const session={kind:'pdf',bookId:'A',hash:'hash-A',pages:[1,2,3].map(n=>({isConnected:true,dataset:{page:String(n)}})),wordBoxes:new Map([[1,[]],[2,[]],[3,[]]]),settled:new Set([1,2,3])};
 const native={recognize(args){const job=defer();calls.push({args,...job});return job.promise;},
  getStatus(args){const job=defer();statusCalls.push({args,...job});return job.promise;}};
 const context={Map,Set,WeakMap,console,Number,Date,
  setTimeout(fn,delay=0){const id=++next;timers.set(id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),
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
 if(nativeProxy){context.window.Capacitor.Plugins={BreezePdfOcr:native};delete context.window.Capacitor.registerPlugin;}
 session.pdf={getPage:async()=>({getTextContent:async()=>({items:[]}),getViewport:({scale})=>({width:600*scale,height:800*scale}),
   render:()=>({promise:Promise.resolve(),cancel(){}}),cleanup(){}})};
 vm.createContext(context);const ocr=vm.runInContext(source+'\nBreezePdfOcr;',context);
 async function inspect(n=1,items=[],boxes=[]){await ocr.inspect(session,n,{getTextContent:async()=>({items})},boxes,()=>context.originalSession===session);}
 const firstTimer=()=>[...timers].sort((a,b)=>a[1].at-b[1].at)[0];
 async function tick(){const item=firstTimer();if(item){now=item[1].at;timers.delete(item[0]);item[1].fn();}await flush();}
 async function advance(ms){const end=now+ms;while(firstTimer()?.[1].at<=end)await tick();now=end;await flush();}
 async function start(){ocr.schedule(session);await tick();}
 return {context,session,ocr,inspect,tick,advance,start,calls,statusCalls,paints,timers,cache,canvases,toasts};
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
test('durable recognition beyond 48 pages preserves earlier results without image bytes',async()=>{
 const cache=new Map(Array.from({length:48},(_,n)=>[String(n),{words:[word()],bookId:'old',at:n}]));
 const f=fixture({cache});await f.inspect();await f.start();f.calls[0].resolve({words:[word()]});await flush();
 assert.equal(cache.size,49);assert.ok(cache.has('0'));assert.ok(!JSON.stringify([...cache]).includes('cGFnZQ'));
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

test('unrated/nonfinite confidence and clamped zero-area OCR must never become lookup words',()=>{
 const f=fixture();
 const malformed=[undefined,null,NaN,Infinity,-Infinity,-.1,1.01];
 assert.deepEqual(Array.from(f.ocr.boxesFromWords(malformed.map(confidence=>word('Uncertain',{confidence})))),[]);
 assert.deepEqual(Array.from(f.ocr.boxesFromWords([word('Edge',{x:1,w:.0001}),word('Edge',{y:1,h:.0001})])),[]);
 assert.equal(f.ocr.boxesFromWords([word('Rated',{confidence:.9})]).length,1);
});

test('120 rapid visible-page changes keep one lane, durable pages and released raster pixels',async()=>{
 const f=fixture();f.session.pages=Array.from({length:60},(_,i)=>({isConnected:true,dataset:{page:String(i+1)}}));
 f.session.settled=new Set(Array.from({length:60},(_,i)=>i+1));
 for(let n=1;n<=60;n++){f.session.wordBoxes.set(n,[]);await f.inspect(n);}
 for(let round=0;round<120;round++){
  const n=round%60+1;f.context.visible=[n];await f.start();
  const pending=f.calls.at(-1);
  // Flood timers/taps while the same recognition is pending; no queued raster.
  const count=f.calls.length;
  for(let tap=0;tap<8;tap++){f.ocr.schedule(f.session);f.ocr.tap(f.session,n);await f.tick();}
  assert.equal(f.calls.length,count);
  pending.resolve({words:[word('Current')]});await flush();
  assert.equal(f.session.wordBoxes.get(n)?.[0]?.word,'Current');
  f.ocr.release(f.session,n);f.session.wordBoxes.set(n,[]);
  assert.ok(f.cache.size<=60);
  assert.ok(f.canvases.every(c=>c.width===0&&c.height===0));
 }
 assert.equal(f.calls.length,60,'second pass reuses every durable page without an unbounded live map');
 assert.equal(f.cache.size,60);
 assert.equal([...f.session.wordBoxes.values()].flat().length,0);
});

test('raster cancellation, storage failure and malformed native output preserve explicit retry',async()=>{
 const f=fixture();let cancelled=0;const render=defer();
 f.session.pdf.getPage=async()=>({getViewport:({scale})=>({width:20000*scale,height:10000*scale}),
  render:()=>({promise:render.promise,cancel(){cancelled++;render.reject(Error('cancelled'));}}),cleanup(){}});
 await f.inspect();await f.start();
 assert.equal(f.canvases[0].width,2048);assert.equal(f.canvases[0].height,1024);
 f.ocr.close(f.session);await flush();assert.equal(cancelled,1);assert.equal(f.calls.length,0);
 assert.ok(f.canvases.every(c=>!c.width&&!c.height));
 const fresh=fixture();fresh.context.localTransaction=async()=>{throw Error('quota unavailable');};
 await fresh.inspect();await fresh.start();fresh.calls[0].resolve({words:Array(3001).fill(word())});await flush();
 assert.equal(fresh.session.pages[0].dataset.ocr,'failed');
 fresh.ocr.tap(fresh.session,1);await fresh.tick();fresh.calls[1].resolve({words:[word('Recovered')]});await flush();
 assert.equal(fresh.session.wordBoxes.get(1)[0].word,'Recovered');assert.equal(fresh.cache.size,0);
});

test('never-settling native work times out without blocking cached words or admitting a second recognizer',async()=>{
 const f=fixture();for(const n of [1,2,3])await f.inspect(n);
 f.context.visible=[2];await f.start();f.calls[0].resolve({words:[word('Cached')]});await flush();
 f.ocr.release(f.session,2);f.session.wordBoxes.set(2,[]);
 f.context.visible=[1];await f.start();const hung=f.calls[1];
 await f.advance(30000);assert.equal(f.session.pages[0].dataset.ocr,'failed');
 f.context.visible=[2];await f.start();assert.equal(f.session.wordBoxes.get(2)[0]?.word,'Cached');
 f.context.visible=[3];await f.start();assert.equal(f.session.pages[2].dataset.ocr,'blocked');
 for(let i=0;i<8;i++)f.ocr.tap(f.session,3);
 assert.equal(f.statusCalls.length,1,'repeated taps share one bounded status probe');
 assert.equal(f.statusCalls[0].args.requestId,hung.args.requestId);
 f.statusCalls[0].resolve({finished:false});await flush();
 assert.equal(f.calls.length,2,'unfinished native work must retain exclusive admission');
 assert.match(f.toasts.at(-1),/앱 완전 종료/);
 hung.resolve({words:[word('Expired')]});await flush();await f.tick();
 assert.equal(f.calls.length,3,'actual settlement wakes the currently visible blocked page');
 assert.equal(f.session.wordBoxes.get(1).length,0);
 assert.ok(!JSON.stringify([...f.cache]).includes('Expired'),'expired output is never cached');
 f.calls[2].resolve({words:[word('Current')]});await flush();
 assert.equal(f.session.wordBoxes.get(3)[0]?.word,'Current');
});

test('lost bridge response recovers only after native completion of the matching request is confirmed',async()=>{
 const f=fixture();await f.inspect();await f.start();const lost=f.calls[0];
 await f.advance(30000);f.ocr.tap(f.session,1);
 assert.equal(f.statusCalls[0].args.requestId,lost.args.requestId);
 f.statusCalls[0].resolve({finished:true});await flush();await f.tick();
 assert.equal(f.calls.length,2);assert.notEqual(f.calls[1].args.requestId,lost.args.requestId);
 // A very late response cannot clear the replacement admission or publish/cache.
 lost.resolve({words:[word('Expired')]});await flush();
 f.ocr.schedule(f.session);await f.tick();assert.equal(f.calls.length,2);
 assert.equal(f.cache.size,0);assert.equal(f.paints.length,0);
 f.calls[1].resolve({words:[word('Recovered')]});await flush();
 assert.equal(f.session.wordBoxes.get(1)[0]?.word,'Recovered');
});

test('a hung status probe is bounded and a stale retry cannot revive a closed document',async()=>{
 const f=fixture();await f.inspect();await f.start();await f.advance(30000);
 f.ocr.tap(f.session,1);await f.advance(2000);
 assert.equal(f.calls.length,1);assert.match(f.toasts.at(-1),/앱 완전 종료/);
 f.ocr.tap(f.session,1);assert.equal(f.statusCalls.length,1,'a later tap reuses the still-pending bridge probe');
 f.ocr.close(f.session);f.context.originalSession=null;
 f.statusCalls[0].resolve({finished:true});await flush();await f.advance(1000);
 assert.equal(f.calls.length,1);assert.equal(f.paints.length,0);assert.equal(f.cache.size,0);
});

// A static Capacitor webview injects Plugins proxies, not the npm core helper.
test('native injected plugin proxy starts OCR without registerPlugin',async()=>{
 const f=fixture({nativeProxy:true});
 await f.inspect();await f.start();
 assert.equal(f.calls.length,1);
 f.calls[0].resolve({words:[word()]});await flush();
 assert.equal(f.session.pages[0].dataset.ocr,'ready');
 assert.equal(f.session.wordBoxes.get(1)[0].word,'Bright');
});

test('unmodified iOS native bridge admits scanned pages through exported proxies',async()=>{
 const calls=[];
 class Doc{}
 Object.defineProperty(Doc.prototype,'cookie',{get(){return '';},set(){}});
 const context={console,Promise,Map,Set,WeakMap,WeakSet,URL,Document:Doc,HTMLDocument:Doc,
  XMLHttpRequest:class {},prompt:()=> 'false',
  Capacitor:{DEBUG:false,isLoggingEnabled:false,Plugins:{}},WEBVIEW_SERVER_URL:'breeze://localhost',
  webkit:{messageHandlers:{bridge:{postMessage:call=>calls.push(call)}}},
  document:{addEventListener(){},hidden:false},setTimeout:()=>1,clearTimeout(){},
  openDb:()=>async()=>null,currentPdfSession:()=>true,ownsPdfPage:()=>true};
 context.window=context;vm.createContext(context);
 vm.runInContext(readFileSync(new URL('../node_modules/@capacitor/ios/Capacitor/Capacitor/assets/native-bridge.js',import.meta.url),'utf8'),context);
 // JSExport.swift emits promise wrappers into Plugins at document start.
 vm.runInContext(`Capacitor.Plugins.BreezePdfOcr={
  recognize:options=>Capacitor.nativePromise('BreezePdfOcr','recognize',options),
  getStatus:options=>Capacitor.nativePromise('BreezePdfOcr','getStatus',options)};`,context);
 assert.equal(context.Capacitor.isPluginAvailable('BreezePdfOcr'),true);
 assert.equal(typeof context.Capacitor.registerPlugin,'undefined');
 const ocr=vm.runInContext(source+'\nBreezePdfOcr;',context);
 const session={pages:[{dataset:{}}]};
 await ocr.inspect(session,1,{getTextContent:async()=>({items:[]})},[],()=>true);
 assert.equal(session.pages[0].dataset.ocr,'waiting');
 void context.Capacitor.Plugins.BreezePdfOcr.recognize({image:'fixture',requestId:'bridge-contract'});
 const call=calls.find(call=>call.pluginId==='BreezePdfOcr');
 assert.equal(call.methodName,'recognize');
 assert.equal(call.options.requestId,'bridge-contract');
});

test('background and visible OCR share one lane; visible work goes next',async()=>{
 const f=fixture(),book={id:'A',sourceHash:'hash-A'};
 const pending=f.ocr.background(book,2,f.session.pdf,()=>true);await flush();assert.equal(f.calls.length,1);
 await f.inspect(1);await f.start();assert.equal(f.calls.length,1);
 f.calls[0].resolve({words:[word('Background')]});assert.equal(await pending,'done');await f.tick();
 assert.equal(f.calls.length,2);f.calls[1].resolve({words:[word('Visible')]});await flush();
 assert.equal(f.session.wordBoxes.get(1)[0].word,'Visible');
 assert.deepEqual([...await f.ocr.completed(book)].sort(),[1,2]);
});
test('queued visible OCR prevents background admission',async()=>{
 const f=fixture();await f.inspect(1);
 assert.equal(await f.ocr.background({id:'A',sourceHash:'hash-A'},2,f.session.pdf,()=>true),'busy');
 assert.equal(f.calls.length,0);
});
test('background results survive reader closure but not book retirement',async()=>{
 for(const retire of [false,true]){
  const f=fixture();let alive=true;
  const pending=f.ocr.background({id:'A',sourceHash:'hash-A'},1,f.session.pdf,()=>alive);await flush();
  f.context.originalSession=null;if(retire)alive=false;
  f.calls[0].resolve({words:[word()]});assert.equal(await pending,retire?'retired':'done');
  assert.equal(f.cache.size,retire?0:1);
 }
});
test('background storage failure never claims completion',async()=>{
 const f=fixture(),transaction=f.context.localTransaction;
 f.context.localTransaction=async(db,store,mode,...args)=>{if(mode==='readwrite')throw Error('quota');return transaction(db,store,mode,...args);};
 const pending=f.ocr.background({id:'A',sourceHash:'hash-A'},1,f.session.pdf,()=>true);await flush();
 f.calls[0].resolve({words:[word()]});assert.equal(await pending,'storage');assert.equal(f.cache.size,0);
});
test('text-layer background page is processed without native OCR or dictionary work',async()=>{
 const f=fixture(),pdf={getPage:async()=>({getTextContent:async()=>({items:[{str:'Already text'}]}),cleanup(){}})};
 assert.equal(await f.ocr.background({id:'A',sourceHash:'hash-A'},1,pdf,()=>true),'done');
 assert.equal(f.calls.length,0);assert.equal(f.cache.size,1);
});
test('prepared visible page remains usable during another background native call',async()=>{
 const f=fixture();await f.inspect(1);await f.start();f.calls[0].resolve({words:[word('Prepared')]});await flush();
 f.ocr.release(f.session,1);f.session.wordBoxes.set(1,[]);f.context.visible=[];
 const pending=f.ocr.background({id:'A',sourceHash:'hash-A'},2,f.session.pdf,()=>true);await flush();assert.equal(f.calls.length,2);
 f.context.visible=[1];await f.start();assert.equal(f.session.wordBoxes.get(1)[0].word,'Prepared');
 assert.equal(f.calls.length,2);f.calls[1].resolve({words:[word('Next')]});await pending;
});
test('native-status await cannot overwrite a newer foreground admission',async()=>{
 const f=fixture();await f.inspect(1);await f.start();await f.advance(30000);
 const pending=f.ocr.background({id:'A',sourceHash:'hash-A'},2,f.session.pdf,()=>true);await flush();assert.equal(f.statusCalls.length,1);
 f.calls[0].resolve({words:[word('Old')]});await flush();
 f.ocr.tap(f.session,1);await f.tick();assert.equal(f.calls.length,2);
 f.statusCalls[0].resolve({finished:true});assert.equal(await pending,'busy');
 assert.equal(f.calls.length,2);f.calls[1].resolve({words:[word('Current')]});await flush();
});
test('all cached visible pages publish while an unrelated background call is held',async()=>{
 const f=fixture();
 for(const n of [1,2])f.cache.set(JSON.stringify(['scan-en-v1-2048','ios','A','hash-A',n]),{words:[word('Cached')],bookId:'A'});
 f.context.visible=[];
 const pending=f.ocr.background({id:'A',sourceHash:'hash-A'},3,f.session.pdf,()=>true);await flush();
 await f.inspect(1);await f.inspect(2);f.context.visible=[1,2];await f.start();
 assert.equal(f.session.wordBoxes.get(1).length,1);assert.equal(f.session.wordBoxes.get(2).length,1);
 assert.equal(f.calls.length,1);f.calls[0].resolve({words:[word()]});await pending;
});
