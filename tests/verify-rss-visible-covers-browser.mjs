/* Visible Home cover metadata via the existing relay, with streamed synthetic
   JSON responses. No publisher/server mutation/paid request leaves this test. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {coverDocumentCases} from './fixtures/rss-cover-document-cases.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const proof=process.env.BREEZE_RSS_VISIBLE_COVER_PROOF||'/tmp/breeze-rss-visible-covers';
mkdirSync(proof,{recursive:true});
const photo=readFileSync(resolve(root,'assets/samples/starship-1.jpg'));
const source=readFileSync(resolve(root,'scripts/importers/rss.js'),'utf8');
const originalCases=JSON.parse(readFileSync(resolve(root,'tests/fixtures/rss-original-cover-metadata.json'),'utf8')).cases;
const feeds=[...source.matchAll(/name:'([^']+)', url:'([^']+)', category:'([^']+)'/g)]
  .map(([,name,url,category])=>({name,url,category}));
const prose='The story explains how people learn about the world by reading evidence and comparing ideas. ';
const state={runs:new Map(),active:0,maxActive:0};
let base;
function run(name,options={}){
  const value={name,options,generation:0,requests:[],images:[],blocked:[],writes:[]};
  if(options.holdFeeds)value.feedGate=new Promise(done=>{value.releaseFeeds=done;});
  if(options.holdImages)value.imageGate=new Promise(done=>{value.releaseImages=done;});
  state.runs.set(name,value);return value;
}
const imageUrl=(name,index,generation=0)=>`https://images.fixture/${name}/g${generation}/photo-${index}.jpg`;
const articleUrl=(name,index,generation=0)=>index===0&&state.runs.get(name)?.options.original
  ?state.runs.get(name).options.original.url:`https://stories.fixture/${name}/g${generation}/article-${index}`;
function feedXml(test,index){
  const supplied=test.options.allSupplied||test.options.supplied&&index===0
    ||Array.isArray(test.options.missingPhotos)&&!test.options.missingPhotos.includes(index);
  const generations=test.options.rotation?[0,1]:[test.generation];
  const items=generations.map(generation=>{
    const url=articleUrl(test.name,index,generation);
    return `<item><title>The public story about reading evidence ${index}</title><link>${url}</link><description>${prose}</description>${supplied?`<enclosure type="image/jpeg" url="${imageUrl(test.name,index,generation)}"/>`:''}</item>`;
  }).join('');
  return `<rss><channel>${items}</channel></rss>`;
}
function articleHtml(test,index,generation){
  if(test.options.original&&index===0){
    const record=test.options.original,head='<html><head>';
    return head+'<!--'+'x'.repeat(Math.max(0,record.metaByteOffset-head.length-7))+'-->'+record.meta+'</head><body>'+prose+'</body></html>';
  }
  const url=imageUrl(test.name,index,generation),mode=test.options.mode||'og';
  if(mode==='unsafe-base')return '<html><head><BASE HREF="http://127.0.0.1/"><META PROPERTY="og:image" CONTENT="cover.jpg"></head><body></body></html>';
  // Warm no-image reuse needs a complete received page. The independent late
  // fixture covers an unknown truncated response, which cannot be negative.
  if(mode==='empty'||mode==='shimmer'&&index!==0)return `<html><body><p>${prose}</p></body></html>`;
  const early=mode==='head-relative'?`<meta property="og:image" content="relative-${index}.jpg">`:
    mode==='shimmer'&&index!==0?'':mode==='twitter'?`<meta name="twitter:image" content="${url}">`:
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
    const original=[...state.runs.values()].findLast(test=>test.options.original?.url===target);
    const name=url.pathname.split('/')[1],test=original||state.runs.get(name);
    if(!test||(!original&&url.hostname!=='stories.fixture')||as)return res.writeHead(404).end();
    const index=original?0:Number(url.pathname.split('-').at(-1)),generation=original?0:Number(url.pathname.split('/')[2].slice(1)),html=articleHtml(test,index,generation);
    const bytes=Buffer.from(JSON.stringify({url:target,html}));
    const record={target,index,generation:original?'g0':url.pathname.split('/')[2],upstreamHtmlBytes:Buffer.byteLength(html),
      serializedResponseBytes:bytes.length,serverWrittenBytes:0,closedEarly:false};test.requests.push(record);
    state.active++;state.maxActive=Math.max(state.maxActive,state.active);
    res.writeHead(test.options.mode==='error'?503:200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
    let offset=0,timer;
    const write=()=>{
      if(res.destroyed)return;
      const chunk=bytes.subarray(offset,offset+4096);offset+=chunk.length;record.serverWrittenBytes+=chunk.length;
      res.write(chunk);
      if(offset>=bytes.length)res.end();else timer=setTimeout(write,2);
    };
    res.on('close',()=>{clearTimeout(timer);record.closedEarly=offset<bytes.length;state.active--;});
    if(test.options.holdFirstMetadata&&test.requests.length===1)
      test.releaseFirstMetadata=()=>{timer=setTimeout(write,test.options.delayMs||0);};
    else timer=setTimeout(write,test.options.delayMs||0);
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
async function start(browser,test,{waitForFeeds=true}={}){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.addInitScript(options=>{
    localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));
    if(options.legacyCache)localStorage.setItem('breeze.rss-cover-metadata.v1',JSON.stringify(options.legacyCache));
    window.coverReaderEvidence=[];
    window.coverPrefixEvidence=[];
    window.coverPhotoStarts=[];
    window.coverLookupAdmission=[];
    window.coverRankPaints=[];
    window.coverFeedsReady=false;
    if(options.fastTimeout){
      const schedule=window.setTimeout;
      window.setTimeout=(callback,ms,...args)=>schedule(callback,ms===15000||ms===4000?80:ms,...args);
    }
    if(options.stallDecode)HTMLImageElement.prototype.decode=()=>new Promise(()=>{});
    addEventListener('DOMContentLoaded',()=>{
      // Isolate supplied-photo priority from arrival-order ownership, which has
      // its own held-feed regression below. Keep that case's exact assertions.
      if(options.waitForFeedSettlement){
        const pump=window.rssCoverPump;
        window.rssCoverPump=owner=>window.coverFeedsReady?pump(owner):Promise.resolve();
      }
      if(options.recordCoverAdmission){
        const rankDisplayed=owner=>{
          const context={library:books,positions,sources:rssSources(),now:Date.now()};
          return rssRankRecommendations(rssDisplayGroups(rssCands,owner,context),context)
            .map(group=>group[0]?.url).filter(Boolean);
        };
        const watch=window.rssCoverWatch;
        window.rssCoverWatch=(owner,cards,entries)=>{
          // This runs after DOM insertion and before owner.changed can admit
          // metadata work. Rank the eligible subset, not a filtered global rank.
          if(owner&&!owner.cancelled&&owner.pass===rssCoverPass&&rssCoverRemaining===RSS_COVER_LOOKUPS){
            window.coverRankPaints.push({pass:rssCoverPass,remaining:rssCoverRemaining,
              order:cards.map(card=>card.dataset.rssUrl),ranked:rankDisplayed(owner)});
          }
          return watch(owner,cards,entries);
        };
        const lookup=window.rssCoverLookup;
        window.rssCoverLookup=(url,consumer)=>{
          const order=[...consumer.owner.rail.querySelectorAll('.rss-card')].map(card=>card.dataset.rssUrl);
          const ranked=rankDisplayed(consumer.owner);
          window.coverLookupAdmission.push({url,pass:rssCoverPass,visible:rssCoverVisible(consumer.owner,consumer.card),order,ranked});
          return lookup(url,consumer);
        };
      }
      const originalPhoto=window.rssCardPhoto;
      window.rssCardPhoto=(card,entry)=>{
        window.coverPhotoStarts.push({url:entry.url,photo:entry.photo});
        return originalPhoto(card,entry);
      };
      const originalPrefix=window.rssCoverPayloadPrefix;
      window.rssCoverPayloadPrefix=text=>{
        window.coverPrefixEvidence.push(new TextEncoder().encode(text).length);
        return originalPrefix(text);
      };
    });
    const original=window.fetch;
    window.fetch=async(...args)=>{
      const url=new URL(typeof args[0]==='string'?args[0]:args[0].url,location.href);
      if(options.ignoreAbort&&url.pathname==='/functions/v1/article'&&!url.searchParams.has('as'))args[1]={...args[1],signal:undefined};
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
  },test.options);
  await context.route('**/*',async route=>{
    const raw=route.request().url(),url=new URL(raw);
    if(raw.startsWith(base)||raw.startsWith('blob:'))return route.continue();
    const index=feeds.findIndex(feed=>feed.url===raw);
    if(index>=0){
      if(test.options.holdFeeds?.includes(index))await test.feedGate;
      return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/xml',body:feedXml(test,index)});
    }
    if(url.hostname==='images.fixture'||test.options.original?.photo===raw
      ||test.options.mode==='head-relative'&&url.hostname==='stories.fixture'
        &&url.pathname.startsWith('/'+test.name+'/')&&/\/relative-\d+\.jpg$/.test(url.pathname)){
      test.images.push({url:raw,type:route.request().resourceType()});
      if(test.options.holdImages)await test.imageGate;
      if(test.options.imageDelayMs)await new Promise(done=>setTimeout(done,test.options.imageDelayMs));
      return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'image/jpeg',body:test.options.brokenImage?'invalid image bytes':photo}).catch(()=>{});
    }
    test.blocked.push(raw);return route.abort();
  });
  // Gated images can postpone window load; application readiness does not need it.
  const page=await context.newPage();await page.goto(base,{waitUntil:'domcontentloaded'});await page.evaluate(()=>homeReady);
  if(waitForFeeds)await page.waitForFunction(()=>!rssLoading&&rssCands.length===13&&rssCands.every(group=>group.length));
  if(test.options.waitForFeedSettlement)await page.evaluate(()=>{
    window.coverFeedsReady=true;rssCoverActiveOwners.forEach(owner=>owner.changed());
  });
  return {context,page};
}
async function snapshot(page){
  return page.evaluate(async()=>({
    cards:[...document.querySelectorAll('#casual-rail .rss-card')].map(card=>({url:card.dataset.rssUrl,hidden:card.hidden,
      photo:card.querySelector('.thumb').classList.contains('has-cover'),pending:card.classList.contains('rss-cover-pending'),
      ready:card.tabIndex===0&&!card.hasAttribute('aria-disabled')})),
    entryPhotos:rssCands.flat().map(entry=>({url:entry.url,photo:entry.photo||''})),
    books:books.length,durableBooks:(await bookAll()).length,images:(await imgEntries()).length,
    preparedBodies:rssPreparedArticles.size,readerEvidence:window.coverReaderEvidence,prefixEvidence:window.coverPrefixEvidence,
    photoStarts:window.coverPhotoStarts,
    rssStorage:Object.fromEntries(Object.entries(localStorage).filter(([key])=>/rss/.test(key))),
  }));
}
function noPersonalData(value){assert.equal(value.books,0);assert.equal(value.durableBooks,0);assert.equal(value.images,0);assert.equal(value.preparedBodies,0);}
async function waitForRequest(test,count=1){
  const deadline=Date.now()+15000;
  while(test.requests.length<count){if(Date.now()>deadline)throw Error('Cover metadata request did not start');await new Promise(done=>setTimeout(done,20));}
}
async function settled(page){
  await page.waitForFunction(()=>{
    const owner=rssCoverOwners.get(document.getElementById('casual-rail'));
    // Canceling an owner cancels its RAF; its old numeric handle is not live work.
    return rssCoverJobs.size===0&&(owner?.cancelled||!owner?.frame)&&!owner?.running
      &&!document.querySelector('#casual-rail .rss-cover-pending')
      &&[...document.querySelectorAll('#casual-rail .rss-card')].every(card=>!rssCardCoverWork.has(card));
  });
  return snapshot(page);
}
async function metadataSettled(page){
  // Image work may intentionally remain held while successive metadata generations
  // finish. Feed-refresh completion alone does not establish a negative cache.
  await page.waitForFunction(()=>{
    const owner=rssCoverOwners.get(document.getElementById('casual-rail'));
    return !rssLoading&&rssCoverJobs.size===0&&(owner?.cancelled||!owner?.frame)
      &&!owner?.running&&!owner?.consumer;
  });
  return page.evaluate(()=>({pass:rssCoverPass,remaining:rssCoverRemaining,
    admissions:coverLookupAdmission.map(record=>({url:record.url,pass:record.pass,visible:record.visible})),
    cache:Object.fromEntries(rssCands.flat().map(entry=>[entry.url,rssCoverCached(rssCoverPublicUrl(entry.url))])),
  }));
}
async function coverOwnership(page){
  return page.evaluate(()=>{
    const rail=document.getElementById('casual-rail'),owner=rssCoverOwners.get(rail);
    return {admissions:coverLookupAdmission,pass:rssCoverPass,remaining:rssCoverRemaining,
      loading:!!rssLoading,attempted:[...(owner?.attempted||[])],cancelled:owner?.cancelled,
      scrollLeft:rail.scrollLeft,focused:rail.contains(document.activeElement),busy:!!rail.querySelector('.rss-card.busy'),
      order:[...rail.querySelectorAll('.rss-card')].map(card=>card.dataset.rssUrl),
      visible:[...rail.querySelectorAll('.rss-card')].filter(card=>rssCoverVisible(owner,card))
        .map(card=>({url:card.dataset.rssUrl,photo:card.querySelector('.thumb').classList.contains('has-cover')}))};
  });
}
async function ownershipProof(page,name,evidence){
  writeFileSync(resolve(proof,name+'-ownership.json'),JSON.stringify(evidence,null,2));
  await page.locator('#casual-rail').screenshot({path:resolve(proof,name+'.png')});
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
      assert.equal(first.cards.length,2,'Never-admitted artwork escaped photo-only display');
      assert(first.cards.every(card=>!card.hidden&&!card.pending&&card.ready&&card.photo),'Ready recommendation did not contain a decoded photo');
      assert.equal(first.entryPhotos.length,13,'Display withholding deleted source metadata');
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
      // Cached photos can decode before the queued visible-probe cleanup frame.
      // Require the actual settled rail, rather than treating two decoded images
      // as evidence that every other pending/layout owner has finished.
      const warm=await settled(h.page);noPersonalData(warm);
      writeFileSync(resolve(proof,engine.name()+'-warm-relaunch-state.json'),JSON.stringify({state:warm,requests:cold.requests},null,2));
      assert.equal(cold.requests.length,2,'Warm relaunch repeated known cover enrichment');
      assert.equal(warm.cards.length,2,'Warm relaunch exposed an unadmitted candidate');
      assert.equal(warm.entryPhotos.length,13,'Warm relaunch lost source metadata');
      assert(warm.cards.every(card=>!card.hidden&&!card.pending&&card.ready&&card.photo));
      results.push({engine:engine.name(),scenario:'cold/warm/offscreen/budget',first,warm,secondRail,requests:cold.requests,maxActive:state.maxActive});
      await h.context.close();

      for(const [index,record] of originalCases.entries()){
        const original=run(engine.name()+'-original-'+index,{original:record}),o=await start(browser,original);
        await o.page.waitForFunction(url=>document.querySelector(`.rss-card[data-rss-url="${url}"] .thumb.has-cover`),record.url);
        const value=await settled(o.page);noPersonalData(value);
        assert.equal(value.entryPhotos.find(entry=>entry.url===record.url).photo,record.photo);
        assert.equal(original.requests.filter(request=>request.target===record.url).length,1);
        await o.page.evaluate(()=>refreshLibrary());await settled(o.page);
        assert.equal(original.requests.length,2,'Warm actual-metadata replay repeated the lookup');
        results.push({engine:engine.name(),scenario:'captured-original-'+index,provenance:record,state:value,requests:original.requests});await o.context.close();
      }

      for(const hasPhoto of [false,true]){
        const name=engine.name()+'-v1-'+(hasPhoto?'positive':'negative');
        const legacyCache=Object.fromEntries([0,1].map(index=>[articleUrl(name,index),{at:Date.now(),photo:hasPhoto?imageUrl(name,index):''}]));
        const migrated=run(name,{legacyCache}),m=await start(browser,migrated);
        await m.page.waitForFunction(()=>document.querySelectorAll('#casual-rail .rss-card .thumb.has-cover').length===2);
        const value=await settled(m.page);noPersonalData(value);
        assert.equal(migrated.requests.length,hasPhoto?0:2);
        assert(value.cards.every(card=>!card.pending&&card.ready));
        results.push({engine:engine.name(),scenario:'v1-cache-migration-'+(hasPhoto?'positive':'negative'),state:value,requests:migrated.requests});await m.context.close();
      }

      const documents=run(engine.name()+'-document-cases'),dc=await start(browser,documents);
      await settled(dc.page);
      const documentResults=await dc.page.evaluate(cases=>cases.map(record=>{
        try{return {name:record.name,photo:rssCoverPhoto(record.html,record.url)};}
        catch(error){return {name:record.name,error:error.message};}
      }),coverDocumentCases);
      for(const [index,result] of documentResults.entries()){
        const expected=coverDocumentCases[index];
        if(expected.error)assert.equal(result.error,expected.error,expected.name);
        else assert.equal(result.photo,expected.photo,expected.name);
      }
      results.push({engine:engine.name(),scenario:'case/head/base/entities/malformed',cases:documentResults});await dc.context.close();

      const supplied=run(engine.name()+'-supplied',{supplied:true,waitForFeedSettlement:true}),s=await start(browser,supplied);
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

      for(const [name,holdFeeds,admitted] of [
        ['first-feed-late',[0],2],['second-feed-late',[1],1],
        ['leading-feeds-late',Array.from({length:11},(_,i)=>i),2],
      ]){
        const delayed=run(engine.name()+'-'+name,{supplied:true,holdFeeds,recordCoverAdmission:true});
        const startup=start(browser,delayed);
        try{await waitForRequest(delayed,admitted);}finally{delayed.releaseFeeds();}
        const d=await startup;await settled(d.page);
        const ownership=await coverOwnership(d.page);
        await ownershipProof(d.page,engine.name()+'-'+name,{ownership,requests:delayed.requests});
        assert.equal(ownership.admissions.length,admitted,'Fixture did not hold late feeds through actual cover admission');
        assert(ownership.admissions.every(record=>record.visible),'A lookup started for an offscreen card');
        for(const record of ownership.admissions)assert(ownership.visible.some(card=>card.url===record.url&&card.photo),
          'Late feeds displaced a visible budget-owning cover: '+record.url);
        assert(delayed.requests.length<=2,'Late feeds exceeded the original discovery-generation request budget');
        assert(!delayed.requests.some(request=>request.index===0),'A supplied photo consumed an original-page lookup');
        const value=await snapshot(d.page);noPersonalData(value);
        assert(value.cards.some(card=>card.url===articleUrl(delayed.name,0)&&card.photo),'The supplied photo did not decode');
        const firstOrder=ownership.order,requestsBefore=delayed.requests.length;
        await d.page.evaluate(()=>renderRssCards(document.getElementById('casual-rail'),false,document.getElementById('home-feed-empty')));
        await settled(d.page);
        const warm=await coverOwnership(d.page);
        await ownershipProof(d.page,engine.name()+'-'+name+'-warm',{ownership,warm,requests:delayed.requests});
        assert.equal(warm.pass,ownership.pass,'A warm render started a new discovery generation');
        assert.equal(delayed.requests.length,requestsBefore,'A warm render repeated metadata work');
        assert.deepEqual(warm.order,firstOrder,'A warm render displaced the same generation\'s visible owners');
        await d.page.evaluate(()=>renderRssCards(document.getElementById('casual-rail'),true,document.getElementById('home-feed-empty')));
        const refreshedState=await settled(d.page);
        // Read final order after probe/refill settlement, rather than retaining
        // an earlier DOM snapshot that can still contain an unadmitted probe.
        const refreshed=await d.page.evaluate(()=>{
          const rail=document.getElementById('casual-rail'),owner=rssCoverOwners.get(rail);
          const context={library:books,positions,sources:rssSources(),now:Date.now()};
          return {pass:rssCoverPass,remaining:rssCoverRemaining,
            beforeAdmission:coverRankPaints.filter(record=>record.pass===rssCoverPass),
            admissions:coverLookupAdmission.filter(record=>record.pass===rssCoverPass),
            actual:[...rail.querySelectorAll('.rss-card')].map(card=>card.dataset.rssUrl),
            visible:[...rail.querySelectorAll('.rss-card')].filter(card=>rssCoverVisible(owner,card)).map(card=>card.dataset.rssUrl),
            finalRank:rssRankRecommendations(rssDisplayGroups(rssCands,owner,context),context).map(group=>group[0]?.url).filter(Boolean)};
        });
        await ownershipProof(d.page,engine.name()+'-'+name+'-refresh',{ownership,warm,refreshed,state:refreshedState,requests:delayed.requests});
        assert.equal(refreshed.pass,ownership.pass+1,'Explicit refresh did not start a new discovery generation');
        assert(refreshed.beforeAdmission.length,'Explicit refresh did not record a fresh pre-admission paint');
        for(const paint of refreshed.beforeAdmission){
          assert.equal(paint.remaining,2);
          assert.deepEqual(paint.order,paint.ranked,'Explicit refresh did not rerank display-eligible candidates before admission');
        }
        if(refreshed.admissions.length){
          const first=refreshed.admissions[0],survivingOwners=first.order.filter(url=>refreshed.actual.includes(url));
          assert.deepEqual(refreshed.actual.slice(0,survivingOwners.length),survivingOwners,
            'Refresh refill displaced surviving owners after admission');
          for(const record of refreshed.admissions){
            assert(record.visible,'Refresh admitted an offscreen original');
            if(refreshedState.entryPhotos.some(entry=>entry.url===record.url&&entry.photo))
              assert(refreshed.visible.includes(record.url),'A successfully enriched refresh owner moved offscreen');
          }
        }else assert.deepEqual(refreshed.actual,refreshed.finalRank,'A refresh without admission did not retain eligible ranking');
        assert(refreshedState.cards.every(card=>card.hidden||card.pending||card.photo),'Refresh exposed an artwork-only card');
        assert(delayed.requests.length-requestsBefore<=2,'Explicit refresh exceeded its separate generation budget');
        assert(!delayed.requests.some(request=>request.index===0),'Refresh spent original-page budget on the supplied photo');
        results.push({engine:engine.name(),scenario:'late-feed-visible-ownership-'+name,ownership,state:value,warm,refreshed,requests:delayed.requests});
        await d.context.close();
      }

      // A forced render gets its initial rerank, then the new generation owns
      // any admitted covers even while higher-ranked feeds are still pending.
      const forced=run(engine.name()+'-forced-late-feeds',{
        supplied:true,holdFeeds:[],recordCoverAdmission:true,waitForFeedSettlement:true,
      }),fr=await start(browser,forced);
      await waitForRequest(forced);await settled(fr.page);
      const previous=await coverOwnership(fr.page),forcedRequestsBefore=forced.requests.length;
      forced.generation=1;forced.options.holdFeeds=Array.from({length:11},(_,i)=>i);
      const forcedStart=await fr.page.evaluate(()=>{
        const rail=document.getElementById('casual-rail');
        // Model replacement of the old inventory without clearing its DOM or
        // cover cache: the next forced paint must replace the previous order.
        rssCands=[];coverLookupAdmission=[];
        window.forcedCoverRender=renderRssCards(rail,true,document.getElementById('home-feed-empty'));
        return {pass:rssCoverPass,remaining:rssCoverRemaining};
      });
      let forcedAdmission;
      try{
        await waitForRequest(forced,forcedRequestsBefore+2);
        forcedAdmission=await coverOwnership(fr.page);
      }finally{forced.releaseFeeds();}
      await fr.page.evaluate(()=>forcedCoverRender);await settled(fr.page);
      const forcedFinal=await coverOwnership(fr.page),forcedValue=await snapshot(fr.page);
      await ownershipProof(fr.page,engine.name()+'-forced-late-feeds',{
        previous,forcedStart,forcedAdmission,forcedFinal,state:forcedValue,requests:forced.requests,
      });
      assert.equal(forcedStart.pass,previous.pass+1,'Forced refresh did not advance the discovery generation');
      assert.equal(forcedStart.remaining,2,'Forced refresh did not reset its own two-request budget');
      assert(forcedAdmission.loading,'Fixture released the leading feeds before forced admission');
      assert.deepEqual(forcedAdmission.admissions[0].order,forcedAdmission.admissions[0].ranked,
        'Forced refresh did not apply the available ranking before its first admission');
      assert(forcedAdmission.order.every(url=>url.includes('/g1/')),'Forced refresh retained an old-generation card');
      assert.equal(forcedFinal.pass,forcedStart.pass);
      assert.equal(forcedFinal.admissions.length,2);
      assert(forcedFinal.admissions.every(record=>record.pass===forcedStart.pass&&record.visible));
      for(const record of forcedFinal.admissions)assert(forcedFinal.visible.some(card=>card.url===record.url&&card.photo),
        'Forced late feeds displaced an admitted visible cover: '+record.url);
      assert.deepEqual(forcedFinal.order.slice(0,forcedAdmission.order.length),forcedAdmission.order,
        'Forced late feeds did not append after the admitted owners');
      assert(forced.requests.length-forcedRequestsBefore<=2,'Forced late feeds exceeded their new-generation lookup budget');
      assert(!forced.requests.some(request=>request.index===0),'Forced refresh looked up the supplied-photo original');
      assert(forcedValue.cards.some(card=>card.url===articleUrl(forced.name,0,1)&&card.photo),'Forced supplied photo did not decode');
      noPersonalData(forcedValue);
      results.push({engine:engine.name(),scenario:'forced-generation-late-feed-ownership',previous,forcedStart,
        forcedAdmission,forcedFinal,state:forcedValue,requests:forced.requests});
      await fr.context.close();

      // Closing Preview replaces the canceled cover owner without replenishing
      // the discovery generation. A new render must not rely on the old owner.
      const recreated=run(engine.name()+'-recreated-owner-late-feeds',{
        supplied:true,holdFeeds:Array.from({length:11},(_,i)=>i),recordCoverAdmission:true,
      }),rc=await start(browser,recreated,{waitForFeeds:false});
      let beforeRecreate,previewCycle,recreatedRender,recreatedAdmission;
      try{
        await waitForRequest(recreated,2);await settled(rc.page);
        beforeRecreate=await coverOwnership(rc.page);
        previewCycle=await rc.page.evaluate(async()=>{
          const rail=document.getElementById('casual-rail'),card=rail.querySelector('.rss-card');
          window.coverOwnerBeforePreview=rssCoverOwners.get(rail);
          const originalFetch=fetchArticleHtml;
          // Settle selected intent locally so a lingering .busy card cannot
          // accidentally satisfy the unrelated interaction-preservation guard.
          fetchArticleHtml=async()=>{throw new Error('Synthetic selected-body failure');};
          try{await importRssEntry(rssCardEntries.get(card),card);}finally{fetchArticleHtml=originalFetch;}
          const cycle={open:document.getElementById('article-preview').open,cancelled:coverOwnerBeforePreview.cancelled};
          articlePreviewClose();return cycle;
        });
        await rc.page.waitForFunction(()=>{
          const owner=rssCoverOwners.get(document.getElementById('casual-rail'));
          return owner!==coverOwnerBeforePreview&&!owner.cancelled;
        });
        recreatedRender=await rc.page.evaluate(()=>{
          const rail=document.getElementById('casual-rail');
          document.activeElement?.blur();rail.scrollLeft=0;
          const renderBefore=rssRenderIds.get(rail);
          window.recreatedCoverRender=renderRssCards(rail,false,document.getElementById('home-feed-empty'));
          return {ownerChanged:rssCoverOwners.get(rail)!==coverOwnerBeforePreview,
            renderBefore,renderAfter:rssRenderIds.get(rail)};
        });
        recreatedAdmission=await coverOwnership(rc.page);
      }finally{recreated.releaseFeeds();}
      await rc.page.evaluate(()=>recreatedCoverRender);await settled(rc.page);
      const recreatedFinal=await coverOwnership(rc.page),recreatedValue=await snapshot(rc.page);
      await ownershipProof(rc.page,engine.name()+'-recreated-owner-late-feeds',{
        beforeRecreate,previewCycle,recreatedRender,recreatedAdmission,recreatedFinal,state:recreatedValue,requests:recreated.requests,
      });
      assert(previewCycle.open&&previewCycle.cancelled,'Preview did not cancel the existing cover owner');
      assert(recreatedRender.ownerChanged,'Closing Preview did not recreate the cover owner');
      assert.equal(recreatedRender.renderAfter,recreatedRender.renderBefore+1,'Fixture did not replace the old render closure');
      assert(recreatedAdmission.loading,'Late feeds settled before owner recreation was observed');
      assert.deepEqual(recreatedAdmission.attempted,[],'New owner inherited the old per-owner attempt set');
      assert.equal(recreatedAdmission.pass,beforeRecreate.pass);
      assert.equal(recreatedAdmission.remaining,beforeRecreate.remaining);
      assert.equal(recreatedAdmission.remaining,0,'Fixture did not exhaust its original generation budget');
      assert.equal(recreatedAdmission.scrollLeft,0);assert.equal(recreatedAdmission.focused,false);assert.equal(recreatedAdmission.busy,false);
      assert.equal(recreatedFinal.pass,beforeRecreate.pass,'Owner recreation advanced the discovery generation');
      assert.equal(recreated.requests.length,2,'Owner recreation repeated or expanded cover lookup work');
      assert.equal(recreatedFinal.admissions.length,2);
      assert(recreatedFinal.admissions.every(record=>record.pass===beforeRecreate.pass&&record.visible));
      for(const record of recreatedFinal.admissions)assert(recreatedFinal.visible.some(card=>card.url===record.url&&card.photo),
        'A recreated owner lost its same-generation visible cover: '+record.url);
      assert.deepEqual(recreatedFinal.order.slice(0,beforeRecreate.order.length),beforeRecreate.order,
        'Late feeds displaced the same-generation order after owner recreation');
      assert(!recreated.requests.some(request=>request.index===0),'Owner recreation looked up the supplied-photo original');
      assert(recreatedValue.cards.some(card=>card.url===articleUrl(recreated.name,0)&&card.photo),'Recreated-owner supplied photo did not decode');
      noPersonalData(recreatedValue);
      results.push({engine:engine.name(),scenario:'same-generation-recreated-owner-late-feeds',beforeRecreate,
        previewCycle,recreatedRender,recreatedAdmission,recreatedFinal,state:recreatedValue,requests:recreated.requests});
      await rc.context.close();

      for(const mode of ['twitter','first-image','head-relative','late']){
        const fixture=run(engine.name()+'-'+mode,{mode}),f=await start(browser,fixture);
        if(mode==='late'){
          await f.page.waitForFunction(()=>window.coverReaderEvidence.length===2&&window.coverReaderEvidence.every(record=>record.cancelled));
          assert.equal((await snapshot(f.page)).cards.filter(card=>card.photo).length,0,'Photo beyond the bounded prefix was consumed');
          assert.equal(await f.page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem(RSS_COVER_CACHE_KEY)||'{}')).length),0,'A truncated original became a negative cache entry');
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

      // Photo-only display no longer leaves thirteen artwork cards to provide
      // overflow. Real supplied photos keep this cancellation fixture scrollable;
      // only its first and eventual tail entries need original metadata.
      const scroll=run(engine.name()+'-scroll-cancel',{
        missingPhotos:[0,9],holdFirstMetadata:true,ignoreAbort:true,waitForFeedSettlement:true,
      }),sc=await start(browser,scroll);
      await waitForRequest(scroll);
      await sc.page.waitForFunction(()=>document.querySelectorAll('#casual-rail .rss-card .thumb.has-cover').length===11
        &&!rssStartFrames.has(document.getElementById('casual-rail')));
      const initialTarget=scroll.requests[0].target;
      assert.equal(initialTarget,articleUrl(scroll.name,0));
      let scrollGeometry;
      try{
        scrollGeometry=await sc.page.evaluate(target=>{
          const rail=document.getElementById('casual-rail'),owner=rssCoverOwners.get(rail);
          const card=[...rail.querySelectorAll('.rss-card')].find(card=>card.dataset.rssUrl===target);
          window.scrollFixtureConsumer=owner.consumer;
          const bounds=node=>{const rect=node.getBoundingClientRect();return {left:rect.left,right:rect.right,width:rect.width};};
          const before={scrollLeft:rail.scrollLeft,scrollWidth:rail.scrollWidth,clientWidth:rail.clientWidth,
            visible:rssCoverVisible(owner,card),consumerUrl:owner.consumer?.entry.url,card:bounds(card),rail:bounds(rail)};
          // Keep the requested tail position through photo-only refill. Hiding
          // the first card can clamp max scroll before the replacement is added.
          window.scrollFixtureTail=new MutationObserver(()=>{rail.scrollLeft=rail.scrollWidth;});
          scrollFixtureTail.observe(rail,{childList:true});
          rail.scrollLeft=rail.scrollWidth;
          return {before,after:{scrollLeft:rail.scrollLeft,visible:rssCoverVisible(owner,card),card:bounds(card),rail:bounds(rail)}};
        },initialTarget);
        writeFileSync(resolve(proof,engine.name()+'-scroll-cancel-geometry.json'),JSON.stringify({initialTarget,scrollGeometry,requests:scroll.requests},null,2));
        assert(scrollGeometry.before.scrollWidth>scrollGeometry.before.clientWidth,'Fixture lacks real overflow');
        assert(scrollGeometry.before.visible,'Fixture target was not initially visible');
        assert.equal(scrollGeometry.before.consumerUrl,initialTarget,'Fixture did not capture the admitted metadata owner');
        assert(scrollGeometry.after.scrollLeft>scrollGeometry.before.scrollLeft,'Fixture did not actually scroll');
        assert(scrollGeometry.after.card.right<=scrollGeometry.after.rail.left,'Fixture target did not leave the viewport');
        assert.equal(scrollGeometry.after.visible,false,'Offscreen geometry still qualified for metadata');
        await sc.page.waitForFunction(()=>{
          const consumer=window.scrollFixtureConsumer;
          return consumer?.job.controller.signal.aborted&&!rssCardCoverWork.has(consumer.card)
            &&!consumer.card.classList.contains('rss-cover-pending');
        });
      }finally{scroll.releaseFirstMetadata();}
      await waitForRequest(scroll,2);
      const scrolled=await settled(sc.page);noPersonalData(scrolled);
      await sc.page.evaluate(()=>scrollFixtureTail.disconnect());
      writeFileSync(resolve(proof,engine.name()+'-scroll-cancel-state.json'),JSON.stringify({initialTarget,scrollGeometry,state:scrolled,requests:scroll.requests},null,2));
      assert.equal(scroll.requests.length,2);assert.notEqual(scroll.requests[1].target,initialTarget);
      assert.equal(scroll.requests[1].target,articleUrl(scroll.name,9),'Remaining budget did not follow the newly visible tail candidate');
      assert.equal(scrolled.entryPhotos.find(entry=>entry.url===initialTarget).photo,'','Offscreen late completion hydrated its old source');
      assert.equal(await sc.page.evaluate(url=>rssCoverCached(rssCoverPublicUrl(url)),initialTarget),null,'Offscreen cancelled result entered cache');
      assert(scrolled.cards.some(card=>card.url===articleUrl(scroll.name,9)&&card.photo),'The remaining admitted cover did not decode');
      assert.equal(scrolled.entryPhotos.length,13,'Scrolling deleted retained metadata');
      results.push({engine:engine.name(),scenario:'scroll-out-cancellation',initialTarget,scrollGeometry,state:scrolled,requests:scroll.requests});await sc.context.close();

      const coalesced=run(engine.name()+'-coalesced',{holdFirstMetadata:true}),c=await start(browser,coalesced);
      await waitForRequest(coalesced);
      const shares=await c.page.evaluate(()=>{
        const owner=rssCoverOwners.get(document.getElementById('casual-rail')),original=owner.consumer;
        const second={owner,card:original.card,entry:original.entry,job:null};
        const promise=rssCoverLookup(rssCoverPublicUrl(second.entry.url),second);
        window.secondCover=promise.then(result=>{rssCoverRelease(second);return result;});
        return {samePromise:promise===original.job.promise,url:second.entry.url};
      });
      assert.equal(shares.samePromise,true);coalesced.releaseFirstMetadata();
      await c.page.waitForFunction(()=>document.querySelectorAll('#casual-rail .rss-card .thumb.has-cover').length===2);
      assert.equal(coalesced.requests.filter(request=>request.target===shares.url).length,1);
      const coalescedState=await snapshot(c.page);noPersonalData(coalescedState);
      results.push({engine:engine.name(),scenario:'coalesced-current-consumers',shares,state:coalescedState,requests:coalesced.requests});await c.context.close();

      // Observe the real card throughout metadata lookup, image load, and decode.
      const shimmer=run(engine.name()+'-shimmer',{mode:'shimmer',holdFirstMetadata:true,holdImages:true,recordCoverAdmission:true}),sh=await start(browser,shimmer);
      await waitForRequest(shimmer);
      const lookup=await snapshot(sh.page);
      assert.equal(lookup.cards.filter(card=>card.pending).length,1,'Never-attempted cards shimmered');
      assert(lookup.cards.every(card=>card.ready),'Cover lookup blocked immediate metadata Preview');
      await sh.page.locator('#casual-rail').screenshot({animations:'disabled',path:resolve(proof,engine.name()+'-lookup-pending.png')});
      const geometry=await sh.page.locator('#casual-rail .rss-card').first().boundingBox();
      // Release after observing lookup: CPU scheduling must not move the test
      // into simultaneous image decoding + a legitimately admitted next lookup.
      shimmer.releaseFirstMetadata();
      await sh.page.waitForFunction(()=>rssCands[0][0]?.photo&&document.querySelector('#casual-rail .rss-card').classList.contains('rss-cover-pending'));
      const decoding=await snapshot(sh.page);assert(decoding.cards[0].pending&&!decoding.cards[0].photo);
      await sh.page.evaluate(()=>{
        window.shimmerCard=document.querySelector('#casual-rail .rss-card');
        window.shimmerWork=rssCardCoverWork.get(shimmerCard);
      });
      const metadataStages=[];
      for(let stage=0;stage<3;stage++){
        if(stage)await sh.page.evaluate(()=>refreshLibrary());
        metadataStages.push(await metadataSettled(sh.page));
        writeFileSync(resolve(proof,engine.name()+'-shimmer-metadata-stages.json'),JSON.stringify({metadataStages,requests:shimmer.requests},null,2));
      }
      const retained=await sh.page.evaluate(()=>({
        pending:shimmerCard.classList.contains('rss-cover-pending'),
        sameCard:document.querySelector('#casual-rail .rss-card')===shimmerCard,
        sameWork:rssCardCoverWork.get(shimmerCard)===shimmerWork,
      }));
      writeFileSync(resolve(proof,engine.name()+'-shimmer-held-image.json'),JSON.stringify({retained,state:await snapshot(sh.page),metadataStages,requests:shimmer.requests},null,2));
      assert.deepEqual(retained,{pending:true,sameCard:true,sameWork:true},'Same-URL refresh canceled or restarted the retained image');
      assert(shimmer.requests.length<=6,'Two explicit refresh generations exceeded their two-request budgets');
      assert.equal(shimmer.requests.filter(request=>request.index===0).length,1,'Warm refresh repeated the recovered photo metadata');
      assert.equal(new Set(shimmer.requests.map(request=>request.target)).size,shimmer.requests.length,'Settled confirmed metadata was requested again');
      for(const [stage,evidence] of metadataStages.entries()){
        assert.equal(evidence.pass,metadataStages[0].pass+stage);
        const admissions=evidence.admissions.filter(record=>record.pass===evidence.pass);
        assert.equal(admissions.length,2,'Fixture did not exhaust its bounded metadata generation');
        assert.equal(new Set(admissions.map(record=>record.url)).size,2,'Same-generation metadata retry');
        assert(admissions.every(record=>record.visible),'Metadata was admitted offscreen');
        for(const record of admissions)assert(evidence.cache[record.url],'Generation ended before its metadata outcome was cached');
      }
      shimmer.releaseImages();
      // Exercise the exact changed surface at the repository's required sizes.
      for(const viewport of [{width:390,height:844},{width:820,height:1024},{width:1440,height:900},{width:320,height:568},{width:844,height:390}]){
        await sh.page.setViewportSize(viewport);
        for(const dark of [false,true]){
          const visual=await sh.page.evaluate(dark=>{
            document.body.classList.toggle('dark',dark);
            const card=document.querySelector('#casual-rail .rss-card');
            card.classList.add('rss-cover-pending');
            const before=card.getBoundingClientRect(),skeleton=card.querySelector('.rss-skeleton');
            const style=getComputedStyle(skeleton),animation=getComputedStyle(skeleton,'::after').animationName;
            card.classList.remove('rss-cover-pending');const after=card.getBoundingClientRect();
            return {geometry:[before.width,before.height,after.width,after.height],material:style.backgroundImage,animation};
          },dark);
          assert.equal(visual.geometry[0],visual.geometry[2]);assert.equal(visual.geometry[1],visual.geometry[3]);
          await sh.page.evaluate(()=>document.querySelector('#casual-rail .rss-card').classList.add('rss-cover-pending'));
          await sh.page.locator('#casual-rail').screenshot({animations:'disabled',path:resolve(proof,`${engine.name()}-shimmer-${viewport.width}x${viewport.height}-${dark?'dark':'light'}.png`)});
          await sh.page.evaluate(()=>{const card=document.querySelector('#casual-rail .rss-card');if(!rssCardCoverWork.has(card))card.classList.remove('rss-cover-pending');});
        }
      }
      await sh.page.setViewportSize({width:390,height:844});
      await sh.page.emulateMedia({reducedMotion:'reduce'});
      const reduced=await sh.page.evaluate(()=>{
        const card=document.querySelector('#casual-rail .rss-card');card.classList.add('rss-cover-pending');
        const style=getComputedStyle(card.querySelector('.rss-skeleton'),'::after');
        const animation=style.animationName;card.classList.remove('rss-cover-pending');return animation;
      });
      assert.equal(reduced,'none');
      const decoded=await settled(sh.page);noPersonalData(decoded);
      assert(decoded.cards[0].photo&&decoded.cards.every(card=>card.ready));
      await sh.page.evaluate(()=>window.scrollTo(0,0));
      assert.deepEqual(await sh.page.locator('#casual-rail .rss-card').first().boundingBox(),geometry);
      assert.equal(shimmer.images.filter(image=>image.url===imageUrl(shimmer.name,0)&&image.type==='image').length,1,'Refresh restarted the same image load');
      assert(shimmer.requests.length<=6,'Viewport changes exceeded the two refreshed generation budgets');
      results.push({engine:engine.name(),scenario:'lookup/image-shimmer/refresh/geometry/reduced-motion',lookup,decoding,decoded,reduced,metadataStages,requests:shimmer.requests,images:shimmer.images});await sh.context.close();

      for(const mode of ['empty','error','unsafe-base','timeout','image-failure','image-timeout']){
        const terminal=run(engine.name()+'-'+mode,{mode:['empty','error','unsafe-base'].includes(mode)?mode:'og',
          fastTimeout:mode.includes('timeout'),delayMs:mode==='timeout'?350:0,
          brokenImage:mode==='image-failure',stallDecode:mode==='image-timeout',imageDelayMs:mode==='image-timeout'?350:0}),t=await start(browser,terminal);
        await waitForRequest(terminal,2);const value=await settled(t.page);noPersonalData(value);
        writeFileSync(resolve(proof,engine.name()+'-'+mode+'-terminal-state.json'),JSON.stringify({state:value,requests:terminal.requests,images:terminal.images},null,2));
        assert.equal(value.cards.length,0,mode+' left a ready/pending artwork card: '+JSON.stringify(value.cards));
        assert.equal(value.entryPhotos.length,13,mode+' deleted discovery metadata');
        assert.equal(terminal.requests.length,2);
        if(mode==='unsafe-base'){
          assert.equal(await t.page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem(RSS_COVER_CACHE_KEY)||'{}')).length),0,'Ambiguous base poisoned the negative cache');
          assert(!terminal.blocked.some(url=>url.startsWith('http://127.0.0.1/')),'Public base policy was bypassed');
        }
        if(mode==='empty'){
          const previous=terminal.requests.map(request=>request.target);
          await t.page.evaluate(()=>refreshLibrary());await settled(t.page);
          assert(terminal.requests.length<=4,'New-generation refill exceeded its two-request budget');
          for(const target of previous)assert.equal(terminal.requests.filter(request=>request.target===target).length,1,'Negative cache repeated the same lookup');
        }else if(mode==='error'){
          assert.equal(await t.page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem(RSS_COVER_CACHE_KEY)||'{}')).length),0,'HTTP error poisoned the negative cache');
          await t.page.evaluate(()=>renderHome());await settled(t.page);
          assert.equal(terminal.requests.length,2,'Same-generation error started an automatic retry loop');
          const failedPass=await t.page.evaluate(()=>rssCoverPass);
          terminal.options.mode='og';await t.page.evaluate(()=>refreshLibrary());
          let recoveryError;
          try{
            await t.page.waitForFunction(()=>document.querySelectorAll('#casual-rail .rss-card .thumb.has-cover').length===2);
            await settled(t.page);
          }catch(error){recoveryError=error;}
          const recovered=await snapshot(t.page),recoveredPass=await t.page.evaluate(()=>rssCoverPass);
          writeFileSync(resolve(proof,engine.name()+'-error-recovery-state.json'),JSON.stringify({failedPass,recoveredPass,state:recovered,requests:terminal.requests},null,2));
          if(recoveryError)throw recoveryError;
          noPersonalData(recovered);assert.equal(recoveredPass,failedPass+1);
          assert.equal(recovered.cards.length,2);assert(recovered.cards.every(card=>card.photo&&!card.pending));
          assert.equal(recovered.entryPhotos.length,13,'Recovery deleted retained metadata');
          assert.equal(terminal.requests.length,4,'Explicit new generation failed to recover after a temporary relay error');
        }
        if(mode==='image-failure'||mode==='image-timeout'){
          const failedImages=terminal.images.filter(image=>image.type==='image').map(image=>image.url);
          await t.page.evaluate(()=>show('casuals'));await t.page.evaluate(()=>show('home'));
          await t.page.evaluate(()=>renderHome());await settled(t.page);
          for(const url of new Set(failedImages))assert.equal(terminal.images.filter(image=>image.type==='image'&&image.url===url).length,
            failedImages.filter(image=>image===url).length,'Terminal '+mode+' started an automatic retry loop for '+url);
        }
        results.push({engine:engine.name(),scenario:mode,state:value,requests:terminal.requests,images:terminal.images});await t.context.close();
        console.log(engine.name(),'RSS cover shimmer terminal:',mode);
      }

      for(const phase of ['metadata','image']){
        const navigation=run(engine.name()+'-navigation-'+phase,{ignoreAbort:true,holdFirstMetadata:phase==='metadata',holdImages:phase==='image'}),n=await start(browser,navigation);
        await waitForRequest(navigation);
        if(phase==='image'){
          await n.page.waitForFunction(()=>rssCands[0][0]?.photo&&document.querySelector('#casual-rail .rss-cover-pending'));
          // This case tests image resume with both generation slots already
          // admitted. Otherwise return may legitimately use its remaining slot.
          await waitForRequest(navigation,2);
          assert.equal(navigation.requests.length,2);
          assert.equal(await n.page.evaluate(()=>rssCoverRemaining),0);
        }
        const beforeCancel={imageRequests:navigation.images.filter(image=>image.type==='image'&&image.url===imageUrl(navigation.name,0)).length,
          photoStarts:await n.page.evaluate(url=>coverPhotoStarts.filter(start=>start.url===url).length,articleUrl(navigation.name,0))};
        await n.page.evaluate(()=>show('casuals'));
        if(phase==='metadata')navigation.releaseFirstMetadata();else navigation.releaseImages();
        const cancelled=await settled(n.page);noPersonalData(cancelled);
        assert(cancelled.cards.every(card=>!card.pending&&card.hidden&&!card.ready&&!card.photo),'Navigation left a shimmer/artwork or painted stale '+phase);
        if(phase==='image'){
          const paused=await n.page.evaluate(()=>{
            window.pausedCoverCard=document.querySelector('#casual-rail .rss-card');
            return {started:pausedCoverCard.dataset.photoStarted||'',src:pausedCoverCard.querySelector('.cover').getAttribute('src')};
          });
          assert.equal(paused.started,'','Canceled image retained the started marker and cannot resume');
          assert.equal(paused.src,null);
          const metadataRequests=navigation.requests.length;
          await n.page.evaluate(()=>show('home'));
          await n.page.waitForFunction(()=>document.querySelector('#casual-rail .rss-card .thumb.has-cover'));
          assert.equal(await n.page.evaluate(()=>document.querySelector('#casual-rail .rss-card')===pausedCoverCard),true,'Return replaced a retained same-URL card');
          assert.equal(navigation.requests.length,metadataRequests,'Resuming an image repeated cover metadata lookup');
          for(let refresh=0;refresh<2;refresh++)await n.page.evaluate(()=>refreshLibrary());
          assert.equal(await n.page.evaluate(()=>pausedCoverCard.querySelector('.thumb').classList.contains('has-cover')),true,'Refresh discarded a resumed decoded photo');
          assert.equal(await n.page.evaluate(url=>coverPhotoStarts.filter(start=>start.url===url).length,articleUrl(navigation.name,0)),2,'Canceled image did not resume exactly once');
          assert(navigation.images.filter(image=>image.type==='image'&&image.url===imageUrl(navigation.name,0)).length<=2,'Resume duplicated image requests');
        }
        results.push({engine:engine.name(),scenario:'navigation-cancel-'+phase,beforeCancel,state:cancelled,afterReturn:await snapshot(n.page),requests:navigation.requests,images:navigation.images});await n.context.close();
      }

      for(const trigger of ['document-hidden','preview-close','home-return']){
        const resumed=run(engine.name()+'-resume-'+trigger,{allSupplied:true,mode:'empty',holdImages:true}),r=await start(browser,resumed);
        await r.page.waitForFunction(()=>document.querySelector('#casual-rail .rss-card').classList.contains('rss-cover-pending'));
        await r.page.evaluate(()=>{
          window.pausedCoverCard=document.querySelector('#casual-rail .rss-card');
          window.pausedCoverWork=rssCardCoverWork.get(pausedCoverCard);
          window.pausedCoverOwner=rssCoverOwners.get(document.getElementById('casual-rail'));
          window.resumeStamp=document.getElementById('casual-rail').dataset.rssStamp;
        });
        if(trigger==='document-hidden')await r.page.evaluate(()=>{
          window.qaDocumentHidden=true;
          Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>qaDocumentHidden?'hidden':'visible'});
          document.dispatchEvent(new Event('visibilitychange'));
        });
        else if(trigger==='preview-close')await r.page.evaluate(()=>{
          fetchArticleHtml=()=>new Promise(()=>{});
          void importRssEntry(rssCands[0][0],pausedCoverCard);
        });
        else await r.page.evaluate(()=>show('casuals'));
        await r.page.waitForFunction(()=>!pausedCoverCard.classList.contains('rss-cover-pending'));
        const paused=await r.page.evaluate(()=>({started:pausedCoverCard.dataset.photoStarted||'',src:pausedCoverCard.querySelector('.cover').getAttribute('src')}));
        assert.deepEqual(paused,{started:'',src:null});
        if(trigger==='preview-close'){
          const obsolete=await r.page.evaluate(()=>{
            pausedCoverOwner.changed();
            return {started:pausedCoverCard.dataset.photoStarted||'',pending:pausedCoverCard.classList.contains('rss-cover-pending')};
          });
          assert.deepEqual(obsolete,{started:'',pending:false},'Canceled owner restarted its paused image before Preview returned');
        }
        const metadataBefore=resumed.requests.length;
        resumed.releaseImages();
        if(trigger==='document-hidden')await r.page.evaluate(()=>{qaDocumentHidden=false;document.dispatchEvent(new Event('visibilitychange'));});
        else if(trigger==='preview-close')await r.page.evaluate(()=>articlePreviewClose());
        else await r.page.evaluate(()=>show('home'));
        await r.page.waitForFunction(()=>pausedCoverCard.querySelector('.thumb').classList.contains('has-cover'));
        await r.page.evaluate(()=>pausedCoverWork.promise);
        if(trigger==='home-return')assert.equal(await r.page.evaluate(()=>document.getElementById('casual-rail').dataset.rssStamp===resumeStamp),true,'Return did not cover the unchanged-stamp path');
        const resumedPass=await r.page.evaluate(()=>rssCoverPass);
        await r.page.evaluate(()=>refreshLibrary());await settled(r.page);
        assert.equal(await r.page.evaluate(()=>rssCoverPass),resumedPass+1,'Explicit refresh did not advance its own generation');
        assert.equal(await r.page.evaluate(()=>document.querySelector('#casual-rail .rss-card')===pausedCoverCard),true,'Canceled photo replaced the retained card');
        assert.equal(await r.page.evaluate(()=>!pausedCoverCard.classList.contains('rss-cover-pending')),true);
        assert.equal(resumed.requests.length,metadataBefore,'Resume fetched new cover metadata');
        // Assigning src starts work before a route necessarily receives it.
        // Assert two logical starts; a canceled first transport may never arrive.
        assert.equal(await r.page.evaluate(url=>coverPhotoStarts.filter(start=>start.url===url).length,articleUrl(resumed.name,0)),2,'Resume did not restart the canceled image exactly once');
        assert(resumed.images.filter(image=>image.type==='image'&&image.url===imageUrl(resumed.name,0)).length<=2,'Resume duplicated image requests');
        results.push({engine:engine.name(),scenario:'cancel-resume-'+trigger,paused,state:await snapshot(r.page),requests:resumed.requests,images:resumed.images});
        await r.context.close();
      }

      const preview=run(engine.name()+'-pending-preview',{supplied:true,holdImages:true,waitForFeedSettlement:true}),p=await start(browser,preview);
      await p.page.waitForFunction(()=>document.querySelector('#casual-rail .rss-card').classList.contains('rss-cover-pending'));
      const immediate=await p.page.evaluate(()=>{
        const card=document.querySelector('#casual-rail .rss-card'),entry=rssCands[0][0];
        fetchArticleHtml=()=>new Promise(()=>{});
        void importRssEntry(entry,card);
        const dialog=document.getElementById('article-preview');
        return {open:dialog.open,title:dialog.querySelector('.ap-title').textContent,source:dialog.querySelector('.ap-source').textContent,
          pending:card.classList.contains('rss-cover-pending')};
      });
      assert(immediate.open&&immediate.title&&immediate.source);assert.equal(immediate.pending,false);
      preview.releaseImages();
      results.push({engine:engine.name(),scenario:'immediate-known-metadata-preview-during-image',immediate});await p.context.close();
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
