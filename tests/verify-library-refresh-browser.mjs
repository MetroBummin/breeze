import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

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
const browser=await chromium.launch();

try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(url)?r.continue():r.abort());
 await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
 await page.goto(url);await page.evaluate(()=>homeReady);
 assert.equal(await page.locator('#home-resume').isDisabled(),true);
 assert.equal(await page.locator('#login-nudge').textContent(),'');
 await page.evaluate(()=>{
   window.refreshCalls=0;
   loadBooks=async()=>{window.refreshCalls++};
   loadRss=async()=>[];
   window.pull=(dx,dy,cancel=false)=>{
     const target=document.querySelector('.view.on');
     const touch=(x,y)=>new Touch({identifier:1,target,clientX:x,clientY:y});
     target.dispatchEvent(new TouchEvent('touchstart',{touches:[touch(180,120)],bubbles:true,cancelable:true}));
     target.dispatchEvent(new TouchEvent('touchmove',{touches:[touch(180+dx,120+dy)],bubbles:true,cancelable:true}));
     target.dispatchEvent(new TouchEvent(cancel?'touchcancel':'touchend',{touches:[],bubbles:true,cancelable:true}));
   };
 });
 for(const view of ['home','casuals','longform']){
   await page.evaluate(v=>show(v),view);
   assert.equal(await page.locator('#home-controls').isVisible(),true);
   assert.equal(await page.locator('#topbar #nav-settings').count(),1);
   await page.evaluate(()=>window.pull(0,150));
   await page.waitForFunction(()=>libraryRefreshTask===null);
 }
 assert.equal(await page.evaluate(()=>window.refreshCalls),3);
 await page.evaluate(()=>{window.pull(150,30);window.pull(0,50);window.pull(0,150,true)});
 assert.equal(await page.evaluate(()=>window.refreshCalls),3,'Horizontal, short or cancelled drag refreshed');
 await page.evaluate(()=>openSettings());await page.evaluate(()=>window.pull(0,150));
 assert.equal(await page.evaluate(()=>window.refreshCalls),3,'Settings sheet gesture refreshed underlying shelf');
 await page.evaluate(()=>closeSettings());await page.locator('#settings-modal').waitFor({state:'hidden'});
 await page.evaluate(()=>{show('home');loadBooks=()=>{window.refreshCalls++;return new Promise(resolve=>window.releaseRefresh=resolve)};refreshLibrary();refreshLibrary()});
 assert.equal(await page.evaluate(()=>window.refreshCalls),4,'Concurrent refresh duplicated work');
 await page.evaluate(()=>show('vocab'));
 await page.waitForFunction(()=>document.getElementById('library-refresh').hidden);
 await page.evaluate(()=>window.releaseRefresh());await page.waitForFunction(()=>libraryRefreshTask===null);
 assert.equal(await page.locator('#v-vocab').isVisible(),true,'Refresh navigated back to old shelf');
 await page.evaluate(()=>window.pull(0,150));assert.equal(await page.evaluate(()=>window.refreshCalls),4,'Non-shelf view refreshed');
 await page.evaluate(()=>show('home'));
 await page.locator('#casuals .section-link').click();assert.equal(await page.locator('#v-casuals').isVisible(),true);
 await page.evaluate(()=>show('home'));await page.locator('#longform .section-link').click();assert.equal(await page.locator('#v-longform').isVisible(),true);
 await page.evaluate(()=>{sbUser={email:'fixture@example.test'};syncLoginNudge()});
 assert.equal(await page.locator('#login-nudge').isVisible(),false,'Signed-in account still has dot');
 assert.deepEqual(errors,[]);
 console.log('Pull refresh: three shelves, direction/threshold/cancel gates, sheet isolation, coalescing and navigation safety passed.');
}finally{await browser.close();await new Promise(done=>server.close(done))}
