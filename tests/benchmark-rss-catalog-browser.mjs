/* Controlled synthetic HTTP delays + real application/browser rendering. No
   publisher, Supabase or paid API requests leave the local mocked transport. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {FEEDS} from '../server/rss-quality/feeds.mjs';
import {createCatalogService} from '../server/rss-catalog/service.mjs';
import {catalogHandler} from '../server/rss-catalog/handler.mjs';
import {fetchCatalogPhoto} from '../server/rss-catalog/photos.mjs';
const audit=JSON.parse(readFileSync(new URL('./fixtures/rss-original-cover-metadata.json',import.meta.url)));
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const proof=process.env.BREEZE_CATALOG_PROOF||'/tmp/breeze-catalog-browser-proof';mkdirSync(proof,{recursive:true});
const image=readFileSync(resolve(root,'assets/favicon/icon-512.png'));
const baseline='34b5dc9ba04ffe0f23c61bd89c0163908bd097c6',pr97='b083c324b290dbddfdd8f43e82e95f90a89ba404';
const git=(sha,path)=>execFileSync('git',['show',sha+':'+path],{encoding:'utf8'});
const intentVersion={name:'catalogIntent',source:readFileSync(resolve(root,'scripts/importers/rss.js'),'utf8'),sha:'working-tree',catalog:true};
const versions=process.env.BREEZE_CATALOG_CURRENT_ONLY?[intentVersion]:[{name:'main236',source:git(baseline,'scripts/importers/rss.js'),sha:baseline},
 {name:'PR97',source:git(pr97,'scripts/importers/rss.js'),sha:'d103bb31f075404d5498dfa1a15a1e60def7c81a'},intentVersion];
const title=i=>'The synthetic English story '+i;
const prose='The story follows people who learn to read the world around them. They compare the evidence and explain how different choices affect their lives. This public example provides meaningful English prose for a reading test. ';
const storyUrl=(id,i)=>id===9||id===11||id===12?`https://medium.com/@benchwriter/story-${(i+1).toString(16).padStart(12,'0')}`:`https://stories.example/f${id}/${i}`;
function feedXml(id,owner=false){
 const originals=audit.cases.filter(row=>row.feedSourceUrl===FEEDS[id].url);
 const items=Array.from({length:20},(_,i)=>`<item><title>${title(i)}</title><link>${originals[i]?.url||storyUrl(id,i)}</link><description><![CDATA[<p>${prose}</p>]]></description>${owner?`<content:encoded><![CDATA[${Array.from({length:8},()=>'<p>'+prose+'</p>').join('')}]]></content:encoded>`:''}${id!==0&&!originals[i]?`<enclosure type="image/png" url="https://images.fixture/f${id}/${i}.png"/>`:''}<pubDate>Mon, 05 Oct 2026 01:00:00 GMT</pubDate></item>`).join('');
 const xml='<rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>'+items+'</channel></rss>';
 return xml.replace('</channel>',`<!--${'x'.repeat(Math.max(0,100000-Buffer.byteLength(xml)-7))}--></channel>`);
}
function articleHtml(target){
 const id=Number(new URL(target).pathname.split('/')[1]?.slice(1))||0,i=Number(new URL(target).pathname.split('/').at(-1))||0;
 const html=`<!doctype html><html><head><title>${title(i)}</title><meta property="og:image" content="https://images.fixture/f${id}/${i}.png"></head><body><article><h1>${title(i)}</h1>${Array.from({length:15},()=>'<p>'+prose.repeat(2)+'</p>').join('')}</article></body></html>`;
 return html.replace('</body>',`<!--${'x'.repeat(Math.max(0,200000-Buffer.byteLength(html)-7))}--></body>`);
}
let snapshot=null,revision='',claimed=false,upstream=0,originalLookups=0;
const store={read:async()=>({payload:snapshot,revision,active:true}),claim:async()=>{if(claimed)return false;claimed=true;return true;},
 publish:async(token,payload)=>{snapshot=payload;revision=token;return true;},release:async()=>{claimed=false;}};
const service=createCatalogService({store,enabled:FEEDS.map((_,i)=>i),fetcher:async feed=>{upstream++;return {xml:feedXml(FEEDS.indexOf(feed)),headers:{}};},uuid:()=>String(upstream+1),
 photoFetcher:(entry,feed)=>fetchCatalogPhoto(entry,feed,{fetcher:async(url,options)=>{
  const row=audit.cases.find(row=>row.url===url);assert.ok(row);originalLookups++;
  const bytes=new TextEncoder().encode('<html><head>'+row.meta);const headers={'content-type':'text/html'};
  assert.equal(options.stop(bytes,headers,url),true);return {url,status:200,headers,bytes,complete:false,bodyBytesReceived:bytes.length};
 }})});
const handler=catalogHandler(service);
let current=versions[0];
const server=createServer((req,res)=>{
 try{
  const path=new URL(req.url,'http://local').pathname;
  if(path==='/config.js'){res.setHeader('Content-Type','text/javascript');res.end(`window.BREEZE_CONFIG={SB_URL:'https://relay.fixture',SB_KEY:'synthetic-public-key',RSS_CATALOG:${!!current.catalog}};`);return;}
  if(path==='/scripts/importers/rss.js'){res.setHeader('Content-Type','text/javascript');res.end(current.source);return;}
  const file=resolve(root,'.'+(path==='/'?'/index.html':path));if(!file.startsWith(root+'/'))throw Error('path');
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(readFileSync(file));
 }catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const base=`http://127.0.0.1:${server.address().port}/`;
const profiles=process.env.BREEZE_CATALOG_QUICK?[{name:'normal',rtt:20,bytesPerSecond:1000000}]:[{name:'normal',rtt:20,bytesPerSecond:1000000},{name:'slow',rtt:200,bytesPerSecond:200000}];
const delay=ms=>new Promise(done=>setTimeout(done,ms));
const engine=process.env.BREEZE_QA_ENGINE==='webkit'?webkit:chromium;
const result={units:'UTF-8 response body bytes, uncompressed; independent per-response fixture delays; real browser DOM/rendering. Single trials, not production latency or billing.',engine:engine.name(),baseline,pr97:'d103bb31f075404d5498dfa1a15a1e60def7c81a',pr97Tree:pr97,
 previewSourceHash:createHash('sha256').update(readFileSync(resolve(root,'scripts/library/article-preview.js'))).digest('hex'),
 sourceHashes:Object.fromEntries(versions.map(version=>[version.name,createHash('sha256').update(version.source).digest('hex')])),rows:[],coldCatalog:null,upstreamFixedFeedLookups:0};
const browser=await engine.launch(engine===chromium&&process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{});
async function contextFor(version,profile,storage={}){
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),calls=[],attempts=[],errors=[];
 await context.addInitScript(values=>{
  localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));for(const [key,value] of Object.entries(values))localStorage.setItem(key,value);
  window.benchTimes={firstCard:null};
  addEventListener('DOMContentLoaded',()=>{
   const observer=new MutationObserver(()=>{
    if(window.benchTimes.firstCard!==null)return;
    const card=document.querySelector('#casual-rail .rss-card:not(.rss-pending)');
    if(card?.querySelector('.lede')?.textContent&&card?.querySelector('.src')?.textContent)
      requestAnimationFrame(()=>{if(window.benchTimes.firstCard===null)window.benchTimes.firstCard=performance.now();});
   });observer.observe(document.body,{subtree:true,childList:true,attributes:true});
  });
 },storage);
 await context.route('**/*',async route=>{
  const raw=route.request().url(),url=new URL(raw);if(raw.startsWith(base)||raw.startsWith('blob:'))return route.continue();
  if(url.origin==='https://images.fixture'||audit.cases.some(row=>row.photo===raw))return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'image/png',body:image});
  if(url.origin!=='https://relay.fixture'){attempts.push(raw);return route.abort();}
  let body,status=200,headers={'Access-Control-Allow-Origin':'*'},kind='other',target='';
  if(url.pathname.endsWith('/rss-catalog')){
   const response=await handler(new Request(raw,{headers:route.request().headers()}));status=response.status;body=await response.text();
   headers={...headers,...Object.fromEntries(response.headers.entries())};kind='catalog';
  }else if(url.pathname.endsWith('/article-preview')){body=JSON.stringify({promptVersion:5,summaryKo:'이 글은 사람들이 정보를 비교하며 배워 가는 과정을 소개합니다. 사례를 통해 서로 다른 선택과 그 배경을 살펴봅니다.'});kind='previewMetadata';}
  else if(url.pathname.endsWith('/article')){
   target=url.searchParams.get('url');const id=FEEDS.findIndex(feed=>feed.url===target);
   let html;if(id>=0){kind='feed';html=feedXml(id);}else if(target==='https://medium.com/feed/@benchwriter'){kind='ownerFeed';html=feedXml(9,true);}else{kind='articleBody';html=articleHtml(target);}
   body=JSON.stringify({url:target,html});
  }else return route.abort();
  const bytes=Buffer.byteLength(body||'');calls.push({kind,target,bytes,status});
  await delay(profile.rtt+bytes/profile.bytesPerSecond*1000+(kind==='ownerFeed'?(profile.ownerDelay||0):0));
  return route.fulfill({status,headers,contentType:'application/json',body:body||''});
 });
 return {context,calls,attempts,errors};
}
const metrics=calls=>({requests:calls.length,responseBodyBytes:calls.reduce((sum,x)=>sum+x.bytes,0),kinds:Object.fromEntries(['feed','ownerFeed','articleBody','catalog','previewMetadata'].map(kind=>[kind,calls.filter(x=>x.kind===kind).length]))});
async function home(h){
 const page=await h.context.newPage();page.on('pageerror',error=>h.errors.push(error.message));
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:120000});await page.evaluate(()=>homeReady);
 await page.waitForFunction(()=>!rssLoading&&!document.querySelector('#casual-rail .rss-loading'),null,{timeout:30000});
 await page.waitForFunction(()=>window.benchTimes.firstCard!==null,null,{timeout:10000});
 const time=await page.evaluate(()=>({firstCardMs:benchTimes.firstCard,settledMs:performance.now(),cards:document.querySelectorAll('#casual-rail .rss-card:not(.rss-pending)').length}));
 assert.ok(time.cards>0);return {page,time};
}
async function clicks(h,page){
 const card=page.locator('#casual-rail .rss-card[data-rss-url="https://stories.example/f0/0"]');
 await card.waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('[data-rss-url="https://stories.example/f0/0"]').classList.contains('rss-pending'));
 const arm=()=>card.evaluate(node=>{
  node.addEventListener('click',()=>{
   const timing={clickedAt:performance.now(),shellFirstVisibleFrameMs:null,bodyReadyMs:null};window.previewTiming=timing;
   const ready=()=>{const dialog=document.querySelector('#article-preview');
    if(dialog.open&&dialog.dataset.preparing!=='true'&&!dialog.querySelector('.ap-start').disabled&&timing.bodyReadyMs===null)timing.bodyReadyMs=performance.now()-timing.clickedAt;};
   const observer=new MutationObserver(ready);observer.observe(document.querySelector('#article-preview'),{attributes:true,childList:true,subtree:true});
   requestAnimationFrame(function sample(){const dialog=document.querySelector('#article-preview');
    if(dialog.open&&dialog.querySelector('.ap-title').textContent&&Number(getComputedStyle(dialog).opacity)>0){timing.shellFirstVisibleFrameMs=performance.now()-timing.clickedAt;ready();}
    else requestAnimationFrame(sample);
   });window.previewTimingObserver=observer;
  },{once:true,capture:true});
 });
 const measured=async()=>{await page.waitForFunction(()=>previewTiming.shellFirstVisibleFrameMs!==null&&previewTiming.bodyReadyMs!==null);
  return page.evaluate(()=>{previewTimingObserver.disconnect();return {...previewTiming,metadataReadyMs:performance.now()-previewTiming.clickedAt};});};
 const before=h.calls.length,start=await page.evaluate(()=>performance.now());await arm();await card.click();
 await page.waitForFunction(()=>document.querySelector('#article-preview').open&&document.querySelector('#article-preview').dataset.preparing!=='true'&&!document.querySelector('.ap-start').disabled&&!document.querySelector('.ap-summary').hidden,null,{timeout:15000});
 const coldMs=await page.evaluate(()=>performance.now()),coldTiming=await measured(),storage=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));
 assert.equal(await page.evaluate(()=>books.filter(book=>book.sourceUrl==='https://stories.example/f0/0').length),0,'Preview does not persist a book');
 await page.locator('.ap-close').click();
 const warmBefore=h.calls.length,warmStart=await page.evaluate(()=>performance.now());await arm();await card.click();
 await page.waitForFunction(()=>document.querySelector('#article-preview').open&&document.querySelector('#article-preview').dataset.preparing!=='true'&&!document.querySelector('.ap-start').disabled&&!document.querySelector('.ap-summary').hidden);
 const warmEnd=await page.evaluate(()=>performance.now()),warmTiming=await measured();await page.locator('#article-preview').evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)));
 const readStart=await page.evaluate(()=>performance.now());await page.locator('.ap-start').click();
 await page.waitForFunction(()=>document.querySelector('#v-read').classList.contains('on')&&books.some(book=>book.sourceUrl==='https://stories.example/f0/0'),null,{timeout:15000});
 const readEnd=await page.evaluate(()=>performance.now());
 assert.equal(await page.evaluate(()=>books.filter(book=>book.sourceUrl==='https://stories.example/f0/0').length),1,'Read persists exactly one book');
 return {previewColdMs:coldMs-start,previewWarmMs:warmEnd-warmStart,coldTiming,warmTiming,readMs:readEnd-readStart,coldRequests:metrics(h.calls.slice(before,warmBefore)),warmAndReadRequests:metrics(h.calls.slice(warmBefore)),storage};
}
try{
 // A cold server snapshot has no cards and public GET performs no upstream work.
 current=intentVersion;const response=await handler(new Request('https://relay.fixture/functions/v1/rss-catalog'));
 result.coldCatalog={bytes:Buffer.byteLength(await response.text()),upstreamBeforeWarm:upstream};assert.equal(upstream,0);
 const empty=await contextFor(current,profiles[0]),emptyPage=await empty.context.newPage();
 await emptyPage.goto(base);await emptyPage.evaluate(()=>homeReady);await emptyPage.waitForFunction(()=>!rssLoading);
 assert.equal(await emptyPage.locator('#casual-rail .rss-card').count(),0);
 assert.deepEqual(metrics(empty.calls).kinds,{feed:0,ownerFeed:0,articleBody:0,catalog:1,previewMetadata:0});
 assert.equal(upstream,0,'Cold public client cannot initialize upstream inventory');
 result.coldCatalog.browser=metrics(empty.calls);await empty.context.close();
 await service.refresh();result.upstreamFixedFeedLookups=upstream;assert.equal(upstream,13);
 assert.equal(originalLookups,4);result.serverOriginalPhotoLookups=originalLookups;
 for(const profile of profiles)for(const version of versions){
  current=version;const h=await contextFor(version,profile);const first=await home(h),homeCold=metrics(h.calls),clickCold=await clicks(h,first.page);
  await h.context.close();
  const warm=await contextFor(version,profile,clickCold.storage),second=await home(warm),homeWarm=metrics(warm.calls),clickWarm=await clicks(warm,second.page);
  // Full-body work in catalog mode is owned by a click, never Home loading.
  if(version.catalog){assert.deepEqual(homeCold.kinds,{feed:0,ownerFeed:0,articleBody:0,catalog:1,previewMetadata:0});assert.equal(homeWarm.requests,0);}
  result.rows.push({version:version.name,profile:profile.name,delays:profile,coldHome:{...first.time,...homeCold},warmRelaunchHome:{...second.time,...homeWarm},
   clickAfterColdHome:{...clickCold,storage:undefined},clickAfterWarmHome:{...clickWarm,storage:undefined},directRejectedAttempts:h.attempts.length+warm.attempts.length});
  await warm.context.close();
  const repeat=await contextFor(version,profile);const timings=[];
  for(let i=0;i<6;i++){const loaded=await home(repeat);timings.push(loaded.time);await loaded.page.close();}
  result.rows.at(-1).coldPlusFiveRelaunches={...metrics(repeat.calls),timings};await repeat.context.close();
  console.log(JSON.stringify(result.rows.at(-1)));
 }
 current=intentVersion;
 // Existing local artwork stays readable and clickable in every required size/theme.
 const ui=await contextFor(current,profiles[0]),loaded=await home(ui);result.fallbackUI=[];
 for(const [label,width,height] of [['phone',390,844],['small-phone',320,568],['tablet',834,1112],['desktop',1440,900],['short',1024,600]])for(const theme of ['light','dark']){
  await loaded.page.setViewportSize({width,height});await loaded.page.evaluate(theme=>{document.documentElement.classList.toggle('dark',theme==='dark');document.body.classList.toggle('dark',theme==='dark');},theme);
  const card=loaded.page.locator('#casual-rail .rss-card[data-rss-url="https://stories.example/f0/0"]');
  await card.evaluate(node=>node.scrollIntoView({block:'nearest',inline:'center',behavior:'instant'}));
  await loaded.page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  const box=await card.boundingBox();assert.ok(box.width>100&&box.height>100);
  assert.equal(await card.getAttribute('aria-busy'),null);assert.equal(await card.getAttribute('aria-disabled'),null);
  assert.ok(await card.locator('.thumb svg').count(),'Existing local fallback artwork is present');
  assert.equal(await card.locator('.lede').isVisible(),false,'Fallback has one visible title');assert.ok(await card.locator('.ct').isVisible());
  const screenshot=`fallback-${label}-${theme}.png`;await card.screenshot({path:proof+'/'+screenshot});result.fallbackUI.push({label,width,height,theme,screenshot});
 }
 assert.equal(ui.errors.length,0);await ui.context.close();
 // Catalog-origin photos render directly on Home; no client cover/body lookup.
 const originalsUI=await contextFor(current,profiles[0]),originalsHome=await home(originalsUI);result.originalPhotos=[];
 for(const row of audit.cases){
  // Home chooses one unread entry per feed. Model previously saved audit
  // entries to exercise every already returned photo through normal ranking.
  await originalsHome.page.evaluate(async url=>{
   const group=rssCands.find(entries=>entries.some(entry=>entry.url===url));
   for(const entry of group.slice(0,group.findIndex(entry=>entry.url===url)))
    if(!books.some(book=>book.sourceUrl===entry.url))books.push({id:'audit-'+entry.url,sourceUrl:entry.url});
   await appendRssCards(document.querySelector('#casual-rail'),false);
  },row.url);
  const card=originalsHome.page.locator(`#casual-rail .rss-card[data-rss-url="${row.url}"]`);
  await card.evaluate(node=>node.scrollIntoView({block:'nearest',inline:'center',behavior:'instant'}));
  await card.locator('.thumb img').waitFor();await card.locator('.thumb img').evaluate(img=>img.decode());
  assert.equal(await card.locator('.thumb img').getAttribute('src'),row.photo);
  assert.equal(await card.getAttribute('aria-busy'),null);
  const screenshot='original-'+result.originalPhotos.length+'.png';await card.screenshot({path:proof+'/'+screenshot});
  result.originalPhotos.push({url:row.url,photo:row.photo,source:row.source,screenshot});
 }
 assert.deepEqual(metrics(originalsUI.calls).kinds,{feed:0,ownerFeed:0,articleBody:0,catalog:1,previewMetadata:0});
 assert.equal(originalsUI.attempts.length,0);assert.equal(originalsUI.errors.length,0);assert.equal(originalLookups,4);
 await originalsUI.context.close();
 // A selected Medium owner feed is deferred; closing while it resolves cannot save/reopen.
 const medium=await contextFor(current,{name:'intent',rtt:300,bytesPerSecond:200000,ownerDelay:2000}),mediumHome=await home(medium);
 const mediumCard=mediumHome.page.locator('#casual-rail .rss-card[data-rss-url^="https://medium.com/"]').first();
 const mediumUrl=await mediumCard.getAttribute('data-rss-url'),beforeMedium=medium.calls.length;await mediumCard.click();
 await mediumHome.page.waitForFunction(()=>document.querySelector('#article-preview').open);await mediumHome.page.locator('.ap-close').click();
 await mediumHome.page.waitForFunction(()=>!document.querySelector('#casual-rail .rss-card.busy'),null,{timeout:15000});
 assert.equal(await mediumHome.page.evaluate(()=>document.querySelector('#article-preview').open),false);
 assert.equal(await mediumHome.page.evaluate(()=>books.length),0);
 assert.equal(metrics(medium.calls.slice(beforeMedium)).kinds.ownerFeed,1);
 assert.equal(metrics(medium.calls.slice(beforeMedium)).kinds.articleBody,0,'Canceled owner-feed resolution stops before a fallback page fetch');
 const beforeRetry=medium.calls.length;await mediumCard.click();
 await mediumHome.page.waitForFunction(()=>document.querySelector('#article-preview').open&&document.querySelector('#article-preview').dataset.preparing!=='true'&&!document.querySelector('.ap-start').disabled,null,{timeout:15000});
 assert.equal(metrics(medium.calls.slice(beforeRetry)).kinds.ownerFeed,0,'Selected owner-feed completion is reused in this document');
 assert.equal(metrics(medium.calls.slice(beforeRetry)).kinds.articleBody,0,'Usable selected Medium feed body needs no article HTML fetch');
 assert.equal(await mediumHome.page.evaluate(()=>books.length),0);await mediumHome.page.locator('#article-preview').evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)));
 await mediumHome.page.locator('.ap-start').click();await mediumHome.page.waitForFunction(()=>document.querySelector('#v-read').classList.contains('on')&&books.length===1);
 result.mediumIntent={url:mediumUrl,cancelRequests:metrics(medium.calls.slice(beforeMedium,beforeRetry)),retryAndReadRequests:metrics(medium.calls.slice(beforeRetry)),savedOnlyAfterRead:true};
 assert.equal(medium.errors.length,0);await medium.context.close();
 assert.equal(upstream,13,'Client reads/relaunches never refresh the shared catalog');
 writeFileSync(proof+'/results.json',JSON.stringify(result,null,2));
 console.log('Synthetic three-version benchmark passed:',proof+'/results.json');
}finally{await browser.close();await new Promise(done=>server.close(done));}
