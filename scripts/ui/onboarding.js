/* The tutorial supplies a temporary book and prepared answers to the real Reader.
   It never inserts a book, Meaning, cache entry, progress row or sync payload. */
const ONBOARD_KEY='breeze.onboarding.v1';
const ONBOARD_DELAY_MS=1000;
const ONBOARD_PROGRESS_KEY='breeze.onboarding.guided-progress';
const ONBOARD_PASSAGES=[['Breeze lets your reading flow.','브리즈와 함께 막힘없이 읽어 나가세요.']];
// Each tappable word has an authored meaning and short English definition.
const ONBOARD_WORDS={
  breeze:['브리즈','proper noun','The name of this reading app; a breeze is also a gentle wind.'],
  lets:['~하게 해 주다','verb','Allows something to happen.'],
  your:['당신의','determiner','Belonging to the person being addressed.'],
  reading:['독서','noun','The activity of reading written words.'],
  flow:['자연스럽게 이어지다','verb','Continue smoothly and easily.'],
};
let onboardingSession=null;
function onboardingOwnsReader(){ return !!(onboardingSession && curBook===onboardingSession.book); }
function onboardingDelay(session,delay){
  return new Promise(resolve=>{
    const timer=setTimeout(()=>{session.timers.delete(timer);resolve(true);},delay);
    session.timers.set(timer,resolve);
  });
}
async function startOnboarding(replay){
  if(onboardingSession) endOnboarding(false,false);
  saveReadingState(); closePanel(); closeSentence(); closeAa(); closeSettings();
  const session={
    book:{id:'breeze-onboarding',title:'Breeze Tutorial',kind:'txt',transient:true,
      paras:ONBOARD_PASSAGES.map(part=>part[0]),textAvailable:true},
    previousBook:curBook,previousView:activeAppView(),
    appearance:{fs,darkMode,readMargin},controller:new AbortController(),
    timers:new Map(),seen:new Set(),wordSeen:false,wordExpanded:false,sentenceSeen:false,easySeen:false,aaSeen:false,stage:0,replay:!!replay,
    frame:0,observer:null,
  };
  if(!replay){
    const progress=load(ONBOARD_PROGRESS_KEY,null);
    if(progress && Number.isInteger(progress.stage) && progress.stage>=0 && progress.stage<=4){
      session.stage=progress.stage;
      for(const key of ['wordSeen','wordExpanded','sentenceSeen','easySeen','aaSeen']) session[key]=progress[key]===true;
    }
  }
  onboardingSession=session;
  const back=/** @type {HTMLButtonElement} */(document.getElementById('readback'));
  session.backDisabled=back.disabled;
  back.disabled=true;
  document.body.classList.add('onboarding-active');
  document.getElementById('onboarding').hidden=false;
  const signal=session.controller.signal;
  const schedule=()=>{
    if(session.frame) return;
    session.frame=requestAnimationFrame(()=>{session.frame=0;drawOnboarding();});
  };
  session.observer=new MutationObserver(schedule);
  for(const id of ['word-peek','panel','sentence-modal','aa-pop']){
    session.observer.observe(document.getElementById(id),{attributes:true,attributeFilter:['hidden','class']});
  }
  // The real Reader hydrates word spans lazily; mark targets after they arrive.
  session.observer.observe(document.getElementById('rtext'),{childList:true,subtree:true});
  document.getElementById('onboard-skip').addEventListener('click',()=>endOnboarding(true),{signal});
  document.getElementById('onboard-finish').addEventListener('click',()=>endOnboarding(true),{signal});
  document.getElementById('onboard-next').addEventListener('click',()=>advanceOnboarding(),{signal});
  document.getElementById('onboard-back').addEventListener('click',()=>{
    closePanel();closeSentence();closeAa();session.stage=Math.max(0,session.stage-1);persistOnboarding();drawOnboarding();
    document.getElementById('onboard-next').focus({preventScroll:true});
  },{signal});
  document.getElementById('rtext').addEventListener('keydown',async event=>{
    const node=event.target;
    if(session.stage!==1 || !(node instanceof HTMLElement) || !node.classList.contains('onboard-focus-word')
        || !['Enter',' '].includes(event.key))return;
    event.preventDefault();await openOnboardingWord(node);
    const pill=document.getElementById('word-peek');
    const focusChevron=()=>{
      if(onboardingSession!==session || activeSelectedWordNode!==node || document.activeElement!==node){observer.disconnect();return;}
      if(!pill.hidden){observer.disconnect();document.getElementById('word-peek-more').focus({preventScroll:true});}
    };
    const observer=new MutationObserver(focusChevron);
    observer.observe(pill,{attributes:true,attributeFilter:['hidden']});
    session.controller.signal.addEventListener('abort',()=>observer.disconnect(),{once:true});
    focusChevron();
  },{signal});
  document.getElementById('onboard-sentence').addEventListener('click',()=>{
    const node=document.querySelector('#rtext .w');if(!node)return;
    const rect=node.getBoundingClientRect();
    const surface=READER_SURFACES.find(surface=>surface.name==='text');
    const found=surface?.sentenceAt(rect.x+rect.width/2,rect.y+rect.height/2);
    if(found){closePanel();found.paint();void openSentence(found.sentence,found);}
  },{signal});
  document.getElementById('onboard-return').addEventListener('click',()=>{closePanel();closeSentence();closeAa();drawOnboarding();document.getElementById('onboard-next').focus({preventScroll:true});},{signal});
  document.getElementById('onboard-password').addEventListener('click',()=>{endOnboarding(true);openSyncModal();openPasswordLogin();},{signal});
  document.getElementById('onboard-login').addEventListener('click',()=>{endOnboarding(true);openSyncModal();},{signal});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape' && !wordLookupOpen() && !sentenceLookupOpen()
        && !document.getElementById('aa-pop').classList.contains('on') && !event.defaultPrevented){
      // A lookup dismissal owns its Escape; only a bare Reader Escape ends the tour.
      if(session.escapeWasOverlay) return;
      endOnboarding(true);
    }
  },{signal});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape') session.escapeWasOverlay=wordLookupOpen() || sentenceLookupOpen()
      || document.getElementById('aa-pop').classList.contains('on');
  },{signal,capture:true});
  await openBook(session.book);
  if(onboardingSession!==session) return;
  document.getElementById('rhint').hidden=true;
  const title=document.getElementById('rtitle');
  title.setAttribute('tabindex','-1');
  drawOnboarding();
  document.getElementById('onboard-prompt').focus({preventScroll:true});
}
function persistOnboarding(){
  const session=onboardingSession;if(!session||session.replay)return;
  save(ONBOARD_PROGRESS_KEY,Object.fromEntries(['stage','wordSeen','wordExpanded','sentenceSeen','easySeen','aaSeen'].map(key=>[key,session[key]])));
}
function advanceOnboarding(){
  const session=onboardingSession;if(!session)return;
  if((session.stage===1&&!session.wordExpanded)||(session.stage===2&&!session.easySeen)||(session.stage===3&&!session.aaSeen))return;
  closePanel();closeSentence();closeAa();
  session.stage=Math.min(4,session.stage+1);persistOnboarding();drawOnboarding();
  document.getElementById('onboard-prompt').focus({preventScroll:true});
}
function onboardingAppearanceOpened(){
  if(onboardingOwnsReader() && onboardingSession.stage===3){onboardingSession.aaSeen=true;persistOnboarding();}
}
function drawOnboarding(){
  const session=onboardingSession;if(!session)return;
  const stage=session.stage,root=document.getElementById('onboarding');root.dataset.stage=String(stage);
  document.body.dataset.onboardStage=String(stage);
  document.getElementById('v-read').inert=stage===0||stage===4;
  const aaOpen=document.getElementById('aa-pop').classList.contains('on');
  const overlay=wordLookupOpen()||sentenceLookupOpen()||aaOpen;
  const coach=document.getElementById('onboard-coach');
  coach.hidden=overlay;
  const guidance=document.getElementById('onboard-overlay-guide');guidance.hidden=!overlay;
  document.getElementById('onboard-overlay-prompt').textContent=stage===1
    ?(session.wordExpanded?'단어를 더 자세히 볼 수 있어요.':'뜻 옆의 꺾쇠를 눌러보세요.')
    :stage===2?'번역 아래 ‘쉬운 설명’을 눌러보세요.':'글자 크기부터 맞춰보세요.';
  document.getElementById('onboard-skip').hidden=stage===0||overlay;
  document.getElementById('onboard-back').hidden=stage===0||overlay;
  document.getElementById('onboard-welcome').hidden=stage!==0;
  const prompts=[
    '브리즈에 오신 걸 환영해요',
    session.wordSeen?'뜻 옆의 꺾쇠를 눌러 더 알아보세요.':'Breeze를 눌러보세요.',
    session.sentenceSeen?'번역 아래 ‘쉬운 설명’을 눌러보세요.':'문장을 길게 눌러보세요.',
    'Aa에서 글자 크기를 맞춰보세요.',
    sbUser?'읽을 준비가 됐어요.':'로그인하면 단어장을 이어서 볼 수 있어요.',
  ];
  document.getElementById('onboard-step').textContent=stage===0?'':`${stage} / 4`;
  document.getElementById('onboard-prompt').textContent=prompts[stage];
  const next=/** @type {HTMLButtonElement} */(document.getElementById('onboard-next'));
  next.hidden=stage===4;next.textContent=stage===0?'시작하기':'다음';
  next.disabled=(stage===1&&!session.wordExpanded)||(stage===2&&!session.easySeen)||(stage===3&&!session.aaSeen);
  document.getElementById('onboard-finish').hidden=stage!==4;
  document.getElementById('onboard-finish').textContent=sbUser?'읽기 시작':'로그인 없이 시작';
  for(const id of ['onboard-login','onboard-apple','onboard-apple-note','onboard-password'])document.getElementById(id).hidden=stage!==4||!!sbUser;
  document.getElementById('onboard-sentence').hidden=stage!==2;
  document.getElementById('onboard-note').hidden=stage!==3;
  document.getElementById('aafab').classList.toggle('onboard-target',stage===3&&!aaOpen);
  document.querySelectorAll('#rtext .w').forEach(node=>{
    node.classList.toggle('onboard-focus-word',node.textContent==='Breeze');
    if(stage===1 && node.textContent==='Breeze'){
      node.setAttribute('tabindex','0');node.setAttribute('role','button');node.setAttribute('aria-label','Breeze 뜻 보기');
    }else{node.removeAttribute('tabindex');node.removeAttribute('role');node.removeAttribute('aria-label');}

    node.classList.toggle('onboard-target',!overlay&&stage===1&&node.textContent==='Breeze');
  });
}
async function openOnboardingWord(node,retry=false){
  const session=onboardingSession;
  if(!onboardingOwnsReader() || !node) return;
  if(!retry && wordPeekActive && node===activeSelectedWordNode) return;
  const raw=node.textContent.toLowerCase(),entry=ONBOARD_WORDS[raw];
  if(!entry) return;
  const example=sentenceOf(node),key='onboarding:'+raw+':'+sentenceHash(example);
  const ready=!retry && session.seen.has(key);
  closePanel();
  const card={key,word:raw,clicked:node.textContent,example,book:session.book.title,
    ko:ready?entry[0]:'',ai:{ko:ready?entry[0]:'',pos:entry[1],done:true},
    loading:!ready,aiLoading:!ready,defs:[{pos:entry[1],def:entry[2]}],mark:false,status:1};
  previewWordCard=card;
  selectWord(key,node,true);
  const life=wordLookupLife;
  if(!ready && !(await onboardingDelay(session,ONBOARD_DELAY_MS))) return;
  if(onboardingSession!==session || !wordLookupAlive(life) || previewWordCard!==card) return;
  card.ko=entry[0];card.ai.ko=entry[0];card.loading=false;card.aiLoading=false;
  session.seen.add(key);session.wordSeen=true;persistOnboarding();
  renderWordLookup();drawOnboarding();
}
function renderOnboardingWordDetail(card){
  if(onboardingSession && !card.loading){onboardingSession.wordExpanded=true;persistOnboarding();}
  // Reuse the normal meaning/metadata/utterance surface, without vocabulary actions.
  document.getElementById('p-ai-saved').hidden=true;
  document.getElementById('p-aibtn').style.display='none';
  document.getElementById('p-aihint').style.display='none';
  document.getElementById('p-alt-sec').className='p-sec';
  document.getElementById('p-alts').innerHTML='';
  document.getElementById('p-defs').innerHTML=card.loading?'불러오는 중…':
    card.defs.map(item=>`<div><span class="pos">${esc(item.pos)}</span>${esc(item.def)}</div>`).join('');
}
async function explainOnboardingSentence(clean,life){
  const session=onboardingSession;
  const prepared=ONBOARD_PASSAGES.find(part=>part[0]===clean);
  if(!session || !prepared){closeSentence();return;}
  const key='sentence:'+clean;
  if(!session.seen.has(key) && !(await onboardingDelay(session,ONBOARD_DELAY_MS))) return;
  if(onboardingSession!==session || !sentenceAlive(life)) return;
  session.seen.add(key);session.sentenceSeen=true;persistOnboarding();
  showReaderChrome();
  paintSentenceFor(life,{en:clean,ko:prepared[1]});
  drawOnboarding();
}
function endOnboarding(remember,returnToPrevious=true){
  const session=onboardingSession;if(!session) return;
  session.controller.abort();session.observer.disconnect();
  if(session.frame) cancelAnimationFrame(session.frame);
  session.timers.forEach((resolve,timer)=>{clearTimeout(timer);resolve(false);});session.timers.clear();
  closePanel();closeSentence();closeAa();
  onboardingSession=null;
  document.getElementById('onboarding').hidden=true;
  document.body.classList.remove('onboarding-active');
  delete document.body.dataset.onboardStage;
  document.getElementById('v-read').inert=false;
  const back=/** @type {HTMLButtonElement} */(document.getElementById('readback'));
  back.disabled=session.backDisabled;
  document.getElementById('aafab').classList.remove('onboard-target');
  document.querySelectorAll('#rtext .onboard-target').forEach(node=>node.classList.remove('onboard-target'));
  document.getElementById('rhint').hidden=false;
  document.getElementById('rtitle').removeAttribute('tabindex');
  fs=session.appearance.fs;darkMode=session.appearance.darkMode;readMargin=session.appearance.readMargin;
  document.documentElement.style.setProperty('--fs',fs+'px');
  showFontSize();applyDark();applyReadMargin();
  curBook=null;
  if(remember){save(ONBOARD_KEY,'done');localStorage.removeItem(ONBOARD_PROGRESS_KEY);}
  if(returnToPrevious){
    if(session.previousView==='read' && session.previousBook) openBook(session.previousBook);
    else show(session.previousView,{fromHistory:true});
  }
}
function maybeShowOnboarding(){
  if(load(ONBOARD_KEY,'')==='done') return;
  if(books.length || Object.keys(words).length || Object.keys(dead).length || Object.keys(positions).length){
    save(ONBOARD_KEY,'done');return;
  }
  return startOnboarding(false);
}
