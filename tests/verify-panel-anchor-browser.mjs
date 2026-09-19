import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
function fixturePdf(count=18){
  const objects=['','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'],kids=[];
  for(let n=0;n<count;n++){
    const page=objects.length+1,stream=page+1;kids.push(`${page} 0 R`);
    const lines=Array.from({length:26},(_,i)=>`1 0 0 1 50 ${740-i*24} Tm (Page ${n+1} line ${i+1}. Stable reading keeps every word in place.) Tj`).join('\n');
    const content=`BT /F1 13 Tf\n${lines}\nET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${stream} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  objects[0]='<< /Type /Catalog /Pages 2 0 R >>';
  objects[1]=`<< /Type /Pages /Count ${count} /Kids [${kids.join(' ')}] >>`;
  let pdf='%PDF-1.4\n',offsets=[0];
  objects.forEach((object,index)=>{offsets.push(pdf.length);pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;});
  const xref=pdf.length;
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  pdf+=offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('');
  pdf+=`trailer << /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png',
  '.woff2':'font/woff2','.epub':'application/epub+zip'};
const server=createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const path=resolve(root,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1280,height:900},serviceWorkers:'block'});
await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1','done'));
await page.route('**/*',route=>{
  const href=route.request().url();
  return href.startsWith(url)||href.startsWith('blob:') ? route.continue() : route.abort();
});

try{
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
    window.qaPanelMetrics={restores:0,durations:[]};
    const restore=restoreReaderPanelAnchor;
    restoreReaderPanelAnchor=async change=>{
      const at=performance.now();
      try{return await restore(change);}
      finally{qaPanelMetrics.restores++;qaPanelMetrics.durations.push(performance.now()-at);}
    };
    window.qaAnchorY=anchor=>{
      const source=anchor.source;
      if(anchor.mode==='text'){
        const block=document.querySelector(`#rtext [data-pi="${source.pi}"]`);
        const range=domRangeForOffsets(block,source.char,Math.min(block.textContent.length,source.char+1));
        return (range.getClientRects()[0]||block.getBoundingClientRect()).top;
      }
      if(source.kind==='pdf'){
        const page=originalSession.pages[source.page-1],rect=page.getBoundingClientRect();
        return rect.top+source.y*rect.height;
      }
      const frame=originalSession.frames[source.spine],element=epubElementAt(source.spine,source.element);
      const range=domRangeForOffsets(element,source.char||0,Math.min(element.textContent.length,(source.char||0)+1));
      return frame.getBoundingClientRect().top+(range.getClientRects()[0]||element.getBoundingClientRect()).top;
    };
    window.qaFrames=(count=3)=>new Promise(resolve=>{
      const next=()=>count-- ? requestAnimationFrame(next) : resolve(); next();
    });
  });

  const longParagraph=Array.from({length:140},(_,i)=>`word${i} keeps the exact reading place stable`).join(' ');
  await page.locator('#fileinput').setInputFiles({name:'panel-anchor.txt',mimeType:'text/plain',
    buffer:Buffer.from(`${longParagraph}\n\n${longParagraph}\n\n${longParagraph}`)});
  await page.waitForFunction(()=>books.some(book=>book.kind==='txt'));
  await page.evaluate(()=>openBook(books.find(book=>book.kind==='txt')));
  await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>100);
  await page.evaluate(()=>readerScrollTo(900));
  await page.evaluate(()=>qaFrames());

  const textOpen=await page.evaluate(async()=>{
    const node=[...document.querySelectorAll('#rtext .w')].find(item=>{
      const rect=item.getBoundingClientRect(); return rect.top>250&&rect.top<650;
    });
    const anchor=captureReaderPanelAnchor(node,0),before=anchor.screenY;
    openWord(node.dataset.w,node); await qaFrames();
    return {before,after:qaAnchorY(anchor),restores:qaPanelMetrics.restores};
  });
  assert.ok(Math.abs(textOpen.after-textOpen.before)<2,`Text open drifted ${textOpen.after-textOpen.before}px`);
  assert.equal(textOpen.restores,1,'Text open did not use exactly one restoration');

  const panelOnly=await page.evaluate(async()=>{
    document.getElementById('panel').scrollTop=200;
    const moved=readerPanelSession.userMoved;
    closePanel(); await qaFrames();
    return {moved};
  });
  assert.equal(panelOnly.moved,false,'Dictionary scrolling was counted as reader movement');
  // The close result is checked with a fresh exact source because the session intentionally ends.
  const textClose=await page.evaluate(async()=>{
    const node=[...document.querySelectorAll('#rtext .w')].find(item=>item.getBoundingClientRect().top>250);
    const anchor=captureReaderPanelAnchor(node,0); openWord(node.dataset.w,node); await qaFrames();
    closePanel(); await qaFrames(); return {before:anchor.screenY,after:qaAnchorY(anchor)};
  });
  assert.ok(Math.abs(textClose.after-textClose.before)<2,`Text close drifted ${textClose.after-textClose.before}px`);

  const userScroll=await page.evaluate(async()=>{
    const node=[...document.querySelectorAll('#rtext .w')].find(item=>item.getBoundingClientRect().top>250);
    openWord(node.dataset.w,node); await qaFrames();
    readerScroller().scrollTop+=520; await qaFrames();
    const moved=readerPanelSession.userMoved;
    const anchor=textPanelAnchorAt(readerPanelReferenceY());
    closePanel(); await qaFrames();
    return {moved,before:anchor.screenY,after:qaAnchorY(anchor)};
  });
  assert.equal(userScroll.moved,true,'Actual reader scrolling was not recorded');
  assert.ok(Math.abs(userScroll.after-userScroll.before)<2,`Scrolled close drifted ${userScroll.after-userScroll.before}px`);

  const newest=await page.evaluate(async()=>{
    const visible=[...document.querySelectorAll('#rtext .w')].filter(item=>{
      const rect=item.getBoundingClientRect();return rect.top>180&&rect.bottom<720;
    });
    openWord(visible[0].dataset.w,visible[0]); await qaFrames();
    const latest=visible.at(-1),anchor=captureReaderPanelAnchor(latest,0);
    selectWord(latest.dataset.w,latest);
    closePanel(); await qaFrames();
    return {before:anchor.screenY,after:qaAnchorY(anchor)};
  });
  assert.ok(Math.abs(newest.after-newest.before)<2,`Latest selection drifted ${newest.after-newest.before}px`);

  const rapid=await page.evaluate(async()=>{
    const node=[...document.querySelectorAll('#rtext .w')].find(item=>item.getBoundingClientRect().top>220);
    const anchor=captureReaderPanelAnchor(node,0),start=qaPanelMetrics.restores;
    openWord(node.dataset.w,node); closePanel(); await qaFrames(5);
    return {before:anchor.screenY,after:qaAnchorY(anchor),restores:qaPanelMetrics.restores-start};
  });
  assert.ok(Math.abs(rapid.after-rapid.before)<2,`Rapid open/close drifted ${rapid.after-rapid.before}px`);
  assert.ok(rapid.restores<=1,`Rapid open/close restored ${rapid.restores} times`);

  const metrics=await page.evaluate(()=>qaPanelMetrics);
  assert.ok(Math.max(...metrics.durations)<50,`A Text restoration took ${Math.max(...metrics.durations).toFixed(1)}ms`);
  const pdfRestoresStart=metrics.restores;

  await page.locator('#fileinput').setInputFiles({name:'panel-anchor.pdf',mimeType:'application/pdf',buffer:fixturePdf()});
  await page.waitForFunction(()=>books.some(book=>book.kind==='pdf'));
  await page.evaluate(async()=>{
    await openBook(books.find(book=>book.kind==='pdf'));
    await switchReaderMode('original');
  });
  await page.waitForFunction(()=>originalSession?.kind==='pdf'&&originalSession.settled.size>0);
  const pdfTap=await page.evaluate(async()=>{
    await restorePdfAnchor({page:8,y:.42},readerPanelReferenceY());
    setOriginalZoom(2); await qaFrames(5);
    let chosen=null;
    for(const page of originalSession.pages){
      const rect=page.getBoundingClientRect();
      for(const box of originalSession.wordBoxes.get(+page.dataset.page)||[]){
        const x=rect.left+(box.x+box.w/2)*rect.width;
        const y=rect.top+(box.y+box.h/2)*rect.height;
        if(x>40&&x<1240&&y>180&&y<700){chosen={page,box};break;}
      }
      if(chosen) break;
    }
    if(!chosen) return null;
    const rect=chosen.page.getBoundingClientRect();
    return {x:rect.left+(chosen.box.x+chosen.box.w/2)*rect.width,
      y:rect.top+(chosen.box.y+chosen.box.h/2)*rect.height};
  });
  assert.ok(pdfTap,'The zoomed PDF fixture had no visible word');
  await page.mouse.click(pdfTap.x,pdfTap.y);
  await page.waitForFunction(()=>wordPanelOpen()&&readerPanelSession);
  await page.waitForFunction(()=>readerPanelChange===null);
  await page.evaluate(()=>qaFrames(5));
  const pdfOpen=await page.evaluate(()=>{
    const anchor={...readerPanelSession.anchor,source:{...readerPanelSession.anchor.source}};
    return {target:anchor.screenY,openY:qaAnchorY(anchor),source:anchor.source};
  });
  const controlsLayout=await page.evaluate(()=>{
    const reader=document.getElementById('readmain').getBoundingClientRect();
    const panel=document.getElementById('panel').getBoundingClientRect();
    const chrome=document.getElementById('readchrome').getBoundingClientRect();
    const pill=document.getElementById('readpill').getBoundingClientRect();
    return {reader:{left:reader.left,right:reader.right,width:reader.width},
      panel:{left:panel.left,right:panel.right},chrome:{left:chrome.left,right:chrome.right},
      pillCenter:pill.left+pill.width/2,readerCenter:reader.left+reader.width/2};
  });
  assert.ok(controlsLayout.chrome.right<=controlsLayout.reader.right+.5,
    `Reader controls escaped the remaining Reader area: ${JSON.stringify(controlsLayout)}`);
  assert.ok(controlsLayout.reader.right<=controlsLayout.panel.left+.5,
    `Reader controls overlap the dictionary panel: ${JSON.stringify(controlsLayout)}`);
  assert.ok(Math.abs(controlsLayout.pillCenter-controlsLayout.readerCenter)<1,
    `Reader controls are centered on the viewport instead of the Reader: ${JSON.stringify(controlsLayout)}`);

  await page.locator('#aafab').click();
  assert.equal(await page.locator('#aa-pdfzoom').isVisible(),true,
    'PDF button zoom disappeared while the side panel was open');
  await page.locator('#pdfzoom-in').click();
  await page.locator('#pdfzoom-in').click();
  await page.locator('#pdfzoom-out').click();
  await page.evaluate(()=>closeAa());
  const speechBefore=await page.evaluate(()=>({paper:originalZoom(),viewport:visualViewport.scale}));
  await page.locator('#p-speak').click({clickCount:4,delay:18});
  const speechAfter=await page.evaluate(()=>({paper:originalZoom(),viewport:visualViewport.scale}));
  assert.deepEqual(speechAfter,speechBefore,
    'Rapid pronunciation taps escaped the control and changed a zoom owner');
  const pdfBeforeClose=await page.evaluate(()=>{
    const anchor={...readerPanelSession.anchor,source:{...readerPanelSession.anchor.source}};
    return {anchor,target:anchor.screenY,zoom:originalZoom()};
  });
  await page.locator('#p-close').click();
  await page.evaluate(()=>qaFrames(5));
  const pdfResult=await page.evaluate(before=>({...before,closedY:qaAnchorY(before.anchor)}),pdfBeforeClose);
  assert.equal(pdfResult.zoom,2.5,'PDF panel button zoom did not retain the active zoom');
  assert.ok(Math.abs(pdfOpen.openY-pdfOpen.target)<3,`Zoomed PDF open drifted ${pdfOpen.openY-pdfOpen.target}px (${JSON.stringify(pdfOpen)})`);
  assert.ok(Math.abs(pdfResult.closedY-pdfResult.target)<3,`Zoomed PDF close drifted ${pdfResult.closedY-pdfResult.target}px (${JSON.stringify(pdfResult)})`);
  const pdfMetrics=await page.evaluate(()=>qaPanelMetrics);
  assert.equal(pdfMetrics.restores-pdfRestoresStart,2,
    'PDF panel open/close performed more than one anchor restore per layout change');
  assert.ok(Math.max(...pdfMetrics.durations)<100,
    `A panel restoration took ${Math.max(...pdfMetrics.durations).toFixed(1)}ms`);

  await page.locator('#fileinput').setInputFiles(resolve(root,'assets/classics/alice-in-wonderland.epub'));
  await page.waitForFunction(()=>books.some(book=>book.kind==='epub'));
  await page.evaluate(async()=>{
    await openBook(books.find(book=>book.kind==='epub'));
    await switchReaderMode('original');
  });
  await page.waitForFunction(()=>originalSession?.kind==='epub'&&originalSession.frames.some(frame=>frame?.contentDocument?.body));
  const epubResult=await page.evaluate(async()=>{
    let chosen=null;
    for(let spine=0;spine<originalSession.frames.length&&!chosen;spine++){
      const frame=originalSession.frames[spine],doc=frame&&frame.contentDocument;
      if(!doc) continue;
      for(const element of doc.querySelectorAll('[data-breeze-ei]')){
        const walker=doc.createTreeWalker(element,NodeFilter.SHOW_TEXT);let node;
        while((node=walker.nextNode())){
          const match=/[A-Za-z]{3,}/.exec(node.data||'');
          if(match){chosen={spine,element,node,start:match.index,raw:match[0]};break;}
        }
        if(chosen) break;
      }
    }
    if(!chosen) return null;
    const char=textOffsetInBlock(chosen.element,chosen.node,chosen.start);
    await restoreEpubAnchor({kind:'epub',spine:chosen.spine,
      href:chosen.element.ownerDocument.defaultView.frameElement.closest('.epub-source-chapter').dataset.href||'',
      element:+chosen.element.dataset.breezeEi,char},260);
    await qaFrames(5);
    const range=chosen.element.ownerDocument.createRange();
    range.setStart(chosen.node,chosen.start);range.setEnd(chosen.node,chosen.start+chosen.raw.length);
    const rect=range.getClientRects()[0];
    openOriginalRange(chosen.element.ownerDocument,range,chosen.raw,chosen.node.parentElement,rect);
    await qaFrames(6);
    const anchor={...readerPanelSession.anchor,source:{...readerPanelSession.anchor.source}};
    const openY=qaAnchorY(anchor);
    closePanel(); await qaFrames(6);
    return {target:anchor.screenY,openY,closedY:qaAnchorY(anchor),char:anchor.source.char};
  });
  assert.ok(epubResult,'The EPUB fixture had no indexed text');
  assert.ok(Number.isFinite(epubResult.char),'The EPUB panel anchor lost its character offset');
  assert.ok(Math.abs(epubResult.openY-epubResult.target)<3,`EPUB open drifted ${epubResult.openY-epubResult.target}px`);
  assert.ok(Math.abs(epubResult.closedY-epubResult.target)<3,`EPUB close drifted ${epubResult.closedY-epubResult.target}px`);

  const preferences=readFileSync(resolve(root,'scripts/ui/preferences.js'),'utf8');
  const native=readFileSync(resolve(root,'ios/App/App/SceneDelegate.swift'),'utf8');
  const index=readFileSync(resolve(root,'index.html'),'utf8');
  const main=readFileSync(resolve(root,'scripts/main.js'),'utf8');
  const base=readFileSync(resolve(root,'styles/base.css'),'utf8');
  const launch=readFileSync(resolve(root,'ios/App/App/Base.lproj/LaunchScreen.storyboard'),'utf8');
  assert.match(preferences,/breezeSpeech[\s\S]*postMessage\(\{command:'speak'/,
    'iOS speech is not routed through the native bridge');
  assert.match(native,/setCategory\([\s\S]*\.playback[\s\S]*\.default[\s\S]*options:\s*\[\.duckOthers\]/,
    'Native speech does not opt into audible playback');
  assert.doesNotMatch(native,/options:\s*\[[^\]]*\.(?:allowAirPlay|allowBluetooth|allowBluetoothA2DP|defaultToSpeaker)/,
    'Playback must not explicitly request additional routing options');
  for(const stage of ['bridge-received','audio-session-category','audio-session-activate','voice-selection','speak-called','delegate-didStart','delegate-didStart-timeout'])
    assert.match(native,new RegExp(stage),`Native speech diagnostics lost the ${stage} stage`);
  assert.match(preferences,/__breezeLastNativeSpeechDiagnostic[\s\S]*bridge-postMessage/,
    'The web bridge no longer retains actionable native speech diagnostics');
  for(const field of ['errorDomain','errorCode','audioSession','CFBundleShortVersionString','CFBundleVersion'])
    assert.match(native,new RegExp(field),`Native speech diagnostics lost ${field}`);
  assert.match(preferences,/window\.prompt\([\s\S]*nativeSpeechDiagnosticText/,
    'Physical-device speech diagnostics are no longer visible or copyable');
  assert.match(preferences,/__breezeLastNativeSpeechEvent[\s\S]*if\(detail\.state==='error'\)[\s\S]*__breezeLastNativeSpeechDiagnostic/,
    'Successful speech events can overwrite the retained last error');
  assert.match(native,/guard activeSpeechGeneration == generation[\s\S]*delegate-didStart-stale/,
    'A stale didStart callback can cancel the active generation deadline');
  assert.match(native,/stopSpeaking\(at: \.immediate\)/,
    'Repeated taps can still queue native utterances');
  assert.match(native,/willResignActiveNotification/,
    'Backgrounding can leave stale speech state alive');
  assert.doesNotMatch(index,/id="splash"|data-native-splash-preload/,
    'The branded startup splash is still present');
  assert.doesNotMatch(main,/nativeSplash|splashSceneReady|hideSplash/,
    'Startup still waits for or dismisses a branded splash');
  assert.doesNotMatch(base,/#splash|scene-breathe/,
    'Branded splash styling is still shipped');
  assert.match(launch,/red="0\.9803921569" green="0\.9725490196" blue="0\.9490196078"/,
    'The mandatory iOS launch surface no longer matches the light paper background');

  console.log(`Panel anchor regression verified (Text/PDF+button zoom/EPUB; PDF restores=${pdfMetrics.restores-pdfRestoresStart}, max=${Math.max(...pdfMetrics.durations).toFixed(1)}ms); native speech contract verified`);
}finally{
  await browser.close();
  await new Promise(done=>server.close(done));
}
