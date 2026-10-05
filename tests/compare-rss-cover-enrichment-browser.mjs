/* Historical RSS-only comparison on one common app shell. Mocked transports;
   no live publisher, server mutation or paid provider call. Requires Git history. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';

const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const proof=process.env.BREEZE_RSS_ENRICHMENT_PROOF||'/tmp/breeze-rss-enrichment-comparison';
mkdirSync(proof,{recursive:true});
const git=(sha,path)=>execFileSync('git',['show',sha+':'+path],{encoding:'utf8'});
const historicalVersions=[
  {name:'main236',sha:'34b5dc9ba04ffe0f23c61bd89c0163908bd097c6',eager:true},
  {name:'PR97',sha:'d103bb31f075404d5498dfa1a15a1e60def7c81a',eager:true},
  {name:'main238',sha:'7f64075aa1a4b82c74ec7bb829409b99d09e6d81',eager:false},
  {name:'metadata-fixes',sha:'4e24903',eager:false},
];
const currentVersion={name:'selected-intent-fix',sha:'working-tree',eager:false,selectedProjection:true};
const versions=(process.env.BREEZE_RSS_ENRICHMENT_CURRENT_ONLY?[currentVersion]:[...historicalVersions,currentVersion]).map(version=>({...version,
  source:version.sha==='working-tree'?readFileSync(resolve(root,'scripts/importers/rss.js'),'utf8'):git(version.sha,'scripts/importers/rss.js'),
  articleSource:version.sha==='working-tree'?readFileSync(resolve(root,'scripts/importers/article.js'),'utf8'):git(version.sha,'scripts/importers/article.js')}));
const feed='https://www.tmz.com/rss.xml',article='https://stories.fixture/news/the-reading-story';
const imageUrl='https://images.fixture/article-photo.jpg';
const photo=readFileSync(resolve(root,'assets/samples/starship-1.jpg'));
const prose='The story explains how people learn about the world by reading evidence and comparing ideas. ';
const xml=`<rss><channel><item><title>The reading story with a photo only on its article page</title><link>${article}</link><description>${prose}</description></item></channel></rss>`;
const fixtures=[
  {name:'og-photo',html:`<!doctype html><html><head><title>The reading story</title><meta property="og:image" content="${imageUrl}"></head><body><article><h1>The reading story</h1><p>${prose.repeat(18)}</p></article></body></html>`},
  {name:'body-only-photo',html:`<!doctype html><html><head><title>The reading story</title></head><body><article><h1>The reading story</h1><p>${prose.repeat(18)}</p><figure><img src="${imageUrl}" width="640" height="480"></figure><p>${prose.repeat(4)}</p></article></body></html>`},
];
let current=versions[0];
const server=createServer((req,res)=>{
  try{
    const path=new URL(req.url,'http://local').pathname;
    if(path==='/config.js'){res.setHeader('Content-Type','text/javascript');return res.end("window.BREEZE_CONFIG={SB_URL:'https://relay.fixture',SB_KEY:'synthetic-public-key',RSS_CATALOG:false}");}
    if(path==='/scripts/importers/rss.js'){res.setHeader('Content-Type','text/javascript');return res.end(current.source);}
    if(path==='/scripts/importers/article.js'){res.setHeader('Content-Type','text/javascript');return res.end(current.articleSource);}
    const file=resolve(root,'.'+(path==='/'?'/index.html':path));if(!file.startsWith(root+'/'))throw Error();
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');
    res.end(readFileSync(file));
  }catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${server.address().port}/`;
const engine=process.env.BREEZE_QA_ENGINE==='webkit'?webkit:chromium;
const executable=process.env.BREEZE_BROWSER_EXECUTABLE||process.env.CHROMIUM_EXECUTABLE_PATH;
const browser=await engine.launch(engine===chromium&&executable?{executablePath:executable}:{});
const result={engine:engine.name(),fixture:{feed,article,imageUrl,feedSuppliesPhoto:false,articleImageFixtures:fixtures.map(row=>row.name)},
  scope:'Exact historical RSS and article importer scripts on a common current app shell, not separate native builds. All network mocked.',rows:[]};
try{
  for(const version of versions)for(const fixture of fixtures){
    current=version;
    const html=fixture.html;
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),calls=[];
    try{
      await context.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
      await context.route('**/*',async route=>{
        const raw=route.request().url(),url=new URL(raw);
        if(raw.startsWith(base)||raw.startsWith('blob:'))return route.continue();
        if(raw===imageUrl){calls.push({kind:'image',target:raw,bytes:photo.length});return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'image/jpeg',body:photo});}
        if(raw===article){calls.push({kind:'article',target:raw,bytes:Buffer.byteLength(html)});return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'text/html',body:html});}
        if(url.origin==='https://relay.fixture'&&url.pathname==='/functions/v1/article-preview'){
          calls.push({kind:'mock-introduction',target:raw,bytes:0});
          return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify({promptVersion:5,summaryKo:'읽기의 사례를 통해 정보를 비교하는 방법을 살펴봅니다.'})});
        }
        const feedUrls=[...version.source.matchAll(/url:'([^']+)'/g)].map(([,value])=>value);
        if(feedUrls.includes(raw)){
          const body=raw===feed?xml:'<rss><channel></channel></rss>';
          calls.push({kind:'feed',target:raw,bytes:Buffer.byteLength(body)});
          return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/xml',body});
        }
        calls.push({kind:'blocked',target:raw,bytes:0});return route.abort();
      });
      const page=await context.newPage();await page.goto(base);await page.evaluate(()=>homeReady);
      await page.waitForFunction(()=>!rssLoading&&!document.querySelector('#casual-rail .rss-loading'));
      await page.waitForFunction(url=>{
        const card=document.querySelector(`[data-rss-url="${url}"]`);
        return card&&!card.classList.contains('rss-pending');
      },article);
      const inspect=()=>page.evaluate(url=>{
        const card=document.querySelector(`[data-rss-url="${url}"]`),entry=rssCands.flat().find(item=>item.url===url);
        const hero=document.querySelector('#article-preview .ap-hero img');
        return {entryPhoto:entry.photo||'',fallback:entry.coverFallback===true,
          cardPhoto:card.querySelector('.thumb').classList.contains('has-cover'),
          cardImage:card.querySelector('img.cover').getAttribute('src')||'',
          previewOpen:document.getElementById('article-preview').open,
          previewPhoto:!hero.hidden&&hero.naturalWidth>0,previewImage:hero.getAttribute('src')||'',books:books.length,
          preparedBodies:rssPreparedArticles.size};
      },article);
      const before=await inspect(),beforeCalls=calls.length;
      assert.equal(before.cardPhoto,version.eager);assert.equal(before.entryPhoto,version.eager?imageUrl:'');
      assert.equal(calls.filter(call=>call.kind==='article').length,version.eager?1:0);
      assert.equal(before.books,0);
      await page.locator('#casual-rail').screenshot({path:resolve(proof,version.name+'-'+fixture.name+'-home.png')});
      await page.locator(`[data-rss-url="${article}"]`).click();
      await page.waitForFunction(()=>document.getElementById('article-preview').open&&
        document.getElementById('article-preview').dataset.preparing!=='true');
      const previewPhotoExpected=fixture.name==='og-photo'||version.eager||version.selectedProjection===true;
      if(previewPhotoExpected)await page.waitForFunction(()=>{
        const image=document.querySelector('#article-preview .ap-hero img');return !image.hidden&&image.naturalWidth>0;
      });
      if(version.selectedProjection)await page.waitForFunction(url=>document.querySelector(`[data-rss-url="${url}"] .thumb`).classList.contains('has-cover'),article);
      const after=await inspect();
      assert.equal(after.previewPhoto,previewPhotoExpected,'Body image availability in Preview');
      assert.equal(after.cardPhoto,version.eager||version.selectedProjection===true,'Selected-only photo projection to Home');
      assert.equal(after.books,0,'Preview must not save before Read');
      assert.equal(calls.slice(beforeCalls).filter(call=>call.kind==='article').length,version.eager?0:1);
      await page.locator('#article-preview').screenshot({path:resolve(proof,version.name+'-'+fixture.name+'-preview.png')});
      await page.locator('.ap-close').click();assert.equal(await page.evaluate(()=>books.length),0);
      let retained;
      if(version.selectedProjection){
        await page.evaluate(()=>renderRssCards(document.getElementById('casual-rail'),false,document.getElementById('home-feed-empty')));
        retained=await inspect();assert.equal(retained.cardPhoto,true);assert.equal(retained.books,0);
        assert.equal(calls.filter(call=>call.kind==='article').length,1,'Projection/rerender caused another article fetch');
        await page.locator('#casual-rail').screenshot({path:resolve(proof,version.name+'-'+fixture.name+'-home-after-selection.png')});
        assert.equal(await page.evaluate(feed=>JSON.parse(localStorage.getItem(RSS_PUBLIC_CACHE_KEY))[feed].entries[0].photo,feed),'','Selected photo unexpectedly persisted in feed cache');
      }
      const row={name:version.name,fixture:fixture.name,sha:version.sha,sourceSha256:createHash('sha256').update(version.source).digest('hex'),
        articleSourceSha256:createHash('sha256').update(version.articleSource).digest('hex'),
        beforeSelection:before,afterSelection:after,retainedAfterRerender:retained,homeRequests:calls.slice(0,beforeCalls),selectedRequests:calls.slice(beforeCalls)};
      result.rows.push(row);
      console.log(version.name,fixture.name,JSON.stringify({homeArticleRequests:row.homeRequests.filter(call=>call.kind==='article').length,
        homePhoto:before.cardPhoto,selectedArticleRequests:row.selectedRequests.filter(call=>call.kind==='article').length,
        selectedPreviewPhoto:after.previewPhoto,homePhotoAfterSelection:after.cardPhoto}));
    }finally{await context.close();}
  }
  writeFileSync(resolve(proof,'results.json'),JSON.stringify(result,null,2));
  console.log('Historical RSS cover enrichment comparison passed:',resolve(proof,'results.json'));
}finally{await browser.close();await new Promise(done=>server.close(done));}
