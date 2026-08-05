/* splash: hide when ready (min 1.1s so the mark is actually seen) */
const splashStart = Date.now();
window.addEventListener('load', ()=>{
  const wait = Math.max(0, 1100 - (Date.now()-splashStart));
  setTimeout(()=>{
    const sp = document.getElementById('splash');
    sp.classList.add('hide');
    setTimeout(()=>sp.remove(), 700);
  }, wait);
});
/* safety: never let splash block the app */
setTimeout(()=>{ const sp=document.getElementById('splash'); if(sp){ sp.classList.add('hide'); setTimeout(()=>sp.remove(),700); } }, 5000);

loadBooks().then(renderHome);
