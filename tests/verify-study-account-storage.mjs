import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function world(){
  const storage=new Map(),events=new EventTarget();
  const context={console,indexedDB:new IDBFactory(),DOMException,setTimeout,clearTimeout,navigator:{},
    window:events,CustomEvent:class extends Event{constructor(name,options={}){super(name);this.detail=options.detail;}},
    localStorage:{get length(){return storage.size;},key:i=>[...storage.keys()][i]??null,getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)}};
  vm.createContext(context);const run=s=>vm.runInContext(s,context);
  run(`let activeScope={id:'user:A',generation:1};
    function captureLearningScope(){return {...activeScope};}
    function isLearningScopeCurrent(scope){return scope.id===activeScope.id&&scope.generation===activeScope.generation;}
    function assertLearningScope(scope){if(!isLearningScopeCurrent(scope))throw Object.assign(Error('Scope changed'),{syncCancelled:true});}
    function learningStorageKey(key,scope){return 'breeze.account.v1.'+encodeURIComponent(scope.id)+'.'+key;}
    function switchScope(id){activeScope={id,generation:activeScope.generation+1};window.dispatchEvent(new CustomEvent('breeze-learning-scope'));}
    let words={};`);
  for(const path of ['scripts/core/storage.js','scripts/core/study-sets.js','scripts/core/study-set-test.js','scripts/core/study-sets-storage.js'])run(read(path));
  const simple=read('scripts/ui/vocabulary-review.js');
  run(simple.slice(simple.indexOf('const SimpleStudySession='),simple.indexOf('/* Review progress')));
  run('globalThis.model=BreezeStudySets;globalThis.simple=SimpleStudySession;');
  return {context,storage,run};
}
const words=Object.fromEntries(Array.from({length:50},(_,i)=>['key-'+i,{word:'word '+i,ko:'뜻 '+i,book:'Book',addedAt:i}]));
async function seed(w,name='Set',source=words){const result=w.context.model.create(await w.context.loadStudySets(),{name,bookTitles:['Book']},source,100);await w.context.commitStudySets(result.state);return result;}

test('A → B → A isolates sets, summary history and all-word sessions',async()=>{
  const w=world(),set=await seed(w,'A');
  w.context.saveStudySetTestRecord(set.set.id,{id:'test-a',at:20,count:2,correct:1,score:50});
  await w.run(`readStudyStorage('breeze.simple-study-session.v1',decodeSimpleStudySession)`);
  await w.run(`commitStudyStorage('breeze.simple-study-session.v1',JSON.stringify(SimpleStudySession.start(['key-0'])),null,decodeSimpleStudySession)`);
  w.run("switchScope('user:B')");assert.equal((await w.context.loadStudySets()).sets.length,0);
  assert.deepEqual(JSON.parse(JSON.stringify((await w.context.exportLearningStorage()).tests.sets)),{});
  await seed(w,'B');w.run("switchScope('user:A')");
  const a=await w.context.exportLearningStorage();assert.equal(a.sets.sets[0].name,'A');assert.equal(a.simple.active.initial[0],'key-0');assert.equal(a.tests.sets[set.set.id][0].id,'test-a');
});

test('late reads and commits cannot install A state after switching to B',async()=>{
  const w=world();await seed(w,'A');
  const read=w.context.loadStudySets();w.run("switchScope('user:B')");await assert.rejects(read,error=>error.syncCancelled===true);
  const b=await w.context.loadStudySets();assert.equal(b.sets.length,0);
  const created=w.context.model.create(b,{name:'B',bookTitles:['Book']},words,200);
  const pending=w.context.commitStudySets(created.state);w.run("switchScope('user:A')");await assert.rejects(pending,error=>error.syncCancelled===true);
  assert.equal((await w.context.loadStudySets()).sets[0].name,'A');
});

test('guest import retries retain fifty words, exclusions, summary IDs and immutable source',async()=>{
  const w=world();w.run("switchScope('guest:fixture')");let original=await seed(w,'Guest');
  original=w.context.model.exclude(original.state,original.set.id,original.set.cards[0].id,200);
  await w.context.commitStudySets(original.state);
  const id=original.state.sets[0].id;w.context.saveStudySetTestRecord(id,{id:'existing-summary',at:10,count:50,correct:25,score:50});
  const before=JSON.stringify(await w.context.exportLearningStorage());const source=w.run('captureLearningScope()');
  w.run("switchScope('user:A')");const target=w.run('captureLearningScope()');
  for(let i=0;i<3;i++)await w.context.importLearningStorage(source,target,'import-guest',{});
  const result=await w.context.exportLearningStorage();assert.equal(result.sets.sets.length,1);assert.equal(result.sets.sets[0].cards.length,50);assert.equal(result.sets.sets[0].excludedIds.length,1);assert.equal(result.tests.sets[id].length,1);
  assert.equal(JSON.stringify(await w.context.exportLearningStorage(source)),before);
});

test('interrupted import transaction and account change preserve source and permit retry',async()=>{
  const w=world();w.run("switchScope('guest:fixture')");await seed(w);const source=w.run('captureLearningScope()');w.run("switchScope('user:A')");const target=w.run('captureLearningScope()');
  const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const request=put.apply(this,args);request.addEventListener('success',()=>this.transaction.abort());return request;};
  try{await assert.rejects(w.context.importLearningStorage(source,target,'stable-import'));}finally{IDBObjectStore.prototype.put=put;}
  assert.equal((await w.context.loadStudySets()).sets.length,0);
  const pending=w.context.importLearningStorage(source,target,'stable-import');w.run("switchScope('user:B')");await assert.rejects(pending,error=>error.syncCancelled===true);assert.equal((await w.context.loadStudySets()).sets.length,0);
  w.run("switchScope('user:A')");await w.context.importLearningStorage(source,w.run('captureLearningScope()'),'stable-import');assert.equal((await w.context.loadStudySets()).sets[0].cards.length,50);
});

test('legacy confirmation import preserves exact source and safely remaps set/session history references',async()=>{
  const w=world(),created=w.context.model.create(null,{name:'Legacy',bookTitles:['Book']},words,100);let legacy=created.state;legacy.sets[0].id='set-1';
  legacy=w.context.model.start(legacy,'set-1',200).state;legacy.sets[0].session.id='session-1';
  const raw=JSON.stringify(legacy,null,2),summary=JSON.stringify({version:1,sets:{'set-1':[{id:'summary',at:10,count:1,correct:1,score:100}]}});
  w.storage.set('breeze.study-sets.v1',raw);w.storage.set('breeze.study-set-tests.v1',summary);
  assert.equal(await w.context.hasLegacyLearningStorage(),true);assert.equal((await w.context.loadStudySets()).sets.length,0);
  await w.context.importLearningStorage({id:'legacy'},w.run('captureLearningScope()'),'legacy-device',{'key-0':'new-key'});
  const result=await w.context.exportLearningStorage(),set=result.sets.sets[0];assert.notEqual(set.id,'set-1');assert.notEqual(set.session.id,'session-1');assert.equal(set.cards[0].key,'new-key');assert.equal(result.tests.sets[set.id][0].id,'summary');
  assert.equal(w.storage.get('breeze.study-sets.v1'),raw);assert.equal(w.storage.get('breeze.study-set-tests.v1'),summary);
});

test('device merges preserve independent frozen simple progress branches and all extant summaries',async()=>{
  const w=world();await seed(w);const local=await w.context.exportLearningStorage(),a=w.context.simple.start(['one','two']),b=w.context.simple.grade(a,w.context.simple.token(a),'again');
  local.simple.active=a;local.tests={version:1,sets:{set:Array.from({length:40},(_,i)=>({id:'a-'+i,at:i,count:1,correct:1,score:100}))}};
  await w.context.mergeLearningStorage(local);const remote=structuredClone(local);remote.simple.active=b;remote.tests.sets.set=Array.from({length:40},(_,i)=>({id:'b-'+i,at:i,count:1,correct:0,score:0}));
  await w.context.mergeLearningStorage(remote);await w.context.mergeLearningStorage(remote);
  const merged=await w.context.exportLearningStorage();assert.equal(merged.simple.active.serial,0);assert.equal(merged.simple.sessions.length,1);assert.equal(merged.simple.sessions[0].serial,1);assert.equal(merged.tests.sets.set.length,80);
});

test('single word addition persists only related set overrides; full checkpoint reads them after restart',async()=>{
  const w=world();let state=await w.context.loadStudySets();
  const data={...words,other:{word:'Other',ko:'별개',book:'Other'}};
  for(let i=0;i<20;i++)state=w.context.model.create(state,{name:'Unrelated '+i,bookTitles:['Other']},data,100+i).state;
  state=w.context.model.create(state,{name:'Related',bookTitles:['Book']},data,200).state;await w.context.commitStudySets(state);
  const index=w.context.model.createVocabularySyncIndex(state,data);data.new={word:'new',ko:'새로운',book:'Book'};
  const guarded=new Proxy(data,{ownKeys(){throw Error('single edit must not enumerate vocabulary');}});
  const synced=w.context.model.syncVocabularyChanges(state,guarded,['new'],300,index,{deletedKeys:[]});
  const ids=synced.state.sets.filter((set,i)=>set!==state.sets[i]).map(set=>set.id);
  assert.equal(ids.length,1);const writes=[],put=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(value,key){writes.push({key,size:JSON.stringify(value).length});return put.call(this,value,key);};
  try{await w.context.commitStudySetsIncremental(synced.state,ids);}finally{IDBObjectStore.prototype.put=put;}
  assert.equal(writes.length,2);assert.ok(writes.every(row=>row.key.endsWith('.revision')||row.key.includes('.set.')));
  assert.equal((await w.context.window.BreezeStudyStorage.exportAccountChanges(ids)).sets.length,1);
  const restored=await w.context.loadStudySets();assert.equal(restored.sets.at(-1).cards.length,51);assert.equal(restored.sets[0].cards.length,1);
  const remote=await w.context.exportLearningStorage();await w.context.mergeLearningStorage(remote);
  assert.equal((await w.context.loadStudySets()).sets.at(-1).cards.length,51);
});

test('two devices retain their current rounds while canonical network exports converge',async()=>{
  const a=world(),b=world();const left=await a.context.exportLearningStorage(),right=await b.context.exportLearningStorage();
  left.simple.active=a.context.simple.start(['left']);right.simple.active=b.context.simple.start(['right']);
  await a.context.mergeLearningStorage(left);await b.context.mergeLearningStorage(right);
  const aa=a.context.window.BreezeStudyStorage,bb=b.context.window.BreezeStudyStorage;
  for(let i=0;i<3;i++){
    await aa.mergeAccountState(await bb.exportAccountState());await bb.mergeAccountState(await aa.exportAccountState());
    assert.equal(JSON.stringify(await aa.exportAccountState()),JSON.stringify(await bb.exportAccountState()));
  }
  assert.equal((await a.context.exportLearningStorage()).simple.active.initial[0],'left');
  assert.equal((await b.context.exportLearningStorage()).simple.active.initial[0],'right');
});

test('duplicate-key import archives an unmappable frozen round instead of replacing it on open',async()=>{
  const w=world();w.run("switchScope('guest:duplicate')");await seed(w);
  await w.run("readStudyStorage('breeze.simple-study-session.v1',decodeSimpleStudySession)");
  const raw=JSON.stringify(w.context.simple.grade(w.context.simple.start(['old-a','old-b']),JSON.stringify([0,'old-a']),'again'));
  await w.context.commitStudyStorage('breeze.simple-study-session.v1',raw,null,w.context.decodeSimpleStudySession);
  const source=w.run('captureLearningScope()');w.run("switchScope('user:A')");
  await w.context.importLearningStorage(source,w.run('captureLearningScope()'),'duplicate-import',{'old-a':'target','old-b':'target'});
  const payload=await w.context.exportLearningStorage();assert.equal(payload.simple.active,null);assert.equal(payload.simple.sessions.length,1);assert.equal(payload.simple.sessions[0].history.length,1);
  w.run("words={target:{word:'same',ko:'뜻'}};function validWordMeaning(item){return !!item?.ko;}");await w.context.loadSimpleStudySession();
  await w.context.commitSimpleStudySession(w.context.simple.start(['target']));
  assert.equal((await w.context.exportLearningStorage()).simple.sessions[0].history.length,1);
});
