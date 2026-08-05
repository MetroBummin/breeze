/* ---- boot safety net: runs in its OWN script tag, so a syntax error in the
       main script below can never leave the splash stuck on screen ---- */
(function(){
  function hideSplash(){
    var sp = document.getElementById('splash');
    if(sp){ sp.classList.add('hide'); setTimeout(function(){ sp.remove(); }, 700); }
  }
  window.addEventListener('error', function(ev){
    hideSplash();
    var b = document.getElementById('bootfail');
    if(b){ b.style.display='block';
      var m = document.getElementById('bootfail-msg');
      if(m) m.textContent = '(' + (ev.message||'error') + ')';
    }
  });
  setTimeout(hideSplash, 6000);   // hard stop, whatever happens
})();
