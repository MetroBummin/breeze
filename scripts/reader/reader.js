/* ================= reader ================= */
const WORD_RE = /([A-Za-z][A-Za-z'’-]*[A-Za-z]|[A-Za-z])/g;
const keyOf = raw => {
  const cands = lemmaCands(raw);
  return cands.find(c=>words[c]) || cands[0];
};
function looksHeading(p){
  return p.length<70 && !/[.!?:;,]$/.test(p) && p.split(' ').length<=10 && /^[A-Z0-9“"]/.test(p);
}
/* 글자를 단어 단위로 감쌉니다. 글자 화면과 쇼츠가 같은 함수를 씁니다. */
function wordSpans(text){
  let html = '', match, last = 0;
  WORD_RE.lastIndex = 0;
  while((match = WORD_RE.exec(text))){
    html += esc(text.slice(last, match.index));
    const key = keyOf(match[0]);
    const status = words[key] ? ' s'+words[key].status : '';
    html += `<span class="w${status}" data-w="${key}">${esc(match[0])}</span>`;
    last = match.index + match[0].length;
  }
  return html + esc(text.slice(last));
}
/* Render source text using formatting metadata without changing the source. */
function renderBookBody(b){
  const formatting = b.formatting || null;
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
      bookImageBlob(b, bl.t.slice(IMG_MARK.length)).then(blob=>{
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
    el.innerHTML = wordSpans(bl.v || bl.t);
    host.appendChild(el);
    pageChars += bl.t.length;
  });
  const no = document.createElement('div');
  no.className='pageno'; no.textContent = '— '+pageNo+' —';
  frag.appendChild(no);
  rt.appendChild(frag);
}
async function openBook(b){
  readerModeChangeToken++;
  leaveOriginalReader();
  /* The width observer below fires as the reader appears. It must not aim at
     wherever the previous book was being read. */
  lastAnchor = null;
  curBook = b;
  currentReaderMode = 'text';
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('on'));
  document.getElementById('v-read').classList.add('on');
  document.getElementById('nav-home').classList.remove('on');
  document.getElementById('rtitle').textContent = b.title;
  /* 기사에는 연결할 "원본 파일"이 없습니다. 사진과 소제목까지 담아 오지만
     사진 설명·영상·인터랙티브 도표는 여기 없으므로, 원문으로 가는 길을
     하나 남겨 둡니다. */
  const source = document.getElementById('rsource');
  source.hidden = !b.sourceUrl;
  if(b.sourceUrl){
    source.href = b.sourceUrl;
    source.textContent = (b.site ? b.site + '에서 ' : '') + '원문 보기 ↗';
  }
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
  const original = bookSupportsOriginal(b) ? await originalGetForBook(b) : null;
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
/* Book titles and file names end up inside HTML attributes, so quotes have to
   be escaped too — otherwise a title containing " breaks out of the markup. */
function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function updatePfill(){
  if(!curBook) return;
  const progress=visibleReaderProgress();
  document.getElementById('pfill').style.width = Math.max(0,Math.min(100,progress*100))+'%';
}
let scrollTick = null, fadeTimer = null, readerScrollPauseUntil = 0, progressFrame = 0;
function suspendReaderScrollSave(duration){
  readerScrollPauseUntil=Math.max(readerScrollPauseUntil,Date.now()+(duration||500));
  if(scrollTick){ clearTimeout(scrollTick); scrollTick=null; }
}
/* Progress needs the visible page or chapter, which means measuring elements.
   Once per frame is plenty; once per scroll event janks a long PDF. */
function scheduleProgressUpdate(){
  if(progressFrame) return;
  progressFrame=requestAnimationFrame(()=>{
    progressFrame=0;
    if(!curBook) return;
    updatePfill();
    if(currentReaderMode==='text' && !readerAnchorHeld()) lastAnchor=captureAnchor();
  });
}
window.addEventListener('scroll', ()=>{
  if(!curBook) return;
  scheduleProgressUpdate();
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

/* 사전 패널이 열리고 닫히면 읽는 영역의 폭이 바뀝니다. 글자판은 글이 다시
   흐르고, 원본 페이지는 비율대로 높이가 줄어듭니다. 그대로 두면 보고 있던
   줄이 화면에서 밀려나므로, 폭이 바뀔 때마다 방금 그 자리로 되돌립니다. */
if(window.ResizeObserver){
  let readerWidth = 0;
  new ResizeObserver(entries=>{
    const width = Math.round(entries[0].contentRect.width);
    if(!readerWidth || width===readerWidth){ readerWidth = width; return; }
    readerWidth = width;
    if(!curBook || !document.getElementById('v-read').classList.contains('on')) return;
    suspendReaderScrollSave(600);
    /* The panel animates its width, so this fires many times. Freeze the
       remembered place for the whole animation and aim at it every frame. */
    holdReaderAnchor(600);
    if(currentReaderMode==='original'){
      if(lastOriginalAnchor) restoreOriginalAnchor(lastOriginalAnchor);
    }else if(lastAnchor) restoreAnchor(lastAnchor);
  }).observe(document.getElementById('readmain'));
}

document.getElementById('rtext').addEventListener('click', e=>{
  const span = e.target.closest('.w');
  if(span) openWord(span.dataset.w, span);
});
