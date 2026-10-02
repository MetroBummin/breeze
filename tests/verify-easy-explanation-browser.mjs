import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{
  const path=resolve(root,'.'+(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':decodeURIComponent(new URL(req.url,'http://localhost').pathname)));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`,engine=process.env.BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch();
try{
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
  await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('#fileinput').setInputFiles({name:'concepts.txt',mimeType:'text/plain',buffer:Buffer.from('Prices rose last year. Wages stayed the same.\n\nInflation makes everyday goods more expensive.\n\nThe bank changed interest rates. Families spent less.\n\n'+('Another paragraph gives more reading space.\n\n').repeat(30))});
  await page.waitForFunction(()=>books.some(b=>b.kind==='txt'));
  await page.evaluate(()=>openBook(books.find(b=>b.kind==='txt')));
  await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>20);
  await page.evaluate(()=>{
    window.easyCalls=[];window.easyResolve=null;
    fillDictionaryMetadata=async()=>{};
    dictCall=(body,signal)=>new Promise(resolve=>{window.easyCalls.push(body);window.easyResolve=resolve;});
    words.inflation={word:'inflation',clicked:'inflation',forms:['inflation'],ko:'인플레이션',example:'Inflation was low last year.',book:'Saved Book A',status:2,addedAt:1,up:1,ai:{ko:'인플레이션',done:true}};
    window.easySaved=JSON.stringify(words.inflation);
    const span=[...document.querySelectorAll('#rtext .w')].find(n=>n.textContent.toLowerCase()==='inflation');
    openWord('inflation',span);
  });
  await page.locator('#word-peek-more').click();
  assert.equal(await page.locator('#p-ex-fold').isVisible(),false);
  assert.equal(await page.evaluate(()=>easyCalls.length),0);
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  await page.evaluate(()=>{window.easySaved=JSON.stringify(words.inflation);});
  await page.locator('#p-easy-button').click();
  assert.equal(await page.locator('#p-easy-button').isDisabled(),true);
  await page.evaluate(()=>easyResolve({explanation:'물건과 서비스 가격이 전반적으로 오르는 현상이에요. 같은 돈으로 살 수 있는 양이 줄어든다는 뜻이에요.',left:40}));
  await page.waitForFunction(()=>document.getElementById('p-easy-text').textContent.includes('같은 돈'));
  assert.equal(await page.evaluate(()=>easyCalls.length),1);
  assert.deepEqual(await page.evaluate(()=>({before:easyCalls[0].before,after:easyCalls[0].after})),{before:['Prices rose last year.','Wages stayed the same.'],after:['The bank changed interest rates.','Families spent less.']});
  assert.equal(await page.evaluate(()=>JSON.stringify(words.inflation)===easySaved),true);
  assert.equal(await page.evaluate(()=>Object.values(localStorage).some(x=>x.includes('같은 돈으로'))),false);
  mkdirSync('/tmp/breeze-easy-proof',{recursive:true});
  for(const [width,height] of [[320,740],[390,844],[820,1180],[1440,900],[844,390],[320,360]])for(const dark of [false,true]){
    await page.setViewportSize({width,height});await page.evaluate(value=>{darkMode=value;applyDark();placeWordDetail();},dark);
    await page.locator('#p-easy-card').scrollIntoViewIfNeeded();
    const box=await page.locator('#panel').boundingBox();
    assert.ok(box.x>=-1&&box.x+box.width<=width+1,`panel fits ${width}`);
    assert.equal(await page.locator('#panel').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
    assert.equal(await page.locator('#p-easy-card').isVisible(),true);
    await page.screenshot({path:`/tmp/breeze-easy-proof/${engine.name()}-${width}x${height}-${dark?'dark':'light'}.png`});
  }
  await page.evaluate(()=>{closePanel();show('vocab');selectWord('inflation',null);});
  assert.equal(await page.locator('#p-ex-fold').evaluate(n=>n.hidden),false);
  assert.equal(await page.locator('#p-ex').textContent(),'Inflation was low last year.');
  assert.equal(await page.evaluate(()=>easyCalls.length),1);
  assert.deepEqual(errors,[]);
  console.log(`${engine.name()}: explicit explanation, unchanged A example, no durable answer, responsive light/dark passed`);
}finally{await browser.close();await new Promise(done=>server.close(done));}
