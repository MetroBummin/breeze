import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
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
 const context=await engine.launchPersistentContext('',{executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined,viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
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
 for(const [width,height] of [[390,844],[820,1180],[1440,900],[320,568]])for(const dark of [false,true]){
  await page.setViewportSize({width,height});await page.evaluate(d=>document.body.classList.toggle('dark',d),dark);
  await open(ids[0]);await check(ids[0]);await page.screenshot({path:`${proof}/${engine.name()}-${width}-${dark?'dark':'light'}.png`});
 }
 results.push({engine:engine.name(),pass:true,snapshots});
 }catch(error){results.push({engine:engine.name(),pass:false,error:String(error)});await context.pages().at(-1)?.screenshot({path:`${proof}/${engine.name()}-failure.png`});}
 finally{await context.close();}
}}finally{server.close();}
writeFileSync(proof+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));assert.ok(results.every(r=>r.pass));
