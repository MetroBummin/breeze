/* Original reader session: shared state, lifecycle, and the anchors that let
   the reflowed and original views describe the same place in the book.
   Format-specific rendering lives in pdf-original.js and epub-original.js. */

let currentReaderMode = 'text';
let originalSession = null;
let originalLoadToken = 0;
let originalOpenJob = null;
let readerModeChangeToken = 0;
let lastOriginalAnchor = null;
let readerAnchorHoldUntil = 0;

/* While the reader is being put back where it was, its own scrolling must not
   be mistaken for the reader moving. Without this the width animation of the
   dictionary panel re-records a half-finished position on every frame and the
   page creeps away line by line. */
function holdReaderAnchor(duration){
  readerAnchorHoldUntil=Math.max(readerAnchorHoldUntil,Date.now()+(duration||500));
}
function readerAnchorHeld(){ return Date.now()<readerAnchorHoldUntil; }

/* Pages, chapters and marked-up elements are laid out in document order, so
   the first one reaching past the fold can be found without measuring all of
   them. This runs on every scroll frame; a 200-page PDF must not be walked. */
function firstElementBelow(elements,inset){
  let low = 0, high = elements.length-1, found = null;
  while(low <= high){
    const middle = (low+high) >> 1;
    if(elements[middle].getBoundingClientRect().bottom > inset){ found = elements[middle]; high = middle-1; }
    else low = middle+1;
  }
  return found;
}

/* ---- 좌표 지도에서 한 번만 세면 되는 것들 ----
   진행도는 스크롤 프레임마다 다시 셉니다. 그런데 "이 지도가 아는 마지막 쪽" 같은
   값은 지도가 그대로인 한 늘 같은 답입니다. 3450줄짜리 지도를 프레임마다
   (EPUB 은 두 번씩) 훑던 자리라, 지도별로 한 번 세어 두고 그 값을 씁니다.
   지도가 없는 책은 빈 배열이 매번 새로 만들어지므로 담지 않습니다. */
const sourceMapFacts = new WeakMap();
function sourceMapFact(map, name, measure){
  if(!map || !map.length) return measure(map);
  let facts = sourceMapFacts.get(map);
  if(!facts){ facts = Object.create(null); sourceMapFacts.set(map, facts); }
  if(facts[name] === undefined) facts[name] = measure(map);
  return facts[name];
}

function sourceAnchorForParagraph(book, paragraphIndex){
  const map = book && book.sourceMap;
  if(!map || !map.length) return null;
  const start = Math.max(0,Math.min(map.length-1,Number(paragraphIndex)||0));
  let source = map[start] || null;
  if(!source){
    for(let distance=1; distance<map.length; distance++){
      source = map[start-distance] || map[start+distance] || null;
      if(source) break;
    }
  }
  if(!source) return null;
  return source.page
    ? {kind:'pdf',page:source.page,y:source.y||0}
    : {kind:'epub',href:source.href||'',spine:source.spine||0,element:source.element||0};
}

function paragraphForSource(book, source){
  const map = book && book.sourceMap;
  if(!source || !map || !map.length) return null;
  let best = null, bestScore = Infinity;
  map.forEach((item,index)=>{
    if(!item) return;
    let score = Infinity;
    if(source.kind === 'pdf' && item.page){
      score = Math.abs(item.page-source.page)*4 + Math.abs((item.y||0)-(source.y||0));
    }else if(source.kind === 'epub' && !item.page){
      score = Math.abs((item.spine||0)-(source.spine||0))*10000
        + Math.abs((item.element||0)-(source.element||0));
    }
    if(score < bestScore){ bestScore=score; best=index; }
  });
  return best;
}

/* 진행도는 화면의 픽셀 높이가 아니라 책 안의 논리적 위치로 계산합니다.
   원본과 글자판의 높이는 완전히 다르기 때문에 scrollHeight 비율을 섞으면
   모드를 바꿀 때마다 진행도가 튑니다. */
function sourceProgressForBook(book,source){
  if(!book || !source) return null;
  const format=ORIGINAL_FORMATS[source.kind];
  if(!format) return null;
  /* 이 책의 세션이 열려 있으면 진짜 쪽수를 알고, 아니면 좌표 지도가 아는
     만큼만 압니다. 어느 쪽이든 형식별 계산은 형식 파일에 있습니다. */
  const live=originalSession && originalSession.bookId===book.id
    && originalSession.kind===source.kind ? originalSession : null;
  return format.progress(book.sourceMap||[],source,live);
}

function textProgressForBook(book,anchor){
  if(!book || !anchor || anchor.pi==null) return null;
  const source=sourceAnchorForParagraph(book,anchor.pi);
  const sourceProgress=sourceProgressForBook(book,source);
  if(sourceProgress!=null) return sourceProgress;
  return Math.max(0,Math.min(1,(Number(anchor.pi)||0)/Math.max(1,(book.paras||[]).length-1)));
}

/* 진행도는 **화면 맨 위**에 무엇이 있는지로 셉니다. 그런데 글 아래 여백은 화면
   절반뿐이라, 끝까지 내려도 마지막 문단은 화면 위까지 올라오지 못합니다. 그래서
   다 읽어도 94%에서 멈췄습니다 — 쪽·장·요소로 세는 PDF·EPUB도 마지막 조각이
   맨 위에 닿지 못해 같은 이유로 100%가 되지 않았습니다.
   마지막 한 화면만은 남은 스크롤로 메꿉니다. 바닥에 닿으면 정확히 1입니다. */
function readerProgressAtEnd(value){
  const reach=Math.max(1,readerViewHeight());
  const left=Math.max(0,readerContentHeight()-reach-readerScrollTop());
  if(left>=reach) return value;
  const closing=1-left/reach;
  return Math.max(0,Math.min(1,value+(1-value)*closing));
}

function readerProgressNow(){
  if(!curBook) return null;
  return currentReaderMode==='original'
    ? sourceProgressForBook(curBook,captureOriginalAnchor())
    : textProgressForBook(curBook,readerFrameAnchor());
}

function visibleReaderProgress(){
  if(!curBook) return 0;
  const value=readerProgressNow();
  return readerProgressAtEnd(value==null ? (posOf(curBook.id).p||0) : value);
}

/* ================= anchors ================= */

/* 지금 열려 있는 원본의 형식별 일감. 없으면 세션이 없다는 뜻입니다. */
function originalFormat(){
  return originalSession ? ORIGINAL_FORMATS[originalSession.kind] || null : null;
}

function captureOriginalAnchor(){
  const format=originalFormat();
  if(!format) return null;
  const anchor=format.captureAnchor(topInset()+10);
  if(anchor && !readerAnchorHeld()) lastOriginalAnchor=anchor;
  return anchor;
}

/* Without a source anchor the reader used to jump to the very first page.
   The stored progress is a much better guess for a book whose importer left
   no coordinate map. */
function originalAnchorFromProgress(book){
  const format=originalFormat();
  if(!format) return null;
  return format.anchorFromProgress(originalSession,
    Math.max(0,Math.min(1,Number(posOf(book&&book.id).p)||0)));
}

async function restoreOriginalAnchor(source,changeToken){
  const format=originalFormat();
  if(!format){ readerScrollTo(0); return false; }
  const target=source || originalAnchorFromProgress(curBook);
  if(!target){ readerScrollTo(0); return false; }
  const restored=await format.restoreAnchor(target,topInset()+10,changeToken);
  if(restored) lastOriginalAnchor=target;
  return restored;
}

/* ================= lifecycle ================= */

async function renderOriginalBook(book,record){
  if(originalOpenJob && originalOpenJob.bookId===book.id && originalOpenJob.hash===record.hash){
    await originalOpenJob.promise;
    return;
  }
  if(originalSession && originalSession.bookId===book.id && originalSession.hash===record.hash
      && document.getElementById('original-content').childElementCount) return;
  leaveOriginalReader();
  const token = ++originalLoadToken;
  const content = document.getElementById('original-content');
  content.innerHTML = '<div class="original-loading"><i></i><span>원본을 여는 중…</span></div>';
  const job={bookId:book.id,hash:record.hash,promise:null};
  job.promise=(async()=>{
    const format=ORIGINAL_FORMATS[record.kind];
    if(!format) throw new Error('지원하지 않는 원본 형식이에요');
    await format.open(book,record,token);
  })();
  originalOpenJob=job;
  try{ await job.promise; }
  finally{ if(originalOpenJob===job) originalOpenJob=null; }
}

function leaveOriginalReader(){
  originalLoadToken++;
  originalOpenJob=null;
  lastOriginalAnchor=null;
  /* 배율은 이 종이의 것이었습니다. 다음 책은 제 크기로 엽니다. */
  resetOriginalZoom();
  if(!originalSession) return;
  if(originalSession.observer) originalSession.observer.disconnect();
  (originalSession.resizeObservers||[]).forEach(observer=>observer.disconnect());
  (originalSession.urls||[]).forEach(url=>URL.revokeObjectURL(url));
  if(originalSession.pdf){ try{ originalSession.pdf.destroy(); }catch(e){} }
  originalSession = null;
  if(typeof updateOriginalZoomControls === 'function') updateOriginalZoomControls();
  const content = document.getElementById('original-content');
  if(content){ content.innerHTML=''; content.className='original-content'; }
}

function showOriginalReconnect(book){
  const content = document.getElementById('original-content');
  content.innerHTML = `<div class="original-empty">
    <div class="original-empty-icon" aria-hidden="true">▤</div>
    <h2>원본 파일을 연결해 주세요</h2>
    <p>예전에 추가한 책이라 원본이 이 기기에 없어요.<br>같은 PDF나 EPUB을 고르면 읽던 위치와 단어장은 그대로 유지돼요.</p>
    <button id="original-reconnect">원본 파일 선택</button>
    <small>파일은 서버로 올라가지 않고 이 기기에만 저장됩니다.</small>
  </div>`;
  content.querySelector('#original-reconnect').onclick=()=>requestOriginalReconnect(book);
}

function showOriginalError(error){
  const content = document.getElementById('original-content');
  content.innerHTML = `<div class="original-empty"><h2>원본을 열지 못했어요</h2>
    <p>${esc((error&&error.message)||'파일을 다시 연결해 주세요.')}</p>
    <button id="original-reconnect">원본 파일 다시 선택</button></div>`;
  content.querySelector('#original-reconnect').onclick=()=>requestOriginalReconnect(curBook);
}

/* ================= saved vocabulary ================= */

function refreshOriginalSavedWords(){
  const format=originalFormat();
  if(format) format.refreshSavedWords(originalSession);
}

function clearOriginalSelectionMarkers(){
  readerWordNodes('.original-selection-marker').forEach(marker=>marker.remove());
}
