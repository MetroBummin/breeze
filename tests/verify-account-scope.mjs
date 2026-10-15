import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const entry=(word,ko='뜻',book='Book')=>({word,ko,book,status:1,up:100,addedAt:100});

function world({memory=new Map(),indexedDB=new IDBFactory()}={}){
  const events=new EventTarget(),writes=[],hooks={};
  const localStorage={get length(){return memory.size;},key:i=>[...memory.keys()][i]??null,
    getItem:key=>memory.get(key)??null,
    setItem(key,value){hooks.beforeWrite?.(key,value);writes.push({key,size:String(value).length});memory.set(key,String(value));},
    removeItem:key=>memory.delete(key)};
  const context=vm.createContext({window:{BREEZE_CONFIG:{},addEventListener:events.addEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events)},
    indexedDB,localStorage,crypto:webcrypto,CustomEvent,DOMException,URL,console:{warn(){}},navigator:{},setTimeout,clearTimeout,toast(){},queueSync(){}});
  const run=source=>vm.runInContext(source,context);
  for(const path of ['scripts/core/storage.js','scripts/core/account-scope.js','scripts/core/word-integrity.js'])run(read(path));
  const state=read('scripts/core/state.js');run(state.slice(0,state.indexOf('const posOf =')));
  for(const path of ['scripts/core/study-sets.js','scripts/core/study-set-test.js','scripts/core/study-sets-storage.js'])run(read(path));
  const simple=read('scripts/ui/vocabulary-review.js');
  run(simple.slice(simple.indexOf('const SimpleStudySession='),simple.indexOf('/* Review progress')));
  return {context,run,memory,indexedDB,writes,hooks,
    scope:()=>clone(run('captureLearningScope()')),
    snapshot:()=>clone(run('({words,dead})')),
    key:(key,scope)=>context.learningStorageKey(key,scope),
    switch:id=>context.switchLearningAccount(id),
    add:values=>{context.fixtureWords=clone(values);return run('Object.assign(words,fixtureWords);saveWords(Object.keys(fixtureWords))');},
    export:()=>context.exportLearningStorage()};
}

async function seedLearning(w,{name='Synthetic set',values={alpha:entry('alpha')},legacyId=false}={}){
  w.add(values);w.context.fixtureName=name;
  const state=await w.context.loadStudySets();w.context.fixtureState=state;
  const result=w.run('BreezeStudySets.create(fixtureState,{name:fixtureName,bookTitles:["Book"]},words,100)');
  let id=result.set.id;
  if(legacyId){result.state.sets[0].id='set-1';id='set-1';}
  w.context.fixtureState=result.state;w.context.fixtureId=id;
  const started=w.run('BreezeStudySets.start(fixtureState,fixtureId,200).state');
  if(legacyId)started.sets[0].session.id='session-2';
  await w.context.commitStudySets(started);
  const raw=w.run('JSON.stringify(SimpleStudySession.grade(SimpleStudySession.start(Object.keys(words)),JSON.stringify([0,Object.keys(words)[0]]),"again"))');
  const before=await w.context.readStudyStorage('breeze.simple-study-session.v1',w.context.decodeSimpleStudySession);
  await w.context.commitStudyStorage('breeze.simple-study-session.v1',raw,before,w.context.decodeSimpleStudySession);
  const record={id:'record-'+name,at:300,count:1,correct:1,score:100};
  w.memory.set(w.key('breeze.study-set-tests.v1',w.scope()),JSON.stringify({version:1,sets:{[id]:[record]}}));
  return {id,state:clone(started),record};
}

test('same phone A → B → A isolates words, tombstones, pending/conflict journals and all saved study records',async()=>{
  const w=world();await w.switch('A');const seeded=await seedLearning(w);
  w.run('dead.removed=400;save(LS_DEAD,dead);save("breeze.word-conflicts",{conflict:{key:"alpha",left:{ko:"A"},right:{ko:"other"}}});save("breeze.vault.changed",401)');
  const a=w.scope();w.memory.set(w.key('breeze.word-write.pending',a),JSON.stringify({pending:entry('pending','A journal')}));
  const pendingSwitch=w.switch('B');
  assert.equal(w.scope().id,'user:B','scope and vocabulary swap synchronously before IDB');
  assert.deepEqual(w.snapshot(),{words:{},dead:{}});
  w.context.fixtureScope=a;assert.equal(w.run('isLearningScopeCurrent(fixtureScope)'),false);
  assert.throws(()=>w.context.assertLearningScope(a),/계정/);
  await pendingSwitch;const b=await w.export();
  assert.equal(b.sets.sets.length,0);assert.equal(b.simple.active,null);assert.deepEqual(clone(b.tests.sets),{});
  assert.deepEqual(clone(w.run('load("breeze.word-conflicts",{})')),{});assert.equal(w.run('load("breeze.vault.changed",0)'),0);
  w.add({beta:entry('beta','B only')});await w.switch('A');
  assert.equal(w.run('isLearningScopeCurrent(fixtureScope)'),false,'returning to the same account cannot revive an earlier generation');
  assert.deepEqual(Object.keys(w.snapshot().words).sort(),['alpha','pending']);assert.equal(w.snapshot().dead.removed,400);
  const returned=await w.export();assert.equal(returned.sets.sets[0].id,seeded.id);assert.equal(returned.simple.active.history.length,1);
  assert.deepEqual(clone(returned.tests.sets[seeded.id]),[seeded.record]);
  assert.ok(w.run('load("breeze.word-conflicts",{}).conflict'));assert.equal(w.run('load("breeze.vault.changed",0)'),401);
  await w.switch(null);assert.equal(Object.keys(w.snapshot().words).length,0,'A never becomes guest');
  await w.switch('B');assert.deepEqual(Object.keys(w.snapshot().words),['beta']);
});

test('guest 50-word import retries interrupted item persistence without duplicate words, sets, sessions or summaries',async()=>{
  const w=world(),values=Object.fromEntries(Array.from({length:50},(_,i)=>['word'+i,entry('word'+i,'뜻 '+i)]));
  const seeded=await seedLearning(w,{values,legacyId:true}),guest=w.scope();
  const source=JSON.stringify(w.snapshot()),sourceStudy=JSON.stringify(await w.export());
  let count=0;
  w.hooks.beforeWrite=key=>{if(key.includes('user%3AA')&&key.includes('breeze.word-item.')&&++count===20)throw new DOMException('Synthetic quota','QuotaExceededError');};
  await assert.rejects(w.switch('A'),/저장/);
  assert.ok(w.memory.get(w.key('breeze.word-write.pending',w.scope())),'interrupted transaction retained');
  w.hooks.beforeWrite=null;
  await w.switch('A');await w.switch('A');
  assert.equal(Object.keys(w.snapshot().words).length,50);
  const imported=await w.export();assert.equal(imported.sets.sets.length,1);assert.equal(imported.sets.sets[0].cards.length,50);
  assert.notEqual(imported.sets.sets[0].id,'set-1');assert.notEqual(imported.sets.sets[0].session.id,'session-2');
  assert.equal(imported.simple.active.history.length,1);
  assert.deepEqual(clone(imported.tests.sets[imported.sets.sets[0].id]),[seeded.record]);
  assert.equal(JSON.stringify(w.context.learningSourceWords(guest)),JSON.stringify(JSON.parse(source).words));
  const current=w.scope();assert.equal(JSON.stringify(await w.context.exportLearningStorage(guest,current)),sourceStudy,'original source study data retained');
});

test('an interrupted local merge stays on the device and the next account can merge it too',async()=>{
  const w=world();await seedLearning(w,{values:Object.fromEntries(Array.from({length:50},(_,i)=>['g'+i,entry('guest'+i)]))});
  const entered=deferred(),release=deferred(),original=w.context.importLearningStorage;
  let stalled=false;
  w.context.importLearningStorage=async(...args)=>{
    if(!stalled){
      stalled=true;
      const guard=w.run('captureLearningScope()');
      entered.resolve();
      await release.promise;
      w.context.assertLearningScope(guard);
    }
    return original(...args);
  };
  const transfer=w.switch('A');await entered.promise;
  await w.switch('B');assert.equal(Object.keys(w.snapshot().words).length,50);
  release.resolve();await assert.rejects(transfer,/계정/);w.context.importLearningStorage=original;
  assert.equal((await w.export()).sets.sets.length,1);
  await w.switch('A');assert.equal(Object.keys(w.snapshot().words).length,50);assert.equal((await w.export()).sets.sets.length,1);
  await w.switch(null);assert.equal(Object.keys(w.snapshot().words).length,50);
  await w.switch('B');assert.equal(Object.keys(w.snapshot().words).length,50);
});

test('switching accounts before the first local read still gives both accounts the same device words',async()=>{
  const w=world();w.add(Object.fromEntries(Array.from({length:50},(_,i)=>['g'+i,entry('guest'+i)])));
  const transfer=w.switch('A'),rejected=assert.rejects(transfer,/계정/);
  await w.switch('B');await rejected;assert.equal(Object.keys(w.snapshot().words).length,50);
  await w.switch('A');assert.equal(Object.keys(w.snapshot().words).length,50);
});

test('guest exact expression/meaning duplicates merge conservatively; different meanings and set snapshots survive',async()=>{
  const w=world();await w.switch('A');w.add({bank:entry('bank','은행'),case:entry('US','미국')});await w.switch(null);
  const seeded=await seedLearning(w,{values:{same:entry('bank','은행'),bank:entry('bank','강둑'),similar:entry('bank','은행 (금융기관)'),case:entry('us','우리')}});
  await w.switch('A');const values=Object.values(w.snapshot().words);
  assert.equal(values.length,5);assert.equal(values.filter(row=>row.word==='bank'&&row.ko==='은행').length,1);
  for(const [word,meaning] of [['bank','강둑'],['bank','은행 (금융기관)'],['US','미국'],['us','우리']])assert.ok(values.some(row=>row.word===word&&row.ko===meaning));
  const imported=await w.export(),set=imported.sets.sets.find(row=>row.name==='Synthetic set');
  assert.equal(set.cards.length,4);assert.equal(set.session.queue.length,2,'same spelling groups frozen senses without dropping either meaning');
  assert.deepEqual(clone(imported.tests.sets[set.id]),[seeded.record]);
  for(const card of set.cards)assert.equal(w.snapshot().words[card.key].ko,card.ko,'all set references point to the matching imported meaning');
});

test('coalescing exact guest duplicates archives the original simple session history before starting a new round',async()=>{
  const w=world();await seedLearning(w,{values:{first:entry('duplicate','같은 뜻'),second:entry('duplicate','같은 뜻')}});
  const source=await w.export(),original=clone(source.simple.active);assert.equal(original.history.length,1);
  await w.switch('A');assert.equal(Object.keys(w.snapshot().words).length,1);
  let imported=await w.export();assert.equal(imported.simple.active,null);assert.ok(imported.simple.sessions.some(session=>JSON.stringify(session)===JSON.stringify(original)));
  await w.context.loadSimpleStudySession();w.run('globalThis.fixtureNewSession=SimpleStudySession.start(Object.keys(words))');
  await w.context.commitSimpleStudySession(w.context.fixtureNewSession);
  imported=await w.export();assert.equal(imported.simple.active.initial.length,1);assert.ok(imported.simple.sessions.some(session=>JSON.stringify(session)===JSON.stringify(original)));
});

test('legacy device words merge on login, survive a retained decision, and stay available for the next account',async()=>{
  const original=JSON.stringify({old:entry('old','기존 뜻')},null,2),pending=JSON.stringify({late:entry('late','기존 journal')});
  const conflict={key:'old',left:{ko:'기존 뜻'},right:{ko:'다른 뜻'},at:99},conflicts=JSON.stringify({exact:conflict},null,2);
  const memory=new Map([['breeze.words',original],['breeze.word-write.pending',pending],['breeze.word-conflicts',conflicts],['breeze.learning.legacy-decision.v1','retained']]);
  const w=world({memory});assert.deepEqual(w.snapshot().words,{});
  assert.equal(await w.context.confirmLegacyLearningImport(),false);
  await w.switch('A');assert.deepEqual(Object.keys(w.snapshot().words).sort(),['late','old']);
  assert.deepEqual(clone(w.run('Object.values(load("breeze.word-conflicts",{}))')),[conflict]);
  assert.equal(await w.context.confirmLegacyLearningImport(),false);
  assert.equal(w.run('Object.keys(load("breeze.word-conflicts",{})).length'),1,'retry does not duplicate source conflict history');
  assert.equal(Object.keys(w.snapshot().words).length,2);
  const archived=await w.context.readLearningArchive('legacy');
  assert.equal(archived.words.old.ko,'기존 뜻');assert.equal(archived.words.late.ko,'기존 journal');
  assert.deepEqual(archived.conflicts.exact,conflict);
  assert.equal(memory.get('breeze.words'),undefined);assert.equal(memory.get('breeze.word-write.pending'),undefined);assert.equal(memory.get('breeze.word-conflicts'),undefined);
  await w.switch(null);assert.deepEqual(w.snapshot().words,{});
  await w.switch('B');assert.deepEqual(Object.keys(w.snapshot().words).sort(),['late','old']);
});

test('conflict-only legacy history merges into the logged-in account and the original stays put',async()=>{
  const conflict={key:'missing-old-word',left:{ko:'옛 뜻'},right:{ko:'보존할 뜻'},at:99},raw=JSON.stringify({historic:conflict},null,2);
  const w=world({memory:new Map([['breeze.word-conflicts',raw]])});await w.switch('A');
  assert.deepEqual(clone(w.run('Object.values(load("breeze.word-conflicts",{}))')),[conflict]);
  assert.deepEqual((await w.context.readLearningArchive('legacy')).conflicts.historic,conflict);
  assert.equal(w.memory.get('breeze.word-conflicts'),undefined);
  await w.switch(null);assert.deepEqual(clone(w.run('load("breeze.word-conflicts",{})')),{});
  await w.switch('B');assert.deepEqual(clone(w.run('Object.values(load("breeze.word-conflicts",{}))')),[conflict]);
});

test('durable deletion wins after word removal persistence fails, including offline B → A return',async()=>{
  const w=world();await w.switch('A');w.add({deleted:entry('deleted','삭제할 뜻')});
  w.run('delete words.deleted;dead.deleted=900;saveDead("deleted")');
  w.hooks.beforeWrite=key=>{if(key===w.key('breeze.word-write.pending',w.scope()))throw new DOMException('Synthetic quota','QuotaExceededError');};
  assert.equal(w.run('saveWords("deleted")'),false);w.hooks.beforeWrite=null;
  assert.ok(w.memory.get(w.key('breeze.word-item.deleted',w.scope())),'stale durable word remains to exercise recovery');
  await w.switch('B');await w.switch('A');
  assert.equal(w.snapshot().words.deleted,undefined);assert.equal(w.snapshot().dead.deleted,900);
});

test('large scoped vocabulary keeps single-word persistence bounded and never writes book assets',async()=>{
  const w=world();await w.switch('A');
  w.add(Object.fromEntries(Array.from({length:5000},(_,i)=>['word'+i,entry('word'+i,'뜻 '+i)])));w.writes.length=0;
  w.run('words.word2500.ko="edited";saveWords("word2500")');
  assert.equal(w.writes.length,2);assert.ok(w.writes.reduce((n,row)=>n+row.size,0)<1000);
  assert.ok(w.writes.every(row=>row.key.startsWith(w.key('breeze.word-',w.scope()))));
  await w.switch('B');assert.equal(Object.keys(w.snapshot().words).length,0);await w.switch('A');assert.equal(Object.keys(w.snapshot().words).length,5000);
  assert.equal(w.snapshot().words.word2500.ko,'edited');
});

test('a failed local merge leaves the device words in place and a later login imports them',async()=>{
  const w=world();w.add({guest:entry('guest','보존해야 함')});
  const guest=w.scope();
  let failed=false;
  w.hooks.beforeWrite=key=>{if(String(key).includes('breeze.word-item.')&&!failed){failed=true;throw new DOMException('Synthetic quota','QuotaExceededError');}};
  await assert.rejects(w.switch('A'));
  assert.equal(w.scope().id.startsWith('user:'),true);
  w.hooks.beforeWrite=null;
  await w.switch(null);assert.equal(w.scope().id,guest.id);assert.equal(w.snapshot().words.guest.ko,'보존해야 함');
  await w.switch('A');assert.equal(w.snapshot().words.guest?.ko,'보존해야 함');
  await w.switch('B');assert.equal(w.snapshot().words.guest?.ko,'보존해야 함');
});

test('an old exclusive claim does not stop the next account from merging the same device words',async()=>{
  const w=world();w.add({guest:entry('guest','보존해야 함')});
  await w.switch('A');assert.equal(w.snapshot().words.guest?.ko,'보존해야 함');
  w.memory.delete('breeze.learning.claims.v1');
  await w.switch('B');assert.equal(w.snapshot().words.guest?.ko,'보존해야 함');
  await w.switch('A');assert.equal(Object.keys(w.snapshot().words).length,1);
});

test('deleting an imported meaning during an interrupted transfer cannot resurrect it on retry',async()=>{
  const w=world();w.add({guest:entry('guest','삭제한 뜻')});
  const original=w.context.importLearningStorage;
  w.context.importLearningStorage=async()=>{throw Error('Synthetic interruption after words');};
  await assert.rejects(w.switch('A'),/Synthetic interruption/);
  assert.equal(w.snapshot().words.guest.ko,'삭제한 뜻');
  w.run('delete words.guest;dead.guest=900;saveDead("guest");saveWords("guest")');
  w.context.importLearningStorage=original;
  await w.switch('A');await w.switch('B');await w.switch('A');
  assert.deepEqual(w.snapshot().words,{});assert.equal(w.snapshot().dead.guest,900);
});

test('guest tombstones and frozen set references migrate without deleting A’s different same-key meaning',async()=>{
  const w=world();await w.switch('A');w.add({bank:entry('bank','은행')});await w.switch(null);
  await seedLearning(w,{values:{bank:entry('bank','강둑')}});const guest=w.scope();
  w.run('delete words.bank;dead.bank=900;saveDead("bank");saveWords("bank")');
  await w.switch('A');
  assert.equal(w.snapshot().words.bank.ko,'은행');assert.equal(w.snapshot().dead.bank,undefined);
  const imported=await w.export(),card=imported.sets.sets[0].session.queue[0];
  assert.notEqual(card.key,'bank');assert.equal(card.ko,'강둑');assert.equal(w.snapshot().dead[card.key],900);
  assert.equal(w.snapshot().words[card.key],undefined);
  assert.equal(w.context.learningSourceDead(guest).bank,900);
  await w.switch('B');await w.switch('A');assert.equal(w.snapshot().words.bank.ko,'은행');assert.equal(w.snapshot().dead[card.key],900);
});

test('the same logged-out words merge into A and, after logout, into B without taking A-only data',async()=>{
  const w=world();
  w.add(Object.fromEntries(Array.from({length:50},(_,i)=>['local'+i,entry('local'+i,'기기 '+i)])));
  const local=Object.keys(w.snapshot().words).sort();
  await w.switch('A');
  assert.deepEqual(Object.keys(w.snapshot().words).sort(),local);
  w.add({onlyA:entry('only-a','A만')});
  assert.equal(Object.keys(w.snapshot().words).length,51);
  await w.switch(null);
  assert.deepEqual(Object.keys(w.snapshot().words).sort(),local,'logout keeps device words and drops the account-only word');
  await w.switch('B');
  assert.deepEqual(Object.keys(w.snapshot().words).sort(),local);
  assert.equal(w.snapshot().words.onlyA,undefined);
  await w.switch('A');
  assert.equal(Object.keys(w.snapshot().words).length,51);
  assert.equal(w.snapshot().words.onlyA.ko,'A만');
  await w.switch('A');
  assert.equal(Object.keys(w.snapshot().words).length,51,'logging into A again does not duplicate device words');
  await w.switch('B');
  assert.equal(Object.keys(w.snapshot().words).length,50);
});

test('two accounts can both receive one device collection',async()=>{
  const a=world();a.add({guest:entry('guest','한 기기 단어')});
  const b=world({memory:a.memory,indexedDB:a.indexedDB});assert.equal(a.scope().id,b.scope().id);
  await Promise.all([a.switch('A'),b.switch('B')]);
  assert.equal(a.snapshot().words.guest?.ko,'한 기기 단어');
  assert.equal(b.snapshot().words.guest?.ko,'한 기기 단어');
  await a.switch(null);assert.equal(a.snapshot().words.guest?.ko,'한 기기 단어');
});
