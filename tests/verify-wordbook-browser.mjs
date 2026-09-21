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
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(url)?r.continue():r.abort());
 await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
 await page.goto(url);await page.evaluate(()=>homeReady);
 await page.evaluate(()=>{
  words={and:{word:'and',ko:'그리고',status:2,book:'Book A',addedAt:1},port:{word:'port',ko:'항구',status:1,book:'Book B',addedAt:2},cognitive:{word:'cognitive',ko:'인지적인',status:3,book:'Book A',addedAt:3}};
  show('vocab');
 });
 for(const width of [320,390,768,1024,1440]) for(const dark of [false,true]){
  await page.setViewportSize({width,height:844});
  await page.evaluate(d=>{darkMode=d;applyDark()},dark);
  assert.equal(await page.locator('#topbar').isVisible(),false);
  const colors=await page.evaluate(()=>[1,2,3].map(n=>{
   const reader=document.querySelector(`.stbtn[data-s="${n}"]`),chip=document.querySelector(`#v-vocab .chip.s${n}`),filter=document.querySelector(`#vstars button[data-status="${n}"]`);
   const wasOn=reader.classList.contains('on');reader.classList.add('on');filter.setAttribute('aria-pressed','true');
   const color=e=>{const s=getComputedStyle(e);return [s.backgroundColor,s.color]};
   const result=[color(reader),color(chip),color(filter)];
   reader.classList.toggle('on',wasOn);filter.setAttribute('aria-pressed','false');return result;
  }));
  for(const [reader,chip,filter] of colors){assert.deepEqual(chip,reader);assert.deepEqual(filter,reader);}
  const alignment=await page.evaluate(()=>{
   const label=document.querySelector('.wordbook-sort>span').getBoundingClientRect(),sort=document.getElementById('vsort-menu').getBoundingClientRect(),stars=document.getElementById('vstars').getBoundingClientRect(),books=document.getElementById('vbooks').getBoundingClientRect();
   return {sortGap:sort.left-label.right,bookGap:books.left-stars.right};
  });
  assert.ok(alignment.sortGap<=16);assert.ok(alignment.bookGap<=12);
  assert.ok(await page.locator('.wordbook-brand img').evaluate(e=>e.complete&&e.naturalWidth>0));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const exportBox=await page.locator('#btn-export').boundingBox();
  assert.ok(exportBox.x<width/4,'Export moved out of the left control slot');
  for(const button of await page.locator('#wordbook-controls button').all()){
   const box=await button.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);
  }
 }
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('#vcnt').isVisible(),true);
 assert.equal(await page.locator('#vcnt').textContent(),'전체 3단어');
 await page.locator('#vsearch').fill('항구');assert.equal(await page.locator('.vgroup').count(),1);
 assert.equal(await page.locator('#vcnt').textContent(),'전체 3단어 · 1개 표시');
 await page.locator('#vfilter-clear').click();assert.equal(await page.locator('.vgroup').count(),3);
 await page.locator('#vsearch').fill('');
 await page.locator('#vsort-menu summary').click();await page.locator('#vsort-options input[value=alpha]').check();assert.equal(await page.locator('.vword').first().textContent(),'and');
 await page.locator('#vstars button[data-status="2"]').click();assert.equal(await page.locator('.vgroup').count(),1);
 await page.locator('#vstars button[data-status="2"]').click();
 await page.locator('#vbooks summary').click();await page.getByLabel('Book B',{exact:true}).check();assert.equal(await page.locator('.vgroup').count(),1);
 await page.getByLabel('Book B',{exact:true}).uncheck();await page.locator('#vbooks summary').click();
 await page.locator('.vword').first().click();assert.equal(await page.locator('.vgroup.open').count(),1);
 await page.locator('.vgroup.open .vko').fill('그리고 또한');await page.locator('#vsearch').focus();
 assert.equal(await page.evaluate(()=>words.and.ko),'그리고 또한');
 await page.locator('#wordbook-add').click();await page.locator('#wordbook-new-word').fill('breeze');await page.locator('#wordbook-new-meaning').fill('산들바람');await page.locator('#wordbook-add-form button[type=submit]').click();
 assert.equal(await page.evaluate(()=>words.breeze.ko),'산들바람');
 const download=page.waitForEvent('download');await page.locator('#btn-export').click();assert.ok((await download).suggestedFilename().endsWith('.csv'));
 await page.evaluate(()=>{vocabOpen.clear();clearWordbookFilters()});
 for(const dark of [false,true]){
  await page.evaluate(d=>{darkMode=d;applyDark();document.getElementById('toast').style.display='none'},dark);
  await page.locator('.vrow').first().hover();
  const hover=await page.locator('.vgroup').first().evaluate(e=>({group:getComputedStyle(e).backgroundColor,row:getComputedStyle(e.querySelector('.vrow')).backgroundColor,width:e.getBoundingClientRect().width,list:document.getElementById('vtablewrap').getBoundingClientRect().width}));
  assert.notEqual(hover.group,'rgba(0, 0, 0, 0)');assert.equal(hover.row,'rgba(0, 0, 0, 0)');assert.equal(hover.width,hover.list);
  await page.mouse.move(0,0);
  await page.screenshot({path:`/tmp/breeze-home-proof/wordbook-${dark?'dark':'light'}.png`});
 }
 await page.locator('#wordbook-controls .control-pill').click();assert.equal(await page.evaluate(()=>activeAppView()),'home');
 assert.deepEqual(errors,[]);console.log('Wordbook responsive themes, search, sort, filters, edit, add, export and Home passed.');
}finally{await browser.close();await new Promise(done=>server.close(done))}
