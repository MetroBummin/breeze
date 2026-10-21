/* Offline production-UI rendering: one newly rendered PNG for each 1/60-second sample.
   Never accepts old MP4s or rescales source pixels. Existing UI/layout/copy are untouched. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
const root=resolve('.'),proof=resolve(process.env.BREEZE_CAPTURE_PROOF||'/tmp/breeze-onboarding-30fps-proof');mkdirSync(proof,{recursive:true});
const pdfPath=process.env.BREEZE_CAPTURE_PDF||'/tmp/breeze-openstax-page28.pdf';
const sourceSHA=process.env.BREEZE_CAPTURE_SHA||'2dec555656eed5068d47173be03311c02683bc46';
const selected=process.env.BREEZE_CAPTURE_FEATURES?.split(',');
const cursorMode=process.env.BREEZE_CURSOR||'circle';
const CIRCLE_CSS='#qa-touch{position:fixed;z-index:999;pointer-events:none;width:28px;height:28px;border:2px solid rgba(85,135,175,.8);border-radius:50%;background:rgba(105,155,185,.15);transform:translate(-50%,-50%)}';
const HAND_CSS='#qa-touch{position:fixed;z-index:999;pointer-events:none;width:28px;height:28px;border:2px solid rgba(85,135,175,.8);border-radius:50%;background:rgba(105,155,185,.15);transform:translate(-50%,-50%)}#qa-touch.hand{width:54px;height:54px;border:none;border-radius:0;background:radial-gradient(circle at 50% 10%,rgba(110,165,255,.50),rgba(165,130,255,.20) 45%,rgba(165,130,255,0) 70%)}#qa-touch.hand svg{display:block;width:100%;height:100%;filter:drop-shadow(0 1px 2px rgba(40,70,120,.35)) drop-shadow(0 0 7px rgba(110,160,255,.55))}';
const HAND_SVG='<svg viewBox="0 0 54 54" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d7e8ff"/></linearGradient></defs><g fill="url(#hg)"><rect x="24.2" y="5.5" width="5.6" height="18" rx="2.8"/><rect x="30.4" y="10.5" width="5" height="13" rx="2.5"/><rect x="36" y="15" width="4.6" height="9.5" rx="2.3"/><rect x="19.5" y="20" width="25" height="25" rx="10"/><ellipse cx="17.8" cy="34" rx="4.8" ry="8" transform="rotate(22 17.8 34)"/></g></svg>';
const scenes=['word','details','sentence','easy','settings','pdf','memory'].filter(n=>!selected||selected.includes(n));
if(scenes.includes('pdf')||scenes.includes('memory'))assert.equal(createHash('sha256').update(readFileSync(pdfPath)).digest('hex'),'94c0eb634676c1769ee73afafc0298827b33933a0f2afaa512a4c622df2db259','Use the unchanged verified OpenStax page28 excerpt');
const server=createServer((req,res)=>{try{const p=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.jpg':'image/jpeg','.mp4':'video/mp4'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`,browser=await chromium.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE,args:['--disable-features=LocalNetworkAccessChecks']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const receipts=[];
async function init(dark,scene){
 const pdf=scene==='pdf',viewport=pdf?{width:820,height:1180}:{width:390,height:640};
 // PDF was previously captured at 820x1180 and then halved to 410x590. Keep
 // original CSS geometry; render directly at 820x1180 rather than upscale it.
 const deviceScaleFactor=pdf?1:2;
 const context=await browser.newContext({viewport,deviceScaleFactor,hasTouch:true,serviceWorkers:'block'});const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));window.breezeInkIPad=true;});
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.goto(url);await page.evaluate(()=>homeReady);await page.evaluate(dark=>{darkMode=dark;applyDark();},dark);
 if(!pdf){
  await page.locator('#fileinput').setInputFiles({name:'A Little Curiosity.txt',mimeType:'text/plain',buffer:Buffer.from('Every story begins with a little curiosity.')});
  await page.waitForFunction(()=>books.some(b=>b.kind==='txt'));
  await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='txt'));fs=26;document.documentElement.style.setProperty('--fs','26px');
   const key=keyOf('curiosity');words[key]={word:'curiosity',clicked:'curiosity',ko:'호기심',example:'Every story begins with a little curiosity.',book:curBook.title,status:1,mark:true,addedAt:1,up:1,defs:[{pos:'noun',def:'A desire to learn or know more.'}],ai:{ko:'호기심',pos:'noun',done:true}};
   dictGet=async()=>({ko:'모든 이야기는 작은 호기심에서 시작돼요.'});dictPut=async()=>{};
   dictCall=async()=>{await new Promise(r=>setTimeout(r,450));return {sentenceEasyExplanation:true,explanation:'작은 호기심이 새로운 이야기를 시작하게 한다는 뜻이에요.'};};setSentenceEasyCapability(true);
  });await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>5);
 }
 if(pdf||scene==='memory'){
  if(!pdf)await page.evaluate(()=>show('home'));
  await page.locator('#fileinput').setInputFiles({name:pdf?'OpenStax Writing Guide — Words and Images (p. 14).pdf':'Reading Notes.pdf',mimeType:'application/pdf',buffer:readFileSync(pdfPath)});
  await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));
  if(pdf){await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');expandReaderChrome();});await page.locator('.pdf-ink-layer').first().waitFor();await wait(700);assert.equal(await page.evaluate(()=>BreezePdfInk.available()),true);}
  else{await page.evaluate(()=>show('home'));await wait(700);}
 }
 const word=page.locator('#rtext .w').filter({hasText:/^curiosity$/}).first(),sentence=page.locator('#rtext .w').filter({hasText:/^Every$/}).first();
 if(scene==='details'){await word.tap();await page.locator('#word-peek').waitFor({state:'visible'});await wait(350);}
 if(scene==='easy'){const b=await sentence.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await wait(830);await page.mouse.up();await page.locator('#ps-easy-button').waitFor({state:'visible'});await wait(350);}
 if(scene==='settings')await page.evaluate(()=>expandReaderChrome());
 await page.evaluate(()=>document.fonts.ready);
 await page.clock.install({time:new Date('2026-10-08T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-08T00:00:01Z'));
 await page.evaluate(()=>{window.captureTime=0;window.captureAnimations=new Map();
  const original=Element.prototype.animate;Element.prototype.animate=function(...args){const a=original.apply(this,args);a.pause();a.currentTime=0;captureAnimations.set(a,{start:captureTime,finished:false});return a;};
  for(const a of document.getAnimations()){const d=a.effect.getComputedTiming().endTime;if(Number.isFinite(d))a.finish();else{a.pause();a.currentTime=0;captureAnimations.set(a,{start:0,finished:false});}}
 });
 await page.addStyleTag({content:cursorMode==='hand'?HAND_CSS:CIRCLE_CSS});
 return {context,page,errors,viewport,deviceScaleFactor,word,sentence};
}
async function stepAnimations(page,t){return page.evaluate(t=>{
 for(const a of document.getAnimations())if(!captureAnimations.has(a)){a.pause();a.currentTime=0;captureAnimations.set(a,{start:t,finished:false});}
 const active=[];for(const [a,info] of captureAnimations){if(info.finished)continue;if(a.playState==='idle'){info.finished=true;continue;}const duration=a.effect.getComputedTiming().endTime,elapsed=t-info.start;
  if(elapsed>=duration){a.finish();info.finished=true;}else{a.currentTime=elapsed;active.push({name:a.animationName||'WAAPI',elapsed,duration:Number.isFinite(duration)?duration:'infinite'});}}
 const ids=['word-peek','panel','p-sentence','ps-easy','aa-pop','readpill'];const bounds={};
 for(const id of ids){const el=document.getElementById(id),b=el.getBoundingClientRect();bounds[id]={x:b.x,y:b.y,width:b.width,height:b.height,visible:!!el.getClientRects().length};}
 return {active,bounds,view:activeAppView(),peek:!document.getElementById('word-peek').hidden,panel:document.getElementById('panel').classList.contains('on'),translation:document.getElementById('ps-ko')?.textContent||'',easyText:document.getElementById('ps-easy-text').textContent};
 },t);}
async function pointer(page,t,b,scene){await page.evaluate(({t,b,scene,cursorMode,HAND_SVG})=>{let node=document.getElementById('qa-touch');if(!node){node=document.createElement('div');node.id='qa-touch';if(cursorMode==='hand'){node.classList.add('hand');node.innerHTML=HAND_SVG;node.style.transformOrigin='50% 10%';}document.body.append(node);}let opacity=0,x=b.x+b.width/2,y=b.y+b.height/2,scale=1;
 if(scene!=='pdf'){
  if(t>=200&&t<600){let q=(t-200)/400;x-=45*(1-q);y+=32*(1-q);opacity=q;}
  else if(scene==='sentence'&&t>=600&&t<1433){opacity=.8;scale=1+.15*Math.sin((t-600)/833*Math.PI);}
  else if(t>=600&&t<1000){let q=(t-600)/400;opacity=1-q;scale=1+.6*q;}
  if(scene==='sentence'&&t>=1433&&t<1700){opacity=1-(t-1433)/267;scale=1.3;}
 }
 node.style.left=x+'px';node.style.top=y+'px';node.style.opacity=String(opacity);node.style.transform=cursorMode==='hand'?`translate(-50%,-10%) scale(${scale})`:`translate(-50%,-50%) scale(${scale})`;
 },{t,b,scene,cursorMode,HAND_SVG});}
async function pdfTouch(page,type,x){await page.evaluate(({type,x})=>{const target=originalSession.pages[0].querySelector('canvas'),r=target.getBoundingClientRect(),t={identifier:1,target,clientX:r.x+r.width*x,clientY:r.y+r.height*.12,touchType:'stylus'};const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:type==='touchend'?[]:[t]},changedTouches:{value:[t]}});target.dispatchEvent(e);},{type,x});}
try{for(const dark of (process.env.BREEZE_CAPTURE_THEMES==='both'?[false,true]:process.env.BREEZE_CAPTURE_THEMES==='dark'?[true]:[false]))for(const scene of scenes){
 const {context,page,errors,viewport,deviceScaleFactor,word,sentence}=await init(dark,scene),key=scene+'-'+(dark?'dark':'light'),frames=resolve(proof,key+'-frames');mkdirSync(frames,{recursive:true});
 const crop=scene==='details'?{x:8,y:132,width:374,height:450}:['word','sentence','easy'].includes(scene)?{x:12,y:140,width:366,height:scene==='word'?200:400}:null;
 const target=scene==='word'?word:scene==='details'?page.locator('#word-peek-more'):scene==='sentence'?sentence:scene==='easy'?page.locator('#ps-easy-button'):scene==='settings'?page.locator('#aafab'):scene==='pdf'?page.locator('[data-ink-toggle]'):page.locator('#nav-vocab');
 const targetRect=await target.boundingBox();assert.ok(targetRect,key+' target missing');
 const count=['sentence','easy'].includes(scene)?270:scene==='pdf'?240:210,rows=[],posterIndex=scene==='sentence'?174:scene==='easy'?174:scene==='pdf'?162:150;
 for(let n=0;n<count;n++){
  const t=n*1000/60;if(n)await page.clock.runFor(Math.round(t)-Math.round((n-1)*1000/60));await page.evaluate(t=>window.captureTime=t,t);
  if(n===36){if(scene==='sentence'){await page.mouse.move(targetRect.x+targetRect.width/2,targetRect.y+targetRect.height/2);await page.mouse.down();}else await target.tap({force:true});}
  if(scene==='sentence'&&n===86)await page.mouse.up();
  if(scene==='sentence'&&n===92)await page.evaluate(()=>setSentenceEasyCapability(true));
  if(scene==='settings'&&n===48)await page.evaluate(()=>fontSize(1));
  if(scene==='pdf'){
   if(n===48)await pdfTouch(page,'touchstart',.08);
   if(n>=50&&n<=96)await pdfTouch(page,'touchmove',.08+.62*(n-48)/48);
   if(n===98)await pdfTouch(page,'touchend',.7);
   if(n===200)await page.locator('[data-ink-undo]').tap({force:true});
   if(n===212)await page.locator('[data-ink-toggle]').tap({force:true});
  }
  if(scene==='word'&&n===180)await page.evaluate(()=>{closePanel();const k=keyOf('curiosity');words[k].status=1;paintWord(k);});
  if(scene==='details'&&n===180)await page.evaluate(()=>{closePanel();const k=keyOf('curiosity');recentWordOpens.set(k,Date.now());openWord(k,[...document.querySelectorAll('#rtext .w')].find(n=>n.textContent==='curiosity'));});
  if(scene==='sentence'&&n===220)await page.evaluate(()=>closeSentence());
  if(scene==='easy'&&n===220)await page.evaluate(()=>{const translation=sentenceEasyState.translation;clearSentenceEasyCache();resetSentenceEasyExplanation(translation);});
  if(scene==='settings'&&n===180)await page.evaluate(()=>closeAa());
  if(scene==='memory'&&n===180)await page.evaluate(()=>show('home'));
  await pointer(page,t,targetRect,scene);const state=await stepAnimations(page,t),file=String(n).padStart(5,'0')+'.png';
  await page.screenshot({path:resolve(frames,file),...(crop?{clip:crop}:{})});
  if(n===posterIndex){await page.evaluate(()=>document.getElementById('qa-touch')?.remove());await page.screenshot({path:resolve(proof,key+'-poster.jpg'),type:'jpeg',quality:95,...(crop?{clip:crop}:{})});}
  rows.push({file,pts:n/60,ms:t,...state});
 }
 const contentBounds=rows[posterIndex].bounds[scene==='details'?'panel':scene==='sentence'||scene==='easy'?'p-sentence':'readpill'];
 if(scene==='details'){assert.ok(contentBounds.x>=crop.x&&contentBounds.y>=crop.y&&contentBounds.x+contentBounds.width<=crop.x+crop.width&&contentBounds.y+contentBounds.height<=crop.y+crop.height,'Detail crop cuts panel');}
 assert.deepEqual(errors,[]);const receipt={key,sourceSHA,viewport,deviceScaleFactor,crop,targetRect,contentBounds,width:(crop?.width||viewport.width)*deviceScaleFactor,height:(crop?.height||viewport.height)*deviceScaleFactor,fps:60,frameCount:count,duration:count/60,posterIndex,errors,method:'new production UI frame per 1/60s; controlled JS clock/native CSS and WAAPI sampling; one PNG per encoded frame',rows};
 writeFileSync(resolve(proof,key+'.json'),JSON.stringify(receipt,null,2)+'\n');receipts.push(receipt);await context.close();console.log('Captured',key,receipt.width+'x'+receipt.height,count,'new frames');
}
writeFileSync(resolve(proof,'capture-receipt.json'),JSON.stringify({sourceSHA,source:'real production UI, original authored sentence/answers; verified OpenStax excerpt; no external API',clips:receipts},null,2)+'\n');
}finally{await browser.close();server.close();}
