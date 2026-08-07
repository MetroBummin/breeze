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

loadBooks().then(renderHome);
