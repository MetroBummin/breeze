import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {DOMParser} from 'linkedom';

const article=readFileSync(new URL('../scripts/importers/article.js',import.meta.url),'utf8');
const rss=readFileSync(new URL('../scripts/importers/rss.js',import.meta.url),'utf8');
const url='https://publisher.test/story',photo='https://images.test/cover.jpg';
function runtime(){
  let now=Date.parse('2026-10-05T00:00:00Z');
  class Clock extends Date{static now(){return now;}}
  const storage=new Map(),calls=[];
  const context=createContext({URL,Date:Clock,DOMParser,console,setTimeout,clearTimeout,TextEncoder,TextDecoder,AbortController,
    books:[],positions:{},navigator:{onLine:true},window:{},load:(_key,fallback)=>fallback,
    SB_URL:'https://relay.test',SB_KEY:'public-test-key',
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    fetch:async(endpoint,options)=>{calls.push({endpoint,options});throw Error('Unstubbed transport');}});
  runInContext(article+'\n'+rss,context);
  return {context,storage,calls,advance:ms=>{now+=ms;}};
}
test('automatic metadata excludes credentials, private/local hosts and all IP literals',()=>{
  const {context}=runtime();
  for(const raw of ['http://127.0.0.1/x','http://2130706433/x','http://0x7f000001/x','http://10.1.2.3/x',
    'http://192.168.1.1/x','http://169.254.169.254/x','http://[::1]/x','http://[::ffff:127.0.0.1]/x',
    'https://localhost/x','https://service.local/x','https://host.internal/x','https://host.lan/x',
    'https://person:secret@publisher.test/x','https://publisher.test/x?access_token=secret',
    'https://publisher.test/x?API_KEY=secret','file:///tmp/x','javascript:alert(1)','notaurl',
    'https://publisher.test/x?X-Amz-Signature=secret','https://publisher.test/x?X-Goog-Credential=secret',
    'https://publisher.test/'+ 'x'.repeat(4096)])assert.equal(context.rssCoverPublicUrl(raw),'',raw);
  assert.equal(context.rssCoverPublicUrl(url+'#section'),url);
  assert.equal(context.rssCoverPublicUrl('https://publisher.test/x?q=reading'),'https://publisher.test/x?q=reading');
});
test('only a fixed public feed missing its own photo qualifies; warm metadata hydrates the canonical entry',()=>{
  const {context}=runtime();
  const feedSourceUrl=runInContext('RSS_FEEDS[2].url',context),entry={url,feedSourceUrl,photo:'',coverFallback:true};
  assert.equal(context.rssCoverEligible(entry),true);
  for(const extra of [{photo},{kind:'reddit'},{readUrl:url},{feedSourceUrl:'https://custom.test/feed'},{url:'http://10.0.0.1/x'}])
    assert.equal(context.rssCoverEligible({...entry,...extra}),false);
  context.window.BREEZE_CONFIG={RSS_CATALOG:true};
  assert.equal(context.rssCoverEligible(entry),false,'Optional shared catalog keeps its existing metadata-only response contract');
  context.window.BREEZE_CONFIG={RSS_CATALOG:false};
  context.rssCoverStore(url,photo);assert.equal(context.rssCoverHydrate(entry),entry);
  assert.equal(entry.photo,photo);assert.equal(entry.coverFallback,false);
  const supplied={...entry,photo:'https://images.test/supplied.jpg'};
  context.rssCoverHydrate(supplied);assert.equal(supplied.photo,'https://images.test/supplied.jpg');
});
test('metadata cache has distinct expiry, a hard size/count bound and no bodies or extra fields',()=>{
  const {context,storage,advance}=runtime();
  context.rssCoverStore(url,photo);context.rssCoverStore(url+'/empty','');
  advance(30*60*1000);assert.equal(context.rssCoverCached(url+'/empty'),null);
  assert.equal(context.rssCoverCached(url).photo,photo);
  advance(23.5*60*60*1000);assert.equal(context.rssCoverCached(url),null);
  for(let i=0;i<110;i++)context.rssCoverStore(url+`?i=${i}&padding=`+'x'.repeat(2000),photo);
  const raw=storage.get('breeze.rss-cover-metadata.v1'),cache=JSON.parse(raw);
  assert(Buffer.byteLength(raw)<=64000);assert(Object.keys(cache).length<=100);
  for(const record of Object.values(cache))assert.deepEqual(Object.keys(record).sort(),['at','photo']);
  const before=raw;context.rssCoverStore('http://127.0.0.1/x',photo);context.rssCoverStore(url,'http://10.0.0.1/x');
  assert.equal(storage.get('breeze.rss-cover-metadata.v1'),before);
});
test('persisted malformed, future, expired, credential and private metadata cannot become a photo',()=>{
  const {context,storage}=runtime(),at=Date.parse('2026-10-05T00:00:00Z');
  storage.set('breeze.rss-cover-metadata.v1',JSON.stringify({
    [url]:{at,photo,html:'never retain'},[url+'/future']:{at:at+1,photo},
    [url+'/old']:{at:at-86400000,photo},[url+'/private']:{at,photo:'http://127.0.0.1/x'},
    ['https://person:secret@publisher.test/x']:{at,photo},[url+'/bad']:{at,photo:123},
  }));
  assert.equal(context.rssCoverCached(url).photo,photo);
  assert.deepEqual(Object.keys(context.rssCoverCached(url)).sort(),['at','photo']);
  for(const key of ['/future','/old','/private','/bad'])assert.equal(context.rssCoverCached(url+key),null);
  assert.equal(context.rssCoverCached('https://person:secret@publisher.test/x'),null);
});
test('relay prefixes decode JSON escapes without treating nested or fake html fields as metadata',()=>{
  const {context}=runtime();
  const html='<html><head><title>"quote" \\ 雪</title><meta property="og:image" content="'+photo+'"></head><body>';
  const complete=JSON.stringify({url,html:html+'x'.repeat(100)});
  const prefix=context.rssCoverPayloadPrefix(complete.slice(0,-50));
  assert(prefix.html.startsWith(html));assert.equal(prefix.url,url);
  assert.equal(context.rssCoverPhoto(prefix.html,url),photo);
  for(const tail of ['\\','\\u','\\u2','\\u26','\\u260']){
    const partial=context.rssCoverPayloadPrefix('{"url":"'+url+'","html":"text'+tail);
    assert.equal(partial.html,'text');
  }
  for(const wrong of ['{"nested":{"html":"<img src=evil>"}}','{"url":"fake \\"html\\": value","noHtml":"x"}',
    '{"html":123}','[]'])assert.equal(context.rssCoverPayloadPrefix(wrong),null);
});
test('metadata extraction prefers OG/twitter then usable first images and leaves HTML inert',()=>{
  const {context}=runtime();
  const image='<img src="/body.jpg" width="640" height="480">';
  assert.equal(context.rssCoverPhoto('<html><head><meta name="twitter:image" content="/twitter.jpg"><meta property="og:image" content="/og.jpg"></head><body>'+image,url),'https://publisher.test/og.jpg');
  assert.equal(context.rssCoverPhoto('<meta name="twitter:image" content="/twitter.jpg">'+image,url),'https://publisher.test/twitter.jpg');
  assert.equal(context.rssCoverPhoto('<script><img src="/script.jpg"></script><img src="/tracker.gif" width="1" height="1">'+image,url),'https://publisher.test/body.jpg');
  assert.equal(context.rssCoverPhoto('<img src="http://127.0.0.1/private" width="640" height="480">',url),'');
  assert.equal(context.rssCoverPhoto('<meta property="og:image" content="'+photo,url),'');
});
function streamed(context,body,chunkSize){
  const bytes=new TextEncoder().encode(JSON.stringify({url,html:body}));let offset=0,readBytes=0,cancelled=false;
  context.fetch=async(endpoint,options)=>{
    assert.equal(new URL(endpoint).searchParams.get('url'),url);assert.equal(options.credentials,'omit');
    assert(options.signal instanceof AbortSignal);
    return {ok:true,headers:{get:()=> 'application/json'},body:{getReader:()=>({
      read:async()=>{if(offset>=bytes.length)return {done:true};
        const value=bytes.subarray(offset,offset+chunkSize);offset+=value.length;readBytes+=value.length;return {done:false,value};},
      cancel:async()=>{cancelled=true;},
    })}};
  };
  return ()=>({readBytes,cancelled,serializedBytes:bytes.length});
}
test('early photo cancels a large relay response without parsing or saving an article body',async()=>{
  const {context,storage}=runtime(),metrics=streamed(context,'<meta property="og:image" content="'+photo+'">'+'x'.repeat(2100000),4096);
  const result=await context.rssCoverFetch(url,new AbortController().signal);
  assert.equal(result.photo,photo);assert.equal(metrics().readBytes,4096);assert.equal(metrics().cancelled,true);
  assert.equal(storage.size,0);assert.equal(runInContext('rssPreparedArticles.size',context),0);
});
test('128 KiB retained prefix cannot promise a network or relay billing ceiling',async()=>{
  const {context}=runtime(),metrics=streamed(context,'x'.repeat(200000)+'<meta property="og:image" content="'+photo+'">'+'x'.repeat(900000),1024*1024);
  const parse=context.rssCoverPayloadPrefix;let largest=0;
  context.rssCoverPayloadPrefix=text=>{largest=Math.max(largest,Buffer.byteLength(text));return parse(text);};
  const result=await context.rssCoverFetch(url,new AbortController().signal);
  assert.equal(result.photo,'');assert(largest<=128*1024);assert.equal(metrics().cancelled,true);
  assert.equal(metrics().readBytes,1024*1024,'A single delivered chunk can exceed the retained parsing limit');
});

function pendingFixture(){
  const fixture=runtime(),{context}=fixture,classes=new Set();
  const entry={url,photo:'',coverFallback:true,feedSourceUrl:runInContext('RSS_FEEDS[0].url',context)};
  const card={isConnected:true,dataset:{rssUrl:url},classList:{
    add:value=>classes.add(value),remove:value=>classes.delete(value),contains:value=>classes.has(value),
  }};
  const owner={pass:0,remaining:1,entries:new Map([[card,entry]]),attempted:new Set(),cancelled:false,
    running:false,consumer:null,rail:{isConnected:true},frame:0};
  Object.assign(context,{entry,card,owner,cancelAnimationFrame:()=>{},document:{visibilityState:'visible'}});
  runInContext('rssCands=[[entry]]',context);
  context.rssCoverVisible=()=>!owner.cancelled;
  let complete;
  context.rssCoverLookup=(_url,consumer)=>{
    consumer.job={controller:new AbortController(),consumers:new Set([consumer])};
    return new Promise(resolve=>{complete=resolve;});
  };
  return {...fixture,entry,card,owner,complete:result=>complete(result)};
}
test('only an admitted lookup shimmers, and empty/error completion releases the thumbnail',async()=>{
  for(const result of [{photo:''},null]){
    const fixture=pendingFixture(),{context,card,owner}=fixture;
    assert.equal(card.classList.contains('rss-cover-pending'),false);
    const work=context.rssCoverPump(owner);
    assert.equal(card.classList.contains('rss-cover-pending'),true);
    fixture.complete(result);await work;
    assert.equal(card.classList.contains('rss-cover-pending'),false);
    assert.equal(owner.consumer,null);assert.equal(fixture.calls.length,0);
  }
});
test('negative cache, ineligible metadata and exhausted budgets never shimmer or enqueue work',async()=>{
  for(const reason of ['negative','custom','budget','generation-budget','offline']){
    const {context,entry,card,owner,calls}=pendingFixture();
    if(reason==='negative')context.rssCoverStore(url,'');
    if(reason==='custom')entry.feedSourceUrl='https://custom.test/feed';
    if(reason==='budget')owner.remaining=0;
    if(reason==='generation-budget')runInContext('rssCoverRemaining=0',context);
    if(reason==='offline')context.navigator.onLine=false;
    await context.rssCoverPump(owner);
    assert.equal(card.classList.contains('rss-cover-pending'),false,reason);
    assert.equal(owner.consumer,null);assert.equal(calls.length,0);
  }
});
test('cancellation ends pending immediately, and stale release cannot clear a newer image owner',async()=>{
  const fixture=pendingFixture(),{context,card,owner}=fixture;
  const work=context.rssCoverPump(owner),consumer=owner.consumer;
  context.rssCoverCancel(owner);
  assert.equal(card.classList.contains('rss-cover-pending'),false);
  assert.equal(consumer.job.controller.signal.aborted,true);
  runInContext('rssCardCoverWork.set(card,{promise:Promise.resolve(false)})',context);
  card.classList.add('rss-cover-pending');
  fixture.complete(null);await work;
  assert.equal(card.classList.contains('rss-cover-pending'),true,'Old metadata completion cleared a newer image load');
});
