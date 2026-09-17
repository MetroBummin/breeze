import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
function fixturePdf(count=120){
  const objects=['','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids=[];
  for(let n=0;n<count;n++){
    const page=objects.length+1, stream=page+1; kids.push(`${page} 0 R`);
    const landscape=n%7===6;
    const lines=Array.from({length:26},(_,i)=>`1 0 0 1 50 ${landscape?560-i*18:740-i*24} Tm (Page ${n+1} line ${i+1}. Stable reading keeps every word in place.) Tj`).join('\n');
    const content=`BT /F1 13 Tf\n${lines}\nET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${landscape?'792 612':'612 792'}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${stream} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  objects[0]='<< /Type /Catalog /Pages 2 0 R >>';
  objects[1]=`<< /Type /Pages /Count ${count} /Kids [${kids.join(' ')}] >>`;
  let pdf='%PDF-1.4\n', offsets=[0];
  for(let i=0;i<objects.length;i++){ offsets.push(pdf.length); pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref=pdf.length;
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  pdf+=offsets.slice(1).map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('');
  pdf+=`trailer << /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{
  const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':new URL(req.url,'http://localhost').pathname));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}`;

(async()=>{
 const browser=await chromium.launch();const reports=[];
 try{
 const p=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2,serviceWorkers:'block'});
 await p.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 const errors=[];p.on('pageerror',error=>errors.push(error.message));
 await p.goto(url+'/?viewport=1');const c=await p.context().newCDPSession(p);
 const inputs=[{name:'Rapid taps.txt',mimeType:'text/plain',buffer:Buffer.from('Reading carefully keeps words clear. A second sentence gives the reader another example.\n\n'.repeat(30))},{name:'rapid.pdf',mimeType:'application/pdf',buffer:fixturePdf(8)},resolve(root,'assets/classics/alice-in-wonderland.epub')];
 for(let n=0;n<inputs.length;n++){
  const count=await p.evaluate(()=>books.length);await p.locator('#fileinput').setInputFiles(inputs[n]);
  await p.waitForFunction(count=>books.length>count,count,{timeout:120000});
  await p.evaluate(()=>openBook(books[0]));await p.waitForTimeout(1100);
  const initial=await p.evaluate(()=>breezeViewportSnapshot());
  const point=await p.evaluate(()=>{
   if(currentReaderMode==='text'){
    const e=[...document.querySelectorAll('#rtext .w')].find(e=>{const r=e.getBoundingClientRect();return r.top>130&&r.bottom<innerHeight-200});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};
   }
   if(originalSession.kind==='pdf')for(const page of originalSession.pages){const r=page.getBoundingClientRect();for(const w of originalSession.wordBoxes.get(+page.dataset.page)||[]){const x=r.x+(w.x+w.w/2)*r.width,y=r.y+(w.y+w.h/2)*r.height;if(x>30&&x<350&&y>150&&y<550)return {x,y};}}
   return {x:150,y:300};
  });
  const policy=await p.evaluate(({x,y})=>breezeTouchPolicyAt(x,y),point);
  if(n===0) assert.equal(policy[0]?.touchAction,'manipulation',
    'Text word is not the only rapid-tap policy target');
  else assert.ok(policy.every(entry=>entry.touchAction!=='manipulation'),
    'Text rapid-tap policy leaked into PDF or EPUB');
  assert.ok(policy.some(entry=>entry.touchAction==='pan-x pan-y'),
    'actual touch path has no browser-zoom exclusion');
  assert.ok(policy.some(entry=>entry.touchAction==='pan-x pan-y'&&entry.position!=='absolute'),
    'browser-zoom exclusion depends only on an absolute positioned element');
  const samples=[];
  for(let i=0;i<40;i++){
   await c.send('Input.synthesizeTapGesture',{...point,tapCount:2,gestureSourceType:'touch',duration:30});
   const sample=await p.evaluate(()=>breezeViewportSnapshot());
   assert.equal(sample.scale,1);assert.equal(sample.width,390);assert.equal(sample.innerWidth,390);
   samples.push(sample);
  }
  await p.evaluate(()=>{readerScroller().scrollTop+=600;});
  await p.waitForTimeout(400);
  const pillProgress=await p.evaluate(()=>({
    expected:visibleReaderProgress(),
    actual:Number(document.getElementById('readpill-progress').style.transform.slice(7,-1))
  }));
  assert.ok(Math.abs(pillProgress.actual-pillProgress.expected)<0.02,
    `${['Text','PDF','EPUB'][n]} pill progress diverged from its canonical position`);
  await p.evaluate(()=>show('home'));
  const home=await p.evaluate(()=>breezeViewportSnapshot());
  assert.equal(home.scale,1);assert.equal(home.width,390);assert.equal(home.innerWidth,390);
  reports.push({format:['Text','PDF','EPUB'][n],initial,policy,range:{min:Math.min(...samples.map(s=>s.scale)),max:Math.max(...samples.map(s=>s.scale))},last:samples.at(-1),home});
  console.log(JSON.stringify(reports.at(-1)));
 }
 // Native editable mechanics on ordinary Words UI; no selection cancellation.
 await p.evaluate(()=>show('vocab'));
 const input=p.locator('#vsearch');await input.fill('alpha beta gamma');await input.focus();
 await p.evaluate(()=>{const input=document.getElementById('vsearch');input.setSelectionRange(6,10);});
 await p.keyboard.insertText('delta');assert.equal(await input.inputValue(),'alpha delta gamma');
 // A textarea and contenteditable probe inside Reader also retain selection and typing.
 await p.evaluate(()=>{show('read');const host=document.createElement('div');host.id='qa-editables';host.style='position:fixed;top:150px;left:20px;z-index:99999;background:white';host.innerHTML='<textarea id="qa-textarea">alpha beta gamma</textarea><div id="qa-editable" contenteditable="true">alpha beta gamma</div>';document.getElementById('reader-scroll').append(host);});
 await p.locator('#qa-textarea').focus();await p.evaluate(()=>document.getElementById('qa-textarea').setSelectionRange(6,10));await p.keyboard.insertText('delta');assert.equal(await p.locator('#qa-textarea').inputValue(),'alpha delta gamma');
 await p.locator('#qa-editable').focus();await p.evaluate(()=>{const range=document.createRange(),node=document.getElementById('qa-editable').firstChild;range.setStart(node,6);range.setEnd(node,10);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);});await p.keyboard.insertText('delta');assert.equal(await p.locator('#qa-editable').textContent(),'alpha delta gamma');
 assert.deepEqual(errors,[]);
 console.log('Rapid-tap viewport and editable replacement regressions passed. Native iOS cursor handles are not covered.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
