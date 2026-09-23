import test from 'node:test';
import assert from 'node:assert/strict';
import {WORD,VAULT,PROGRESS,server,device,word,book,pos,barrier,deferred} from './sync-test-transport.mjs';

const vault=db=>db.peek(WORD);
function raceReads(db){
  const meet=barrier(2);
  db.hooks.afterRead=async call=>{if(call.key===WORD&&call.columns==='data')await meet();};
}

test('concurrent additions survive conditional writes',async()=>{
  const db=server();raceReads(db);
  const a=device(db,'phone',{words:{apple:word(100),banana:word(200)},dirty:200});
  const b=device(db,'tablet',{words:{apple:word(100),orange:word(200)},dirty:200});
  assert.deepEqual(await Promise.all([a.api.vault(false),b.api.vault(false)]),[true,true]);
  assert.deepEqual(Object.keys(vault(db).words).sort(),['apple','banana','orange']);
  assert.ok(db.calls.some(call=>call.conflict));
});

test('a deletion wins over a stale word, including equal timestamps',async()=>{
  const db=server();raceReads(db);
  const a=device(db,'phone',{dead:{apple:300},dirty:300});
  const b=device(db,'tablet',{words:{apple:word(300),orange:word(200)},dirty:200});
  await Promise.all([a.api.vault(false),b.api.vault(false)]);
  assert.equal(vault(db).words.apple,undefined);
  assert.equal(vault(db).dead.apple,300);
  assert.ok(vault(db).words.orange);
});

test('two first inserts cannot overwrite each other',async()=>{
  const db=server();db.rows.delete('user/'+WORD);raceReads(db);
  const a=device(db,'phone',{words:{banana:word(200)},dirty:200});
  const b=device(db,'tablet',{words:{orange:word(200)},dirty:200});
  await Promise.all([a.api.vault(false),b.api.vault(false)]);
  assert.deepEqual(Object.keys(vault(db).words).sort(),['banana','orange']);
});

test('offline local words upload even when the remembered remote revision is unchanged',async()=>{
  const db=server();
  const a=device(db,'phone',{words:{banana:word(200)},dirty:0,seen:'base'});
  assert.equal(await a.api.vault(false),true);
  assert.ok(vault(db).words.banana);
});

test('a keyed old device imports encrypted words without changing old vault data',async()=>{
  const db=server({words:{oldWord:word(180)},wordbook:false,
    items:[{id:'book',identity:'book',title:'Preserve me'}]});
  const before=db.peek(VAULT);
  const a=device(db,'old-phone',{legacyImported:false});
  assert.equal(await a.api.vault(false),true);
  assert.equal(vault(db).words.oldWord.up,180);
  assert.deepEqual(db.peek(VAULT),before);
  assert.equal(a.memory.get('breeze.wordbook.legacy-imported:user'),true);
  assert.ok(db.calls.every(call=>call.key!==PROGRESS));
});

test('a new device syncs account words without an old recovery key',async()=>{
  const db=server({words:{shared:word(180)},items:[{id:'old-book',identity:'old-book'}]});
  const a=device(db,'new-phone',{legacyImported:false});
  a.api.clearLegacyKey();a.context.vaultGet=async()=>null;
  assert.equal(await a.api.vault(false),true);
  assert.equal(a.snapshot().words.shared.up,180);
  assert.equal(a.memory.get('breeze.wordbook.legacy-imported:user'),true);
  assert.ok(db.calls.every(call=>call.key!==PROGRESS));
});

test('an unchanged wordbook makes no server write',async()=>{
  const db=server();const a=device(db,'phone',{seen:'base'});
  assert.equal(await a.api.all(false),true);
  assert.deepEqual(db.calls.map(call=>call.kind),['select']);
});

test('book and reading changes do not schedule or send sync',async()=>{
  const db=server({items:[{id:'remote',identity:'remote',position:pos(.8,500).position}]});
  const a=device(db,'phone',{books:[book('local')],positions:{local:pos(.5,300).position}});
  a.api.queueWords();a.api.queueProgress();
  assert.equal(a.timers.size,0);
  assert.equal(a.memory.get('breeze.vault.changed'),0);
  assert.equal(await a.api.all(false),true);
  assert.deepEqual(db.peek(VAULT).envelope.payload.items,[{id:'remote',identity:'remote',position:pos(.8,500).position}]);
  assert.ok(db.calls.every(call=>call.key!==PROGRESS));
});

test('settings shows only account and wordbook controls',()=>{
  const a=device(server(),'phone');
  const html=a.api.render();
  assert.match(html,/단어장 동기화/);
  assert.match(html,/지금 동기화/);
  assert.doesNotMatch(html,/복구키|다른 기기 연결|읽기자료 옮기기|내 책·글 내보내기/);
});

test('a word edit during an in-flight write remains dirty',async()=>{
  const db=server();const a=device(db,'phone',{words:{banana:word(200)},dirty:200});
  let injected=false;
  db.hooks.beforeWrite=call=>{if(call.key===WORD&&!injected){injected=true;a.add('orange',word(300));}};
  assert.equal(await a.api.vault(false),true);
  assert.ok(a.memory.get('breeze.vault.changed'));
  assert.equal(vault(db).words.orange,undefined);
  assert.equal(await a.api.vault(false),true);
  assert.ok(vault(db).words.orange);
});

test('conflict retries stop and leave local words pending',async()=>{
  const db=server();const a=device(db,'phone',{words:{banana:word(200)},dirty:200});
  let version=0;
  db.hooks.beforeWrite=call=>{if(call.key===WORD){const row=db.peek(WORD);row.revision='competitor-'+(++version);db.put('user',WORD,row);}};
  assert.equal(await a.api.vault(false),false);
  assert.equal(version,4);
  assert.ok(a.memory.get('breeze.vault.changed'));
  delete db.hooks.beforeWrite;
  assert.equal(await a.api.vault(true),true);
  assert.ok(vault(db).words.banana);
});

test('quota failures preserve dirty state and cool down automatic attempts',async()=>{
  const db=server();const a=device(db,'phone',{words:{banana:word(200)},dirty:200});
  db.hooks.beforeWrite=()=>({status:402,message:'egress quota'});
  assert.equal(await a.api.vault(false),false);
  assert.ok(a.memory.get('breeze.vault.changed'));
  const count=db.calls.length;
  assert.equal(await a.api.vault(false),false);
  assert.equal(db.calls.length,count);
  delete db.hooks.beforeWrite;
  assert.equal(await a.api.vault(true),true);
});

test('account changes reject a late response',async()=>{
  const db=server();db.seed('other');
  const a=device(db,'phone');const entered=deferred(),release=deferred();
  db.hooks.afterRead=async call=>{if(call.key===WORD&&call.user==='user'){entered.resolve();await release.promise;}};
  const old=a.api.vault(false);await entered.promise;
  a.api.setup(db.client('phone'),'other',db.peek('__breeze_vault_meta_v2__','other'));
  a.context.syncTest.change('breeze.vault.changed');
  release.resolve();
  assert.equal(await old,false);
  assert.equal(a.snapshot().sbUser.id,'other');
});
