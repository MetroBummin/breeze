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
let checkViewportLock = ()=>{};
(function(){
  const vv = window.visualViewport;
  if(!vv) return;
  const VARS = ['--vv-x','--vv-y','--vv-dx','--vv-dy','--vv-k'];
  const root = document.documentElement;
  let frame = 0, idle = 0, still = 0, last = '', zoomed = false, pinnedForZoom = false;

  /* ---- 벌어져 있나 ----
     들어가는 문턱과 나오는 문턱이 다릅니다. 손가락을 뗀 뒤에도 배율은 한동안
     1.00 언저리에서 미세하게 떨립니다. 문턱이 하나면 그 떨림에 맞춰 상단바가
     투명했다 종이색이었다 하고, 노치 옆이 막혔다 뚫렸다 합니다. 벌린 것으로
     보려면 6% 는 커져야 하고, 한 번 그렇게 본 뒤에는 2% 아래로 내려와야
     놓습니다. */
  function measure(){
    const scale = vv.scale || 1;
    zoomed = zoomed ? scale > 1.02 : scale > 1.06;
    if(!zoomed) return null;
    const layoutWidth = root.clientWidth, layoutHeight = root.clientHeight;
    return {k:1/scale, x:vv.offsetLeft, y:vv.offsetTop,
            /* 오른쪽·아래에 붙은 것들은 "문서 끝에서 보이는 끝까지" 의 차이만큼 당깁니다. */
            dx:vv.offsetLeft + vv.width  - layoutWidth,
            dy:vv.offsetTop  + vv.height - layoutHeight};
  }

  function apply(view){
    document.body.classList.toggle('vv-zoom', !!view);
    if(view){
      root.style.setProperty('--vv-k', String(view.k));
      root.style.setProperty('--vv-x', view.x+'px');
      root.style.setProperty('--vv-y', view.y+'px');
      root.style.setProperty('--vv-dx', view.dx+'px');
      root.style.setProperty('--vv-dy', view.dy+'px');
    }else{
      VARS.forEach(name => root.style.removeProperty(name));
    }
    /* 벌린 동안에는 상단바를 스크롤 방향에 맡기지 않습니다 (scripts/reader/reader.js).
       들고 놓는 순간에만 알립니다 — 미는 내내 알리면 놓아 준 뒤의 유예가 계속
       뒤로 밀려서, 손을 뗀 다음에도 상단바가 한참 멎어 있습니다. */
    if(pinnedForZoom !== !!view){
      pinnedForZoom = !!view;
      if(typeof pinReaderChrome === 'function') pinReaderChrome(pinnedForZoom, 'zoom');
    }
  }

  /* ---- 벌어져 있는 동안에는 계속 지켜봅니다 ----
     이 값들은 한때 `visualViewport` 가 알려 줄 때만 다시 계산했고, 그다음에는
     0.25초마다 확인했습니다. 둘 다 모자랐습니다. 벌리는 동안 화면은 컴포지터가
     혼자 그리고 `requestAnimationFrame` 은 그동안 밀려 있다가 나중에 한꺼번에
     도는데, 손을 떼고 배율이 미끄러져 돌아가는 마지막 한 번은 아무 이벤트도
     없이 끝나는 일이 있습니다. 그 한 번을 놓치면 `--vv-k` 가 벌리던 도중의
     값(예: 0.4)에 굳어, 화면은 제 크기인데 오른쪽 아래 단추 둘만 그 배율로
     남습니다 — 갑자기 작아지고 자리도 밀린 채로. 0.25초 확인은 그것을 늦게나마
     고쳤지만, 대신 미는 내내 단추가 네 번씩 뒤늦게 따라와 춤을 췄습니다.

     그래서 벌어져 있는 동안에는 매 프레임 봅니다. 하는 일은 숫자 다섯 개를
     읽어 지난번과 견주는 것뿐이고, 바뀌었을 때만 씁니다. 1.5초쯤 가만히 있으면
     느린 확인(0.4초)으로 내려갔다가, 다시 움직이면 곧바로 매 프레임으로
     돌아옵니다. 제 크기로 돌아오는 순간 값을 지우고 지켜보는 것도 멈춥니다. */
  function tick(){
    frame = 0;
    const view = measure();
    const stamp = view ? [view.k,view.x,view.y,view.dx,view.dy].join(' ') : '';
    if(stamp !== last){ last = stamp; still = 0; apply(view); }
    else still++;
    if(!view) return;                       // 제 크기 — 지켜볼 것이 없습니다
    if(still < 90) frame = requestAnimationFrame(tick);
    else idle = setTimeout(watchViewport, 400);
  }
  function watchViewport(){
    if(idle){ clearTimeout(idle); idle = 0; }
    if(!frame) frame = requestAnimationFrame(tick);
  }
  checkViewportLock = watchViewport;
  vv.addEventListener('resize', watchViewport);
  vv.addEventListener('scroll', watchViewport);
  /* 손짓이 끝나는 자리도 직접 짚어 둡니다 — 이벤트 하나가 빠져도 여기서 걸립니다. */
  ['gestureend','touchend','touchcancel'].forEach(type =>
    document.addEventListener(type, watchViewport, {passive:true}));
  /* 다른 앱에 갔다 돌아오면 타이머는 멈춰 있습니다. 돌아온 김에 한 번. */
  window.addEventListener('pageshow', watchViewport);
  document.addEventListener('visibilitychange', watchViewport);
})();

/* ---- 벌어진 화면을 제 크기로 되돌립니다 ----
   글자 화면은 벌리지 않기로 했는데, 원본에서 벌린 채로 건너오면 그 배율 그대로
   글자 화면이 열렸습니다. 벌리기를 막아 둔 화면이 벌어진 채로 있는 셈이라
   되돌릴 길도 없었습니다.

   배율을 내리는 API 는 없습니다. 있는 것은 `<meta name=viewport>` 하나뿐이고,
   거기에 `maximum-scale=1` 을 얹으면 사파리가 지금 배율을 그 한도까지 끌어
   내립니다. 그대로 두면 원본으로 돌아갔을 때 벌릴 수 없으므로, 한 번 내린 뒤
   원래 문장으로 되돌려 놓습니다. 처음 문장은 시작할 때 한 번만 적어 두어,
   연달아 불러도 얹은 문장이 다시 얹히지 않습니다. */
const VIEWPORT_META = document.querySelector('meta[name="viewport"]');
const VIEWPORT_BASE = VIEWPORT_META ? VIEWPORT_META.getAttribute('content') : '';
let viewportResetTimer = 0;
function resetPageZoom(){
  const vv = window.visualViewport;
  if(!VIEWPORT_META || !vv || (vv.scale || 1) <= 1.02) return;
  VIEWPORT_META.setAttribute('content', VIEWPORT_BASE + ', maximum-scale=1, user-scalable=0');
  checkViewportLock();     // 되돌아온 배율을 기다리지 않고 바로 확인합니다
  clearTimeout(viewportResetTimer);
  viewportResetTimer = setTimeout(()=>{
    VIEWPORT_META.setAttribute('content', VIEWPORT_BASE);
    checkViewportLock();
  }, 400);
}

/* ================= 글자 화면은 벌려도 커지지 않습니다 =================

   원본은 종이를 찍은 그림이라, 작은 글씨를 보는 길이 벌리기밖에 없습니다.
   글자 화면은 다릅니다 — 글자 크기는 Aa 안에 있고, 그쪽은 줄바꿈까지 다시
   흘려서 화면 폭에 맞춰 줍니다. 벌리기는 같은 일을 더 나쁘게 합니다. 한 줄을
   읽으려고 옆으로 밀어야 하고, 떠 있는 것들을 배율의 역수로 되돌리는 계산이
   글을 읽는 내내 한 겹 얹힙니다. 그래서 여기서는 아예 받지 않습니다.

   `user-scalable=no` 로는 안 됩니다 — 아이폰이 오래전부터 무시합니다. 사파리가
   듣는 것은 제 손짓 이벤트(`gesturestart`)이고, 그 밖의 브라우저는 CSS 의
   `touch-action` 을 듣습니다(styles/reader.css). 둘 다 걸어 둡니다.

   이미 벌어져 있으면 막지 않습니다. 원본에서 벌린 채로 글자 화면에 건너온
   사람에게서 되돌릴 손짓까지 뺏으면, 벌어진 화면에 갇힙니다. */
(function(){
  const vv = window.visualViewport;
  const refuse = ()=> document.body.classList.contains('reading')
                   && !document.body.classList.contains('reader-original')
                   && !(vv && (vv.scale || 1) > 1.02);
  /* 손가락 두 개짜리 손짓에서만 오는 이벤트입니다. 스크롤에는 닿지 않으므로
     `touchmove` 를 통째로 붙잡을 때처럼 읽는 손맛을 깎지 않습니다. */
  ['gesturestart','gesturechange'].forEach(type=>
    document.addEventListener(type, event=>{ if(refuse()) event.preventDefault(); },
      {passive:false}));
})();
