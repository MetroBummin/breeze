import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {pdfGeometryFixture} from './helpers/pdf-geometry-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer((req,res)=>{try{const p=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));if(!p.startsWith(root))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/`;
const output=process.env.BREEZE_QA_OUTPUT;if(output)mkdirSync(output,{recursive:true});
try{for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){const profile=mkdtempSync(resolve(tmpdir(),'breeze-polish-'));
 const browser=await engine.launchPersistentContext(profile,{headless:true,hasTouch:true,serviceWorkers:'block'});try{
 for(const width of [390,820]){
  const page=await browser.newPage();await page.setViewportSize({width,height:1024});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));});
  let resolveSummary,summaryArrived;
  await page.route('**/*',r=>{if(r.request().url().startsWith(base)||r.request().url().startsWith('blob:'))return r.continue();if(r.request().url().includes('/functions/v1/article-preview'))return new Promise(resolve=>{resolveSummary=()=>r.fulfill({contentType:'application/json',body:JSON.stringify({summaryKo:'콜로라도의 한 업체가 오염된 마리화나 베이프 제품을 자발적으로 회수했습니다. 규제 시행이 지연되는 가운데 제품 안전을 어떻게 관리하고 있는지 살펴봅니다.'})}).then(resolve);summaryArrived();});return r.abort();});
  await page.goto(base);await page.evaluate(()=>homeReady);
  for(const dark of [false,true]){
   await page.evaluate(d=>{localStorage.removeItem(ARTICLE_PREVIEW_CACHE);document.documentElement.classList.toggle('dark',d);document.body.classList.toggle('dark',d);positions={};books=[{id:'polish-'+d,kind:'article',title:'Colorado Marijuana Company Voluntarily Recalls Dozens of Contaminated Products Amid State Regulatory Delays',site:'ProPublica',sourceUrl:'https://example.com/polish/'+d,paras:['A Colorado company voluntarily recalled contaminated marijuana vape products. State regulatory delays have raised questions about product safety oversight.']}];renderCasualLibrary();show('casuals');},dark);
   const requestReady=new Promise(resolve=>{summaryArrived=resolve;});
   await page.locator('#casual-grid .casual').first().tap();
   await requestReady;
   await page.waitForFunction(()=>document.querySelector('#article-preview').dataset.metadata==='loading');
   await page.waitForFunction(()=>articlePreviewJobs.size===1);
   assert.equal(await page.locator('.ap-summary-card').getAttribute('aria-busy'),'true');
   await page.locator('.ap-close').focus();
   assert.equal(await page.locator('.ap-close').evaluate(n=>getComputedStyle(n).outlineStyle),'none','touch autofocus has no sticky ring');
   await page.keyboard.press('Tab');await page.locator('.ap-close').focus();
   assert.notEqual(await page.locator('.ap-close').evaluate(n=>getComputedStyle(n).outlineStyle),'none','keyboard focus remains visible');
   await resolveSummary();await page.waitForFunction(()=>document.querySelector('#article-preview').dataset.metadata==='ready');
   assert.equal(await page.locator('.ap-summary-card').getAttribute('aria-busy'),'false');
   assert.equal(await page.locator('.ap-start').evaluate(n=>getComputedStyle(n).backgroundColor),await page.locator('.ap-summary-card').evaluate(n=>getComputedStyle(n).backgroundColor),'CTA shares neutral action tone');
   await page.locator('.ap-summary-card').scrollIntoViewIfNeeded();
   await page.locator('.ap-summary-heading').tap();
   if(output)await page.screenshot({path:resolve(output,`preview-${engine.name()}-${width}-${dark?'dark':'light'}.png`)});
   await page.locator('.ap-close').tap();
  }
  // The native iPad gate, rather than screen width, controls the actual toolbar.
  await page.evaluate(()=>{window.breezeInkIPad=true;});
  await page.locator('#fileinput').setInputFiles({name:'polish.pdf',mimeType:'application/pdf',buffer:pdfGeometryFixture()});await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));
  await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});
  try{await page.waitForSelector('.pdf-source-page .pdf-ink-layer');}catch(e){console.log('PDF DIAG',await page.evaluate(()=>({flag:window.breezeInkIPad,body:document.body.className,book:curBook?.kind,session:originalSession&&{kind:originalSession.kind,hash:originalSession.hash,settled:[...originalSession.settled]},page:document.querySelector('#original-content')?.textContent,tools:!!document.querySelector('.ink-pill-entry')})),errors);throw e;}
  await page.evaluate(()=>expandReaderChrome());
  await page.waitForSelector('.ink-pill-entry');
  await page.locator('.ink-pill-entry').tap();await page.locator('[data-ink-mode="pen"]').waitFor();
  assert.equal(await page.locator('#readpill-progress').isVisible(),false);
  const paperBox=await page.locator('.pdf-source-page').first().boundingBox();
  await page.locator('[data-ink-mode="pen"]').tap();
  assert.equal(await page.locator('#pdf-ink-settings').isVisible(),true);
  assert.equal(await page.locator('[data-ink-color]').count(),3);
  assert.equal(await page.locator('[data-ink-width]').count(),3);
  const options=await page.locator('#pdf-ink-settings').boundingBox(),dock=await page.locator('#readpill').boundingBox();
  assert(options.y+options.height<dock.y&&options.x>=0&&options.x+options.width<=width,'options fit above the pill');
  assert.deepEqual(await page.locator('.pdf-source-page').first().boundingBox(),paperBox,'options never move the PDF');
  await page.waitForTimeout(220);
  if(output)await page.screenshot({path:resolve(output,`pen-options-${engine.name()}-${width}.png`)});
  await page.locator('[data-ink-color="#c43d3d"]').tap();
  assert.equal(await page.locator('[data-ink-color="#c43d3d"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-ink-mode="erase"]').tap();
  assert.equal(await page.locator('[data-ink-mode="erase"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#pdf-ink-settings').isVisible(),false);
  await page.locator('[data-ink-mode="erase"]').tap();
  assert.equal(await page.locator('[data-ink-panel="erase"]').isVisible(),true);
  assert.equal(await page.locator('[data-ink-panel="pen"]').isVisible(),false);
  assert.equal(await page.locator('[data-ink-radius]').count(),3);
  await page.locator('[data-ink-radius="16"]').tap();
  assert.equal(await page.locator('[data-ink-radius="16"]').getAttribute('aria-pressed'),'true');
  await page.waitForTimeout(220);
  if(output)await page.screenshot({path:resolve(output,`eraser-options-${engine.name()}-${width}.png`)});
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#pdf-ink-settings').isVisible(),false);
  await page.locator('[data-ink-mode="pen"]').tap();await page.locator('[data-ink-mode="pen"]').tap();

  const entry=await page.locator('.ink-pill-entry').boundingBox(),pill=await page.locator('#readpill').boundingBox();
  assert(entry.x>=pill.x&&entry.x+entry.width<=pill.x+pill.width+1,'read switch stays reachable in narrow iPad split views');
  await page.locator('[data-ink-redo]').scrollIntoViewIfNeeded();
  await page.evaluate(()=>toast('검증 알림'));await page.waitForTimeout(700);
  assert.equal(await page.locator('#reader-notice').isVisible(),false,'notice never overlays drawing controls');
  await page.locator('.ink-pill-entry').tap();assert.notEqual(await page.locator('#readpill-progress').evaluate(n=>getComputedStyle(n).display),'none');
  await page.evaluate(()=>{window.breezeInkIPad=false;document.body.classList.toggle('qa-gate');});
  assert.equal(await page.locator('.ink-pill-entry').isVisible(),false);
  assert.deepEqual(errors.filter(e=>!e.includes('ResizeObserver loop')),[]);await page.close();
 }
 console.log(`${engine.name()}: touch/keyboard focus, summary loading/ready, neutral themes, production ink pill, split-view and notice ownership PASS`);
}finally{await browser.close();rmSync(profile,{recursive:true,force:true});}}}finally{server.close();}
