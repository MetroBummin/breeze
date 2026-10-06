/* Fixed partition ownership and client cover budgets, with synthetic transport.
   These tests never call a publisher, production API, image or article service. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createContext,runInContext} from 'node:vm';
import {readFileSync} from 'node:fs';
import {rssDevice,cacheKey} from './egress-rss-transport.mjs';
// Keep the generic multi-source contract independent of the narrower release244 rollout.
const managed=[7,9,11,12],legacy=[0,1,2,3,4,5,6,8,10],catalogKey='breeze.rss-catalog.v1';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function hybrid(options={}){
  const h=rssDevice({...options,catalog:true});
  h.context.window.BREEZE_CONFIG.RSS_CATALOG_FEED_IDS=[...managed];
  return h;
}
const groups=h=>runInContext('rssCands',h.context);
const feeds=h=>h.context.rssSources().slice(0,13);
const snapshot=h=>JSON.parse(h.storage.get(catalogKey)).catalog;
const callsFor=(h,ids)=>h.calls.filter(call=>ids.some(id=>call.target===feeds(h)[id].url));
function failCatalog(h){
  const fetch=h.context.fetch;
  h.context.fetch=async(url,options)=>{
    if(!url.endsWith('/rss-catalog'))return fetch(url,options);
    h.calls.push({target:'catalog',bytes:0,status:503});return new Response('',{status:503});
  };
}
function releaseConfig(){
  const context=createContext({window:{}});
  runInContext(readFileSync(new URL('../config.js',import.meta.url),'utf8'),context);
  return context.window.BREEZE_CONFIG;
}
test('release244 config explicitly enables only WIRED in the shared partition',()=>{
  const config=releaseConfig();
  assert.equal(config.RSS_CATALOG,true);
  assert.deepEqual(Array.from(config.RSS_CATALOG_FEED_IDS||[]),[7]);
});
test('release244 uses one catalog plus twelve legacy feeds, including Medium, without error-driven reassignment',async()=>{
  const config=releaseConfig(),ids=Array.from(config.RSS_CATALOG_FEED_IDS||[]);
  assert.deepEqual(ids,[7]);
  const legacyIds=[0,1,2,3,4,5,6,8,9,10,11,12];
  for(const fail of [false,true]){
    const h=rssDevice({catalog:config.RSS_CATALOG});
    h.context.window.BREEZE_CONFIG.RSS_CATALOG_FEED_IDS=ids;
    if(fail)failCatalog(h);
    await h.load(false);
    assert.equal(h.calls.filter(call=>call.target==='catalog').length,1);
    assert.equal(callsFor(h,[7]).length,0);
    assert.equal(callsFor(h,legacyIds).length,12);
    assert.equal(callsFor(h,[9,11,12]).length,3,'Medium stays on the existing legacy transport even when the catalog succeeds');
    assert(legacyIds.every(id=>h.entries()[id].length>0));
    assert.equal(h.entries()[7].length>0,!fail);
    assert.equal(h.entries().filter(group=>group.length).length,fail?12:13);
    await h.load(false);assert.equal(h.calls.length,13,'Warm load reuses both transport caches');
  }
});
test('explicit multi-source hybrid keeps all thirteen sources with one catalog and nine independent legacy requests',async()=>{
  const h=hybrid();await Promise.all([h.load(false),h.load(false)]);
  assert.equal(h.calls.length,10);assert.equal(h.calls.filter(c=>c.target==='catalog').length,1);
  assert.equal(callsFor(h,managed).length,0);assert.equal(callsFor(h,legacy).length,9);
  assert.equal(h.entries().filter(group=>group.length).length,13);
  assert(h.entries().flat().every(entry=>!entry.contentHtml&&!entry.bodyProvided));
  assert.deepEqual(Object.keys(JSON.parse(h.storage.get(cacheKey))).sort(),legacy.map(id=>feeds(h)[id].url).sort());
});
test('unmanaged and custom sources publish before a stalled catalog settles',async()=>{
  const custom=[{name:'Custom',url:'https://custom.example/feed',category:'general'}],h=hybrid({custom});
  const fetch=h.context.fetch;let release,done=false;
  const held=new Promise(resolve=>{release=resolve;});
  h.context.fetch=async(url,options)=>{if(url.endsWith('/rss-catalog'))await held;return fetch(url,options);};
  const loading=h.load(false).then(()=>{done=true;});
  await tick();assert.equal(done,false);
  assert(legacy.every(id=>h.entries()[id].length));assert(h.entries()[13].length);
  assert(managed.every(id=>h.entries()[id].length===0));
  assert.equal(h.calls.length,10,'Nine legacy sources and the custom feed have already loaded');
  release();await loading;assert.equal(h.entries().filter(group=>group.length).length,14);
  assert(!h.storage.get(catalogKey).includes('Custom'));assert(!h.storage.get(cacheKey).includes('Custom'));
});
test('managed errors, absent records and disabled statuses never trigger a legacy rebuild',async()=>{
  for(const failure of ['error','missing','disabled']){
    const h=hybrid();
    if(failure==='error')failCatalog(h);
    else{
      const seed=hybrid();await seed.load(false);h.state.catalogPayload=snapshot(seed);
      if(failure==='missing')h.state.catalogPayload.feeds=h.state.catalogPayload.feeds.filter(f=>f.id!==7);
      else h.state.catalogPayload.feeds=h.state.catalogPayload.feeds.map(f=>managed.includes(f.id)?{...f,status:'disabled',entries:[]}:f);
    }
    await h.load(false);
    assert.equal(callsFor(h,managed).length,0,failure);
    assert.equal(callsFor(h,legacy).length,9,failure);
    assert(managed.every(id=>h.entries()[id].length===0),failure);
    assert(legacy.every(id=>h.entries()[id].length>0),failure);
  }
});
test('a custom alias of a managed built-in URL cannot bypass its catalog ownership',async()=>{
  const seed=hybrid(),custom=[{name:'My WIRED',url:feeds(seed)[7].url,category:'general'}];
  const h=hybrid({custom});failCatalog(h);await h.load(false);
  assert.equal(callsFor(h,managed).length,0);assert.equal(h.entries()[13].length,0);
  const publicAlias=hybrid({custom:[{name:'My TMZ',url:feeds(seed)[2].url,category:'general'}]});
  await publicAlias.load(false);assert(publicAlias.entries()[13].length);
  publicAlias.state.offline=true;publicAlias.advance(86400001);await publicAlias.load(false);
  assert.equal(publicAlias.entries()[13].length,0,'A duplicate public source cannot evade its age cap as a custom feed');
});
test('response contents cannot reassign the configured transport owners',async()=>{
  const h=hybrid();await h.load(false);h.state.catalogPayload=snapshot(h);
  h.state.catalogPayload.feeds.forEach(f=>f.entries.forEach(e=>{e.title='CATALOG ONLY '+f.id;}));
  await h.load(true);
  for(const id of managed)assert(h.entries()[id].every(e=>e.title==='CATALOG ONLY '+id));
  for(const id of legacy)assert(h.entries()[id].every(e=>!e.title.startsWith('CATALOG ONLY')));
  assert.equal(callsFor(h,managed).length,0);
});
test('catalog outage cooldown survives forced refreshes and rotations without blocking legacy retries',async()=>{
  const h=hybrid();failCatalog(h);await h.load(false);
  for(let i=0;i<4;i++){await h.load(true);await h.rotate();}
  assert.equal(h.calls.filter(c=>c.target==='catalog').length,1);
  assert.equal(callsFor(h,managed).length,0);assert.equal(callsFor(h,legacy).length,45);
  h.advance(660001);await h.load(true);assert.equal(h.calls.filter(c=>c.target==='catalog').length,2);
});
test('warm documents, rotation and restart reuse both caches without resetting cover generation on a warm load',async()=>{
  const storage=new Map(),h=hybrid({storage});await h.load(false);
  const entry=groups(h)[7][0],pass=runInContext('rssCoverPass',h.context);
  runInContext('rssCoverRemaining=0',h.context);await h.load(false);
  assert.equal(h.calls.length,10);assert.equal(groups(h)[7][0],entry);
  assert.equal(runInContext('rssCoverPass',h.context),pass);assert.equal(runInContext('rssCoverRemaining',h.context),0);
  await h.rotate();assert.equal(h.calls.length,10);assert.notEqual(groups(h)[7][0].url,entry.url);
  assert.equal(runInContext('rssCoverRemaining',h.context),2);
  const restart=hybrid({storage});await restart.load(false);assert.equal(restart.calls.length,0);
  assert.equal(restart.entries().filter(group=>group.length).length,13);
});
test('source age, offline expiry and clock rollback apply independently to managed and legacy caches',async()=>{
  const storage=new Map(),h=hybrid({storage});await h.load(false);
  const offline=hybrid({storage,offline:true,now:1000000+86399999});await offline.load(false);
  assert.equal(offline.entries().filter(g=>g.length).length,13);
  offline.advance(2);await offline.load(false);assert.equal(offline.entries().flat().length,0);assert.equal(offline.calls.length,0);
  const backward=hybrid({storage,offline:true,now:999999});await backward.load(false);
  assert.equal(backward.entries().flat().length,0);assert.equal(backward.calls.length,0);
  h.advance(600001);failCatalog(h);await h.load(true);
  assert(managed.every(id=>snapshot(h).feeds.find(f=>f.id===id).at===1000000));
  assert(legacy.every(id=>JSON.parse(h.storage.get(cacheKey))[feeds(h)[id].url].at===1600001));
});
test('a clock jump between request receipt and source timestamp cannot block the independent legacy path',async()=>{
  const h=hybrid(),fetch=h.context.fetch;
  h.context.fetch=async(url,options)=>{
    if(url.endsWith('/rss-catalog')){await tick();h.advance(1000);}
    return fetch(url,options);
  };
  await h.load(false);
  assert.equal(JSON.parse(h.storage.get(catalogKey)).receivedAt,1000000);
  assert.equal(snapshot(h).feeds[7].at,1001000);
  h.advance(-500);h.context.fetch=fetch;await h.load(false);
  assert.equal(h.entries().filter(g=>g.length).length,13);assert.equal(h.calls.length,11);
  assert.equal(snapshot(h).feeds[7].at,1000500);assert.equal(callsFor(h,managed).length,0);
});
test('partition validation rejects duplicates, holes and non-fixed IDs before any transport',async()=>{
  for(const invalid of [null,'7,9,11,12',[],[7,7],[7,13],[7,-1],[7,1.5],[7,'9'],new Array(1)]){
    const h=hybrid();h.context.window.BREEZE_CONFIG.RSS_CATALOG_FEED_IDS=invalid;
    await assert.rejects(h.load(false),/catalog_partition_invalid/);assert.equal(h.calls.length,0);
    assert.equal(h.context.rssCoverEligible({url:'https://story.example/read',photo:'',feedSourceUrl:feeds(h)[7].url}),false);
  }
});
test('catalog network byte cap and source validation cannot contaminate healthy legacy sources',async()=>{
  const seed=hybrid();await seed.load(false);const good=snapshot(seed);
  for(const mutation of [p=>p.feeds[7].at=2000000,p=>p.feeds[7].entries[0].url='https://user:password@stories.example/a',
    p=>p.feeds[7].entries[0].photo='https://images.example/photo?token=secret',p=>p.feeds[7].entries[0].title='x'.repeat(200001)]){
    const h=hybrid();h.state.catalogPayload=structuredClone(good);mutation(h.state.catalogPayload);await h.load(false);
    assert(managed.every(id=>h.entries()[id].length===0));assert(legacy.every(id=>h.entries()[id].length>0));
    assert.equal(callsFor(h,managed).length,0);
  }
  const h=hybrid(),fetch=h.context.fetch;let cancelled=false;
  h.context.fetch=async(url,options)=>{
    if(!url.endsWith('/rss-catalog'))return fetch(url,options);
    let sent=false;return {ok:true,status:200,body:{getReader:()=>({
      read:async()=>sent?{done:true}:(sent=true,{done:false,value:new Uint8Array(200001)}),cancel:async()=>{cancelled=true;},
    })}};
  };
  await h.load(false);assert.equal(cancelled,true);assert(!h.storage.has(catalogKey));
  assert(legacy.every(id=>h.entries()[id].length>0));assert.equal(callsFor(h,managed).length,0);
});
test('catalog cache byte cap and stripping stay bounded alongside separate legacy metadata',async()=>{
  const h=hybrid();await h.load(false);const p=snapshot(h);
  Object.assign(p.feeds[7].entries[0],{contentHtml:'PRIVATE BODY',bodyProvided:true,history:'PRIVATE HISTORY',quality:{status:'approved'}});
  h.state.catalogPayload=p;await h.load(true);
  assert(!JSON.stringify(h.entries()).includes('PRIVATE'));assert(!h.storage.get(catalogKey).includes('PRIVATE'));
  assert(Buffer.byteLength(h.storage.get(catalogKey))<=250000);
  const record=JSON.parse(h.storage.get(catalogKey));record.catalog.padding='x'.repeat(250001);
  h.storage.set(catalogKey,JSON.stringify(record));
  const restart=hybrid({storage:h.storage,offline:true});await restart.load(false);
  assert(managed.every(id=>restart.entries()[id].length===0));assert(legacy.every(id=>restart.entries()[id].length>0));
});
test('selected Medium intent keeps owner-body resolution local, deferred and coalesced in hybrid mode',async()=>{
  const h=hybrid({mediumResolve:true});await h.load(false);const entry=groups(h)[9][0];
  assert.equal(entry.contentHtml,'');assert.equal(h.calls.length,10);
  const [first,second]=await Promise.all([h.context.rssResolveSelectedEntry(entry),h.context.rssResolveSelectedEntry(entry)]);
  assert.equal(first.bodyProvided,true);assert.equal(second.contentHtml,first.contentHtml);assert.equal(h.calls.length,11);
  assert.equal(h.calls.at(-1).target,'https://medium.com/feed/@writer-0');
  assert(!h.storage.get(catalogKey).includes('full public feed body'));assert(!h.storage.get(cacheKey).includes('full public feed body'));
});
function ownerFor(h,entries){
  // This case doubles image decoding and checks shared transport ownership;
  // retain the real card-readiness method's DOM shape after photo-only gating.
  const cards=entries.map(entry=>{const classes=new Set(),attributes=new Map();return {isConnected:true,dataset:{rssUrl:entry.url},
    classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},
    style:{removeProperty(){}},setAttribute:(name,value)=>attributes.set(name,value),
    removeAttribute:name=>attributes.delete(name),querySelector:()=>null};});
  return {pass:runInContext('rssCoverPass',h.context),remaining:2,entries:new Map(cards.map((c,i)=>[c,entries[i]])),
    attempted:new Set(),cancelled:false,running:false,consumer:null,rail:{isConnected:true},frame:0};
}
test('all fixed feeds remain eligible in hybrid mode, with social, linked, custom and supplied exclusions intact',()=>{
  const h=hybrid();
  for(const feed of feeds(h)){
    const entry={url:'https://story.example/read',feedSourceUrl:feed.url,photo:''};
    assert.equal(h.context.rssCoverEligible(entry),true);
    for(const extra of [{photo:'https://images.example/supplied.jpg'},{kind:'reddit'},{readUrl:'https://story.example/linked'},
      {feedSourceUrl:'https://custom.example/feed'},{url:'http://127.0.0.1/story'}])
      assert.equal(h.context.rssCoverEligible({...entry,...extra}),false);
  }
  delete h.context.window.BREEZE_CONFIG.RSS_CATALOG_FEED_IDS;
  assert.equal(h.context.rssCoverEligible({url:'https://story.example/read',feedSourceUrl:feeds(h)[7].url,photo:''}),false);
});
test('supplied photos spend no original budget while managed and unmanaged rails share exactly two serialized lookups',async()=>{
  const h=hybrid({missingCovers:true});await h.load(false);const c=h.context;
  Object.assign(c,{AbortController,document:{visibilityState:'visible'},cancelAnimationFrame:()=>{}});
  c.rssCoverVisible=(owner,card)=>!owner.cancelled&&card.isConnected;
  c.rssCardPhoto=async()=>true;
  const candidates=groups(h),supplied=candidates[9][0],original=supplied.photo;
  c.rssCoverStore(supplied.url,'https://images.example/old-cached.jpg');c.rssCoverHydrate(supplied);
  assert.equal(supplied.photo,original);
  const calls=[];let active=0,peak=0;
  c.rssCoverFetch=async url=>{calls.push(url);peak=Math.max(peak,++active);await tick();active--;return {photo:'https://images.example/recovered.jpg'};};
  const managedOwner=ownerFor(h,[supplied,candidates[7][0],candidates[7][1]]);
  const legacyOwner=ownerFor(h,[candidates[2][0],candidates[2][1]]);
  await Promise.all([c.rssCoverPump(managedOwner),c.rssCoverPump(legacyOwner)]);
  assert.equal(calls.length,2);assert.equal(peak,1);assert(!calls.includes(supplied.url));
  assert(calls.includes(candidates[7][0].url));assert(calls.includes(candidates[2][0].url));
  assert.equal(candidates[7][0].photo,'https://images.example/recovered.jpg');
  assert.equal(runInContext('rssCoverRemaining',c),0);assert.equal(supplied.photo,original);
  await h.load(false);await c.rssCoverPump(ownerFor(h,[candidates[0][0]]));assert.equal(calls.length,2);
  await h.rotate();assert.equal(groups(h)[7].find(e=>e.url===calls[0]).photo,'https://images.example/recovered.jpg');
  assert.equal(h.calls.length,10,'Cover work did not fetch feed or selected article bodies');
});
