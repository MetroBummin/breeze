import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';
const root=resolve('.'),out=process.env.BREEZE_ONBOARD_PROOF||'/tmp/breeze-onboarding-carousel';mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.mp4':'video/mp4','.woff2':'font/woff2'};
const server=createServer((req,res)=>{const p=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));try{const data=readFileSync(p);res.setHeader('Content-Type',mime[extname(p)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const errors=[];const receipts=[];
async function setup(options={}){
 const {annotation=false,...browserOptions}=options;
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block',...browserOptions});
 if(annotation)await context.addInitScript(()=>{window.breezeInkIPad=true;});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 return {context,page};
}
const dataSnapshot=page=>page.evaluate(()=>JSON.stringify({words,dead,positions,books,curBook,fs,darkMode,readMargin,history:history.length,storage:Object.fromEntries(Object.entries(localStorage).filter(([k])=>!k.startsWith('breeze.onboarding.')))}));
try{
 // The first welcome has one cancellable continuous pen owner, independent of guide media.
 for(const action of ['finish','tap','close','restart','motion','background']){
  const {context,page}=await setup();await page.goto(url);await page.evaluate(()=>homeReady);
  assert.equal(await page.locator('#onboarding').getAttribute('data-welcome'),'drawing');
  assert.equal(await page.locator('#onboard-next').evaluate(n=>getComputedStyle(n).opacity),'0');
  assert.equal(await page.evaluate(()=>load(ONBOARD_WELCOME_KEY,false)),true);
  if(action==='finish'){
   await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('#onboard-welcome svg')).getPropertyValue('--onboard-pen'))>.55);
   assert.equal(await page.locator('#onboard-next').evaluate(n=>getComputedStyle(n).opacity),'0','caption appeared before writing/hold finished');
   await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('#onboard-welcome svg')).getPropertyValue('--onboard-pen'))===1);
   assert.equal(await page.locator('#onboard-next').evaluate(n=>getComputedStyle(n).opacity),'0','completed word had no hold');
   await page.waitForFunction(()=>document.getElementById('onboarding').dataset.welcome==='ready');
   // Keep deterministic seeks in a separate fresh fixture so the real-time
   // writing/hold/caption assertions above retain their original clock.
   const {context:sampleContext,page:samplePage}=await setup();
   await samplePage.goto(url);await samplePage.evaluate(()=>homeReady);
   // Sample the actual CSS animation at fixed times in one browser task. An
   // unbounded >.55 wait can return during the last letter on a busy CI runner.
   const samples=await samplePage.evaluate(async()=>{
    const svg=document.querySelector('#onboard-welcome svg');
    const animation=svg.getAnimations().find(a=>a.animationName==='onboard-write');
    if(!animation)throw Error('welcome writing animation missing');
    const resumeTime=animation.currentTime,duration=animation.effect.getTiming().duration;
    animation.pause();const result=[];
    try{
     for(let step=0;step<=40;step++){
      animation.currentTime=duration*step/40;
      await new Promise(requestAnimationFrame);
      result.push([...document.querySelectorAll('#onboard-pen-path')].map(p=>parseFloat(getComputedStyle(p).strokeDashoffset.replace('calc(',''))));
     }
    }finally{animation.currentTime=resumeTime;animation.play();}
    return result;
   });
   assert.equal(samples[0].length,1,'one connected writing centerline required');
   assert.deepEqual(samples[0],[1],'ink already revealed at start');
   assert.deepEqual(samples.at(-1),[0],'end stroke unfinished');
   assert.ok(samples.some(([p])=>p>0&&p<1),'pen jumped to completion');
   for(let i=1;i<samples.length;i++)assert.ok(samples[i][0]<=samples[i-1][0],'pen moved backwards');
   const geometry=await samplePage.locator('#onboard-pen-path').evaluate(path=>{
    const d=path.getAttribute('d'),length=path.getTotalLength();
    const points=Array.from({length:2001},(_,i)=>{const p=path.getPointAtLength(length*i/2000);return [p.x,p.y];});
    return {d,length,points};
   });
   assert.equal((geometry.d.match(/M/g)||[]).length,1,'subpath lifts the pen');
   assert.ok(!/[Zz]/.test(geometry.d),'centerline must not close an outline');
   assert.equal(await samplePage.locator('#onboard-welcome circle').count(),0,'duplicate pen marker');
   assert.deepEqual(geometry.points[0],[13,225]);assert.deepEqual(geometry.points.at(-1),[828,162]);
   const nearest=target=>geometry.points.reduce((best,point,i)=>
    Math.hypot(point[0]-target[0],point[1]-target[1])<Math.hypot(geometry.points[best][0]-target[0],geometry.points[best][1]-target[1])?i:best,0);
   assert.ok(nearest([164,41])<nearest([120,26]),'B must climb the right ascender and turn left before descending its stem');

   for(let i=1;i<geometry.points.length;i++){
    const distance=Math.hypot(...geometry.points[i].map((n,j)=>n-geometry.points[i-1][j]));
    assert.ok(distance>0&&distance<geometry.length/2000*1.01,'pen stopped or teleported');
   }
   console.log('Welcome writing: 41 actual CSS samples; one open centerline, continuous pen position, one final endpoint.');
   await sampleContext.close();
  }
  if(action==='tap'){
   await page.locator('#onboarding').tap({position:{x:10,y:10}});
   assert.equal(await page.locator('#onboarding').getAttribute('data-stage'),'0','skip tap navigated');
   assert.equal(await page.locator('#onboard-next').evaluate(n=>getComputedStyle(n).opacity),'1');
   await page.locator('#onboarding').tap({position:{x:10,y:10}});
  }
  if(action==='close'){await page.keyboard.press('Escape');await page.evaluate(()=>startOnboarding(false));}
  if(action==='restart')await page.evaluate(()=>{endOnboarding(false);startOnboarding(false);endOnboarding(false);startOnboarding(false);});
  if(action==='motion')await page.emulateMedia({reducedMotion:'reduce'});
  if(action==='background')await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  await page.waitForFunction(()=>onboardingSession&&document.getElementById('onboarding').dataset.welcome==='ready');
  await page.evaluate(()=>startOnboarding(true));
  await page.waitForFunction(()=>onboardingSession?.replay);
  assert.equal(await page.locator('#onboarding').getAttribute('data-welcome'),'ready','replay delayed');
  assert.equal(await page.locator('#onboarding').getAttribute('data-stage'),'0');
  await page.reload();await page.evaluate(()=>homeReady);
  assert.equal(await page.locator('#onboarding').getAttribute('data-welcome'),'ready','reload replayed handwriting');
  await context.close();
 }
 {
  const {context,page}=await setup({reducedMotion:'reduce'});await page.goto(url);await page.evaluate(()=>homeReady);
  assert.equal(await page.locator('#onboarding').getAttribute('data-welcome'),'ready');
  await page.emulateMedia({reducedMotion:'no-preference'});await page.reload();await page.evaluate(()=>homeReady);
  assert.equal(await page.locator('#onboarding').getAttribute('data-welcome'),'ready');await context.close();
 }
 {
  const {context,page}=await setup();await page.addInitScript(()=>Reflect.set(CSS,'registerProperty',undefined));
  await page.goto(url);await page.evaluate(()=>homeReady);
  assert.equal(await page.locator('#onboarding').getAttribute('data-welcome'),'ready','older WebKit waited on unsupported pen interpolation');
  assert.equal(await page.locator('#onboard-next').evaluate(n=>getComputedStyle(n).opacity),'1');await context.close();
 }
 // The companion owner resolves Android classification asynchronously. Do not
 // choose pages from the synchronous pending=false value or revive cancelled work.
 for(const capability of [true,false,'error']){
  const {context,page}=await setup();await page.goto(url);await page.evaluate(()=>homeReady);
  await page.evaluate(()=>endOnboarding(false));
  await page.evaluate(capability=>{
   Reflect.set(BreezePdfInk,'availability',()=>new Promise((resolve,reject)=>setTimeout(()=>capability==='error'?reject(Error('bridge failed')):resolve(capability),80)));
  },capability);
  await page.evaluate(()=>startOnboarding(true));
  assert.equal(await page.evaluate(()=>onboardingSession.pages.some(p=>p[0]==='pdf')),capability===true);
  assert.equal(await page.locator('#onboarding').getAttribute('data-stage'),'0');
  const count=capability===true?7:6;
  assert.equal(await page.locator('#onboard-pages i').count(),count);
  await page.evaluate(()=>goOnboardingPage(onboardingSession.pages.length));
  assert.equal(await page.locator('.onboard-slide:not([hidden])').getAttribute('data-feature'),'memory');
  assert.equal(await page.locator('#onboard-step').textContent(),`${count} / ${count}`);
  assert.equal(await page.locator('#onboard-next').textContent(),'완료');
  await page.evaluate(()=>{endOnboarding(false);startOnboarding(true);endOnboarding(false);});
  await wait(120);assert.equal(await page.evaluate(()=>onboardingSession),null,'pending capability revived cancelled guide');
  await page.evaluate(()=>{startOnboarding(true);show('read');});await wait(120);
  assert.equal(await page.evaluate(()=>onboardingSession),null,'pending capability displaced navigation');
  await context.close();
 }
 for(const native of [false,true]){
 const {context,page}=await setup();if(native)await page.addInitScript(()=>{window.Capacitor={isNativePlatform:()=>true};window.breezeInkIPad=true;});
 const requests=[];page.on('request',r=>{if(/assets\/onboarding/.test(r.url()))requests.push(r.url());});
 await page.goto(url);await page.evaluate(()=>homeReady);await page.locator('#onboarding').waitFor({state:'visible'});
 assert.equal(await page.locator('#onboard-prompt').textContent(),'브리즈에 오신 걸 환영해요');
 assert.equal(await page.locator('#onboard-next').textContent(),'시작하기');assert.equal(await page.locator('#onboard-skip').count(),0);
 assert.equal(requests.length,0,'welcome prefetched guide media');
 const before=await dataSnapshot(page);assert.equal(await page.evaluate(()=>onboardingOwnsReader()),false);
 await page.waitForFunction(()=>document.getElementById('onboarding').dataset.welcome!=='drawing');await page.locator('#onboard-next').tap();await page.waitForFunction(()=>document.querySelector('#onboarding').dataset.stage==='1');
 assert.equal(await page.evaluate(()=>onboardingSession.pages.some(p=>p[0]==='pdf')),native,'PDF guide does not follow native capability');
 const progress=await page.locator('#onboard-pages').boundingBox();assert.equal(progress.width,native?96:83);assert.equal(progress.x,(390-progress.width)/2);assert.equal(progress.y,738);
 await page.waitForFunction(()=>document.querySelector('#onboard-carousel video[src]')?.readyState>=2);
 assert.ok(requests.filter(u=>u.endsWith('.mp4')).every(u=>u.includes('word-light')),'offscreen media downloaded');
 const media=page.locator('#onboard-carousel');const b=await media.boundingBox();
 await page.dispatchEvent('#onboard-carousel','pointerdown',{pointerId:1,isPrimary:true,clientX:b.x+b.width-10,clientY:b.y+100});
 await page.dispatchEvent('#onboard-carousel','pointerup',{pointerId:1,isPrimary:true,clientX:b.x+10,clientY:b.y+100});
 assert.equal(await page.locator('#onboarding').getAttribute('data-stage'),'2');
 await page.dispatchEvent('#onboard-carousel','pointerdown',{pointerId:2,isPrimary:true,clientX:100,clientY:100});
 await page.dispatchEvent('#onboard-carousel','pointercancel',{pointerId:2});
 await page.dispatchEvent('#onboard-carousel','pointerup',{pointerId:2,isPrimary:true,clientX:10,clientY:100});
 assert.equal(await page.locator('#onboarding').getAttribute('data-stage'),'2','cancelled swipe advanced');
 await page.locator('#onboard-back').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#onboarding').getAttribute('data-stage'),'1');
 await page.locator('#onboard-back').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#onboard-next').textContent(),'시작하기','Back skipped welcome');
 await page.evaluate(()=>{for(let i=0;i<50;i++)document.getElementById('onboard-next').click();});
 assert.equal(await page.locator('#onboarding').isVisible(),false);assert.equal(await page.evaluate(()=>load(ONBOARD_KEY,'')),'done');
 await page.reload();await page.evaluate(()=>homeReady);assert.equal(await page.locator('#onboarding').isVisible(),false);
 await page.evaluate(()=>startOnboarding(true));assert.equal(await page.locator('#onboarding').getAttribute('data-stage'),'0','replay skipped welcome');
 await page.waitForFunction(()=>document.getElementById('onboarding').dataset.welcome!=='drawing');await page.locator('#onboard-next').tap();await page.evaluate(()=>goOnboardingPage(4));await page.keyboard.press('Escape');
 assert.equal(await page.locator('#onboarding').isVisible(),false);
 await page.evaluate(()=>startOnboarding(false));assert.equal(await page.locator('#onboarding').getAttribute('data-stage'),'0');
 await page.evaluate(()=>endOnboarding(false));
 receipts.push({native,initialMediaRequests:requests.length});await context.close();
 }
 // Interrupted first run resumes its explanation page, but never skips welcome on replay.
 {
 const {context,page}=await setup();await page.goto(url);await page.evaluate(()=>homeReady);
 const before=await dataSnapshot(page);await page.evaluate(()=>goOnboardingPage(3));await page.reload();await page.evaluate(()=>homeReady);
 assert.equal(await page.locator('#onboarding').getAttribute('data-stage'),'3');
 await page.keyboard.press('Escape');assert.notEqual(await page.evaluate(()=>load(ONBOARD_KEY,'')),'done');
 await page.evaluate(()=>startOnboarding(false));assert.equal(await page.locator('#onboarding').getAttribute('data-stage'),'3');
 await page.evaluate(()=>window.dispatchEvent(new PopStateEvent('popstate',{state:{breeze:true,view:'home'}})));
 assert.equal(await page.locator('#onboarding').isVisible(),false);assert.notEqual(await page.evaluate(()=>load(ONBOARD_KEY,'')),'done');
 assert.equal(await dataSnapshot(page),before,'guide mutated app data/preferences/history');await context.close();
 }
 // Existing Reader survives replay, including scroll, appearance and data.
 {
 const {context,page}=await setup();await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
 await page.goto(url);await page.evaluate(()=>homeReady);
 await page.locator('#fileinput').setInputFiles({name:'Existing Reading.txt',mimeType:'text/plain',buffer:Buffer.from('Reading should feel easy.\n\n'.repeat(60))});
 await page.waitForFunction(()=>books.some(b=>b.kind==='txt'));await page.evaluate(()=>openBook(books.find(b=>b.kind==='txt')));
 await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>20);
 await page.evaluate(()=>{readerScroller().scrollTop=100;});const before=await dataSnapshot(page),scroll=await page.evaluate(()=>readerScrollTop());
 await page.evaluate(()=>startOnboarding(true));await page.evaluate(()=>goOnboardingPage(7));await page.waitForFunction(()=>document.getElementById('onboarding').dataset.welcome!=='drawing');await page.locator('#onboard-next').tap();
 assert.equal(await page.evaluate(()=>activeAppView()),'read');assert.equal(await dataSnapshot(page),before);assert.equal(await page.evaluate(()=>readerScrollTop()),scroll);
 assert.equal(await page.locator('#v-read').getAttribute('inert'),null);
  await page.locator('#rtext .w').first().tap();await page.waitForFunction(()=>wordLookupOpen());
  await page.evaluate(()=>startOnboarding(true));await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>wordLookupOpen()),true,'guide Escape closed the existing Reader lookup');
  await page.evaluate(()=>closePanel());
 await page.evaluate(()=>{startOnboarding(true);goOnboardingPage(2);show('home');});
 await page.waitForFunction(()=>!onboardingSession);assert.equal(await page.locator('#v-home').getAttribute('inert'),null);
 await context.close();
 }
 // Layout and fallback at phone/tablet/desktop/short sizes, both themes.
 for(const [width,height] of [[390,844],[820,1180],[1440,900],[320,568],[844,390]])for(const dark of [false,true]){
 const {context,page}=await setup({viewport:{width,height},reducedMotion:'reduce',annotation:true});await page.goto(url);await page.evaluate(()=>homeReady);
 await page.evaluate(dark=>{darkMode=dark;applyDark();},dark);
 await page.screenshot({path:resolve(out,`${width}-${height}-${dark?'dark':'light'}-welcome.png`)});
 await page.waitForFunction(()=>document.getElementById('onboarding').dataset.welcome!=='drawing');await page.locator('#onboard-next').tap();await page.waitForFunction(()=>document.querySelector('.onboard-slide:not([hidden]) img').complete);
 assert.equal(await page.evaluate(()=>[...document.querySelectorAll('#onboard-carousel video')].some(v=>v.hasAttribute('src'))),false,'reduced motion downloaded loops');
 assert.equal(await page.evaluate(()=>document.getElementById('onboarding').scrollWidth>innerWidth),false,'horizontal overflow');
 for(let i=1;i<=7;i++){await page.evaluate(i=>goOnboardingPage(i),i);await page.screenshot({path:resolve(out,`${width}-${height}-${dark?'dark':'light'}-${i}.png`)});}
 await context.close();
 }
 // Play rejection uses poster, and media has one owner despite rapid changes.
 {
 const {context,page}=await setup();await page.addInitScript(()=>{HTMLMediaElement.prototype.play=function(){return Promise.reject(Error('blocked autoplay'));};});
 await page.goto(url);await page.evaluate(()=>homeReady);await page.waitForFunction(()=>document.getElementById('onboarding').dataset.welcome!=='drawing');await page.locator('#onboard-next').tap();await wait(100);
 assert.equal(await page.locator('.onboard-slide:not([hidden]) video').evaluate(v=>v.classList.contains('poster-only')),true);
 await context.close();
 }
 {
 const {context,page}=await setup({annotation:true});await page.addInitScript(()=>{window.qaHidden=false;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.qaHidden});});
 await page.goto(url);await page.evaluate(()=>homeReady);await page.waitForFunction(()=>document.getElementById('onboarding').dataset.welcome!=='drawing');await page.locator('#onboard-next').tap();
 await page.waitForFunction(()=>document.querySelector('#onboard-carousel video[src]')?.readyState>=2);
 await page.evaluate(()=>{qaHidden=true;document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await page.locator('#onboard-carousel video[src]').evaluate(v=>v.paused),true);
 await page.evaluate(()=>{qaHidden=false;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(()=>!document.querySelector('#onboard-carousel video[src]').paused);
 await page.locator('#onboard-carousel').press('Space');assert.equal(await page.locator('.onboard-slide:not([hidden]) img').isVisible(),true);
 await page.locator('#onboard-carousel').press('Space');await page.waitForFunction(()=>document.getElementById('onboarding').dataset.welcome!=='drawing');await page.locator('#onboard-next').tap();
 assert.equal(await page.locator('#onboard-carousel video[src]').count(),1,'offscreen decoder retained');
 await page.emulateMedia({reducedMotion:'reduce'});await wait(50);assert.equal(await page.locator('.onboard-slide:not([hidden]) video').evaluate(v=>v.paused),true);
 await context.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(resolve(out,'test-receipt.json'),JSON.stringify(receipts,null,2));
 // One coherent, final review video: welcome -> all seven pages -> normal completion.
 if(process.env.BREEZE_ONBOARD_VIDEO==='1'){
 const {context,page}=await setup({annotation:true});await page.goto(url);await page.evaluate(()=>homeReady);
 const frames=resolve(out,'flow-frames');mkdirSync(frames,{recursive:true});let running=true,rows=[];
 const recording=(async()=>{let i=0;while(running){const p=resolve(frames,String(i++).padStart(5,'0')+'.png');await page.screenshot({path:p});rows.push({p,t:Date.now()});await wait(100);}})();
 await wait(1800);await page.waitForFunction(()=>document.getElementById('onboarding').dataset.welcome!=='drawing');await page.locator('#onboard-next').tap();
 for(let i=1;i<=7;i++){await wait(3600);await page.waitForFunction(()=>document.getElementById('onboarding').dataset.welcome!=='drawing');await page.locator('#onboard-next').tap();}
 await wait(1600);running=false;await recording;await context.close();
 writeFileSync(resolve(frames,'frames.txt'),rows.map((r,i)=>`file '${r.p}'\nduration ${i<rows.length-1?(rows[i+1].t-r.t)/1000:.1}`).join('\n'));
 const r=spawnSync('ffmpeg',['-y','-loglevel','error','-f','concat','-safe','0','-i',resolve(frames,'frames.txt'),'-vf','fps=24','-c:v','libx264','-profile:v','baseline','-pix_fmt','yuv420p','-crf','24','-an','-movflags','+faststart',resolve(out,'Breeze-onboarding-full-flow.mp4')],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 }
 console.log('Passive onboarding verified: welcome, swipe/tap/cancel/back, rapid navigation, completion, interruption/resume, replay, Reader isolation, responsive themes, reduced motion and autoplay fallback.');
}finally{await browser.close();server.close();}
