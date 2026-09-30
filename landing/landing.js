/* ================= 랜딩 =================
 *
 * 이 파일은 앱과 아무것도 나눠 갖지 않습니다. 앱의 사전도, 저장소도, 손짓
 * 판정기도 부르지 않습니다 — 여기 있는 것은 아래 상자에 적어 둔 낱말들과 문장
 * 둘이 전부이고, 서버로 나가는 요청은 하나도 없습니다. 두 문장에 나오는
 * 일반 낱말은(상표 `Breeze` 포함) 예외 없이 전부 눌립니다 — 특정 낱말만
 * 되는 것처럼 보이면 안 되기 때문입니다.
 *
 * 그런데 화면에 뜨는 창은 진짜 그 창입니다. 단어창도 시트도 문장 창도 앱의
 * CSS 를 그대로 링크해서 씁니다(index.html). 랜딩에서 눌러 본 방식이 앱에서
 * 그대로 통해야 하므로, 손짓의 기준도 앱과 같은 수를 씁니다:
 *
 *     꾹 누르기 1000ms · 흔들림 10px   (scripts/reader/gesture.js 의
 *                                       GESTURE_HOLD_MS · GESTURE_SLOP)
 *
 * 장면 여섯은 스크롤이 넘겨 줍니다. 스크롤이 하는 일은 `body[data-state]` 한
 * 글자를 바꾸는 것뿐이고, 2·3 은 시연이 아니라 **이미 끝난 순간**입니다 —
 * 커서가 움직이지도, 창이 열리는 과정을 보여 주지도 않습니다.
 *
 * 뒤의 두 장면(4·5)은 이 파일이 하는 일이 없습니다. 글도 그림도 index.html 에
 * 이미 있고, 나타나고 사라지는 것은 CSS 가 `body[data-state]` 를 보고 합니다.
 */

/* ---- 이 페이지가 아는 전부 ---- */
const LP_WORDS = {
  stay:{ line:1, word:'stay', ko:'머무르다', pos:'v.',
    alts:['머무르다','계속 있다','벗어나지 않다'],
    defs:[['v.','to continue to be in a place or condition'],
          ['v.','to remain with someone or something']] },
  story:{ line:1, word:'story', ko:'이야기', pos:'n.',
    alts:['이야기','줄거리','소설'],
    defs:[['n.','a description of events, real or imagined'],
          ['n.','a report in a newspaper']] },
  handles:{ line:2, word:'handle', ko:'알아서 처리하다', pos:'v.',
    alts:['처리하다','다루다','맡다'],
    defs:[['v.','to deal with a situation or a task'],
          ['n.','the part of a thing you hold']] },
  rest:{ line:2, word:'rest', ko:'나머지', pos:'n.',
    alts:['나머지','휴식','쉬다'],
    defs:[['n.','the remaining part of something'],
          ['v.','to stop working for a while']] },
  with:{ line:1, word:'with', ko:'~와 함께', pos:'prep.',
    alts:['~와 함께','~을 가지고','~와 같이'],
    defs:[['prep.','in the company of someone or something'],
          ['prep.','having or including something']] },
  the:{ line:1, word:'the', ko:'그', pos:'art.',
    alts:['그','이','저'],
    defs:[['art.','used to refer to a specific thing already known or mentioned'],
          ['art.','used before a noun that is unique or already clear']] },
  breeze:{ line:2, word:'Breeze', ko:'산들바람', pos:'n.',
    alts:['산들바람','미풍','순풍'],
    defs:[['n.','a light, gentle wind'],
          ['v.','to move somewhere in a quick, easy way']] },
};
/* 문장의 한국어는 이 페이지가 이미 쓴 그 두 줄입니다 — 여기서 새로 지어낸 말은
   없습니다. */
const LP_SENTS = {
  1:{ en:'Stay with the story.', ko:'이야기의 흐름 그대로.' },
  2:{ en:'Breeze handles the rest.', ko:'나머지는 Breeze가 할게요.' },
};
/* 읽는 화면에서는 모든 낱말이 상자입니다 — 특정 낱말만 눌리면 "이 낱말만
   특별하다" 는 오해를 남깁니다. 그래서 영어 문장의 일반 낱말은 전부 상자로
   감쌉니다. `Breeze` 는 이 문자열 안에 없습니다 — index.html 의 `.lp-brand`
   자리가 이미 그 자리를 지키고 있고, 그 span 도 `.w data-w="breeze"` 라서
   똑같이 눌립니다(상표이기 전에 "가볍게 부는 바람"이라는 뜻이 있으니까요). */
const LP_COPY = {
  ko:{ a1:'이야기의 흐름 그대로.', a2:'나머지는 ', b2:'가 할게요.' },
  en:{ a1:'<span class="w" data-w="stay">Stay</span> ' +
          '<span class="w" data-w="with">with</span> ' +
          '<span class="w" data-w="the">the</span> ' +
          '<span class="w" data-w="story">story</span>.',
       a2:'',
       b2:'&nbsp;<span class="w" data-w="handles">handles</span> ' +
          '<span class="w" data-w="the">the</span> ' +
          '<span class="w" data-w="rest">rest</span>.' },
};

const $ = id => document.getElementById(id);
const lpSent = n => document.querySelector('.lp-sentence[data-s="' + n + '"]');
const lpQuiet = window.matchMedia('(prefers-reduced-motion:reduce)');

/* ================= 두 줄 ================= */

/* 말은 바뀌고 상표는 남습니다. 앞뒤 조각만 흐려졌다 돌아오고 `Breeze` 는 그
   사이에도 계속 보입니다. */
let lpLang = '';
function lpSetLang(lang, then){
  if(lang === lpLang){ then(); return; }
  const first = !lpLang;
  lpLang = lang;
  const brand = document.querySelector('.lp-brand');
  const write = () => {
    const was = brand.getBoundingClientRect().left;
    const copy = LP_COPY[lang];
    lpSent(1).querySelector('.lp-a').innerHTML = copy.a1;
    lpSent(2).querySelector('.lp-a').innerHTML = copy.a2;
    lpSent(2).querySelector('.lp-b').innerHTML = copy.b2;
    document.documentElement.lang = lang;
    /* 상표는 줄 안에서 자리가 바뀝니다 — 한국어에서는 "나머지는" 뒤에, 영어에서는
       줄 맨 앞에. 폰에서 그 거리가 화면 폭의 4분의 1이라, 그냥 두면 주변이
       돌아오는 순간 상표가 한 번 튄 것으로 보입니다. 새 자리에 놓은 뒤 **옛
       자리에서부터** 미끄러져 오게 합니다. 재는 것은 왼쪽 끝 하나뿐이고,
       움직이는 것도 이 한 조각뿐입니다. 첫 화면은 옛 자리가 없으므로 그냥
       거기 있습니다. */
    if(!first){
      brand.style.transition = 'none';
      brand.style.transform = 'translateX(' + (was - brand.getBoundingClientRect().left) + 'px)';
      void brand.offsetWidth;            /* 여기서 한 번 굳혀야 다음 줄이 전환이 됩니다 */
      brand.style.transition = '';
      brand.style.transform = '';
    }
    document.querySelectorAll('.lp-sentence .w').forEach(node=>{node.tabIndex=lang==='en'?0:-1;node.setAttribute('role','button');node.setAttribute('aria-label',node.textContent+' 뜻 보기');});
    then();
  };
  if(first || lpQuiet.matches){ write(); return; }
  document.body.classList.add('lp-swap');
  setTimeout(() => { write(); document.body.classList.remove('lp-swap'); }, 320);
}

/* ================= 단어창 ================= */

const lpPanel = () => $('panel');
let lpActiveWord = null, lpWordAnchor = null, lpWordMorph = null, lpWordMorphGeneration = 0;

function lpStopWordMorph(){
  lpWordMorphGeneration++;
  if(lpWordMorph) lpWordMorph.cancel();
  lpWordMorph = null;
  lpPanel().classList.remove('morphing');
}

function lpCloseWord(){
  lpStopWordMorph();
  $('word-peek').hidden = true;
  lpPanel().classList.remove('on');
  lpPanel().classList.remove('anchored');
  lpPanel().removeAttribute('style');
  lpPanel().setAttribute('aria-hidden','true');
  lpPanel().setAttribute('aria-modal','true');
  $('word-modal-scrim').classList.remove('on');
  document.querySelectorAll('.w.sel').forEach(node => node.classList.remove('sel'));
  lpWordAnchor = null;
  lpActiveWord = null;
}

function lpWordBounds(){
  const viewport = window.visualViewport;
  const x = viewport ? viewport.offsetLeft : 0;
  const y = viewport ? viewport.offsetTop : 0;
  const width = viewport ? viewport.width : window.innerWidth;
  const height = viewport ? viewport.height : window.innerHeight;
  const nav = document.querySelector('.lp-nav').getBoundingClientRect();
  const top = Math.max(y+16,nav.bottom+12);
  return {x,width,top,bottom:y+height-16};
}

/* 최신 리더와 같이, 작은 뜻 필과 상세창이 같은 낱말을 기준으로 자랍니다. */
function lpPlaceWordPeek(){
  if(!lpWordAnchor || $('word-peek').hidden) return;
  const pill = $('word-peek'), word = lpWordAnchor.node.getBoundingClientRect();
  const {x,width,top:limitTop,bottom:limitBottom} = lpWordBounds();
  const box = pill.getBoundingClientRect(), gap = 8, edge = 16;
  const above = Math.max(0,word.top-gap-limitTop);
  const below = Math.max(0,limitBottom-word.bottom-gap);
  if(!lpWordAnchor.direction){
    const detailHeight = Math.min(420,(limitBottom-limitTop)*.7);
    lpWordAnchor.direction = below>=detailHeight ? 'below'
      : above>=detailHeight ? 'above' : below>=above ? 'below' : 'above';
  }
  const left = Math.max(x+edge,Math.min((word.left+word.right-box.width)/2,x+width-edge-box.width));
  const rawTop = lpWordAnchor.direction==='above' ? word.top-gap-box.height : word.bottom+gap;
  const top = Math.max(limitTop,Math.min(rawTop,limitBottom-box.height));
  pill.dataset.expandDirection = lpWordAnchor.direction;
  pill.style.transformOrigin = lpWordAnchor.direction==='below' ? '50% 0%' : '50% 100%';
  pill.style.left = Math.round(left)+'px';
  pill.style.top = Math.round(top)+'px';
}

function lpPlaceWordDetail(){
  if(!lpWordAnchor) return;
  const word = lpWordAnchor.node.getBoundingClientRect();
  const {x,width,top:limitTop,bottom:limitBottom} = lpWordBounds();
  const gap = 8, edge = 16, below = lpWordAnchor.direction==='below';
  const hinge = below
    ? Math.min(limitBottom-44,Math.max(limitTop,word.bottom+gap))
    : Math.max(limitTop+44,Math.min(limitBottom,word.top-gap));
  const height = Math.max(44,Math.min(380,below?limitBottom-hinge:hinge-limitTop));
  const panelWidth = Math.min(360,width-edge*2);
  const left = Math.max(x+edge,Math.min((word.left+word.right-panelWidth)/2,x+width-edge-panelWidth));
  Object.assign(lpPanel().style,{
    left:left+'px',top:(below?hinge:hinge-height)+'px',
    width:panelWidth+'px',height:height+'px'
  });
}

function lpMorphWordSurface(from,to){
  lpStopWordMorph();
  if(window.matchMedia('(prefers-reduced-motion:reduce)').matches || !lpPanel().animate) return;
  const generation = lpWordMorphGeneration, panel = lpPanel();
  // As in the Reader, lay out once and animate only the glass shell transform.
  panel.classList.add('morphing');
  lpWordMorph = panel.animate([
    {transformOrigin:'0 0',transform:`translate(${from.left-to.left}px,${from.top-to.top}px) scale(${from.width/to.width},${from.height/to.height})`},
    {transformOrigin:'0 0',transform:'none'}],
    {duration:280,easing:'cubic-bezier(.2,.8,.2,1)',fill:'none'});
  lpWordMorph.finished.then(() => {
    if(generation!==lpWordMorphGeneration) return;
    lpWordMorph = null;
    panel.classList.remove('morphing');
  }).catch(() => {});
}

function lpShowWordPeek(key, fromLine){
  const entry = LP_WORDS[key];
  if(!entry) return;
  lpCloseWord();
  lpCloseSentence();
  lpActiveWord = {key, fromLine};
  const word = lpSent(fromLine || entry.line)?.querySelector('.w[data-w="'+key+'"]')
    || document.querySelector('.w[data-w="'+key+'"]');
  if(!word) return;
  word.classList.add('sel');
  lpWordAnchor = {node:word,direction:null};
  $('word-peek-meaning').textContent = entry.ko;
  const pill = $('word-peek');
  pill.hidden = false;
  requestAnimationFrame(lpPlaceWordPeek);
}

function lpOpenWord(key, fromLine){
  const entry = LP_WORDS[key];
  if(!entry || !lpWordAnchor) return;
  lpCloseSentence();
  lpPlaceWordPeek();
  const from = $('word-peek').getBoundingClientRect();
  $('word-peek').hidden = true;
  $('p-word').textContent = entry.word;
  $('p-ai').classList.add('on');
  $('p-clicked').textContent = entry.word.toLowerCase() === key ? '' : `${key}에서 찾음`;
  $('p-clicked').classList.toggle('on', !!$('p-clicked').textContent);
  $('p-ai-ko').textContent = entry.ko;
  $('p-ai-pos').textContent = entry.pos;
  $('p-ai-note').textContent = '';
  $('p-ai-note').hidden = true;
  $('p-ai-saved').hidden = false;
  $('p-ai').classList.remove('wait','load');
  $('p-saved-senses').innerHTML = '';
  $('p-saved-senses').classList.remove('on');
  $('p-alt-sec').classList.add('on');
  const alts = $('p-alts');
  alts.classList.add('on');
  alts.innerHTML = entry.alts.filter(meaning => meaning !== entry.ko).slice(0,3)
    .map(meaning => '<button type="button" class="kochip">' + meaning + '</button>').join('');
  [...alts.querySelectorAll('.kochip')].forEach(chip =>
    chip.addEventListener('click', () => lpPickMeaning(key, chip.textContent)));
  $('p-defs').innerHTML = entry.defs.map(([pos, text]) =>
    '<div><span class="pos">' + pos + '</span>' + text + '</div>').join('');
  /* "the" 처럼 두 줄에 다 나오는 낱말은, 실제로 누른 그 줄이 예문이어야 맞습니다
     — 사전 항목 하나가 두 문장을 다 가리키면 어느 쪽에서 눌러도 같은 예문만
     보이게 됩니다. 눌린 자리를 모를 때(2번 장면이 스스로 여는 경우)만
     `entry.line` 을 기본값으로 씁니다. */
  const example = LP_SENTS[fromLine || entry.line].en;
  $('p-ex').textContent = example;
  $('p-ex-preview').textContent = example;
  $('p-ex-fold').open = false;
  $('p-en-section').hidden = false;
  $('p-mark').classList.add('on');
  $('p-mark').setAttribute('aria-pressed','true');
  $('p-mark').querySelector('span').textContent = '켜짐';

  lpPanel().classList.add('anchored');
  lpPanel().setAttribute('aria-hidden','false');
  lpPanel().setAttribute('aria-modal','false');
  lpPanel().classList.add('on');
  lpPanel().scrollTop = 0;
  lpPlaceWordDetail();
  lpMorphWordSurface(from,lpPanel().getBoundingClientRect());
}

/* 뜻을 고르면 단어장에 담깁니다. 앱에는 저장 단추가 없고, 담겼다는 말은 두
   자리에서 옵니다 — 뜻 카드 모서리의 배지와, 본문에서 그 낱말이 칠해지는 것.
   여기서도 그 둘을 그대로 씁니다(랜딩 밖으로 나가는 저장은 없습니다). */
function lpPickMeaning(key, meaning){
  $('p-ai-ko').textContent = meaning;
  $('p-ai-saved').hidden = false;
  [...$('p-alts').querySelectorAll('.kochip')].forEach(chip =>
    chip.classList.toggle('on', chip.textContent === meaning));
  document.querySelectorAll('.w[data-w="' + key + '"]').forEach(node =>
    node.classList.add('s1'));
  lpToast('체험 예시예요. 실제 저장은 앱에서 할 수 있어요.');
}

let lpToastTimer;
function lpToast(message){
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('on');
  clearTimeout(lpToastTimer);
  lpToastTimer = setTimeout(() => toast.classList.remove('on'), 2600);
}

/* ================= 문장 해석 ================= */

function lpCloseSentence(){
  $('sentence-modal').hidden = true;
  $('p-sentence').style.top = '';
  document.querySelectorAll('.lp-sentence.cued').forEach(node => node.classList.remove('cued'));
}

function lpPlaceSentence(){
  if($('sentence-modal').hidden) return;
  const card = $('p-sentence');
  const lineBottom = Math.max(...[1,2].map(n => lpSent(n).getBoundingClientRect().bottom));
  const navBottom = document.querySelector('.lp-nav').getBoundingClientRect().bottom;
  const maxTop = Math.max(navBottom+12,window.innerHeight-card.getBoundingClientRect().height-16);
  card.style.top = Math.min(Math.max(navBottom+12,lineBottom+20),maxTop)+'px';
}

function lpOpenSentence(n){
  const sentence = LP_SENTS[n];
  lpCloseWord();
  $('ps-en').textContent = sentence.en;
  $('ps-source').hidden = false;
  $('ps-ko').textContent = sentence.ko;
  $('sentence-modal').hidden = false;
  document.querySelectorAll('.lp-sentence').forEach(node =>
    node.classList.toggle('cued', node.dataset.s === String(n)));
  lpPlaceSentence();
}

/* ================= 손짓 =================
   앱과 같은 판정입니다 — 제자리에서 떼면 낱말, 제자리에서 오래 누르고 있으면
   문장, 손가락이 움직였으면 읽는 중입니다. 시간과 흔들림의 값도 앱과 같습니다.
   판정하는 자리를 여기 하나로 두는 것도 같습니다: 문장 조각마다 따로 듣지 않고
   문장 하나가 통째로 듣습니다. */
const LP_HOLD_MS = 750, LP_SLOP = 10;

document.querySelectorAll('.lp-sentence').forEach(sentence => {
  let timer = null, x = 0, y = 0, held = false;
  const stop = () => { clearTimeout(timer); timer = null; };
  sentence.addEventListener('pointerdown', event => {
    if(document.body.dataset.state === '0') return;   /* 아직 한국어 장면입니다 */
    x = event.clientX; y = event.clientY; held = false;
    timer = setTimeout(() => {
      timer = null; held = true;
      lpOpenSentence(+sentence.dataset.s);
    }, LP_HOLD_MS);
  });
  sentence.addEventListener('pointermove', event => {
    if(timer && Math.hypot(event.clientX - x, event.clientY - y) > LP_SLOP) stop();
  });
  sentence.addEventListener('pointercancel', stop);
  sentence.addEventListener('pointerup', event => {
    if(held){ held = false; return; }             /* 문장으로 끝난 손짓입니다 */
    if(!timer) return;                             /* 움직였거나 남의 손짓입니다 */
    stop();
    const word = (/** @type {HTMLElement} */(event.target)).closest('.w');
    if(word) lpShowWordPeek(word.dataset.w, +sentence.dataset.s);
  });
  /* 안드로이드는 꾹 누르면 제 메뉴를 엽니다. 이 자리에서 꾹 누르는 것은
     문장을 물어보는 일이라 그 메뉴는 오지 않습니다. */
  sentence.addEventListener('contextmenu', event => event.preventDefault());
});

/* 닫는 길은 앱과 같은 자리입니다 — 시트 뒤의 판, 옆 칸의 ✕, 문장 창 바깥.
   랜딩이 새로 만든 문은 없습니다. 문장 창에는 ✕ 가 없습니다: 앱이 "닫는 길이
   둘이면 닫은 뒤에 무엇이 남았는지 두 벌 확인해야 한다"는 이유로 뺐고
   (index.html 의 `#sentence-modal` 주석), 그래서 그 단추의 생김새도
   styles/dictionary.css 에 남아 있지 않습니다. */
$('word-peek-more').addEventListener('click', () => {
  if(lpActiveWord) lpOpenWord(lpActiveWord.key,lpActiveWord.fromLine);
});
$('word-peek-retry').addEventListener('click', () => {
  if(lpActiveWord) lpShowWordPeek(lpActiveWord.key,lpActiveWord.fromLine);
});
$('sentence-scrim').addEventListener('click', lpCloseSentence);
document.addEventListener('pointerdown', event => {
  const target = event.target;
  if(!(target instanceof Element) || target.closest('#word-peek,#panel,#sentence-modal,.w')) return;
  if(!$('word-peek').hidden || lpPanel().classList.contains('on')) lpCloseWord();
});
document.addEventListener('keydown', event => {
  const target=event.target;
  if((event.key==='Enter'||event.key===' ')&&target instanceof HTMLElement&&target.matches('.lp-sentence .w')&&lpLang==='en'){
    event.preventDefault();lpShowWordPeek(target.dataset.w,Number(target.closest('.lp-sentence').getAttribute('data-s')));return;
  }
  if(event.key !== 'Escape') return;
  lpCloseSentence(); lpCloseWord();
});

/* ================= 여섯 장면 =================
   스크롤은 장면을 고르기만 합니다. 고른 뒤에 벌어지는 일은 위의 함수들이고,
   그 함수들은 사용자가 직접 눌렀을 때 부르는 것과 똑같은 것들입니다.
   4·5 에서는 부를 것이 없습니다 — 두 창을 닫고 나면 나머지는 CSS 몫입니다. */
let lpState = -1, lpHintTimer;
function lpApply(state){
  if(state === lpState) return;
  lpState = state;
  document.body.dataset.state = String(state);

  clearTimeout(lpHintTimer);
  $('hint').classList.remove('on');
  if(state === 1){
    /* 영어로 바뀌자마자 들이밀지 않습니다. 문장을 한 번 읽을 만큼 두고 옵니다. */
    lpHintTimer = setTimeout(() => $('hint').classList.add('on'), lpQuiet.matches ? 0 : 1200);
  }

  /* 창은 두 줄이 그 언어로 적힌 **뒤에** 엽니다. 아직 한국어가 적혀 있는 사이에
     열면 눌린 낱말을 표시할 상자가 없어서, 창만 뜨고 문장에는 아무 표시도 남지
     않습니다 — 0 에서 2 로 단숨에 내려갈 때 그렇게 됩니다. */
  /* 4·5 에서는 두 줄이 이미 물러났습니다. 그 사이에 말을 되돌려 놓으면 보이지
     않는 곳에서 글자만 바뀌므로, 영어인 채로 둡니다. */
  lpSetLang(state === 0 ? 'ko' : 'en', () => {
    if(lpState !== state) return;                 /* 그사이 장면이 또 넘어갔습니다 */
    if(state === 2) lpShowWordPeek('handles',2);
    else if(state === 3) lpOpenSentence(2);
    else { lpCloseWord(); lpCloseSentence(); }
  });
}

/* 무대 높이는 화면이 바뀔 때만 답니다. 그래서 스크롤이 부르는 일은 나눗셈
   하나로 끝나고(`lpApply` 는 장면이 바뀔 때만 움직입니다), 프레임을 기다릴
   것도 없습니다 — 뒤쪽 탭에서 열린 페이지는 `requestAnimationFrame` 이 앞으로
   나올 때까지 오지 않아서, 그동안 두 줄이 빈 채로 있게 됩니다. */
let lpStageH = 1;
function lpMeasure(){ lpStageH = $('stage').clientHeight || window.innerHeight || 1; }
function lpOnScroll(){ lpApply(Math.max(0, Math.min(5, Math.round(window.scrollY / lpStageH)))); }
window.addEventListener('scroll', lpOnScroll, {passive:true});
window.addEventListener('resize', () => {
  lpMeasure(); lpOnScroll();
  if(!$('word-peek').hidden) lpPlaceWordPeek();
  if(lpPanel().classList.contains('anchored')) lpPlaceWordDetail();
  lpPlaceSentence();
});
lpMeasure();
lpOnScroll();
const lpCarouselTrack = document.querySelector('.lp-carousel-track');
const lpCarouselSet = lpCarouselTrack?.querySelector('.lp-carousel-set');
if(lpCarouselSet){
  lpCarouselTrack.appendChild(lpCarouselSet.cloneNode(true));
  lpCarouselTrack.classList.add('ready');
}
