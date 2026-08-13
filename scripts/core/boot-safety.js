/* ---- boot safety net: runs in its OWN script tag, so a syntax error in the
       main script below can never leave the splash stuck on screen ---- */
(function(){
  function isBenignResizeObserverWarning(message){
    return /^ResizeObserver loop (?:completed with undelivered notifications|limit exceeded)\.?$/i.test(String(message || ''));
  }
  function hideSplash(){
    var sp = document.getElementById('splash');
    if(sp){ sp.classList.add('hide'); setTimeout(function(){ sp.remove(); }, 700); }
  }
  window.addEventListener('error', function(ev){
    // 레이아웃을 다시 맞추는 동안 브라우저가 내는 경고다. 앱 부팅 실패로 보여주면 안 된다.
    if(isBenignResizeObserverWarning(ev && ev.message)) return;
    hideSplash();
    var b = document.getElementById('bootfail');
    if(b){ b.style.display='block';
      var m = document.getElementById('bootfail-msg');
      if(m) m.textContent = '(' + (ev.message||'error') + ')';
    }
  });
  setTimeout(hideSplash, 6000);   // hard stop, whatever happens
})();
