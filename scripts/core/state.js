const LS_WORDS='breeze.words', LS_POS='breeze.pos', LS_FS='breeze.fs';
/* ?? 는 2020년 문법이라 오래된 태블릿 브라우저가 파일 전체를 못 읽습니다. 풀어서 씁니다. */
function load(k, d){ try{ const v = JSON.parse(localStorage.getItem(k)); return (v===null||v===undefined) ? d : v; }catch(e){ return d; } }

/* 저장에 실패해도 하던 일은 막지 않습니다. 단어를 담다가 모달이 뜨면 읽기가
   끊기는데, 그게 더 나쁩니다. 대신 무엇을 못 지켰는지는 정확히 말합니다 —
   예전에는 무엇이 실패했든 "책이 너무 큼"이라고 했습니다.

   읽는 위치는 조용히 흘려보냅니다. 스크롤할 때마다 저장하므로, 공간이 찬
   상태에서 알렸다가는 읽는 내내 몇 초마다 토스트가 뜹니다. 그리고 위치를
   잃는 것은 단어장을 잃는 것과 무게가 다릅니다. */
const SAVE_FAIL_NAMES = {
  'breeze.words': '단어장을 이 기기에 저장하지 못했어요',
  'breeze.dead':  '단어장을 이 기기에 저장하지 못했어요',
};
const SAVE_FAIL_QUIET = new Set(['breeze.pos']);
let lastSaveWarnAt = 0;
function save(k, v){
  try{ localStorage.setItem(k, JSON.stringify(v)); return true; }
  catch(e){
    console.warn('저장 실패:', k, e && e.name);
    if(SAVE_FAIL_QUIET.has(k)) return false;
    /* 한 번 차면 이어지는 저장도 줄줄이 실패합니다. 같은 말을 반복하지 않습니다. */
    if(Date.now() - lastSaveWarnAt < 5*60*1000) return false;
    lastSaveWarnAt = Date.now();
    const what = SAVE_FAIL_NAMES[k] || '방금 한 변경을 이 기기에 저장하지 못했어요';
    /* 로그인은 고치는 방법이지 잔소리가 아닙니다 — 서버에 있으면 기기가 차도 남습니다.
       sbUser 는 이 파일보다 늦게 실행되는 sync.js 의 let 이라, 아직 초기화 전이면
       읽는 것만으로 던집니다(TDZ). 로그인 여부는 곁가지이므로 조용히 넘깁니다. */
    let signedIn = false;
    try{ signedIn = !!sbUser; }catch(e){}
    toast(what + (signedIn ? ' (서버 사본은 남아 있어요)' : '. 로그인하면 서버에 백업돼요'));
    return false;
  }
}
const LS_DEAD='breeze.dead';
let words = load(LS_WORDS, {});
let dead = load(LS_DEAD, {});
let books = [];                       // 본문은 IndexedDB에 저장(부팅 시 로드)
/* 부팅할 때마다 돌던 옛 판 변환들(localStorage 에 있던 책 옮기기, AI 조판
   결과 `tidy` 를 `formatting` 으로 옮기기, `readerSchema` 찍기)은 뗐습니다.
   한 번 돌고 끝났어야 할 일이 영구 코드가 되어 있었습니다.

   지문만 남깁니다. 이건 변환이 아니라 서버와 짝을 맞추는 열쇠라, 어떤
   경로로 들어온 책이든 있어야 합니다. */
async function loadBooks(){
  books = (await bookAll()).sort((a,b)=>(b.addedAt||0)-(a.addedAt||0));
  for(const book of books){
    const previousFingerprint = book.fingerprint || '';
    ensureBookFingerprint(book);
    if(book.fingerprint !== previousFingerprint) await bookPut(book);
  }
}
let positions = load(LS_POS, {});   // bookId -> text anchor + original source anchor
let curBook = null, selKey = null;
const saveWords = () => save(LS_WORDS, words);
const posOf = id => positions[id] || {y:0, p:0, t:0, mode:'text', original:null};

/* ================= views ================= */
/* ===== 스크롤 앵커 =====
   브라우저는 스크롤을 "위에서 몇 px"로만 기억합니다. 그래서 글 폭·글자 크기가
   바뀌면(좌우 여백, A+/A−, 화면 회전) 같은 px이 다른 문장을 가리키게 됩니다.
   그래서 위치를 "몇 번째 문단이 화면 위에서 몇 px 떨어져 있었는지"로 기억합니다. */
function topInset(){
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h'));
  return (isNaN(v) ? 0 : v) + 8;
}
/* ---- 문단 목록은 한 번만 셉니다 ----
   그린 뒤로 `[data-pi]` 의 개수와 차례는 그대로입니다. 눈앞의 문단에 낱말 상자가
   붙었다 떨어져도(`hydrateWordSpanBatch`) 문단 자체는 그 자리에 남습니다.
   새 책을 그리면 `#rtext` 안이 통째로 갈리므로, 담아 둔 첫 문단이 문서에서
   떨어져 나간 것으로 그것을 압니다. */
let readerParagraphCache = null;
function readerParagraphs(){
  if(readerParagraphCache && readerParagraphCache.length && readerParagraphCache[0].isConnected)
    return readerParagraphCache;
  readerParagraphCache = [...document.querySelectorAll('#rtext [data-pi]')];
  return readerParagraphCache;
}
/* ---- 예비 길은 반으로 접어 찾습니다 ----
   `elementFromPoint` 는 자주 빗나갑니다. 재는 점이 문단 사이 여백이나 쪽 상자의
   안쪽 여백, 쪽 번호 줄에 떨어지면 문단이 안 잡히고, 낱말 창·문장 해석 창이 떠
   있으면 그 창이 잡힙니다. 400쪽짜리 책의 한가운데에서 세어 보면 스크롤 위치
   열 중 셋이 빗나갔습니다.
   예전의 예비 길은 그때마다 책 첫 문단부터 훑으며 자리를 쟀습니다. 2000번째
   문단을 읽고 있으면 한 번에 2000번, 그것을 한 프레임에 두 번(진행줄 · 앵커)
   했습니다. 눈앞의 문단이 다시 조립되며 배치가 더러워진 직후라 그 2000번은
   전부 강제 재배치였습니다 — 읽을수록 무거워지고, 책 뒤쪽에서는 손가락을 밀어도
   화면이 따라오지 못했습니다.
   문단은 위에서 아래로 한 줄로 흐르므로 자리는 늘 오름차순입니다. 반으로 접어
   찾으면 3450개짜리 책도 열두 번이면 끝납니다 — 원본 쪽·요소를 찾을 때 쓰는
   `firstElementBelow` 와 같은 셈법입니다. */
function captureAnchor(){
  if(!curBook) return null;
  const y = topInset() + 4;
  let el = null;
  try{ el = document.elementFromPoint(Math.round(window.innerWidth/2), y); }catch(e){}
  el = el && el.closest ? el.closest('[data-pi]') : null;
  if(!el){                                    // 예비: 화면 위쪽에 걸친 첫 문단을 찾는다
    const list = readerParagraphs();
    el = list.length ? firstElementBelow(list, y) : null;
  }
  if(!el) return null;
  return { pi: +el.dataset.pi, dy: Math.round(el.getBoundingClientRect().top) };
}
/* ---- 같은 자를 한 프레임에 두 번 대지 않습니다 ----
   `captureAnchor()` 는 `elementFromPoint` 로 배치를 강제로 다시 계산하게 만듭니다.
   그런데 스크롤 한 프레임 안에서 그 답을 원하는 곳이 둘이었습니다 — 진행줄
   (`updatePfill` → `visibleReaderProgress`)과 읽던 자리 기억(`lastAnchor`).
   둘은 같은 순간의 같은 화면을 물어보면서 각자 쟀습니다. 계측으로 확인한 값이
   프레임당 2.04회였고, 그중 정확히 절반이 헛일이었습니다.

   재는 것은 한 번, 답은 나눠 씁니다. 화면이 실제로 움직였을 때만 다시 잽니다 —
   시계로 만료시키지 않습니다. 무엇이 화면을 움직이는지는 우리가 압니다:
   스크롤과 크기 변화, 그리고 우리가 옮긴 자리. */
let frameAnchorValue = null, frameAnchorValid = false;
function invalidateReaderMeasurements(){ frameAnchorValid = false; }
function readerFrameAnchor(){
  if(!frameAnchorValid){ frameAnchorValue = captureAnchor(); frameAnchorValid = true; }
  return frameAnchorValue;
}
function restoreAnchor(a){
  if(!a || a.pi == null) return false;
  const el = document.querySelector(`#rtext [data-pi="${a.pi}"]`);
  if(!el) return false;
  /* 스크롤하는 것은 문서가 아니라 읽는 칸입니다 — scripts/reader/reader-scroll.js */
  readerScrollTo(readerScrollTop() + el.getBoundingClientRect().top - (a.dy||0));
  updatePfill();
  return true;
}
/* 레이아웃을 바꾸는 동작을 이 함수로 감싸면 보던 문장이 제자리에 남습니다 */
function keepPlace(fn){
  const a = captureAnchor();
  fn();
  if(!a) return;
  requestAnimationFrame(()=>requestAnimationFrame(()=>restoreAnchor(a)));
}

function saveReadingState(){
  if(!curBook) return;
  if(currentReaderMode === 'original'){
    const original = captureOriginalAnchor();
    const previous = posOf(curBook.id);
    const measured = sourceProgressForBook(curBook,original);
    const logical = readerProgressAtEnd(measured==null ? previous.p||0 : measured);
    positions[curBook.id] = {...previous,
      p:logical, t:Date.now(), mode:'original',
      original:original || previous.original || null};
    save(LS_POS, positions);
    if(typeof queueReadingProgressSync==='function') queueReadingProgressSync();
    return;
  }
  const a = readerFrameAnchor();
  const previous = posOf(curBook.id);
  const measured = textProgressForBook(curBook,a);
  const logical = readerProgressAtEnd(measured==null ? previous.p||0 : measured);
  positions[curBook.id] = {...previous, y:readerScrollTop(),
                            p:logical, t:Date.now(), mode:'text',
                            pi: a ? a.pi : null, dy: a ? a.dy : 0 };
  save(LS_POS, positions);
  if(typeof queueReadingProgressSync==='function') queueReadingProgressSync();
}
let appHistoryReady=false, appHistoryRestoring=false;
function activeAppView(){
  const view=document.querySelector('.view.on');
  return view ? view.id.replace(/^v-/,'') : 'home';
}
function rememberAppView(view,replace){
  if(appHistoryRestoring) return;
  const state={breeze:true,view:view||activeAppView()};
  if(replace) history.replaceState(state,'');
  else history.pushState(state,'');
}
function show(v,options){
  const settings=options||{};
  saveReadingState();
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('on'));
  document.getElementById('v-'+v).classList.add('on');
  document.getElementById('nav-home').classList.toggle('on',
    v==='home' || v==='casuals' || v==='longform');
  document.getElementById('nav-vocab').classList.toggle('on', v==='vocab');
  if(v!=='read'){
    leaveOriginalReader();
    curBook=null; closePanel(); showReaderChrome();
    /* 벌린 것은 종이였습니다. 두고 나갑니다 — scripts/reader/reader-scroll.js */
    resetOriginalZoom();
  }
  /* 읽는 동안에는 문서가 아니라 읽는 칸이 스크롤합니다. `html` 에도 같은 표를
     붙여야 문서 쪽 스크롤이 잠깁니다 — `body` 만 잠그면 아이폰에서 문서가
     여전히 고무줄처럼 늘어납니다 (styles/reader.css 의 "읽는 동안의 셸"). */
  document.body.classList.toggle('reading', v==='read');
  document.documentElement.classList.toggle('reading', v==='read');
  if(v==='home') renderHome();
  if(v==='casuals') renderCasualLibrary();
  if(v==='longform') renderLongformLibrary();
  if(v==='vocab') renderVocab();
  window.scrollTo(0,0);
  const box = readerScroller();
  if(box && v!=='read'){ box.scrollTop = 0; box.scrollLeft = 0; }
  if(typeof syncLoginNudge==='function') syncLoginNudge();
  if(appHistoryReady && !settings.fromHistory) rememberAppView(v,!!settings.replace);
}

/* 뒤로가기는 먼저 앱 안의 가장 가까운 층(단어창·설정)을 닫고, 그 다음에 화면을
   되돌립니다. 그래서 Google에서 들어온 사람도 책을 읽다 한 번 뒤로 갔다고 곧장
   바깥 사이트로 나가지 않습니다. */
window.addEventListener('popstate',event=>{
  const panel=document.getElementById('panel');
  if(panel&&panel.classList.contains('on')){ closePanel(); return; }
  const settingsModal=document.getElementById('settings-modal');
  if(settingsModal&&settingsModal.classList.contains('on')){ closeSettings(); return; }
  const target=event.state&&event.state.breeze ? event.state.view : 'home';
  show(target,{fromHistory:true});
});
/* 첫 기록을 Breeze의 홈으로 바꿔 둡니다. 이후 앱 안에서 이동할 때만 새 기록을
   쌓으므로, 홈에서 뒤로가기는 원래 방문한 사이트로 자연스럽게 나갑니다. */
history.replaceState({breeze:true,view:activeAppView()},'');
appHistoryReady=true;

/* ================= home ================= */
/* 예전에는 샘플 책 한 권(AI Hurtles Ahead)을 늘 목록 맨 앞에 끼워 넣었습니다.
   무료 고전 5종이 생긴 지금은 첫 화면을 채우는 일을 그쪽이 더 잘합니다 —
   샘플은 지울 수도 이름을 바꿀 수도 없는데, 고전은 진짜 내 책이 됩니다. */
const wcOf = b => b.paras.reduce((a,p)=>p.startsWith(IMG_MARK)?a:a+p.split(/\s+/).length,0);
const WAVE = (c1,op)=>`<svg class="wave" viewBox="0 0 300 90" preserveAspectRatio="none"><path d="M0 40 C55 15 105 55 160 30 C210 8 260 35 300 18 L300 90 L0 90Z" fill="${c1}" opacity="${op}"/></svg>`;
