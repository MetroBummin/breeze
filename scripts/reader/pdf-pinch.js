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
function originalPdfPaintPaused(){
  if(!originalPinch && !originalPdfContacts) return false;
  originalPdfRenderPending = true;
  return true;
}
function resumeOriginalPdfPaint(){
  if(originalPdfContacts || originalPinch || !originalPdfRenderPending) return;
  originalPdfRenderPending = false;
  resharpenOriginalPages();
}
function countOriginalPdfContacts(event){
  originalPdfContacts = Array.from(event.touches).filter(point=>
    point.target && point.target.closest && point.target.closest('#original-stage')).length;
}

function originalPinchBusy(){ return !!originalPinch; }
function readerManipulationConsumes(event){
  if(event.type === 'pointerdown' && !originalPinchTouches && !originalPinch){
    originalPinchTail = false;
  }
  return originalPinchTouches || !!originalPinch || (event.type === 'click' && event.detail !== 0 && originalPinchTail);
}
function originalPinchTarget(target){
  if(!originalZoomActive() || !target || typeof target.closest !== 'function') return false;
  if(document.body.classList.contains('reader-mode-transition')) return false;
  if(sentenceModalOpen() || wordSheetCovers() || aaPopOpen()) return false;
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
  if(typeof pinReaderChrome==='function') pinReaderChrome(true,'zoom');
  const box = readerScroller(), layer = originalZoomLayer(), stage = originalZoomStage();
  // A deliberate pinch supersedes delayed mode-landing restores (360/900ms).
  readerModeChangeToken++;
  layoutOriginalZoom();
  const outer = box.getBoundingClientRect(), origin = originalZoomOrigin();
  const level = originalZoom();
  originalPinch = {
    box, layer, stage, outer, origin, distance, ids, level, next:level,
    left:box.scrollLeft, top:box.scrollTop,
    width:box.clientWidth, height:originalZoomBaseHeight,
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
  pinch.layer.style.transform = `translate(${pinch.left-pinch.position.x}px,${pinch.top-pinch.position.y}px) scale(${next})`;
}
function moveOriginalPinch(level, center){
  if(!originalPinch) return;
  originalPinch.next = Math.max(ORIGINAL_ZOOM_MIN,Math.min(ORIGINAL_ZOOM_MAX,level));
  originalPinch.center = center;
  if(!originalPinchFrame) originalPinchFrame = requestAnimationFrame(previewOriginalPinch);
}
function finishOriginalPinch(){
  if(!originalPinch) return;
  cancelAnimationFrame(originalPinchFrame);
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
  countOriginalPdfContacts(event);
  if(originalPinchTouches){
    if(event.cancelable) event.preventDefault();
    return;
  }
  if(event.touches.length === 1) originalPinchPan = false;
  if(originalPinchPan) return;
  const points = Array.from(event.touches);
  if(points.length !== 2 || !points.every(point=>originalPinchTarget(point.target))) return;
  /* A late second finger must not fight a pan the browser already owns. */
  if(!event.cancelable) return;
  const distance = originalPinchDistance(points);
  if(distance < 8) return;
  event.preventDefault();
  if(originalPinch) finishOriginalPinch();
  originalPinchTouches = true;
  beginOriginalPinch(originalPinchMiddle(points),distance,points.map(point=>point.identifier));
}
function originalPinchMove(event){
  if(!originalPinchTouches){
    if(event.touches.length === 1) originalPinchPan = true;
    return;
  }
  if(!event.cancelable){ cancelOriginalPinch(); return; }
  event.preventDefault();
  const pinch = originalPinch;
  if(!pinch) return; // Remaining finger belongs to this pinch until lifted.
  if(!originalZoomActive()){ cancelOriginalPinch(); return; }
  const points = pinch.ids.map(id=>Array.from(event.touches).find(point=>point.identifier === id));
  if(points.some(point=>!point)) return;
  moveOriginalPinch(pinch.level*originalPinchDistance(points)/pinch.distance,originalPinchMiddle(points));
}
function originalPinchEnd(event){
  countOriginalPdfContacts(event);
  if(!originalPinchTouches){ resumeOriginalPdfPaint(); return; }
  if(event.cancelable) event.preventDefault();
  // Keep the touched canvas attached until EVERY finger is lifted. Redrawing
  // after the first lift detaches the remaining Touch.target, so its touchend
  // may never bubble to document and the reader would stay locked.
  if(event.touches.length === 0){
    finishOriginalPinch();
    originalPinchTouches = false;
  }
}
(function(){
  const start = ()=>{
    const box = readerScroller();
    if(!box) return;
    box.addEventListener('touchstart',originalPinchStart,{passive:false});
    box.addEventListener('touchmove',originalPinchMove,{passive:false});
    document.addEventListener('touchend',originalPinchEnd,{passive:false,capture:true});
    document.addEventListener('touchcancel',()=>{
      originalPdfContacts = 0;
      finishOriginalPinch();
      resumeOriginalPdfPaint();
      originalPinchTouches = false;
    },{passive:true});
  };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start);
  else start();
  window.addEventListener('blur',cancelOriginalPinch);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden) cancelOriginalPinch();
  });
})();
