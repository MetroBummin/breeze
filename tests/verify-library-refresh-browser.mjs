import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from './helpers/bounded-playwright.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.woff2':'font/woff2'};
const server=createServer((req,res)=>{
  const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
const engines=(process.env.BROWSER==='webkit'?[webkit]:process.env.BROWSER==='chromium'?[chromium]:[chromium,webkit]);

try{
 for(const engine of engines){
  const browser=await engine.launch();
  try{
   const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
   const errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));
   await page.route('**/*',r=>r.request().url().startsWith(url)?r.continue():r.abort());
   await page.addInitScript(()=>{
     localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));
     localStorage.setItem('breeze.home-recommend',JSON.stringify('articles'));
     window.capacitorResumes=[];
     window.Capacitor={Plugins:{App:{addListener(name,callback){
       window.capacitorResumes.push(name);
       window.capacitorAppListener=callback;
       return Promise.resolve({remove(){}});
     }}}};
   });
   await page.goto(url,{waitUntil:'domcontentloaded'});
   await page.evaluate(()=>homeReady);
   await page.waitForFunction(()=>libraryRefreshLaunch===1);
   assert.equal(await page.evaluate(()=>libraryRefreshRuns),0,'Launch fetched a second time after boot');
   assert.equal(await page.locator('#library-refresh').count(),0,'Pull indicator is still in the page');
   assert.equal(await page.evaluate(()=>window.capacitorResumes.includes('appStateChange')),true,'Foreground listener was not installed');
   assert.ok(await page.evaluate(()=>libraryRefreshSeen.home>0),'Launch did not record Home');
   await page.evaluate(()=>{
     window.refreshCalls=0;
     window.rssPageAtStub=rssPage;
     loadBooks=async()=>{window.refreshCalls++};
     loadRss=async()=>[];
     /* The gap is checked with Date.now. A shift added to the live clock
        still moves, so a 1ms margin can expire before the event runs. */
     let now=Date.now();
     Date.now=()=>now;
     window.advanceRefreshClock=ms=>{now+=ms};
     window.pull=(dx,dy)=>{
       const target=document.querySelector('.view.on');
       const touch=(x,y)=>({identifier:1,target,clientX:x,clientY:y});
       const fire=(type,touches)=>{const event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'touches',{value:touches});target.dispatchEvent(event);};
       fire('touchstart',[touch(180,120)]);
       fire('touchmove',[touch(180+dx,120+dy)]);
       fire('touchend',[]);
     };
   });
   const pageAtLaunch=await page.evaluate(()=>window.rssPageAtStub);
   await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
   await page.evaluate(()=>window.capacitorAppListener({isActive:true}));
   assert.equal(await page.evaluate(()=>libraryRefreshRuns),0,'Foreground refreshed inside the launch quiet period');
   await page.evaluate(()=>show('casuals'));
   await page.waitForFunction(()=>libraryRefreshTask===null);
   const held=await page.evaluate(async()=>{
     loadBooks=()=>new Promise(resolve=>{window.refreshCalls++;window.releaseRefresh=resolve});
     show('longform');
     await new Promise(resolve=>queueMicrotask(resolve));
     const node=document.getElementById('home-controls');
     const rect=node.getBoundingClientRect();
     const limit=window.visualViewport?window.visualViewport.offsetTop+window.visualViewport.height:window.innerHeight;
     return {runs:libraryRefreshRuns,calls:window.refreshCalls,dock:{bottom:rect.bottom,limit,transform:getComputedStyle(node).transform}};
   });
   assert.equal(held.runs,2,'Entering each shelf did not reload');
   assert.equal(held.calls,2,'Entering a shelf did not reload saved books');
   assert.ok(Math.abs(held.dock.bottom-held.dock.limit)<=1,`Automatic reload moved the dock to ${held.dock.bottom}`);
   assert.equal(held.dock.transform,'none','Automatic reload transformed the dock');
   await page.evaluate(()=>{
     window.releaseRefresh();
     loadBooks=async()=>{window.refreshCalls++};
   });
   await page.waitForFunction(()=>libraryRefreshTask===null);
   assert.equal(await page.evaluate(()=>rssPage),pageAtLaunch,'A shelf reload advanced the Home feed');
   await page.evaluate(()=>show('home'));
   await page.waitForFunction(()=>libraryRefreshTask===null);
   assert.equal(await page.evaluate(()=>libraryRefreshRuns),2,'Returning to Home inside 45s reloaded');
   await page.evaluate(()=>show('vocab'));
   assert.equal(await page.evaluate(()=>libraryRefreshRuns),2,'Wordbook reloaded');
   await page.evaluate(()=>show('read'));
   assert.equal(await page.locator('#v-read').isVisible(),true);
   assert.equal(await page.evaluate(()=>libraryRefreshRuns),2,'Reader reloaded');
   await page.evaluate(()=>show('home'));
   await page.evaluate(()=>show('longform'));
   assert.equal(await page.evaluate(()=>libraryRefreshRuns),2,'Re-entering a shelf inside 45s reloaded');
   await page.evaluate(()=>show('home'));
   const earlyRuns=await page.evaluate(()=>{
     const remaining=45000-(Date.now()-libraryRefreshSeen.home);
     window.advanceRefreshClock(remaining-1);
     document.dispatchEvent(new Event('visibilitychange'));
     return libraryRefreshRuns;
   });
   assert.equal(earlyRuns,2,'Foreground refreshed 1ms early');
   await page.evaluate(()=>{
     window.advanceRefreshClock(1);
     document.dispatchEvent(new Event('visibilitychange'));
     document.dispatchEvent(new Event('visibilitychange'));
     window.capacitorAppListener({isActive:true});
     window.capacitorAppListener({isActive:false});
   });
   await page.waitForFunction(()=>libraryRefreshTask===null);
   assert.equal(await page.evaluate(()=>libraryRefreshRuns),3,'A second foreground event in the same quiet period reloaded');
   assert.equal(await page.evaluate(()=>rssPage),pageAtLaunch+1,'Home foreground reload did not advance the feed');
   await page.evaluate(()=>window.advanceRefreshClock(45000));
   await page.evaluate(()=>window.capacitorAppListener({isActive:true}));
   await page.waitForFunction(()=>libraryRefreshRuns===4);
   await page.evaluate(()=>window.capacitorAppListener({isActive:true}));
   assert.equal(await page.evaluate(()=>libraryRefreshRuns),4,'Repeat app resume reloaded inside the quiet period');
   await page.evaluate(()=>window.pull(0,180));
   assert.equal(await page.evaluate(()=>libraryRefreshRuns),4,'A downward pull reloaded');
   await page.evaluate(()=>openSettings());
   await page.evaluate(()=>window.advanceRefreshClock(45000));
   await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
   await page.evaluate(()=>closeSettings());
   await page.locator('#settings-modal').waitFor({state:'hidden'});
   assert.equal(await page.evaluate(()=>libraryRefreshRuns),4,'Settings sheet let a reload through');
   await page.evaluate(()=>{
     show('home');
     loadBooks=()=>{window.refreshCalls++;return new Promise(resolve=>window.releaseRefresh=resolve)};
     const before=window.refreshCalls;
     refreshLibrary();
     refreshLibrary();
     window.coalesced=window.refreshCalls-before;
   });
   assert.equal(await page.evaluate(()=>window.coalesced),1,'Concurrent refresh duplicated work');
   assert.equal(await page.evaluate(()=>libraryRefreshRuns),5,'Direct refresh stayed on the automatic clock');
   await page.evaluate(()=>show('vocab'));
   await page.evaluate(()=>window.releaseRefresh());
   await page.waitForFunction(()=>libraryRefreshTask===null);
   assert.equal(await page.locator('#v-vocab').isVisible(),true,'Refresh navigated back to the old shelf');
   await page.evaluate(()=>{loadBooks=async()=>{};show('home')});
   await page.waitForFunction(()=>libraryRefreshTask===null);
   await page.evaluate(async()=>{
     rssCands=RSS_FEEDS.map(()=>[]);
     loadBooks=async()=>{};
     loadRss=()=>new Promise(resolve=>window.releaseFeed=resolve);
     refreshLibrary();
   });
   await page.waitForFunction(()=>libraryRefreshTask===null,null,{timeout:2000});
   assert.equal(await page.evaluate(()=>rssListeners.size>0),true,'Feed updates stopped when the reload settled');
   await page.evaluate(()=>{
     rssCands[0]=[{title:'Ready source',url:'https://example.com/ready-source',source:'Dexerto',
       feedSourceUrl:RSS_FEEDS[0].url,photo:'/assets/samples/starship-1.jpg'}];
     rssListeners.forEach(notify=>notify(rssCands));
   });
   await page.locator('#casual-rail .rss-card:not([hidden])').waitFor({timeout:2000});
   assert.equal(await page.locator('#casual-rail .rss-card .ct').first().textContent(),'Ready source');
   await page.evaluate(()=>window.releaseFeed(rssCands));
   assert.deepEqual(errors,[]);
   console.log(engine.name(),'automatic library reload: launch, shelves, foreground, 45s gap, and feed updates passed.');
  }finally{await browser.close();}
 }
}finally{await new Promise(done=>server.close(done));}
