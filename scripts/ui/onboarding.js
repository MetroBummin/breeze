/* Three-card carousel dialog. The layout, copy, card media and card 3
   cover fan are ported from the reviewed standalone page
   (onboarding-carousel.html) so the dialog shows exactly what was reviewed.
   Cards 1 and 2 are muted inline MP4s. Playback is owned by the carousel
   settle below: the settled card rewinds to frame 0 and plays, and a
   first-frame poster covers the video until the 'playing' event.
   The former passive guide (welcome pen animation plus seven recorded
   scenes) was discarded by owner decision 2026-10-27; see
   docs/decisions/006-reader-onboarding.md. This dialog never opens or
   owns a live Reader: the Reader keeps its own state. */
const ONBOARD_KEY='breeze.onboarding.v1';
const ONBOARD_PROGRESS_KEY='breeze.onboarding.carousel-progress';
// Same seven books as the reviewed standalone card 3, plus the long-read
// id each one opens. Covers, titles and authors match the standalone page;
// the read definition is resolved at tap time so a saved copy is reused.
const ONBOARD_BOOKS=[
  {id:'the-great-gatsby',img:'assets/longreads/covers/the-great-gatsby.webp',title:'The Great Gatsby',author:'F. Scott Fitzgerald',cta:'개츠비 바로 읽기'},
  {id:'alice-in-wonderland',img:'assets/longreads/covers/alice-in-wonderland.webp',title:"Alice's Adventures in Wonderland",author:'Lewis Carroll',cta:'앨리스 바로 읽기'},
  {id:'sherlock-holmes-speckled-band',img:'assets/longreads/covers/speckled-band.webp',title:'The Adventure of the Speckled Band',author:'Arthur Conan Doyle',cta:'얼룩무늬 띠 바로 읽기'},
  {id:'sherlock-holmes-scandal-in-bohemia',img:'assets/longreads/covers/scandal-in-bohemia.webp',title:'A Scandal in Bohemia',author:'Arthur Conan Doyle',cta:'보헤미아 바로 읽기'},
  {id:'sherlock-holmes-red-headed-league',img:'assets/longreads/covers/red-headed-league.webp',title:'The Red-Headed League',author:'Arthur Conan Doyle',cta:'빨간 머리 연맹 바로 읽기'},
  {id:'sherlock-holmes-final-problem',img:'assets/longreads/covers/final-problem.webp',title:'The Final Problem',author:'Arthur Conan Doyle',cta:'마지막 사건 바로 읽기'},
  {id:'sherlock-holmes-hound-of-the-baskervilles',img:'assets/longreads/covers/hound-of-the-baskervilles.webp',title:'The Hound of the Baskervilles',author:'Arthur Conan Doyle',cta:'바스커빌 바로 읽기'},
];
const ONBOARD_CARD_TITLES=['단어 뜻 보기','단어장 학습','책 고르기'];
let onboardingSession=null;
// Retained integration hooks: this guide never opens or owns a live Reader.
function onboardingOwnsReader(){return false;}
function onboardingAppearanceOpened(){}
function openOnboardingWord(node,retry=false){}
function renderOnboardingWordDetail(card){}
async function explainOnboardingSentence(clean,life){}
function onboardingCardIndex(){
  const wrap=document.getElementById('onboard-wrap');
  const card=wrap.querySelector(/** @type {'article'} */('.onboard-card'));
  if(!card)return 0;
  const advance=card.offsetWidth+20;
  return Math.max(0,Math.min(2,Math.round(wrap.scrollLeft/advance)));
}
/* Cards 1 and 2. The <video> is parsed with muted, playsinline and autoplay
   already on the element, before its <source> loads. Capacitor's WKWebView
   already allows inline playback without a gesture, so nothing here retunes
   the native view. What broke TestFlight was pausing every off-screen clip
   (pause() clears that element's autoplay) and calling play() from the
   scroll listener while the card was still moving. WebKit refuses that
   call and paints its own play button; a play() that did succeed was then
   left running, so the card opened mid-clip. Settle is the only owner. */
const onboardingWideQuery=matchMedia('(min-width: 768px)');
function onboardingVideos(){
  return /** @type {HTMLVideoElement[]} */([...document.querySelectorAll('#onboarding .onboard-card video')]);
}
/** @param {HTMLVideoElement} video */
function onboardingPoster(video){
  return /** @type {HTMLImageElement|null} */(video.parentElement?.querySelector('.onboard-poster')||null);
}
function syncOnboardingPosters(){
  for(const img of /** @type {NodeListOf<HTMLImageElement>} */(document.querySelectorAll('#onboarding .onboard-poster'))){
    const next=onboardingWideQuery.matches?img.dataset.posterWide:img.dataset.poster;
    if(next&&img.getAttribute('src')!==next)img.setAttribute('src',next);
  }
}
function rewindOnboardingVideo(video){
  // Seeking before metadata aborts the load on iOS, so the later play()
  // has nothing to play and never reaches canplay.
  if(video.readyState<HTMLMediaElement.HAVE_METADATA)return;
  try{if(video.currentTime>0.05)video.currentTime=0;}catch{}
}
function playSettledOnboardingVideo(video){
  const poster=onboardingPoster(video);
  video.muted=true;
  video.playsInline=true;
  const start=()=>{
    const pending=video.play();
    if(!pending||typeof pending.catch!=='function')return;
    pending.catch(()=>{
      if(poster)poster.hidden=false;
      // Settle ran before the file could play. One retry when it can.
      if(video.readyState>=HTMLMediaElement.HAVE_FUTURE_DATA)return;
      video.addEventListener('canplay',()=>{
        if(onboardingSession==null)return;
        if(onboardingVideos().indexOf(video)!==onboardingCardIndex())return;
        if(!video.paused)return;
        const again=video.play();
        if(again&&typeof again.catch==='function')again.catch(()=>{if(poster)poster.hidden=false;});
      },{once:true});
    });
  };
  if(video.readyState>=HTMLMediaElement.HAVE_METADATA&&video.currentTime>0.05){
    video.addEventListener('seeked',start,{once:true});
    try{video.currentTime=0;}catch{start();}
    return;
  }
  start();
}
function settleOnboardingVideos(session){
  if(onboardingSession!==session)return;
  const index=onboardingCardIndex();
  const hold=session.motion.matches||document.hidden;
  const videos=onboardingVideos();
  videos.forEach((video,i)=>{
    const poster=onboardingPoster(video);
    const active=i===index&&!hold;
    if(!active){
      try{video.pause();}catch{}
      rewindOnboardingVideo(video);
      if(poster)poster.hidden=false;
      return;
    }
    if(session.mediaCard===index&&!video.paused&&!video.ended)return;
    session.mediaCard=index;
    playSettledOnboardingVideo(video);
  });
  if(hold)session.mediaCard=-1;
}
function queueOnboardingPlaybackSettle(session){
  clearTimeout(session.playSettleTimer);
  session.playSettleTimer=setTimeout(()=>settleOnboardingVideos(session),140);
}
/* Funnel steps keep the former guide's event names: moving to a later card
   completes the card left behind, Skip skips the current card, and a choice
   completes the dialog as 'finish'. Step keys stay in the event payload
   alphabet ([a-z0-9_-]) so the logger keeps them. */
const ONBOARD_STEP_KEYS=['word','study','books'];
function onboardingStepName(session){return ONBOARD_STEP_KEYS[session.card]||'';}
function onboardingStepMs(session){
  return Math.max(0,Math.min(3600000,Date.now()-(session.stepAt||Date.now())));
}
function trackOnboardingFinish(session){
  if(typeof trackEvent==='function')trackEvent('onboarding_step_complete',{step:'finish',ms:onboardingStepMs(session)});
}
function noteOnboardingCard(session){
  const index=onboardingCardIndex();
  if(index===session.card)return;
  const previous=session.card;
  const ms=onboardingStepMs(session);
  session.card=index;
  session.stepAt=Date.now();
  if(index>previous&&typeof trackEvent==='function'){
    const step=ONBOARD_STEP_KEYS[previous];
    if(step)trackEvent('onboarding_step_complete',{step,ms});
  }
}
function syncOnboardingDots(){
  const current=onboardingCardIndex();
  for(const dots of document.querySelectorAll('#onboarding .onboard-dots')){
    [...dots.children].forEach((el,i)=>el.classList.toggle('on',i===current));
  }
  const status=document.getElementById('onboard-status');
  if(status)status.textContent=`${current+1} / 3 · ${ONBOARD_CARD_TITLES[current]}`;
}
function layoutOnboardingViewport(){
  const root=document.getElementById('onboarding');
  if(!root)return;
  const vv=window.visualViewport;
  const height=Math.max(1,Math.round(vv?vv.height:window.innerHeight));
  const top=Math.round(vv?vv.offsetTop:0);
  root.style.top=top+'px';
  root.style.height=height+'px';
  root.style.bottom='auto';
  root.style.setProperty('--vv-h',height+'px');
  root.style.setProperty('--vv-top',top+'px');
}
function advanceOnboardingCard(session,dir){
  const wrap=document.getElementById('onboard-wrap');
  const card=/** @type {HTMLElement|null} */(wrap?.querySelector('.onboard-card'));
  if(!wrap||!card)return;
  const index=Math.max(0,Math.min(2,onboardingCardIndex()+dir));
  const left=(card.offsetWidth+20)*index;
  const before=wrap.scrollLeft;
  wrap.scrollTo({left,behavior:session.motion.matches?'auto':'smooth'});
  if(session.motion.matches||Math.abs(left-before)<2)return;
  // Some WebKit builds ignore a smooth scrollTo on this scroller. If nothing
  // has moved shortly after, jump. The card change must not depend on it.
  clearTimeout(session.scrollTimer);
  session.scrollTimer=setTimeout(()=>{
    if(onboardingSession!==session)return;
    if(Math.abs(wrap.scrollLeft-before)<2)wrap.scrollTo({left,behavior:'auto'});
  },60);
}
function bindOnboardingGestures(session){
  const wrap=document.getElementById('onboard-wrap');
  const root=document.getElementById('onboarding');
  const signal=session.controller.signal;
  const nudge=dir=>{
    const now=Date.now();
    const from=onboardingCardIndex();
    if(session.lastNudge&&now-session.lastNudge.at<80&&session.lastNudge.from===from)return;
    session.lastNudge={at:now,from};
    advanceOnboardingCard(session,dir);
  };
  const finishGesture=event=>{
    const origin=session.gesture;
    if(!origin)return;
    if(event&&event.pointerId!=null&&event.pointerId!==origin.pointerId)return;
    session.gesture=null;
    const x=event&&Number.isFinite(event.clientX)?event.clientX:origin.x2;
    const y=event&&Number.isFinite(event.clientY)?event.clientY:origin.y2;
    const dx=x-origin.x,dy=y-origin.y;
    if(origin.target.closest('button,a,input,.onboard-fan'))return;
    if(Math.hypot(dx,dy)<14){
      if(onboardingCardIndex()<2)nudge(1);
      return;
    }
    if(Math.abs(dy)>40&&Math.abs(dy)>Math.abs(dx)){nudge(dy<0?1:-1);return;}
    if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)){
      clearTimeout(session.gestureTimer);
      session.gestureTimer=setTimeout(()=>{
        if(onboardingSession!==session)return;
        if(Math.abs(wrap.scrollLeft-origin.left)>4)return;
        nudge(dx<0?1:-1);
      },120);
    }
  };
  wrap.addEventListener('pointerdown',event=>{
    if(event.button!=null&&event.button!==0)return;
    const target=event.target instanceof Element?event.target:null;
    if(!target||target.closest('button,a,input,.onboard-fan'))return;
    session.gesture={pointerId:event.pointerId,x:event.clientX,y:event.clientY,x2:event.clientX,y2:event.clientY,left:wrap.scrollLeft,target};
    try{wrap.setPointerCapture(event.pointerId);}catch{}
  },{signal});
  wrap.addEventListener('pointermove',event=>{
    if(!session.gesture||event.pointerId!==session.gesture.pointerId)return;
    session.gesture.x2=event.clientX;
    session.gesture.y2=event.clientY;
  },{signal});
  // WebKit can cancel a vertical drag when the card only allows pan-x.
  // pointercancel still has to advance, or the first card stays stuck.
  wrap.addEventListener('pointerup',finishGesture,{signal});
  wrap.addEventListener('pointercancel',finishGesture,{signal});
  document.addEventListener('pointerup',event=>{if(session.gesture)finishGesture(event);},{signal,capture:true});
  // Pointer events are flaky for a vertical drag in WebKit. Touch is what a
  // phone actually sends, and it advances even when play() never resolves.
  const dragFrom=origin=>{
    return (x,y)=>{
      const dx=x-origin.x,dy=y-origin.y;
      if(origin.target.closest('button,a,input,.onboard-fan'))return;
      if(Math.hypot(dx,dy)<14){if(onboardingCardIndex()<2)nudge(1);return;}
      if(Math.abs(dy)>40&&Math.abs(dy)>Math.abs(dx)){nudge(dy<0?1:-1);return;}
      if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)){
        clearTimeout(session.gestureTimer);
        session.gestureTimer=setTimeout(()=>{
          if(onboardingSession!==session)return;
          if(Math.abs(wrap.scrollLeft-origin.left)>4)return;
          nudge(dx<0?1:-1);
        },120);
      }
    };
  };
  wrap.addEventListener('touchstart',event=>{
    const target=event.target instanceof Element?event.target:null;
    const touch=event.changedTouches&&event.changedTouches[0];
    if(!target||!touch||target.closest('button,a,input,.onboard-fan'))return;
    session.touch={x:touch.clientX,y:touch.clientY,left:wrap.scrollLeft,target};
  },{passive:true,signal});
  wrap.addEventListener('touchend',event=>{
    const origin=session.touch;
    session.touch=null;
    if(!origin)return;
    const touch=event.changedTouches&&event.changedTouches[0];
    if(!touch)return;
    dragFrom(origin)(touch.clientX,touch.clientY);
  },{signal});
  wrap.addEventListener('touchcancel',()=>{session.touch=null;},{signal});
  // A vertical drag must not scroll the document. Horizontal drags stay
  // with the carousel or the cover fan. (pan-x is set in onboarding.css.)
  root.addEventListener('touchmove',event=>{
    const target=event.target instanceof Element?event.target:null;
    const fan=target?.closest('.onboard-fan')||null;
    const touch=event.touches&&event.touches[0];
    const origin=session.gesture;
    if(!touch){event.preventDefault();return;}
    const dx=origin?touch.clientX-origin.x:0,dy=origin?touch.clientY-origin.y:0;
    if(fan&&Math.abs(dx)>=Math.abs(dy))return;
    if(!fan&&Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>8)return;
    event.preventDefault();
  },{passive:false,signal});
}
function showOnboardingBook(session,idx){
  session.bookIndex=idx;
  document.getElementById('onboard-book-title').textContent=ONBOARD_BOOKS[idx].title;
  document.getElementById('onboard-book-author').textContent=ONBOARD_BOOKS[idx].author;
  document.getElementById('onboard-read').textContent=ONBOARD_BOOKS[idx].cta;
}
function centredOnboardingIndex(session){
  const fan=document.getElementById('onboard-fan');
  const center=fan.scrollLeft+fan.clientWidth/2;
  let best=0,bestD=Infinity;
  session.fanEls.forEach((el,p)=>{
    const d=Math.abs(el.offsetLeft+el.offsetWidth/2-center);
    if(d<bestD){bestD=d;best=p;}
  });
  return {p:best,idx:((best%ONBOARD_BOOKS.length)+ONBOARD_BOOKS.length)%ONBOARD_BOOKS.length};
}
function queueOnboardingSettle(session){
  clearTimeout(session.settleTimer);
  session.settleTimer=setTimeout(()=>{
    if(onboardingSession===session)showOnboardingBook(session,centredOnboardingIndex(session).idx);
  },150);
}
function centreOnboardingCover(session,el,instant=false){
  const fan=document.getElementById('onboard-fan');
  fan.scrollTo({left:el.offsetLeft+el.offsetWidth/2-fan.clientWidth/2,behavior:instant||session.motion.matches?'instant':'smooth'});
}
function buildOnboardingFan(session){
  const fan=document.getElementById('onboard-fan');
  fan.replaceChildren();
  const els=[];
  for(let c=0;c<5;c++){
    ONBOARD_BOOKS.forEach((b,i)=>{
      const slot=document.createElement('div');
      slot.className='onboard-cover';
      slot.dataset.idx=String(i);
      const img=document.createElement('img');
      // 35 covers (five copies of seven) are built on open. Decoding them on
      // the main thread stalled WebKit's first frames, and card 1's clip
      // with them; card 3 is off screen at that point.
      img.decoding='async';
      img.src=b.img;img.alt=b.title;
      slot.append(img);
      slot.addEventListener('click',()=>centreOnboardingCover(session,slot),{signal:session.controller.signal});
      fan.append(slot);
      els.push(slot);
    });
  }
  session.fanEls=els;
  // Covers overlap, so one book of scrolling is the offset between two
  // neighbouring layout boxes, not their width.
  const step=()=>els[1].offsetLeft-els[0].offsetLeft;
  const setW=()=>step()*ONBOARD_BOOKS.length;
  // Depth: d = distance from the centre in books (fractional while
  // scrolling). At rest five covers show: the centre one full size and on
  // top, then two on each side, each smaller and further back, peeking
  // out from behind. Covers beyond them tuck behind the outer pair and
  // fade in only while they travel into an outer slot.
  const SLOT_X=[0,1,5/3,11/6];
  const SLOT_SCALE=[1,0.82,0.66,0.56];
  const slot=(arr,a)=>{
    const i=Math.min(Math.floor(a),arr.length-2);
    return arr[i]+(arr[i+1]-arr[i])*(a-i);
  };
  const layoutDepth=()=>{
    session.depthFrame=0;
    // Fractional slot boxes (the slots are never transformed), all read
    // before any write. offsetLeft rounds to whole pixels; with small covers
    // that error let the ±3rd cover in and seven showed at rest. The step is
    // the strip's mean spacing, so no single slot's rounding scales up.
    const rects=els.map(el=>el.getBoundingClientRect());
    const s=(rects[rects.length-1].left-rects[0].left)/(rects.length-1);
    if(!(s>0))return;
    const half=fan.clientWidth/2;
    const box=fan.getBoundingClientRect();
    const center=box.left+fan.clientLeft+half;
    const w=rects[0].width;
    for(const [p,el] of els.entries()){
      const d=(rects[p].left+w/2-center)/s;
      const a=Math.abs(d);
      const img=/** @type {HTMLElement} */(el.firstElementChild);
      if(a>=3){el.style.visibility='hidden';continue;}
      const scale=slot(SLOT_SCALE,a);
      const pos=Math.sign(d)*slot(SLOT_X,a)*s;
      // Covers that would cross the card edge on narrow cards fade out
      // rather than being cut hard (outer pair first).
      const overflow=Math.abs(pos)+(w/2)*scale-half;
      const fade=Math.min(1,Math.max(0,1-overflow/(0.15*w)),Math.max(0,(2.9-a)/0.6));
      el.style.visibility=fade>0?'':'hidden';
      el.style.opacity=String(fade);
      el.style.zIndex=String(100-Math.round(a*10));
      img.style.transform='translateX('+(pos-d*s).toFixed(2)+'px) scale('+scale.toFixed(4)+')';
    }
  };
  session.layoutDepth=layoutDepth;
  const queueDepth=()=>{if(!session.depthFrame)session.depthFrame=requestAnimationFrame(layoutDepth);};
  // The CSS cover size needs the fan's box as lengths (see onboarding.css).
  // Width is the card's content width, not the fan's: the fan's padding is
  // derived from --fan-w, so its own width would feed back. Height is the
  // fan's (flex-basis 0, min-height 0), which the covers cannot change.
  const card=/** @type {HTMLElement} */(fan.closest('.onboard-card'));
  const measureFan=()=>{
    const cs=getComputedStyle(card);
    const w=Math.round(card.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight)),h=fan.offsetHeight;
    if(!w||!h||(w===session.fanW&&h===session.fanH))return;
    // A later resize (fonts arriving, rotation) moves every slot. Keep the
    // same book in the middle: WebKit does not re-snap the strip, which left
    // it off centre with a stale depth layout (three covers on one side).
    const keep=session.fanW?els[centredOnboardingIndex(session).p]:null;
    session.fanW=w;session.fanH=h;
    fan.style.setProperty('--fan-w',w+'px');
    fan.style.setProperty('--fan-h',h+'px');
    if(keep)centreOnboardingCover(session,keep,true);
    queueDepth();
  };
  measureFan();
  // Writing --fan-w changes the fan's padding, so its content box. Watch
  // the border box (flex-sized, independent of the padding) and write on
  // the next frame, outside the observer's delivery: a write inside it is
  // what WebKit reports as a ResizeObserver loop.
  if(typeof ResizeObserver==='function'){
    let frame=0;
    session.observer=new ResizeObserver(()=>{
      if(frame)return;
      frame=requestAnimationFrame(()=>{frame=0;if(onboardingSession===session)measureFan();});
    });
    session.observer.observe(fan,{box:'border-box'});
  }
  const signal=session.controller.signal;
  fan.addEventListener('scroll',()=>{queueDepth();queueOnboardingSettle(session);},{passive:true,signal});
  window.addEventListener('resize',()=>{measureFan();queueDepth();},{signal});
  // Wrap back into the middle copy so the strip never ends. The jump
  // is deferred and re-checked: scrollend can fire mid-flight on a long
  // smooth scroll, and jumping then would cancel the animation and
  // land on the wrong book. Only jump when the strip is truly at rest.
  fan.addEventListener('scrollend',()=>{
    const atEnd=fan.scrollLeft;
    setTimeout(()=>{
      if(onboardingSession!==session||Math.abs(fan.scrollLeft-atEnd)>2)return;
      const {p,idx}=centredOnboardingIndex(session);
      showOnboardingBook(session,idx);
      const lo=ONBOARD_BOOKS.length*2,hi=ONBOARD_BOOKS.length*3;
      if(p<lo)fan.scrollTo({left:fan.scrollLeft+setW(),behavior:'instant'});
      else if(p>=hi)fan.scrollTo({left:fan.scrollLeft-setW(),behavior:'instant'});
    },250);
  },{signal});
  // Start on Alice, the same default as the reviewed standalone page
  // (middle copy, so there is room to scroll either way). The first
  // centring is instant: the dialog should open on the book, not fling
  // to it.
  requestAnimationFrame(()=>{
    if(onboardingSession!==session)return;
    layoutDepth();
    centreOnboardingCover(session,els[ONBOARD_BOOKS.length*2+1],true);
    setTimeout(()=>{if(onboardingSession===session)showOnboardingBook(session,1);},50);
  });
}
function setOnboardingChoiceNote(text){
  const note=document.getElementById('onboard-choice-note');
  if(note)note.textContent=text;
}
function setOnboardingChoiceBusy(busy){
  for(const id of ['onboard-read','onboard-file']){
    const button=/** @type {HTMLButtonElement|null} */(document.getElementById(id));
    if(button)button.disabled=busy;
  }
}
async function openOnboardingBook(session){
  if(session.busy)return;
  const entry=ONBOARD_BOOKS[session.bookIndex];
  const read=typeof longReadDefinition==='function'?longReadDefinition(entry.id):null;
  if(!read){
    setOnboardingChoiceNote('책을 열지 못했어요. 잠시 뒤 다시 눌러 보세요.');
    return;
  }
  session.busy=true;
  setOnboardingChoiceBusy(true);
  setOnboardingChoiceNote('');
  const saved=await importLongRead(read,null,{signal:session.controller.signal});
  if(onboardingSession!==session||!saved){
    if(onboardingSession===session){
      session.busy=false;setOnboardingChoiceBusy(false);
      if(!saved)setOnboardingChoiceNote('책을 준비하지 못했어요. 잠시 뒤 다시 눌러 보세요.');
    }
    return;
  }
  trackOnboardingFinish(session);
  if(typeof trackEvent==='function')trackEvent('onboarding_choice',{choice:'read',book:entry.id});
  endOnboarding(true);
  await openBook(saved);
}
function startOnboarding(replay){
  if(onboardingSession)endOnboarding(false);
  closeSettings();
  // A stale resume marker from the discarded guide never resumes: the
  // carousel always opens on the first card.
  try{localStorage.removeItem(ONBOARD_PROGRESS_KEY);}catch{}
  const session={replay:!!replay,
    previousView:activeAppView(),controller:new AbortController(),focus:document.activeElement,inert:[],
    motion:matchMedia('(prefers-reduced-motion: reduce)'),importController:null,observer:null,theme:null,fanW:0,fanH:0,
    depthFrame:0,settleTimer:0,playSettleTimer:0,mediaCard:-1,gestureTimer:0,scrollTimer:0,gesture:null,fanEls:[],layoutDepth:null,bookIndex:1,busy:false,card:0,stepAt:Date.now(),
    scrollY:window.scrollY||0};
  onboardingSession=session;
  if(typeof trackEvent==='function')trackEvent('onboarding_start',{replay:!!replay});
  for(const node of document.querySelectorAll(/** @type {'div'} */('.view,#topbar,#word-peek,#panel,#aa-pop,#sentence-modal,#settings-modal,#add-modal'))){
    session.inert.push([node,node.inert]);node.inert=true;
  }
  const root=document.getElementById('onboarding');
  document.documentElement.classList.add('onboarding-open');
  layoutOnboardingViewport();
  root.hidden=false;
  setOnboardingChoiceNote('');
  const signal=session.controller.signal;
  const wrap=document.getElementById('onboard-wrap');
  buildOnboardingFan(session);
  wrap.scrollTo({left:0,behavior:'instant'});
  syncOnboardingDots();
  syncOnboardingPosters();
  onboardingWideQuery.addEventListener('change',()=>{if(onboardingSession===session)syncOnboardingPosters();},{signal});
  for(const video of onboardingVideos()){
    video.addEventListener('playing',()=>{
      const poster=onboardingPoster(video);
      // autoplay can reach 'playing' after the reduced-motion pause, and
      // that was hiding the poster again. Keep the still up and stay paused.
      if(session.motion.matches||document.hidden){
        try{video.pause();}catch{}
        if(poster)poster.hidden=false;
        return;
      }
      if(poster)poster.hidden=true;
    },{signal});
    // Both clips carry autoplay, so the off-screen one would otherwise run
    // ahead and the next settle would resume it mid-clip. Pause wins over
    // that in-flight play(); the settled card is the only one left running.
    video.addEventListener('play',()=>{
      if(onboardingSession!==session)return;
      const videos=onboardingVideos();
      const active=videos.indexOf(video)===onboardingCardIndex()&&!session.motion.matches&&!document.hidden;
      if(active)return;
      try{video.pause();}catch{}
      rewindOnboardingVideo(video);
      const poster=onboardingPoster(video);
      if(poster)poster.hidden=false;
    },{signal});
  }
  settleOnboardingVideos(session);
  bindOnboardingGestures(session);
  const relayout=()=>{if(onboardingSession===session)layoutOnboardingViewport();};
  window.visualViewport?.addEventListener('resize',relayout,{signal});
  window.visualViewport?.addEventListener('scroll',relayout,{signal});
  window.addEventListener('resize',relayout,{signal});
  wrap.addEventListener('scroll',syncOnboardingDots,{passive:true,signal});
  wrap.addEventListener('scroll',()=>{noteOnboardingCard(session);queueOnboardingPlaybackSettle(session);},{passive:true,signal});
  wrap.addEventListener('scrollend',()=>settleOnboardingVideos(session),{signal});
  document.addEventListener('visibilitychange',()=>settleOnboardingVideos(session),{signal});
  document.getElementById('onboard-skip').addEventListener('click',()=>{
    if(typeof trackEvent==='function'){const step=onboardingStepName(session);if(step)trackEvent('onboarding_step_skip',{step,ms:onboardingStepMs(session)});}
    if(typeof trackEvent==='function')trackEvent('onboarding_choice',{choice:'skip'});
    endOnboarding(true);
  },{signal});
  document.getElementById('onboard-read').addEventListener('click',()=>{openOnboardingBook(session);},{signal});
  document.getElementById('onboard-file').addEventListener('click',()=>{
    const input=/** @type {HTMLInputElement} */(document.getElementById('onboard-fileinput'));
    input.value='';input.click();
  },{signal});
  document.getElementById('onboard-browse').addEventListener('click',()=>{
    trackOnboardingFinish(session);
    if(typeof trackEvent==='function')trackEvent('onboarding_choice',{choice:'browse'});
    endOnboarding(true);show('home');
  },{signal});
  const input=/** @type {HTMLInputElement} */(document.getElementById('onboard-fileinput'));
  input.value='';
  input.addEventListener('change',async()=>{
    const file=input.files&&input.files[0];
    input.value='';
    if(!file||session.importController)return;
    const controller=new AbortController();
    session.importController=controller;
    setOnboardingChoiceBusy(true);
    setOnboardingChoiceNote('');
    try{
      const result=await importFile(file,null,{signal:controller.signal});
      // Back, Skip, replay and external navigation invalidate this handoff.
      if(onboardingSession!==session||session.importController!==controller)return;
      if(result?.bookId){
        trackOnboardingFinish(session);
        if(typeof trackEvent==='function')trackEvent('onboarding_choice',{choice:'import'});
        endOnboarding(true);return;
      }
      setOnboardingChoiceNote('책을 넣지 못했어요. DRM이 없는 PDF · EPUB · TXT 파일을 다시 골라주세요.');
    }catch{
      if(onboardingSession!==session||session.importController!==controller)return;
      setOnboardingChoiceNote('책을 넣지 못했어요. 파일을 다시 골라주세요.');
    }finally{
      if(onboardingSession===session){session.importController=null;setOnboardingChoiceBusy(false);}
    }
  },{signal});
  // The guide owns keyboard input until its session signal aborts,
  // including Escape after a tap. Arrow keys move between cards, the
  // keyboard equivalent of a swipe; there are no prev/next buttons.
  document.addEventListener('keydown',event=>{
    event.stopPropagation();
    if(event.key==='Escape'){event.preventDefault();endOnboarding(false);return;}
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
      event.preventDefault();
      const card=wrap.querySelector(/** @type {'article'} */('.onboard-card'));
      const advance=card?card.offsetWidth+20:wrap.clientWidth;
      wrap.scrollBy({left:(event.key==='ArrowRight'?1:-1)*advance,behavior:session.motion.matches?'auto':'smooth'});
      return;
    }
    if(event.key==='Tab'){
      const controls=[...root.querySelectorAll(/** @type {'button'} */('button'))].filter(node=>!node.disabled&&node.getClientRects().length);
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  },{signal,capture:true});
  window.addEventListener('popstate',event=>{event.stopImmediatePropagation();endOnboarding(false);},{signal,capture:true});
  session.theme=new MutationObserver(()=>{
    if(activeAppView()!==session.previousView)endOnboarding(false);
  });
  session.theme.observe(document.body,{attributes:true,attributeFilter:['class']});
  for(const view of document.querySelectorAll('.view'))session.theme.observe(view,{attributes:true,attributeFilter:['class']});
  document.getElementById('onboard-skip').focus({preventScroll:true});
}
function endOnboarding(remember,returnToPrevious=true){
  const session=onboardingSession;
  if(!session)return;
  onboardingSession=null;
  session.importController?.abort();
  session.controller.abort();
  session.theme.disconnect();
  session.observer?.disconnect();
  if(session.depthFrame)cancelAnimationFrame(session.depthFrame);
  clearTimeout(session.settleTimer);
  clearTimeout(session.playSettleTimer);
  clearTimeout(session.gestureTimer);
  clearTimeout(session.scrollTimer);
  for(const video of onboardingVideos()){try{video.pause();}catch{}}
  document.documentElement.classList.remove('onboarding-open');
  const root=document.getElementById('onboarding');
  root.hidden=true;
  root.style.top='';
  root.style.height='';
  root.style.bottom='';
  root.style.removeProperty('--vv-h');
  root.style.removeProperty('--vv-top');
  if(session.scrollY)window.scrollTo(0,session.scrollY);
  for(const [node,inert] of session.inert)node.inert=inert;
  if(remember){save(ONBOARD_KEY,'done');try{localStorage.removeItem(ONBOARD_PROGRESS_KEY);}catch{}}
  if(activeAppView()==='home'){if(typeof paintHome==='function')paintHome();else renderHome();}
  if(session.focus instanceof HTMLElement&&session.focus.getClientRects().length)session.focus.focus({preventScroll:true});
}
function maybeShowOnboarding(){
  if(load(ONBOARD_KEY,'')==='done')return;
  if(books.length||Object.keys(words).length||Object.keys(dead).length||Object.keys(positions).length){save(ONBOARD_KEY,'done');return;}
  return startOnboarding(false);
}
