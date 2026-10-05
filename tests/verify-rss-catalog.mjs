import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {DOMParser} from 'linkedom';
import {rssPromoFixtures} from './fixtures/rss-promo.mjs';
import {obviousPromo} from '../server/rss-catalog/discovery.mjs';
import {PGlite} from '@electric-sql/pglite';
import {FEEDS} from '../server/rss-quality/feeds.mjs';
import {metadataUrl,parseMetadata,publicCatalog,STALE_MS,FRESH_MS,MAX_CATALOG_BYTES} from '../server/rss-catalog/metadata.mjs';
import {createCatalogService,feedIds} from '../server/rss-catalog/service.mjs';
import {catalogHandler,serviceAuthorization} from '../server/rss-catalog/handler.mjs';
const xml=(id=0)=>`<rss><channel><item><title>A useful public English story ${id}</title><link>https://stories.example/${id}</link><description><![CDATA[<p>The story explains how people learn by reading evidence and comparing ideas.</p>]]></description><content:encoded><![CDATA[<p>${'The FULL BODY NEVER SHARED describes how people learn by reading the story and comparing ideas. '.repeat(40)}</p>]]></content:encoded><enclosure type="image/png" url="https://images.example/${id}.png"/></item></channel></rss>`;
function fixture({enabled=[0,1],payload={version:1,feeds:[]},now=1000000}={}){
  const state={now,payload,revision:'',token:null,until:0,next:0,calls:[],fail:false,headers:{'content-type':'application/rss+xml'}};
  const store={read:async()=>({payload:structuredClone(state.payload),revision:state.revision}),
    claim:async token=>{if(state.now<state.until||state.now<state.next)return false;state.token=token;state.until=state.now+120000;state.next=state.now+FRESH_MS;return true;},
    publish:async(token,next)=>{if(token!==state.token||state.now>=state.until)return false;state.payload=structuredClone(next);state.revision=token;state.token=null;state.until=0;return true;},
    release:async token=>{if(token===state.token){state.token=null;state.until=0;}}};
  const fetcher=async feed=>{state.calls.push(feed.url);if(state.fail)throw Error('network');return {xml:xml(FEEDS.indexOf(feed)),headers:state.headers};};
  const service=createCatalogService({store,enabled,fetcher,now:()=>state.now,uuid:randomUUID});
  return {state,store,service};
}
test('metadata strips embedded bodies, HTML, unknown fields and token-bearing URLs',()=>{
  const entries=parseMetadata(xml(),FEEDS[0]);assert.equal(entries.length,1);
  assert.ok(!JSON.stringify(entries).includes('FULL BODY'));assert.equal(entries[0].contentHtml,undefined);
  assert.equal(entries[0].bodyProvided,undefined);assert.ok(entries[0].summary.length<=280);
  for(const value of ['http://127.0.0.1/a','http://10.0.0.1/a','http://[::1]/a','https://user:pass@public.example/a',
    'https://public.example/a?token=secret','https://public.example/a?apikey=secret','javascript:alert(1)'])assert.equal(metadataUrl(value,FEEDS[0].url),'',value);
  assert.equal(metadataUrl('https://public.example/a?id=2&utm_source=rss#section',FEEDS[0].url),'https://public.example/a?id=2');
});
test('bounded RSS/Atom parsing rejects entity declarations, malformed roots and oversized input',()=>{
  for(const value of ['<rss><broken>','<!DOCTYPE rss><rss></rss>','<!ENTITY x "secret"><rss></rss>','x'.repeat(512001)])assert.throws(()=>parseMetadata(value,FEEDS[0]));
  const atom='<feed><entry><title>A thoughtful article</title><link href="https://stories.example/atom"/><summary>The story explains how people learn from one another and the world around them.</summary></entry></feed>';
  assert.equal(parseMetadata(atom,FEEDS[0])[0].url,'https://stories.example/atom');
  assert.equal(parseMetadata('<rss><channel>'+Array.from({length:100},(_,i)=>xml(i).match(/<item>[\s\S]*<\/item>/)[0]).join('')+'</channel></rss>',FEEDS[0]).length,20);
});
test('refresh fetches only reviewed fixed feeds once; simultaneous requests share a global claim',async()=>{
  const h=fixture();const outcomes=await Promise.all(Array.from({length:30},()=>h.service.refresh()));
  assert.equal(outcomes.filter(row=>row.refreshed).length,1);assert.deepEqual(h.state.calls,[FEEDS[0].url,FEEDS[1].url]);
  await h.service.refresh();assert.equal(h.state.calls.length,2);
  const disabled=fixture({enabled:[]});assert.deepEqual(await disabled.service.refresh(),{refreshed:false,reason:'no_sources'});assert.equal(disabled.state.calls.length,0);
});
test('publisher lifetime and validators are honored; failed refresh never renews stale data',async()=>{
  const h=fixture({enabled:[0]});h.state.headers={'content-type':'application/rss+xml','cache-control':'max-age=3600',etag:'"publisher-1"'};
  await h.service.refresh();const at=h.state.payload.feeds[0].at;
  h.state.now+=FRESH_MS;await h.service.refresh();assert.equal(h.state.calls.length,1);
  h.state.now+=3600000;h.state.fail=true;await h.service.refresh();
  assert.equal(h.state.payload.feeds[0].at,at);assert.equal((await h.service.read()).catalog.feeds[0].status,'stale');
  h.state.now=at+STALE_MS+1;assert.equal((await h.service.read()).catalog.feeds[0].entries.length,0);
});
test('no-store/private responses revoke prior metadata and failed workers cannot overwrite later claims',async()=>{
  const h=fixture({enabled:[0]});await h.service.refresh();h.state.now+=FRESH_MS;
  h.state.headers={'cache-control':'private,no-store'};await h.service.refresh();assert.equal((await h.service.read()).catalog.feeds[0].entries.length,0);
  const first=randomUUID(),second=randomUUID();h.state.now+=FRESH_MS;assert.equal(await h.store.claim(first),true);
  h.state.now+=FRESH_MS;assert.equal(await h.store.claim(second),true);
  assert.equal(await h.store.publish(first,{bad:true}),false);await h.store.release(first);assert.equal(h.state.token,second);
});
test('public reads never fetch or refresh; parameters, bodies, forged user credentials and methods are rejected',async()=>{
  const h=fixture();await h.service.refresh();const before=h.state.calls.length;
  const handler=catalogHandler(h.service,{authorize:serviceAuthorization('synthetic-service-key')});
  const url='https://catalog.example/rss-catalog';
  const response=await handler(new Request(url));assert.equal(response.status,200);
  const cached=await handler(new Request(url,{headers:{'if-none-match':response.headers.get('etag')}}));assert.equal(cached.status,304);assert.equal((await cached.text()).length,0);
  for(const target of [url+'?url=http://127.0.0.1/',url+'?feed=0',url+'?refresh=1'])assert.equal((await handler(new Request(target))).status,400);
  for(const headers of [{},{apikey:'synthetic-anon-key'},{authorization:'Bearer forged-user-role-service_role'}])assert.equal((await handler(new Request(url,{method:'POST',headers}))).status,401);
  assert.equal((await handler(new Request(url,{method:'PUT'}))).status,405);
  assert.equal((await handler(new Request(url,{method:'POST',headers:{apikey:'synthetic-service-key'},body:'{}'}))).status,400);
  assert.equal(h.state.calls.length,before);
  assert.equal((await handler(new Request(url,{method:'POST',headers:{apikey:'synthetic-service-key'}}))).status,200);
});
test('ETag changes on expiry/disabled sources without retaining an old private/body representation',async()=>{
  const h=fixture();await h.service.refresh();const handler=catalogHandler(h.service);
  const url='https://catalog.example/rss-catalog',first=await handler(new Request(url));
  const etag=first.headers.get('etag');h.state.now+=STALE_MS+1;
  const expired=await handler(new Request(url,{headers:{'if-none-match':etag}}));assert.equal(expired.status,200);
  assert.ok((await expired.json()).feeds.every(feed=>!feed.entries.length));
  const after=expired.headers.get('etag');assert.equal((await handler(new Request(url,{headers:{'if-none-match':after}}))).status,304);
  assert.ok(Buffer.byteLength(JSON.stringify(publicCatalog(h.state.payload,[],h.state.now)))<=MAX_CATALOG_BYTES);
});
test('feed configuration cannot introduce arbitrary URLs or unknown IDs',()=>{
  assert.deepEqual(feedIds('0, 4,5,4'),[0,4,5]);assert.deepEqual(feedIds(''),[]);
  for(const value of ['https://private.example/feed','-1','13','0,','1.5','0;1'])assert.throws(()=>feedIds(value));
});
test('actual SQL denies public access, fences publication and retains refresh cooldown',async()=>{
  const db=new PGlite();
  try{
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    await db.exec(readFileSync(new URL('../server/rss-catalog/schema/rss_public_catalog.sql',import.meta.url),'utf8'));
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role);
      await assert.rejects(db.query('select * from public.rss_public_catalog'));
      await assert.rejects(db.query('select public.rss_catalog_claim($1::uuid)',[randomUUID()]));
      await db.exec('reset role');
    }
    await db.exec('set role service_role');const token=randomUUID();
    assert.equal((await db.query('select public.rss_catalog_claim($1::uuid) as ok',[token])).rows[0].ok,true);
    assert.equal((await db.query('select public.rss_catalog_claim($1::uuid) as ok',[randomUUID()])).rows[0].ok,false);
    assert.equal((await db.query('select public.rss_catalog_publish($1::uuid,$2::jsonb) as ok',[randomUUID(),'{"version":1,"feeds":[]}'])).rows[0].ok,false);
    assert.equal((await db.query('select public.rss_catalog_publish($1::uuid,$2::jsonb) as ok',[token,'{"version":1,"feeds":[]}'])).rows[0].ok,true);
    assert.equal((await db.query('select public.rss_catalog_claim($1::uuid) as ok',[randomUUID()])).rows[0].ok,false);
    await assert.rejects(db.query('update public.rss_public_catalog set payload=$1::jsonb',[JSON.stringify({large:'x'.repeat(200001)})]));
  }finally{await db.close();}
});

test('feed-only language/junk gates retain the existing client policy before discarding bodies',()=>{
  const ctx=createContext({URL,Date,DOMParser,console,setTimeout,clearTimeout});
  runInContext(readFileSync(new URL('../scripts/importers/rss.js',import.meta.url),'utf8'),ctx);
  ctx.rssHtmlText=raw=>new DOMParser().parseFromString('<html><body>'+raw+'</body></html>','text/html').body.textContent.replace(/\s+/g,' ').trim();
  for(const entry of rssPromoFixtures){assert.equal(obviousPromo(entry),ctx.rssObviousPromo(entry),entry.name);assert.equal(obviousPromo(entry),entry.reject,entry.name);}
  for(const body of ['The story explains how people learn by reading the world around them. '.repeat(10),
    'Beberapa waktu lalu saya menonton sebuah dokumenter yang dibuat oleh mereka. '.repeat(10),
    'これは日本語の記事です。'.repeat(20)]){
    const entry={title:'The public story',summary:body,contentHtml:body};
    const xml='<rss><channel><item><title>'+entry.title+'</title><link>https://stories.example/parity</link><description><![CDATA['+body+']]></description></item></channel></rss>';
    assert.equal(parseMetadata(xml,FEEDS[0]).length,ctx.rssLooksEnglish(entry)?1:0);
  }
});
