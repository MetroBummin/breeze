import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
 if(!path.startsWith(root)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
try{for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'}),errors=[],requests=[];
  let dictionaryMode='success',pending=[];
  page.on('pageerror',e=>errors.push(e.message));
  const response={word:'patient',entries:[{language:{code:'en'},partOfSpeech:'adjective',pronunciations:[{type:'ipa',text:'/test/'}],senses:Array.from({length:5},(_,i)=>({definition:`Definition ${i+1}: able to wait calmly and continue reading without getting upset. `.repeat(3)}))}]};
  await page.route('**/*',async route=>{
   const href=route.request().url();
   if(href.includes('freedictionaryapi.com/api')){
    requests.push(href);
    if(dictionaryMode==='hold'){pending.push(route);return;}
    return route.fulfill({status:dictionaryMode==='missing'?404:200,contentType:'application/json',body:JSON.stringify(response)});
   }
   return href.startsWith(url)||href.startsWith('blob:')?route.continue():route.abort();
  });
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
  await page.goto(url);await page.evaluate(()=>homeReady);
  await page.evaluate(async()=>{
   window.aiRequests=0;dictCall=async(payload)=>{if(payload.op==='look')aiRequests++;return {ko:'참을성 있는'};};
   books=[{id:'morph',title:'Quiet reading',kind:'txt',cover:'fixture',paras:Array.from({length:100},()=>('A patient reader takes time to read a good story. ').repeat(4))}];
   bookImageBlob=async()=>new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="100" height="140"><rect width="100" height="140" fill="#38534a"/></svg>'],{type:'image/svg+xml'});
   await openBook(books[0]);
  });
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  await page.evaluate(()=>readerScrollTo(850));
  await page.waitForFunction(()=>[...document.querySelectorAll('#rtext .w')].some(n=>n.textContent==='patient'&&n.getBoundingClientRect().top>110&&n.getBoundingClientRect().top<300));
  dictionaryMode='hold';
  await page.evaluate(()=>{
   words.patient={word:'patient',ko:'참을성 있는',forms:['patient'],status:2,addedAt:1,loading:true,example:'A patient reader takes time to read a good story.'};
   const node=[...document.querySelectorAll('#rtext .w')].find(n=>n.textContent==='patient'&&n.getBoundingClientRect().top>110&&n.getBoundingClientRect().top<300);
   window.beforeMorph={scroll:readerScrollTop(),node,y:node.getBoundingClientRect().top};openWord('patient',node);
  });
  await page.waitForFunction(()=>words.patient.enLoading);
  await page.locator('#word-peek-more').click();
  await page.waitForFunction(()=>!wordMorphAnimation);
  assert.equal(await page.locator('#panel').getAttribute('aria-modal'),'false');
  assert.equal(await page.locator('#word-modal-scrim').isVisible(),false);
  await pending.shift().fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});
  await page.waitForFunction(()=>!!words.patient.defs?.length);
  assert.ok((await page.locator('#p-defs').textContent()).includes('Definition'),'ready English metadata remained hidden behind AI loading');
  const geometry=await page.evaluate(()=>{
   const r=document.getElementById('panel').getBoundingClientRect(),p=beforeMorph.node.getBoundingClientRect();
   return {h:r.height,top:r.top,bottom:r.bottom,wordTop:p.top,wordBottom:p.bottom,scroll:readerScrollTop(),before:beforeMorph.scroll,inside:document.getElementById('panel').scrollHeight>document.getElementById('panel').clientHeight};
  });
  assert.ok(geometry.h<=380&&geometry.top>=16&&geometry.bottom<=828);assert.equal(geometry.scroll,geometry.before);
  assert.ok(geometry.top>=geometry.wordBottom||geometry.bottom<=geometry.wordTop,'detail covered its anchor');assert.equal(geometry.inside,true);
  assert.equal(await page.locator('#p-senses-fold').isVisible(),false,'active Korean meaning was duplicated');
  for(const dark of [false,true]){
   await page.evaluate(d=>{darkMode=d;applyDark();},dark);
   await page.waitForTimeout(180);
   if(engine===chromium)await page.screenshot({path:`/tmp/breeze-word-morph-${dark?'dark':'light'}.png`});
  }
  assert.equal(await page.locator('#p-collapse').count(),0);
  await page.locator('#p-mark').click();
  assert.equal(await page.evaluate(()=>words.patient.mark),false);
  assert.equal(await page.locator('#p-mark').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('#panel').evaluate(n=>getComputedStyle(n).scrollbarWidth),'none');
  await page.locator('#panel').evaluate(n=>n.scrollTop=100);
  assert.equal(await page.evaluate(()=>readerScrollTop()),geometry.before);
  await page.mouse.click(4,4);await page.waitForFunction(()=>!wordMorphAnimation&&!wordPanelOpen());
  assert.equal(await page.locator('#word-peek').isVisible(),false);assert.equal(await page.evaluate(()=>aiRequests),0);
  // Reopening an empty saved card reuses the independent persistent dictionary cache.
  const count=requests.length;
  await page.evaluate(()=>{const node=beforeMorph.node;closePanel();words.patient.defs=[];delete words.patient.enRetryAt;openWord('patient',node);});
  await page.waitForFunction(()=>!!words.patient.defs?.length);assert.equal(requests.length,count);
  // Actual reader scroll dismisses expanded details, while internal scrolling does not.
  await page.locator('#word-peek-more').click();await page.waitForFunction(()=>!wordMorphAnimation);
  await page.evaluate(()=>{lastProgrammaticScrollTop=null;readerScroller().scrollTop+=60;});
  await page.waitForFunction(()=>!wordLookupOpen());
  // A public-dictionary timeout must release its own loading state without another AI call.
  await page.evaluate(()=>{
   words.slowword={word:'slowword',ko:'느린 단어',status:1,addedAt:1};selectWord('slowword',null);
  });
  await page.waitForFunction(()=>words.slowword.enError&&!words.slowword.enLoading,{},{timeout:6000});
  assert.equal(await page.locator('#p-en-retry').isVisible(),true);assert.equal(await page.evaluate(()=>aiRequests),0);
  // A late public-dictionary response cannot resurrect a removed saved card.
  pending=[];
  await page.evaluate(()=>{closePanel();words.ephemeral={word:'ephemeral',ko:'잠깐의',status:1};selectWord('ephemeral',null);});
  await page.waitForFunction(()=>words.ephemeral.enLoading);
  while(!pending.length)await new Promise(done=>setTimeout(done,10));
  await page.evaluate(()=>{closePanel();delete words.ephemeral;});
  await pending.shift().fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});
  await page.waitForFunction(()=>!englishMetadataRequests.has('en:v2:ephemeral'));
  assert.equal(await page.evaluate(()=>!!words.ephemeral||wordLookupOpen()),false);
  // Home paint survives updates: no new card, image node, Blob URL or unloaded cover.
  await page.evaluate(()=>{closePanel();show('home');renderHome();});
  await page.waitForFunction(()=>document.querySelector('#shelf [data-home-key="book:morph"] img')?.naturalWidth>0);
  const stable=await page.evaluate(()=>{
   const card=document.querySelector('#shelf [data-home-key="book:morph"]'),image=card.querySelector('img'),src=image.src;
   for(let i=0;i<8;i++){positions.morph={p:.425+i/100,t:Date.now()};renderAllBookViews();}
   return {same:card===document.querySelector('#shelf [data-home-key="book:morph"]'),image:image===card.querySelector('img'),src:src===image.src,ready:!image.hidden&&image.complete};
  });
  assert.deepEqual(stable,{same:true,image:true,src:true,ready:true});
  await page.evaluate(()=>resumeHomeBook(document.getElementById('home-resume')));
  const terminal=await page.evaluate(async()=>{
   const finish=returnHomeFromReader();await homeReturnTransition.ready;
   const animation=document.getAnimations().find(a=>a.animationName==='home-glass-close');
   animation.pause();animation.currentTime=Number(animation.effect.getTiming().duration)+1;
   const opacity=getComputedStyle(document.documentElement,'::view-transition-old(root)').opacity;
   const fill=animation.effect.getTiming().fill;
   animation.play();await finish;return {opacity,fill};
  });
  assert.deepEqual(terminal,{opacity:'0',fill:'both'},'Reader snapshot flashed back after the closing animation');
  assert.equal(await page.evaluate(()=>activeAppView()),'home');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>resumeHomeBook(document.getElementById('home-resume')));
  await page.evaluate(()=>{const node=[...document.querySelectorAll('#rtext .w')].find(n=>n.getBoundingClientRect().top>60&&n.getBoundingClientRect().top<500);selectWord('patient',node,true);});
  await page.locator('#word-peek-more').click();assert.equal(await page.evaluate(()=>wordMorphAnimation),null);
  assert.deepEqual(errors,[]);
  console.log(`${engine.name()}: anchored morph/outside dismiss, bounded independent scroll, English early paint/cache/timeout/no AI, stable Home cover and return passed`);
 }finally{await browser.close();}
}}finally{await new Promise(done=>server.close(done));}
