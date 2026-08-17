/* ================= 랜딩 =================
 *
 * 이 파일은 앱과 아무것도 나눠 갖지 않습니다. 앱의 사전도, 저장소도, 손짓
 * 판정기도 부르지 않습니다 — 여기 있는 것은 아래 상자에 적어 둔 낱말 넷과
 * 문장 둘이 전부이고, 서버로 나가는 요청은 하나도 없습니다.
 *
 * 그런데 화면에 뜨는 창은 진짜 그 창입니다. 단어창도 시트도 문장 창도 앱의
 * CSS 를 그대로 링크해서 씁니다(index.html). 랜딩에서 눌러 본 방식이 앱에서
 * 그대로 통해야 하므로, 손짓의 기준도 앱과 같은 수를 씁니다:
 *
 *     꾹 누르기 1000ms · 흔들림 10px   (scripts/reader/gesture.js 의
 *                                       GESTURE_HOLD_MS · GESTURE_SLOP)
 *
 * 장면 넷은 스크롤이 넘겨 줍니다. 스크롤이 하는 일은 `body[data-state]` 한
 * 글자를 바꾸는 것뿐이고, 2·3 은 시연이 아니라 **이미 끝난 순간**입니다 —
 * 커서가 움직이지도, 창이 열리는 과정을 보여 주지도 않습니다.
 */

/* ---- 이 페이지가 아는 전부 ---- */
const LP_WORDS = {
  focus:{ line:1, word:'Focus', ko:'집중하다', pos:'v.',
    note:'여기서는 "다른 데 가지 말고 이야기 쪽으로 마음을 모으다"로 쓰였어요.',
    alts:['집중하다','초점을 맞추다','주목하다'],
    defs:[['v.','to give all your attention to one thing'],
          ['n.','the centre of attention']] },
  story:{ line:1, word:'story', ko:'이야기', pos:'n.',
    note:'책이 들려주는 줄거리 자체를 가리켜요.',
    alts:['이야기','줄거리','소설'],
    defs:[['n.','a description of events, real or imagined'],
          ['n.','a report in a newspaper']] },
  handle:{ line:2, word:'handle', ko:'알아서 처리하다', pos:'v.',
    note:'여기서는 "네가 신경 쓰지 않아도 대신 맡는다"는 뜻으로 쓰였어요.',
    alts:['처리하다','다루다','손잡이'],
    defs:[['v.','to deal with a situation or a task'],
          ['n.','the part of a thing you hold']] },
  rest:{ line:2, word:'rest', ko:'나머지', pos:'n.',
    note:'앞에서 말한 것을 뺀 남은 전부를 가리켜요.',
    alts:['나머지','휴식','쉬다'],
    defs:[['n.','the remaining part of something'],
          ['v.','to stop working for a while']] },
};
/* 문장의 한국어는 이 페이지가 이미 쓴 그 두 줄입니다 — 여기서 새로 지어낸 말은
   없습니다. */
const LP_SENTS = {
  1:{ en:'Focus on the story.', ko:'이야기에 집중하세요.',
      points:['focus on ~ 은 "~에 마음을 모으다"로 굳어진 짝이에요.',
              'the story 는 지금 읽고 있는 그 이야기를 가리켜요.'] },
  2:{ en:'Breeze will handle the rest.', ko:'나머지는 Breeze가 할게요.',
      points:['handle 은 여기서 "알아서 맡아 처리하다"에 가까워요.',
              'the rest 는 앞에서 말한 것을 뺀 나머지 전부예요.'] },
};
/* 눌러서 뜻을 볼 수 있는 낱말만 상자로 감쌉니다. 읽는 화면에서는 모든 낱말이
   상자지만, 이 페이지가 가진 사전은 위의 넷뿐이라 누를 곳과 누를 수 없는 곳을
   말과 어긋나게 두지 않습니다. */
const LP_COPY = {
  ko:{ a1:'이야기에 집중하세요.', a2:'나머지는 ', b2:'가 할게요.' },
  en:{ a1:'<span class="w" data-w="focus">Focus</span> on the ' +
          '<span class="w" data-w="story">story</span>.',
       a2:'',
       b2:' will <span class="w" data-w="handle">handle</span> the ' +
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
    then();
  };
  if(first || lpQuiet.matches){ write(); return; }
  document.body.classList.add('lp-swap');
  setTimeout(() => { write(); document.body.classList.remove('lp-swap'); }, 320);
}

/* ================= 단어창 ================= */

const lpPanel = () => $('panel'), lpBg = () => $('sheetbg');

function lpCloseWord(){
  lpPanel().classList.remove('on');
  lpBg().classList.remove('on');
  document.querySelectorAll('.w.sel').forEach(node => node.classList.remove('sel'));
}

function lpOpenWord(key){
  const entry = LP_WORDS[key];
  if(!entry) return;
  lpCloseSentence();
  $('p-word').textContent = entry.word;
  $('p-ai').className = 'on';
  $('p-ai-ko').textContent = entry.ko;
  $('p-ai-pos').textContent = entry.pos;
  $('p-ai-note').textContent = entry.note;
  $('p-ai-saved').hidden = true;
  $('p-alt-sec').classList.add('on');
  const alts = $('p-alts');
  alts.classList.add('on');
  alts.innerHTML = entry.alts.map(meaning =>
    '<button type="button" class="kochip' + (meaning === entry.ko ? ' on' : '') +
    '">' + meaning + '</button>').join('');
  [...alts.querySelectorAll('.kochip')].forEach(chip =>
    chip.addEventListener('click', () => lpPickMeaning(key, chip.textContent)));
  $('p-defs').innerHTML = entry.defs.map(([pos, text]) =>
    '<div><span class="pos">' + pos + '</span>' + text + '</div>').join('');
  $('p-ex').textContent = LP_SENTS[entry.line].en;

  document.querySelectorAll('.w').forEach(node =>
    node.classList.toggle('sel', node.dataset.w === key));
  lpPanel().classList.add('on');
  lpBg().classList.add('on');
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
  lpToast('✓ 단어장에 저장했어요');
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
  document.querySelectorAll('.lp-sentence.cued').forEach(node => node.classList.remove('cued'));
}

function lpOpenSentence(n){
  const sentence = LP_SENTS[n];
  lpCloseWord();
  $('ps-en').textContent = sentence.en;
  $('ps-ko').textContent = sentence.ko;
  const points = $('ps-points');
  points.innerHTML = '';
  sentence.points.forEach(line => {
    const item = document.createElement('li');
    item.textContent = line;
    points.appendChild(item);
  });
  $('sentence-modal').hidden = false;
  document.querySelectorAll('.lp-sentence').forEach(node =>
    node.classList.toggle('cued', node.dataset.s === String(n)));
}

/* ================= 손짓 =================
   앱과 같은 판정입니다 — 제자리에서 떼면 낱말, 제자리에서 오래 누르고 있으면
   문장, 손가락이 움직였으면 읽는 중입니다. 시간과 흔들림의 값도 앱과 같습니다.
   판정하는 자리를 여기 하나로 두는 것도 같습니다: 문장 조각마다 따로 듣지 않고
   문장 하나가 통째로 듣습니다. */
const LP_HOLD_MS = 1000, LP_SLOP = 10;

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
    if(word) lpOpenWord(word.dataset.w);
  });
  /* 안드로이드는 꾹 누르면 제 메뉴를 엽니다. 이 자리에서 꾹 누르는 것은
     문장을 물어보는 일이라 그 메뉴는 오지 않습니다. */
  sentence.addEventListener('contextmenu', event => event.preventDefault());
});

/* 닫는 길은 앱과 같은 자리입니다 — 시트 뒤의 판, 옆 칸의 ✕, 문장 창의 ✕와
   그 바깥. 랜딩이 새로 만든 문은 없습니다. */
$('sheetbg').addEventListener('click', lpCloseWord);
$('p-close').addEventListener('click', lpCloseWord);
$('ps-close').addEventListener('click', lpCloseSentence);
$('sentence-scrim').addEventListener('click', lpCloseSentence);
document.addEventListener('keydown', event => {
  if(event.key !== 'Escape') return;
  lpCloseSentence(); lpCloseWord();
});

/* ================= 네 장면 =================
   스크롤은 장면을 고르기만 합니다. 고른 뒤에 벌어지는 일은 위의 함수들이고,
   그 함수들은 사용자가 직접 눌렀을 때 부르는 것과 똑같은 것들입니다. */
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
  lpSetLang(state === 0 ? 'ko' : 'en', () => {
    if(lpState !== state) return;                 /* 그사이 장면이 또 넘어갔습니다 */
    if(state === 2) lpOpenWord('handle');
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
function lpOnScroll(){ lpApply(Math.max(0, Math.min(3, Math.round(window.scrollY / lpStageH)))); }
window.addEventListener('scroll', lpOnScroll, {passive:true});
window.addEventListener('resize', () => { lpMeasure(); lpOnScroll(); });
lpMeasure();
lpOnScroll();
