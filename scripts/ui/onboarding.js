/* Three-card carousel dialog. The layout, copy, video switching and card 3
   cover fan are ported from the reviewed standalone page
   (onboarding-carousel.html) so the dialog shows exactly what was reviewed.
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
/* Media switching: the <source media> switch is CSS-driven, but the poster
   is a single attribute per video, so swap it at the same breakpoint. */
const onboardingWideQuery=typeof matchMedia==='function'?matchMedia('(min-width: 768px)'):null;
function syncOnboardingVideoPosters(){
  if(!onboardingWideQuery)return;
  for(const video of document.querySelectorAll(/** @type {'video'} */('#onboarding .onboard-card video'))){
    const next=onboardingWideQuery.matches?video.dataset.posterWide:video.dataset.poster;
    if(next&&video.getAttribute('poster')!==next)video.setAttribute('poster',next);
  }
}
if(onboardingWideQuery&&typeof onboardingWideQuery.addEventListener==='function'){
  onboardingWideQuery.addEventListener('change',syncOnboardingVideoPosters);
}

function onboardingCardIndex(){
  const wrap=document.getElementById('onboard-wrap');
  const card=wrap.querySelector(/** @type {'article'} */('.onboard-card'));
  if(!card)return 0;
  const advance=card.offsetWidth+20;
  return Math.max(0,Math.min(2,Math.round(wrap.scrollLeft/advance)));
}
function syncOnboardingDots(){
  const current=onboardingCardIndex();
  for(const dots of document.querySelectorAll('#onboarding .onboard-dots')){
    [...dots.children].forEach((el,i)=>el.classList.toggle('on',i===current));
  }
  const status=document.getElementById('onboard-status');
  if(status)status.textContent=`${current+1} / 3 · ${ONBOARD_CARD_TITLES[current]}`;
}
function onboardingVideoVisible(video,wrap){
  const rect=video.getBoundingClientRect(),bounds=wrap.getBoundingClientRect();
  const visible=Math.min(rect.right,bounds.right)-Math.max(rect.left,bounds.left);
  return rect.width>0&&visible/rect.width>=0.6;
}
function syncOnboardingVideoPlayback(session){
  const wrap=document.getElementById('onboard-wrap');
  for(const video of document.querySelectorAll(/** @type {'video'} */('#onboarding .onboard-card video'))){
    if(onboardingVideoVisible(video,wrap)&&!session.motion.matches&&!document.hidden)video.play().catch(()=>{});
    else video.pause();
  }
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
    const s=step();
    if(!s)return;
    const half=fan.clientWidth/2;
    const center=fan.scrollLeft+half;
    const w=els[0].offsetWidth;
    for(const el of els){
      const d=(el.offsetLeft+w/2-center)/s;
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
  const signal=session.controller.signal;
  fan.addEventListener('scroll',()=>{queueDepth();queueOnboardingSettle(session);},{passive:true,signal});
  window.addEventListener('resize',queueDepth,{signal});
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
    motion:matchMedia('(prefers-reduced-motion: reduce)'),importController:null,observer:null,theme:null,
    depthFrame:0,settleTimer:0,fanEls:[],layoutDepth:null,bookIndex:1,busy:false};
  onboardingSession=session;
  if(typeof trackEvent==='function')trackEvent('onboarding_start',{replay:!!replay});
  for(const node of document.querySelectorAll(/** @type {'div'} */('.view,#topbar,#word-peek,#panel,#aa-pop,#sentence-modal,#settings-modal,#add-modal'))){
    session.inert.push([node,node.inert]);node.inert=true;
  }
  const root=document.getElementById('onboarding');
  root.hidden=false;
  setOnboardingChoiceNote('');
  syncOnboardingVideoPosters();
  const signal=session.controller.signal;
  const wrap=document.getElementById('onboard-wrap');
  buildOnboardingFan(session);
  wrap.scrollTo({left:0,behavior:'instant'});
  syncOnboardingDots();
  // Play only the card that is actually in view; pause the other one.
  // No autoplay attribute: with preload="none" nothing is fetched until
  // a card is actually shown, and reduced motion fetches nothing at all.
  session.observer=new IntersectionObserver(entries=>{
    for(const entry of entries){
      const video=/** @type {HTMLVideoElement} */(entry.target);
      if(entry.intersectionRatio>=0.6&&!session.motion.matches&&!document.hidden)video.play().catch(()=>{});
      else video.pause();
    }
  },{root:wrap,threshold:[0.6]});
  for(const video of document.querySelectorAll('#onboarding .onboard-card video'))session.observer.observe(video);
  wrap.addEventListener('scroll',syncOnboardingDots,{passive:true,signal});
  document.getElementById('onboard-skip').addEventListener('click',()=>{
    if(typeof trackEvent==='function')trackEvent('onboarding_choice',{choice:'skip'});
    endOnboarding(true);
  },{signal});
  document.getElementById('onboard-read').addEventListener('click',()=>{openOnboardingBook(session);},{signal});
  document.getElementById('onboard-file').addEventListener('click',()=>{
    const input=/** @type {HTMLInputElement} */(document.getElementById('onboard-fileinput'));
    input.value='';input.click();
  },{signal});
  document.getElementById('onboard-browse').addEventListener('click',()=>{
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
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){for(const video of document.querySelectorAll(/** @type {'video'} */('#onboarding .onboard-card video')))video.pause();}
    else syncOnboardingVideoPlayback(session);
  },{signal});
  window.addEventListener('pagehide',()=>{for(const video of document.querySelectorAll(/** @type {'video'} */('#onboarding .onboard-card video')))video.pause();},{signal});
  window.addEventListener('pageshow',()=>syncOnboardingVideoPlayback(session),{signal});
  window.addEventListener('popstate',event=>{event.stopImmediatePropagation();endOnboarding(false);},{signal,capture:true});
  session.motion.addEventListener('change',()=>{
    if(session.motion.matches){for(const video of document.querySelectorAll(/** @type {'video'} */('#onboarding .onboard-card video')))video.pause();}
    else syncOnboardingVideoPlayback(session);
  },{signal});
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
  for(const video of document.querySelectorAll(/** @type {'video'} */('#onboarding .onboard-card video')))video.pause();
  document.getElementById('onboarding').hidden=true;
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
