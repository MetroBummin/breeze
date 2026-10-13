import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import {vocabulary} from './helpers/study-quota-fixture.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const key='breeze.study-sets.v1',simpleKey='breeze.simple-study-session.v1';
const words={a:{word:'wind',ko:'바람',book:'A',example:'The wind blew.'}};
function world({raw,storage=new Map(),indexedDB=new IDBFactory()}={}){
 if(raw!==undefined)storage.set(key,raw);
 const context={window:{},indexedDB,DOMException,console,setTimeout,clearTimeout,navigator:{},
  localStorage:{get length(){return storage.size;},key:i=>[...storage.keys()][i]??null,getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)}};
 vm.createContext(context);
 for(const path of ['scripts/core/storage.js','scripts/core/study-sets.js','scripts/core/study-sets-storage.js'])vm.runInContext(read(path),context,{filename:path});
 vm.runInContext('globalThis.engine=BreezeStudySets;',context);
 const simple=read('scripts/ui/vocabulary-review.js');
 vm.runInContext(simple.slice(simple.indexOf('const SimpleStudySession='),simple.indexOf('let simpleWordCards='))+'\nglobalThis.simple=SimpleStudySession;',context);
 const run=s=>vm.runInContext(s,context);
 const record=()=>run(`studyStorageDb().then(db=>localTransaction(db,'records','readonly',(tx,done)=>{const r=tx.objectStore('records').get('${key}');r.onsuccess=()=>done(r.result);}))`);
 return {context,storage,indexedDB,run,record};
}
async function seed(w,source=words,titles=['A']){const result=w.context.engine.create(await w.context.loadStudySets(),{name:'Exam',bookTitles:titles},source,100);await w.context.commitStudySets(result.state);return result;}
function legacy(){const w=world(),s=w.context.engine.create(null,{name:'Legacy',bookTitles:['A']},words,100).state;s.version=1;return JSON.stringify(s,null,2);}

test('v1 migrates exact working and backup bytes before cleanup; vocabulary and dormant history untouched',async()=>{
 const raw=legacy(),w=world({raw});w.storage.set(key+'.backup-v1','exact backup\n');w.storage.set('breeze.words','legacy vocabulary');w.storage.set('breeze.vocabulary-review.v1','dormant history');
 const state=await w.context.loadStudySets(),record=await w.record();
 assert.equal(state.version,2);assert.equal(record.value,raw);assert.equal(record.legacy[key],raw);assert.equal(record.legacy[key+'.backup-v1'],'exact backup\n');
 assert.equal(w.storage.has(key),false);assert.equal(w.storage.has(key+'.backup-v1'),false);
 assert.equal(w.storage.get('breeze.words'),'legacy vocabulary');assert.equal(w.storage.get('breeze.vocabulary-review.v1'),'dormant history');
 await w.context.commitStudySets(state);assert.equal((await w.record()).legacy[key],raw);
 const reload=world(w);assert.equal((await reload.context.loadStudySets()).sets[0].cards[0].ko,'바람');
});
test('malformed, null, future and damaged IDB records are refused, never reset',async()=>{
 for(const raw of ['{bad json','null',JSON.stringify({version:99,sets:[]}),JSON.stringify({version:1,sets:'bad'})]){
  const w=world({raw});await assert.rejects(w.context.loadStudySets());assert.equal(w.storage.get(key),raw);assert.equal(await w.record(),undefined);
 }
 const w=world();await seed(w);await w.run(`studyStorageDb().then(db=>localTransaction(db,'records','readwrite',tx=>tx.objectStore('records').put({version:99,value:null,legacy:{}},'${key}')))`);
 await assert.rejects(w.context.loadStudySets());assert.equal((await w.record()).version,99);
});
test('migration transaction failure keeps every original byte and retries',async()=>{
 const raw=legacy(),w=world({raw}),add=IDBObjectStore.prototype.add;
 IDBObjectStore.prototype.add=function(){throw new DOMException('Injected IDB quota','QuotaExceededError');};
 try{await assert.rejects(w.context.loadStudySets(),{name:'QuotaExceededError'});}finally{IDBObjectStore.prototype.add=add;}
 assert.equal(w.storage.get(key),raw);assert.equal(await w.record(),undefined);
 await w.context.loadStudySets();assert.equal((await w.record()).legacy[key],raw);
});
test('interruption after archive commit or during cleanup resumes without losing or replacing archives',async()=>{
 for(const failure of ['readback','cleanup']){
  const raw=legacy(),w=world({raw});w.storage.set(key+'.backup-v1','original backup');
  if(failure==='readback'){const transact=w.context.localTransaction;w.context.localTransaction=(db,store,mode,fn)=>mode==='readonly'?Promise.reject(Error('readback failed')):transact(db,store,mode,fn);}
  else{const remove=w.context.localStorage.removeItem;let n=0;w.context.localStorage.removeItem=k=>{if(++n===2)throw Error('cleanup interrupted');return remove(k);};}
  await assert.rejects(w.context.loadStudySets());
  const reload=world(w);const s=await reload.context.loadStudySets();assert.equal(s.sets.length,1);assert.equal((await reload.record()).legacy[key],raw);assert.equal((await reload.record()).legacy[key+'.backup-v1'],'original backup');
  assert.equal(w.storage.has(key),false);assert.equal(w.storage.has(key+'.backup-v1'),false);
 }
});
test('legacy changes after migration are preserved and block writing over newer IDB data',async()=>{
 const w=world();await seed(w);const before=await w.record();w.storage.set(key,legacy());
 await assert.rejects(w.context.loadStudySets(),/changed/);await assert.rejects(w.context.commitStudySets(w.context.readStudySets()),/changed/);
 assert.equal((await w.record()).value,before.value);assert.equal(w.storage.get(key),legacy());
});
test('IDB abort after put success does not report a committed answer or change cached state',async()=>{
 const w=world();await seed(w);const before=(await w.record()).value,put=IDBObjectStore.prototype.put;
 const next=w.context.engine.rename(w.context.readStudySets(),'set-1','New name',200).state;
 IDBObjectStore.prototype.put=function(...args){const request=put.apply(this,args);request.addEventListener('success',()=>this.transaction.abort());return request;};
 try{await assert.rejects(w.context.commitStudySets(next));}finally{IDBObjectStore.prototype.put=put;}
 assert.equal((await w.record()).value,before);assert.equal(w.context.readStudySets().sets[0].name,'Exam');
 await w.context.commitStudySets(next);assert.equal(w.context.readStudySets().sets[0].name,'New name');
});
test('unread writes and competing-tab stale writes fail transactionally',async()=>{
 const a=world();await assert.rejects(a.context.commitStudySets(a.context.engine.normalize(null)),/read/);await seed(a);
 const b=world(a);await b.context.loadStudySets();
 const first=a.context.engine.rename(a.context.readStudySets(),'set-1','Writer A',200).state;
 const stale=b.context.engine.rename(b.context.readStudySets(),'set-1','Writer B',200).state;
 const results=await Promise.allSettled([a.context.commitStudySets(first),b.context.commitStudySets(stale)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 assert.equal((await b.context.loadStudySets()).sets[0].name,'Writer A');
});
test('5,000 meanings, overlapping sets, exclusions, frozen queues and history survive quota-independent writes and restart',async()=>{
 const w=world(),data=vocabulary();w.storage.set('breeze.words',JSON.stringify(data));const before=w.storage.get('breeze.words');
 w.context.localStorage.setItem=()=>{throw new DOMException('Web Storage full','QuotaExceededError');};
 let state=await w.context.loadStudySets();
 for(let i=0;i<6;i++){const r=w.context.engine.create(state,{name:'Overlap '+i,bookTitles:Array.from({length:20},(_,j)=>'Reading '+(j+1))},data,100+i);state=w.context.engine.start(r.state,r.set.id,200+i).state;}
 const id=state.sets[0].id,card=state.sets[0].cards[0];state=w.context.engine.exclude(state,id,card.id,300).state;
 let view=w.context.engine.view(state,id);view=w.context.engine.reveal(view.state,id,view.token);view=w.context.engine.grade(view.state,id,view.token,'repeat',400);
 view=w.context.engine.reveal(view.state,id,view.token);view=w.context.engine.grade(view.state,id,view.token,'remembered',500);await w.context.commitStudySets(view.state);
 assert.ok((await w.record()).value.length>5*1024*1024,'collection exceeds Chromium localStorage character quota');
 const reload=world(w),loaded=await reload.context.loadStudySets();assert.equal(JSON.stringify(loaded),JSON.stringify(view.state));
 assert.equal(loaded.sets[0].session.answers.length,2);assert.equal(loaded.sets[0].session.queue.length,2000);assert.equal(loaded.sets[0].excludedIds[0],card.id);assert.equal(w.storage.get('breeze.words'),before);
});
test('All Words working session and history migrate exactly; quota failure retains old session',async()=>{
 const w=world(),session=w.context.simple.start(Object.keys(vocabulary()));const next=w.context.simple.grade(session,w.context.simple.token(session),'again'),raw=JSON.stringify(next);
 w.storage.set(simpleKey,raw);const decode=s=>{if(s===null)return null;const v=w.context.simple.restore(s);if(!v)throw Error('Invalid session');return v;};
 assert.equal(await w.context.readStudyStorage(simpleKey,decode),raw);assert.equal(w.storage.has(simpleKey),false);
 const graded=JSON.stringify(w.context.simple.grade(next,w.context.simple.token(next),'remember'));
 await w.context.commitStudyStorage(simpleKey,graded,raw,decode);assert.equal(await w.context.readStudyStorage(simpleKey,decode),graded);
 await assert.rejects(w.context.commitStudyStorage(simpleKey,graded,raw,decode),/changed/);
 const other=world();other.storage.set(simpleKey,'broken');await assert.rejects(other.context.readStudyStorage(simpleKey,decode));assert.equal(other.storage.get(simpleKey),'broken');
});
test('post-commit durability-policy exception cannot turn success into a failed write',async()=>{
 const w=world();w.context.requestDurableLocalStorage=()=>{throw Error('optional policy failure');};await seed(w);assert.equal((await w.record()).value,w.run('studySetsReadValue'));
});
