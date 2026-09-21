/* The tutorial supplies a temporary book and prepared answers to the real Reader.
   It never inserts a book, Meaning, cache entry, progress row or sync payload. */
const ONBOARD_KEY='breeze.onboarding.v1';
const ONBOARD_DELAY_MS=500;
const ONBOARD_PASSAGES=[
  ['Every story begins with a little curiosity.','모든 이야기는 작은 호기심에서 시작돼요.'],
  ['Tap a word to discover its meaning.','단어를 탭해 뜻을 알아보세요.'],
  ['Press and hold a word to understand the whole sentence.','단어를 길게 눌러 문장 전체의 뜻을 이해해 보세요.'],
  ['Let your reading flow with Breeze.','Breeze와 함께 막힘없이 읽어 나가세요.'],
];
// Each tappable word has an authored meaning and short English definition.
const ONBOARD_WORDS={
  every:['모든','determiner','Used to refer to all members of a group.'],
  story:['이야기','noun','An account of events, real or imagined.'],
  begins:['시작된다','verb','Starts to happen.'],
  with:['~와 함께','preposition','Together with someone or something.'],
  a:['하나의','article','Used before one person or thing.'],
  little:['작은','adjective','Small in amount or size.'],
  curiosity:['호기심','noun','A desire to learn or know more.'],
  tap:['가볍게 누르다','verb','Touch something lightly with a finger.'],
  word:['단어','noun','A unit of language that has meaning.'],
  to:['~하기 위해','particle','Used before a verb to show a purpose.'],
  discover:['알아내다','verb','Find or learn something.'],
  its:['그것의','determiner','Belonging to the thing just mentioned.'],
  meaning:['뜻','noun','The idea that a word expresses.'],
  press:['누르다','verb','Push against something with a finger.'],
  and:['그리고','conjunction','Used to connect words or actions.'],
  hold:['누른 채로 유지하다','verb','Keep something in the same position.'],
  understand:['이해하다','verb','Know what something means.'],
  the:['그','article','Used before a particular person or thing.'],
  whole:['전체의','adjective','Complete, with no part missing.'],
  sentence:['문장','noun','A group of words that expresses a complete thought.'],
  let:['~하게 하다','verb','Allow something to happen.'],
  your:['당신의','determiner','Belonging to the person being addressed.'],
  reading:['독서','noun','The activity of reading written words.'],
  flow:['자연스럽게 이어지다','verb','Continue smoothly and easily.'],
  breeze:['브리즈','proper noun','The name of this reading app; a breeze is also a gentle wind.'],
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
    book:{id:'breeze-onboarding',title:'Welcome to Breeze',kind:'txt',transient:true,
      paras:ONBOARD_PASSAGES.map(part=>part[0]),textAvailable:true},
    previousBook:curBook,previousView:activeAppView(),
    appearance:{fs,darkMode,readMargin},controller:new AbortController(),
    timers:new Map(),seen:new Set(),wordSeen:false,sentenceSeen:false,aaSeen:false,
    frame:0,observer:null,
  };
  onboardingSession=session;
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
  document.getElementById('onboard-skip').addEventListener('click',()=>endOnboarding(true),{signal});
  document.getElementById('onboard-next').addEventListener('click',()=>{endOnboarding(true);openAddModal();},{signal});
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
  title.setAttribute('tabindex','-1');title.focus({preventScroll:true});
  drawOnboarding();
}
function onboardingAppearanceOpened(){
  if(onboardingOwnsReader() && onboardingSession.sentenceSeen) onboardingSession.aaSeen=true;
}
function drawOnboarding(){
  const session=onboardingSession;if(!session) return;
  const aaOpen=document.getElementById('aa-pop').classList.contains('on');
  if(aaOpen && session.sentenceSeen) session.aaSeen=true;
  const stage=!session.wordSeen?0:!session.sentenceSeen?1:!session.aaSeen?2:3;
  const root=document.getElementById('onboarding');root.dataset.stage=String(stage);
  const coach=document.getElementById('onboard-coach');
  coach.hidden=wordLookupOpen() || sentenceLookupOpen() || aaOpen;
  // Guidance yields the whole surface while a lookup or Aa owns the interaction.
  document.getElementById('onboard-skip').hidden=coach.hidden;
  const prompts=[
    'Breeze에 오신 것을 환영합니다.\n궁금한 단어를 탭해 보세요.',
    '문장의 뜻도 궁금하신가요?\n문장 속 단어를 길게 눌러 보세요.',
    '나에게 편한 읽기 화면을 만들어 보세요.\n아래 Aa에서 글자 크기와 화면 색을 바꿀 수 있어요.',
    '이제, 읽고 싶었던 이야기 속으로.\nBreeze와 함께 내 책을 읽어 보세요.',
  ];
  document.getElementById('onboard-step').textContent=stage===3?'준비됐어요':`${stage+1} / 3 · ${['단어 뜻','문장 해석','보기 설정'][stage]}`;
  document.getElementById('onboard-prompt').textContent=prompts[stage];
  document.getElementById('onboard-next').hidden=stage!==3;
  document.getElementById('onboard-note').hidden=stage!==3;
  document.getElementById('aafab').classList.toggle('onboard-target',stage===2 && !aaOpen);
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
  session.seen.add(key);session.wordSeen=true;
  renderWordLookup();drawOnboarding();
}
function renderOnboardingWordDetail(card){
  // Reuse the normal meaning/metadata/utterance surface, without vocabulary actions.
  document.getElementById('p-ai-saved').hidden=true;
  document.getElementById('p-airetry').hidden=true;
  document.getElementById('p-aibtn').style.display='none';
  document.getElementById('p-aihint').style.display='none';
  document.getElementById('p-meaning-del').hidden=true;
  document.getElementById('p-sense-add').hidden=true;
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
  session.seen.add(key);session.sentenceSeen=true;
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
  document.getElementById('aafab').classList.remove('onboard-target');
  document.getElementById('rhint').hidden=false;
  document.getElementById('rtitle').removeAttribute('tabindex');
  fs=session.appearance.fs;darkMode=session.appearance.darkMode;readMargin=session.appearance.readMargin;
  document.documentElement.style.setProperty('--fs',fs+'px');
  showFontSize();applyDark();applyReadMargin();
  curBook=null;
  if(remember) save(ONBOARD_KEY,'done');
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
  startOnboarding(false);
}
