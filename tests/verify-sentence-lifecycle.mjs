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
    console,Promise,Date,String,AbortController,
    window,innerWidth:width,innerHeight:height,
    requestAnimationFrame:fn=>setTimeout(()=>fn(Date.now()),0),cancelAnimationFrame:clearTimeout,
    document:{body,getElementById:element,createElement:()=>element('node-'+Math.random()),addEventListener(){}},
    navigator:{onLine:true}, sb:{}, sbUser:{id:'u'}, curBook:{title:'Book'},
    sentenceHash:text=>text, aiDay:()=>'', save(){}, clearReaderModeCue(){},
    sentenceGestureStillPressed:()=>contact.pressed,
    dictGet:get||(()=>Promise.resolve(null)),
    dictCall:call||(()=>Promise.resolve({ko:'ok',points:[]})),
    dictPut:put||(()=>Promise.resolve()),
  });
  new Script(source,{filename:'sentence.js'}).runInContext(context);
  return {context,elements,element,classes,contact,visualViewport,listeners};
}

/* Pending is always the existing bottom pill; only the result presentation adapts. */
for(const viewport of [{width:390,height:844,compact:true},{width:1100,height:800,compact:false}]){
  const cache=deferred(),app=boot({...viewport,get:()=>cache.promise});
  const opening=app.context.openSentence('Pending everywhere');
  assert.equal(app.element('sentence-modal').hidden,true,'pending opened a result window');
  assert.equal(app.element('sentence-pill-status').hidden,false,'pending did not occupy the Reader pill');
  assert.equal(app.element('readback').inert,true,'a side control stayed interactive behind the pending pill');
  cache.resolve({ko:'결과',points:['구조']}); await opening; await tick();
  assert.equal(app.element('sentence-modal').hidden,false,'result presentation did not open');
  assert.equal(app.classes.has('sentence-compact'),viewport.compact,
    'only compact result presentation should become a bottom sheet');
  assert.equal(app.element('sentence-pill-status').hidden,true,'pending pill remained beside the result');
}

/* A cache hit may finish under the long-press finger, but the result waits for pointerup. */
{
  const app=boot({pressed:true,get:()=>Promise.resolve({ko:'즉시 결과',points:[]})});
  await app.context.openSentence('Fast');
  assert.equal(app.element('sentence-modal').hidden,true,'fast result appeared under the held finger');
  app.contact.pressed=false; app.context.sentenceGestureReleased(); await tick();
  assert.equal(app.element('sentence-modal').hidden,false,'fast result did not appear after pointer release');
}

/* A cache hit that arrives after close has no right to reopen the modal. */
{
  const cache=deferred(), app=boot({get:()=>cache.promise});
  const opening=app.context.openSentence('A');
  app.context.closeSentence();
  cache.resolve({ko:'old A',points:[]});
  await opening;
  assert.equal(app.element('sentence-modal').hidden,true,'stale cache hit reopened a closed sentence');
  assert.notEqual(app.element('ps-ko').textContent,'old A','stale cache hit painted after close');
}

/* Offline/failure leaves pending and uses the same result surface with retry. */
{
  const app=boot({get:()=>Promise.resolve(null)});
  app.context.navigator.onLine=false;
  await app.context.openSentence('Offline');
  assert.equal(app.element('sentence-modal').hidden,false,'offline lookup stayed in infinite pending');
  assert.equal(app.element('sentence-pill-status').hidden,true,'failure left the pending pill active');
  assert.equal(app.element('ps-retry').hidden,false,'retryable failure lost its retry action');
}

/* Reversed A/B cache completion must still leave B as the only owner. */
{
  const a=deferred(),b=deferred();
  const app=boot({get:key=>key==='s:A'?a.promise:b.promise});
  const openingA=app.context.openSentence('A');
  const openingB=app.context.openSentence('B');
  a.resolve({ko:'old A',points:[]}); await openingA;
  assert.equal(app.element('ps-en').textContent,'B','A cache response replaced B waiting UI');
  b.resolve({ko:'new B',points:[]}); await openingB;
  assert.equal(app.element('ps-en').textContent,'B');
  assert.equal(app.element('ps-ko').textContent,'new B');
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
  calls.get('A').resolve({ko:'old A',points:[],left:9}); await openingA;
  assert.equal(app.element('ps-en').textContent,'B','network A replaced B after abort race');
  assert.ok(puts.some(([key])=>key==='s:A'),'valid stale answer was not retained in cache');
  calls.get('B').resolve({ko:'new B',points:[],left:8}); await openingB;
  assert.equal(app.element('ps-ko').textContent,'new B');
}

/* Closing while the cache write is pending also invalidates the final paint. */
{
  const answer=deferred(),write=deferred();
  const app=boot({get:()=>Promise.resolve(null),call:()=>answer.promise,put:()=>write.promise});
  const opening=app.context.openSentence('A'); await tick();
  answer.resolve({ko:'late A',points:[],left:7}); await tick();
  app.context.closeSentence(); write.resolve(); await opening;
  assert.equal(app.element('sentence-modal').hidden,true,'dictPut completion reopened the sentence');
}

console.log('Sentence lifecycle ownership verified');
