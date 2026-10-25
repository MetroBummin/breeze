/* iPad library grid: unknown OCR is not "글자 인식 중".
   An EPUB, a text file, a text-layer PDF, a finished scan whose in-memory job
   was forgotten, and a synced PDF with no local page cache stay quiet.
   Only a scanned PDF that still has pages left shows the cover label. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from './helpers/bounded-playwright.mjs';
import {scanPdf} from './helpers/pdf-scan-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const engines={chromium,webkit};
const engine=engines[process.env.BROWSER]||webkit;
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 if(!path.startsWith(root)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/`;
const proof=process.env.BREEZE_IPAD_OCR_SHOTS||'/opt/cursor/artifacts/screenshots';
mkdirSync(proof,{recursive:true});
function textPdf(){
 const stream='BT /F1 18 Tf 72 360 Td (Hello shelf) Tj ET';
 const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
 ];
 const chunks=[Buffer.from('%PDF-1.4\n')],offsets=[0];let length=chunks[0].length;
 objects.forEach((obj,i)=>{offsets.push(length);const chunk=Buffer.from(`${i+1} 0 obj\n${obj}\nendobj\n`);chunks.push(chunk);length+=chunk.length;});
 chunks.push(Buffer.from(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer << /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF`));
 return Buffer.concat(chunks);
}
const profile=mkdtempSync(resolve(tmpdir(),'breeze-ipad-ocr-'));
let browser;
try{
 browser=await engine.launchPersistentContext(profile,{
  headless:true,
  viewport:{width:1024,height:1366},
  hasTouch:true,
  userAgent:'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  serviceWorkers:'block',
 });
 await browser.addInitScript(()=>{
  localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));
  window.qaIpadOcr={calls:[]};
  const bridge={recognize:()=>new Promise(resolve=>{
   qaIpadOcr.calls.push({resolve:()=>resolve({words:[{word:'Bright',line:0,x:.1,y:.12,w:.12,h:.03,confidence:.99}]})});
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
 const importFile=async(name,mime,buffer)=>{
  const before=await page.evaluate(()=>books.map(book=>book.id));
  await page.locator('#fileinput').setInputFiles({name,mimeType:mime,buffer});
  await page.waitForFunction(known=>books.some(book=>!known.includes(book.id)),before,{timeout:60000});
  return page.evaluate(known=>books.find(book=>!known.includes(book.id)).id,before);
 };
 const openOriginal=async id=>{
  await page.evaluate(async id=>{
   const book=books.find(item=>item.id===id);
   if(curBook?.id!==book.id)await openBook(book);
   if(currentReaderMode!=='original')await switchReaderMode('original');
  },id);
 };
 const pump=async(id,kind)=>{
  const start=Date.now();
  let last=null;const seen=[];
  while(Date.now()-start<90000){
   last=await page.evaluate(id=>{
    if(!document.querySelector(`[data-ocr-book="${id}"]`))renderHome();
    const book=books.find(item=>item.id===id);
    const job=book?BreezePdfOcrLibrary.track(book):null;
    const summary=job?BreezePdfOcrLibrary.summary(job):null;
    const nodes=[...document.querySelectorAll(`[data-ocr-book="${id}"]`)].map(node=>({hidden:node.hidden,text:node.querySelector('.book-ocr-label')?.textContent||'',view:node.closest('.view')?.id||''}));
    const shown=nodes.some(node=>node.hidden===false&&node.text==='글자 스캔 중');
    return {summary,shown,scan:!!job?.scan,nodes};
   },id);
   const mark=[last.summary&&last.summary.done,last.summary&&last.summary.complete,last.shown,last.scan,JSON.stringify(last.nodes)].join('/');
   if(seen[seen.length-1]!==mark)seen.push(mark);
   const ready=kind==='pending'?last.shown&&last.summary&&!last.summary.complete
    :kind==='text'?!!(last.summary&&last.summary.complete)&&!last.shown
    :!!(last.summary&&last.summary.complete)&&!last.shown;
   if(ready)return last;
   if(kind==='pending'&&last.summary?.complete)throw new Error('pending scan finished before its label was seen '+seen.join(' | '));
   const waiting=await page.evaluate(()=>qaIpadOcr.calls.some(call=>!call.settled));
   if(waiting)await page.evaluate(()=>{const call=qaIpadOcr.calls.find(item=>!item.settled);call.settled=true;call.resolve();});
   else await page.waitForTimeout(80);
  }
  throw new Error('iPad OCR state did not arrive '+kind+' '+seen.join(' | '));
 };
 const doneId=await importFile('끝난 스캔.pdf','application/pdf',scanPdf(jpeg,{pages:1}));
 await openOriginal(doneId);
 await pump(doneId,'done');
 const textId=await importFile('글자 있는 책.pdf','application/pdf',textPdf());
 await openOriginal(textId);
 await pump(textId,'text');
 const pendingId=await importFile('수능특강.pdf','application/pdf',scanPdf(jpeg,{pages:4}));
 await openOriginal(pendingId);
 await pump(pendingId,'pending');
 await page.evaluate(async({doneId,textId,pendingId})=>{
  const done=books.find(book=>book.id===doneId),text=books.find(book=>book.id===textId),pending=books.find(book=>book.id===pendingId);
  done.title='끝난 스캔';done.author='올린 사람';
  text.title='글자 있는 책';text.author='본문';
  pending.title='2026 수능특강 영어';pending.author='EBS';
  const now=Date.now();
  const fixtures=[
   {id:'epub-ipad',title:'데미안',author:'헤르만 헤세',kind:'epub',addedAt:now,sourceHash:'epub-hash',original:{kind:'epub',hash:'epub-hash'}},
   {id:'txt-ipad',title:'짧은 노트',author:'나',kind:'txt',addedAt:now-1,sourceHash:'txt-hash'},
   {id:'cloud-ipad',title:'다른 기기에서 받은 책',author:'클라우드',kind:'pdf',addedAt:now-2,sourceHash:'cloud-hash',original:{kind:'pdf',hash:'cloud-hash'}},
   {id:'tagged-ipad',title:'EPUB인데 종류가 PDF',author:'김영하',kind:'pdf',addedAt:now-3,sourceHash:'tagged-hash',original:{kind:'epub',hash:'tagged-hash'}},
  ];
  for(const book of fixtures)await bookPut(book);
  books.unshift(...fixtures);
  BreezePdfOcrLibrary.forget(doneId);
  // The open reader can still finish this scan after the label first appears.
  // Drop that job so its late paint cannot clear the shelf, and keep one
  // pending scan: four pages, one done.
  const kept=new Set([1]);
  const scanned=BreezePdfOcr.scanned.bind(BreezePdfOcr);
  const completed=BreezePdfOcr.completed.bind(BreezePdfOcr);
  BreezePdfOcr.background=async()=>'busy';
  BreezePdfOcr.scanned=async book=>book?.id===pendingId?true:scanned(book);
  BreezePdfOcr.completed=async book=>book?.id===pendingId?new Set(kept):completed(book);
  BreezePdfOcrLibrary.forget(pendingId);
  const held=BreezePdfOcrLibrary.track(pending);
  held.total=4;held.scan=true;held.state='queued';held.done=new Set(kept);
  show('longform');
 },{doneId,textId,pendingId});
 const report=async()=>page.evaluate(({doneId,textId,pendingId})=>{
  const problems=[];
  const visible=node=>{
   if(!node)return false;
   for(let item=node;item;item=item.parentElement){
    const style=getComputedStyle(item);
    if(item.hidden||style.display==='none'||style.visibility==='hidden')return false;
   }
   return true;
  };
  if(document.querySelector('.book-ocr-progress'))problems.push('under-card OCR line is mounted');
  for(const node of document.querySelectorAll('body *')){
   if(node.childNodes.length!==1||node.childNodes[0].nodeType!==3)continue;
   if(!node.textContent.includes('글자 인식'))continue;
   if(visible(node))problems.push('visible legacy OCR text: '+node.textContent);
  }
  const tileFor=id=>{
   const root=document.querySelector('#v-longform.on')||document.querySelector('#v-home.on');
   return [...(root?root.querySelectorAll('.home-regular-tile'):[])].find(node=>node.querySelector(`[data-local-book="${id}"]`))||null;
  };
  const quiet=['epub-ipad','txt-ipad','tagged-ipad',doneId,textId,'cloud-ipad'];
  for(const id of quiet){
   const tile=tileFor(id);
   if(!tile){problems.push('missing card '+id);continue;}
   const node=tile.querySelector('[data-ocr-book]');
   if(['epub-ipad','txt-ipad','tagged-ipad'].includes(id)&&node)problems.push(id+' has an OCR node');
   if(node&&visible(node))problems.push(id+' shows OCR');
   const words=node?.querySelector('.book-ocr-label')?.textContent||'';
   if(words)problems.push(id+' carries OCR words: '+words);
  }
  const pending=tileFor(pendingId);
  const pendingOcr=pending?.querySelector('.book-ocr-cover');
  const card=pending?.querySelector('.bookcard');
  if(!pendingOcr||!visible(pendingOcr)||pendingOcr.querySelector('.book-ocr-label')?.textContent!=='글자 스캔 중')problems.push('pending scan label is not showing');
  if(pendingOcr&&card){
   const label=pendingOcr.getBoundingClientRect(),box=card.getBoundingClientRect();
   if(label.bottom>box.bottom+1||label.top<box.top-1||label.left<box.left-1||label.right>box.right+1)problems.push('pending OCR label leaves the card');
  }
  return problems;
 },{doneId,textId,pendingId});
 const shots=[];
 for(const size of [{name:'ipad-pro',width:1024,height:1366},{name:'ipad',width:820,height:1180}]){
  await page.setViewportSize(size);
  for(const view of ['longform','home']){
   await page.evaluate(view=>show(view),view);
   for(const dark of [false,true]){
    await page.evaluate(dark=>{darkMode=dark;applyDark();},dark);
    const problems=await report();
    assert.deepEqual(problems,[],`${size.name} ${view} ${dark?'dark':'light'}: ${problems.join('; ')}`);
    if(view==='longform'&&(!dark||size.name==='ipad-pro')){
     const file=`${proof}/ipad-ocr-${size.name}-${dark?'dark':'light'}.png`;
     await page.screenshot({animations:'disabled',timeout:5000,path:file});
     shots.push(file);
    }
   }
  }
 }
 console.log(shots.join('\n'));
 console.log('iPad shelf keeps OCR off every book except a pending scan');
}finally{await browser?.close();rmSync(profile,{recursive:true,force:true});server.close();}
