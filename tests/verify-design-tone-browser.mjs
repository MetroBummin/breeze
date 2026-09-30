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
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));await page.goto(url);await page.evaluate(()=>homeReady);
 await page.locator('#fileinput').setInputFiles({name:'Design.txt',mimeType:'text/plain',buffer:Buffer.from('A patient reader keeps words in their context.\n\n'.repeat(12))});await page.waitForFunction(()=>books.some(b=>b.kind==='txt'));
 await page.evaluate(()=>show('longform'));
 // Escape and cancellation preserve records and focus; Enter commits once to the selected folder.
 const before=await page.evaluate(()=>JSON.stringify(libraryFolders));const add=page.locator('#v-longform .library-folder-add');await add.click();await page.locator('#task-input').fill('취소할 이름');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>JSON.stringify(libraryFolders)),before);assert.equal(await add.evaluate(e=>e===document.activeElement),true);
 await add.click();await page.locator('#task-input').fill('테스트 카테고리');await page.keyboard.press('Enter');await page.waitForFunction(()=>libraryFolders.folders.length===1);await page.waitForTimeout(30);
 await page.locator('#v-longform .library-folder-menu summary').click();await page.locator('#v-longform .library-folder-actions button').filter({hasText:'이름 변경'}).click();await page.locator('#task-input').fill('변경된 카테고리');await page.keyboard.press('Enter');await page.waitForFunction(()=>libraryFolders.folders[0].name==='변경된 카테고리');
 await page.evaluate(()=>show('home'));assert.equal(await page.locator('#shelf [data-local-book]').count(),1,'Home must show an uncategorized book while a shelf category is selected');
 await page.locator('#shelf [data-local-book]').focus();await page.keyboard.press('Shift+F10');assert.equal(await page.locator('#edit-modal').isVisible(),false,'Home cards must not open management');
 await page.evaluate(()=>show('longform'));
 await page.evaluate(()=>assignLibraryFolder(books.find(b=>b.kind==='txt').id,activeLibraryFolder));
 await page.evaluate(()=>show('home'));assert.equal(await page.locator('#v-home .library-folder-controls,#v-home .home-card-actions,#v-home .cloud .del').count(),0);assert.equal(await page.locator('#shelf [data-local-book]').count(),1);
 await page.evaluate(()=>show('casuals'));assert.equal(await page.locator('#v-casuals .library-folder-controls').count(),1);
 await page.evaluate(()=>show('longform'));assert.equal(await page.locator('#v-longform .home-card-actions').count(),1);
 const data=await page.evaluate(()=>JSON.stringify({books,words}));await page.locator('#v-longform .library-folder-menu summary').click();await page.locator('#v-longform .library-folder-actions button').filter({hasText:'삭제'}).click();await page.locator('#task-submit').click();await page.waitForFunction(()=>libraryFolders.folders.length===0);assert.equal(await page.evaluate(()=>JSON.stringify({books,words})),data);
 const check=async(selector)=>{const a=await page.locator(selector).evaluate(e=>{const r=e.getBoundingClientRect();return{x:r.left,y:r.top,right:r.right,bottom:r.bottom,w:innerWidth,h:innerHeight,overflow:e.scrollWidth>e.clientWidth+2};});assert.ok(a.x>=-1&&a.y>=-1&&a.right<=a.w+1&&a.bottom<=a.h+1,selector+JSON.stringify(a));assert.equal(a.overflow,false,selector+' horizontal overflow');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);};
 await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='txt'));toggleAa();});
 assert.equal(await page.locator('#aa-pop input[type=color]').count(),0);
 const starData=await page.evaluate(()=>({colors:studyPrefs.stars.map(s=>s.color),words:JSON.stringify(words)}));
 await page.locator('[data-star-visibility="1"]').click();
 assert.equal(await page.locator('[data-star-visibility="1"]').getAttribute('aria-pressed'),'false');
 assert.equal(await page.locator('[data-star-visibility="2"]').getAttribute('aria-pressed'),'true');
 assert.deepEqual(await page.evaluate(()=>({colors:studyPrefs.stars.map(s=>s.color),words:JSON.stringify(words)})),starData);
 await page.locator('[data-star-visibility="1"]').click();await page.evaluate(()=>{closeAa();show('home');});
 await page.evaluate(()=>createLibraryFolder('긴 이름의 읽기 카테고리'));
 for(const [width,height] of [[320,740],[390,844],[820,1180],[1180,820],[1440,900],[844,390]])for(const dark of [false,true]){
  await page.setViewportSize({width,height});await page.evaluate(d=>{darkMode=d;applyDark();show('home');},dark);const key=`${engine.name()}-${width}-${height}-${dark?'dark':'light'}`;
  await page.evaluate(()=>show('longform'));await check('#v-longform .library-folder-controls');
  const folderRow=await page.locator('#v-longform .library-folder-controls').evaluate(e=>{const items=[...e.children].filter(child=>getComputedStyle(child).display!=='none').map(child=>child.getBoundingClientRect());return{tops:items.map(r=>r.top),right:items.at(-1).right,outer:e.getBoundingClientRect().right};});
  assert.ok(folderRow.tops.every(y=>Math.abs(y-folderRow.tops[0])<2)&&folderRow.right<=folderRow.outer+1,`Category controls must stay on one row: ${key} ${JSON.stringify(folderRow)}`);
  if(width===820)await page.screenshot({path:out+'/'+key+'-category.png'});
  if((width===320&&!dark)||(width===390&&dark)){await page.locator('#v-longform .library-folder-menu summary').click();await check('#v-longform .library-folder-actions');await page.screenshot({path:out+'/'+key+'-category-menu.png'});await page.keyboard.press('Escape');}
  await page.evaluate(()=>show('home'));
  await page.evaluate(()=>openAddModal());await check('#am-card');await page.screenshot({path:out+'/'+key+'-add.png'});await page.locator('#am-close').click();assert.equal(await page.locator('#add-modal').evaluate(e=>e.open),false);
  await page.evaluate(()=>openEditSheet(books.find(b=>b.kind==='txt')));await check('#ed-card');assert.equal(await page.locator('#ed-card .sm-btn.primary').evaluate(e=>getComputedStyle(e).backgroundColor),await page.locator('#am-card .sm-btn.primary').first().evaluate(e=>getComputedStyle(e).backgroundColor),'Save must not borrow a learning-grade color');await page.screenshot({path:out+'/'+key+'-edit.png'});await page.keyboard.press('Escape');assert.equal(await page.locator('#edit-modal').evaluate(e=>e.open),false);
  await page.evaluate(()=>{show('vocab');openWordbookAdd();});await check('#wordbook-add-dialog');await page.screenshot({path:out+'/'+key+'-word-add.png'});await page.keyboard.press('Escape');
  const toolbar=await page.locator('.wordbook-filters').evaluate(e=>{const box=id=>document.getElementById(id).getBoundingClientRect(),sort=box('vsort-menu'),books=box('vbooks'),stars=box('vstars'),outer=e.getBoundingClientRect();return{sortY:sort.y,booksY:books.y,starsY:stars.y,sortRight:sort.right,booksRight:books.right,outerRight:outer.right,starsRight:stars.right};});
  assert.ok(Math.abs(toolbar.sortY-toolbar.booksY)<2&&toolbar.starsY>toolbar.sortY&&toolbar.booksRight<=toolbar.outerRight+1&&toolbar.starsRight<=toolbar.outerRight+1,`Memory toolbar must use two contained rows: ${key} ${JSON.stringify(toolbar)}`);
  if((width===390&&dark)||(width===320&&!dark))await page.screenshot({path:out+'/'+key+'-memory-toolbar.png'});
  await page.evaluate(()=>openSettings());await check('#set-card');await page.screenshot({path:out+'/'+key+'-settings.png'});await page.evaluate(()=>closeSettings());
  await page.evaluate(()=>openBook(books.find(b=>b.kind==='txt')));await page.evaluate(()=>toggleAa());await check('#aa-pop');assert.ok(await page.locator('#aa-pop').evaluate(e=>e.getBoundingClientRect().height<350),'Reader preferences should remain compact');assert.deepEqual(await page.evaluate(()=>['aa-pop','readpill'].map(id=>{const s=getComputedStyle(document.getElementById(id));return [s.backgroundColor,s.backdropFilter,s.webkitBackdropFilter];})),await page.evaluate(()=>{const s=getComputedStyle(document.getElementById('readpill')),material=[s.backgroundColor,s.backdropFilter,s.webkitBackdropFilter];return [material,material];}),'Reader settings share the floating control glass');await page.screenshot({path:out+'/'+key+'-aa.png'});await page.evaluate(()=>closeAa());
 }
 await page.evaluate(()=>changeLibraryFolder(''));
 // Keyboard-reduced viewport: long input and destructive description stay inside scrollable dialog.
 await page.setViewportSize({width:320,height:360});await page.evaluate(()=>{show('home');void breezeTaskDialog({title:'아주 긴 카테고리 이름을 입력하는 화면',input:true,value:'카테고리'.repeat(12)});});await check('#task-dialog');await page.keyboard.press('Escape');
 if(engine===chromium){
  await page.setViewportSize({width:820,height:1180});
  await page.locator('#fileinput').setInputFiles({name:'Dialogs.pdf',mimeType:'application/pdf',buffer:fixturePdf(4)});await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));
  await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});await page.waitForSelector('.pdf-source-page canvas');
  await page.evaluate(async()=>{await goPdfPage(2);togglePdfNavigation();offerPdfPageDeletion(originalSession,2);});
  await page.locator('[data-pdf-delete-cancel]:visible').click();assert.equal(await page.evaluate(()=>originalSession.deletedPages.has(2)),false);
  await page.evaluate(()=>offerPdfPageDeletion(originalSession,2));await page.locator('[data-pdf-delete-confirm]:visible').click();await page.waitForFunction(()=>originalSession.deletedPages.has(2)&&!pdfDeletionBusy);
  await page.evaluate(async()=>{await goPdfPage(3);togglePdfNavigation();offerPdfPageDeletion(originalSession,3);const action=document.querySelector('.pdf-thumbnail-actions:not([hidden]) [data-pdf-delete-confirm]').onclick;show('home');action();});
  await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>books.find(b=>b.kind==='pdf').deletedPdfPages.includes(3)),false,'Stale inline action must not mutate an abandoned PDF session');
 }
 await page.goto(url+'landing/');for(const [width,height] of [[320,740],[390,844],[820,1180],[1440,900],[844,390]]){
  await page.setViewportSize({width,height});for(let state=0;state<=5;state++){
   await page.evaluate(n=>{window.scrollTo(0,n*document.getElementById('stage').clientHeight);lpApply(n);},state);await page.waitForTimeout(80);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`landing ${width} state ${state}`);
   if(state===2){await check('#word-peek');await page.locator('#word-peek-more').click();await check('#panel');await page.screenshot({path:out+`/${engine.name()}-${width}-landing-detail.png`});}
  }
 }
 assert.deepEqual(errors,[]);console.log(engine.name()+': responsive themes, dialog cancel/focus, category persistence, short viewport and landing passed');
 }finally{await browser.close();}
}}finally{await new Promise(r=>server.close(r));}
