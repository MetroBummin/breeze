/* splash: hide when ready (min .9s: the scene has time to arrive, but never feels like loading).
   boot-safety.js can already have removed it on a slow load, so every path
   here has to tolerate the element being gone. */
const splashStart = Date.now();
function hideSplash(){
  const sp = document.getElementById('splash');
  if(!sp) return;
  sp.classList.add('hide');
  setTimeout(()=>sp.remove(), 700);
}
window.addEventListener('load', ()=>{
  setTimeout(hideSplash, Math.max(0, 900 - (Date.now()-splashStart)));
});
/* safety: never let splash block the app */
setTimeout(hideSplash, 5000);

/* 서가를 먼저 읽고 홈을 그립니다. */
loadBooks().then(renderHome);

/* ---- 다음부터는 네트워크를 기다리지 않고 켜집니다 ----
   무엇을 어떻게 담는지는 sw.js 맨 위에 적혀 있습니다. 여기서는 등록만 합니다.

   `load` 뒤에 부릅니다 — 등록도 요청이라, 첫 화면이 다 그려지기 전에 부르면
   지금 필요한 파일들과 자리를 다투게 됩니다.

   네이티브 셸은 http 가 아니라(`capacitor://`) 여기서 걸러집니다. 그쪽은 파일이
   이미 앱 안에 있어서 캐시가 할 일이 없습니다. 등록에 실패해도 앱은 예전과
   똑같이 돕니다 — 없으면 매번 네트워크를 탈 뿐입니다. */
if('serviceWorker' in navigator && location.protocol.startsWith('http')){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js', {updateViaCache:'none'})
      .catch(error=>console.warn('오프라인 준비를 건너뜁니다:', error));
  });
}
