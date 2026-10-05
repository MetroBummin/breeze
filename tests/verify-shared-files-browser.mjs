import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {resolve,extname,sep,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
function pdfBytes(){
  const stream='BT /F1 14 Tf 50 700 Td (Shared files belong in the reader.) Tj ET\n';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let text='%PDF-1.4\n';const offsets=[0];
  objects.forEach((o,i)=>{offsets.push(text.length);text+=`${i+1} 0 obj\n${o}\nendobj\n`;});
  const xref=text.length;text+=`xref\n0 6\n0000000000 65535 f \n`;
  for(const offset of offsets.slice(1))text+=String(offset).padStart(10,'0')+' 00000 n \n';
  return Buffer.from(text+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}
const fixtures=[{name:'Shared PDF.pdf',bytes:pdfBytes()},
  {name:'Shared EPUB.epub',bytes:readFileSync(resolve(root,'assets/classics/alice-in-wonderland.epub'))}];
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
const server=createServer((req,res)=>{
  const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
  if(!path.startsWith(resolve(root)+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${server.address().port}/`;
try{
  for(const engine of (process.env.BROWSER==='chromium'?[chromium]:process.env.BROWSER==='webkit'?[webkit]:[chromium,webkit])){
    const profile=mkdtempSync(join(tmpdir(),'breeze-shared-files-'));
    const browser=await engine.launchPersistentContext(profile,{viewport:{width:390,height:844},serviceWorkers:'block'});
    try{
      const page=await browser.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('console',message=>{if(['error','warning'].includes(message.type())&&/Shared file|Original file|Controlled|Acknowledged|IndexedDB|DataClone|file/i.test(message.text()))console.log(engine.name()+': '+message.text());});
      await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
      await page.route('**/*',route=>route.request().url().startsWith(base)||/^(blob:|data:)/.test(route.request().url())?route.continue():route.abort());
      await page.goto(base);await page.evaluate(()=>homeReady);
      await page.evaluate(()=>{
        window.shareQA={payloads:{},acks:[],reads:[]};
        window.breezeSharedFiles={
          readChunk:async(id,offset)=>{shareQA.reads.push([id,offset]);return btoa(atob(shareQA.payloads[id]).slice(offset,offset+256*1024));},
          acknowledge:async id=>{
            const stored=await bookAll();
            let matched=false;
            for(const book of stored){
              const original=await originalGetForBook(book);
              if(!original?.blob)continue;
              const data=new Uint8Array(await original.blob.arrayBuffer());
              const expected=atob(shareQA.payloads[id]);
              if(data.length===expected.length&&data.every((byte,i)=>byte===expected.charCodeAt(i)))matched=true;
            }
            if(!matched)throw Error('Acknowledged before durable book + original');
            shareQA.acks.push(id);
          }
        };
      });
      async function deliver(fixture){
        const id=randomUUID();
        await page.evaluate(({id,name,encoded,size})=>{
          shareQA.payloads[id]=encoded;
          window.dispatchEvent(new CustomEvent('breeze-shared-files',{detail:[{id,name,size}]}));
        },{id,name:fixture.name,encoded:fixture.bytes.toString('base64'),size:fixture.bytes.length});
        await page.evaluate(()=>importPendingSharedFiles());return id;
      }
      for(const fixture of fixtures){
        const id=await deliver(fixture);
        assert.ok(await page.evaluate(id=>shareQA.acks.includes(id),id),'Original not durably imported');
      }
      const initial=await page.evaluate(()=>books.map(book=>book.id));
      const again=await deliver(fixtures[0]);
      assert.ok(await page.evaluate(id=>shareQA.acks.includes(id),again));
      assert.deepEqual(await page.evaluate(()=>books.map(book=>book.id)),initial,'Re-sharing identical bytes duplicated the book');
      // Original storage failure cannot acknowledge. On a later foreground it reconnects.
      await page.evaluate(()=>{shareQA.put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const request=shareQA.put.apply(this,args);if(this.name==='originals')this.transaction.abort();return request;};});
      const retained=await deliver(fixtures[0]);assert.equal(await page.evaluate(id=>shareQA.acks.includes(id),retained),false);
      await page.evaluate(()=>{IDBObjectStore.prototype.put=shareQA.put;document.dispatchEvent(new Event('visibilitychange'));});
      await page.evaluate(()=>importPendingSharedFiles());assert.ok(await page.evaluate(id=>shareQA.acks.includes(id),retained));
      // A failed book write also retains the source; retry uses the production importer.
      await page.evaluate(()=>{shareQA.put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const request=shareQA.put.apply(this,args);if(this.name==='books')this.transaction.abort();return request;};});
      const failedWrite=await deliver(fixtures[1]);assert.equal(await page.evaluate(id=>shareQA.acks.includes(id),failedWrite),false);
      await page.evaluate(()=>{IDBObjectStore.prototype.put=shareQA.put;document.dispatchEvent(new Event('visibilitychange'));});
      await page.evaluate(()=>importPendingSharedFiles());assert.ok(await page.evaluate(id=>shareQA.acks.includes(id),failedWrite));
      const corrupt=await deliver({name:'Broken.pdf',bytes:Buffer.from('not a PDF')});
      assert.equal(await page.evaluate(id=>shareQA.acks.includes(id),corrupt),false);
      for(const dark of [false,true])for(const viewport of [{width:390,height:844},{width:820,height:1024},{width:1280,height:800},{width:667,height:375}]){
        await page.setViewportSize(viewport);
        await page.evaluate(dark=>{document.documentElement.dataset.theme=dark?'dark':'light';show('home');},dark);
        const box=await page.locator('#home-controls').boundingBox();
        assert.ok(box&&box.x>=0&&box.x+box.width<=viewport.width+1&&box.y+box.height<=viewport.height+1);
        assert.equal(await page.locator('#shelf [data-local-book]').count(),fixtures.length);
      }
      assert.deepEqual(errors,[]);console.log(engine.name()+': shared PDF/EPUB bytes, deduplication, durable-write failures, retry, corrupt retention and responsive Home PASS');
    }finally{await browser.close();rmSync(profile,{recursive:true,force:true});}
  }
}finally{await new Promise(done=>server.close(done));}
