/* Provider-free rendered proof for successful sentence anchoring.
 * Intended for the authorized GitHub CI browser environment. Do not use this
 * file to work around a denied local browser/socket launch.
 * BREEZE_QA_ENGINE=chromium|webkit; BREEZE_QA_PREVIEW=1 is phone/iPad Text proof.
 * Records actual browser video, screenshots, source/viewport geometry, and
 * animation samples. Synthetic provider replies exercise production lifetimes;
 * this is browser evidence, not physical iPhone/iPad gesture certification.
 */
import assert from 'node:assert/strict';
import {readFileSync, mkdirSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {resolve, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {chromium, webkit} from 'playwright';
import {pdfGeometryFixture} from './helpers/pdf-geometry-fixture.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html',
  '.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
const server=createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);
  const path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
const sentence='A patient reader keeps every word and every meaning together while the sentence continues onto the next line.';
const other='A different sentence stays outside the blue highlight.';
const JSZip=createRequire(import.meta.url)('../assets/lib/jszip-3.10.1.min.js');
const zip=new JSZip();
zip.file('mimetype','application/epub+zip');
zip.file('META-INF/container.xml','<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
zip.file('book.opf','<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">sentence-success-pill-test</dc:identifier><dc:title>Inline sentence fixture</dc:title><dc:language>en</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>');
zip.file('chapter.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Inline sentence fixture</title><style>body{margin:24px;font:20px/1.8 Georgia}p{max-width:600px;margin:0 0 30px}</style></head><body>'+('<p>'+sentence+' '+other+'</p>').repeat(30)+'</body></html>');
const preview=process.env.BREEZE_QA_PREVIEW==='1';
const inputs=[
  ['txt',{name:'sentence-success-pill.txt',mimeType:'text/plain',buffer:Buffer.from((sentence+' '+other+'\n\n').repeat(50))}],
  ['pdf',{name:'sentence-success-pill.pdf',mimeType:'application/pdf',buffer:pdfGeometryFixture([
    'A patient reader keeps every word and every meaning',
    'together while the sentence continues onto the next line.',
    'A patient reader keeps every word and every meaning',
    'together while the sentence continues onto the next line.',...Array(12).fill([
      'A patient reader keeps every word and every meaning',
      'together while the sentence continues onto the next line.']).flat(),other])}],
  ['epub',{name:'sentence-success-pill.epub',mimeType:'application/epub+zip',buffer:await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'})}],
].filter(([kind])=>!preview||kind==='txt');
const profiles=[
  {name:'phone',width:390,height:844},
  {name:'ipad-portrait',width:820,height:1180},
  {name:'ipad-landscape',width:1180,height:820},
  {name:'desktop',width:1440,height:900},
  {name:'narrow',width:320,height:568},
  {name:'phone-landscape',width:844,height:390},
].filter(profile=>!preview||['phone','ipad-portrait','ipad-landscape'].includes(profile.name));
const engineName=process.env.BREEZE_QA_ENGINE||process.env.BROWSER||'chromium';
assert.ok(['chromium','webkit'].includes(engineName),'BROWSER/BREEZE_QA_ENGINE must be chromium or webkit');
const engine=engineName==='webkit'?webkit:chromium;
const output=resolve(process.env.BREEZE_QA_OUTPUT||resolve(tmpdir(),'breeze-sentence-success-pill-proof'));
mkdirSync(output,{recursive:true});
const reports=[],screenshots=[],imports=[],videoTimeline=[];
let videoStartedAt=0;
let browser,context,profile,pageForFailure,importing=null;
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
try{
  const contextOptions={viewport:{width:390,height:844},hasTouch:true,
    deviceScaleFactor:1,serviceWorkers:'block',
    recordVideo:{dir:resolve(output,'video'),size:{width:1440,height:1180}}};
  if(engine===webkit){
    // Match the repository's sentence-cue/import-commit fixtures: persistent
    // WebKit storage preserves imported original-file bytes through IDB reads.
    profile=mkdtempSync(resolve(tmpdir(),'breeze-sentence-success-pill-'));
    context=await engine.launchPersistentContext(profile,{...contextOptions,headless:true});
  }else{
    browser=await engine.launch({headless:true,executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});
    context=await browser.newContext(contextOptions);
  }
  videoStartedAt=Date.now();
  const page=await context.newPage(),errors=[],providerAttempts=[];
  pageForFailure=page;page.setDefaultTimeout(20000);
  page.on('pageerror',error=>{if(!error.message.startsWith('ResizeObserver loop'))errors.push(error.message);});
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
  await page.route('**/*',route=>{
    const request=route.request(),href=request.url();
    if(/\/functions\/v1\/dict(?:\?|$)/.test(href)){
      let body;try{body=request.postDataJSON();}catch{}
      if(body?.op==='explain'||body?.op==='sentence_easy_explanation')providerAttempts.push(body.op);
      return route.abort();
    }
    return href.startsWith(url)||href.startsWith('blob:')?route.continue():route.abort();
  });
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>homeReady);
  for(const [kind,input] of inputs){
    importing={kind,name:input.name,startedAt:Date.now()};
    console.log('Importing',engineName,kind,input.name);
    try{
      await page.locator('#fileinput').setInputFiles(input);
      await page.waitForFunction(kind=>books.some(book=>book.kind===kind),kind,{timeout:120000});
    }catch(error){
      const state=await page.evaluate(()=>({kinds:books.map(book=>book.kind),
        notice:document.getElementById('reader-notice')?.textContent,
        toast:document.getElementById('toast')?.textContent})).catch(()=>null);
      importing={...importing,state};
      throw new Error(`${engineName}: ${kind} import (${input.name}) failed; state=${JSON.stringify(state)}`,{cause:error});
    }
    imports.push({kind,name:input.name,elapsedMs:Date.now()-importing.startedAt});
    console.log('Imported',engineName,kind,imports.at(-1).elapsedMs+'ms');
    importing=null;
  }
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>{
    window.qaPill={pending:[],calls:[],writes:[],range:null,currentLayer:null,kind:null};
    qaPill.rangeReads={getClientRects:0,getBoundingClientRect:0};qaPill.rangeOriginals=new Map();
    qaPill.observeRangeReads=()=>{
      const views=[window,...(originalSession?.kind==='epub'
        ?originalSession.frames.filter(Boolean).map(frame=>frame.contentWindow):[])];
      for(const view of views){
        const proto=view.Range.prototype;if(qaPill.rangeOriginals.has(proto))continue;
        const methods={getClientRects:proto.getClientRects,getBoundingClientRect:proto.getBoundingClientRect};
        qaPill.rangeOriginals.set(proto,methods);
        for(const method of Object.keys(methods))proto[method]=function(...args){
          qaPill.rangeReads[method]++;return methods[method].apply(this,args);
        };
      }
    };
    // Assertion-only source geometry uses the native method, so it never
    // contributes to the app's scroll/reveal Range-read counters.
    qaPill.sourceRects=range=>qaPill.rangeOriginals.get(Object.getPrototypeOf(range)).getClientRects.call(range);

    qaPill.restorationJobs=new Set();qaPill.restorationEvents=[];qaPill.scrollWrites=[];
    const recordRestoration=event=>{
      qaPill.restorationEvents.push({...event,at:performance.now(),scroll:readerScrollTop()});
      if(qaPill.restorationEvents.length>100)qaPill.restorationEvents.shift();
    };
    // Mode readiness excludes the existing 360/900ms PDF landing callbacks.
    // Observe those real callbacks through completion, without changing delays,
    // canceling them, or replacing their restoration implementation.
    const stabilize=stabilizePdfModeTarget;
    stabilizePdfModeTarget=(...args)=>{
      const schedule=window.setTimeout;
      window.setTimeout=(callback,delay,...timerArgs)=>{
        const job={owner:'pdf-mode-landing',delay};qaPill.restorationJobs.add(job);
        recordRestoration({...job,state:'scheduled'});
        return schedule(async()=>{
          try{return await callback(...timerArgs);}
          finally{qaPill.restorationJobs.delete(job);recordRestoration({...job,state:'finished'});}
        },delay);
      };
      try{return stabilize(...args);}
      finally{window.setTimeout=schedule;}
    };
    const restorePdf=restorePdfAnchor;
    const trackedPdfRestore=async(...args)=>{
      const job={owner:'pdf-anchor',source:args[0],inset:args[1]};
      qaPill.restorationJobs.add(job);recordRestoration({...job,state:'started'});
      try{return await restorePdf(...args);}
      finally{qaPill.restorationJobs.delete(job);recordRestoration({...job,state:'finished'});}
    };
    restorePdfAnchor=trackedPdfRestore;
    if(ORIGINAL_FORMATS.pdf.restoreAnchor===restorePdf)ORIGINAL_FORMATS.pdf.restoreAnchor=trackedPdfRestore;
    const scrollTo=readerScrollTo;
    readerScrollTo=y=>{
      qaPill.scrollWrites.push({at:performance.now(),from:readerScrollTop(),to:y,
        lookupOpen:sentenceLookupOpen(),stack:new Error().stack});
      if(qaPill.scrollWrites.length>100)qaPill.scrollWrites.shift();
      return scrollTo(y);
    };
    qaPill.readerReady=()=>{
      if(readerPositionPending()||readerAnchorHeld()||qaPill.restorationJobs.size)return false;
      if(currentReaderMode!=='original')return true;
      const box=readerScroller();
      return !originalRotationAnchor&&Math.abs(originalZoomObservedWidth-box.clientWidth)<1
        &&Math.abs(originalZoomObservedHeight-box.clientHeight)<1;
    };

    setSentenceEasyCapability(true);
    dictGet=async()=>null;
    dictPut=async(key,value)=>{qaPill.writes.push({key,value});};
    // openSentence's real request owner is exercised; no transport/provider runs.
    sb ||= {};
    dictCall=(body,signal)=>{
      if(body.op==='warm')return Promise.resolve({sentenceEasyExplanation:true});
      if(!['explain','sentence_easy_explanation'].includes(body.op))throw new Error('Unexpected fixture request: '+body.op);
      return new Promise(resolve=>{
        qaPill.calls.push(body);qaPill.pending.push({resolve,signal,body});
      });
    };
    qaPill.chrome=()=>['readpill','readback','aafab','reader-navigation','pdf-page-control','modefab'].map(id=>{
      const node=document.getElementById(id),style=getComputedStyle(node);
      return {id,inert:node.inert,hidden:node.hidden,display:style.display,visibility:style.visibility};
    });
    qaPill.geometry=()=>{
      const rect=node=>{
        const box=node.getBoundingClientRect();
        return [box.x,box.y,box.width,box.height].map(value=>Math.round(value*1000)/1000);
      };
      const frame=originalSession?.kind==='epub'
        ?originalSession.frames.find(frame=>frame?.contentDocument?.querySelector('p')):null;
      const source=qaPill.kind==='txt'?[...document.querySelectorAll('#rtext .w')].slice(0,60)
        :qaPill.kind==='pdf'?[originalSession.pages[0],originalSession.pages[0].querySelector('canvas')].filter(Boolean)
        :[frame,...frame.contentDocument.querySelectorAll('p')].slice(0,7);
      const scroller=readerScroller();
      return {reader:rect(document.getElementById('readmain')),scroll:[scroller.scrollTop,scroller.scrollLeft],
        zoom:originalZoom(),source:source.map(rect),text:source.map(node=>node.textContent)};
    };
    qaPill.find=kind=>{
      const surface=READER_SURFACES.find(surface=>surface.name===(kind==='txt'?'text':kind));
      if(kind==='pdf'){
        const page=originalSession.pages[0],rect=page.getBoundingClientRect();
        const words=originalSession.wordBoxes.get(1).filter(word=>word.word==='patient');
        const word=qaPill.pickBottom?words.filter(word=>{
          const y=rect.top+(word.y+word.h/2)*rect.height;return y>=80&&y<innerHeight-100;
        }).at(-1):words[0];
        if(!word)throw new Error('No visible PDF source for placement scenario');
        const x=rect.left+(word.x+word.w/2)*rect.width,y=rect.top+(word.y+word.h/2)*rect.height;
        return {found:surface.sentenceAt(x,y),point:{x,y}};
      }
      // Only choose content already visible; never scroll a lookup into view.
      const bottom=Math.min(innerHeight-110,600);
      const rows=Array.from({length:Math.ceil((bottom-55)/8)},(_,i)=>55+i*8);
      if(qaPill.pickBottom)rows.reverse();
      for(const y of rows)for(let x=24;x<innerWidth-24;x+=13){
        const found=surface.sentenceAt(x,y);
        if(found?.sentence.startsWith('A patient reader'))return {found,point:{x,y}};
      }
      throw new Error('No visible selected sentence in '+kind);
    };
    qaPill.start=kind=>{
      qaPill.observeRangeReads();
      const {found,point}=qaPill.find(kind);
      if(!found?.paint)throw new Error('Missing actual source occurrence');
      qaPill.found=found;qaPill.point=point;qaPill.range=null;
      if(!qaPill.readerReady())throw new Error('Lookup started before Reader restoration completed');
      qaPill.baselineAt=performance.now();
      qaPill.before=qaPill.geometry();qaPill.beforeChrome=qaPill.chrome();
      const views=[window,...(originalSession?.kind==='epub'
        ?originalSession.frames.filter(Boolean).map(frame=>frame.contentWindow):[])];
      const originals=views.map(view=>[view.Range.prototype,view.Range.prototype.getClientRects]);
      try{
        for(const [proto,original] of originals)proto.getClientRects=function(){
          qaPill.range=this.cloneRange();return original.call(this);
        };
        clearReaderModeCue();found.paint();
      }finally{for(const [proto,original] of originals)proto.getClientRects=original;}
      qaPill.currentLayer=readerSentenceCue.layer;
      qaPill.opening=openSentence(found.sentence,found);
    };
    qaPill.motion=layer=>[...layer.children].map(node=>{
      const style=layer.ownerDocument.defaultView.getComputedStyle(node);
      return {animation:style.animationName,opacity:style.opacity,transform:style.transform};
    });
    qaPill.cue=()=>{
      const layer=readerSentenceCue?.layer;
      if(!layer)return null;
      const doc=layer.ownerDocument,view=doc.defaultView;
      const styles=[...layer.children].map(node=>{
        const style=view.getComputedStyle(node),box=node.getBoundingClientRect();
        return {animation:style.animationName,duration:style.animationDuration,
          timing:style.animationTimingFunction,image:style.backgroundImage,transform:style.transform,radius:style.borderRadius,
          pointerEvents:style.pointerEvents,box:[box.left,box.top,box.right,box.bottom],
          inline:[node.style.left,node.style.top,node.style.width,node.style.height]};
      });
      const probe=doc.createElement('span');probe.className='breeze-lookup-pending';
      probe.style.cssText='position:absolute;left:-9999px;top:0;width:1px;height:1px';
      for(const name of ['--breeze-lookup-wash','--breeze-lookup-sheen'])probe.style.setProperty(name,layer.style.getPropertyValue(name));
      doc.body.appendChild(probe);
      const wordStyle=view.getComputedStyle(probe);
      const shared={animation:wordStyle.animationName,duration:wordStyle.animationDuration,
        timing:wordStyle.animationTimingFunction,image:wordStyle.backgroundImage};probe.remove();
      let expected=[];
      if(qaPill.kind==='pdf'){
        const page=originalSession.pages[0],box=page.getBoundingClientRect();
        const words=originalSession.wordBoxes.get(1).filter(word=>word.sentenceStart===qaPill.found.start);
        expected=words.map(word=>[box.left+word.x*box.width,box.top+word.y*box.height,
          box.left+(word.x+word.w)*box.width,box.top+(word.y+word.h)*box.height]);
      }else expected=[...qaPill.sourceRects(qaPill.range)].filter(box=>box.width>0&&box.height>0)
        .map(box=>[box.left,box.top,box.right,box.bottom]);
      const frame=doc===document?null:originalSession.frames.find(frame=>frame?.contentDocument===doc);
      const frameBox=frame?.getBoundingClientRect();
      const visible=styles.some(({box})=>{
        const x=box[0]+(frameBox?.left||0),y=box[1]+(frameBox?.top||0);
        return x<innerWidth&&y<innerHeight&&box[2]+(frameBox?.left||0)>0&&box[3]+(frameBox?.top||0)>0;
      });
      return {pending:layer.classList.contains('is-pending'),connected:layer.isConnected,
        sameLayer:layer===qaPill.currentLayer,styles,shared,expected,visible,
        blend:view.getComputedStyle(layer).mixBlendMode,ariaHidden:layer.getAttribute('aria-hidden')};
    };
  });
  const frames=()=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  const settle=async()=>{
    await frames();
    await page.evaluate(()=>Promise.all(document.getAnimations().filter(animation=>
      animation.playState==='running'&&Number.isFinite(animation.effect?.getComputedTiming().endTime))
      .map(animation=>animation.finished.catch(()=>{}))));
    await frames();
  };
  const readerReady=async()=>{
    await frames();await page.waitForFunction(()=>qaPill.readerReady());
    await settle();await page.waitForFunction(()=>qaPill.readerReady());
  };
  const screenshot=async name=>{
    const filename=`${engineName}-${name}.png`;
    await page.screenshot({path:resolve(output,filename),fullPage:false,animations:'allow'});
    screenshots.push(filename);return filename;
  };
  const unchanged=async label=>{
    assert.deepEqual(await page.evaluate(()=>qaPill.geometry()),await page.evaluate(()=>qaPill.before),
      label+': sentence UI changed Reader geometry, source layout, scroll, or zoom');
    assert.deepEqual(await page.evaluate(()=>qaPill.scrollWrites.filter(write=>write.at>=qaPill.baselineAt)),[],
      label+': sentence presentation wrote Reader scroll');
  };
  const closed=async label=>{
    await page.waitForFunction(()=>!sentenceLookupOpen()&&!readerSentenceCue);
    assert.equal(await page.locator('#sentence-modal').isVisible(),false,label+': result remained/reopened');
    assert.equal(await page.locator('#sentence-peek').isVisible(),false,label+': error remained/reopened');
    assert.equal(await page.evaluate(()=>document.body.classList.contains('sentence-result-anchored')),false,
      label+': anchored-result state leaked');
  };
  const start=async kind=>{
    const count=await page.evaluate(()=>qaPill.calls.length);
    await page.evaluate(kind=>qaPill.start(kind),kind);
    await page.waitForFunction(count=>qaPill.calls.length===count+1&&sentenceWaitingActive(),count);
    await settle();
    assert.equal(await page.evaluate(()=>qaPill.found.sentence),sentence,kind+': source selection is not the complete sentence');
    assert.equal(await page.evaluate(()=>qaPill.calls.at(-1).sentence),sentence,kind+': request truncated the selected sentence');
    assert.equal(await page.locator('#sentence-modal').isVisible(),false,'waiting exposed a result shell');
    assert.equal(await page.locator('#sentence-peek').isVisible(),false,'waiting exposed an error mini-pill');
    return count;
  };
  await page.evaluate(()=>{
    qaPill.measure=()=>{
      const node=document.getElementById('p-sentence'),style=getComputedStyle(node);
      const rect=n=>{const r=n.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,
        bottom:r.bottom,width:r.width,height:r.height};};
      const layer=readerSentenceCue?.layer,doc=layer?.ownerDocument;
      const frame=doc&&doc!==document?originalSession.frames.find(frame=>frame?.contentDocument===doc):null;
      const outer=frame?.getBoundingClientRect(),sx=frame?outer.width/frame.clientWidth:1,sy=frame?outer.height/frame.clientHeight:1;
      const toScreen=r=>({left:(outer?.left||0)+r.left*sx,top:(outer?.top||0)+r.top*sy,
        right:(outer?.left||0)+r.right*sx,bottom:(outer?.top||0)+r.bottom*sy});
      const lines=layer?[...layer.children].map(child=>toScreen(child.getBoundingClientRect())):[];
      const source=lines.length?{left:Math.min(...lines.map(r=>r.left)),top:Math.min(...lines.map(r=>r.top)),
        right:Math.max(...lines.map(r=>r.right)),bottom:Math.max(...lines.map(r=>r.bottom))}:null;
      const view=window.visualViewport,left=view?.offsetLeft||0,top=view?.offsetTop||0;
      const width=view?.width||innerWidth,height=view?.height||innerHeight;
      const safeTop=top+16+(parseFloat(style.getPropertyValue('--word-safe-top'))||0);
      const chrome=document.getElementById('readchrome').getBoundingClientRect();
      const safeBottom=Math.min(top+height-16,chrome.height&&chrome.top>safeTop?chrome.top-8:top+height-16);
      const scrolling=[node,...node.querySelectorAll('*')].filter(child=>{
        const css=getComputedStyle(child);return /auto|scroll/.test(css.overflowY)&&child.scrollHeight>child.clientHeight+1;
      }).map(child=>({id:child.id,clientHeight:child.clientHeight,scrollHeight:child.scrollHeight,scrollTop:child.scrollTop}));
      const animations=node.getAnimations({subtree:true}).filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>({
        target:a.effect?.target?.id||a.effect?.target?.className,
        duration:a.effect?.getTiming().duration,keyframes:a.effect?.getKeyframes()}));
      return {shell:rect(node),source,lines,safe:{left:left+16,right:left+width-16,top:safeTop,bottom:safeBottom},
        viewport:{left,top,width,height},chrome:rect(document.getElementById('readchrome')),
        direction:node.dataset.expandDirection,classes:document.body.className,view:sentenceView,
        desiredHeight:Math.min(520,safeBottom-safeTop,Math.ceil(document.getElementById('ps-content').getBoundingClientRect().height+
          ['paddingTop','paddingBottom','borderTopWidth','borderBottomWidth'].reduce((sum,key)=>sum+(parseFloat(style[key])||0),0))),
        offsetWidth:node.offsetWidth,offsetHeight:node.offsetHeight,scrolling,
        display:style.display,position:style.position,opacity:Number(style.opacity),transform:style.transform,
        background:style.backgroundColor,borderRadius:style.borderRadius,blur:style.backdropFilter||style.webkitBackdropFilter,
        animations,miniVisible:!document.getElementById('sentence-peek').hidden,
        sourceHidden:document.getElementById('ps-source').hidden,ariaModal:node.getAttribute('aria-modal')};
    };
    qaPill.material=()=>{
      const word=document.getElementById('panel'),wasAnchored=word.classList.contains('anchored');
      word.classList.add('anchored');
      const properties=['background-color','border-top-width','border-top-style','border-top-color','border-radius',
        'box-shadow','backdrop-filter','-webkit-backdrop-filter','scrollbar-width'];
      const read=node=>Object.fromEntries(properties.map(key=>[key,getComputedStyle(node).getPropertyValue(key)]));
      const result={sentence:read(document.getElementById('p-sentence')),word:read(word)};
      if(!wasAnchored)word.classList.remove('anchored');return result;
    };
    qaPill.captureArrival=answer=>{
      qaPill.animationFrames=[];qaPill.animationStarted=performance.now();
      const sample=()=>{
        const state=qaPill.measure();
        if(!document.getElementById('sentence-modal').hidden)qaPill.animationFrames.push({at:performance.now()-qaPill.animationStarted,...state});
      };
      qaPill.motionDone=new Promise(done=>{
        const record=()=>{sample();if(performance.now()-qaPill.animationStarted<450)requestAnimationFrame(record);else done();};
        requestAnimationFrame(record);
      });
      qaPill.pending.at(-1).resolve(answer);
      queueMicrotask(sample);
    };
  });
  const result=async(answer,label,{capture=true}={})=>{
    const videoStartMs=Date.now()-videoStartedAt;
    videoTimeline.push({label,event:'result-start',offsetMs:videoStartMs});
    await page.evaluate(answer=>{qaPill.answerText=answer.ko;qaPill.animationFrames=[];},answer);
    if(capture)await page.evaluate(answer=>qaPill.captureArrival(answer),answer);
    else await page.evaluate(answer=>qaPill.pending.at(-1).resolve(answer),answer);
    await page.waitForFunction(()=>!document.getElementById('sentence-modal').hidden);
    if(capture){
      // A video covers the full entrance. These two actual screenshots also
      // make the early and final browser frames immediately reviewable.
      await screenshot(label+'-arrival');
      await page.evaluate(()=>qaPill.motionDone);
    }
    await settle();
    videoTimeline.push({label,event:'result-settled',offsetMs:Date.now()-videoStartedAt,startMs:videoStartMs});
    if(preview&&capture){
      // Keep real recording at the settled result long enough to review; this
      // is video presentation time, not an assertion's readiness condition.
      await page.waitForTimeout(1400);
      videoTimeline.push({label,event:'result-hold-end',offsetMs:Date.now()-videoStartedAt,startMs:videoStartMs});
    }
    return page.evaluate(()=>qaPill.measure());
  };
  const validateResult=async(label,{reduced=false,long=false}={})=>{
    const state=await page.evaluate(()=>qaPill.measure()),{shell,source,safe}=state;
    assert.equal(state.view,'anchored',label+': source success did not use anchored state');
    assert.match(state.classes,/sentence-result-anchored/,label+': anchored body marker missing');
    assert.equal(state.position,'fixed',label+': result lives in document layout');
    assert.equal(state.ariaModal,'false',label+': anchored result owns modal input');
    assert.equal(state.sourceHidden,true,label+': English source was duplicated');
    assert.equal(await page.locator('#ps-en').textContent(),'');
    assert.equal(await page.locator('#ps-ko').textContent(),await page.evaluate(()=>qaPill.answerText),
      label+': supplied translation text was trimmed or truncated');
    assert.equal(await page.locator('#ps-ko').evaluate(node=>getComputedStyle(node).webkitLineClamp),'none',
      label+': translation is line-clamped');
    const material=await page.evaluate(()=>qaPill.material());
    assert.deepEqual(material.sentence,material.word,label+': expanded-word material parity changed');
    assert.equal(await page.locator('#sentence-scrim').isVisible(),false,label+': source is dimmed');
    assert.equal(await page.locator('#ps-grabber').isVisible(),false,label+': anchored pill retained bottom-sheet grabber');
    assert.ok(state.lines.length>=2,label+': fixture did not select a multiline sentence');
    assert.ok(shell.left>=safe.left-1&&shell.right<=safe.right+1&&shell.top>=safe.top-1&&shell.bottom<=safe.bottom+1,
      label+': result escaped visual viewport or bottom controls: '+JSON.stringify(state));
    assert.ok(shell.width<=600.5,label+': result exceeded tablet/desktop width cap');
    if(state.viewport.width>=820)assert.ok(shell.width>450,label+': iPad retained phone-sized result');
    assert.equal(await page.locator('#p-sentence').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true,
      label+': horizontal content overflow');
    assert.ok(['above','below'].includes(state.direction),label+': missing expansion direction');
    const below=safe.bottom-source.bottom-8,above=source.top-safe.top-8;
    if(below>=state.desiredHeight+1)assert.ok(shell.top>=source.bottom+7&&state.direction==='below',
      label+': result did not prefer available space below the whole sentence');
    else if(above>=state.desiredHeight+1)assert.ok(shell.bottom<=source.top-7&&state.direction==='above',
      label+': result covered sentence despite enough space above it');
    else if(shell.top<source.bottom&&shell.bottom>source.top){
      assert.ok(below<Math.min(state.desiredHeight,160)&&above<Math.min(state.desiredHeight,160),
        label+': source overlap despite enough useful space for internal scrolling');
    }
    const cue=await page.evaluate(()=>qaPill.cue());
    assert.ok(cue.connected&&cue.sameLayer&&!cue.pending,label+': success replaced or removed source selection');
    for(const line of cue.styles)assert.equal(line.animation,'none',label+': terminal cue still animates');
    for(const sourceRect of cue.expected)assert.ok(cue.styles.some(({box})=>
      box[0]<=sourceRect[0]+.2&&box[1]<=sourceRect[1]+.2&&box[2]>=sourceRect[2]-.2&&box[3]>=sourceRect[3]-.2),
      label+': selected cue omits part of the actual source sentence');
    const samples=await page.evaluate(()=>qaPill.animationFrames||[]);
    if(samples.length){
      assert.ok(samples.every(frame=>frame.miniVisible===false),label+': fake mini-pill expansion appeared');
      assert.ok(samples.every(frame=>frame.offsetWidth===state.offsetWidth&&frame.offsetHeight===state.offsetHeight),
        label+': entrance animates layout dimensions');
      const shellAnimations=samples.flatMap(frame=>frame.animations).filter(animation=>animation.target==='p-sentence');
      for(const animation of shellAnimations)for(const keyframe of animation.keyframes){
        assert.ok(Object.keys(keyframe).every(key=>['offset','computedOffset','easing','composite','opacity','transform'].includes(key)),
          label+': shell entrance animates a layout/style property: '+JSON.stringify(keyframe));
      }
      if(reduced){
        assert.ok(samples.every(frame=>frame.opacity===1&&frame.transform==='none'),label+': reduced motion still animates shell');
      }else{
        assert.ok(samples.some(frame=>frame.opacity<.99),label+': result has no gradual entrance');
        for(const frame of samples){
          const match=/^matrix\(([^)]+)\)$/.exec(frame.transform);
          if(match){const matrix=match[1].split(',').map(Number);assert.ok(Math.abs(matrix[0]-1)<.0001&&Math.abs(matrix[3]-1)<.0001&&Math.abs(matrix[1])<.0001&&Math.abs(matrix[2])<.0001,
            label+': entrance scales or skews the translation text');}
        }
      }
    }
    if(long)assert.ok(state.scrolling.length>0,label+': long translation is not internally scrollable');
    await unchanged(label);return state;
  };
  const openFormat=async kind=>{
    await page.evaluate(async kind=>{
      closeSentence();qaPill.kind=kind;setSentenceEasyCapability(true);
      await openBook(books.find(book=>book.kind===kind));
      if(kind!=='txt')await switchReaderMode('original');
    },kind);
    await page.waitForFunction(kind=>kind==='txt'?document.querySelectorAll('#rtext .w').length>20
      :kind==='pdf'?originalSession?.wordBoxes.get(1)?.length>0
      :originalSession?.frames.some(frame=>frame?.contentDocument?.querySelector('p')),kind);
    if(kind==='epub')await page.evaluate(()=>Promise.all(originalSession.frameGeometryReady));
    await readerReady();
  };
  const prepare=async(kind,profile,dark=false,reduced=false)=>{
    await page.evaluate(()=>closeSentence());
    await page.setViewportSize({width:profile.width,height:profile.height});
    await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference',colorScheme:dark?'dark':'light'});
    await page.waitForFunction(()=>sentenceLastCompact===sentenceCompactViewport());
    await readerReady();
    await page.evaluate(({dark,kind})=>{
      darkMode=dark;applyDark();readerScrollTo(0);setReaderChrome(false);
      if(kind==='epub'){
        const frame=originalSession.frames.find(frame=>frame?.contentDocument?.querySelector('p'));
        const para=frame.contentDocument.querySelector('p');
        readerScrollTo(readerScrollTop()+frame.getBoundingClientRect().top+para.getBoundingClientRect().top-80);
      }
    },{dark,kind});
    await readerReady();
  };
  const korean='참을성 있는 독자는 다음 줄까지 이어지는 문장의 모든 단어와 의미를 함께 읽습니다.';
  const longKorean=Array(65).fill(korean+' 긴 번역은 문서의 위치를 옮기지 않고 이 안에서 읽을 수 있어야 합니다.').join(' ');
  for(const [kind] of inputs){
    await openFormat(kind);
    for(const profile of profiles)for(const dark of [false,true])for(const reduced of (preview?[false]:[false,true])){
      const label=`${kind}-${profile.name}-${profile.width}x${profile.height}-${dark?'dark':'light'}-${reduced?'reduced':'motion'}`;
      console.log('Checking successful sentence',engineName,label);
      await prepare(kind,profile,dark,reduced);await start(kind);
      await result({ko:korean},label);
      const geometry=await validateResult(label,{reduced});
      await screenshot(label+'-settled');
      reports.push({kind,...profile,dark,reduced,answer:'short',geometry,
        animationFrames:await page.evaluate(()=>qaPill.animationFrames)});
      await page.keyboard.press('Escape');await closed(label+' escape');await unchanged(label+' close');
      // Every size/theme/motion combination also has a genuinely overflowing translation.
      {
        await start(kind);await result({ko:longKorean},label+'-long');
        const longGeometry=await validateResult(label+'-long',{long:true,reduced});
        await screenshot(label+'-long');
        const scrollable=longGeometry.scrolling[0];
        assert.ok(scrollable.id,label+': scroll owner needs a stable identifiable node');
        await page.locator('#'+scrollable.id).evaluate(node=>{node.scrollTop=100;node.dispatchEvent(new Event('scroll',{bubbles:true}));});
        await frames();
        assert.equal(await page.evaluate(()=>sentenceLookupOpen()),true,label+': internal scroll dismissed result');
        assert.ok(await page.locator('#'+scrollable.id).evaluate(node=>node.scrollTop)>0,label+': result cannot scroll internally');
        await unchanged(label+' internal scroll');
        reports.push({kind,...profile,dark,reduced,answer:'long',geometry:longGeometry});
        await page.evaluate(()=>{readerScroller().scrollTop+=2;scrollGesture();});
        await closed(label+' reader scroll');
      }
    }
    await prepare(kind,{width:390,height:844});
    // A fast answer must wait for the initiating long-press finger to release.
    await start(kind);
    await page.evaluate(()=>{
      sentenceHoldPointerId=917;
      qaPill.pending.at(-1).resolve({ko:'손을 뗀 뒤에만 나타나는 해석'});
    });
    await frames();
    assert.equal(await page.locator('#sentence-modal').isVisible(),false,kind+': answer appeared under held finger');
    await page.evaluate(()=>releaseSentenceHoldPointer({pointerId:917}));
    await page.waitForFunction(()=>sentenceView==='anchored');await settle();
    await unchanged(kind+' held answer');await page.evaluate(()=>closeSentence());
    // Cancel and replace during the actual 220ms entrance, before its finished
    // callback. The old animation must have no authority over the new result.
    await start(kind);
    await page.evaluate(async()=>{
      qaPill.pending.at(-1).resolve({ko:'등장 중 취소할 해석'});
      await Promise.resolve();qaPill.outgoingAnimation=sentenceResultAnimation;
      closeSentence();
    });
    assert.equal(await page.evaluate(()=>!!qaPill.outgoingAnimation),true,kind+': interruption did not catch a live entrance');
    await start(kind);await result({ko:korean},kind+'-animation-replacement',{capture:false});
    await page.waitForTimeout(240);
    assert.equal(await page.locator('#ps-ko').textContent(),korean,kind+': old animation changed new result');
    assert.equal(await page.evaluate(()=>sentenceResultAnchored()),true,kind+': canceled animation closed replacement');
    await page.evaluate(()=>closeSentence());
    // Actual lower-page source occurrences exercise the above-first fallback,
    // independently of the exhaustive pure geometry contract.
    if(!preview){
      await prepare(kind,{width:844,height:390});
      await page.evaluate(()=>{qaPill.pickBottom=true;});
      await start(kind);await result({ko:korean},kind+'-above');
      const above=await validateResult(kind+'-above');
      assert.equal(above.direction,'above',kind+': lower source did not exercise above placement');
      assert.ok(above.shell.bottom<=above.source.top-7,kind+': above pill overlaps whole sentence');
      await screenshot(kind+'-above-settled');
      reports.push({kind,scenario:'actual-lower-source',geometry:above});
      await page.locator('#ps-easy-button').click();
      const explanation=Array(12).fill('이 문장은 앞부분의 배경과 뒷부분의 중심 행동을 함께 읽으면 이해할 수 있습니다.').join(' ');
      assert.ok(explanation.length>=10&&explanation.length<=600,'successful above-help fixture must satisfy production length limits');
      await page.evaluate(explanation=>qaPill.pending.at(-1).resolve({explanation}),explanation);
      await page.waitForFunction(()=>!sentenceEasyState.loading);await settle();
      assert.equal(await page.locator('#ps-easy-text').textContent(),explanation,kind+': help was truncated');
      await page.evaluate(()=>{qaPill.animationFrames=[];});
      const expandedAbove=await validateResult(kind+'-above-long-help',{long:true});
      assert.equal(expandedAbove.direction,'above',kind+': help growth jumped across selected source');
      assert.ok(expandedAbove.shell.bottom<=expandedAbove.source.top-7,kind+': long help covered source despite useful room above');
      await screenshot(kind+'-above-long-help');
      reports.push({kind,scenario:'long-help-above',geometry:expandedAbove});
      await page.evaluate(()=>{closeSentence();qaPill.pickBottom=false;});
      await prepare(kind,{width:390,height:844});
    }
    // Resize an OPEN result, including widths that share the same 360/600px
    // cap. This exercises cue resize and presentation placement ownership.
    await start(kind);await result({ko:korean},kind+'-before-rotation',{capture:false});
    const rotationCalls=await page.evaluate(()=>qaPill.calls.length);
    for(const size of [{width:430,height:844},{width:520,height:844},{width:820,height:1180},
      {width:1180,height:820},{width:1280,height:850}]){
      await page.setViewportSize(size);await readerReady();
      assert.equal(await page.evaluate(()=>sentenceResultAnchored()),true,kind+': active rotation ended result');
      assert.equal(await page.evaluate(()=>qaPill.calls.length),rotationCalls,kind+': rotation started another translation');
      await page.evaluate(()=>{
        qaPill.before=qaPill.geometry();qaPill.baselineAt=performance.now();qaPill.animationFrames=[];
      });
      const rotated=await validateResult(kind+'-active-resize-'+size.width);
      await screenshot(kind+'-active-resize-'+size.width+'x'+size.height);
      reports.push({kind,scenario:'active-resize',...size,geometry:rotated});
    }
    await prepare(kind,{width:390,height:844});
    // Result lifetime endings: neither a late response nor release/animation
    // completion may resurrect a closed presentation or erase its replacement.
    for(const action of ['escape','outside','scroll','navigation','mode','account','replacement']){
      await start(kind);
      await page.evaluate(()=>{qaPill.oldPending=qaPill.pending.at(-1);qaPill.oldBook=curBook;qaPill.oldLayer=readerSentenceCue.layer;});
      await result({ko:korean},kind+'-'+action,{capture:false});
      if(action==='escape')await page.keyboard.press('Escape');
      if(action==='outside'){
        await page.mouse.click(8,40);
        assert.equal(await page.evaluate(()=>wordLookupOpen()),false,kind+': outside dismissal passed through to word lookup');
      }
      if(action==='scroll')await page.evaluate(()=>{readerScroller().scrollTop+=2;scrollGesture();});
      if(action==='navigation')await page.evaluate(()=>show('home'));
      if(action==='mode')await page.evaluate(async()=>{if(currentReaderMode==='original')await switchReaderMode('text');else show('home');});
      if(action==='account')await page.evaluate(()=>resetSyncSession());
      if(action==='replacement'){
        await page.evaluate(()=>closeSentence());await start(kind);
        const replacementLayer=await page.evaluate(()=>readerSentenceCue.layer!==qaPill.oldLayer);
        assert.equal(replacementLayer,true,kind+': replacement adopted old cue');
        await page.waitForFunction(()=>!qaPill.oldLayer.isConnected);
        assert.equal(await page.evaluate(()=>sentenceWaitingActive()&&readerSentenceCue.layer.isConnected),true,
          kind+': outgoing cleanup erased the replacement');
        await result({ko:'새 문장의 해석입니다.'},kind+'-replacement',{capture:false});
        await page.evaluate(()=>closeSentence());
      }
      await page.evaluate(()=>{qaPill.oldPending.resolve({ko:'늦은 응답은 다시 표시되면 안 됩니다.'});sentenceGestureReleased();});
      await closed(kind+' '+action);await settle();await closed(kind+' '+action+' after callbacks');
      if(['navigation','mode','account'].includes(action))await openFormat(kind);
      await prepare(kind,{width:390,height:844});
    }
    // Cancel while a real synthetic provider request is still pending, then
    // reverse A/B arrivals, including cache completion after explicit close.
    for(const action of ['cancel','navigation','replacement']){
      await start(kind);await page.evaluate(()=>{qaPill.stale=qaPill.pending.at(-1);});
      if(action==='navigation')await page.evaluate(()=>show('home'));
      else await page.evaluate(()=>closeSentence());
      assert.equal(await page.evaluate(()=>qaPill.stale.signal.aborted),true,kind+' '+action+': pending request was not aborted');
      if(action==='replacement')await start(kind);
      await page.evaluate(()=>{qaPill.stale.resolve({ko:'오래된 번역'});sentenceGestureReleased();});await frames();
      if(action==='replacement'){
        assert.equal(await page.evaluate(()=>sentenceWaitingActive()),true,kind+': stale A replaced pending B');
        await result({ko:'현재 번역'},kind+'-fresh-B',{capture:false});
        assert.equal(await page.locator('#ps-ko').textContent(),'현재 번역');await page.evaluate(()=>closeSentence());
      }
      await closed(kind+' pending '+action);
      if(action==='navigation')await openFormat(kind);
      await prepare(kind,{width:390,height:844});
    }
    // Existing easy explanation renderer remains explicit, inside the new
    // result's scroll owner; loading/error never changes the source geometry.
    const helpCalls=await page.evaluate(()=>qaPill.calls.filter(call=>call.op==='sentence_easy_explanation').length);
    await start(kind);await result({ko:korean},kind+'-help',{capture:false});
    const calls=await page.evaluate(()=>qaPill.calls.length);
    assert.equal(await page.locator('#ps-easy-button').isVisible(),true,kind+': explicit help trigger missing');
    assert.equal(await page.evaluate(()=>qaPill.calls.filter(call=>call.op==='sentence_easy_explanation').length),helpCalls,
      kind+': successful result prefetched explanation');
    await page.locator('#ps-easy-button').click();
    await page.waitForFunction(calls=>qaPill.calls.length===calls+1,calls);
    assert.equal(await page.locator('#ps-easy-skeleton').isVisible(),true,kind+': original help loading missing');
    await unchanged(kind+' help loading');await screenshot(kind+'-help-loading');
    await page.evaluate(()=>qaPill.pending.at(-1).resolve({error:'explanation_failed'}));
    await page.waitForFunction(()=>!sentenceEasyState.loading);
    assert.equal(await page.locator('#ps-easy-retry').isVisible(),true,kind+': help retry missing');
    await page.locator('#ps-easy-retry').click();
    const longHelp=Array(12).fill('어려운 표현의 연결을 따라가며 중심 행동과 배경을 구분해 읽을 수 있습니다.').join(' ');
    assert.ok(longHelp.length>=10&&longHelp.length<=600,'successful long-help fixture must satisfy production length limits');
    await page.evaluate(explanation=>qaPill.pending.at(-1).resolve({explanation}),longHelp);
    await page.waitForFunction(()=>!sentenceEasyState.loading);await settle();
    assert.equal(await page.locator('#ps-easy-text').textContent(),longHelp,kind+': long help text lost');
    await validateResult(kind+' help success growth',{long:true});await screenshot(kind+'-long-help');
    await page.evaluate(()=>{closeSentence();sentenceEasyCache.clear();});
    await start(kind);await result({ko:korean},kind+'-help-cancel',{capture:false});
    await page.locator('#ps-easy-button').click();
    await page.evaluate(()=>{qaPill.staleHelp=qaPill.pending.at(-1);closeSentence();qaPill.staleHelp.resolve({explanation:'닫힌 해석을 복원하면 안 되는 설명'});});
    await closed(kind+' stale help');
    assert.equal(await page.evaluate(()=>qaPill.staleHelp.signal.aborted),true,kind+': help was not canceled');
    await prepare(kind,{width:390,height:844});
    // A stale cache hit is a separate completion path from network arrival.
    await page.evaluate(kind=>{
      dictGet=()=>new Promise(resolve=>{qaPill.cacheResolve=resolve;});
      qaPill.start(kind);closeSentence();qaPill.cacheResolve({ko:'오래된 캐시'});
    },kind);
    await frames();await closed(kind+' stale cache');await page.evaluate(()=>{dictGet=async()=>null;});
    if(kind==='pdf'){
      await prepare(kind,{width:820,height:1180});
      await page.evaluate(()=>{qaPill.touch=(type,ids,cancelable=true)=>{
        const target=document.querySelector('.pdf-source-page canvas'),box=target.getBoundingClientRect();
        const touch=id=>({identifier:id,touchType:'direct',target,clientX:box.left+box.width/2+(id===1?-50:50),clientY:Math.min(240,box.bottom-30)});
        const event=new Event(type,{bubbles:true,cancelable});
        Object.defineProperties(event,{touches:{value:ids.map(touch)},changedTouches:{value:(ids.length?ids:[1,2]).map(touch)}});
        target.dispatchEvent(event);
      };});
      for(const mode of ['pending','result','help'])for(const ending of ['release','cancel','blur','noncancelable']){
        await page.evaluate(()=>sentenceEasyCache.clear());
        await start(kind);
        if(mode!=='pending')await result({ko:korean},kind+'-pinch-'+mode+'-'+ending,{capture:false});
        if(mode==='help')await page.locator('#ps-easy-button').click();
        await page.evaluate(()=>{qaPill.beforePinchPending=qaPill.pending.at(-1);});
        await page.evaluate(()=>qaPill.touch('touchstart',[1,2]));
        assert.equal(await page.evaluate(()=>originalPinchBusy()),true,'PDF pinch did not acquire gesture');
        await closed('PDF pinch acquisition');
        if(mode!=='result')assert.equal(await page.evaluate(()=>qaPill.beforePinchPending.signal.aborted),true,
          'PDF pinch did not abort '+mode);
        await page.evaluate(ending=>{
          if(ending==='release')qaPill.touch('touchend',[]);
          if(ending==='cancel')qaPill.touch('touchcancel',[]);
          if(ending==='blur')window.dispatchEvent(new Event('blur'));
          if(ending==='noncancelable')qaPill.touch('touchmove',[1,2],false);
          qaPill.beforePinchPending.resolve({ko:'오래된 해석',explanation:'오래된 설명'});sentenceGestureReleased();
        },ending);
        await page.waitForFunction(()=>!originalPinchBusy());await settle();await closed('PDF pinch '+mode+' '+ending);
        await prepare(kind,{width:820,height:1180});
      }
    }
  }
  assert.deepEqual(providerAttempts,[],'attempted real provider transport');
  assert.deepEqual(errors,[],'uncaught browser errors');
  const video=page.video();await page.close();
  await context.close();context=null;
  const videoPath=resolve(output,`${engineName}-sentence-success-pill.webm`);
  if(video)await video.saveAs(videoPath);
  writeFileSync(resolve(output,`${engineName}-sentence-success-pill-report.json`),JSON.stringify({
    engine:engineName,preview,synthetic:true,providerCalls:0,imports,cases:reports,screenshots,video:videoPath,videoTimeline,
    videoTimeOrigin:'Milliseconds from page creation request; allow 1 second leading/trailing padding when extracting clips.',
    note:'Actual imported fixture rendering and browser video; physical iPhone/iPad safe-area and native gesture proof is separate.'},null,2));
  console.log(`${engineName}: ${reports.length} successful sentence cases plus lifetime/help/pinch checks passed; ${output}`);
}catch(error){
  let diagnostics=null;
  if(pageForFailure&&!pageForFailure.isClosed()){
    try{diagnostics=await pageForFailure.evaluate(()=>({measurement:qaPill.measure?.(),before:qaPill.before,
      current:qaPill.geometry?.(),events:qaPill.restorationEvents,scrollWrites:qaPill.scrollWrites}));}catch{}
    try{await pageForFailure.screenshot({path:resolve(output,`${engineName}-sentence-success-pill-failure.png`),fullPage:false});}catch{}
  }
  writeFileSync(resolve(output,`${engineName}-sentence-success-pill-failure.json`),JSON.stringify({
    engine:engineName,preview,error:String(error),stack:error.stack,importing,imports,completedCases:reports,screenshots,videoTimeline,diagnostics},null,2));
  throw error;
}finally{
  try{if(context)await context.close();if(browser)await browser.close();}
  finally{if(profile)rmSync(profile,{recursive:true,force:true});await new Promise(done=>server.close(done));}
}
