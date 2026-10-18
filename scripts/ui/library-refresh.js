/* Home and the shelves reload on their own. Opening the app already loads
   books and recommendations; that boot starts a 45s quiet period for the
   screen that is showing. Coming back to the foreground, or opening a
   different library screen, reloads that screen. A finger pull does not.
   While Home stays visible, one reading-position read waits out that same
   quiet period, then waits again. A Home reload skipped inside the period
   keeps that single wait. The read does not move the recommendation rail. */
const LIBRARY_REFRESH_GAP_MS=45000;
var libraryRefreshRuns=0;
var libraryRefreshLaunch=0;
var libraryRefreshSeen={};
let libraryRefreshTask=null;
let libraryRefreshWork=null;
let libraryRefreshWorkView='';
let homePositionTimer=0;
let homePositionAt=Date.now();
function armHomePositionRefresh(){
  if(homePositionTimer) return;
  if(typeof bookCloudEnabled!=='function'||!bookCloudEnabled()) return;
  if(typeof document!=='undefined'&&document.hidden) return;
  if(typeof activeAppView!=='function'||activeAppView()!=='home') return;
  if(!libraryRefreshAllowed()) return;
  const wait=Math.max(0, LIBRARY_REFRESH_GAP_MS-(Date.now()-(homePositionAt||0)));
  homePositionTimer=setTimeout(()=>{
    homePositionTimer=0;
    void runHomePositionRefresh();
  }, wait);
}
function stopHomePositionRefresh(){
  clearTimeout(homePositionTimer);
  homePositionTimer=0;
}
async function runHomePositionRefresh(){
  if(typeof document!=='undefined'&&document.hidden) return;
  if(typeof activeAppView!=='function'||activeAppView()!=='home'||!libraryRefreshAllowed()) return;
  if(Date.now()-(homePositionAt||0)<LIBRARY_REFRESH_GAP_MS){
    armHomePositionRefresh();
    return;
  }
  homePositionAt=Date.now();
  armHomePositionRefresh();
  if(typeof bookCloudRefreshPlaces!=='function') return;
  try{await bookCloudRefreshPlaces();}
  catch(error){console.error('book_cloud_failed',error&&error.name||'Error');}
}
function libraryRefreshAllowed(){
  return ['home','casuals','longform'].includes(activeAppView()) &&
    !document.querySelector('#settings-modal.on,#add-modal[open],#edit-modal[open],#onboarding:not([hidden])');
}
function refreshLibrary(){
  return reloadLibrary(true);
}
function reloadLibrary(rotateRss){
  if(libraryRefreshTask) return libraryRefreshTask;
  if(!libraryRefreshAllowed()) return Promise.resolve();
  libraryRefreshRuns++;
  const view=activeAppView();
  if(view==='home'){
    const rail=document.getElementById('casual-rail');
    rail.dataset.rssResetStart='1';
    rssAlignRailStart(rail);
  }
  const redraw=()=>{
    if(activeAppView()!==view) return;
    if(view==='home') renderHome();
    else if(view==='casuals') renderCasualLibrary();
    else renderLongformLibrary();
  };
  if(!libraryRefreshWork || libraryRefreshWorkView!==view){
    libraryRefreshWorkView=view;
    libraryRefreshWork=(async()=>{
      try{
        if(rotateRss && (view==='home'||view==='casuals') && !rssLoading){
          rssPage++;
          rssLoadedAt=0;
          redraw();
        }
        const loaded=await loadBooks();
        // show() already painted this screen. Paint again only when the saved
        // shelf actually changed. A save during the read paints on its own.
        if(loaded==='same'||loaded==='stale') return;
        redraw();
      }catch(error){
        redraw();
        if(activeAppView()===view) toast('새로고침하지 못했어요. 연결을 확인해 주세요.');
      }
    })();
    const work=libraryRefreshWork;
    void work.finally(()=>{
      if(libraryRefreshWork===work){libraryRefreshWork=null;libraryRefreshWorkView='';}
    });
  }
  const work=libraryRefreshWork;
  libraryRefreshTask=work.finally(()=>{libraryRefreshTask=null;});
  return libraryRefreshTask;
}
function refreshLibrarySoon(){
  if(!libraryRefreshAllowed()) return Promise.resolve();
  const view=activeAppView();
  const now=Date.now();
  if(view==='home') armHomePositionRefresh();
  if(now-(libraryRefreshSeen[view]||0)<LIBRARY_REFRESH_GAP_MS) return Promise.resolve();
  libraryRefreshSeen[view]=now;
  // Home owns the recommendation rail. A shelf reload reads saved and synced
  // books without advancing that rail's cursor.
  return reloadLibrary(view==='home');
}
function noteLibraryLaunch(){
  if(!libraryRefreshAllowed()) return;
  libraryRefreshSeen[activeAppView()]=Date.now();
  libraryRefreshLaunch++;
  if(activeAppView()==='home'){
    homePositionAt=Date.now();
    stopHomePositionRefresh();
    armHomePositionRefresh();
  }
}
(()=>{
  const watch=()=>void refreshLibrarySoon();
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){stopHomePositionRefresh();return;}
    homePositionAt=Date.now();
    stopHomePositionRefresh();
    watch();
  });
  let appStateAttached=false;
  function attachAppState(){
    if(appStateAttached) return;
    const app=window.Capacitor?.Plugins?.App;
    if(!app||typeof app.addListener!=='function') return;
    appStateAttached=true;
    void app.addListener('appStateChange',state=>{
      if(!(state&&state.isActive)){stopHomePositionRefresh();return;}
      homePositionAt=Date.now();
      stopHomePositionRefresh();
      watch();
    });
  }
  attachAppState();
  let libraryRefreshView=activeAppView();
  const observer=new MutationObserver(()=>{
    const view=activeAppView();
    if(!libraryRefreshAllowed()){libraryRefreshView=view;return;}
    if(view==='home') armHomePositionRefresh();
    else stopHomePositionRefresh();
    if(view===libraryRefreshView) return;
    libraryRefreshView=view;
    watch();
  });
  document.querySelectorAll('.view,#settings-modal,#add-modal,#edit-modal,#onboarding').forEach(view=>observer.observe(view,{attributes:true,attributeFilter:['class','hidden','open']}));
  setTimeout(()=>{
    attachAppState();
    const arm=()=>noteLibraryLaunch();
    if(typeof homeReady!=='undefined'&&homeReady&&typeof homeReady.then==='function') homeReady.then(arm,arm);
    else arm();
  },0);
})();
