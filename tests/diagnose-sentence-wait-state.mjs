/* Diagnostic characterization, not an assertion that unbounded waits are safe.
 * Runs production sentence.js and dictCall with deterministic dependency stalls.
 * A pending request says nothing about compositor/animation liveness. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sentence=source('scripts/dictionary/sentence.js');
const dictionary=source('scripts/dictionary/dictionary.js');
const call=dictionary.slice(dictionary.indexOf('async function dictCall('),dictionary.indexOf('\nconst wordLookupRecoveries='));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function fixture(stage){
 const nodes=new Map(),timers=new Map();let next=0,now=0,fetches=0;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,textContent:'',setAttribute(){},classList:{toggle(){}}});return nodes.get(id);};
 const gate=deferred();
 const response={ok:true,status:200,json:()=>stage==='body'?gate.promise:Promise.resolve({ko:'A completed translation.'})};
 const env={console:{warn(){}},AbortController,navigator:{onLine:true},crypto:{randomUUID:()=> 'diagnostic-id'},
  document:{body:node('body'),getElementById:node,addEventListener(){}},innerWidth:820,innerHeight:1180,
  setTimeout(fn,delay){const id=++next;timers.set(id,{fn,due:now+delay});return id;},clearTimeout(id){timers.delete(id);},
  requestAnimationFrame:fn=>{fn();return 0;},cancelAnimationFrame(){},syncReaderControlInteractivity(){},
  sbUser:null,curBook:{id:'diagnostic',title:'Diagnostic'},SB_KEY:'fixture',SB_URL:'https://fixture.invalid',
  sb:{auth:{getSession:()=>stage==='auth'?gate.promise:Promise.resolve({data:{session:null}})}},
  dictGet:()=>stage==='cache'?gate.promise:Promise.resolve(null),dictPut:async()=>{},
  fetch:(_url,opt)=>{fetches++;if(opt.signal?.aborted)return Promise.reject(new Error('aborted'));
   if(stage==='fetch')return new Promise((resolve,reject)=>{gate.promise.then(resolve);opt.signal?.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});});
   return Promise.resolve(response);},
  sentenceHash:t=>t,deviceId:()=> 'fixture',readerScroller:()=>({scrollTop:0,scrollLeft:0}),save(){},aiDay:()=>'',
  held:false,sentenceGestureStillPressed:()=>env.held};
 const ctx=vm.createContext(env);vm.runInContext(call+'\n'+sentence,ctx);
 const run=script=>vm.runInContext(script,ctx);
 const advance=async delta=>{now+=delta;for(const [id,timer] of timers)if(timer.due<=now){timers.delete(id);timer.fn();}await flush();};
 return {env,gate,run,node,timers,advance,response,get fetches(){return fetches;}};
}
for(const stage of ['cache','auth','fetch','body'])test(`${stage}: a stalled dependency leaves sentence waiting beyond 120 simulated seconds`,async()=>{
 const f=fixture(stage);let settled=false;const job=f.run("openSentence('A patient reader continues.', {pi:0})").then(()=>settled=true);
 await flush();assert.equal(f.run('sentenceWaitingActive()'),true);assert.equal(f.node('sentence-pill-status').hidden,false);
 assert.equal(f.timers.size,0,'production translation unexpectedly acquired a deadline; update this diagnostic');
 await f.advance(120000);assert.equal(settled,false);assert.equal(f.run('sentenceWaitingActive()'),true);
 if(stage==='cache')f.gate.resolve({ko:'A completed translation.'});
 if(stage==='auth')f.gate.resolve({data:{session:null}});
 if(stage==='fetch')f.gate.resolve(f.response);
 if(stage==='body')f.gate.resolve({ko:'A completed translation.'});
 await job;assert.equal(f.run('sentenceWaitingActive()'),false);assert.equal(f.node('sentence-modal').hidden,false);
 console.log(JSON.stringify({stage,simulatedWaitMs:120000,requestDeadline:false,resultRevealsOnResolve:true,animationMeasured:false}));
});
test('completed result waits for the original gesture release, then reveals once',async()=>{
 const f=fixture('none');f.env.held=true;await f.run("openSentence('A patient reader continues.', {pi:0})");
 assert.equal(f.run('sentenceWaitingActive()'),true);assert.equal(f.run('!!sentencePendingPaint'),true);
 assert.equal(f.node('ps-ko').textContent,'A completed translation.');assert.equal(f.node('sentence-modal').hidden,true);
 f.env.held=false;f.run('sentenceGestureReleased()');assert.equal(f.run('sentenceWaitingActive()'),false);
 assert.equal(f.node('sentence-modal').hidden,false);f.run('closeSentence(); sentenceGestureReleased()');
 assert.equal(f.node('sentence-modal').hidden,true);assert.equal(f.node('sentence-pill-status').hidden,true);
});
test('close while auth is stalled invalidates the result and aborts the eventual fetch',async()=>{
 const f=fixture('auth');const job=f.run("openSentence('A patient reader continues.', {pi:0})");await flush();
 assert.equal(f.run('!!sentCtrl'),true);f.run('closeSentence()');
 assert.equal(f.run('sentenceLookupOpen()'),false);assert.equal(f.node('sentence-pill-status').hidden,true);
 f.gate.resolve({data:{session:null}});await job;
 assert.equal(f.fetches,1);assert.equal(f.run('sentenceLookupOpen()'),false);assert.equal(f.node('sentence-modal').hidden,true);
});
test('orphaned production hold pointer survives close/reopen until the matching terminal release',async()=>{
 const f=fixture('none'),gesture=source('scripts/reader/gesture.js');
 const start=gesture.indexOf('let sentenceHoldPointerId = null;'),end=gesture.indexOf('/* 방금 끝난 손짓',start);
 assert.ok(start>=0&&end>start);f.run(gesture.slice(start,end));
 // Injected missing-terminal-event state, not evidence of an actual iPad loss.
 f.run('sentenceHoldPointerId=41');await f.run("openSentence('A patient reader continues.', {pi:0})");
 assert.equal(f.run('sentenceWaitingActive() && !!sentencePendingPaint'),true);
 f.run('releaseSentenceHoldPointer({pointerId:42})');assert.equal(f.run('sentenceWaitingActive()'),true);
 f.run('closeSentence()');await f.run("openSentence('A new sentence after closing.', {pi:0})");
 assert.equal(f.run('sentenceWaitingActive() && !!sentencePendingPaint'),true);
 f.run('releaseSentenceHoldPointer({pointerId:41})');assert.equal(f.run('sentenceWaitingActive()'),false);
 assert.equal(f.node('sentence-modal').hidden,false);
});
