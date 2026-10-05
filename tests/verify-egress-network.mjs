import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {Script} from 'node:vm';
import {WORD,META,server,device,word,deferred} from './sync-test-transport.mjs';
import {rssDevice,cacheKey} from './egress-rss-transport.mjs';
const bodyBytes=value=>Buffer.byteLength(JSON.stringify(value));
const fullReads=db=>db.calls.filter(call=>call.kind==='select'&&call.columns==='data'&&call.key===WORD).length;
const headers=db=>db.calls.filter(call=>call.kind==='select'&&call.columns!=='data'&&call.key===WORD).length;
const synthetic=Object.fromEntries(Array.from({length:1000},(_,i)=>['word'+i,{
  ...word(100),word:'word'+i,example:'The synthetic reader studies a saved sentence. '.repeat(14),
  defs:Array.from({length:4},()=>({en:'A synthetic definition. '.repeat(10)}))}]));
function measuredSync(){
  const db=server({words:synthetic});let responseBodyBytes=0;
  db.hooks.afterRead=(_call,row)=>{responseBodyBytes+=bodyBytes(row);};
  db.hooks.afterWrite=call=>{responseBodyBytes+=bodyBytes({key:call.key});};
  const client=device(db,'phone',{words:synthetic});
  return {db,client,metrics:()=>({requests:db.calls.length,fullReads:fullReads(db),headers:headers(db),responseBodyBytes})};
}
function attachAuth(h){
  h.client.context.localStorage.getItem=()=>JSON.stringify({user:{id:'user'}});
  new Script("SB_URL='https://relay.example';").runInContext(h.client.context);
  h.client.api.attach();
}
test('clean foreground/auth checks retain request counts but transfer metadata after first persisted snapshot',async()=>{
  const h=measuredSync();
  for(let i=0;i<100;i++)assert.equal(await h.client.api.all(false),true);
  assert.equal(h.metrics().requests,100);assert.equal(fullReads(h.db),1);assert.equal(headers(h.db),99);
  assert.ok(h.metrics().responseBodyBytes<bodyBytes({data:h.db.peek(WORD)})*1.01);
  assert.ok(h.db.calls.filter(call=>call.columns!=='data').every(call=>call.columns==='revision:data->>revision,legacyImportedAt:data->legacyImportedAt'));
});
test('actual foreground listener and completed auth events use the clean metadata path',async()=>{
  const h=measuredSync();await h.client.api.all(false);
  for(let i=0;i<20;i++){h.client.context.document.hidden=false;h.client.context.events.visibilitychange();await h.client.api.all(false);}
  attachAuth(h);
  for(let i=0;i<6;i++){h.db.hooks.auth.phone('TOKEN_REFRESHED',{user:{id:'user'}});await h.client.api.all(false);}
  assert.equal(fullReads(h.db),1);
  assert.equal(headers(h.db),26);
});
test('changed remote revision downloads and durably merges the new snapshot',async()=>{
  const h=measuredSync();await h.client.api.all(false);
  const remote=h.db.peek(WORD);remote.revision='remote-edit';remote.words.new=word(300);h.db.put('user',WORD,remote);
  assert.equal(await h.client.api.all(false),true);
  assert.equal(fullReads(h.db),2);assert.equal(headers(h.db),1);
  assert.equal(h.client.memory.get('words').new.up,300);
  await h.client.api.all(false);assert.equal(fullReads(h.db),2);
});
test('dirty changes bypass metadata and preserve normal CAS merging',async()=>{
  const h=measuredSync();await h.client.api.all(false);h.client.add('local',word(300));
  assert.equal(await h.client.api.all(false),true);
  assert.equal(fullReads(h.db),2);assert.equal(headers(h.db),0);assert.equal(h.db.peek(WORD).words.local.up,300);
});
test('in-memory mutation without dirty hook still takes the full merge path',async()=>{
  const h=measuredSync();await h.client.api.all(false);h.client.context.words.local=word(300);
  await h.client.api.all(false);assert.equal(fullReads(h.db),2);assert.ok(h.db.peek(WORD).words.local);
});
test('a local edit during the projected read cannot be skipped',async()=>{
  const h=measuredSync();await h.client.api.all(false);let changed=false;
  h.db.hooks.afterRead=call=>{if(call.columns!=='data'&&!changed){changed=true;h.client.add('during-probe',word(400));}};
  assert.equal(await h.client.api.all(false),true);assert.equal(fullReads(h.db),2);
  assert.equal(h.db.peek(WORD).words['during-probe'].up,400);
});
test('a local edit during CAS does not become acknowledged until a later merge',async()=>{
  const h=measuredSync();await h.client.api.all(false);h.client.add('first',word(300));let changed=false;
  h.db.hooks.beforeWrite=()=>{if(!changed){changed=true;h.client.context.words.second=word(400);}};
  await h.client.api.all(false);assert.equal(h.db.peek(WORD).words.second,undefined);
  await h.client.api.all(false);assert.equal(h.db.peek(WORD).words.second.up,400);assert.equal(fullReads(h.db),3);
});
test('failed local persistence never acknowledges the failed pull',async()=>{
  const h=measuredSync();h.client.context.saveWords=()=>false;
  assert.equal(await h.client.api.all(false),false);
  h.client.context.saveWords=()=>true;
  assert.equal(await h.client.api.all(true),true);
  assert.equal(fullReads(h.db),2);assert.equal(headers(h.db),0);
});
test('failed dirty-state save after CAS cannot enable metadata-only acknowledgement',async()=>{
  const h=measuredSync();await h.client.api.all(false);h.client.add('first',word(300));
  const save=h.client.context.save;h.client.context.save=(key,value)=>key==='breeze.vault.changed'&&value===0?false:save(key,value);
  assert.equal(await h.client.api.all(false),false);
  h.client.context.save=save;assert.equal(await h.client.api.all(true),true);
  assert.equal(fullReads(h.db),3);assert.equal(headers(h.db),0);
});
test('concurrent clean pulls coalesce their metadata check',async()=>{
  const h=measuredSync();await h.client.api.all(false);
  await Promise.all([h.client.api.all(false),h.client.api.all(false),h.client.api.all(false)]);
  assert.equal(fullReads(h.db),1);assert.equal(headers(h.db),1);
});
test('manual refresh and document restart each require a full snapshot',async()=>{
  const h=measuredSync();await h.client.api.all(false);await h.client.api.all(true);
  const restarted=device(h.db,'restart',{words:h.client.snapshot().words,seen:'base'});
  await restarted.api.all(false);assert.equal(fullReads(h.db),3);
});
test('account isolation holds even if two accounts have the same revision text',async()=>{
  const h=measuredSync();await h.client.api.all(false);h.db.seed('other');
  h.client.api.setup(h.db.client('phone'),'other',h.db.peek(META,'other'));
  await h.client.api.all(false);assert.equal(fullReads(h.db),2);assert.equal(headers(h.db),0);
});
test('missing revision or incomplete migration cannot use the clean fast path',async()=>{
  for(const missing of ['revision','legacyImportedAt']){
    const db=server(),row=db.peek(WORD);delete row[missing];db.put('user',WORD,row);
    const c=device(db,'phone',{legacyImported:missing!=='legacyImportedAt'});
    if(missing==='legacyImportedAt'){c.api.clearLegacyKey();c.context.vaultGet=async()=>null;}
    await c.api.all(false);await c.api.all(false);assert.ok(fullReads(db)>=2);
  }
});
test('network/quota failure during metadata does not mutate words and obeys cooldown',async()=>{
  const h=measuredSync();await h.client.api.all(false);const before=h.client.snapshot();
  h.db.hooks.beforeRead=()=>({status:402,message:'egress quota'});
  assert.equal(await h.client.api.all(false),false);assert.deepEqual(h.client.snapshot().words,before.words);
  const calls=h.db.calls.length;await h.client.api.all(false);assert.equal(h.db.calls.length,calls);
  delete h.db.hooks.beforeRead;assert.equal(await h.client.api.all(true),true);
});
test('sign out cancels an in-flight projected pull',async()=>{
  const h=measuredSync();await h.client.api.all(false);const entered=deferred(),release=deferred();
  h.db.hooks.afterRead=async()=>{entered.resolve();await release.promise;};
  const pending=h.client.api.all(false);await entered.promise;await h.client.api.logout();release.resolve();
  assert.equal(await pending,false);assert.equal(h.client.snapshot().sbUser,null);
});
test('public feed cache survives restart and rotation without refetching fresh feeds',async()=>{
  const storage=new Map(),first=rssDevice({storage});await first.load(false);assert.equal(first.calls.length,13);
  const restarted=rssDevice({storage});await restarted.load(false);await restarted.rotate();
  assert.equal(restarted.calls.length,0);
  assert.ok(restarted.entries()[0][0].title.endsWith('3'),'Rotation uses cached entries');
});
test('expiry and explicit online refresh fetch new feeds; concurrent loads coalesce',async()=>{
  const h=rssDevice();await Promise.all([h.load(false),h.load(false)]);assert.equal(h.calls.length,13);
  await h.load(true);assert.equal(h.calls.length,26);
  h.advance(600000);await h.load(false);assert.equal(h.calls.length,39);
});
test('offline restart uses bounded stale cache; returning online refreshes expired feeds',async()=>{
  const storage=new Map(),first=rssDevice({storage});await first.load(false);
  const h=rssDevice({storage,now:1600000,offline:true});await h.load(false);assert.equal(h.calls.length,0);assert.ok(h.entries()[0].length);
  h.state.offline=false;await h.load(false);assert.equal(h.calls.length,13);
  const expired=rssDevice({storage,now:90000000,offline:true});await expired.load(false);assert.equal(expired.calls.length,0);
  assert.ok(expired.entries().every(group=>!group.length));
});
test('failed fresh fetch retains cached cards without renewing their timestamp',async()=>{
  const h=rssDevice();await h.load(false);const at=JSON.parse(h.storage.get(cacheKey))[h.feedAt[0].url].at;
  h.advance(600000);h.state.fail=true;await h.load(false);assert.ok(h.entries()[0].length);
  assert.equal(JSON.parse(h.storage.get(cacheKey))[h.feedAt[0].url].at,at);
});
test('storage denial and corrupt/oversized/future cache fall back to safe fetching',async()=>{
  const denied=rssDevice({denyStorage:true});await denied.load(false);await denied.rotate();assert.equal(denied.calls.length,13);
  for(const value of ['{bad','x'.repeat(1000001),JSON.stringify({'https://www.propublica.org/feeds/propublica/main':{at:2000000,entries:[]}})]){
    const h=rssDevice({storage:new Map([[cacheKey,value]])});await h.load(false);assert.equal(h.calls.length,13);
  }
});
test('custom feeds are not persisted and private cache entries are discarded',async()=>{
  const custom=[{name:'Private custom',url:'https://private.example/feed?token=synthetic'}],storage=new Map();
  const h=rssDevice({custom,storage});await h.load(false);
  assert.ok(!storage.get(cacheKey).includes('private.example'));
  const restarted=rssDevice({custom,storage});await restarted.load(false);
  assert.deepEqual(restarted.calls.map(call=>call.target),[custom[0].url]);
});
test('public cache stays within global/per-feed byte limits and never truncates HTML into a body',async()=>{
  const h=rssDevice({candidates:100});
  const parse=h.context.parseRss;h.context.parseRss=(...args)=>parse(...args).map(entry=>({...entry,contentHtml:'x'.repeat(200000),bodyProvided:true}));
  await h.load(false);const raw=h.storage.get(cacheKey),cache=JSON.parse(raw);
  assert.ok(Buffer.byteLength(raw)<=1000000);
  for(const record of Object.values(cache)){
    assert.ok(bodyBytes(record)<=64000);assert.ok(record.entries.length<=100);
    for(const entry of record.entries)assert.ok(!entry.bodyProvided||entry.contentHtml.length===200000);
  }
});
test('cover pages are unnecessary when a pictured candidate exists; all-missing load has three-page cap',async()=>{
  const pictured=rssDevice();await pictured.load(false);assert.equal(pictured.calls.length,13);
  const missing=rssDevice({missingCovers:true});await missing.load(false);assert.equal(missing.calls.length,16);
  assert.equal(missing.calls.filter(call=>call.bytes>200000).length,3);
});
test('Medium candidate resolution is bounded to three per topic and ready bodies survive restart',async()=>{
  const unusable=rssDevice({mediumUnusable:true,candidates:20});await unusable.load(false);assert.equal(unusable.calls.length,22);
  const storage=new Map(),first=rssDevice({storage,mediumResolve:true});await first.load(false);assert.equal(first.calls.length,16);
  const restarted=rssDevice({storage,mediumResolve:true});await restarted.load(false);assert.equal(restarted.calls.length,0);
});
// Optional reproducible before/after artifact: uses the checked source at the
// comparison base and the exact same synthetic transports, never production.
test('before/after request counts and bytes are measured separately',{
  skip:!process.env.BREEZE_EGRESS_COMPARE_BASE
},async()=>{
  const baseline=process.env.BREEZE_EGRESS_COMPARE_BASE;
  const git=path=>execFileSync('git',['show',baseline+':'+path],{encoding:'utf8'});
  const beforeSyncPath='/tmp/breeze-egress-sync-before.js';writeFileSync(beforeSyncPath,git('scripts/sync/sync.js'));
  const result={base:baseline,units:'Uncompressed synthetic UTF-8 response body bytes; excludes headers, compression and real billing.',sync:[],rss:[]};
  for(const [name,mode] of [['100 unchanged checks','checks'],['20 foreground returns','foreground'],['6 completed auth events','auth'],['20 spaced dirty edits','dirty']]){
    const rows=[];
    for(const before of [true,false]){
      if(before)process.env.BREEZE_SYNC_SOURCE=beforeSyncPath;else delete process.env.BREEZE_SYNC_SOURCE;
      const h=measuredSync();await h.client.api.all(false);
      const count=mode==='checks'?99:mode==='auth'?6:20;
      if(mode==='auth')attachAuth(h);
      for(let i=0;i<count;i++){
        if(mode==='dirty')h.client.add('edit'+i,word(300+i));
        if(mode==='foreground'){h.client.context.document.hidden=false;h.client.context.events.visibilitychange();}
        if(mode==='auth')h.db.hooks.auth.phone('TOKEN_REFRESHED',{user:{id:'user'}});
        await h.client.api.all(false);
      }
      rows.push(h.metrics());
    }
    result.sync.push({name,before:rows[0],after:rows[1]});
  }
  delete process.env.BREEZE_SYNC_SOURCE;
  const oldRss=git('scripts/importers/rss.js');
  for(const [name,options,run] of [
    ['5 document loads',{},async create=>{const storage=new Map();for(let i=0;i<5;i++)await create({storage}).load(false);}],
    ['cold load plus 5 rotations',{},async create=>{const h=create();await h.load(false);for(let i=0;i<5;i++)await h.rotate();}],
    ['missing covers on every ordinary feed',{missingCovers:true},async create=>create().load(false)],
    ['20 unusable Medium candidates per topic',{mediumUnusable:true,candidates:20},async create=>create().load(false)]
  ]){
    const rows=[];
    for(const before of [true,false]){
      const devices=[];await run(extra=>{const h=rssDevice({...options,...extra,...(before?{source:oldRss}:{})});devices.push(h);return h;});
      rows.push(devices.reduce((sum,h)=>({requests:sum.requests+h.calls.length,responseBodyBytes:sum.responseBodyBytes+h.metrics().responseBodyBytes}),{requests:0,responseBodyBytes:0}));
    }
    result.rss.push({name,before:rows[0],after:rows[1]});
  }
  writeFileSync(process.env.BREEZE_EGRESS_REPORT||'/tmp/breeze-egress-before-after.json',JSON.stringify(result,null,2)+'\n');
  console.log('EGRESS_COMPARISON',JSON.stringify(result));
});
