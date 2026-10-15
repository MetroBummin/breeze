import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {server,device,WORD,word,clone,deferred,barrier} from './sync-test-transport.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const tracking=read('scripts/core/state.js').split('let wordChangeSerial=')[1].split('function saveDead(')[0];
const empty=()=>({version:1,sets:{version:2,sets:[]},simple:{version:1,active:null,sessions:{}},tests:{version:1,sets:{}}});
function transport(){
  const words=server({words:{}}),study=server({wordbook:false});study.rows.clear();
  const owners=new Map(),calls=[],hooks={};
  const client=label=>({...words.client(label),from:table=>(table==='study_state'?study:words).client(label).from('words'),
    async rpc(name,args){
      const user=owners.get(label)||'user',call={name,args:clone(args),user,label};calls.push(call);
      const error=await hooks.beforeRpc?.(call);if(error)return {data:null,error};
      const authenticated=owners.get(label)||'user';
      if(args.expected_user_id!==authenticated)return {data:null,error:{code:'42501',message:'RPC account changed'}};
      const db=name==='breeze_patch_wordbook'?words:study,key=name==='breeze_patch_wordbook'?WORD:'learning-v1',previous=db.peek(key,user);
      if(!previous||previous.revision!==args.expected_revision)return {data:false,error:null};
      const next=clone(previous);next.revision=args.next_revision;
      if(name==='breeze_patch_wordbook'){
        for(const field of ['words','dead'])for(const [id,value] of Object.entries(args['patch_'+field])){
          if(value===null)delete next[field][id];else next[field][id]=value;
        }
      }else{
        const changes=new Map(args.changed_sets.map(set=>[set.id,set]));
        next.payload.sets.sets=next.payload.sets.sets.map(set=>changes.get(set.id)||set);
      }
      db.put(user,key,next);await hooks.afterRpc?.(call);return {data:true,error:null};
    }});
  return {words,study,owners,calls,hooks,client};
}
function fixture(db,label,{initialWords={},learning=empty()}={}){
  const d=device(db.words,label,{words:initialWords}),c=d.context;
  let generation=0,owner='user',payload=clone(learning),exports=0,patchExports=0;
  const saved=new Map(),scope=()=>({id:'user:'+owner,generation});
  db.owners.set(label,owner);
  c.captureLearningScope=scope;
  c.assertLearningScope=token=>{if(token.id!==scope().id||token.generation!==generation)throw Object.assign(new Error('scope changed'),{syncCancelled:true});};
  c.switchLearningAccount=async id=>{
    saved.set(owner,{words:clone(c.words),dead:clone(c.dead),payload:clone(payload)});
    owner=id;generation++;db.owners.set(label,id);
    const next=saved.get(owner)||{words:{},dead:{},payload:empty()};
    c.words=clone(next.words);c.dead=clone(next.dead);payload=clone(next.payload);
    c.resetWordChangeTracking();
  };
  c.validWordMeaning=item=>!!item&&typeof item.ko==='string'&&!!item.ko.trim();
  c.stableWordJson=value=>JSON.stringify(value);
  new Script('let wordChangeSerial='+tracking).runInContext(c);
  c.window.BreezeStudyStorage={
    async exportAccountState(){exports++;return clone(payload);},
    async exportAccountChanges(ids){patchExports++;const wanted=new Set(ids);return {version:1,sets:clone(payload.sets.sets.filter(set=>wanted.has(set.id)))};},
    async mergeAccountState(remote){
      const merged=new Map(remote.sets.sets.map(set=>[set.id,clone(set)]));
      for(const set of payload.sets.sets){const old=merged.get(set.id);if(!old||(set.updatedAt||0)>=(old.updatedAt||0))merged.set(set.id,clone(set));}
      payload={...clone(remote),sets:{...remote.sets,sets:[...merged.values()].sort((a,b)=>a.id.localeCompare(b.id))}};
      return clone(payload);
    }
  };
  new Script(read('scripts/sync/learning-sync.js')+`\n;globalThis.learningTest={sync:doLearningSync,queue:queueLearningSync,activate:activateSyncAccount,
    tracking:()=>({has:hasWordChanges(),snapshot:captureWordChanges()}),mark:markWordChanges};`).runInContext(c);
  d.api.setup(db.client(label),owner,db.words.peek('__breeze_vault_meta_v2__'));
  return {...d,learning:c.learningTest,
    setPayload(value,ids){payload=clone(value);c.learningTest.queue(ids?{detail:{setIds:ids}}:undefined);},
    payload:()=>clone(payload),counts:()=>({exports,patchExports}),
    edit(key,value){if(value===null){delete c.words[key];c.dead[key]=900;}else c.words[key]=clone(value);c.learningTest.mark([key]);d.api.queueWords(true);},
    async activate(id){await c.learningTest.activate({id});}
  };
}

test('learning CAS combines concurrent first inserts in the separate table',async()=>{
  const db=transport(),meet=barrier(2);
  db.study.hooks.afterRead=call=>call.key==='learning-v1'&&call.columns==='data'?meet():undefined;
  const a=fixture(db,'phone',{learning:{...empty(),sets:{version:2,sets:[{id:'a',updatedAt:1,cards:[]}]}}});
  const b=fixture(db,'tablet',{learning:{...empty(),sets:{version:2,sets:[{id:'b',updatedAt:1,cards:[]}]}}});
  assert.deepEqual(await Promise.all([a.learning.sync(false),b.learning.sync(false)]),[true,true]);
  assert.deepEqual(db.study.peek('learning-v1').payload.sets.sets.map(set=>set.id),['a','b']);
  assert.equal(db.words.peek('learning-v1'),undefined);
});

test('learning snapshots received before words retain their cards on a bookless device',async()=>{
  const db=transport(),remote={...empty(),sets:{version:2,sets:[{id:'book-set',cards:[{word:'bank',ko:'은행'}],excludedIds:['old-exclusion']}]}};
  db.study.put('user','learning-v1',{version:1,revision:'server',payload:remote});
  const a=fixture(db,'phone');assert.equal(await a.learning.sync(false),true);
  assert.deepEqual(a.payload().sets.sets,remote.sets.sets);assert.deepEqual(a.snapshot().words,{});
});

test('A to B to A invalidates a delayed learning response even after the owner returns',async()=>{
  const db=transport(),a=fixture(db,'phone'),entered=deferred(),release=deferred();
  db.study.put('user','learning-v1',{version:1,revision:'server',payload:{...empty(),sets:{version:2,sets:[{id:'late'}]}}});
  db.study.hooks.afterRead=async call=>{if(call.key==='learning-v1'){entered.resolve();await release.promise;}};
  const old=a.learning.sync(false);await entered.promise;
  await a.activate('other');await a.activate('user');release.resolve();
  assert.equal(await old,false);assert.deepEqual(a.payload().sets.sets,[]);
  assert.equal(db.study.calls.filter(call=>call.kind!=='select').length,0);
});

test('future learning document is refused without overwriting its data',async()=>{
  const db=transport(),a=fixture(db,'phone'),future={version:9,revision:'future',payload:{unknown:true}};
  db.study.put('user','learning-v1',future);assert.equal(await a.learning.sync(true),false);
  assert.deepEqual(db.study.peek('learning-v1'),future);assert.deepEqual(a.payload(),empty());
});

test('one changed set uses a bounded patch and edits during its ACK remain pending',async()=>{
  const db=transport(),sets=Array.from({length:1000},(_,i)=>({id:'set-'+i,updatedAt:1,cards:[]})),a=fixture(db,'phone',{learning:{...empty(),sets:{version:2,sets}}});
  assert.equal(await a.learning.sync(false),true);const initialExports=a.counts().exports;
  const next=a.payload();next.sets.sets[0].cards=[{word:'one'}];next.sets.sets[0].updatedAt=2;a.setPayload(next,['set-0']);
  let edited=false;
  db.hooks.afterRpc=call=>{if(call.name==='breeze_patch_study_sets'&&!edited){edited=true;const latest=a.payload();latest.sets.sets[1].updatedAt=3;a.setPayload(latest,['set-1']);}};
  assert.equal(await a.learning.sync(false),true);
  assert.equal(a.counts().exports,initialExports);assert.equal(a.counts().patchExports,2);
  assert.deepEqual(db.calls.map(call=>call.args.changed_sets.map(set=>set.id)),[['set-0'],['set-1']]);
  assert.ok(db.calls.every(call=>JSON.stringify(call.args).length<500));
  assert.equal(db.study.peek('learning-v1').payload.sets.sets.find(set=>set.id==='set-1').updatedAt,3);
});

test('5,000 saved words send only the newly changed item after first acknowledgement',async()=>{
  const db=transport(),initialWords=Object.fromEntries(Array.from({length:5000},(_,i)=>['word-'+i,{word:'word-'+i,...word(10)}])),a=fixture(db,'phone',{initialWords});
  assert.equal(await a.api.vault(false),true);db.words.calls.length=0;
  a.edit('new-word',{word:'new-word',...word(200)});assert.equal(await a.api.vault(false),true);
  assert.equal(db.calls.length,1);assert.deepEqual(Object.keys(db.calls[0].args.patch_words),['new-word']);
  assert.ok(JSON.stringify(db.calls[0].args).length<500);assert.equal(db.words.calls.length,0);
  assert.equal(Object.keys(db.words.peek(WORD).words).length,5001);
});

test('slow word ACK never owns local edits and cannot clear a newer changed item',async()=>{
  const db=transport(),a=fixture(db,'phone');await a.api.vault(false);
  const entered=deferred(),release=deferred();let held=false;
  db.hooks.afterRpc=async call=>{if(call.name==='breeze_patch_wordbook'&&!held){held=true;entered.resolve();await release.promise;}};
  a.edit('one',{word:'one',...word(200)});const pending=a.api.vault(false);await entered.promise;
  a.edit('two',{word:'two',...word(300)});assert.ok(a.snapshot().words.two);assert.equal(a.learning.tracking().has,true);
  release.resolve();assert.equal(await pending,true);assert.ok(db.words.peek(WORD).words.two);
  assert.equal(db.calls.length,2);assert.deepEqual(Object.keys(db.calls[1].args.patch_words),['two']);
});

test('missing word patch RPC retains local edits without falling back to a whole upload',async()=>{
  const db=transport(),a=fixture(db,'phone');await a.api.vault(false);db.words.calls.length=0;
  db.hooks.beforeRpc=()=>({code:'PGRST202',message:'RPC not installed'});
  a.edit('offline',{word:'offline',...word(200)});assert.equal(await a.api.vault(false),false);
  assert.equal(db.words.calls.length,0);assert.ok(a.snapshot().words.offline);assert.equal(a.learning.tracking().has,true);
  assert.ok(a.memory.get('breeze.vault.changed'));
});

test('RPC dispatch rejects a changed auth owner even when both accounts share the same revision',async()=>{
  for(const kind of ['word','study']){
    const db=transport(),payload={...empty(),sets:{version:2,sets:[{id:'same-set',updatedAt:1,cards:[]}]}};
    const a=fixture(db,'phone',{learning:payload});
    if(kind==='word')await a.api.vault(false);else await a.learning.sync(false);
    const store=kind==='word'?db.words:db.study,key=kind==='word'?WORD:'learning-v1';
    const other=store.peek(key);store.put('other',key,other);
    db.hooks.beforeRpc=()=>{db.owners.set('phone','other');};
    if(kind==='word')a.edit('private-a',{word:'private-a',...word(300)});
    else{payload.sets.sets[0].cards=[{word:'private-a'}];a.setPayload(payload,['same-set']);}
    assert.equal(await (kind==='word'?a.api.vault(true):a.learning.sync(true)),false);
    assert.equal(db.calls[0].args.expected_user_id,'user');
    assert.deepEqual(store.peek(key,'other'),other);
    assert.ok(a.memory.get(kind==='word'?'breeze.vault.changed':'breeze.learning.changed'));
  }
});

test('A to B to A prevents an old word ACK from clearing the returned account outbox',async()=>{
  const db=transport(),a=fixture(db,'phone');await a.api.vault(false);
  const entered=deferred(),release=deferred();
  db.hooks.afterRpc=async()=>{entered.resolve();await release.promise;};
  a.edit('old',{word:'old',...word(200)});const pending=a.api.vault(false);await entered.promise;
  await a.activate('other');assert.deepEqual(a.snapshot().words,{});
  await a.activate('user');a.edit('new',{word:'new',...word(400)});release.resolve();
  assert.equal(await pending,false);assert.equal(a.learning.tracking().has,true);
  assert.deepEqual(Array.from(a.learning.tracking().snapshot.keys),['new']);
  assert.equal(db.words.peek(WORD,'other'),undefined);assert.ok(a.snapshot().words.new);
});

test('failed local account activation clears public auth ownership and can retry the same account',async()=>{
  const db=transport(),a=fixture(db,'phone'),original=a.context.switchLearningAccount;let failures=1;
  a.context.switchLearningAccount=async id=>{if(failures-- > 0)throw new Error('storage denied before swap');return original(id);};
  await a.activate('other');assert.equal(a.snapshot().sbUser,null);
  assert.equal(await a.api.vault(false),false);
  await a.activate('other');assert.equal(a.snapshot().sbUser.id,'other');
});

test('offline deletion sends a durable tombstone and removes only that word',async()=>{
  const db=transport(),a=fixture(db,'phone',{initialWords:{one:{word:'one',...word(100)},two:{word:'two',...word(100)}}});await a.api.vault(false);
  a.edit('one',null);assert.equal(await a.api.vault(false),true);
  assert.equal(db.words.peek(WORD).words.one,undefined);assert.ok(db.words.peek(WORD).words.two);assert.equal(db.words.peek(WORD).dead.one,900);
  assert.deepEqual(db.calls[0].args.patch_words,{one:null});assert.deepEqual(db.calls[0].args.patch_dead,{one:900});
});

test('failed keyed tombstone persistence refuses remote ACK and retry flushes the same deletion',async()=>{
  const db=transport(),a=fixture(db,'phone',{initialWords:{one:{word:'one',...word(100)}}});await a.api.vault(false);
  const attempts=[];let durable=false;
  a.context.saveDead=keys=>{attempts.push(Array.from(keys));return durable;};
  a.edit('one',null);assert.equal(await a.api.vault(true),false);
  assert.equal(db.calls.length,0);assert.ok(db.words.peek(WORD).words.one);
  assert.equal(a.learning.tracking().has,true);assert.ok(a.memory.get('breeze.vault.changed'));
  durable=true;assert.equal(await a.api.vault(true),true);
  assert.deepEqual(attempts,[['one'],['one']]);assert.equal(db.calls.length,1);
  assert.equal(db.words.peek(WORD).words.one,undefined);assert.equal(db.words.peek(WORD).dead.one,900);
  assert.equal(a.learning.tracking().has,false);
});

test('different meanings at the same word key remain active and retries do not duplicate them',async()=>{
  const db=transport();db.words.put('user',WORD,{v:1,revision:'base',legacyImportedAt:1,words:{bank:{word:'bank',ko:'은행',up:100}},dead:{}});
  const a=fixture(db,'phone',{initialWords:{bank:{word:'bank',ko:'강둑',up:200}}});
  assert.equal(await a.api.vault(false),true);assert.deepEqual(Object.values(a.snapshot().words).map(item=>item.ko).sort(),['강둑','은행']);
  assert.equal(await a.api.vault(true),true);assert.equal(Object.keys(a.snapshot().words).length,2);
});

test('different expressions sharing a meaning remain separate active roots and are journaled',async()=>{
  const db=transport();db.words.put('user',WORD,{v:1,revision:'base',legacyImportedAt:1,words:{us:{word:'US',ko:'미국',up:100}},dead:{}});
  const a=fixture(db,'phone',{initialWords:{us:{word:'USA',ko:'미국',up:200}}});
  assert.equal(await a.api.vault(false),true);
  assert.deepEqual(Object.values(a.snapshot().words).map(item=>item.word).sort(),['US','USA']);
  assert.ok(Object.values(a.snapshot().words).every(item=>!item.root));
  assert.equal(Object.keys(a.memory.get('breeze.word-conflicts')).length,1);
  assert.equal(await a.api.vault(true),true);assert.equal(Object.keys(a.snapshot().words).length,2);
});

test('only an identical normalized expression and meaning tuple is treated as the same card',async()=>{
  const db=transport();db.words.put('user',WORD,{v:1,revision:'base',legacyImportedAt:1,words:{phrase:{word:' hello   world ',ko:' 인사 ',up:100}},dead:{}});
  const a=fixture(db,'phone',{initialWords:{phrase:{word:'hello world',ko:'인사',up:200}}});
  assert.equal(await a.api.vault(false),true);assert.equal(Object.keys(a.snapshot().words).length,1);
  assert.equal(a.memory.get('breeze.word-conflicts'),undefined);
});
