// A previously installed app worker must not replace public site pages with app HTML.
import assert from 'node:assert/strict';
import {readFileSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
const root=resolve('.'),out=process.env.BREEZE_SITE_PROOF||'/tmp/breeze-site-navigation';mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer((req,res)=>{try{
 const pathname=new URL(req.url,'http://local').pathname;
 let file=resolve(root,'.'+pathname);
 assert.ok(file===root||file.startsWith(root+'/'));
 if(statSync(file).isDirectory()){
  if(!pathname.endsWith('/')){res.writeHead(301,{Location:pathname+'/'}).end();return;}
  file=resolve(file,'index.html');
 }
 res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(readFileSync(file));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'});
await context.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
await context.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
const receipts=[];
try{
 const first=await context.newPage();await first.goto(url);await first.evaluate(()=>homeReady);
 await first.evaluate(async()=>{
  const book={id:'site-navigation-kept',title:'Keep my reading',kind:'txt',paras:parseTXT('The saved reading survives public page navigation.'),addedAt:1};
  books.push(book);await bookPut(book);await navigator.serviceWorker.ready;
 });
 await first.close();
 const page=await context.newPage();await page.goto(url);await page.evaluate(()=>homeReady);
 assert.equal(await page.evaluate(()=>!!navigator.serviceWorker.controller),true,'fixture must have a real active app worker');
 for(const path of ['landing','landing/','support/','docs/privacy.html','docs/terms.html']){
  const response=await page.goto(url+path),html=await response.text();
  const expected=readFileSync(resolve(root,path.endsWith('.html')?path:path.replace(/\/?$/,'/')+'index.html'),'utf8');
  const controlled=await page.evaluate(()=>!!navigator.serviceWorker.controller);
  assert.equal(controlled,true,'site navigation must test the installed app worker');
  assert.equal(html,expected,'App worker replaced public site HTML: '+path);
  receipts.push({path,status:response.status(),controlled,sourceMatches:true});
  if(path==='landing/'){
   await page.waitForFunction(()=>document.body.dataset.state==='0');
   const web=page.locator('.lp-cta-web');assert.equal(await web.getAttribute('href'),'../');
   const box=await web.boundingBox();assert.ok(box.height>=44);
   await page.screenshot({path:resolve(out,'controlled-landing-phone.png')});
  }
 }
 await page.goto(url);await page.evaluate(()=>homeReady);
 assert.equal(await page.evaluate(()=>books.some(b=>b.id==='site-navigation-kept')),true,'public navigation lost durable reading');
 writeFileSync(resolve(out,'results.json'),JSON.stringify({receipts,bookPreserved:true,realWorker:true},null,2));
 console.log('Installed app worker: landing alias/slash, support, privacy, terms and mobile web CTA passed; durable book retained.');
}finally{await context.close();await browser.close();await new Promise(r=>server.close(r));}
