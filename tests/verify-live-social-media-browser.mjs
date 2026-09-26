/* Opt-in live smoke; run directly or through the live-media workflow.
   The only override is BREEZE_LIVE_SOCIAL_URL. No fixture bodies/images, request
   deadline overrides, credentials in logs, or physical-iOS performance claims. */
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const target=new URL(process.env.BREEZE_LIVE_SOCIAL_URL||'https://x.com/dsqjaffa/status/2102054148925526206?s=46');
assert.equal(target.protocol,'https:');assert.ok(['x.com','www.x.com','twitter.com','www.twitter.com'].includes(target.hostname));
const sourceId=target.pathname.match(/\/status\/(\d+)(?:\/|$)/)?.[1];assert.ok(sourceId,'A public X status URL is required');
const configured=readFileSync(resolve(root,'config.js'),'utf8').match(/SB_URL\s*:\s*['"]([^'"]+)['"]/)?.[1];
assert.ok(configured,'The committed app config needs a production relay URL');
const relay=new URL('/functions/v1/article',configured);assert.equal(relay.protocol,'https:');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml',
  '.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json'};
const server=createServer((req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);
    const relative=pathname==='/'?'index.html':pathname.slice(1),path=resolve(root,relative);
    if(!path.startsWith(resolve(root)+sep)||relative.split('/').some(part=>part.startsWith('.')||part==='node_modules')){
      res.writeHead(403).end();return;
    }
    res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));
  }catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${server.address().port}/`,offlineKey='breeze.live-media-offline';
function remoteKind(raw){
  let url;try{url=new URL(raw);}catch{return '';}
  if(url.protocol!=='https:')return '';
  if(url.hostname==='pbs.twimg.com')return 'media';
  if(url.origin!==relay.origin||url.pathname!==relay.pathname)return '';
  let source;try{source=new URL(url.searchParams.get('url'));}catch{return '';}
  if(url.searchParams.get('as')==='image')return source.protocol==='https:'&&source.hostname==='pbs.twimg.com'?'media-relay':'';
  return ['x.com','www.x.com','twitter.com','www.twitter.com'].includes(source.hostname)
    && source.pathname.match(/\/status\/(\d+)(?:\/|$)/)?.[1]===sourceId?'article-relay':'';
}
async function within(label,job,ms=30000){
  let timer;
  try{return await Promise.race([job,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' deadline exceeded')),ms);})]);}
  finally{clearTimeout(timer);}
}
async function installChecks(page){
  await page.evaluate(()=>{
    window.liveMediaQA={};
    liveMediaQA.hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
    liveMediaQA.textHash=text=>liveMediaQA.hash(new TextEncoder().encode(text));
    liveMediaQA.inspect=async(book,offline=false)=>{
      window.liveMediaImageProbe=null;
      const keys=book.paras.filter(text=>text.startsWith(IMG_MARK)).map(text=>text.slice(IMG_MARK.length));
      if(keys.length!==8||new Set(keys).size!==8)throw Error('Expected eight distinct saved source images');
      const images=[];
      for(const key of keys){
        const raw=await localRead('imgs',key);if(!raw)throw Error('Missing persisted image record');
        const blob=offline?await bookImageBlob(book,key):await imgGet(key);
        if(!(blob instanceof Blob)||!blob.size||!blob.type.startsWith('image/'))throw Error('Invalid stored image Blob');
        const bytes=await blob.arrayBuffer(),url=URL.createObjectURL(blob),image=new Image();let timer;
        const probe=window.liveMediaImageProbe={key,offline,bytes:bytes.byteLength,type:blob.type,
          storage:raw instanceof Blob?'Blob':raw.imageBytes instanceof ArrayBuffer?'ArrayBuffer':'unknown',
          protocol:new URL(url).protocol,event:'pending',complete:false,width:0,height:0};
        const note=event=>Object.assign(probe,{event,complete:image.complete,width:image.naturalWidth,height:image.naturalHeight});
        try{
          await new Promise((done,reject)=>{
            timer=setTimeout(()=>{note('timeout');reject(Error('Stored image decode deadline exceeded'));},10000);
            image.onload=()=>{note('load');done();};image.onerror=()=>{note('error');reject(Error('Stored image did not decode'));};image.src=url;
          });
          if(!image.naturalWidth||!image.naturalHeight)throw Error('Stored image decoded without pixels');
          images.push({key,bytes:bytes.byteLength,sha256:await liveMediaQA.hash(bytes),
            width:image.naturalWidth,height:image.naturalHeight,type:blob.type,
            storage:raw instanceof Blob?'Blob':raw.imageBytes instanceof ArrayBuffer?'ArrayBuffer':'unknown'});
        }finally{clearTimeout(timer);URL.revokeObjectURL(url);}
      }
      const prose=book.paras.filter(text=>!text.startsWith(IMG_MARK));
      return {id:book.id,paragraphs:book.paras.length,bodyChars:prose.join('\n').length,
        bodySha256:await liveMediaQA.textHash(JSON.stringify(book.paras)),
        tailSha256:await liveMediaQA.textHash(prose.slice(-3).join('\n')),images};
    };
  });
}
async function openAndCheck(page,id){
  await within('Open saved Reader',page.evaluate(async id=>{
    const book=books.find(item=>item.id===id);if(!book)throw Error('Saved book is missing after reload');
    await openBook(book);
  },id));
  await page.waitForFunction(id=>{
    const images=[...document.querySelectorAll('#rtext figure img')];
    return curBook?.id===id&&images.length===8&&images.every(image=>image.src.startsWith('blob:')&&image.complete&&image.naturalWidth>0&&image.naturalHeight>0);
  },id,{timeout:20000});
  assert.equal(await page.evaluate(()=>{
    const index=curBook.paras.findLastIndex(text=>!text.startsWith(IMG_MARK));
    const node=document.querySelector('#rtext [data-pi="'+index+'"]');
    return node?.textContent.replace(/\s+/g,' ').trim()===curBook.paras[index].replace(/\s+/g,' ').trim();
  }),true,'Reader did not retain the final body paragraph');
}

const reports=[];
try{
  for(const engine of [chromium,webkit]){
    const profile=mkdtempSync(join(tmpdir(),'breeze-live-social-'));let context,page,stage='launch',externalEnabled=true,offlineMediaRequests=0;
    let httpIsolated=false,blockedHttpRequests=0;
    const offlineMode=engine.name()==='webkit'?'http-blocked':'browser-offline';
    const denialProbes=[new URL('__breeze-offline-probe__',base).href,relay.href+'?breeze-offline-probe=1'];
    const blockedProbes=new Set(),httpStatus=new WeakMap(),httpSuccessAfterIsolation=new Set();
    const network=[],tracked=new Map();
    try{
      context=await engine.launchPersistentContext(profile,{headless:true,serviceWorkers:'block',viewport:{width:820,height:1024}});
      page=await context.newPage();page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(30000);
      await page.addInitScript(({offlineKey,relayOrigin})=>{
        localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));
        window.liveMediaFetchAttempts=0;
        const original=window.fetch;
        window.fetch=function(input,...rest){
          try{
            const url=new URL(typeof input==='string'?input:input.url,location.href);
            const media=url.protocol==='https:'&&(url.hostname==='pbs.twimg.com'||url.origin===relayOrigin&&url.pathname==='/functions/v1/article'&&url.searchParams.get('as')==='image');
            if(localStorage.getItem(offlineKey)==='1'&&media)window.liveMediaFetchAttempts++;
          }catch{}
          return original.call(this,input,...rest);
        };
      },{offlineKey,relayOrigin:relay.origin});
      page.on('request',request=>{
        const kind=remoteKind(request.url());if(!kind)return;
        if(!externalEnabled&&kind.startsWith('media'))offlineMediaRequests++;
        const row={host:new URL(request.url()).hostname,kind,status:'pending',durationMs:0},start=Date.now();
        network.push(row);tracked.set(request,{row,start});
      });
      page.on('response',response=>{
        const request=response.request(),status=response.status();httpStatus.set(request,status);
        if(httpIsolated&&/^https?:/.test(request.url())&&status>=200&&status<400)httpSuccessAfterIsolation.add(request);
        const item=tracked.get(request);if(item){item.row.status=status;item.row.durationMs=Date.now()-item.start;}
      });
      page.on('requestfailed',request=>{const item=tracked.get(request);if(item){item.row.status='failed';item.row.durationMs=Date.now()-item.start;}});
      page.on('requestfinished',request=>{
        const status=httpStatus.get(request);
        if(httpIsolated&&/^https?:/.test(request.url())&&status>=200&&status<400)httpSuccessAfterIsolation.add(request);
        const item=tracked.get(request);if(item)item.row.durationMs=Date.now()-item.start;
      });
      await page.route('**/*',route=>{
        const raw=route.request().url();
        if(raw.startsWith('blob:')||raw.startsWith('data:'))return route.continue();
        if(httpIsolated&&/^https?:/.test(raw)){
          blockedHttpRequests++;if(denialProbes.includes(raw))blockedProbes.add(raw);
          return route.abort('internetdisconnected');
        }
        if(raw.startsWith(base))return route.continue();
        return externalEnabled&&remoteKind(raw)?route.continue():route.abort();
      });
      stage='boot';await page.goto(base,{waitUntil:'load'});
      await within('App boot',page.evaluate(async()=>{await homeReady;if(rssLoading)await rssLoading;}));
      assert.equal(await page.evaluate(()=>SB_URL.replace(/\/$/,'')+'/functions/v1/article'),relay.href,'App relay differs from committed config');
      await installChecks(page);
      stage='live import';const onlineStart=Date.now();
      const online=await within('Live social import',page.evaluate(async({url,sourceId})=>{
        const original=loadSocialArticle;let source;
        // Observe the live loader; never provide or replay HTML/parsed content.
        loadSocialArticle=async(...args)=>{
          const parsed=await original(...args),images=parsed.blocks.filter(block=>block.r==='img');
          source={id:parsed.social?.id,scope:parsed.social?.scope,extraction:parsed.social?.extraction,
            images:images.length,keys:images.map(block=>articleImageKey(block.t)),
            bodySha256:await liveMediaQA.textHash(JSON.stringify(parsed.paras))};
          return parsed;
        };
        try{
          const book=await ingestArticle(url,{present:false});
          if(!source||source.id!==sourceId||source.scope!=='article'||source.images!==8)throw Error('Live source did not return the expected complete Article and eight images');
          const stored=(await bookAll()).filter(item=>item.id===book.id);
          if(stored.length!==1)throw Error('Live import did not persist exactly one book');
          const result=await liveMediaQA.inspect(stored[0]);
          if(result.bodySha256!==source.bodySha256)throw Error('Saved body differs from complete live source');
          if(JSON.stringify(result.images.map(image=>image.key))!==JSON.stringify(source.keys))throw Error('Saved images differ from live source order');
          return {...result,sourceScope:source.scope,extraction:source.extraction};
        }finally{loadSocialArticle=original;}
      },{url:target.href,sourceId}),60000);
      assert.ok(online.bodyChars>500,'Live source is not a full Article');
      assert.equal(online.images.length,8);assert.ok(online.images.every(image=>image.storage!=='unknown'));
      await openAndCheck(page,online.id);const onlineMs=Date.now()-onlineStart;
      console.log(JSON.stringify({result:'ONLINE_PASS',engine:engine.name(),bookId:online.id,imageCount:online.images.length,
        bodySha256:online.bodySha256,tailSha256:online.tailSha256,onlineMs}));

      // Load the real shell with external transport already denied, then deny
      // every HTTP(S) request, including localhost. Routing disables HTTP cache.
      stage='reload and offline';externalEnabled=false;const offlineStart=Date.now();
      await page.evaluate(key=>localStorage.setItem(key,'1'),offlineKey);
      await page.reload({waitUntil:'load'});
      await within('Reload persisted library',page.evaluate(async()=>{await homeReady;if(rssLoading)await rssLoading;}));
      await page.waitForLoadState('networkidle');await installChecks(page);httpIsolated=true;
      stage='HTTP isolation probes';
      const denied=await within('HTTP isolation probes',page.evaluate(async urls=>Promise.all(urls.map(async url=>{
        try{await fetch(url,{cache:'no-store'});return false;}catch{return true;}
      })),denialProbes),5000);
      assert.deepEqual(denied,[true,true],'Local or external HTTP probe escaped isolation');
      assert.equal(blockedProbes.size,2,'Both HTTP probes must reach the deny-all route');
      // Playwright 1.63 WebKit's offline switch also rejects local Blob reads and
      // Blob URLs. Deny all HTTP instead; keep native IDB records and navigator
      // untouched. Chromium additionally uses the browser's offline switch.
      if(offlineMode==='browser-offline'){
        await context.setOffline(true);assert.equal(await page.evaluate(()=>navigator.onLine),false);
      }
      stage='offline stored image decode';
      const offline=await within('Offline stored image verification',page.evaluate(async id=>{
        const stored=(await bookAll()).filter(book=>book.id===id);if(stored.length!==1)throw Error('Persisted book identity changed');
        return liveMediaQA.inspect(stored[0],true);
      },online.id),30000);
      assert.equal(offline.id,online.id);assert.equal(offline.bodySha256,online.bodySha256);
      assert.equal(offline.tailSha256,online.tailSha256);assert.equal(offline.paragraphs,online.paragraphs);
      assert.deepEqual(offline.images,online.images,'Offline image bytes or decoded dimensions changed');
      stage='offline Reader';await openAndCheck(page,online.id);
      assert.equal(offlineMediaRequests,0,'Reader attempted external media requests after reload');
      assert.equal(await page.evaluate(()=>window.liveMediaFetchAttempts),0,'Application attempted to fetch offline media');
      assert.equal(httpSuccessAfterIsolation.size,0,'An HTTP request succeeded after network isolation');
      reports.push({engine:engine.name(),sourceId,bookId:online.id,extraction:online.extraction,paragraphs:online.paragraphs,
        bodyChars:online.bodyChars,bodySha256:online.bodySha256,tailSha256:online.tailSha256,
        imageCount:online.images.length,images:online.images,onlineMs,offlineMs:Date.now()-offlineStart,
        offlineMode,blockedHttpRequests,blockedHttpProbes:blockedProbes.size,offlineHttpSuccesses:0,
        offlineMediaRequests:0,offlineApplicationMediaFetches:0});
      console.log(JSON.stringify({result:'PASS',...reports.at(-1)}));
    }catch(error){
      // Only bounded metadata is reported: no source body, full URLs or headers.
      const state=page?await within('Failure metadata',page.evaluate(()=>({
        online:navigator.onLine,bookIds:typeof books==='undefined'?[]:books.map(book=>book.id).slice(0,5),
        readerBookId:typeof curBook==='undefined'?null:curBook?.id,probe:window.liveMediaImageProbe||null,
        mediaFetchAttempts:window.liveMediaFetchAttempts||0,
        readerImages:[...document.querySelectorAll('#rtext figure img')].slice(0,10).map(image=>({
          protocol:image.getAttribute('src')?new URL(image.src).protocol:'',complete:image.complete,
          width:image.naturalWidth,height:image.naturalHeight})),
      })),5000).catch(()=>null):null;
      console.error(JSON.stringify({result:'FAIL',engine:engine.name(),stage,
        error:String(error.message||error.name).replace(/https?:\/\/\S+/g,'[URL]').slice(0,240),state,
        offlineMode,blockedHttpRequests,blockedHttpProbes:blockedProbes.size,offlineHttpSuccesses:httpSuccessAfterIsolation.size,network:network.slice(-40)}));
      throw Error('Live social media verification failed in '+engine.name()+' during '+stage);
    }finally{try{await context?.close();}finally{rmSync(profile,{recursive:true,force:true});}}
  }
  assert.equal(reports.length,2);console.log('Live social media: both engines imported and decoded eight real images, then reopened the same saved book offline without media fetches. This is browser verification, not physical-iOS proof.');
}finally{await new Promise(done=>server.close(done));}
