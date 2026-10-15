import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function world(indexedDB=new IDBFactory(),scoped=false){
 let scope={id:'user:A',generation:1};const events=new EventTarget();
 const context={window:scoped?events:{},indexedDB,console,setTimeout,clearTimeout,navigator:{},DOMException,localStorage:{getItem:()=>null,setItem:()=>{throw new Error('Test must never write legacy Web Storage');}}};
 if(scoped)Object.assign(context,{captureLearningScope:()=>({...scope}),learningStorageKey:(name,token)=>'breeze.account.v1.'+encodeURIComponent(token.id)+'.'+name,
   isLearningScopeCurrent:token=>token.id===scope.id&&token.generation===scope.generation,
   assertLearningScope(token){if(token.id!==scope.id||token.generation!==scope.generation)throw new Error('Vocabulary test changed account');}});
 vm.createContext(context);
 for(const path of ['scripts/core/storage.js','scripts/core/vocabulary-test.js','scripts/core/vocabulary-test-storage.js'])vm.runInContext(source(path),context,{filename:path});
 return {context,run:code=>vm.runInContext(code,context),indexedDB,switchTo:id=>{scope={id:'user:'+id,generation:scope.generation+1};events.dispatchEvent(new Event('breeze-learning-scope'));}};
}
async function seed(w,n=13){
 return w.run(`replaceVocabularyTest(BreezeVocabularyTest.start(BreezeVocabularyTest.cards(Array.from({length:${n}},(_,i)=>['word'+i,{word:'word'+i,ko:'뜻'+i,addedAt:1}])),'전체',${n},()=>0,100),null)`);
}
const answer=(index,text='답',submitted=true)=>({index,text,submitted,verdict:null,at:100});
async function submit(w,session){const row=answer(session.meta.index);session.meta=await w.context.writeVocabularyTestAnswer(session,row,true);session.answers.set(row.index,row);return row;}
test('draft, cursor and frozen scope survive reopen without touching vocabulary/review storage',async()=>{
 const w=world();assert.equal(await w.context.readVocabularyTest(),null);const session=await seed(w);
 const draft=answer(0,'은행',false);session.meta=await w.context.writeVocabularyTestAnswer(session,draft);session.answers.set(0,draft);
 const restored=await world(w.indexedDB).context.readVocabularyTest();assert.equal(restored.answers.get(0).text,'은행');assert.equal(restored.meta.index,0);assert.equal(restored.manifest.cards.length,13);
 await submit(w,session);const advanced=await w.context.readVocabularyTest();assert.equal(advanced.meta.index,1);assert.equal(advanced.answers.get(0).submitted,true);
});
test('10 and final partial batch are created atomically once; 1 and <10 are supported',async()=>{
 for(const n of [1,9,13]){
  const w=world(),session=await seed(w,n);for(let i=0;i<n;i++)await submit(w,session);
  const restored=await w.context.readVocabularyTest();assert.equal(restored.meta.phase,'results');assert.equal(restored.batches.size,Math.ceil(n/10));
  for(const batch of restored.batches.values()){assert.equal(batch.status,'waiting');assert.equal(batch.end,Math.min(batch.start+10,n));}
 }
});
test('quota or transaction failure cannot advance, complete or lose the last durable answer',async()=>{
 const w=world(),session=await seed(w,1),put=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.put=function(...args){if(this.name==='answers')throw new DOMException('quota','QuotaExceededError');return put.apply(this,args);};
 try{await assert.rejects(submit(w,session),{name:'QuotaExceededError'});}finally{IDBObjectStore.prototype.put=put;}
 const restored=await w.context.readVocabularyTest();assert.equal(restored.meta.index,0);assert.equal(restored.meta.phase,'answering');assert.equal(restored.batches.size,0);assert.equal(restored.answers.size,0);
 await submit(w,session);assert.equal((await w.context.readVocabularyTest()).meta.phase,'results');
});
test('duplicate callbacks and competing tab revisions reject without overwriting',async()=>{
 const w=world(),session=await seed(w,3),other=await w.context.readVocabularyTest();
 await submit(w,session);await assert.rejects(submit(w,other),/changed/);assert.equal((await w.context.readVocabularyTest()).meta.index,1);
});
test('batch claim is durable and exactly one owner can dispatch; late results cannot enter replacement session',async()=>{
 const w=world(),session=await seed(w,1);await submit(w,session);const state=await w.context.readVocabularyTest(),batch=state.batches.get(0),running={...batch,status:'grading'};
 const results=await Promise.allSettled([w.context.writeVocabularyTestBatch(state,running,'waiting'),w.context.writeVocabularyTestBatch(state,running,'waiting')]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal((await w.context.readVocabularyTest()).batches.get(0).status,'grading');
 const manifest=w.run("BreezeVocabularyTest.start(BreezeVocabularyTest.cards([['new',{word:'new',ko:'새로운'}]]),'새 테스트',1)");await w.context.replaceVocabularyTest(manifest,state.meta);
 await assert.rejects(w.context.writeVocabularyTestBatch(state,{...running,status:'error'},'grading'),/changed/);assert.equal((await w.context.readVocabularyTest()).manifest.id,manifest.id);
});
test('grading rows never modify input/cursor and completed outcomes survive reload',async()=>{
 const w=world(),session=await seed(w,1);await submit(w,session);const state=await w.context.readVocabularyTest(),batch=state.batches.get(0);
 await w.context.writeVocabularyTestBatch(state,{...batch,status:'grading'},'waiting');
 const done={...batch,status:'complete',results:[{id:state.manifest.cards[0].id,status:'uncertain',reason:'확인 필요'}]};await w.context.writeVocabularyTestBatch(state,done,'grading');
 const restored=await w.context.readVocabularyTest();assert.equal(restored.batches.get(0).results[0].status,'uncertain');assert.equal(restored.answers.get(0).text,'답');assert.equal(restored.meta.index,1);
});
test('12,000-word typing writes only one answer and cursor, never the large manifest',async()=>{
 const w=world(),session=await seed(w,12000),writes=[],put=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.put=function(value,key){writes.push([this.name,key]);return put.apply(this,arguments);};
 try{for(const text of ['ㄱ','가','강','강둑'])session.meta=await w.context.writeVocabularyTestAnswer(session,answer(0,text,false));}finally{IDBObjectStore.prototype.put=put;}
 assert.equal(writes.length,8);assert.equal(writes.some(([,key])=>key==='manifest'),false);assert.equal(session.meta.index,0);
});
test('corrupt saved cursor/snapshot is refused and original bytes remain',async()=>{
 const w=world();await seed(w,1);await w.run("vocabularyTestDb().then(db=>localTransaction(db,'session','readwrite',tx=>tx.objectStore('session').put({version:99},'meta')))");await assert.rejects(w.context.readVocabularyTest(),/Invalid/);
 const raw=await w.run("vocabularyTestDb().then(db=>localTransaction(db,'session','readonly',(tx,done)=>{const r=tx.objectStore('session').get('meta');r.onsuccess=()=>done(r.result);}))");assert.equal(raw.version,99);
});


test('disabled prototype isolates A/B sessions and leaves the old unscoped database intact',async()=>{
 const legacy=world(),original=await seed(legacy,1);await submit(legacy,original);
 const w=world(legacy.indexedDB,true);assert.equal(await w.context.readVocabularyTest(),null);
 const a=await seed(w,3);a.meta=await w.context.writeVocabularyTestAnswer(a,answer(0,'A draft',false));
 w.switchTo('B');assert.equal(await w.context.readVocabularyTest(),null);const b=await seed(w,2);await submit(w,b);
 w.switchTo('A');const restored=await w.context.readVocabularyTest();assert.equal(restored.answers.get(0).text,'A draft');assert.equal(restored.meta.index,0);
 assert.equal((await legacy.context.readVocabularyTest()).manifest.id,original.manifest.id);
 assert.equal((await legacy.context.readVocabularyTest()).meta.phase,'results');
 assert.equal(w.run('BreezeVocabularyTest.ENABLED'),false,'scope isolation must not enable the prototype');
});
test('stale session, meta and batch cannot write after A → B → A',async()=>{
 const w=world(undefined,true),session=await seed(w,1);await submit(w,session);
 const state=await w.context.readVocabularyTest(),batch=state.batches.get(0);
 w.switchTo('B');w.switchTo('A');
 await assert.rejects(w.context.writeVocabularyTestAnswer(state,{...answer(0),verdict:'remembered'}),/changed account/);
 await assert.rejects(w.context.writeVocabularyTestBatch(state,{...batch,status:'grading'},'waiting'),/changed account/);
 await assert.rejects(w.context.replaceVocabularyTest(state.manifest,state.meta),/changed account/);
 const restored=await w.context.readVocabularyTest();assert.equal(restored.batches.get(0).status,'waiting');assert.equal(restored.answers.get(0).verdict,null);
});
test('late database open cannot return the former account session',async()=>{
 const w=world(undefined,true);await seed(w,1);const db=await w.context.vocabularyTestDb();
 const original=w.context.vocabularyTestDb;let release;w.context.vocabularyTestDb=()=>new Promise(resolve=>{release=resolve;});
 const pending=w.context.readVocabularyTest();w.switchTo('B');w.switchTo('A');release(db);
 await assert.rejects(pending,/changed account/);w.context.vocabularyTestDb=original;
 assert.equal((await w.context.readVocabularyTest()).meta.index,0);
});
test('account change aborts an answer transaction before any partial cursor or batch commits',async()=>{
 const w=world(undefined,true),session=await seed(w,1),put=IDBObjectStore.prototype.put;let switched=false;
 IDBObjectStore.prototype.put=function(...args){
   if(this.name==='answers'&&!switched){switched=true;w.switchTo('B');}
   return put.apply(this,args);
 };
 try{await assert.rejects(submit(w,session));}finally{IDBObjectStore.prototype.put=put;}
 w.switchTo('A');const restored=await w.context.readVocabularyTest();assert.equal(restored.meta.index,0);assert.equal(restored.answers.size,0);assert.equal(restored.batches.size,0);
});
