import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {Script,createContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function declarations(path,names){
  const source=read(path);
  return names.map(name=>{
    const match=source.match(new RegExp('^(?:async )?function '+name+'\\([^]*?^\\}', 'm'));
    assert.ok(match,`Missing function ${name}`);
    return match[0];
  }).join('\n');
}
const storage=declarations('scripts/core/storage.js',['localTransaction','originalBookForHash']);
const importer=declarations('scripts/library/library.js',['importFile']);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const hash='a'.repeat(64),otherHash='b'.repeat(64),thirdHash='c'.repeat(64);
const file={name:'Imported.epub',size:12};
const prepared={id:'file-'+hash.slice(0,32),hash,kind:'epub',title:'Imported',tmpId:'tmp-fixture',
  paras:['Newly imported text.'],size:12,lastModified:0,textAvailable:true};

/* Requests are driven by each test so a successful request and a committed
   transaction can be tested independently. Unexpected bulk reads/writes fail. */
function database(records=new Map()){
  const state={transactions:[],requests:[],reads:[],keyReads:0};
  const db={transaction(name,mode){
    assert.equal(name,'originals');assert.equal(mode,'readonly');
    const tx={error:null,objectStore(){return {
      getAllKeys(){state.keyReads++;return request('keys');},
      get(key){state.reads.push(key);return request('get',key);},
      getAll(){assert.fail('Duplicate lookup loaded every original record');},
      put(){assert.fail('Duplicate lookup repaired an unrelated original');},
    };},abort(){tx.onabort?.();}};
    function request(kind,key){const value={};state.requests.push({kind,key,value});return value;}
    state.transactions.push(tx);return tx;
  }};
  function drain(){
    while(state.requests.length){
      const {kind,key,value}=state.requests.shift();
      value.result=kind==='keys'?[...records.keys()]:records.get(key);
      value.onsuccess();
    }
  }
  return {db,state,drain,complete(){drain();state.transactions.at(-1)?.oncomplete();},
    fail(message='Original storage failed'){const tx=state.transactions.at(-1);tx.error=Error(message);tx.onabort();}};
}
function world(values={}){
  const context=createContext({console:{error(){},warn(){}},Promise,Set,Map,Date,...values});
  new Script(storage+'\n'+importer).runInContext(context);return context;
}
function importWorld(localBooks,records){
  const fixture=database(records),events={saved:[],applied:[],originalWrites:[],messages:[],rendered:0};
  const positions=Object.fromEntries(localBooks.map(book=>[book.id,{p:.6,pi:4,t:123}]));
  const context=world({books:localBooks,positions,vaultRemoteItems:[],idb:async()=>fixture.db,
    prepareImportedFile:async()=>({...prepared}),
    applyPreparedBook:async book=>events.applied.push(book),
    vaultFileIdentity:async()=>null,imgRename:async()=>{},imgPurge:async()=>{},
    remapImportedImages:paras=>paras,
    storeLocalOriginal:async id=>{events.originalWrites.push(id);return {kind:'epub',hash,storedAt:1};},
    bookPut:async book=>events.saved.push(book),
    renderHome:()=>events.rendered++,toast:message=>events.messages.push(message),
  });
  return {...fixture,context,events,positions};
}
async function runImport(fixture){
  const job=fixture.context.importFile(file);await tick();fixture.complete();await job;
}
async function lookup(localBooks,records){
  const fixture=database(records),context=world({idb:async()=>fixture.db});
  const job=context.originalBookForHash(localBooks,hash);await tick();fixture.complete();
  return {...fixture,book:await job};
}

for(const [name,metadata] of [['ID',{id:prepared.id}],['source hash',{sourceHash:hash}],['original hash',{original:{hash}}]]){
  test(`existing ${name} match bypasses storage and keeps the existing book`,async()=>{
    const existing={id:'legacy-id',kind:'epub',title:'My title',...metadata};
    const fixture=importWorld([existing],new Map());const position=fixture.positions[existing.id];
    await runImport(fixture);
    assert.deepEqual(fixture.events.applied,[existing]);assert.equal(fixture.events.saved.length,0);
    assert.equal(fixture.state.transactions.length,0);assert.equal(fixture.context.books.length,1);
    assert.equal(fixture.positions[existing.id],position);
  });
}
test('metadata match retains precedence over an earlier direct-record match',async()=>{
  const earlier={id:'earlier'},metadataMatch={id:'later',sourceHash:hash};
  const fixture=importWorld([earlier,metadataMatch],new Map([['earlier',{hash}]]));
  await runImport(fixture);assert.deepEqual(fixture.events.applied,[metadataMatch]);
  assert.equal(fixture.state.transactions.length,0);
});
test('legacy direct original without metadata reconnects the existing book',async()=>{
  const legacy={id:'legacy',title:'Original title',kind:'epub'};
  const fixture=importWorld([legacy],new Map([['legacy',{hash}]]));
  await runImport(fixture);assert.deepEqual(fixture.events.applied,[legacy]);
  assert.equal(fixture.events.saved.length,0);assert.equal(fixture.context.books.length,1);
});
test('persisted original hash is still checked when both metadata hashes disagree',async()=>{
  const stale={id:'stale',sourceHash:otherHash,original:{hash:thirdHash}};
  const fixture=importWorld([stale],new Map([['stale',{hash}]]));
  await runImport(fixture);assert.deepEqual(fixture.events.applied,[stale]);
  assert.deepEqual(fixture.state.reads,['stale']);assert.equal(fixture.events.saved.length,0);
});
test('first direct match follows book order and does not read past the match',async()=>{
  const first={id:'z-first'},second={id:'a-second'};
  const result=await lookup([first,second],new Map([['a-second',{hash}],['z-first',{hash}]]));
  assert.equal(result.book,first);assert.deepEqual(result.state.reads,['z-first']);
});
test('new import with many books uses one transaction and skips missing original keys',async()=>{
  const localBooks=Array.from({length:120},(_,i)=>({id:'book-'+i,sourceHash:otherHash,
    kind:i<100?'article':'epub',original:i<100?null:{hash:otherHash}}));
  const records=new Map(localBooks.slice(100).map(book=>[book.id,{hash:otherHash,blob:{large:true}}]));
  const expectedReads=localBooks.slice(100).map(book=>book.id);
  const fixture=importWorld(localBooks,records);await runImport(fixture);
  assert.equal(fixture.state.transactions.length,1);assert.equal(fixture.state.keyReads,1);
  assert.deepEqual(fixture.state.reads,expectedReads);
  assert.equal(fixture.events.saved.length,1);assert.equal(fixture.events.saved[0].id,prepared.id);
  assert.equal(fixture.context.books.length,121);
});
test('orphan originals are not adopted and unrelated legacy aliases are not repaired',async()=>{
  const alias={id:'missing-direct',original:{hash:otherHash}},plain={id:'paste',kind:'paste'};
  const records=new Map([['orphan-target',{hash}],['old-alias-id',{hash:otherHash}]]);
  const fixture=importWorld([alias,plain],records);await runImport(fixture);
  assert.deepEqual(fixture.state.reads,[]);assert.equal(fixture.state.keyReads,1);
  assert.equal(fixture.events.saved.length,1);assert.equal(fixture.events.applied.length,0);
  assert.equal(records.has('missing-direct'),false);
});
test('explicit legacy recovery still finds and repairs a renamed original',async()=>{
  const record={hash:otherHash,blob:{legacy:true}},writes=[];
  const context=world({originalGet:async()=>null,originalAll:async()=>[record],
    originalPut:async(id,value)=>writes.push([id,value])});
  new Script(declarations('scripts/core/storage.js',['originalGetForBook'])).runInContext(context);
  assert.equal(await context.originalGetForBook({id:'renamed',original:{hash:otherHash}}),record);
  assert.deepEqual(writes,[['renamed',record]]);
});
test('a successful matching request does not resolve before transaction completion',async()=>{
  const book={id:'old'},fixture=database(new Map([['old',{hash}]]));
  const context=world({idb:async()=>fixture.db});let settled=false;
  const job=context.originalBookForHash([book],hash).then(value=>{settled=true;return value;});
  await tick();fixture.drain();await tick();assert.equal(settled,false);
  fixture.complete();assert.equal(await job,book);
});
test('transaction abort after a matching read rejects instead of accepting the match',async()=>{
  const fixture=database(new Map([['old',{hash}]])),context=world({idb:async()=>fixture.db});
  const job=context.originalBookForHash([{id:'old'}],hash);await tick();fixture.drain();
  fixture.fail('Aborted after read');await assert.rejects(job,/Aborted after read/);
});
test('failed duplicate lookup stops import before either original or book is saved',async()=>{
  const fixture=importWorld([{id:'existing'}],new Map());
  const job=fixture.context.importFile(file);await tick();fixture.fail();await job;
  assert.equal(fixture.events.saved.length,0);assert.equal(fixture.events.originalWrites.length,0);
  assert.equal(fixture.events.applied.length,0);assert.equal(fixture.events.rendered,0);
  assert.equal(fixture.context.books.length,1);assert.match(fixture.events.messages.at(-1),/Original storage failed/);
});
test('database-open failure is observable and an empty candidate list needs no database',async()=>{
  let opens=0;const context=world({idb:async()=>{opens++;throw Error('Cannot open originals');}});
  assert.equal(await context.originalBookForHash([],hash),null);assert.equal(opens,0);
  await assert.rejects(context.originalBookForHash([{id:'old'}],hash),/Cannot open originals/);
});
