/* First-run onboarding v2.
   The guide is a short local demonstration: one word, canned meanings, one
   context pill, a real vocabulary save, then a book choice. It does not open
   the Reader and does not call the network or an AI lookup.
   Product analytics is optional. onboardTrack calls breezeTrack, trackEvent,
   or recordEvent when one of those exists (the events logger may land in
   another change). Until then the call is a no-op. */
const ONBOARD_KEY='breeze.onboarding.v1';
const ONBOARD_PROGRESS_KEY='breeze.onboarding.carousel-progress';
const ONBOARD_VERSION='v2';
const ONBOARD_FIRST_TAP_KEY='breeze.onboarding.v2.first-word-tap';
const ONBOARD_FIRST_LOOKUP_KEY='breeze.onboarding.v2.first-lookup';
const LONGPRESS_TIP_KEY='breeze.reader.longpress-tip';
const LONGPRESS_TAP_KEY='breeze.reader.word-taps';
const LONGPRESS_TAPS=3;
const ONBOARD_SENTENCE='She decided to take the job in London.';
const ONBOARD_MEANING='맡다 · (일자리를) 받아들이다';
const ONBOARD_TIMING_DEFAULT={idle:3000,burst:1400,hold:1200,suck:1100,pill:1800,toast:600,choice:2800};
const ONBOARD_BOOKS=[
  {id:'the-great-gatsby',cta:'개츠비 바로 읽기'},
  {id:'alice-in-wonderland',cta:'앨리스 바로 읽기'},
  {id:'sherlock-holmes-speckled-band',cta:'얼룩무늬 띠 바로 읽기'},
  {id:'sherlock-holmes-scandal-in-bohemia',cta:'보헤미아 바로 읽기'},
  {id:'sherlock-holmes-red-headed-league',cta:'빨간 머리 연맹 바로 읽기'},
  {id:'sherlock-holmes-final-problem',cta:'마지막 사건 바로 읽기'},
  {id:'sherlock-holmes-hound-of-the-baskervilles',cta:'바스커빌 바로 읽기'},
];
/* Dictionary glosses for "take". Local only — nothing here is fetched. */
const ONBOARD_BURST=[
  ['데려가다',-34,-32,1.05,.95],['걸리다',6,-36,.9,.82],['받다',32,-24,1,.9],
  ['먹다',-18,-18,1.15,1],['타다',16,-16,.88,.7],['찍다',-40,-8,.82,.55],
  ['말다',38,-6,.8,.5],['점령하다',-8,-8,.78,.45],['고르다',22,6,.95,.75],
  ['하다',-28,10,.84,.6],['취하다',8,14,1.08,.92],['필요로 하다',-36,22,.78,.7],
  ['들다',28,20,.86,.62],['가지다',-12,28,1.12,1],['잡다',14,30,.96,.85],
  ['재다',-42,34,.74,.48],['여기다',36,32,.8,.55],['견디다',-22,40,.9,.72],
  ['차지하다',4,42,.84,.6],['택하다',24,-34,.92,.8],['이용하다',-30,-22,.8,.58],
  ['복용하다',34,12,.86,.66],['쥐다',-6,18,.78,.5],['간주하다',18,-28,.76,.48],
  ['소요되다',-16,4,.74,.42],['섭취하다',30,-16,.8,.58],['수락하다',-38,16,.82,.64],
  ['감수하다',12,-4,.76,.46],['측정하다',-24,-36,.8,.6],['선택하다',0,24,.9,.7],
];
let onboardingSession=null;
let onboardingRequest=0;
let longpressTip=null;
let longpressHighlight=null;

function onboardTiming(){
  const extra=globalThis.__ONBOARD_TIMING__;
  return extra&&typeof extra==='object'?Object.assign({},ONBOARD_TIMING_DEFAULT,extra):Object.assign({},ONBOARD_TIMING_DEFAULT);
}
function onboardDelay(session,key){
  const value=onboardTiming()[key];
  if(session.motion.matches&&key!=='idle')return Math.min(value,40);
  return value;
}
function onboardTrack(name,fields){
  const detail=Object.assign({onboarding_version:ONBOARD_VERSION},fields||{});
  const track=globalThis.breezeTrack||globalThis.trackEvent||globalThis.recordEvent;
  if(typeof track!=='function')return;
  try{track(name,detail);}catch(error){console.warn('온보딩 이벤트를 남기지 못했어요:',name,error&&error.name);}
}
function noteFirstWordTap(){
  if(load(ONBOARD_FIRST_TAP_KEY,false))return;
  save(ONBOARD_FIRST_TAP_KEY,true);
  onboardTrack('first_word_tap',{});
}
function noteLookupSuccess(source){
  if(load(ONBOARD_FIRST_LOOKUP_KEY,false))return;
  save(ONBOARD_FIRST_LOOKUP_KEY,true);
  onboardTrack('first_lookup_success',{source:source==='dict'?'dict':'canned'});
}
function onboardSampleOnly(){
  const keys=Object.keys(words);
  if(keys.length!==1||keys[0]!=='take')return false;
  const item=words.take;
  return !!(item&&item.onboardingSample&&item.ko===ONBOARD_MEANING);
}
function persistOnboardingTake(session){
  const existing=words.take;
  const same=existing&&existing.onboardingSample&&existing.ko===ONBOARD_MEANING&&existing.example===ONBOARD_SENTENCE;
  if(existing&&validWordMeaning(existing)&&!same)return 'kept';
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
function startOnboarding(replay){
  if(onboardingSession)endOnboarding(false);
  closeSettings();
  const progress=load(ONBOARD_PROGRESS_KEY,null);
  const session={
    replay:!!replay,motion:matchMedia('(prefers-reduced-motion: reduce)'),
    step:resumeOnboardingAtChoice(progress,replay)?'choice':'word',
    stepAt:performance.now(),startedAt:performance.now(),
    bookIndex:Math.max(0,ONBOARD_BOOKS.findIndex(item=>item.id==='alice-in-wonderland')),
    timers:[],pending:null,hidden:false,saved:false,coversReady:false,coverLock:null,
    previousView:activeAppView(),focus:document.activeElement,inert:[],
    controller:new AbortController(),
  };
  onboardingSession=session;
  for(const node of document.querySelectorAll('.view,#topbar,#word-peek,#panel,#aa-pop,#sentence-modal,#settings-modal,#add-modal')){
    session.inert.push([node,node.inert]);node.inert=true;
  }
  document.body.classList.add('onboarding-active');
  const root=document.getElementById('onboarding');
  root.hidden=false;
  const timing=onboardTiming();
  root.style.setProperty('--onboard-burst',timing.burst+'ms');
  root.style.setProperty('--onboard-suck',timing.suck+'ms');
  bindOnboarding(session);
  onboardTrack('onboarding_start',{replay:session.replay});
  if(session.step==='choice')showOnboardingChoice(session);
  else showOnboardingWord(session);
}
function bindOnboarding(session){
  const signal=session.controller.signal;
  const root=document.getElementById('onboarding');
  document.getElementById('onboard-skip').addEventListener('click',()=>skipOnboarding(session),{signal});
  document.getElementById('onboard-take').addEventListener('click',()=>beginOnboardingBurst(session,'tap'),{signal});
  document.getElementById('onboard-sentence-take').addEventListener('click',()=>revealOnboardingPill(session,'tap'),{signal});
  document.getElementById('onboard-read').addEventListener('click',()=>chooseOnboardingBook(session),{signal});
  document.getElementById('onboard-file').addEventListener('click',()=>{
    if(session.importing)return;
    document.getElementById('onboard-fileinput').click();
  },{signal});
  document.getElementById('onboard-browse').addEventListener('click',()=>chooseOnboardingBrowse(session),{signal});
  document.getElementById('onboard-fileinput').addEventListener('change',()=>importOnboardingFile(session),{signal});
  document.getElementById('onboard-coverflow').addEventListener('keydown',event=>{
    if(session.step!=='choice')return;
    if(event.key==='ArrowRight'||event.key==='ArrowLeft'){
      event.preventDefault();
      const reads=onboardReads();
      const next=session.bookIndex+(event.key==='ArrowRight'?1:-1);
      if(next>=0&&next<reads.length)centerOnboardingCover(session,next,session.motion.matches?'auto':'smooth');
    }
  },{signal});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      event.preventDefault();event.stopPropagation();
      if(session.step==='choice')endOnboarding(false);
      else skipOnboarding(session);
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
    if(document.hidden)pauseOnboarding(session);
    else resumeOnboarding(session);
  },{signal});
  window.addEventListener('pagehide',()=>pauseOnboarding(session),{signal});
  window.addEventListener('pageshow',()=>resumeOnboarding(session),{signal});
  window.addEventListener('popstate',event=>{
    event.stopImmediatePropagation();
    endOnboarding(false);
  },{signal,capture:true});
  session.motion.addEventListener('change',()=>{
    if(onboardingSession!==session||!session.motion.matches)return;
    if(session.step==='word'||session.step==='burst'){
      clearOnboardingTimers(session);
      showOnboardingSentence(session);
    }
  },{signal});
  session.observer=new MutationObserver(()=>{
    if(onboardingSession===session&&activeAppView()!==session.previousView)endOnboarding(false);
  });
  for(const view of document.querySelectorAll('.view'))session.observer.observe(view,{attributes:true,attributeFilter:['class']});
}
function clearOnboardingTimers(session){
  session.timers.forEach(clearTimeout);
  session.timers.length=0;
  session.pending=null;
}
function onboardSoon(session,ms,fn){
  const id=setTimeout(()=>{
    if(onboardingSession!==session)return;
    fn();
  },ms);
  session.timers.push(id);
}
function onboardAfter(session,ms,fn){
  session.pending=fn;
  session.pendingDelay=ms;
  if(session.hidden||onboardingSession!==session)return;
  const id=setTimeout(()=>{
    if(onboardingSession!==session||session.pending!==fn)return;
    session.pending=null;
    fn();
  },ms);
  session.timers.push(id);
}
function pauseOnboarding(session){
  if(onboardingSession!==session||session.hidden)return;
  session.hidden=true;
  session.timers.forEach(clearTimeout);
  session.timers.length=0;
}
function resumeOnboarding(session){
  if(onboardingSession!==session||!session.hidden)return;
  session.hidden=false;
  if(session.pending)onboardAfter(session,session.pendingDelay,session.pending);
}
function completeOnboardingStep(session,step){
  onboardTrack('onboarding_step_complete',{step,ms:Math.round(performance.now()-session.stepAt)});
  session.stepAt=performance.now();
}
function skipOnboarding(session){
  if(onboardingSession!==session||session.step==='choice')return;
  onboardTrack('onboarding_step_skip',{step:session.step,ms:Math.round(performance.now()-session.stepAt)});
  clearOnboardingTimers(session);
  showOnboardingChoice(session);
}
function showOnboardingWord(session){
  if(onboardingSession!==session)return;
  clearOnboardingTimers(session);
  session.step='word';
  session.stepAt=performance.now();
  const root=document.getElementById('onboarding');
  root.dataset.scene='word';
  document.getElementById('onboard-demo').hidden=false;
  document.getElementById('onboard-choice').hidden=true;
  document.getElementById('onboard-skip').hidden=false;
  document.getElementById('onboard-word-stage').hidden=false;
  document.getElementById('onboard-sentence-stage').hidden=true;
  document.getElementById('onboard-pill').hidden=true;
  document.getElementById('onboard-toast').hidden=true;
  document.getElementById('onboard-toast').classList.remove('on');
  document.getElementById('onboard-vocab-bump').hidden=true;
  document.getElementById('onboard-vocab-bump').classList.remove('on');
  document.getElementById('onboard-take').classList.remove('bursting');
  document.getElementById('onboard-burst').replaceChildren();
  onboardAfter(session,onboardDelay(session,'idle'),()=>beginOnboardingBurst(session,'idle'));
  document.getElementById('onboard-take').focus({preventScroll:true});
}
function beginOnboardingBurst(session,reason){
  if(onboardingSession!==session||session.step!=='word')return;
  clearOnboardingTimers(session);
  completeOnboardingStep(session,'word');
  if(reason==='tap')noteFirstWordTap();
  session.step='burst';
  document.getElementById('onboarding').dataset.scene='burst';
  if(session.motion.matches){showOnboardingSentence(session);return;}
  const stage=document.getElementById('onboard-word-stage');
  const burst=document.getElementById('onboard-burst');
  const width=stage.clientWidth||1,height=stage.clientHeight||1;
  burst.replaceChildren();
  for(const [index,item] of ONBOARD_BURST.entries()){
    const node=document.createElement('span');
    node.className='onboard-meaning';
    node.textContent=item[0];
    node.style.setProperty('--x',(item[1]/100*width*1.2)+'px');
    node.style.setProperty('--y',(item[2]/100*height*1.05)+'px');
    node.style.setProperty('--s',String(item[3]));
    node.style.setProperty('--o',String(item[4]));
    node.style.transitionDelay=(index*12)+'ms';
    burst.append(node);
  }
  document.getElementById('onboard-take').classList.add('bursting');
  /* A timer, not animation frames: headless WebKit can starve frames while
     setTimeout still runs. One delay leaves the collapsed state on screen
     before the glosses move. */
  onboardSoon(session,32,()=>{
    if(session.step!=='burst')return;
    for(const node of burst.children)node.classList.add('show');
  });
  const timing=onboardTiming();
  onboardAfter(session,timing.burst+ONBOARD_BURST.length*12+timing.hold,()=>suckOnboardingBurst(session));
}
function suckOnboardingBurst(session){
  if(onboardingSession!==session||session.step!=='burst')return;
  const burst=document.getElementById('onboard-burst');
  for(const [index,node] of [...burst.children].entries()){
    node.style.transitionDelay=((burst.children.length-index)*8)+'ms';
    node.classList.remove('show');
    node.classList.add('suck');
  }
  onboardAfter(session,onboardDelay(session,'suck')+burst.children.length*8,()=>showOnboardingSentence(session));
}
function showOnboardingSentence(session){
  if(onboardingSession!==session)return;
  if(session.step!=='burst'&&session.step!=='word')return;
  clearOnboardingTimers(session);
  if(session.step==='burst')completeOnboardingStep(session,'burst');
  session.step='sentence';
  const root=document.getElementById('onboarding');
  root.dataset.scene='sentence';
  document.getElementById('onboard-word-stage').hidden=true;
  document.getElementById('onboard-burst').replaceChildren();
  const sentence=document.getElementById('onboard-sentence-stage');
  sentence.hidden=false;
  sentence.classList.remove('arriving');
  if(!session.motion.matches)onboardSoon(session,32,()=>{if(session.step==='sentence')sentence.classList.add('arriving');});
  onboardAfter(session,onboardDelay(session,'pill'),()=>revealOnboardingPill(session,'auto'));
}
function revealOnboardingPill(session,reason){
  if(onboardingSession!==session||session.step!=='sentence')return;
  clearOnboardingTimers(session);
  if(reason==='tap')noteFirstWordTap();
  completeOnboardingStep(session,'sentence');
  session.step='pill';
  document.getElementById('onboarding').dataset.scene='pill';
  document.getElementById('onboard-pill').hidden=false;
  noteLookupSuccess('canned');
  onboardAfter(session,onboardDelay(session,'toast'),()=>showOnboardingSave(session));
}
function showOnboardingSave(session){
  if(onboardingSession!==session||session.step!=='pill')return;
  clearOnboardingTimers(session);
  const elapsed=Math.round(performance.now()-session.stepAt);
  session.step='save';
  session.stepAt=performance.now();
  document.getElementById('onboarding').dataset.scene='save';
  const toast=document.getElementById('onboard-toast');
  const bump=document.getElementById('onboard-vocab-bump');
  toast.hidden=false;bump.hidden=false;
  onboardSoon(session,32,()=>{if(session.step==='save'){toast.classList.add('on');bump.classList.add('on');}});
  const wrote=persistOnboardingTake(session);
  if(wrote==='saved')onboardTrack('vocab_save',{word:'take'});
  session.saved=true;
  onboardTrack('onboarding_step_complete',{step:'save',ms:elapsed});
  onboardAfter(session,onboardDelay(session,'choice'),()=>showOnboardingChoice(session));
}
function showOnboardingChoice(session){
  if(onboardingSession!==session)return;
  clearOnboardingTimers(session);
  if(!session.saved){
    const wrote=persistOnboardingTake(session);
    if(wrote==='saved')onboardTrack('vocab_save',{word:'take'});
    session.saved=true;
  }
  session.step='choice';
  const root=document.getElementById('onboarding');
  root.dataset.scene='choice';
  document.getElementById('onboard-demo').hidden=true;
  document.getElementById('onboard-choice').hidden=false;
  document.getElementById('onboard-skip').hidden=true;
  document.getElementById('onboard-file-status').textContent='';
  if(!session.replay)save(ONBOARD_PROGRESS_KEY,{scene:'choice',version:ONBOARD_VERSION});
  if(!session.coversReady)buildOnboardingCovers(session);
  const reads=onboardReads();
  if(session.bookIndex>=reads.length)session.bookIndex=0;
  const centerIndex=session.bookIndex;
  onboardSoon(session,32,()=>{if(session.step==='choice'&&session.bookIndex===centerIndex)centerOnboardingCover(session,centerIndex,'auto');});
  document.getElementById('onboard-read').focus({preventScroll:true});
}
function buildOnboardingCovers(session){
  const flow=document.getElementById('onboard-coverflow');
  flow.replaceChildren();
  const reads=onboardReads();
  for(const [index,read] of reads.entries()){
    const card=document.createElement('button');
    card.type='button';
    card.className='onboard-cover';
    card.setAttribute('role','option');
    card.setAttribute('aria-label',`${read.title}, ${read.author}`);
    card.dataset.book=read.id;
    const image=document.createElement('img');
    image.alt='';
    image.decoding='async';
    image.src=read.cover;
    const title=document.createElement('span');
    title.className='onboard-cover-title';
    title.textContent=read.title;
    const author=document.createElement('span');
    author.className='onboard-cover-author';
    author.textContent=read.author;
    card.append(image,title,author);
    card.addEventListener('click',()=>centerOnboardingCover(session,index,session.motion.matches?'auto':'smooth'),{signal:session.controller.signal});
    flow.append(card);
  }
  let frame=0;
  flow.addEventListener('pointerdown',()=>{session.coverLock=null;},{signal:session.controller.signal});
  flow.addEventListener('scroll',()=>{
    if(frame)return;
    frame=requestAnimationFrame(()=>{
      frame=0;
      if(onboardingSession!==session)return;
      scaleOnboardingCovers(flow);
      if(session.coverLock!=null){
        if(nearestOnboardingCover(flow)===session.coverLock)session.coverLock=null;
        return;
      }
      const nearest=nearestOnboardingCover(flow);
      if(nearest!==session.bookIndex){
        session.bookIndex=nearest;
        updateOnboardingChoiceLabel(session);
      }
    });
  },{signal:session.controller.signal,passive:true});
  session.coversReady=true;
  updateOnboardingChoiceLabel(session);
}
function nearestOnboardingCover(flow){
  const mid=flow.scrollLeft+flow.clientWidth/2;
  let best=0,distance=Infinity;
  for(const [index,card] of [...flow.children].entries()){
    const delta=Math.abs(card.offsetLeft+card.offsetWidth/2-mid);
    if(delta<distance){distance=delta;best=index;}
  }
  return best;
}
function scaleOnboardingCovers(flow){
  const mid=flow.scrollLeft+flow.clientWidth/2;
  for(const card of flow.children){
    const delta=Math.abs(card.offsetLeft+card.offsetWidth/2-mid);
    const t=Math.min(1,delta/Math.max(card.offsetWidth,1));
    card.style.transform=`scale(${(1-t*0.22).toFixed(3)})`;
    card.style.opacity=String((1-t*0.45).toFixed(3));
    card.classList.toggle('is-center',t<0.35);
    card.setAttribute('aria-selected',String(t<0.35));
  }
}
function centerOnboardingCover(session,index,behavior){
  const flow=document.getElementById('onboard-coverflow');
  const card=flow.children[index];
  if(!card||onboardingSession!==session)return;
  session.bookIndex=index;
  session.coverLock=index;
  updateOnboardingChoiceLabel(session);
  const left=card.offsetLeft-(flow.clientWidth-card.offsetWidth)/2;
  flow.scrollTo({left:Math.max(0,left),behavior:behavior||'smooth'});
  scaleOnboardingCovers(flow);
}
function updateOnboardingChoiceLabel(session){
  const read=onboardReads()[session.bookIndex];
  const button=document.getElementById('onboard-read');
  if(!read||!button)return;
  button.textContent=read.cta;
  button.dataset.book=read.id;
  for(const [index,card] of [...document.getElementById('onboard-coverflow').children].entries()){
    card.setAttribute('aria-selected',String(index===session.bookIndex));
  }
}
async function chooseOnboardingBook(session){
  if(onboardingSession!==session||session.step!=='choice'||session.importing)return;
  const readSpec=onboardReads()[session.bookIndex];
  const read=readSpec&&typeof longReadDefinition==='function'?longReadDefinition(readSpec.id):null;
  const button=document.getElementById('onboard-read');
  if(!read){
    document.getElementById('onboard-file-status').textContent='책을 준비하지 못했어요. 잠시 뒤 다시 눌러 주세요.';
    return;
  }
  session.importing=true;
  button.disabled=true;
  button.textContent='준비하고 있어요…';
  onboardTrack('onboarding_choice',{choice:read.id});
  try{
    const saved=await importLongRead(read,null,{signal:session.controller.signal});
    if(onboardingSession!==session)return;
    if(!saved){
      session.importing=false;
      button.disabled=false;
      updateOnboardingChoiceLabel(session);
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
    updateOnboardingChoiceLabel(session);
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
  onboardTrack('onboarding_choice',{choice:'file'});
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
  onboardTrack('onboarding_choice',{choice:'browse'});
  endOnboarding(true,{paint:false});
  if(activeAppView()!=='home'&&typeof show==='function')show('home');
  if(typeof paintHome==='function')paintHome();
}
function goOnboardingPage(page){
  const session=onboardingSession;
  if(!session)return;
  if(page<=0)showOnboardingWord(session);
  else showOnboardingChoice(session);
}
function endOnboarding(remember,options){
  ++onboardingRequest;
  const session=onboardingSession;
  if(!session)return;
  clearOnboardingTimers(session);
  session.controller.abort();
  session.observer&&session.observer.disconnect();
  onboardingSession=null;
  document.getElementById('onboarding').hidden=true;
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
  if(doc!==document){
    const frame=doc.defaultView&&doc.defaultView.frameElement;
    if(frame)return frame.getBoundingClientRect();
  }
  const column=node&&node.closest&&node.closest('#readwrap,.pdf-source-page,#originalwrap')
    ||document.getElementById('readwrap')||document.getElementById('originalwrap');
  return column?column.getBoundingClientRect():null;
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
  const anchor=longpressAnchorRect();
  const width=Math.min(280,Math.max(160,column.width-16));
  current.tip.style.width=width+'px';
  const height=current.tip.offsetHeight||64;
  let left=anchor.left+(anchor.width||0)/2-width/2;
  const minLeft=column.left+8;
  const maxLeft=column.right-8-width;
  left=maxLeft<minLeft?minLeft:Math.max(minLeft,Math.min(left,maxLeft));
  const viewBottom=Math.min(window.innerHeight-8,column.bottom-8);
  const viewTop=Math.max(8,column.top+8);
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
  onboardTrack('longpress_tip_shown',{});
  if(range)paintLongpressHighlight(range);
  const tip=document.createElement('div');
  tip.id='longpress-tip';
  tip.setAttribute('role','dialog');
  tip.setAttribute('aria-label','문장 해석 안내');
  tip.innerHTML='<span class="longpress-tip-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.1" fill="currentColor"/></svg></span><span class="longpress-tip-copy"><b>문장을 꾹 눌러보세요</b><small>문장 전체 해석을 볼 수 있어요</small></span><button type="button" aria-label="닫기">✕</button>';
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
    onboardTrack('longpress_tip_dismissed',{reason:reason==='longpress'?'longpress':'close'});
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
