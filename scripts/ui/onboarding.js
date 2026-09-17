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
  const result=document.getElementById('onboard-result');
  const next=document.getElementById('onboard-next');
  const prompt=document.getElementById('onboard-prompt');
  const word=/** @type {HTMLButtonElement} */(document.getElementById('onboard-word'));
  const sentence=/** @type {HTMLButtonElement} */(document.getElementById('onboard-sentence'));
  const controller=new AbortController(), signal=controller.signal;
  /** @type {{controller:AbortController,stage:number,hold:any,down:{x:number,y:number}|null,demoWords:Record<string,string>}} */
  const session={controller,stage:0,hold:0,down:null,demoWords:{}};
  onboardingSession=session;
  root.hidden=false;
  const draw=()=>{
    root.dataset.stage=String(session.stage);
    result.hidden=session.stage!==1 && session.stage!==3;
    next.hidden=session.stage===0 || session.stage===2;
    word.disabled=session.stage!==0;
    sentence.disabled=session.stage!==2;
    if(session.stage===0) prompt.textContent='파란 단어를 눌러 보세요.';
    if(session.stage===1){
      prompt.textContent='단어의 뜻이 바로 보여요.';
      result.innerHTML='<div class="onboard-result-cap">문맥 뜻 <span>✓ 기억했어요</span></div><strong>breeze</strong><div class="onboard-meaning">산들바람</div><p>나무 사이로 부드럽게 부는 바람이에요.</p>';
      next.textContent='계속';
    }
    if(session.stage===2) prompt.textContent='이번에는 두 번째 문장을 길게 눌러 보세요.';
    if(session.stage===3){
      prompt.textContent='문장도 길게 누르면 이해할 수 있어요.';
      result.innerHTML='<div class="onboard-result-cap">문장 해석</div><strong>Reading can feel this easy.</strong><div class="onboard-meaning">읽기는 이렇게 편안할 수 있어요.</div>';
      next.textContent='계속';
    }
    if(session.stage===4){
      prompt.textContent='찾은 단어는 Breeze가 기억해요. 이제 내 책을 읽어 볼까요?';
      result.hidden=true; next.hidden=false; next.textContent='읽기 시작';
    }
  };
  word.addEventListener('click',()=>{
    if(session.stage===0){ session.demoWords.breeze='산들바람'; session.stage=1; draw(); }
  },{signal});
  sentence.addEventListener('pointerdown',event=>{
    if(session.stage!==2) return;
    session.down={x:event.clientX,y:event.clientY};
    session.hold=setTimeout(()=>{
      session.hold=0; session.down=null;
      if(session.stage===2){ session.stage=3; draw(); }
    },750);
  },{signal});
  const cancelHold=()=>{ clearTimeout(session.hold); session.hold=0; session.down=null; };
  sentence.addEventListener('pointermove',event=>{
    if(session.down && Math.hypot(event.clientX-session.down.x,event.clientY-session.down.y)>12) cancelHold();
  },{signal});
  for(const type of ['pointerup','pointercancel','pointerleave']) sentence.addEventListener(type,cancelHold,{signal});
  next.addEventListener('click',()=>{
    if(session.stage===4){ endOnboarding(true); return; }
    if(session.stage===1 || session.stage===3){ session.stage++; draw(); }
  },{signal});
  document.getElementById('onboard-skip').addEventListener('click',()=>endOnboarding(true),{signal});
  draw(); word.focus();
}
function endOnboarding(remember){
  const session=onboardingSession; if(!session) return;
  clearTimeout(session.hold); session.controller.abort(); session.demoWords={}; onboardingSession=null;
  document.getElementById('onboarding').hidden=true;
  document.getElementById('onboard-result').innerHTML='';
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
