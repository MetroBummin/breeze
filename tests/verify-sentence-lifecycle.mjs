import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=readFileSync(resolve(root,'scripts/dictionary/sentence.js'),'utf8');
const deferred=()=>{ let resolve; const promise=new Promise(done=>{ resolve=done; }); return {promise,resolve}; };
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function boot({get,call,put,width=390,height=844,pressed=false}={}){
  const elements=new Map();
  const classes=new Set();
  const contact={pressed};
  const listeners={};
  const element=id=>{
    if(elements.has(id)) return elements.get(id);
    const value={id,hidden:id==='sentence-modal',textContent:'',innerHTML:'',children:[],
      inert:false,style:{setProperty(){}},classList:{contains:name=>classes.has(name),toggle(name,on){
        if(on) classes.add(name); else classes.delete(name);
      }},appendChild(node){ this.children.push(node); },removeAttribute(name){ delete this[name]; },
      setAttribute(name,value){ this[name]=value; },focus(){},
      getBoundingClientRect(){ return {width:360,height:300}; }};
    elements.set(id,value); return value;
  };
  const body=element('body');
  const visualViewport={width,height,addEventListener(type,fn){ listeners['visual:'+type]=fn; }};
  const window={visualViewport,addEventListener(type,fn){ listeners[type]=fn; }};
  const context=createContext({
    console,Promise,Date,String,AbortController,setTimeout,clearTimeout,performance,
    window,innerWidth:width,innerHeight:height,
    requestAnimationFrame:fn=>setTimeout(()=>fn(Date.now()),0),cancelAnimationFrame:clearTimeout,
    document:{body,querySelector:()=>null,getElementById:element,createElement:()=>element('node-'+Math.random()),addEventListener(){}},
    crypto,deviceId:()=>'qa-device',navigator:{onLine:true}, sb:{}, sbUser:{id:'u'}, curBook:{title:'Book'},
    sentenceHash:text=>text, aiDay:()=>'', save(){}, clearReaderModeCue(){},
    sentenceGestureStillPressed:()=>contact.pressed,
    dictGet:get||(()=>Promise.resolve(null)),
    dictCall:call||(()=>Promise.resolve({ko:'확인',points:[]})),
    dictPut:put||(()=>Promise.resolve()),
  });
  const reader=readFileSync(resolve(root,'scripts/reader/reader.js'),'utf8');
  new Script(reader.slice(reader.indexOf('function syncReaderControlInteractivity('),reader.indexOf('function expandReaderChrome('))).runInContext(context);
  new Script(source,{filename:'sentence.js'}).runInContext(context);
  return {context,elements,element,classes,contact,visualViewport,listeners};
}

/* Pending feedback stays on the selected source; only successful results adapt. */
for(const viewport of [{width:390,height:844,compact:true},{width:1100,height:800,compact:false}]){
  const cache=deferred(),app=boot({...viewport,get:()=>cache.promise});
  const opening=app.context.openSentence('Pending everywhere');
  assert.equal(app.element('sentence-modal').hidden,true,'pending opened a result window');
  assert.equal(app.element('sentence-peek').hidden,true,'pending exposed an error pill');
  assert.equal(app.element('readback').inert,false,'inline pending disabled Reader controls');
  cache.resolve({ko:'결과',points:['구조']}); await opening; await tick();
  assert.equal(app.element('sentence-modal').hidden,false,'result presentation did not open');
  assert.equal(app.classes.has('sentence-compact'),viewport.compact,
    'only compact result presentation should become a bottom sheet');
  assert.equal(app.element('sentence-peek').hidden,true,'error pill remained beside the result');
}

/* A cache hit may finish under the long-press finger, but the result waits for pointerup. */
{
  const app=boot({pressed:true,get:()=>Promise.resolve({ko:'즉시 결과',points:[]})});
  await app.context.openSentence('Fast');
  assert.equal(app.element('sentence-modal').hidden,true,'fast result appeared under the held finger');
  app.context.revealSentenceResult();
  assert.equal(app.element('sentence-modal').hidden,true,'idle callback bypassed the held-pointer gate');
  app.contact.pressed=false; app.context.sentenceGestureReleased(); await tick();
  assert.equal(app.element('sentence-modal').hidden,false,'fast result did not appear after pointer release');
}

/* A cache hit that arrives after close has no right to reopen the modal. */
{
  const cache=deferred(), app=boot({get:()=>cache.promise});
  const opening=app.context.openSentence('A');
  app.context.closeSentence();
  cache.resolve({ko:'예전 A',points:[]});
  await opening;
  assert.equal(app.element('sentence-modal').hidden,true,'stale cache hit reopened a closed sentence');
  assert.notEqual(app.element('ps-ko').textContent,'예전 A','stale cache hit painted after close');
}

/* Offline/failure leaves pending and uses the compact bottom retry surface. */
{
  const app=boot({get:()=>Promise.resolve(null)});
  app.context.navigator.onLine=false;
  await app.context.openSentence('Offline');
  assert.equal(app.element('sentence-modal').hidden,false,'unanchored failure did not use its existing modal');
  assert.equal(app.element('sentence-peek').hidden,true,'unanchored failure invented a source anchor');
  assert.equal(app.element('ps-retry').hidden,false,'retryable failure lost its retry action');
}

/* Reversed A/B cache completion must still leave B as the only owner. */
{
  const a=deferred(),b=deferred();
  const app=boot({get:key=>key==='s:A'?a.promise:b.promise});
  const openingA=app.context.openSentence('A');
  const openingB=app.context.openSentence('B');
  a.resolve({ko:'예전 A',points:[]}); await openingA;
  assert.equal(app.element('ps-en').textContent,'B','A cache response replaced B waiting UI');
  b.resolve({ko:'새 B',points:[]}); await openingB;
  assert.equal(app.element('ps-en').textContent,'B');
  assert.equal(app.element('ps-ko').textContent,'새 B');
}

/* A response can outrun abort and may still be cached, but it cannot paint B. */
{
  const calls=new Map(), puts=[];
  const app=boot({
    get:()=>Promise.resolve(null),
    call:payload=>{ const wait=deferred(); calls.set(payload.sentence,wait); return wait.promise; },
    put:(key,value)=>{ puts.push([key,value]); return Promise.resolve(); },
  });
  const openingA=app.context.openSentence('A'); await tick();
  const openingB=app.context.openSentence('B'); await tick();
  calls.get('A').resolve({ko:'예전 A',points:[],left:9}); await openingA;
  assert.equal(app.element('ps-en').textContent,'B','network A replaced B after abort race');
  assert.ok(puts.some(([key])=>key==='s:A'),'valid stale answer was not retained in cache');
  calls.get('B').resolve({ko:'새 B',points:[],left:8}); await openingB;
  assert.equal(app.element('ps-ko').textContent,'새 B');
}

/* A slow cache write cannot delay a usable result or reopen it after close. */
{
  const answer=deferred(),write=deferred();
  const app=boot({get:()=>Promise.resolve(null),call:()=>answer.promise,put:()=>write.promise});
  const opening=app.context.openSentence('A'); await tick();
  answer.resolve({ko:'늦은 A',points:[],left:7}); await tick();
  assert.equal(app.element('ps-ko').textContent,'늦은 A','ready answer waited for cache storage');
  assert.equal(app.element('sentence-modal').hidden,false);
  app.context.closeSentence(); write.resolve(); await opening;
  assert.equal(app.element('sentence-modal').hidden,true,'dictPut completion reopened the sentence');
}

/* #319: translations are always Korean. The request names the target, a cached
   Chinese answer is skipped and replaced, and a Chinese answer from the server
   is a retryable failure that asks again with a fresh lookup id. */
const chinese='从支点城到英里高城，在高速公路上本是一条直线，他的拾荒工作将在那里进行。';
const korean='펄크럼 시티에서 마일 하이 시티까지는 고속도로로 곧장 가는 길이었다.';
{
  const app=boot();const is=app.context.koreanSentenceText;
  assert.equal(is(korean),true);assert.equal(is('Mile High City로 갔다.'),true);
  assert.equal(is('그는 오래된 책에서 漢字를 찾아 공책에 천천히 옮겨 적었다고 말했다.'),true,'a short Hanja gloss inside Korean was rejected');
  for(const text of [chinese,'これは日本語です。','A plain English echo.','',null])assert.equal(is(text),false,String(text));
}
{
  const calls=[],puts=[];
  const app=boot({get:()=>Promise.resolve({ko:chinese,done:true}),
    call:payload=>{calls.push(payload);return Promise.resolve({ko:korean,left:4});},
    put:(key,value)=>{puts.push([key,value]);return Promise.resolve();}});
  await app.context.openSentence('A passage that was cached in Chinese.');
  assert.equal(calls.length,1,'a cached Chinese answer was shown instead of asking again');
  assert.equal(calls[0].op,'explain');assert.equal(calls[0].target,'ko','translation request lacks the Korean target');
  assert.equal(app.element('ps-ko').textContent,korean);
  assert.deepEqual(puts.map(([,value])=>value.ko),[korean],'the Chinese cache entry was not replaced');
}
{
  const calls=[],puts=[];
  const app=boot({call:payload=>{calls.push(payload);return Promise.resolve(calls.length===1?{ko:chinese,left:4}:{ko:korean,left:3});},
    put:(key,value)=>{puts.push(value);return Promise.resolve();}});
  await app.context.openSentence('A passage answered in Chinese.');
  assert.notEqual(app.element('ps-ko').textContent,chinese,'a Chinese translation was painted');
  assert.equal(app.element('ps-retry').hidden,false,'a wrong-language answer is not retryable');
  assert.equal(puts.length,0,'a Chinese translation was cached');
  await app.context.openSentence('A passage answered in Chinese.');
  assert.equal(calls.length,2);
  assert.notEqual(calls[1].lookupId,calls[0].lookupId,'retry replays the receipt of the Chinese answer');
  assert.equal(app.element('ps-ko').textContent,korean);
}

console.log('Sentence lifecycle ownership verified');
