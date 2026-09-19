import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const ownRoot=fileURLToPath(new URL('../',import.meta.url));
const root=resolve(process.env.BREEZE_QA_ROOT||ownRoot);
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.woff2':'font/woff2'};
const server=createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const path=resolve(root,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:900,height:900},serviceWorkers:'block'});
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1','done'));
  await page.route('**/*',route=>{
    const href=route.request().url();
    return href.startsWith(url)||href.startsWith('blob:') ? route.continue() : route.abort();
  });
  await page.goto(url,{waitUntil:'domcontentloaded'});
  const text=Array.from({length:140},(_,i)=>`word${i} keeps the exact reading place stable`).join(' ');
  await page.locator('#fileinput').setInputFiles({name:'panel-measure.txt',mimeType:'text/plain',
    buffer:Buffer.from(`${text}\n\n${text}\n\n${text}`)});
  await page.waitForFunction(()=>books.some(book=>book.kind==='txt'));
  await page.evaluate(()=>openBook(books.find(book=>book.kind==='txt')));
  await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>100);
  const result=await page.evaluate(async()=>{
    window.qaRestores=0;
    const ordinary=restoreAnchor;
    restoreAnchor=(...args)=>{qaRestores++;return ordinary(...args);};
    if(typeof restoreReaderPanelAnchor==='function'){
      const panel=restoreReaderPanelAnchor;
      restoreReaderPanelAnchor=async(...args)=>{qaRestores++;return panel(...args);};
    }
    const frames=(count=5)=>new Promise(resolve=>{
      const next=()=>count-- ? requestAnimationFrame(next) : resolve();next();
    });
    readerScrollTo(900);await frames();
    const node=[...document.querySelectorAll('#rtext .w')].find(item=>{
      const rect=item.getBoundingClientRect();return rect.top>250&&rect.top<650;
    });
    const before=node.getBoundingClientRect().top;
    const openAt=performance.now();openWord(node.dataset.w,node);await frames();
    const open={drift:node.getBoundingClientRect().top-before,ms:performance.now()-openAt,restores:qaRestores};
    const closeAt=performance.now();closePanel();await frames();
    const close={drift:node.getBoundingClientRect().top-before,ms:performance.now()-closeAt,restores:qaRestores-open.restores};
    return {open,close,totalRestores:qaRestores};
  });
  console.log(JSON.stringify({root,result}));
}finally{
  await browser.close();
  await new Promise(done=>server.close(done));
}
