const LS_WORDS='breeze.words', LS_BOOKS='breeze.books', LS_POS='breeze.pos', LS_FS='breeze.fs';
/* ?? 는 2020년 문법이라 오래된 태블릿 브라우저가 파일 전체를 못 읽습니다. 풀어서 씁니다. */
function load(k, d){ try{ const v = JSON.parse(localStorage.getItem(k)); return (v===null||v===undefined) ? d : v; }catch(e){ return d; } }
function save(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){ toast('저장 공간이 부족해요 (책이 너무 큼)'); } }
const LS_DEAD='breeze.dead';
let words = load(LS_WORDS, {});
let dead = load(LS_DEAD, {});
let books = [];                       // 본문은 IndexedDB에 저장(부팅 시 로드)
async function loadBooks(){
  books = (await bookAll()).sort((a,b)=>(b.addedAt||0)-(a.addedAt||0));
  const legacy = load(LS_BOOKS, []);   // 예전 버전이 localStorage에 넣어둔 책 이전
  if(legacy && legacy.length){
    for(const b of legacy){ if(!books.some(x=>x.id===b.id)){ await bookPut(b); books.push(b); } }
    try{ localStorage.removeItem(LS_BOOKS); }catch(e){}
    books.sort((a,b)=>(b.addedAt||0)-(a.addedAt||0));
  }
  // Older releases keyed books only by their importer-specific ID. Persist a
  // paragraph-boundary-independent fingerprint for reliable server matching.
  for(const book of books){
    const previousFingerprint = book.fingerprint || '';
    ensureBookFingerprint(book);
    if(book.fingerprint !== previousFingerprint) await bookPut(book);
  }
}
let positions = load(LS_POS, {});   // bookId -> {y, p(0~1), t(lastOpened)}
let curBook = null, selKey = null;
const saveWords = () => save(LS_WORDS, words);
const posOf = id => {
  let v = positions[id];
  if(typeof v === 'number') v = {y:v, p:0, t:0};   // migrate from v1 format
  return v || {y:0, p:0, t:0};
};

/* ================= views ================= */
/* ===== 스크롤 앵커 =====
   브라우저는 스크롤을 "위에서 몇 px"로만 기억합니다. 그래서 글 폭·글자 크기가
   바뀌면(집중 모드, A+/A−, 화면 회전) 같은 px이 다른 문장을 가리키게 됩니다.
   그래서 위치를 "몇 번째 문단이 화면 위에서 몇 px 떨어져 있었는지"로 기억합니다. */
function topInset(){
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h'));
  return (isNaN(v) ? 0 : v) + 8;
}
function captureAnchor(){
  if(!curBook) return null;
  const y = topInset() + 4;
  let el = null;
  try{ el = document.elementFromPoint(Math.round(window.innerWidth/2), y); }catch(e){}
  el = el && el.closest ? el.closest('[data-pi]') : null;
  if(!el){                                    // 예비: 화면 위쪽에 걸친 첫 문단을 찾는다
    const nodes = document.querySelectorAll('#rtext [data-pi]');
    for(const n of nodes){ if(n.getBoundingClientRect().bottom > y){ el = n; break; } }
  }
  if(!el) return null;
  return { pi: +el.dataset.pi, dy: Math.round(el.getBoundingClientRect().top) };
}
function restoreAnchor(a){
  if(!a || a.pi == null) return false;
  const el = document.querySelector(`#rtext [data-pi="${a.pi}"]`);
  if(!el) return false;
  window.scrollTo(0, Math.max(0, window.scrollY + el.getBoundingClientRect().top - (a.dy||0)));
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
  const doc = document.documentElement;
  const max = Math.max(1, doc.scrollHeight - window.innerHeight);
  const a = captureAnchor();
  positions[curBook.id] = { y:window.scrollY, p:Math.min(1, window.scrollY/max), t:Date.now(),
                            pi: a ? a.pi : null, dy: a ? a.dy : 0 };
  save(LS_POS, positions);
}
function show(v){
  saveReadingState();
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('on'));
  document.getElementById('v-'+v).classList.add('on');
  document.getElementById('nav-home').classList.toggle('on', v==='home');
  document.getElementById('nav-vocab').classList.toggle('on', v==='vocab');
  if(v!=='read'){ curBook=null; closePanel(); toggleFocus(false); }
  document.body.classList.toggle('reading', v==='read');
  if(v==='home') renderHome();
  if(v==='vocab') renderVocab();
  window.scrollTo(0,0);
}

/* ================= home ================= */
function allBooks(){ return [DEMO_BOOK, ...books]; }
const wcOf = b => b.paras.reduce((a,p)=>p.startsWith(IMG_MARK)?a:a+p.split(/\s+/).length,0);
const WAVE = (c1,op)=>`<svg class="wave" viewBox="0 0 300 90" preserveAspectRatio="none"><path d="M0 40 C55 15 105 55 160 30 C210 8 260 35 300 18 L300 90 L0 90Z" fill="${c1}" opacity="${op}"/></svg>`;
