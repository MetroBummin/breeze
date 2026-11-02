/* 2026-11-01 pen changes in real PDF.js / IndexedDB / SVG: tool strip and
   undo group, 필압 on/off and persistence, 삐침 removal, textured pencils.
   Synthetic stylus Touch objects with `force` are NOT Apple Pencil proof. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from './helpers/bounded-playwright.mjs';
import {pdfGeometryFixture} from './helpers/pdf-geometry-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html'};
const server=createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);
 const p=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!p.startsWith(root)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',mime[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}
 catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}`;
const proof=process.env.BREEZE_QA_OUTPUT;
try{
 for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
  const profile=mkdtempSync(resolve(tmpdir(),'breeze-pen-'));
  const context=await engine.launchPersistentContext(profile,{headless:true,executablePath:process.env.BREEZE_BROWSER_EXECUTABLE,viewport:{width:820,height:1180},hasTouch:true,serviceWorkers:'block'});
  try{
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
   await page.addInitScript(()=>{window.breezeInkIPad=true;window.webkit={messageHandlers:{breezeInkScope:{postMessage(){}}}};});
   await page.goto(url);
   await page.locator('#fileinput').setInputFiles({name:'Pen-feel.pdf',mimeType:'application/pdf',buffer:pdfGeometryFixture()});
   const open=async()=>{
    await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));
    await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});
    await page.waitForSelector('.pdf-source-page .pdf-ink-layer');await page.waitForTimeout(600);
   };
   await open();
   const saved=()=>page.waitForFunction(()=>document.querySelector('#pdf-ink-status [role=status]').textContent==='저장됨');
   const mode=async m=>{
    await page.evaluate(()=>expandReaderChrome());
    if(await page.locator('[data-ink-toggle]').getAttribute('aria-pressed')!=='true')await page.locator('[data-ink-toggle]').click();
    const button=page.locator(`[data-ink-mode="${m}"]`);
    if(await button.getAttribute('aria-pressed')!=='true')await button.click();
   };
   const openSettings=async tool=>{
    await mode(tool);const button=page.locator(`[data-ink-mode="${tool}"]`);
    if(await button.getAttribute('aria-expanded')!=='true')await button.click();
    await page.locator(`#pdf-ink-settings [data-ink-panel="${tool}"]`).waitFor({state:'visible'});
   };
   const closeSettings=async()=>{if(await page.locator('#pdf-ink-settings').isVisible())await page.keyboard.press('Escape');};
   // samples: [x,y,force] in page fractions; the lift carries force 0 like WebKit.
   const stroke=async samples=>page.evaluate(samples=>{
    const element=originalSession.pages[0],rect=element.getBoundingClientRect(),target=element.querySelector('canvas');
    const touch=([x,y,force])=>({identifier:1,target,clientX:rect.left+x*rect.width,clientY:rect.top+y*rect.height,touchType:'stylus',force});
    const send=(name,touches,changed)=>{const event=new Event(name,{bubbles:true,cancelable:true});
     Object.defineProperties(event,{touches:{value:touches},changedTouches:{value:changed}});target.dispatchEvent(event);};
    const first=touch(samples[0]);
    target.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'pen',isPrimary:true,clientX:first.clientX,clientY:first.clientY}));
    send('touchstart',[first],[first]);
    let last=first;for(const s of samples.slice(1)){last=touch(s);send('touchmove',[last],[last]);}
    send('touchend',[],[{...last,force:0}]);
    target.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'pen',isPrimary:true}));
   },samples);
   const storedStrokes=()=>page.evaluate(async()=>(await BreezePdfInkStore.read(JSON.stringify([originalSession.hash,1])))?.strokes||[]);
   const layer='[data-page="1"] .pdf-ink-layer';
   const line=(y,forces,from=.2,to=.8)=>Array.from({length:forces.length},(_,i)=>[from+(to-from)*i/(forces.length-1),y,forces[i]]);

   // Thickness in screen pixels at the light and heavy halves of a stroke,
   // counting only pixels the ink darkened (the PDF text is in the blank shot).
   const shotLine=async y=>(await page.screenshot({clip:await page.evaluate(y=>{const r=originalSession.pages[0].getBoundingClientRect();return {x:Math.round(r.left+.2*r.width),y:Math.round(r.top+y*r.height-14),width:Math.round(.6*r.width),height:28};},y)})).toString('base64');
   const thickness=(blank,marked)=>page.evaluate(async([blank,marked])=>{
    const decode=async b64=>{const image=await createImageBitmap(new Blob([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],{type:'image/png'}));
     const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);
     return {w:c.width,h:c.height,d:x.getImageData(0,0,c.width,c.height).data};};
    const a=await decode(blank),b=await decode(marked);
    const column=i=>{let n=0;for(let y=0;y<a.h;y++){const k=(y*a.w+i)*4;if(a.d[k]-b.d[k]>60||a.d[k+1]-b.d[k+1]>60)n++;}return n;};
    const avg=(from,to)=>{let s=0;for(let i=from;i<to;i++)s+=column(i);return s/(to-from);};
    return {light:avg(Math.round(a.w*.12),Math.round(a.w*.32)),heavy:avg(Math.round(a.w*.68),Math.round(a.w*.88))};
   },[blank,marked]);
   // 1. Toolbar: tools scroll in their own strip; undo/redo stay fixed after a divider.
   await mode('pen');
   for(const theme of ['light','dark'])for(const viewport of [{width:390,height:844},{width:820,height:1180},{width:1180,height:820},{width:1440,height:900},{width:820,height:560}]){
    await page.setViewportSize(viewport);await page.evaluate(theme=>{darkMode=theme==='dark';applyDark();expandReaderChrome();},theme);
    await page.waitForTimeout(350);
    const bar=await page.evaluate(()=>{
     const tools=document.getElementById('pdf-ink-tools'),strip=tools.querySelector('.ink-pill-tools'),history=tools.querySelector('.ink-pill-history');
     const divider=tools.querySelector('.ink-pill-history-separator'),box=n=>n.getBoundingClientRect().toJSON(),css=getComputedStyle;
     const before=box(history);strip.scrollLeft=strip.scrollWidth;
     const after=box(history),toggle=box(document.querySelector('[data-ink-toggle]'));
     const result={children:[...tools.children].map(n=>n.className),
      stripTools:[...strip.querySelectorAll('button')].map(b=>b.dataset.inkMode),
      historyButtons:[...history.querySelectorAll('button')].map(b=>b.hasAttribute('data-ink-undo')?'undo':b.hasAttribute('data-ink-redo')?'redo':'?'),
      stripOverflow:css(strip).overflowX,historyOverflow:css(history).overflowX,barOverflow:css(tools).overflowX,
      scrollable:strip.scrollWidth>strip.clientWidth,scrolled:strip.scrollLeft,barScroll:tools.scrollLeft,
      before,after,strip:box(strip),divider:box(divider),dividerDisplay:css(divider).display,dividerColor:css(divider).backgroundColor,
      dividerContrast:(()=>{ // WCAG contrast of the line against the pill's solid glass colour.
       const c=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
       const glass=css(document.body).getPropertyValue('--sentence-glass-solid').trim();
       const rgb=(...layers)=>{for(const value of layers){c.fillStyle=value;c.fillRect(0,0,1,1);}return [...c.getImageData(0,0,1,1).data.slice(0,3)];};
       const lum=v=>{const [r,g,b]=v.map(x=>{x/=255;return x<=.03928?x/12.92:((x+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;};
       const a=lum(rgb(glass,css(divider).backgroundColor)),b=lum(rgb(glass));
       return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);})(),dividerShadow:css(divider).boxShadow,
      targets:[...tools.querySelectorAll('.ink-pill-control')].every(b=>Math.round(b.getBoundingClientRect().width)===44&&Math.round(b.getBoundingClientRect().height)===44),
      bar:box(tools),
      toggle,toggleVisible:css(document.querySelector('[data-ink-toggle]')).visibility==='visible',screen:{w:innerWidth,h:innerHeight}};
     strip.scrollLeft=0;return result;
    });
    const label=`${engine.name()} ${theme} ${viewport.width}x${viewport.height}`;
    assert.deepEqual(bar.children,['ink-pill-tools','ink-pill-separator ink-pill-history-separator','ink-pill-history'],label);
    assert.deepEqual(bar.stripTools,['pen','highlighter','erase'],label);
    assert.deepEqual(bar.historyButtons,['undo','redo'],label);
    assert.equal(bar.stripOverflow,'auto',`${label}: tools strip scrolls horizontally`);
    assert.equal(bar.historyOverflow,'visible');assert.notEqual(bar.barOverflow,'auto',`${label}: the toolbar itself never scrolls`);
    assert.equal(bar.barScroll,0);
    assert.notEqual(bar.dividerDisplay,'none');assert.ok(bar.divider.width<=2&&bar.divider.height>=16,`${label}: thin vertical divider ${JSON.stringify(bar.divider)}`);
    assert.notEqual(bar.dividerColor,'rgba(0, 0, 0, 0)');
    assert.ok(bar.dividerContrast>=2.5,`${label}: divider reads against the glass (contrast ${bar.dividerContrast.toFixed(2)})`);
    assert.notEqual(bar.dividerShadow,'none',`${label}: divider has a soft backing over page text`);
    assert.ok(bar.divider.left>=bar.strip.right-1&&bar.divider.right<=bar.before.left+1,`${label}: divider sits between tools and history`);
    assert.deepEqual(bar.after,bar.before,`${label}: scrolling the tools leaves undo/redo in place`);
    assert.ok(bar.targets,`${label}: 44px targets`);
    assert.ok(bar.before.left>=bar.bar.left-1&&bar.before.right<=bar.bar.right+1,`${label}: undo/redo are never clipped ${JSON.stringify({history:bar.before,bar:bar.bar})}`);
    assert.ok(bar.toggleVisible&&bar.toggle.left>=0&&bar.toggle.right<=bar.screen.w+1,`${label}: reading-mode button stays visible`);
    if(viewport.width<=390&&bar.scrollable){assert.ok(bar.scrolled>0,`${label}: narrow pill scrolls its tools`);}
    if(proof){mkdirSync(proof,{recursive:true});await page.screenshot({path:resolve(proof,`pen-toolbar-${engine.name()}-${theme}-${viewport.width}x${viewport.height}.png`)});}
   }
   await page.setViewportSize({width:820,height:1180});await page.evaluate(()=>{darkMode=false;applyDark();expandReaderChrome();});await page.waitForTimeout(300);

   // 2. 필압 off (default): constant-width polyline, no stored pressure.
   await openSettings('pen');
   assert.equal(await page.locator('[data-ink-panel="pen"] [data-ink-pressure]').getAttribute('aria-pressed'),'false','필압 defaults off');
   assert.equal(await page.locator('[data-ink-panel="pen"] .ink-pressure-levels').isVisible(),false);
   assert.equal(await page.locator('[data-ink-panel="pen"] [data-ink-end]').getAttribute('aria-pressed'),'false','끝 다듬기 defaults off');
   await page.locator('#pdf-ink-settings [data-ink-width="3"]').click();await closeSettings();
   const blank30=await shotLine(.3);
   await stroke(line(.3,[.1,.1,.1,.1,.1,.9,.9,.9,.9,.9]));await saved();
   let strokes=await storedStrokes();
   assert.equal(strokes.length,1);assert.equal('pressure' in strokes[0],false,'off stores no pressure');
   assert.equal(await page.locator(`${layer} polyline`).count(),1);
   assert.equal(await page.locator(`${layer} polyline`).getAttribute('stroke-width'),'3');

   const constant=await thickness(blank30,await shotLine(.3));
   assert.ok(Math.abs(constant.heavy-constant.light)<=1,`off: constant width ${JSON.stringify(constant)}`);

   // 3. 필압 on: width follows force; the preference persists across reload.
   await openSettings('pen');await page.locator('[data-ink-panel="pen"] [data-ink-pressure]').click();
   assert.equal(await page.locator('[data-ink-panel="pen"] [data-ink-pressure]').getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('[data-ink-panel="pen"] .ink-pressure-levels').isVisible(),true);
   await page.locator('[data-ink-panel="pen"] [data-ink-pressure-level="strong"]').click();await closeSettings();
   const prefs=await page.evaluate(()=>JSON.parse(localStorage.getItem('__breeze_pdf_ink_tools_v1__')));
   assert.equal(prefs.pressure,true);assert.equal(prefs.pressureLevel,'strong');assert.equal(prefs.width,3);assert.equal(prefs.endTrim,false);
   const blank45=await shotLine(.45);
   await stroke(line(.45,Array.from({length:40},(_,i)=>i<14?.08:.95)));await saved();
   strokes=await storedStrokes();const pressured=strokes.at(-1);
   assert.equal(pressured.pressure.length,pressured.points.length);
   assert.ok(Math.max(...pressured.pressure)-Math.min(...pressured.pressure)>0.3,JSON.stringify(pressured.pressure));
   assert.equal(await page.locator(`${layer} path[data-ink-tool="pen"]`).count(),1,'pressure pen is one filled outline');
   const varied=await thickness(blank45,await shotLine(.45));
   assert.ok(varied.heavy>varied.light*1.6,`on: width varies with force ${JSON.stringify(varied)}`);
   const outline=await page.locator(`${layer} path[data-ink-tool="pen"]`).getAttribute('d');
   await page.reload();await open();
   assert.equal(await page.locator(`${layer} path[data-ink-tool="pen"]`).getAttribute('d'),outline,'pressure outline reloads exactly');
   assert.equal(await page.locator(`${layer} polyline`).count(),1,'the earlier constant stroke is unchanged');
   await openSettings('pen');
   assert.equal(await page.locator('[data-ink-panel="pen"] [data-ink-pressure]').getAttribute('aria-pressed'),'true','pen: 필압 persisted');
   assert.equal(await page.locator('[data-ink-panel="pen"] [data-ink-pressure-level="strong"]').getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('[data-ink-panel="pen"] [data-ink-end]').getAttribute('aria-pressed'),'false');
   await closeSettings();
   assert.equal(await page.locator('[data-ink-mode="pencil"]').count(),0,'the pencil tool is not in the toolbar');

   // 4. 끝 다듬기 off keeps the lift flick. On, the same flick is dropped.
   await mode('pen');
   const geometry=await page.evaluate(()=>{const r=originalSession.pages[0].getBoundingClientRect();return {w:r.width,h:r.height,vw:originalSession.pages[0].querySelector('.pdf-ink-layer').viewBox.baseVal.width,vh:originalSession.pages[0].querySelector('.pdf-ink-layer').viewBox.baseVal.height};});
   const px=(x,y)=>[x/geometry.w,y/geometry.h];
   const base=[.25*geometry.w,.6*geometry.h];
   const hooked=[[...px(...base),.4],[...px(base[0]+.7,base[1]-.6),.95],[...px(base[0]-.5,base[1]+.5),.4],[...px(base[0]+.3,base[1]+.2),.4]];
   for(let i=1;i<=20;i++)hooked.push([...px(base[0]+i*6,base[1]),.4]);
   hooked.push([...px(base[0]+138,base[1]-16),.05]);
   const before=(await storedStrokes()).length;
   await stroke(hooked);await saved();
   strokes=await storedStrokes();assert.equal(strokes.length,before+1);
   const scaleY=geometry.vh/geometry.h,scaleX=geometry.vw/geometry.w,y0=base[1]*scaleY,x0=base[0]*scaleX;
   const kept=strokes.at(-1);
   assert.ok(kept.points.at(-1)[0]>x0+120*scaleX,'off: the flick stays in the stroke');
   await openSettings('pen');await page.locator('[data-ink-panel="pen"] [data-ink-end]').click();await closeSettings();
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('__breeze_pdf_ink_tools_v1__')).endTrim),true);
   await page.reload();await open();
   await openSettings('pen');
   assert.equal(await page.locator('[data-ink-panel="pen"] [data-ink-end]').getAttribute('aria-pressed'),'true','끝 다듬기 persisted');
   await closeSettings();await mode('pen');
   await stroke(hooked);await saved();
   strokes=await storedStrokes();
   const tail=strokes.at(-1);
   assert.ok(Math.abs(tail.points[0][0]-x0)<.01&&Math.abs(tail.points[0][1]-y0)<.01,'starts where the pen landed');
   assert.ok(tail.points.every(([,y])=>Math.abs(y-y0)<.05),`no hook: ${JSON.stringify(tail.points.map(p=>p.map(v=>Math.round(v*100)/100)))}`);
   assert.ok(tail.points.at(-1)[0]<=x0+120*scaleX+.01,'the flick is dropped');
   assert.ok(Math.max(...tail.pressure)-Math.min(...tail.pressure)<.03,`down/up pressure spikes ignored ${JSON.stringify(tail.pressure)}`);

   // A saved pencil stroke still paints, as a solid line, after reload.
   await page.evaluate(async()=>{
    const key=JSON.stringify([originalSession.hash,1]);
    const data=await BreezePdfInkStore.read(key);
    data.strokes.push({id:crypto.randomUUID(),tool:'pencil',color:'#3b3b3b',width:2,points:[[40,500],[320,500]]});
    await BreezePdfInkStore.write(key,data);
   });
   await page.reload();await open();
   const keptPencil=page.locator(`${layer} polyline[data-ink-tool="pencil"]`);
   assert.equal(await keptPencil.count(),1);
   assert.equal(await keptPencil.getAttribute('stroke'),'#3b3b3b');
   assert.equal(await keptPencil.getAttribute('stroke-width'),'2');
   await page.evaluate(()=>localStorage.setItem('__breeze_pdf_ink_tools_v1__',JSON.stringify({tool:'pencil',pencilColor:'#1f1f1f',pencilWidth:1,color:'#111111',width:1.5,eraserRadius:8,highlightColor:'#91df80',highlightWidth:12,highlightOpacity:0.3,pressure:true,pressureLevel:'strong',endTrim:false})));
   await page.reload();await open();
   if(await page.locator('[data-ink-toggle]').getAttribute('aria-pressed')!=='true')await page.locator('[data-ink-toggle]').click();
   assert.equal(await page.locator('[data-ink-mode="pen"]').getAttribute('aria-pressed'),'true','a saved pencil choice opens the pen');
   assert.equal(await page.locator('[data-ink-mode="pencil"]').count(),0);

   // Highlighter and eraser stay at the selected PDF-unit size with 필압 on.
   await openSettings('highlighter');await page.locator('[data-ink-highlight-width="12"]').click();await closeSettings();
   const scale=await page.evaluate(()=>{const s=document.querySelector('[data-page="1"] .pdf-ink-layer');return s.getBoundingClientRect().width/s.viewBox.baseVal.width;});
   const band=async y=>(await page.screenshot({clip:await page.evaluate(y=>{const r=originalSession.pages[0].getBoundingClientRect();return {x:Math.round(r.left+.2*r.width),y:Math.round(r.top+y*r.height-20),width:Math.round(.5*r.width),height:40};},y)})).toString('base64');
   const pale=(blank,marked)=>page.evaluate(async([blank,marked])=>{
    const decode=async b64=>{const image=await createImageBitmap(new Blob([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],{type:'image/png'}));
     const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);return {w:c.width,h:c.height,d:x.getImageData(0,0,c.width,c.height).data};};
    const a=await decode(blank),b=await decode(marked);
    const col=i=>{let n=0;for(let y=0;y<a.h;y++){const k=(y*a.w+i)*4;const d=Math.abs(a.d[k]-b.d[k])+Math.abs(a.d[k+1]-b.d[k+1])+Math.abs(a.d[k+2]-b.d[k+2]);if(d>18)n++;}return n;};
    let s=0,c=0;for(let i=Math.round(a.w*.15);i<Math.round(a.w*.85);i++){s+=col(i);c++;}return s/c;
   },[blank,marked]);
   const blankHi=await band(.05);
   await mode('highlighter');await stroke(line(.05,Array(14).fill(.2),.25,.75));await saved();
   const hi=await page.locator(`${layer} [data-ink-tool="highlighter"] polyline`).last();
   assert.equal(await hi.getAttribute('stroke-width'),'12');
   assert.equal((await storedStrokes()).at(-1).tool,'highlighter');
   assert.equal('pressure' in (await storedStrokes()).at(-1),false);
   const hiPx=await pale(blankHi,await band(.05));
   assert.ok(Math.abs(hiPx-12*scale)<=Math.max(3,12*scale*0.22),`highlighter 12 paints ${hiPx.toFixed(1)}px, scale ${scale.toFixed(2)} → ${(12*scale).toFixed(1)}`);
   await openSettings('erase');
   assert.equal(await page.locator('[data-ink-radius="8"]').getAttribute('aria-pressed'),'true','the saved medium eraser radius is still 8');
   await closeSettings();
   assert.deepEqual(errors.filter(x=>!x.includes('ResizeObserver loop')),[]);
   console.log(`${engine.name()}: PASS tool strip without pencil, 필압 off constant / on varying, saved pencil stroke still draws, highlighter width`);
  }finally{await context.close();rmSync(profile,{recursive:true,force:true});}
 }
}finally{server.close();}
