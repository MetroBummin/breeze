// Review-only captures of the real app's SVG/CSS; authored brand asset stays unchanged.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync,readFileSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
const baseline='437fd6f006acb62097f6737e69a4a9ad292f96bb';
const previous=execFileSync('git',['show',baseline+':index.html'],{encoding:'utf8'});
const out=resolve(process.env.BREEZE_WELCOME_PROOF||'/tmp/breeze-welcome-join-review');mkdirSync(out,{recursive:true});
const base=process.env.BREEZE_WELCOME_URL||'http://127.0.0.1:4173';
const browser=await chromium.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});
const receipts=[];
const encode=args=>{const r=spawnSync('ffmpeg',['-y','-loglevel','error',...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
try{
 for(const dark of [false,true])for(const before of [true,false]){
  const theme=dark?'dark':'light',stage=before?'before':'after',frames=resolve(out,stage+'-'+theme);mkdirSync(frames,{recursive:true});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{
   if(!r.request().url().startsWith(base))return r.abort();
   if(before&&new URL(r.request().url()).pathname==='/')return r.fulfill({body:previous,contentType:'text/html'});
   return r.continue();
  });
  await page.goto(base);await page.evaluate(()=>homeReady);await page.evaluate(()=>document.fonts.ready);
  const geometry=await page.evaluate(dark=>{
   darkMode=dark;applyDark();clearTimeout(onboardingSession.welcomeTimer);
   window.welcomeJoinAnimations=document.getElementById('onboarding').getAnimations({subtree:true});welcomeJoinAnimations.forEach(a=>a.pause());
   const path=document.getElementById('onboard-pen-path'),d=path.getAttribute('d');
   const prefix=path.cloneNode(),end=path.cloneNode();
   prefix.setAttribute('d',d.split(/ Q164 210 178 208| C187\.666667 202 221 181 235 139/)[0]);
   end.setAttribute('d',d.split(' Q221 114 230 129')[0]);
   return {d,length:path.getTotalLength(),joinStart:prefix.getTotalLength(),joinEnd:end.getTotalLength(),timing:ONBOARD_WELCOME_TIMING};
  },dark);
  const samples=[];
  for(let frame=0;frame<=210;frame++){
   const t=frame*1000/30;
   await page.evaluate(t=>{welcomeJoinAnimations.forEach(a=>a.currentTime=t);if(t>=5850)finishOnboardingWelcome();},t);
   await page.screenshot({path:resolve(frames,String(frame).padStart(5,'0')+'.png')});
   if(t<5850)samples.push(await page.evaluate(()=>({pen:Number(getComputedStyle(document.querySelector('#onboard-welcome svg')).getPropertyValue('--onboard-pen')),caption:Number(getComputedStyle(document.getElementById('onboard-prompt')).opacity)})));
  }
  copyFileSync(resolve(frames,'00210.png'),resolve(out,stage+'-full-'+theme+'.png'));
  encode(['-framerate','30','-i',resolve(frames,'%05d.png'),'-c:v','libx264','-profile:v','baseline','-pix_fmt','yuv420p','-crf','18','-an','-movflags','+faststart',resolve(out,stage+'-'+theme+'.mp4')]);
  // Enlarged actual app geometry. Only the review viewport/size is changed.
  await page.evaluate(()=>{
   document.querySelector('#onboard-welcome svg').setAttribute('viewBox','130 120 130 135');
   document.querySelector('#onboard-welcome .breeze-wordmark').style='width:360px;aspect-ratio:130/135';
   document.getElementById('onboarding').dataset.welcome='drawing';
   window.welcomeJoinAnimations=document.getElementById('onboarding').getAnimations({subtree:true});welcomeJoinAnimations.forEach(a=>a.pause());
  });
  const middle=(geometry.joinStart+geometry.joinEnd)/2/geometry.length;
  const joinMidTime=samples.findIndex(sample=>sample.pen>=middle)*1000/30;
  for(const [name,time] of [['mid',joinMidTime],['final',4200]]){
   await page.evaluate(t=>welcomeJoinAnimations.forEach(a=>a.currentTime=t),time);
   await page.locator('#onboard-welcome svg').screenshot({path:resolve(out,stage+'-zoom-'+name+'-'+theme+'.png')});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(geometry.timing,{write:4200,hold:750,fade:900});
  receipts.push({stage,theme,baseline:before?baseline:'working source',geometry,joinMidTime,samples,errors,method:'actual production CSS animations paused/seeked at exact 1/30s; session finished at 5.85s',viewport:'390x844 @2x',fps:30,frames:211});
  await context.close();console.log(stage,theme,'actual app frames captured');
 }
 for(const theme of ['light','dark'])encode(['-i',resolve(out,'before-'+theme+'.mp4'),'-i',resolve(out,'after-'+theme+'.mp4'),'-filter_complex','[0:v][1:v]hstack=inputs=2[v]','-map','[v]','-c:v','libx264','-profile:v','baseline','-pix_fmt','yuv420p','-crf','18','-an','-movflags','+faststart',resolve(out,'before-after-'+theme+'.mp4')]);
 for(const dark of [false,true]){
  const theme=dark?'dark':'light',context=await browser.newContext({viewport:{width:1440,height:450},deviceScaleFactor:2,serviceWorkers:'block'}),page=await context.newPage();
  await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());await page.goto(base);await page.evaluate(()=>homeReady);await page.evaluate(()=>document.fonts.ready);
  const reference=readFileSync('assets/brand/wordmarks/breeze-flow-'+theme+'.svg','utf8');
  await page.evaluate(({dark,reference,previous})=>{
   darkMode=dark;applyDark();clearTimeout(onboardingSession.welcomeTimer);finishOnboardingWelcome();
   const current=document.querySelector('#onboard-welcome svg').cloneNode(true),old=current.cloneNode(true);
   old.querySelector('path').setAttribute('d',previous.match(/id="onboard-pen-path"[^>]* d="([^"]+)"/)[1]);
   const original=new DOMParser().parseFromString(reference,'image/svg+xml').documentElement;
   const shell=document.createElement('main');shell.style=`position:fixed;inset:0;z-index:100;background:${dark?'#20211e':'#f5f6f5'};color:${dark?'#f3f6f4':'#202522'};padding:24px;display:flex;gap:24px;align-items:center;font:18px sans-serif;`;
   for(const [label,image] of [['원본 cursive 자산',original.cloneNode(true)],['수정 전 실제 온보딩 경로',old],['수정 후 실제 온보딩 경로',current.cloneNode(true)],['원본 회색 + 수정 경로 겹침',original.cloneNode(true)]]){
    const section=document.createElement('section');section.style='width:330px';section.textContent=label;image.setAttribute('viewBox','50 100 275 160');image.style='display:block;width:330px;height:300px;';
    if(label.includes('겹침')){image.querySelectorAll('path').forEach(p=>{p.setAttribute('fill','#888');p.setAttribute('opacity','.3');});image.append(current.querySelector('g').cloneNode(true));}
    section.append(image);shell.append(section);
   }
   document.body.append(shell);
  },{dark,reference,previous});
  await page.screenshot({path:resolve(out,'reference-before-after-overlay-'+theme+'.png')});await context.close();
 }
 writeFileSync(resolve(out,'capture-receipt.json'),JSON.stringify(receipts,null,2));
 console.log('Actual before/after welcome screenshots and 30fps comparison films ready.');
}finally{await browser.close();}
