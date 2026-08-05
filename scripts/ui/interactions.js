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
