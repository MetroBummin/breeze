/* Pull-to-refresh for the library views. Leave the scroll/bounce to the browser. */
let libraryRefreshTask=null;
const LIBRARY_PULL_START=10;
const LIBRARY_PULL_THRESHOLD=96;
const libraryRefreshMotion=(()=>{
  const indicator=document.getElementById('library-refresh');
  let frame=0,timer=0,owner='',distance=0;
  function paint(){
    frame=0;
    const progress=Math.min(1,distance/LIBRARY_PULL_THRESHOLD);
    indicator.style.opacity=String(progress);
    indicator.style.transform=`translate3d(-50%,${Math.round(24*(1-Math.exp(-distance/45)))}px,0)`;
  }
  function clear(){
    cancelAnimationFrame(frame);frame=0;
    clearTimeout(timer);timer=0;owner='';distance=0;
    indicator.classList.remove('pulling');
    indicator.hidden=true;
    indicator.style.removeProperty('opacity');
    indicator.style.removeProperty('transform');
  }
  function draw(next,pulling=false){
    clearTimeout(timer);
    owner=activeAppView();distance=next;
    indicator.classList.toggle('pulling',pulling);
    if(next>0)indicator.hidden=false;
    if(pulling){
      if(!frame)frame=requestAnimationFrame(paint);
      return;
    }
    cancelAnimationFrame(frame);
    paint();
    if(next===0)timer=setTimeout(clear,320);
  }
  return {draw,clear,changed:()=>!!owner && owner!==activeAppView()};
})();
function libraryRefreshAllowed(){
  return ['home','casuals','longform'].includes(activeAppView()) &&
    !document.querySelector('#settings-modal.on,#add-modal.on,#edit-modal.on,#onboarding:not([hidden])');
}
function refreshLibrary(){
  if(libraryRefreshTask) return libraryRefreshTask;
  if(!libraryRefreshAllowed()) return Promise.resolve();
  const view=activeAppView();
  const indicator=document.getElementById('library-refresh');
  libraryRefreshMotion.draw(LIBRARY_PULL_THRESHOLD);
  indicator.classList.add('refreshing');
  indicator.setAttribute('aria-label','새로고침 중');
  const redraw=()=>{
    if(activeAppView()!==view) return;
    if(view==='home') renderHome();
    else if(view==='casuals') renderCasualLibrary();
    else renderLongformLibrary();
  };
  libraryRefreshTask=(async()=>{
    try{
      await loadBooks();
      if(view==='home'){
        rssPage++;
        rssLoadedAt=0;
        await loadRss(true);
      }
      redraw();
    }catch(error){
      redraw();
      if(activeAppView()===view) toast('새로고침하지 못했어요. 연결을 확인해 주세요.');
    }finally{
      if(activeAppView()===view && libraryRefreshAllowed()) libraryRefreshMotion.draw(0);
      else libraryRefreshMotion.clear();
      indicator.classList.remove('refreshing');
      indicator.removeAttribute('aria-label');
      libraryRefreshTask=null;
    }
  })();
  return libraryRefreshTask;
}

(()=>{
  let start=null;
  let distance=0;
  const reset=()=>{
    const pulled=distance>0;start=null;distance=0;
    if(pulled && !libraryRefreshTask) libraryRefreshMotion.draw(0);
  };
  document.addEventListener('touchstart',event=>{
    reset();
    if(event.touches.length!==1 || libraryRefreshTask || !libraryRefreshAllowed() || window.scrollY>0) return;
    const target=event.target;
    if(target instanceof Element && target.closest('button,input,textarea,a,select,#home-controls')) return;
    const touch=event.touches[0];
    start={x:touch.clientX,y:touch.clientY,view:activeAppView()};
  },{passive:true});
  document.addEventListener('touchmove',event=>{
    if(!start) return;
    if(event.touches.length!==1 || !libraryRefreshAllowed() || activeAppView()!==start.view || window.scrollY>0){reset();return;}
    const touch=event.touches[0],dx=touch.clientX-start.x,dy=touch.clientY-start.y;
    if(dy<0 || (Math.abs(dx)>10 && Math.abs(dx)>dy)){reset();return;}
    distance=Math.max(0,dy-LIBRARY_PULL_START);
    if(distance>0)libraryRefreshMotion.draw(distance,true);
    else if(!document.getElementById('library-refresh').hidden)libraryRefreshMotion.draw(0,true);
  },{passive:true});
  document.addEventListener('touchend',event=>{
    const ready=event.touches.length===0 && start && distance>=LIBRARY_PULL_THRESHOLD && libraryRefreshAllowed() && activeAppView()===start.view;
    if(ready){
      start=null;distance=0;
      void refreshLibrary();
    }else reset();
  },{passive:true});
  document.addEventListener('touchcancel',reset,{passive:true});
  const observer=new MutationObserver(()=>{
    if(!libraryRefreshAllowed() || libraryRefreshMotion.changed()) {
      start=null;distance=0;libraryRefreshMotion.clear();
    }
  });
  document.querySelectorAll('.view,#settings-modal,#add-modal,#edit-modal,#onboarding').forEach(view=>observer.observe(view,{attributes:true,attributeFilter:['class','hidden']}));
})();
