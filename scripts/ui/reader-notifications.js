/* Low-priority Reader notices. Lookup and input always own the controls first.
   Only a nonempty queue runs a timer; no scroll/layout measurements are needed. */
const readerNotices = (()=>{
  const queue=[];
  const MAX_PENDING=20, MAX_AGE=60000, QUIET_MS=600;
  let timer=0, active=null, shownAt=0, quietUntil=0;
  function reading(){ return !!curBook && document.body.classList.contains('reading'); }
  function blocked(){
    return document.hidden || Date.now()<quietUntil || chromePinned || Date.now()<chromeHoldUntil
      || Date.now()<readerScrollPauseUntil || !!activeGesture
      || sentenceLookupOpen() || wordLookupOpen() || originalPinchBusy()
      || !!document.querySelector('#aa-pop.on, #settings-modal.on, #sync-modal.on, #add-modal.on')
      || !!document.querySelector('input:focus, textarea:focus, [contenteditable="true"]:focus');
  }
  function hide(){
    const node=document.getElementById('reader-notice');
    node.hidden=true; node.textContent='';
    document.body.classList.remove('reader-notice-visible');
    active=null;
  }
  function reset(){
    clearTimeout(timer); timer=0; queue.length=0; hide(); quietUntil=0;
  }
  function pump(){
    clearTimeout(timer); timer=0;
    if(!reading()){ reset(); return; }
    const now=Date.now();
    while(queue.length && now-queue[0].created>MAX_AGE) queue.shift();
    if(active && (blocked() || now-active.created>MAX_AGE)){
      if(now-active.created<=MAX_AGE) queue.unshift(active);
      hide(); quietUntil=Math.max(quietUntil,now+QUIET_MS);
    }else if(active && now-shownAt>=active.duration){
      hide(); quietUntil=now+QUIET_MS;
    }
    if(!active && queue.length && !blocked()){
      active=queue.shift(); shownAt=now;
      const node=document.getElementById('reader-notice');
      node.textContent=active.message; node.hidden=false;
      document.body.classList.add('reader-notice-visible');
    }
    if(active || queue.length) timer=setTimeout(pump,150);
  }
  function enqueue(message,duration){
    if(!reading()) return false;
    const text=String(message||'').trim();
    if(!text) return true;
    if((active && active.message===text) || queue.some(item=>item.message===text)) return true;
    // Bound the backlog; old informational notices must not replay minutes later.
    if(queue.length>=MAX_PENDING) queue.shift();
    queue.push({message:text,created:Date.now(),duration:Math.min(8000,Math.max(duration,text.length*90))});
    pump(); return true;
  }
  function yieldToInput(){
    quietUntil=Date.now()+QUIET_MS;
    if(active || queue.length) pump();
  }
  // Capture runs before the controls' handlers. Never cancel or consume their input.
  document.addEventListener('pointerdown',yieldToInput,true);
  document.addEventListener('pointerup',yieldToInput,true);
  document.addEventListener('pointercancel',yieldToInput,true);
  document.addEventListener('keydown',yieldToInput,true);
  document.addEventListener('visibilitychange',yieldToInput);
  window.addEventListener('blur',yieldToInput);
  // Observe only overlay roots, not words, progress styles, or scrolling content.
  const observer=new MutationObserver(()=>{ if(active || queue.length) pump(); });
  ['sentence-modal','sentence-pill-status','panel','word-peek','aa-pop','settings-modal','sync-modal','add-modal'].forEach(id=>{
    const node=document.getElementById(id);
    if(node) observer.observe(node,{attributes:true,attributeFilter:['hidden','class']});
  });
  return {enqueue,reset};
})();
