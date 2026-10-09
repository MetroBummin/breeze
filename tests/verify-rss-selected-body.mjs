/* Synthetic public feed bodies, transport and clocks only. No live publisher,
   production API, AI request or persistent article/image write is made. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {runInContext} from 'node:vm';
import {rssDevice,cacheKey} from './egress-rss-transport.mjs';
const body='<p>'+('The public body explains the evidence behind a scientific discovery. '.repeat(30))+'</p>';
function supplied(options={}){
  const h=rssDevice({candidates:1,...options}),parse=h.context.parseRss;
  h.context.parseRss=(...args)=>parse(...args).map(e=>({...e,bodyProvided:true,contentHtml:body}));
  h.context.parseFeedArticle=e=>e.bodyProvided&&e.contentHtml?{title:e.title,paras:[{t:'Public article text'}],blocks:[{r:'p',t:'Public article text'}],formatting:{}}:null;
  return h;
}
const memory=h=>runInContext('[...rssSuppliedBodies.values()]',h.context);
test('already downloaded full body opens with no new request; disk and discovery retain metadata only',async()=>{
  const h=supplied();await h.load(false);const calls=h.calls.length,entry=h.entries()[0][0];
  assert.equal(entry.bodyProvided,false);assert.equal(entry.contentHtml,'');
  const selected=await h.context.rssResolveSelectedEntry(entry);
  assert.equal(selected.contentHtml,body);assert.equal(selected.bodyProvided,true);
  h.context.readerOpenIntent=0;
  h.context.fetchArticleHtml=async()=>{throw Error('The original web page is unavailable');};
  const book=await h.context.ingestArticle(selected.url,{...selected,preview:true,present:false,deferSave:true});
  assert.equal(book.paras[0].t,'Public article text');assert.equal(h.calls.length,calls);
  assert(!h.storage.get(cacheKey).includes(body));assert.equal(h.entries()[0][0].contentHtml,'');
  await h.rotate();assert.equal(h.calls.length,calls);assert.equal((await h.context.rssResolveSelectedEntry(entry)).contentHtml,body);
});
test('a supplied Medium body is reused without an owner request or preselection parsing',async()=>{
  const h=supplied();let parsed=0;const parser=h.context.parseFeedArticle;
  h.context.parseFeedArticle=e=>{parsed++;return parser(e);};
  await h.load(false);assert.equal(parsed,0);const calls=h.calls.length;
  for(const index of [9,11,12]){
    const selected=await h.context.rssResolveSelectedEntry(h.entries()[index][0]);
    assert.equal(selected.contentHtml,body);assert.equal(h.calls.length,calls);
  }
  assert.equal(parsed,3);
});
test('custom source bodies remain memory-only and cannot be claimed by another source',async()=>{
  const custom=[{url:'https://custom.example/feed',name:'Custom',category:'general'}];
  const h=supplied({custom});await h.load(false);const entry=h.entries()[13][0];
  assert.equal((await h.context.rssResolveSelectedEntry(entry)).contentHtml,body);
  assert(!h.storage.get(cacheKey).includes('Custom'));
  assert.equal(h.context.rssSuppliedEntry({...entry,feedSourceUrl:'https://other.example/feed'}).contentHtml,'');
});
test('metadata-only restart does not invent a body, and expired/backward-clock memory is discarded',async()=>{
  const h=supplied();await h.load(false);const entry=h.entries()[0][0];
  const restart=supplied({storage:h.storage});await restart.load(false);
  assert.equal(restart.calls.length,0);assert.equal((await restart.context.rssResolveSelectedEntry(restart.entries()[0][0])).contentHtml,'');
  h.advance(600000);assert.equal(h.context.rssSuppliedEntry(entry).contentHtml,'');
  const backward=supplied();await backward.load(false);backward.advance(-1);
  assert.equal(backward.context.rssSuppliedEntry(backward.entries()[0][0]).contentHtml,'');
});
test('successful source refresh revokes old supplied bodies; failure retains only still-fresh evidence',async()=>{
  const h=supplied();await h.load(false);const entry=h.entries()[0][0];
  h.state.fail=true;await h.load(true);assert.equal(h.context.rssSuppliedEntry(entry).contentHtml,body);
  h.state.fail=false;h.context.parseRss=()=>[];await h.load(true);
  assert.equal(h.context.rssSuppliedEntry(entry).contentHtml,'');
});
test('slower earlier-started feeds do not evict later-started successful bodies',async()=>{
  const h=supplied(),feeds=h.context.rssSources(),slowAt=h.state.now;
  h.advance(5);const fastAt=h.state.now;
  const slow=h.context.parseRss('',feeds[0]),fast=h.context.parseRss('',feeds[1]);
  h.advance(5);h.context.rssRememberSuppliedBodies(feeds[1],fast,fastAt);
  h.advance(5);h.context.rssRememberSuppliedBodies(feeds[0],slow,slowAt);
  for(const entry of [slow[0],fast[0]])assert.equal(h.context.rssSuppliedEntry({...entry,contentHtml:'',bodyProvided:false}).contentHtml,body);
});
test('supplied body storage is bounded globally and per feed in UTF-8 bytes',async()=>{
  const h=supplied({candidates:100});h.context.parseRss=(_xml,feed)=>Array.from({length:100},(_,i)=>({
    title:'A public story',url:`https://stories.example/${encodeURIComponent(feed.url)}/${i}`,source:feed.name,
    feedUrl:feed.url,feedSourceUrl:feed.url,bodyProvided:true,contentHtml:'日'.repeat(25000),photo:'https://images.example/a.jpg'}));
  await h.load(false);const rows=memory(h),perFeed=new Map();
  assert(rows.length>0);assert(rows.reduce((n,r)=>n+r.bytes,0)<=1000000);
  for(const r of rows)perFeed.set(r.feedUrl,(perFeed.get(r.feedUrl)||0)+r.bytes);
  assert([...perFeed.values()].every(n=>n<=200000));
});
test('invalid metadata and oversized identities never enter the supplied-body cache',()=>{
  const h=supplied(),feed=h.context.rssSources()[0],entry=h.context.parseRss('',feed)[0];
  for(const invalid of [{...entry,url:'https://stories.example/'+('x'.repeat(5000))},
    {...entry,url:'https://user:password@stories.example/a'}, {...entry,title:'x'.repeat(1001)},
    {...entry,feedUrl:'https://feeds.example/'+('x'.repeat(5000))}]){
    h.context.rssRememberSuppliedBodies(feed,[invalid],h.state.now);assert.equal(memory(h).length,0);
  }
  h.context.rssRememberSuppliedBodies({...feed,url:'https://feeds.example/'+('x'.repeat(5000))},[entry],h.state.now);
  assert.equal(memory(h).length,0);
  h.context.rssRememberSuppliedBodies(feed,[entry],h.state.now);const record=memory(h)[0];
  assert(record.bytes>Buffer.byteLength(JSON.stringify(record.body)),'Identity and provenance are included in the bound');
});
test('a failed Medium owner request is evicted, allowing a real manual retry',async()=>{
  const h=rssDevice({mediumResolve:true,candidates:1});await h.load(false);const entry=h.entries()[12][0];
  h.state.fail=true;assert.equal((await h.context.rssResolveSelectedEntry(entry)).bodyProvided,false);
  h.state.fail=false;assert.equal((await h.context.rssResolveSelectedEntry(entry)).bodyProvided,true);
  const owner=()=>h.calls.filter(c=>/\/feed\/@writer-/.test(c.target));
  assert.equal(owner().length,2);await h.context.rssResolveSelectedEntry(entry);assert.equal(owner().length,2);
});
test('concurrent failed consumers share one request; late failure cannot erase a newer job',async()=>{
  const h=rssDevice({mediumResolve:true,candidates:1});await h.load(false);const entry=h.entries()[12][0];
  let reject,calls=0;h.context.fetchArticleHtml=()=>{calls++;return new Promise((_,fail)=>{reject=fail;});};
  const first=h.context.rssResolveSelectedEntry(entry),second=h.context.rssResolveSelectedEntry(entry);
  await new Promise(setImmediate); // Allow the VM parser promise to settle.
  assert.equal(calls,1);
  runInContext('rssPublicFeedJobs.clear()',h.context);
  let release;h.context.fetchArticleHtml=()=>{calls++;return new Promise(done=>{release=done;});};
  const newer=h.context.rssResolveSelectedEntry(entry);await new Promise(setImmediate);assert.equal(calls,2);
  reject(Error('Old request failed'));await Promise.all([first,second]);
  assert.equal(runInContext('rssPublicFeedJobs.size',h.context),1);
  release('synthetic xml');await newer;assert.equal(runInContext('rssPublicFeedJobs.size',h.context),1);
});
test('malformed owner responses can retry, but successful empty inventory remains coalesced',async()=>{
  const h=rssDevice({mediumResolve:true,candidates:1});await h.load(false);const entry=h.entries()[12][0];
  const parse=h.context.parseRss;h.context.parseRss=()=>{throw Error('Malformed XML');};
  await h.context.rssResolveSelectedEntry(entry);h.context.parseRss=parse;
  assert.equal((await h.context.rssResolveSelectedEntry(entry)).bodyProvided,true);
  runInContext('rssPublicFeedJobs.clear()',h.context);h.context.parseRss=()=>[];
  const calls=h.calls.length;await h.context.rssResolveSelectedEntry(entry);await h.context.rssResolveSelectedEntry(entry);
  assert.equal(h.calls.length,calls+1);
});
