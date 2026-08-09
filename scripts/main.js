/* splash: hide when ready (min 1.1s so the mark is actually seen).
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
  setTimeout(hideSplash, Math.max(0, 1100 - (Date.now()-splashStart)));
});
/* safety: never let splash block the app */
setTimeout(hideSplash, 5000);

/* 책을 읽어 온 뒤에 샘플을 넣습니다 — 이미 자기 글이 있는지 알아야 하니까요.
   사전 씨앗은 기다리지 않습니다. 첫 낱말을 누르기 전에만 도착하면 됩니다. */
loadBooks().then(seedSampleArticles).then(renderHome);
loadDictSeed();
