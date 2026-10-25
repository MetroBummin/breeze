import assert from 'node:assert/strict';
import {mkdirSync,readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from './helpers/bounded-playwright.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const shots='/opt/cursor/artifacts/screenshots';
mkdirSync(shots,{recursive:true});
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer((req,res)=>{
  const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
const shell=readFileSync(resolve(root,'ios/App/App/SceneDelegate.swift'),'utf8');
const refreshSource=readFileSync(resolve(root,'scripts/ui/library-refresh.js'),'utf8');
const pageSource=readFileSync(resolve(root,'index.html'),'utf8');
assert.equal(shell.includes('UIRefreshControl'),false,'UIRefreshControl is still in the shell');
assert.equal(shell.includes('BreezeRefreshControl'),false,'Refresh control class is still in the shell');
assert.equal(shell.includes('breezeRefresh'),false,'Native refresh bridge is still in the shell');
assert.equal(shell.includes('refreshControl'),false,'A refresh control is still assigned');
assert.equal(shell.includes('webView.scrollView.bounces = true'),true,'Scroll-view bounce is off');
assert.equal(shell.includes('breezePinDock'),false,'Dock pin is still in the shell');
assert.equal(refreshSource.includes('breezeNativeRefresh'),false,'Native refresh entry is still in the page');
assert.equal(refreshSource.includes('breezeRefresh'),false,'Native refresh bridge is still in the page');
assert.equal(refreshSource.includes('touchstart'),false,'Pull touch handling is still in the page');
assert.equal(refreshSource.includes('LIBRARY_REFRESH_GAP_MS=45000'),true,'Automatic reload gap is missing');
assert.equal(pageSource.includes('id="library-refresh"'),false,'Pull indicator markup remains');

function assertDockResting(box,label){
  assert.equal(box.visible,true,label+' hid the dock');
  assert.equal(box.transform,'none',label+' transformed the dock');
  assert.ok(Math.abs(box.bottom-box.limit)<=1,label+` moved the dock to ${box.bottom}, visible bottom ${box.limit}`);
}
try{
  for(const engine of [chromium,webkit]){
    const browser=await engine.launch();
    try{
      const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
      const errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));
      await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
      await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
      await page.goto(url,{waitUntil:'domcontentloaded'});
      await page.evaluate(()=>homeReady);
      await page.waitForFunction(()=>libraryRefreshLaunch===1);
      await page.evaluate(()=>{
        books=[
          {id:'saved-long',kind:'txt',title:'데미안',author:'헤르만 헤세',paras:['데미안','한 문장'],addedAt:1},
          {id:'saved-short',kind:'paste',title:'짧은 글',paras:['짧은 글','본문'],addedAt:2},
        ];
        positions={'saved-long':{t:20,p:.4}};
        loadBooks=async()=>{};
        renderHome();
      });
      const dockBox=()=>page.evaluate(()=>{
        const dock=document.getElementById('home-controls');
        const rect=dock.getBoundingClientRect();
        const limit=window.visualViewport?window.visualViewport.offsetTop+window.visualViewport.height:window.innerHeight;
        return {bottom:rect.bottom,limit,transform:getComputedStyle(dock).transform,visible:getComputedStyle(dock).display!=='none'};
      });
      for(const view of ['home','longform']){
        await page.evaluate(v=>show(v),view);
        await page.waitForFunction(()=>libraryRefreshTask===null);
        assertDockResting(await dockBox(),engine.name()+' '+view+' after automatic reload');
      }
      if(engine===chromium){
        await page.evaluate(()=>show('home'));
        const client=await page.context().newCDPSession(page);
        const samples=[];
        await page.exposeFunction('noteDock',value=>samples.push(value));
        await page.evaluate(()=>{
          let frame=0;
          const tick=()=>{
            const dock=document.getElementById('home-controls');
            const rect=dock.getBoundingClientRect();
            const limit=window.visualViewport?window.visualViewport.offsetTop+window.visualViewport.height:window.innerHeight;
            window.noteDock({bottom:rect.bottom,limit});
            if(++frame<24) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:280,id:1}]});
        for(const y of [330,390,460,530]){
          await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y,id:1}]});
          await page.waitForTimeout(30);
        }
        assertDockResting(await dockBox(),'home mid-drag');
        await page.screenshot({path:`${shots}/dock-still-home.png`});
        await page.screenshot({path:`${shots}/dock-still-home-bottom.png`,clip:{x:0,y:624,width:390,height:220}});
        await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await page.evaluate(()=>show('longform'));
        await page.waitForFunction(()=>libraryRefreshTask===null);
        await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:280,id:1}]});
        for(const y of [360,460,540]){
          await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y,id:1}]});
          await page.waitForTimeout(20);
        }
        assertDockResting(await dockBox(),'bookshelf mid-drag');
        await page.screenshot({path:`${shots}/dock-still-bookshelf.png`});
        await page.screenshot({path:`${shots}/dock-still-bookshelf-bottom.png`,clip:{x:0,y:624,width:390,height:220}});
        await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await client.detach();
        assert.ok(samples.length>0,'home recorded no dock samples');
        for(const sample of samples){
          assert.ok(Math.abs(sample.bottom-sample.limit)<=1,`home sample slipped to ${sample.bottom}`);
        }
        assert.equal(await page.evaluate(()=>libraryRefreshRuns),1,'A downward drag reloaded the shelf');
      }
      assert.deepEqual(errors,[]);
      console.log(engine.name(),'dock stays put without a refresh control.');
    }finally{await browser.close();}
  }
}finally{await new Promise(done=>server.close(done));}
