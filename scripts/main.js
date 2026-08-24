/* splash: hide when ready (min .9s: the scene has time to arrive, but never feels like loading).
   boot-safety.js can already have removed it on a slow load, so every path
   here has to tolerate the element being gone. */
const nativeSplash=document.documentElement.classList.contains('native-shell');
const splashStart = Date.now();
function hideSplash(){
  const sp = document.getElementById('splash');
  if(!sp) return;
  sp.classList.add('hide');
  setTimeout(()=>sp.remove(), 700);
}
/* 서가를 먼저 읽고 홈을 그립니다. 스플래시가 먼저 걷히고 빈 홈이 그려졌다가
   책 카드가 뒤늦게 붙는 것이 첫 실행 때의 "새로고침" 같은 깜빡임이었습니다. */
const homeReady=loadBooks().then(renderHome).catch(error=>{
  console.error('서가를 읽지 못했습니다:',error);
  renderHome();
});
/* CSS 배경은 로드가 늦으면 검은 바탕 위에 뒤늦게 나타납니다. 시작 그림 한 장을
   명시적으로 기다리면 모바일에서 검정→그림의 한 번 더 있는 전환을 없앨 수 있습니다. */
const splashSceneReady=nativeSplash ? new Promise(resolve=>{
  const image=new Image();
  const wide=window.matchMedia&&window.matchMedia('(min-aspect-ratio:4/3)').matches;
  image.onload=image.onerror=resolve;
  image.src=wide ? 'assets/brand/breeze-day-wide.avif' : 'assets/brand/breeze-day.avif';
}) : Promise.resolve();
window.addEventListener('load', ()=>{
  if(!nativeSplash){ hideSplash(); return; }
  Promise.all([homeReady,splashSceneReady]).finally(()=>
    setTimeout(hideSplash,Math.max(0,700-(Date.now()-splashStart))));
});
/* safety: never let splash block the app */
if(nativeSplash) setTimeout(hideSplash, 5000);

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
