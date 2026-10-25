/* Real IndexedDB for the ink outbox. Synthetic strokes only. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,firefox,webkit} from './helpers/bounded-playwright.mjs';

const root=resolve(new URL('..',import.meta.url).pathname);
const engineName=process.env.BREEZE_QA_ENGINE||'chromium';
const engines={chromium,firefox,webkit};
const engine=engines[engineName];
assert.ok(engine,'Unknown browser engine');
const server=createServer((req,res)=>{
  const path=req.url.split('?')[0];
  if(path==='/scripts/library/ink-sync.js'){
    res.setHeader('Content-Type','text/javascript');
    res.end(readFileSync(resolve(root,'scripts/library/ink-sync.js')));
    return;
  }
  res.setHeader('Content-Type','text/html');
  res.end('<!doctype html><title>Ink sync</title><script src="/scripts/library/ink-sync.js"></script>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const browser=await engine.launch({headless:true,executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});
const sha='ab'.repeat(32);
const idA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const idB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
try{
  const context=await browser.newContext();
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/`);
  const saved=await page.evaluate(async({sha,idA,idB})=>{
    window.BREEZE_CONFIG={INK_SYNC:true,BOOK_CLOUD:true};
    const calls=[];
    window.sbUser={id:'11111111-1111-1111-1111-111111111111'};
    window.bookCloudHash=book=>book.sourceHash||'';
    window.bookCloudUserId=()=>sbUser.id;
    window.bookCloudSession=()=>({epoch:1,userId:sbUser.id});
    window.bookCloudCurrent=session=>session.userId===sbUser.id;
    window.books=[{kind:'pdf',title:'One name',sourceHash:sha,bookCloudLink:{on:true}}];
    const pages=new Map();
    registerBookInkPage({
      page:key=>pages.get(key)||null,
      pages:()=>[...pages.values()],
      busy:state=>!!state.busy,
      accept:stroke=>Array.isArray(stroke.points)&&stroke.points.length>0,
      persist(state){state.persisted=true;},
      held(state){state.strokes=state.inkHeld;state.inkHeld=null;state.applied=true;return true;}
    });
    window.sb={
      from(){
        return {select(){return {eq(){return {eq(){return {limit:async()=>({data:[],error:null})};}};}};}};
      },
      async rpc(name,args){
        calls.push({name,args});
        return {data:{ok:true,applied:args.ops.map(op=>op.id)}};
      }
    };
    const state={key:JSON.stringify([sha,1]),strokes:[{id:idA,color:'#111111',width:1.5,points:[[1,1],[2,2]]}],svg:{},dirty:false,busy:true};
    pages.set(state.key,state);
    const order=[];
    order.push('paint');
    scheduleBookInk(state);
    await new Promise(resolve=>setTimeout(resolve,3100));
    order.push(calls.length?'uploaded-while-drawing':'while-drawing');
    state.busy=false;
    await new Promise(resolve=>setTimeout(resolve,7000));
    order.push('after-pen-up');
    const again=JSON.parse(JSON.stringify(calls));
    state.strokes.push({id:idB,color:'#2864c5',width:0.75,points:[[4,4]]});
    const originalPut=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(){const error=new DOMException('quota','QuotaExceededError');throw error;};
    const quota=await flushBookInk(state);
    IDBObjectStore.prototype.put=originalPut;
    let release;
    sb.from=()=>({
      select(){
        return {
          eq(){
            return {
              eq(){
                return {
                  limit(){
                    return new Promise(done=>{
                      release=()=>done({
                        data:[{stroke_id:idB,rev:9,deleted:false,payload:{id:idB,color:'#2864c5',width:0.75,points:[[8,8]]}}],
                        error:null
                      });
                    });
                  }
                };
              }
            };
          }
        };
      }
    });
    const pullOrder=['paint'];
    const pulling=pullBookInk({key:state.key,strokes:[state.strokes[0]],svg:{},dirty:false,busy:false});
    pullOrder.push('returned');
    release();
    await pulling;
    pullOrder.push('merged');
    const live=pages.get(state.key);
    return {order,calls:again.map(call=>call.args.ops.map(op=>op.id)),quota,pullOrder,applied:!!live.applied,errors:order.length};
  },{sha,idA,idB});
  assert.deepEqual(saved.order,['paint','while-drawing','after-pen-up']);
  assert.deepEqual(saved.calls,[[idA]],'the pen-up debounce uploaded only the finished stroke');
  assert.equal(saved.quota,true,'a quota failure still delivers the queued stroke');
  assert.deepEqual(saved.pullOrder,['paint','returned','merged']);
  assert.equal(errors.length,0,errors.join('\n'));
  await page.reload();
  const retained=await page.evaluate(async sha=>{
    const request=indexedDB.open('breeze-ink-sync',1);
    const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const rows=await new Promise((resolve,reject)=>{
      const tx=db.transaction('pages');
      const all=tx.objectStore('pages').getAll();
      tx.oncomplete=()=>resolve(all.result||[]);
      tx.onerror=()=>reject(tx.error);
    });
    return rows.some(row=>row&&row.acked&&Object.keys(row.acked).length>0);
  },sha);
  assert.equal(retained,true,'the outbox survives a reload in durable IndexedDB');
  await context.close();
  console.log(`ink sync browser ${engineName} passed`);
}finally{
  await browser.close();
  server.close();
}
