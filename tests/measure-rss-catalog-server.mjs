// Actual HTTP handler + Postgres SQL (PGlite); synthetic fixed publisher feeds.
// Measures body bytes separately on the server-fetch and client-response legs.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {FEEDS} from '../server/rss-quality/feeds.mjs';
import {createCatalogService,databaseStore} from '../server/rss-catalog/service.mjs';
import {catalogHandler} from '../server/rss-catalog/handler.mjs';
import {operatorAuthorized} from '../server/rss-catalog/operator-auth.mjs';
import {rssDevice} from './egress-rss-transport.mjs';
import {fetchCatalogPhoto} from '../server/rss-catalog/photos.mjs';
import {fetchPublicPrefix,requestPrefixNode} from '../server/rss-catalog/public-prefix.mjs';
import {FRESH_MS} from '../server/rss-catalog/metadata.mjs';
const db=new PGlite(),stats={requests:0,bytes:0,pending:0,maxPending:0};
const audit=JSON.parse(readFileSync(new URL('./fixtures/rss-original-cover-metadata.json',import.meta.url)));
const originals=[...audit.cases,...[0,1].map(i=>({...audit.cases[1],url:`https://www.tmz.com/synthetic-original-${i}`,metaByteOffset:1000}))];
const originalStats={requests:0,bodyBytesWritten:0,pending:0,maxPending:0,closed:0};
const publisher=createServer((req,res)=>{
  const row=originals.find(item=>new URL(item.url).pathname===req.url);
  if(!row){res.writeHead(404).end();return;}
  originalStats.requests++;
  const prefix='<!doctype html><html><head>'+' '.repeat(row.metaByteOffset)+row.meta;
  originalStats.bodyBytesWritten+=Buffer.byteLength(prefix);
  res.writeHead(200,{'content-type':'text/html','content-length':'300000'});res.write(prefix);
  // No tail is sent. A successful lookup must cancel after public share metadata.
  res.on('close',()=>{originalStats.closed++;});
});
let clock=Date.now(),secondPass=false;
const fixtures=FEEDS.map((feed,id)=>{
  const story='The public English story explores how people learn from evidence and compare the world around them. ';
  const matching=originals.filter(row=>row.feedSourceUrl===feed.url);
  const xml='<rss><channel>'+Array.from({length:20},(_,i)=>`<item><title>The public English story ${id}/${i}</title><link>${matching[i]?.url||`https://stories.example/${id}/${i}`}</link><description>${story.repeat(2)}</description>${matching[i]?'':`<enclosure type="image/png" url="https://images.example/${id}/${i}.png"/>`}</item>`).join('')+'</channel></rss>';
  return xml.replace('</channel>',`<!--${'x'.repeat(100000-Buffer.byteLength(xml)-7)}--></channel>`);
});
const client={from(){return {select(){return {eq(){return {async maybeSingle(){
  return {data:(await db.query('select payload,revision,active from public.rss_public_catalog where id=1')).rows[0]};
}};}};}};},async rpc(name,args){
  const result=name==='rss_catalog_publish'?await db.query('select public.rss_catalog_publish($1::uuid,$2::jsonb) as value',[args.claim_token,JSON.stringify(args.new_payload)]):
    await db.query(`select public.${name}($1::uuid) as value`,[args.claim_token]);return {data:result.rows[0].value};
}};
const service=createCatalogService({store:databaseStore(client),enabled:FEEDS.map((_,id)=>id),originalEnabled:[1,2],now:()=>clock,fetcher:async feed=>{
  const xml=fixtures[FEEDS.indexOf(feed)];stats.requests++;if(!secondPass)stats.bytes+=Buffer.byteLength(xml);stats.pending++;stats.maxPending=Math.max(stats.pending,stats.maxPending);
  await new Promise(done=>setTimeout(done,2));stats.pending--;return secondPass?{unchanged:true,headers:{},responseBodyBytes:0}:{xml,headers:{etag:'"fixture-1"'},responseBodyBytes:Buffer.byteLength(xml)};
},photoFetcher:async(entry,feed)=>{
  originalStats.pending++;originalStats.maxPending=Math.max(originalStats.maxPending,originalStats.pending);
  try{return await fetchCatalogPhoto(entry,feed,{fetcher:(url,options)=>fetchPublicPrefix(url,{...options,
    resolve:async()=>[{address:'8.8.8.8',family:4}],transport:async(target,addresses,opts)=>{
      assert.deepEqual(addresses,[{address:'8.8.8.8',family:4}]);
      // Fixture adapter only: no publisher DNS/TLS leaves this process.
      const local=new URL(target);local.protocol='http:';local.port=String(publisher.address().port);
      return requestPrefixNode(local,[{address:'127.0.0.1',family:4}],{...opts,stop:(bytes,headers)=>opts.stop(bytes,headers,target.href)});
    }})});}finally{originalStats.pending--;}
}});
// Model only the existing verified-operator RPC; no real credential, JWT
// signing, PostgREST request or operator endpoint leaves this process.
let operatorChecks=0;
const handler=catalogHandler(service,{authorize:request=>operatorAuthorized(request,{
  url:'https://catalog-db.fixture',apiKey:'synthetic-anon-key',fetcher:async(url,options)=>{
    operatorChecks++;
    assert.equal(url,'https://catalog-db.fixture/rest/v1/rpc/rss_quality_operator_authorized');
    assert.equal(options.method,'POST');assert.equal(options.body,'{}');assert.equal(options.redirect,'error');
    assert.equal(options.headers.apikey,'synthetic-anon-key');
    return Response.json(options.headers.Authorization==='Bearer synthetic.service.signature');
  }
}),now:()=>clock});
const server=createServer(async(req,res)=>{
  try{
    const reply=await handler(new Request('http://catalog.fixture'+req.url,{method:req.method,headers:req.headers}));
    res.writeHead(reply.status,Object.fromEntries(reply.headers));res.end(Buffer.from(await reply.arrayBuffer()));
  }catch{res.writeHead(500).end();}
});
const result={units:'UTF-8 uncompressed HTTP response bodies. Synthetic feeds; four audited public OG snippets plus two synthetic originals. Local pinned Node HTTP, modeled DNS; live publisher/TLS, headers, redirects, DB responses, images, selected article bodies and other traffic excluded. Retained original-prefix bytes and delivered chunks are separate; neither is total billed egress.',sourceHashes:{},cases:{}};
for(const file of ['supabase/functions/rss-catalog/index.ts','server/rss-catalog/service.mjs','server/rss-catalog/metadata.mjs','server/rss-catalog/handler.mjs','server/rss-catalog/operator-auth.mjs','server/rss-catalog/photos.mjs','server/rss-catalog/photo-head.mjs','server/rss-catalog/public-prefix.mjs','server/article/cover-metadata.mjs','server/rss-catalog/schema/rss_public_catalog.sql','scripts/importers/rss.js'])result.sourceHashes[file]=createHash('sha256').update(readFileSync(new URL('../'+file,import.meta.url))).digest('hex');
let base;
async function get(headers={}){const response=await fetch(base,{headers});const bytes=Buffer.from(await response.arrayBuffer());return {status:response.status,bytes:bytes.length,etag:response.headers.get('etag'),payload:bytes.length?JSON.parse(bytes):null};}
try{
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await db.exec(readFileSync(new URL('../server/rss-catalog/schema/rss_public_catalog.sql',import.meta.url),'utf8'));
  await new Promise(done=>publisher.listen(0,'127.0.0.1',done));
  await new Promise(done=>server.listen(0,'127.0.0.1',done));base=`http://127.0.0.1:${server.address().port}/rss-catalog`;
  const off=await get();assert.ok(off.payload.feeds.every(feed=>feed.status==='disabled'));assert.equal(stats.requests,0);
  await db.exec('update public.rss_public_catalog set active=true where id=1; set role service_role;');
  const cold=await get();assert.ok(cold.payload.feeds.every(feed=>!feed.entries.length));assert.equal(stats.requests,0);
  result.cases.coldServer={clientRequests:1,clientResponseBodyBytes:cold.bytes,publisherRequests:0};
  const refreshes=await Promise.all(Array.from({length:30},()=>fetch(base,{method:'POST',headers:{authorization:'Bearer synthetic.service.signature'}}).then(response=>response.json())));
  assert.equal(refreshes.filter(reply=>reply.refreshed).length,1);assert.equal(stats.requests,13);assert.equal(stats.maxPending,2);
  const refreshed=refreshes.find(reply=>reply.refreshed);assert.equal(refreshed.successfulFeedBodyBytes,1300000);assert.equal(refreshed.failedSources,0);
  result.cases.concurrentRefresh={callers:30,successfulRefreshes:1,publisherRequests:stats.requests,publisherResponseBodyBytes:stats.bytes,maxPublisherConcurrency:stats.maxPending};
  assert.equal(refreshed.originalJobs,6);assert.equal(refreshed.originalStatuses.present,6);assert.equal(originalStats.maxPending,2);assert.equal(originalStats.requests,6);
  result.cases.concurrentOriginals={callers:30,originalJobs:refreshed.originalJobs,httpAttempts:refreshed.originalHttpAttempts,
    retainedPrefixBytes:refreshed.originalPrefixBytes,deliveredBodyChunkBytes:refreshed.originalBodyBytesReceived,unknownByteJobs:refreshed.originalUnknownByteJobs,
    fixtureBodyBytesWritten:originalStats.bodyBytesWritten,maxJobConcurrency:originalStats.maxPending,statuses:refreshed.originalStatuses};
  const warm=await get();assert.equal(warm.payload.feeds.reduce((sum,feed)=>sum+feed.entries.length,0),260);assert.ok(!JSON.stringify(warm.payload).includes('contentHtml'));
  result.cases.firstClient={clientRequests:1,clientResponseBodyBytes:warm.bytes,publisherRequests:0,metadataEntries:260};
  for(const row of originals){const card=warm.payload.feeds.flatMap(feed=>feed.entries).find(entry=>entry.url===row.url);assert.equal(card.photo,row.photo);assert.equal(card.originalCover,undefined);}
  const many=await Promise.all(Array.from({length:30},()=>get()));assert.equal(stats.requests,13);
  result.cases.concurrentNewUsers={users:30,clientRequests:30,clientResponseBodyBytes:many.reduce((sum,row)=>sum+row.bytes,0),publisherRequests:0};
  const conditional=await get({'if-none-match':warm.etag});assert.equal(conditional.status,304);assert.equal(conditional.bytes,0);
  result.cases.conditionalClient={clientRequests:1,clientResponseBodyBytes:0,publisherRequests:0};
  const deviceNow=Date.now(),devices=Array.from({length:30},()=>rssDevice({catalog:true,now:deviceNow}));
  for(const device of devices)device.state.catalogPayload=warm.payload;
  await Promise.all(devices.map(device=>device.load(false)));await Promise.all(devices.map(device=>device.rotate()));
  const restarts=devices.map(device=>{const restart=rssDevice({catalog:true,storage:device.storage,now:deviceNow});return restart.load(false).then(()=>restart);});
  const reused=await Promise.all(restarts);assert.equal(devices.reduce((sum,device)=>sum+device.calls.length,0),30);assert.ok(reused.every(device=>device.calls.length===0));
  result.cases.warmRotationAndRelaunch={users:30,clientRequests:0,clientResponseBodyBytes:0,publisherRequests:0};
  clock+=FRESH_MS;secondPass=true;
  // Advance the real SQL cooldown as the database owner; do not model a bypass
  // available to public readers. Publisher validator responses are now 304.
  await db.exec("reset role; update public.rss_public_catalog set refresh_after='-infinity'; set role service_role;");
  const nextRefreshes=await Promise.all(Array.from({length:30},()=>fetch(base,{method:'POST',headers:{authorization:'Bearer synthetic.service.signature'}}).then(response=>response.json())));
  const second=nextRefreshes.find(reply=>reply.refreshed);assert.equal(nextRefreshes.filter(reply=>reply.refreshed).length,1);
  assert.equal(second.originalJobs,0);assert.equal(second.originalCacheHits,6);assert.equal(originalStats.requests,6);assert.equal(second.successfulFeedBodyBytes,0);
  result.cases.nextScheduledRefresh={callers:30,successfulRefreshes:1,feedValidatorRequests:13,successfulFeedBodyBytes:0,originalJobs:0,originalCacheHits:6};
  await db.exec('reset role; update public.rss_public_catalog set active=false; set role service_role;');
  const disabled=await get({'if-none-match':warm.etag});assert.equal(disabled.status,200);assert.ok(disabled.payload.feeds.every(feed=>!feed.entries.length));
  assert.equal(stats.requests,26);assert.equal(operatorChecks,60);result.cases.rollback={empty:true,publisherRequests:0};
  result.comparison={legacyNewUsers:{users:30,publisherFeedRequestsViaClient:390,fixtureFeedBodyBytes:39000000},catalogNewUsersAndOneServerWarm:{users:30,publisherFeedRequests:13,publisherFeedBodyBytes:1300000,originalJobs:6,originalRetainedPrefixBytes:refreshed.originalPrefixBytes,originalDeliveredBodyChunkBytes:refreshed.originalBodyBytesReceived,clientCatalogBodyBytes:many.reduce((sum,row)=>sum+row.bytes,0)},caveat:'Legacy feed bodies alone versus the separately counted catalog legs, including bounded server original-photo work. This is a controlled transport comparison, not total egress or a billing percentage.'};
  if(process.env.BREEZE_CATALOG_SERVER_REPORT)writeFileSync(process.env.BREEZE_CATALOG_SERVER_REPORT,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
}finally{server.closeAllConnections();publisher.closeAllConnections();await new Promise(done=>server.close(done));await new Promise(done=>publisher.close(done));await db.close();}
