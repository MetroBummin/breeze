/* Shelf cards: ornament titles stay in their bands, and OCR is only the cover
   label of a scanned PDF that still has pages pending. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {scanPdf} from './helpers/pdf-scan-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 if(!path.startsWith(root)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/`;
const proof=process.env.BREEZE_SHELF_SHOTS||'/opt/cursor/artifacts/screenshots';
mkdirSync(proof,{recursive:true});
const profile=mkdtempSync(resolve(tmpdir(),'breeze-shelf-cover-'));
const cloudId='cd'.repeat(32);
let browser;
try{
 browser=await chromium.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},serviceWorkers:'block'});
 await browser.addInitScript(()=>{
  localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));
  window.qaShelfOcr={calls:[]};
  const bridge={recognize:()=>new Promise(resolve=>{
   qaShelfOcr.calls.push({resolve:()=>resolve({words:[{word:'Bright',line:0,x:.1,y:.12,w:.12,h:.03,confidence:.99}]})});
  })};
  window.Capacitor={isNativePlatform:()=>true,getPlatform:()=>'ios',isPluginAvailable:n=>n==='BreezePdfOcr',Plugins:{BreezePdfOcr:bridge}};
 });
 await browser.route(/^https?:\/\//,route=>{
  const target=route.request().url();if(target.startsWith(url))return route.continue();
  return route.abort();
 });
 const page=await browser.newPage();
 await page.goto(url);
 await page.evaluate(()=>homeReady);
 await page.waitForFunction(()=>document.getElementById('onboarding')?.hidden===true);
 const jpeg=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d');g.fillStyle='#d7c4a3';g.fillRect(0,0,600,800);g.fillStyle='#1c1c1e';g.font='28px sans-serif';g.fillText('Bright world',60,120);return c.toDataURL('image/jpeg').split(',')[1];});
 const importScan=async(name,pages)=>{
  const before=await page.evaluate(()=>books.map(book=>book.id));
  await page.locator('#fileinput').setInputFiles({name,mimeType:'application/pdf',buffer:scanPdf(jpeg,{pages})});
  await page.waitForFunction(known=>books.some(book=>book.kind==='pdf'&&!known.includes(book.id)),before,{timeout:60000});
  return page.evaluate(known=>books.find(book=>book.kind==='pdf'&&!known.includes(book.id)).id,before);
 };
 const pump=async(id,kind)=>{
  const start=Date.now();
  let last=null;const seen=[];
  while(Date.now()-start<90000){
   last=await page.evaluate(({id,kind})=>{
    const book=books.find(item=>item.id===id);
    const summary=book?BreezePdfOcrLibrary.summary(BreezePdfOcrLibrary.track(book)):null;
    const node=document.querySelector(`[data-ocr-book="${id}"]`);
    const job=book?BreezePdfOcrLibrary.track(book):null;
    const shown=!!node&&node.hidden===false&&node.querySelector('.book-ocr-label')?.textContent==='글자 스캔 중';
    return {ok:kind==='done'?!!(summary&&summary.complete):shown,summary,shown,scan:!!job?.scan,state:job?.state||'',hidden:node?node.hidden:null,text:node?.querySelector('.book-ocr-label')?.textContent||'',calls:qaShelfOcr.calls.length,nodes:[...document.querySelectorAll('[data-ocr-book]')].map(item=>({id:item.dataset.ocrBook,hidden:item.hidden,text:item.querySelector('.book-ocr-label')?.textContent||''}))};
   },{id,kind});
   const mark=[last.summary&&last.summary.done,last.scan,last.hidden,last.text,last.shown].join('/');
   if(seen[seen.length-1]!==mark)seen.push(mark);
   if(last.ok)return;
   if(kind==='pending'&&last.summary&&last.summary.done>0&&!last.summary.complete){
    for(let i=0;i<40;i++){
     await page.waitForTimeout(25);
     last=await page.evaluate(({id,kind})=>{
      const book=books.find(item=>item.id===id);
      const summary=book?BreezePdfOcrLibrary.summary(BreezePdfOcrLibrary.track(book)):null;
      const node=document.querySelector(`[data-ocr-book="${id}"]`);
      const shown=!!node&&node.hidden===false&&node.querySelector('.book-ocr-label')?.textContent==='글자 스캔 중';
      return {ok:shown,summary,shown,hidden:node?node.hidden:null};
     },{id,kind});
     if(last.ok)return;
    }
    throw new Error('pending scan stayed hidden '+JSON.stringify(last));
   }
   const waiting=await page.evaluate(()=>qaShelfOcr.calls.some(call=>!call.settled));
   if(waiting)await page.evaluate(()=>{const call=qaShelfOcr.calls.find(item=>!item.settled);call.settled=true;call.resolve();});
   else await page.waitForTimeout(100);
  }
  throw new Error('OCR shelf state did not arrive '+seen.join(' | ')+' || '+JSON.stringify(last));
 };
 await page.evaluate(()=>{
  books.unshift({id:'epub-shelf',title:'아주 긴 전자책 제목이 표지 안에서 세 줄을 넘지 않고 저자와 만나지 않아야 한다',author:'김영하',kind:'epub',addedAt:1,original:{hash:'not-a-pdf'}});
  renderHome();
 });
 const openOriginal=async id=>{
  await page.evaluate(async id=>{
   const book=books.find(item=>item.id===id);
   if(curBook?.id!==book.id)await openBook(book);
   if(currentReaderMode!=='original')await switchReaderMode('original');
  },id);
 };
 const doneId=await importScan('Scythe.pdf',1);
 await openOriginal(doneId);
 await pump(doneId,'done');
 await page.evaluate(()=>{show('home');renderHome();});
 const pendingId=await importScan('수능특강.pdf',8);
 await page.evaluate(()=>{show('home');renderHome();});
 await openOriginal(pendingId);
 await pump(pendingId,'pending');
 await page.evaluate(({doneId,pendingId,cloudId})=>{
  const done=books.find(book=>book.id===doneId),pending=books.find(book=>book.id===pendingId);
  done.title='Scythe';done.author='Neal Shusterman';
  pending.title='2026 수능특강 영어';pending.author='EBS';
  positions[done.id]={p:1,y:0,t:1,mode:'text',original:null};
  window.BREEZE_CONFIG.BOOK_CLOUD=true;
  window.BREEZE_CARD_ACTIVITY='fill';
  bookCloudCatalog=[{book_id:cloudId,title:'데미안 — 한 젊은이가 자신을 찾아가는 길고 긴 이야기',author:'헤르만 헤세',kind:'epub',status:'ready',byte_size:100000000,tombstone:''}];
  show('home');
  renderHome();
  bookCloudNoteActivity(cloudId,40*1024*1024,100*1024*1024);
 },{doneId,pendingId,cloudId});
 await page.waitForFunction(()=>document.querySelector('.bookcard.cloud.is-receiving .card-activity-label')?.textContent==='받는 중');
 const report=async()=>page.evaluate(({doneId,pendingId})=>{
  const overlap=(a,b)=>a.width>1&&b.width>1&&!(a.right<=b.left+0.5||a.left>=b.right-0.5||a.bottom<=b.top+0.5||a.top>=b.bottom-0.5);
  const box=node=>node.getBoundingClientRect();
  const problems=[];
  if(document.querySelector('.book-ocr-progress'))problems.push('under-card OCR line is mounted');
  const epub=document.querySelector('[data-home-key="book:epub-shelf"]');
  const epubCard=epub.querySelector('.bookcard'),epubTitle=epubCard.querySelector('.bt'),epubAuthor=epubCard.querySelector('.home-cover-meta'),epubUnder=epub.querySelector('.home-regular-title');
  if(epub.querySelector('[data-ocr-book]'))problems.push('EPUB has an OCR node');
  if(getComputedStyle(epubTitle).display==='none')problems.push('EPUB title is hidden');
  if(overlap(box(epubTitle),box(epubAuthor)))problems.push('EPUB title meets the author');
  if(box(epubUnder).top<box(epubCard).bottom-1)problems.push('EPUB under-card title is not below the card');
  const done=document.querySelector(`[data-home-key="book:${doneId}"]`);
  const doneCard=done.querySelector('.bookcard'),doneOcr=done.querySelector('[data-ocr-book]');
  if(!doneOcr||doneOcr.hidden!==true)problems.push('finished scan still shows OCR');
  const badge=doneCard.querySelector('.library-completion');
  if(!badge)problems.push('finished book is missing the completion badge');
  else if(overlap(box(doneCard.querySelector('.home-cover-meta')),box(badge)))problems.push('author meets the completion badge');
  if(overlap(box(doneCard.querySelector('.bt')),box(doneCard.querySelector('.home-cover-meta'))))problems.push('finished title meets the author');
  const pending=document.querySelector(`[data-home-key="book:${pendingId}"]`);
  const pendingCard=pending.querySelector('.bookcard'),pendingOcr=pending.querySelector('.book-ocr-cover');
  if(!pendingOcr||pendingOcr.hidden||!pendingCard.contains(pendingOcr))problems.push('pending scan label is not inside the card');
  if(pendingOcr&&box(pendingOcr).bottom>pending.querySelector('.home-regular-title').getBoundingClientRect().top+1)problems.push('pending OCR label drops below the card');
  if(pendingOcr&&overlap(box(pendingCard.querySelector('.bt')),box(pendingOcr)))problems.push('pending title meets the OCR label');
  const cloud=document.querySelector('.bookcard.cloud.is-receiving');
  const cloudTile=cloud.closest('.home-regular-tile');
  const activity=cloud.querySelector('.card-activity'),cloudTitle=cloud.querySelector('.bt'),cloudAuthor=cloud.querySelector('.home-cover-meta');
  for(const [name,node] of [['title',cloudTitle],['author',cloudAuthor],['fill',activity]]){
   const r=box(node),c=box(cloud);
   if(r.top<c.top-1||r.bottom>c.bottom+1||r.left<c.left-1||r.right>c.right+1)problems.push('download '+name+' leaves the card');
  }
  if(overlap(box(cloudTitle),box(cloudAuthor)))problems.push('download title meets the author');
  if(overlap(box(cloudTitle),box(activity)))problems.push('download title meets the fill label');
  if(overlap(box(cloudAuthor),box(activity)))problems.push('download author meets the fill label');
  if(box(cloudTile.querySelector('.home-regular-title')).top<box(cloud).bottom-1)problems.push('download under-card title is not below the card');
  if(cloud.querySelector('[data-ocr-book]'))problems.push('download card has an OCR node');
  return problems;
 },{doneId,pendingId});
 const shots=[];
 for(const size of [{name:'phone',width:390,height:844},{name:'tablet',width:820,height:1180}]){
  await page.setViewportSize(size);
  for(const dark of [false,true]){
   await page.evaluate(dark=>{darkMode=dark;applyDark();},dark);
   await page.locator('#v-home #shelf').evaluate(node=>{node.scrollLeft=0;});
   const problems=await report();
   assert.deepEqual(problems,[],`${size.name} ${dark?'dark':'light'}: ${problems.join('; ')}`);
   const shelf=`${proof}/shelf-${size.name}-${dark?'dark':'light'}.png`;
   await page.screenshot({animations:'disabled',timeout:5000,path:shelf});
   await page.locator('.bookcard.cloud.is-receiving').scrollIntoViewIfNeeded();
   const download=`${proof}/download-${size.name}-${dark?'dark':'light'}.png`;
   await page.screenshot({animations:'disabled',timeout:5000,path:download});
   shots.push(shelf,download);
  }
 }
 console.log(shots.join('\n'));
 console.log('ornament titles stay apart, and OCR stays inside the pending scan');
}finally{await browser?.close();rmSync(profile,{recursive:true,force:true});server.close();}
