import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
const server=createServer((req,res)=>{try{const p=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));if(!p.startsWith(root+'/'))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;


try{for(const engine of [chromium,webkit]){
 const browser=await engine.launch();try{
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
 await page.goto(url);await page.evaluate(()=>homeReady);
 const result=await page.evaluate(async()=>{
  const check=(v,m)=>{if(!v)throw Error(m);};
  const settle=()=>new Promise(r=>setTimeout(r,100));
  const b={id:'retained',title:'Retained',kind:'txt',paras:Array.from({length:100},()=>('A gentle breeze makes reading easy. ').repeat(10))};
  books=[b];positions={};await openBook(b);await settle();readerScrollTo(900);await settle();
  const first=document.getElementById('rtext').firstChild;
  const returning=returnHomeFromReader();
  await homeReturnTransition.ready;
  const root=document.documentElement;
  const motions=document.getAnimations();
  const closing=motions.find(a=>a.animationName==='home-glass-close');
  check(!!closing,'closing animation missing');
  motions.forEach(a=>{a.pause();a.currentTime=170;});
  check(getComputedStyle(root,'::view-transition-old(root)').filter==='none','full-screen blur remains');
  check(getComputedStyle(root,'::view-transition-old(root)').opacity==='1','Reader fades before landing');
  check(motions.some(a=>String(a.animationName).includes('reader-control')),'shared control animation missing');
  motions.forEach(a=>a.finish());await returning;
  check(canReuseReader(b),'Reader was not retained');
  await resumeHomeBook(document.getElementById('home-resume'));await settle();
  check(first===document.getElementById('rtext').firstChild,'same book rebuilt text');
  check(Math.abs(readerScrollTop()-900)<5,'resume lost position');
  show('home');b.paras[0]='Changed source paragraph.';
  await resumeHomeBook(document.getElementById('home-resume'));await settle();
  check(first!==document.getElementById('rtext').firstChild,'changed source reused stale body');
  show('home');releaseRetainedReader();check(!retainedReader&&!document.getElementById('rtext').childElementCount,'expiry did not free DOM');
  // Exercise actual EPUB/PDF sessions and retain their parsed document identity.
  const originalResults=[];
  for(const [kind,path] of [['epub','assets/classics/alice-in-wonderland.epub'],['pdf','ready/workbooks/ne-minbyeongcheon-lesson-1.pdf']]){
    const blob=await (await fetch(path)).blob();
    const record={kind,hash:'retained-'+kind,blob};
    const book={id:'retained-'+kind,title:'Retained '+kind,kind,original:{hash:record.hash},paras:['A gentle breeze makes reading easy.']};
    books=[book];positions[book.id]={mode:'original',t:1,p:0,y:0};
    await openBook(book,{prepared:{book,original:record}});await settle();
    check(originalSession&&originalSession.kind===kind,'original failed to load');
    const session=originalSession,node=document.getElementById('original-content').firstChild;
    show('home');check(canReuseReader(book),'original reader not retained');
    await resumeHomeBook(document.getElementById('home-resume'));await settle();
    check(originalSession===session,'original session rebuilt');
    check(document.getElementById('original-content').firstChild===node,'original DOM rebuilt');
    check(currentReaderMode==='original','original mode lost');
    originalResults.push(kind);
    show('home');releaseRetainedReader();check(!originalSession,'original session not released');
  }
  return {textIdentityPreserved:true,positionPreserved:true,sourceEditInvalidates:true,originalSessionsReused:originalResults,releaseVerified:true};
 });
 console.log(engine.name(),JSON.stringify(result));
 }finally{await browser.close();}
}}finally{server.close();}
