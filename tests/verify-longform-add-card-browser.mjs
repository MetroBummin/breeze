import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from 'playwright';
const root=resolve(new URL('..',import.meta.url).pathname);
const server=createServer((req,res)=>{const p=resolve(root,'.'+(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
try{for(const engine of [chromium,webkit]){const browser=await engine.launch();try{
 const page=await browser.newPage({viewport:{width:820,height:1180},serviceWorkers:'block'});
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());await page.goto(url);
 await page.evaluate(()=>{books=[];renderAllBookViews();show('longform');});
 for(const width of [390,820,1180]){await page.setViewportSize({width,height:1180});
 assert.equal(await page.locator('#longform-grid .bookcard.add').count(),1);
 assert.equal(await page.locator('#longform-grid > :last-child .bookcard.add').count(),1);
 assert.equal(await page.locator('#longform-grid .bookcard.add').evaluate(e=>getComputedStyle(e).borderStyle),'dashed');}
 const chooser=page.waitForEvent('filechooser');await page.locator('#longform-grid .bookcard.add').click();
 await (await chooser).setFiles({name:'card-test.txt',mimeType:'text/plain',buffer:Buffer.from('A reader keeps a book. This is the saved original text.')});
 await page.waitForFunction(()=>books.some(b=>b.kind==='txt'));
 await page.evaluate(()=>{renderAllBookViews();show('longform');});
 const check=async()=>{assert.equal(await page.locator('#longform-grid .bookcard.add').count(),1);
 const rects=await page.locator('#longform-grid .bookcard').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return {w:r.width,h:r.height,radius:s.borderRadius};}));
 const add=rects.at(-1);assert.ok(rects.slice(0,-1).every(r=>Math.abs(r.w-add.w)<1&&Math.abs(r.h-add.h)<1&&r.radius===add.radius));};
 await check();await page.reload();await page.waitForFunction(()=>books.some(b=>b.kind==='txt'));await page.evaluate(()=>show('longform'));await check();
 console.log(engine.name()+': empty/imported/reloaded/resized single dashed add card passed');
 }finally{await browser.close();}}}finally{server.close();}
