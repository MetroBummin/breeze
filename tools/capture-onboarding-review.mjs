/* Single review video: the actual app's three-card carousel onboarding,
   card by card in light and dark, ending with Skip back home. */
import {chromium} from 'playwright';
import {createServer} from 'node:http';import {readFileSync,writeFileSync,mkdirSync,statSync} from 'node:fs';import {resolve,extname} from 'node:path';import {spawnSync} from 'node:child_process';
const root=resolve('.'),out=process.env.BREEZE_ONBOARD_PROOF||'/tmp/breeze-onboarding-carousel';mkdirSync(out,{recursive:true});
const server=createServer((req,res)=>{const p=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.jpg':'image/jpeg','.mp4':'video/mp4','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;const browser=await chromium.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(url)?r.continue():r.abort());await page.goto(url);await page.evaluate(()=>homeReady);
const goCard=index=>page.evaluate(index=>{const w=document.getElementById('onboard-wrap');const c=w.querySelector('.onboard-card');w.scrollTo({left:(c.offsetWidth+20)*index,behavior:'smooth'});},index);
const waitCard=index=>page.waitForFunction(index=>onboardingCardIndex()===index,index);
const waitVideo=index=>page.waitForFunction(index=>{const v=document.querySelectorAll('#onboarding .onboard-card video')[index];return v.readyState>=2&&!v.paused;},index);
await page.screenshot({path:resolve(out,'final-card1.png')});
const frames=resolve(out,'final-flow-frames');mkdirSync(frames,{recursive:true});let running=true,rows=[];const chapters=[{scene:'card1-word',at:0}];
const start=Date.now();const capture=(async()=>{let i=0;while(running){const p=resolve(frames,String(i++).padStart(5,'0')+'.png');await page.screenshot({path:p});rows.push({p,t:Date.now()});await wait(85);}})();
await waitVideo(0);await wait(1700);await goCard(1);await waitCard(1);
chapters.push({scene:'card2-wordbook',at:(Date.now()-start)/1000});
await waitVideo(1);await wait(3500);
await page.screenshot({path:resolve(out,'final-card2.png')});
await goCard(2);await waitCard(2);
chapters.push({scene:'card3-covers',at:(Date.now()-start)/1000});
await page.waitForFunction(()=>document.getElementById('onboard-book-title').textContent!=="");await wait(1500);
await page.screenshot({path:resolve(out,'final-card3.png')});
const before=await page.locator('#onboard-book-title').textContent();
await page.evaluate(()=>{const fan=document.getElementById('onboard-fan'),fr=fan.getBoundingClientRect();const slots=[...fan.children].filter(s=>{const r=s.getBoundingClientRect();return r.left<fr.right&&r.right>fr.left;});slots[slots.length-1].click();});
await page.waitForFunction(before=>document.getElementById('onboard-book-title').textContent!==before,before);
await wait(900);
await page.screenshot({path:resolve(out,'final-card3-tapped.png')});
await page.locator('#onboard-skip').tap();
chapters.push({scene:'complete-home',at:(Date.now()-start)/1000});await wait(900);
await page.evaluate(()=>{darkMode=true;applyDark();return startOnboarding(true);});
chapters.push({scene:'dark-card1-word',at:(Date.now()-start)/1000});
await page.screenshot({path:resolve(out,'final-dark-card1.png')});await wait(1100);await goCard(1);await waitCard(1);
chapters.push({scene:'dark-card2-wordbook',at:(Date.now()-start)/1000});
await waitVideo(1);await wait(1800);
await page.screenshot({path:resolve(out,'final-dark-card2.png')});await goCard(2);await waitCard(2);
chapters.push({scene:'dark-card3-covers',at:(Date.now()-start)/1000});
await page.waitForFunction(()=>document.getElementById('onboard-book-title').textContent!=="");await wait(1100);
await page.screenshot({path:resolve(out,'final-dark-card3.png')});await page.locator('#onboard-skip').tap();
chapters.push({scene:'dark-complete-home',at:(Date.now()-start)/1000});await wait(1000);running=false;await capture;
if(errors.length)throw Error(errors.join('\n'));await context.close();
writeFileSync(resolve(frames,'frames.txt'),rows.map((r,i)=>`file '${r.p}'\nduration ${i<rows.length-1?(rows[i+1].t-r.t)/1000:.1}`).join('\n'));
const file=resolve(out,'Breeze-onboarding-full-flow.mp4');const result=spawnSync('ffmpeg',['-y','-loglevel','error','-f','concat','-safe','0','-i',resolve(frames,'frames.txt'),'-vf','fps=24','-c:v','libx264','-profile:v','baseline','-level','3.0','-pix_fmt','yuv420p','-crf','24','-an','-movflags','+faststart',file],{encoding:'utf8'});if(result.status)throw Error(result.stderr);
writeFileSync(resolve(out,'full-flow-receipt.json'),JSON.stringify({file,bytes:statSync(file).size,chapters,errors,capability:'review capture from the web build; this does not establish physical device acceptance'},null,2));console.log('Full flow review captured:',file);
}finally{await browser.close();server.close();}
