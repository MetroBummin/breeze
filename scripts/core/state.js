const LS_WORDS='breeze.words', LS_POS='breeze.pos', LS_FS='breeze.fs';
/* ?? 는 2020년 문법이라 오래된 태블릿 브라우저가 파일 전체를 못 읽습니다. 풀어서 씁니다. */
function load(k, d){ try{ const v = JSON.parse(localStorage.getItem(k)); return (v===null||v===undefined) ? d : v; }catch(e){ return d; } }
function save(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){ toast('저장 공간이 부족해요 (책이 너무 큼)'); } }
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
  if(currentReaderMode === 'original'){
    const original = captureOriginalAnchor();
    const previous = posOf(curBook.id);
    const measured = sourceProgressForBook(curBook,original);
    const logical = readerProgressAtEnd(measured==null ? previous.p||0 : measured);
    positions[curBook.id] = {...previous,
      p:logical, t:Date.now(), mode:'original',
      original:original || previous.original || null};
    save(LS_POS, positions);
    return;
  }
  const a = captureAnchor();
  const previous = posOf(curBook.id);
  const measured = textProgressForBook(curBook,a);
  const logical = readerProgressAtEnd(measured==null ? previous.p||0 : measured);
  positions[curBook.id] = {...previous, y:window.scrollY,
                            p:logical, t:Date.now(), mode:'text',
                            pi: a ? a.pi : null, dy: a ? a.dy : 0 };
  save(LS_POS, positions);
}
function show(v){
  saveReadingState();
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('on'));
  document.getElementById('v-'+v).classList.add('on');
  document.getElementById('nav-home').classList.toggle('on',
    v==='home' || v==='casuals' || v==='longform');
  document.getElementById('nav-vocab').classList.toggle('on', v==='vocab');
  if(v!=='read'){
    leaveOriginalReader();
    curBook=null; closePanel(); showReaderChrome();
  }
  document.body.classList.toggle('reading', v==='read');
  if(v==='home') renderHome();
  if(v==='casuals') renderCasualLibrary();
  if(v==='longform') renderLongformLibrary();
  if(v==='vocab') renderVocab();
  window.scrollTo(0,0);
}

/* ================= home ================= */
/* 예전에는 샘플 책 한 권(AI Hurtles Ahead)을 늘 목록 맨 앞에 끼워 넣었습니다.
   무료 고전 5종이 생긴 지금은 첫 화면을 채우는 일을 그쪽이 더 잘합니다 —
   샘플은 지울 수도 이름을 바꿀 수도 없는데, 고전은 진짜 내 책이 됩니다. */
const wcOf = b => b.paras.reduce((a,p)=>p.startsWith(IMG_MARK)?a:a+p.split(/\s+/).length,0);
const WAVE = (c1,op)=>`<svg class="wave" viewBox="0 0 300 90" preserveAspectRatio="none"><path d="M0 40 C55 15 105 55 160 30 C210 8 260 35 300 18 L300 90 L0 90Z" fill="${c1}" opacity="${op}"/></svg>`;
