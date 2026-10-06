/* Rendered, provider-free regression for inline waiting and anchored error/retry.
 * Run with BROWSER=chromium|webkit (or BREEZE_QA_ENGINE), and optionally
 * BREEZE_BROWSER_EXECUTABLE / BREEZE_QA_OUTPUT. Screenshots are browser pixels.
 * BREEZE_QA_PREVIEW=1 runs the phone/Text theme+motion subset for early review;
 * the default always retains all 60 cases plus per-format interruptions.
 * Synthetic fixture state starts at the existing surface/lifetime boundary;
 * verify-sentence-cue-browser.mjs separately owns trusted long-press admission.
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
zip.file('book.opf','<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">sentence-inline-test</dc:identifier><dc:title>Inline sentence fixture</dc:title><dc:language>en</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>');
zip.file('chapter.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Inline sentence fixture</title><style>body{margin:24px;font:20px/1.8 Georgia}p{max-width:600px;margin:0 0 30px}</style></head><body>'+('<p>'+sentence+' '+other+'</p>').repeat(30)+'</body></html>');
const preview=process.env.BREEZE_QA_PREVIEW==='1';
const inputs=[
  ['txt',{name:'sentence-inline.txt',mimeType:'text/plain',buffer:Buffer.from((sentence+' '+other+'\n\n').repeat(50))}],
  ['pdf',{name:'sentence-inline.pdf',mimeType:'application/pdf',buffer:pdfGeometryFixture([
    'A patient reader keeps every word and every meaning',
    'together while the sentence continues onto the next line.',
    'A patient reader keeps every word and every meaning',
    'together while the sentence continues onto the next line.',other])}],
  ['epub',{name:'sentence-inline.epub',mimeType:'application/epub+zip',buffer:await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'})}],
].filter(([kind])=>!preview||kind==='txt');
const profiles=[
  {name:'phone',width:390,height:844},
  {name:'tablet',width:820,height:1180},
  {name:'desktop',width:1440,height:900},
  {name:'narrow',width:320,height:568},
  {name:'short',width:844,height:390},
].filter(profile=>!preview||profile.name==='phone');
const engineName=process.env.BREEZE_QA_ENGINE||process.env.BROWSER||'chromium';
assert.ok(['chromium','webkit'].includes(engineName),'BROWSER/BREEZE_QA_ENGINE must be chromium or webkit');
const engine=engineName==='webkit'?webkit:chromium;
const output=resolve(process.env.BREEZE_QA_OUTPUT||resolve(tmpdir(),'breeze-sentence-inline-proof'));
mkdirSync(output,{recursive:true});
const reports=[],screenshots=[],imports=[];
let browser,context,profile,pageForFailure,importing=null;
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
try{
  const contextOptions={viewport:{width:390,height:844},hasTouch:true,
    deviceScaleFactor:1,serviceWorkers:'block'};
  if(engine===webkit){
    // Match the repository's sentence-cue/import-commit fixtures: persistent
    // WebKit storage preserves imported original-file bytes through IDB reads.
    profile=mkdtempSync(resolve(tmpdir(),'breeze-sentence-inline-'));
    context=await engine.launchPersistentContext(profile,{...contextOptions,headless:true});
  }else{
    browser=await engine.launch({headless:true,executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});
    context=await browser.newContext(contextOptions);
  }
  const page=await context.newPage(),errors=[],providerAttempts=[];
  pageForFailure=page;
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
  await page.evaluate(()=>{
    window.qaInline={pending:[],calls:[],writes:[],range:null,currentLayer:null,kind:null};
    qaInline.restorationJobs=new Set();qaInline.restorationEvents=[];qaInline.scrollWrites=[];
    const recordRestoration=event=>{
      qaInline.restorationEvents.push({...event,at:performance.now(),scroll:readerScrollTop()});
      if(qaInline.restorationEvents.length>100)qaInline.restorationEvents.shift();
    };
    // Mode readiness excludes the existing 360/900ms PDF landing callbacks.
    // Observe those real callbacks through completion, without changing delays,
    // canceling them, or replacing their restoration implementation.
    const stabilize=stabilizePdfModeTarget;
    stabilizePdfModeTarget=(...args)=>{
      const schedule=window.setTimeout;
      window.setTimeout=(callback,delay,...timerArgs)=>{
        const job={owner:'pdf-mode-landing',delay};qaInline.restorationJobs.add(job);
        recordRestoration({...job,state:'scheduled'});
        return schedule(async()=>{
          try{return await callback(...timerArgs);}
          finally{qaInline.restorationJobs.delete(job);recordRestoration({...job,state:'finished'});}
        },delay);
      };
      try{return stabilize(...args);}
      finally{window.setTimeout=schedule;}
    };
    const restorePdf=restorePdfAnchor;
    const trackedPdfRestore=async(...args)=>{
      const job={owner:'pdf-anchor',source:args[0],inset:args[1]};
      qaInline.restorationJobs.add(job);recordRestoration({...job,state:'started'});
      try{return await restorePdf(...args);}
      finally{qaInline.restorationJobs.delete(job);recordRestoration({...job,state:'finished'});}
    };
    restorePdfAnchor=trackedPdfRestore;
    if(ORIGINAL_FORMATS.pdf.restoreAnchor===restorePdf)ORIGINAL_FORMATS.pdf.restoreAnchor=trackedPdfRestore;
    const scrollTo=readerScrollTo;
    readerScrollTo=y=>{
      qaInline.scrollWrites.push({at:performance.now(),from:readerScrollTop(),to:y,
        lookupOpen:sentenceLookupOpen(),stack:new Error().stack});
      if(qaInline.scrollWrites.length>100)qaInline.scrollWrites.shift();
      return scrollTo(y);
    };
    qaInline.readerReady=()=>{
      if(readerPositionPending()||readerAnchorHeld()||qaInline.restorationJobs.size)return false;
      if(currentReaderMode!=='original')return true;
      const box=readerScroller();
      return !originalRotationAnchor&&Math.abs(originalZoomObservedWidth-box.clientWidth)<1
        &&Math.abs(originalZoomObservedHeight-box.clientHeight)<1;
    };

    dictGet=async()=>null;
    dictPut=async(key,value)=>{qaInline.writes.push({key,value});};
    // openSentence's real request owner is exercised; no transport/provider runs.
    sb ||= {};
    dictCall=(body,signal)=>{
      if(body.op==='warm')return Promise.resolve({sentenceEasyExplanation:false});
      if(body.op!=='explain')throw new Error('Unexpected fixture request: '+body.op);
      return new Promise(resolve=>{
        qaInline.calls.push(body);qaInline.pending.push({resolve,signal,body});
      });
    };
    qaInline.chrome=()=>['readpill','readback','aafab','reader-navigation','pdf-page-control','modefab'].map(id=>{
      const node=document.getElementById(id),style=getComputedStyle(node);
      return {id,inert:node.inert,hidden:node.hidden,display:style.display,visibility:style.visibility};
    });
    qaInline.geometry=()=>{
      const rect=node=>{
        const box=node.getBoundingClientRect();
        return [box.x,box.y,box.width,box.height].map(value=>Math.round(value*1000)/1000);
      };
      const frame=originalSession?.kind==='epub'
        ?originalSession.frames.find(frame=>frame?.contentDocument?.querySelector('p')):null;
      const source=qaInline.kind==='txt'?[...document.querySelectorAll('#rtext .w')].slice(0,60)
        :qaInline.kind==='pdf'?[originalSession.pages[0],originalSession.pages[0].querySelector('canvas')].filter(Boolean)
        :[frame,...frame.contentDocument.querySelectorAll('p')].slice(0,7);
      const scroller=readerScroller();
      return {reader:rect(document.getElementById('readmain')),scroll:[scroller.scrollTop,scroller.scrollLeft],
        zoom:originalZoom(),source:source.map(rect),text:source.map(node=>node.textContent)};
    };
    qaInline.find=kind=>{
      const surface=READER_SURFACES.find(surface=>surface.name===(kind==='txt'?'text':kind));
      if(kind==='pdf'){
        const page=originalSession.pages[0],rect=page.getBoundingClientRect();
        const word=originalSession.wordBoxes.get(1).find(word=>word.word==='patient');
        const x=rect.left+(word.x+word.w/2)*rect.width,y=rect.top+(word.y+word.h/2)*rect.height;
        return {found:surface.sentenceAt(x,y),point:{x,y}};
      }
      // Only choose content already visible; never scroll a lookup into view.
      const bottom=Math.min(innerHeight-110,600);
      for(let y=55;y<bottom;y+=8)for(let x=24;x<innerWidth-24;x+=13){
        const found=surface.sentenceAt(x,y);
        if(found?.sentence.startsWith('A patient reader'))return {found,point:{x,y}};
      }
      throw new Error('No visible selected sentence in '+kind);
    };
    qaInline.start=kind=>{
      const {found,point}=qaInline.find(kind);
      if(!found?.paint)throw new Error('Missing actual source occurrence');
      qaInline.found=found;qaInline.point=point;qaInline.range=null;
      if(!qaInline.readerReady())throw new Error('Lookup started before Reader restoration completed');
      qaInline.baselineAt=performance.now();
      qaInline.before=qaInline.geometry();qaInline.beforeChrome=qaInline.chrome();
      const views=[window,...(originalSession?.kind==='epub'
        ?originalSession.frames.filter(Boolean).map(frame=>frame.contentWindow):[])];
      const originals=views.map(view=>[view.Range.prototype,view.Range.prototype.getClientRects]);
      try{
        for(const [proto,original] of originals)proto.getClientRects=function(){
          qaInline.range=this.cloneRange();return original.call(this);
        };
        clearReaderModeCue();found.paint();
      }finally{for(const [proto,original] of originals)proto.getClientRects=original;}
      qaInline.currentLayer=readerSentenceCue.layer;
      qaInline.opening=openSentence(found.sentence,found);
    };
    qaInline.motion=layer=>[...layer.children].map(node=>{
      const style=layer.ownerDocument.defaultView.getComputedStyle(node);
      return {animation:style.animationName,opacity:style.opacity,transform:style.transform};
    });
    qaInline.cue=()=>{
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
      probe.style.cssText='position:absolute;left:-9999px;top:0;width:1px;height:1px';doc.body.appendChild(probe);
      const wordStyle=view.getComputedStyle(probe);
      const shared={animation:wordStyle.animationName,duration:wordStyle.animationDuration,
        timing:wordStyle.animationTimingFunction,image:wordStyle.backgroundImage};probe.remove();
      let expected=[];
      if(qaInline.kind==='pdf'){
        const page=originalSession.pages[0],box=page.getBoundingClientRect();
        const words=originalSession.wordBoxes.get(1).filter(word=>word.sentenceStart===qaInline.found.start);
        expected=words.map(word=>[box.left+word.x*box.width,box.top+word.y*box.height,
          box.left+(word.x+word.w)*box.width,box.top+(word.y+word.h)*box.height]);
      }else expected=[...qaInline.range.getClientRects()].filter(box=>box.width>0&&box.height>0)
        .map(box=>[box.left,box.top,box.right,box.bottom]);
      const frame=doc===document?null:originalSession.frames.find(frame=>frame?.contentDocument===doc);
      const frameBox=frame?.getBoundingClientRect();
      const visible=styles.some(({box})=>{
        const x=box[0]+(frameBox?.left||0),y=box[1]+(frameBox?.top||0);
        return x<innerWidth&&y<innerHeight&&box[2]+(frameBox?.left||0)>0&&box[3]+(frameBox?.top||0)>0;
      });
      return {pending:layer.classList.contains('is-pending'),connected:layer.isConnected,
        sameLayer:layer===qaInline.currentLayer,styles,shared,expected,visible,
        blend:view.getComputedStyle(layer).mixBlendMode,ariaHidden:layer.getAttribute('aria-hidden')};
    };
  });
  const frames=()=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  // Do not await an infinite sheen. Only finite transitions may settle here.
  const settle=async()=>{
    await frames();
    await page.evaluate(()=>Promise.all(document.getAnimations().filter(animation=>
      animation.playState==='running'&&Number.isFinite(animation.effect?.getComputedTiming().endTime))
      .map(animation=>animation.finished.catch(()=>{}))));
    await frames();
  };
  const readerReady=async()=>{
    await frames();
    await page.waitForFunction(()=>qaInline.readerReady());
    await settle();
    await page.waitForFunction(()=>qaInline.readerReady());
  };
  const screenshot=async(name)=>{
    const filename=`${engineName}-${name}.png`;
    await page.screenshot({path:resolve(output,filename),fullPage:false,animations:'allow'});
    screenshots.push(filename);
  };
  const unchanged=async(label)=>assert.deepEqual(await page.evaluate(()=>qaInline.geometry()),
    await page.evaluate(()=>qaInline.before),label+': lookup changed source geometry or forced a scroll');
  const closed=async(label)=>{
    await page.waitForFunction(()=>!sentenceLookupOpen()&&!readerSentenceCue);
    assert.equal(await page.locator('#sentence-modal').isVisible(),false,label+': modal reopened');
    assert.equal(await page.locator('#sentence-peek').isVisible(),false,label+': anchored error remained');
    assert.equal(await page.locator('#sentence-pill-status').count(),0,label+': obsolete bottom status still exists');
    assert.equal(await page.evaluate(()=>document.body.classList.contains('sentence-pill-waiting')
      ||document.body.classList.contains('sentence-pill-error')),false,label+': chrome state leaked');
    await page.waitForFunction(()=>!qaInline.currentLayer?.isConnected);
    assert.equal(await page.evaluate(()=>qaInline.currentLayer?.classList.contains('is-pending')),false,
      label+': outgoing cue retained infinite shimmer');
  };
  const start=async(kind)=>{
    const count=await page.evaluate(()=>qaInline.calls.length);
    await page.evaluate(kind=>qaInline.start(kind),kind);
    await page.waitForFunction(count=>qaInline.calls.length===count+1&&sentenceWaitingActive(),count);
    await frames();return count;
  };
  const pending=async(label,reduced)=>{
    const cue=await page.evaluate(()=>qaInline.cue());
    assert.ok(cue?.connected&&cue.pending&&cue.sameLayer&&cue.visible,label+': selected source has no live pending cue');
    assert.equal(cue.ariaHidden,'true');
    assert.ok(cue.styles.length>0);
    for(const style of cue.styles){
      assert.equal(style.animation,reduced?'none':'breeze-word-sheen',label+': wrong pending animation');
      for(const key of ['animation','duration','timing','image'])assert.equal(style[key],cue.shared[key],label+': differs from word sheen '+key);
      assert.equal(style.transform,'none',label+': pending cue scales source geometry');
      assert.equal(style.radius,'8px',label+': shared word style replaced sentence geometry');
      assert.equal(style.pointerEvents,'none',label+': cue steals Reader input');
    }
    for(const source of cue.expected)assert.ok(cue.styles.some(({box})=>
      box[0]<=source[0]+.2&&box[1]<=source[1]+.2&&box[2]>=source[2]-.2&&box[3]>=source[3]-.2),
      label+': selected source escaped the line cue');
    for(let edge=0;edge<4;edge++){
      const boundary=edge<2?Math.min:Math.max;
      const source=boundary(...cue.expected.map(box=>box[edge]));
      const selected=boundary(...cue.styles.map(style=>style.box[edge]));
      assert.ok(Math.abs(source-selected)<.2,label+': cue extends past the selected source edge '+edge);
    }
    assert.equal(await page.locator('#sentence-modal').isVisible(),false,label+': pending opened a modal');
    assert.equal(await page.locator('#sentence-pill-status').count(),0,label+': obsolete bottom loading pill remains');
    assert.equal(await page.locator('#sentence-peek').isVisible(),false,label+': pending error pill is visible');
    assert.equal(await page.locator('#sentence-peek-more').count(),0,label+': sentence error has a chevron');
    assert.equal(await page.locator('#sentence-peek .word-peek-spinner').count(),0,label+': sentence spinner remains');
    assert.deepEqual(await page.evaluate(()=>qaInline.chrome()),await page.evaluate(()=>qaInline.beforeChrome),
      label+': inline waiting changed bottom chrome visibility or interactivity');
    const announcement=await page.locator('#sentence-loading-status').evaluate(node=>{
      const style=getComputedStyle(node);return {text:node.textContent,role:node.getAttribute('role'),
        live:node.getAttribute('aria-live'),width:node.getBoundingClientRect().width,clip:style.clipPath};
    });
    assert.ok(announcement.text,label+': loading is not announced');
    assert.equal(announcement.role,'status');assert.equal(announcement.live,'polite');
    assert.ok(announcement.width<=1&&announcement.clip!=='none',label+': visible loading text');
    await unchanged(label);return cue;
  };
  const noEntranceReplay=(motion,label)=>{
    assert.ok(motion.length>0,label+': missing cue at the terminal frame');
    for(const style of motion){
      assert.equal(style.animation,'none',label+': stopping shimmer restarted the entrance animation');
      assert.equal(style.opacity,'1',label+': stopping shimmer flashed the cue opacity');
      assert.equal(style.transform,'none',label+': stopping shimmer scaled the cue');
    }
  };
  const terminal=async(answer,label)=>{
    const motion=await page.evaluate(async answer=>{
      qaInline.pending.at(-1).resolve(answer);
      // The request continuation runs first. Inspect its synchronous style change
      // in this microtask, before requestAnimationFrame or animation settling.
      await Promise.resolve();
      return qaInline.motion(qaInline.currentLayer);
    },answer);
    noEntranceReplay(motion,label);
  };
  const stopped=async(label)=>{
    const cue=await page.evaluate(()=>qaInline.cue());
    assert.ok(cue?.connected&&cue.sameLayer,label+': selected occurrence was lost');
    assert.equal(cue.pending,false,label+': terminal state still pending');
    for(const style of cue.styles)assert.doesNotMatch(style.animation,/breeze-word-sheen/,label+': terminal shimmer');
    return cue;
  };
  const verifyAnchoredError=async label=>{
    await page.mouse.move(0,0);
    const result=await page.evaluate(()=>{
      const peek=document.getElementById('sentence-peek'),word=document.getElementById('word-peek');
      const values=(node,keys,pseudo)=>{
        const style=getComputedStyle(node,pseudo);return keys.map(key=>style.getPropertyValue(key));
      };
      const shell=['position','border-radius','border-width','border-color','background-color','color',
        'box-shadow','backdrop-filter','-webkit-backdrop-filter'];
      const meaning=['font-family','font-size','font-weight','line-height','padding','color'];
      const action=['width','min-height','padding','border-radius','background-color','color'];
      const glass=['background-image','box-shadow','border-radius'];
      const source=wordPeekNodeRect(qaInline.found.peekTarget);
      const box=peek.getBoundingClientRect();
      const reference=document.createElement('div');
      reference.style.cssText=`position:fixed;visibility:hidden;pointer-events:none;box-sizing:border-box;width:${box.width}px;height:${box.height}px`;
      reference.style.setProperty('--word-safe-top',getComputedStyle(peek).getPropertyValue('--word-safe-top'));
      document.body.appendChild(reference);
      const expectedAnchor={...source,direction:null};
      placeLookupPeek(reference,expectedAnchor,false);
      const expected={left:reference.style.left,top:reference.style.top,direction:reference.dataset.expandDirection};
      const view=window.visualViewport,vx=view?.offsetLeft||0,vy=view?.offsetTop||0;
      const width=view?.width||innerWidth,height=view?.height||innerHeight;
      const safeTop=vy+16+(parseFloat(getComputedStyle(peek).getPropertyValue('--word-safe-top'))||0);
      const chrome=document.getElementById('readchrome').getBoundingClientRect();
      const safeBottom=Math.min(vy+height-16,chrome.height&&chrome.top>safeTop?chrome.top-8:vy+height-16);
      const layer=readerSentenceCue.layer,doc=layer.ownerDocument;
      const frame=doc===document?null:originalSession.frames.find(frame=>frame?.contentDocument===doc);
      const outer=frame?.getBoundingClientRect(),sx=frame?outer.width/frame.clientWidth:1,sy=frame?outer.height/frame.clientHeight:1;
      const lines=[...layer.children].map(node=>{
        const r=node.getBoundingClientRect();return {left:(outer?.left||0)+r.left*sx,
          top:(outer?.top||0)+r.top*sy,right:(outer?.left||0)+r.right*sx,bottom:(outer?.top||0)+r.bottom*sy};
      });
      const union={left:Math.min(...lines.map(r=>r.left)),top:Math.min(...lines.map(r=>r.top)),
        right:Math.max(...lines.map(r=>r.right)),bottom:Math.max(...lines.map(r=>r.bottom))};
      const scenarios=[];
      for(const [name,top,bottom] of [
        ['both-fit',(safeTop+safeBottom)/2-10,(safeTop+safeBottom)/2+10],
        ['above-only',safeBottom-20,safeBottom],
        ['oversized',safeTop-100,safeBottom+100],
      ]){
        const anchor={...source,top,bottom,height:bottom-top,direction:null};
        placeLookupPeek(reference,anchor,false);
        const r=reference.getBoundingClientRect();
        scenarios.push({name,source:anchor,direction:reference.dataset.expandDirection,top:r.top,bottom:r.bottom});
      }
      reference.remove();
      return {source,union,scenarios,safe:{top:safeTop,bottom:safeBottom,left:vx+16,right:vx+width-16},
        box:{left:box.left,top:box.top,right:box.right,bottom:box.bottom,height:box.height},actual:{left:peek.style.left,top:peek.style.top,direction:peek.dataset.expandDirection},expected,
        sentence:{shell:values(peek,shell),glass:values(peek,glass,'::before'),
          meaning:values(document.getElementById('sentence-peek-meaning'),meaning),
          action:values(document.getElementById('sentence-peek-retry'),action)},
        word:{shell:values(word,shell),glass:values(word,glass,'::before'),
          meaning:values(document.getElementById('word-peek-meaning'),meaning),
          action:values(document.getElementById('word-peek-retry'),action)}};
    });
    assert.ok(result.source?.width>0&&result.source.height>0,label+': missing live whole-sentence anchor');
    assert.deepEqual(result.actual,result.expected,label+': anchored error differs from shared placement with actual-pill reservation');
    for(const edge of ['left','top','right','bottom'])assert.ok(Math.abs(result.source[edge]-result.union[edge])<.2,
      label+': error anchor does not span the whole selected sentence '+edge);
    const below=result.safe.bottom-result.source.bottom-8>=result.box.height;
    const above=result.source.top-8-result.safe.top>=result.box.height;
    if(below){
      assert.equal(result.actual.direction,'below',label+': did not prefer available space below the sentence');
      assert.ok(result.box.top>=result.source.bottom,label+': error overlaps the final selected line');
    }else if(above){
      assert.equal(result.actual.direction,'above',label+': did not use available space above the sentence');
      assert.ok(result.box.bottom<=result.source.top,label+': error overlaps the first selected line');
    }
    assert.ok(result.box.top>=result.safe.top-.6&&result.box.bottom<=result.safe.bottom+.6
      &&result.box.left>=result.safe.left-.6&&result.box.right<=result.safe.right+.6,
      label+': error fallback escaped the usable viewport');
    for(const scenario of result.scenarios){
      if(scenario.name==='both-fit'){
        assert.equal(scenario.direction,'below',label+': both-fit policy did not prefer below');
        assert.ok(scenario.top>=scenario.source.bottom,label+': both-fit placement overlaps sentence');
      }else if(scenario.name==='above-only'){
        assert.equal(scenario.direction,'above',label+': above-only policy did not choose above');
        assert.ok(scenario.bottom<=scenario.source.top,label+': above-only placement overlaps sentence');
      }else assert.ok(scenario.top>=result.safe.top-.6&&scenario.bottom<=result.safe.bottom+.6,
        label+': oversized-sentence fallback escaped the usable viewport');
    }
    assert.deepEqual(result.sentence,result.word,label+': anchored error differs from word mini-pill styles');
    assert.deepEqual(await page.evaluate(()=>qaInline.chrome()),await page.evaluate(()=>qaInline.beforeChrome),
      label+': error changed bottom chrome visibility or interactivity');
  };
  for(const [kind] of inputs){
    await page.evaluate(async kind=>{
      closeSentence();qaInline.kind=kind;
      await openBook(books.find(book=>book.kind===kind));
      if(kind!=='txt')await switchReaderMode('original');
    },kind);
    await page.waitForFunction(kind=>kind==='txt'?document.querySelectorAll('#rtext .w').length>20
      :kind==='pdf'?originalSession?.wordBoxes.get(1)?.length>0
      :originalSession?.frames.some(frame=>frame?.contentDocument?.querySelector('p')),kind);
    if(kind==='epub')await page.evaluate(()=>Promise.all(originalSession.frameGeometryReady));
    await readerReady();
    for(const profile of profiles)for(const dark of [false,true])for(const reduced of [false,true]){
      const label=`${kind}-${profile.name}-${profile.width}x${profile.height}-${dark?'dark':'light'}-${reduced?'reduced':'motion'}`;
      console.log('Checking',engineName,label);
      await page.setViewportSize({width:profile.width,height:profile.height});
      await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference',colorScheme:dark?'dark':'light'});
      await page.waitForFunction(()=>sentenceLastCompact===sentenceCompactViewport());
      await readerReady();
      await page.evaluate(({dark,kind})=>{
        darkMode=dark;applyDark();readerScrollTo(0);setReaderChrome(false);
        if(kind==='epub'){
          const frame=originalSession.frames.find(frame=>frame?.contentDocument?.querySelector('p'));
          const para=frame.contentDocument.querySelector('p');
          const y=frame.getBoundingClientRect().top+para.getBoundingClientRect().top;
          readerScrollTo(readerScrollTop()+y-80);
        }
      },{dark,kind});
      await settle();await page.waitForFunction(()=>qaInline.readerReady());
      await start(kind);
      const cue=await pending(label,reduced);
      if(kind==='pdf')assert.equal(cue.styles.length,2,label+': identical second PDF occurrence was also highlighted');
      assert.equal(cue.blend,kind!=='pdf'&&dark?'screen':'multiply',label+': wrong source blending');
      if(!reduced||profile.name==='phone'&&dark)await screenshot(label+'-loading');
      await terminal({error:'lookup_failed'},label+' error terminal frame');
      await page.waitForFunction(()=>!document.getElementById('sentence-peek').hidden);
      await settle();const failed=await stopped(label);
      assert.equal(await page.locator('#sentence-peek-meaning').innerText(),'해석하지 못했어요');
      assert.match(await page.locator('#sentence-peek-retry').getAttribute('aria-label'),/다시|재시도/);
      assert.equal(await page.locator('#sentence-peek-retry').innerText(),'');
      assert.equal(await page.locator('#sentence-peek-retry svg').count(),1);
      assert.equal(await page.locator('#sentence-peek button').count(),1);
      assert.equal(await page.locator('#sentence-peek-more').count(),0);
      assert.equal(await page.locator('#sentence-peek-retry').isVisible(),true);
      assert.equal(await page.locator('#sentence-modal').isVisible(),false,label+': failure opened translation modal');
      assert.deepEqual(failed.styles.map(style=>style.inline),cue.styles.map(style=>style.inline),label+': failure moved source cue');
      assert.equal(await page.locator('#sentence-peek').getAttribute('role'),'status');
      assert.equal(await page.locator('#sentence-peek').getAttribute('aria-live'),'polite');
      const retryBox=await page.locator('#sentence-peek-retry').boundingBox();
      const pillBox=await page.locator('#sentence-peek').boundingBox();
      assert.ok(retryBox.height>=44&&retryBox.width>=44,label+': retry touch target too small');
      assert.ok(pillBox.x>=0&&pillBox.y>=0&&pillBox.x+pillBox.width<=profile.width+1
        &&pillBox.y+pillBox.height<=profile.height+1,label+': failure pill outside viewport');
      assert.equal(await page.locator('#sentence-peek').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true,
        label+': error message/retry clipped');
      await verifyAnchoredError(label);
      await unchanged(label);
      if(!reduced||profile.name==='phone'&&dark)await screenshot(label+'-error');
      const count=await page.evaluate(()=>qaInline.calls.length);
      // A real button click exercises the production retry wiring, without scrollIntoView.
      await page.locator('#sentence-peek-retry').click();
      await page.waitForFunction(count=>qaInline.calls.length===count+1,count);
      await pending(label+' retry',reduced);
      const retry=await page.evaluate(()=>({sameOrigin:sentenceOrigin===qaInline.found,
        current:qaInline.calls.at(-1),first:qaInline.calls.at(-2)}));
      assert.ok(retry.sameOrigin,label+': retry resolved a different source occurrence');
      assert.equal(retry.current.sentence,retry.first.sentence);
      assert.equal(retry.current.lookupId,retry.first.lookupId,label+': recovery lost request identity');
      await terminal({ko:'참을성 있는 독자는 문장의 단어와 뜻을 함께 읽습니다.'},label+' success terminal frame');
      await page.waitForFunction(()=>!document.getElementById('sentence-modal').hidden);
      await settle();await stopped(label+' success');
      assert.equal(await page.locator('#sentence-peek').isVisible(),false);
      assert.equal(await page.locator('#ps-source').isVisible(),false);
      assert.equal(await page.locator('#ps-en').textContent(),'');
      await unchanged(label);
      await page.keyboard.press('Escape');await closed(label+' escape');
      reports.push({kind,...profile,dark,reduced,cueLines:cue.styles.length,states:['loading','error','retry','success','escape']});
    }
    // Exercise lifetime interruptions on the real source in each format.
    await page.setViewportSize({width:390,height:844});
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.waitForFunction(()=>sentenceLastCompact===sentenceCompactViewport());
    await readerReady();
    await page.evaluate(()=>{readerScrollTo(0);setReaderChrome(false);});await settle();
    await start(kind);
    const cancellationMotion=await page.evaluate(()=>{
      const layer=readerSentenceCue.layer;
      closeSentence();
      // Capture child styles before the outgoing layer advances its fade.
      const motion=qaInline.motion(layer);
      qaInline.pending.at(-1).resolve({error:'lookup_failed'});
      return motion;
    });
    noEntranceReplay(cancellationMotion,kind+' cancellation frame');
    await closed(kind+' immediate cancellation');
    // Pending and briefly revealed errors follow the word mini-pill scroll owner.
    const timing=await page.evaluate(()=>({idle:WORD_PEEK_SCROLL_IDLE_MS,seen:WORD_PEEK_SEEN_MS}));
    assert.equal(timing.idle,250);assert.equal(timing.seen,750);
    const userMove=()=>page.evaluate(()=>{
      readerScroller().scrollTop+=2;scrollGesture();qaInline.lastMotion=performance.now();
    });
    await start(kind);
    const scrollCallCount=await page.evaluate(()=>qaInline.calls.length);
    await page.evaluate(()=>{readerScrollTo(readerScrollTop()+2);scrollGesture();});
    assert.equal(await page.evaluate(()=>sentenceWaitingActive()),true,kind+': programmatic scroll canceled pending');
    await userMove();
    assert.equal(await page.evaluate(()=>sentenceWaitingActive()),true,kind+': user scroll canceled pending');
    await terminal({error:'lookup_failed'},kind+' moving error terminal frame');
    assert.equal(await page.locator('#sentence-peek').isVisible(),false,kind+': error revealed during motion');
    await page.waitForTimeout(timing.idle/2);await userMove();
    await page.waitForTimeout(timing.idle/2);
    assert.equal(await page.locator('#sentence-peek').isVisible(),false,kind+': momentum did not defer reveal');
    await page.waitForFunction(()=>!document.getElementById('sentence-peek').hidden);
    assert.ok(await page.evaluate(()=>performance.now()-qaInline.lastMotion)>=timing.idle-1,
      kind+': error appeared before word scroll-idle interval');
    await userMove();
    assert.equal(await page.locator('#sentence-peek').isVisible(),false,kind+': brief reveal stayed visible during scroll');
    assert.equal(await page.evaluate(()=>sentenceLookupOpen()),true,kind+': brief reveal ended its lifetime');
    await page.waitForFunction(()=>!document.getElementById('sentence-peek').hidden);
    assert.equal(await page.evaluate(()=>qaInline.calls.length),scrollCallCount,kind+': scroll/reveal retried automatically');
    await page.waitForTimeout(timing.seen+30);await userMove();
    await closed(kind+' seen error scroll dismissal');
    await page.waitForTimeout(timing.idle+30);
    assert.equal(await page.locator('#sentence-peek').isVisible(),false,kind+': seen error resurrected at idle');
    await page.evaluate(()=>{readerScrollTo(0);setReaderChrome(false);});await settle();
    await start(kind);
    await page.evaluate(()=>{
      qaInline.offscreen=qaInline.pending.at(-1);
      readerScroller().scrollTop+=innerHeight+200;scrollGesture();
    });
    assert.equal(await page.locator('#sentence-peek').isVisible(),false,kind+': offscreen target showed a pill');
    await page.evaluate(()=>{
      qaInline.offscreen.resolve({error:'lookup_failed'});sentenceGestureReleased();
    });
    await closed(kind+' offscreen completion');
    await page.waitForTimeout(timing.idle+30);
    assert.equal(await page.locator('#sentence-peek').isVisible(),false,kind+': offscreen completion reopened error');
    await page.evaluate(()=>{readerScrollTo(0);setReaderChrome(false);});await settle();
    for(const action of ['cancel','navigation','replacement']){
      await start(kind);
      await page.evaluate(()=>{qaInline.stale=qaInline.pending.at(-1);qaInline.oldLayer=readerSentenceCue.layer;});
      if(action==='cancel')await page.keyboard.press('Escape');
      if(action==='navigation')await page.evaluate(()=>show('home'));
      if(action==='replacement'){
        await page.evaluate(()=>closeSentence());await start(kind);
      }
      assert.equal(await page.evaluate(()=>qaInline.stale.signal.aborted),true,kind+' '+action+': request not aborted');
      await page.evaluate(()=>{qaInline.stale.resolve({ko:'A stale answer must never restore its UI.'});sentenceGestureReleased();});
      await frames();
      if(action==='replacement'){
        await pending(kind+' replacement',false);
        assert.equal(await page.evaluate(()=>readerSentenceCue.layer===qaInline.oldLayer),false);
        await page.waitForFunction(()=>!qaInline.oldLayer.isConnected);
        assert.ok(await page.evaluate(()=>readerSentenceCue.layer.isConnected),'outgoing callback erased replacement');
        await page.evaluate(()=>{closeSentence();qaInline.pending.at(-1).resolve({error:'lookup_failed'});});
      }
      await closed(kind+' '+action);
      if(action==='navigation'){
        await page.evaluate(async kind=>{await openBook(books.find(book=>book.kind===kind));if(kind!=='txt')await switchReaderMode('original');},kind);
        await readerReady();
      }
      await page.evaluate(()=>{readerScrollTo(0);setReaderChrome(false);});await settle();
    }
  }
  assert.deepEqual(providerAttempts,[],'test attempted a live translation/explanation transport');
  assert.deepEqual(errors,[],'uncaught browser errors');
  const report={engine:engineName,preview,providerCalls:0,synthetic:true,
    note:'Rendered imported fixtures; this is browser evidence, not physical iPhone/iPad validation.',
    imports,cases:reports,screenshots};
  writeFileSync(resolve(output,`${engineName}-sentence-inline-report.json`),JSON.stringify(report,null,2));
  console.log(`${engineName}${preview?' preview':''}: ${reports.length} sentence inline state cases, lifetime interruptions, and ${screenshots.length} screenshots passed; ${output}`);
}catch(error){
  let restorationDiagnostics=null;
  if(pageForFailure&&!pageForFailure.isClosed()){
    try{restorationDiagnostics=await pageForFailure.evaluate(()=>({baselineAt:qaInline.baselineAt,
      pending:[...qaInline.restorationJobs],events:qaInline.restorationEvents,scrollWrites:qaInline.scrollWrites}));}catch{}
  }
  if(pageForFailure&&!pageForFailure.isClosed()){
    try{await pageForFailure.screenshot({path:resolve(output,`${engineName}-sentence-inline-failure.png`),fullPage:false});}
    catch{}
  }
  writeFileSync(resolve(output,`${engineName}-sentence-inline-failure.json`),JSON.stringify({
    engine:engineName,preview,error:String(error),importing,imports,completedCases:reports,screenshots,restorationDiagnostics},null,2));
  throw error;
}finally{
  try{
    if(context)await context.close();
    if(browser)await browser.close();
  }finally{
    if(profile)rmSync(profile,{recursive:true,force:true});
    await new Promise(done=>server.close(done));
  }
}

