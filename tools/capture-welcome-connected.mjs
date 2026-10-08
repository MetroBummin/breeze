// Captures actual production SVG/CSS at 30 fps; seeks its real animations, not a substitute drawing.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const out=resolve(process.env.BREEZE_WELCOME_PROOF||'/tmp/breeze-connected-welcome');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE,args:['--no-sandbox']});
const base=process.env.BREEZE_WELCOME_URL||'http://127.0.0.1:4173';const receipts=[];
try{
 for(const dark of [false,true]){
  const theme=dark?'dark':'light',frames=resolve(out,theme);mkdirSync(frames,{recursive:true});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,serviceWorkers:'block'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());await page.goto(base);await page.evaluate(()=>homeReady);await page.evaluate(()=>document.fonts.ready);
  const geometry=await page.evaluate(dark=>{
   darkMode=dark;applyDark();clearTimeout(onboardingSession.welcomeTimer);
   window.welcomeCaptureAnimations=document.getElementById('onboarding').getAnimations({subtree:true});welcomeCaptureAnimations.forEach(a=>a.pause());
   const p=document.getElementById('onboard-pen-path'),d=p.getAttribute('d'),length=p.getTotalLength();
   const points=Array.from({length:1001},(_,i)=>{const q=p.getPointAtLength(length*i/1000);return [q.x,q.y];});
   return {d,length,points,paths:document.querySelectorAll('#onboard-pen-path').length};
  },dark);
  assert.equal(geometry.paths,1);assert.equal((geometry.d.match(/M/g)||[]).length,1);assert.ok(!/[Zz]/.test(geometry.d));
  const penSamples=[];
  for(let frame=0;frame<=210;frame++){
   const t=frame*1000/30;
   await page.evaluate(t=>{welcomeCaptureAnimations.forEach(a=>a.currentTime=t);if(t>=5850)finishOnboardingWelcome();},t);
   await page.screenshot({path:resolve(frames,String(frame).padStart(5,'0')+'.png')});
   if(frame%10===0&&t<5850)penSamples.push(await page.evaluate(()=>({pen:Number(getComputedStyle(document.querySelector('#onboard-welcome svg')).getPropertyValue('--onboard-pen')),offset:Number(getComputedStyle(document.getElementById('onboard-pen-path')).strokeDashoffset),caption:Number(getComputedStyle(document.getElementById('onboard-prompt')).opacity)})));
  }
  assert.equal(penSamples[0].pen,0);assert.ok(penSamples.some(s=>s.pen===1&&s.caption===0));assert.deepEqual(errors,[]);
  for(let i=1;i<penSamples.length;i++)assert.ok(penSamples[i].pen>=penSamples[i-1].pen);
  const file=resolve(out,`Breeze-connected-welcome-${theme}.mp4`);
  const r=spawnSync('ffmpeg',['-y','-loglevel','error','-framerate','30','-i',resolve(frames,'%05d.png'),'-c:v','libx264','-profile:v','baseline','-pix_fmt','yuv420p','-crf','16','-an','-movflags','+faststart',file],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  receipts.push({theme,file,viewport:'390x844 @2x',fps:30,frames:211,duration:211/30,geometry,penSamples,errors,method:'actual production animations paused and seeked at exact 1/30s samples; session timer completed at 5.85s'});await context.close();
 }
 writeFileSync(resolve(out,'capture-receipt.json'),JSON.stringify(receipts,null,2));console.log('Light/dark actual-app welcome captured.');
}finally{await browser.close();}
