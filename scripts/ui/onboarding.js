/* Native-only, isolated fixture: never touches words, dead, dictCall or sync.
   Capture the pre-existing install state before the app finishes booting; an
   upgrade with saved data must not interrupt a returning reader. */
const ONBOARD_KEY='breeze.onboarding.v1';
const onboardingHadLocalData=Object.keys(localStorage).some(key=>key!==ONBOARD_KEY);
let onboardingSession=null;
function startOnboarding(replay){
  if(!document.documentElement.classList.contains('native-shell')) return;
  if(onboardingSession) endOnboarding(false);
  if(replay && typeof closeSettings==='function') closeSettings();
  const root=document.getElementById('onboarding');
  const next=document.getElementById('onboard-next');
  const prompt=document.getElementById('onboard-prompt');
  const word=/** @type {HTMLButtonElement} */(document.getElementById('onboard-word'));
  const sentence=/** @type {HTMLButtonElement} */(document.getElementById('onboard-sentence'));
  const controller=new AbortController(), signal=controller.signal;
  /** This is intentionally not Reader state: it only drives the tutorial fixture. */
  const session={controller,stage:0,hold:0,lookup:0,down:null,released:false,pendingSentence:false,font:19,dark:false,original:false};
  onboardingSession=session;
  root.hidden=false;
  root.classList.remove('onboard-waiting','onboard-dark','onboard-original');
  const progress=document.getElementById('onboard-pill-progress');
  const wordPeek=document.getElementById('onboard-word-peek');
  const wordMeaning=document.getElementById('onboard-word-meaning');
  const sentenceStatus=document.getElementById('onboard-sentence-status');
  const sentenceModal=document.getElementById('onboard-sentence-modal');
  const sentenceResult=document.getElementById('onboard-result');
  const aaPop=document.getElementById('onboard-aa-pop');
  const showWordPeek=(loading)=>{
    const rect=word.getBoundingClientRect();
    wordPeek.hidden=false; /** @type {HTMLElement} */(wordPeek.querySelector('.onboard-spinner')).hidden=!loading;
    wordMeaning.textContent=loading?'뜻 찾는 중':'산들바람';
    requestAnimationFrame(()=>{
      const width=wordPeek.offsetWidth||160;
      wordPeek.style.left=Math.max(16,Math.min(window.innerWidth-width-16,rect.left+(rect.width-width)/2))+'px';
      wordPeek.style.top=Math.min(window.innerHeight-60,rect.bottom+10)+'px';
    });
  };
  const closeSentence=()=>{ session.pendingSentence=false; sentenceModal.hidden=true; root.classList.remove('onboard-waiting'); sentenceStatus.hidden=true; };
  const showSentenceResult=()=>{
    if(session.stage!==3) return;
    session.pendingSentence=false; root.classList.remove('onboard-waiting'); sentenceStatus.hidden=true;
    sentenceResult.innerHTML='<div class="onboard-result-source">Reading can feel this easy.</div><div class="onboard-result-meaning">읽기는 이렇게 편안할 수 있어요.</div>';
    sentenceModal.hidden=false;
  };
  const openAa=()=>{
    const button=document.getElementById('onboard-aa'), rect=button.getBoundingClientRect();
    aaPop.hidden=!aaPop.hidden;
    aaPop.style.bottom=Math.round(window.innerHeight-rect.top+10)+'px';
    aaPop.style.right=Math.max(10,Math.round(window.innerWidth-rect.right))+'px';
  };
  const syncAppearance=()=>{
    root.style.setProperty('--onboard-fs',session.font+'px');
    document.getElementById('onboard-font-size').textContent=String(session.font);
    root.classList.toggle('onboard-dark',session.dark);
    root.classList.toggle('onboard-original',session.original);
    const dark=document.getElementById('onboard-dark'); dark.classList.toggle('on',session.dark); dark.setAttribute('aria-pressed',String(session.dark));
    const mode=document.getElementById('onboard-mode'); mode.title=session.original?'글자 화면으로 보기':'원본으로 보기'; mode.setAttribute('aria-label',mode.title);
  };
  const draw=()=>{
    root.dataset.stage=String(session.stage);
    next.hidden=session.stage===0 || session.stage===2;
    word.disabled=session.stage!==0;
    sentence.disabled=session.stage!==2;
    progress.style.transform=`scaleX(${[0,.25,.5,.75,1][session.stage]||0})`;
    if(session.stage===0) prompt.textContent='파란 단어를 눌러 보세요.';
    if(session.stage===1){
      prompt.textContent='단어의 뜻이 바로 보여요. 나무 사이로 부드럽게 부는 바람이에요.';
      next.textContent='계속';
    }
    if(session.stage===2) prompt.textContent='이번에는 두 번째 문장을 길게 눌러 보세요.';
    if(session.stage===3){
      prompt.textContent='문장도 길게 누르면 이해할 수 있어요.';
      next.textContent='계속';
    }
    if(session.stage===4){
      prompt.textContent='찾은 단어는 Breeze가 기억해요. 이제 내 책을 읽어 볼까요?';
      next.hidden=false; next.textContent='읽기 시작';
    }
  };
  word.addEventListener('click',()=>{
    if(session.stage!==0) return;
    showWordPeek(true);
    session.lookup=setTimeout(()=>{
      if(session.stage!==0) return;
      showWordPeek(false); session.stage=1; draw();
    },260);
  },{signal});
  sentence.addEventListener('pointerdown',event=>{
    if(session.stage!==2) return;
    session.down={x:event.clientX,y:event.clientY};
    session.hold=setTimeout(()=>{
      session.hold=0; session.down=null;
      if(session.stage===2){
        session.stage=3; draw(); root.classList.add('onboard-waiting'); sentenceStatus.hidden=false;
        session.lookup=setTimeout(()=>{ session.pendingSentence=true; if(session.released) showSentenceResult(); },320);
      }
    },750);
  },{signal});
  const cancelHold=()=>{ clearTimeout(session.hold); session.hold=0; session.down=null; };
  sentence.addEventListener('pointermove',event=>{
    if(session.down && Math.hypot(event.clientX-session.down.x,event.clientY-session.down.y)>12) cancelHold();
  },{signal});
  sentence.addEventListener('pointerup',()=>{ session.released=true; cancelHold(); if(session.pendingSentence) showSentenceResult(); },{signal});
  for(const type of ['pointercancel','pointerleave']) sentence.addEventListener(type,cancelHold,{signal});
  next.addEventListener('click',()=>{
    if(session.stage===4){ endOnboarding(true); return; }
    if(session.stage===1){ wordPeek.hidden=true; session.stage++; draw(); }
    else if(session.stage===3){ closeSentence(); session.stage++; draw(); }
  },{signal});
  document.getElementById('onboard-skip').addEventListener('click',()=>endOnboarding(true),{signal});
  document.getElementById('onboard-aa').addEventListener('click',openAa,{signal});
  document.getElementById('onboard-font-down').addEventListener('click',()=>{session.font=Math.max(14,session.font-1);syncAppearance();},{signal});
  document.getElementById('onboard-font-up').addEventListener('click',()=>{session.font=Math.min(26,session.font+1);syncAppearance();},{signal});
  document.getElementById('onboard-dark').addEventListener('click',()=>{session.dark=!session.dark;syncAppearance();},{signal});
  document.getElementById('onboard-mode').addEventListener('click',()=>{session.original=!session.original;syncAppearance();},{signal});
  document.getElementById('onboard-sentence-scrim').addEventListener('pointerdown',closeSentence,{signal});
  document.addEventListener('pointerdown',event=>{ const target=/** @type {Element|null} */(event.target); if(!aaPop.hidden&&!(target&&target.closest('#onboard-aa-pop,#onboard-aa'))) aaPop.hidden=true; },{signal,capture:true});
  document.addEventListener('keydown',event=>{ if(event.key==='Escape'){ if(!sentenceModal.hidden) closeSentence(); else if(!aaPop.hidden) aaPop.hidden=true; else endOnboarding(true); } },{signal});
  syncAppearance(); draw(); word.focus();
}
function endOnboarding(remember){
  const session=onboardingSession; if(!session) return;
  clearTimeout(session.hold); clearTimeout(session.lookup); session.controller.abort(); onboardingSession=null;
  document.getElementById('onboarding').hidden=true;
  document.getElementById('onboard-result').innerHTML='';
  document.getElementById('onboard-word-peek').hidden=true;
  document.getElementById('onboard-sentence-modal').hidden=true;
  document.getElementById('onboard-aa-pop').hidden=true;
  if(remember) save(ONBOARD_KEY,'done');
}
function maybeShowOnboarding(){
  if(!document.documentElement.classList.contains('native-shell')) return;
  document.querySelectorAll('.native-onboarding-setting').forEach(el=>/** @type {HTMLElement} */(el).hidden=false);
  if(load(ONBOARD_KEY,'')==='done') return;
  if(onboardingHadLocalData || books.length || Object.keys(words).length || Object.keys(positions).length){
    save(ONBOARD_KEY,'done'); return;
  }
  startOnboarding(false);
}
