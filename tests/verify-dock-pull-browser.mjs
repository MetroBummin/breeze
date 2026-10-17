import assert from 'node:assert/strict';
import {mkdirSync,readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

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
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
  const errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));
  await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>homeReady);
  await page.evaluate(()=>{
    books=[
      {id:'saved-long',kind:'txt',title:'데미안',author:'헤르만 헤세',paras:['데미안','한 문장'],addedAt:1},
      {id:'saved-short',kind:'paste',title:'짧은 글',paras:['짧은 글','본문'],addedAt:2},
    ];
    positions={'saved-long':{t:20,p:.4}};
    renderHome();
  });
  const dockBox=()=>page.evaluate(()=>{
    const dock=document.getElementById('home-controls');
    const rect=dock.getBoundingClientRect();
    const limit=window.visualViewport?window.visualViewport.offsetTop+window.visualViewport.height:window.innerHeight;
    return {bottom:rect.bottom,limit,transform:dock.style.transform||'none',visible:getComputedStyle(dock).display!=='none'};
  });
  function assertDockResting(box,label){
    assert.equal(box.visible,true,label+' hid the dock');
    assert.ok(Math.abs(box.bottom-box.limit)<=1,label+` moved the dock to ${box.bottom}, visible bottom ${box.limit}`);
  }
  for(const view of ['home','longform']){
    await page.evaluate(v=>show(v),view);
    const resting=await dockBox();
    assertDockResting(resting,view+' at rest');
    assert.equal(resting.transform,'none',view+' pinned the dock before a pull');
    const client=await page.context().newCDPSession(page);
    const samples=[];
    await page.exposeFunction('noteDock'+view,value=>samples.push(value)).catch(()=>{});
    await page.evaluate(name=>{
      let frame=0;
      const tick=()=>{
        const dock=document.getElementById('home-controls');
        const rect=dock.getBoundingClientRect();
        const limit=window.visualViewport?window.visualViewport.offsetTop+window.visualViewport.height:window.innerHeight;
        window[name]({bottom:rect.bottom,limit});
        if(++frame<24) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },'noteDock'+view);
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:280,id:1}]});
    for(const y of [330,390,460,530]){
      await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y,id:1}]});
      await page.waitForTimeout(30);
    }
    const mid=await dockBox();
    assertDockResting(mid,view+' mid-pull');
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(80);
    const released=await dockBox();
    assertDockResting(released,view+' after release');
    await page.waitForFunction(()=>libraryRefreshTask===null);
    assert.ok(samples.length>0,view+' recorded no dock samples');
    for(const sample of samples){
      assert.ok(Math.abs(sample.bottom-sample.limit)<=1,view+` sample slipped to ${sample.bottom}`);
    }
    await client.detach();
  }
  const shell=readFileSync(resolve(root,'ios/App/App/SceneDelegate.swift'),'utf8');
  const refreshSource=readFileSync(resolve(root,'scripts/ui/library-refresh.js'),'utf8');
  assert.equal(shell.includes('UIRefreshControl'),true,'UIRefreshControl is missing from the shell');
  assert.equal(shell.includes('webView?.scrollView.refreshControl = libraryRefreshControl'),true,'Home and shelves do not attach the system refresh control');
  assert.equal(shell.includes('webView.scrollView.bounces = true'),true,'Scroll-view bounce is off');
  assert.equal(shell.includes('breezePinDock'),false,'Dock pin is still in the shell');
  assert.equal(refreshSource.includes('breezePinDock'),false,'Dock pin is still in the page');
  assert.equal(refreshSource.includes('breezeNativeRefresh'),true,'Native refresh entry is missing');
  // Before: the refresh control shifts the whole web layer, and a fixed dock
  // inside that layer moves with it. This capture only demonstrates that shift.
  async function shiftedLayer(shift){
    await page.evaluate(dy=>{
      const root=document.documentElement;
      if(dy){root.style.height='100%';root.style.transform=`translateY(${dy}px)`;document.body.style.overflow='hidden';}
      else{root.style.removeProperty('height');root.style.removeProperty('transform');document.body.style.removeProperty('overflow');}
    },shift);
  }
  const bottom={x:0,y:624,width:390,height:220};
  await page.evaluate(()=>show('home'));
  await shiftedLayer(96);
  const before=await dockBox();
  assert.ok(before.bottom>before.limit+40,'Layer shift did not carry the dock');
  await page.screenshot({path:`${shots}/dock-pull-before-home.png`});
  await page.screenshot({path:`${shots}/dock-pull-before-home-bottom.png`,clip:bottom});
  await page.evaluate(()=>show('longform'));
  await page.screenshot({path:`${shots}/dock-pull-before-bookshelf.png`});
  await page.screenshot({path:`${shots}/dock-pull-before-bookshelf-bottom.png`,clip:bottom});
  await shiftedLayer(0);
  await page.evaluate(()=>show('home'));
  const client=await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:280,id:1}]});
  for(const y of [360,460,540]){
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y,id:1}]});
    await page.waitForTimeout(20);
  }
  const pulling=await dockBox();
  assertDockResting(pulling,'home during the page pull');
  assert.equal(pulling.transform,'none','Page pull transformed the dock');
  await page.screenshot({path:`${shots}/dock-pull-after-home.png`});
  await page.screenshot({path:`${shots}/dock-pull-after-home-bottom.png`,clip:bottom});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await client.detach();
  await page.evaluate(()=>show('longform'));
  assertDockResting(await dockBox(),'bookshelf after the pull');
  await page.screenshot({path:`${shots}/dock-pull-after-bookshelf.png`});
  await page.screenshot({path:`${shots}/dock-pull-after-bookshelf-bottom.png`,clip:bottom});
  assert.deepEqual(errors,[]);
  console.log('Dock stays on the glass during pull on Home and the bookshelf.');
}finally{await browser.close();await new Promise(done=>server.close(done));}
