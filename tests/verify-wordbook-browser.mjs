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
const browser=await chromium.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});

try{
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(url)?r.continue():r.abort());
 await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.evaluate(()=>homeReady);
 await page.evaluate(()=>{
  words={and:{word:'and',ko:'그리고',status:2,book:'Book A',addedAt:1},port:{word:'port',ko:'항구',status:1,book:'Book B',addedAt:2},cognitive:{word:'cognitive',ko:'인지적인',status:3,book:'Book A',addedAt:3}};
  saveWords();show('memory');
 });
 assert.equal(await page.locator('.wordbook-filters,#vsort,#vstars,#vbooks,#vfilter-clear').count(),0);
 for(const width of [320,390,768,1024,1440]) for(const dark of [false,true]){
  await page.setViewportSize({width,height:844});
  await page.evaluate(d=>{darkMode=d;applyDark()},dark);
  assert.equal(await page.locator('#topbar').isVisible(),false);
  assert.equal(await page.locator('.memory-home-header img').count(),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const exportBox=await page.locator('#btn-export').boundingBox();
  const header=await page.locator('.memory-home-header').boundingBox(),brand=await page.locator('.memory-home-header h1').boundingBox(),addBox=await page.locator('#memory-add').boundingBox();
  assert.equal(await page.locator('.memory-home-header #btn-export').count(),1);assert.equal(await page.locator('#memory-home-controls #memory-add').count(),1);
  assert.equal(await page.locator('#btn-export').getAttribute('aria-label'),'저장한 단어를 CSV로 내보내기');assert.equal(await page.locator('#memory-add').getAttribute('aria-label'),'단어 추가');
  assert.ok(exportBox.x>=brand.x+brand.width&&exportBox.x+exportBox.width<=header.x+header.width+1&&exportBox.y>=header.y&&exportBox.y+exportBox.height<=header.y+header.height+1,'share stays inside header without overlapping wordmark');
  assert.ok(addBox.y>header.y+header.height,'add stays in bottom dock');
  for(const button of await page.locator('#memory-home-controls button').all()){
   const box=await button.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);
  }
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('#study-sets-all').click();
 await page.waitForFunction(()=>studySetsUI.screen==='all');
 assert.equal(await page.locator('#vsearch').isVisible(),true);
 assert.equal(await page.locator('.vword').first().innerText(),'cognitive');
 await page.locator('#vsearch').fill('항구');
 assert.equal(await page.locator('.study-all-words-row').count(),1);
 assert.match(await page.locator('.study-sets-caption').first().innerText(),/1개 표시/);
 await page.locator('#vsearch').fill('');
 assert.equal(await page.locator('.study-all-words-row').count(),3);
 const star=page.locator('.study-all-words-row').first().locator('button.chip');
 await star.click();
 assert.equal(await page.evaluate(()=>words.cognitive.status),1);
 await page.evaluate(()=>closeStudySets(true));
 await page.evaluate(()=>show('vocab'));
 const and=page.locator('.vgroup').filter({has:page.locator('.vword',{hasText:'and'})});
 await and.locator('.vword').click();assert.equal(await page.locator('.vgroup.open').count(),1);
 await and.locator('.vko').fill('그리고 또한');await page.locator('#wordbook-home').focus();
 assert.equal(await page.evaluate(()=>words.and.ko),'그리고 또한');
 await page.evaluate(()=>show('memory'));
 await page.locator('#memory-add').click();await page.locator('#wordbook-new-word').fill('breeze');await page.locator('#wordbook-new-meaning').fill('산들바람');await page.locator('#wordbook-add-form button[type=submit]').click();
 assert.equal(await page.evaluate(()=>words.breeze.ko),'산들바람');
 const download=page.waitForEvent('download');await page.locator('#btn-export').click();assert.ok((await download).suggestedFilename().endsWith('.csv'));
 await page.evaluate(()=>{vocabOpen.clear();show('vocab');renderVocab();});
 for(const dark of [false,true]){
  await page.evaluate(d=>{darkMode=d;applyDark();document.getElementById('toast').style.display='none'},dark);
  await page.locator('.vrow').first().hover();
  const hover=await page.locator('.vgroup').first().evaluate(e=>({group:getComputedStyle(e).backgroundColor,row:getComputedStyle(e.querySelector('.vrow')).backgroundColor,width:e.getBoundingClientRect().width,list:document.getElementById('vtablewrap').getBoundingClientRect().width}));
  assert.notEqual(hover.group,'rgba(0, 0, 0, 0)');assert.equal(hover.row,'rgba(0, 0, 0, 0)');assert.equal(hover.width,hover.list);
  await page.mouse.move(0,0);
  await page.screenshot({path:`/tmp/breeze-home-proof/wordbook-${dark?'dark':'light'}.png`});
 }
 await page.locator('#wordbook-home').click();assert.equal(await page.evaluate(()=>activeAppView()),'home');
 assert.deepEqual(errors,[]);console.log('Memory set list, 전체 단어 search, stars, edit, add, export and Home passed.');
}finally{await browser.close();await new Promise(done=>server.close(done))}
