/* Visible Home cover metadata via the existing relay, with streamed synthetic
   JSON responses. No publisher/server mutation/paid request leaves this test. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const proof=process.env.BREEZE_RSS_VISIBLE_COVER_PROOF||'/tmp/breeze-rss-visible-covers';
mkdirSync(proof,{recursive:true});
const photo=readFileSync(resolve(root,'assets/samples/starship-1.jpg'));
const source=readFileSync(resolve(root,'scripts/importers/rss.js'),'utf8');
const feeds=[...source.matchAll(/name:'([^']+)', url:'([^']+)', category:'([^']+)'/g)]
  .map(([,name,url,category])=>({name,url,category}));
const prose='The story explains how people learn about the world by reading evidence and comparing ideas. ';
const state={runs:new Map(),active:0,maxActive:0};
let base;
function run(name,options={}){
  const value={name,options,generation:0,requests:[],blocked:[],writes:[]};state.runs.set(name,value);return value;
}
const imageUrl=(name,index,generation=0)=>`https://images.fixture/${name}/g${generation}/photo-${index}.jpg`;
const articleUrl=(name,index,generation=0)=>`https://stories.fixture/${name}/g${generation}/article-${index}`;
function feedXml(test,index){
  const supplied=test.options.supplied&&index===0;
  const generations=test.options.rotation?[0,1]:[test.generation];
  const items=generations.map(generation=>{
    const url=articleUrl(test.name,index,generation);
    return `<item><title>The public story about reading evidence ${index}</title><link>${url}</link><description>${prose}</description>${supplied?`<enclosure type="image/jpeg" url="${imageUrl(test.name,index,generation)}"/>`:''}</item>`;
  }).join('');
  return `<rss><channel>${items}</channel></rss>`;
}
function articleHtml(test,index,generation){
  const url=imageUrl(test.name,index,generation),mode=test.options.mode||'og';
  const early=mode==='twitter'?`<meta name="twitter:image" content="${url}">`:
    mode==='first-image'?'':mode==='late'?'':`<meta property="og:image" content="${url}">`;
  const image=mode==='first-image'?`<img src="${url}" width="640" height="480">`:'';
  const late=mode==='late'?`<meta property="og:image" content="${url}">`:'';
  return `<!doctype html><html><head><title>The reading story \\ " \u2603</title>${early}</head><body>${image}<p>${prose}</p>${'x'.repeat(2100000)}${late}</body></html>`;
}
const server=createServer((req,res)=>{
  const parsed=new URL(req.url,'http://localhost'),path=parsed.pathname;
  if(path==='/functions/v1/article'){
    const target=parsed.searchParams.get('url'),as=parsed.searchParams.get('as')||'';
    let url;try{url=new URL(target);}catch{return res.writeHead(400).end();}
    const name=url.pathname.split('/')[1],test=state.runs.get(name);
    if(!test||url.hostname!=='stories.fixture'||as)return res.writeHead(404).end();
    const index=Number(url.pathname.split('-').at(-1)),generation=Number(url.pathname.split('/')[2].slice(1)),html=articleHtml(test,index,generation);
    const bytes=Buffer.from(JSON.stringify({url:target,html}));
    const record={target,index,generation:url.pathname.split('/')[2],upstreamHtmlBytes:Buffer.byteLength(html),
      serializedResponseBytes:bytes.length,serverWrittenBytes:0,closedEarly:false};test.requests.push(record);
    state.active++;state.maxActive=Math.max(state.maxActive,state.active);
    res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
    let offset=0,timer;
    const write=()=>{
      if(res.destroyed)return;
      const chunk=bytes.subarray(offset,offset+4096);offset+=chunk.length;record.serverWrittenBytes+=chunk.length;
      res.write(chunk);
      if(offset>=bytes.length)res.end();else timer=setTimeout(write,2);
    };
    res.on('close',()=>{clearTimeout(timer);record.closedEarly=offset<bytes.length;state.active--;});
    timer=setTimeout(write,test.options.delayMs||0);
    return;
  }
  try{
    if(path==='/config.js'){res.setHeader('Content-Type','text/javascript');return res.end(`window.BREEZE_CONFIG={SB_URL:'${base.slice(0,-1)}',SB_KEY:'synthetic-public-key',RSS_CATALOG:false};`);}
    if(path==='/scripts/importers/rss.js'){res.setHeader('Content-Type','text/javascript');return res.end(source);}
    const file=resolve(root,'.'+(path==='/'?'/index.html':path));if(!file.startsWith(root))throw Error();
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');
    res.end(readFileSync(file));
  }catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));base=`http://127.0.0.1:${server.address().port}/`;
const results=[];
async function start(browser,test){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.addInitScript(ignoreAbort=>{
    localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));
    window.coverReaderEvidence=[];
    window.coverPrefixEvidence=[];
    addEventListener('DOMContentLoaded',()=>{
      const originalPrefix=window.rssCoverPayloadPrefix;
      window.rssCoverPayloadPrefix=text=>{
        window.coverPrefixEvidence.push(new TextEncoder().encode(text).length);
        return originalPrefix(text);
      };
    });
    const original=window.fetch;
    window.fetch=async(...args)=>{
      const url=new URL(typeof args[0]==='string'?args[0]:args[0].url,location.href);
      if(ignoreAbort&&url.pathname==='/functions/v1/article'&&!url.searchParams.has('as'))args[1]={...args[1],signal:undefined};
      const response=await original(...args);
      if(url.pathname==='/functions/v1/article'&&!url.searchParams.has('as')&&response.body){
        const record={url:url.href,readBytes:0,cancelled:false};window.coverReaderEvidence.push(record);
        const getReader=response.body.getReader.bind(response.body);
        response.body.getReader=(...readerArgs)=>{
          const reader=getReader(...readerArgs),read=reader.read.bind(reader),cancel=reader.cancel.bind(reader);
          reader.read=async()=>{const result=await read();record.readBytes+=result.value?.byteLength||0;return result;};
          reader.cancel=(reason)=>{record.cancelled=true;return cancel(reason);};return reader;
        };
      }
      return response;
    };
  },test.options.ignoreAbort===true);
  await context.route('**/*',route=>{
    const raw=route.request().url(),url=new URL(raw);
    if(raw.startsWith(base)||raw.startsWith('blob:'))return route.continue();
    const index=feeds.findIndex(feed=>feed.url===raw);
    if(index>=0)return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/xml',body:feedXml(test,index)});
    if(url.hostname==='images.fixture')return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'image/jpeg',body:photo});
    test.blocked.push(raw);return route.abort();
  });
  const page=await context.newPage();await page.goto(base);await page.evaluate(()=>homeReady);
  await page.waitForFunction(()=>!rssLoading&&document.querySelectorAll('#casual-rail .rss-card').length===13);
  return {context,page};
}
async function snapshot(page){
  return page.evaluate(async()=>({
    cards:[...document.querySelectorAll('#casual-rail .rss-card')].map(card=>({url:card.dataset.rssUrl,
      photo:card.querySelector('.thumb').classList.contains('has-cover'),ready:!card.classList.contains('rss-pending')})),
    entryPhotos:rssCands.flat().map(entry=>({url:entry.url,photo:entry.photo||''})),
    books:books.length,durableBooks:(await bookAll()).length,images:(await imgEntries()).length,
    preparedBodies:rssPreparedArticles.size,readerEvidence:window.coverReaderEvidence,prefixEvidence:window.coverPrefixEvidence,
    rssStorage:Object.fromEntries(Object.entries(localStorage).filter(([key])=>/rss/.test(key))),
  }));
}
function noPersonalData(value){assert.equal(value.books,0);assert.equal(value.durableBooks,0);assert.equal(value.images,0);assert.equal(value.preparedBodies,0);}
async function waitForRequest(test,count=1){
  const deadline=Date.now()+15000;
  while(test.requests.length<count){if(Date.now()>deadline)throw Error('Cover metadata request did not start');await new Promise(done=>setTimeout(done,20));}
}
try{
  for(const engine of [chromium,webkit].filter(engine=>!process.env.BREEZE_QA_ENGINE||engine.name()===process.env.BREEZE_QA_ENGINE)){
    const executable=process.env.BREEZE_BROWSER_EXECUTABLE||process.env.CHROMIUM_EXECUTABLE_PATH;
    const browser=await engine.launch(engine===chromium&&executable?{executablePath:executable}:{});
    try{
      state.maxActive=0;
      const cold=run(engine.name()+'-cold'),h=await start(browser,cold);
      await h.page.waitForFunction(()=>document.querySelectorAll('#casual-rail .rss-card .thumb.has-cover').length===2,null,{timeout:20000});
      const first=await snapshot(h.page);noPersonalData(first);
      assert.equal(cold.requests.length,2,'One discovery pass exceeded the two visible-cover lookups');
      assert.equal(state.maxActive,1,'Cover requests were not serial');
      for(const request of cold.requests){
        assert([0,1].includes(request.index),'Offscreen article was enriched');
        assert(request.upstreamHtmlBytes>2000000,'Full upstream HTML cost fixture was missing');
      }
      assert(!cold.blocked.some(url=>url.startsWith('https://stories.fixture/')),'Cover lookup tried a direct article-body fetch');
      for(const evidence of first.readerEvidence)assert(evidence.cancelled,'Prefix reader did not cancel the remaining response');
      assert(first.prefixEvidence.length>0);assert(Math.max(...first.prefixEvidence)<=128*1024+3,'Retained parsing prefix exceeded128KiB');
      await h.page.locator('#casual-rail').screenshot({path:resolve(proof,engine.name()+'-first-screen.png')});
      const secondRail=await h.page.evaluate(async sourceUrl=>{
        const rail=document.createElement('div');rail.id='qa-second-visible-rail';
        Object.assign(rail.style,{position:'fixed',top:'0',left:'0',width:'390px',height:'360px',zIndex:'9999',overflow:'hidden'});
        document.body.append(rail);
        const entry={title:'The second visible rail story',url:sourceUrl,feedSourceUrl:RSS_FEEDS[0].url,source:RSS_FEEDS[0].name,coverFallback:true};
        rssCands[0].push(entry);const card=rssCard(entry);rail.append(card);
        const owner=rssCoverBegin(rail);rssCoverWatch(owner,[card],[entry]);
        await new Promise(done=>setTimeout(done,150));
        const state={remaining:rssCoverRemaining,photo:card.querySelector('.thumb').classList.contains('has-cover')};
        rssCoverCancel(owner);rail.remove();rssCands[0].splice(rssCands[0].indexOf(entry),1);return state;
      },articleUrl(cold.name,99));
      assert.equal(secondRail.remaining,0);assert.equal(secondRail.photo,false);
      assert.equal(cold.requests.length,2,'A second rail reset the discovery-generation budget');
      await h.page.evaluate(()=>{const rail=document.getElementById('casual-rail');rail.scrollLeft=rail.scrollWidth;});
      await h.page.waitForTimeout(250);assert.equal(cold.requests.length,2,'Scrolling exceeded the same-pass lookup budget');
      for(let repeat=0;repeat<2;repeat++){
        await h.page.evaluate(()=>refreshLibrary());
        await h.page.waitForTimeout(150);
        assert.equal(cold.requests.length,2,'Warm refresh repeated known cover enrichment');
      }
      await h.page.reload();await h.page.evaluate(()=>homeReady);
      await h.page.waitForFunction(()=>document.querySelectorAll('#casual-rail .rss-card .thumb.has-cover').length===2);
      assert.equal(cold.requests.length,2,'Warm relaunch repeated known cover enrichment');
      const warm=await snapshot(h.page);noPersonalData(warm);
      results.push({engine:engine.name(),scenario:'cold/warm/offscreen/budget',first,warm,secondRail,requests:cold.requests,maxActive:state.maxActive});
      await h.context.close();

      const supplied=run(engine.name()+'-supplied',{supplied:true}),s=await start(browser,supplied);
      await s.page.waitForFunction(()=>document.querySelectorAll('#casual-rail .rss-card .thumb.has-cover').length===2);
      assert.equal(supplied.requests.length,1);assert.equal(supplied.requests[0].index,1,'Supplied photo was enriched unnecessarily');
      const suppliedState=await snapshot(s.page);noPersonalData(suppliedState);
      const validation=await s.page.evaluate(()=>{
        const invalid=['http://127.0.0.1/a','https://localhost/a','http://10.0.0.1/a','http://[::1]/a',
          'https://service.local/a','https://user:pass@public.example/a','https://public.example/a?token=secret',
          'https://public.example/a?api_key=secret','https://public.example/a?X-Amz-Credential=secret',
          'https://public.example/a?X-Goog-Signature=secret','file:///tmp/photo','data:image/png;base64,123'];
        const rejected=invalid.map(url=>rssCoverPublicUrl(url));
        const valid=rssCoverPublicUrl('https://public.example/a?id=2#fragment');
        const fromInert=rssCoverPhoto('<script>window.coverInjected=true</script><meta property="og:image" content="http://127.0.0.1/private.jpg"><meta name="twitter:image" content="https://images.fixture/public.jpg">','https://public.example/a');
        const badStoreUrl='https://user:pass@public.example/private';rssCoverStore(badStoreUrl,'https://images.fixture/public.jpg');
        const badStored=rssCoverCached(badStoreUrl);
        const positive='https://public.example/positive',empty='https://public.example/empty';
        rssCoverStore(positive,'https://images.fixture/public.jpg');rssCoverStore(empty,'');
        const clock=Date.now;
        let positiveExpired,emptyExpired;
        try{Date.now=()=>clock()+RSS_COVER_TTL_MS+1;positiveExpired=rssCoverCached(positive)===null;
          Date.now=()=>clock()+RSS_COVER_EMPTY_MS+1;emptyExpired=rssCoverCached(empty)===null;}
        finally{Date.now=clock;}
        for(let index=0;index<130;index++)rssCoverStore('https://public.example/bounded-'+index,'https://images.fixture/'+('x'.repeat(1000))+index+'.jpg');
        const raw=localStorage.getItem(RSS_COVER_CACHE_KEY),records=JSON.parse(raw);
        return {rejected,valid,fromInert,badStored,positiveExpired,emptyExpired,
          scriptExecuted:window.coverInjected===true,cacheRecords:Object.keys(records).length,cacheBytes:new TextEncoder().encode(raw).length};
      });
      assert(validation.rejected.every(value=>value===''));assert.equal(validation.valid,'https://public.example/a?id=2');
      assert.equal(validation.fromInert,'https://images.fixture/public.jpg');assert.equal(validation.badStored,null);
      assert.equal(validation.scriptExecuted,false);assert(validation.positiveExpired&&validation.emptyExpired);
      assert(validation.cacheRecords<=100&&validation.cacheBytes<=64000);
      results.push({engine:engine.name(),scenario:'supplied-photo-priority/public-URLs/cache-expiry-bounds',state:suppliedState,validation,requests:supplied.requests});await s.context.close();

      for(const mode of ['twitter','first-image','late']){
        const fixture=run(engine.name()+'-'+mode,{mode}),f=await start(browser,fixture);
        if(mode==='late'){
          await f.page.waitForFunction(()=>window.coverReaderEvidence.length===2&&window.coverReaderEvidence.every(record=>record.cancelled));
          assert.equal((await snapshot(f.page)).cards.filter(card=>card.photo).length,0,'Photo beyond the bounded prefix was consumed');
        }else await f.page.waitForFunction(()=>document.querySelectorAll('#casual-rail .rss-card .thumb.has-cover').length===2);
        const value=await snapshot(f.page);noPersonalData(value);
        assert.equal(fixture.requests.length,2);assert(Math.max(...value.prefixEvidence)<=128*1024+3,'Retained parsing prefix exceeded128KiB');
        results.push({engine:engine.name(),scenario:mode,state:value,requests:fixture.requests});await f.context.close();
      }

      const delayed=run(engine.name()+'-cancel-rotation',{delayMs:500,ignoreAbort:true,rotation:true}),d=await start(browser,delayed);
      await waitForRequest(delayed);
      await d.page.evaluate(()=>{window.oldCoverEntries=rssCands.flat();rssCoverAdvance();});
      await d.page.waitForFunction(()=>rssCoverJobs.size===0);
      const cancelled=await snapshot(d.page);noPersonalData(cancelled);
      assert.equal(cancelled.cards.filter(card=>card.photo).length,0,'Late canceled metadata painted a card');
      assert.equal(await d.page.evaluate(()=>oldCoverEntries.some(entry=>entry.photo)),false);
      assert.equal(await d.page.evaluate(()=>oldCoverEntries.some(entry=>rssCoverCached(rssCoverPublicUrl(entry.url)))),false,'Canceled metadata entered the persistent cache');
      delayed.options.delayMs=0;
      await d.page.evaluate(()=>refreshLibrary());
      await d.page.waitForFunction(()=>!rssLoading&&rssCands.every(group=>group[0]?.url.includes('/g1/'))&&
        document.querySelectorAll('#casual-rail .rss-card .thumb.has-cover').length===2);
      const rotated=await snapshot(d.page);noPersonalData(rotated);
      assert(rotated.cards.every(card=>card.url.includes('/g1/')));
      assert(rotated.entryPhotos.filter(entry=>entry.photo).every(entry=>entry.photo.includes('/g1/')),'Old metadata reached a new discovery generation');
      assert.equal(delayed.requests.filter(request=>request.generation==='g1').length,2);
      results.push({engine:engine.name(),scenario:'cancelled-late-completion/rotation',cancelled,rotated,requests:delayed.requests});await d.context.close();

      const scroll=run(engine.name()+'-scroll-cancel',{delayMs:350,ignoreAbort:true}),sc=await start(browser,scroll);
      await waitForRequest(scroll);
      const initialTarget=scroll.requests[0].target;
      await sc.page.evaluate(()=>{const rail=document.getElementById('casual-rail');rail.scrollLeft=rail.scrollWidth;});
      await sc.page.waitForFunction(()=>rssCoverJobs.size===0&&document.querySelector('#casual-rail .rss-card .thumb.has-cover'));
      const scrolled=await snapshot(sc.page);noPersonalData(scrolled);
      assert.equal(scroll.requests.length,2);assert.notEqual(scroll.requests[1].target,initialTarget);
      assert.equal(scrolled.entryPhotos.find(entry=>entry.url===initialTarget).photo,'','Offscreen late completion hydrated its old source');
      assert.equal(await sc.page.evaluate(url=>rssCoverCached(rssCoverPublicUrl(url)),initialTarget),null,'Offscreen cancelled result entered cache');
      results.push({engine:engine.name(),scenario:'scroll-out-cancellation',initialTarget,state:scrolled,requests:scroll.requests});await sc.context.close();

      const coalesced=run(engine.name()+'-coalesced',{delayMs:250}),c=await start(browser,coalesced);
      await waitForRequest(coalesced);
      const shares=await c.page.evaluate(()=>{
        const owner=rssCoverOwners.get(document.getElementById('casual-rail')),original=owner.consumer;
        const second={owner,card:original.card,entry:original.entry,job:null};
        const promise=rssCoverLookup(rssCoverPublicUrl(second.entry.url),second);
        window.secondCover=promise.then(result=>{rssCoverRelease(second);return result;});
        return {samePromise:promise===original.job.promise,url:second.entry.url};
      });
      assert.equal(shares.samePromise,true);
      await c.page.waitForFunction(()=>document.querySelectorAll('#casual-rail .rss-card .thumb.has-cover').length===2);
      assert.equal(coalesced.requests.filter(request=>request.target===shares.url).length,1);
      const coalescedState=await snapshot(c.page);noPersonalData(coalescedState);
      results.push({engine:engine.name(),scenario:'coalesced-current-consumers',shares,state:coalescedState,requests:coalesced.requests});await c.context.close();
    }finally{await browser.close();}
  }
}finally{
  await new Promise(done=>server.close(done));
  writeFileSync(resolve(proof,'results.json'),JSON.stringify({
    sourceSha256:createHash('sha256').update(source).digest('hex'),
    scope:'Immutable current RSS source on the real app; synthetic feeds, images and streamed existing-relay JSON. No live external request.',
    limits:{visibleLookupsPerDiscoveryGeneration:2,retainedPrefixBytes:128*1024,cacheBytes:64000,cacheRecords:100,positiveTtlHours:24,negativeTtlMinutes:30},
    units:'UTF-8 bytes; upstreamHtmlBytes is the complete generated fixture, reader readBytes can exceed retained prefix, serverWrittenBytes is local writer evidence rather than billed bytes.',
    rows:results,
  },null,2));
}
console.log('Visible RSS cover metadata regressions passed:',resolve(proof,'results.json'));
