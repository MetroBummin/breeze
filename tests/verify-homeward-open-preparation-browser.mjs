import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const text=readFileSync(resolve(root,'assets/longreads/homewardbound.txt'),'utf8');
const server=createServer((req,res)=>{try{const file=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));if(!file.startsWith(root))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(file)]||'application/octet-stream');res.end(readFileSync(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
let browser;const results=[];
try{
 browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
 const context=await browser.newContext({serviceWorkers:'block'}),remote=[];
 await context.route('**/*',route=>{if(route.request().url().startsWith(url)||route.request().url().startsWith('blob:'))return route.continue();remote.push(route.request().url());return route.abort();});
 await context.addInitScript(()=>{localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));localStorage.setItem('breeze.storage-persist-asked','true');});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(url);await page.evaluate(()=>homeReady);
 const seed=async()=>page.evaluate(async raw=>{
   show('home');releaseRetainedReader();
   const book={id:'old-homeward',title:'Saved Homeward',kind:'txt',longReadId:'backroom-homeward-bound',paras:parseTXT(raw,{preserveParagraphs:true}).slice(0,61),fingerprint:'f2-test',addedAt:1};
   books=[book];positions={[book.id]:{p:.5,pi:30,dy:0,t:10,y:0,mode:'text'}};save(LS_POS,positions);await bookPut(book);return book.id;
 },text);
 await seed();let sourceRequests=0;
 await page.route('**/assets/longreads/homewardbound.txt',route=>{sourceRequests++;return route.abort();});
 await page.reload();await page.evaluate(()=>homeReady);
 assert.equal(sourceRequests,0,'launch requested a legacy edition');
 assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('boot-pending')),false);
 results.push('Home readiness does not fetch the legacy extension');
 await page.unroute('**/assets/longreads/homewardbound.txt');
 await page.evaluate(()=>openBook(books[0]));
 let state=await page.evaluate(async()=>({count:curBook.paras.length,p:positions[curBook.id].p,stored:(await localRead('books',curBook.id)).paras.length}));
 assert.equal(state.count,107);assert.equal(state.stored,107);assert.equal(state.p,30/106);
 results.push('exact source upgrades before Reader and retains the paragraph anchor');
 // The durable book checkpoint recovers a position write interrupted after commit.
 await seed();
 await page.evaluate(async()=>{const original=save;save=(key,value)=>key===LS_POS?false:original(key,value);try{await upgradeHomewardLongRead(books[0]);}finally{save=original;}});
 assert.equal(await page.evaluate(()=>load(LS_POS,{})['old-homeward'].p),.5);
 await page.reload();await page.evaluate(()=>homeReady);await page.evaluate(()=>openBook(books[0]));
 assert.equal(await page.evaluate(()=>positions['old-homeward'].p),30/106);
 results.push('committed text recovers an interrupted position write on next open');
 // Edited local copies are not replaced, even when their paragraph count matches.
 await seed();await page.evaluate(async()=>{books[0].paras[10]='My edited paragraph.';await bookPut(books[0]);await upgradeHomewardLongRead(books[0]);});
 assert.equal(await page.evaluate(()=>books[0].paras.length),61);
 results.push('edited legacy source remains unchanged');
 await seed();await page.evaluate(async()=>{
   const original=localTransaction;
   localTransaction=async(db,stores,mode,run)=>{if(stores==='books'&&mode==='readwrite')throw Error('fixture transaction abort');return original(db,stores,mode,run);};
   try{await upgradeHomewardLongRead(books[0]);}finally{localTransaction=original;}
 });
 assert.equal(await page.evaluate(()=>books[0].paras.length),61);
 assert.equal(await page.evaluate(()=>positions['old-homeward'].p),.5);
 assert.equal(await page.evaluate(async()=>(await localRead('books','old-homeward')).paras.length),61);
 results.push('failed durable commit preserves local source and progress');
 // A blocked fetch is bounded, and late completion must never alter a live Reader.
 await seed();let held;
 await page.route('**/assets/longreads/homewardbound.txt',route=>{held=route;});
 const started=Date.now();await page.evaluate(()=>openBook(books[0]));
 assert.ok(Date.now()-started<7000,'optional fetch did not time out');
 assert.equal(await page.evaluate(()=>curBook.paras.length),61);
 await page.unroute('**/assets/longreads/homewardbound.txt');
 if(held)await held.abort().catch(()=>{});
 results.push('source timeout opens the existing local chapter');
 for(const action of ['navigation','account','delete','replace']){
   await seed();held=null;
   await page.route('**/assets/longreads/homewardbound.txt',route=>{held=route;});
   await page.evaluate(()=>{window.homewardOpenJob=openBook(books[0]);});
   for(let i=0;i<100&&!held;i++)await page.waitForTimeout(10);
   assert.ok(held,'source request did not start');
   await page.evaluate(async mode=>{
     if(mode==='navigation')show('vocab');
     if(mode==='account')syncSessionEpoch++;
     if(mode==='delete'){await bookDel(books[0].id);books=[];}
     if(mode==='replace'){const replacement={...books[0],title:'Replacement',paras:['Replacement content.']};await bookPut(replacement);books=[replacement];}
   },action);
   await held.fulfill({status:200,body:text,contentType:'text/plain'}).catch(()=>{});
   await page.evaluate(()=>window.homewardOpenJob);
   assert.notEqual(await page.evaluate(()=>activeAppView()),'read',action+' reopened Reader');
   const stored=await page.evaluate(()=>localRead('books','old-homeward'));
   assert.equal(stored?.paras.length,action==='delete'?undefined:action==='replace'?1:61,action+' changed durable source');
   await page.unroute('**/assets/longreads/homewardbound.txt');
   results.push(action+' invalidates obsolete preparation');
 }
 for(const action of ['navigation','account']){
   await seed();await page.evaluate(async mode=>{
     const original=localTransaction;
     localTransaction=async(db,stores,access,run)=>{
       const result=await original(db,stores,access,run);
       if(stores==='books'&&access==='readwrite'){
         if(mode==='navigation')show('vocab');else syncSessionEpoch++;
       }
       return result;
     };
     try{await openBook(books[0]);}finally{localTransaction=original;}
   },action);
   assert.notEqual(await page.evaluate(()=>activeAppView()),'read');
   assert.equal(await page.evaluate(async()=>(await localRead('books','old-homeward')).paras.length),107);
   assert.equal(await page.evaluate(()=>books[0].paras.length),action==='navigation'?107:61);
   assert.equal(await page.evaluate(()=>positions['old-homeward'].p),action==='navigation'?30/106:.5);
   results.push('post-commit '+action+' preserves ownership without reopening Reader');
 }
 // Missing lookup data preserves local reading without requesting paid lookup.
 await seed();await page.evaluate(async()=>{const original=ensureHomewardLookupData;ensureHomewardLookupData=async()=>{throw Error('offline lookup data');};try{await openBook(books[0]);}finally{ensureHomewardLookupData=original;}});
 assert.equal(await page.evaluate(()=>activeAppView()),'read');
 assert.equal(remote.filter(value=>value.includes('/functions/v1/dict')).length,0);
 assert.deepEqual(errors,[]);
 results.push('lookup-data failure preserves reading without a lookup request');
 const output={engine:engine.name(),version:browser.version(),results};
 if(process.env.BREEZE_HOMEWARD_PREPARATION_RESULTS)writeFileSync(process.env.BREEZE_HOMEWARD_PREPARATION_RESULTS,JSON.stringify(output,null,2));
 console.log(JSON.stringify(output));
}finally{await browser?.close();server.close();}
