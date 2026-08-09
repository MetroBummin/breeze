/* ================= 읽는 화면의 스크롤과 확대 =================

   예전에는 문서(`window`)가 스크롤했고, 상단바·진행줄·단추·시트는 그 위에
   `sticky`/`fixed` 로 얹혀 있었습니다. 확대는 브라우저 몫이었습니다 — 손가락으로
   벌리면 화면 **전체**가 커지니, 떠 있는 것들만 배율의 역수로 되돌리는 보정이
   필요했습니다.

   그 보정은 원리적으로 늦습니다. 벌어지는 그림은 컴포지터가 혼자 그리고
   자바스크립트는 그 뒤를 따라가므로, 벌리는 내내 오른쪽 아래 단추가 딸려
   다녔습니다. 매 프레임 확인해도 마지막 한 번은 아무 이벤트 없이 끝나서,
   단추가 벌리던 도중의 배율에 굳는 일이 남았습니다.

   그래서 주인을 바꿉니다.

     읽는 동안 문서는 아예 스크롤하지 않습니다 (`html`·`body` 가 화면에
     못 박힙니다). 스크롤은 이 칸 하나가 합니다 — `#reader-scroll`.
     상단바·진행줄·단추·시트는 그 칸 **바깥**이라 확대와 물리적으로 무관합니다.
     되돌릴 것이 없으니 보정도 없습니다.

   확대는 원본 종이(`#original-zoom`)에만 걸리는 CSS `transform` 입니다. 종이만
   커지고 나머지는 제 크기입니다. 문서 폭은 한 번도 안 변하므로 — 늘어나는 것은
   이 칸 안쪽뿐입니다 — 폰 브라우저가 화면을 축소할 이유도 없습니다.

   글자 화면은 확대하지 않습니다. 글자 크기는 Aa 안에 있고 그쪽은 줄바꿈까지
   다시 흘려 줍니다. 벌리기는 같은 일을 더 나쁘게 합니다 — 한 줄을 읽으려고
   옆으로 밀어야 하니까요. 그래서 글자 화면으로 건너오면 배율은 1 로 돌아갑니다
   (`scripts/reader/reader-modes.js`). */

/* ---- 스크롤 주인 ----
   읽는 칸이 아직 없거나(부팅 중) 서재·단어장을 보고 있을 때는 문서가 그대로
   주인입니다. 그래야 이 함수들이 어느 화면에서 불려도 말이 됩니다. */
function readerScroller(){
  return document.getElementById('reader-scroll');
}
function readerScrollTop(){
  const box = readerScroller();
  return box ? box.scrollTop : (window.scrollY || 0);
}
function readerScrollTo(y){
  const top = Math.max(0, y || 0);
  const box = readerScroller();
  if(box) box.scrollTop = top; else window.scrollTo(0, top);
}
function readerScrollBy(dy){
  if(!dy) return;
  readerScrollTo(readerScrollTop() + dy);
}
function readerViewHeight(){
  const box = readerScroller();
  return (box && box.clientHeight) || window.innerHeight;
}
function readerContentHeight(){
  const box = readerScroller();
  return box ? box.scrollHeight : document.documentElement.scrollHeight;
}

/* ================= 원본 종이의 배율 =================

   `#original-stage` 는 자리만 차지하는 빈 칸입니다 — 크기를 "확대된 종이"로
   적어 두면 스크롤할 거리가 생깁니다. `#original-zoom` 은 그 위에 떠서
   (`position:absolute`) 실제 종이를 그리고, 레이아웃 폭은 **늘 기준 폭**
   그대로입니다. 커지는 것은 `transform` 뿐입니다.

   레이아웃 폭이 안 변하는 것이 요점입니다. PDF 캔버스는 `clientWidth` 를 보고
   자기 크기를 정하는데, 그 값이 확대할 때마다 바뀌면 벌릴 때마다 문서 전체가
   다시 흐릅니다. 지금은 벌려도 흐르지 않습니다 — 그린 그림을 늘릴 뿐이고,
   손을 떼면 그때 한 번 또렷하게 다시 그립니다. */
const ORIGINAL_ZOOM_MIN = 1, ORIGINAL_ZOOM_MAX = 6;
let originalZoomLevel = 1;
let originalZoomBaseHeight = 0;
let originalZoomPinchedAt = 0;

function originalZoomStage(){ return document.getElementById('original-stage'); }
function originalZoomLayer(){ return document.getElementById('original-zoom'); }
function originalZoom(){ return originalZoomLevel; }
/* ---- 벌리는 것은 PDF 뿐입니다 ----
   PDF 는 종이를 찍은 **그림**이라, 작은 글씨를 보는 길이 벌리기밖에 없습니다.
   EPUB 원본과 글자 화면은 글자라서 다릅니다 — 크기를 키우면 줄바꿈까지 다시
   흘러 화면 폭에 맞습니다. 벌리기는 같은 일을 더 나쁘게 합니다(한 줄을 읽으려고
   옆으로 밀어야 하니까요). 그래서 이 둘에서는 손짓을 아예 안 받고, 브라우저의
   벌리기도 막습니다 (`blockBrowserPinch`). */
function originalZoomActive(){
  if(!document.body.classList.contains('reader-original')) return false;
  if(!originalZoomLayer()) return false;
  return !!(typeof originalSession !== 'undefined' && originalSession && originalSession.kind === 'pdf');
}
/* 방금 벌렸나 — 낱말 탭이 손짓의 끝을 눌린 것으로 오해하지 않도록 (pdf-original.js) */
function originalZoomJustPinched(){
  return Date.now() - originalZoomPinchedAt < 350;
}

/* 확대된 종이가 차지할 자리를 다시 잽니다. 쪽이 그려지며 높이가 자라므로
   (PDF 는 처음엔 첫 쪽 비율로 자리만 잡아 둡니다) 한 번으로는 모자랍니다 —
   아래 `ResizeObserver` 가 자랄 때마다 이 함수를 부릅니다. */
function layoutOriginalZoom(){
  const stage = originalZoomStage(), layer = originalZoomLayer(), box = readerScroller();
  if(!stage || !layer || !box) return;
  const baseWidth = box.clientWidth;
  if(baseWidth > 0) layer.style.width = baseWidth + 'px';
  /* `offsetHeight` 는 레이아웃 값이라 `transform` 을 타지 않습니다 — 딱 필요한
     "확대 안 한 높이" 입니다. */
  originalZoomBaseHeight = layer.offsetHeight;
  stage.style.width  = Math.round(baseWidth * originalZoomLevel) + 'px';
  stage.style.height = Math.round(originalZoomBaseHeight * originalZoomLevel) + 'px';
}

function applyOriginalZoomTransform(){
  const layer = originalZoomLayer();
  if(!layer) return;
  layer.style.transform = originalZoomLevel === 1 ? '' : 'scale(' + originalZoomLevel + ')';
  layoutOriginalZoom();
}

/* 종이의 왼쪽 위가 스크롤 칸 안쪽 어디에 있는지. 위쪽 안내줄과 여백은 확대를
   타지 않으므로, 배율이 바뀌어도 이 값은 그대로입니다 — 손짓이 시작될 때 한 번
   재어 두고 벌리는 내내 씁니다. */
function originalZoomOrigin(){
  const stage = originalZoomStage(), box = readerScroller();
  if(!stage || !box) return {x:0, y:0};
  const outer = box.getBoundingClientRect(), inner = stage.getBoundingClientRect();
  return {x: inner.left - outer.left + box.scrollLeft,
          y: inner.top  - outer.top  + box.scrollTop};
}

/* 배율을 바꾸면서 `focus` 아래에 있던 종이의 한 점을 그 자리에 붙들어 둡니다.
   붙들지 않으면 벌릴 때마다 보던 줄이 화면 밖으로 흘러 나갑니다.
   `focus` 는 화면 좌표(손가락 두 개의 한가운데)이고, 없으면 화면 한가운데입니다. */
function setOriginalZoom(next, focus){
  const box = readerScroller();
  if(!box) return;
  const from = originalZoomLevel;
  const to = Math.max(ORIGINAL_ZOOM_MIN, Math.min(ORIGINAL_ZOOM_MAX, next || 1));
  if(Math.abs(to - from) < 0.0005) return;
  const outer = box.getBoundingClientRect();
  const fx = focus ? focus.x - outer.left : box.clientWidth / 2;
  const fy = focus ? focus.y - outer.top  : box.clientHeight / 2;
  const origin = (focus && focus.origin) || originalZoomOrigin();
  const px = (box.scrollLeft + fx - origin.x) / from;
  const py = (box.scrollTop  + fy - origin.y) / from;
  originalZoomLevel = to;
  applyOriginalZoomTransform();
  box.scrollLeft = Math.max(0, origin.x + px * to - fx);
  box.scrollTop  = Math.max(0, origin.y + py * to - fy);
}

/* 배율을 1 로 되돌립니다. 예전에는 `<meta name=viewport>` 에 `maximum-scale=1`
   을 얹었다 400ms 뒤에 떼는 꼼수였습니다 — 브라우저 배율을 내리는 API 가 없어서
   였습니다. 이제 배율은 우리 것이라 그냥 1 을 씁니다. */
function resetOriginalZoom(){
  if(originalZoomLevel === 1) return;
  const box = readerScroller();
  originalZoomLevel = 1;
  applyOriginalZoomTransform();
  if(box) box.scrollLeft = 0;
}

/* ---- 손가락 두 개 ----
   벌리는 동안 브라우저의 기본 동작(화면 전체 확대, 관성 스크롤)은 막고 우리가
   그립니다. 손가락 한 개짜리 스크롤에는 손대지 않습니다 — `touchmove` 를 통째로
   붙잡으면 읽는 손맛이 깎입니다.

   벌어지는 것은 PDF 뿐이고 PDF 는 우리 문서 안에 있으므로, 귀는 여기 하나면
   됩니다. EPUB 은 샌드박스 iframe 이라 그 안의 손짓이 우리 문서까지 올라오지
   않는데 — 벌릴 일이 없으니 상관없습니다. 그쪽 틀에는 브라우저의 벌리기를 막는
   귀만 답니다 (`blockBrowserPinch`). */
let originalPinch = null;

function originalZoomPinchStart(points){
  if(!originalZoomActive() || !points || points.length !== 2){ originalPinch = null; return; }
  originalPinch = {distance: originalPinchSpread(points),
                   level: originalZoomLevel,
                   origin: originalZoomOrigin()};
  originalZoomPinchedAt = Date.now();
  const layer = originalZoomLayer();
  if(layer) layer.classList.add('pinching');
  /* ---- 벌리는 동안 상단바는 그대로 ----
     손가락 아래를 붙들어 두려고 `scrollTop` 을 크게 옮깁니다. 그것을 읽는
     방향으로 세면 벌리는 내내 상단바가 걷혔다 돌아왔다 합니다 — 벌리는 것은
     읽어 내려가는 것이 아니라 들여다보는 것입니다.

     예전에도 같은 핀이 있었지만 그때는 `visualViewport` 를 매 프레임 훔쳐보며
     "지금 벌어져 있나"를 짐작했고, 마지막 한 번을 놓치면 핀이 안 풀려 상단바가
     영영 안 걷혔습니다. 지금은 손짓의 시작과 끝이 우리 손에 있습니다. */
  if(typeof pinReaderChrome === 'function') pinReaderChrome(true, 'zoom');
}

function originalZoomPinchMove(points){
  if(!originalPinch || !points || points.length !== 2) return;
  const centre = originalPinchMiddle(points);
  const ratio = originalPinchSpread(points) / originalPinch.distance;
  originalZoomPinchedAt = Date.now();
  setOriginalZoom(originalPinch.level * ratio,
                  {x:centre.x, y:centre.y, origin:originalPinch.origin});
}

function originalZoomPinchEnd(){
  if(!originalPinch) return;
  originalPinch = null;
  originalZoomPinchedAt = Date.now();
  const layer = originalZoomLayer();
  if(layer) layer.classList.remove('pinching');
  if(typeof pinReaderChrome === 'function') pinReaderChrome(false, 'zoom');
  /* 늘린 그림은 조금 흐립니다. 손을 뗀 지금 새 배율로 다시 그립니다.
     벌리는 도중이 아니라 여기인 것이 중요합니다 — 캔버스를 다시 그리는 일은
     손짓 한가운데에 끼우기에는 무겁습니다 (`scripts/reader/pdf-original.js`). */
  if(typeof resharpenOriginalPages === 'function') resharpenOriginalPages();
  if(typeof saveReadingState === 'function') saveReadingState();
}

function originalPinchSpread(points){
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) || 1;
}
function originalPinchMiddle(points){
  return {x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2};
}
function originalPinchPoints(touches){
  const points = [];
  for(let index = 0; index < Math.min(2, touches.length); index++){
    points.push({x: touches[index].clientX, y: touches[index].clientY});
  }
  return points;
}

/* ---- 브라우저의 벌리기는 어디서나 막습니다 ----
   사파리는 `touch-action` 만으로 제 확대를 다 놓지 않습니다. 제 손짓 이벤트도
   함께 막아야 합니다. 읽는 동안에는 세 화면 모두 — PDF 는 우리가 대신 벌리고,
   EPUB 과 글자 화면은 애초에 벌릴 일이 없습니다.
   EPUB 틀(iframe)은 제 문서라 우리 쪽 귀가 안 닿습니다. 그래서 저쪽에도 이
   함수를 한 번 겁니다 (`scripts/reader/epub-original.js`). */
function blockBrowserPinch(doc){
  ['gesturestart','gesturechange','gestureend'].forEach(type=>
    doc.addEventListener(type, event=>{
      if(document.body.classList.contains('reading')) event.preventDefault();
    }, {passive:false}));
}

/* 벌어지는 것은 PDF 뿐이고 PDF 는 우리 문서 안에 있으므로 귀는 여기 하나입니다. */
(function(){
  document.addEventListener('touchstart', event=>{
    if(event.touches.length !== 2){ originalPinch = null; return; }
    originalZoomPinchStart(originalPinchPoints(event.touches));
  }, {passive:true});
  document.addEventListener('touchmove', event=>{
    if(!originalPinch || event.touches.length !== 2) return;
    /* 여기서만 막습니다. 이 손짓은 스크롤이 아니라 확대입니다. */
    event.preventDefault();
    originalZoomPinchMove(originalPinchPoints(event.touches));
  }, {passive:false});
  document.addEventListener('touchend', event=>{
    if(event.touches.length < 2) originalZoomPinchEnd();
  }, {passive:true});
  document.addEventListener('touchcancel', originalZoomPinchEnd, {passive:true});
  blockBrowserPinch(document);
})();

/* 쪽이 그려지면 종이가 자랍니다. 자란 만큼 자리도 늘려 둡니다.

   지켜보는 것을 변수에 담아 둡니다. `new ResizeObserver(...).observe(x)` 처럼
   붙잡지 않고 두면 브라우저가 이것을 쓰레기로 보고 치워 버립니다 — 처음 한 번은
   불리고 그 뒤로 영영 조용해집니다. 실제로 그렇게 겪었습니다: 290쪽짜리 PDF 가
   다 그려졌는데도 자리는 0 인 채였습니다. */
let originalZoomWatchers = [];
(function(){
  if(!window.ResizeObserver) return;
  const start = ()=>{
    const layer = originalZoomLayer(), box = readerScroller();
    if(!layer || !box) return;
    const growth = new ResizeObserver(()=>{
      /* 배율이 그대로여도 높이는 자랍니다. 자란 만큼만 다시 적습니다. */
      if(Math.abs(layer.offsetHeight - originalZoomBaseHeight) > 0.5) layoutOriginalZoom();
    });
    growth.observe(layer);
    const reflow = new ResizeObserver(()=>layoutOriginalZoom());
    reflow.observe(box);
    originalZoomWatchers = [growth, reflow];
  };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
