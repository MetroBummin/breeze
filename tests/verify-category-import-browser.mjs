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
 const browser=await engine.launch();try{
 const page=await browser.newPage({viewport:{width:820,height:1180},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));await page.goto(url);await page.evaluate(()=>homeReady);
 await page.evaluate(()=>{show('longform');createLibraryFolder('학교');});
 assert.equal(await page.locator('#v-longform .library-folder-controls select').isVisible(),false);
 await page.locator('#v-longform .breeze-folder-picker summary').click();
 assert.equal(await page.locator('#v-longform .breeze-folder-option').count(),3);
 await page.locator('#v-longform .breeze-folder-option').filter({hasText:'학교'}).click();
 assert.equal(await page.evaluate(()=>activeLibraryFolder),await page.evaluate(()=>libraryFolders.folders[0].id));
 const folder=await page.evaluate(()=>activeLibraryFolder);
 const chooser=page.waitForEvent('filechooser');await page.locator('#longform-grid .bookcard.add').click();
 await (await chooser).setFiles({name:'Categorized.txt',mimeType:'text/plain',buffer:Buffer.from('A new book belongs to the category where it was added. '.repeat(30))});
 await page.waitForFunction(()=>books.some(b=>b.title==='Categorized'));
 const bookId=await page.evaluate(()=>books.find(b=>b.title==='Categorized').id);
 assert.equal(await page.evaluate(id=>libraryFolders.assignments[id],bookId),folder);
 await page.evaluate(id=>openEditSheet(books.find(b=>b.id===id)),bookId);
 assert.equal(await page.locator('#ed-folder').isVisible(),false);
 await page.locator('#ed-card .breeze-folder-picker summary').click();
 assert.equal(await page.locator('#ed-card .breeze-folder-option').count(),2);
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#ed-card .breeze-folder-picker').getAttribute('open'),null);
 await page.evaluate(()=>closeEditSheet());
 await page.evaluate(()=>changeLibraryFolder(INBOX_FOLDER));assert.equal(await page.locator('#longform-grid [data-local-book]').count(),0);
 await page.evaluate(()=>openAddModal());const inboxChooser=page.waitForEvent('filechooser');await page.locator('.am-file').click();await (await inboxChooser).setFiles({name:'Inbox.txt',mimeType:'text/plain',buffer:Buffer.from('This is a different book with no category. '.repeat(30))});
 await page.waitForFunction(()=>books.some(b=>b.title==='Inbox'));assert.equal(await page.locator('#longform-grid [data-local-book]').count(),1);
 await page.evaluate(id=>{show('casuals');changeLibraryFolder(id);openAddModal('casual');addStep('paste');},folder);
 await page.locator('#am-text').fill('A short article\n\nThis short article should remember the selected category even when the view changes.');
 await page.evaluate(()=>importPastedText());
 assert.equal(await page.evaluate(()=>libraryFolders.assignments[books.find(b=>b.kind==='paste').id]),folder);
 await page.evaluate(()=>{show('longform');changeLibraryFolder(INBOX_FOLDER);});
 const duplicate=page.waitForEvent('filechooser');await page.locator('#longform-grid .bookcard.add').click();await (await duplicate).setFiles({name:'Categorized.txt',mimeType:'text/plain',buffer:Buffer.from('A new book belongs to the category where it was added. '.repeat(30))});
 await page.waitForTimeout(200);assert.equal(await page.evaluate(id=>libraryFolders.assignments[id],bookId),folder);
 await page.evaluate(id=>deleteLibraryFolder(id),folder);await page.evaluate(()=>changeLibraryFolder(INBOX_FOLDER));assert.equal(await page.locator('#longform-grid [data-local-book]').count(),2);
 await page.reload();await page.evaluate(()=>homeReady);await page.evaluate(()=>{show('longform');changeLibraryFolder(INBOX_FOLDER);});assert.equal(await page.locator('#longform-grid [data-local-book]').count(),2);
 assert.deepEqual(errors,[]);console.log(engine.name()+': category capture, file/paste import, Inbox, duplicate preservation, deletion and reload passed');
 }finally{await browser.close();}
}}finally{await new Promise(r=>server.close(r));}
