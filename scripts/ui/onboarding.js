/* First-run onboarding v2.
   One camera zooms from "take" out to the sentence. Meanings, suck, and the
   pill follow the promo timeline (design seconds ÷ 0.85). The pill is the
   real #word-peek and its text is only "맡다". Nothing here calls the network.
   The soft light behind "take" is one blurred aurora — there are no ripple rings. */
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
const ONBOARD_BOOKS=[
  {id:'the-great-gatsby',cta:'개츠비 바로 읽기'},
  {id:'alice-in-wonderland',cta:'앨리스 바로 읽기'},
  {id:'sherlock-holmes-speckled-band',cta:'얼룩무늬 띠 바로 읽기'},
  {id:'sherlock-holmes-scandal-in-bohemia',cta:'보헤미아 바로 읽기'},
  {id:'sherlock-holmes-red-headed-league',cta:'빨간 머리 연맹 바로 읽기'},
  {id:'sherlock-holmes-final-problem',cta:'마지막 사건 바로 읽기'},
  {id:'sherlock-holmes-hound-of-the-baskervilles',cta:'바스커빌 바로 읽기'},
];
const FPS=60,TEMPO=0.85;
const t2f=s=>Math.round(s*FPS);
const frameToMs=f=>f*1000/(FPS*TEMPO);
const msToFrame=ms=>ms*FPS*TEMPO/1000;
const PILL_SHIFT=(47*TEMPO)/60;
const T={burst:1.2,zoom1:3.3,lock:3.56,zoom2:3.74,settle:4.3,pill:4.8-PILL_SHIFT,pushEnd:7.5};
const S_BIG=6.4,S_LOCK=3.1,S_END=1.12,LINE_SCREEN_Y=866,CANVAS_W=1080,CANVAS_H=1920;
const WORLD_PEAK=S_BIG*1.04;
const TAKE={x:510,y:699};
const BURST_MS=frameToMs(t2f(T.burst));
const ZOOM1_MS=frameToMs(t2f(T.zoom1));
const PILL_MS=frameToMs(t2f(T.pill));
const MEANINGS=['잡다','가져가다','데려가다','걸리다','받아들이다','참다','먹다','타다','찍다','앉다','맡다','점령하다','고르다','하다','받다','취하다','필요로 하다','듣다','빼다','재다','여기다','견디다','차지하다','쥐다','택하다','이용하다','복용하다','수강하다','사다','간주하다','소요되다','적다','빼앗다','섭취하다','수락하다','감수하다','촬영하다','측정하다','인수하다','선택하다','붙잡다','수용하다','함락하다','승차하다'];
const WIDTH_EM={"잡다":1.705,"가져가다":3.39,"데려가다":3.39,"걸리다":2.548,"받아들이다":4.233,"참다":1.705,"먹다":1.705,"타다":1.705,"찍다":1.705,"앉다":1.705,"맡다":1.705,"점령하다":3.39,"고르다":2.548,"하다":1.705,"받다":1.705,"취하다":2.548,"필요로 하다":4.452,"듣다":1.705,"빼다":1.705,"재다":1.705,"여기다":2.548,"견디다":2.548,"차지하다":3.39,"쥐다":1.705,"택하다":2.548,"이용하다":3.39,"복용하다":3.39,"수강하다":3.39,"사다":1.705,"간주하다":3.39,"소요되다":3.39,"적다":1.705,"빼앗다":2.548,"섭취하다":3.39,"수락하다":3.39,"감수하다":3.39,"촬영하다":3.39,"측정하다":3.39,"인수하다":3.39,"선택하다":3.39,"붙잡다":2.548,"수용하다":3.39,"함락하다":3.39,"승차하다":3.39};
const BURST_ROWS=[-820,-640,-460,-285,285,460,640,820];
const BURST_WEIGHTS=[500,600,700,800];

function bez(x1,y1,x2,y2){
  const cx=3*x1,bx=3*(x2-x1)-cx,ax=1-cx-bx;
  const cy=3*y1,by=3*(y2-y1)-cy,ay=1-cy-by;
  const sampleX=t=>((ax*t+bx)*t+cx)*t;
  const sampleY=t=>((ay*t+by)*t+cy)*t;
  const sampleDX=t=>(3*ax*t+2*bx)*t+cx;
  return x=>{
    if(x<=0)return 0;
    if(x>=1)return 1;
    let t=x;
    for(let i=0;i<6;i++){
      const dx=sampleX(t)-x,d=sampleDX(t);
      if(Math.abs(dx)<1e-4||Math.abs(d)<1e-5)break;
      t=Math.min(1,Math.max(0,t-dx/d));
    }
    return sampleY(t);
  };
}
const EXPO_OUT=bez(.16,1,.3,1);
const EXPO_INOUT=bez(.87,0,.13,1);
const SPRING=bez(.34,1.45,.64,1);
const SUCK_EASE=bez(.6,0,.95,.45);
const LOCK_EASE=bez(.55,0,.45,1);
const SHIM_EASE=bez(.42,0,.3,1);
const PUSH_EASE=bez(.3,0,.6,1);
const QUAD_OUT=t=>1-(1-t)*(1-t);
const CUBIC_OUT=t=>1-Math.pow(1-t,3);
function interpolate(value,inputs,outputs,easing){
  const n=inputs.length;
  if(value<=inputs[0])return outputs[0];
  if(value>=inputs[n-1])return outputs[n-1];
  let i=1;
  while(i<n-1&&value>inputs[i])i++;
  const t=(value-inputs[i-1])/(inputs[i]-inputs[i-1]||1);
  const e=easing?easing(Math.min(1,Math.max(0,t))):t;
  return outputs[i-1]+(outputs[i]-outputs[i-1])*e;
}
function rnd(i){const x=Math.sin(i*127.1+311.7)*43758.5453;return x-Math.floor(x);}
function buildBurstItems(){
  const out=[];
  let mi=0;
  BURST_ROWS.forEach((y,r)=>{
    const n=r%2===0?6:5;
    const row=[];
    for(let j=0;j<n&&mi<MEANINGS.length;j++){
      const m=MEANINGS[mi];mi++;
      const size=80+rnd(mi+3)*62;
      row.push({m,size,w:WIDTH_EM[m]*size,weight:BURST_WEIGHTS[Math.floor(rnd(mi+9)*4)]});
    }
    const gap=72;
    const total=row.reduce((sum,it)=>sum+it.w,0)+gap*(row.length-1);
    let x=-total/2+(rnd(r+40)-0.5)*260;
    row.forEach(it=>{
      out.push({m:it.m,x:x+it.w/2,y:y+(rnd(mi+r)-0.5)*14,size:it.size,weight:it.weight,lock:it.m==='맡다'});
      x+=it.w+gap;
    });
  });
  const A=t2f(T.burst),Z=t2f(T.zoom1);
  out.forEach((it,i)=>{
    it.delay=A+(Math.hypot(it.x,it.y*1.3)/1300)*10+rnd(i+30)*2;
    const d=Math.hypot(it.x,it.y);
    it.sd=Z-4+(1-Math.min(1,d/1200))*4+rnd(i+11)*2;
  });
  return out;
}
const BURST_ITEMS=buildBurstItems();
function burstPose(it,f){
  const out=interpolate(f,[it.delay,it.delay+22],[0,1],EXPO_OUT);
  if(out<=0)return null;
  const spr=0.2+0.8*interpolate(f,[it.delay,it.delay+24],[0,1],SPRING);
  const back=it.lock
    ?interpolate(f,[t2f(T.zoom1)+2,t2f(T.lock)],[0,1],LOCK_EASE)
    :interpolate(f,[it.sd,it.sd+13],[0,1],SUCK_EASE);
  const drift=interpolate(f,[it.delay,t2f(T.zoom1)],[0,1]);
  const dx=Math.sign(it.x||1)*drift*22;
  const scaleLock=it.lock?interpolate(back,[0,.6,1],[1,.8,.45]):1-back*.92;
  const fade=it.lock?interpolate(back,[.86,1],[0,1]):interpolate(back,[.3,.75],[0,1]);
  const blur=!it.lock&&back>0&&back<1?back*6:(out<1?(1-out)*5:0);
  return {
    ox:(it.x+dx)*out*(1-back),
    oy:it.y*out*(1-back),
    sc:spr*scaleLock,
    op:Math.min(1,out*3)*(1-fade),
    blur
  };
}
function cameraV6(f,line){
  const push=interpolate(f,[0,t2f(T.zoom1)],[1,1.04]);
  const z1=interpolate(f,[t2f(T.zoom1),t2f(T.lock)],[0,1],EXPO_OUT);
  const drift=interpolate(f,[t2f(T.lock),t2f(T.zoom2)],[0,1]);
  const z2=interpolate(f,[t2f(T.zoom2),t2f(T.settle)],[0,1],EXPO_INOUT);
  const sA=S_BIG*push;
  const sL=S_LOCK*(1-.04*drift);
  let s=Math.exp(Math.log(sA)+(Math.log(S_LOCK)-Math.log(sA))*z1);
  if(f>=t2f(T.lock))s=sL;
  if(z2>0)s=Math.exp(Math.log(sL)+(Math.log(S_END)-Math.log(sL))*z2);
  const endX=CANVAS_W/2+(TAKE.x-line.cx)*S_END;
  const endY=LINE_SCREEN_Y+(TAKE.y-line.cy)*S_END;
  let px=interpolate(z2,[0,1],[CANVAS_W/2,endX]);
  let py=interpolate(z2,[0,1],[CANVAS_H/2,endY]);
  const hold=interpolate(f,[t2f(T.settle),t2f(T.pushEnd)],[0,1],PUSH_EASE);
  if(hold>0){
    const s2=S_END*(1+.016*hold);
    const ay=770,aSy=LINE_SCREEN_Y+(ay-line.cy)*S_END;
    s=s2;px=CANVAS_W/2+(TAKE.x-line.cx)*s2;py=aSy+(TAKE.y-ay)*s2;
  }
  return {s,px,py};
}
function videoMs(clock,burstAt){
  if(burstAt<=0)return BURST_MS+Math.max(0,clock);
  if(clock<=burstAt)return clock/burstAt*BURST_MS;
  return BURST_MS+(clock-burstAt);
}
function lerpStops(a,values){
  if(a<=0)return values[0];
  if(a>=3)return values[3];
  const i=Math.min(2,Math.floor(a));
  const t=a-i;
  return values[i]+(values[i+1]-values[i])*t;
}

let onboardingSession=null;
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
  if(session.reduced){
    session.suckAt=session.B;
    session.pillAt=session.B;
  }else{
    session.suckAt=session.B+(ZOOM1_MS-BURST_MS);
    session.pillAt=session.B+(PILL_MS-BURST_MS);
  }
  session.toastAt=session.pillAt+700;
  session.continueAt=session.toastAt+1000;
}
function startOnboarding(replay){
  if(onboardingSession)endOnboarding(false);
  closeSettings();
  const progress=load(ONBOARD_PROGRESS_KEY,null);
  const session={
    replay:!!replay,motion:matchMedia('(prefers-reduced-motion: reduce)'),
    mode:'boot',step:'word',stepAt:performance.now(),
    clock:0,last:performance.now(),B:onboardTiming().idle,rate:clockRate(),
    reduced:false,burstStarted:false,saved:false,coversReady:false,importing:false,
    didWord:false,didBurst:false,didSentence:false,didSave:false,peekReady:false,
    p:0,v:0,spring:null,drag:null,dragMoved:false,labelIndex:-1,fit:1,
    line:{cx:554,cy:699},items:BURST_ITEMS,nodes:[],reads:[],
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
  document.getElementById('onboard-demo').addEventListener('click',event=>{
    if(onboardingSession!==session||session.mode!=='demo')return;
    if(event.target.closest&&event.target.closest('#onboard-take'))burstNow(session,'tap');
  },{signal});
  const choice=document.getElementById('onboard-choice');
  choice.addEventListener('pointerdown',event=>beginPull(session,event),{signal});
  choice.addEventListener('pointermove',event=>movePull(session,event),{signal});
  choice.addEventListener('pointerup',event=>endPull(session,event),{signal});
  choice.addEventListener('pointercancel',()=>endPull(session),{signal});
  choice.addEventListener('click',event=>{
    if(onboardingSession!==session||session.mode!=='demo'||!session.peekReady)return;
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
    if(onboardingSession!==session||session.mode!=='demo')return;
    const take=document.getElementById('onboard-take').getBoundingClientRect();
    ensureOnboardingWord(session);
    selKey='take';
    wordPeekActive=true;
    previewWordCard=null;
    wordDetailAnchored=false;
    wordPeekAnchor={left:take.left,right:take.right,top:take.top,bottom:take.bottom,direction:'below'};
    const panel=adoptPanel(session);
    panel.inert=false;
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
  },{signal});
  window.addEventListener('pagehide',()=>{session.hidden=true;session.last=performance.now();},{signal});
  window.addEventListener('pageshow',()=>{session.hidden=false;session.last=performance.now();},{signal});
  window.addEventListener('resize',()=>{
    if(onboardingSession!==session)return;
    if(session.mode==='demo'){
      measureFit(session);
      if(session.peekReady&&!session.pullDrag){
        fitChoice();
        const rest=peekShift();
        if(session.shiftSpring===session.restShift)session.shiftSpring=rest;
        session.restShift=rest;
        if(session.shiftSpring==null)session.shift=Math.min(session.shift||0,rest);
      }
    }else fitChoice();
  },{signal});
  window.addEventListener('popstate',event=>{
    event.stopImmediatePropagation();
    endOnboarding(false);
  },{signal,capture:true});
  session.motion.addEventListener('change',()=>{
    if(onboardingSession!==session)return;
    session.reduced=session.motion.matches;
    if(session.reduced&&session.mode==='demo'){
      if(session.clock<session.B)session.B=session.clock;
      scheduleMarks(session);
      document.getElementById('onboard-burst').replaceChildren();
      session.nodes=[];
    }
  },{signal});
  session.observer=new MutationObserver(()=>{
    if(onboardingSession===session&&activeAppView()!==session.previousView)endOnboarding(false);
  });
  for(const view of document.querySelectorAll('.view'))session.observer.observe(view,{attributes:true,attributeFilter:['class']});
}
function ensurePump(session){
  if(session.pumping)return;
  session.pumping=true;
  const loop=now=>{
    if(session.stopped||onboardingSession!==session)return;
    tick(session,now);
    session.raf=requestAnimationFrame(loop);
  };
  session.raf=requestAnimationFrame(loop);
  const backup=()=>{
    if(session.stopped||onboardingSession!==session)return;
    tick(session,performance.now());
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
    renderDemo(session);
    if(session.peekReady){
      tickShift(session,dtMs/1000);
      if(session.mode==='demo')renderPull(session);
    }
  }else if(session.mode==='choice')tickCovers(session,dtMs/1000);
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
  const burst=document.getElementById('onboard-burst');
  burst.replaceChildren();
  session.nodes=[];
  if(!session.reduced){
    session.items=BURST_ITEMS;
    session.nodes=BURST_ITEMS.map(it=>{
      const node=document.createElement('span');
      node.className='onboard-meaning';
      node.textContent=it.m;
      node.style.fontWeight=String(it.weight);
      burst.append(node);
      return node;
    });
  }
  measureFit(session);
  document.getElementById('onboard-take').focus({preventScroll:true});
}
function measureFit(session){
  const world=document.getElementById('onboard-world');
  const line=document.getElementById('onboard-line');
  const take=document.getElementById('onboard-take');
  world.style.transform='none';
  line.style.left='0px';
  line.style.top='0px';
  const origin=world.getBoundingClientRect();
  const box=take.getBoundingClientRect();
  const cx=box.left+box.width/2-origin.left;
  const cy=box.top+box.height/2-origin.top;
  line.style.left=(TAKE.x-cx)+'px';
  line.style.top=(TAKE.y-cy)+'px';
  const placed=line.getBoundingClientRect();
  const base=world.getBoundingClientRect();
  session.line={cx:placed.left+placed.width/2-base.left,cy:placed.top+placed.height/2-base.top};
  const visual=placed.width*(S_END/WORLD_PEAK)*(Math.min(window.innerWidth,430)/CANVAS_W);
  const max=Math.max(120,window.innerWidth-32);
  session.fit=visual>0?Math.min(1,max/visual):1;
}
function burstNow(session,reason){
  if(onboardingSession!==session||session.mode!=='demo'||session.burstStarted)return;
  session.burstStarted=true;
  if(reason==='tap')noteFirstWordTap();
  if(session.clock<session.B){
    session.B=session.clock;
    scheduleMarks(session);
  }
}
function renderDemo(session){
  const reduced=session.reduced&&session.clock>=session.B;
  const f=reduced?t2f(T.settle):msToFrame(videoMs(session.clock,session.B));
  const cam=cameraV6(f,session.line||{cx:554,cy:699});
  layoutWorld(session,cam,reduced);
  if(reduced){
    for(const node of session.nodes)node.style.opacity='0';
  }else renderBurst(session,f,cam);
  renderTake(session,reduced?t2f(T.lock)+8:f,reduced);
  renderAurora(session);
  renderPeek(session,f,reduced);
  syncMarks(session);
}
function layoutWorld(session,cam,reduced){
  const vw=window.innerWidth,vh=window.innerHeight;
  const k=(Math.min(vw,430)/CANVAS_W)*(session.fit||1);
  session.k=k;
  const x=(vw-CANVAS_W*k)/2+(cam.px-TAKE.x*cam.s)*k;
  const y=(vh-CANVAS_H*k)/2+(cam.py-TAKE.y*cam.s)*k;
  const world=document.getElementById('onboard-world');
  world.style.transform=`translate3d(${x}px,${y}px,0) scale(${cam.s*k/WORLD_PEAK})`;
  world.style.opacity=reduced?String(Math.min(1,Math.max(0,(session.clock-session.B)/200))):'1';
}
function renderBurst(session,f,cam){
  const vw=window.innerWidth,vh=window.innerHeight,k=session.k||1;
  for(let i=0;i<session.nodes.length;i++){
    const it=session.items[i],node=session.nodes[i],pose=burstPose(it,f);
    if(!pose){node.style.opacity='0';continue;}
    node.style.fontSize=(it.size*k*Math.max(pose.sc,0.01))+'px';
    const sx=(vw-CANVAS_W*k)/2+(cam.px+pose.ox)*k;
    const sy=(vh-CANVAS_H*k)/2+(cam.py+pose.oy)*k;
    node.style.transform=`translate3d(${sx}px,${sy}px,0) translate(-50%,-50%)`;
    node.style.opacity=String(pose.op);
    node.style.filter=pose.blur>0.4?`blur(${(pose.blur*k).toFixed(2)}px)`:'none';
    if(pose.op>0.04)node.classList.add('show');
  }
}
function renderTake(session,f,reduced){
  const A=t2f(T.burst),LOCK=t2f(T.lock);
  const pulse=reduced?1:1-.06*interpolate(f,[A-6,A,A+12],[0,1,0],QUAD_OUT);
  const ctx=reduced?1:interpolate(f,[t2f(T.zoom2+.08),t2f(T.zoom2+.34)],[0,1]);
  const hl=reduced?1:interpolate(f,[LOCK-1,LOCK+3],[0,1]);
  const ring=reduced?0:interpolate(f,[LOCK,LOCK+40],[0,1],CUBIC_OUT);
  document.getElementById('onboard-before').style.opacity=String(ctx);
  document.getElementById('onboard-after').style.opacity=String(ctx);
  const take=document.getElementById('onboard-take');
  take.style.transform=`scale(${pulse})`;
  const mark=document.getElementById('onboard-hl');
  mark.style.opacity=String(hl);
  mark.style.boxShadow=ring>0&&ring<1
    ?`0 0 ${(6+ring*30).toFixed(1)}px ${(1+ring*8).toFixed(1)}px rgba(60,150,255,${(0.5*(1-ring)).toFixed(3)}), 0 0 0 3px var(--sky2)`
    :'';
  const shim=reduced?0:interpolate(f,[A+2,A+10,LOCK-3,LOCK],[0,1,1,0]);
  const ink=document.documentElement.classList.contains('dark')?'#F1F1EE':'#293034';
  const inkSpan=take.querySelector('.take-ink');
  const glowSpan=take.querySelector('.take-glow');
  if(shim>0.01){
    const cyc=((Math.max(0,f-A)/59.5)%1+1)%1;
    const bp=-18+SHIM_EASE(cyc)*136;
    const grad=`linear-gradient(105deg, ${ink} 0%, ${ink} ${bp-30}%, #147AFF ${bp-11}%, #96CDFF ${bp}%, #147AFF ${bp+11}%, ${ink} ${bp+30}%, ${ink} 100%)`;
    const glow=`linear-gradient(105deg, transparent 0%, transparent ${bp-22}%, rgba(40,140,255,1) ${bp}%, transparent ${bp+22}%, transparent 100%)`;
    inkSpan.style.color='transparent';
    inkSpan.style.backgroundImage=grad;
    inkSpan.style.webkitBackgroundClip='text';
    inkSpan.style.backgroundClip='text';
    glowSpan.style.opacity=String(shim);
    glowSpan.style.setProperty('--shim',glow);
  }else{
    inkSpan.style.color='';
    inkSpan.style.backgroundImage='';
    glowSpan.style.opacity='0';
  }
}
function renderAurora(session){
  const node=document.getElementById('onboard-aurora');
  const take=document.getElementById('onboard-take').getBoundingClientRect();
  const demo=document.getElementById('onboard-demo').getBoundingClientRect();
  if(!take.width)return;
  const d=Math.max(160,take.width*1.9);
  node.style.width=d+'px';
  node.style.height=d+'px';
  node.style.marginLeft=(-d/2)+'px';
  node.style.marginTop=(-d/2)+'px';
  node.style.left=(take.left+take.width/2-demo.left)+'px';
  node.style.top=(take.top+take.height/2-demo.top)+'px';
  if(session.clock<session.B){
    node.style.animation='';
    node.style.opacity='';
    node.style.visibility='';
    return;
  }
  const fade=Math.max(0,1-(session.clock-session.B)/200);
  node.style.animation='none';
  node.style.opacity=String(fade);
  node.style.visibility=fade<=0?'hidden':'';
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
function renderPeek(session,f,reduced){
  const peek=adoptPeek(session);
  if(document.getElementById('panel').classList.contains('on'))return;
  restorePanelHome(session);
  const visible=reduced?session.clock>=session.B:f>=t2f(T.pill);
  if(!visible){
    if(!peek.hidden)releaseOnboardingPeek();
    return;
  }
  const meaning=document.getElementById('word-peek-meaning');
  if(peek.hidden){
    peek.classList.remove('loading');
    meaning.textContent=ONBOARD_MEANING;
    peek.hidden=false;
  }else if(meaning.textContent!==ONBOARD_MEANING)meaning.textContent=ONBOARD_MEANING;
  const P=t2f(T.pill);
  const sc=reduced?1:interpolate(f,[P,P+22],[.82,1],SPRING);
  const op=reduced?Math.min(1,Math.max(0,(session.clock-session.B)/200)):interpolate(f,[P,P+7],[0,1]);
  const take=document.getElementById('onboard-take').getBoundingClientRect();
  peek.style.transform='none';
  const box=peek.getBoundingClientRect();
  if(!box.width||!take.width)return;
  let left=(take.left+take.right-box.width)/2;
  left=Math.max(16,Math.min(left,window.innerWidth-16-box.width));
  const top=take.bottom+8;
  peek.style.left=Math.round(left)+'px';
  peek.style.top=Math.round(top)+'px';
  peek.style.transformOrigin=(take.left+take.width/2-left)+'px -7px';
  peek.style.transform=`scale(${sc})`;
  peek.style.opacity=String(op);
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
  document.getElementById('onboarding').dataset.scene=scene;
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
  if(choice){choice.classList.remove('peek');choice.style.transform='';}
  if(demo){demo.style.transform='';demo.style.opacity='';demo.style.filter='';}
}
function peekShift(){
  const flow=document.getElementById('onboard-coverflow');
  const peekPx=Math.max(72,Math.min(128,(flow.offsetHeight||200)*0.36));
  return Math.max(0,window.innerHeight-peekPx-flow.offsetTop);
}
function armPeek(session){
  if(session.peekReady||session.mode==='choice')return;
  session.peekReady=true;
  if(!session.coversReady)buildCovers(session);
  fitChoice();
  paintCovers(session);
  updateOnboardingChoiceLabel(session,true);
  const rest=peekShift();
  session.restShift=rest;
  document.getElementById('onboard-choice').classList.add('peek');
  if(session.reduced||session.motion.matches){
    session.shift=rest;session.shiftV=0;session.shiftSpring=null;
    renderPull(session);
    return;
  }
  session.shift=Math.min(window.innerHeight,rest+140);
  session.shiftV=0;
  session.shiftSpring=rest;
}
function renderPull(session){
  const rest=session.restShift||0;
  const shift=session.shift||0;
  const choice=document.getElementById('onboard-choice');
  const demo=document.getElementById('onboard-demo');
  choice.style.transform=`translate3d(0,${shift}px,0)`;
  const p=rest>0?Math.max(0,Math.min(1,1-shift/rest)):0;
  const rise=p*Math.min(220,window.innerHeight*0.28);
  demo.style.transform=rise?`translate3d(0,${(-rise).toFixed(1)}px,0)`:'';
  demo.style.opacity=String(1-p*0.92);
  demo.style.filter=p>0.03?`blur(${(p*8).toFixed(2)}px)`:'none';
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
    if(target===0&&session.restShift>0)showChoice(session,false);
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
  session.shiftSpring=progress>0.3||vy<-700?0:rest;
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
    session.shiftSpring=progress>0.3?0:span;
  },200);
}
function releaseOnboardingPeek(){
  const peek=document.getElementById('word-peek');
  if(!peek)return;
  peek.hidden=true;
  peek.classList.remove('loading','onboard-leave');
  peek.style.left='';
  peek.style.top='';
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
  clearTimeout(session.toastTimer);
  clearTimeout(session.pullTimer);
  const root=document.getElementById('onboarding');
  root.dataset.scene='choice';
  document.getElementById('onboard-skip').hidden=true;
  document.getElementById('onboard-burst').replaceChildren();
  session.nodes=[];
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
    drag.samples.push({t:now,p});
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
  paintCovers(session);
  updateOnboardingChoiceLabel(session);
}
function paintCovers(session){
  const flow=document.getElementById('onboard-coverflow');
  if(!flow||!session.reads)return;
  const unit=(parseFloat(getComputedStyle(document.getElementById('onboarding')).getPropertyValue('--cover-w'))||184)/184;
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
    const bright=lerpStops(a,[1,.94,.88,.85]);
    const tz=-a*40*unit;
    card.style.transform=`translate(-50%,-50%) translateX(${tx}px) translateZ(${tz}px) rotateY(${rot}deg) scale(${sc})`;
    card.style.opacity=String(op);
    card.style.zIndex=String(100-Math.round(a*10));
    card.style.filter=`brightness(${bright})`;
    card.style.pointerEvents=a>2.4?'none':'';
    card.setAttribute('aria-selected',String(a<.5));
    const image=card.querySelector('img');
    const shadow=.18*(1-.5*Math.min(a,1));
    if(image)image.style.boxShadow=`0 18px 40px rgba(25,35,45,${shadow.toFixed(3)}), 0 4px 12px rgba(25,35,45,${(shadow*.45).toFixed(3)})`;
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
  onboardingSession=null;
  if(document.getElementById('panel').classList.contains('on')&&typeof closePanel==='function')closePanel();
  restorePanelHome(session);
  releaseOnboardingPeek(session);
  const root=document.getElementById('onboarding');
  root.hidden=true;
  root.classList.remove('entering','leaving','compact');
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
installOnboardingHooks();
