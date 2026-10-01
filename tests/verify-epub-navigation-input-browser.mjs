import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url)),proof='/tmp/breeze-reader-notice-212';mkdirSync(proof,{recursive:true});
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
 try{if(!path.startsWith(root))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const url=`http://127.0.0.1:${server.address().port}/`;
try{for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
 const browser=await engine.launchPersistentContext('',{viewport:{width:390,height:844},serviceWorkers:'block',hasTouch:true});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));await page.goto(url);await page.evaluate(()=>homeReady);
 await page.evaluate(async()=>{
  await ensureZipLib();const zip=new JSZip();zip.file('mimetype','application/epub+zip');
  zip.file('META-INF/container.xml','<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>');
  zip.file('book.opf','<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata/><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>');
  const paras=Array.from({length:240},(_,i)=>`Paragraph ${i}. A patient reader follows the quiet chapter without losing their place.`);
  for(const name of ['a','b'])zip.file(name+'.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head><title>'+name+'</title></head><body>'+paras.map(p=>'<p>'+p+'</p>').join('')+'</body></html>');
  const record={kind:'epub',hash:'nav212',blob:await zip.generateAsync({type:'blob'})},book={id:'nav212',title:'EPUB navigation',kind:'epub',original:{hash:'nav212'},paras};
  books=[book];positions[book.id]={mode:'original',p:0,y:0};await openBook(book,{prepared:{book,original:record}});await Promise.all(originalSession.frameGeometryReady);
 });
 // Word selection while chrome is collapsed used to leave the navigation parent inert.
 await page.evaluate(()=>{
  setReaderChrome(true);
  words.patient={word:'patient',ko:'인내심 있는',status:1,addedAt:1};
  const marker=document.createElement('span');marker.className='original-selection-marker';
  marker.style.cssText='position:fixed;left:200px;top:160px;width:50px;height:22px';
  document.getElementById('v-read').append(marker);
  selectWord('patient',marker,true);
 });
 await page.locator('#readpill-title').tap();
 await page.waitForFunction(()=>!document.body.classList.contains('chrome-hidden'));
 assert.equal(await page.locator('#reader-navigation').evaluate(n=>n.inert),false,'Expanded navigation retains an inert parent');
 await page.locator('#pdf-page-button').tap();await page.waitForSelector('[data-epub-page="2"]');
 assert.equal(await page.evaluate(()=>wordLookupOpen()),false,'Sidebar must retire the word presentation');
 await page.locator('#pdf-navigation-toggle').tap();
 await page.locator('#pdf-page-navigation').waitFor({state:'hidden'});
 await page.locator('#aafab').tap();assert.equal(await page.locator('#aa-pop').isVisible(),true);
 await page.locator('#aafab').tap();
 await page.locator('#pdf-page-button').tap();await page.waitForSelector('[data-epub-page="2"]');

 await page.evaluate(async()=>{await Promise.allSettled(document.getElementById('pdf-page-control').getAnimations().map(a=>a.finished));});
 // Simulate late image/font reflow between a trusted down and up. The pressed
 // DOM button must survive so its click reaches navigation exactly once.
 const button=page.locator('[data-epub-page="2"]'),box=await button.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 await page.evaluate(()=>{window.pressedPreview=document.querySelector('[data-epub-page="2"]');window.oldChapterHeight=originalSession.frames[0].clientHeight;const body=originalSession.frames[0].contentDocument.body;for(let i=0;i<8;i++){const p=body.ownerDocument.createElement('p');p.textContent='A late illustration caption expands the flowing chapter.';body.append(p);}});
 await page.waitForFunction(()=>originalSession.frames[0].clientHeight>window.oldChapterHeight);await page.waitForTimeout(100);
 assert.equal(await page.evaluate(()=>window.pressedPreview.isConnected),true,'Reflow must retain the button held by the user');
 await page.mouse.up();
 await page.waitForFunction(()=>{const n=pdfNavigation,p=n.pages[1],f=n.session.frames[p.spine];return n.contact==null&&Math.abs(f.getBoundingClientRect().top+p.y*originalZoom()-topInset())<3;});
 // Repeated actual touchscreen selection, while previews are still allowed to
 // render, must update the chosen page and settle at the exact source slice.
 for(const [width,height] of [[320,740],[390,844],[820,1180],[1440,900],[844,390]])for(const dark of [false,true]){
  await page.setViewportSize({width,height});await page.evaluate(d=>{darkMode=d;applyDark();},dark);await page.waitForTimeout(350);
  await page.evaluate(()=>{pdfNavigation.strip.scrollTop=0;paintEpubThumbnails();});
  for(const n of [2,1,2,1]){
   await page.locator(`[data-epub-page="${n}"]`).tap();
   await page.waitForFunction(n=>{const nav=pdfNavigation,p=nav.pages[n-1],f=nav.session.frames[p.spine];return Math.abs(f.getBoundingClientRect().top+p.y*originalZoom()-topInset())<3;},n);
   await page.waitForFunction(n=>document.querySelector(`[data-epub-page="${n}"]`)?.getAttribute('aria-current')==='true',n,{timeout:5000}).catch(async e=>{console.log('Selection debug',JSON.stringify({width,height,dark,n,state:await page.evaluate(n=>({current:epubNavigationCurrentPage(pdfNavigation),spine:originalSession.navigationSpine,top:readerScrollTop(),frame:originalSession.frames[0].getBoundingClientRect().top,zoom:originalZoom(),inset:topInset(),height:pdfNavigation.pageHeights[0],slice:pdfNavigation.pages[n-1],buttons:[...document.querySelectorAll('.pdf-thumbnail-jump')].map(b=>[b.dataset.epubPage,b.getAttribute('aria-current')])}),n)}));throw e;});
  }
  await page.screenshot({path:`${proof}/${engine.name()}-epub-${width}-${dark?'dark':'light'}.png`});
 }
 // Sample a real move: it must travel through intermediate positions rather than jump.
 const motion=await page.evaluate(async()=>{
  const values=[],start=readerScrollTop();let done=false;
  const sample=()=>{values.push(readerScrollTop());if(!done)requestAnimationFrame(sample);};requestAnimationFrame(sample);
  await goEpubNavigationPage(pdfNavigation,1);done=true;return {start,end:readerScrollTop(),values};
 });
 assert.ok(motion.values.some(y=>y>motion.start+3&&y<motion.end-3),'EPUB movement has intermediate source positions');
 assert.ok(motion.values.every((y,i)=>!i||y>=motion.values[i-1]-1),'One selection advances monotonically');
 await page.evaluate(()=>goEpubNavigationPage(pdfNavigation,0));
 // A newer choice wins over the previous motion, without a queued late jump.
 await page.evaluate(()=>{pdfNavigation.strip.scrollTop=0;paintEpubThumbnails();void goEpubNavigationPage(pdfNavigation,1);});await page.waitForTimeout(40);
 await page.locator('[data-epub-page="1"]').tap();await page.waitForTimeout(300);assert.ok(await page.evaluate(()=>Math.abs(originalSession.frames[0].getBoundingClientRect().top-topInset())<3));
 // Reduced motion navigates immediately and keeps the panel open.
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>goEpubNavigationPage(pdfNavigation,1));
 assert.ok(await page.evaluate(()=>{const n=pdfNavigation,p=n.pages[1];return Math.abs(n.session.frames[0].getBoundingClientRect().top+p.y-topInset())<3;}));
 assert.deepEqual(errors,[]);console.log(engine.name()+': EPUB pressed targets survive late reflow, trusted repeated taps, exact slice settling, latest selection and reduced motion passed');
 }finally{await browser.close();}
}}finally{await new Promise(done=>server.close(done));}
