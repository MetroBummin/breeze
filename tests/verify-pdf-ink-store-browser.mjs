/* Real IndexedDB + worker transport. Synthetic records only; not device proof. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {chromium,webkit} from 'playwright';
const root=resolve(new URL('..',import.meta.url).pathname);
const server=createServer((req,res)=>{
 if(req.url.startsWith('/scripts/')){
  try{res.setHeader('Content-Type','text/javascript');res.end(readFileSync(resolve(root,'.'+req.url.split('?')[0])));}catch{res.writeHead(404).end();}
 }else res.end('<!doctype html><title>Ink writer QA</title><script src="/scripts/reader/pdf-ink-store.js"></script>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const engine=process.env.BREEZE_QA_ENGINE==='webkit'?webkit:chromium;
const browser=await engine.launch({headless:true,executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});
try{
 for(const fallback of [false,true]){
  const context=await browser.newContext({viewport:{width:820,height:1180},hasTouch:true});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(fallback=>{
   window.qaTransfers=[];window.qaDone=[];window.qaLongTasks=[];
   try{new PerformanceObserver(list=>{for(const e of list.getEntries())qaLongTasks.push(e.duration);}).observe({type:'longtask'});}catch{}
   if(fallback){window.Worker=class{constructor(){throw new Error('QA unavailable worker');}};}
   else{
    const send=Worker.prototype.postMessage;
    Worker.prototype.postMessage=function(message,...args){
     const t=performance.now();const result=send.call(this,message,...args);
     if(message.op==='write')qaTransfers.push({ms:performance.now()-t,ids:message.payload.order.length,
      strokes:message.payload.additions.length,points:message.payload.additions.reduce((n,[,s])=>n+s.points.length,0)});
     return result;
    };
   }
  },fallback);
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(async()=>{
   window.qaKey='["synthetic-worker-test",1]';
   window.qaStroke=n=>({color:'#111111',width:1.5,points:[[n,1],[n,2]]});
   await BreezePdfInkStore.write(qaKey,{version:1,strokes:[qaStroke(1)]});
   window.qaBase=(await BreezePdfInkStore.read(qaKey)).strokes;
   window.qaNext=[...qaBase,qaStroke(2)];
   await BreezePdfInkStore.write(qaKey,{version:1,strokes:qaNext});
   await BreezePdfInkStore.write(qaKey,{version:1,strokes:qaBase});
   await BreezePdfInkStore.write(qaKey,{version:1,strokes:qaNext});
  });
  if(!fallback)assert.deepEqual(await page.evaluate(()=>qaTransfers.map(x=>x.strokes)),[1,1,0,1],'unchanged coordinates never cross on append/undo; redo resends evicted stroke');
  assert.equal(await page.evaluate(async()=>{BreezePdfInkStore.release(qaKey);return (await BreezePdfInkStore.read(qaKey)).strokes.length;}),2);
  assert.equal(await page.evaluate(async()=>{
   const value=await BreezePdfInkStore.read(qaKey);return value.version;
  }),1,'disk format stays v1');
  const worker=fallback?null:page.workers()[0];
  const scope=worker||page;
  // Abort AFTER accepting put: acknowledged cache must not advance on failure.
  await scope.evaluate(()=>{self.qaPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const r=self.qaPut.apply(this,args);this.transaction.abort();return r;};});
  const failed=await page.evaluate(async()=>{try{await BreezePdfInkStore.write(qaKey,{version:1,strokes:[...qaNext,qaStroke(3)]});return false;}catch{return true;}});
  assert.equal(failed,true,'transaction abort rejects write');
  await scope.evaluate(()=>{IDBObjectStore.prototype.put=self.qaPut;});
  await page.evaluate(async()=>{await BreezePdfInkStore.write(qaKey,{version:1,strokes:[...qaNext,qaStroke(4)]});});
  assert.deepEqual(await page.evaluate(async()=>(await BreezePdfInkStore.read(qaKey)).strokes.map(s=>s.points[0][0])),[1,2,4],'retry writes latest complete snapshot');
  // Delayed completion acknowledgement: release/read must queue behind write.
  await scope.evaluate(()=>{
   self.qaTransaction=IDBDatabase.prototype.transaction;
   IDBDatabase.prototype.transaction=function(...args){
    const tx=self.qaTransaction.apply(this,args);
    if(args[1]==='readwrite')Object.defineProperty(tx,'oncomplete',{set(fn){tx.addEventListener('complete',e=>setTimeout(()=>fn(e),100));}});
    return tx;
   };
  });
  const pending=await page.evaluate(async()=>{
   let acknowledged=false;const job=BreezePdfInkStore.write(qaKey,{version:1,strokes:[qaStroke(5)]}).then(()=>{acknowledged=true;});
   await new Promise(r=>setTimeout(r,20));const early=acknowledged;
   BreezePdfInkStore.release(qaKey);const reopening=BreezePdfInkStore.read(qaKey);
   await job;return {early,strokes:(await reopening).strokes};
  });
  assert.equal(pending.early,false);assert.deepEqual(pending.strokes[0].points,[[5,1],[5,2]]);
  if(fallback)await scope.evaluate(()=>{IDBDatabase.prototype.transaction=self.qaTransaction;});
  if(!fallback){
   // Fatal worker error rejects pending writes; explicit retry uses durable
   // fallback and redefines every current stroke, never stale worker IDs.
   await page.evaluate(()=>{window.qaFatal=BreezePdfInkStore.write(qaKey,{version:1,strokes:[qaStroke(6)]}).then(()=> 'saved',()=> 'failed');});
   // The delayed oncomplete above keeps this promise pending at the crash.
   await worker.evaluate(()=>{setTimeout(()=>{throw new Error('synthetic worker failure');});}).catch(()=>{});
   await page.waitForTimeout(100);
   assert.equal(await page.evaluate(()=>qaFatal),'failed','fatal worker failure rejects the pending save');
   await page.evaluate(async()=>{await BreezePdfInkStore.write(qaKey,{version:1,strokes:[qaStroke(7)]});});
   assert.equal(await page.evaluate(async()=>(await BreezePdfInkStore.read(qaKey)).strokes[0].points[0][0]),7);
  }
  await page.reload();assert.equal(await page.evaluate(async()=>(await BreezePdfInkStore.read('["synthetic-worker-test",1]')).strokes[0].points[0][0]),fallback?5:7,'reload reads committed legacy-format data');
  assert.deepEqual(errors.filter(x=>!x.includes('synthetic worker failure')),[]);
  console.log(`PASS ${fallback?'fallback':'worker'}: delta transfer, undo/redo, abort/retry latest, delayed ack, release/reopen, crash recovery and reload`);
  await context.close();
 }
 // Separate fresh worker benchmark: same accumulated loads as investigation.
 const page=await browser.newPage();
 await page.addInitScript(()=>{
  window.qaTransfers=[];window.qaLongTasks=[];
  new PerformanceObserver(l=>{for(const e of l.getEntries())qaLongTasks.push(e.duration);}).observe({type:'longtask'});
  const send=Worker.prototype.postMessage;
  Worker.prototype.postMessage=function(m,...a){const t=performance.now();const r=send.call(this,m,...a);if(m.op==='write')qaTransfers.push({ms:performance.now()-t,points:m.payload.additions.reduce((n,[,s])=>n+s.points.length,0)});return r;};
 });
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 const results=[];
 for(const count of [0,1000,5000,15000]){
  await page.evaluate(async count=>{
   window.qaKey='synthetic-benchmark';
   const strokes=Array.from({length:count},(_,i)=>({color:'#111111',width:1.5,points:Array.from({length:100},(_,j)=>[40+j*5,70+(i%100)*6+2*Math.sin(j*.5)])}));
   await BreezePdfInkStore.write(qaKey,{version:1,strokes});BreezePdfInkStore.release(qaKey);
   window.qaStrokes=(await BreezePdfInkStore.read(qaKey)).strokes;
  },count);
  await page.waitForTimeout(100);await page.evaluate(()=>{qaTransfers.length=qaLongTasks.length=0;});
  for(let i=0;i<3;i++)await page.evaluate(async i=>{qaStrokes.push({color:'#111111',width:1.5,points:[[i,0],[i,1]]});await BreezePdfInkStore.write(qaKey,{version:1,strokes:qaStrokes});},i);
  await page.waitForTimeout(50);const result=await page.evaluate(()=>({transfers:qaTransfers,longTasks:qaLongTasks}));
  assert.ok(result.transfers.every(t=>t.points===2),'existing coordinates never transferred');results.push({count,...result});
 }
 if(process.env.BREEZE_QA_OUTPUT){mkdirSync(process.env.BREEZE_QA_OUTPUT,{recursive:true});writeFileSync(resolve(process.env.BREEZE_QA_OUTPUT,'writer-benchmark.json'),JSON.stringify(results,null,2));}
 console.log('BENCHMARK '+JSON.stringify(results));
}finally{await browser.close();server.close();}
