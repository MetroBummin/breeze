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
  const pillGeometry=()=>page.locator('#readpill').evaluate(node=>{
    const rect=node.getBoundingClientRect(), style=getComputedStyle(node);
    return {width:rect.width,height:rect.height,centerX:rect.x+rect.width/2,
      centerY:rect.y+rect.height/2,padX:parseFloat(style.paddingLeft),
      padY:parseFloat(style.paddingTop),radius:parseFloat(style.borderTopLeftRadius)};
  });
  const expandedPill=await pillGeometry();
  await page.waitForTimeout(800); // initial position restoration is programmatic
  await page.evaluate(()=>{readerScroller().scrollTop=300;});
  await page.waitForFunction(()=>document.body.classList.contains('chrome-hidden'));
  await page.waitForTimeout(400); // wait for the width morph, not just its class change
  const collapsedPill=await pillGeometry();
  assert.ok(collapsedPill.width<expandedPill.width*0.75,
    `Collapsed pill is still too wide (${collapsedPill.width}px vs ${expandedPill.width}px)`);
  for(const key of ['height','padX','padY','radius']){
    assert.ok(collapsedPill[key]<expandedPill[key],`Collapsed pill did not shrink ${key}`);
  }
  assert.ok(Math.abs(collapsedPill.centerX-expandedPill.centerX)<1
    && Math.abs(collapsedPill.centerY-expandedPill.centerY)<1,
    'The pill moved off center while settling into compact geometry');
  const fillBeforeToast=await page.locator('#readpill-progress').evaluate(node=>node.style.transform);
  assert.match(fillBeforeToast,/^scaleX\(0\.\d+\)$/,'Text progress did not reach the pill');
  assert.ok(Math.abs(Number(fillBeforeToast.slice(7,-1))
    -await page.evaluate(()=>visibleReaderProgress()))<0.01,
    'The pill fill diverged from the canonical reading position');
  await page.evaluate(()=>readerPillStatus('Test status'));
  assert.equal(await page.locator('#readpill-progress').evaluate(node=>node.style.transform),fillBeforeToast,
    'A title toast changed the reading progress');
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('#readpill-title').textContent(),'Toolbar');
  assert.equal(await page.locator('#readpill-progress').evaluate(node=>node.style.transform),fillBeforeToast,
    'The pill lost progress after its title returned');
  await page.locator('#readback').waitFor({state:'hidden'});
  assert.equal(await page.locator('#readback').isVisible(),false);
  assert.equal(await page.locator('#aafab').isVisible(),false);
  await page.locator('#readpill-title').click();
  assert.equal(await page.evaluate(()=>document.body.classList.contains('chrome-hidden')),false);
  assert.equal(await page.locator('#readpill-progress').evaluate(node=>node.style.transform),fillBeforeToast,
    'Expanding the pill changed its progress');
  assert.equal(await page.locator('#v-read').isVisible(),true,'pill tap must not leave Reader');
  await page.waitForTimeout(550);
  await page.evaluate(()=>{readerScroller().scrollTop=650;});
  await page.waitForFunction(()=>document.body.classList.contains('chrome-hidden'));
  await page.evaluate(()=>{readerScroller().scrollTop=560;});
  await page.waitForFunction(()=>!document.body.classList.contains('chrome-hidden'));
  await page.evaluate(()=>readerScrollTo(1200));
  await page.waitForTimeout(100);
  assert.ok(await page.evaluate(()=>Math.abs(readerPillRawProgress-readerPillVisualProgress)<.001
    && !readerPillAnimationFrame),
    'A programmatic page jump should settle without a long fill sweep');
  await page.evaluate(()=>{show('home');setReaderPillProgress(0,true);setReaderPillProgress(.8);});
  await page.waitForTimeout(80);
  const moving=await page.evaluate(()=>({raw:readerPillRawProgress,visual:readerPillVisualProgress}));
  assert.equal(moving.raw,.8);
  assert.ok(moving.visual>0 && moving.visual<.8,'Progress did not ease toward its target');
  await page.evaluate(()=>setReaderPillProgress(.2));
  const retargeted=await page.evaluate(()=>readerPillVisualProgress);
  assert.ok(Math.abs(retargeted-moving.visual)<.08,'A new target restarted the fill from zero');
  await page.waitForTimeout(350);
  assert.ok(Math.abs(await page.evaluate(()=>readerPillVisualProgress)-.2)<.02,
    'The visual fill did not settle near the newest target');
  console.log('Native onboarding fixture, isolation, replay, and Reader pill verified');
  await context.close();
}finally{await browser.close();await new Promise(done=>server.close(done));}
