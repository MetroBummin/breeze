import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
// Original synthetic PDF: real 80-page parsing without external document/network fixtures.
function pdfBytes(label,count=80){
  const font=3+count*2,objects=['<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${Array.from({length:count},(_,i)=>(3+i*2)+' 0 R').join(' ')}] /Count ${count} >>`];
  for(let i=0;i<count;i++){
    const stream=`BT /F1 14 Tf 50 700 Td (${label} page ${i+1}. A quiet reader opens a book.) Tj ET\n`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${4+i*2} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`);
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let text='%PDF-1.4\n';const offsets=[0];
  objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(text));text+=`${i+1} 0 obj\n${object}\nendobj\n`;});
  const xref=Buffer.byteLength(text);
  text+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(const offset of offsets.slice(1))text+=String(offset).padStart(10,'0')+' 00000 n \n';
  text+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(text);
}
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
  '.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
const server=createServer((req,res)=>{
  const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
  if(!path.startsWith(resolve(root)+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${server.address().port}/`;
try{
  for(const engine of [chromium,webkit]){
    const profile=mkdtempSync(join(tmpdir(),'breeze-import-feedback-'));let context;
    try{
      context=await engine.launchPersistentContext(profile,{headless:true,serviceWorkers:'block',viewport:{width:820,height:1024}});
      const page=await context.newPage(),errors=[];page.setDefaultTimeout(30000);
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',route=>route.request().url().startsWith(base)||/^(blob:|data:)/.test(route.request().url())?route.continue():route.abort());
      await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
      await page.goto(base);await page.evaluate(async()=>{await homeReady;if(rssLoading)await rssLoading;});
      await page.evaluate(()=>{
        window.feedbackQA={messages:[],refreshes:[]};
        for(const id of ['home-notice','reader-notice'])new MutationObserver(()=>{
          const text=document.getElementById(id).textContent;if(text)feedbackQA.messages.push(text);
        }).observe(document.getElementById(id),{childList:true,characterData:true,subtree:true});
        const home=renderHome,longform=renderLongformLibrary;
        renderHome=function(...args){feedbackQA.refreshes.push('home');return home(...args);};
        renderLongformLibrary=function(...args){feedbackQA.refreshes.push('longform');return longform(...args);};
        feedbackQA.start=view=>{show(view);readerNotices.reset();feedbackQA.messages=[];feedbackQA.refreshes=[];};
      });
      for(const view of ['home','longform']){
        await page.evaluate(view=>feedbackQA.start(view),view);
        const bytes=pdfBytes(view);
        // Use the production file-picker callback, parser, store and shelf render.
        await page.locator('#fileinput').setInputFiles({name:view+'.pdf',mimeType:'application/pdf',buffer:bytes});
        await page.waitForFunction(title=>books.some(book=>book.title===title),view);
        const state=await page.evaluate(async title=>{
          const book=books.find(item=>item.title===title),stored=(await bookAll()).find(item=>item.id===book.id);
          const original=await originalGetForBook(book);
          return {id:book.id,persisted:!!stored,kind:stored?.kind,
            bytes:Array.from(new Uint8Array(await original.blob.arrayBuffer())),refreshes:feedbackQA.refreshes};
        },view);
        assert.equal(state.persisted,true);assert.equal(state.kind,'pdf');assert.deepEqual(Buffer.from(state.bytes),bytes);
        assert.deepEqual(state.refreshes,[view],'Only the current shelf should be rendered by file addition');
        const shelf=view==='home'?'#shelf':'#longform-grid';
        assert.equal(await page.locator(`${shelf} [data-local-book="${state.id}"]`).count(),1,'Saved book missing from active shelf');
        await page.waitForFunction(()=>document.getElementById('home-notice').textContent.startsWith('추가 완료!'));
        await page.evaluate(()=>feedbackQA.messages=[]);
        await page.waitForTimeout(4200);
        assert.ok(!(await page.evaluate(()=>feedbackQA.messages)).some(text=>/준비|쪽/.test(text)),'Past progress replayed after successful save');
        console.log(engine.name()+': real 80-page PDF -> '+view+' card, stored bytes, immediate result and no stale progress PASS');
      }
      // EPUB and TXT use the same lifecycle and refresh the open Long-form shelf.
      for(const [name,type,bytes] of [
        ['Feedback text.txt','text/plain',Buffer.from('A quiet reader opens a new book.\n\nThe words stay on the page.')],
        ['Feedback epub.epub','application/epub+zip',readFileSync(resolve(root,'assets/classics/alice-in-wonderland.epub'))],
      ]){
        await page.evaluate(()=>feedbackQA.start('longform'));
        await page.locator('#fileinput').setInputFiles({name,mimeType:type,buffer:bytes});
        const title=name.replace(/\.[^.]+$/,'');
        await page.waitForFunction(title=>books.some(book=>book.title===title),title);
        const id=await page.evaluate(title=>books.find(book=>book.title===title).id,title);
        assert.equal(await page.locator(`#longform-grid [data-local-book="${id}"]`).count(),1);
        assert.deepEqual(await page.evaluate(()=>feedbackQA.refreshes),['longform']);
      }
      // A failed durable write must never create a card or report completion.
      await page.evaluate(()=>{
        feedbackQA.start('longform');feedbackQA.savedBookPut=bookPut;
        bookPut=async()=>{throw Error('Controlled failed write');};
      });
      try{
        await page.locator('#fileinput').setInputFiles({name:'Failed.txt',mimeType:'text/plain',buffer:Buffer.from('This failure fixture is not a saved book.')});
        await page.waitForFunction(()=>document.getElementById('home-notice').textContent.includes('파일을 읽지 못했어요'));
        assert.equal(await page.evaluate(()=>books.some(book=>book.title==='Failed')),false);
        assert.deepEqual(await page.evaluate(()=>feedbackQA.refreshes),[]);
      }finally{await page.evaluate(()=>bookPut=feedbackQA.savedBookPut);}
      // Navigation drops the old status, but the pending write updates the new visible shelf.
      await page.evaluate(()=>{
        feedbackQA.start('longform');feedbackQA.savedBookPut=bookPut;
        feedbackQA.writeStarted=false;
        bookPut=async(...args)=>{feedbackQA.writeStarted=true;await new Promise(done=>feedbackQA.release=done);return feedbackQA.savedBookPut(...args);};
      });
      try{
        await page.locator('#fileinput').setInputFiles({name:'Navigated.txt',mimeType:'text/plain',buffer:Buffer.from('This import completes after its reader changes shelves.')});
        await page.waitForFunction(()=>feedbackQA.writeStarted);
        await page.evaluate(()=>{show('home');feedbackQA.refreshes=[];feedbackQA.messages=[];feedbackQA.release();});
        await page.waitForFunction(()=>books.some(book=>book.title==='Navigated'));
        const id=await page.evaluate(()=>books.find(book=>book.title==='Navigated').id);
        assert.equal(await page.locator(`#shelf [data-local-book="${id}"]`).count(),1);
        assert.deepEqual(await page.evaluate(()=>feedbackQA.refreshes),['home']);
        await page.waitForTimeout(800);
        assert.ok(!(await page.evaluate(()=>feedbackQA.messages)).some(text=>/준비|쪽|추가 완료/.test(text)));
      }finally{await page.evaluate(()=>bookPut=feedbackQA.savedBookPut);}
      assert.deepEqual(errors,[]);
      console.log(engine.name()+': EPUB/TXT current shelf, failure and navigation PASS');
    }finally{try{await context?.close();}finally{rmSync(profile,{recursive:true,force:true});}}
  }
}finally{await new Promise(done=>server.close(done));}
