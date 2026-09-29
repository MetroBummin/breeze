/* iPad PDF Pencil annotation. No finger drawing, export or sync.
   SVG is display-only; WebKit stylus Touch events own drawing. Keeping the
   existing pan-x/pan-y policy lets fingers reach the existing PDF scroller.
   Basic Pencil/pan/pinch was confirmed on iPad; expanded physical QA is documented. */
const BreezePdfInk = (()=>{
  const colors=['#111111','#c43d3d','#2864c5'], widths=[0.75,1.5,3];
  const eraserRadii=[4,8,16],highlightColors=['#ffe34d','#91df80'],highlightWidths=[12,20],highlightOpacity=0.3;
  const preferenceKey='__breeze_pdf_ink_tools_v1__';
  const undoStack=[],redoStack=[];
  let color=colors[0],width=widths[1],eraserRadius=eraserRadii[1];
  let highlightColor=highlightColors[0],highlightWidth=highlightWidths[0],lastTool='pen';
  try{
    const prefs=JSON.parse(localStorage.getItem(preferenceKey)||'null');
    if(prefs){
      if(colors.includes(prefs.color))color=prefs.color;
      if(widths.includes(prefs.width))width=prefs.width;
      if(eraserRadii.includes(prefs.eraserRadius))eraserRadius=prefs.eraserRadius;
      if(highlightColors.includes(prefs.highlightColor))highlightColor=prefs.highlightColor;
      if(highlightWidths.includes(prefs.highlightWidth))highlightWidth=prefs.highlightWidth;
      if(['pen','highlighter','erase'].includes(prefs.tool))lastTool=prefs.tool;
    }
  }catch{} // Tool preferences never block reading or loading existing ink.
  function savePreferences(){
    try{localStorage.setItem(preferenceKey,JSON.stringify({tool:lastTool,color,width,eraserRadius,highlightColor,highlightWidth,highlightOpacity}));}catch{}
  }
  const ns='http://www.w3.org/2000/svg';
  const database=openDb('breeze-pdf-ink',1,db=>db.createObjectStore('pages'));
  const pages=new Map(); // Loaded pages only; dirty failures survive document closure.
  let session=null, mode='read', active=null, pendingAdmission=null, toolbar=null, status=null;
  let inkTools=null,inkEntry=null,inkMini=null,inkReadSeparator=null;
  let settings=null,settingsTool=null;
  const suppressed=new Set(), blockedPointers=new Set(), nativeOwnedStylus=new Set();
  let suppressClick=false, paperPenPointer=null;
  const finger=t=>t.touchType!=='stylus' && !suppressed.has(t.identifier);
  const onPaper=target=>target?.closest?.('.pdf-source-page') && !target.closest('button,input,select,textarea');
  const supported=()=>Reflect.get(window,'breezeInkIPad')===true;
  const visible=()=>supported() && session===originalSession && session?.kind==='pdf'
    && document.body.classList.contains('reader-original') && document.body.classList.contains('reading');
  // Explicit native DEBUG flag only. No text, document bytes, or stored ink in logs.
  const traceRows=[],stateTraceRows=[];
  let traceSequence=0;
  function trace(route,event,reason){
    if(Reflect.get(window,'breezePdfStateDebug')===true &&
        (route.startsWith('start/')||route==='stroke/start'||route==='stroke/end'||route==='stroke/cancel'||route==='move/noncancelable-cancel')){
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
      if(originalPinchBusy())return; // Keep the last committed scope until the contact-end refresh.
      const outer=box.getBoundingClientRect();
      const bounds=element=>{
        const r=element.getBoundingClientRect();return [r.x,r.y,r.width,r.height];
      };
      const excluded=Array.from(document.querySelectorAll('button,input,select,textarea,[role="dialog"],#pdf-ink-tools,#readpill,#word-modal-scrim,#sentence-scrim,#aa-pop'))
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
      const layout=node===document.body||node===document.documentElement
        ||node.matches('#v-read,#originalwrap,#original-stage,#original-content,#original-zoom,.pdf-source-page');
      // Canvas/marker insertion does not change paper layout. Aspect ratio,
      // ancestor sizing and page-list changes do.
      if(layout&&(record.type!=='childList'||node.matches('#original-content')))invalidatePageScope();
      if(layout||node.closest('#v-read,#readchrome')
          ||node.matches('[role=dialog],dialog,#word-modal-scrim,#sentence-scrim,#aa-pop'))refresh=true;
    }
    if(refresh)scheduleNativeScope();
  }).observe(document.documentElement,
    {subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','inert']});
  window.addEventListener('resize',()=>{invalidatePageScope();scheduleNativeScope();});
  document.addEventListener('visibilitychange',()=>{invalidatePageScope();publishNativeScope();});
  // getBoundingClientRect during a CSS transition is an intermediate snapshot.
  // Publish once more after layout settles; do not scan all pages per frame.
  for(const type of ['transitionend','transitioncancel'])document.addEventListener(type,event=>{
    const target=event.target;
    if(target instanceof Element&&(target===document.body||target===document.documentElement
        ||target.closest('#v-read,#readchrome'))){invalidatePageScope();scheduleNativeScope();}
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
    inkEntry.setAttribute('aria-pressed',String(writing));
    inkEntry.setAttribute('aria-label',writing?'읽기 모드로 전환':'필기 모드로 전환');
    inkEntry.title=writing?'읽기 모드로 전환':'필기 모드로 전환';
    inkEntry.classList.toggle('ink-pill-exiting',writing);
    inkTools.inert=!writing;
    inkTools.setAttribute('aria-hidden',String(!writing));
    inkMini.hidden=!writing;
    inkMini.querySelector('.ink-pill-mini-color').style.background=mode==='highlighter'?highlightColor:color;
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
  function updateSettings(){
    if(!settings)return;
    settings.hidden=!settingsTool;
    settings.setAttribute('aria-label',settingsTool==='erase'?'지우개 설정':settingsTool==='highlighter'?'형광펜 설정':'펜 설정');
    settings.querySelectorAll('[data-ink-panel]').forEach(panel=>{panel.hidden=panel.dataset.inkPanel!==settingsTool;});
    settings.querySelectorAll('[data-ink-color]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.inkColor===color)));
    settings.querySelectorAll('[data-ink-width]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.inkWidth)===width)));
    settings.querySelectorAll('[data-ink-highlight-color]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.inkHighlightColor===highlightColor)));
    settings.querySelectorAll('[data-ink-highlight-width]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.inkHighlightWidth)===highlightWidth)));
    settings.querySelectorAll('[data-ink-radius]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.inkRadius)===eraserRadius)));
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
    const pill=document.getElementById('readpill');
    inkEntry=inkControl('필기 모드로 전환','M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z','ink-pill-entry');
    inkEntry.innerHTML=`<span class="ink-entry-pen">${icon('M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z')}</span><span class="ink-entry-read">${icon('M12 7v14M3 18V5a2 2 0 0 1 2-2h3a4 4 0 0 1 4 4 4 4 0 0 1 4-4h3a2 2 0 0 1 2 2v13a1 1 0 0 1-1 1h-4a4 4 0 0 0-4 2 4 4 0 0 0-4-2H4a1 1 0 0 1-1-1zM6 8h1m-1 4h2m9-4h1m-2 4h2')}</span>`;
    inkEntry.dataset.inkToggle='';
    inkEntry.onclick=()=>setMode(mode==='read'?lastTool:'read');
    inkTools=document.createElement('div');inkTools.id='pdf-ink-tools';inkTools.className='ink-pill-toolbar';inkTools.setAttribute('role','group');inkTools.setAttribute('aria-label','PDF 필기 도구');
    for(const [tool,label,path] of [
      ['pen','펜','M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z'],
      ['highlighter','형광펜','m9 14 7-10 5 4-8 9-4-3Zm0 0-4 5 4 1 4-3M3 22h13']
    ]){
      const button=inkControl(label,path);button.dataset.inkMode=tool;
      button.onclick=()=>selectTool(tool);inkTools.append(button);
    }
    inkTools.append(inkSeparator());
    const eraser=inkControl('지우개','M7.2 20.4 3.8 17a2 2 0 0 1 0-2.8l9.8-9.8a2 2 0 0 1 2.8 0l3.8 3.8a2 2 0 0 1 0 2.8l-9.4 9.4H7.2ZM8.7 10.7l6.1 6.1M7.2 20.4H21');
    eraser.dataset.inkMode='erase';eraser.onclick=()=>selectTool('erase');inkTools.append(eraser,inkSeparator());
    for(const [label,path] of [
      ['실행 취소','M9 5 4 10l5 5M4 10h9a6 6 0 0 1 0 12'],
      ['다시 실행','m15 5 5 5-5 5m5-5h-9a6 6 0 0 0 0 12']
    ]){
      const button=inkControl(label,path),undo=label==='실행 취소';
      button.setAttribute(undo?'data-ink-undo':'data-ink-redo','');button.onclick=()=>history(undo);
      button.disabled=true;inkTools.append(button);
    }
    inkTools.append(inkSeparator());
    inkReadSeparator=inkSeparator();inkReadSeparator.classList.add('ink-pill-mode-separator');
    inkMini=document.createElement('button');inkMini.type='button';inkMini.className='ink-pill-mini';
    inkMini.setAttribute('aria-label','필기 도구 펼치기');inkMini.title='필기 도구 펼치기';
    inkMini.innerHTML=`${icon('M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z')}<i class="ink-pill-mini-color" aria-hidden="true"></i>`;
    inkMini.onclick=()=>expandReaderChrome();
    pill.append(inkTools,inkReadSeparator,inkEntry,inkMini);
    settings=document.createElement('div');settings.id='pdf-ink-settings';settings.className='control-glass';settings.hidden=true;
    settings.setAttribute('role','dialog');
    settings.innerHTML='<div data-ink-panel="pen"><div class="ink-setting-row ink-colors" role="group" aria-label="펜 색상"></div><div class="ink-setting-label">두께</div><div class="ink-setting-row ink-widths" role="group" aria-label="펜 두께"></div></div><div data-ink-panel="erase" hidden><div class="ink-setting-label">지우개 크기</div><div class="ink-setting-row ink-radii"></div></div>';
    settings.insertAdjacentHTML('beforeend','<div data-ink-panel="highlighter" hidden><div class="ink-setting-row ink-highlight-colors" role="group" aria-label="형광펜 색상"></div><div class="ink-setting-label">두께</div><div class="ink-setting-row ink-highlight-widths" role="group" aria-label="형광펜 두께"></div></div>');
    const options=(kind,values,labels)=>{
      const row=settings.querySelector(kind==='color'?'.ink-colors':kind==='width'?'.ink-widths':kind==='highlightColor'?'.ink-highlight-colors':kind==='highlightWidth'?'.ink-highlight-widths':'.ink-radii');
      values.forEach((value,i)=>{
        const button=document.createElement('button');button.type='button';button.dataset[`ink${kind[0].toUpperCase()+kind.slice(1)}`]=String(value);
        button.setAttribute('aria-label',(kind==='color'?'펜 색상: ':kind==='width'?'펜 두께: ':kind==='highlightColor'?'형광펜 색상: ':kind==='highlightWidth'?'형광펜 두께: ':'지우개 크기: ')+labels[i]);
        const compact=kind==='color'||kind==='highlightColor'||kind==='width'||kind==='highlightWidth';
        button.innerHTML='<i aria-hidden="true"></i>'+(compact?'':'<span>'+labels[i]+'</span>');
        button.style.setProperty('--ink-option',kind==='color'||kind==='highlightColor'?String(value):`${kind==='width'?Number(value)*1.6:kind==='highlightWidth'?Number(value)*0.5:8+i*7}px`);
        button.onclick=()=>{cancel();if(kind==='color')color=String(value);else if(kind==='width')width=Number(value);else if(kind==='highlightColor')highlightColor=String(value);else if(kind==='highlightWidth')highlightWidth=Number(value);else eraserRadius=Number(value);savePreferences();update();};
        row.append(button);
      });
    };
    options('color',colors,['검정','빨강','파랑']);options('width',widths,['얇게','보통','굵게']);options('radius',eraserRadii,['작게','보통','크게']);
    options('highlightColor',highlightColors,['노랑','초록']);options('highlightWidth',highlightWidths,['보통','굵게']);
    inkTools.querySelectorAll('[data-ink-mode]').forEach(button=>{button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',settings.id);});
    document.getElementById('readchrome').append(settings);
    document.addEventListener('pointerdown',event=>{if(event.target instanceof Element&&!event.target.closest('#pdf-ink-settings,#pdf-ink-tools'))closeSettings();},true);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&settingsTool){const tool=settingsTool;closeSettings();inkTools.querySelector(`[data-ink-mode="${tool}"]`).focus();event.preventDefault();}});
    toolbar=document.createElement('div');toolbar.id='pdf-ink-status';toolbar.hidden=true;
    status=document.createElement('span');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const retry=document.createElement('button');retry.type='button';retry.className='pdf-ink-retry';retry.textContent='저장 재시도';
    retry.onclick=()=>{for(const state of pages.values())if(state.dirty)void persist(state);};
    toolbar.append(status,retry);document.getElementById('readchrome').append(toolbar);
    new MutationObserver(update).observe(document.body,{attributes:true,attributeFilter:['class']});
  }
  function setMode(next){
    cancel();pendingAdmission=null;suppressed.clear();blockedPointers.clear();nativeOwnedStylus.clear();suppressClick=false; mode=next;
    if(next!=='read'){lastTool=next;savePreferences();}
    if(next==='read')publishNativeScope();
    if(typeof cancelGesture==='function')cancelGesture('PDF ink mode');
    if(typeof closePanel==='function')closePanel();
    if(typeof closeSentence==='function')closeSentence();
    update();
    publishNativeScope();
  }
  async function read(key){
    const db=await database();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('pages');const request=tx.objectStore('pages').get(key);
      tx.oncomplete=()=>resolve(request.result);
      tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Ink read failed'));
    });
  }
  async function write(key,value){
    const db=await database();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('pages','readwrite');tx.objectStore('pages').put(value,key);
      tx.oncomplete=()=>resolve(undefined);
      tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Ink write failed'));
    });
  }
  function valid(data){
    return data?.version===1 && Array.isArray(data.strokes) && data.strokes.every(s=>
      (s.tool==='highlighter' ? highlightColors.includes(s.color)&&highlightWidths.includes(s.width)&&s.opacity===highlightOpacity&&(s.strokeId===undefined||typeof s.strokeId==='string')
        : (s.tool===undefined||s.tool==='pen')&&colors.includes(s.color)&&widths.includes(s.width)&&(s.opacity===undefined||s.opacity===1))
      && Array.isArray(s.points) && s.points.length>0
      && s.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)));
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
          // IndexedDB copies the coordinates when put() accepts the snapshot.
          const snapshot={version:1,strokes:state.strokes.slice()};
          await write(state.key,snapshot);
          if(revision===state.revision)state.dirty=false;
        }
      }catch(error){state.error=true;console.warn('PDF ink save failed',error);}
      finally{state.saving=null;summary();evict(state);}
    })();
    return state.saving;
  }
  function evict(state){if(!state.svg && !state.dirty && !state.saving && !state.loading)pages.delete(state.key);}
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
  function paint(state){
    if(!state.svg)return;
    state.svg.replaceChildren();
    // Completed strokes are immutable. Reuse their SVG paths instead of
    // serializing every point again on each pen lift or eraser sample.
    const previous=state.inkPaths||new Map(),next=new Map();
    const inkPath=stroke=>{
      const element=previous.get(stroke)||path(stroke);next.set(stroke,element);return element;
    };
    // Translucent ink sits beneath pen ink, independent of creation order.
    const highlights=new Map();
    for(const stroke of state.strokes.filter(s=>s.tool==='highlighter')){
      // Erased fragments of one original stroke share one alpha composite.
      const id=stroke.strokeId||stroke;
      let group=highlights.get(id);
      if(!group){group=document.createElementNS(ns,'g');group.setAttribute('opacity',String(stroke.opacity));group.setAttribute('data-ink-tool','highlighter');highlights.set(id,group);state.svg.append(group);}
      const fragment=inkPath(stroke);fragment.setAttribute('opacity','1');group.append(fragment);
    }
    for(const stroke of state.strokes.filter(s=>s.tool!=='highlighter'))state.svg.append(inkPath(stroke));
    state.inkPaths=next;
  }
  function path(stroke){
    const element=document.createElementNS(ns,'polyline');
    // A repeated endpoint makes a Pencil tap a round dot.
    const points=stroke.points.length===1?[stroke.points[0],stroke.points[0]]:stroke.points;
    element.setAttribute('points',points.map(p=>p.join(',')).join(' '));
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
  function erase(state,p,previous=p){
    let edited=false;
    const strokes=state.strokes.flatMap(stroke=>{
      const parts=BreezeInkGeometry.eraseStroke(stroke,previous,p,eraserRadius);
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
  function touchStart(event){
    if(!visible()||mode==='read')return;
    const changed=Array.from(event.changedTouches);
    for(const t of changed){
      if(onPaper(t.target) && (active || (pendingAdmission && !pendingAdmission.ended)
          || nativeOwnedStylus.size || t.touchType==='stylus'))suppressed.add(t.identifier);
    }
    const pen=changed.find(t=>t.touchType==='stylus' && onPaper(t.target));
    consumeTouches(event);
    if(active || !pen || (pendingAdmission && !pendingAdmission.ended)){
      trace('start/no-new-stroke',event);return;
    }
    // Only eligible direct contacts own a finger gesture; suppressed palms do not.
    const eligible=Array.from(event.touches).filter(finger);
    if(eligible.length || !event.cancelable){
      trace('start/rejected',event);return;
    }
    // Do not create a preview or persist a point until native confirms that
    // THIS stylus start is ink. Native Touch IDs and DOM IDs are unrelated.
    const bridge=Reflect.get(window,'webkit')?.messageHandlers?.breezePencilAdmission;
    if(bridge){
      const snapshot=t=>({identifier:t.identifier,target:t.target,clientX:t.clientX,clientY:t.clientY});
      const request={eventAt:(event.timeStamp>1e12?event.timeStamp:performance.timeOrigin+event.timeStamp)/1000,
        x:pen.clientX,y:pen.clientY,viewport:document.documentElement.clientWidth};
      const pending={id:pen.identifier,session,points:[snapshot(pen)],ended:false,pointerId:paperPenPointer};
      pendingAdmission=pending;
      trace('admission/request',event);
      Promise.resolve().then(()=>bridge.postMessage(request)).then(role=>{
        if(pendingAdmission!==pending)return; // Stale reply cannot act on a new contact.
        pendingAdmission=null;
        trace(role==='ink'?'admission/ink':'admission/rejected',undefined,String(role));
        if(role!=='ink'){
          if(!pending.ended)nativeOwnedStylus.add(pending.id);
          return;
        }
        if(!visible()||mode==='read'||session!==pending.session)return;
        beginStroke(pending.points[0],undefined,pending.pointerId);
        if(!active)return;
        for(const p of pending.points.slice(1)){
          if(!active)break;
          extendStroke(point(p,active.state,active.bounds));
        }
        if(pending.ended && active)finishStroke();
      }).catch(()=>{
        if(pendingAdmission===pending){pendingAdmission=null;trace('admission/error');}
      });
      return;
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
    active={id:pen.identifier,pointerId,state,bounds,tool:mode,before:state.strokes.slice(),stroke:mode==='highlighter'?{tool:'highlighter',strokeId:crypto.randomUUID(),color:highlightColor,width:highlightWidth,opacity:highlightOpacity,points:[p]}:{color,width,points:[p]},
      preview:null,smoother:mode!=='erase'?BreezeInkGeometry.createSmoother(p):null};
    trace('stroke/start',event);
    updateHistoryControls();
    if(active.tool==='erase'){erase(state,p);showEraser(p);}
    else{
      active.preview=path(active.stroke);
      const pen=mode==='highlighter'?Array.from(state.svg.children).find(el=>el.getAttribute('data-ink-tool')==='pen'):null;
      if(pen)state.svg.insertBefore(active.preview,pen);else state.svg.append(active.preview);
    }
  }
  function touchMove(event){
    consumeTouches(event);
    if(pendingAdmission){
      const pen=Array.from(event.changedTouches).find(t=>t.identifier===pendingAdmission.id);
      if(pen){
        if(!event.cancelable){pendingAdmission=null;trace('admission/noncancelable');return;}
        pendingAdmission.points.push({identifier:pen.identifier,target:pen.target,clientX:pen.clientX,clientY:pen.clientY});
      }
      return;
    }
    if(!active)return;
    const pen=Array.from(event.changedTouches).find(t=>t.identifier===active.id);
    if(!pen)return; // A moving/lifting palm cannot append or finish Pencil ink.
    if(!event.cancelable){trace('move/noncancelable-cancel',event);cancel('noncancelable-move');return;}
    extendStroke(point(pen,active.state,active.bounds),event);
  }
  function extendStroke(p,event){
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
      active.smoother.add(p);
      active.preview.setAttribute('points',active.smoother.svgPoints());
    }
    if(exits){trace('stroke/page-exit',event);finishStroke();}
    // The contact remains suppressed until lift, so crossing a gap or returning
    // onto paper cannot start another stroke or trigger Lookup.
  }
  function finishStroke(){
    const current=active,state=current.state;active=null;
    if(current.tool!=='erase'){
      current.stroke.points=current.smoother.finish();
      state.strokes.push(current.stroke);changed(state);
    }
    else if(state.dirty)void persist(state);
    record(state,current.before);paint(state);updateHistoryControls();
  }
  function touchEnd(event){
    if(active)trace('stroke/end',event);
    consumeTouches(event);
    if(pendingAdmission){
      const pendingPen=Array.from(event.changedTouches).find(t=>t.identifier===pendingAdmission.id);
      if(pendingPen){
        if(event.type==='touchcancel')pendingAdmission=null;
        else{
          pendingAdmission.points.push({identifier:pendingPen.identifier,target:pendingPen.target,
            clientX:pendingPen.clientX,clientY:pendingPen.clientY});
          pendingAdmission.ended=true;
        }
      }
    }
    const pen=active&&Array.from(event.changedTouches).find(t=>t.identifier===active.id);
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
    for(const id of nativeOwnedStylus)if(!live.has(id))nativeOwnedStylus.delete(id);
    resumeOriginalPdfPaint();
    // Capture-phase delivery precedes the Reader's pinch-end handler. rAF here
    // therefore sees committed geometry, including a cancelled/no-op pinch.
    if(Array.from(event.changedTouches).some(t=>t.touchType!=='stylus')){
      scheduleNativeScope();
    }
  }
  // Pointer events only guard Lookup/click. Drawing remains WebKit stylus Touch.
  // Pointer and Touch identifiers are different namespaces and tracked separately.
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel','click']){
    window.addEventListener(type,rawEvent=>{
      const event=/** @type {PointerEvent} */(rawEvent);
      if(!visible()||mode==='read')return;
      trace('pointer/capture',event);
      const paper=onPaper(event.target);
      if(type==='pointerdown'){
        if(paper && event.pointerType==='pen')paperPenPointer=event.pointerId;
        blockedPointers.delete(event.pointerId);
        const blocked=paper && (event.pointerType==='pen' || !!active);
        if(blocked)blockedPointers.add(event.pointerId);
        suppressClick=!!blocked; // A fresh finger is immediately eligible; no timer.
      }
      const blocked=blockedPointers.has(event.pointerId) || (paper && event.pointerType==='pen');
      if(type==='click'){
        if(paper && (blocked || (event.detail!==0 && suppressClick)))stop(event);
        return;
      }
      if(blocked){
        event.stopImmediatePropagation(); // Do not disable the following Touch path.
        if(type==='pointercancel' && event.pointerType==='pen'){
          if(active?.pointerId===event.pointerId)cancel('pointercancel');
          if(pendingAdmission?.pointerId===event.pointerId)pendingAdmission=null;
        }
      }
      if(type==='pointerup'||type==='pointercancel'){
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
  const interrupt=()=>{cancel();pendingAdmission=null;suppressed.clear();blockedPointers.clear();nativeOwnedStylus.clear();suppressClick=false;paperPenPointer=null;resumeOriginalPdfPaint();};
  window.addEventListener('blur',interrupt);
  window.addEventListener('resize',()=>{cancel('resize');resumeOriginalPdfPaint();});
  document.addEventListener('scroll',event=>{if(event.target===readerScroller()){trace('reader/scroll',event);pendingAdmission=null;cancel('reader-scroll');}},{capture:true,passive:true});
  document.addEventListener('scrollend',event=>{if(event.target===readerScroller()){trace('reader/scrollend',event);flushTrace();scheduleNativeScope();}},{capture:true,passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)interrupt();});
  window.addEventListener('breeze-ink-platform',()=>{
    if(supported() && originalSession?.kind==='pdf'){
      session=originalSession;controls();update();
      const current=session;
      for(const n of current.settled)void current.pdf.getPage(n).then(p=>mount(current,n,p.getViewport({scale:1}))).catch(error=>console.warn('PDF ink mount failed',error));
    }
  });
  async function mount(s,n,base){
    if(!supported()||s!==session||!s.hash)return;
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
    try{if(state.loading)await state.loading;}catch(error){
      pages.delete(key);message('필기를 불러오지 못했어요. 문서를 다시 열어 주세요');return;
    }
    if(s!==session || !element.querySelector('canvas')?.width || state.svg){evict(state);return;}
    state.element=element;state.width=base.width;state.height=base.height;
    state.svg=element.querySelector('.pdf-ink-layer')||document.createElementNS(ns,'svg');state.svg.classList.add('pdf-ink-layer');
    state.svg.setAttribute('viewBox',`0 0 ${base.width} ${base.height}`);
    state.svg.setAttribute('aria-hidden','true');if(state.svg.parentElement!==element)element.append(state.svg);paint(state);
  }
  return {
    open(s){if(!supported()||!s.hash)return;session=s;mode='read';undoStack.length=redoStack.length=0;
      controls();update();},
    mount,
    release(s,n,{keepShell=false}={}){
      const state=pages.get(keyFor(s,n));if(!state)return;
      if(active?.state===state)cancel('page-release');
      if(keepShell)state.svg?.replaceChildren();else state.svg?.remove();
      state.svg=null;state.inkPaths=null;state.element=null;evict(state);
    },
    close(s){if(s!==session)return;interrupt();mode='read';for(let n=1;n<=s.pages.length;n++)this.release(s,n);session=null;undoStack.length=redoStack.length=0;update();},
    finger,trace,
    diagnosticState(){
      if(Reflect.get(window,'breezePdfStateDebug')!==true)return null;
      return {mode,active:active?{id:active.id,page:active.state.element?.dataset.page,tool:active.tool,points:active.stroke.points.length}:null,
        suppressed:[...suppressed],blockedPointers:[...blockedPointers],events:stateTraceRows.slice()};
    },
    busy(){return !!active||suppressed.size>0;}
  };
})();
