/* ================= reader ================= */
const WORD_RE = /([A-Za-z][A-Za-z'’-]*[A-Za-z]|[A-Za-z])/g;
const keyOf = raw => {
  const cands = lemmaCands(raw);
  return cands.find(c=>words[c]) || cands[0];
};
function phraseParts(text){
  return (String(text||'').toLowerCase().match(/[a-z]+(?:['’][a-z]+)?/g)||[])
    .map(part=>lemmaCands(part)[0]||part);
}
/* 저장한 표현은 단어 둘을 따로 칠하는 것이 아니라, 원문 속의 한 덩어리로 감쌉니다.
   그래야 flare만 남고 up이 빠지는 일이 없습니다. */
function savedPhraseStarts(){
  const starts=new Map();
  Object.entries(words).forEach(([key,w])=>{
    const parts=w&&w.phraseParts;
    if(!Array.isArray(parts)||parts.length<2) return;
    const first=parts[0];
    if(!starts.has(first)) starts.set(first,[]);
    starts.get(first).push({key,w,parts});
  });
  starts.forEach(list=>list.sort((a,b)=>b.parts.length-a.parts.length));
  return starts;
}
/* 글자를 단어 단위로 감쌉니다. 글자 화면과 쇼츠가 같은 함수를 씁니다. */
function wordSpans(text,starts){
  const matches=[]; let match, last = 0, html = '';
  WORD_RE.lastIndex = 0;
  while((match = WORD_RE.exec(text))) matches.push(match);
  starts=starts||savedPhraseStarts();
  for(let i=0;i<matches.length;){
    match=matches[i];
    const choices=[];
    lemmaCands(match[0]).forEach(part=>(starts.get(part)||[]).forEach(item=>{
      if(!choices.includes(item)) choices.push(item);
    }));
    const phrase=choices.find(item=>item.parts.every((part,n)=>
      matches[i+n] && lemmaCands(matches[i+n][0]).includes(part)));
    html += esc(text.slice(last, match.index));
    if(phrase){
      const end=matches[i+phrase.parts.length-1].index+matches[i+phrase.parts.length-1][0].length;
      const status=phrase.w.mark!==false ? ' s'+phrase.w.status : '';
      html += `<span class="w phrase${status}" data-w="${esc(phrase.key)}">${esc(text.slice(match.index,end))}</span>`;
      last=end; i+=phrase.parts.length; continue;
    }
    const key = keyOf(match[0]);
    const status = words[key] && words[key].mark !== false ? ' s'+words[key].status : '';
    html += `<span class="w${status}" data-w="${key}">${esc(match[0])}</span>`;
    last = match.index + match[0].length;
    i++;
  }
  return html + esc(text.slice(last));
}
/* 긴 책도 문단 뼈대는 한 번에 만들되, 단어 상자는 눈앞의 문단에만 붙입니다.
   원문 텍스트는 그대로 남으므로 검색·문단 앵커는 전 범위에서 즉시 작동합니다. */
let wordSpanObserver=null;
function hydrateWordSpanBatch(elements){
  const starts=savedPhraseStarts();
  elements.forEach(el=>{
    if(!el || el.dataset.wordSpans==='1') return;
    el.innerHTML=wordSpans(el.textContent,starts);
    el.dataset.wordSpans='1';
  });
}
function dehydrateWordSpan(el){
  if(!el || el.dataset.wordSpans!=='1' || el.querySelector('.sel')) return;
  el.textContent=el.textContent;
  delete el.dataset.wordSpans;
}
function beginLazyWordSpans(elements){
  if(wordSpanObserver) wordSpanObserver.disconnect();
  if(!window.IntersectionObserver){ hydrateWordSpanBatch(elements); return; }
  wordSpanObserver=new IntersectionObserver(entries=>{
    const entering=entries.filter(entry=>entry.isIntersecting).map(entry=>entry.target);
    if(entering.length) hydrateWordSpanBatch(entering);
    entries.filter(entry=>!entry.isIntersecting).forEach(entry=>dehydrateWordSpan(entry.target));
  },{root:readerScroller(),rootMargin:'900px 0px'});
  elements.forEach(element=>wordSpanObserver.observe(element));
}
/* Render source text using formatting metadata without changing the source. */
function renderBookBody(b){
  const formatting = b.formatting || null;
  const rt = document.getElementById('rtext');
  rt.innerHTML='';
  const frag = document.createDocumentFragment();
  const PAGE_CHARS = 1700;
  const wordSpanTargets=[];
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
  let list = (formatting && Array.isArray(formatting.blocks))
    ? formatting.blocks
    : buildPlainBlocks(b.paras);
  /* 기사는 제목을 본문에도 담고 있습니다 — 앱이 맨 앞에 붙인 h1 하나, 그리고
     기사 페이지 자신의 headline 하나. 그 둘 사이에 대표 사진이 끼어 있는 일이
     많아서 "첫 덩어리 하나"만 봐서는 못 걸러 냅니다. 읽는 화면에는 그 위에 이미
     `#rtitle` 이 서 있으므로, 맨 앞 몇 덩어리 안에서 제목과 똑같은 제목 줄은
     그리지 않습니다. 저장해 둔 자료는 건드리지 않으므로 이미 담아 둔 기사도
     함께 고쳐집니다. */
  const titleText = String(b.title||'').trim();
  let headScan = 0;
  if(titleText) list = list.filter(bl => {
    if(headScan >= 4) return true;
    headScan++;
    return !(bl.r && bl.r.charAt(0) === 'h' && String(bl.t||'').trim() === titleText);
  });
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
      /* 사진에도 번호를 답니다. 없으면 사진으로 끝나는 기사가 마지막 문단에
         닿지 못해 진행도와 읽던 자리가 사진 앞에서 멈춥니다. */
      fig.dataset.pi = bl.f;
      page.appendChild(fig);
      pageChars += 400;
      box = null; boxKind = '';
      return;
    }
    /* 코드는 줄바꿈과 들여쓰기가 뜻입니다. 문단처럼 이어 붙이면 읽을 수 없어서
       그대로 둡니다. 사전은 걸지 않습니다 — README 의 `npm install` 을 눌러
       단어장에 쌓이면, 영어를 읽으려고 만든 목록이 명령어로 오염됩니다. */
    if(bl.r === 'code'){
      if(pageChars >= PAGE_CHARS) newPage();
      const pre = document.createElement('pre');
      pre.className = 'blk code';
      pre.dataset.pi = bl.f;
      pre.textContent = bl.t;
      page.appendChild(pre);
      pageChars += Math.min(bl.t.length, 600);
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
    el.textContent = bl.v || bl.t;
    host.appendChild(el);
    wordSpanTargets.push(el);
    pageChars += bl.t.length;
  });
  const no = document.createElement('div');
  no.className='pageno'; no.textContent = '— '+pageNo+' —';
  frag.appendChild(no);
  rt.appendChild(frag);
  beginLazyWordSpans(wordSpanTargets);
}
async function openBook(b){
  readerModeChangeToken++;
  leaveOriginalReader();
  /* 예전에 넣어 둔 책에 남아 있는 네모(□)를 여기서 한 번 고칩니다 —
     scripts/importers/ligatures.js */
  await repairBookLigatures(b);
  /* The width observer below fires as the reader appears. It must not aim at
     wherever the previous book was being read. */
  lastAnchor = null;
  curBook = b;
  currentReaderMode = 'text';
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('on'));
  document.getElementById('v-read').classList.add('on');
  if(typeof rememberAppView==='function') rememberAppView('read');
  document.getElementById('nav-home').classList.remove('on');
  /* 읽기 시작하는 순간 사전 함수를 깨워 둡니다. 콜드스타트를 첫 낱말 클릭 뒤에
     숨기는 게 아니라, 그 앞에서 끝내는 편이 낫습니다 — AI 도 한도도 쓰지 않습니다. */
  warmDict();
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
  /* 책은 `show('read')` 를 거치지 않고 바로 열립니다. 셸을 켜는 표는 두 곳에
     달아야 합니다 — `body` 만 잠그면 아이폰에서 문서가 여전히 고무줄처럼 늘어나서,
     읽는 칸 바깥이 함께 흔들립니다 (styles/reader.css 의 "읽는 동안의 셸"). */
  document.body.classList.add('reading');
  document.documentElement.classList.add('reading');
  document.body.classList.remove('reader-original');
  showReaderChrome();                 // 상단바가 다시 서는 날을 위한 배선입니다
  document.getElementById('readwrap').hidden=false;
  document.getElementById('originalwrap').hidden=true;
  renderBookBody(b);
  const initialPosition = posOf(b.id);
  const firstOpen = !initialPosition.t;
  /* 책을 열었다는 것만으로 "더 최근에 읽었다"고 쓰면, 실제로 더 멀리 읽은
     다른 기기의 위치를 이길 수 있습니다. 처음 연 책만 자리를 만들고, 이후의
     시간표는 실제 스크롤이 남깁니다. */
  if(firstOpen){ positions[b.id] = {...initialPosition, t:Date.now()}; save(LS_POS, positions); }
  updateReaderModeControls();
  const original = bookSupportsOriginal(b) ? await originalGetForBook(b) : null;
  const desired = initialPosition.mode==='original'
    ? (original ? 'original' : 'text')
    : (firstOpen && original ? 'original' : 'text');
  if(desired==='original') await switchReaderMode('original',{initial:true});
  else requestAnimationFrame(()=>{
    const pos=posOf(b.id);
    if(!restoreAnchor(pos)) readerScrollTo(pos.y||0);
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
let scrollTick = null, readerScrollPauseUntil = 0, progressFrame = 0;
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
    /* 이 프레임의 자를 여기서 한 번 놓습니다. 아래 둘은 같은 답을 나눠 씁니다. */
    invalidateReaderMeasurements();
    updatePfill();
    if(currentReaderMode==='text' && !readerAnchorHeld()) lastAnchor=readerFrameAnchor();
  });
}
/* ---- 상단바는 읽는 방향을 따릅니다 (지금은 읽는 화면에 연결돼 있지 않습니다) ----

   읽는 화면에서 상단바를 걷어내면서(styles/reader.css 의 `#readchrome`) 이
   장치를 **부르는 곳**이 하나 없어졌습니다 — 읽는 칸의 `scroll` 이 더 이상
   `followScrollDirection()` 을 부르지 않습니다. 장치 자체는 그대로 둡니다:
   넓은 화면에서는 예전 상단바를 다시 세울 수 있고, 그때 필요한 것이 정확히
   이 문턱 둘과 붙잡기 표이기 때문입니다. 지우면 그날 다시 써야 합니다.

   `pinReaderChrome` · `whileRestoringChrome` 을 부르는 자리들도 그대로입니다.
   지금은 아무것도 안 움직이지만(움직일 상단바가 없으므로), 상단바가 돌아오는
   날 배선을 다시 깔지 않기 위해서입니다.

   집중 모드 스위치를 대신하는 장치입니다. 아래로 읽어 내려가면 상단바가
   걷히고 단추가 흐려지며, 위로 올리거나 글머리에 닿으면 돌아옵니다.

   두 문턱이 다릅니다. 걷히는 데는 12px 이면 되지만, 돌아오는 데는 44px 이
   필요합니다. 아이폰은 손가락을 뗀 뒤에도 관성으로 한동안 흐르는데, 그 끝이
   깔끔하게 멈추지 않고 몇 픽셀 되튑니다. 문턱이 같으면 그 되튐이 "위로
   올렸다"로 읽혀서, 읽기를 멈출 때마다 상단바가 한 번 깜빡였습니다.
   되돌리려는 손짓은 몇 픽셀로 끝나지 않으니, 위쪽만 높여도 잃는 것이 없습니다.
   글 폭은 여기서 건드리지 않습니다. */
const CHROME_STEP = 12, CHROME_BACK = 44, CHROME_TOP = 80;
let chromeLastY = 0, chromeRun = 0;    // chromeRun: 같은 방향으로 이어서 간 거리
/* ---- 낱말 창이 열려 있는 동안에는 상단바를 건드리지 않습니다 ----
   걷힌 상단바는 읽어 내려간 결과입니다. 그런데 낱말 하나를 누르면 시트가
   올라오고, 그 사이에 화면이 조금씩 움직입니다 — 시트가 미끄러져 들어오고,
   아이폰은 손을 뗀 뒤에도 관성으로 몇 픽셀을 더 흘리며, 폰이 아닌 화면에서는
   옆 패널이 열리느라 글 폭이 바뀌어 보던 자리를 다시 맞춥니다. 그 몇 픽셀이
   "위로 올렸다"로 읽혀서, 뜻 한 번 보고 나면 상단바가 돌아와 있었습니다.
   낱말 창은 읽기를 멈춘 것이 아니라 읽는 도중이므로, 그동안의 움직임은
   방향으로 세지 않고 창을 닫을 때 거리만 0에서 다시 시작합니다. */
/* 붙잡는 이유가 여럿이라 이름을 붙여 셉니다 — 낱말 창(`panel`), 자리 되돌리기
   (`restore`). 하나가 놓아도 다른 하나가 잡고 있으면 상단바는 그대로입니다.
   참·거짓 하나로 두면, 되돌리는 도중에 창을 닫는 순간 아직 옮기고 있는데도
   풀립니다.

   `zoom` 핀은 없앴습니다. 벌리는 것이 브라우저 몫이던 시절에는 벌리는 동안
   `scrollY` 가 크게 흔들려서 상단바가 걷혔다 돌아왔다 했고, 그것을 막으려고
   핀이 필요했습니다. 지금 확대는 종이 안쪽 일이라 `scrollTop` 을 건드리지
   않습니다 — 막을 것이 없습니다 (scripts/reader/reader-scroll.js). */
const chromePins = new Set();
let chromePinned = false, chromeHoldUntil = 0;
function pinReaderChrome(pinned, reason){
  const key = reason || 'panel';
  if(pinned) chromePins.add(key); else chromePins.delete(key);
  chromePinned = chromePins.size > 0;
  chromeHoldUntil = Date.now() + 500;   // 시트가 미끄러져 나가는 동안까지
  chromeLastY = Math.max(0, readerScrollTop());
  chromeRun = 0;
}
/* ---- 오래 걸리는 일이 끝날 때까지 붙잡습니다 ----
   벽시계로 재는 유예(`chromeHoldUntil`)만으로는 모자랍니다. 자리를 되돌리는
   일에는 PDF 한 쪽을 그리는 `await` 가 끼어 있고, 그건 얼마나 걸릴지 알 수
   없습니다. 유예가 먼저 끝나면 그 뒤에 오는 프로그램 스크롤이 "손으로 위로
   올렸다"로 읽혀서, 낱말 하나 눌렀다 닫았을 뿐인데 상단바가 돌아와 있었습니다.
   시간이 아니라 **일이 끝나는 것**을 기다립니다. */
function whileRestoringChrome(job){
  pinReaderChrome(true, 'restore');
  const done = ()=>pinReaderChrome(false, 'restore');
  let result;
  try{ result = job(); }
  catch(error){ done(); throw error; }
  if(result && typeof result.then === 'function') return result.then(
    value=>{ done(); return value; },
    error=>{ done(); throw error; });
  done();
  return result;
}
function setReaderChrome(hidden){
  document.body.classList.toggle('chrome-hidden', hidden);
}
function showReaderChrome(){
  chromePins.clear(); chromePinned = false; chromeHoldUntil = 0;
  chromeLastY = readerScrollTop(); chromeRun = 0;
  setReaderChrome(false);
}
function followScrollDirection(){
  const y = Math.max(0, readerScrollTop());
  const step = y - chromeLastY;
  chromeLastY = y;
  /* 붙잡혀 있으면 방향을 세지 않습니다 — 낱말 창이 열려 있거나, 보던 자리를
     되돌리는 중일 때입니다. 둘 다 읽어 내려간 것이 아니라 프로그램이 옮긴
     것이라, 방향으로 세면 상단바가 제멋대로 걷혔다 돌아왔다 합니다. */
  if(chromePinned || Date.now() < chromeHoldUntil){ chromeRun = 0; return; }
  /* 모드를 바꾸며 프로그램이 옮겨 놓은 화면은 내가 읽어 내려간 것이 아닙니다 */
  if(Date.now() < readerScrollPauseUntil){ chromeRun = 0; return; }
  if(y < CHROME_TOP){ chromeRun = 0; setReaderChrome(false); return; }
  if(!step) return;
  /* 방향이 바뀌면 거리를 처음부터 다시 셉니다. 그래야 관성이 남긴 몇 픽셀이
     다음 판단까지 쌓이지 않습니다. */
  if((step > 0) !== (chromeRun > 0)) chromeRun = 0;
  chromeRun += step;
  if(chromeRun >= CHROME_STEP){ chromeRun = 0; setReaderChrome(true); }
  else if(chromeRun <= -CHROME_BACK){ chromeRun = 0; setReaderChrome(false); }
}
/* 듣는 곳이 문서(`window`)에서 읽는 칸으로 옮겨졌습니다. 아이폰 사파리가 주소창을
   여닫으며 흘리던 가짜 스크롤이 여기까지 오지 않는 것도 덤입니다.

   여기서 하는 일은 둘뿐입니다 — 진행줄을 다시 그리고, 잠시 뒤에 읽은 자리를
   적어 두기. **위의 `followScrollDirection()` 은 여기서 부르지 않습니다.**
   끊은 연결은 이 한 줄이고, 그것이 "스크롤은 글을 옮기는 일일 뿐"의 전부입니다. */
(readerScroller() || window).addEventListener('scroll', ()=>{
  if(!curBook) return;
  invalidateReaderMeasurements();
  scheduleProgressUpdate();
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
}, {passive:true});

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
    invalidateReaderMeasurements();   // 폭이 바뀌면 글이 다시 흐릅니다
    suspendReaderScrollSave(600);
    /* The panel animates its width, so this fires many times. Freeze the
       remembered place for the whole animation and aim at it every frame. */
    holdReaderAnchor(600);
    /* 되돌리는 일이 끝날 때까지 상단바를 붙잡습니다. 원본 쪽은 안에 PDF 한 쪽을
       그리는 `await` 가 있어서, 600ms 유예가 먼저 끝나 버리는 일이 있었습니다.
       지금 읽는 화면에는 붙잡을 상단바가 없지만, 배선은 그대로 둡니다. */
    whileRestoringChrome(()=>{
      if(currentReaderMode==='original'){
        return lastOriginalAnchor ? restoreOriginalAnchor(lastOriginalAnchor) : null;
      }
      if(lastAnchor) restoreAnchor(lastAnchor);
      return null;
    });
  }).observe(document.getElementById('readmain'));
}

/* ================= 글자판이라는 종이 =================
   낱말 하나는 탭, 문장 하나는 꾹 누르기 — 그 판정은 여기서 하지 않습니다
   (scripts/reader/gesture.js). 여기 있는 것은 "그 자리에 어떤 낱말·문장이
   있는가"뿐이고, 그건 이 종이만 아는 일입니다.

   예전에는 이 자리에 리스너가 여섯 개 있었습니다 — click 이 낱말을 열고,
   pointerdown/move/up 이 꾹 누르기를 재고, scroll 이 그것을 취소하면서 벽시계
   유예 셋을 함께 봤습니다. 전부 판정 주체가 없어서 생긴 것이라 사라졌습니다. */

/* ---- 어느 문장인지는 누른 **자리**가 정합니다 ----
   예전에는 누른 낱말의 글자를 문단 안에서 찾아, 그 글자를 품은 **첫** 문장을
   골랐습니다. 그래서 한 문단에 같은 낱말이 두 번 나오면 늘 앞의 것이 잡혔습니다:

     He was tired. It was getting dark.

   두 번째 `was` 를 꾹 눌러도 "He was tired." 가 열렸습니다. `was` · `the` ·
   `looked` 처럼 흔한 낱말에서는 거의 매번입니다.

   스캔본은 낱말 상자마다 문단 안의 자리(`box.offset`)를 들고 있고, EPUB 은
   caret 자리를 세어 씁니다(scripts/reader/pdf-original.js ·
   scripts/reader/epub-original.js). 글자판만 글자를 찾고 있었습니다. 이제
   셋이 같습니다 — 누른 자리가 문단의 몇 번째 글자인지를 세고, 그 자리를 품은
   문장 하나를 고릅니다. 자리는 하나뿐이라 고를 것도 하나뿐입니다. */
function textSentencePartAt(span){
  const block=span && span.closest ? span.closest('[data-pi]') : null;
  if(!block || typeof bridgeSentences !== 'function') return null;
  let at=0;
  try{
    const before=(block.ownerDocument||document).createRange();
    before.selectNodeContents(block);
    before.setEndBefore(span);
    at=before.toString().length;
  }catch(error){ at=0; }
  const parts=bridgeSentences(block.textContent);
  const part=parts.find(item=>at>=item.start && at<item.end) || parts[0];
  if(!part) return null;
  return { block, part, sentence:part.text.replace(/\s+/g,' ').trim() };
}

function textWordSpanAt(clientX, clientY){
  const element=document.elementFromPoint(clientX, clientY);
  return element && element.closest ? element.closest('#rtext .w') : null;
}

registerReaderSurface({
  name: 'text',
  claims(event){
    const target=event.target;
    return currentReaderMode==='text' && !!(target && target.closest && target.closest('#rtext'));
  },
  document(){ return document; },
  openWordAt(clientX, clientY){
    const span=textWordSpanAt(clientX, clientY);
    if(!span) return false;
    openWord(span.dataset.w, span);
    return true;
  },
  sentenceAt(clientX, clientY){
    const span=textWordSpanAt(clientX, clientY);
    if(!span) return null;
    const found=textSentencePartAt(span);
    if(!found || !found.sentence) return null;
    const block=found.block;
    /* 물어본 문장과 칠하는 자리가 같은 곳에서 나옵니다 — 문장을 글자로 다시
       찾지 않으므로 둘이 어긋날 자리가 없습니다. */
    const range=domRangeForOffsets(block, found.part.start, found.part.end);
    return { sentence:found.sentence, paint(){
      if(range && typeof showRangeModeCue==='function') showRangeModeCue(range, 0);
      else if(block && typeof showElementModeCue==='function') showElementModeCue(block, 0);
    } };
  },
});

/* 코드 블록은 읽는 글이 아니라 옮겨 적을 것이라, 거기서는 선택을 지우지 않습니다. */
suppressReaderSelection(document, element=>
  !!element.closest('#rtext') && !element.closest('.blk.code'));
