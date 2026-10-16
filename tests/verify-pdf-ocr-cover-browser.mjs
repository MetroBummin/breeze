/* Cover progress is a flagged view of the same bookshelf job. Native recognition
   stays a bridge double. Flag off keeps the approved under-card bar. */
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
 const settle=async()=>{
  await page.waitForFunction(()=>qaCoverOcr.calls.length>=1,null,{timeout:30000});
  const before=await page.evaluate(()=>qaCoverOcr.calls.length);
  await page.evaluate(()=>qaCoverOcr.calls[0].resolve());
  await page.waitForFunction(n=>qaCoverOcr.calls.length>n,before);
  await page.waitForFunction(()=>document.querySelector('#v-home .book-ocr-count')?.textContent==='1/10');
 };
 const capture=async(name,locator)=>{
  const file=`${proof}/${engine.name()}-${name}.png`;
  await (locator||page).screenshot({animations:'disabled',timeout:5000,path:file});
  shots.push(file);
 };
 await boot('');
 await importScan();
 await page.waitForFunction(()=>document.querySelector('#v-home .book-ocr-progress span')?.textContent.includes('/10쪽'));
 assert.equal(await page.locator('#v-home [data-ocr-surface="cover"]').count(),0);
 assert.equal(await page.locator('#v-home .book-ocr-progress').isVisible(),true);
 const modes=['ring','fill','chip'];
 for(const mode of modes){
  await boot(mode);
  await page.waitForFunction(mode=>document.querySelector('#v-home .book-ocr-cover')?.dataset.ocrVariant===mode,mode);
  if(mode==='ring')await settle();
  else await page.waitForFunction(()=>document.querySelector('#v-home .book-ocr-count')?.textContent==='1/10');
  const started=Date.now();
  const cover=page.locator('#v-home .book-ocr-cover');
  const bar=page.locator('#v-home .book-ocr-progress');
  assert.equal(await bar.evaluate(node=>getComputedStyle(node).display),'none','cover mode hides the under-card bar');
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
     const card=node.closest('.bookcard').getBoundingClientRect();
     const top=document.elementFromPoint(hit.left+hit.width/2,hit.top+hit.height/2);
     return {x:r.left,y:r.top,w:r.width,h:r.height,hit:hit.width>=44&&hit.height>=44,inside:r.left>=card.left-1&&r.right<=card.right+1&&r.top>=card.top-1&&r.bottom<=card.bottom+1,viewport:innerWidth,open:!!top&&(top===node.querySelector('.book-ocr-hit')||node.contains(top))};
    });
    assert.ok(box.hit&&box.inside&&box.open&&box.w>0&&box.x>=0&&box.x+box.w<=box.viewport+1,JSON.stringify(box));
    await capture(`${mode}-${size.name}-${dark?'dark':'light'}`,page.locator('#v-home #shelf'));
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
  assert.match(await detail.locator('.book-ocr-detail-count').innerText(),/1\/10쪽/);
  await capture(`${mode}-phone-light-detail`);
  await page.evaluate(dark=>{darkMode=dark;applyDark();},true);
  await capture(`${mode}-phone-dark-detail`);
  await page.keyboard.press('Escape');
  await detail.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains('book-ocr-hit')),true);
  assert.equal(await cover.getAttribute('data-ocr-state'),'active','screenshots must finish before the native deadline pauses the job');
  assert.ok(Date.now()-started<25000,mode+' capture must finish before the 30s native deadline');
 }
 await page.evaluate(dark=>{darkMode=false;applyDark();},false);
 await boot('');
 await page.waitForFunction(()=>document.querySelector('#v-home .book-ocr-progress span')?.textContent.includes('1/10쪽'));
 assert.equal(await page.locator('#v-home [data-ocr-surface="cover"]').count(),0);
 await page.setViewportSize({width:390,height:844});
 await capture('off-phone-light',page.locator('#v-home #shelf'));
 await page.evaluate(()=>{darkMode=true;applyDark();});
 await capture('off-phone-dark',page.locator('#v-home #shelf'));
 await boot('ring');
 await page.waitForFunction(()=>qaCoverOcr.calls.length>=1&&document.querySelector('#v-home .book-ocr-count')?.textContent==='1/10');
 const pending=await page.evaluate(()=>qaCoverOcr.calls.length-1);
 await page.evaluate(i=>qaCoverOcr.calls[i].reject(new Error('stopped')),pending);
 await page.waitForFunction(()=>document.querySelector('#v-home .book-ocr-cover')?.dataset.ocrState==='paused');
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{darkMode=false;applyDark();});
 await page.locator('#v-home .book-ocr-hit').click();
 await page.locator('.book-ocr-detail-retry').waitFor({state:'visible'});
 assert.match(await page.locator('.book-ocr-detail-status').innerText(),/일시 중지/);
 const calls=await page.evaluate(()=>qaCoverOcr.calls.length);
 await page.locator('.book-ocr-detail-retry').click();
 await page.waitForFunction(n=>qaCoverOcr.calls.length>n,calls);
 assert.equal(await page.locator('#v-home .book-ocr-cover').getAttribute('data-ocr-state'),'active');
 console.log('cover progress flag, three variants, and bar fallback passed');
 console.log(shots.join('\n'));
}finally{await browser?.close();rmSync(profile,{recursive:true,force:true});server.close();}
