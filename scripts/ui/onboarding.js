/* Passive onboarding owns only its overlay and media. The Reader keeps its own state. */
const ONBOARD_KEY='breeze.onboarding.v1';
const ONBOARD_PROGRESS_KEY='breeze.onboarding.carousel-progress';
function onboardingPdfAvailable(){
  // PR128 owns native classification and the safe input adapter.
  const availability=typeof BreezePdfInk!=='undefined'?Reflect.get(BreezePdfInk,'availability'):null;
  if(typeof availability==='function')return Promise.resolve().then(()=>availability()).then(value=>value===true,()=>false);
  return Reflect.get(window,'breezeInkIPad')===true;
}
const ONBOARD_PAGES=[
  ['word','모르는 단어를 가볍게 눌러보세요.','문맥에 맞는 뜻을 바로 확인해요.'],
  ['details','뜻 옆의 꺾쇠를 눌러보세요.','단어의 자세한 정보를 펼쳐봐요.'],
  ['sentence','모르는 문장을 꾹 눌러보세요.','문장 전체의 해석을 확인해요.'],
  ['easy','‘쉬운 설명’을 눌러보세요.','문장을 쉬운 말로 이해해요.'],
  ['settings','오른쪽 보기 설정을 눌러보세요.','글자 크기와 읽기 화면을 맞춰요.'],
  ['pdf','PDF에서는 필기 모드를 켜보세요.','펜과 형광펜으로 읽으며 표시해요.'],
  ['memory','홈의 북마크 아이콘을 눌러보세요.','Breeze Memory에서 만난 단어를 다시 봐요.'],
];
let onboardingSession=null;
let onboardingRequest=0;
// Retained integration hooks: this guide never opens or owns a live Reader.
function onboardingOwnsReader(){return false;}
function onboardingAppearanceOpened(){}
function openOnboardingWord(node,retry=false){}
function renderOnboardingWordDetail(card){}
async function explainOnboardingSentence(clean,life){}
function persistOnboarding(){
  if(onboardingSession&&!onboardingSession.replay)save(ONBOARD_PROGRESS_KEY,{page:onboardingSession.page});
}
function startOnboarding(replay){
  if(onboardingSession)endOnboarding(false);
  const request=++onboardingRequest,previousView=activeAppView(),available=onboardingPdfAvailable();
  if(available instanceof Promise)return available.then(value=>{
    if(request===onboardingRequest&&activeAppView()===previousView)startOnboardingResolved(replay,value);
  });
  return startOnboardingResolved(replay,available);
}
function startOnboardingResolved(replay,pdfAvailable){
  closeSettings();
  const progress=load(ONBOARD_PROGRESS_KEY,null);
  const session={page:replay?0:Math.max(0,Math.min(7,Number.isInteger(progress?.page)?progress.page:0)),replay:!!replay,
    previousView:activeAppView(),controller:new AbortController(),focus:document.activeElement,inert:[],paused:false,mediaToken:0,pointer:null,
    motion:matchMedia('(prefers-reduced-motion: reduce)')};
  session.pages=ONBOARD_PAGES.filter(item=>item[0]!=='pdf'||pdfAvailable);
  session.page=Math.min(session.pages.length,session.page);
  onboardingSession=session;
  for(const node of document.querySelectorAll(/** @type {'div'} */('.view,#topbar,#word-peek,#panel,#aa-pop,#sentence-modal,#settings-modal,#add-modal'))){
    session.inert.push([node,node.inert]);node.inert=true;
  }
  document.body.classList.add('onboarding-active');
  const root=document.getElementById('onboarding');root.hidden=false;
  const carousel=document.getElementById('onboard-carousel');carousel.replaceChildren();
  const pages=document.getElementById('onboard-pages');pages.replaceChildren();
  for(const [index,item] of session.pages.entries()){
    const slide=document.createElement('figure');slide.className='onboard-slide';slide.dataset.feature=item[0];
    slide.setAttribute('role','group');slide.setAttribute('aria-roledescription','페이지');
    slide.setAttribute('aria-label',`${index+1} / ${session.pages.length} · ${item[1]}`);
    const video=document.createElement('video');video.muted=true;video.loop=true;video.playsInline=true;video.preload='none';
    video.setAttribute('aria-hidden','true');video.tabIndex=-1;
    video.addEventListener('error',()=>video.classList.add('poster-only'),{signal:session.controller.signal});
    const poster=document.createElement('img');poster.alt='';poster.className='onboard-poster';slide.append(video,poster);carousel.append(slide);
    const dot=document.createElement('i');dot.setAttribute('aria-hidden','true');pages.append(dot);
  }
  const signal=session.controller.signal;
  document.getElementById('onboard-next').addEventListener('click',()=>session.page===session.pages.length?endOnboarding(true):goOnboardingPage(session.page+1),{signal});
  document.getElementById('onboard-back').addEventListener('click',()=>goOnboardingPage(session.page-1),{signal});
  carousel.addEventListener('click',()=>{if(session.swiped){session.swiped=false;return;}session.paused=!session.paused;syncOnboardingMedia();},{signal});
  root.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();endOnboarding(false);return;}
    if(session.page>0&&['ArrowLeft','ArrowRight'].includes(event.key)){
      event.preventDefault();goOnboardingPage(session.page+(event.key==='ArrowRight'?1:-1));
    }
    if((event.key===' '||event.key==='Enter')&&event.target===carousel){event.preventDefault();session.paused=!session.paused;syncOnboardingMedia();}
    if(event.key==='Tab'){
      const controls=[...root.querySelectorAll(/** @type {'button'} */('button,[tabindex="0"]'))].filter(node=>node.getClientRects().length);
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  },{signal});
  carousel.addEventListener('pointerdown',event=>{
    if(event.isPrimary){session.swiped=false;session.pointer={id:event.pointerId,x:event.clientX,y:event.clientY};if(event.isTrusted)carousel.setPointerCapture?.(event.pointerId);}
  },{signal});
  carousel.addEventListener('pointerup',event=>{
    const p=session.pointer;session.pointer=null;if(!p||p.id!==event.pointerId)return;
    const dx=event.clientX-p.x,dy=event.clientY-p.y;
    if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3){session.swiped=true;goOnboardingPage(session.page+(dx<0?1:-1));}
  },{signal});
  carousel.addEventListener('pointercancel',()=>{session.pointer=null;},{signal});
  document.addEventListener('visibilitychange',syncOnboardingMedia,{signal});
  window.addEventListener('pagehide',()=>{persistOnboarding();for(const v of carousel.querySelectorAll('video'))v.pause();},{signal});
  window.addEventListener('pageshow',syncOnboardingMedia,{signal});
  window.addEventListener('popstate',event=>{event.stopImmediatePropagation();endOnboarding(false);},{signal,capture:true});
  session.motion.addEventListener('change',syncOnboardingMedia,{signal});
  session.theme=new MutationObserver(()=>{
    if(activeAppView()!==session.previousView){endOnboarding(false);return;}
    syncOnboardingMedia();
  });
  session.theme.observe(document.body,{attributes:true,attributeFilter:['class']});
  for(const view of document.querySelectorAll('.view'))session.theme.observe(view,{attributes:true,attributeFilter:['class']});
  drawOnboarding();document.getElementById('onboard-next').focus({preventScroll:true});
}
function goOnboardingPage(page){
  if(!onboardingSession)return;
  onboardingSession.page=Math.max(0,Math.min(onboardingSession.pages.length,page));persistOnboarding();drawOnboarding();
}
function drawOnboarding(){
  const session=onboardingSession;if(!session)return;
  const page=session.page,root=document.getElementById('onboarding');root.dataset.stage=String(page);
  document.getElementById('onboard-welcome').hidden=page!==0;
  document.getElementById('onboard-carousel').hidden=page===0;
  document.getElementById('onboard-pages').hidden=page===0;
  document.getElementById('onboard-back').hidden=page===0;
  document.getElementById('onboard-step').textContent=page?`${page} / ${session.pages.length}`:'';
  document.getElementById('onboard-prompt').textContent=page?session.pages[page-1][1]:'브리즈에 오신 걸 환영해요';
  document.getElementById('onboard-note').textContent=page?session.pages[page-1][2]:'막힘없이 읽는 새로운 방법.';
  document.getElementById('onboard-next').textContent=page===0?'시작하기':page===session.pages.length?'완료':'다음';
  for(const [i,node] of [...document.querySelectorAll(/** @type {'figure'} */('.onboard-slide'))].entries())node.hidden=i!==page-1;
  for(const [i,dot] of [...document.getElementById('onboard-pages').children].entries())dot.setAttribute('aria-current',String(i===page-1));
  syncOnboardingMedia();
}
function syncOnboardingMedia(){
  const session=onboardingSession;if(!session)return;
  const token=++session.mediaToken,theme=document.body.classList.contains('dark')?'dark':'light';
  document.getElementById('onboard-carousel').setAttribute('aria-label','브리즈 기능 안내 · 좌우로 넘기기 · 영상을 누르면 '+(session.paused?'재생':'일시정지'));
  for(const [i,video] of [...document.querySelectorAll(/** @type {'video'} */('#onboard-carousel video'))].entries()){
    video.pause();
    if(i!==session.page-1){if(video.hasAttribute('src')){video.removeAttribute('src');video.load();}continue;}
    const base=`assets/onboarding/${session.pages[i][0]}-${theme}`;
    video.poster=base+'.jpg';if(video.nextElementSibling instanceof HTMLImageElement)video.nextElementSibling.src=base+'.jpg';
    const shouldPlay=!session.motion.matches&&!session.paused&&!document.hidden;
    video.classList.toggle('poster-only',!shouldPlay);
    if(!shouldPlay)continue;
    if(video.getAttribute('src')!==base+'.mp4'){video.src=base+'.mp4';video.load();}
    video.play().then(()=>{
      if(onboardingSession!==session||session.page-1!==i||video.getAttribute('src')!==base+'.mp4'||session.paused||session.motion.matches||document.hidden)video.pause();
    }).catch(()=>{if(token===session.mediaToken)video.classList.add('poster-only');});
  }
}
function endOnboarding(remember,returnToPrevious=true){
  ++onboardingRequest;
  const session=onboardingSession;if(!session)return;
  persistOnboarding();session.controller.abort();session.theme.disconnect();
  for(const video of document.querySelectorAll(/** @type {'video'} */('#onboard-carousel video'))){video.pause();video.removeAttribute('src');video.load();}
  onboardingSession=null;document.getElementById('onboarding').hidden=true;
  document.body.classList.remove('onboarding-active');
  for(const [node,inert] of session.inert)node.inert=inert;
  if(remember){save(ONBOARD_KEY,'done');localStorage.removeItem(ONBOARD_PROGRESS_KEY);}
  if(activeAppView()==='home')renderHome();
  if(session.focus instanceof HTMLElement&&session.focus.getClientRects().length)session.focus.focus({preventScroll:true});
}
function maybeShowOnboarding(){
  if(load(ONBOARD_KEY,'')==='done')return;
  if(books.length||Object.keys(words).length||Object.keys(dead).length||Object.keys(positions).length){save(ONBOARD_KEY,'done');return;}
  return startOnboarding(false);
}
