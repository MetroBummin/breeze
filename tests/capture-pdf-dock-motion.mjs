/* Actual browser recordings of normal PDF scroll-collapse. Not native iOS QA. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from './helpers/bounded-playwright.mjs';
import {fixturePdf} from './helpers/pdf-scroll-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),proof=process.env.BREEZE_PDF_DOCK_PROOF||'/tmp/breeze-pdf-dock-motion';mkdirSync(proof,{recursive:true});
const server=createServer((req,res)=>{try{const p=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));if(!p.startsWith(root))throw Error();res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE}),evidence=[];
try{for(const [device,width,height] of [['iphone',390,844],['ipad',820,1180]]){
 const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:2,serviceWorkers:'block',recordVideo:{dir:proof,size:{width,height}}}),page=await context.newPage();
 await page.route(/^https?:\/\//,r=>r.request().url().startsWith(url)?r.continue():r.abort());await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1','"done"'));await page.goto(url);await page.evaluate(()=>homeReady);
 await page.locator('#fileinput').setInputFiles({name:'PDF reading preview.pdf',mimeType:'application/pdf',buffer:fixturePdf(8)});await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});
 await page.waitForFunction(()=>originalSession?.kind==='pdf'&&!readerPositionPending()&&!chromePinned&&Date.now()>chromeHoldUntil&&Date.now()>readerScrollPauseUntil);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(800);
 const cdp=await context.newCDPSession(page),scroll=async forward=>{const x=width*.85,from=height*(forward?.7:.3),to=height*(forward?.3:.65);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:from,id:1}]});for(let i=1;i<=16;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:from+(to-from)*i/16,id:1}]});await page.waitForTimeout(25);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
 const sample=label=>page.evaluate(label=>({label,scroll:readerScrollTop(),collapsed:document.body.classList.contains('chrome-hidden'),pillHeight:document.getElementById('readpill').getBoundingClientRect().height,navigationInert:document.getElementById('reader-navigation').inert,settingsInert:document.getElementById('aafab').inert}),label);
 for(const dark of [false,true]){
  const theme=dark?'dark':'light';await page.evaluate(d=>{darkMode=d;applyDark();},dark);await page.waitForTimeout(300);
  assert.equal(await page.locator('#readback').isVisible(),true);assert.equal(await page.locator('#pdf-page-button').isVisible(),true);await page.screenshot({path:`${proof}/web-preview-${device}-pdf-two-buttons-${theme}.png`});evidence.push({device,theme,...await sample('expanded')});
  await scroll(true);await page.waitForFunction(()=>document.body.classList.contains('chrome-hidden'));await page.waitForTimeout(650);const collapsed=await sample('collapsed');assert.equal(collapsed.pillHeight,34);assert.equal(collapsed.navigationInert,true);assert.equal(collapsed.settingsInert,true);await page.screenshot({path:`${proof}/web-preview-${device}-pdf-collapsed-${theme}.png`});evidence.push({device,theme,...collapsed});
  await page.waitForTimeout(800);await scroll(false);await page.waitForFunction(()=>!document.body.classList.contains('chrome-hidden'));await page.waitForTimeout(800);evidence.push({device,theme,...await sample('scroll-expanded')});
 }
 const video=page.video();await context.close();await video.saveAs(`${proof}/web-preview-${device}-pdf-scroll.webm`);
 console.log(`${device}: actual scroll collapsed and expanded; two-button/collapsed screenshots and browser video saved`);
}writeFileSync(`${proof}/motion-evidence.json`,JSON.stringify({platform:'Actual Chromium CDP touchscreen browser recording; not native iOS',policy:'Existing scroll owner and thresholds; no forced chrome classes or animation frames',evidence},null,2)+'\n');}finally{await browser.close();server.close();}
