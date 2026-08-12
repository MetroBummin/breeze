/* ================= 화면의 말 =================
 *
 * 이 앱은 처음부터 두 언어로 말해 왔습니다. 안내문·설명은 한국어인데, 눈에 가장
 * 먼저 들어오는 제목만 영어였습니다("Where shall we read?", "Casuals", "Books").
 * 그건 취향이지 규칙이 아니었고, 한국어로 읽고 싶은 사람에게는 고를 방법이
 * 없었습니다. 설정에서 언어를 고르면 그 제목들이 함께 바뀝니다.
 *
 * 여기서 바뀌는 것은 **앱이 스스로 하는 말**뿐입니다. 읽는 글도, 단어 뜻도,
 * 사전이 주는 설명도 건드리지 않습니다 — 그건 언어 설정이 아니라 내용입니다.
 *
 * 글꼴: 한국어를 고르면 로고와 같은 결의 한글 글꼴(고운바탕)을 그때 받아옵니다.
 * 영어로 두는 사람은 이 요청을 하지 않습니다. Fraunces 가 스택 맨 앞에 남아
 * 있으므로 로마자는 지금까지와 똑같이 Fraunces 로 찍힙니다 — 한글만 넘어갑니다.
 */
const LS_LANG = 'breeze.lang';
const KO_DISPLAY_FONT = 'https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap';

const I18N_STRINGS = {
  en: {
    'nav.home':'Home',
    'nav.words':'Words',
    'nav.settings':'Settings',
    'home.q':'Where shall we read?',
    'greet.night':'GOOD NIGHT',
    'greet.morning':'GOOD MORNING',
    'greet.afternoon':'GOOD AFTERNOON',
    'greet.evening':'GOOD EVENING',
    'sec.casuals':'Casuals',
    'sec.books':'Books',
    'settings.title':'Settings',
    'settings.tab.general':'General',
    'settings.tab.signin':'Sign in',
    'settings.tab.sync':'Devices',
    'settings.language':'Language',
    'settings.language.note':'Headings only.',
    'settings.dark':'Dark mode',
  },
  ko: {
    'nav.home':'책장',
    'nav.words':'단어장',
    'nav.settings':'설정',
    'home.q':'오늘은 무엇을 읽어 볼까요?',
    'greet.night':'좋은 밤이에요',
    'greet.morning':'좋은 아침이에요',
    'greet.afternoon':'좋은 오후예요',
    'greet.evening':'좋은 저녁이에요',
    'sec.casuals':'가벼운 글',
    'sec.books':'긴 글',
    'settings.title':'설정',
    'settings.tab.general':'일반',
    'settings.tab.signin':'로그인',
    'settings.tab.sync':'다른 기기와 연결하기',
    'settings.language':'언어',
    'settings.language.note':'표지 문구만 바뀝니다.',
    'settings.dark':'다크 모드',
  },
};

/* 기본값은 한국어입니다. 이 앱을 쓰는 사람은 영어 원서를 읽는 한국인이고,
   뜻풀이도 AI 설명도 한국어로 나옵니다 — 표지만 영어인 것이 오히려 예외였습니다.
   영어 표지를 좋아하는 사람은 설정에서 한 번 고르면 됩니다. */
let uiLang = load(LS_LANG, 'ko');
if(!I18N_STRINGS[uiLang]) uiLang = 'ko';

/** @param {string} key */
function tr(key){
  const table = I18N_STRINGS[uiLang] || I18N_STRINGS.en;
  const word = table[key];
  return word === undefined ? (I18N_STRINGS.en[key] || key) : word;
}

function ensureKoreanDisplayFont(){
  if(document.getElementById('ko-display-font')) return;
  const link = document.createElement('link');
  link.id = 'ko-display-font';
  link.rel = 'stylesheet';
  link.href = KO_DISPLAY_FONT;
  document.head.appendChild(link);
}

/* 화면에 이미 붙어 있는 글자를 다시 씁니다. `data-i18n` 이 달린 곳만 바꾸므로,
   같은 자리에 다른 말을 넣고 싶으면 HTML 한 곳만 고치면 됩니다. */
function applyI18n(){
  const targets = /** @type {NodeListOf<HTMLElement>} */
    (document.querySelectorAll('[data-i18n]'));
  targets.forEach(el => {
    const key = el.dataset.i18n;
    if(key) el.textContent = tr(key);
  });
  /* `<html lang>` 은 건드리지 않습니다. 그건 "이 페이지에 담긴 글의 언어"고,
     여기서 고르는 것은 "앱이 나에게 말을 거는 언어"입니다 — 다른 이야기입니다. */
  document.body.classList.toggle('lang-ko', uiLang === 'ko');
  if(uiLang === 'ko') ensureKoreanDisplayFont();
  const buttons = /** @type {NodeListOf<HTMLElement>} */
    (document.querySelectorAll('#set-lang button'));
  buttons.forEach(button => button.classList.toggle('on', button.dataset.lang === uiLang));
  /* 동기화 표시(✓)는 로그인 상태를 담고 있어서 위 루프가 덮으면 안 됩니다.
     이름표를 쓰는 일은 저쪽 함수 하나에만 맡깁니다 — scripts/sync/sync.js */
  if(typeof syncBadge === 'function') syncBadge();
  settingsSyncTabLabel();
}

/* 설정의 두 번째 탭은 로그인 전에는 "로그인"입니다. 거기서 할 수 있는 일이
   그것 하나뿐이기 때문입니다 — "다른 기기와 연결하기"라고 적어 두면 눌러 놓고
   기기를 찾다가 로그인 화면을 만납니다. sbUser 는 이 파일보다 늦게 실행되는
   sync.js 의 let 이라, 아직 초기화 전이면 읽는 것만으로 던집니다(TDZ). */
function settingsSyncTabLabel(){
  const tab = document.getElementById('set-tab-sync');
  if(!tab) return;
  let signedIn = false;
  try{ signedIn = !!sbUser; }catch(error){}
  tab.textContent = tr(signedIn ? 'settings.tab.sync' : 'settings.tab.signin');
}

/** @param {string} next */
function setLang(next){
  if(!I18N_STRINGS[next] || next === uiLang) return;
  uiLang = next;
  save(LS_LANG, next);
  applyI18n();
  /* 카드와 인사말은 그리는 순간 말이 정해집니다. 지금 보고 있는 화면만 다시
     그립니다 — 안 보이는 화면은 다음에 열릴 때 새 말로 그려집니다. */
  if(typeof renderHome === 'function' && document.getElementById('v-home').classList.contains('on')) renderHome();
  if(typeof renderCasualLibrary === 'function' && document.getElementById('v-casuals').classList.contains('on')) renderCasualLibrary();
  if(typeof renderLongformLibrary === 'function' && document.getElementById('v-longform').classList.contains('on')) renderLongformLibrary();
}

applyI18n();
