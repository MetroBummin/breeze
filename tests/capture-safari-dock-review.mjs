/* Actual browser review frames and geometry. No native-device claims. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {fixturePdf} from './helpers/pdf-scroll-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),proof=process.env.BREEZE_DOCK_PROOF||'/tmp/breeze-safari-dock';mkdirSync(proof,{recursive:true});
const server=createServer((req,res)=>{try{const p=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));if(!p.startsWith(root))throw Error();res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE}),measurements=[],errors=[];
try{
 for(const [device,width,height] of [['iphone',390,844],['ipad-portrait',820,1180],['ipad-landscape',1180,820],['narrow',320,568],['desktop',1440,1000]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,hasTouch:true,isMobile:true,serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route(/^https?:\/\//,r=>r.request().url().startsWith(url)?r.continue():r.abort());await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1','"done"'));if(width>=700)await page.addInitScript(()=>{window.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'android',registerPlugin:()=>({getCapabilities:async()=>({tablet:true})})};});await page.goto(url);await page.evaluate(()=>homeReady);
  const passage='The morning light filled the quiet room. A gentle breeze moved through the trees, and the city was waking slowly. Holmes turned from the window and placed the letter on the table. There was something remarkable about this ordinary morning.\n\n';
  await page.locator('#fileinput').setInputFiles({name:'A Study in Scarlet.txt',mimeType:'text/plain',buffer:Buffer.from(passage.repeat(50))});await page.waitForFunction(()=>books.some(b=>b.title==='A Study in Scarlet'));
  await page.evaluate(async()=>{await openBook(books.find(b=>b.title==='A Study in Scarlet'));words=Object.fromEntries([['observe','관찰하다'],['evidence','증거'],['remarkable','놀라운'],['peculiar','특이한'],['hesitate','망설이다'],['sufficient','충분한'],['sensible','분별 있는'],['deduce','추론하다'],['reliable','믿을 수 있는'],['emerge','나타나다']].map(([word,ko],i)=>[word,{word,ko,book:'A Study in Scarlet',status:1+i%3,addedAt:i+1}]));saveWords();renderVocab();});
  const measure=async(view,dark,pdf=false)=>page.evaluate(({view,dark,pdf})=>{const ids=view==='home'?['nav-vocab','home-resume','home-add']:view==='vocab'?['wordbook-home','wordbook-review','wordbook-add']:pdf?['reader-navigation','readpill','aafab']:['readback','readpill','aafab'];const rects=ids.map(id=>{const r=document.getElementById(id).getBoundingClientRect();return{id,x:r.x,y:r.y,width:r.width,height:r.height,bottom:innerHeight-r.bottom};});return{view,dark,pdf,width:innerWidth,height:innerHeight,rects,gaps:[rects[1].x-rects[0].x-rects[0].width,rects[2].x-rects[1].x-rects[1].width]};},{view,dark,pdf});
  for(const dark of [false,true]){
   let baseline;
   for(const view of ['home','vocab','read']){
    await page.evaluate(async({view,dark})=>{darkMode=dark;applyDark();if(view==='read')await openBook(books.find(b=>b.title==='A Study in Scarlet'));else show(view);setReaderChrome(false);}, {view,dark});if(view==='read')await page.waitForFunction(()=>document.getElementById('rtext').textContent.includes('The morning light'));await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(400);
    const m=await measure(view,dark);m.device=device;for(const r of m.rects){assert.ok(r.x>=0&&r.x+r.width<=width+1);assert.ok(r.width>=44&&r.height>=44);assert.ok(Math.abs(r.height-48)<1);}assert.ok(m.gaps.every(g=>Math.abs(g-8)<1));assert.ok(m.rects[2].x+m.rects[2].width-m.rects[0].x<=512.1);
    const geometry=m.rects.map(({id,...r})=>r);if(baseline)assert.deepEqual(geometry,baseline,'Home/Wordbook/Reader expanded geometry must remain shared');else baseline=geometry;
    measurements.push(m);
    if(!['narrow','desktop'].includes(device))await page.screenshot({path:`${proof}/web-preview-${device}-${view==='vocab'?'wordbook':view==='read'?'reader':view}-${dark?'dark':'light'}.png`});
   }
   await page.evaluate(()=>setReaderChrome(true));await page.waitForTimeout(400);assert.equal(await page.locator('#readback').evaluate(n=>n.inert),true);assert.equal(await page.locator('#readpill').evaluate(n=>n.getBoundingClientRect().height),34);await page.locator('#readpill-title').click();await page.waitForTimeout(400);assert.equal(await page.locator('#aafab').evaluate(n=>n.inert),false);
  }
  await page.locator('#fileinput').setInputFiles({name:'Dock pages.pdf',mimeType:'application/pdf',buffer:fixturePdf(2)});await page.waitForFunction(()=>books.some(b=>b.title==='Dock pages'));await page.evaluate(async()=>{await openBook(books.find(b=>b.title==='Dock pages'));await switchReaderMode('original');setReaderChrome(false);});await page.waitForFunction(()=>originalSession?.kind==='pdf'&&!readerPositionPending());await page.waitForTimeout(400);
  const pdf=await measure('read',true,true);pdf.device=device;assert.ok(pdf.gaps.every(g=>Math.abs(g-8)<1));assert.equal(pdf.rects[0].width,96);assert.equal(pdf.rects[0].height,48);measurements.push(pdf);
  await page.locator('#pdf-page-button').click();await page.waitForTimeout(400);const sidebar=await page.locator('#pdf-page-control').boundingBox();assert.ok(Math.abs(sidebar.x)<1,'sidebar keeps readmain edge');assert.ok(Math.abs(sidebar.y)<1,'sidebar keeps viewport top');await page.locator('#pdf-navigation-toggle').click();await page.waitForTimeout(400);
  // Writing retains its existing 44px targets and horizontal overflow policy.
  if(width>=700){await page.locator('.ink-pill-entry').click();await page.waitForTimeout(400);const ink=await page.locator('.ink-pill-toolbar .ink-pill-control').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{width:r.width,height:r.height};}));assert.ok(ink.every(r=>r.width===44&&r.height===44));assert.equal(await page.locator('.ink-pill-toolbar').evaluate(n=>getComputedStyle(n).overflowX),'auto');}else assert.equal(await page.locator('.ink-pill-entry').isVisible(),false);
  await context.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(`${proof}/geometry.json`,JSON.stringify({platform:'Chromium touch emulation; CSS pixels, safe-area env=0; not native iOS',measurements,errors},null,2)+'\n');console.log('Shared geometry, light/dark, compact controls, PDF sidebar and 44px writing policy passed at five viewports.');
}finally{await browser.close();server.close();}
