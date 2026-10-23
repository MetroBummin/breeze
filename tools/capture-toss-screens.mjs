/* Light-mode screenshots for the Apps in Toss console.
 *
 *     npm run toss
 *     node tools/capture-toss-screens.mjs
 *
 * Portrait size is the console's 636×1048 PNG. The script serves toss/dist
 * and saves three screens under docs/toss/screenshots/. It does not open
 * login, import, or an external site.
 */
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from 'playwright';

const root=resolve(import.meta.dirname,'..');
const dist=resolve(root,'toss/dist');
const out=resolve(root,'docs/toss/screenshots');
const types={'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2','.txt':'text/plain','.svg':'image/svg+xml','.json':'application/json'};

function startServer(){
  const server=createServer((request,response)=>{
    const url=new URL(request.url||'/', 'http://127.0.0.1');
    const path=normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    const file=join(dist, path==='/'?'index.html':path);
    if(!file.startsWith(dist)){ response.writeHead(403); response.end(); return; }
    try{
      const body=readFileSync(file);
      response.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream','cache-control':'no-store'});
      response.end(body);
    }catch{
      response.writeHead(404); response.end();
    }
  });
  return new Promise(ok=>server.listen(0,'127.0.0.1',()=>ok(server)));
}

const server=await startServer();
const port=server.address().port;
mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
const page=await browser.newPage({
  viewport:{width:636,height:1048},
  deviceScaleFactor:1,
  colorScheme:'light',
  serviceWorkers:'block',
});
await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});
await page.addInitScript(()=>{ window.BREEZE_TARGET='toss'; });
await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(800);
await page.screenshot({path:join(out,'01-home-classics.png')});

await page.evaluate(async()=>{
  const read=typeof LONG_READS!=='undefined'&&LONG_READS.find(item=>String(item.id||'').includes('sherlock'));
  if(read&&typeof importLongRead==='function') await importLongRead(read);
  const book=typeof books!=='undefined'&&books.find(item=>String(item.longReadId||item.id||'').includes('sherlock')||/holmes|sherlock/i.test(item.title||''));
  if(book&&typeof openBook==='function') await openBook(book);
});
await page.waitForTimeout(600);
await page.screenshot({path:join(out,'02-reader.png')});

await page.evaluate(()=>{ if(typeof show==='function') show('memory'); });
await page.waitForTimeout(400);
await page.screenshot({path:join(out,'03-vocabulary.png')});

await browser.close();
server.close();
for(const name of ['01-home-classics.png','02-reader.png','03-vocabulary.png']){
  const file=join(out,name);
  console.log(name+' '+statSync(file).size+' bytes');
}
