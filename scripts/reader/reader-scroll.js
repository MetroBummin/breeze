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
/* ---- 우리가 옮긴 화면과 사람이 민 화면 ----
   `scroll` 이벤트만 보면 둘을 구분할 수 없습니다. 예전에는 벽시계 유예 셋으로
   구분했고(`readerScrollPauseUntil` · `readerAnchorHoldUntil` · `chromePinned`),
   그 유예가 먼저 끝나 버리면 — 자리를 되돌리는 일 안에는 PDF 한 쪽을 그리는
   `await` 가 있어서 자주 그랬습니다 — 우리가 낸 스크롤이 "손으로 밀었다"로
   읽혔습니다. 상단바가 제멋대로 돌아오고, 누르던 손짓이 조용히 죽었습니다.

   시계가 아니라 값을 남깁니다. 우리가 마지막으로 적어 넣은 값과 지금 값이
   같으면 그 스크롤은 우리 것입니다. 얼마나 오래 걸리든 정확합니다. */
let lastProgrammaticScrollTop = null;
function readerScrollTo(y){
  const top = Math.max(0, y || 0);
  const box = readerScroller();
  if(box){ box.scrollTop = top; lastProgrammaticScrollTop = box.scrollTop; }
  else window.scrollTo(0, top);
  /* 자리를 옮겼으면 방금 잰 값은 옛 화면의 것입니다 — scripts/core/state.js */
  if(typeof invalidateReaderMeasurements === 'function') invalidateReaderMeasurements();
}
function readerScrollWasProgrammatic(){
  const box = readerScroller();
  if(!box || lastProgrammaticScrollTop === null) return false;
  return Math.abs(box.scrollTop - lastProgrammaticScrollTop) < 1;
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
   버튼을 누른 뒤 그때 한 번 또렷하게 다시 그립니다. */
const ORIGINAL_ZOOM_MIN = 1, ORIGINAL_ZOOM_MAX = 4, ORIGINAL_ZOOM_STEP = .5;
let originalZoomLevel = 1;
let originalZoomBaseHeight = 0;

function originalZoomStage(){ return document.getElementById('original-stage'); }
function originalZoomLayer(){ return document.getElementById('original-zoom'); }
function originalZoom(){ return originalZoomLevel; }
/* PDF만 한 단계씩 키웁니다. EPUB과 글자 화면은 이 배율을 쓰지 않습니다. */
function originalZoomActive(){
  if(!document.body.classList.contains('reader-original')) return false;
  if(!originalZoomLayer()) return false;
  return !!(typeof originalSession !== 'undefined' && originalSession && originalSession.kind === 'pdf');
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
  updateOriginalZoomControls();
}

/* 버튼을 누를 때만 중심점을 한 번 보정합니다. 손가락을 따라 scrollTop을
   반복 수정하지 않으므로 iOS의 관성 스크롤과 충돌하지 않습니다. */
function changeOriginalZoom(direction){
  if(!originalZoomActive()) return;
  setOriginalZoom(originalZoomLevel + (direction > 0 ? ORIGINAL_ZOOM_STEP : -ORIGINAL_ZOOM_STEP));
  if(typeof resharpenOriginalPages === 'function') resharpenOriginalPages();
  if(typeof saveReadingState === 'function') saveReadingState();
}

function updateOriginalZoomControls(){
  const controls=document.getElementById('aa-pdfzoom');
  const out=document.getElementById('pdfzoom-out'), inButton=document.getElementById('pdfzoom-in');
  if(!controls || !out || !inButton) return;
  const active=originalZoomActive();
  /* 확대 단추는 종이를 위한 도구입니다. 단어창이 열려 있으면 그 자리에는 사전
     조작이 우선이므로, 패널 위에 겹쳐 보이는 대신 잠시 접어 둡니다. */
  const panelOpen=document.getElementById('panel')?.classList.contains('on');
  controls.hidden=!active || panelOpen;
  out.disabled=!active || originalZoomLevel<=ORIGINAL_ZOOM_MIN;
  inButton.disabled=!active || originalZoomLevel>=ORIGINAL_ZOOM_MAX;
  const pct=document.getElementById('aa-pdfzoom-pct');
  if(pct) pct.textContent=active ? Math.round(originalZoomLevel*100)+'%' : '';
}

/* 배율을 1 로 되돌립니다. 예전에는 `<meta name=viewport>` 에 `maximum-scale=1`
   을 얹었다 400ms 뒤에 떼는 꼼수였습니다 — 브라우저 배율을 내리는 API 가 없어서
   였습니다. 이제 배율은 우리 것이라 그냥 1 을 씁니다. */
function resetOriginalZoom(){
  if(originalZoomLevel === 1){ updateOriginalZoomControls(); return; }
  const box = readerScroller();
  originalZoomLevel = 1;
  applyOriginalZoomTransform();
  if(box) box.scrollLeft = 0;
  updateOriginalZoomControls();
}

/* ---- 브라우저의 벌리기는 어디서도 안 씁니다 ----
   PDF 확대는 버튼만 담당합니다. Safari가 화면 전체를 확대하면 단추와 사전
   시트까지 함께 커지므로, 손가락 두 개는 읽기 화면에서 하지 않습니다.
   EPUB 틀(iframe)은 제 문서라 우리 쪽 귀가 안 닿습니다. 그래서 저쪽에도 이
   함수를 한 번 겁니다 (`scripts/reader/epub-original.js`).

   예전에는 읽는 동안(`body.reading`)만 막았습니다. 그런데 서재·단어장에는
   되돌릴 길이 없습니다 — 원생 확대는 앱이 아니라 브라우저(WKWebView)가
   쥐고 있는 배율이라, 화면을 옮겨도 풀리지 않고 상단바 같은 고정 요소만
   시야 밖으로 밀어냅니다. 그 화면들에도 확대로 얻을 것이 없으므로(글자
   크기는 Aa 가 따로 있습니다) 어디서든 막습니다. */
function blockBrowserPinch(doc){
  ['gesturestart','gesturechange','gestureend'].forEach(type=>
    doc.addEventListener(type, event=>event.preventDefault(), {passive:false}));
}

blockBrowserPinch(document);

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
