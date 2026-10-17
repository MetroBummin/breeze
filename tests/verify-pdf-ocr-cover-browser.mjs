/* Cover progress is the bookshelf job. Native recognition stays a bridge double.
   The label sits inside the card, and only while a scanned page is pending.
   ocrCover=off hides it. The under-card line is not mounted. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit,firefox} from 'playwright';
import {scanPdf} from './helpers/pdf-scan-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const engines={chromium,webkit,firefox};
const engine=engines[process.env.BROWSER]||chromium;
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 if(!path.startsWith(root)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/`;
const proof=process.env.BREEZE_OCR_COVER_SHOTS||'/tmp/breeze-ocr-cover';
mkdirSync(proof,{recursive:true});
const profile=mkdtempSync(resolve(tmpdir(),'breeze-ocr-cover-'));
const shots=[];
let browser;
try{
 browser=await engine.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},serviceWorkers:'block'});
 const context=browser;
 await context.addInitScript(()=>{
  localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));
  window.qaCoverOcr={calls:[],active:0,peak:0};
  const bridge={recognize:()=>new Promise((resolve,reject)=>{
   const q=qaCoverOcr;q.active++;q.peak=Math.max(q.peak,q.active);
   q.calls.push({resolve:()=>{q.active--;resolve({words:[{word:'Bright',line:0,x:.1,y:.12,w:.12,h:.03,confidence:.99}]});},reject:error=>{q.active--;reject(error);}});
  })};
  window.Capacitor={isNativePlatform:()=>true,getPlatform:()=>'ios',isPluginAvailable:n=>n==='BreezePdfOcr',Plugins:{BreezePdfOcr:bridge}};
 });
 await context.route(/^https?:\/\//,route=>{
  const u=route.request().url();if(u.startsWith(url))return route.continue();
  return route.abort();
 });
 const page=await context.newPage();
 const boot=async mode=>{
  await page.goto(url+(mode?`?ocrCover=${mode}`:''));
  await page.evaluate(()=>homeReady);
  await page.waitForFunction(()=>document.getElementById('onboarding')?.hidden===true);
 };
 const importScan=async()=>{
  const jpeg=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d');g.fillStyle='#d7c4a3';g.fillRect(0,0,600,800);g.fillStyle='#1c1c1e';g.font='28px sans-serif';g.fillText('Bright world',60,120);return c.toDataURL('image/jpeg').split(',')[1];});
  await page.locator('#fileinput').setInputFiles({name:'스캔 영어.pdf',mimeType:'application/pdf',buffer:scanPdf(jpeg,{pages:10})});
  await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'),null,{timeout:60000});
 };
 const openImported=async()=>{
  await page.evaluate(async()=>{
   const book=books.find(item=>item.kind==='pdf');
   if(!book)return;
   if(curBook?.id!==book.id)await openBook(book);
   if(currentReaderMode!=='original')await switchReaderMode('original');
  });
 };
 const settle=async()=>{
  await page.waitForFunction(()=>qaCoverOcr.calls.length>=1,null,{timeout:30000});
  for(let i=0;i<5;i++){
   await page.waitForFunction(n=>qaCoverOcr.calls.length>n,i);
   await page.evaluate(i=>qaCoverOcr.calls[i].resolve(),i);
  }
  await page.waitForFunction(()=>{
   const bar=document.querySelector('#v-home .book-ocr-fill i');
   return document.querySelector('#v-home .book-ocr-label')?.textContent==='글자 스캔 중'&&parseFloat(bar?.style.width)>=50;
  });
 };
 const capture=async(name,locator)=>{
  const file=`${proof}/${engine.name()}-${name}.png`;
  await (locator||page).screenshot({animations:'disabled',timeout:5000,path:file});
  shots.push(file);
 };
 await boot('');
 await importScan();
 await openImported();
 await settle();
 await page.evaluate(()=>show('home'));
 const started=Date.now();
 const cover=page.locator('#v-home .book-ocr-cover');
 const bar=page.locator('#v-home .book-ocr-progress');
 assert.equal(await bar.count(),0,'the under-card line is not mounted');
 assert.equal(await cover.evaluate(node=>{
  const card=node.closest('.bookcard');
  const under=card.parentElement.querySelector('.home-regular-title');
  const nr=node.getBoundingClientRect(),cr=card.getBoundingClientRect(),ur=under.getBoundingClientRect();
  return nr.top>=cr.top-1&&nr.bottom<=cr.bottom+1&&nr.bottom<=ur.top+1;
 }),true,'the label sits inside the card, above the title under it');
 assert.equal(await page.locator('#v-home .book-ocr-count').count(),0,'the page-count chip stays off the cover');
 assert.equal(await cover.locator('.book-ocr-hit').evaluate(node=>{const r=node.getBoundingClientRect();return r.width>=44&&r.height>=44;}),true);
 for(const size of [{name:'phone',width:390,height:844},{name:'tablet',width:820,height:1180},{name:'web',width:1440,height:1000},{name:'short',width:320,height:568},{name:'landscape',width:844,height:390}]){
  await page.setViewportSize(size);
  for(const dark of [false,true]){
   await page.evaluate(dark=>{darkMode=dark;applyDark();},dark);
   await cover.scrollIntoViewIfNeeded();
   await cover.evaluate(node=>{
    const dock=document.querySelector('.control-dock');
    const limit=dock?dock.getBoundingClientRect().top:innerHeight;
    const bottom=node.getBoundingClientRect().bottom;
    if(bottom>limit-8)window.scrollBy(0,bottom-(limit-8));
   });
   const box=await cover.evaluate(node=>{
    const r=node.getBoundingClientRect();
    const hit=node.querySelector('.book-ocr-hit').getBoundingClientRect();
    const label=node.querySelector('.book-ocr-label').getBoundingClientRect();
    const fill=node.querySelector('.book-ocr-fill').getBoundingClientRect();
    const card=node.closest('.bookcard').getBoundingClientRect();
    const top=document.elementFromPoint(hit.left+hit.width/2,hit.top+Math.min(hit.height/2,12));
    return {x:r.left,y:r.top,w:r.width,h:r.height,hit:hit.width>=44&&hit.height>=44,inside:r.left>=card.left-1&&r.right<=card.right+1&&r.top>=card.top-1&&r.bottom<=card.bottom+1,viewport:innerWidth,open:!!top&&node.contains(top),above:label.bottom<=fill.top+1,label:label.width>8&&label.height>8,text:node.querySelector('.book-ocr-label').textContent,fill:fill.width>8&&fill.height>=3};
   });
   assert.equal(box.text,'글자 스캔 중');
   assert.ok(box.hit&&box.inside&&box.open&&box.above&&box.label&&box.fill&&box.w>0&&box.x>=0&&box.x+box.w<=box.viewport+1,JSON.stringify(box));
   if(['phone','tablet','web'].includes(size.name))await capture(`fill-${size.name}-${dark?'dark':'light'}`,page.locator('#v-home #shelf'));
  }
 }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(dark=>{darkMode=dark;applyDark();},false);
  await cover.scrollIntoViewIfNeeded();
  await cover.locator('.book-ocr-hit').click();
  assert.equal(await page.evaluate(()=>document.getElementById('v-home').classList.contains('on')&&!document.getElementById('v-read').classList.contains('on')),true,'cover tap stays on the shelf');
  const detail=page.locator('.book-ocr-detail');
  await detail.waitFor({state:'visible'});
  const detailBox=await detail.evaluate(node=>{
   const r=node.getBoundingClientRect();
   const close=node.querySelector('.book-ocr-detail-close').getBoundingClientRect();
   return {x:r.left,y:r.top,r:r.right,b:r.bottom,w:innerWidth,h:innerHeight,close:close.width>=44&&close.height>=44};
  });
  assert.ok(detailBox.close&&detailBox.x>=0&&detailBox.y>=0&&detailBox.r<=detailBox.w+1&&detailBox.b<=detailBox.h+1,JSON.stringify(detailBox));
  assert.match(await detail.locator('.book-ocr-detail-count').innerText(),/5\/10쪽/);
  await capture('fill-phone-light-detail');
  await page.evaluate(dark=>{darkMode=dark;applyDark();},true);
  await capture('fill-phone-dark-detail');
  await page.keyboard.press('Escape');
  await detail.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains('book-ocr-hit')),true);
  assert.equal(await cover.getAttribute('data-ocr-state'),'active','screenshots must finish before the native deadline pauses the job');
  assert.ok(Date.now()-started<25000,'capture must finish before the 30s native deadline');
 await page.evaluate(dark=>{darkMode=false;applyDark();},false);
 await boot('off');
 assert.equal(await page.locator('#v-home .book-ocr-cover').count(),0);
 assert.equal(await page.locator('#v-home .book-ocr-progress').count(),0);
 await page.setViewportSize({width:390,height:844});
 await capture('off-phone-light',page.locator('#v-home #shelf'));
 await page.evaluate(()=>{darkMode=true;applyDark();});
 await capture('off-phone-dark',page.locator('#v-home #shelf'));
 await boot('ring');
 await openImported();
 await page.waitForFunction(()=>document.querySelector('#v-home .book-ocr-cover:not([hidden]) .book-ocr-label')?.textContent==='글자 스캔 중');
 assert.equal(await page.locator('#v-home .book-ocr-progress').count(),0,'unknown values stay on the cover');
 await boot('fill');
 await openImported();
 await page.waitForFunction(()=>qaCoverOcr.calls.length>=1&&document.querySelector('#v-home .book-ocr-cover:not([hidden]) .book-ocr-label')?.textContent==='글자 스캔 중');
 const pending=await page.evaluate(()=>qaCoverOcr.calls.length-1);
 await page.evaluate(i=>qaCoverOcr.calls[i].reject(new Error('stopped')),pending);
 await page.waitForFunction(()=>document.querySelector('#v-home .book-ocr-cover:not([hidden]) .book-ocr-label')?.textContent==='글자 스캔 실패');
 await page.evaluate(()=>show('home'));
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{darkMode=false;applyDark();});
 await page.locator('#v-home .book-ocr-cover').scrollIntoViewIfNeeded();
 await capture('fill-phone-light-failed',page.locator('#v-home #shelf'));
 await page.evaluate(()=>{darkMode=true;applyDark();});
 await capture('fill-phone-dark-failed',page.locator('#v-home #shelf'));
 await page.locator('#v-home .book-ocr-hit').click();
 await page.locator('.book-ocr-detail-retry').waitFor({state:'visible'});
 assert.match(await page.locator('.book-ocr-detail-status').innerText(),/글자 스캔 실패/);
 const calls=await page.evaluate(()=>qaCoverOcr.calls.length);
 await page.locator('.book-ocr-detail-retry').click();
 await page.waitForFunction(n=>qaCoverOcr.calls.length>n,calls);
 assert.equal(await page.locator('#v-home .book-ocr-label').innerText(),'글자 스캔 중');
 console.log('cover label inside the card, off hides it, and unknown values stay on the cover');
 console.log(shots.join('\n'));
}finally{await browser?.close();rmSync(profile,{recursive:true,force:true});server.close();}
