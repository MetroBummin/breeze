/* Real PDF.js + Chromium/WebKit. No network, user profile or persistent data.
   Optional original document: BREEZE_QA_PDF=/absolute/file.pdf
   Optional screenshots: BREEZE_QA_OUTPUT=/absolute/output/directory */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {pdfGeometryFixture} from './helpers/pdf-geometry-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2'};
const server=createServer((req,res)=>{
 const p=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
 if(!p.startsWith(root)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',mime[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}
 catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/`,reports=[];
const sources=[['fixture',pdfGeometryFixture()]];
if(process.env.BREEZE_QA_PDF)sources.push(['supplied',readFileSync(process.env.BREEZE_QA_PDF)]);
const output=process.env.BREEZE_QA_OUTPUT;if(output)mkdirSync(output,{recursive:true});
try{
 for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
  for(const [source,pdf] of sources){
   // macOS WebKit needs a temporary persistent context to store imported PDF
   // Blobs in IndexedDB, matching the existing pinch browser regression.
   const profile=mkdtempSync(resolve(tmpdir(),'breeze-pdf-geometry-'));
   const browser=await engine.launchPersistentContext(profile,{headless:true,viewport:{width:1100,height:950},deviceScaleFactor:1,serviceWorkers:'block'});
   try{const page=await browser.newPage();
   const errors=[],warnings=[];let resizeObserverDeferrals=0;
   page.on('pageerror',e=>{
    // WebKit also emits this one-frame delivery deferral on the unmodified
    // baseline during rapid resize. Verify settled geometry above/below; do
    // not classify it as an application exception or hide other errors.
    if(e.message==='ResizeObserver loop completed with undelivered notifications.')resizeObserverDeferrals++;
    else errors.push(e.message);
   });
   page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());});
   await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1','done'));
   await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
   await page.goto(url+'index.html');
   await page.evaluate(()=>{window.qaBuilds=0;window.qaBuildTimes=[];const build=buildPdfWordBoxes;buildPdfWordBoxes=async(...a)=>{qaBuilds++;const t=performance.now();const result=await build(...a);qaBuildTimes.push(performance.now()-t);return result;};});
   await page.locator('#fileinput').setInputFiles({name:`${source}.pdf`,mimeType:'application/pdf',buffer:pdf});
   await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'),null,{timeout:120000});
   await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});
   try{await page.waitForFunction(()=>originalSession?.wordBoxes.get(1)?.length>0);}catch(error){
    console.error({engine:engine.name(),source,errors,warnings,state:await page.evaluate(()=>({mode:currentReaderMode,kind:originalSession?.kind,builds:qaBuilds,settled:[...originalSession?.settled||[]],counts:[...originalSession?.wordBoxes||[]].map(([p,b])=>[p,b.length])}))});throw error;
   }
   const initial=await page.evaluate(()=>{
    const list=originalSession.wordBoxes.get(1);window.qaBoxes=list;
    words={};for(const b of list){const key=keyOf(b.word);words[key]={word:b.word,clicked:b.word,forms:[key],status:1,mark:true,
      ko:'검증',defs:[],kodict:[],ai:{ko:'검증',done:true},addedAt:1,up:1};}
    refreshPdfSavedWords(originalSession);
    window.qaTarget=list.find(b=>b.word==='perspective')||list.find(b=>b.word==='maximum');
    return {count:list.length,word:qaTarget.word,words:list.map(b=>b.word)};
   });
   assert.ok(initial.count>100,'dense highlight fixture');
   if(source==='fixture')for(const word of ['ill','minimum','world','maximum','extraordinary','well-known','kerning','gap'])assert.ok(initial.words.includes(word),word);
   const verify=()=>page.evaluate(()=>{
    const p=originalSession.pages[0],r=p.getBoundingClientRect(),markers=[...p.querySelectorAll('.original-saved-marker')];
    let maxError=0;
    for(let i=0;i<markers.length;i++){
     const b=qaBoxes[i],m=markers[i].getBoundingClientRect();
     maxError=Math.max(maxError,Math.abs(m.left-(r.left+b.x*r.width)),Math.abs(m.top-(r.top+b.y*r.height)),
      Math.abs(m.right-(r.left+(b.x+b.w)*r.width)),Math.abs(m.bottom-(r.top+(b.y+b.h)*r.height)));
    }
    const target=qaTarget,cx=r.left+(target.x+target.w/2)*r.width,cy=r.top+(target.y+target.h/2)*r.height;
    return {maxError,count:markers.length,sameCache:qaBoxes===originalSession.wordBoxes.get(1),
      hit:pdfWordAtPoint(p,cx,cy)?.word,blend:getComputedStyle(markers[0]).mixBlendMode};
   });
   let maxError=0;
   for(const zoom of [.8,1,1.5,2.5]){
    await page.evaluate(z=>{
     // The UI intentionally has a 100% minimum. Exercise the same CSS zoom
     // layer at 80% too, without changing the product's pinch limits.
     originalZoomLevel=z;applyOriginalZoomTransform();readerScrollTo(0);
    },zoom);
    const m=await verify();maxError=Math.max(maxError,m.maxError);
    assert.ok(m.maxError<.12,`${engine.name()} ${source} ${zoom}: ${m.maxError}px`);
    assert.equal(m.count,initial.count);assert.ok(m.sameCache);assert.equal(m.hit,initial.word);assert.equal(m.blend,'multiply');
   }
   await page.evaluate(()=>{originalZoomLevel=1;applyOriginalZoomTransform();readerScrollTo(0);});
   for(const width of [700,932,640,932,700,932]){
    await page.evaluate(w=>{document.getElementById('original-content').style.width=w+'px';},width);
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const m=await verify();assert.ok(m.maxError<.12);assert.ok(m.sameCache);
   }
   await page.evaluate(()=>{document.getElementById('original-content').style.width='';});
   for(const size of [{width:390,height:844},{width:844,height:390},{width:1100,height:950}]){
    await page.setViewportSize(size);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const m=await verify();assert.ok(m.maxError<.12);assert.ok(m.sameCache);
   }
   // Repeated popup open/close goes through actual PDF hit-test/lookup, using
   // cached meanings so the regression never depends on an AI request.
   for(let i=0;i<4;i++){
    await page.evaluate(()=>{readerScrollTo(0);openPdfWord(originalSession.pages[0],qaTarget);});
    await page.waitForFunction(()=>wordPeekOpen());
    await page.evaluate(()=>expandWordDetail());await page.waitForFunction(()=>wordPanelOpen());
    await page.evaluate(()=>closePanel());const m=await verify();assert.ok(m.maxError<.12);assert.ok(m.sameCache);
   }
   // Multi-line phrase uses precisely the same member boxes, not a rectangle
   // spanning unrelated text between lines.
   const phrase=await page.evaluate(()=>{
    const list=qaBoxes;let at=list.findIndex((b,i)=>i>2&&b.line!==list[i-1].line);at=Math.max(1,at);
    const members=list.slice(at-1,at+2),parts=members.map(b=>lemmaCands(b.word)[0]),key='phrase:qa';
    words={};words[key]={word:members.map(b=>b.word).join(' '),phraseParts:parts,status:1,mark:true};
    refreshPdfSavedWords(originalSession);
    const markers=[...originalSession.pages[0].querySelectorAll('.phrase')];
    const matches=members.every(b=>markers.some(m=>Math.abs(parseFloat(m.style.left)/100-b.x)<1e-6&&
      Math.abs(parseFloat(m.style.top)/100-b.y)<1e-6&&Math.abs(parseFloat(m.style.width)/100-b.w)<1e-6));
    return {matches,count:markers.length,lines:new Set(members.map(b=>b.line)).size,parts,members,marks:markers.map(m=>({left:m.style.left,top:m.style.top,width:m.style.width,text:m.textContent}))};
   });
   assert.ok(phrase.matches,JSON.stringify(phrase));assert.ok(phrase.count>=3);assert.ok(phrase.lines>=2);
   await page.evaluate(()=>{
    words={};qaBoxes.forEach(b=>{words[keyOf(b.word)]={word:b.word,status:1,mark:true};});refreshPdfSavedWords(originalSession);
   });
   // Scroll performs no word-geometry work and keeps the exact cached map.
   await page.evaluate(async()=>{await Promise.all([...originalSession.rendering.values()]);});
   const before=await page.evaluate(()=>qaBuilds);
   await page.evaluate(async()=>{for(let i=0;i<40;i++){readerScrollTo(100+(i%8)*45);await new Promise(requestAnimationFrame);}readerScrollTo(0);});
   assert.equal(await page.evaluate(()=>qaBuilds),before,'scroll rebuilt PDF geometry');assert.ok((await verify()).sameCache);
   // Repaint at higher resolution must retain the lookup map and saved marks.
   await page.evaluate(async()=>{setOriginalZoom(2);await renderOriginalPdfPage(originalSession,1,{resharpen:true});setOriginalZoom(1);readerScrollTo(0);});
   assert.ok((await verify()).sameCache);assert.equal(await page.evaluate(()=>qaBuilds),before,'resharpen rebuilt geometry');
   // Compare the actual rendered glyph origins to the new and legacy boxes.
   // Embedded fonts avoid platform-dependent standard-font substitution.
   let oracle=null;
   if(source==='supplied')oracle=await page.evaluate(async()=>{
    const p=await originalSession.pdf.getPage(1),v=p.getViewport({scale:1}),op=await p.getOperatorList();
    const fonts=new Map(),glyphMap=new Map();let font;
    for(let i=0;i<op.fnArray.length;i++){
     if(op.fnArray[i]===pdfjsLib.OPS.setFont){font=p.commonObjs.get(op.argsArray[i][0]);fonts.set(font.loadedName,font);}
     if(op.fnArray[i]===pdfjsLib.OPS.showText)for(const g of op.argsArray[i][0])if(typeof g==='object')glyphMap.set(font.loadedName+'|'+g.fontChar,g);
    }
    const c=document.createElement('canvas');c.width=v.width;c.height=v.height;
    const ctx=c.getContext('2d'),fill=ctx.fillText.bind(ctx),draws=[];
    ctx.fillText=function(ch,x,y,...args){
     const f=[...fonts.values()].find(f=>this.font.includes(f.loadedName)),g=glyphMap.get(f?.loadedName+'|'+ch);
     if(g){const m=this.getTransform(),start=m.transformPoint(new DOMPoint(x,y));
      const size=Number(this.font.match(/([\d.]+)px/)[1]),end=m.transformPoint(new DOMPoint(x+g.width*size/1000,y));
      for(const letter of g.unicode)draws.push({letter,x:start.x,y:start.y,right:end.x});}
     fill(ch,x,y,...args);
    };
    await p.render({canvasContext:ctx,viewport:v}).promise;
    const text=draws.map(g=>g.letter).join(''),word=qaTarget.word,at=text.indexOf(word),first=draws[at],last=draws[at+word.length-1];
    const target=qaTarget,newLeft=target.x*v.width,newRight=(target.x+target.w)*v.width;
    // Frozen former algorithm: default browser font, proportionally stretched
    // to the PDF.js text item's total width. Kept only as a regression oracle.
    const tc=await p.getTextContent(),item=tc.items.find(i=>i.str.includes(word)),index=item.str.indexOf(word);
    const measure=document.createElement('canvas').getContext('2d');measure.font=`${item.height}px ${tc.styles[item.fontName].fontFamily}`;
    const unit=item.width/measure.measureText(item.str).width;
    const oldLeft=item.transform[4]+measure.measureText(item.str.slice(0,index)).width*unit;
    const oldRight=item.transform[4]+measure.measureText(item.str.slice(0,index+word.length)).width*unit;
    return {word,expected:[first.x,last.right],actual:[newLeft,newRight],legacy:[oldLeft,oldRight],
     newError:Math.max(Math.abs(newLeft-first.x),Math.abs(newRight-last.right)),
     oldError:Math.max(Math.abs(oldLeft-first.x),Math.abs(oldRight-last.right))};
   });
   if(oracle){assert.ok(oracle.newError<1e-5,JSON.stringify(oracle));assert.ok(oracle.oldError>.1,'fixture no longer reproduces old error');}
   // Pixel proof: dark ink stays dark, while white paper gains highlight color.
   await page.evaluate(()=>{
    closePanel();readerScrollTo(0);const p=originalSession.pages[0];p.querySelectorAll('.breeze-original-word').forEach(m=>m.remove());
    window.qaMarker=makePdfWordMarker(p,qaTarget,'original-selection-marker',1,'qa');
   });
   const pixels=[];
   for(const dark of [false,true]){
    await page.evaluate(d=>{document.documentElement.classList.toggle('dark',d);document.body.classList.toggle('dark',d);qaMarker.style.visibility='hidden';},dark);
    const clip=await page.evaluate(()=>{const r=qaMarker.getBoundingClientRect();return {x:Math.floor(r.x)-2,y:Math.floor(r.y)-2,width:Math.ceil(r.width)+4,height:Math.ceil(r.height)+4};});
    const plain=await page.screenshot({clip});
    await page.evaluate(()=>{qaMarker.style.visibility='';});const marked=await page.screenshot({clip});
    const proof=await page.evaluate(async({plain,marked})=>{
     async function decode(s){const data=Uint8Array.from(atob(s),c=>c.charCodeAt(0)),image=await createImageBitmap(new Blob([data],{type:'image/png'}));
      const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);return x.getImageData(0,0,c.width,c.height).data;}
     const a=await decode(plain),b=await decode(marked);let ink=0,lightened=0,colored=0;
     for(let i=0;i<a.length;i+=4){if(Math.max(a[i],a[i+1],a[i+2])<50){ink++;if(Math.max(b[i]-a[i],b[i+1]-a[i+1],b[i+2]-a[i+2])>3)lightened++;}
      if(Math.min(a[i],a[i+1],a[i+2])>245&&Math.min(b[i],b[i+1],b[i+2])<220)colored++;}
     return {ink,lightened,colored};
    },{plain:plain.toString('base64'),marked:marked.toString('base64')});
    assert.ok(proof.ink>5);assert.equal(proof.lightened,0);assert.ok(proof.colored>5);pixels.push({dark,...proof});
    if(output)writeFileSync(resolve(output,`${engine.name()}-${source}-${dark?'dark':'light'}.png`),marked);
   }
   await page.evaluate(()=>{document.documentElement.classList.remove('dark');document.body.classList.remove('dark');});
   // Page release/navigation must regenerate only that page with the same ratios.
   const release=await page.evaluate(async()=>{
    const old=JSON.stringify(qaBoxes);releaseOriginalPdfPage(originalSession,1);
    await renderOriginalPdfPage(originalSession,1);
    return old===JSON.stringify(originalSession.wordBoxes.get(1));
   });assert.ok(release);
   if(source==='fixture'){
    const rotation=await page.evaluate(async()=>{await renderOriginalPdfPage(originalSession,2);const b=originalSession.wordBoxes.get(2).find(b=>b.word==='minimum');return b.h>b.w;});
    assert.ok(rotation,'rotated PDF page geometry');
   }
   assert.deepEqual(errors,[]);
   let pageTextChecks=0;
   if(source==='supplied'){
    const pages=await page.evaluate(async()=>{
     const result=[];
     for(let n=1;n<=originalSession.pdf.numPages;n++){
      const p=await originalSession.pdf.getPage(n),tc=await p.getTextContent();
      const boxes=await buildPdfWordBoxes(p,p.getViewport({scale:1}),originalSession.glyphs,originalSession.pdf);
      const expected=tc.items.flatMap(i=>applyLigatures(i.str||'',originalSession.glyphs).match(/[A-Za-z](?:[A-Za-z'’\-]*[A-Za-z])?/g)||[]);
      result.push({page:n,expected,actual:boxes.map(b=>b.word)});
     }
     return result;
    });
    for(const p of pages)assert.deepEqual(p.actual,p.expected,`source page ${p.page} lost or merged words`);
    pageTextChecks=pages.length;
   }
   const buildTimes=await page.evaluate(()=>qaBuildTimes);
   reports.push({engine:engine.name(),source,words:initial.count,pageTextChecks,maxMarkerErrorPx:maxError,
    resizeObserverDeferrals,geometryBuildMs:{max:Math.max(...buildTimes),total:buildTimes.reduce((a,b)=>a+b,0)},oracle,pixels});
   await page.close();
   }finally{await browser.close();rmSync(profile,{recursive:true,force:true});}
  }
 }
 console.log(JSON.stringify(reports,null,2));
 if(output)writeFileSync(resolve(output,'report.json'),JSON.stringify(reports,null,2)+'\n');
}finally{await new Promise(r=>server.close(r));}
