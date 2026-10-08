/* Single review video: the actual app's welcome, seven passive scenes and completion.
   Native-iPad capability is emulated at a narrow viewport solely to include the PDF scene. */
import {chromium} from 'playwright';
import {createServer} from 'node:http';import {readFileSync,writeFileSync,mkdirSync,statSync} from 'node:fs';import {resolve,extname} from 'node:path';import {spawnSync} from 'node:child_process';
const root=resolve('.'),out=process.env.BREEZE_ONBOARD_PROOF||'/tmp/breeze-onboarding-carousel';mkdirSync(out,{recursive:true});
const server=createServer((req,res)=>{const p=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.jpg':'image/jpeg','.mp4':'video/mp4','.svg':'image/svg+xml','.woff2':'font/woff2'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;const browser=await chromium.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'});await context.addInitScript(()=>{window.breezeInkIPad=true;});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(url)?r.continue():r.abort());await page.goto(url);await page.evaluate(()=>homeReady);
await page.screenshot({path:resolve(out,'final-welcome.png')});
const frames=resolve(out,'final-flow-frames');mkdirSync(frames,{recursive:true});let running=true,rows=[];const chapters=[{scene:'welcome',at:0}];
const start=Date.now();const capture=(async()=>{let i=0;while(running){const p=resolve(frames,String(i++).padStart(5,'0')+'.png');await page.screenshot({path:p});rows.push({p,t:Date.now()});await wait(85);}})();
await wait(1700);await page.locator('#onboard-next').tap();
for(let i=0;i<7;i++){
 const name=await page.evaluate(()=>onboardingSession.pages[onboardingSession.page-1][0]);chapters.push({scene:name,at:(Date.now()-start)/1000});
 await page.waitForFunction(()=>document.querySelector('#onboard-carousel video[src]')?.readyState>=2);await wait(3500);
 await page.screenshot({path:resolve(out,`final-${i+1}-${name}.png`)});await page.locator('#onboard-next').tap();
}
chapters.push({scene:'complete-home',at:(Date.now()-start)/1000});await wait(900);
await page.evaluate(()=>{darkMode=true;applyDark();return startOnboarding(true);});
chapters.push({scene:'dark-welcome',at:(Date.now()-start)/1000});
await page.screenshot({path:resolve(out,'final-dark-welcome.png')});await wait(1100);await page.locator('#onboard-next').tap();
for(let i=0;i<7;i++){
 const name=await page.evaluate(()=>onboardingSession.pages[onboardingSession.page-1][0]);chapters.push({scene:'dark-'+name,at:(Date.now()-start)/1000});
 await page.waitForFunction(()=>document.querySelector('#onboard-carousel video[src]')?.readyState>=2);await wait(name==='details'?3500:1800);
 await page.screenshot({path:resolve(out,`final-dark-${i+1}-${name}.png`)});await page.locator('#onboard-next').tap();
}
chapters.push({scene:'dark-complete-home',at:(Date.now()-start)/1000});await wait(1000);running=false;await capture;
if(errors.length)throw Error(errors.join('\n'));await context.close();
writeFileSync(resolve(frames,'frames.txt'),rows.map((r,i)=>`file '${r.p}'\nduration ${i<rows.length-1?(rows[i+1].t-r.t)/1000:.1}`).join('\n'));
const file=resolve(out,'Breeze-onboarding-full-flow.mp4');const result=spawnSync('ffmpeg',['-y','-loglevel','error','-f','concat','-safe','0','-i',resolve(frames,'frames.txt'),'-vf','fps=24','-c:v','libx264','-profile:v','baseline','-level','3.0','-pix_fmt','yuv420p','-crf','24','-an','-movflags','+faststart',file],{encoding:'utf8'});if(result.status)throw Error(result.stderr);
writeFileSync(resolve(out,'full-flow-receipt.json'),JSON.stringify({file,bytes:statSync(file).size,chapters,errors,capability:'native iPad flag emulated; this does not establish physical device acceptance'},null,2));console.log('Full flow review captured:',file);
}finally{await browser.close();server.close();}
