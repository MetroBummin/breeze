import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=readFileSync(resolve(root,'scripts/dictionary/sentence.js'),'utf8');
const deferred=()=>{ let resolve; const promise=new Promise(done=>{ resolve=done; }); return {promise,resolve}; };
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function boot({get,call,put}={}){
  const elements=new Map();
  const element=id=>{
    if(elements.has(id)) return elements.get(id);
    const value={id,hidden:id==='sentence-modal',textContent:'',innerHTML:'',children:[],
      appendChild(node){ this.children.push(node); }};
    elements.set(id,value); return value;
  };
  const context=createContext({
    console,Promise,Date,String,AbortController,
    document:{getElementById:element,createElement:()=>element('node-'+Math.random()),addEventListener(){}},
    navigator:{onLine:true}, sb:{}, sbUser:{id:'u'}, curBook:{title:'Book'},
    sentenceHash:text=>text, aiDay:()=>'', save(){}, clearReaderModeCue(){},
    dictGet:get||(()=>Promise.resolve(null)),
    dictCall:call||(()=>Promise.resolve({ko:'ok',points:[]})),
    dictPut:put||(()=>Promise.resolve()),
  });
  new Script(source,{filename:'sentence.js'}).runInContext(context);
  return {context,elements,element};
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
