/* PDF pinch preview is deliberately separate from the committed scroll geometry.
   The former implementation (7b81a59 -> button fallback) wrote scrollTop and
   resized the stage on every touchmove. Here a fixed paper point follows the
   midpoint using one transform per frame; scroll extents change only on release.
   One-finger scrolling stays native. Never take over an already committed pan. */
let originalPinch = null;
let originalPinchFrame = 0;
let originalPinchTouches = false;
let originalPinchTail = false;
let originalPinchPan = false;
let originalPdfContacts = 0;
let originalPdfRenderPending = false;
// Observe the existing pinch owner: stationary pairs can become undo taps;
// movement hands the same captured geometry straight to normal pinch/pan.
let originalUndoContact=null,originalUndoFirst=null;
function cancelOriginalUndoTap(){originalUndoContact=null;originalUndoFirst=null;}
function originalUndoAllowed(){
  return typeof studyPrefs!=='undefined'&&studyPrefs.twoFingerUndo
    &&typeof BreezePdfInk!=='undefined'&&BreezePdfInk.writing()&&!BreezePdfInk.busy()
    &&!readerPositionPending()&&!document.hidden&&!pdfNavigation
    &&!sentenceModalOpen()&&!wordPanelOpen()&&!wordPeekOpen()&&!aaPopOpen()
    &&!document.querySelector('dialog[open]')&&!activeGesture?.dispatched;
}
function originalUndoSnapshot(){
  const box=readerScroller();
  return {session:originalSession,zoom:originalZoom(),left:box.scrollLeft,top:box.scrollTop,width:box.clientWidth,height:box.clientHeight};
}
function originalUndoSame(snapshot){
  const now=originalUndoSnapshot();return Object.keys(snapshot).every(key=>snapshot[key]===now[key]);
}
function originalUndoPoints(list){return Array.from(list,t=>({id:t.identifier,x:t.clientX,y:t.clientY}));}
function originalUndoNear(a,b,limit){return Math.hypot(a.x-b.x,a.y-b.y)<=limit;}
function originalUndoStart(event){
  const now=performance.now(),points=originalFingerContacts(event);
  if(!originalUndoAllowed()||!event.cancelable||points.length!==event.touches.length
      ||!points.every(p=>p.target?.closest?.('.pdf-source-page'))||points.length>2){cancelOriginalUndoTap();return;}
  if(points.length===1&&!originalPinchTouches&&!originalPinch&&!originalPinchPan){
    if(originalUndoFirst&&(now-originalUndoFirst.at>320||!originalUndoSame(originalUndoFirst.snapshot)))originalUndoFirst=null;
    originalUndoContact={at:now,points:originalUndoPoints(points),snapshot:originalUndoSnapshot(),paired:false,ended:[]};
    return;
  }
  // Real events can deliver both fingers together, or within 80 ms of each other.
  if(points.length!==2||originalPinchTouches||originalPinch||originalPinchPan){cancelOriginalUndoTap();return;}
  let contact=originalUndoContact;
  if(!contact){
    if(event.changedTouches.length!==2){cancelOriginalUndoTap();return;}
    contact={at:now,points:originalUndoPoints(points),snapshot:originalUndoSnapshot(),paired:false,ended:[]};
  }
  if(now-contact.at>80||!originalUndoSame(contact.snapshot)
      ||!contact.points.every(p=>points.some(t=>t.identifier===p.id&&originalUndoNear(p,{x:t.clientX,y:t.clientY},6)))
      ||originalPinchDistance(points)<8){cancelOriginalUndoTap();return;}
  contact.points=originalUndoPoints(points);contact.paired=true;originalUndoContact=contact;
}
function originalUndoMove(event){
  const contact=originalUndoContact;if(!contact)return false;
  const points=originalUndoPoints(event.touches);
  if(!originalUndoAllowed()||!event.cancelable||!originalUndoSame(contact.snapshot)
      ||performance.now()-contact.at>240
      ||points.some(p=>!contact.points.some(start=>start.id===p.id&&originalUndoNear(start,p,6)))){
    cancelOriginalUndoTap();return false;
  }
  // No pinch transform or native pan has committed while this pair is stationary.
  if(contact.paired){event.preventDefault();return true;}
  return false;
}
function originalUndoEnd(event){
  const contact=originalUndoContact;if(!contact)return false;
  const now=performance.now(),changed=originalUndoPoints(event.changedTouches);
  if(event.type!=='touchend'||!event.cancelable||!originalUndoAllowed()||!originalUndoSame(contact.snapshot)
      ||now-contact.at>240||!contact.paired
      ||changed.some(p=>!contact.points.some(start=>start.id===p.id&&originalUndoNear(start,p,6)))){
    cancelOriginalUndoTap();return false;
  }
  for(const p of changed)if(!contact.ended.includes(p.id))contact.ended.push(p.id);
  if(event.touches.length){
    contact.firstEnd??=now;return false;
  }
  originalUndoContact=null;
  if(contact.ended.length!==2||(contact.firstEnd!=null&&now-contact.firstEnd>80)){originalUndoFirst=null;return false;}
  const first=originalUndoFirst;originalUndoFirst=null;
  if(first&&contact.at-first.at<=320&&originalUndoSame(first.snapshot)
      &&(contact.points.every((p,i)=>originalUndoNear(p,first.points[i],36))
        ||contact.points.every((p,i)=>originalUndoNear(p,first.points[1-i],36))))return true;
  originalUndoFirst={at:now,points:contact.points,snapshot:contact.snapshot};return false;
}
function originalPdfPaintPaused(optional=true){
  if(!originalPinch && !originalPinchTouches && (!optional || !originalPdfContacts) && !(typeof BreezePdfInk!=='undefined' && BreezePdfInk.busy())) return false;
  originalPdfRenderPending = true;
  return true;
}
function resumeOriginalPdfPaint(){
  if(originalPdfContacts || originalPinch || !originalPdfRenderPending) return;
  originalPdfRenderPending = false;
  if(originalSession?.kind==='pdf'){
    document.querySelectorAll('.pdf-source-page [data-pdf-retired]').forEach(node=>node.remove());
    releaseDistantPdfPages(originalSession,0);
  }
  resharpenOriginalPages();
}
function originalFingerContacts(event){
  return Array.from(event.touches).filter(point=>point.touchType!=='stylus'
    && (typeof BreezePdfInk==='undefined' || BreezePdfInk.finger(point)));
}
function countOriginalPdfContacts(event){
  originalPdfContacts = originalFingerContacts(event).filter(point=>
    point.target && point.target.closest && point.target.closest('#original-stage')).length;
}

function originalPinchBusy(){ return !!originalPinch; }
function readerManipulationConsumes(event){
  if(event.type === 'pointerdown' && !originalPinchTouches && !originalPinch){
    originalPinchTail = false;
  }
  return (typeof originalNavigationConsumes==='function'&&originalNavigationConsumes(event)) || originalPinchTouches || !!originalPinch || (event.type === 'click' && event.detail !== 0 && originalPinchTail);
}
function originalPinchTarget(target){
  if(!originalZoomActive() || !target || typeof target.closest !== 'function') return false;
  if(sentenceModalOpen() || wordModalCovers() || aaPopOpen()) return false;
  return !!target.closest('#original-stage');
}
function originalPinchMiddle(points){
  return {x:(points[0].clientX+points[1].clientX)/2,
          y:(points[0].clientY+points[1].clientY)/2};
}
function originalPinchDistance(points){
  return Math.hypot(points[0].clientX-points[1].clientX,
                    points[0].clientY-points[1].clientY);
}
function beginOriginalPinch(center, distance, ids){
  if(typeof sentenceWaitingActive==='function' && sentenceWaitingActive()
      && typeof closeSentence==='function') closeSentence();
  if(typeof wordPeekOpen==='function'&&wordPeekOpen()&&typeof closePanel==='function') closePanel();
  if(typeof pinReaderChrome==='function') pinReaderChrome(true,'zoom');
  const box = readerScroller(), layer = originalZoomLayer(), stage = originalZoomStage();
  // A deliberate pinch supersedes delayed mode-landing restores (360/900ms).
  readerModeChangeToken++;
  layoutOriginalZoom();
  const outer = box.getBoundingClientRect(), origin = originalZoomOrigin();
  const level = originalZoom();
  originalPinch = {
    box, layer, stage, outer, origin, distance, ids, level, next:level,
    width:box.clientWidth, viewportHeight:box.clientHeight, height:originalZoomBaseHeight,
    trailing:Math.max(0,box.scrollHeight-origin.y-originalZoomBaseHeight*level),
    paper:{x:(box.scrollLeft+center.x-outer.left-origin.x)/level,
           y:(box.scrollTop+center.y-outer.top-origin.y)/level},
    center, position:{x:box.scrollLeft,y:box.scrollTop},
  };
  originalPinchTail = true;
  cancelGesture('paper manipulation');
  stage.classList.add('pinching');
}
function previewOriginalPinch(){
  originalPinchFrame = 0;
  const pinch = originalPinch;
  if(!pinch) return;
  const {box,origin,outer,paper,center,next} = pinch;
  /* Use the initial paper coordinate, never re-sample under a moving midpoint.
     This also permits two-finger panning when scale is at either limit. */
  const maxX = Math.max(0,origin.x+pinch.width*next-box.clientWidth);
  const maxY = Math.max(0,origin.y+pinch.height*next+pinch.trailing-box.clientHeight);
  pinch.position = {
    x:Math.max(0,Math.min(maxX,origin.x+paper.x*next-(center.x-outer.left))),
    y:Math.max(0,Math.min(maxY,origin.y+paper.y*next-(center.y-outer.top))),
  };
  // Native scrolling/bounce can change the offset after pinch acquisition.
  // Cancel that current offset, not the captured one, to keep the paper point
  // under the fingers without writing scrollLeft/Top during the gesture.
  pinch.layer.style.transform = `translate(${box.scrollLeft-pinch.position.x}px,${box.scrollTop-pinch.position.y}px) scale(${next})`;
}
function moveOriginalPinch(level, center){
  if(!originalPinch) return;
  originalPinch.manipulated=true;
  originalPinch.next = Math.max(ORIGINAL_ZOOM_MIN,Math.min(ORIGINAL_ZOOM_MAX,level));
  originalPinch.center = center;
  if(!originalPinchFrame) originalPinchFrame = requestAnimationFrame(previewOriginalPinch);
}
function finishOriginalPinch(){
  if(!originalPinch) return;
  cancelAnimationFrame(originalPinchFrame);
  if(originalPinch.undoTap&&!originalPinch.manipulated){
    // Stationary taps never changed paper geometry; do not create a resize or
    // deferred restoration between taps by committing an identical zoom.
    originalPinch.stage.classList.remove('pinching');originalPinch=null;
    if(typeof pinReaderChrome==='function')pinReaderChrome(false,'zoom');
    return;
  }
  previewOriginalPinch();
  const pinch = originalPinch;
  originalPinch = null;
  pinch.stage.classList.remove('pinching');
  setOriginalZoom(pinch.next,null,pinch.position);
  resharpenOriginalPages();
  saveReadingState();
  if(typeof pinReaderChrome==='function') pinReaderChrome(false,'zoom');
}
function cancelOriginalPinch(){
  cancelOriginalUndoTap();
  if(typeof cancelOriginalNavigation==='function')cancelOriginalNavigation();
  cancelAnimationFrame(originalPinchFrame);
  originalPinchFrame = 0;
  const pinch = originalPinch;
  originalPinch = null;
  originalPinchTouches = false;
  originalPdfContacts = 0;
  if(pinch){
    pinch.stage.classList.remove('pinching');
    applyOriginalZoomTransform();
  }
  resumeOriginalPdfPaint();
  if(typeof pinReaderChrome==='function') pinReaderChrome(false,'zoom');
}
function originalPinchStart(event){
  // An end/cancel can be lost when UIKit takes a contact. A fresh event's live
  // touch list is authoritative; don't let an orphan preview own new fingers.
  // One remaining owner still belongs to the current pinch until it lifts.
  if(originalPinch && !originalFingerContacts(event).some(point=>originalPinch.ids.includes(point.identifier)))
    cancelOriginalPinch();
  // A reader's contact supersedes delayed automatic mode-landing restores.
  if(!readerPositionPending()&&originalFingerContacts(event).some(point=>point.target?.closest?.('#original-stage')))readerModeChangeToken++;
  if(typeof BreezePdfInk!=='undefined')BreezePdfInk.trace('pinch/start',event);
  countOriginalPdfContacts(event);
  if(typeof originalNavigationStart==='function')originalNavigationStart(event);
  originalUndoStart(event);
  if(originalPinchTouches){
    if(event.cancelable) event.preventDefault();
    return;
  }
  if(originalFingerContacts(event).length === 1) originalPinchPan = false;
  if(originalPinchPan) return;
  const points = originalFingerContacts(event);
  if(points.length !== 2 || !points.every(point=>originalPinchTarget(point.target))) return;
  /* A late second finger must not fight a pan the browser already owns. */
  if(!event.cancelable) return;
  const distance = originalPinchDistance(points);
  if(distance < 8) return;
  event.preventDefault();
  if(originalPinch) finishOriginalPinch();
  originalPinchTouches = true;
  beginOriginalPinch(originalPinchMiddle(points),distance,points.map(point=>point.identifier));
  originalPinch.undoTap=!!originalUndoContact?.paired;
}
function originalPinchMove(event){
  if(typeof BreezePdfInk!=='undefined')BreezePdfInk.trace('pinch/move',event);
  if(originalUndoMove(event))return;
  if(typeof originalNavigationMove==='function'&&originalNavigationMove(event))return;
  if(!originalPinchTouches){
    if(originalFingerContacts(event).length === 1) originalPinchPan = true;
    return;
  }
  if(!event.cancelable){ cancelOriginalPinch(); return; }
  event.preventDefault();
  const pinch = originalPinch;
  if(!pinch) return; // Remaining finger belongs to this pinch until lifted.
  if(!originalZoomActive()){ cancelOriginalPinch(); return; }
  const points = pinch.ids.map(id=>originalFingerContacts(event).find(point=>point.identifier === id));
  if(points.some(point=>!point)) return;
  moveOriginalPinch(pinch.level*originalPinchDistance(points)/pinch.distance,originalPinchMiddle(points));
}
function originalPinchEnd(event){
  const undo=originalUndoEnd(event);
  if(typeof originalNavigationEnd==='function')originalNavigationEnd(event);
  if(typeof BreezePdfInk!=='undefined')BreezePdfInk.trace('pinch/end',event);
  const owners=originalPinch?.ids;
  // A delayed terminal callback for an older contact cannot finish a new pinch.
  if(owners && !Array.from(event.changedTouches).some(point=>owners.includes(point.identifier)))return;
  countOriginalPdfContacts(event);
  if(!originalFingerContacts(event).length)originalPinchPan=false;
  if(!originalPinchTouches){ resumeOriginalPdfPaint(); return; }
  if(event.cancelable) event.preventDefault();
  // Retain the gesture while either original owner remains, including a partial
  // touchcancel. Unrelated new fingers must not hold an ended pinch hostage.
  if(!originalFingerContacts(event).some(point=>!owners || owners.includes(point.identifier))){
    finishOriginalPinch();
    originalPinchTouches = false;
    if(undo)BreezePdfInk.undo();
  }
}
(function(){
  const start = ()=>{
    const box = readerScroller();
    if(!box) return;
    // Only the final restored page can accept reading gestures. Chrome remains
    // usable, including Back and mode switching; programmatic layout still runs.
    const guardOpening=event=>{
      if(!readerPositionPending())return;
      if(event.type==='keydown'&&!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','PageDown','PageUp','Home','End',' '].includes(event.key))return;
      if(event.cancelable)event.preventDefault();
      event.stopImmediatePropagation();
    };
    for(const type of ['touchstart','touchmove','wheel','keydown'])
      box.addEventListener(type,guardOpening,{capture:true,passive:false});
    box.addEventListener('scroll',()=>{
      if((originalUndoContact&&!originalUndoSame(originalUndoContact.snapshot))
          ||(originalUndoFirst&&!originalUndoSame(originalUndoFirst.snapshot)))cancelOriginalUndoTap();
      if(originalPinch && !originalPinchFrame)
        originalPinchFrame=requestAnimationFrame(previewOriginalPinch);
      if(originalSession?.kind==='pdf'){
        originalSession.lastScrollAt=performance.now();
        if(!readerPositionPending()&&!readerScrollWasProgrammatic())readerModeChangeToken++;
        schedulePdfPaint(originalSession);
        schedulePdfSharpen(originalSession);
      }
    },{passive:true});
    // Observe added contacts even on chrome: a second finger can land and lift
    // there without the first finger moving. Keep one start route, and only
    // admit paper input after the same opening/surface boundary as before.
    document.addEventListener('touchstart',event=>{
      if(readerPositionPending()||!(event.target instanceof Node)||!box.contains(event.target)){
        cancelOriginalUndoTap();
        if(typeof cancelOriginalNavigation==='function')cancelOriginalNavigation();
        return;
      }
      originalPinchStart(event);
    },{passive:false,capture:true});
    box.addEventListener('touchmove',originalPinchMove,{passive:false});
    document.addEventListener('touchend',originalPinchEnd,{passive:false,capture:true});
    document.addEventListener('touchcancel',originalPinchEnd,{passive:false,capture:true});
  };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start);
  else start();
  window.addEventListener('blur',cancelOriginalPinch);
  window.addEventListener('resize',cancelOriginalUndoTap);
  document.addEventListener('pointercancel',cancelOriginalUndoTap,{capture:true,passive:true});
  // Pointer capture normally releases after pointerup; only an unexpected loss
  // invalidates the touch sequence. This observes lifecycle, never owns input.
  const releasedPointers=new Set();
  document.addEventListener('pointerdown',e=>releasedPointers.delete(e.pointerId),{capture:true,passive:true});
  document.addEventListener('pointerup',e=>{
    releasedPointers.add(e.pointerId);
    if(releasedPointers.size>8)releasedPointers.delete(releasedPointers.values().next().value);
  },{capture:true,passive:true});
  document.addEventListener('lostpointercapture',e=>{
    if(!releasedPointers.delete(e.pointerId))cancelOriginalUndoTap();
  },{capture:true,passive:true});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden) cancelOriginalPinch();
  });
})();
