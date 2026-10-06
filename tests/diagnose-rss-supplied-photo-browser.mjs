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
const source=readFileSync(resolve(root,process.env.BREEZE_RSS_DIAGNOSTIC_SOURCE||'scripts/importers/rss.js'),'utf8');
console.log('RSS diagnostic source SHA256:',createHash('sha256').update(source).digest('hex'));
const originalCases=JSON.parse(readFileSync(resolve(root,'tests/fixtures/rss-original-cover-metadata.json'),'utf8')).cases;
const feeds=[...source.matchAll(/name:'([^']+)', url:'([^']+)', category:'([^']+)'/g)]
  .map(([,name,url,category])=>({name,url,category}));
const prose='The story explains how people learn about the world by reading evidence and comparing ideas. ';
const state={runs:new Map(),active:0,maxActive:0};
let base;
function run(name,options={}){
  const value={name,options,generation:0,requests:[],images:[],blocked:[],writes:[]};state.runs.set(name,value);return value;
}
const imageUrl=(name,index,generation=0)=>`https://images.fixture/${name}/g${generation}/photo-${index}.jpg`;
const articleUrl=(name,index,generation=0)=>index===0&&state.runs.get(name)?.options.original
  ?state.runs.get(name).options.original.url:`https://stories.fixture/${name}/g${generation}/article-${index}`;
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
async function start(browser,test){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.addInitScript(options=>{
    localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));
    if(options.legacyCache)localStorage.setItem('breeze.rss-cover-metadata.v1',JSON.stringify(options.legacyCache));
    window.coverReaderEvidence=[];
    window.coverPrefixEvidence=[];
    window.coverPhotoStarts=[];window.coverDiagnosticEvents=[];
    if(options.fastTimeout){
      const schedule=window.setTimeout;
      window.setTimeout=(callback,ms,...args)=>schedule(callback,ms===15000||ms===4000?80:ms,...args);
    }
    if(options.stallDecode)HTMLImageElement.prototype.decode=()=>new Promise(()=>{});
    addEventListener('DOMContentLoaded',()=>{
      const originalLookup=window.rssCoverLookup;
      window.rssCoverLookup=async(url,consumer)=>{
        const record={event:'metadata',url,start:Date.now(),remaining:rssCoverRemaining,attempted:[...consumer.owner.attempted],cardIndex:[...consumer.owner.rail.querySelectorAll('.rss-card')].indexOf(consumer.card)};
        coverDiagnosticEvents.push(record);
        const result=await originalLookup(url,consumer);
        Object.assign(record,{end:Date.now(),result,current:rssCoverCurrent(consumer),cancelled:consumer.job?.controller.signal.aborted});
        return result;
      };
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
    if(index>=0){if(test.options.feedDelays?.[index])await new Promise(done=>setTimeout(done,test.options.feedDelays[index]));test.feedEvents??=[];test.feedEvents.push({index,at:Date.now()});return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/xml',body:feedXml(test,index)});}
    if(url.hostname==='images.fixture'||test.options.original?.photo===raw
      ||test.options.mode==='head-relative'&&url.hostname==='stories.fixture'
        &&url.pathname.startsWith('/'+test.name+'/')&&/\/relative-\d+\.jpg$/.test(url.pathname)){
      test.images.push({url:raw,type:route.request().resourceType()});
      if(test.options.imageDelayMs)await new Promise(done=>setTimeout(done,test.options.imageDelayMs));
      return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'image/jpeg',body:test.options.brokenImage?'invalid image bytes':photo}).catch(()=>{});
    }
    test.blocked.push(raw);return route.abort();
  });
  const page=await context.newPage();await page.goto(base);await page.evaluate(()=>homeReady);
  await page.waitForFunction(()=>!rssLoading&&document.querySelectorAll('#casual-rail .rss-card').length===13);
  return {context,page};
}
async function snapshot(page){
  return page.evaluate(async()=>({
    cards:[...document.querySelectorAll('#casual-rail .rss-card')].map(card=>({url:card.dataset.rssUrl,
      photo:card.querySelector('.thumb').classList.contains('has-cover'),pending:card.classList.contains('rss-cover-pending'),
      ready:card.tabIndex===0&&!card.hasAttribute('aria-disabled')})),
    entryPhotos:rssCands.flat().map(entry=>({url:entry.url,photo:entry.photo||''})),
    books:books.length,durableBooks:(await bookAll()).length,images:(await imgEntries()).length,
    preparedBodies:rssPreparedArticles.size,readerEvidence:window.coverReaderEvidence,prefixEvidence:window.coverPrefixEvidence,
    photoStarts:window.coverPhotoStarts,diagnosticEvents:window.coverDiagnosticEvents,
    rssStorage:Object.fromEntries(Object.entries(localStorage).filter(([key])=>/rss/.test(key))),
  }));
}
function noPersonalData(value){assert.equal(value.books,0);assert.equal(value.durableBooks,0);assert.equal(value.images,0);assert.equal(value.preparedBodies,0);}
async function waitForRequest(test,count=1){
  const deadline=Date.now()+15000;
  while(test.requests.length<count){if(Date.now()>deadline)throw Error('Cover metadata request did not start');await new Promise(done=>setTimeout(done,20));}
}
async function settled(page){
  await page.waitForFunction(()=>rssCoverJobs.size===0&&!document.querySelector('#casual-rail .rss-cover-pending')
    &&[...document.querySelectorAll('#casual-rail .rss-card')].every(card=>!rssCardCoverWork.has(card)));
  return snapshot(page);
}

const outcomes=[];
const browser=await chromium.launch(process.env.BREEZE_BROWSER_EXECUTABLE?{executablePath:process.env.BREEZE_BROWSER_EXECUTABLE}:{});
const scenarios=[...Array.from({length:8},(_,i)=>({name:'baseline-'+i})),
 {name:'first-feed-late',feedDelays:[150,...Array(12).fill(0)]},
 {name:'first-feed-late-settled',feedDelays:[150,...Array(12).fill(0)],settleFirst:true},
 {name:'second-feed-late',feedDelays:[0,150,...Array(11).fill(0)]},
 {name:'rest-feeds-late',feedDelays:[0,0,...Array(11).fill(150)]},
 {name:'staggered',feedDelays:Array.from({length:13},(_,i)=>i*15)},
 {name:'reversed',feedDelays:Array.from({length:13},(_,i)=>(12-i)*15)}];
try{
 for(const scenario of scenarios){
   const fixture=run('chromium-'+scenario.name,{supplied:true,...scenario});
   const h=await start(browser,fixture);
   let status='pass',error='';
   if(scenario.settleFirst)await settled(h.page);
   try{
     await h.page.waitForFunction(()=>document.querySelectorAll('#casual-rail .rss-card .thumb.has-cover').length===2);
     assert.equal(fixture.requests.length,1);
     assert.equal(fixture.requests[0].index,1,'Supplied photo was enriched unnecessarily');
   }catch(e){status='fail';error=e.message;}
   const value=await snapshot(h.page);
   const state=await h.page.evaluate(()=>{
     const rail=document.getElementById('casual-rail'),owner=rssCoverOwners.get(rail);
     return {remaining:rssCoverRemaining,pass:rssCoverPass,loading:!!rssLoading,visibility:document.visibilityState,
       rail:{left:rail.scrollLeft,rect:rail.getBoundingClientRect().toJSON()},
       owner:owner&&{remaining:owner.remaining,attempted:[...owner.attempted],cancelled:owner.cancelled,running:owner.running},
       cards:[...rail.querySelectorAll('.rss-card')].map(card=>({url:card.dataset.rssUrl,started:card.dataset.photoStarted,
         visible:owner&&rssCoverVisible(owner,card),rect:card.getBoundingClientRect().toJSON(),
         image:{src:card.querySelector('.cover').src,width:card.querySelector('.cover').naturalWidth,height:card.querySelector('.cover').naturalHeight,complete:card.querySelector('.cover').complete},
         work:!!rssCardCoverWork.get(card)}))};
   });
   const row={sourceSha256:createHash('sha256').update(source).digest('hex'),name:scenario.name,status,error,feedEvents:fixture.feedEvents,requests:fixture.requests,images:fixture.images,state,value};
   outcomes.push(row);writeFileSync(resolve(proof,'diagnostic-results.json'),JSON.stringify(outcomes,null,2));
   console.log(JSON.stringify({name:row.name,status,error,requests:fixture.requests.map(r=>r.index),coverUrls:value.cards.filter(c=>c.photo).map(c=>c.url),remaining:state.remaining}));
   if(status==='fail')await h.page.screenshot({path:resolve(proof,scenario.name+'-failed.png'),fullPage:true});
   await h.context.close();
 }
}finally{await browser.close();await new Promise(done=>server.close(done));}

if(outcomes.some(row=>row.status==='fail'))process.exitCode=1;
