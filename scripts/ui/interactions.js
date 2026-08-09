/* bottom sheet: never let scrolling inside the sheet move the page behind it */
(function(){
  const panel = document.getElementById('panel');
  const bg = document.getElementById('sheetbg');
  const isSheet = () => window.matchMedia('(max-width:760px)').matches
                     && panel.classList.contains('on');
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

/* bottom sheet: drag handle to dismiss */
(function(){
  const panel = document.getElementById('panel');
  const handle = document.getElementById('p-handle');
  let startY=null, dy=0;
  handle.addEventListener('touchstart', e=>{
    startY = e.touches[0].clientY; dy=0;
    panel.style.transition='none';
  }, {passive:true});
  handle.addEventListener('touchmove', e=>{
    if(startY===null) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    panel.style.transform = 'translateY('+dy+'px)';
  }, {passive:true});
  const end = ()=>{
    if(startY===null) return;
    panel.style.transition=''; panel.style.transform='';
    if(dy>90) closePanel();
    startY=null; dy=0;
  };
  handle.addEventListener('touchend', end);
  handle.addEventListener('touchcancel', end);
})();

/* ================= 벌려도 시트는 그대로 =================

   원본 PDF 의 확대·축소 단추를 없애고 손가락에 맡겼습니다. 그런데 손가락으로
   화면을 벌리면 브라우저는 **페이지 전체**를 키웁니다 — 작은 글씨를 보려고
   두 배로 벌리면 뜻이 뜨는 바텀시트도 두 배가 되어 화면을 덮습니다. 벌릴수록
   답이 안 보이는 셈이라, 그것 때문에 한동안 단추를 달아 두었습니다.

   `visualViewport` 가 그 값을 냅니다. 배율(`scale`)과, 지금 화면이 문서의 어디를
   보고 있는지(`offsetLeft`·`offsetTop`·`width`·`height`)를 알려 줍니다. 떠 있는
   것들에만 그 **역수**를 걸어 두면, 페이지가 두 배로 커질 때 시트는 반으로
   줄어 결과가 원래 크기입니다. 자리도 함께 옮겨야 합니다 — `fixed` 는 보이는
   화면이 아니라 문서 기준이라, 벌린 채로 두면 시트가 화면 밖으로 나갑니다.

   벌리지 않은 동안에는 변수도 클래스도 없습니다. 평소의 화면은 이 코드가
   있기 전과 정확히 같습니다 — 값이 1 인 `scale` 도 걸어 두면 그 자체로
   포함 블록이 바뀌므로, 아예 걸지 않는 편이 안전합니다. */
(function(){
  const vv = window.visualViewport;
  if(!vv) return;
  const VARS = ['--vv-x','--vv-y','--vv-dx','--vv-dy','--vv-k'];
  const root = document.documentElement;
  let frame = 0;
  function paintViewportLock(){
    frame = 0;
    const scale = vv.scale || 1;
    /* 2% 는 흔들림입니다. 손가락을 뗀 뒤에도 배율이 1.000 으로 딱 떨어지지
       않는 기기가 있어서, 그 언저리는 벌리지 않은 것으로 봅니다. */
    const zoomed = scale > 1.02;
    document.body.classList.toggle('vv-zoom', zoomed);
    if(!zoomed){ VARS.forEach(name => root.style.removeProperty(name)); return; }
    const layoutWidth = root.clientWidth, layoutHeight = root.clientHeight;
    root.style.setProperty('--vv-k', String(1/scale));
    root.style.setProperty('--vv-x', vv.offsetLeft+'px');
    root.style.setProperty('--vv-y', vv.offsetTop+'px');
    /* 오른쪽·아래에 붙은 것들은 "문서 끝에서 보이는 끝까지" 의 차이만큼 당깁니다. */
    root.style.setProperty('--vv-dx', (vv.offsetLeft + vv.width  - layoutWidth )+'px');
    root.style.setProperty('--vv-dy', (vv.offsetTop  + vv.height - layoutHeight)+'px');
  }
  const scheduleViewportLock = ()=>{ if(!frame) frame = requestAnimationFrame(paintViewportLock); };
  vv.addEventListener('resize', scheduleViewportLock);
  vv.addEventListener('scroll', scheduleViewportLock);
})();
