/* splash: hide when ready (min 2s so the brand scene and its single breeze are actually seen).
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
  setTimeout(hideSplash, Math.max(0, 2000 - (Date.now()-splashStart)));
});
/* safety: never let splash block the app */
setTimeout(hideSplash, 5000);

/* 서가를 먼저 읽고 홈을 그립니다. */
loadBooks().then(renderHome);
