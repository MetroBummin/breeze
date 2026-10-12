/* Paired real browser renders, independent hit regions and safe-area fixtures.
   Private reference images are unavailable here; this is not native Safari proof. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {fixturePdf} from './helpers/pdf-scroll-fixture.mjs';
const root=(process.env.BREEZE_OPTICAL_SOURCE_ROOT||fileURLToPath(new URL('../',import.meta.url))).replace(/\/$/,'')+'/';
const before=process.env.BREEZE_OPTICAL_PHASE==='before';
const output=process.env.BREEZE_OPTICAL_OUTPUT||'/tmp/breeze-safari-optical-pdf-'+(before?'before':'after');mkdirSync(output,{recursive:true});
const server=createServer((req,res)=>{try{const p=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));if(!p.startsWith(root))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404).end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});const cases=[],errors=[];let currentPage,diagnosticLast;
try{for(const [device,width,height] of [['phone',390,844],['ipad-portrait',820,1180],['ipad-landscape',1180,820],['narrow',320,568],['phone-landscape',844,390],['desktop',1440,900]]){
 const tablet=device.startsWith('ipad');
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,hasTouch:true,isMobile:true,serviceWorkers:'block'}),page=await context.newPage();
 currentPage=page;
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.addInitScript(tablet=>{localStorage.setItem('breeze.onboarding.v1','"done"');if(tablet)window.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'android',registerPlugin:()=>({getCapabilities:async()=>({tablet:true})})};},tablet);
 await page.goto(url);await page.evaluate(()=>homeReady);await page.locator('#fileinput').setInputFiles({name:'Optical review.pdf',mimeType:'application/pdf',buffer:fixturePdf(4)});await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));
 await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');readerNotices.reset();expandReaderChrome();});await page.waitForFunction(()=>originalSession?.kind==='pdf'&&!readerPositionPending());await page.waitForTimeout(450);
 const cdp=await context.newCDPSession(page);
 const shot=async(theme,state)=>page.screenshot({path:`${output}/${device}-${theme}-${state}.png`});
 const measure=()=>page.evaluate(()=>{
  const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  const icon=id=>{const n=document.querySelector(id),s=getComputedStyle(n),r=n.getBoundingClientRect();return {width:r.width,height:r.height,stroke:s.strokeWidth,cap:s.strokeLinecap};};
  const n=document.getElementById('pdf-page-control'),s=getComputedStyle(n);
  const nav=rect('reader-navigation'),pill=rect('readpill'),settings=rect('aafab'),back=rect('readback'),pages=rect('pdf-page-button');
  return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},nav,pill,settings,back,pages,gaps:[pill.x-nav.right,settings.x-pill.right],bottom:innerHeight-nav.bottom,
   backIcon:icon('#readback svg'),modeIcon:icon('#modefab svg'),textPath:document.querySelector('#modefab .mf-text path').getAttribute('d'),
   material:{background:s.backgroundColor,image:s.backgroundImage,line:s.borderTopColor,shadow:s.boxShadow,filter:s.backdropFilter,radius:s.borderRadius},
   seamOverlap:Math.max(0,back.right-pages.x),hitOwners:[back,pages].map(r=>[r.x+.25,r.x+r.width/2,r.right-.25].map(x=>document.elementFromPoint(x,r.y+r.height/2)?.closest('button')?.id))};
 });
 for(const dark of [false,true]){
  const theme=dark?'dark':'light';await page.evaluate(d=>{darkMode=d;applyDark();readerNotices.reset();expandReaderChrome();},dark);await page.waitForTimeout(400);
  const m=await measure();assert.equal(m.nav.width,before?96:88);assert.equal(m.nav.height,48);assert.equal(m.pill.height,48);assert.equal(m.settings.width,48);assert.equal(m.settings.height,48);
  assert.ok(m.gaps.every(g=>Math.abs(g-8)<1));assert.ok(Math.abs(m.pill.x+m.pill.width/2-(m.nav.right+m.settings.x)/2)<1);assert.ok(m.settings.right-m.nav.x<=512.1);
  assert.equal(m.back.width,before?48:44);assert.equal(m.pages.width,before?48:44);assert.ok(m.back.height>=44&&m.pages.height>=44);assert.equal(m.backIcon.width,before?20:32);assert.equal(m.backIcon.stroke,before?'1.8px':'2.1px');assert.equal(m.backIcon.cap,'round');assert.equal(m.modeIcon.width,before?21:24);assert.equal((m.textPath.match(/M/g)||[]).length,before?4:3);
  if(!before){assert.equal(m.seamOverlap,0,'independent44px hit rectangles');assert.deepEqual(m.hitOwners,[['readback','readback','readback'],['pdf-page-button','pdf-page-button','pdf-page-button']],'both target edges and centers hit the intended owner');}
  await shot(theme,'pdf-reading');cases.push({device,theme,state:'reading',...m});
  const point={x:m.pages.x+m.pages.width/2,y:m.pages.y+m.pages.height/2};await page.mouse.move(point.x,point.y);await page.mouse.down();assert.equal(await page.locator('#pdf-page-button').evaluate(n=>n.matches(':active')),true,'trusted pointer renders pressed state');await shot(theme,'pdf-pressed');await page.mouse.up();await page.waitForFunction(()=>document.getElementById('pdf-page-button').getAttribute('aria-expanded')==='true');
  await page.locator('#pdf-navigation-toggle').tap();await page.waitForFunction(()=>!document.getElementById('pdf-page-control').classList.contains('pdf-navigation-closing'));await page.waitForTimeout(100);
  // The browser reports a2px touch footprint and rounds the synthesized click.
  // A quarter-pixel seam contact straddles both adjacent targets. Use the first
  // whole pixel whose footprint is inside one target; subpixel DOM edge-owner
  // and exact44px/no-overlap assertions above remain independent and strict.
  diagnosticLast={device,theme,phase:'fresh edge touch after pointer close',point:{x:before?point.x:Math.ceil(m.pages.x)+1,y:point.y},initial:m,current:await measure()};
  await page.evaluate(()=>{window.qaOpticalContacts=[];for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,event=>qaOpticalContacts.push({type,target:event.target.closest?.('button')?.id,trusted:event.isTrusted,x:event.clientX,y:event.clientY,width:event.width,height:event.height}),{capture:true,once:true});});
  await page.touchscreen.tap(diagnosticLast.point.x,point.y);assert.equal(await page.evaluate(()=>qaOpticalContacts.find(e=>e.type==='pointerdown')?.target),'pdf-page-button','trusted edge touch has the intended owner');await page.waitForFunction(()=>document.getElementById('pdf-page-button').getAttribute('aria-expanded')==='true');await page.locator('#pdf-navigation-toggle').tap();await page.waitForFunction(()=>!document.getElementById('pdf-page-control').classList.contains('pdf-navigation-closing'));
  if(!before){await page.touchscreen.tap(Math.floor(m.back.right)-1,point.y);await page.waitForFunction(()=>activeAppView()==='home'&&!homeReturnTransition);await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');expandReaderChrome();});await page.waitForFunction(()=>!readerPositionPending());await page.waitForTimeout(400);}
  if(tablet){await page.locator('.ink-pill-entry').tap();await page.waitForTimeout(400);assert.equal(await page.locator('#readpill').evaluate(n=>n.getBoundingClientRect().height),48);assert.equal(await page.locator('.ink-pill-toolbar').evaluate(n=>getComputedStyle(n).overflowX),'auto');assert.equal(await page.locator('.ink-pill-toolbar .ink-pill-control').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().width===44&&n.getBoundingClientRect().height===44)),true);await page.evaluate(()=>setReaderChrome(true));assert.equal(await page.evaluate(()=>document.body.classList.contains('chrome-hidden')),false,'writing stays expanded');
   const undo=page.locator('[data-ink-undo]');assert.equal(await undo.isDisabled(),true,'empty writing has a genuinely disabled undo');const disabled=await undo.evaluate(n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height,opacity:getComputedStyle(n).opacity};});assert.deepEqual(disabled,{width:44,height:44,opacity:'0.64'});cases.push({device,theme,state:'writing-disabled-undo',...disabled});await shot(theme,'pdf-writing');await page.locator('.ink-pill-entry').tap();await page.waitForTimeout(400);}
  await page.evaluate(()=>setReaderChrome(true));await page.waitForTimeout(400);assert.equal(await page.locator('#readpill').evaluate(n=>n.getBoundingClientRect().height),34);assert.equal(await page.locator('#reader-navigation').evaluate(n=>n.inert),true);assert.equal(await page.locator('#aafab').evaluate(n=>n.inert),true);await shot(theme,'pdf-collapsed');await page.locator('#readpill-title').tap();await page.waitForTimeout(400);
 }
 if(device==='phone'){
  let safeAreaMethod=null;for(const method of ['Emulation.setSafeAreaInsetsOverride','Emulation.setSafeAreaInsets'])try{await cdp.send(method,{insets:{bottom:34}});safeAreaMethod=method;break;}catch(error){if(!/wasn't found|not found|Unknown method/.test(error.message))throw error;}
  if(safeAreaMethod){await page.waitForTimeout(200);const m=await measure();assert.ok(Math.abs(m.bottom-34)<1,'actual emulated env safe-area footer');await shot('dark','safe-area-34');cases.push({device,state:'safe-area-34',method:safeAreaMethod,...m});await cdp.send(safeAreaMethod,{insets:{bottom:0}});}
  else cases.push({device,state:'safe-area',supported:false,note:'Protocol unavailable; no native safe-area claim'});
 }
 if(tablet){for(const size of [{width:820,height:1180},{width:1180,height:820},{width:820,height:1180}]){await page.setViewportSize(size);await page.waitForFunction(()=>!readerPositionPending());await page.waitForTimeout(350);const m=await measure();assert.equal(m.nav.width,before?96:88);assert.equal(m.nav.height,48);assert.ok(m.gaps.every(g=>Math.abs(g-8)<1));cases.push({device,state:'repeated-rotation',...m});}}
 await context.close();
}
assert.deepEqual(errors,[]);rmSync(`${output}/failure.json`,{force:true});rmSync(`${output}/failure.png`,{force:true});writeFileSync(`${output}/optical-geometry.json`,JSON.stringify({phase:before?'before':'after',sourceRoot:root,platform:'Actual Chromium touch browser renders, DPR2 CSS pixels; mocked tablet capability; not native iOS or Safari',privateReferencePixelsSeen:false,cases,errors},null,2)+'\n');console.log(`${before?'before':'after'}: six viewports/both themes, real pressed/touch, PDF reading/collapse/writing, safe-area and repeated rotation passed`);
}catch(error){
 let state=null;try{state=await currentPage.evaluate(()=>({view:activeAppView(),body:document.body.className,contacts:window.qaOpticalContacts,ready:!readerPositionPending(),originalPinch:originalPinchBusy(),navigation:document.getElementById('pdf-page-button').getAttribute('aria-expanded'),closing:document.getElementById('pdf-page-control').className,book:curBook?.id}));await currentPage.screenshot({path:`${output}/failure.png`});}catch{}
 writeFileSync(`${output}/failure.json`,JSON.stringify({error:String(error),stack:error.stack,diagnosticLast,state,cases},null,2)+'\n');throw error;
}finally{await browser.close();server.close();}
