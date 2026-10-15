import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const word=(text,ko)=>({word:text,ko,book:'Book',status:1,up:1,addedAt:1});

function world(){
  const memory=new Map(),hooks={};
  const localStorage={
    get length(){return memory.size;},
    key:i=>[...memory.keys()][i]??null,
    getItem:key=>memory.has(key)?memory.get(key):null,
    setItem(key,value){
      const next=String(value);
      hooks.beforeSet?.(String(key),next);
      if(hooks.limit!=null){
        let used=0;
        for(const [name,stored] of memory)if(name!==String(key))used+=name.length+String(stored).length;
        if(used+String(key).length+next.length>hooks.limit)throw new DOMException('The quota has been exceeded.','QuotaExceededError');
      }
      memory.set(String(key),next);
    },
    removeItem(key){hooks.beforeRemove?.(String(key));memory.delete(key);}
  };
  const events=new EventTarget();
  const context=vm.createContext({
    window:{BREEZE_CONFIG:{},addEventListener:events.addEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events)},
    indexedDB:new IDBFactory(),localStorage,crypto:webcrypto,CustomEvent,DOMException,URL,
    console:{warn(){}},navigator:{},setTimeout,clearTimeout,toast(){},queueSync(){}
  });
  const run=source=>vm.runInContext(source,context,{filename:'migration-harness.js'});
  for(const path of ['scripts/core/storage.js','scripts/core/account-scope.js','scripts/core/word-integrity.js'])run(read(path));
  const state=read('scripts/core/state.js');run(state.slice(0,state.indexOf('const posOf =')));
  for(const path of ['scripts/core/study-sets.js','scripts/core/study-set-test.js','scripts/core/study-sets-storage.js'])run(read(path));
  const simple=read('scripts/ui/vocabulary-review.js');
  run(simple.slice(simple.indexOf('const SimpleStudySession='),simple.indexOf('/* Review progress')));
  return {context,run,memory,hooks};
}

function seedWords(w){
  const guest=w.context.learningGuestId();
  const guestKey='breeze.account.v1.'+encodeURIComponent(guest)+'.breeze.word-item.keep';
  const accountKey='breeze.account.v1.user%3AA.breeze.word-item.mine';
  w.memory.set('breeze.words',JSON.stringify({legacy:word('legacy','옛'),only:word('only','오직')}));
  w.memory.set('breeze.word-item.legacy',JSON.stringify(word('legacy','옛 항목')));
  w.memory.set('breeze.dead-item.gone','9');
  w.memory.set('breeze.word-conflicts',JSON.stringify({historic:{key:'legacy',left:{ko:'옛'},right:{ko:'다른'}}}));
  w.memory.set(guestKey,JSON.stringify(word('keep','보존')));
  w.memory.set(accountKey,JSON.stringify(word('mine','내 것')));
  return {guestKey,accountKey};
}

function keptSet(w,name){
  w.context.fixtureName=name;
  w.context.fixtureWords={alpha:word('alpha','뜻')};
  return w.run('JSON.stringify(BreezeStudySets.create(null,{name:fixtureName,bookTitles:["Book"]},fixtureWords,100).state)');
}

function fatHistory(count,pad=4000){
  const rows=[];
  for(let i=0;i<count;i++)rows.push({id:'s'+i,at:i,count:1,correct:1,score:100,rows:[{pad:'x'.repeat(pad)}]});
  rows.push({id:'pending',at:count+1,count:1,correct:0,score:null,pending:true,rows:[{word:'alpha',meanings:['뜻'],answer:'',status:'pending'}]});
  return JSON.stringify({version:1,sets:{kept:rows}});
}

function countIdbWrites(fn){
  const add=IDBObjectStore.prototype.add,put=IDBObjectStore.prototype.put,del=IDBObjectStore.prototype.delete;
  let writes=0;
  IDBObjectStore.prototype.add=function(...args){writes++;return add.apply(this,args);};
  IDBObjectStore.prototype.put=function(...args){writes++;return put.apply(this,args);};
  IDBObjectStore.prototype.delete=function(...args){writes++;return del.apply(this,args);};
  return Promise.resolve().then(fn).finally(()=>{
    IDBObjectStore.prototype.add=add;IDBObjectStore.prototype.put=put;IDBObjectStore.prototype.delete=del;
  }).then(result=>({result,writes}));
}

test('first launch copies words, sets and progress, then a second launch writes nothing',async()=>{
  const w=world(),keys=seedWords(w);
  const setKey=w.context.learningStorageKey('breeze.study-sets.v1');
  const sessionKey=w.context.learningStorageKey('breeze.simple-study-session.v1');
  const archiveKey=w.context.learningStorageKey('breeze.simple-study-archives.v1');
  const accountSet='breeze.account.v1.user%3AA.breeze.study-sets.v1';
  const raw=keptSet(w,'Kept'),session=w.run('JSON.stringify(SimpleStudySession.start(["alpha"]))');
  w.memory.set(setKey,raw);w.memory.set(setKey+'.backup','exact backup');
  w.memory.set(sessionKey,session);
  w.memory.set(archiveKey,JSON.stringify({version:1,sessions:[JSON.parse(session)]}));
  w.memory.set(accountSet,keptSet(w,'Account set'));
  w.memory.set('breeze.study-set-tests.v1',fatHistory(45));
  w.memory.set(w.context.learningStorageKey('breeze.study-set-tests.v1'),fatHistory(3,20));
  await w.context.migrateDurableLocalStorage();
  assert.equal(w.memory.has('breeze.words'),false);
  assert.equal(w.memory.has('breeze.word-item.legacy'),false);
  assert.equal(w.memory.has('breeze.dead-item.gone'),false);
  assert.equal(w.memory.has('breeze.word-conflicts'),false);
  assert.equal(JSON.parse(w.memory.get(keys.guestKey)).ko,'보존');
  assert.equal(JSON.parse(w.memory.get(keys.accountKey)).ko,'내 것');
  const archived=await w.context.readLearningArchive('legacy');
  assert.equal(archived.words.legacy.ko,'옛 항목');
  assert.equal(archived.words.only.ko,'오직');
  assert.equal(archived.dead.gone,9);
  assert.equal(archived.conflicts.historic.left.ko,'옛');
  assert.equal(w.memory.has(setKey),false);
  assert.equal(w.memory.has(setKey+'.backup'),false);
  assert.equal(w.memory.has(sessionKey),false);
  assert.equal(w.memory.has(archiveKey),false);
  assert.equal(w.memory.has(accountSet),false);
  assert.equal((await w.context.loadStudySets()).sets[0].name,'Kept');
  const progress=w.context.decodeSimpleStudySession(await w.context.readStudyStorage('breeze.simple-study-session.v1',w.context.decodeSimpleStudySession));
  assert.equal(progress.initial.length,1);
  assert.equal(progress.initial[0],'alpha');
  const savedArchive=w.context.studySimpleArchiveDecode(await w.context.readStudyStorage('breeze.simple-study-archives.v1',w.context.studySimpleArchiveDecode));
  assert.equal(savedArchive.sessions.length,1);
  const accountRecord=await w.run(`studyMigrationRead(${JSON.stringify(accountSet)})`);
  assert.equal(JSON.parse(accountRecord.value).sets[0].name,'Account set');
  const legacyTests=await w.context.studyTestsReadMerged({id:'legacy',generation:0});
  assert.equal(legacyTests.sets.kept.length,46);
  assert.equal(legacyTests.sets.kept.some(row=>row.pending&&row.rows.length===1),true);
  const hot=JSON.parse(w.memory.get('breeze.study-set-tests.v1'));
  assert.equal(hot.sets.kept.length,41);
  assert.equal(hot.sets.kept.filter(row=>!row.pending).every(row=>!row.rows),true);
  const quiet=await countIdbWrites(()=>w.context.migrateDurableLocalStorage());
  assert.equal(quiet.writes,0);
  assert.equal(w.memory.has('breeze.words'),false);
  assert.equal(JSON.parse(w.memory.get(keys.guestKey)).ko,'보존');
  assert.equal((await w.context.readLearningArchive('legacy')).words.only.ko,'오직');
  assert.equal((await w.context.studyTestsReadMerged({id:'legacy',generation:0})).sets.kept.length,46);
});

test('a launch killed while deleting resumes without shrinking the archive',async()=>{
  const w=world(),keys=seedWords(w);
  const remove=w.context.localStorage.removeItem.bind(w.context.localStorage);
  let thrown=false;
  w.context.localStorage.removeItem=key=>{
    if(!thrown&&key==='breeze.word-item.legacy'){thrown=true;throw new Error('killed');}
    return remove(key);
  };
  await w.context.migrateDurableLocalStorage();
  assert.equal(thrown,true);
  assert.equal(w.memory.has('breeze.word-item.legacy'),true);
  const archived=await w.context.readLearningArchive('legacy');
  assert.equal(archived.words.legacy.ko,'옛 항목');
  assert.equal(archived.words.only.ko,'오직');
  assert.equal(JSON.parse(w.memory.get(keys.guestKey)).ko,'보존');
  assert.equal(JSON.parse(w.memory.get(keys.accountKey)).ko,'내 것');
  w.context.localStorage.removeItem=remove;
  const second=await countIdbWrites(()=>w.context.migrateDurableLocalStorage());
  assert.equal(second.writes,0,'a resumed archive is not rewritten from the keys that remain');
  assert.equal(w.memory.has('breeze.word-item.legacy'),false);
  assert.equal(w.memory.has('breeze.words'),false);
  const resumed=await w.context.readLearningArchive('legacy');
  assert.equal(resumed.words.legacy.ko,'옛 항목');
  assert.equal(resumed.words.only.ko,'오직');
  assert.equal(resumed.dead.gone,9);
  assert.equal(JSON.parse(w.memory.get(keys.guestKey)).ko,'보존');
  assert.equal(JSON.parse(w.memory.get(keys.accountKey)).ko,'내 것');
});

test('a read-back that does not match leaves the localStorage copies in place',async()=>{
  const w=world();seedWords(w);
  const read=w.context.readLearningArchiveStrict;
  let calls=0;
  w.context.readLearningArchiveStrict=async id=>{
    const saved=await read(id);
    if(++calls===2)return {version:1,words:{},dead:{},conflicts:{}};
    return saved;
  };
  await w.context.migrateDurableLocalStorage();
  assert.equal(JSON.parse(w.memory.get('breeze.words')).only.ko,'오직');
  assert.equal(w.memory.has('breeze.word-item.legacy'),true);
  w.context.readLearningArchiveStrict=read;
  await w.context.migrateDurableLocalStorage();
  assert.equal(w.memory.has('breeze.words'),false);
  assert.equal((await w.context.readLearningArchive('legacy')).words.only.ko,'오직');
});

test('an interrupted study-set move keeps both copies, then the next launch removes only the verified one',async()=>{
  const w=world();
  const setKey=w.context.learningStorageKey('breeze.study-sets.v1');
  const raw=keptSet(w,'Kept');
  w.memory.set(setKey,raw);w.memory.set(setKey+'.backup','exact backup');
  const remove=w.context.localStorage.removeItem.bind(w.context.localStorage);
  w.context.localStorage.removeItem=key=>{if(key===setKey)throw new Error('killed');return remove(key);};
  await w.context.migrateDurableLocalStorage();
  assert.equal(w.memory.get(setKey),raw);
  const record=await w.context.studyMigrationRead(setKey);
  assert.equal(record.value,raw);
  assert.equal(record.legacy[setKey+'.backup'],'exact backup');
  w.context.localStorage.removeItem=remove;
  await w.context.migrateDurableLocalStorage();
  assert.equal(w.memory.has(setKey),false);
  assert.equal(w.memory.has(setKey+'.backup'),false);
  assert.equal((await w.context.loadStudySets()).sets[0].name,'Kept');
  assert.equal((await w.context.studyMigrationRead(setKey)).value,raw);
});

test('a different IndexedDB study set is not replaced or deleted from localStorage',async()=>{
  const w=world();
  const setKey=w.context.learningStorageKey('breeze.study-sets.v1');
  const stored=keptSet(w,'Indexed'),local=keptSet(w,'Local only');
  await w.run(`studyStorageDb().then(db=>localTransaction(db,'records','readwrite',tx=>tx.objectStore('records').put({version:1,value:${JSON.stringify(stored)},legacy:{[${JSON.stringify(setKey)}]:${JSON.stringify(stored)}}},${JSON.stringify(setKey)})))`);
  w.memory.set(setKey,local);
  await w.context.migrateDurableLocalStorage();
  assert.equal(w.memory.get(setKey),local);
  assert.equal((await w.context.studyMigrationRead(setKey)).value,stored);
});

test('a full localStorage migrates without a new receipt and still accepts a small write',async()=>{
  const w=world(),keys=seedWords(w);
  const history=fatHistory(45,8000);
  w.memory.set('breeze.study-set-tests.v1',history);
  let used=0;for(const [name,value] of w.memory)used+=name.length+value.length;
  w.hooks.limit=used;
  let blocked=0;
  w.hooks.beforeSet=(key)=>{if(key==='breeze.study-set-tests.v1'&&blocked===0){blocked++;throw new DOMException('The quota has been exceeded.','QuotaExceededError');}};
  assert.throws(()=>w.context.localStorage.setItem('breeze.debug.receipt','1'),/quota/i);
  await w.context.migrateDurableLocalStorage();
  assert.equal(blocked,1);
  assert.equal(w.memory.has('breeze.words'),false);
  assert.equal(JSON.parse(w.memory.get(keys.guestKey)).ko,'보존');
  assert.equal(JSON.parse(w.memory.get(keys.accountKey)).ko,'내 것');
  assert.equal((await w.context.readLearningArchive('legacy')).words.only.ko,'오직');
  const merged=await w.context.studyTestsReadMerged({id:'legacy',generation:0});
  assert.equal(merged.sets.kept.length,46);
  const hot=JSON.parse(w.memory.get('breeze.study-set-tests.v1'));
  assert.equal(hot.sets.kept.length,41);
  assert.equal([...w.memory.keys()].some(key=>/migrat/i.test(key)),false);
  w.context.localStorage.setItem('breeze.debug.after','ok');
  assert.equal(w.memory.get('breeze.debug.after'),'ok');
});
