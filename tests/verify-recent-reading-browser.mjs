import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {fixturePdf} from './helpers/pdf-scroll-fixture.mjs';
const root=resolve(process.env.BREEZE_RECENT_ROOT||fileURLToPath(new URL('../',import.meta.url)));
const proof=process.env.BREEZE_RECENT_PROOF||'/tmp/breeze-recent-proof';mkdirSync(proof,{recursive:true});
const server=createServer((req,res)=>{try{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 if(!path.startsWith(root+'/'))throw Error();
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`,results=[];
try{for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
 const profile=mkdtempSync(resolve(tmpdir(),'breeze-recent-'));
 const launch={executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined,viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'};
 let context=await engine.launchPersistentContext(profile,launch);
 try{
 const page=await context.newPage();page.setDefaultTimeout(20000);
 await context.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
 await page.goto(url);await page.evaluate(()=>homeReady);
 await page.locator('#shelf [data-longread-id="sherlock-holmes-scandal-in-bohemia"]').click();await page.locator('.ap-start').click();
 await page.waitForFunction(()=>curBook&&!readerPositionPending());
 const holmes=await page.evaluate(()=>curBook.id);await page.evaluate(()=>show('home'));
 for(const file of [{name:'Recent fixture.txt',mimeType:'text/plain',buffer:Buffer.from('A quiet reader keeps a story.\n\n'.repeat(100))},
 {name:'Recent fixture.pdf',mimeType:'application/pdf',buffer:fixturePdf(3)},
 {name:'Recent fixture.epub',mimeType:'application/epub+zip',buffer:readFileSync(resolve(root,'assets/classics/alice-in-wonderland.epub'))}]){
  await page.locator('#fileinput').setInputFiles(file);
  const kind=file.name.split('.').pop();await page.waitForFunction(kind=>books.some(b=>b.kind===kind),kind);
 }
 const ids=await page.evaluate(holmes=>[holmes,...['txt','epub','pdf'].map(kind=>books.find(b=>b.kind===kind&&b.id!==holmes).id)],holmes);
 assert.equal(await page.evaluate(ids=>ids.slice(1).every(id=>!posOf(id).t&&!localReadTimes[id]),ids),true,'Import alone is not reading');
 const order=async()=>page.evaluate(()=>({home:[...document.querySelectorAll('#shelf [data-local-book]')].map(n=>n.dataset.localBook),library:[...document.querySelectorAll('#longform-grid [data-local-book]')].map(n=>n.dataset.localBook)}));
 const open=async id=>{await page.evaluate(id=>openBook(books.find(b=>b.id===id)),id);await page.waitForFunction(()=>curBook&&!readerPositionPending());};
 const check=async id=>{await page.evaluate(()=>show('home'));await page.evaluate(()=>renderLongformLibrary());const state=await order();assert.equal(state.home[0],id,`Home recent order ${JSON.stringify(state)}`);assert.equal(state.library[0],id);assert.deepEqual(state.home,state.library);return state;};
 // Visit all real imported formats, then A→B→A without changing the anchor.
 for(const id of ids){await open(id);await check(id);}
 const snapshots=[];
 for(const id of [ids[0],ids[1],ids[0]]){
  const before=await page.evaluate(id=>({...posOf(id)}),id);await open(id);
  const after=await page.evaluate(id=>({...posOf(id)}),id);
  assert.deepEqual(after,before,'Reopen changed canonical progress');
  snapshots.push({id,before,after,order:await check(id)});
 }
 // Sort preference belongs to Memory; book shelves have no alternate sort.
 await page.evaluate(()=>document.getElementById('vsort').value='alpha');await open(ids[2]);await check(ids[2]);assert.equal(await page.locator('#vsort').inputValue(),'alpha');
 await page.reload();await page.evaluate(()=>homeReady);await check(ids[2]);
 // An async open cancelled before presentation must not promote its book.
 await page.evaluate(async id=>{const repair=repairBookLigatures;let release;repairBookLigatures=()=>new Promise(r=>release=r);const pending=openBook(books.find(b=>b.id===id));show('home');release();await pending;repairBookLigatures=repair;},ids[0]);await check(ids[2]);
 // The source renderer may reject after the early shell/presentation callback.
 // That callback closes preview; only successful location restoration is a read.
 const failed=await page.evaluate(async pdfId=>{
  const source=books.find(b=>b.id===pdfId),book={...source,id:'failed-first-open',title:'Failed original fixture'};
  books.push(book);await bookPut(book);
  const get=originalGetForBook,render=renderOriginalBook,record=await get(source);
  originalGetForBook=async()=>record;renderOriginalBook=async()=>{throw Error('Synthetic original presentation failure');};
  let shellShown=false;
  try{await openBook(book,{onPresented:()=>shellShown=true});}
  finally{originalGetForBook=get;renderOriginalBook=render;}
  const result={shellShown,recency:localReadAt(book.id),progress:posOf(book.id).t,resume:load(HOME_RESUME_KEY,null)};
  show('home');await deleteBook(book);return result;
 },ids[3]);
 assert.deepEqual(failed,{shellShown:true,recency:0,progress:0,resume:ids[2]},'Failed rendering must not mark reading');await check(ids[2]);
 // A navigation flush must capture the current position even before debounce.
 await open(ids[1]);const flushed=await page.evaluate(()=>{
  const id=curBook.id,node=document.querySelector('#rtext [data-pi="10"]');
  readerScroller().scrollTo({top:Math.round(readerScrollTop()+node.getBoundingClientRect().top-30),behavior:'instant'});
  const anchor=captureAnchor();show('home');return {anchor,saved:posOf(id),durable:load(LS_POS,{})[id]};
 });assert.equal(flushed.saved.pi,flushed.anchor.pi);assert.deepEqual(flushed.saved,flushed.durable);await check(ids[1]);
 for(const [width,height] of [[390,844],[820,1180],[1440,900],[320,568]])for(const dark of [false,true]){
  await page.setViewportSize({width,height});await page.evaluate(d=>document.body.classList.toggle('dark',d),dark);
  await open(ids[0]);await check(ids[0]);await page.screenshot({path:`${proof}/${engine.name()}-${width}-${dark?'dark':'light'}.png`});
 }
 // A new browser process reopens the same local profile, without another read.
 await context.close();context=await engine.launchPersistentContext(profile,launch);
 await context.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 const restarted=await context.newPage();await restarted.goto(url);await restarted.evaluate(()=>homeReady);
 const durableOrder=await restarted.evaluate(()=>{renderLongformLibrary();return {home:[...document.querySelectorAll('#shelf [data-local-book]')].map(n=>n.dataset.localBook),library:[...document.querySelectorAll('#longform-grid [data-local-book]')].map(n=>n.dataset.localBook),resume:homeResumeBook().id};});
 assert.equal(durableOrder.home[0],ids[0]);assert.deepEqual(durableOrder.home,durableOrder.library);assert.equal(durableOrder.resume,ids[0]);
 results.push({engine:engine.name(),pass:true,snapshots,failed,flushed,durableOrder});
 }catch(error){results.push({engine:engine.name(),pass:false,error:String(error)});await context.pages().at(-1)?.screenshot({path:`${proof}/${engine.name()}-failure.png`});}
 finally{await context.close();rmSync(profile,{recursive:true,force:true});}
}}finally{server.close();}
writeFileSync(proof+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));assert.ok(results.every(r=>r.pass));
