import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker,MAX_BYTES} from '../server/rss-worker/index.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {rssDevice} from './egress-rss-transport.mjs';
const XML='<rss><channel><item><title>Story</title></item></channel></rss>';
function harness(fetcher,aliases={}){
 const values=new Map(),jobs=[];const cache={match:async k=>values.get(k.url)?.clone(),put:async(k,v)=>values.set(k.url,v)};
 const worker=createWorker({fetcher,cacheProvider:()=>cache,aliases});
 return {run:(path='/feeds/1',init)=>worker.fetch(new Request('https://worker.test'+path,init),{}, {waitUntil:p=>jobs.push(p)}),jobs,values};
}
const xml=(headers={})=>new Response(XML,{headers:{'content-type':'application/atom+xml; charset=utf-8','x-breeze-fetched-at':String(Date.now()),...headers}});
test('fixed feeds cached without forwarding credentials or cookies',async()=>{
 let calls=0;const h=harness(async(url,options)=>{calls++;assert.equal(url,'https://theconversation.com/global/articles.atom');assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.Cookie,undefined);return xml();});
 const r=await h.run('/feeds/1',{headers:{Authorization:'not-forwarded',Cookie:'not-forwarded'}});assert.equal(await r.text(),XML);
 await Promise.all(h.jobs);assert.equal(await(await h.run()).text(),XML);assert.equal(calls,1);
});
test('arbitrary targets, query tricks, methods never fetch',async()=>{
 let calls=0;const h=harness(async()=>{calls++;return xml();});
 for(const path of ['/feeds/13','/feeds/01','/feeds/-1','/feeds/1?url=http://127.0.0.1','/proxy','/feeds/1/'])assert.equal((await h.run(path)).status,404);
 assert.equal((await h.run('/feeds/1',{method:'POST',body:'url=x'})).status,405);assert.equal(calls,0);
});
test('redirect off publisher host and private destinations rejected',async()=>{
 for(const target of ['http://theconversation.com/feed','https://127.0.0.1/a','https://evil.test/a','https://theconversation.com/unreviewed','https://user:pass@theconversation.com/a']){
  let calls=0;const h=harness(async()=>{calls++;return new Response(null,{status:302,headers:{location:target}});});assert.equal((await h.run()).status,502);assert.equal(calls,1);
 }
});
test('same publisher redirects bounded and final URL exposed',async()=>{
 let calls=0;const h=harness(async()=>++calls===1?new Response(null,{status:301,headers:{location:'/new-feed'}}):xml(),{1:['https://theconversation.com/new-feed']});
 const r=await h.run();assert.equal(r.status,200);assert.equal(r.headers.get('x-breeze-feed-url'),'https://theconversation.com/new-feed');
 let loops=0;const loop=harness(async()=>{loops++;return new Response(null,{status:302,headers:{location:'/loop'}});},{1:['https://theconversation.com/loop']});assert.equal((await loop.run()).status,502);assert.equal(loops,4);
});
test('oversized, HTML, error, empty bodies fail closed without caching',async()=>{
 for(const make of [()=>new Response('x'.repeat(MAX_BYTES+1),{headers:{'content-type':'text/xml'}}),()=>new Response('<html/>',{headers:{'content-type':'text/html'}}),()=>new Response('no',{status:503}),()=>new Response('',{headers:{'content-type':'text/xml'}})]){
  const h=harness(async()=>make());assert.equal((await h.run()).status,502);assert.equal(h.values.size,0);
 }
});
test('publisher no-store/private/no-cache/set-cookie respected',async()=>{
 for(const headers of [{'cache-control':'private'},{'cache-control':'no-store'},{'cache-control':'no-cache'},{'cache-control':'max-age=0'},{'set-cookie':'session=x'},{vary:'*'}]){
  const h=harness(async()=>xml(headers)),r=await h.run();await Promise.all(h.jobs);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('set-cookie'),null);assert.equal(h.values.size,0);
 }
});
test('concurrent cold requests keep response IO scoped to their invocation',async()=>{
 let calls=0;const h=harness(async()=>{calls++;return xml();});
 const results=await Promise.all([h.run(),h.run()]);assert.equal(calls,2);for(const r of results)assert.equal(await r.text(),XML);
});
const source=readFileSync(new URL('../scripts/importers/rss.js',import.meta.url),'utf8');
function client(config,fetcher){let legacy=0;const context=vm.createContext({URL,AbortSignal,TextDecoder,Uint8Array,window:{BREEZE_CONFIG:config},fetch:fetcher,fetchArticleHtml:async()=>{legacy++;return 'legacy';}});vm.runInContext(source,context);return {context,legacy:()=>legacy};}
test('worker built-ins route without secrets and never fallback on failure',async()=>{
 const c=client({RSS_WORKER_URL:'https://worker.test'},async(url,options)=>{assert.equal(url,'https://worker.test/feeds/1');assert.equal(options.credentials,'omit');return new Response('no',{status:503});});
 await assert.rejects(vm.runInContext('rssFeedHtml(RSS_FEEDS[1],{})',c.context));assert.equal(c.legacy(),0);
});
test('disabled worker and custom feeds preserve old transport',async()=>{
 const c=client({},()=>assert.fail());assert.equal(await vm.runInContext('rssFeedHtml(RSS_FEEDS[1],{})',c.context),'legacy');
 c.context.window.BREEZE_CONFIG.RSS_WORKER_URL='https://worker.test';assert.equal(await vm.runInContext('rssFeedHtml({url:"https://custom.test/feed"},{})',c.context),'legacy');assert.equal(c.legacy(),2);
});
test('client preserves original feed URL and XML for body reuse',async()=>{
 const c=client({RSS_WORKER_URL:'https://worker.test'},async()=>xml());const result=await vm.runInContext('(async()=>{const loc={};return [await rssFeedHtml(RSS_FEEDS[1],loc),loc.url]})()',c.context);assert.equal(result[0],XML);assert.equal(result[1],'https://theconversation.com/global/articles.atom');
});

test('client rejects missing, future and stale source timestamps',async()=>{
 for(const at of ['',String(Date.now()+60000),String(Date.now()-86400001)]){const c=client({RSS_WORKER_URL:'https://worker.test'},async()=>xml({'x-breeze-fetched-at':at}));await assert.rejects(vm.runInContext('rssFeedHtml(RSS_FEEDS[1],{})',c.context));assert.equal(c.legacy(),0);}
});

test('shared freshness and upstream Age are respected',async()=>{
 for(const [headers,want] of [[{'cache-control':'max-age=600',age:'590'},'public, max-age=10'],[{'cache-control':'s-maxage=0,max-age=600'},'no-store'],[{'cache-control':'max-age=600',age:'601'},'no-store'],[{age:'invalid'},'no-store']]){const h=harness(async()=>xml(headers)),r=await h.run();assert.equal(r.headers.get('cache-control'),want);}
});
test('invalid configured endpoint never restores Supabase',async()=>{
 for(const value of [false,0,{},'http://worker.test','https://user:pass@worker.test']){const c=client({RSS_WORKER_URL:value},()=>assert.fail());await assert.rejects(vm.runInContext('rssFeedHtml(RSS_FEEDS[1],{})',c.context));assert.equal(c.legacy(),0);}
});

test('cache read failure still permits bounded origin fetch',async()=>{
 const worker=createWorker({fetcher:async()=>xml(),cacheProvider:()=>({match:async()=>{throw Error('cache');},put:async()=>{}})});const r=await worker.fetch(new Request('https://worker.test/feeds/1'),{},{waitUntil:()=>{}});assert.equal(r.status,200);
});

test('relative redirect resolves from current hop and exact alias',async()=>{
 const urls=[];const h=harness(async u=>{urls.push(u);return urls.length===1?new Response(null,{status:302,headers:{location:'/new/path/feed'}}):urls.length===2?new Response(null,{status:302,headers:{location:'../rss'}}):xml();},{1:['https://theconversation.com/new/path/feed','https://theconversation.com/new/rss']});assert.equal((await h.run()).status,200);assert.equal(urls[2],'https://theconversation.com/new/rss');
});
test('hybrid discovery keeps WIRED catalog and bounded last-good timestamps',async()=>{
 const d=rssDevice({catalog:true});d.context.window.BREEZE_CONFIG.RSS_CATALOG_FEED_IDS=[7];d.context.window.BREEZE_CONFIG.RSS_WORKER_URL='https://worker.test';
 const original=d.context.fetch,workerCalls=[];d.context.fetch=async(raw,options)=>{if(!raw.startsWith('https://worker.test/'))return original(raw,options);workerCalls.push(raw);return d.state.fail?new Response('',{status:502}):xml({'x-breeze-fetched-at':'900000'});};
 await d.load(false);assert.equal(workerCalls.length,12);assert.equal(d.calls.length,1);assert.equal(d.calls[0].target,'catalog');assert.equal(d.entries().filter(g=>g.length).length,13);
 const before=JSON.parse(d.storage.get('breeze.rss-public.v1'));d.state.fail=true;await d.load(true);
 assert.equal(d.entries().filter(g=>g.length).length,13);assert.deepEqual(JSON.parse(d.storage.get('breeze.rss-public.v1')),before);assert.ok(d.calls.every(c=>c.target==='catalog'));
});
