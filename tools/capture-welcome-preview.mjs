// Capture the actual app at wall-clock speed without opening a user browser.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
const root=resolve('.'),out=resolve(process.env.BREEZE_WELCOME_PROOF||'../breeze-welcome-proof');mkdirSync(out,{recursive:true});
const frames=resolve(out,'frames');mkdirSync(frames,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer((req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch();const rows=[],errors=[];
try{
 for(const dark of [false,true]){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,serviceWorkers:'block',hasTouch:true});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith(url)?r.continue():r.abort());
  await page.goto(url);await page.evaluate(()=>homeReady);await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(dark=>{endOnboarding(false);darkMode=dark;applyDark();localStorage.removeItem(ONBOARD_WELCOME_KEY);},dark);
  await page.evaluate(()=>startOnboarding(false));await page.waitForFunction(()=>onboardingSession!==null);
  const start=Date.now(),offset=dark?7600:0;
  while(Date.now()-start<7600){
   const t=Date.now()-start;const name=String(rows.length).padStart(5,'0')+'.png';
   await page.screenshot({path:resolve(frames,name)});rows.push({file:name,ms:offset+t,theme:dark?'dark':'light'});
   await new Promise(r=>setTimeout(r,20));
  }
  await context.close();
 }
 writeFileSync(resolve(out,'frames.json'),JSON.stringify({width:390,height:844,durationMs:15200,frames:rows,errors},null,2));
 if(errors.length)throw Error(errors.join('\n'));console.log(JSON.stringify({out,frames:rows.length,durationMs:15200,errors}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
