/* First-run onboarding v2.
   The intro is a pre-rendered video. A transparent hotspot sits on "take",
   then the real #word-peek lands on the video pill. Its text is only "맡다".
   Nothing here calls the network. Clip choice reads hotspots.json and picks
   the variant whose aspect is closest to the viewport. */
const ONBOARD_KEY='breeze.onboarding.v1';
const ONBOARD_PROGRESS_KEY='breeze.onboarding.carousel-progress';
const ONBOARD_VERSION='v2';
const ONBOARD_FIRST_TAP_KEY='breeze.onboarding.v2.first-word-tap';
const ONBOARD_FIRST_LOOKUP_KEY='breeze.onboarding.v2.first-lookup';
const LONGPRESS_TIP_KEY='breeze.reader.longpress-tip';
const LONGPRESS_TAP_KEY='breeze.reader.word-taps';
const LONGPRESS_TAPS=3;
const ONBOARD_SENTENCE='She decided to take the job in London.';
const ONBOARD_MEANING='맡다';
const ONBOARD_VIDEO_DIR='assets/onboarding/video/';
const ONBOARD_BOOKS=[
  {id:'the-great-gatsby',cta:'개츠비 바로 읽기'},
  {id:'alice-in-wonderland',cta:'앨리스 바로 읽기'},
  {id:'sherlock-holmes-speckled-band',cta:'얼룩무늬 띠 바로 읽기'},
  {id:'sherlock-holmes-scandal-in-bohemia',cta:'보헤미아 바로 읽기'},
  {id:'sherlock-holmes-red-headed-league',cta:'빨간 머리 연맹 바로 읽기'},
  {id:'sherlock-holmes-final-problem',cta:'마지막 사건 바로 읽기'},
  {id:'sherlock-holmes-hound-of-the-baskervilles',cta:'바스커빌 바로 읽기'},
];
const PEEK_PX=78;
/* Cycle 1: live intro. Words follow the attached promo frame (2.2s): rows
   around a centre gap where the live take sits. Only the choice screen
   (covers, buttons) is left alone; the pill/save cycles come later. */
let onboardHotspotsPromise=null;

function lerpStops(a,values){
  if(a<=0)return values[0];
  if(a>=3)return values[3];
  const i=Math.min(2,Math.floor(a));
  const t=a-i;
  return values[i]+(values[i+1]-values[i])*t;
}
function onboardNorm(box){
  if(!box||typeof box.x!=='number'||typeof box.y!=='number'||typeof box.w!=='number'||typeof box.h!=='number')return null;
  return box;
}
function onboardViewports(hotspots){
  const out={
    portrait:{w:390,h:844},
    landscape:{w:1024,h:666},
    ipadportrait:{w:820,h:1180},
    ipadlandscape:{w:1180,h:820},
  };
  const notes=hotspots&&hotspots._notes;
  const text=notes&&typeof notes.coords==='string'?notes.coords:'';
  const listed=/reference viewport \(([^)]*)\)/.exec(text);
  if(listed){
    const re=/([a-z][a-z0-9]*)\s+(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)/g;
    let match;
    while((match=re.exec(listed[1])))out[match[1]]={w:Number(match[2]),h:Number(match[3])};
  }
  const declared=hotspots&&hotspots.viewports;
  if(declared&&typeof declared==='object'){
    for(const id of Object.keys(declared)){
      const box=declared[id];
      const w=box&&(box.w||box.width),h=box&&(box.h||box.height);
      if(w>0&&h>0)out[id]={w:w,h:h};
    }
  }
  return out;
}
function onboardClipViewport(id,entry,viewports){
  const box=entry&&(entry.viewport||entry.reference);
  const w=box&&(box.w||box.width),h=box&&(box.h||box.height);
  if(w>0&&h>0)return {w:w,h:h};
  return viewports[id]||null;
}
function onboardVariants(hotspots){
  const viewports=onboardViewports(hotspots||{});
  const variants=[];
  for(const key of Object.keys(hotspots||{})){
    const match=/^intro_idle_loop_(.+)$/.exec(key);
    if(!match)continue;
    const id=match[1];
    const idle=hotspots[key];
    const main=hotspots['intro_main_'+id];
    if(!idle||!main)continue;
    const viewport=onboardClipViewport(id,main,viewports)||onboardClipViewport(id,idle,viewports);
    const take=onboardNorm(idle.take_word_box_norm);
    const pill=onboardNorm(main.pill_box_norm);
    const sentence=onboardNorm(main.take_word_box_norm);
    if(!viewport||!take||!pill)continue;
    variants.push({
      id:id,w:viewport.w,h:viewport.h,take:take,pill:pill,sentence:sentence,main:main,
      staticAt:typeof main.static_from_s==='number'?main.static_from_s:4,
    });
  }
  return variants;
}
function pickOnboardVariant(variants,viewW,viewH){
  if(!variants||!variants.length)return null;
  const aspect=viewW/Math.max(1,viewH);
  let best=variants[0],bestDist=Infinity;
  for(const variant of variants){
    const dist=Math.abs(Math.log(aspect)-Math.log(variant.w/variant.h));
    if(dist<bestDist-1e-9){best=variant;bestDist=dist;}
  }
  return best;
}
function onboardCoverRect(norm,viewW,viewH,videoW,videoH){
  const scale=Math.max(viewW/Math.max(1,videoW),viewH/Math.max(1,videoH));
  const width=videoW*scale,height=videoH*scale;
  const left=(viewW-width)/2,top=(viewH-height)/2;
  return {left:left+norm.x*width,top:top+norm.y*height,width:norm.w*width,height:norm.h*height};
}
function onboardThemeName(){
  return document.documentElement.classList.contains('dark')||document.body.classList.contains('dark')?'dark':'light';
}
function onboardClipUrl(kind,id,theme){
  return ONBOARD_VIDEO_DIR+'intro_'+kind+'_'+id+'_'+theme+'.mp4';
}
function loadOnboardHotspots(){
  if(!onboardHotspotsPromise){
    onboardHotspotsPromise=fetch(ONBOARD_VIDEO_DIR+'hotspots.json').then(response=>{
      if(!response.ok)throw new Error('hotspots');
      return response.json();
    }).catch(error=>{onboardHotspotsPromise=null;throw error;});
  }
  return onboardHotspotsPromise;
}

let onboardingSession=null;
let onboardCoverUnit=1;
let onboardingRequest=0;
let longpressTip=null;
let longpressHighlight=null;

function onboardTiming(){
  const extra=globalThis.__ONBOARD_TIMING__;
  const base={idle:3000,burst:470,hold:2000,suck:255,pill:431,toast:700,choice:1000};
  return extra&&typeof extra==='object'?Object.assign({},base,extra):base;
}
function clockRate(){
  if(!globalThis.__ONBOARD_TIMING__||typeof globalThis.__ONBOARD_TIMING__.burst!=='number')return 1;
  return Math.max(1,470/Math.max(1,onboardTiming().burst));
}
function onboardMirror(name,props){
  const detail=Object.assign({onboarding_version:ONBOARD_VERSION},props||{});
  const mirror=globalThis.breezeTrack;
  if(typeof mirror!=='function'||mirror===globalThis.trackEvent)return;
  try{mirror(name,detail);}catch(error){console.warn('온보딩 이벤트를 남기지 못했어요:',name,error&&error.name);}
}
function stepMs(session){
  return Math.max(0,Math.min(3600000,Math.round(performance.now()-(session.stepAt||performance.now()))));
}
function noteFirstWordTap(){
  if(load(ONBOARD_FIRST_TAP_KEY,false))return;
  save(ONBOARD_FIRST_TAP_KEY,true);
  if(typeof trackEvent==='function')trackEvent('first_word_tap');
  onboardMirror('first_word_tap',{});
}
function noteLookupSuccess(source){
  if(load(ONBOARD_FIRST_LOOKUP_KEY,false))return;
  save(ONBOARD_FIRST_LOOKUP_KEY,true);
  if(typeof trackEvent==='function')trackEvent('first_lookup_success');
  onboardMirror('first_lookup_success',{source:source==='dict'?'dict':'canned'});
}
function onboardSampleOnly(){
  const keys=Object.keys(words);
  if(keys.length!==1||keys[0]!=='take')return false;
  const item=words.take;
  return !!(item&&item.onboardingSample);
}
function persistOnboardingTake(session){
  const existing=words.take;
  const same=existing&&existing.onboardingSample&&existing.ko===ONBOARD_MEANING&&existing.example===ONBOARD_SENTENCE;
  if(existing&&validWordMeaning(existing)&&!existing.onboardingSample)return 'kept';
  if(same)return 'exists';
  if(session&&session.replay&&Object.keys(words).some(id=>id!=='take'))return 'skipped';
  const now=Date.now();
  words.take={
    word:'take',clicked:'take',forms:['take','takes','took','taken','taking'],
    ko:ONBOARD_MEANING,phon:'',defs:[],example:ONBOARD_SENTENCE,book:'',
    status:1,mark:true,onboardingSample:true,
    addedAt:existing&&existing.addedAt||now,
    up:Math.max(now,(dead.take||0)+1,(existing&&existing.up||0)+1),
    pickedAt:now,
    ai:{ko:ONBOARD_MEANING,pos:'동사',done:true,cached:true},
  };
  if(dead.take){delete dead.take;saveDead('take');}
  if(typeof refreshWordIndex==='function')refreshWordIndex('take');
  saveWords('take');
  try{if(typeof queueSync==='function')queueSync(true);}catch(error){}
  return 'saved';
}
function onboardReads(){
  return ONBOARD_BOOKS.map(item=>{
    const read=typeof longReadDefinition==='function'?longReadDefinition(item.id):null;
    if(!read||!read.cover)return null;
    return {id:item.id,cta:item.cta,title:read.title,author:read.author,cover:read.cover};
  }).filter(Boolean);
}
function onboardingOwnsReader(){return false;}
function onboardingAppearanceOpened(){}
function openOnboardingWord(){}
function renderOnboardingWordDetail(){}
async function explainOnboardingSentence(){}
function maybeShowOnboarding(){
  if(load(ONBOARD_KEY,'')==='done')return;
  const foreign=books.length||Object.keys(positions).length||Object.keys(dead).length
    ||(Object.keys(words).length&&!onboardSampleOnly());
  if(foreign){save(ONBOARD_KEY,'done');localStorage.removeItem(ONBOARD_PROGRESS_KEY);return;}
  return startOnboarding(false);
}
function resumeOnboardingAtChoice(progress,replay){
  if(replay||!progress||typeof progress!=='object')return false;
  if(progress.scene==='choice'||progress.feature==='finish')return true;
  return Number.isInteger(progress.page)&&progress.page>0;
}
function scheduleMarks(session){
  session.suckAt=Infinity;
  session.zoomAt=Infinity;
  session.pillAt=Infinity;
  session.toastAt=Infinity;
  session.continueAt=Infinity;
}
function startOnboarding(replay){
  if(onboardingSession)endOnboarding(false);
  closeSettings();
  const progress=load(ONBOARD_PROGRESS_KEY,null);
  const session={
    replay:!!replay,motion:matchMedia('(prefers-reduced-motion: reduce)'),
    mode:'boot',step:'word',stepAt:performance.now(),
    clock:0,last:performance.now(),B:onboardTiming().idle,rate:clockRate(),
    reduced:false,burstStarted:false,mainStarted:false,pillShown:false,liveIntro:true,
    saved:false,coversReady:false,importing:false,
    didWord:false,didBurst:false,didSentence:false,didSave:false,peekReady:false,pullCommit:false,
    variants:[],variant:null,theme:'light',
    p:0,v:0,spring:null,drag:null,dragMoved:false,labelIndex:-1,fit:1,
    reads:[],
    previousView:activeAppView(),focus:document.activeElement,inert:[],
    controller:new AbortController(),hidden:false,stopped:false,pumping:false,
  };
  session.reduced=session.motion.matches;
  scheduleMarks(session);
  onboardingSession=session;
  for(const node of document.querySelectorAll('.view,#topbar,#panel,#aa-pop,#sentence-modal,#settings-modal,#add-modal')){
    session.inert.push([node,node.inert]);node.inert=true;
  }
  document.body.classList.add('onboarding-active');
  adoptPeek(session);
  document.getElementById('onboarding').hidden=false;
  bindOnboarding(session);
  if(typeof trackEvent==='function')trackEvent('onboarding_start',{replay:!!replay});
  onboardMirror('onboarding_start',{replay:!!replay});
  ensurePump(session);
  if(resumeOnboardingAtChoice(progress,replay))showChoice(session,false);
  else showDemo(session);
}
function bindOnboarding(session){
  const signal=session.controller.signal;
  const root=document.getElementById('onboarding');
  document.getElementById('onboard-skip').addEventListener('click',()=>skipOnboarding(session),{signal});
  document.getElementById('onboard-take').addEventListener('click',()=>{
    if(onboardingSession!==session||session.mode!=='demo'||session.mainStarted)return;
    startOnboardMain(session,'tap');
  },{signal});
  document.getElementById('word-peek-retry').addEventListener('click',event=>{
    if(!onboardingPeekLocked())return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    fadeLockedOnboardingPeek();
  },{capture:true,signal});
  document.getElementById('word-peek').addEventListener('click',event=>{
    if(onboardingSession!==session||session.mode!=='demo'||!session.pillShown)return;
    if(event.target.closest&&event.target.closest('#word-peek-retry,#word-peek-more'))return;
    document.getElementById('word-peek-more').click();
  },{signal});
  const choice=document.getElementById('onboard-choice');
  choice.addEventListener('pointerdown',event=>beginPull(session,event),{signal});
  choice.addEventListener('pointermove',event=>movePull(session,event),{signal});
  choice.addEventListener('pointerup',event=>endPull(session,event),{signal});
  choice.addEventListener('pointercancel',()=>endPull(session),{signal});
  document.getElementById('onboard-coverflow').addEventListener('click',event=>{
    if(onboardingSession!==session||session.mode!=='demo'||!session.peekReady)return;
    if(!(event.target.closest&&event.target.closest('.onboard-cover')))return;
    event.preventDefault();event.stopPropagation();
    if(session.pullDragMoved){session.pullDragMoved=false;return;}
    showChoice(session,false);
  },{capture:true,signal});
  document.addEventListener('wheel',event=>{
    if(onboardingSession!==session||session.mode!=='demo'||!session.peekReady||session.pullDrag)return;
    if(Math.abs(event.deltaY)<Math.abs(event.deltaX))return;
    event.preventDefault();
    nudgePull(session,event.deltaY);
  },{signal,capture:true,passive:false});
  document.getElementById('onboard-read').addEventListener('click',()=>chooseOnboardingBook(session),{signal});
  document.getElementById('onboard-file').addEventListener('click',()=>{
    if(session.importing)return;
    document.getElementById('onboard-fileinput').click();
  },{signal});
  document.getElementById('onboard-browse').addEventListener('click',()=>chooseOnboardingBrowse(session),{signal});
  document.getElementById('onboard-fileinput').addEventListener('change',()=>importOnboardingFile(session),{signal});
  document.getElementById('word-peek-more').addEventListener('click',()=>{
    if(onboardingSession!==session||session.mode!=='demo'||!session.pillShown)return;
    ensureOnboardingWord(session);
    selKey='take';
    wordPeekActive=true;
    previewWordCard=null;
    wordDetailAnchored=false;
    wordPeekAnchor=onboardSentenceAnchor(session);
    const panel=adoptPanel(session);
    panel.inert=false;
    if(typeof renderPanel==='function')renderPanel();
    const inner=panel.querySelector('.inner');
    if(inner)inner.getBoundingClientRect();
  },{capture:true,signal});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      event.preventDefault();event.stopPropagation();
      if(session.mode==='choice')endOnboarding(false);
      else skipOnboarding(session);
      return;
    }
    if(session.mode==='choice'&&(event.key==='ArrowRight'||event.key==='ArrowLeft')){
      event.preventDefault();
      springTo(session,Math.round(session.p)+(event.key==='ArrowRight'?1:-1),0);
      return;
    }
    if(event.key!=='Tab')return;
    const controls=[...root.querySelectorAll('button,input,[tabindex="0"]')].filter(node=>!node.disabled&&!node.hidden&&node.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(!first)return;
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  },{signal,capture:true});
  document.addEventListener('visibilitychange',()=>{
    session.hidden=document.hidden;
    session.last=performance.now();
    const idle=document.getElementById('onboard-video-idle');
    const main=document.getElementById('onboard-video-main');
    if(document.hidden){
      if(idle)idle.pause();
      if(main)main.pause();
      return;
    }
    if(session.mode!=='demo')return;
    if(!session.mainStarted&&idle){const playing=idle.play();if(playing&&playing.catch)playing.catch(()=>{});}
    else if(session.mainStarted&&!session.pillShown&&!(session.reduced||session.motion.matches)&&main){
      const playing=main.play();if(playing&&playing.catch)playing.catch(()=>{});
    }
  },{signal});
  window.addEventListener('pagehide',()=>{session.hidden=true;session.last=performance.now();},{signal});
  window.addEventListener('pageshow',()=>{session.hidden=false;session.last=performance.now();},{signal});
  window.addEventListener('resize',()=>{
    if(onboardingSession!==session)return;
    if(session.mode==='demo'){
      layoutOnboardVideo(session,false);
      if(session.peekReady&&!session.pullDrag){
        fitChoice();
        const rest=peekShift();
        if(session.shiftSpring===session.restShift)session.shiftSpring=rest;
        session.restShift=rest;
        if(session.shiftSpring==null)session.shift=Math.min(session.shift||0,rest);
        renderPull(session);
      }
    }else{fitChoice();session.coversDirty=true;}
  },{signal});
  window.addEventListener('popstate',event=>{
    event.stopImmediatePropagation();
    endOnboarding(false);
  },{signal,capture:true});
  session.motion.addEventListener('change',()=>{
    if(onboardingSession!==session)return;
    session.reduced=session.motion.matches;
    if(session.reduced&&session.mode==='demo'&&session.variant){
      if(!session.mainStarted)startOnboardMain(session,'reduced');
      else pinOnboardMain(session);
    }
  },{signal});
  session.themeObserver=new MutationObserver(()=>{
    if(onboardingSession===session&&session.mode==='demo')layoutOnboardVideo(session,false);
  });
  session.themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  session.themeObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
  session.observer=new MutationObserver(()=>{
    if(onboardingSession===session&&activeAppView()!==session.previousView)endOnboarding(false);
  });
  for(const view of document.querySelectorAll('.view'))session.observer.observe(view,{attributes:true,attributeFilter:['class']});
}
function ensurePump(session){
  if(session.pumping)return;
  session.pumping=true;
  let rafAt=0;
  const loop=now=>{
    if(session.stopped||onboardingSession!==session)return;
    rafAt=now;
    tick(session,now);
    session.raf=requestAnimationFrame(loop);
  };
  session.raf=requestAnimationFrame(loop);
  const backup=()=>{
    if(session.stopped||onboardingSession!==session)return;
    const now=performance.now();
    if(now-rafAt>50)tick(session,now);
    session.timer=setTimeout(backup,32);
  };
  session.timer=setTimeout(backup,32);
}
function tick(session,now){
  if(session.stopped)return;
  if(session.hidden){session.last=now;return;}
  const dtMs=Math.min(64,Math.max(0,now-session.last));
  session.last=now;
  if(session.mode==='demo'){
    session.clock+=dtMs*session.rate;
    advanceDemo(session);
    if(session.peekReady){
      const before=session.shift;
      tickShift(session,dtMs/1000);
      if(session.mode==='demo'&&(session.shiftSpring!=null||session.pullDrag||session.shift!==before||!session.pullPainted)){
        renderPull(session);
        session.pullPainted=session.shiftSpring==null&&!session.pullDrag;
      }
    }
  }else if(session.mode==='choice')tickCovers(session,dtMs/1000);
}
/* Remotion OnboardingIntro port (numbers copied from src/onb/OnboardingIntro.tsx).
   World = promo recording coords (1170 wide). Camera scale s maps world to screen:
   screen font = 53.9 * s, start 125.7px, lock 60.8px, end 22px. */
const LIVE_TAKE={x:510,y:699};
const LIVE_TAKE_BOX={l:459,t:668,r:561,b:730};
const LIVE_FS=53.9, LIVE_LEFT=98.5, LIVE_TOP0=671, LIVE_LINE={cx:554,cy:699};
const LIVE_S_END=22/LIVE_FS;
const LIVE_S_BIG=(LIVE_S_END*6.4)/1.12, LIVE_S_LOCK=(LIVE_S_END*3.1)/1.12;
const LIVE_K=390/1080;
const LIVE_MEANINGS=['잡다','가져가다','데려가다','걸리다','받아들이다','참다','먹다','타다','찍다','앉다','맡다','점령하다','고르다','하다','받다','취하다','필요로 하다','듣다','빼다','재다','여기다','견디다','차지하다','쥐다','택하다','이용하다','복용하다','수강하다','사다','간주하다','소요되다','적다','빼앗다','섭취하다','수락하다','감수하다','촬영하다','측정하다','인수하다','선택하다','붙잡다','수용하다','함락하다','승차하다'];
const LIVE_WIDTH_EM={"잡다":1.705,"가져가다":3.39,"데려가다":3.39,"걸리다":2.548,"받아들이다":4.233,"참다":1.705,"먹다":1.705,"타다":1.705,"찍다":1.705,"앉다":1.705,"맡다":1.705,"점령하다":3.39,"고르다":2.548,"하다":1.705,"받다":1.705,"취하다":2.548,"필요로 하다":4.452,"듣다":1.705,"빼다":1.705,"재다":1.705,"여기다":2.548,"견디다":2.548,"차지하다":3.39,"쥐다":1.705,"택하다":2.548,"이용하다":3.39,"복용하다":3.39,"수강하다":3.39,"사다":1.705,"간주하다":3.39,"소요되다":3.39,"적다":1.705,"빼앗다":2.548,"섭취하다":3.39,"수락하다":3.39,"감수하다":3.39,"촬영하다":3.39,"측정하다":3.39,"인수하다":3.39,"선택하다":3.39,"붙잡다":2.548,"수용하다":3.39,"함락하다":3.39,"승차하다":3.39};
const LIVE_WEIGHTS=[500,600,700,800];
function liveRnd(i){const x=Math.sin(i*127.1+311.7)*43758.5453;return x-Math.floor(x);}
function liveClamp(v,a,b){return Math.max(a,Math.min(b,v));}
function liveBezier(x1,y1,x2,y2){
  const cx=3*x1, bx=3*(x2-x1)-cx, ax=1-cx-bx, cy=3*y1, by=3*(y2-y1)-cy, ay=1-cy-by;
  const sampleX=t=>((ax*t+bx)*t+cx)*t, sampleY=t=>((ay*t+by)*t+cy)*t, sampleSlope=t=>(3*ax*t+2*bx)*t+cx;
  return p=>{
    if(p<=0)return 0; if(p>=1)return 1;
    let t=p;
    for(let i=0;i<8;i++){const err=sampleX(t)-p; if(Math.abs(err)<1e-6)break; const slope=sampleSlope(t); if(Math.abs(slope)<1e-6)break; t-=err/slope;}
    if(t<0||t>1){let lo=0,hi=1; for(let i=0;i<20;i++){t=(lo+hi)/2; if(sampleX(t)<p)lo=t; else hi=t;}}
    return sampleY(t);
  };
}
const LIVE_EASE={
  expoOut:liveBezier(0.16,1,0.3,1),
  expoInOut:liveBezier(0.87,0,0.13,1),
  spring:liveBezier(0.34,1.45,0.64,1),
  eio:liveBezier(0.42,0,0.58,1),
  shimmer:liveBezier(0.42,0,0.3,1),
  suck:liveBezier(0.6,0,0.95,0.45),
  lock:liveBezier(0.55,0,0.45,1),
  quadOut:p=>1-(1-p)*(1-p),
  linear:p=>p,
};
function liveInterp(t,points,values,easing){
  if(t<=points[0])return values[0];
  for(let i=1;i<points.length;i++){
    if(t<=points[i]){
      const p=(t-points[i-1])/(points[i]-points[i-1]);
      const e=easing?easing(p):p;
      return values[i-1]+(values[i]-values[i-1])*e;
    }
  }
  return values[values.length-1];
}
function liveAspect(W,H){
  if(H>W)return W<=420?'portrait':'ipadportrait';
  return W>=1180?'ipadlandscape':'landscape';
}
function buildLiveItems(aspect,vw,vh){
  const out=[]; let mi=0;
  const CFG={
    portrait:{mul:1,ys:[-820,-640,-460,-285,285,460,640,820].map(y=>y*LIVE_K*1.217),counts:[6,5,6,5,6,5,6,5]},
    landscape:{mul:1.1,ys:[-277,-190,-103,103,190,277],counts:[7,6,7,7,6,7]},
    ipadportrait:{mul:1.35,ys:[-515,-415,-315,-215,-115,115,215,315,415,515],counts:[5,4,5,4,4,4,5,4,5,4]},
    ipadlandscape:{mul:1.35,ys:[-380,-290,-200,-110,110,200,290,380],counts:[5,6,5,6,6,5,6,5]},
  }[aspect];
  // Cycle 6: wider word gaps on wide screens, so the cloud reads as spread
  // around Take instead of bunched in the middle.
  const gap=(aspect==='landscape'||aspect==='ipadlandscape'?110:72)*LIVE_K;
  const take=(n)=>{
    const row=[];
    for(let j=0;j<n&&mi<LIVE_MEANINGS.length;j++){
      const m=LIVE_MEANINGS[mi]; mi++;
      const size=(80+liveRnd(mi+3)*62)*LIVE_K*CFG.mul;
      row.push({m,size,w:LIVE_WIDTH_EM[m]*size,weight:LIVE_WEIGHTS[Math.floor(liveRnd(mi+9)*4)]});
    }
    return row;
  };
  CFG.ys.forEach((y,r)=>{
    const row=take(CFG.counts[r]);
    const total=row.reduce((a,it)=>a+it.w,0)+gap*(row.length-1);
    let x=-total/2+(liveRnd(r+40)-0.5)*260*LIVE_K;
    row.forEach(it=>{out.push({m:it.m,x:x+it.w/2,y:y+(liveRnd(mi+r)-0.5)*14*LIVE_K,size:it.size,weight:it.weight}); x+=it.w+gap;});
  });
  if(aspect==='landscape'&&mi<LIVE_MEANINGS.length){
    const rest=take(LIVE_MEANINGS.length-mi);
    const half=Math.ceil(rest.length/2);
    [rest.slice(0,half),rest.slice(half)].forEach((part,side)=>{
      let x=side===0?-168:168;
      part.forEach(it=>{
        const cx=side===0?x-it.w/2:x+it.w/2;
        out.push({m:it.m,x:cx,y:(liveRnd(mi+side)-0.5)*6,size:it.size,weight:it.weight});
        x+=side===0?-(it.w+gap):it.w+gap;
      });
    });
  }
  // Cycle 5: fit the burst inside the viewport, like the old layout. The
  // wide-screen rows are fixed px offsets, so on a shorter window the outer
  // rows were sliced off at the top and bottom (and wide rows at the sides).
  // Only the offsets are compressed, never the word sizes, and only when
  // they would actually overflow, so phone and tall windows are untouched.
  if(vw>0&&vh>0){
    let maxY=0, maxX=0;
    out.forEach(it=>{
      const w=LIVE_WIDTH_EM[it.m]*it.size;
      maxY=Math.max(maxY,Math.abs(it.y)+it.size*0.6);
      maxX=Math.max(maxX,Math.abs(it.x)+w/2);
    });
    const fY=Math.min(1,(vh/2-24)/maxY);
    // Side margin also covers the outward drift applied while rendering
    // (up to 22*LIVE_K px) so a fitted word cannot drift back off-screen.
    const fX=Math.min(1,(vw/2-36)/maxX);
    if(fY<1)out.forEach(it=>{it.y*=fY;});
    if(fX<1)out.forEach(it=>{it.x*=fX;});
    // Cycle 6: spread the cloud wider around Take. The fit above only ever
    // compresses, so on roomy windows the rows sat well inside the edges
    // and felt bunched around the take. Expand offsets up to 15%, then
    // refit so nothing can leave the viewport.
    let mY=0, mX=0;
    out.forEach(it=>{
      const w=LIVE_WIDTH_EM[it.m]*it.size;
      mY=Math.max(mY,Math.abs(it.y)+it.size*0.6);
      mX=Math.max(mX,Math.abs(it.x)+w/2);
    });
    const gY=Math.min(1.15,(vh/2-20)/mY);
    const gX=Math.min(1.15,(vw/2-28)/mX);
    if(gY>1)out.forEach(it=>{it.y*=gY;});
    if(gX>1)out.forEach(it=>{it.x*=gX;});
  }
  out.forEach((it,i)=>{
    it.d=Math.hypot(it.x,it.y)/LIVE_K;
    it.delay=(Math.hypot(it.x,it.y*1.3)/LIVE_K/1300)*196+liveRnd(i+30)*39;
    it.sd=2470-78+(1-Math.min(1,it.d/1200))*78+liveRnd(i+11)*39;
    if(it.m==='맡다')it.sd=2510;
  });
  return out;
}
function buildLiveMeanings(session){
  const wrap=document.getElementById('onboard-live-meanings');
  if(!wrap)return;
  const rect=document.getElementById('onboarding').getBoundingClientRect();
  const aspect=liveAspect(rect.width,rect.height);
  session.liveAspect=aspect;
  wrap.innerHTML='';
  session.liveItems=buildLiveItems(aspect,rect.width,rect.height).map((it,i)=>{
    const span=document.createElement('span');
    span.textContent=it.m;
    span.style.fontWeight=it.weight;
    span.style.fontSize=it.size+'px';
    span.style.opacity='0';
    wrap.append(span);
    return {...it,el:span,index:i};
  });
}
function measureLiveCenters(session){
  // Georgia (DOM) is narrower than Gelasio (Remotion), so the real take centre
  // sits ~36 world px left of LIVE_TAKE. Measure it once so the camera centres
  // the take that is actually on screen, not the Remotion coordinate.
  const world=document.getElementById('onboard-live-world');
  const take=document.getElementById('onboard-live-take-word');
  const sent=document.getElementById('onboard-live-sentence-main');
  if(!world||!take||!sent)return;
  const saved=world.style.transform;
  world.style.transform='none';
  const wr=world.getBoundingClientRect(), tr=take.getBoundingClientRect(), sr=sent.getBoundingClientRect();
  world.style.transform=saved;
  session.liveTake={x:tr.left-wr.left+tr.width/2,y:tr.top-wr.top+tr.height/2};
  session.liveTakeBox={l:tr.left-wr.left,t:tr.top-wr.top,w:tr.width,h:tr.height};
  session.liveSentCX=sr.left-wr.left+sr.width/2;
}
// Cycle 3: the final sentence is no longer a fixed 22px. On a phone it stays
// 22px; on wider screens it grows with the viewport so the sentence does not
// look tiny on desktop. The whole camera path scales with it, so the take
// zoom and the lock zoom keep their proportions.
// Cycle 4: the cap is 32px, not 44px. At 44px the desktop take zoom reached
// 4.66x, and the browser could no longer rasterise the world sharply at
// that scale, so the take looked low-res and its glow smeared into a blob
// (the sentence zoom-out stayed clean because it renders near 1x). At 32px
// the take zoom peaks at 3.39x, the sentence is still clearly bigger than
// the phone's 22px, and the raster stays sharp.
function liveFinalPx(W){return W<=390?22:Math.min(32,22*W/390);}
// Cycle 3: write a style only when it actually changed. After the intro lands,
// every value is steady, so a steady frame writes nothing instead of dirtying
// 44 meanings, the take word and the halo 60 times a second.
let liveStyleCache=new WeakMap();
function liveSet(el,prop,val){
  if(!el)return;
  let cache=liveStyleCache.get(el);
  if(!cache){cache={};liveStyleCache.set(el,cache);}
  if(cache[prop]!==val){cache[prop]=val;el.style[prop]=val;}
}
function liveCamera(W,H,bt,session){
  // bt = ms since burst (negative before burst). push runs tap->zoom1, i.e. bt -118 -> 2470.
  const take=(session&&session.liveTake)||LIVE_TAKE;
  const sentCX=(session&&session.liveSentCX)||LIVE_LINE.cx;
  const sEnd=liveFinalPx(W)/LIVE_FS;
  const sBig=(sEnd*6.4)/1.12, sLock=(sEnd*3.1)/1.12;
  const push=liveInterp(bt+118,[0,2588],[1,1.04],LIVE_EASE.linear);
  const z1=liveInterp(bt,[2470,2776],[0,1],LIVE_EASE.expoOut);
  const drift=liveInterp(bt,[2776,2988],[0,1],LIVE_EASE.linear);
  const z2=liveInterp(bt,[2988,3647],[0,1],LIVE_EASE.expoInOut);
  const sA=sBig*push;
  const sL=sLock*(1-0.04*drift);
  let s=Math.exp(Math.log(sA)+(Math.log(sLock)-Math.log(sA))*z1);
  if(bt>=2776)s=sL;
  if(z2>0)s=Math.exp(Math.log(sL)+(Math.log(sEnd)-Math.log(sL))*z2);
  const endTakeX=W/2+(take.x-sentCX)*sEnd;
  const endTakeY=0.45*H;
  const px=liveInterp(z2,[0,1],[W/2,endTakeX],LIVE_EASE.linear);
  const py=liveInterp(z2,[0,1],[H/2,endTakeY],LIVE_EASE.linear);
  return {s,px,py};
}
function renderLiveFrame(session){
  const live=document.getElementById('onboard-live');
  if(!live||live.hidden)return;
  // Cycle 3: no layout read every frame. The viewport size only changes on
  // resize, so measure #onboarding then and reuse it while it is stable.
  // (Reading a rect after writing styles every frame forced a layout flush.)
  const vw=window.innerWidth, vh=window.innerHeight;
  if(!session.liveWH||session.liveWH.vw!==vw||session.liveWH.vh!==vh){
    const rect=document.getElementById('onboarding').getBoundingClientRect();
    session.liveWH={vw,vh,w:rect.width,h:rect.height};
  }
  const W=session.liveWH.w, H=session.liveWH.h;
  const aspect=liveAspect(W,H);
  if(session.liveAspect!==aspect||!session.liveItems)buildLiveMeanings(session);
  const world=document.getElementById('onboard-live-world');
  const aurora=document.querySelector('.onboard-live-halo');
  const takeWord=document.getElementById('onboard-live-take-word');
  const glowWord=document.getElementById('onboard-live-take-glow-word');
  const glow=document.getElementById('onboard-live-sentence-glow');
  const highlight=document.getElementById('onboard-live-highlight');
  const meaningsWrap=document.getElementById('onboard-live-meanings');
  const takeBtn=document.getElementById('onboard-take');
  const elapsed=session.liveStarted?session.clock-session.liveAt:0;
  const bt=elapsed-118; // ms since burst
  const {s,px,py}=liveCamera(W,H,bt,session);
  const takeC=(session.liveTake)||LIVE_TAKE;
  const takeBox=(session.liveTakeBox)||{l:LIVE_TAKE_BOX.l,t:LIVE_TAKE_BOX.t,w:LIVE_TAKE_BOX.r-LIVE_TAKE_BOX.l,h:LIVE_TAKE_BOX.b-LIVE_TAKE_BOX.t};
  liveSet(world,'transform',`translate(${px-takeC.x*s}px, ${py-takeC.y*s}px) scale(${s})`);
  // aurora: 420px, 2.4s cycle, fades burst -> burst+200ms. Once faded out it
  // is invisible, so stop touching it instead of rewriting it every frame.
  if(aurora){
    const fade=session.liveStarted?1-liveClamp((elapsed-118)/200,0,1):1;
    if(fade<=0)liveSet(aurora,'opacity','0');
    else{
      const tReal=session.clock/1000;
      const ph=((tReal%2.4)/2.4+2.4)%2.4;
      const e=ph<0.5?LIVE_EASE.eio(ph*2):1-LIVE_EASE.eio((ph-0.5)*2);
      const sc=0.96+0.08*e, op=(0.55+0.35*e)*fade;
      liveSet(aurora,'opacity',op>0.001?String(op):'0');
      liveSet(aurora,'transform',`translate(${px-210}px, ${py-210}px) scale(${sc})`);
    }
  }
  // take pulse (squish): tap -> burst -> burst+235ms
  const pulse=bt<0?1-0.06*LIVE_EASE.quadOut(liveClamp((bt+118)/118,0,1)):1-0.06*(1-LIVE_EASE.quadOut(liveClamp(bt/235,0,1)));
  liveSet(takeWord,'transform',`scale(${pulse})`);
  liveSet(glowWord,'transform',`scale(${pulse})`);
  // context fade + highlight
  const ctx=liveInterp(bt,[3082,3388],[0,1],LIVE_EASE.linear);
  if(!session.liveCtx)session.liveCtx=[...document.querySelectorAll('#onboard-live-sentence-main .onboard-live-ctx')];
  session.liveCtx.forEach(el=>{liveSet(el,'opacity',String(ctx));});
  liveSet(highlight,'opacity',String(liveInterp(bt,[2757,2835],[0,1],LIVE_EASE.linear)));
  // shimmer: the sharp take word keeps its moving gradient, but the blurred
  // glow copy no longer rebuilds a gradient every frame (under 9px of blur
  // the sweep is invisible anyway). Its gradient is set once in
  // resetLiveIntro; here only its opacity follows the shimmer.
  const shimOn=liveInterp(bt,[39,196,2717,2776],[0,1,1,0],LIVE_EASE.linear);
  if(takeWord){
    if(shimOn>0){
      const cyc=bt>=0?((bt/1167)%1):0;
      const bp=-18+LIVE_EASE.shimmer(cyc)*136;
      const INK='#293034';
      liveSet(takeWord,'color','transparent');
      liveSet(takeWord,'backgroundImage',`linear-gradient(105deg, ${INK} 0%, ${INK} ${bp-30}%, rgb(20,122,255) ${bp-11}%, rgb(150,205,255) ${bp}%, rgb(20,122,255) ${bp+11}%, ${INK} ${bp+30}%, ${INK} 100%)`);
      liveSet(takeWord,'webkitBackgroundClip','text');
      liveSet(takeWord,'backgroundClip','text');
    }else{
      liveSet(takeWord,'color','');
      liveSet(takeWord,'backgroundImage','');
      liveSet(takeWord,'webkitBackgroundClip','');
      liveSet(takeWord,'backgroundClip','');
    }
  }
  liveSet(glow,'opacity',String(shimOn));
  // meanings (hidden after lock+59ms, like Remotion's Burst render window)
  // Cycle 3: transform-only. The old code rewrote left/top (a layout pass)
  // for all 44 meanings every frame; the spans now sit at 0,0 and only their
  // transform/opacity/filter change. Cycle 4 brings the blur back: dropping
  // it made the entrance and the suck-in look hard and wrong, and with the
  // layout passes gone the filter alone is affordable. Writes are still
  // cached, so a steady frame writes nothing.
  const showMeanings=bt<2835;
  liveSet(meaningsWrap,'display',showMeanings?'':'none');
  if(showMeanings&&session.liveItems){
    session.liveItems.forEach((it)=>{
      const out=liveInterp(bt,[it.delay,it.delay+431],[0,1],LIVE_EASE.expoOut);
      if(out<=0){if(it._op!=='0'){it._op='0';it.el.style.opacity='0';}return;}
      const spr=0.2+0.8*liveInterp(bt,[it.delay,it.delay+470],[0,1],LIVE_EASE.spring);
      const drift=liveInterp(bt,[it.delay,2470],[0,1],LIVE_EASE.linear);
      const dx=Math.sign(it.x)*drift*22*LIVE_K;
      const lock=it.m==='맡다';
      const back=lock?liveInterp(bt,[2510,2776],[0,1],LIVE_EASE.lock):liveInterp(bt,[it.sd,it.sd+255],[0,1],LIVE_EASE.suck);
      const ox=(it.x+dx)*out*(1-back);
      const oy=it.y*out*(1-back);
      const sc=lock?spr*liveInterp(back,[0,0.6,1],[1,0.8,0.45],LIVE_EASE.linear):spr*(1-back*0.92);
      const op=lock?Math.min(1,out*3)*(1-liveInterp(back,[0.86,1],[0,1],LIVE_EASE.linear)):Math.min(1,out*3)*(1-liveInterp(back,[0.3,0.75],[0,1],LIVE_EASE.linear));
      if(op<=0.001){if(it._op!=='0'){it._op='0';it.el.style.opacity='0';}return;}
      const tf=`translate(${px+ox}px, ${py+oy}px) translate(-50%,-50%) scale(${sc})`;
      if(it._tf!==tf){it._tf=tf;it.el.style.transform=tf;}
      const opStr=String(op);
      if(it._op!==opStr){it._op=opStr;it.el.style.opacity=opStr;}
      const blur=(!lock&&back>0&&back<1?back*6:(out<1?(1-out)*5:0))*LIVE_K;
      const fl=blur>0.15?`blur(${blur.toFixed(2)}px)`:'';
      if(it._fl!==fl){it._fl=fl;it.el.style.filter=fl;}
    });
  }
  // tap overlay follows the take box through the camera
  if(takeBtn){
    liveSet(takeBtn,'left',(px+(takeBox.l-takeC.x)*s)+'px');
    liveSet(takeBtn,'top',(py+(takeBox.t-takeC.y)*s)+'px');
    liveSet(takeBtn,'width',(takeBox.w*s)+'px');
    liveSet(takeBtn,'height',(takeBox.h*s)+'px');
  }
}
function resetLiveIntro(session){
  const live=document.getElementById('onboard-live');
  if(!live)return;
  live.hidden=false;
  buildLiveMeanings(session);
  measureLiveCenters(session);
  // Cycle 3: fresh style cache for the new run, and the glow copy gets its
  // gradient once here instead of rebuilt every frame (see renderLiveFrame).
  liveStyleCache=new WeakMap();
  session.liveCtx=null;
  const glowWord=document.getElementById('onboard-live-take-glow-word');
  if(glowWord){
    glowWord.style.color='transparent';
    glowWord.style.backgroundImage='linear-gradient(105deg, transparent 0%, transparent 35%, rgba(40,140,255,1) 50%, transparent 65%, transparent 100%)';
    glowWord.style.webkitBackgroundClip='text';
    glowWord.style.backgroundClip='text';
  }
  session.liveStarted=false;session.liveBurst=false;session.liveShimmer=false;
  session.liveSuck=false;session.liveSentence=false;session.liveAt=0;
  session.livePillShown=false;session.liveSaved=false;
  session.livePillAt=Infinity;session.liveToastAt=Infinity;
  session.step='word';session.stepAt=performance.now();
  renderLiveFrame(session);
}
function liveIntroToSentence(session){
  if(session.liveSentence)return;
  session.liveSentence=true;
  const bt=4000;
  const rect=document.getElementById('onboarding').getBoundingClientRect();
  const {s,px,py}=liveCamera(rect.width,rect.height,bt,session);
  const takeC=(session.liveTake)||LIVE_TAKE;
  const takeBox=(session.liveTakeBox)||{l:LIVE_TAKE_BOX.l,t:LIVE_TAKE_BOX.t,w:LIVE_TAKE_BOX.r-LIVE_TAKE_BOX.l,h:LIVE_TAKE_BOX.b-LIVE_TAKE_BOX.t};
  const world=document.getElementById('onboard-live-world');
  if(world)world.style.transform=`translate(${px-takeC.x*s}px, ${py-takeC.y*s}px) scale(${s})`;
  const meanings=document.getElementById('onboard-live-meanings');
  if(meanings)meanings.style.display='none';
  const aurora=document.querySelector('.onboard-live-halo');
  if(aurora)aurora.style.opacity='0';
  document.querySelectorAll('#onboard-live-sentence-main .onboard-live-ctx').forEach(el=>{el.style.opacity='1';});
  const highlight=document.getElementById('onboard-live-highlight');
  if(highlight)highlight.style.opacity='1';
  const takeWord=document.getElementById('onboard-live-take-word');
  if(takeWord){takeWord.style.transform='';takeWord.style.color='';takeWord.style.backgroundImage='';takeWord.style.webkitBackgroundClip='';takeWord.style.backgroundClip='';}
  const glow=document.getElementById('onboard-live-sentence-glow');
  if(glow)glow.style.opacity='0';
  const takeBtn=document.getElementById('onboard-take');
  if(takeBtn){
    takeBtn.style.left=(px+(takeBox.l-takeC.x)*s)+'px';
    takeBtn.style.top=(py+(takeBox.t-takeC.y)*s)+'px';
    takeBtn.style.width=(takeBox.w*s)+'px';
    takeBtn.style.height=(takeBox.h*s)+'px';
  }
  const root=document.getElementById('onboarding');
  if(root)root.dataset.scene='sentence';
  const ms=stepMs(session);
  session.step='sentence';session.stepAt=performance.now();
  if(typeof trackEvent==='function')trackEvent('onboarding_step_complete',{step:'sentence',ms});
  onboardMirror('onboarding_step_complete',{step:'sentence',ms});
  // Cycle 6: the pill follows the sentence, like the old flow.
  session.livePillAt=session.clock+700;
}
function startLiveIntro(session,reason){
  if(onboardingSession!==session||session.mode!=='demo'||session.liveStarted)return;
  session.liveStarted=true;
  session.liveAt=session.clock;
  if(reason==='tap')noteFirstWordTap();
  if(session.clock<session.B)session.B=session.clock;
  if(session.reduced||session.motion.matches){liveIntroToSentence(session);return;}
  session.liveBurst=true;
  const ms=stepMs(session);
  session.step='burst';session.stepAt=performance.now();
  if(typeof trackEvent==='function')trackEvent('onboarding_step_complete',{step:'word',ms});
  onboardMirror('onboarding_step_complete',{step:'word',ms});
}
function advanceLiveAfterSentence(session){
  // Cycle 6: the live flow used to stop at the sentence. It now continues
  // to the real app pill below the sentence, then the saved-to-wordbook
  // toast, mirroring the old flow (pill at sentence+700ms, toast 700ms later).
  if(!session.liveSentence)return;
  if(!session.livePillShown&&session.clock>=session.livePillAt)showLivePill(session);
  if(session.livePillShown&&!session.liveSaved&&session.clock>=session.liveToastAt)showLiveSaveToast(session);
}
function advanceLiveIntro(session){
  if(session.reduced||session.motion.matches){
    if(!session.liveSentence)liveIntroToSentence(session);
    advanceLiveAfterSentence(session);
    return;
  }
  if(!session.liveStarted&&session.clock>=session.B)startLiveIntro(session,'timeout');
  if(!session.liveStarted){renderLiveFrame(session);return;}
  const bt=session.clock-session.liveAt-118;
  if(!session.liveSuck&&bt>=2470){
    session.liveSuck=true;
    const ms=stepMs(session);
    session.step='sentence';session.stepAt=performance.now();
    if(typeof trackEvent==='function')trackEvent('onboarding_step_complete',{step:'burst',ms});
    onboardMirror('onboarding_step_complete',{step:'burst',ms});
  }
  if(!session.liveSentence&&bt>=3647)liveIntroToSentence(session);
  else renderLiveFrame(session);
  advanceLiveAfterSentence(session);
}

function showDemo(session){
  if(onboardingSession!==session)return;
  session.mode='demo';
  session.step='word';
  session.stepAt=performance.now();
  session.clock=0;
  session.last=performance.now();
  session.B=onboardTiming().idle;
  session.rate=clockRate();
  session.reduced=session.motion.matches;
  session.burstStarted=false;
  session.mainStarted=false;
  session.pillShown=false;
  session.pullPainted=false;
  session.didWord=session.didBurst=session.didSentence=session.didSave=false;
  session.peekReady=false;
  scheduleMarks(session);
  const root=document.getElementById('onboarding');
  root.dataset.scene='word';
  root.classList.remove('entering','leaving','compact');
  document.getElementById('onboard-skip').hidden=false;
  clearPullStyles();
  document.getElementById('onboard-toast').classList.remove('on');
  document.getElementById('onboard-vocab-bump').classList.remove('on');
  releaseOnboardingPeek();
  if(session.liveIntro){
    root.classList.add('live-intro');
    resetLiveIntro(session);
    if(session.reduced||session.motion.matches)liveIntroToSentence(session);
    const take=document.getElementById('onboard-take');
    if(take)take.focus({preventScroll:true});
    return;
  }
  resetOnboardVideos();
  const ready=session.variants.length?Promise.resolve(session.variants):loadOnboardHotspots().then(hotspots=>{
    session.variants=onboardVariants(hotspots);
    return session.variants;
  });
  ready.then(()=>{
    if(onboardingSession!==session||session.mode!=='demo')return;
    layoutOnboardVideo(session,true);
    const take=document.getElementById('onboard-take');
    if(take)take.focus({preventScroll:true});
  }).catch(error=>{
    console.warn('온보딩 영상을 열지 못했어요:',error&&error.name);
    if(onboardingSession===session&&session.mode==='demo')showChoice(session,false);
  });
}
function resetOnboardVideos(){
  const idle=document.getElementById('onboard-video-idle');
  const main=document.getElementById('onboard-video-main');
  const take=document.getElementById('onboard-take');
  if(idle)idle.classList.remove('is-out');
  if(main)main.classList.remove('is-in');
  if(take){take.style.pointerEvents='';take.removeAttribute('aria-hidden');}
}
function onboardVideoBox(){
  const demo=document.getElementById('onboard-demo');
  return demo?demo.getBoundingClientRect():{left:0,top:0,width:window.innerWidth,height:window.innerHeight};
}
function applyOnboardRate(video,session){
  if(!video)return;
  const rate=Math.max(0.25,Math.min(16,session&&session.rate||1));
  try{video.playbackRate=rate;video.defaultPlaybackRate=rate;}catch(error){}
}
function layoutOnboardVideo(session,reset){
  if(session.liveIntro)return;
  if(!session.variants.length)return;
  const box=onboardVideoBox();
  const variant=pickOnboardVariant(session.variants,box.width,box.height);
  const theme=onboardThemeName();
  if(!variant)return;
  const idle=document.getElementById('onboard-video-idle');
  const main=document.getElementById('onboard-video-main');
  const same=session.variant&&session.variant.id===variant.id&&session.theme===theme;
  session.variant=variant;
  session.theme=theme;
  document.getElementById('onboarding').dataset.clip=variant.id;
  if(!same){
    const mainTime=session.mainStarted&&main?main.currentTime:0;
    assignOnboardSource(idle,'idle_loop',variant,theme,session);
    assignOnboardSource(main,'main',variant,theme,session);
    idle.loop=true;
    main.loop=false;
    if(session.mainStarted){
      const resume=()=>{
        if(onboardingSession!==session)return;
        if(session.pillShown||session.reduced)pinOnboardMain(session);
        else{
          try{main.currentTime=mainTime;}catch(error){}
          const playing=main.play();
          if(playing&&playing.catch)playing.catch(()=>{});
        }
      };
      if(main.readyState>=1)resume();
      else main.addEventListener('loadedmetadata',resume,{once:true});
    }
  }
  if(reset||!session.mainStarted){
    try{if(reset)idle.currentTime=0;}catch(error){}
    applyOnboardRate(idle,session);
    if(!session.mainStarted){
      const playing=idle.play();
      if(playing&&playing.catch)playing.catch(()=>{});
    }
  }
  placeOnboardHotspot(session);
  if(session.pillShown)placeOnboardPill(session);
}
function assignOnboardSource(video,kind,variant,theme,session){
  const url=onboardClipUrl(kind,variant.id,theme);
  if(video.dataset.clip===url)return;
  video.dataset.clip=url;
  video.muted=true;
  video.playsInline=true;
  video.preload='auto';
  video.src=url;
  applyOnboardRate(video,session);
  video.addEventListener('loadedmetadata',()=>applyOnboardRate(video,session),{once:true});
}
function placeOnboardHotspot(session){
  const button=document.getElementById('onboard-take');
  const variant=session.variant;
  if(!button||!variant)return;
  const box=onboardVideoBox();
  const rect=onboardCoverRect(variant.take,box.width,box.height,variant.w,variant.h);
  button.style.left=rect.left+'px';
  button.style.top=rect.top+'px';
  button.style.width=rect.width+'px';
  button.style.height=rect.height+'px';
}
function onboardSentenceAnchor(session){
  const variant=session.variant;
  const box=onboardVideoBox();
  const norm=variant&&variant.sentence;
  if(!norm)return {left:box.left,right:box.left,top:box.top,bottom:box.top,direction:'below'};
  const rect=onboardCoverRect(norm,box.width,box.height,variant.w,variant.h);
  const left=box.left+rect.left,top=box.top+rect.top;
  return {left:left,right:left+rect.width,top:top,bottom:top+rect.height,direction:'below'};
}
function startOnboardMain(session,reason){
  if(onboardingSession!==session||session.mode!=='demo'||session.mainStarted)return;
  if(session.liveIntro){session.mainStarted=true;session.burstStarted=true;startLiveIntro(session,reason);return;}
  if(!session.variant)return;
  session.mainStarted=true;
  session.burstStarted=true;
  if(reason==='tap')noteFirstWordTap();
  if(session.clock<session.B)session.B=session.clock;
  const main=document.getElementById('onboard-video-main');
  const idle=document.getElementById('onboard-video-idle');
  const hotspot=document.getElementById('onboard-take');
  if(hotspot){hotspot.style.pointerEvents='none';hotspot.setAttribute('aria-hidden','true');}
  const begin=()=>{
    if(onboardingSession!==session)return;
    applyOnboardRate(main,session);
    if(session.reduced||session.motion.matches)pinOnboardMain(session);
    else{
      try{if(main.currentTime>0.05)main.currentTime=0;}catch(error){}
      const playing=main.play();
      if(playing&&playing.catch)playing.catch(()=>{});
    }
    idle.classList.add('is-out');
    main.classList.add('is-in');
    setTimeout(()=>{if(onboardingSession===session)idle.pause();},140);
  };
  if(main.readyState>=2)begin();
  else main.addEventListener('canplay',begin,{once:true});
}
function pinOnboardMain(session){
  const main=document.getElementById('onboard-video-main');
  const variant=session.variant;
  if(!main||!variant)return;
  const end=variant.main.final_frame_time_s||variant.staticAt||4.35;
  const pin=()=>{
    if(onboardingSession!==session)return;
    try{main.currentTime=Math.min(end,Math.max(0,(main.duration||end+0.02)-0.02));}catch(error){}
    main.pause();
    showOnboardPill(session);
  };
  if(main.readyState>=1)pin();
  else main.addEventListener('loadeddata',pin,{once:true});
}
function advanceDemo(session){
  if(session.panelHome&&!document.getElementById('panel').classList.contains('on'))restorePanelHome(session);
  if(session.liveIntro){advanceLiveIntro(session);return;}
  if(!session.mainStarted&&session.clock>=session.B&&session.variant)startOnboardMain(session,'timeout');
  const main=document.getElementById('onboard-video-main');
  if(session.mainStarted&&main&&session.variant&&!(session.reduced||session.motion.matches)){
    const time=main.currentTime||0;
    const burstAt=typeof session.variant.main.burst_starts_s==='number'?session.variant.main.burst_starts_s:0.12;
    if(time>=burstAt&&session.suckAt===Infinity)session.suckAt=session.clock;
    if(time>=session.variant.staticAt-0.03||main.ended)showOnboardPill(session);
    const end=session.variant.main.final_frame_time_s||session.variant.staticAt||4.35;
    if(main.ended||time>=end-0.03){
      try{if(!main.paused)main.pause();}catch(error){}
    }
  }
  syncMarks(session);
}
function showOnboardPill(session){
  if(session.pillShown||onboardingSession!==session)return;
  if(document.getElementById('panel').classList.contains('on'))return;
  const peek=adoptPeek(session);
  if(!peek||!session.variant)return;
  session.pillShown=true;
  session.pillAt=session.clock;
  session.toastAt=session.clock+700;
  session.continueAt=session.clock;
  const meaning=document.getElementById('word-peek-meaning');
  peek.classList.remove('loading');
  peek.classList.add('onboard-live');
  meaning.textContent=ONBOARD_MEANING;
  peek.style.opacity='0';
  peek.hidden=false;
  placeOnboardPill(session);
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{
    if(onboardingSession===session&&session.pillShown)fitOnboardMeaning();
  });
  if(session.reduced||session.motion.matches){
    peek.style.opacity='1';
    return;
  }
  requestAnimationFrame(()=>{if(onboardingSession===session&&session.pillShown)peek.style.opacity='1';});
}
function showLivePill(session){
  // Cycle 6: the live flow has no video variant, so the pill is placed
  // under the take word of the sentence itself (the take button already
  // sits exactly over that word). Same '맡다' pill, same toast timing.
  if(session.livePillShown||onboardingSession!==session)return;
  if(document.getElementById('panel').classList.contains('on'))return;
  const peek=adoptPeek(session);
  if(!peek)return;
  session.livePillShown=true;
  session.pillShown=true;
  session.liveToastAt=session.clock+700;
  const meaning=document.getElementById('word-peek-meaning');
  peek.classList.remove('loading');
  peek.classList.add('onboard-live');
  if(meaning)meaning.textContent=ONBOARD_MEANING;
  peek.style.opacity='0';
  peek.hidden=false;
  placeLivePill(session);
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{
    if(onboardingSession===session&&session.livePillShown){placeLivePill(session);fitOnboardMeaning();}
  });
  if(session.reduced||session.motion.matches){
    peek.style.opacity='1';
    return;
  }
  requestAnimationFrame(()=>{if(onboardingSession===session&&session.livePillShown)peek.style.opacity='1';});
}
function placeLivePill(session){
  const peek=document.getElementById('word-peek');
  if(!peek||peek.hidden)return;
  const btn=document.getElementById('onboard-take');
  if(!btn)return;
  // Drop any stale reader width so the pill sizes to its own content.
  peek.style.width='';
  peek.style.height='';
  const r=btn.getBoundingClientRect();
  const pw=peek.getBoundingClientRect().width;
  peek.style.left=(r.left+r.width/2-pw/2)+'px';
  peek.style.top=(r.bottom+14)+'px';
  peek.style.transform='none';
  peek.style.margin='0';
  fitOnboardMeaning();
}
function showLiveSaveToast(session){
  if(session.liveSaved||onboardingSession!==session)return;
  session.liveSaved=true;
  session.didSave=true;
  session.saved=true;
  ensureOnboardingWord(session);
  const toast=document.getElementById('onboard-toast');
  if(toast){toast.classList.remove('out');toast.classList.add('on');}
  clearTimeout(session.toastTimer);
  session.toastTimer=setTimeout(()=>{if(onboardingSession===session)dismissOnboardingToast();},2000);
  const bump=document.getElementById('onboard-vocab-bump');
  if(bump)bump.classList.add('on');
  const ms=stepMs(session);
  session.step='save';session.stepAt=performance.now();
  if(typeof trackEvent==='function')trackEvent('onboarding_step_complete',{step:'save',ms});
  onboardMirror('onboarding_step_complete',{step:'save',ms});
}
function placeOnboardPill(session){
  const peek=document.getElementById('word-peek');
  const variant=session.variant;
  if(!peek||!variant||peek.hidden)return;
  const box=onboardVideoBox();
  const rect=onboardCoverRect(variant.pill,box.width,box.height,variant.w,variant.h);
  peek.style.left=(box.left+rect.left)+'px';
  peek.style.top=(box.top+rect.top)+'px';
  peek.style.width=rect.width+'px';
  peek.style.height=rect.height+'px';
  peek.style.transform='none';
  peek.style.margin='0';
  fitOnboardMeaning();
}
function fitOnboardMeaning(){
  const meaning=document.getElementById('word-peek-meaning');
  const peek=document.getElementById('word-peek');
  if(!meaning||!peek||peek.hidden||meaning.textContent!==ONBOARD_MEANING)return;
  meaning.style.fontSize='';
  let size=14;
  while(meaning.scrollWidth>meaning.clientWidth+0.5&&size>11){
    size-=0.5;
    meaning.style.fontSize=size+'px';
  }
}
function adoptPeek(session){
  const peek=document.getElementById('word-peek');
  if(!peek||session.peekHome)return peek;
  session.peekHome={parent:peek.parentElement,next:peek.nextSibling};
  document.body.append(peek);
  return peek;
}
function restorePeekHome(session){
  const peek=document.getElementById('word-peek');
  const home=session&&session.peekHome;
  if(peek&&home&&home.parent&&home.parent.isConnected)home.parent.insertBefore(peek,home.next);
  if(session)session.peekHome=null;
}
function adoptPanel(session){
  const panel=document.getElementById('panel');
  if(!panel||session.panelHome)return panel;
  session.panelHome={parent:panel.parentElement,next:panel.nextSibling};
  document.body.append(panel);
  return panel;
}
function restorePanelHome(session){
  const panel=document.getElementById('panel');
  const home=session&&session.panelHome;
  if(panel&&home&&home.parent&&home.parent.isConnected)home.parent.insertBefore(panel,home.next);
  if(session)session.panelHome=null;
  if(panel&&document.body.classList.contains('onboarding-active'))panel.inert=true;
}
function syncMarks(session){
  if(session.mode!=='demo')return;
  if(session.clock>=session.B)session.burstStarted=true;
  if(session.clock>=session.B&&!session.didWord){
    session.didWord=true;
    const ms=stepMs(session);
    session.step='burst';session.stepAt=performance.now();
    if(typeof trackEvent==='function')trackEvent('onboarding_step_complete',{step:'word',ms});
    onboardMirror('onboarding_step_complete',{step:'word',ms});
  }
  if(session.clock>=session.suckAt&&!session.didBurst){
    session.didBurst=true;
    const ms=stepMs(session);
    session.step='sentence';session.stepAt=performance.now();
    if(typeof trackEvent==='function')trackEvent('onboarding_step_complete',{step:'burst',ms});
    onboardMirror('onboarding_step_complete',{step:'burst',ms});
  }
  if(session.clock>=session.pillAt&&!session.didSentence){
    session.didSentence=true;
    const ms=stepMs(session);
    session.step='pill';session.stepAt=performance.now();
    if(typeof trackEvent==='function')trackEvent('onboarding_step_complete',{step:'sentence',ms});
    onboardMirror('onboarding_step_complete',{step:'sentence',ms});
    noteLookupSuccess('canned');
  }
  if(session.clock>=session.toastAt&&!session.didSave){
    session.didSave=true;
    const ms=stepMs(session);
    session.step='save';session.stepAt=performance.now();
    ensureOnboardingWord(session);
    session.saved=true;
    const toast=document.getElementById('onboard-toast');
    toast.classList.remove('out');
    toast.classList.add('on');
    clearTimeout(session.toastTimer);
    session.toastTimer=setTimeout(()=>{if(onboardingSession===session)dismissOnboardingToast();},2000);
    document.getElementById('onboard-vocab-bump').classList.add('on');
    if(typeof trackEvent==='function')trackEvent('onboarding_step_complete',{step:'save',ms});
    onboardMirror('onboarding_step_complete',{step:'save',ms});
  }
  if(session.clock>=session.continueAt&&!session.peekReady)armPeek(session);
  const scene=!session.didWord?'word':!session.didBurst?'burst':!session.didSentence?'sentence':!session.didSave?'pill':'save';
  const root=document.getElementById('onboarding');
  if(root.dataset.scene!==scene)root.dataset.scene=scene;
}
function ensureOnboardingWord(session){
  if(session.vocabTracked){
    persistOnboardingTake(session);
    return;
  }
  const wrote=persistOnboardingTake(session);
  if(wrote==='saved'){
    session.vocabTracked=true;
    if(typeof trackEvent==='function')trackEvent('vocab_save',{first:true});
    onboardMirror('vocab_save',{word:'take',first:true});
  }
}
function dismissOnboardingToast(){
  const toast=document.getElementById('onboard-toast');
  if(!toast||!toast.classList.contains('on')||toast.classList.contains('out'))return;
  toast.classList.add('out');
  const done=()=>{toast.classList.remove('on','out');};
  toast.addEventListener('animationend',done,{once:true});
  setTimeout(done,450);
}
function hideDemoChrome(){
  const toast=document.getElementById('onboard-toast');
  const bump=document.getElementById('onboard-vocab-bump');
  if(toast)toast.classList.remove('on','out');
  if(bump)bump.classList.remove('on');
}
function clearPullStyles(){
  const choice=document.getElementById('onboard-choice');
  const demo=document.getElementById('onboard-demo');
  const flow=document.getElementById('onboard-coverflow');
  const copy=document.getElementById('onboard-choice-copy');
  if(choice){choice.classList.remove('peek');choice.style.transform='';}
  if(demo){demo.style.transform='';demo.style.opacity='';demo.style.filter='';}
  if(flow)flow.style.transform='';
  if(copy)copy.style.opacity='';
}
function peekShift(){
  const flow=document.getElementById('onboard-coverflow');
  const previous=flow.style.transform;
  flow.style.transform='none';
  const rect=flow.getBoundingClientRect();
  flow.style.transform=previous;
  if(!rect.height)return Math.max(0,window.innerHeight-PEEK_PX);
  return Math.max(0,window.innerHeight-PEEK_PX-rect.top);
}
function armPeek(session){
  if(session.peekReady||session.mode==='choice')return;
  session.peekReady=true;
  session.pullCommit=false;
  if(!session.coversReady)buildCovers(session);
  fitChoice();
  paintCovers(session);
  updateOnboardingChoiceLabel(session,true);
  const rest=peekShift();
  session.restShift=rest;
  session.shift=rest;session.shiftV=0;session.shiftSpring=null;
  renderPull(session);
  document.getElementById('onboard-choice').classList.add('peek');
  session.pullPainted=false;
}
function renderPull(session){
  const rest=session.restShift||0;
  const shift=session.shift||0;
  const flow=document.getElementById('onboard-coverflow');
  const copy=document.getElementById('onboard-choice-copy');
  const p=rest>0?Math.max(0,Math.min(1,1-shift/rest)):0;
  if(flow)flow.style.transform=`translate3d(0,${shift}px,0)`;
  if(copy)copy.style.opacity=String(p);
}
function tickShift(session,dt){
  if(session.shiftSpring==null||session.pullDrag)return;
  let x=session.shift||0,v=session.shiftV||0;
  const target=session.shiftSpring;
  const steps=Math.max(1,Math.round(dt/(1/120)));
  const h=dt/steps;
  for(let i=0;i<steps;i++){
    const a=-280*(x-target)-28*v;
    v+=a*h;x+=v*h;
  }
  session.shift=x;session.shiftV=v;
  if(Math.abs(x-target)<0.5&&Math.abs(v)<12){
    session.shift=target;session.shiftV=0;session.shiftSpring=null;
    // The entrance spring stops at the peek. Opening the book screen is only
    // the settle of a pull or scroll the user already committed.
    if(target===0&&session.pullCommit&&session.restShift>0){
      session.pullCommit=false;
      showChoice(session,false);
    }else session.pullCommit=false;
  }
}
function beginPull(session,event){
  if(onboardingSession!==session||session.mode!=='demo'||!session.peekReady)return;
  if(event.button!=null&&event.button!==0)return;
  session.pullDrag={y:event.clientY,shift:session.shift||0,t:performance.now(),moved:false};
  session.pullDragMoved=false;
  session.shiftSpring=null;
  clearTimeout(session.pullTimer);
  try{event.currentTarget.setPointerCapture(event.pointerId);}catch(error){}
}
function movePull(session,event){
  const drag=session.pullDrag;
  if(!drag||onboardingSession!==session)return;
  const dy=event.clientY-drag.y;
  if(Math.abs(dy)>6){drag.moved=true;session.pullDragMoved=true;}
  const rest=session.restShift||0;
  session.shift=Math.max(0,Math.min(rest,drag.shift+dy));
  renderPull(session);
}
function endPull(session){
  const drag=session.pullDrag;
  if(!drag||onboardingSession!==session)return;
  session.pullDrag=null;
  if(!drag.moved)return;
  const dt=Math.max(.001,(performance.now()-drag.t)/1000);
  const vy=(session.shift-drag.shift)/dt;
  const rest=session.restShift||0;
  const progress=rest>0?1-session.shift/rest:1;
  session.pullCommit=progress>0.3||vy<-700;
  session.shiftSpring=session.pullCommit?0:rest;
}
function nudgePull(session,deltaY){
  const rest=session.restShift||0;
  session.shiftSpring=null;
  session.shift=Math.max(0,Math.min(rest,(session.shift||rest)-deltaY));
  renderPull(session);
  clearTimeout(session.pullTimer);
  session.pullTimer=setTimeout(()=>{
    if(onboardingSession!==session||session.pullDrag||session.mode!=='demo')return;
    const span=session.restShift||0;
    const progress=span>0?1-(session.shift||0)/span:1;
    session.pullCommit=progress>0.3;
    session.shiftSpring=session.pullCommit?0:span;
  },200);
}
function releaseOnboardingPeek(){
  const peek=document.getElementById('word-peek');
  if(!peek)return;
  peek.hidden=true;
  peek.classList.remove('loading','onboard-leave','onboard-retry');
  peek.classList.remove('onboard-live');
  peek.style.left='';
  peek.style.top='';
  peek.style.width='';
  peek.style.height='';
  peek.style.margin='';
  peek.style.transform='';
  peek.style.transformOrigin='';
  peek.style.opacity='';
  const meaning=document.getElementById('word-peek-meaning');
  if(meaning&&meaning.textContent===ONBOARD_MEANING)meaning.textContent='뜻 찾는 중';
  restorePeekHome(arguments[0]||onboardingSession);
}
function skipOnboarding(session){
  if(onboardingSession!==session||session.mode==='choice')return;
  const step=session.step||'word';
  const ms=stepMs(session);
  if(typeof trackEvent==='function')trackEvent('onboarding_step_skip',{step,ms});
  onboardMirror('onboarding_step_skip',{step,ms});
  showChoice(session,true);
}
function showChoice(session,animate){
  if(onboardingSession!==session||session.mode==='choice')return;
  if(!session.saved){
    const wrote=persistOnboardingTake(session);
    if(wrote==='saved'){
      if(typeof trackEvent==='function')trackEvent('vocab_save',{first:true});
      onboardMirror('vocab_save',{word:'take',first:true});
    }
    session.saved=true;
  }
  session.mode='choice';
  session.step='choice';
  session.pullCommit=false;
  clearTimeout(session.toastTimer);
  clearTimeout(session.pullTimer);
  const root=document.getElementById('onboarding');
  root.dataset.scene='choice';
  document.getElementById('onboard-skip').hidden=true;
  const idle=document.getElementById('onboard-video-idle');
  const main=document.getElementById('onboard-video-main');
  if(idle)idle.pause();
  if(main)main.pause();
  if(document.getElementById('panel').classList.contains('on')&&typeof closePanel==='function')closePanel();
  restorePanelHome(session);
  const peek=document.getElementById('word-peek');
  if(animate&&peek&&!peek.hidden)peek.classList.add('onboard-leave');
  clearPullStyles();
  if(animate)setTimeout(()=>{if(onboardingSession===session){hideDemoChrome();releaseOnboardingPeek(session);}},450);
  else{hideDemoChrome();releaseOnboardingPeek(session);}
  if(!session.replay)save(ONBOARD_PROGRESS_KEY,{scene:'choice',version:ONBOARD_VERSION});
  if(!session.coversReady)buildCovers(session);
  root.classList.toggle('entering',!!animate);
  root.classList.toggle('leaving',!!animate);
  fitChoice();
  paintCovers(session);
  updateOnboardingChoiceLabel(session,true);
  if(animate){
    setTimeout(()=>{
      if(onboardingSession===session)root.classList.remove('entering','leaving');
    },920);
  }
  const button=document.getElementById('onboard-read');
  if(button)button.focus({preventScroll:true});
}
function fitChoice(){
  const root=document.getElementById('onboarding');
  const choice=document.getElementById('onboard-choice');
  if(!root||!choice)return;
  root.classList.remove('compact');
  let h=window.innerHeight<=420?96:window.innerHeight<=700?200:276;
  for(let pass=0;pass<12;pass++){
    const w=Math.max(56,Math.round(h*2/3));
    root.style.setProperty('--cover-w',w+'px');
    root.style.setProperty('--cover-h',h+'px');
    onboardCoverUnit=w/184;
    if(choice.scrollHeight<=choice.clientHeight+1)return;
    if(!root.classList.contains('compact'))root.classList.add('compact');
    else h=Math.max(72,h-16);
  }
}
function buildCovers(session){
  const flow=document.getElementById('onboard-coverflow');
  const reads=onboardReads();
  session.reads=reads;
  const alice=reads.findIndex(item=>item.id==='alice-in-wonderland');
  session.p=alice>=0?alice:0;
  session.v=0;
  session.spring=null;
  session.labelIndex=-1;
  flow.replaceChildren();
  reads.forEach((read,index)=>{
    const card=document.createElement('button');
    card.type='button';
    card.className='onboard-cover';
    card.dataset.book=read.id;
    card.setAttribute('role','option');
    card.setAttribute('aria-label',`${read.title}, ${read.author}`);
    const image=document.createElement('img');
    image.alt='';
    image.draggable=false;
    image.decoding='async';
    image.src=read.cover;
    card.append(image);
    card.addEventListener('click',()=>coverActivate(session,index),{signal:session.controller.signal});
    flow.append(card);
  });
  bindCoverPointer(session,flow);
  session.coversReady=true;
}
function coverStep(){
  const width=parseFloat(getComputedStyle(document.getElementById('onboarding')).getPropertyValue('--cover-w'))||184;
  return 118*(width/184);
}
function coverCount(session){return session.reads?session.reads.length:0;}
function coverDelta(index,p,n){
  let d=index-p;
  d-=n*Math.round(d/n);
  return d;
}
function coverIndex(p,n){
  if(!n)return 0;
  return ((Math.round(p)%n)+n)%n;
}
function coverActivate(session,index){
  if(session.mode!=='choice'||session.dragMoved)return;
  const n=coverCount(session);
  if(!n)return;
  if(coverIndex(session.p,n)===index)chooseOnboardingBook(session);
  else springTo(session,session.p+coverDelta(index,session.p,n),0);
}
function springTo(session,target,velocity){
  const n=coverCount(session);
  if(!n)return;
  if(session.reduced||session.motion.matches){
    session.p=((target%n)+n)%n;session.v=0;session.spring=null;
    paintCovers(session);updateOnboardingChoiceLabel(session,true);return;
  }
  session.spring=target;
  session.v=velocity||0;
  session.coversDirty=true;
}
function bindCoverPointer(session,flow){
  const signal=session.controller.signal;
  flow.addEventListener('pointerdown',event=>{
    if(event.button!=null&&event.button!==0)return;
    session.spring=null;
    session.drag={x:event.clientX,p:session.p,moved:false,samples:[{t:performance.now(),p:session.p}]};
    session.dragMoved=false;
    try{flow.setPointerCapture(event.pointerId);}catch(error){}
  },{signal});
  flow.addEventListener('pointermove',event=>{
    const drag=session.drag;
    if(!drag)return;
    const dx=event.clientX-drag.x;
    if(Math.abs(dx)>6){drag.moved=true;session.dragMoved=true;}
    session.p=drag.p-dx/coverStep();
    const now=performance.now();
    drag.samples.push({t:now,p:session.p});
    drag.samples=drag.samples.filter(sample=>now-sample.t<80);
    paintCovers(session);
    updateOnboardingChoiceLabel(session);
  },{signal});
  const release=()=>{
    const drag=session.drag;
    if(!drag)return;
    session.drag=null;
    if(!drag.moved)return;
    const now=performance.now();
    const samples=drag.samples.filter(sample=>now-sample.t<=80);
    const first=samples[0]||{t:now,p:session.p};
    const dt=Math.max(.001,(now-first.t)/1000);
    const velocity=(session.p-first.p)/dt;
    springTo(session,Math.round(session.p+velocity*.22),velocity);
    setTimeout(()=>{if(onboardingSession===session)session.dragMoved=false;},0);
  };
  flow.addEventListener('pointerup',release,{signal});
  flow.addEventListener('pointercancel',release,{signal});
  flow.addEventListener('wheel',event=>{
    if(session.mode!=='choice')return;
    if(Math.abs(event.deltaX)<Math.abs(event.deltaY))return;
    event.preventDefault();
    noteCoverWheel(session,event.deltaX);
  },{signal,passive:false});
}
function noteCoverWheel(session,delta){
  clearTimeout(session.wheelTimer);
  session.wheelTimer=setTimeout(()=>{
    if(onboardingSession!==session)return;
    session.wheel=0;
    session.wheelLock=false;
  },200);
  if(session.wheelLock)return;
  session.wheel=(session.wheel||0)+delta;
  if(Math.abs(session.wheel)<36)return;
  const dir=Math.sign(session.wheel);
  session.wheel=0;
  session.wheelLock=true;
  springTo(session,Math.round(session.p)+dir,0);
}
function tickCovers(session,dt){
  if(!session.reads||!session.reads.length)return;
  const wasMoving=!!session.drag||session.spring!=null||session.coversDirty;
  if(session.spring!=null&&!session.drag){
    let x=session.p,v=session.v;
    const target=session.spring;
    const steps=Math.max(1,Math.round(dt/(1/120)));
    const h=dt/steps;
    for(let i=0;i<steps;i++){
      const a=-300*(x-target)-30*v;
      v+=a*h;x+=v*h;
    }
    session.p=x;session.v=v;
    if(Math.abs(x-target)<.0008&&Math.abs(v)<.02){
      const n=coverCount(session)||1;
      session.p=((target%n)+n)%n;session.v=0;session.spring=null;
    }
  }
  if(wasMoving||session.drag||session.spring!=null){
    paintCovers(session);
    if(!session.drag&&session.spring==null)session.coversDirty=false;
  }
  updateOnboardingChoiceLabel(session);
}
function paintCovers(session){
  const flow=document.getElementById('onboard-coverflow');
  if(!flow||!session.reads)return;
  const unit=onboardCoverUnit;
  const n=session.reads.length||1;
  for(let i=0;i<flow.children.length;i++){
    const card=flow.children[i];
    const d=coverDelta(i,session.p,n);
    const a=Math.abs(d);
    const sign=d<0?-1:1;
    const tx=lerpStops(a,[0,118,196,248])*sign*unit;
    const sc=lerpStops(a,[1,.8,.64,.52]);
    const rot=-sign*lerpStops(a,[0,14,20,22]);
    const op=lerpStops(a,[1,.92,.62,0]);
    const tz=-a*40*unit;
    card.style.transform=`translate(-50%,-50%) translateX(${tx}px) translateZ(${tz}px) rotateY(${rot}deg) scale(${sc})`;
    card.style.opacity=String(op);
    card.style.zIndex=String(100-Math.round(a*10));
    card.style.pointerEvents=a>2.4?'none':'';
    card.setAttribute('aria-selected',String(a<.5));
  }
}
function updateOnboardingChoiceLabel(session,force){
  if(!session.reads||!session.reads.length)return;
  const index=coverIndex(session.p,session.reads.length);
  if(!force&&session.labelIndex===index)return;
  session.labelIndex=index;
  const read=session.reads[index];
  const button=document.getElementById('onboard-read');
  button.textContent=read.cta;
  button.dataset.book=read.id;
  const meta=document.getElementById('onboard-bookmeta');
  meta.querySelector('b').textContent=read.title||'';
  meta.querySelector('span').textContent=read.author||'';
}
async function chooseOnboardingBook(session){
  if(onboardingSession!==session||session.mode!=='choice'||session.importing)return;
  const readSpec=session.reads[coverIndex(session.p,session.reads.length)];
  const read=readSpec&&typeof longReadDefinition==='function'?longReadDefinition(readSpec.id):null;
  const button=document.getElementById('onboard-read');
  if(!read){
    document.getElementById('onboard-file-status').textContent='책을 준비하지 못했어요. 잠시 뒤 다시 눌러 주세요.';
    return;
  }
  session.importing=true;
  button.disabled=true;
  button.textContent='준비하고 있어요…';
  if(typeof trackEvent==='function')trackEvent('onboarding_choice',{choice:read.id});
  onboardMirror('onboarding_choice',{choice:read.id});
  try{
    const saved=await importLongRead(read,null,{signal:session.controller.signal});
    if(onboardingSession!==session)return;
    if(!saved){
      session.importing=false;
      button.disabled=false;
      updateOnboardingChoiceLabel(session,true);
      return;
    }
    endOnboarding(true,{paint:false});
    await openBook(saved);
  }catch(error){
    if(onboardingSession!==session){
      if(typeof paintHome==='function'&&activeAppView()==='home')paintHome();
      return;
    }
    session.importing=false;
    button.disabled=false;
    updateOnboardingChoiceLabel(session,true);
    document.getElementById('onboard-file-status').textContent='책을 열지 못했어요. 다시 눌러 주세요.';
  }
}
async function importOnboardingFile(session){
  const input=document.getElementById('onboard-fileinput');
  const file=input.files&&input.files[0];
  input.value='';
  if(!file||onboardingSession!==session||session.importing)return;
  session.importing=true;
  const button=document.getElementById('onboard-file');
  button.disabled=true;
  button.setAttribute('aria-busy','true');
  document.getElementById('onboard-file-status').textContent='책을 준비하고 있어요…';
  if(typeof trackEvent==='function')trackEvent('onboarding_choice',{choice:'import'});
  onboardMirror('onboarding_choice',{choice:'import'});
  try{
    const result=await importFile(file,null,{signal:session.controller.signal});
    if(onboardingSession!==session)return;
    if(result&&result.bookId){endOnboarding(true);return;}
    document.getElementById('onboard-file-status').textContent='책을 넣지 못했어요. 다시 골라 주세요.';
  }catch(error){
    if(onboardingSession!==session)return;
    document.getElementById('onboard-file-status').textContent='책을 넣지 못했어요. 다시 골라 주세요.';
  }
  if(onboardingSession!==session)return;
  session.importing=false;
  button.disabled=false;
  button.removeAttribute('aria-busy');
}
function chooseOnboardingBrowse(session){
  if(onboardingSession!==session)return;
  if(typeof trackEvent==='function')trackEvent('onboarding_choice',{choice:'browse'});
  onboardMirror('onboarding_choice',{choice:'browse'});
  endOnboarding(true,{paint:false});
  if(activeAppView()!=='home'&&typeof show==='function')show('home');
  if(typeof paintHome==='function')paintHome();
}
function goOnboardingPage(page){
  const session=onboardingSession;
  if(!session)return;
  if(page<=0)showDemo(session);
  else showChoice(session,false);
}
function endOnboarding(remember,options){
  ++onboardingRequest;
  const session=onboardingSession;
  if(!session)return;
  session.stopped=true;
  if(session.raf)cancelAnimationFrame(session.raf);
  clearTimeout(session.timer);
  clearTimeout(session.toastTimer);
  clearTimeout(session.pullTimer);
  clearTimeout(session.wheelTimer);
  session.controller.abort();
  session.observer&&session.observer.disconnect();
  session.themeObserver&&session.themeObserver.disconnect();
  const idle=document.getElementById('onboard-video-idle');
  const main=document.getElementById('onboard-video-main');
  if(idle)idle.pause();
  if(main)main.pause();
  onboardingSession=null;
  if(document.getElementById('panel').classList.contains('on')&&typeof closePanel==='function')closePanel();
  restorePanelHome(session);
  releaseOnboardingPeek(session);
  const root=document.getElementById('onboarding');
  root.hidden=true;
  root.classList.remove('entering','leaving','compact','live-intro');
  const live=document.getElementById('onboard-live');
  if(live)live.hidden=true;
  clearPullStyles();
  document.body.classList.remove('onboarding-active');
  for(const [node,inert] of session.inert)node.inert=inert;
  if(remember){save(ONBOARD_KEY,'done');localStorage.removeItem(ONBOARD_PROGRESS_KEY);}
  const paint=!options||options.paint!==false;
  if(paint&&activeAppView()==='home'&&typeof paintHome==='function')paintHome();
  if(session.focus instanceof HTMLElement&&session.focus.isConnected){
    try{session.focus.focus({preventScroll:true});}catch(error){}
  }
}

function longpressTipState(){return load(LONGPRESS_TIP_KEY,'')||'';}
function noteReaderWordTap(node){
  noteFirstWordTap();
  if(longpressTipState())return;
  if(document.body.classList.contains('onboarding-active'))return;
  if(typeof activeAppView==='function'&&activeAppView()!=='read')return;
  if(!(node instanceof Element))return;
  const taps=(Number(load(LONGPRESS_TAP_KEY,0))||0)+1;
  save(LONGPRESS_TAP_KEY,taps);
  if(taps>=LONGPRESS_TAPS)showLongpressTip(node);
}
function longpressColumnRect(node){
  const doc=node&&node.ownerDocument||document;
  let column=null;
  if(doc!==document){
    const frame=doc.defaultView&&doc.defaultView.frameElement;
    if(frame)column=frame;
  }
  if(!column){
    column=node&&node.closest&&(node.closest('#rtext')||node.closest('.pdf-source-page')||node.closest('#originalwrap')||node.closest('#readwrap'))
      ||document.getElementById('rtext')||document.getElementById('readwrap');
  }
  if(!column||!column.getBoundingClientRect)return null;
  const rect=column.getBoundingClientRect();
  return {left:rect.left,right:rect.right,width:rect.width,top:Math.max(rect.top,0),bottom:Math.min(rect.bottom,window.innerHeight)};
}
function longpressSentenceRange(node){
  if(typeof textSentencePartAt!=='function'||typeof domRangeForOffsets!=='function')return null;
  let found=null;
  try{found=textSentencePartAt(node);}catch(error){found=null;}
  if(!found||!found.block||!found.part)return null;
  try{return domRangeForOffsets(found.block,found.part.start,found.part.end);}catch(error){return null;}
}
function longpressAnchorRect(){
  const range=longpressTip&&longpressTip.range;
  if(range&&range.startContainer&&range.startContainer.isConnected){
    const rects=[...range.getClientRects()].filter(rect=>rect.width||rect.height);
    if(rects.length)return rects[rects.length-1];
  }
  const node=longpressTip&&longpressTip.node;
  if(node&&node.isConnected)return node.getBoundingClientRect();
  return {left:0,top:0,bottom:0,width:0,height:0};
}
function paintLongpressHighlight(range){
  clearLongpressHighlight();
  const doc=range.startContainer.ownerDocument;
  const view=doc.defaultView||window;
  if(typeof view.Highlight==='function'&&view.CSS&&view.CSS.highlights){
    try{
      view.CSS.highlights.set('breeze-longpress-tip',new view.Highlight(range));
      longpressHighlight={kind:'api',view};
      return;
    }catch(error){}
  }
  const host=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement;
  const block=host&&host.closest?host.closest('[data-pi],p'):host;
  if(!block)return;
  block.classList.add('longpress-tip-host');
  const base=block.getBoundingClientRect();
  for(const rect of range.getClientRects()){
    if(!rect.width&&!rect.height)continue;
    const mark=doc.createElement('span');
    mark.className='longpress-tip-mark';
    mark.style.left=(rect.left-base.left)+'px';
    mark.style.top=(rect.top-base.top)+'px';
    mark.style.width=rect.width+'px';
    mark.style.height=rect.height+'px';
    block.append(mark);
  }
  longpressHighlight={kind:'dom',block};
}
function clearLongpressHighlight(){
  const held=longpressHighlight;
  longpressHighlight=null;
  if(!held)return;
  if(held.kind==='api'){
    try{held.view.CSS.highlights.delete('breeze-longpress-tip');}catch(error){}
    return;
  }
  if(held.block){
    held.block.querySelectorAll('.longpress-tip-mark').forEach(node=>node.remove());
    held.block.classList.remove('longpress-tip-host');
  }
}
function placeLongpressTip(){
  const current=longpressTip;
  if(!current)return;
  const column=longpressColumnRect(current.node);
  if(!column||column.width<96)return;
  const width=Math.max(120,column.width-24);
  current.tip.style.width=width+'px';
  const height=current.tip.offsetHeight||64;
  let left=column.left+12;
  const minLeft=column.left+8;
  const maxLeft=column.right-8-width;
  left=maxLeft<minLeft?minLeft:Math.max(minLeft,Math.min(left,maxLeft));
  const viewBottom=Math.min(window.innerHeight-8,column.bottom-8);
  const viewTop=Math.max(8,column.top+8);
  const anchor=longpressAnchorRect();
  let top=anchor.bottom+10;
  if(top+height>viewBottom)top=anchor.top-height-10;
  if(top<viewTop)top=viewTop;
  if(top+height>viewBottom)top=Math.max(viewTop,viewBottom-height);
  current.tip.style.left=left+'px';
  current.tip.style.top=top+'px';
}
function showLongpressTip(node){
  if(longpressTipState()||longpressTip)return;
  const column=longpressColumnRect(node);
  if(!column||column.width<120)return;
  const range=longpressSentenceRange(node);
  const anchor=range&&range.getBoundingClientRect?range.getBoundingClientRect():node.getBoundingClientRect();
  if(!anchor||(!anchor.width&&!anchor.height))return;
  save(LONGPRESS_TIP_KEY,'shown');
  onboardMirror('longpress_tip_shown',{});
  if(range)paintLongpressHighlight(range);
  const tip=document.createElement('div');
  tip.id='longpress-tip';
  tip.setAttribute('role','dialog');
  tip.setAttribute('aria-label','문장 해석 안내');
  tip.innerHTML='<span class="longpress-tip-copy"><b>문장을 꾹 눌러보세요</b><small>문장 전체 해석을 볼 수 있어요</small></span><button type="button" aria-label="닫기">✕</button>';
  document.body.append(tip);
  const onScroll=()=>placeLongpressTip();
  longpressTip={tip,node,range,onScroll};
  tip.querySelector('button').addEventListener('click',event=>{
    event.preventDefault();
    event.stopPropagation();
    dismissLongpressTip('close');
  });
  const scroller=typeof readerScroller==='function'?readerScroller():null;
  if(scroller)scroller.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('resize',onScroll);
  placeLongpressTip();
}
function dismissLongpressTip(reason){
  const state=longpressTipState();
  if(reason==='longpress'&&!state){save(LONGPRESS_TIP_KEY,'dismissed');return;}
  if(longpressTip){
    const scroller=typeof readerScroller==='function'?readerScroller():null;
    if(scroller)scroller.removeEventListener('scroll',longpressTip.onScroll);
    window.removeEventListener('resize',longpressTip.onScroll);
    longpressTip.tip.remove();
    longpressTip=null;
    clearLongpressHighlight();
  }
  if(state==='shown'){
    save(LONGPRESS_TIP_KEY,'dismissed');
    onboardMirror('longpress_tip_dismissed',{reason:reason==='longpress'?'longpress':'close'});
  }
}
function onboardingPeekLocked(){
  const session=onboardingSession;
  if(!session||session.mode!=='demo'||!session.pillShown)return false;
  const panel=document.getElementById('panel');
  return !(panel&&panel.classList.contains('on'));
}
function paintLockedOnboardingPeek(session){
  const peek=document.getElementById('word-peek');
  const meaning=document.getElementById('word-peek-meaning');
  if(!peek||!meaning||!session)return;
  peek.classList.remove('loading','onboard-leave');
  peek.classList.add('onboard-live');
  meaning.textContent=ONBOARD_MEANING;
  const retry=document.getElementById('word-peek-retry');
  if(retry)retry.removeAttribute('disabled');
  peek.hidden=false;
  peek.style.opacity='1';
  placeOnboardPill(session);
  fitOnboardMeaning();
}
let onboardRetryFadeAt=0;
function fadeLockedOnboardingPeek(){
  const session=onboardingSession;
  paintLockedOnboardingPeek(session);
  const peek=document.getElementById('word-peek');
  if(!peek)return;
  const now=performance.now();
  if(now-onboardRetryFadeAt<180)return;
  onboardRetryFadeAt=now;
  if(session&&(session.reduced||session.motion.matches))return;
  peek.classList.add('onboard-retry');
  void peek.offsetWidth;
  peek.classList.remove('onboard-retry');
}
function installOnboardingPeekLock(){
  if(installOnboardingPeekLock.installed)return;
  installOnboardingPeekLock.installed=true;
  const retry=document.getElementById('word-peek-retry');
  if(retry){
    const originalRetry=retry.onclick;
    retry.onclick=function(event){
      if(onboardingPeekLocked()){
        if(event){event.preventDefault();event.stopPropagation();}
        fadeLockedOnboardingPeek();
        return;
      }
      if(typeof originalRetry==='function')return originalRetry.apply(this,arguments);
    };
  }
  if(typeof renderWordPeek==='function'){
    const originalRender=renderWordPeek;
    renderWordPeek=function(){
      if(onboardingPeekLocked()){
        paintLockedOnboardingPeek(onboardingSession);
        return;
      }
      return originalRender.apply(this,arguments);
    };
  }
  if(typeof closePanel==='function'){
    const originalClose=closePanel;
    closePanel=function(){
      const session=onboardingSession;
      const restore=!!(session&&session.mode==='demo'&&session.pillShown);
      const result=originalClose.apply(this,arguments);
      if(restore&&onboardingSession===session&&session.mode==='demo'&&!document.getElementById('panel').classList.contains('on'))
        paintLockedOnboardingPeek(session);
      return result;
    };
  }
}
function installOnboardingHooks(){
  if(installOnboardingHooks.installed)return;
  installOnboardingHooks.installed=true;
  if(typeof openWord==='function'){
    const original=openWord;
    openWord=function(key,node){
      const result=original.apply(this,arguments);
      try{noteReaderWordTap(node);}catch(error){}
      return result;
    };
  }
  if(typeof openSentence==='function'){
    const original=openSentence;
    openSentence=function(){
      try{dismissLongpressTip('longpress');}catch(error){}
      return original.apply(this,arguments);
    };
  }
  if(typeof applyLook==='function'){
    const original=applyLook;
    applyLook=function(word,answer){
      const result=original.apply(this,arguments);
      try{
        const meaning=answer&&answer.ko||word&&word.ko;
        if(String(meaning||'').trim())noteLookupSuccess('dict');
      }catch(error){}
      return result;
    };
  }
}
installOnboardingPeekLock();
installOnboardingHooks();
