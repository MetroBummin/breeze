/* Real app, image decode and IndexedDB; all external requests are intercepted.
   This checks the shipping hybrid contract, not a full inventory of visible cards. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {FEEDS} from '../server/rss-quality/feeds.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const proof=process.env.BREEZE_HYBRID_PROOF||'/tmp/breeze-catalog-browser-proof/hybrid';
mkdirSync(proof,{recursive:true});
const managed=[7,9,11,12],legacy=[0,1,2,3,4,5,6,8,10];
assert.equal(FEEDS.length,13,'The reviewed hybrid partition needs an explicit inventory update if fixed sources change');
const image=readFileSync(resolve(root,'assets/favicon/icon-512.png'));
const engine=process.env.BREEZE_QA_ENGINE==='webkit'?webkit:chromium;
const marker='HYBRID_SELECTED_BODY_ONLY',excerptMarker='HYBRID_SELECTED_PREVIEW_EVIDENCE';
const prose='The story explains how people learn by reading evidence and comparing ideas. They discuss the world around them and consider how different choices affect their lives. ';
const title=id=>'The public English story about learning '+id;
const story=id=>[9,11,12].includes(id)?`https://medium.com/@hybrid/story-${(id+1).toString(16).padStart(12,'0')}`:`https://stories.fixture/f${id}/story`;
const photo=id=>`https://images.fixture/supplied-f${id}.png`;
function entry(id){return {title:title(id),url:story(id),source:FEEDS[id].name,category:FEEDS[id].category,
  feedUrl:FEEDS[id].url,feedSourceUrl:FEEDS[id].url,author:'Fixture author',publishedAt:'',summary:prose,photo:photo(id),kind:'',readUrl:''};}
function catalog(){return {version:1,feeds:FEEDS.map((_,id)=>({id,at:Date.now()-1000,
  status:managed.includes(id)?'ready':'disabled',entries:managed.includes(id)?[entry(id)]:[]}))};}
function feedXml(id){return `<rss><channel><item><title>${title(id)}</title><link>${story(id)}</link><description><![CDATA[<p>${prose}</p>]]></description><enclosure type="image/png" url="${photo(id)}"/></item></channel></rss>`;}
// The existing introduction cache legitimately keys a bounded source excerpt.
// Put the full-body sentinel beyond that excerpt, and test both boundaries.
function articleHtml(id){return `<!doctype html><html><head><title>${title(id)}</title><meta property="og:image" content="${photo(id)}"></head><body><article><h1>${title(id)}</h1>${Array.from({length:15},(_,i)=>`<p>${i===0?excerptMarker:i>=8?marker:''} ${i}. ${prose.repeat(2)}</p>`).join('')}</article></body></html>`;}
const deferred=()=>{let release;const promise=new Promise(done=>{release=done;});return {promise,release};};
function bounded(promise,label){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),10000);})]).finally(()=>clearTimeout(timer));}
const server=createServer((req,res)=>{
  try{
    const path=new URL(req.url,'http://local').pathname;
    if(path==='/config.js'){
      res.setHeader('Content-Type','text/javascript');
      return res.end("window.BREEZE_CONFIG={SB_URL:'https://relay.fixture',SB_KEY:'synthetic-public-key',RSS_CATALOG:true,RSS_CATALOG_FEED_IDS:[7,9,11,12]};");
    }
    const file=resolve(root,'.'+(path==='/'?'/index.html':path));if(!file.startsWith(root))throw Error('path');
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[extname(file)]||'application/octet-stream');
    res.end(readFileSync(file));
  }catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${server.address().port}/`;
const result={engine:engine.name(),sourceHash:createHash('sha256').update(readFileSync(resolve(root,'scripts/importers/rss.js'))).digest('hex'),
  managed,legacy,serverOriginalProbes:0,phases:[],status:'running'};
let browser;
const sessions=[];
const deadline=setTimeout(()=>{console.error('Hybrid browser contract exceeded 110 seconds');process.exit(1);},110000);deadline.unref();
async function session({storage={},fail=false}={}){
  const context=await browser.newContext({viewport:{width:820,height:1024},serviceWorkers:'block',reducedMotion:'reduce'});
  context.setDefaultTimeout(10000);
  const h={context,fail,catalogGate:deferred(),bodyGate:deferred(),bodyStarted:deferred(),failedImage:deferred(),calls:[],direct:[],images:[],unexpected:[],errors:[]};sessions.push(h);
  await context.addInitScript(values=>{
    localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));
    for(const [key,value] of Object.entries(values))localStorage.setItem(key,value);
  },storage);
  await context.route('**/*',async route=>{
    const raw=route.request().url(),url=new URL(raw);
    if(raw.startsWith(base)||raw.startsWith('blob:'))return route.continue();
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
    if(url.origin==='https://images.fixture'){
      h.images.push(raw);return raw===photo(10)?route.fulfill({status:404,headers,body:''}):route.fulfill({headers,contentType:'image/png',body:image});
    }
    if(url.origin!=='https://relay.fixture'){
      // Exercise the unchanged CORS-failure -> existing relay path safely.
      if(FEEDS.some(feed=>feed.url===raw)||FEEDS.some((_,id)=>story(id)===raw))h.direct.push(raw);
      else h.unexpected.push(raw);
      return route.abort();
    }
    if(url.pathname.endsWith('/rss-catalog')){
      h.calls.push({kind:'catalog'});await h.catalogGate.promise;
      return route.fulfill({status:fail?503:200,headers:{...headers,etag:'hybrid-fixture-v1'},contentType:'application/json',body:JSON.stringify(fail?{error:'unavailable'}:catalog())});
    }
    if(url.pathname.endsWith('/article-preview')){
      h.calls.push({kind:'introduction'});
      return route.fulfill({headers,contentType:'application/json',body:JSON.stringify({promptVersion:5,summaryKo:'이 글은 사람들이 정보를 비교하며 배우는 과정을 소개합니다. 사례를 통해 선택의 배경을 살펴봅니다.'})});
    }
    if(url.pathname.endsWith('/article')){
      const target=url.searchParams.get('url'),feedId=FEEDS.findIndex(feed=>feed.url===target);
      if(url.searchParams.get('as')==='image'&&target===photo(10)){
        h.images.push('relay:'+target);h.failedImage.release();return route.fulfill({status:404,headers,body:''});
      }
      if(feedId>=0){
        h.calls.push({kind:'feed',id:feedId,target});
        return route.fulfill({headers,contentType:'application/json',body:JSON.stringify({url:target,html:feedXml(feedId)})});
      }
      const id=FEEDS.findIndex((_,id)=>story(id)===target);
      if(id>=0&&!url.searchParams.get('as')){
        h.calls.push({kind:'articleBody',id,target});h.bodyStarted.release();await h.bodyGate.promise;
        return route.fulfill({headers,contentType:'application/json',body:JSON.stringify({url:target,html:articleHtml(id)})});
      }
    }
    h.unexpected.push(raw);return route.abort();
  });
  h.page=await context.newPage();h.page.on('pageerror',error=>h.errors.push(error.message));
  await h.page.goto(base,{waitUntil:'domcontentloaded',timeout:20000});
  return h;
}
function ownership(h){
  assert.deepEqual(h.calls.filter(c=>c.kind==='feed').map(c=>c.id).sort((a,b)=>a-b),legacy);
  assert(!h.direct.some(url=>managed.some(id=>FEEDS[id].url===url)),'Managed feed bypassed the catalog through direct transport');
  assert(!h.calls.some(c=>c.kind==='feed'&&managed.includes(c.id)),'Managed feed bypassed the catalog through its legacy relay');
}
async function emptyPersistence(page){
  assert.deepEqual(await page.evaluate(async()=>({books:books.length,stored:(await bookAll()).length,positions:Object.keys(positions).length})),{books:0,stored:0,positions:0});
}
async function readyCards(page){
  await page.waitForFunction(()=>!!document.querySelector('#casual-rail .rss-card:not([hidden]) .thumb.has-cover'));
  const cards=await page.evaluate(()=>[...document.querySelectorAll('#casual-rail .rss-card:not([hidden])')].filter(card=>getComputedStyle(card).visibility!=='hidden').map(card=>({
    url:card.dataset.rssUrl,source:card.querySelector('.src')?.textContent,photo:card.querySelector('.cover')?.getAttribute('src'),
    ready:!!card.querySelector('.thumb.has-cover'),pending:card.classList.contains('rss-cover-pending'),
  })));
  assert(cards.length>0,'At least one supplied photograph should decode');
  for(const card of cards){
    const id=FEEDS.findIndex((_,id)=>story(id)===card.url);assert(id>=0);
    assert.equal(card.source,FEEDS[id].name);assert(card.ready||card.pending,'Photo-only display cannot expose an idle artwork card');
    if(card.ready)assert.equal(card.photo,photo(id),'Displayed photo does not belong to its source/article');
  }
  return cards;
}
try{
  browser=await engine.launch(engine===chromium&&process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{});
  const cold=await session();
  await cold.page.waitForFunction(ids=>ids.every(id=>rssCands[id]?.length===1),legacy);
  assert.deepEqual(await cold.page.evaluate(ids=>({loading:!!rssLoading,managed:ids.map(id=>rssCands[id]?.length||0)}),managed),{loading:true,managed:[0,0,0,0]});
  ownership(cold);assert.equal(cold.calls.filter(c=>c.kind==='catalog').length,1);
  assert.equal(cold.calls.filter(c=>c.kind==='articleBody').length,0);
  const pendingCards=await readyCards(cold.page);await emptyPersistence(cold.page);
  await cold.page.screenshot({path:proof+'/pending-catalog-legacy-ready.png'});
  result.phases.push({name:'catalog-pending',candidateSources:9,visibleCards:pendingCards,calls:[...cold.calls]});
  cold.catalogGate.release();await cold.page.waitForFunction(()=>!rssLoading&&rssCands.length===13&&rssCands.every(group=>group.length===1));
  const inventory=await cold.page.evaluate(()=>rssCands.map(group=>({source:group[0].source,feed:group[0].feedSourceUrl,url:group[0].url,photo:group[0].photo,body:group[0].contentHtml,provided:group[0].bodyProvided})));
  for(const [id,value] of inventory.entries())assert.deepEqual(value,{source:FEEDS[id].name,feed:FEEDS[id].url,url:story(id),photo:photo(id),body:'',provided:false});
  ownership(cold);assert.equal(cold.calls.length,10,'All supplied photos require no original-page probe');
  // One failed supplied image proves candidate retention is independent of
  // photo-only display. Its title/source cannot fall back to a visible artwork.
  await bounded(cold.failedImage.promise,'Failed image did not exercise its bounded relay fallback');
  await cold.page.waitForFunction(url=>[...document.querySelectorAll('#casual-rail .rss-card')].filter(card=>card.dataset.rssUrl===url)
    .every(card=>card.hidden||getComputedStyle(card).visibility==='hidden'),story(10));
  assert.equal(await cold.page.evaluate(()=>rssCands[10].length),1);
  const before=cold.calls.length,pass=await cold.page.evaluate(()=>rssCoverPass);
  await cold.page.evaluate(()=>loadRss(false));assert.equal(cold.calls.length,before);assert.equal(await cold.page.evaluate(()=>rssCoverPass),pass);
  await readyCards(cold.page);await emptyPersistence(cold.page);
  const storage=await cold.page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));
  assert(!JSON.stringify(storage).includes(marker));
  await cold.page.screenshot({path:proof+'/all13-inventory.png'});
  result.phases.push({name:'all13-metadata',failedPhotoCandidateRetained:true,inventory,calls:[...cold.calls]});
  await cold.context.close();

  const error=await session({fail:true});
  await error.page.waitForFunction(ids=>ids.every(id=>rssCands[id]?.length===1),legacy);
  error.catalogGate.release();await error.page.waitForFunction(()=>!rssLoading);
  assert.deepEqual(await error.page.evaluate(ids=>ids.map(id=>rssCands[id].length),managed),[0,0,0,0]);
  ownership(error);await readyCards(error.page);await emptyPersistence(error.page);
  await error.page.evaluate(()=>loadRss(true));
  assert.equal(error.calls.filter(c=>c.kind==='catalog').length,1,'Forced refresh bypassed catalog failure cooldown');
  assert(!error.calls.some(c=>c.kind==='feed'&&managed.includes(c.id)));
  assert.equal(error.calls.filter(c=>c.kind==='articleBody').length,0);
  await error.page.screenshot({path:proof+'/catalog-error-legacy-ready.png'});
  result.phases.push({name:'catalog-error',candidateSources:9,calls:[...error.calls]});
  await error.context.close();

  const warm=await session({storage});warm.catalogGate.release();
  await warm.page.waitForFunction(()=>!rssLoading&&rssCands.length===13&&rssCands.every(group=>group.length===1));
  await readyCards(warm.page);await emptyPersistence(warm.page);
  assert.equal(warm.calls.length,0,'Warm relaunch should reuse both discovery caches');assert.equal(warm.direct.length,0);
  const card=warm.page.locator('#casual-rail .rss-card:not([hidden])[data-rss-url^="https://stories.fixture/"]').first();
  await card.locator('.thumb.has-cover').waitFor({state:'visible'});const selected=await card.getAttribute('data-rss-url');
  await card.click();
  await warm.page.waitForFunction(()=>document.querySelector('#article-preview').open&&document.querySelector('.ap-start').disabled);
  await warm.page.waitForFunction(()=>articlePreviewDialog.dataset.preparing==='true');
  await bounded(warm.bodyStarted.promise,'Selected body request was never issued');
  await emptyPersistence(warm.page);
  // The pending body request must be selected intent; all discovery used photos.
  assert.equal(warm.calls.filter(c=>c.kind==='articleBody').length,1);
  assert.equal(warm.calls.find(c=>c.kind==='articleBody').target,selected);
  warm.bodyGate.release();
  await warm.page.waitForFunction(()=>articlePreviewDialog.open&&articlePreviewDialog.dataset.preparing==='false'&&!document.querySelector('.ap-start').disabled);
  await emptyPersistence(warm.page);
  assert.equal(await warm.page.evaluate(value=>JSON.stringify(articlePreviewBook?.paras).includes(value),marker),true,'Selected body did not reach the transient Preview');
  await warm.page.waitForFunction(()=>articlePreviewDialog.dataset.metadata==='ready');
  await emptyPersistence(warm.page);
  const persistence=await warm.page.evaluate(({marker,excerptMarker,selected})=>{
    const storage=Object.fromEntries(Object.entries(localStorage));
    const key=Object.keys(JSON.parse(storage[ARTICLE_PREVIEW_CACHE]||'{}')).map(key=>JSON.parse(key)).find(parts=>parts[0]===selected);
    return {fullBodyStored:JSON.stringify(storage).includes(marker),
      discoveryEvidenceStored:[RSS_PUBLIC_CACHE_KEY,RSS_CATALOG_CACHE_KEY,RSS_COVER_CACHE_KEY].some(key=>
        (storage[key]||'').includes(marker)||(storage[key]||'').includes(excerptMarker)),
      excerpt:key?.[2]||''};
  },{marker,excerptMarker,selected});
  assert.equal(persistence.fullBodyStored,false,'Preview persisted the full-body sentinel');
  assert.equal(persistence.discoveryEvidenceStored,false,'Selected body evidence leaked into a discovery cache');
  assert(persistence.excerpt.includes(excerptMarker),'The fixture must exercise the existing selected-preview evidence cache');
  assert(persistence.excerpt.length<=544,'Preview evidence exceeds 540 characters plus paragraph separators');
  await warm.page.locator('.ap-start').click();
  await warm.page.waitForFunction(()=>document.querySelector('#v-read').classList.contains('on')&&books.length===1);
  const saved=await warm.page.evaluate(async value=>{const stored=await bookAll();return {memory:books.length,count:stored.length,url:stored[0]?.sourceUrl,body:JSON.stringify(stored[0]?.paras).includes(value)};},marker);
  assert.deepEqual(saved,{memory:1,count:1,url:selected,body:true});
  assert.equal(warm.calls.filter(c=>c.kind==='articleBody').length,1);
  assert.equal(warm.calls.filter(c=>c.kind==='feed'||c.kind==='catalog').length,0);
  await warm.page.screenshot({path:proof+'/selected-only-read.png'});
  result.phases.push({name:'warm-preview-read',zeroWarmDiscoveryRequests:true,selected,saved,calls:[...warm.calls]});
  for(const h of sessions){assert.deepEqual(h.errors,[]);assert.deepEqual(h.unexpected,[]);}
  result.status='passed';console.log('PASS',engine.name(),'hybrid RSS: all13 metadata, independent legacy, photo provenance, warm reuse and selected-only persistence');
}catch(error){result.status='failed';result.error=error.stack;throw error;}
finally{
  for(const h of sessions){h.catalogGate.release();h.bodyGate.release();}
  result.requests=sessions.map(h=>({calls:h.calls,direct:h.direct,images:h.images,unexpected:h.unexpected,errors:h.errors}));
  writeFileSync(proof+'/results.json',JSON.stringify(result,null,2)+'\n');
  await browser?.close();await new Promise(done=>server.close(done));clearTimeout(deadline);
}
