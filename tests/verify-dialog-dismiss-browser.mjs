import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {fixturePdf} from './helpers/pdf-scroll-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.BREEZE_DESIGN_PROOF||'/tmp/breeze-design-proof';mkdirSync(out,{recursive:true});
const server=createServer((req,res)=>{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'));try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
try{for(const engine of [chromium,webkit]){
 const browser=await engine.launchPersistentContext('',{viewport:{width:820,height:1180},hasTouch:true,serviceWorkers:'block'});try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.addInitScript(()=>{window.breezeInkIPad=true;localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));});await page.goto(url);await page.evaluate(()=>homeReady);
 await page.locator('#fileinput').setInputFiles({name:'Dialog.pdf',mimeType:'application/pdf',buffer:fixturePdf(4)});
 await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));
 for(const reader of [false,true]){
 if(reader){await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});await page.waitForSelector('.pdf-source-page canvas');await page.locator('[data-ink-toggle]').tap();await page.locator('#readback').tap();}
 for(const way of ['scrim','x','escape']){
 await page.locator('#home-add').tap();await page.waitForTimeout(300);
 if(way==='scrim')await page.touchscreen.tap(10,100);else if(way==='x')await page.locator('#am-close').tap();else await page.keyboard.press('Escape');
 assert.equal(await page.locator('#add-modal').evaluate(e=>e.open),false);
 assert.equal(await page.locator('dialog:modal').count(),0);
 await page.locator('#home-add').tap();assert.equal(await page.locator('#add-modal').evaluate(e=>e.open),true);
 await page.locator('#am-close').tap();
 await page.locator('#nav-settings').tap();assert.equal(await page.locator('#settings-modal').isVisible(),true);await page.locator('#set-close').tap();
 }
 }
 await page.evaluate(()=>show('longform'));
 for(const way of ['scrim','x','escape']){
 await page.locator('#longform-grid [data-local-book]').first().focus();await page.keyboard.press('Shift+F10');
 if(way==='scrim')await page.touchscreen.tap(10,100);else if(way==='x')await page.locator('#ed-close').tap();else await page.keyboard.press('Escape');
 assert.equal(await page.locator('dialog:modal').count(),0);
 await page.locator('#home-add').tap();await page.locator('#am-close').tap();
 }
 assert.deepEqual(errors,[]);console.log(engine.name()+': touch scrim/X/Escape and next real control passed, including PDF writing return');
 }finally{await browser.close();}
}}finally{await new Promise(r=>server.close(r));}
