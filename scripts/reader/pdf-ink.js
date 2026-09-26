/* iPad PDF Pencil annotation. No finger drawing, export or sync.
   SVG is display-only; WebKit stylus Touch events own drawing. Keeping the
   existing pan-x/pan-y policy lets fingers reach the existing PDF scroller.
   Basic Pencil/pan/pinch was confirmed on iPad; expanded physical QA is documented. */
const BreezePdfInk = (()=>{
  const colors=['#111111','#c43d3d','#2864c5'], widths=[0.75,1.5,3];
  const undoStack=[],redoStack=[];
  let color=colors[0],width=widths[1];
  const ns='http://www.w3.org/2000/svg';
  const database=openDb('breeze-pdf-ink',1,db=>db.createObjectStore('pages'));
  const pages=new Map(); // Loaded pages only; dirty failures survive document closure.
  let session=null, mode='read', active=null, toolbar=null, status=null;
  let inkTools=null,inkEntry=null,inkMini=null,inkReadSeparator=null;
  const suppressed=new Set(), blockedPointers=new Set();
  let suppressClick=false;
  const finger=t=>t.touchType!=='stylus' && !suppressed.has(t.identifier);
  const onPaper=target=>target?.closest?.('.pdf-source-page') && !target.closest('button,input,select,textarea');
  const supported=()=>Reflect.get(window,'breezeInkIPad')===true;
  const visible=()=>supported() && session===originalSession && session?.kind==='pdf'
    && document.body.classList.contains('reader-original') && document.body.classList.contains('reading');
  // Explicit native DEBUG flag only. No text, document bytes, or stored ink in logs.
  const traceRows=[];
  let traceSequence=0;
  function trace(route,event){
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
  let scopeFrame=0, lastScope='';
  let cachedPageScope=null,pageScopeSession=null,pageScopeKey='';
  function publishNativeScope(){
    scopeFrame=0;
    const bridge=Reflect.get(window,'webkit')?.messageHandlers?.breezeInkScope;
    if(!bridge)return;
    const enabled=!!visible()&&mode!=='read'&&!document.hidden, box=readerScroller();
    let scope={enabled};
    if(enabled&&box){
      if(originalPinchBusy())return; // Publish committed geometry after the pinch, not every preview frame.
      const outer=box.getBoundingClientRect();
      const bounds=element=>{
        const r=element.getBoundingClientRect();return [r.x,r.y,r.width,r.height];
      };
      const excluded=Array.from(document.querySelectorAll('button,input,select,textarea,[role="dialog"],#pdf-ink-tools,#readpill,#word-modal-scrim,#sentence-scrim,#aa-pop'))
        .filter(element=>element.getClientRects().length && getComputedStyle(element).visibility!=='hidden')
        .map(bounds);
      const geometryKey=[outer.width,outer.height,box.scrollHeight,originalZoom(),session.pages.length].join('|');
      if(!cachedPageScope||pageScopeSession!==session||pageScopeKey!==geometryKey){
        cachedPageScope=session.pages.map(element=>{
          const r=element.getBoundingClientRect();
          return [r.x-outer.x+box.scrollLeft,r.y-outer.y+box.scrollTop,r.width,r.height];
        });pageScopeSession=session;pageScopeKey=geometryKey;
      }
      scope={enabled,viewport:document.documentElement.clientWidth,box:bounds(box),scrollHeight:box.scrollHeight,excluded,pages:cachedPageScope};
    }
    const json=JSON.stringify(scope);
    if(json!==lastScope){lastScope=json;bridge.postMessage(scope);}
  }
  function scheduleNativeScope(){
    if(!scopeFrame && Reflect.get(window,'webkit')?.messageHandlers?.breezeInkScope)
      scopeFrame=requestAnimationFrame(publishNativeScope);
  }
  // Geometry only. Drawing/coordinates/storage remain in the existing engine.
  new MutationObserver(records=>{if(!originalPinchBusy()&&records.some(record=>record.target instanceof Element&&record.target.matches('.pdf-source-page,#original-content,#original-zoom')))cachedPageScope=null;if(records.some(record=>{const node=record.target;return node===document.body||node===document.documentElement||node instanceof Element&&(!node.closest('.pdf-ink-layer')&&(node.closest('#v-read,#readchrome')||node.matches('[role=dialog],dialog,#word-modal-scrim,#sentence-scrim,#aa-pop')));} ))scheduleNativeScope();}).observe(document.documentElement,
    {subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden']});
  window.addEventListener('resize',scheduleNativeScope);
  document.addEventListener('visibilitychange',publishNativeScope);
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
    inkEntry.hidden=!ready;
    inkEntry.setAttribute('aria-pressed',String(writing));
    inkEntry.setAttribute('aria-label',writing?'읽기 모드로 전환':'필기 모드로 전환');
    inkEntry.title=writing?'읽기 모드로 전환':'필기 모드로 전환';
    inkEntry.classList.toggle('ink-pill-exiting',writing);
    inkTools.inert=!writing;
    inkTools.setAttribute('aria-hidden',String(!writing));
    inkMini.hidden=!writing;
    inkMini.querySelector('.ink-pill-mini-color').style.background=color;
    inkTools.querySelectorAll('[data-ink-mode]').forEach(button=>{
      button.setAttribute('aria-pressed',String(button.dataset.inkMode===mode));
    });
    inkTools.querySelector('.ink-pill-color').dataset.value=color;
    inkTools.querySelector('.ink-pill-width').dataset.value=String(width);
    inkTools.querySelector('.ink-pill-color i').style.background=color;
    inkTools.querySelector('.ink-pill-color').setAttribute('aria-label','펜 색상: '+['검정','빨강','파랑'][colors.indexOf(color)]+', 바꾸기');
    inkTools.querySelector('.ink-pill-width i').style.width=`${Math.round(width*3)}px`;
    inkTools.querySelector('.ink-pill-width').setAttribute('aria-label','펜 굵기: '+['얇게','보통','굵게'][widths.indexOf(width)]+', 바꾸기');
    inkTools.querySelector('[data-ink-undo]').disabled=!writing||!undoStack.length||!!active;
    inkTools.querySelector('[data-ink-redo]').disabled=!writing||!redoStack.length||!!active;
    for(const id of ['modefab','readpill-title'])document.getElementById(id).inert=writing;
    toolbar.hidden=!ready;
    if(!ready)cancel();
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
    inkEntry.onclick=()=>setMode(mode==='read'?'pen':'read');
    inkTools=document.createElement('div');inkTools.id='pdf-ink-tools';inkTools.className='ink-pill-toolbar';inkTools.setAttribute('role','group');inkTools.setAttribute('aria-label','PDF 필기 도구');
    for(const [tool,label,path] of [
      ['pen','펜','M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z']
    ]){
      const button=inkControl(label,path);button.dataset.inkMode=tool;
      button.onclick=()=>setMode(tool);inkTools.append(button);
    }
    const colorButton=inkControl('현재 색상 바꾸기','M12 3s-7 7.1-7 11a7 7 0 0 0 14 0c0-3.9-7-11-7-11Z','ink-pill-color');
    colorButton.innerHTML='<i aria-hidden="true"></i>';
    colorButton.dataset.inkSetting='color';
    colorButton.onclick=()=>{cancel();color=colors[(colors.indexOf(color)+1)%colors.length];update();};inkTools.append(colorButton);
    const widthButton=inkControl('펜 굵기 바꾸기','M4 12h16','ink-pill-width');
    widthButton.innerHTML='<i aria-hidden="true"></i>';
    widthButton.dataset.inkSetting='width';
    widthButton.onclick=()=>{cancel();width=widths[(widths.indexOf(width)+1)%widths.length];update();};inkTools.append(widthButton,inkSeparator());
    const eraser=inkControl('지우개','M7.2 20.4 3.8 17a2 2 0 0 1 0-2.8l9.8-9.8a2 2 0 0 1 2.8 0l3.8 3.8a2 2 0 0 1 0 2.8l-9.4 9.4H7.2ZM8.7 10.7l6.1 6.1M7.2 20.4H21');
    eraser.dataset.inkMode='erase';eraser.onclick=()=>setMode('erase');inkTools.append(eraser,inkSeparator());
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
    toolbar=document.createElement('div');toolbar.id='pdf-ink-status';toolbar.hidden=true;
    status=document.createElement('span');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const retry=document.createElement('button');retry.type='button';retry.className='pdf-ink-retry';retry.textContent='저장 재시도';
    retry.onclick=()=>{for(const state of pages.values())if(state.dirty)void persist(state);};
    toolbar.append(status,retry);document.getElementById('readchrome').append(toolbar);
    new MutationObserver(update).observe(document.body,{attributes:true,attributeFilter:['class']});
  }
  function setMode(next){
    cancel();suppressed.clear();blockedPointers.clear();suppressClick=false; mode=next;
    if(next==='read')publishNativeScope();
    if(typeof cancelGesture==='function')cancelGesture('PDF ink mode');
    if(typeof closePanel==='function')closePanel();
    if(typeof closeSentence==='function')closeSentence();
    update();
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
      colors.includes(s.color) && widths.includes(s.width) && Array.isArray(s.points) && s.points.length>0
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
          const snapshot={version:1,strokes:structuredClone(state.strokes)};
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
    redoStack.length=0;update();
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
    for(const stroke of state.strokes)state.svg.append(path(stroke));
  }
  function path(stroke){
    const element=document.createElementNS(ns,'polyline');
    // A repeated endpoint makes a Pencil tap a round dot.
    const points=stroke.points.length===1?[stroke.points[0],stroke.points[0]]:stroke.points;
    element.setAttribute('points',points.map(p=>p.join(',')).join(' '));
    element.setAttribute('fill','none');element.setAttribute('stroke',stroke.color);
    element.setAttribute('stroke-width',String(stroke.width));
    element.setAttribute('stroke-linecap','round');element.setAttribute('stroke-linejoin','round');
    return element;
  }
  function point(touch,state){
    const rect=state.element.getBoundingClientRect();
    return [(touch.clientX-rect.left)/rect.width*state.width,(touch.clientY-rect.top)/rect.height*state.height];
  }
  function distance(p,a,b){
    const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
    const t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;
    return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
  }
  function erase(state,p){
    const before=state.strokes.length;
    state.strokes=state.strokes.filter(s=>!s.points.some((b,i)=>distance(p,s.points[Math.max(0,i-1)],b)<=6+s.width/2));
    if(before!==state.strokes.length){paint(state);changed(state);}
  }
  function cancel(){
    if(active){
      const current=active;active=null;
      if(current.tool==='erase')record(current.state,current.before);
      paint(current.state);update();
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
      if(onPaper(t.target) && (active || t.touchType==='stylus'))suppressed.add(t.identifier);
    }
    const pen=changed.find(t=>t.touchType==='stylus' && onPaper(t.target));
    consumeTouches(event);
    if(active || !pen){trace('start/no-new-stroke',event);return;}
    // Only eligible direct contacts own a finger gesture; suppressed palms do not.
    const eligible=Array.from(event.touches).filter(finger);
    if(eligible.length || !event.cancelable){
      trace('start/rejected',event);return;
    }
    // A completed finger sequence cannot leave a stale pinch blocking Pencil.
    if(originalPinchBusy())cancelOriginalPinch();
    const element=pen.target.closest('.pdf-source-page');
    const state=pages.get(keyFor(session,Number(element.dataset.page)));
    if(!state?.svg || !state.loaded){message('필기를 불러오는 중이에요. 다시 시도해 주세요');return;}
    cancelGesture('Pencil owns paper');
    const p=point(pen,state);
    active={id:pen.identifier,state,tool:mode,before:state.strokes.slice(),stroke:{color,width,points:[p]},preview:null};
    trace('stroke/start',event);
    update();
    if(active.tool==='erase')erase(state,p);
    else{active.preview=path(active.stroke);state.svg.append(active.preview);}
  }
  function touchMove(event){
    consumeTouches(event);
    if(!active)return;
    const pen=Array.from(event.changedTouches).find(t=>t.identifier===active.id);
    if(!pen)return; // A moving/lifting palm cannot append or finish Pencil ink.
    if(!event.cancelable){trace('move/noncancelable-cancel',event);cancel();return;}
    const p=point(pen,active.state);
    if(p[0]<0||p[1]<0||p[0]>active.state.width||p[1]>active.state.height){cancel();return;}
    if(active.tool==='erase'){
      const previous=active.stroke.points.at(-1);
      const steps=Math.max(1,Math.ceil(Math.hypot(p[0]-previous[0],p[1]-previous[1])/3));
      for(let i=1;i<=steps;i++)erase(active.state,[previous[0]+(p[0]-previous[0])*i/steps,previous[1]+(p[1]-previous[1])*i/steps]);
      active.stroke.points=[p];
    }else{
      active.stroke.points.push(p);
      active.preview.setAttribute('points',active.stroke.points.map(x=>x.join(',')).join(' '));
    }
  }
  function touchEnd(event){
    consumeTouches(event);
    if(active && Array.from(event.changedTouches).some(t=>t.identifier===active.id)){
      if(event.type==='touchend' && active.tool==='pen'){
        active.state.strokes.push(active.stroke);changed(active.state);
      }
      const current=active,state=current.state;active=null;
      record(state,current.before);paint(state);update();
    }
    const live=new Set(Array.from(event.touches,t=>t.identifier));
    for(const id of suppressed)if(!live.has(id))suppressed.delete(id);
    resumeOriginalPdfPaint();
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
        if(type==='pointercancel' && event.pointerType==='pen')cancel();
      }
      if(type==='pointerup'||type==='pointercancel')blockedPointers.delete(event.pointerId);
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
  const interrupt=()=>{cancel();suppressed.clear();blockedPointers.clear();suppressClick=false;resumeOriginalPdfPaint();};
  window.addEventListener('blur',interrupt);
  window.addEventListener('resize',()=>{cancel();resumeOriginalPdfPaint();});
  document.addEventListener('scroll',event=>{if(event.target===readerScroller()){trace('reader/scroll',event);cancel();scheduleNativeScope();}},{capture:true,passive:true});
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
    if(s!==session || !element.querySelector('canvas') || element.querySelector('.pdf-ink-layer')){evict(state);return;}
    state.element=element;state.width=base.width;state.height=base.height;
    state.svg=document.createElementNS(ns,'svg');state.svg.classList.add('pdf-ink-layer');
    state.svg.setAttribute('viewBox',`0 0 ${base.width} ${base.height}`);
    state.svg.setAttribute('aria-hidden','true');element.append(state.svg);paint(state);
  }
  return {
    open(s){if(!supported()||!s.hash)return;session=s;mode='read';undoStack.length=redoStack.length=0;
      controls();update();},
    mount,
    release(s,n){
      const state=pages.get(keyFor(s,n));if(!state)return;
      if(active?.state===state)cancel();state.svg?.remove();state.svg=null;state.element=null;evict(state);
    },
    close(s){if(s!==session)return;interrupt();mode='read';for(let n=1;n<=s.pages.length;n++)this.release(s,n);session=null;undoStack.length=redoStack.length=0;update();},
    finger,trace,
    busy(){return !!active||suppressed.size>0;}
  };
})();
