import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
const root=process.env.MEMORY_ROOT||new URL('../',import.meta.url).pathname;
const phase=process.env.MEMORY_PROOF_PHASE||'after',engine=process.env.BROWSER||'chromium';
const out=`/tmp/breeze-memory-proof/${phase}/${engine}`;mkdirSync(out,{recursive:true});
const server=createServer((req,res)=>{try{const f=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[extname(f)]||'application/octet-stream');res.end(readFileSync(f));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await (engine==='webkit'?webkit:chromium).launch(engine==='chromium'&&process.env.BREEZE_CHROMIUM?{executablePath:process.env.BREEZE_CHROMIUM}:{});
const measurements=[];
try{for(const [name,width,height,safe] of [['iphone',390,844,0],['iphone-safe',390,844,59],['narrow',320,568,0],['tablet',820,1180,0],['desktop',1440,900,0],['short',844,390,0]])for(const dark of [false,true]){
 const key=`${name}-${dark?'dark':'light'}`,context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
 await context.addInitScript(d=>{localStorage.setItem('breeze.dark',JSON.stringify(d));localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));},dark);
 await context.route('**/*',async r=>{if(!r.request().url().startsWith(url))return r.abort();if(safe&&r.request().url().includes('.css')){const response=await r.fetch();return r.fulfill({response,body:(await response.text()).replaceAll('env(safe-area-inset-top)',`${safe}px`).replaceAll('env(safe-area-inset-bottom)','34px')});}return r.continue();});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.evaluate(()=>homeReady);await page.evaluate(()=>{endOnboarding(true);show('home');});await page.evaluate(()=>document.fonts.ready);
 const home=await page.locator('#logo .mark').boundingBox();
 const homeInk=await page.locator('#logo .mark').evaluate(async e=>{
  const rect=e.getBoundingClientRect(),src=getComputedStyle(e).backgroundImage.match(/url\(["']?(.*?)["']?\)/)[1];
  const image=new Image();image.src=src;await image.decode();const canvas=document.createElement('canvas');canvas.width=841;canvas.height=258;
  const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,841,258);const data=ctx.getImageData(0,0,841,258).data;let top=258,bottom=0;
  for(let y=0;y<258;y++)for(let x=0;x<841;x++)if(data[(y*841+x)*4+3]>128){top=Math.min(top,y);bottom=Math.max(bottom,y+1);}
  return {top:rect.top+top*rect.height/258,bottom:rect.top+bottom*rect.height/258,asset:getComputedStyle(e).backgroundImage};
 });await page.screenshot({path:`${out}/${key}-home.png`});await page.locator('#logo .mark').screenshot({path:`${out}/${key}-home-ink.png`});
 await page.locator('#nav-vocab').click();await page.evaluate(()=>document.fonts.ready);
 const title=await page.locator('.wordbook-brand h1').boundingBox(),button=await page.locator('#wordbook-add').boundingBox();
 const titleInk=await page.locator('.wordbook-brand h1').evaluate(async e=>{
  if(e.classList.contains('memory-wordmark')){
   const rect=e.getBoundingClientRect(),style=getComputedStyle(e);
   const image=new Image();image.src=style.backgroundImage.match(/url\(["']?(.*?)["']?\)/)[1];await image.decode();
   const canvas=document.createElement('canvas');canvas.width=841;canvas.height=258;
   const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,841,258);const data=ctx.getImageData(0,0,841,258).data;
   let top=258,bottom=0,left=841,right=0;
   for(let y=0;y<258;y++)for(let x=0;x<841;x++)if(data[(y*841+x)*4+3]>128){top=Math.min(top,y);bottom=Math.max(bottom,y+1);left=Math.min(left,x);right=Math.max(right,x+1);}
   return {top:rect.top+top*rect.height/258,bottom:rect.top+bottom*rect.height/258,left:rect.left+left*rect.width/841,right:rect.left+right*rect.width/841,asset:style.backgroundImage};
  }
  const style=getComputedStyle(e),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const metrics=ctx.measureText(e.textContent),marker=document.createElement('span');marker.style.cssText='display:inline-block;width:0;height:0';e.append(marker);
  const baseline=marker.getBoundingClientRect().top;marker.remove();return {top:baseline-metrics.actualBoundingBoxAscent,bottom:baseline+metrics.actualBoundingBoxDescent,baseline,font:ctx.font};
 });
 const opticalCenterDelta=(titleInk.top+titleInk.bottom-homeInk.top-homeInk.bottom)/2;
 measurements.push({key,safe,home,title,button,homeInk,titleInk,opticalCenterDelta});
 writeFileSync(`${out}/measurements.json`,JSON.stringify(measurements,null,2));
 await page.screenshot({path:`${out}/${key}-memory.png`});await page.locator('.wordbook-brand h1').screenshot({path:`${out}/${key}-memory-ink.png`});
 if(phase==='after'){
  assert.ok(Math.abs(opticalCenterDelta)<=2,`Visible header ink centers differ by ${opticalCenterDelta}px: ${JSON.stringify(titleInk)}`);
  assert.equal(await page.locator('.wordbook-brand img').count(),0);
  assert.equal(await page.locator('.wordbook-brand h1').textContent(),'Breeze Memory');
  assert.equal(await page.getByRole('heading',{name:'Breeze Memory',exact:true}).count(),1);
  assert.ok(titleInk.left>=title.x&&titleInk.right<=button.x-10,'Lettering fits with the existing button gap');
  assert.equal(titleInk.asset,homeInk.asset,'Use the exact same light/dark SVG as Home');
  assert.equal(title.width,home.width);assert.equal(title.height,home.height);
  assert.equal(title.y,home.y,'Match Home logo vertical placement exactly');
  // Same-origin crops must match; wide Wordbook columns have a different raster origin.
  if(title.x===home.x)assert.ok(readFileSync(`${out}/${key}-memory-ink.png`).equals(readFileSync(`${out}/${key}-home-ink.png`)),'Home and Memory logo pixels must match exactly');
  const column=await page.locator('#v-vocab').boundingBox();assert.equal(title.x-column.x,20,'Keep Home 20px inset within the Wordbook content column');
  const header=await page.locator('.wordbook-brand').boundingBox();assert.equal(header.height,44);
  assert.equal(button.width,44);assert.equal(button.height,44);assert.ok(Math.abs(button.y-(24+safe))<1);
  assert.equal(await page.locator('#wordbook-add').getAttribute('aria-label'),'단어 추가');
  const style=await page.locator('#wordbook-add').evaluate(e=>{const s=getComputedStyle(e);return {radius:s.borderRadius,background:s.backgroundColor,border:s.borderTopWidth}});
  assert.equal(style.radius,'50%');assert.notEqual(style.background,'rgba(0, 0, 0, 0)');assert.equal(style.border,'1px');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#wordbook-add').focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('#wordbook-add-dialog').evaluate(e=>e.open),true);
  await page.locator('#wordbook-new-word').fill('keep');
  // Rapid trusted taps on the opener are blocked by the modal; preserve typed input.
  await page.mouse.click(button.x+22,button.y+22,{clickCount:3,delay:20});
  assert.equal(await page.locator('#wordbook-new-word').inputValue(),'keep');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#wordbook-add-dialog').evaluate(e=>e.open),false);
  await page.locator('#wordbook-add').click();assert.equal(await page.locator('#wordbook-new-word').inputValue(),'');
  await page.locator('#wordbook-add-form .task-close').click();
  await page.locator('#wordbook-add').click();await page.locator('#wordbook-add-form button').filter({hasText:'취소'}).click();
  await page.locator('#wordbook-home').click();await page.locator('#nav-vocab').click();
  await page.locator('#wordbook-add').click();await page.locator('#wordbook-new-word').fill('breeze');await page.locator('#wordbook-new-meaning').fill('산들바람');
  await page.locator('#wordbook-add-form button[type=submit]').click();assert.equal(await page.locator('#wordbook-add-dialog').evaluate(e=>e.open),false);
  assert.equal(await page.evaluate(()=>words.breeze.ko),'산들바람');
  assert.deepEqual(errors,[]);
 }
 await context.close();
}
if(phase==='after')for(const dark of [false,true]){
 const context=await browser.newContext({viewport:{width:320,height:568},serviceWorkers:'block'});
 await context.addInitScript(d=>{localStorage.setItem('breeze.dark',JSON.stringify(d));localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));},dark);
 let release;const loaded=new Promise(r=>release=r);
 await context.route('**/*',async route=>{
  const resource=route.request().url();
  if(!resource.startsWith(url)||/\.(woff2?|ttf)(\?|$)/.test(resource))return route.abort();
  if(resource.endsWith('/breeze-neutral-light.svg')||resource.endsWith('/breeze-neutral-dark.svg'))await loaded;
  return route.continue();
 });
 const page=await context.newPage();await page.goto(url,{waitUntil:'domcontentloaded'});await page.evaluate(()=>homeReady);
 await page.evaluate(()=>{endOnboarding(true);show('vocab')});
 const before=await page.locator('.wordbook-brand').boundingBox();
 assert.equal(await page.getByRole('heading',{name:'Breeze Memory',exact:true}).count(),1);
 release();await page.locator('.memory-wordmark').evaluate(async()=>{const img=new Image();img.src=document.body.classList.contains('dark')?'assets/brand/wordmarks/breeze-neutral-dark.svg':'assets/brand/wordmarks/breeze-neutral-light.svg';await img.decode()});
 assert.deepEqual(await page.locator('.wordbook-brand').boundingBox(),before,'Delayed lettering and missing fonts must not move the header');
 await context.close();
}
if(phase==='after')for(const preference of ['reduce','more'])for(const dark of [false,true]){
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',...(preference==='reduce'?{reducedMotion:'reduce'}:{contrast:'more'})});
 await context.addInitScript(d=>{localStorage.setItem('breeze.dark',JSON.stringify(d));localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));},dark);
 await context.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
 const page=await context.newPage();await page.goto(url);await page.evaluate(()=>homeReady);await page.evaluate(()=>{endOnboarding(true);show('home')});
 const fallback=await page.locator('#logo .mark').evaluate(e=>{const s=getComputedStyle(e,'::before');return {display:s.display,mask:s.maskImage||s.webkitMaskImage,color:s.backgroundColor}});
 assert.equal(fallback.display,'block');const image=await page.locator('#logo .mark').screenshot();
 await page.locator('#nav-vocab').click();const matched=await page.locator('.memory-wordmark').evaluate(e=>{const s=getComputedStyle(e,'::before');return {display:s.display,mask:s.maskImage||s.webkitMaskImage,color:s.backgroundColor}});
 assert.deepEqual(matched,fallback);assert.ok((await page.locator('.memory-wordmark').screenshot()).equals(image),'Use the same accessible-preference logo treatment as Home');
 assert.equal(await page.getByRole('heading',{name:'Breeze Memory',exact:true}).count(),1);await context.close();
}
}finally{await browser.close();await new Promise(r=>server.close(r));}
writeFileSync(`${out}/measurements.json`,JSON.stringify(measurements,null,2));
console.log(`${phase}: ${engine}, twelve light/dark layouts, safe-area fixture, screenshots and Memory controls passed.`);
