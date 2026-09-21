/* ---- boot safety net: runs in its OWN script tag, so a syntax error in the
       main script below can still expose a useful failure message. ---- */
(function(){
  function isBenignResizeObserverWarning(message){
    return /^ResizeObserver loop (?:completed with undelivered notifications|limit exceeded)\.?$/i.test(String(message || ''));
  }
  window.addEventListener('error', function(ev){
    // 레이아웃을 다시 맞추는 동안 브라우저가 내는 경고다. 앱 부팅 실패로 보여주면 안 된다.
    if(isBenignResizeObserverWarning(ev && ev.message)) return;
    document.documentElement.classList.remove('boot-pending');
    var b = document.getElementById('bootfail');
    if(b){ b.style.display='block';
      var m = document.getElementById('bootfail-msg');
      if(m) m.textContent = '(' + (ev.message||'error') + ')';
    }
  });
})();
