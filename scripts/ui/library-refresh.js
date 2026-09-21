/* Shared pull-to-refresh for Home and both shelves. Never owns Reader gestures. */
let libraryRefreshTask=null;
function libraryRefreshAllowed(){
  return ['home','casuals','longform'].includes(activeAppView()) &&
    !document.querySelector('#settings-modal.on,#add-modal.on,#edit-modal.on,#onboarding:not([hidden])');
}
function refreshLibrary(){
  if(libraryRefreshTask) return libraryRefreshTask;
  if(!libraryRefreshAllowed()) return Promise.resolve();
  const view=activeAppView();
  const indicator=document.getElementById('library-refresh');
  indicator.hidden=false;
  indicator.classList.add('refreshing');
  indicator.style.setProperty('--refresh-offset','0px');
  indicator.querySelector('span').textContent='↻';
  indicator.querySelector('.refresh-label').textContent='새로고침 중';
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
      indicator.hidden=true;
      indicator.classList.remove('refreshing');
      libraryRefreshTask=null;
    }
  })();
  return libraryRefreshTask;
}

(()=>{
  const indicator=document.getElementById('library-refresh');
  let start=null;
  let distance=0;
  const reset=()=>{start=null;distance=0;if(!libraryRefreshTask) indicator.hidden=true;};
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
    if(dy<10) return;
    if(event.cancelable) event.preventDefault();
    distance=Math.min(100,dy*.5);
    indicator.hidden=false;
    indicator.style.setProperty('--refresh-offset',Math.min(distance,50)+'px');
    indicator.querySelector('span').textContent=distance>=64?'↻':'↓';
    indicator.querySelector('.refresh-label').textContent=distance>=64?'놓아서 새로고침':'당겨서 새로고침';
  },{passive:false});
  document.addEventListener('touchend',event=>{
    const ready=start && distance>=64 && libraryRefreshAllowed() && activeAppView()===start.view;
    if(distance>0 && event.cancelable) event.preventDefault();
    reset();
    if(ready) void refreshLibrary();
  },{passive:false});
  document.addEventListener('touchcancel',reset,{passive:true});
  const observer=new MutationObserver(()=>{
    if(!libraryRefreshAllowed()) {reset();indicator.hidden=true;}
  });
  document.querySelectorAll('.view,#settings-modal,#add-modal,#edit-modal,#onboarding').forEach(view=>observer.observe(view,{attributes:true,attributeFilter:['class','hidden']}));
})();
