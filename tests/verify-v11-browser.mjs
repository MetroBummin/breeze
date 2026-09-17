import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.woff2':'font/woff2'};
const server=createServer((req,res)=>{
  const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch();
try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
  await context.addInitScript(()=>{ window.Capacitor={isNativePlatform:()=>true}; });
  const page=await context.newPage();
  const external=[];
  await page.route('**/*',route=>{
    if(route.request().url().startsWith(url)||route.request().url().startsWith('blob:')) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});
  await page.locator('#onboarding').waitFor({state:'visible',timeout:20000});
  assert.equal(await page.locator('#onboard-prompt').textContent(),'파란 단어를 눌러 보세요.');
  await page.locator('#onboard-word').click();
  assert.match(await page.locator('#onboard-result').innerText(),/산들바람/);
  await page.locator('#onboard-next').click();
  await page.locator('#onboard-sentence').dispatchEvent('pointerdown',{clientX:150,clientY:300});
  await page.waitForTimeout(800);
  await page.locator('#onboard-sentence').dispatchEvent('pointerup',{clientX:150,clientY:300});
  assert.match(await page.locator('#onboard-result').innerText(),/읽기는 이렇게 편안할 수 있어요/);
  await page.locator('#onboard-next').click();
  await page.locator('#onboard-next').click();
  assert.equal(await page.locator('#onboarding').isVisible(),false);
  assert.deepEqual(await page.evaluate(()=>({words,dead,marker:load('breeze.onboarding.v1',''),session:onboardingSession})),
    {words:{},dead:{},marker:'done',session:null});
  assert.equal(external.filter(href=>/functions\/v1\/dict|translate\.googleapis/.test(href)).length,0,
    'tutorial requested a lookup: '+external.join(', '));
  await page.reload({waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForTimeout(1300);
  assert.equal(await page.locator('#onboarding').isVisible(),false,'completed tutorial reopened');
  await page.evaluate(()=>startOnboarding(true));
  await page.locator('#onboard-skip').click();
  assert.equal(await page.locator('#onboarding').isVisible(),false,'Skip did not close');

  const text=Buffer.from(('The gentle breeze moves through the trees. Reading can feel this easy.\n\n').repeat(70));
  await page.locator('#fileinput').setInputFiles({name:'Toolbar.txt',mimeType:'text/plain',buffer:text});
  await page.waitForFunction(()=>books.some(b=>b.kind==='txt'),null,{timeout:20000});
  await page.evaluate(()=>openBook(books.find(b=>b.kind==='txt')));
  await page.locator('#readpill-title').waitFor({state:'visible'});
  assert.equal(await page.locator('#modefab').isVisible(),false,'Text should have no mode switch');
  await page.waitForTimeout(800); // initial position restoration is programmatic
  await page.evaluate(()=>{readerScroller().scrollTop=300;});
  await page.waitForFunction(()=>document.body.classList.contains('chrome-hidden'));
  await page.locator('#readback').waitFor({state:'hidden'});
  assert.equal(await page.locator('#readback').isVisible(),false);
  assert.equal(await page.locator('#aafab').isVisible(),false);
  await page.locator('#readpill-title').click();
  assert.equal(await page.evaluate(()=>document.body.classList.contains('chrome-hidden')),false);
  assert.equal(await page.locator('#v-read').isVisible(),true,'pill tap must not leave Reader');
  await page.waitForTimeout(550);
  await page.evaluate(()=>{readerScroller().scrollTop=650;});
  await page.waitForFunction(()=>document.body.classList.contains('chrome-hidden'));
  await page.evaluate(()=>{readerScroller().scrollTop=560;});
  await page.waitForFunction(()=>!document.body.classList.contains('chrome-hidden'));
  console.log('Native onboarding fixture, isolation, replay, and Reader pill verified');
  await context.close();
}finally{await browser.close();await new Promise(done=>server.close(done));}
