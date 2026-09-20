import test from 'node:test';
import assert from 'node:assert/strict';
import {VAULT,META,PROGRESS,server,device,word,book,pos,barrier,deferred} from './sync-test-transport.mjs';
const vault=db=>db.peek(VAULT).envelope.payload;
const progress=db=>db.peek(PROGRESS)?.envelope.payload.records;
function raceReads(db,key){const meet=barrier(2);db.hooks.afterRead=async call=>{if(call.key===key&&call.columns==='data')await meet();};}

test('concurrent vocabulary additions both survive the initial sync',async()=>{
  const db=server();raceReads(db,VAULT);
  const a=device(db,'phone',{words:{apple:word(100),banana:word(200)},dirty:200});
  const b=device(db,'tablet',{words:{apple:word(100),orange:word(200)},dirty:200});
  assert.deepEqual(await Promise.all([a.api.vault(false),b.api.vault(false)]),[true,true]);
  assert.deepEqual(Object.keys(vault(db).words).sort(),['apple','banana','orange']);
  assert.ok(db.calls.some(call=>call.conflict),'The test must really overlap writes');
});
test('concurrent deletion and stale snapshot do not resurrect a tombstone',async()=>{
  const db=server();raceReads(db,VAULT);
  const a=device(db,'phone',{dead:{apple:300},dirty:300});
  const b=device(db,'tablet',{words:{apple:word(100),orange:word(200)},dirty:200});
  await Promise.all([a.api.vault(false),b.api.vault(false)]);
  assert.equal(vault(db).words.apple,undefined);assert.equal(vault(db).dead.apple,300);
  assert.ok(vault(db).words.orange);
});
test('two first inserts cannot overwrite each other',async()=>{
  const db=server();db.rows.delete('user/'+VAULT);raceReads(db,VAULT);
  const a=device(db,'phone',{words:{banana:word(200)},dirty:200});
  const b=device(db,'tablet',{words:{orange:word(200)},dirty:200});
  await Promise.all([a.api.vault(false),b.api.vault(false)]);
  assert.deepEqual(Object.keys(vault(db).words).sort(),['banana','orange']);
});
test('old rows without revision are upgraded with a guarded CAS',async()=>{
  const db=server({revision:null});raceReads(db,VAULT);
  const a=device(db,'phone',{words:{banana:word(200)},dirty:200});
  const b=device(db,'tablet',{words:{orange:word(200)},dirty:200});
  await Promise.all([a.api.vault(false),b.api.vault(false)]);
  assert.deepEqual(Object.keys(vault(db).words).sort(),['apple','banana','orange']);
  assert.ok(db.calls.some(call=>call.filters.some(([field,value])=>field==='data->>revision'&&value===null)));
});
test('clean local winners repair previously lost server words and deletions',async()=>{
  const db=server({words:{apple:word(100),orange:word(200)}});
  const a=device(db,'phone',{words:{banana:word(200)},dead:{apple:300},dirty:0});
  assert.equal(await a.api.vault(false),true);
  assert.deepEqual(Object.keys(vault(db).words).sort(),['banana','orange']);assert.equal(vault(db).dead.apple,300);
});
test('migration failure leaves embedded remote-only progress intact; restart retries',async()=>{
  const item={id:'remote-book',identity:'remote-only',title:'Only on server',updatedAt:1,position:pos(.7,400).position};
  const db=server({items:[item],separated:false,progress:null});
  db.hooks.beforeWrite=call=>call.key===PROGRESS?{status:402,message:'egress quota'}:null;
  const a=device(db,'phone');
  assert.equal(await a.api.all(false),false);
  assert.equal(vault(db).items[0].position.p,.7);
  assert.equal(db.peek(VAULT).sync?.progressSeparatedAt,undefined);
  assert.equal(db.peek(META).progressSeparatedAt,undefined);
  assert.ok(a.memory.get('breeze.progress.changed'));
  delete db.hooks.beforeWrite;
  const restarted=device(db,'restarted');
  assert.equal(await restarted.api.all(false),true);
  assert.equal(progress(db)['remote-only'].position.p,.7);
  assert.equal(vault(db).items[0].position,undefined);
  assert.ok(db.peek(VAULT).sync.progressSeparatedAt);
});
test('interruption after progress commit but before vault commit is restart-safe',async()=>{
  const db=server({items:[{id:'remote',identity:'remote',position:pos(.8,500).position}],separated:false,progress:null});
  db.hooks.beforeWrite=call=>call.key===VAULT?{message:'simulated app termination'}:null;
  assert.equal(await device(db,'phone').api.all(false),false);
  assert.equal(vault(db).items[0].position.p,.8);assert.equal(progress(db).remote.position.p,.8);
  delete db.hooks.beforeWrite;
  assert.equal(await device(db,'restart').api.all(false),true);
  assert.equal(progress(db).remote.position.p,.8);assert.equal(vault(db).items[0].position,undefined);
});
test('lost acknowledgement after vault commit cannot orphan migrated progress',async()=>{
  const db=server({items:[{id:'remote',identity:'remote',position:pos(.9,600).position}],separated:false,progress:null});
  db.hooks.afterWrite=call=>{if(call.key===VAULT)throw new Error('response lost after commit');};
  assert.equal(await device(db,'phone').api.all(false),false);
  assert.ok(db.peek(VAULT).sync.progressSeparatedAt);assert.equal(progress(db).remote.position.p,.9);
  delete db.hooks.afterWrite;
  assert.equal(await device(db,'restart').api.all(false),true);
  assert.equal(progress(db).remote.position.p,.9);
});
test('migration preserves a newer cached position without jumping an active reader',async()=>{
  const local=book('book');
  const db=server({items:[{id:'book',identity:'identity:book',position:pos(.7,400).position}],separated:false,progress:null});
  const a=device(db,'phone',{books:[local],positions:{book:pos(.2,100).position},active:local});
  assert.equal(await a.api.all(false),true);
  assert.equal(progress(db)['identity:book'].position.p,.7);assert.equal(a.snapshot().positions.book.p,.2);
  a.views.delete('v-read');assert.equal(await a.api.progress(false,true),true);
  assert.equal(a.snapshot().positions.book.p,.7);
});
test('concurrent progress snapshots preserve different books',async()=>{
  const db=server({progress:null});raceReads(db,PROGRESS);
  const a=device(db,'phone',{books:[book('one')],positions:{one:pos(.4,300).position},progressDirty:300});
  const b=device(db,'tablet',{books:[book('two')],positions:{two:pos(.6,400).position},progressDirty:400});
  assert.deepEqual(await Promise.all([a.api.progress(false,false),b.api.progress(false,false)]),[true,true]);
  assert.equal(progress(db)['identity:one'].position.p,.4);assert.equal(progress(db)['identity:two'].position.p,.6);
  assert.ok(db.calls.every(call=>call.key===PROGRESS));
});
test('logout resets cached progress and queued work',async()=>{
  const db=server({progress:{remote:pos(.8,500)}});const a=device(db,'phone');
  assert.equal(await a.api.progress(false,true),true);assert.ok(a.snapshot().progressRemoteRecords.remote);
  await a.api.logout();assert.deepEqual(a.snapshot().progressRemoteRecords,{});
  assert.equal(a.snapshot().sbUser,null);assert.equal(a.timers.size,0);
});
test('account-change auth event clears old progress and cancels late responses',async()=>{
  const db=server({progress:{secretA:pos(.8,500)}});db.seed('other');
  db.put('other',PROGRESS,{v:1,updatedAt:100,revision:'other-progress',envelope:{payload:{records:{}}}});
  const a=device(db,'phone');a.api.attach();
  // attach starts with no stored session. Re-establish A, then hold its response.
  a.api.setup(db.client('phone'),'user',db.peek(META));
  const entered=deferred(),release=deferred();
  db.hooks.afterRead=async call=>{if(call.key===PROGRESS&&call.user==='user'){entered.resolve();await release.promise;}};
  const old=a.api.progress(false,true);await entered.promise;
  db.hooks.auth.phone('SIGNED_IN',{user:{id:'other'}});
  release.resolve();assert.equal(await old,false);
  // Drain the new account's asynchronous startup, which has only its own rows.
  for(let n=0;n<100;n++)await Promise.resolve();
  assert.equal(a.snapshot().sbUser.id,'other');
  assert.equal(a.snapshot().progressRemoteRecords.secretA,undefined);
  assert.ok(!db.calls.some(call=>call.kind!=='select'&&call.user==='other'&&call.key===PROGRESS));
});
test('logout and login to the same account also invalidate old responses',async()=>{
  const db=server({progress:{old:pos(.8,500)}});const a=device(db,'phone');
  const entered=deferred(),release=deferred();
  db.hooks.afterRead=async call=>{if(call.key===PROGRESS){entered.resolve();await release.promise;}};
  const old=a.api.progress(false,true);await entered.promise;
  await a.api.logout();a.api.setup(db.client('phone'),'user',db.peek(META));
  release.resolve();assert.equal(await old,false);assert.deepEqual(a.snapshot().progressRemoteRecords,{});
});
test('same-millisecond local vocab edit during a write retains dirty state',async()=>{
  const db=server();const a=device(db,'phone',{words:{banana:word(200)}});a.api.change('breeze.vault.changed');
  let injected=false;
  db.hooks.beforeWrite=call=>{if(call.key===VAULT&&!injected){injected=true;a.add('orange',word(300));}};
  assert.equal(await a.api.vault(false),true);assert.ok(a.memory.get('breeze.vault.changed'));
  assert.equal(vault(db).words.orange,undefined);
  assert.equal(await a.api.vault(false),true);assert.ok(vault(db).words.orange);
});
test('local progress changed during identity collection remains pending',async()=>{
  const db=server();const a=device(db,'phone',{books:[book('one'),book('two')],positions:{one:pos(.2,100).position},progressDirty:100});
  let injected=false;
  a.context.VaultCrypto.recordId=async(_key,_kind,id)=>{if(id==='two'&&!injected){injected=true;a.move('one',pos(.8,500).position);}return `identity:${id}`;};
  assert.equal(await a.api.progress(false,false),true);assert.ok(a.memory.get('breeze.progress.changed'));
  assert.equal(a.snapshot().positions.one.p,.8);
  assert.equal(await a.api.progress(false,false),true);assert.equal(progress(db)['identity:one'].position.p,.8);
});
test('CAS retries are bounded and conflicts retain unsynced data',async()=>{
  const db=server();const a=device(db,'phone',{words:{banana:word(200)},dirty:200});
  let version=0;
  db.hooks.beforeWrite=call=>{if(call.key===VAULT){const row=db.peek(VAULT);row.revision='competitor-'+(++version);db.put('user',VAULT,row);}};
  assert.equal(await a.api.vault(false),false);assert.equal(version,4);
  assert.ok(a.memory.get('breeze.vault.changed'));assert.ok(a.snapshot().words.banana);
  delete db.hooks.beforeWrite;assert.equal(await a.api.vault(true),true);assert.ok(vault(db).words.banana);
});
test('402 retains dirty state and suppresses automatic requests during cooldown',async()=>{
  const db=server();const a=device(db,'phone',{words:{banana:word(200)},dirty:200});
  db.hooks.beforeWrite=()=>({status:402,message:'egress quota'});
  assert.equal(await a.api.vault(false),false);assert.ok(a.memory.get('breeze.vault.changed'));
  const before=db.calls.length;assert.equal(await a.api.vault(false),false);assert.equal(db.calls.length,before);
  delete db.hooks.beforeWrite;assert.equal(await a.api.vault(true),true);
});
test('unchanged startup uses only small headers and progress; idle schedules nothing',async()=>{
  const db=server();const a=device(db,'phone',{seen:'base'});
  assert.equal(await a.api.all(false),true);
  assert.equal(db.calls.length,3);
  assert.ok(!db.calls.some(call=>call.key===VAULT&&call.columns==='data'));
  assert.ok(db.calls.every(call=>call.kind==='select'));assert.equal(a.timers.size,0);
});
test('progress-only sync remains two requests with no vocabulary traffic',async()=>{
  const db=server();const a=device(db,'phone',{books:[book('one')],positions:{one:pos(.5,300).position},progressDirty:300});
  assert.equal(await a.api.progress(false,false),true);assert.equal(db.calls.length,2);
  assert.ok(db.calls.every(call=>call.key===PROGRESS));assert.equal(db.calls[1].columns,'key');
});
test('vocabulary edit is two small reads, a vault read, and a key-only CAS response',async()=>{
  const db=server();const a=device(db,'phone',{words:{banana:word(200)},dirty:200});
  assert.equal(await a.api.vault(false),true);assert.equal(db.calls.length,4);
  assert.deepEqual(db.calls.map(call=>call.kind),['select','select','select','update']);
  assert.equal(db.calls[3].columns,'key');
  assert.ok(!db.calls.some(call=>call.kind==='upsert'));
});
test('legacy read failure never marks migration complete or erases server data',async()=>{
  const db=server({legacy:false,separated:false});const a=device(db,'phone');
  db.hooks.beforeRead=call=>call.table==='positions'?{message:'network unavailable'}:null;
  assert.equal(await a.api.all(false),false);assert.equal(db.peek(VAULT).sync,undefined);
  assert.ok(db.calls.every(call=>call.kind==='select'));
});
test('unique revisions expose writes even when every wall-clock timestamp is equal',async()=>{
  const db=server();const a=device(db,'phone',{words:{banana:word(200)},dirty:200});
  assert.equal(await a.api.vault(false),true);const first=db.peek(VAULT);
  const b=device(db,'tablet',{words:{orange:word(200)},dirty:200});
  assert.equal(await b.api.vault(false),true);const second=db.peek(VAULT);
  assert.equal(first.updatedAt,second.updatedAt);assert.notEqual(first.revision,second.revision);
  assert.equal(await a.api.vault(false),true);assert.ok(a.snapshot().words.orange);
});

test('equal-time metadata with a different local book ID does not cause repair churn',async()=>{
  const db=server({items:[{id:'other-device-id',identity:'identity:book',title:'book',updatedAt:1}]});
  const a=device(db,'phone',{books:[book('book')]});
  assert.equal(await a.api.vault(false),true);
  assert.ok(db.calls.every(call=>call.kind==='select'));
});
