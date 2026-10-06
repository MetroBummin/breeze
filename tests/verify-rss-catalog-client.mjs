import test from 'node:test';
import assert from 'node:assert/strict';
import {rssDevice} from './egress-rss-transport.mjs';
const key='breeze.rss-catalog.v1';
const payload=h=>JSON.parse(h.storage.get(key)).catalog;
test('catalog replaces thirteen feed requests; concurrent consumers coalesce, restart and rotation reuse metadata',async()=>{
  const storage=new Map(),h=rssDevice({catalog:true,storage});await Promise.all([h.load(false),h.load(false)]);
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].target,'catalog');assert.equal(h.entries().filter(group=>group.length).length,13);
  assert.ok(h.entries().flat().every(entry=>!entry.contentHtml&&!entry.bodyProvided));
  await h.rotate();assert.equal(h.calls.length,1);
  const restart=rssDevice({catalog:true,storage});await restart.load(false);assert.equal(restart.calls.length,0);
});
test('catalog failure never rebuilds default feeds and empty/disabled results replace old cards',async()=>{
  const h=rssDevice({catalog:true});h.state.fail=true;await h.load(false);assert.equal(h.calls.length,1);assert.equal(h.entries().flat().length,0);
  h.state.fail=false;h.advance(660001);await h.load(true);h.state.catalogPayload=payload(h);
  h.state.catalogPayload.feeds=h.state.catalogPayload.feeds.map(feed=>({...feed,at:0,status:'disabled',entries:[]}));
  await h.load(true);assert.equal(h.entries().flat().length,0);assert.ok(h.calls.every(call=>call.target==='catalog'));
});
test('failed catalog refreshes are bounded across rotations and forced refreshes without a default feed herd',async()=>{
  const h=rssDevice({catalog:true});await h.load(false);h.advance(600001);h.state.fail=true;
  await h.load(true);const receipt=JSON.parse(h.storage.get(key)).receivedAt;
  for(let i=0;i<10;i++){await h.load(true);await h.rotate();}
  assert.equal(h.calls.length,2);assert.equal(JSON.parse(h.storage.get(key)).receivedAt,receipt);
  assert.ok(h.entries().flat().length);h.advance(660001);await h.load(true);assert.equal(h.calls.length,3);
  const cold=rssDevice({catalog:true});cold.state.fail=true;await cold.load(false);
  for(let i=0;i<10;i++)await cold.load(true);
  assert.equal(cold.calls.length,1);assert.equal(cold.entries().flat().length,0);
});
test('catalog offline fallback expires by source timestamp and failure cannot renew it',async()=>{
  const storage=new Map(),h=rssDevice({catalog:true,storage});await h.load(false);h.advance(600001);h.state.fail=true;
  await h.load(false);assert.ok(h.entries().flat().length);assert.equal(payload(h).feeds[0].at,1000000);
  const offline=rssDevice({catalog:true,storage,offline:true,now:1000000+86399999});await offline.load(false);assert.ok(offline.entries().flat().length);
  offline.advance(2);await offline.load(false);assert.equal(offline.entries().flat().length,0);assert.equal(offline.calls.length,0);
});
test('conditional refresh returns zero body and retains source age, independent of receipt time',async()=>{
  const h=rssDevice({catalog:true});await h.load(false);h.advance(600001);h.state.catalogStatus=304;await h.load(false);
  assert.equal(h.calls.length,2);assert.equal(h.calls[1].bytes,0);assert.equal(h.calls[1].headers['If-None-Match'],'synthetic-etag');
  assert.equal(payload(h).feeds[0].at,1000000);assert.equal(h.calls[1].headers.Authorization,undefined);
});
test('a backward clock jump invalidates future receipt/source metadata in an open document',async()=>{
  const h=rssDevice({catalog:true});await h.load(false);h.advance(-1000);await h.load(false);
  assert.equal(h.calls.length,2);assert.equal(JSON.parse(h.storage.get(key)).receivedAt,999000);
  assert.ok(h.entries().flat().length);assert.equal(payload(h).feeds[0].at,999000);
});
test('malformed, duplicate, future, credential and oversized catalog responses cannot become cards',async()=>{
  const original=rssDevice({catalog:true});await original.load(false);const good=payload(original);
  for(const mutate of [p=>p.version=2,p=>p.feeds.pop(),p=>p.feeds[1].id=0,p=>p.feeds[0].at=2000000,
    p=>p.feeds[0].entries[0].url='https://user:password@stories.example/a',
    p=>p.feeds[0].entries[0].photo='https://images.example/a?token=private',p=>p.feeds[0].entries[0].title='x'.repeat(200001)]){
    const h=rssDevice({catalog:true});h.state.catalogPayload=structuredClone(good);mutate(h.state.catalogPayload);
    await h.load(false);assert.equal(h.entries().flat().length,0);assert.equal(h.calls.length,1);
  }
});
test('embedded bodies and private/quality fields are discarded at the catalog trust boundary',async()=>{
  const h=rssDevice({catalog:true});await h.load(false);h.state.catalogPayload=payload(h);
  Object.assign(h.state.catalogPayload.feeds[0].entries[0],{contentHtml:'PRIVATE BODY',bodyProvided:true,userId:'PRIVATE USER',quality:{status:'approved'},history:'PRIVATE HISTORY'});
  await h.load(true);assert.ok(!JSON.stringify(h.entries()).includes('PRIVATE'));assert.ok(!h.storage.get(key).includes('PRIVATE'));
});
test('catalog custom sources remain local and separate; publisher artwork requires no HTML lookups',async()=>{
  const custom=[{url:'https://custom.example/feed',name:'Custom',category:'general'}];
  const h=rssDevice({catalog:true,custom,missingCovers:true});await h.load(false);
  assert.equal(h.calls.length,2);assert.equal(h.calls[1].target,custom[0].url);assert.ok(!h.storage.get(key).includes('Custom'));
  assert.ok(h.entries()[0].every(entry=>entry.coverFallback));assert.ok(h.calls.every(call=>call.target==='catalog'||call.target===custom[0].url));
});
test('corrupt cache/storage denial are safe; expired cold catalog is an empty offline state',async()=>{
  const h=rssDevice({catalog:true,denyStorage:true});await h.load(false);await h.rotate();assert.equal(h.calls.length,1);
  const bad=rssDevice({catalog:true,storage:new Map([[key,'{bad']])});await bad.load(false);assert.equal(bad.calls.length,1);
  const storage=new Map(),first=rssDevice({catalog:true,storage});await first.load(false);
  const old=rssDevice({catalog:true,storage,offline:true,now:90000000});await old.load(false);assert.equal(old.entries().flat().length,0);
});
