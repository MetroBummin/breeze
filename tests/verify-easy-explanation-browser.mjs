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
  page.setDefaultTimeout(15000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
  await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('#fileinput').setInputFiles({name:'concepts.txt',mimeType:'text/plain',buffer:Buffer.from('Prices rose last year. Wages stayed the same.\n\nInflation makes everyday goods more expensive.\n\nThe bank changed interest rates. Families spent less.\n\nInflation changed the family budget.\n\n'+('Another paragraph gives more reading space.\n\n').repeat(30))});
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
  assert.equal(await page.locator('#p-easy-button').isVisible(),false);
  assert.equal(await page.locator('#p-easy-card').isVisible(),true);
  await page.evaluate(()=>easyResolve({explanation:'물건과 서비스 가격이 전반적으로 오르는 현상이에요. 같은 돈으로 살 수 있는 양이 줄어든다는 뜻이에요.',suggestedMeaning:'물가 상승',left:40}));
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
  await page.setViewportSize({width:390,height:844});
  const reopen=async index=>{
    await page.evaluate(i=>{closePanel();const spans=Array.from(document.querySelectorAll('#rtext .w')).filter(n=>n.textContent.toLowerCase()==='inflation');openWord('inflation',spans[i]);},index);
    await page.locator('#word-peek-more').click();
  };
  await reopen(0);
  assert.equal(await page.locator('#p-easy-card').isVisible(),true,'Same sentence retains its open explanation');
  assert.equal(await page.locator('#p-easy-button').isVisible(),false);
  await reopen(1);
  assert.equal(await page.locator('#p-easy-card').isVisible(),false,'Another sentence starts with the button');
  assert.equal(await page.locator('#p-easy-button').isVisible(),true);
  await reopen(0);
  assert.equal(await page.locator('#p-easy-card').isVisible(),false,'Returning after a context change does not resurrect the old answer');
  assert.equal(await page.evaluate(()=>easyCalls.length),1,'Reopening never auto-requests an explanation');
  // B's accepted suggestion preserves A, persists its own pair, and survives reopening.
  await reopen(0);await page.locator('#p-easy-button').click();
  await page.evaluate(()=>easyResolve({explanation:'문맥에서 가격이 전반적으로 오르는 현상을 가리켜요.',suggestedMeaning:'물가 상승'}));
  await page.locator('#p-easy-apply').click();
  const accepted=await page.evaluate(()=>({id:selKey,item:words[selKey],original:words.inflation,calls:easyCalls.length}));
  assert.notEqual(accepted.id,'inflation');assert.equal(accepted.item.ko,'물가 상승');
  assert.equal(accepted.item.example,'Inflation makes everyday goods more expensive.');
  assert.equal(accepted.original.ko,'인플레이션');assert.equal(accepted.original.example,'Inflation was low last year.');
  assert.equal(await page.locator('#p-easy-apply').isVisible(),false);
  await reopen(0);assert.equal(await page.evaluate(()=>selKey),accepted.id);
  assert.equal(await page.locator('#p-easy-card').isVisible(),true);
  assert.equal(await page.evaluate(()=>easyCalls.length),accepted.calls);
  // Same-example correction keeps the saved identity, stars and example.
  await page.evaluate(()=>{cancelEasyExplanation();easyExplanationCache.clear();renderEasyExplanation();});
  await page.locator('#p-easy-button').click();
  await page.evaluate(()=>easyResolve({explanation:'이 문장에서는 전반적인 물가의 상승을 이야기해요.',suggestedMeaning:'전반적인 물가 상승'}));
  await page.locator('#p-easy-apply').click();
  assert.equal(await page.evaluate(()=>selKey),accepted.id);
  assert.equal(await page.evaluate(()=>words[selKey].ko),'전반적인 물가 상승');
  assert.equal(await page.evaluate(()=>words[selKey].status),accepted.item.status);
  assert.equal(await page.evaluate(()=>words[selKey].example),accepted.item.example);
  assert.equal(await page.evaluate(()=>Object.values(localStorage).some(x=>x.includes('전반적인 물가 상승'))),true);
  assert.equal(await page.evaluate(()=>Object.values(localStorage).some(x=>x.includes('이 문장에서는 전반적인 물가의'))),false);
  await page.evaluate(()=>{closePanel();show('vocab');selectWord('inflation',null);});
  assert.equal(await page.locator('#p-ex-fold').evaluate(n=>n.hidden),false);
  assert.equal(await page.locator('#p-ex').textContent(),'Inflation was low last year.');
  assert.equal(await page.evaluate(()=>easyCalls.length),3);
  assert.deepEqual(errors,[]);
  console.log(`${engine.name()}: explicit explanation, unchanged A example, no durable answer, responsive light/dark passed`);
}finally{await browser.close();await new Promise(done=>server.close(done));}
