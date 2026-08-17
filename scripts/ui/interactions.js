/* bottom sheet: never let scrolling inside the sheet move the page behind it */
(function(){
  const panel = document.getElementById('panel');
  const bg = document.getElementById('sheetbg');
  /* 시트인지 아닌지는 한 곳에서만 정합니다(`panelIsSheet`) — 경계가 옮겨질 때
     이 파일이 따라가지 못하면, 시트인데 뒤가 함께 밀리는 화면이 생깁니다. */
  const isSheet = () => panel.classList.contains('on')
                     && (typeof panelIsSheet === 'function' ? panelIsSheet()
                         : window.matchMedia('(max-width:760px)').matches);
  let ty = 0;
  panel.addEventListener('touchstart', e=>{ ty = e.touches[0].clientY; }, {passive:true});
  panel.addEventListener('touchmove', e=>{
    if(!isSheet()) return;
    const dy = e.touches[0].clientY - ty;          // >0 = dragging down (content scrolls up)
    const canScroll = panel.scrollHeight > panel.clientHeight + 1;
    if(!canScroll){ e.preventDefault(); return; }  // nothing to scroll -> don't pass it on
    const atTop = panel.scrollTop <= 0;
    const atBottom = panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 1;
    if((atTop && dy > 0) || (atBottom && dy < 0)) e.preventDefault();
  }, {passive:false});
  bg.addEventListener('touchmove', e=>{ if(isSheet()) e.preventDefault(); }, {passive:false});
})();

/* ---- 손잡이는 그림만 그립니다 ----
   시트가 손가락을 따라 내려오는 그림은 여기서 그립니다. 그런데 **닫을지 말지**
   를 정하는 일은 여기 있으면 안 됩니다 — 예전에는 이 파일이 제 손으로
   `closePanel()` 을 불러서, 손잡이를 끄는 한 번의 손짓이 두 곳에서 판정됐습니다
   (여기, 그리고 판정 계층). 지금은 거리(`SHEET_PULL_DISMISS`)를 보고 닫는 일이
   `scripts/reader/gesture.js` 의 `DISMISS_WORD` 하나뿐입니다. 여기 남는 것은
   따라오는 `transform` 과, 손을 뗐을 때 그것을 되돌리는 일입니다. */
(function(){
  const panel = document.getElementById('panel');
  const handle = document.getElementById('p-handle');
  let startY=null;
  handle.addEventListener('touchstart', e=>{
    startY = e.touches[0].clientY;
    panel.style.transition='none';
  }, {passive:true});
  handle.addEventListener('touchmove', e=>{
    if(startY===null) return;
    panel.style.transform = 'translateY('+Math.max(0, e.touches[0].clientY - startY)+'px)';
  }, {passive:true});
  const end = ()=>{
    if(startY===null) return;
    panel.style.transition=''; panel.style.transform='';
    startY=null;
  };
  handle.addEventListener('touchend', end);
  handle.addEventListener('touchcancel', end);
})();

/* ================= 벌려도 시트는 그대로 =================

   여기 있던 130줄은 브라우저의 벌리기와 싸우는 코드였습니다.

   손가락으로 화면을 벌리면 브라우저는 **페이지 전체**를 키웁니다 — 작은 글씨를
   보려고 두 배로 벌리면 뜻이 뜨는 바텀시트도 두 배가 되어 화면을 덮었습니다.
   그래서 `visualViewport` 가 알려 주는 배율과 자리를 매 프레임 읽어, 떠 있는
   것들에만 그 역수를 되걸었습니다(`--vv-k`, `--vv-x`…).

   그 값은 원리적으로 늦습니다. 벌어지는 그림은 컴포지터가 혼자 그리고
   자바스크립트는 그 뒤를 따라갑니다. 매 프레임 확인해도 배율이 미끄러져 돌아오는
   마지막 한 번은 아무 이벤트 없이 끝나는 일이 있어서, 오른쪽 아래 단추 둘만
   벌리던 도중의 배율에 굳어 남기도 했습니다.

   이제 확대는 종이 안쪽 일입니다 — `#original-zoom` 이 `transform` 으로 커지고,
   시트·단추·상단바는 그 바깥이라 애초에 안 커집니다. 되돌릴 것이 없으니 이
   파일에서 할 일도 없습니다. 손짓을 받는 곳은 한 군데뿐입니다:
   `scripts/reader/reader-scroll.js`.

   벌리기를 막는 일(`gesturestart` 가로채기)도 그쪽으로 옮겼습니다. 글자 화면은
   여전히 안 벌어지고, 원본 화면은 우리 손으로 벌어집니다. */
