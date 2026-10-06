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
  const state={now,payload,active:true,revision:'',token:null,until:0,next:0,calls:[],fail:false,headers:{'content-type':'application/rss+xml'}};
  const store={read:async()=>({payload:structuredClone(state.payload),revision:state.revision,active:state.active}),
    claim:async token=>{if(!state.active||state.now<state.until||state.now<state.next)return false;state.token=token;state.until=state.now+120000;state.next=state.now+FRESH_MS;return true;},
    publish:async(token,next)=>{if(!state.active||token!==state.token||state.now>=state.until)return false;state.payload=structuredClone(next);state.revision=token;state.token=null;state.until=0;return true;},
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
test('server catalog preserves supplied supplementary, lazy, responsive and media photos with provenance',()=>{
  const prose='The public English story explains how people learn from evidence and compare the world around them. ';
  const fields=[
    [`<content:encoded><![CDATA[<p>${prose.repeat(8)}</p>]]></content:encoded><description><![CDATA[<img src="https://images.example/description.jpg"/>]]></description>`,'description.jpg'],
    [`<content type="html">${prose.repeat(8)}</content><summary><![CDATA[<img data-src="https://images.example/summary.jpg"/>]]></summary>`,'summary.jpg'],
    [`<description>${prose}</description><media:content medium="video" url="https://images.example/video.mp4"/><media:thumbnail type="IMAGE/JPEG" url="https://images.example/thumb.jpg"/>`,'thumb.jpg'],
    [`<description>${prose}</description><enclosure type="IMAGE/JPEG" url="https://images.example/enclosure.jpg"/>`,'enclosure.jpg'],
    [`<content:encoded>${prose.repeat(8)}</content:encoded><summary><![CDATA[<img src="https://images.example/small.jpg" srcset="https://images.example/small.jpg 400w, https://images.example/medium.jpg 1200w, https://images.example/large.jpg 2400w"/>]]></summary>`,'medium.jpg'],
    [`<description><![CDATA[<p>${prose}</p><img src="http://127.0.0.1/a"><img src="https://images.example/count.gif" width="1" height="1"><img data-original="https://images.example/valid.jpg" width="640" height="480">]]></description>`,'valid.jpg']
  ];
  for(const [body,photo] of fields){
    const record=parseMetadata(`<rss><channel><item><title>The useful public story</title><link>https://stories.example/1</link>${body}</item></channel></rss>`,FEEDS[0])[0];
    assert.equal(record.photo,'https://images.example/'+photo);assert.equal(record.feedSourceUrl,FEEDS[0].url);
    assert.equal(record.source,FEEDS[0].name);assert.equal(record.contentHtml,undefined);assert.equal(record.bodyProvided,undefined);
  }
});
test('refresh fetches only reviewed fixed feeds once; simultaneous requests share a global claim',async()=>{
  const h=fixture();const outcomes=await Promise.all(Array.from({length:30},()=>h.service.refresh()));
  assert.equal(outcomes.filter(row=>row.refreshed).length,1);assert.deepEqual(h.state.calls,[FEEDS[0].url,FEEDS[1].url]);
  await h.service.refresh();assert.equal(h.state.calls.length,2);
  const disabled=fixture({enabled:[]});assert.deepEqual(await disabled.service.refresh(),{refreshed:false,reason:'no_sources'});assert.equal(disabled.state.calls.length,0);
});
test('long safe publisher URLs reduce bounded entry counts instead of failing the whole refresh',async()=>{
  const h=fixture({enabled:FEEDS.map((_,id)=>id)});
  const service=createCatalogService({store:h.store,enabled:FEEDS.map((_,id)=>id),now:()=>h.state.now,uuid:randomUUID,
    fetcher:async()=>({xml:'<rss><channel>'+Array.from({length:20},(_,i)=>`<item><title>The useful public English story ${i}</title><link>https://stories.example/${i}?path=${'x'.repeat(3000)}</link><description>The story explains how people learn from evidence in the world around them.</description></item>`).join('')+'</channel></rss>',headers:{}})});
  assert.equal((await service.refresh()).refreshed,true);
  const result=(await service.read()).catalog;
  assert.ok(Buffer.byteLength(JSON.stringify(h.state.payload))<=MAX_CATALOG_BYTES-10000);
  assert.ok(result.feeds.every(feed=>feed.entries.length>0&&feed.entries.length<20));
});
test('publisher lifetime and validators are honored; failed refresh never renews stale data',async()=>{
  const h=fixture({enabled:[0]});h.state.headers={'content-type':'application/rss+xml','cache-control':'max-age=3600',etag:'"publisher-1"'};
  await h.service.refresh();const at=h.state.payload.feeds[0].at;
  h.state.now+=FRESH_MS;await h.service.refresh();assert.equal(h.state.calls.length,1);
  h.state.now+=3600000;h.state.fail=true;await h.service.refresh();
  assert.equal(h.state.payload.feeds[0].at,at);assert.equal((await h.service.read()).catalog.feeds[0].status,'stale');
  h.state.now=at+STALE_MS+1;assert.equal((await h.service.read()).catalog.feeds[0].entries.length,0);
});
test('freshness changes without a scheduler, and 304 retains publisher validators',async()=>{
  const h=fixture({enabled:[0]});h.state.headers={etag:'"publisher-1"','last-modified':'Mon, 05 Oct 2026 00:00:00 GMT'};
  await h.service.refresh();assert.equal((await h.service.read()).catalog.feeds[0].status,'ready');
  h.state.now+=FRESH_MS;assert.equal((await h.service.read()).catalog.feeds[0].status,'stale');
  const service=createCatalogService({store:h.store,enabled:[0],now:()=>h.state.now,uuid:randomUUID,
    fetcher:async(_feed,old)=>{assert.equal(old.etag,'"publisher-1"');return {unchanged:true,headers:{}};}});
  await service.refresh();assert.equal(h.state.payload.feeds[0].etag,'"publisher-1"');
  assert.equal(h.state.payload.feeds[0].modified,'Mon, 05 Oct 2026 00:00:00 GMT');
  assert.equal((await service.read()).catalog.feeds[0].status,'ready');
});
test('database OFF withholds cached metadata and prevents refresh work',async()=>{
  const h=fixture();await h.service.refresh();h.state.active=false;h.state.now+=FRESH_MS;
  assert.ok((await h.service.read()).catalog.feeds.every(feed=>feed.status==='disabled'&&!feed.entries.length));
  assert.deepEqual(await h.service.refresh(),{refreshed:false,reason:'off'});assert.equal(h.state.calls.length,2);
});
test('ETag and HTTP lifetime follow freshness boundaries',async()=>{
  const h=fixture();await h.service.refresh();const handler=catalogHandler(h.service,{now:()=>h.state.now});
  const url='https://catalog.example/rss-catalog';h.state.now+=FRESH_MS-500;
  const before=await handler(new Request(url));assert.equal(before.headers.get('cache-control'),'public,max-age=0');
  h.state.now+=501;const stale=await handler(new Request(url,{headers:{'if-none-match':before.headers.get('etag')}}));
  assert.equal(stale.status,200);assert.equal((await stale.json()).feeds[0].status,'stale');
});

test('scheduler installs disabled and denies public access to refresh, jobs and credential-bearing queues',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema net; create schema cron; create schema vault;
      create table vault.secrets(name text); create table vault.decrypted_secrets(name text,decrypted_secret text);
      insert into vault.secrets values('rss_catalog_service_role');
      insert into vault.decrypted_secrets values('rss_catalog_service_role','synthetic-service-key');
      create table net.http_request_queue(id bigserial primary key,url text,body jsonb,headers jsonb,timeout_milliseconds integer);
      create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language sql as
        'insert into net.http_request_queue(url,body,headers,timeout_milliseconds) values($1,$2,$3,$4) returning id';
      grant usage on schema net,cron to public;
      grant all on all tables in schema net to public; grant all on all sequences in schema net to public;
      create table cron.job(jobid bigserial primary key,jobname text unique,schedule text,command text,active boolean default true);
      create function cron.schedule(jobname text,schedule text,command text) returns bigint language sql as
        'insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid';`);
    await db.exec(readFileSync(new URL('../server/rss-catalog/schema/rss_public_catalog.sql',import.meta.url),'utf8'));
    // PGlite cannot run native background workers. Test the actual setup SQL
    // against modeled extension interfaces; live extension/job proof is a gate.
    await db.exec(readFileSync(new URL('../server/rss-catalog/schema/rss_public_catalog_schedule.sql',import.meta.url),'utf8')
      .replace(/^create extension .*;$/gm,''));
    assert.equal((await db.query('select active from cron.job')).rows[0].active,false);
    assert.equal((await db.query('select rss_catalog_private.enqueue_refresh() as id')).rows[0].id,null);
    for(const role of ['anon','authenticated','service_role']){
      await db.exec('set role '+role);
      await assert.rejects(db.query('select * from net.http_request_queue'));
      await assert.rejects(db.query('select * from cron.job'));
      await assert.rejects(db.query('select rss_catalog_private.enqueue_refresh()'));
      await assert.rejects(db.query("select net.http_post('https://private.example',null,'{}',1)"));
      await db.exec('reset role');
    }
    await db.exec('update public.rss_public_catalog set active=true;');
    const id=(await db.query('select rss_catalog_private.enqueue_refresh() as id')).rows[0].id;
    const row=(await db.query('select url,body,timeout_milliseconds from net.http_request_queue where id=$1',[id])).rows[0];
    assert.equal(row.url,'https://hrtfhojbhqvaoiulspto.supabase.co/functions/v1/rss-catalog');
    assert.equal(row.body,null);assert.equal(row.timeout_milliseconds,60000);
  }finally{await db.close();}
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
  const empty=new ReadableStream({start(controller){controller.close();}});
  assert.equal((await handler(new Request(url,{method:'POST',headers:{apikey:'synthetic-service-key'},body:empty,duplex:'half'}))).status,200);
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
      await assert.rejects(db.query('select public.rss_catalog_publish($1::uuid,$2::jsonb)',[randomUUID(),'{}']));
      await assert.rejects(db.query('select public.rss_catalog_release($1::uuid)',[randomUUID()]));
      await assert.rejects(db.query('update public.rss_public_catalog set active=true'));
      await db.exec('reset role');
    }
    await db.exec('set role service_role');const token=randomUUID();
    assert.equal((await db.query('select public.rss_catalog_claim($1::uuid) as ok',[token])).rows[0].ok,false);
    await assert.rejects(db.query('update public.rss_public_catalog set active=true'));
    await db.exec('reset role; update public.rss_public_catalog set active=true where id=1; set role service_role;');
    assert.equal((await db.query('select public.rss_catalog_claim($1::uuid) as ok',[token])).rows[0].ok,true);
    assert.equal((await db.query('select public.rss_catalog_claim($1::uuid) as ok',[randomUUID()])).rows[0].ok,false);
    assert.equal((await db.query('select public.rss_catalog_publish($1::uuid,$2::jsonb) as ok',[randomUUID(),'{"version":1,"feeds":[]}'])).rows[0].ok,false);
    assert.equal((await db.query('select public.rss_catalog_publish($1::uuid,$2::jsonb) as ok',[token,'{"version":1,"feeds":[]}'])).rows[0].ok,true);
    assert.equal((await db.query('select public.rss_catalog_claim($1::uuid) as ok',[randomUUID()])).rows[0].ok,false);
    await assert.rejects(db.query('update public.rss_public_catalog set payload=$1::jsonb',[JSON.stringify({large:'x'.repeat(200001)})]));
    await db.exec('reset role; update public.rss_public_catalog set refresh_after=\'-infinity\'; set role service_role;');
    const old=randomUUID();assert.equal((await db.query('select public.rss_catalog_claim($1::uuid) as ok',[old])).rows[0].ok,true);
    await db.exec('reset role; update public.rss_public_catalog set active=false; update public.rss_public_catalog set active=true; set role service_role;');
    assert.equal((await db.query('select public.rss_catalog_publish($1::uuid,$2::jsonb) as ok',[old,'{"version":1,"feeds":[]}'])).rows[0].ok,false);
    assert.deepEqual((await db.query('select payload from public.rss_public_catalog')).rows[0].payload,{version:1,feeds:[]});
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
