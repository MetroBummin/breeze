/* PR101 vs current RSS request/body comparison. Reuses visible-cover fixtures;
   catalog OFF, no publisher/Jev/service calls. Routing disables HTTP image cache. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const proof=process.env.BREEZE_RSS_SHIMMER_COST_PROOF||'/tmp/breeze-rss-shimmer-cost';
mkdirSync(proof,{recursive:true});
const photo=readFileSync(resolve(root,'assets/samples/starship-1.jpg'));
let source=readFileSync(resolve(root,'scripts/importers/rss.js'),'utf8');
const candidates=[{name:'PR101',sha:'7a5e0c25f2b87791dad6687719e4fb3eb4585c1a',source:execFileSync('git',['show','7a5e0c25:scripts/importers/rss.js'],{encoding:'utf8'})},{name:'PR103',sha:'candidate',source}];
const feeds=[...source.matchAll(/name:'([^']+)', url:'([^']+)', category:'([^']+)'/g)]
  .map(([,name,url,category])=>({name,url,category}));
const prose='The story explains how people learn about the world by reading evidence and comparing ideas. ';
const state={runs:new Map(),active:0,maxActive:0};
let base;
function run(name,options={}){
  const value={name,options,generation:0,requests:[],images:[],feedRequests:[],blocked:[],writes:[]};state.runs.set(name,value);return value;
}
const imageUrl=(name,index,generation=0)=>`https://images.fixture/${name}/g${generation}/photo-${index}.jpg`;
const articleUrl=(name,index,generation=0)=>`https://stories.fixture/${name}/g${generation}/article-${index}`;
function feedXml(test,index){
  const supplied=test.options.allSupplied||test.options.supplied&&index===0;
  const generations=test.options.rotation?[0,1]:[test.generation];
  const items=generations.map(generation=>{
    const url=articleUrl(test.name,index,generation);
    return `<item><title>The public story about reading evidence ${index}</title><link>${url}</link><description>${prose}</description>${supplied?`<enclosure type="image/jpeg" url="${imageUrl(test.name,index,generation)}"/>`:''}</item>`;
  }).join('');
  return `<rss><channel>${items}</channel></rss>`;
}
function articleHtml(test,index,generation){
  const url=imageUrl(test.name,index,generation),mode=test.options.mode||'og';
  if(mode==='empty')return `<html><body><p>${prose}</p></body></html>`;
  const early=mode==='shimmer'&&index!==0?'':mode==='twitter'?`<meta name="twitter:image" content="${url}">`:
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
    res.writeHead(test.options.mode==='error'?503:200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
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
  await context.addInitScript(options=>{
    localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));
    window.coverReaderEvidence=[];
    window.coverPrefixEvidence=[];
    if(options.fastTimeout){
      const schedule=window.setTimeout;
      window.setTimeout=(callback,ms,...args)=>schedule(callback,ms===15000||ms===4000?80:ms,...args);
    }
    if(options.stallDecode)HTMLImageElement.prototype.decode=()=>new Promise(()=>{});
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
    if(index>=0){const body=feedXml(test,index);test.feedRequests.push({url:raw,bytes:Buffer.byteLength(body)});return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/xml',body});}
    if(url.hostname==='images.fixture'){
      test.images.push({url:raw,type:route.request().resourceType(),bytes:photo.length});
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

const engine=process.env.BREEZE_QA_ENGINE==='webkit'?webkit:chromium;
const executable=process.env.BREEZE_BROWSER_EXECUTABLE||process.env.CHROMIUM_EXECUTABLE_PATH;
const browser=await engine.launch(engine===chromium&&executable?{executablePath:executable}:{}),rows=[];
try{
 for(const candidate of candidates)for(const allSupplied of [false,true]){
  source=candidate.source;
  const test=run(candidate.name+(allSupplied?'-feed-photos':'-missing-photos'),{allSupplied});
  const h=await start(browser,test),stages=[];
  const counts=()=>({feeds:test.feedRequests.length,metadata:test.requests.length,images:test.images.length,
    responseBodyBytes:test.feedRequests.reduce((s,x)=>s+x.bytes,0)+test.requests.reduce((s,x)=>s+x.serializedResponseBytes,0)+test.images.reduce((s,x)=>s+x.bytes,0),
    generatedUpstreamHtmlBytes:test.requests.reduce((s,x)=>s+x.upstreamHtmlBytes,0)});
  let previous={feeds:0,metadata:0,images:0,responseBodyBytes:0,generatedUpstreamHtmlBytes:0};
  async function stage(name){
   await h.page.waitForFunction(photos=>!rssLoading&&rssCoverJobs.size===0&&document.querySelectorAll('#casual-rail .thumb.has-cover').length===photos,allSupplied?13:2);
   await h.page.waitForTimeout(2000);await h.page.waitForFunction(()=>homeCropJobs.size===0);
   const cumulative=counts(),delta=Object.fromEntries(Object.keys(cumulative).map(k=>[k,cumulative[k]-previous[k]]));previous=cumulative;
   const state=await snapshot(h.page);noPersonalData(state);
   stages.push({name,delta,cumulative,actualReaderReadBytes:state.readerEvidence.reduce((s,x)=>s+x.readBytes,0),photos:state.cards.filter(x=>x.photo).length});
  }
  await stage('cold Home');
  for(let n=0;n<3;n++){await h.page.evaluate(()=>renderHome());await stage('same-document Home '+(n+1));}
  for(let n=0;n<2;n++){await h.page.evaluate(()=>refreshLibrary());await stage('warm refresh '+(n+1));}
  await h.page.reload();await h.page.evaluate(()=>homeReady);await stage('warm reload');
  assert.equal(stages[0].delta.feeds,13);assert.equal(stages[0].delta.metadata,allSupplied?0:2);
  for(const s of stages.slice(1,-1))assert.deepEqual(s.delta,{feeds:0,metadata:0,images:0,responseBodyBytes:0,generatedUpstreamHtmlBytes:0},s.name);
  const reload=stages.at(-1).delta;assert.equal(reload.feeds,0);assert.equal(reload.metadata,0);assert.equal(reload.generatedUpstreamHtmlBytes,0);assert.equal(reload.images,allSupplied?13:2);
  stages[0].actualClientReadBodyBytes=stages[0].delta.responseBodyBytes-test.requests.reduce((sum,request)=>sum+request.serializedResponseBytes,0)+stages[0].actualReaderReadBytes;
  rows.push({version:candidate.name,sha:candidate.sha,sourceSha256:createHash('sha256').update(source).digest('hex'),profile:allSupplied?'all feed photos supplied':'both visible feed photos missing',stages,requests:test.requests,images:test.images});
  console.log(candidate.name,allSupplied?'feed-photos':'missing-photos',JSON.stringify(stages.map(s=>({name:s.name,...s.delta}))));
  await h.context.close();
 }
 for(const profile of ['all feed photos supplied','both visible feed photos missing']){
  const pair=rows.filter(x=>x.profile===profile);assert.equal(pair.length,2);
  assert.deepEqual(pair[0].stages.map(x=>x.delta),pair[1].stages.map(x=>x.delta),'Shimmer added requests/fixture response bytes');
 }
 writeFileSync(resolve(proof,'results.json'),JSON.stringify({catalogEnabled:false,engine:engine.name(),scope:'PR101 and final PR103 RSS scripts on a common app shell; fixed synthetic feeds/images/streamed relay. No publisher, Jev or live service calls.',units:'Request counts and UTF-8 mock response body sizes. Serialized metadata is the full fixture response, not delivered/billed bytes. Generated upstream HTML is fixture input, not a live upstream read. Actual reader bytes recorded separately; headers, redirects, TLS, CDN and pricing excluded.',rows},null,2));
}finally{await browser.close();await new Promise(done=>server.close(done));}
