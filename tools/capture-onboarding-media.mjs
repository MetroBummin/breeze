/* Record production controls with authored demo text and prepared test responses. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import {pdfGeometryFixture} from '../tests/helpers/pdf-geometry-fixture.mjs';
const root=resolve(process.env.BREEZE_CAPTURE_ROOT||'../breeze');
const out=resolve('assets/onboarding');mkdirSync(out,{recursive:true});
const server=createServer((req,res)=>{const p=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));try{res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE||'/usr/bin/chromium'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const receipt=[];
const selected=process.env.BREEZE_CAPTURE_FEATURES?.split(',');
try{
for(const dark of [false,true]){
 const context=await browser.newContext({viewport:{width:390,height:640},hasTouch:true,serviceWorkers:'block'});
 const page=await context.newPage();page.on('pageerror',e=>console.log('PAGE ERROR',e.message));
 await page.addInitScript(()=>{localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));window.breezeInkIPad=true;});
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.goto(url);await page.evaluate(()=>homeReady);
 await page.locator('#fileinput').setInputFiles({name:'A Little Curiosity.txt',mimeType:'text/plain',buffer:Buffer.from('Every story begins with a little curiosity.')});
 await page.waitForFunction(()=>books.some(b=>b.kind==='txt'));
 await page.evaluate(async dark=>{
  await openBook(books.find(b=>b.kind==='txt'));darkMode=dark;applyDark();fs=26;document.documentElement.style.setProperty('--fs','26px');
  const key=keyOf('curiosity');words[key]={word:'curiosity',clicked:'curiosity',ko:'호기심',example:'Every story begins with a little curiosity.',book:curBook.title,status:1,mark:true,addedAt:1,up:1,defs:[{pos:'noun',def:'A desire to learn or know more.'}],ai:{ko:'호기심',pos:'noun',done:true}};
  dictGet=async()=>({ko:'모든 이야기는 작은 호기심에서 시작돼요.'});dictPut=async()=>{};
  dictCall=async()=>{await new Promise(r=>setTimeout(r,450));return {sentenceEasyExplanation:true,explanation:'작은 호기심이 새로운 이야기를 시작하게 한다는 뜻이에요.'};};setSentenceEasyCapability(true);
 },dark);
 await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>5);
 await page.addStyleTag({content:'#qa-touch{position:fixed;z-index:999;pointer-events:none;width:28px;height:28px;border:2px solid rgba(85,135,175,.8);border-radius:50%;background:rgba(105,155,185,.15);transform:translate(-50%,-50%)}'});
 const mark=async locator=>{const b=await locator.boundingBox();if(!b)throw Error('Missing target');await page.evaluate(b=>{let n=document.getElementById('qa-touch');if(!n){n=document.createElement('div');n.id='qa-touch';document.body.append(n);}n.style.left=b.x+b.width/2+'px';n.style.top=b.y+b.height/2+'px';},b);return b;};
 const clear=()=>page.evaluate(()=>document.getElementById('qa-touch')?.remove());
 async function clip(name,target,action){
  if(selected&&!selected.includes(name)){await action(await target.boundingBox());await wait(180);return;}
  const key=name+'-'+(dark?'dark':'light'),frames=resolve('/tmp/breeze-onboard-frames',key);mkdirSync(frames,{recursive:true});
  await clear();let running=true,count=0,rows=[];
  const focus=['word','details','sentence','easy'].includes(name);
  const region=name==='details'?{x:8,y:132,width:374,height:450}:focus?{x:12,y:140,width:366,height:name==='word'?200:400}:undefined;
  const capturing=(async()=>{while(running){const start=Date.now(),path=resolve(frames,String(count++).padStart(4,'0')+'.png');await page.screenshot({path,clip:region});rows.push({path,time:Date.now()});await wait(Math.max(0,90-(Date.now()-start)));}})();
  await wait(400);const rect=await mark(target);await wait(220);await action(rect);await wait(180);await clear();await wait(1400);running=false;await capturing;
  await page.screenshot({path:resolve(out,key+'.jpg'),type:'jpeg',quality:85,clip:region});
  const contentBounds=name==='details'?await page.locator('#panel').boundingBox():null;
  if(contentBounds&&(contentBounds.x<region.x||contentBounds.y<region.y||contentBounds.x+contentBounds.width>region.x+region.width||contentBounds.y+contentBounds.height>region.y+region.height))throw Error('Detail panel exceeds capture crop');
  const concat=rows.map((row,i)=>`file '${row.path}'\nduration ${i<rows.length-1?(rows[i+1].time-row.time)/1000:.09}`).join('\n');writeFileSync(resolve(frames,'frames.txt'),concat);
  const result=spawnSync('ffmpeg',['-y','-loglevel','error','-f','concat','-safe','0','-i',resolve(frames,'frames.txt'),'-vf','fps=24','-c:v','libx264','-profile:v','baseline','-level','3.0','-pix_fmt','yuv420p','-crf','29','-an','-movflags','+faststart',resolve(out,key+'.mp4')],{encoding:'utf8'});if(result.status)throw Error(result.stderr);
  receipt.push({key,region,contentBounds,sourceSHA:process.env.BREEZE_CAPTURE_SHA||'e7b61d5304d20d639d45fc8dd23116db5d6446e5',target:await target.getAttribute('id'),rect,frames:count,duration:rows.length?(rows.at(-1).time-rows[0].time)/1000:0});console.log('Recorded',key);
 }
 const word=page.locator('#rtext .w').filter({hasText:/^curiosity$/}).first();
 await clip('word',word,()=>word.tap());await page.locator('#word-peek').waitFor({state:'visible'});
 if(selected?.length===1&&selected[0]==='word'){await context.close();continue;}
 await clip('details',page.locator('#word-peek-more'),()=>page.locator('#word-peek-more').tap());
 if(selected?.length===1&&selected[0]==='details'){await context.close();continue;}
 await page.evaluate(()=>closePanel());
 const sentence=page.locator('#rtext .w').filter({hasText:/^Every$/}).first();
 await clip('sentence',sentence,async b=>{await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await wait(830);await page.mouse.up();});
 await page.evaluate(()=>setSentenceEasyCapability(true));
 await page.locator('#ps-easy-button').waitFor({state:'visible'});
 await clip('easy',page.locator('#ps-easy-button'),()=>page.locator('#ps-easy-button').tap());
 await page.evaluate(()=>{closeSentence();expandReaderChrome();});
 await clip('settings',page.locator('#aafab'),async()=>{await page.locator('#aafab').tap();await wait(200);await page.evaluate(()=>fontSize(1));});
 await page.evaluate(()=>{closeAa();show('home');});
 await page.locator('#fileinput').setInputFiles({name:'Reading Notes.pdf',mimeType:'application/pdf',buffer:pdfGeometryFixture(['A little curiosity opens a new story.','Reading should feel easy.','Mark an idea worth remembering.'])});
 await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));
 await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');expandReaderChrome();});
 await page.locator('.pdf-ink-layer').first().waitFor();await wait(600);
 await clip('pdf',page.locator('[data-ink-toggle]'),async()=>{await page.locator('[data-ink-toggle]').tap();await wait(160);const box=await page.locator('.pdf-ink-layer').first().boundingBox();await page.evaluate(async()=>{const target=originalSession.pages[0].querySelector('canvas'),r=target.getBoundingClientRect();
 const touch=x=>({identifier:1,target,clientX:r.x+r.width*x,clientY:r.y+r.height*.12,touchType:'stylus'});
 const send=(type,t)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:type==='touchend'?[]:[t]},changedTouches:{value:[t]}});target.dispatchEvent(e);};
 send('touchstart',touch(.08));for(let x=.08;x<=.7;x+=.025){send('touchmove',touch(x));await new Promise(r=>setTimeout(r,20));}send('touchend',touch(.7));});});
 await page.evaluate(()=>show('home'));await wait(700);
 await clip('memory',page.locator('#nav-vocab'),()=>page.locator('#nav-vocab').tap());
 await context.close();
}
const receiptPath=resolve('docs/qa/onboarding-carousel/capture-receipt.json');
const prior=selected?JSON.parse(readFileSync(receiptPath,'utf8')).clips.filter(row=>!receipt.some(next=>next.key===row.key)):[];
writeFileSync(receiptPath,JSON.stringify({sourceRoot:root,source:'real app UI, authored demo TXT/PDF, prepared Korean answers, no external API',clips:[...prior,...receipt]},null,2));
}finally{await browser.close();server.close();}
