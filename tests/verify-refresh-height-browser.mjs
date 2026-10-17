import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {webkit} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer((req,res)=>{
  const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await webkit.launch();
try{
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
  const errors=[];page.on('pageerror',error=>errors.push(error.stack||error.message));
  await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
  await page.addInitScript(()=>{
    localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));
    window.nativeMessages=[];
    window.webkit={messageHandlers:{breezeRefresh:{postMessage(message){window.nativeMessages.push(message);}}}};
  });
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>homeReady);
  await page.evaluate(()=>{
    const hex=n=>n.toString(16).padStart(64,'0');
    books=Array.from({length:6},(_,index)=>({
      id:'saved-'+(index+1),kind:'txt',title:'책 '+(index+1),author:'저자',paras:['본문'],addedAt:100-index,
    }));
    positions={};
    window.BREEZE_CONFIG.BOOK_CLOUD=true;
    bookCloudCatalog=[7,8,9,10].map(n=>({book_id:hex(n),status:'ready',title:'연동 '+n,author:'다른 기기',kind:'pdf',byte_size:1000}));
    bookCloudHeads={};
    const seeded=books.slice();
    const catalog=bookCloudCatalog.slice();
    loadBooks=async()=>{
      await new Promise(resolve=>setTimeout(resolve,40));
      books=seeded.slice();
      bookCloudCatalog=catalog.slice();
    };
    loadRss=async()=>[];
  });
  async function refresh(view){
    await page.evaluate(v=>show(v),view);
    await page.evaluate(()=>document.fonts.ready);
    const trace=await page.evaluate(async()=>{
      const samples=[];
      const read=()=>{
        const dock=document.getElementById('home-controls');
        const rect=dock.getBoundingClientRect();
        const limit=window.visualViewport?window.visualViewport.offsetTop+window.visualViewport.height:window.innerHeight;
        samples.push({
          scrollHeight:document.documentElement.scrollHeight,
          bottom:rect.bottom,
          limit,
          position:getComputedStyle(dock).position,
          transform:dock.style.transform||getComputedStyle(dock).transform,
        });
      };
      read();
      let stop=false;
      const tick=()=>{read();if(!stop)requestAnimationFrame(tick);};
      requestAnimationFrame(tick);
      window.nativeMessages.length=0;
      window.breezeNativeRefresh(1);
      const finished=await new Promise(resolve=>{
        const timer=setInterval(()=>{
          if(window.nativeMessages.some(message=>message.finished===1)){clearInterval(timer);resolve(true);}
        },16);
        setTimeout(()=>{clearInterval(timer);resolve(false);},2000);
      });
      stop=true;
      await new Promise(resolve=>requestAnimationFrame(resolve));
      return {finished,samples};
    });
    assert.equal(trace.finished,true,view+' refresh did not finish');
    assert.ok(trace.samples.length>=8,view+' recorded '+trace.samples.length+' frames');
    const height=trace.samples[0].scrollHeight;
    assert.ok(height>844,view+' shelf is not taller than the phone viewport ('+height+')');
    for(const sample of trace.samples){
      assert.equal(sample.scrollHeight,height,view+' document height moved from '+height+' to '+sample.scrollHeight);
      assert.equal(sample.position,'fixed',view+' dock position became '+sample.position);
      assert.ok(sample.transform==='none',view+' dock transform became '+sample.transform);
      assert.ok(Math.abs(sample.bottom-sample.limit)<=1,view+' dock bottom '+sample.bottom+' limit '+sample.limit);
    }
  }
  await refresh('longform');
  await refresh('home');
  const shell=readFileSync(resolve(root,'ios/App/App/SceneDelegate.swift'),'utf8');
  assert.equal(shell.includes('webView?.scrollView.refreshControl = libraryRefreshControl'),true);
  assert.equal(shell.includes('webView.scrollView.bounces = true'),true);
  assert.equal(shell.includes('breezePinDock'),false);
  assert.deepEqual(errors,[]);
  console.log('Document height and dock position stay steady through a phone refresh.');
}finally{await browser.close();await new Promise(done=>server.close(done));}
