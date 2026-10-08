// Read-only application benchmark: synthetic records live only in an isolated profile.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer((req,res)=>{try{const file=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));if(!file.startsWith(root))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(file)]||'application/octet-stream');res.end(readFileSync(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const engine=process.env.BROWSER==='webkit'?webkit:chromium;let browser;
try{
 browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
 const page=await browser.newPage({serviceWorkers:'block'});
 await page.route('**/*',route=>route.request().url().startsWith(url)||route.request().url().startsWith('blob:')?route.continue():route.abort());
 await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
 await page.goto(url);await page.evaluate(()=>homeReady);
 const measurements=await page.evaluate(async()=>{
   const result=[];const db=await idb();
   for(const count of [10,100,500]){
     let textBytes=0,metadataBytes=0;
     await localTransaction(db,'books','readwrite',tx=>{
       const store=tx.objectStore('books');store.clear();
       for(let index=0;index<count;index++){
         const book={id:'scale-'+index,title:'Synthetic book '+index,kind:'txt',fingerprint:'f2-scale-'+index,addedAt:index,
           paras:Array.from({length:100},(_,paragraph)=>`Book ${index}, paragraph ${paragraph}. `+'A quiet reader follows the story across the page. '.repeat(20))};
         textBytes+=book.paras.reduce((sum,paragraph)=>sum+paragraph.length,0);
         metadataBytes+=JSON.stringify({...book,paras:undefined}).length;
         store.put(book,book.id);
       }
     });
     const runs=[];
     for(let run=0;run<3;run++){const started=performance.now();await loadBooks();runs.push(performance.now()-started);if(books.length!==count)throw Error('Incomplete getAll');}
     result.push({books:count,paragraphs:count*100,asciiTextBytes:textBytes,metadataJsonBytes:metadataBytes,loadBooksMs:runs});
   }
   return result;
 });
 assert.deepEqual(measurements.map(item=>item.books),[10,100,500]);
 const output={engine:engine.name(),version:browser.version(),scope:'IndexedDB getAll + loadBooks, 100 roughly 1KB ASCII paragraphs per book, three warm reads; excludes rendering, native device and end-to-end launch',measurements};
 if(process.env.BREEZE_LIBRARY_SCALE_RESULTS)writeFileSync(process.env.BREEZE_LIBRARY_SCALE_RESULTS,JSON.stringify(output,null,2));
 console.log(JSON.stringify(output));
}finally{await browser?.close();server.close();}
