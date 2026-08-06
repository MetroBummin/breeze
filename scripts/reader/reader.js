/* ================= reader ================= */
const WORD_RE = /([A-Za-z][A-Za-z'’-]*[A-Za-z]|[A-Za-z])/g;
const keyOf = raw => {
  const cands = lemmaCands(raw);
  return cands.find(c=>words[c]) || cands[0];
};
function looksHeading(p){
  return p.length<70 && !/[.!?:;,]$/.test(p) && p.split(' ').length<=10 && /^[A-Z0-9“"]/.test(p);
}
/* Render source text using formatting metadata without changing the source. */
function renderBookBody(b){
  // `tidy` is read-only compatibility for books saved by the previous version.
  const formatting = b.formatting || b.tidy || null;
  const rt = document.getElementById('rtext');
  rt.innerHTML='';
  const frag = document.createDocumentFragment();
  const PAGE_CHARS = 1700;
  let page=null, pageChars=0, pageNo=0, box=null, boxKind='';
  const newPage = ()=>{
    box = null; boxKind = '';
    if(page){
      const no = document.createElement('div');
      no.className='pageno'; no.textContent = '— '+pageNo+' —';
      frag.appendChild(no);
    }
    page = document.createElement('section');
    page.className='page';
    frag.appendChild(page);
    pageChars=0; pageNo++;
  };
  newPage();
  /* 반입할 때 이미 조립해 둔 블록을 순서대로 그리기만 합니다.
     예전처럼 문단마다 여섯 개의 판정 맵을 겹쳐 보지 않습니다. */
  const list = (formatting && Array.isArray(formatting.blocks))
    ? formatting.blocks
    : buildPlainBlocks(b.paras);
  list.forEach(bl=>{
    if(bl.r === 'img'){
      const fig = document.createElement('figure');
      const img = document.createElement('img');
      img.alt = '삽화';
      imgGet(bl.t.slice(IMG_MARK.length)).then(blob=>{
        if(blob) img.src = URL.createObjectURL(blob);
        else fig.remove();
      });
      fig.appendChild(img);
      page.appendChild(fig);
      pageChars += 400;
      box = null; boxKind = '';
      return;
    }
    const isHead = bl.r.charAt(0) === 'h';
    const lvl = isHead ? +bl.r.charAt(1) : 0;
    const inBox = bl.r === 'quote' || bl.r === 'note';
    // 상자 한가운데서 쪽이 넘어가면 상자가 두 동강 나므로, 상자 안에서는 쪽을 넘기지 않습니다
    const cont = inBox && box && boxKind === bl.g;
    if(!cont && bl.before === 'page' && pageChars > 0) newPage();
    else if(!cont && (pageChars >= PAGE_CHARS || (isHead && lvl <= 2 && pageChars > PAGE_CHARS*0.55))) newPage();
    /* 인용문·활동 상자는 본문과 다른 덩어리로 묶어 그립니다.
       원서에서 테두리 상자나 작은 글씨로 따로 조판되던 것들입니다. */
    if(inBox){
      if(!box || boxKind !== bl.g){
        box = document.createElement('aside');
        box.className = 'blk ' + bl.r;
        boxKind = bl.g;
        page.appendChild(box);
      }
    }else{ box = null; boxKind = ''; }
    const host = inBox && box ? box : page;
    const el = document.createElement(isHead ? (lvl===1?'h2':lvl===3?'h4':'h3') : 'p');
    if(bl.r === 'toc') el.classList.add('toc-entry');
    if(bl.before === 'section') el.classList.add('section-break');
    el.dataset.pi = bl.f;
    let html='', m, last=0;
    WORD_RE.lastIndex=0;
    const displayText = bl.v || bl.t;
    while((m=WORD_RE.exec(displayText))){
      html += esc(displayText.slice(last, m.index));
      const k = keyOf(m[0]);
      const st = words[k] ? ' s'+words[k].status : '';
      html += `<span class="w${st}" data-w="${k}">${esc(m[0])}</span>`;
      last = m.index + m[0].length;
    }
    html += esc(displayText.slice(last));
    el.innerHTML = html;
    host.appendChild(el);
    pageChars += bl.t.length;
  });
  const no = document.createElement('div');
  no.className='pageno'; no.textContent = '— '+pageNo+' —';
  frag.appendChild(no);
  rt.appendChild(frag);
}
async function openBook(b){
  if(typeof readerModeChangeToken!=='undefined') readerModeChangeToken++;
  if(typeof leaveOriginalReader==='function') leaveOriginalReader();
  curBook = b;
  currentReaderMode = 'text';
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('on'));
  document.getElementById('v-read').classList.add('on');
  document.getElementById('nav-home').classList.remove('on');
  document.getElementById('rtitle').textContent = b.title;
  document.body.classList.add('reading');
  document.body.classList.remove('reader-original');
  document.getElementById('readwrap').hidden=false;
  document.getElementById('originalwrap').hidden=true;
  renderBookBody(b);
  const initialPosition = posOf(b.id);
  const firstOpen = !initialPosition.t;
  positions[b.id] = {...initialPosition, t:Date.now()};
  save(LS_POS, positions);
  updateReaderModeControls();
  const original = b.builtin ? null : await originalGet(b.id);
  const desired = initialPosition.mode==='original'
    ? (original ? 'original' : 'text')
    : (firstOpen && original ? 'original' : 'text');
  if(desired==='original') await switchReaderMode('original',{initial:true});
  else requestAnimationFrame(()=>{
    const pos=posOf(b.id);
    if(!restoreAnchor(pos)) window.scrollTo(0,pos.y||0);
    lastAnchor=captureAnchor(); updatePfill();
  });
}
function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function updatePfill(){
  if(!curBook) return;
  const progress=typeof visibleReaderProgress==='function'
    ? visibleReaderProgress()
    : posOf(curBook.id).p||0;
  document.getElementById('pfill').style.width = Math.max(0,Math.min(100,progress*100))+'%';
}
let scrollTick = null, fadeTimer = null, readerScrollPauseUntil = 0;
function suspendReaderScrollSave(duration){
  readerScrollPauseUntil=Math.max(readerScrollPauseUntil,Date.now()+(duration||500));
  if(scrollTick){ clearTimeout(scrollTick); scrollTick=null; }
}
window.addEventListener('scroll', ()=>{
  if(!curBook) return;
  updatePfill();
  document.body.classList.add('scrolling');
  clearTimeout(fadeTimer);
  fadeTimer = setTimeout(()=>document.body.classList.remove('scrolling'), 900);
  if(Date.now()<readerScrollPauseUntil) return;
  if(scrollTick) return;
  const scheduledBook=curBook;
  const scheduledMode=currentReaderMode;
  scrollTick = setTimeout(()=>{
    scrollTick=null;
    if(!curBook || curBook!==scheduledBook || currentReaderMode!==scheduledMode
        || Date.now()<readerScrollPauseUntil) return;
    saveReadingState();
    if(currentReaderMode==='text') lastAnchor = captureAnchor();
  }, 800);
});

document.getElementById('rtext').addEventListener('click', e=>{
  const span = e.target.closest('.w');
  if(!span) return;
  const k = span.dataset.w;
  if(words[k]){
    if(words[k].status < 3) setStatus(k, words[k].status + 1);
    selectWord(k, span);
  }else{
    addWord(k, span);
  }
});
