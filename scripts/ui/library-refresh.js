/* Shared pull-to-refresh for Home and both shelves. Never owns Reader gestures. */
let libraryRefreshTask=null;
// Translate only shelf content, never the fixed dock or Reader geometry.
const libraryRefreshMotion=(()=>{
  const root=document.documentElement,indicator=document.getElementById('library-refresh');
  let timer=0,owner='';
  function clear(){
    clearTimeout(timer);owner='';
    root.classList.remove('library-pulling','library-refresh-motion');
    ['--library-pull','--library-pull-progress','--library-pull-spin'].forEach(name=>root.style.removeProperty(name));
    indicator.hidden=true;
  }
  function draw(distance,pulling=false){
    clearTimeout(timer);owner=activeAppView();
    root.classList.add('library-refresh-motion');
    root.classList.toggle('library-pulling',pulling);
    root.style.setProperty('--library-pull',distance+'px');
    root.style.setProperty('--library-pull-progress',String(Math.min(1,distance/44)));
    root.style.setProperty('--library-pull-spin',distance*4+'deg');
    if(distance>0) indicator.hidden=false;
    else timer=setTimeout(clear,460);
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
  indicator.classList.add('refreshing');
  indicator.setAttribute('aria-label','새로고침 중');
  libraryRefreshMotion.draw(44);
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
  const indicator=document.getElementById('library-refresh');
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
    if(dy<10){
      if(distance>0){distance=0;libraryRefreshMotion.draw(0,true);}
      return;
    }
    if(event.cancelable) event.preventDefault();
    distance=96*(1-Math.exp(-dy/120));
    libraryRefreshMotion.draw(distance,true);
  },{passive:false});
  document.addEventListener('touchend',event=>{
    const ready=event.touches.length===0 && start && distance>=64 && libraryRefreshAllowed() && activeAppView()===start.view;
    if(distance>0 && event.cancelable) event.preventDefault();
    reset();
    if(ready) void refreshLibrary();
  },{passive:false});
  document.addEventListener('touchcancel',reset,{passive:true});
  const observer=new MutationObserver(()=>{
    if(!libraryRefreshAllowed() || libraryRefreshMotion.changed()) {
      start=null;distance=0;libraryRefreshMotion.clear();
    }
  });
  document.querySelectorAll('.view,#settings-modal,#add-modal,#edit-modal,#onboarding').forEach(view=>observer.observe(view,{attributes:true,attributeFilter:['class','hidden']}));
})();
