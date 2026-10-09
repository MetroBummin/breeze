// Review-only zoom: renders the actual app paths larger; no pen dots or guides.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const out=resolve(process.env.BREEZE_WELCOME_PROOF||'/tmp/breeze-b-order-preview');
const base=process.env.BREEZE_WELCOME_URL||'http://127.0.0.1:4182';
const browser=await chromium.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE,args:['--no-sandbox']});
const receipts=[];
try{
 for(const previous of [true,false]){
  const name=previous?'previous':'revised',frames=resolve(out,'zoom-'+name);mkdirSync(frames,{recursive:true});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,serviceWorkers:'block'});const page=await context.newPage();
  await page.route('**/*',r=>{
   if(!r.request().url().startsWith(base))return r.abort();
   if(previous&&new URL(r.request().url()).pathname==='/')return r.fulfill({body:spawnSync('git',['show','d4e7a59:index.html']).stdout,contentType:'text/html'});
   return r.continue();
  });await page.goto(base);await page.evaluate(()=>homeReady);await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(previous=>{
   clearTimeout(onboardingSession.welcomeTimer);window.bOrderAnimations=document.getElementById('onboarding').getAnimations({subtree:true});bOrderAnimations.forEach(a=>a.pause());
   document.querySelector('#onboard-welcome svg').setAttribute('viewBox','0 0 280 258');
   const style=document.createElement('style');style.textContent='#onboarding[data-stage="0"] #onboard-coach{width:100%;padding:220px 16px 0;justify-content:start;align-items:start} #onboard-welcome .breeze-wordmark{width:358px;aspect-ratio:280/258} #onboard-prompt,#onboard-note,#onboard-navigation{display:none!important} #b-order-label{position:fixed;top:56px;left:24px;font:600 20px var(--ui);color:var(--onboard-ink)} #b-order-footer{position:fixed;bottom:80px;left:24px;font:400 14px var(--ui);color:var(--onboard-muted)}';document.head.append(style);
   const label=document.createElement('div');label.id='b-order-label';label.textContent=(previous?'Previous':'Revised')+' B · 0.5× playback';document.getElementById('onboarding').append(label);
   const footer=document.createElement('div');footer.id='b-order-footer';footer.textContent='Actual app path · enlarged';document.getElementById('onboarding').append(footer);
  },previous);
  const positions=[];
  for(let frame=0;frame<=60;frame++){
   const t=frame*1000/30;await page.evaluate(t=>bOrderAnimations.forEach(a=>a.currentTime=t),t);
   await page.screenshot({path:resolve(frames,String(frame).padStart(5,'0')+'.png')});
   positions.push(await page.evaluate(()=>{const path=document.getElementById('onboard-pen-path'),pen=Number(getComputedStyle(document.querySelector('#onboard-welcome svg')).getPropertyValue('--onboard-pen'));const p=path.getPointAtLength(path.getTotalLength()*pen);return {pen,point:[p.x,p.y]};}));
  }
  assert.equal(await page.locator('#onboard-welcome circle').count(),0);receipts.push({name,positions,frames:61,source:previous?'d4e7a59':'working preview'});await context.close();
 }
 writeFileSync(resolve(out,'zoom-receipt.json'),JSON.stringify(receipts,null,2));
 const run=args=>{const r=spawnSync('ffmpeg',['-y','-loglevel','error',...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
 run(['-framerate','30','-i',resolve(out,'zoom-previous/%05d.png'),'-framerate','30','-i',resolve(out,'zoom-revised/%05d.png'),'-filter_complex','[0:v][1:v]hstack=inputs=2,setpts=2*PTS,fps=30[v]','-map','[v]','-c:v','libx264','-profile:v','baseline','-pix_fmt','yuv420p','-crf','16','-an',resolve(out,'zoom-comparison.mp4')]);
 run(['-i',resolve(out,'Breeze-connected-welcome-light.mp4'),'-i',resolve(out,'Breeze-connected-welcome-dark.mp4'),'-filter_complex','[0:v][1:v]hstack=inputs=2[v]','-map','[v]','-c:v','libx264','-profile:v','baseline','-pix_fmt','yuv420p','-crf','16','-an',resolve(out,'full-comparison.mp4')]);
 writeFileSync(resolve(out,'review-concat.txt'),['zoom-comparison.mp4','full-comparison.mp4'].map(n=>`file '${resolve(out,n)}'`).join('\n'));
 run(['-f','concat','-safe','0','-i',resolve(out,'review-concat.txt'),'-c','copy','-movflags','+faststart',resolve(out,'Breeze-connected-welcome-light-dark-comparison.mp4')]);console.log('B close-up before/after + actual full light/dark review MP4 ready.');
}finally{await browser.close();}
