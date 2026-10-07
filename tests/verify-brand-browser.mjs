import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer((req,res)=>{try{
 const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
 if(!path.startsWith(root)){res.writeHead(403).end();return;}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await (process.env.BROWSER==='webkit'?webkit:chromium).launch(process.env.BREEZE_CHROMIUM?{executablePath:process.env.BREEZE_CHROMIUM}:{});
const out='/tmp/breeze-brand-review'+(process.env.BROWSER==='webkit'?'-webkit':'');mkdirSync(out,{recursive:true});
try{
 for(const [name,width,height] of [['phone',390,844],['ipad',820,1180],['desktop',1440,900],['narrow',320,568],['short',844,390]])for(const dark of [false,true]){
  const theme=dark?'dark':'light';
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'no-preference',serviceWorkers:'block'});
  await context.addInitScript(d=>localStorage.setItem('breeze.dark',JSON.stringify(d)),dark);
  await context.route('**/*',r=>r.request().url().startsWith(url)?r.continue():r.abort());
  const page=await context.newPage();await page.goto(url);await page.evaluate(()=>homeReady);await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('#brand-boot').isHidden(),true,'cold startup must remove brand without an extra delay');
  const mark=page.locator('#onboard-welcome .breeze-wordmark');
  assert.equal(await mark.getAttribute('aria-label'),'Breeze');
  await page.waitForFunction(()=>Promise.all([...document.querySelectorAll('.breeze-wordmark')].map(n=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(true);i.onerror=reject;i.src=getComputedStyle(n).backgroundImage.slice(5,-2);}))),null,{timeout:5000});
  await page.screenshot({path:`${out}/${name}-${theme}-welcome.png`});
  const rect=await mark.boundingBox();assert.ok(Math.abs(rect.width/rect.height-841/258)<.03,'wordmark must retain approved proportions');
  assert.ok(await page.locator('#onboard-next').isVisible());
  await page.locator('#onboard-next').click();
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.onboard-target').evaluate(n=>getComputedStyle(n).animationName),'none');
  await page.screenshot({path:`${out}/${name}-${theme}-word.png`});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(()=>endOnboarding(true));await page.evaluate(()=>show('home'));
  await page.locator('#logo .breeze-wordmark').evaluate(async node=>{
   const style=getComputedStyle(node);
   if(style.backgroundImage!=='none')throw Error('Home wordmark retained a gradient/image fill');
   const ink=getComputedStyle(node,'::before');
   if(ink.backgroundImage.includes('wordmark-')||ink.opacity!=='1')throw Error('Home must use neutral opaque ink with material reflection, no colored artwork');
   if(style.backdropFilter!=='none'||style.boxShadow!=='none')throw Error('Wordmark must not acquire a glass plate or backdrop blur');
   const source=ink.maskImage||ink.webkitMaskImage;
   await new Promise((resolve,reject)=>{const i=new Image();i.onload=resolve;i.onerror=reject;i.src=source.slice(5,-2);});
  });
  await page.screenshot({path:`${out}/${name}-${theme}-home.png`});
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('#logo .breeze-wordmark').evaluate(n=>getComputedStyle(n).filter),'none');
  assert.equal(await page.locator('#logo .breeze-wordmark').evaluate(n=>getComputedStyle(n,'::after').display),'none');
  if(name==='phone')await page.screenshot({path:`${out}/${name}-${theme}-home-reduced-motion.png`});
  await page.emulateMedia({reducedMotion:'no-preference',contrast:'more'});
  assert.equal(await page.locator('#logo .breeze-wordmark').evaluate(n=>getComputedStyle(n).filter),'none');
  await page.emulateMedia({contrast:'no-preference'});
  if(process.env.BROWSER!=='webkit'){
   const cdp=await context.newCDPSession(page);
   await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
   assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-transparency:reduce)').matches),true);
   assert.equal(await page.locator('#logo .breeze-wordmark').evaluate(n=>getComputedStyle(n).filter),'none');
   assert.equal(await page.locator('#logo .breeze-wordmark').evaluate(n=>getComputedStyle(n,'::after').display),'none');
   if(name==='phone')await page.screenshot({path:`${out}/${name}-${theme}-home-reduced-transparency.png`});
   if(name==='phone'){
    await page.evaluate(()=>startOnboarding(true));
    const opaque=await page.locator('#onboard-next').evaluate(n=>({background:getComputedStyle(n).backgroundColor,blur:getComputedStyle(n).backdropFilter}));
    assert.equal(opaque.blur,'none');assert.ok(opaque.background.startsWith('rgb('),'Reduced transparency CTA must be opaque');
    await page.screenshot({path:`${out}/${name}-${theme}-welcome-reduced-transparency.png`});
    await page.evaluate(()=>endOnboarding(false));
   }
   await cdp.send('Emulation.setEmulatedMedia',{features:[]});await cdp.detach();
  }
  const bounds=await page.locator('#logo .breeze-wordmark').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'brand must not create page overflow');
  // Deliberately hold script delivery to capture the real web boot surface.
  // This is a browser splash PREVIEW, never evidence of an iOS launch screen.
  const splash=await context.newPage();
  await splash.route('**/scripts/**/*.js*',r=>r.abort());
  await splash.goto(url,{waitUntil:'domcontentloaded'});await splash.waitForFunction(()=>document.documentElement.classList.contains('boot-pending'));
  await splash.screenshot({path:`${out}/${name}-${theme}-splash-preview.png`});
  await context.close();
 }
 console.log(`Brand proportions, cold startup, ten layouts, motion/contrast fallback and Chromium transparency fallback passed; captures: ${out}`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
