/* Full-text draft import through the normal TXT/IndexedDB/Reader path.
   No catalog, illustration integration or remote dictionary/provider calls. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 try{if(!path.startsWith(root))throw Error();res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
 await page.goto(url);await page.evaluate(()=>homeReady);
 for(const slug of ['final-problem','hound-of-the-baskervilles']){
  const text=readFileSync(resolve(root,'assets/longreads/'+slug+'.txt'),'utf8'),paras=text.trim().split('\n\n');
  const m=JSON.parse(readFileSync(resolve(root,'docs/content/'+slug+'/manifest.json'),'utf8'));
  const id=await page.evaluate(async({text,slug,title})=>{
   const result=await importFile(new File([text],title+'.txt',{type:'text/plain'}),{author:'Arthur Conan Doyle',longReadId:'sherlock-holmes-'+slug},{preserveParagraphs:true});
   return result.bookId;
  },{text,slug,title:m.title});
  assert.deepEqual(await page.evaluate(id=>books.find(b=>b.id===id).paras,id),paras,'normal import retains every canonical paragraph');
  const elapsed=await page.evaluate(async id=>{const start=performance.now();await openBook(books.find(b=>b.id===id));return performance.now()-start;},id);
  await page.waitForFunction(()=>!readerPositionPending());
  assert.equal(await page.locator('#rtext [data-pi]').count(),paras.length,'all chapters and ending render through existing Reader');
  await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>0);
  assert.ok(await page.locator('#rtext .w').count()>0,'visible prose uses normal lookup spans; distant pages retain lazy tokenization');
  assert.equal(await page.locator('#rtext [data-pi]').last().innerText(),paras.at(-1));
  const boundary=m.chapters.length?m.chapters.at(-1).paragraph1Based-1:Math.floor(paras.length*.8);
  await page.evaluate(({id,boundary})=>{show('home');positions[id]={p:boundary/(books.find(b=>b.id===id).paras.length-1),pi:boundary,y:0,mode:'text',t:Date.now()};save(LS_POS,positions);}, {id,boundary});
  await page.reload();await page.evaluate(()=>homeReady);
  assert.deepEqual(await page.evaluate(id=>books.find(b=>b.id===id).paras,id),paras,'real database reopen retains full text');
  await context.setOffline(true);
  await page.evaluate(async id=>openBook(books.find(b=>b.id===id)),id);await page.waitForFunction(()=>!readerPositionPending());
  assert.ok(Math.abs(await page.evaluate(()=>captureAnchor().pi)-boundary)<=1,'offline Reader restores the saved late-story paragraph');
  assert.equal(await page.locator('#rtext [data-pi]').count(),paras.length);
  await context.setOffline(false);await page.evaluate(()=>show('home'));
  console.log(`${engine.name()}: ${slug}: ${paras.length} complete paragraphs, normal import/lookup spans/real-IDB reopen/offline late-position restore; local open ${Math.round(elapsed)}ms (not device evidence)`);
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();await new Promise(r=>server.close(r));}
