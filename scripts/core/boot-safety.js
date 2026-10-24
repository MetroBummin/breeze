/* ---- boot safety net: runs in its OWN script tag, so a syntax error in the
       main script below can still expose a useful failure message. ---- */
(function(){
  function isBenignResizeObserverWarning(message){
    return /^ResizeObserver loop (?:completed with undelivered notifications|limit exceeded)\.?$/i.test(String(message || ''));
  }
  function isStorageQuotaError(ev){
    var error=ev&&ev.error;
    if(error&&(error.name==='QuotaExceededError'||error.code===22||error.code===1014))return true;
    return /QuotaExceededError|quota has been exceeded/i.test(String(ev&&ev.message||''));
  }
  function isStorageEnvironmentError(ev){
    if(isStorageQuotaError(ev)) return true;
    var error=ev&&ev.error;
    var name=String(error&&error.name||'');
    var message=String((error&&error.message)||(ev&&ev.message)||'');
    if(/Indexed Database|indexedDB|IDBFactory|IDBDatabase|private browsing|Local storage (?:open timed out|is blocked|is unavailable)/i.test(message)) return true;
    return (name==='SecurityError'||name==='InvalidStateError'||name==='UnknownError'||name==='AbortError')
      && /storage|database|indexedDB|quota/i.test(message);
  }
  var bootFailTimer = 0;
  function hideBootFail(){
    if(bootFailTimer){ clearTimeout(bootFailTimer); bootFailTimer = 0; }
    var b = document.getElementById('bootfail');
    if(b) b.style.display = 'none';
  }
  var dismiss = document.getElementById('bootfail-dismiss');
  if(dismiss) dismiss.addEventListener('click', hideBootFail);
  window.addEventListener('error', function(ev){
    // 레이아웃을 다시 맞추는 동안 브라우저가 내는 경고다. 앱 부팅 실패로 보여주면 안 된다.
    // 저장 한도와 비공개 창의 IndexedDB 거부는 부팅 실패가 아니다.
    if(isBenignResizeObserverWarning(ev && ev.message)||isStorageEnvironmentError(ev)) return;
    document.documentElement.classList.remove('boot-pending');
    var b = document.getElementById('bootfail');
    if(b){ b.style.display='flex';
      var m = document.getElementById('bootfail-msg');
      if(m) m.textContent = '(' + (ev.message||'error') + ')';
      if(bootFailTimer) clearTimeout(bootFailTimer);
      // 하단 독은 그대로 누를 수 있게, 알림은 잠시 뒤 스스로 걷힌다.
      bootFailTimer = setTimeout(hideBootFail, 5000);
    }
  });
})();
