import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Readable} from 'node:stream';
import {createServer} from 'node:http';
import {FEEDS} from '../server/rss-quality/feeds.mjs';
import {fetchPublicPrefix,readHtmlPrefix,decodeHttpPrefix,requestPrefixNode} from '../server/rss-catalog/public-prefix.mjs';
import {fetchCatalogPhoto,enrichCatalogPhotos,originalUrlAllowed,ORIGINAL_LIMIT,ORIGINAL_BYTES,NO_IMAGE_MS} from '../server/rss-catalog/photos.mjs';
import {createCatalogService} from '../server/rss-catalog/service.mjs';
import {catalogHandler} from '../server/rss-catalog/handler.mjs';
import {FRESH_MS,STALE_MS} from '../server/rss-catalog/metadata.mjs';
import {extractPublicArticleCover} from '../server/article/cover-metadata.mjs';
import {coverDocumentCases} from './fixtures/rss-cover-document-cases.mjs';
import {rssCoverHeadComplete} from '../server/rss-catalog/photo-head.mjs';
const audit=JSON.parse(readFileSync(new URL('./fixtures/rss-original-cover-metadata.json',import.meta.url)));
const tmz=FEEDS.find(feed=>feed.url==='https://www.tmz.com/rss.xml'),id=FEEDS.indexOf(tmz),now=1800000000000;
const entry=(i=0)=>({title:'The English public story '+i,url:`https://www.tmz.com/public-story-${i}`,feedSourceUrl:tmz.url,source:tmz.name,photo:'',date:''});
const record=entries=>({id,at:now,entries});
const bytes=html=>new TextEncoder().encode(html),headers={'content-type':'text/html; charset=utf-8'};
const response=(html,extra={})=>({status:200,headers,bytes:bytes(html),complete:true,bodyBytesReceived:bytes(html).length,url:entry().url,...extra});
const http=(body,extra='')=>bytes('HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n'+extra+'\r\n'+body);

test('the pinned PR104 extractor passes its case, base, entity and malformed document fixtures',()=>{
  for(const row of coverDocumentCases){
    if(row.error)assert.throws(()=>extractPublicArticleCover(row.html,row.url),{message:row.error},row.name);
    else assert.equal(extractPublicArticleCover(row.html,row.url),row.photo,row.name);
  }
});

test('streamed relative photos wait for a first base or full response; ambiguous cutoffs never become absence',async()=>{
  const partial='<html><head><META PROPERTY="og:image" CONTENT="cover.jpg">';
  const final=partial+' '.repeat(4096)+'<BASE HREF="https://imagez.tmz.com/assets/"></head><body>';
  const result=await fetchCatalogPhoto(entry(),tmz,{fetcher:async(url,options)=>{
    assert.equal(options.stop(bytes(partial),headers,url),false);
    assert.equal(options.stop(bytes(final),headers,url),true);
    return response(final,{complete:false});
  }});
  assert.equal(result.status,'present');assert.equal(result.photo,'https://imagez.tmz.com/assets/cover.jpg');
  assert.equal((await fetchCatalogPhoto(entry(),tmz,{fetcher:async()=>response(partial,{complete:false})})).status,'truncated');
  assert.equal((await fetchCatalogPhoto(entry(),tmz,{fetcher:async()=>response(partial)})).photo,'https://www.tmz.com/cover.jpg');
  const unsafe=partial+'<base href="http://127.0.0.1/">';
  assert.equal((await fetchCatalogPhoto(entry(),tmz,{fetcher:async()=>response(unsafe)})).status,'blocked');
});

test('real head completion resolves root/path relative photos at the final redirect URL before a long body',async()=>{
  const finalUrl='https://www.tmz.com/final/path/article';
  for(const declaration of ['/assets/root.jpg','relative.jpg']){
    const prefix='<html><head><META PROPERTY="og:image" CONTENT="'+declaration+'"></head><body>';
    const result=await fetchCatalogPhoto(entry(),tmz,{fetcher:async(url,options)=>{
      assert.equal(options.stop(bytes(prefix),headers,finalUrl),true);assert.ok(bytes(prefix).length<4096);
      return response(prefix,{url:finalUrl,complete:false});
    }});
    assert.equal(result.status,'present');assert.equal(result.photo,new URL(declaration,finalUrl).href);
  }
});

test('comments, quoted markup, raw text and templates cannot fake a completed head or negative provenance',async()=>{
  const before='<html><head><meta property="og:image" content="relative.jpg">';
  for(const fake of ['<!-- </head><body> -->','<script>const s="</head><body>";</script>',
    '<style>p:after{content:"</head>"}</style>','<meta content="</head><body>">','<template></head><body></template>',
    '<noscript></head></noscript>','<title></head></title>','<base href="https://imagez.tmz.com/unfinished']){
    const prefix=before+fake;assert.equal(rssCoverHeadComplete(prefix),false,fake);
    const result=await fetchCatalogPhoto(entry(),tmz,{fetcher:async(url,options)=>{
      assert.equal(options.stop(bytes(prefix),headers,url),false,fake);return response(prefix,{complete:false});
    }});
    assert.equal(result.status,'truncated',fake);
  }
  const final=before+'<!-- </head> --><script>"</head>"</script><BASE HREF="https://imagez.tmz.com/assets/"></head><body>';
  assert.equal(rssCoverHeadComplete(final),true);
  const result=await fetchCatalogPhoto(entry(),tmz,{fetcher:async()=>response(final,{complete:false})});
  assert.equal(result.photo,'https://imagez.tmz.com/assets/relative.jpg');
});

test('audited feed-empty original metadata becomes a photo without retaining page prose',async()=>{
  for(const row of audit.cases){
    const feed=FEEDS.find(feed=>feed.url===row.feedSourceUrl);
    let options;
    const html='<!doctype html><html><head>'+' '.repeat(row.metaByteOffset)+row.meta+'</head><body>unretained prose</body></html>';
    const result=await fetchCatalogPhoto({...entry(),url:row.url,feedSourceUrl:row.feedSourceUrl},feed,{fetcher:async(url,opts)=>{
      options=opts;assert.equal(url,row.url);assert.equal(opts.stop(bytes(html),headers,row.url),true);
      return response(html,{url:row.url,complete:false});
    }});
    assert.equal(result.status,'present');assert.equal(result.photo,row.photo);assert.equal(result.finalUrl,row.url);
    assert.equal(options.limit,ORIGINAL_BYTES);assert.equal(options.timeoutMs,4000);assert.equal(options.maxRedirects,2);
    assert.ok(!JSON.stringify(result).includes('unretained prose'));
  }
});

test('only complete public success proves no image; failures, cutoff, malformed partial tags and blocked pages stay distinct',async()=>{
  const cases=[
    [response('<html><head></head><body>No photo</body></html>'),'noimage'],
    [response('<html><head>',{complete:false}),'truncated'],
    [response('<html><head><meta property="og:image" content="https://imagez.tmz.com/public.jpg',{complete:false}),'truncated'],
    [response('<html>',{status:503}),'transient'],[response('<html>',{status:429}),'transient'],
    [response('<html>',{status:403}),'blocked'],
    [response('<html>',{headers:{...headers,'cache-control':'public, no-store'}}),'blocked'],
    [response('<html>',{headers:{...headers,'content-encoding':'gzip'}}),'blocked'],
    [response('<title>Just a moment...</title><meta property="og:image" content="https://imagez.tmz.com/challenge.jpg">'),'blocked'],
    [response('<script>{"isAccessibleForFree":false}</script><img width="800" src="https://imagez.tmz.com/body.jpg">'),'blocked'],
    [response('<meta property="og:image" content="https://imagez.tmz.com/share.jpg"><script>{"isAccessibleForFree":false}</script>'),'present']
  ];
  for(const [reply,status] of cases)assert.equal((await fetchCatalogPhoto(entry(),tmz,{fetcher:async()=>reply})).status,status);
  const failure=await fetchCatalogPhoto(entry(),tmz,{fetcher:async()=>{throw Error('timeout');}});
  assert.equal(failure.status,'transient');assert.equal(failure.bodyBytesReceived,null);
});

test('original admission excludes custom, social, read targets, credentials and other publisher hosts',async()=>{
  let calls=0;const fetcher=async()=>{calls++;return response('<html>');};
  for(const changed of [{feedSourceUrl:'https://custom.example/rss'},{kind:'reddit'},{readUrl:'https://www.tmz.com/read'},
    {url:'https://other.example/story'},{url:'http://www.tmz.com/story'},{url:'https://www.tmz.com/story?token=private'},
    {url:'https://127.0.0.1/story'},{url:'https://user:password@www.tmz.com/story'}]){
    assert.equal((await fetchCatalogPhoto({...entry(),...changed},tmz,{fetcher})).status,'blocked');
  }
  assert.equal(calls,0);assert.equal(originalUrlAllowed('https://tmz.com/public-story',tmz),true);
});

test('public DNS and same-publisher redirect checks precede every pinned transport attempt',async()=>{
  const urls=[],dns=[],publicIP={address:'8.8.8.8',family:4};
  const opts={allowed:url=>originalUrlAllowed(url.href,tmz),resolve:async host=>{dns.push(host);return [publicIP];},
    transport:async(url,addresses)=>{urls.push(url.href);assert.deepEqual(addresses,[publicIP]);
      return urls.length===1?{status:302,location:'https://tmz.com/final'}:response('<html>');}};
  const reply=await fetchPublicPrefix(entry().url,opts);assert.equal(reply.url,'https://tmz.com/final');assert.equal(reply.httpAttempts,2);
  assert.deepEqual(dns,['www.tmz.com','tmz.com']);
  for(const location of ['https://other.example/story','http://www.tmz.com/story','https://www.tmz.com/story?signature=x','https://127.0.0.1/story']){
    let attempts=0;
    await assert.rejects(fetchPublicPrefix(entry().url,{...opts,transport:async()=>{attempts++;return {status:302,location};}}));
    assert.equal(attempts,1);
  }
  let attempts=0;
  await assert.rejects(fetchPublicPrefix(entry().url,{...opts,resolve:async()=>[publicIP,{address:'10.0.0.1',family:4}],transport:async()=>{attempts++;}}),/bad_url/);
  assert.equal(attempts,0);
  await assert.rejects(fetchPublicPrefix(entry().url,{...opts,transport:async()=>{attempts++;return {status:302,location:'/again'};}}),error=>error.message==='redirect_limit'&&error.prefixHttpAttempts===3);
  assert.equal(attempts,3);
  // A timeout spans DNS and every redirect, rather than restarting per hop.
  const keeper=setTimeout(()=>{},100);
  try{await assert.rejects(fetchPublicPrefix(entry().url,{...opts,timeoutMs:5,resolve:()=>new Promise(()=>{})}),error=>error.name==='TimeoutError');}finally{clearTimeout(keeper);}
});

test('prefix readers cancel early and report retained versus delivered body bytes',async()=>{
  const stream=Readable.from([Buffer.alloc(100),Buffer.alloc(200),Buffer.alloc(100000)]);
  const result=await readHtmlPrefix(stream,150);assert.equal(result.bytes.length,150);assert.equal(result.bodyBytesReceived,300);assert.equal(result.complete,false);assert.equal(stream.destroyed,true);
  const early=await readHtmlPrefix(Readable.from([Buffer.from('<meta>'),Buffer.alloc(100000)]),ORIGINAL_BYTES,data=>data.length>=6);
  assert.equal(early.bytes.length,6);assert.equal(early.complete,false);
  const full=await readHtmlPrefix(Readable.from([Buffer.from('<html></html>')]),ORIGINAL_BYTES);assert.equal(full.complete,true);
});

test('partial Deno HTTP framing cannot turn a cutoff into verified photo absence',()=>{
  assert.equal(decodeHttpPrefix(bytes('HTTP/1.1'),100),null);
  const partial=decodeHttpPrefix(http('<html>','Content-Length: 100\r\n'),100,true);assert.equal(partial.complete,false);
  assert.equal(decodeHttpPrefix(http('<html>','Content-Length: 6\r\n'),100).complete,true);
  assert.equal(decodeHttpPrefix(http('<html>'),100).complete,false);assert.equal(decodeHttpPrefix(http('<html>'),100,true).complete,true);
  assert.equal(decodeHttpPrefix(http('6\r\n<html>\r\n0\r\n\r\n','Transfer-Encoding: chunked\r\n'),100).complete,true);
  assert.equal(decodeHttpPrefix(http('6\r\n<html','Transfer-Encoding: chunked\r\n'),100,true).complete,false);
  assert.equal(decodeHttpPrefix(http('6\r\n<html>\r\n0\r\n','Transfer-Encoding: chunked\r\n'),100,true).complete,false);
  const over=decodeHttpPrefix(http('6\r\n<html>\r\n0\r\n\r\n','Transfer-Encoding: chunked\r\n'),3);assert.equal(over.bytes.length,3);assert.equal(over.bodyBytesReceived,6);assert.equal(over.complete,false);
  for(const extra of ['Content-Length: 6\r\nContent-Length: 6\r\n','Transfer-Encoding: gzip\r\n','Transfer-Encoding: chunked\r\nContent-Length: 6\r\n'])assert.throws(()=>decodeHttpPrefix(http('<html>',extra),100),/bad_response/);
  const denied=decodeHttpPrefix(http('<html>','Cache-Control: public\r\nCache-Control: private\r\n'),100);assert.equal(denied.bytes,null);
});

test('Node pinned socket closes after a photo prefix without waiting for the article tail',async()=>{
  let closed=false;const server=createServer((req,res)=>{
    assert.equal(req.headers.host.split(':')[0],'www.tmz.com');assert.equal(req.headers['accept-encoding'],'identity');assert.equal(req.headers.authorization,undefined);
    res.writeHead(200,{'content-type':'text/html','content-length':'1000000'});res.write('<meta>');req.on('close',()=>{closed=true;});
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  try{
    // Direct transport fixture only: production publicAddresses rejects loopback.
    const result=await requestPrefixNode(new URL(`http://www.tmz.com:${server.address().port}/story`),[{address:'127.0.0.1',family:4}],
      {signal:AbortSignal.timeout(1000),limit:ORIGINAL_BYTES,stop:data=>data.length>=6});
    assert.equal(result.bytes.length,6);assert.equal(result.complete,false);
    await new Promise(done=>setTimeout(done,10));assert.equal(closed,true);
  }finally{server.closeAllConnections();await new Promise(done=>server.close(done));}
});

test('bounded workers coalesce duplicates, retain only provenance and reuse photo/absence caches',async()=>{
  let pending=0,maxPending=0,calls=0;
  const entries=Array.from({length:9},(_,i)=>entry(i));entries.push(entry(0));entries.push({...entry(99),photo:'https://imagez.tmz.com/supplied.jpg'});
  const feeds=[record(entries)],fetcher=async e=>{calls++;pending++;maxPending=Math.max(maxPending,pending);await new Promise(done=>setTimeout(done,2));pending--;
    return {status:'present',photo:'https://imagez.tmz.com/'+e.url.split('/').at(-1)+'.jpg',finalUrl:e.url,httpAttempts:1,prefixBytes:200,bodyBytesReceived:200,html:'never stored'};};
  const metrics=await enrichCatalogPhotos(feeds,[],[id],{now,fetcher});assert.equal(calls,ORIGINAL_LIMIT);assert.equal(maxPending,2);
  assert.equal(metrics.originalJobs,6);assert.equal(metrics.originalPrefixBytes,1200);assert.equal(metrics.originalHttpAttempts,6);
  assert.equal(feeds[0].entries[0].photo,feeds[0].entries[9].photo);assert.ok(feeds[0].entries[10].photo.includes('supplied'));assert.equal(feeds[0].entries[10].originalCover,undefined);
  assert.ok(!JSON.stringify(feeds).includes('never stored'));
  const fresh=[record(feeds[0].entries.slice(0,6).map(e=>({...entry(),url:e.url})))];
  const cached=await enrichCatalogPhotos(fresh,feeds,[id],{now:now+FRESH_MS,fetcher:async()=>{throw Error('cache missed');}});
  assert.equal(cached.originalJobs,0);assert.equal(cached.originalCacheHits,6);assert.ok(fresh[0].entries.every(e=>e.photo));
  for(const status of ['noimage','transient','truncated','blocked']){
    const old=[record([{...entry(),originalCover:{status,at:now,photo:''}}])],next=[record([entry()])];let retried=0;
    const ttl=status==='noimage'?NO_IMAGE_MS:FRESH_MS;
    await enrichCatalogPhotos(next,old,[id],{now:now+ttl-1,fetcher:async()=>{retried++;return {status:'noimage',photo:''};}});assert.equal(retried,0);
    await enrichCatalogPhotos([record([entry()])],old,[id],{now:now+ttl,fetcher:async()=>{retried++;return {status:'noimage',photo:''};}});assert.equal(retried,1);
  }
});

test('positive original expiry clears the photo, changes ETag and bounds HTTP cache independently of refreshed feeds',async()=>{
  let clock=now;const snapshot={version:1,feeds:[{id,at:now,nextFetchAt:now+FRESH_MS,entries:[{...entry(),photo:'https://imagez.tmz.com/original.jpg',
    originalCover:{status:'present',at:now-STALE_MS+5000,photo:'https://imagez.tmz.com/original.jpg',finalUrl:entry().url}}]}]};
  const service=createCatalogService({enabled:[id],store:{read:async()=>({active:true,payload:snapshot,revision:'same'})},now:()=>clock});
  const handler=catalogHandler(service,{now:()=>clock});
  const first=await handler(new Request('https://catalog.fixture'));assert.match(first.headers.get('cache-control'),/max-age=5\b/);
  const payload=await first.json();assert.equal(payload.feeds[id].entries[0].photo,'https://imagez.tmz.com/original.jpg');assert.equal(payload.feeds[id].entries[0].originalCover,undefined);
  clock+=5000;const expired=await handler(new Request('https://catalog.fixture',{headers:{'if-none-match':first.headers.get('etag')}}));
  assert.equal(expired.status,200);assert.notEqual(expired.headers.get('etag'),first.headers.get('etag'));assert.equal((await expired.json()).feeds[id].entries[0].photo,'');
});

test('a cold missing-photo budget reaches first entries across feeds before one feed consumes every job',async()=>{
  const ids=[1,2],feeds=ids.map(id=>({id,at:now,entries:Array.from({length:10},(_,i)=>({...entry(i),
    url:new URL('/public-story-'+i,FEEDS[id].url).href,feedSourceUrl:FEEDS[id].url}))}));
  const visited=[];
  await enrichCatalogPhotos(feeds,[],ids,{now,fetcher:async(e,feed)=>{visited.push([FEEDS.indexOf(feed),e.url]);return {status:'noimage',photo:'',bodyBytesReceived:0};}});
  assert.equal(visited.length,6);assert.equal(visited.filter(([id])=>id===1).length,3);assert.equal(visited.filter(([id])=>id===2).length,3);
  assert.ok(visited.every(([,url])=>Number(url.split('-').at(-1))<3));
});
