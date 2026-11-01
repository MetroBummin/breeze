/* PDF pen annotation. No finger drawing or export.
   Linked-book sync lives in ink-sync.js and stays idle during a stroke.
   Native iPad draws from WebKit stylus Touch input as soon as it arrives;
   UIKit only keeps the Pencil out of scrolling and stops momentum. Native
   Android PointerEvent runtimes use pen pointers and cancel their companion
   Touch defaults. SVG stays display-only; fingers retain the existing PDF scroller.
   Synthetic browser tests do not establish Android hardware acceptance. */
const BreezePdfInk = (()=>{
  const colors=['#111111','#2864c5','#c43d3d','#15803d','#7c3aed','#c2410c'], widths=[0.75,1.5,3];
  const eraserRadii=[4,8,16],highlightColors=['#ffe34d','#91df80','#2dd4bf','#38bdf8','#f472b6','#a78bfa'],highlightWidths=[12,20],highlightOpacity=0.3;
  // Textured pencils (2026-11-01). Their stored strokes carry tool:'pencil' or
  // tool:'colored-pencil'; the smooth pen above is unchanged.
  const pencilColors=['#3b3b3b','#1f1f1f','#2f5fa8','#b03a3a'],pencilWidths=[1,2,3.5];
  const coloredPencilColors=['#d64545','#e8853a','#e6c229','#3f9b4f','#3a7bd5','#8a5cc7','#d6619a','#7a5230'],coloredPencilWidths=[1.5,3,5];
  const tools=['pen','pencil','colored-pencil','highlighter','erase'],pencilTools=['pencil','colored-pencil'];
  // 필압 sensitivity: gain around the middle of the sqrt pressure curve.
  const pressureGains={soft:0.5,normal:1,strong:1.6};
  const preferenceKey='__breeze_pdf_ink_tools_v1__';
  const undoStack=[],redoStack=[];
  let color=colors[0],width=widths[1],eraserRadius=eraserRadii[1];
  let highlightColor=highlightColors[0],highlightWidth=highlightWidths[0],lastTool='pen';
  let pencilColor=pencilColors[0],pencilWidth=pencilWidths[1],coloredPencilColor=coloredPencilColors[0],coloredPencilWidth=coloredPencilWidths[1];
  // Off by default: off is exactly the constant-width pen people already use.
  let pressureOn=false,pressureLevel='normal';
  try{
    const prefs=JSON.parse(localStorage.getItem(preferenceKey)||'null');
    if(prefs){
      if(colors.includes(prefs.color))color=prefs.color;
      if(widths.includes(prefs.width))width=prefs.width;
      if(eraserRadii.includes(prefs.eraserRadius))eraserRadius=prefs.eraserRadius;
      if(highlightColors.includes(prefs.highlightColor))highlightColor=prefs.highlightColor;
      if(highlightWidths.includes(prefs.highlightWidth))highlightWidth=prefs.highlightWidth;
      if(pencilColors.includes(prefs.pencilColor))pencilColor=prefs.pencilColor;
      if(pencilWidths.includes(prefs.pencilWidth))pencilWidth=prefs.pencilWidth;
      if(coloredPencilColors.includes(prefs.coloredPencilColor))coloredPencilColor=prefs.coloredPencilColor;
      if(coloredPencilWidths.includes(prefs.coloredPencilWidth))coloredPencilWidth=prefs.coloredPencilWidth;
      if(typeof prefs.pressure==='boolean')pressureOn=prefs.pressure;
      if(Object.hasOwn(pressureGains,prefs.pressureLevel))pressureLevel=prefs.pressureLevel;
      if(tools.includes(prefs.tool))lastTool=prefs.tool;
    }
  }catch{} // Tool preferences never block reading or loading existing ink.
  function savePreferences(){
    try{localStorage.setItem(preferenceKey,JSON.stringify({tool:lastTool,color,width,eraserRadius,highlightColor,highlightWidth,highlightOpacity,
      pencilColor,pencilWidth,coloredPencilColor,coloredPencilWidth,pressure:pressureOn,pressureLevel}));}catch{}
  }
  const toolColor=tool=>tool==='highlighter'?highlightColor:tool==='pencil'?pencilColor:tool==='colored-pencil'?coloredPencilColor:color;
  const toolWidth=tool=>tool==='highlighter'?highlightWidth:tool==='pencil'?pencilWidth:tool==='colored-pencil'?coloredPencilWidth:width;
  // Raw contact force (0..1) -> stored effective pressure. sqrt spreads the
  // light range where writing actually happens; the gain sets sensitivity.
  function pressureMap(gain){return force=>0.5+(Math.sqrt(force)-0.5)*gain;}
  /* Paper grain for the pencils: one small periodic noise field, turned into
     one colored tile per tool/coverage level/color the first time it is used,
     then reused by every stroke on every page as an SVG pattern anchored to
     page coordinates. Strokes over the same place hit the same grain, so
     repeated strokes build up darker while the paper's low spots stay light. */
  const grainSize=64,grainUnits=24,grainPatterns=new Map();
  // Soft 4B look: each level has a dense floor of coverage, and the grain only
  // takes a little off it, more at light pressure. Partial opacity keeps
  // overlap building up darker.
  const grainLevels={pencil:{threshold:[0.6,0.45,0.3],soft:0.5,floor:[0.55,0.76,0.87],opacity:[0.78,0.86,0.92]},
    'colored-pencil':{threshold:[0.55,0.4,0.25],soft:0.5,floor:[0.58,0.78,0.88],opacity:[0.82,0.88,0.94]}};
  let grainField=null,grainDefs=null;
  function grainNoise(){
    if(grainField)return grainField;
    const field=new Float32Array(grainSize*grainSize);let seed=0x2f6b1d3;
    const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
    for(const [cells,weight] of [[8,0.35],[16,0.4],[32,0.25]]){ // soft tooth, no per-texel speckle
      const lattice=Array.from({length:cells*cells},random);
      const value=(x,y)=>lattice[(y%cells)*cells+(x%cells)];
      for(let y=0;y<grainSize;y++)for(let x=0;x<grainSize;x++){
        const gx=x*cells/grainSize,gy=y*cells/grainSize,x0=Math.floor(gx),y0=Math.floor(gy);
        const sx=(gx-x0)*(gx-x0)*(3-2*(gx-x0)),sy=(gy-y0)*(gy-y0)*(3-2*(gy-y0));
        const top=value(x0,y0)+(value(x0+1,y0)-value(x0,y0))*sx,bottom=value(x0,y0+1)+(value(x0+1,y0+1)-value(x0,y0+1))*sx;
        field[y*grainSize+x]+=weight*(top+(bottom-top)*sy);
      }
    }
    let min=Infinity,max=-Infinity;for(const v of field){min=Math.min(min,v);max=Math.max(max,v);}
    for(let i=0;i<field.length;i++)field[i]=(field[i]-min)/(max-min||1);
    return grainField=field;
  }
  function grainPattern(tool,level,ink){
    const key=tool+'|'+level+'|'+ink;
    if(grainPatterns.has(key))return grainPatterns.get(key);
    let id=null;
    try{
      if(typeof document.createElement!=='function')throw new Error('no canvas');
      const canvas=document.createElement('canvas');canvas.width=canvas.height=grainSize;
      const context=canvas.getContext('2d'),image=context.createImageData(grainSize,grainSize),field=grainNoise(),style=grainLevels[tool];
      const rgb=[1,3,5].map(i=>parseInt(ink.slice(i,i+2),16)),threshold=style.threshold[level];
      for(let i=0;i<field.length;i++){
        const t=Math.max(0,Math.min(1,(field[i]-threshold)/style.soft)),floor=style.floor[level];
        const coverage=floor+(1-floor)*t*t*(3-2*t);
        image.data.set([...rgb,Math.round(255*coverage)],i*4);
      }
      context.putImageData(image,0,0);
      if(!grainDefs){
        grainDefs=document.createElementNS(ns,'svg');grainDefs.id='pdf-ink-defs';
        grainDefs.setAttribute('aria-hidden','true');grainDefs.setAttribute('width','0');grainDefs.setAttribute('height','0');
        grainDefs.setAttribute('style','position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
        grainDefs.append(document.createElementNS(ns,'defs'));document.body.append(grainDefs);
      }
      const pattern=document.createElementNS(ns,'pattern'),tile=document.createElementNS(ns,'image');
      id=`pdf-ink-grain-${tool}-${level}-${ink.slice(1)}`;
      pattern.id=id;pattern.setAttribute('patternUnits','userSpaceOnUse');
      pattern.setAttribute('width',String(grainUnits));pattern.setAttribute('height',String(grainUnits));
      tile.setAttribute('href',canvas.toDataURL('image/png'));tile.setAttribute('width',String(grainUnits));
      tile.setAttribute('height',String(grainUnits));tile.setAttribute('preserveAspectRatio','none');
      pattern.append(tile);grainDefs.firstChild.append(pattern);
    }catch{id=null;} // No canvas: plain translucent color, same geometry.
    grainPatterns.set(key,id);return id;
  }
  const ns='http://www.w3.org/2000/svg';
  const pages=new Map(); // Loaded pages only; dirty failures survive document closure.
  let session=null, mode='read', active=null, toolbar=null, status=null;
  let inkTools=null,inkEntry=null,inkMini=null,inkReadSeparator=null;
  let settings=null,settingsTool=null;
  const suppressed=new Set(), blockedPointers=new Set();
  let suppressClick=false, paperPenPointer=null;
  const finger=t=>t.touchType!=='stylus' && !suppressed.has(t.identifier);
  const onPaper=target=>target?.closest?.('.pdf-source-page') && !target.closest('button,input,select,textarea');
  const nativeIPad=()=>Reflect.get(window,'breezeInkIPad')===true;
  const nativeAndroid=()=>{
    try{return window.Capacitor?.isNativePlatform?.()===true && window.Capacitor?.getPlatform?.()==='android';}
    catch{return false;}
  };
  let androidTablet=false; // Pending/missing native classification is read-only.
  // Capability detection, never a screen-width or user-agent guess. TouchEvent
  // cancellation is required to keep pen drawing from becoming native panning;
  // canceling pointerdown alone cannot prevent that browser default action.
  const pointerInk=()=>!nativeIPad() && typeof window.PointerEvent==='function'
    && typeof window.TouchEvent==='function' && window.navigator?.maxTouchPoints>0 && 'onscrollend' in document;
  // A tablet may have no pen. Only the pen input adapter can create ink; native
  // device classification controls availability independently of pen connection.
  const supported=()=>nativeIPad()||(nativeAndroid()&&androidTablet&&pointerInk());
  const penPointers=new Set(),fingerPointers=new Set();
  let pointerScrolling=false;
  const visible=()=>supported() && session===originalSession && session?.kind==='pdf'
    && document.body.classList.contains('reader-original') && document.body.classList.contains('reading');
  // Explicit native DEBUG flag only. No text, document bytes, or stored ink in logs.
  const traceRows=[],stateTraceRows=[];
  let traceSequence=0;
  function trace(route,event,reason){
    if(Reflect.get(window,'breezePdfStateDebug')===true &&
        (route.startsWith('start/')||route==='stroke/start'||route==='stroke/end'||route==='stroke/cancel'||route==='move/noncancelable-commit')){
      stateTraceRows.push({at:performance.now(),route,reason,type:event?.type,cancelable:event?.cancelable,
        live:Array.from(event?.touches||[],t=>({id:t.identifier,type:t.touchType})),
        active:active?.id??null,suppressed:[...suppressed]});
      if(stateTraceRows.length>40)stateTraceRows.shift();
    }
    if(Reflect.get(window,'breezeInkDebug')!==true || !visible())return;
    const box=readerScroller();
    const contacts=list=>Array.from(list||[],t=>({id:t.identifier,type:t.touchType,
      x:t.clientX,y:t.clientY,paper:!!onPaper(t.target)}));
    traceRows.push({seq:++traceSequence,ms:performance.now(),route,event:event?.type,
      cancelable:event?.cancelable,defaultPrevented:event?.defaultPrevented,
      touches:contacts(event?.touches),changed:contacts(event?.changedTouches),
      pointer:event?.pointerId,pointerType:event?.pointerType,
      suppressed:[...suppressed],blockedPointers:[...blockedPointers],
      active:active?{id:active.id,tool:active.tool,points:active.stroke.points.length,
        start:active.stroke.points[0],bounds:active.state.element?.getBoundingClientRect().toJSON()}:null,
      tool:mode,pan:originalPinchPan,pinch:!!originalPinch,
      pinchTouches:originalPinchTouches,contacts:originalPdfContacts,
      top:box?.scrollTop,left:box?.scrollLeft,
      transform:originalZoomLayer()?.style.transform});
    if(traceRows.length>4000)traceRows.splice(0,traceRows.length-4000);
  }
  function flushTrace(){
    if(Reflect.get(window,'breezeInkDebug')!==true || !traceRows.length)return;
    const bridge=Reflect.get(window,'webkit')?.messageHandlers?.breezeInkTrace;
    if(bridge){bridge.postMessage({rows:traceRows});traceRows.length=0;}
  }
  if(Reflect.get(window,'breezeInkDebug')===true){
    for(const type of ['touchstart','touchmove','touchend','touchcancel','gesturestart','gesturechange','contextmenu','selectstart','dragstart'])
      window.addEventListener(type,event=>queueMicrotask(()=>{
        trace('dispatch/final',event);
        if(type==='touchend'||type==='touchcancel')flushTrace();
      }),{capture:true,passive:true});
  }
  let scopeFrame=0, lastScope='';
  function invalidatePageScope(){if(typeof invalidatePdfPageLayout==='function')invalidatePdfPageLayout(session||originalSession);}
  function scopeControlVisible(element){
    if(!element.getClientRects().length||element.closest('[inert]'))return false;
    // Collapsed/fading controls can still have a layout rectangle. They must
    // not veto a Pencil contact on the paper underneath them.
    for(let node=element;node instanceof Element;node=node.parentElement){
      const style=getComputedStyle(node);
      if(style.visibility==='hidden'||style.display==='none'||Number(style.opacity)===0)return false;
    }
    return getComputedStyle(element).pointerEvents!=='none';
  }
  function publishNativeScope(){
    if(scopeFrame)cancelAnimationFrame(scopeFrame);
    scopeFrame=0;
    const bridge=Reflect.get(window,'webkit')?.messageHandlers?.breezeInkScope;
    if(!bridge)return;
    const enabled=!!visible()&&mode!=='read'&&!document.hidden, box=readerScroller();
    let scope={enabled};
    if(enabled&&box){
      if(originalPinchBusy()&&!(typeof originalPinchReturn!=='undefined'&&originalPinchReturn))return;
      // The elastic return exposes committed pdfPageLayout coordinates, so a
      // fresh native Pencil admission must already see the released zoom.
      const outer=box.getBoundingClientRect();
      const bounds=element=>{
        const r=element.getBoundingClientRect();return [r.x,r.y,r.width,r.height];
      };
      const excluded=Array.from(document.querySelectorAll('button,input,select,textarea,[role="dialog"],#pdf-ink-tools,#readpill,#ink-dock-puck,#word-modal-scrim,#sentence-scrim,#aa-pop'))
        .filter(scopeControlVisible)
        .map(bounds);
      const layout=pdfPageLayout(session);
      if(!layout)return;
      scope={enabled,viewport:document.documentElement.clientWidth,box:bounds(box),scrollHeight:box.scrollHeight,excluded,pages:layout.rects};
    }
    const json=JSON.stringify(scope);
    if(json!==lastScope){lastScope=json;bridge.postMessage(scope);}
  }
  function scheduleNativeScope(){
    if(!scopeFrame && Reflect.get(window,'webkit')?.messageHandlers?.breezeInkScope)
      scopeFrame=requestAnimationFrame(publishNativeScope);
  }
  // Cache only stable paper geometry, not a frame captured during a CSS
  // transition. Ancestor layout changes matter even when scrollHeight/zoom do
  // not change. Dirty the cache during pinch too; read it after commitment.
  new MutationObserver(records=>{
    let refresh=false;
    for(const record of records){
      const node=record.target;
      if(!(node instanceof Element)||node.closest('.pdf-ink-layer'))continue;
      // DOMTokenList can report a mutation even when removing an absent class.
      // Same-value attributes cannot change paper geometry or native exclusions.
      if(record.type==='attributes'&&record.attributeName&&record.oldValue===node.getAttribute(record.attributeName))continue;
      const bodyLayout=node===document.body&&(record.attributeName!=='class'||record.oldValue==null
        ||['reading','reader-original'].some(name=>(' '+record.oldValue+' ').includes(' '+name+' ')!==node.classList.contains(name)));
      const layout=bodyLayout||node===document.documentElement
        ||node.matches('#v-read,#originalwrap,#original-stage,#original-content,#original-zoom,.pdf-source-page');
      // Canvas/marker insertion does not change paper layout. Aspect ratio,
      // ancestor sizing and page-list changes do.
      if(layout&&(record.type!=='childList'||node.matches('#original-content')))invalidatePageScope();
      if(node===document.body||layout||node.closest('#v-read,#readchrome')
          ||node.matches('[role=dialog],dialog,#word-modal-scrim,#sentence-scrim,#aa-pop'))refresh=true;
    }
    if(refresh)scheduleNativeScope();
  }).observe(document.documentElement,
    {subtree:true,childList:true,attributes:true,attributeOldValue:true,attributeFilter:['class','style','hidden','inert']});
  window.addEventListener('resize',()=>{invalidatePageScope();scheduleNativeScope();});
  document.addEventListener('visibilitychange',()=>{invalidatePageScope();publishNativeScope();});
  // getBoundingClientRect during a CSS transition is an intermediate snapshot.
  // Publish once more after layout settles; do not scan all pages per frame.
  for(const type of ['transitionend','transitioncancel'])document.addEventListener(type,event=>{
    const target=event.target;
    if(target instanceof Element&&(target===document.body||target===document.documentElement
        ||target.closest('#v-read,#readchrome'))){
      if(!target.closest('#readchrome'))invalidatePageScope();
      scheduleNativeScope();
    }
  },true);
  const keyFor=(s,n)=>JSON.stringify([s.hash,n]); // Existing SHA-256 of original bytes.
  const stop=e=>{if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();};
  function message(text){if(status) status.textContent=text;}
  function update(){
    scheduleNativeScope();
    const pill=document.getElementById('readpill');
    if(!pill||!inkEntry)return;
    const ready=!!visible(),writing=ready&&mode!=='read';
    pill.classList.toggle('ink-pill-ready',ready);
    pill.classList.toggle('ink-pill-active',writing);
    if(writing&&typeof setReaderChrome==='function')setReaderChrome(false);
    inkEntry.hidden=!ready;
    const undoSetting=document.getElementById('ink-two-finger-undo-row');
    if(undoSetting)undoSetting.hidden=!writing;
    inkEntry.setAttribute('aria-pressed',String(writing));
    inkEntry.setAttribute('aria-label',writing?'읽기 모드로 전환':'필기 모드로 전환');
    inkEntry.title=writing?'읽기 모드로 전환':'필기 모드로 전환';
    inkEntry.classList.toggle('ink-pill-exiting',writing);
    inkTools.inert=!writing;
    inkTools.setAttribute('aria-hidden',String(!writing));
    inkMini.hidden=!writing;
    inkMini.querySelector('.ink-pill-mini-color').style.background=toolColor(mode);
    inkTools.querySelectorAll('[data-ink-mode]').forEach(button=>{
      button.setAttribute('aria-pressed',String(button.dataset.inkMode===mode));
    });
    if(!writing||document.body.classList.contains('chrome-hidden'))settingsTool=null;
    updateSettings();updateHistoryControls();
    for(const id of ['modefab','readpill-title'])document.getElementById(id).inert=writing;
    toolbar.hidden=!ready;
    if(!ready)cancel();
  }
  function updateHistoryControls(){
    if(!inkTools)return;
    const writing=!!visible()&&mode!=='read';
    for(const [name,stack] of [['undo',undoStack],['redo',redoStack]]){
      const button=inkTools.querySelector(`[data-ink-${name}]`),disabled=!writing||!stack.length||!!active;
      if(button.disabled!==disabled)button.disabled=disabled;
    }
  }
  const toolLabels={pen:'펜',pencil:'연필','colored-pencil':'색연필',highlighter:'형광펜',erase:'지우개'};
  // Each settings choice: its row, button dataset key, current value and setter.
  const optionKinds={
    color:{row:'.ink-colors',label:'펜 색상',get:()=>color,set:v=>{color=v;}},
    width:{row:'.ink-widths',label:'펜 두께',get:()=>width,set:v=>{width=v;},size:v=>v*1.6},
    pencilColor:{row:'.ink-pencil-colors',label:'연필 색상',get:()=>pencilColor,set:v=>{pencilColor=v;}},
    pencilWidth:{row:'.ink-pencil-widths',label:'연필 두께',get:()=>pencilWidth,set:v=>{pencilWidth=v;},size:v=>v*1.6},
    coloredPencilColor:{row:'.ink-colored-pencil-colors',label:'색연필 색상',get:()=>coloredPencilColor,set:v=>{coloredPencilColor=v;}},
    coloredPencilWidth:{row:'.ink-colored-pencil-widths',label:'색연필 두께',get:()=>coloredPencilWidth,set:v=>{coloredPencilWidth=v;},size:v=>v*1.2},
    highlightColor:{row:'.ink-highlight-colors',label:'형광펜 색상',get:()=>highlightColor,set:v=>{highlightColor=v;}},
    highlightWidth:{row:'.ink-highlight-widths',label:'형광펜 두께',get:()=>highlightWidth,set:v=>{highlightWidth=v;},size:v=>v*0.5},
    radius:{row:'.ink-radii',label:'지우개 크기',get:()=>eraserRadius,set:v=>{eraserRadius=v;}}
  };
  const datasetKey=kind=>`ink${kind[0].toUpperCase()+kind.slice(1)}`;
  function updateSettings(){
    if(!settings)return;
    settings.hidden=!settingsTool;
    if(settingsTool&&typeof positionPdfInkSettings==='function')positionPdfInkSettings();
    settings.setAttribute('aria-label',`${toolLabels[settingsTool]||'펜'} 설정`);
    settings.querySelectorAll('[data-ink-panel]').forEach(panel=>{panel.hidden=panel.dataset.inkPanel!==settingsTool;});
    for(const [kind,option] of Object.entries(optionKinds)){
      const key=datasetKey(kind),value=String(option.get());
      settings.querySelectorAll(`${option.row} button`).forEach(button=>button.setAttribute('aria-pressed',String(button.dataset[key]===value)));
    }
    settings.querySelectorAll('[data-ink-pressure]').forEach(button=>{button.classList.toggle('on',pressureOn);button.setAttribute('aria-pressed',String(pressureOn));});
    settings.querySelectorAll('.ink-pressure-levels').forEach(row=>{row.hidden=!pressureOn;});
    settings.querySelectorAll('[data-ink-pressure-level]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.inkPressureLevel===pressureLevel)));
    inkTools.querySelectorAll('[data-ink-mode]').forEach(button=>button.setAttribute('aria-expanded',String(button.dataset.inkMode===settingsTool)));
  }
  function closeSettings(){if(settingsTool){settingsTool=null;updateSettings();}}
  function selectTool(tool){
    if(mode!==tool){
      settingsTool=null;
      setMode(tool);
    }else{
      settingsTool=settingsTool===tool?null:tool;
      updateSettings();
      const row=settingsTool&&settings.querySelector(`[data-ink-panel="${tool}"] .ink-setting-row`);
      const selected=row?.querySelector('[aria-pressed="true"]');
      if(selected&&tool!=='erase')row.scrollLeft=Math.max(0,selected.offsetLeft-row.offsetLeft-(row.clientWidth-selected.offsetWidth)/2);
    }
  }
  function icon(path){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;}
  function inkControl(label,path,className=''){
    const button=document.createElement('button');button.type='button';
    button.className=`ink-pill-control ${className}`.trim();
    button.setAttribute('aria-label',label);button.title=label;button.innerHTML=icon(path);
    return button;
  }
  function inkSeparator(){
    const separator=document.createElement('span');separator.className='ink-pill-separator';
    separator.setAttribute('role','separator');separator.setAttribute('aria-orientation','vertical');
    separator.setAttribute('aria-hidden','true');return separator;
  }
  function controls(){
    if(inkEntry)return;
    const pencil='M15.15 3.9 20.05 8.8M13.85 5.2 8.35 10.7 5.55 16.75 7.25 18.45 13.3 15.55 18.8 10.05M9.7 12.05l2.45 2.45M6.35 17.55 4.25 19.65';
    const readBook='M10.7 7.3 5.6 6.1A1.35 1.35 0 0 0 4.3 7.4v9.2a1.35 1.35 0 0 0 1.3 1.3l5.1-1.2M13.3 7.3l5.1-1.2a1.35 1.35 0 0 1 1.3 1.3v9.2a1.35 1.35 0 0 1-1.3 1.3l-5.1-1.2M12 5.1v13.8';
    const pill=document.getElementById('readpill');
    inkEntry=inkControl('필기 모드로 전환',pencil,'ink-pill-entry');
    inkEntry.innerHTML=`<span class="ink-entry-pen">${icon(pencil)}</span><span class="ink-entry-read">${icon(readBook)}</span>`;
    inkEntry.dataset.inkToggle='';
    inkEntry.onclick=()=>setMode(mode==='read'?lastTool:'read');
    inkTools=document.createElement('div');inkTools.id='pdf-ink-tools';inkTools.className='ink-pill-toolbar';inkTools.setAttribute('role','group');inkTools.setAttribute('aria-label','PDF 필기 도구');
    // Drawing tools scroll sideways when the pill is narrow. Undo/redo stay
    // fixed in their own group after a thin divider.
    const strip=document.createElement('div');strip.className='ink-pill-tools';strip.setAttribute('role','group');strip.setAttribute('aria-label','그리기 도구');
    for(const [tool,path] of [
      ['pen',pencil],
      ['pencil','M5.2 18.8 6.6 14 15.3 5.3a2 2 0 0 1 2.9 0l.5.5a2 2 0 0 1 0 2.9L10 17.4l-4.8 1.4ZM6.6 14l3.4 3.4M13.9 6.7l3.4 3.4M5.2 18.8l1.1-.3'],
      ['colored-pencil','M8.6 14.6 9.6 11 16.7 3.9a1.8 1.8 0 0 1 2.5 2.5L12.1 13.5l-3.5 1.1ZM9.6 11l2.5 2.5M3.5 20.2c1.8-1.4 3.2 1.4 5 0s3.2 1.4 5 0 3.2 1.4 5 0'],
      ['highlighter','m9 14 7-10 5 4-8 9-4-3Zm0 0-4 5 4 1 4-3M3 22h13'],
      ['erase','M7.2 20.4 3.8 17a2 2 0 0 1 0-2.8l9.8-9.8a2 2 0 0 1 2.8 0l3.8 3.8a2 2 0 0 1 0 2.8l-9.4 9.4H7.2ZM8.7 10.7l6.1 6.1M7.2 20.4H21']
    ]){
      const button=inkControl(toolLabels[tool],path);button.dataset.inkMode=tool;
      button.onclick=()=>selectTool(tool);strip.append(button);
    }
    const historyGroup=document.createElement('div');historyGroup.className='ink-pill-history';historyGroup.setAttribute('role','group');historyGroup.setAttribute('aria-label','실행 취소와 다시 실행');
    for(const [label,path] of [
      ['실행 취소','M9 5 4 10l5 5M4 10h9a6 6 0 0 1 0 12'],
      ['다시 실행','m15 5 5 5-5 5m5-5h-9a6 6 0 0 0 0 12']
    ]){
      const button=inkControl(label,path),undo=label==='실행 취소';
      button.setAttribute(undo?'data-ink-undo':'data-ink-redo','');button.onclick=()=>history(undo);
      button.disabled=true;historyGroup.append(button);
    }
    const historySeparator=inkSeparator();historySeparator.classList.add('ink-pill-history-separator');
    inkTools.append(strip,historySeparator,historyGroup);
    inkReadSeparator=inkSeparator();inkReadSeparator.classList.add('ink-pill-mode-separator');
    inkMini=document.createElement('button');inkMini.type='button';inkMini.className='ink-pill-mini';
    inkMini.setAttribute('aria-label','필기 도구 펼치기');inkMini.title='필기 도구 펼치기';
    inkMini.innerHTML=`${icon(pencil)}<i class="ink-pill-mini-color" aria-hidden="true"></i>`;
    inkMini.onclick=()=>expandReaderChrome();
    pill.append(inkTools,inkReadSeparator,inkEntry,inkMini);
    settings=document.createElement('div');settings.id='pdf-ink-settings';settings.className='control-glass';settings.hidden=true;
    settings.setAttribute('role','dialog');
    // 필압 is one setting shared by the pen and both pencils.
    const pressureBlock='<div class="ink-undo-setting ink-pressure-setting"><span>필압</span><button type="button" class="ink-pressure-switch" data-ink-pressure aria-label="필압" aria-pressed="false"><i aria-hidden="true"></i></button></div>'
      +'<div class="ink-setting-row ink-pressure-levels" role="group" aria-label="필압 세기">'
      +[['soft','약'],['normal','보통'],['strong','강']].map(([level,label])=>`<button type="button" data-ink-pressure-level="${level}" aria-label="필압 세기: ${label}">${label}</button>`).join('')+'</div>';
    const drawPanel=(tool,prefix,label)=>`<div data-ink-panel="${tool}" hidden><div class="ink-setting-row ink-colors-row ${prefix}-colors" role="group" aria-label="${label} 색상"></div><div class="ink-setting-label">두께</div><div class="ink-setting-row ink-widths-row ${prefix}-widths" role="group" aria-label="${label} 두께"></div>${pressureBlock}</div>`;
    settings.innerHTML=drawPanel('pen','ink','펜').replace(' hidden>','>')+drawPanel('pencil','ink-pencil','연필')+drawPanel('colored-pencil','ink-colored-pencil','색연필')
      +'<div data-ink-panel="erase" hidden><div class="ink-setting-label">지우개 크기</div><div class="ink-setting-row ink-radii" role="group" aria-label="지우개 크기"></div><div class="ink-undo-setting" id="ink-two-finger-undo-row"><span>두 손가락 더블탭 실행 취소</span><button id="ink-two-finger-undo" type="button" aria-label="두 손가락 더블탭 실행 취소" aria-pressed="false"><i aria-hidden="true"></i></button></div></div>';
    settings.insertAdjacentHTML('beforeend','<div data-ink-panel="highlighter" hidden><div class="ink-setting-row ink-colors-row ink-highlight-colors" role="group" aria-label="형광펜 색상"></div><div class="ink-setting-label">두께</div><div class="ink-setting-row ink-widths-row ink-highlight-widths" role="group" aria-label="형광펜 두께"></div></div>');
    const options=(kind,values,labels)=>{
      const option=optionKinds[kind],row=settings.querySelector(option.row);
      values.forEach((value,i)=>{
        const button=document.createElement('button');button.type='button';button.dataset[datasetKey(kind)]=String(value);
        button.setAttribute('aria-label',option.label+': '+labels[i]);
        const swatch=kind.endsWith('Color')||kind==='color';
        button.innerHTML='<i aria-hidden="true"></i>'+(kind==='radius'?'<span>'+labels[i]+'</span>':'');
        button.style.setProperty('--ink-option',swatch?String(value):`${option.size?option.size(Number(value)):8+i*7}px`);
        button.onclick=()=>{cancel();option.set(swatch?String(value):Number(value));savePreferences();update();};
        row.append(button);
      });
    };
    options('color',colors,['검정','파랑','빨강','초록','보라','주황']);options('width',widths,['얇게','보통','굵게']);options('radius',eraserRadii,['작게','보통','크게']);
    options('pencilColor',pencilColors,['흑연','진한 흑연','파랑','빨강']);options('pencilWidth',pencilWidths,['얇게','보통','굵게']);
    options('coloredPencilColor',coloredPencilColors,['빨강','주황','노랑','초록','파랑','보라','분홍','갈색']);options('coloredPencilWidth',coloredPencilWidths,['얇게','보통','굵게']);
    options('highlightColor',highlightColors,['노랑','연두','민트','하늘','분홍','보라']);options('highlightWidth',highlightWidths,['보통','굵게']);
    settings.querySelectorAll('button[data-ink-pressure]').forEach(/** @param {HTMLElement} button */ button=>{button.onclick=()=>{cancel();pressureOn=!pressureOn;savePreferences();update();};});
    settings.querySelectorAll('button[data-ink-pressure-level]').forEach(/** @param {HTMLElement} button */ button=>{button.onclick=()=>{cancel();pressureLevel=button.dataset.inkPressureLevel;savePreferences();update();};});
    inkTools.querySelectorAll('[data-ink-mode]').forEach(button=>{button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',settings.id);});
    document.getElementById('readchrome').append(settings);
    document.getElementById('ink-two-finger-undo').onclick=toggleTwoFingerUndo;
    updateTwoFingerUndoSetting();
    document.addEventListener('pointerdown',event=>{if(event.target instanceof Element&&!event.target.closest('#pdf-ink-settings,#pdf-ink-tools'))closeSettings();},true);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&settingsTool){const tool=settingsTool;closeSettings();inkTools.querySelector(`[data-ink-mode="${tool}"]`).focus();event.preventDefault();}});
    toolbar=document.createElement('div');toolbar.id='pdf-ink-status';toolbar.hidden=true;
    status=document.createElement('span');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const retry=document.createElement('button');retry.type='button';retry.className='pdf-ink-retry';retry.textContent='저장 재시도';
    retry.onclick=()=>{for(const state of pages.values())if(state.dirty)void persist(state);};
    toolbar.append(status,retry);document.getElementById('readchrome').append(toolbar);
    new MutationObserver(records=>{
      if(toolbar.hidden===!!visible()||records.some(record=>record.oldValue==null||['reading','reader-original','chrome-hidden'].some(name=>
        (' '+record.oldValue+' ').includes(' '+name+' ')!==document.body.classList.contains(name))))update();
    }).observe(document.body,{attributes:true,attributeOldValue:true,attributeFilter:['class']});
  }
  function setMode(next){
    // Every activation (including restored lastTool and programmatic clicks)
    // passes the same gate as the toolbar before changing tool preferences.
    if(next!=='read'&&(!visible()||!tools.includes(next)))next='read';
    if(typeof cancelOriginalUndoTap==='function')cancelOriginalUndoTap();
    cancel();suppressed.clear();blockedPointers.clear();suppressClick=false;penPointers.clear();fingerPointers.clear(); mode=next;
    if(next!=='read'){lastTool=next;savePreferences();}
    if(next==='read')publishNativeScope();
    if(typeof cancelGesture==='function')cancelGesture('PDF ink mode');
    if(typeof closePanel==='function')closePanel();
    if(typeof closeSentence==='function')closeSentence();
    update();
    publishNativeScope();
  }
  async function read(key){
    return BreezePdfInkStore.read(key);
  }
  async function write(key,value){
    return BreezePdfInkStore.write(key,value);
  }
  function valid(data){
    const idOk=s=>s.id===undefined||(typeof s.id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.id));
    // Optional per-point pressure sits beside points, so a build that predates
    // it still reads the pen stroke and draws it at its constant width.
    const pressureOk=s=>s.pressure===undefined||(s.tool!=='highlighter'&&Array.isArray(s.pressure)&&s.pressure.length===s.points.length
      &&s.pressure.every(v=>typeof v==='number'&&v>=0&&v<=1));
    return data?.version===1 && Array.isArray(data.strokes) && data.strokes.every(s=>
      idOk(s)&&(s.tool==='highlighter' ? highlightColors.includes(s.color)&&highlightWidths.includes(s.width)&&s.opacity===highlightOpacity&&(s.strokeId===undefined||typeof s.strokeId==='string')
        : s.tool==='pencil' ? pencilColors.includes(s.color)&&pencilWidths.includes(s.width)&&s.opacity===undefined
        : s.tool==='colored-pencil' ? coloredPencilColors.includes(s.color)&&coloredPencilWidths.includes(s.width)&&s.opacity===undefined
        : (s.tool===undefined||s.tool==='pen')&&colors.includes(s.color)&&widths.includes(s.width)&&(s.opacity===undefined||s.opacity===1))
      && Array.isArray(s.points) && s.points.length>0
      && s.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)) && pressureOk(s));
  }
  function summary(){
    const dirty=[...pages.values()].filter(p=>p.dirty);
    const failed=dirty.some(p=>p.error);
    toolbar?.classList.toggle('ink-save-failed',failed);
    message(failed?'저장 실패 · 앱을 닫지 말고 재시도해 주세요':dirty.length?'저장 중…':'저장됨');
  }
  async function persist(state){
    // One writer per document/page, including close/reopen. A newer edit never
    // races an older transaction; an error keeps the latest state for retry.
    if(state.saving)return state.saving;
    state.saving=(async()=>{
      try{
        state.error=false;summary();
        while(state.dirty){
          const revision=state.revision;
          // Completed strokes are immutable; isolate only the mutable page array.
          // Only changed strokes cross to the writer's worker; full v1 page
          // serialization runs there. The acknowledgement means tx complete.
          const snapshot={version:1,strokes:state.strokes.slice()};
          await write(state.key,snapshot);
          if(revision===state.revision)state.dirty=false;
        }
      }catch(error){state.error=true;console.warn('PDF ink save failed',error);}
      finally{
        state.saving=null;summary();
        // Remote ink waits until this page is idle. Applying it starts another
        // save; the upload itself is scheduled only after a clean write.
        if(state.inkHeld&&!(active&&active.state===state)){
          state.strokes=state.inkHeld;state.inkHeld=null;paint(state);changed(state);return;
        }
        if(!state.error&&!state.dirty&&typeof scheduleBookInk==='function')scheduleBookInk(state);
        evict(state);
      }
    })();
    return state.saving;
  }
  function evict(state){if(!state.svg && !state.dirty && !state.saving && !state.loading){pages.delete(state.key);BreezePdfInkStore.release(state.key);}}
  function record(state,before){
    if(before.length===state.strokes.length && before.every((stroke,i)=>stroke===state.strokes[i]))return;
    // Immutable completed strokes are shared; history stores only page arrays,
    // never SVGs or PDF canvases. Bound retained edit history within this session.
    undoStack.push({key:state.key,before,after:state.strokes.slice()});
    if(undoStack.length>50)undoStack.shift();
    redoStack.length=0;updateHistoryControls();
  }
  function newState(key){
    return {key,strokes:[],revision:0,dirty:false,error:false,saving:null,loading:null,loaded:false,svg:null,element:null};
  }
  function history(undo){
    if(!visible()||mode==='read'||active)return;
    const source=undo?undoStack:redoStack,target=undo?redoStack:undoStack;
    const edit=source.pop();if(!edit)return;
    let state=pages.get(edit.key);
    // Do not race a page read that is already in flight. Retry after it settles.
    if(state?.loading){
      source.push(edit);const owner=session;
      void state.loading.then(()=>{if(session===owner&&source.at(-1)===edit)history(undo);},()=>{});return;
    }
    if(!state){state=newState(edit.key);state.loaded=true;pages.set(edit.key,state);}
    state.strokes=(undo?edit.before:edit.after).slice();
    target.push(edit);paint(state);changed(state);update();
  }
  function changed(state){state.revision++;state.dirty=true;void persist(state);}
  function reconcileInkChildren(parent,children){
    const keep=new Set(children);
    for(const child of [...parent.children])if(!keep.has(child))child.remove();
    let cursor=parent.firstChild;
    for(const child of children){
      if(child===cursor)cursor=cursor.nextSibling;
      else parent.insertBefore(child,cursor);
    }
  }
  function paint(state){
    if(!state.svg)return;
    // Immutable strokes keep both their path AND its attachment. An eraser
    // sample must not detach/repaint every unrelated stroke on the page.
    const previous=state.inkPaths||new Map(),next=new Map();
    const oldGroups=state.inkGroups||new Map(),groups=new Map(),pens=[];
    for(const stroke of state.strokes){
      let element=previous.get(stroke);
      if(!element){element=path(stroke);if(stroke.tool==='highlighter')element.setAttribute('opacity','1');}
      next.set(stroke,element);
      if(stroke.tool!=='highlighter'){pens.push(element);continue;} // Pen and pencils keep drawing order.
      const id=stroke.strokeId||stroke;
      let entry=groups.get(id);
      if(!entry){
        const group=oldGroups.get(id)||document.createElementNS(ns,'g');
        if(!oldGroups.has(id)){group.setAttribute('opacity',String(stroke.opacity));group.setAttribute('data-ink-tool','highlighter');}
        entry={group,children:[]};groups.set(id,entry);
      }
      entry.children.push(element);
    }
    for(const {group,children} of groups.values())reconcileInkChildren(group,children);
    const children=[...groups.values()].map(entry=>entry.group).concat(pens);
    if(active?.state===state&&active.preview)children.push(active.preview);
    reconcileInkChildren(state.svg,children);
    state.inkPaths=next;state.inkGroups=new Map([...groups].map(([id,entry])=>[id,entry.group]));
  }
  function pencilLevel(e,current){
    // Pressure picks one of three grain coverages, with hysteresis so a
    // steady hand does not flip between them.
    if(e==null)return 1;
    const edges=[0.36,0.68],base=e<edges[0]?0:e<edges[1]?1:2;
    if(current!=null&&base!==current&&Math.abs(e-edges[Math.min(base,current)])<0.05)return current;
    return base;
  }
  function pencilRuns(group,stroke){
    // One polyline per stretch of equal coverage; neighbours share a point.
    const runs=[];let current=null,lastText='';
    function run(level){
      const element=document.createElementNS(ns,'polyline'),pattern=grainPattern(stroke.tool,level,stroke.color);
      element.setAttribute('fill','none');element.setAttribute('stroke',pattern?`url(#${pattern})`:stroke.color);
      element.setAttribute('stroke-width',String(stroke.width));element.setAttribute('opacity',String(grainLevels[stroke.tool].opacity[level]));
      element.setAttribute('stroke-linecap','round');element.setAttribute('stroke-linejoin','round');
      group.append(element);
      current={level,text:lastText,element,shown:''};runs.push(current);
    }
    return {
      push(p,e){
        const level=pencilLevel(e,current?.level);
        if(!current||current.level!==level)run(level);
        const text=BreezeInkGeometry.svgPoint(p);
        current.text=current.text?current.text+' '+text:text;lastText=text;
      },
      show(extra=[],tipPressure){
        if(!current&&extra.length)run(pencilLevel(tipPressure,null));
        for(const item of runs){
          let text=item===current&&extra.length?item.text+' '+extra.map(BreezeInkGeometry.svgPoint).join(' '):item.text;
          text=text.trim();if(text&&!text.includes(' '))text=text+' '+text; // A tap is a round dot.
          if(item.shown!==text){item.shown=text;item.element.setAttribute('points',text);}
        }
      }
    };
  }
  function pencilGroup(stroke){
    const group=document.createElementNS(ns,'g');group.setAttribute('data-ink-tool',stroke.tool);
    return group;
  }
  function path(stroke){
    if(pencilTools.includes(stroke.tool)){
      const group=pencilGroup(stroke),runs=pencilRuns(group,stroke);
      stroke.points.forEach((p,i)=>runs.push(p,stroke.pressure?.[i]));
      runs.show();return group;
    }
    if(BreezeInkGeometry.pressured(stroke)){
      // Pressure pen: one filled outline whose width follows stored pressure.
      const element=document.createElementNS(ns,'path');
      element.setAttribute('d',BreezeInkGeometry.outlinePath(stroke));
      element.setAttribute('fill',stroke.color);element.setAttribute('data-ink-tool','pen');
      return element;
    }
    const element=document.createElementNS(ns,'polyline');
    // A repeated endpoint makes a Pencil tap a round dot.
    const points=stroke.points.length===1?[stroke.points[0],stroke.points[0]]:stroke.points;
    element.setAttribute('points',points.map(BreezeInkGeometry.svgPoint).join(' '));
    element.setAttribute('fill','none');element.setAttribute('stroke',stroke.color);
    element.setAttribute('stroke-width',String(stroke.width));
    element.setAttribute('data-ink-tool',stroke.tool||'pen');
    // Element opacity composites a whole stroke once: joins/self crossings do
    // not accumulate alpha as independently painted segments would.
    if(stroke.tool==='highlighter')element.setAttribute('opacity',String(stroke.opacity));
    element.setAttribute('stroke-linecap','round');element.setAttribute('stroke-linejoin','round');
    return element;
  }
  function point(touch,state,rect=state.element.getBoundingClientRect()){
    return [(touch.clientX-rect.left)/rect.width*state.width,(touch.clientY-rect.top)/rect.height*state.height];
  }
  function fragmentIdentities(stroke,parts){
    // A split retires the original stroke id. Each surviving fragment is its
    // own stroke so another device can union it. Highlighter fragments keep
    // the shared strokeId used for one opacity group.
    if(parts.length===1&&parts[0]===stroke)return parts;
    return parts.map(part=>({...part,id:crypto.randomUUID()}));
  }
  function erase(state,p,previous=p){
    let edited=false;
    const strokes=state.strokes.flatMap(stroke=>{
      const parts=fragmentIdentities(stroke,BreezeInkGeometry.eraseStroke(stroke,previous,p,eraserRadius));
      if(parts.length!==1||parts[0]!==stroke)edited=true;
      return parts;
    });
    // One eraser contact is one edit. Persist at lift/cancellation, rather than
    // structured-cloning and writing all fragments on every input sample.
    if(edited){state.strokes=strokes;state.revision++;state.dirty=true;paint(state);}
  }
  function showEraser(p){
    if(!active.preview){
      active.preview=document.createElementNS(ns,'circle');
      active.preview.classList.add('pdf-ink-eraser-cursor');
      active.preview.setAttribute('r',String(eraserRadius));
    }
    active.preview.setAttribute('cx',String(p[0]));active.preview.setAttribute('cy',String(p[1]));
    if(!active.preview.isConnected)active.state.svg.append(active.preview);
  }
  function cancel(reason='other'){
    if(active){
      trace('stroke/cancel',undefined,reason);
      const current=active;active=null;
      if(current.tool==='erase'){
        record(current.state,current.before);
        if(current.state.dirty)void persist(current.state);
      }
      paint(current.state);updateHistoryControls();
    }
    // Discard an interrupted unfinished stroke; completed edits already persist.
  }
  function consumeTouches(event){
    // Mixed events must reach the existing finger gesture. Its contact list is
    // filtered, rather than dispatching fabricated replacement events.
    const changed=Array.from(event.changedTouches);
    if(changed.length && changed.every(t=>suppressed.has(t.identifier))
        && !Array.from(event.touches).some(finger))stop(event);
  }
  function reconcileTouchOwner(event){
    // A fresh Touch list is evidence of which contacts still exist. Never
    // infer an end from elapsed time, motion, or a different Pointer ID.
    // Android geometry has a Pointer owner; its Touch IDs are unrelated.
    if(pointerInk())return;
    const live=new Set(Array.from(event.touches,t=>t.identifier));
    const retirePointer=id=>{
      if(id==null)return;
      blockedPointers.delete(id);
      if(paperPenPointer===id)paperPenPointer=null;
    };
    if(active&&!live.has(active.id)){
      const id=active.pointerId;
      cancel('touch-owner-no-longer-live');retirePointer(id);
    }
    for(const id of suppressed)if(!live.has(id))suppressed.delete(id);
  }
  function touchStart(event){
    if(!visible()||mode==='read')return;
    reconcileTouchOwner(event);
    const changed=Array.from(event.changedTouches);
    if(pointerInk()){
      // Pointer and Touch identifiers are unrelated. A pen pointer is delivered
      // before its companion touchstart; suppress new paper Touch contacts for
      // that contact's lifetime, without relabeling old finger contacts.
      if(penPointers.size)for(const t of changed)if(onPaper(t.target))suppressed.add(t.identifier);
      consumeTouches(event);
      // A companion Touch that cannot be prevented will pan with the pen.
      if(!event.cancelable&&active)cancel('noncancelable-touchstart');
      return; // Pointer events are the sole geometry/commit owner on this route.
    }
    for(const t of changed){
      if(onPaper(t.target) && (active || t.touchType==='stylus'))suppressed.add(t.identifier);
    }
    const pen=changed.find(t=>t.touchType==='stylus' && onPaper(t.target));
    if(pen&&typeof cancelOriginalUndoTap==='function')cancelOriginalUndoTap();
    // The pen wins over contacts already on the paper. iOS reports a palm as
    // a separate non-stylus Touch, so ink ignores it rather than the pen. A
    // noncancelable start means WebKit is already scrolling; that pan keeps
    // the paper and this contact never draws.
    const start=!!pen && !active && event.cancelable;
    if(start)for(const t of event.touches)if(onPaper(t.target))suppressed.add(t.identifier);
    consumeTouches(event);
    if(active || !pen){
      trace('start/no-new-stroke',event);return;
    }
    if(!start){
      trace('start/rejected',event);return;
    }
    beginStroke(pen,event);
  }
  function beginStroke(pen,event,pointerId=paperPenPointer){
    // A completed finger sequence cannot leave a stale pinch blocking Pencil.
    if(originalPinchBusy())cancelOriginalPinch();
    const element=pen.target.closest('.pdf-source-page');
    if(!ownsPdfPage(element,session))return;
    const state=pages.get(keyFor(session,Number(element.dataset.page)));
    if(!state?.svg || !state.loaded){trace('start/ink-not-ready',event);message('필기를 불러오는 중이에요. 다시 시도해 주세요');return;}
    cancelGesture('Pencil owns paper');
    closeSettings();
    const bounds=state.element.getBoundingClientRect(),p=point(pen,state,bounds);
    if(!p.every(Number.isFinite)||p[0]<0||p[1]<0||p[0]>state.width||p[1]>state.height)return;
    const stroke=mode==='highlighter'?{id:crypto.randomUUID(),tool:'highlighter',strokeId:crypto.randomUUID(),color:highlightColor,width:highlightWidth,opacity:highlightOpacity,points:[p]}
      :pencilTools.includes(mode)?{id:crypto.randomUUID(),tool:mode,color:toolColor(mode),width:toolWidth(mode),points:[p]}
      :{id:crypto.randomUUID(),color,width,points:[p]};
    // Pressure never applies to the highlighter. Thresholds are CSS pixels.
    const pressure=pressureOn&&mode!=='highlighter'&&mode!=='erase';
    active={id:pen.identifier,pointerId,state,bounds,tool:mode,before:state.strokes.slice(),stroke,
      preview:null,render:null,smoother:mode!=='erase'?BreezeInkGeometry.createSmoother(p,{unit:state.width/bounds.width,pressure,force:pen.force,map:pressureMap(pressureGains[pressureLevel])}):null};
    trace('stroke/start',event);
    updateHistoryControls();
    if(active.tool==='erase'){erase(state,p);showEraser(p);}
    else{
      livePreview(active,pressure);
      const pen=mode==='highlighter'?Array.from(state.svg.children).find(el=>el.getAttribute('data-ink-tool')!=='highlighter'):null;
      if(pen)state.svg.insertBefore(active.preview,pen);else state.svg.append(active.preview);
    }
  }
  function livePreview(current,pressure){
    // The tip always reaches the latest sample; only settled points are
    // serialized once, so a move costs the new tail rather than the stroke.
    const {stroke,smoother}=current;
    if(pencilTools.includes(stroke.tool)){
      const group=pencilGroup(stroke),runs=pencilRuns(group,stroke);let used=0;
      current.preview=group;
      current.render=()=>{
        const live=smoother.live();
        for(;used<live.points.length-1;used++)runs.push(live.points[used],live.pressures?.[used]);
        runs.show(live.points.slice(used).concat([live.tip]),live.tipPressure);
      };
    }else if(pressure&&stroke.tool!=='highlighter'){
      const element=document.createElementNS(ns,'path'),outline=BreezeInkGeometry.createOutline();let used=0;
      element.setAttribute('fill',stroke.color);element.setAttribute('data-ink-tool','pen');
      const radius=e=>stroke.width*BreezeInkGeometry.penWidthFactor(e??0.5)/2;
      current.preview=element;
      current.render=()=>{
        const live=smoother.live();
        for(;used<live.points.length-1;used++)outline.push(live.points[used],radius(live.pressures[used]));
        const extra=live.points.slice(used).map((p,i)=>[p,radius(live.pressures[used+i])]);
        extra.push([live.tip,radius(live.tipPressure)]);
        element.setAttribute('d',outline.text(extra));
      };
    }else{
      current.preview=path(stroke);
      current.render=()=>current.preview.setAttribute('points',smoother.svgPoints());
    }
    current.render();
  }
  function touchMove(event){
    reconcileTouchOwner(event);
    consumeTouches(event);
    // Native scrolling has taken over. Keep what was drawn; the contact stays
    // suppressed, so its later samples are ignored.
    if(pointerInk()){
      if(active&&!event.cancelable)finishStroke();
      return;
    }
    if(!active)return;
    const pen=Array.from(event.changedTouches).find(t=>t.identifier===active.id);
    if(!pen)return; // A moving/lifting palm cannot append or finish Pencil ink.
    if(!event.cancelable){trace('move/noncancelable-commit',event);finishStroke();return;}
    extendStroke(point(pen,active.state,active.bounds),event,pen.force);
  }
  function extendStroke(p,event,force){
    if(!p.every(Number.isFinite))return;
    const previous=active.stroke.points.at(-1);
    const size=[active.state.width,active.state.height];
    const exits=p.some((value,axis)=>value<0||value>size[axis]);
    if(exits){
      // A real Pencil can leave the paper while its Touch.target stays on the
      // starting canvas. Clip this segment; do not erase the whole stroke.
      let fraction=1;
      for(let axis=0;axis<2;axis++){
        if(p[axis]<0||p[axis]>size[axis]){
          const edge=p[axis]<0?0:size[axis];
          fraction=Math.min(fraction,(edge-previous[axis])/(p[axis]-previous[axis]));
        }
      }
      for(let axis=0;axis<2;axis++)p[axis]=Math.max(0,Math.min(size[axis],previous[axis]+(p[axis]-previous[axis])*fraction));
    }
    if(active.tool==='erase'){
      erase(active.state,p,previous);
      active.stroke.points=[p];
      showEraser(p);
    }else{
      active.stroke.points.push(p);
      active.smoother.add(p,force);
      active.render();
    }
    if(exits){trace('stroke/page-exit',event);finishStroke();}
    // The contact remains suppressed until lift, so crossing a gap or returning
    // onto paper cannot start another stroke or trigger Lookup.
  }
  function finishStroke(){
    const current=active,state=current.state;active=null;
    if(current.tool!=='erase'){
      current.stroke.points=current.smoother.finish();
      const pressure=current.smoother.pressures();
      if(pressure)current.stroke.pressure=pressure;
      state.strokes.push(current.stroke);changed(state);
    }
    else if(state.dirty)void persist(state);
    record(state,current.before);paint(state);updateHistoryControls();
  }
  function touchEnd(event){
    if(active)trace('stroke/end',event);
    consumeTouches(event);
    const pen=!pointerInk()&&active&&Array.from(event.changedTouches).find(t=>t.identifier===active.id);
    if(pen){
      if(event.type==='touchend'){
        // WebKit can deliver a final position only on lift. Keep that endpoint,
        // including page clipping, without starting a second stroke on re-entry.
        extendStroke(point(pen,active.state,active.bounds),event);
        if(active)finishStroke();
      }else cancel('touchcancel');
    }
    const live=new Set(Array.from(event.touches,t=>t.identifier));
    for(const id of suppressed)if(!live.has(id))suppressed.delete(id);
    // Handle the matching normal end/cancel above before reconciling other
    // owners. An unrelated terminal event can also prove an old Touch ended.
    reconcileTouchOwner(event);
    resumeOriginalPdfPaint();
    // Capture-phase delivery precedes the Reader's pinch-end handler. rAF here
    // therefore sees committed geometry, including a cancelled/no-op pinch.
    if(Array.from(event.changedTouches).some(t=>t.touchType!=='stylus')){
      scheduleNativeScope();
    }
  }
  function pointerStroke(event){
    if(event.type==='pointerdown'){
      if(typeof cancelOriginalUndoTap==='function')cancelOriginalUndoTap();
      if(active||pointerScrolling||penPointers.size!==1||fingerPointers.size||originalPdfContacts||originalPinchBusy()
          ||event.button!==0||!event.cancelable)return;
      // Retain movement/lift beyond the starting paper. pointerType 'pen' is
      // the admission; a companion Touch that cannot be prevented cancels.
      try{event.target.setPointerCapture?.(event.pointerId);}catch{}
      beginStroke({identifier:event.pointerId,target:event.target,clientX:event.clientX,clientY:event.clientY,force:event.pressure},event,event.pointerId);
      return;
    }
    if(active?.pointerId!==event.pointerId)return;
    if(event.type==='pointercancel'||event.type==='lostpointercapture'){
      cancel(event.type);return;
    }
    if(event.type!=='pointermove'&&event.type!=='pointerup')return;
    const samples=event.getCoalescedEvents?.()||[];
    for(const sample of [...samples,event]){
      if(!active)break;
      // A lift reports no pressure; the pressure already drawn is kept.
      extendStroke(point(sample,active.state,active.bounds),event,event.type==='pointerup'?undefined:sample.pressure);
    }
    if(event.type==='pointerup'&&active)finishStroke();
  }
  // Native iPad Pointer events only guard Lookup/click; its Touch path remains
  // unchanged. The capability route owns geometry exclusively via pen Pointer.
  // Pointer and Touch identifiers are different namespaces and never equated.
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture','click']){
    window.addEventListener(type,rawEvent=>{
      const event=/** @type {PointerEvent} */(rawEvent);
      const terminal=type==='pointerup'||type==='pointercancel'||type==='lostpointercapture';
      if(terminal)fingerPointers.delete(event.pointerId);
      if(!visible()||mode==='read'){
        if(terminal)penPointers.delete(event.pointerId);
        return;
      }
      trace('pointer/capture',event);
      const paper=onPaper(event.target);
      if(type==='pointerdown'){
        if(paper && event.pointerType==='pen'){
          paperPenPointer=event.pointerId;
          if(pointerInk())penPointers.add(event.pointerId);
        }
        blockedPointers.delete(event.pointerId);
        const blocked=paper && (event.pointerType==='pen' || !!active || (pointerInk()&&penPointers.size>0));
        if(blocked)blockedPointers.add(event.pointerId);
        else if(pointerInk()&&event.pointerType==='touch')fingerPointers.add(event.pointerId);
        suppressClick=!!blocked; // A fresh finger is immediately eligible; no timer.
      }
      const blocked=blockedPointers.has(event.pointerId) || (paper && event.pointerType==='pen');
      if(type==='click'){
        if(paper && (blocked || (event.detail!==0 && suppressClick)))stop(event);
        return;
      }
      if(blocked){
        event.stopImmediatePropagation();
        if(pointerInk()&&event.pointerType==='pen'){
          // preventDefault here only suppresses compatibility mouse input. The
          // non-passive touchstart/move listener owns scroll suppression.
          if(event.cancelable)event.preventDefault();
          pointerStroke(event);
        }
        if((type==='pointercancel'||(type==='lostpointercapture'&&paperPenPointer===event.pointerId)) && event.pointerType==='pen'){
          if(active?.pointerId===event.pointerId)cancel('pointercancel');
        }
      }
      if(terminal){
        penPointers.delete(event.pointerId);
        blockedPointers.delete(event.pointerId);
        if(paperPenPointer===event.pointerId)paperPenPointer=null;
      }
    },{capture:true,passive:false});
  }
  for(const [type,handler] of Object.entries({touchstart:touchStart,touchmove:touchMove,
      touchend:touchEnd,touchcancel:touchEnd})){
    window.addEventListener(type,event=>{
      // Home and other Readers own their touches. Keep only a PDF contact
      // already in progress long enough to finish or cancel it.
      if((!visible()||mode==='read')&&!active&&!suppressed.size)return;
      trace('ink/before',event);
      handler(event);
      trace('ink/after',event);
      if(Reflect.get(window,'breezeInkDebug')===true){
        queueMicrotask(()=>{
          trace('dispatch/finished',event);
          if(type!=='touchmove')flushTrace();
        });
      }
    },{capture:true,passive:false});
  }
  const interrupt=()=>{cancel();suppressed.clear();blockedPointers.clear();suppressClick=false;paperPenPointer=null;penPointers.clear();fingerPointers.clear();pointerScrolling=false;resumeOriginalPdfPaint();};
  window.addEventListener('blur',interrupt);
  window.addEventListener('resize',()=>{cancel('resize');resumeOriginalPdfPaint();});
  // Points so far were mapped with the bounds cached before this scroll, so a
  // scroll mid-stroke commits them instead of discarding the stroke.
  document.addEventListener('scroll',event=>{if(event.target===readerScroller()){if(pointerInk())pointerScrolling=true;trace('reader/scroll',event);if(active)finishStroke();}},{capture:true,passive:true});
  document.addEventListener('scrollend',event=>{if(event.target===readerScroller()){pointerScrolling=false;trace('reader/scrollend',event);flushTrace();scheduleNativeScope();}},{capture:true,passive:true});
  const leaveInk=()=>{
    interrupt();
    // iOS suspends timers when this web view is hidden. The pen-up debounce
    // never reaches the merge RPC unless the upload starts in this turn.
    if(typeof flushBookInkNow==='function')void flushBookInkNow();
  };
  document.addEventListener('visibilitychange',()=>{if(document.hidden)leaveInk();});
  window.addEventListener('pagehide',leaveInk);
  window.addEventListener('breeze-ink-platform',()=>{
    if(!supported()&&mode!=='read')setMode('read');
    if(originalSession?.kind==='pdf'){
      session=originalSession;controls();update();
      const current=session;
      for(const n of current.settled)void current.pdf.getPage(n).then(p=>mount(current,n,p.getViewport({scale:1}))).catch(error=>console.warn('PDF ink mount failed',error));
    }
  });
  async function mount(s,n,base){
    // Stored annotations are readable on every client, independently of tools.
    if(s!==session||!s.hash)return;
    const element=s.pages[n-1],key=keyFor(s,n);
    let state=pages.get(key);
    if(!state){
      state=newState(key);
      pages.set(key,state);
      state.loading=read(key).then(data=>{
        if(data!==undefined && !valid(data))throw new Error('Unsupported or invalid ink data');
        state.strokes=data?.strokes||[];state.loaded=true;
      }).finally(()=>{state.loading=null;});
    }
    // Close/reopen can put two mount callers behind the same read. Only the
    // latest caller may attach OR evict this state and its storage mirror.
    const mountOwner={};state.mountOwner=mountOwner;
    try{if(state.loading)await state.loading;}catch(error){
      if(state.mountOwner!==mountOwner)return;
      pages.delete(key);BreezePdfInkStore.release(key);message('필기를 불러오지 못했어요. 문서를 다시 열어 주세요');return;
    }
    if(state.mountOwner!==mountOwner)return;
    if(s!==session || !element.querySelector('canvas')?.width || state.svg){evict(state);return;}
    state.element=element;state.width=base.width;state.height=base.height;
    state.svg=element.querySelector('.pdf-ink-layer')||document.createElementNS(ns,'svg');state.svg.classList.add('pdf-ink-layer');
    state.svg.setAttribute('viewBox',`0 0 ${base.width} ${base.height}`);
    state.svg.setAttribute('aria-hidden','true');
    // A fast reply is in the first paint. A slow one paints local ink and merges later.
    if(typeof pullBookInk==='function'){
      const remote=pullBookInk(state);
      let timer=0;
      await Promise.race([
        Promise.resolve(remote).catch(()=>{}),
        new Promise(resolve=>{timer=setTimeout(resolve,400);})
      ]);
      clearTimeout(timer);
    }
    if(state.mountOwner!==mountOwner||s!==session||!state.svg)return;
    if(state.svg.parentElement!==element)element.append(state.svg);
    paint(state);
  }
  const platformReady=(async()=>{
    if(!nativeAndroid())return;
    try{
      const cap=window.Capacitor;
      const platform=cap.Plugins?.BreezePdfPlatform || cap.registerPlugin?.('BreezePdfPlatform');
      const result=await platform.getCapabilities();
      androidTablet=result?.tablet===true;
    }catch{} // Older native wrappers without this narrow plugin stay read-only.
    window.dispatchEvent(new Event('breeze-ink-platform'));
  })();
  if(typeof registerBookInkPage==='function')registerBookInkPage({
    page:key=>pages.get(key)||null,
    pages:()=>[...pages.values()],
    busy:()=>!!active,
    accept(stroke){return valid({version:1,strokes:[stroke]});},
    persist(state){paint(state);changed(state);},
    held(state){
      if(!state||!state.inkHeld||(active&&active.state===state))return false;
      state.strokes=state.inkHeld;state.inkHeld=null;paint(state);changed(state);return true;
    }
  });
  return {
    available:supported,
    availability(){return platformReady.then(supported);},
    open(s){if(!s.hash)return;session=s;mode='read';pointerScrolling=false;undoStack.length=redoStack.length=0;
      controls();update();},
    mount,
    release(s,n,{keepShell=false}={}){
      const state=pages.get(keyFor(s,n));if(!state)return;
      if(active?.state===state)cancel('page-release');
      if(keepShell)state.svg?.replaceChildren();else state.svg?.remove();
      state.svg=null;state.inkPaths=null;state.inkGroups=null;state.element=null;evict(state);
    },
    close(s){if(s!==session)return;interrupt();mode='read';for(let n=1;n<=s.pages.length;n++)this.release(s,n);session=null;undoStack.length=redoStack.length=0;update();},
    finger,trace,
    refreshScope:scheduleNativeScope,
    writing(){return !!visible()&&mode!=='read';},
    undo(){history(true);},
    diagnosticState(){
      if(Reflect.get(window,'breezePdfStateDebug')!==true)return null;
      return {mode,active:active?{id:active.id,page:active.state.element?.dataset.page,tool:active.tool,points:active.stroke.points.length}:null,
        suppressed:[...suppressed],blockedPointers:[...blockedPointers],events:stateTraceRows.slice()};
    },
    busy(){return !!active||suppressed.size>0;},
    accept(stroke){return valid({version:1,strokes:[stroke]});}
  };
})();
