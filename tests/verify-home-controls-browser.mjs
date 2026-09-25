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
const props=['backgroundColor','backgroundImage','opacity','backdropFilter','webkitBackdropFilter','borderTop','borderRadius','boxShadow','color','padding','display','alignItems','justifyContent'];
async function capture(page,ids){return page.evaluate(({ids,props})=>ids.map(id=>{const e=document.getElementById(id),s=getComputedStyle(e),p=getComputedStyle(e,'::before'),r=e.getBoundingClientRect();return {rect:{x:r.x,y:r.y,w:r.width,h:r.height},style:Object.fromEntries(props.map(k=>[k,s[k]])),highlight:{background:p.backgroundImage,shadow:p.boxShadow}}}),{ids,props});}
try{
for(const [width,height] of [[320,740],[390,844],[768,1024],[1024,768],[1440,900]]){
  const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block'});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.evaluate(()=>homeReady);
  await page.locator('#fileinput').setInputFiles({name:'Control comparison.txt',mimeType:'text/plain',buffer:Buffer.from(('A gentle breeze moves through the trees. Reading can feel this easy.\n\n').repeat(70))});
  await page.waitForFunction(()=>books.some(b=>b.kind==='txt'));
  await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='txt'));show('home')});
  const nativeTheme=readFileSync(resolve(root,'ios/App/App/SceneDelegate.swift'),'utf8').match(/private static let themeReporterScript = "{3}([\s\S]*?)"{3}/)[1];
  await page.evaluate(()=>{window.nativeBackground=null;window.webkit={messageHandlers:{breezeReaderTheme:{postMessage:rgb=>window.nativeBackground=rgb}}};});
  await page.evaluate(nativeTheme);
 for(const dark of [false,true]){
  await page.evaluate(d=>{darkMode=d;applyDark();show('home')},dark);
  assert.equal(await page.locator('#greet,#bigq').count(),0);
  assert.equal(await page.locator('#topbar #primary-nav').count(),0);
  assert.equal(await page.locator('#topbar #nav-settings svg').count(),1);
  assert.equal(await page.locator('#home-controls #nav-settings').count(),0);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),dark?'rgb(44, 44, 46)':'rgb(242, 242, 247)');
  assert.deepEqual(await page.evaluate(()=>window.nativeBackground),dark?[44,44,46]:[242,242,247]);
  await page.evaluate(d=>setLang(d?'en':'ko'),dark);
  assert.equal(await page.locator('#nav-settings svg').count(),1,'Language update removed Settings icon');
  const home=await capture(page,['nav-vocab','home-resume','home-add']);
  for(const {rect} of home) assert.ok(rect.x>=0 && rect.x+rect.w<=width && rect.y+rect.h<=height,'Control overflows viewport');
  await page.evaluate(()=>toast('Home notification'));
  assert.equal(await page.locator('#toast').evaluate(e=>e.classList.contains('on')),false,'Home used a separate toast');
  await page.evaluate(()=>{document.body.classList.add('chrome-hidden');window.scrollTo(0,document.body.scrollHeight)});
  assert.deepEqual(await capture(page,['nav-vocab','home-resume','home-add']),home,'Home changed on scroll/collapse state');
  await page.locator('#nav-settings').click();
  assert.equal(await page.locator('#settings-modal').isVisible(),true);
  await page.locator('#set-card').evaluate(async node=>{await Promise.all(node.getAnimations().map(a=>a.finished))});
  const sheet=await page.locator('#set-card').boundingBox();
  assert.equal(sheet.y,12);assert.equal(sheet.height,height-12);
  assert.equal(await page.locator('#set-close').evaluate(e=>document.activeElement===e),true);
  await page.keyboard.press('Escape');
  await page.locator('#settings-modal').waitFor({state:'hidden'});
  assert.equal(await page.locator('#nav-settings').evaluate(e=>document.activeElement===e),true);
  await page.locator('#home-add').click();assert.equal(await page.locator('#add-modal').isVisible(),true);
  assert.equal(await page.locator('#am-close').count(),0,'Add modal should close through its scrim, without an X button');
  await page.locator('#am-card .am-step.on h2').click();assert.equal(await page.locator('#add-modal').isVisible(),true,'Tapping the sheet content closed it');
  await page.locator('#add-modal').click({position:{x:4,y:4}});await page.locator('#add-modal').waitFor({state:'hidden'});
  await page.locator('#nav-vocab').click();assert.equal(await page.locator('#v-vocab').isVisible(),true);
assert.equal(await page.locator('#topbar #primary-nav').count(),1);
  await page.mouse.move(0,0);
  assert.deepEqual(await capture(page,['btn-export','wordbook-home','wordbook-add']),home,`Wordbook/Home mismatch ${width} dark=${dark}`);
  await page.locator('#wordbook-controls .control-pill').click();assert.equal(await page.locator('#home-controls #primary-nav').count(),1);
  await page.mouse.move(0,0);
  assert.equal(await page.locator('#set-lang,#set-dark,[data-panel=general]').count(),0);
  await page.locator('#home-resume').click();
  await page.waitForFunction(()=>activeAppView()==='read' && !homeResumeOpening);
  assert.equal(await page.evaluate(()=>curBook.title),'Control comparison');
  assert.deepEqual(await page.evaluate(()=>window.nativeBackground),dark?[23,24,22]:[250,248,242]);
  await page.waitForTimeout(450); // Reader's existing expand transition
  const reader=await capture(page,['readback','readpill','aafab']);
  assert.deepEqual(home,reader,`Home/Reader mismatch ${width} dark=${dark}`);
  assert.equal(await page.locator('#readpill').evaluate(e=>e.classList.contains('control-glass')),true);
  const fillStyle=await page.evaluate(()=>['home-resume-progress','readpill-progress'].map(id=>{const s=getComputedStyle(document.getElementById(id));return [s.background,s.boxShadow]}));
  assert.deepEqual(fillStyle[0],fillStyle[1],'Home and Reader progress material diverged');
  assert.equal(await page.locator('#readpill').evaluate(e=>getComputedStyle(e,'::before').zIndex),dark?'-1':'2');
  await page.evaluate(()=>{document.body.classList.add('chrome-hidden');setReaderPillProgress(.68,true)});
  await page.waitForTimeout(360);
  const compact=await capture(page,['readback','readpill','aafab']);
  for(const key of ['backgroundColor','backgroundImage','backdropFilter','webkitBackdropFilter','borderTop','boxShadow','color'])
    assert.equal(compact[1].style[key],reader[1].style[key],`Compact Reader changed material: ${key}`);
  assert.deepEqual(compact[1].highlight,reader[1].highlight);
  if(width===390){
    await page.screenshot({path:`/tmp/breeze-home-proof/glass-reader-compact-${dark?'dark':'light'}.png`});
    await page.evaluate(()=>document.body.classList.remove('chrome-hidden'));await page.waitForTimeout(360);
    await page.screenshot({path:`/tmp/breeze-home-proof/glass-reader-expanded-${dark?'dark':'light'}.png`});
  }

 }
 assert.deepEqual(errors,[]);
 await page.close();
}
console.log('Home navigation, fixed expanded controls and Reader visual parity passed at 5 sizes in light/dark.');
}finally{await browser.close();await new Promise(done=>server.close(done))}
