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
  const map=book.sourceMap||[];
  if(source.kind==='pdf'){
    const mappedPages=map.reduce((max,item)=>Math.max(max,(item&&item.page)||0),0);
    const sessionPages=originalSession && originalSession.bookId===book.id && originalSession.kind==='pdf'
      ? originalSession.pages.length : 0;
    const total=Math.max(1,sessionPages,mappedPages,Number(source.page)||1);
    return Math.max(0,Math.min(1,((Math.max(1,Number(source.page)||1)-1)
      + Math.max(0,Math.min(1,Number(source.y)||0)))/total));
  }
  if(source.kind==='epub'){
    const mappedSpines=map.reduce((max,item)=>Math.max(max,item&&!item.page ? (item.spine||0)+1 : 0),0);
    const sessionSpines=originalSession && originalSession.bookId===book.id && originalSession.kind==='epub'
      ? originalSession.frames.length : 0;
    const total=Math.max(1,sessionSpines,mappedSpines,(Number(source.spine)||0)+1);
    const spine=Math.max(0,Math.min(total-1,Number(source.spine)||0));
    const maxElement=map.reduce((max,item)=>item&&!item.page&&(item.spine||0)===spine
      ? Math.max(max,item.element||0) : max,0);
    const inside=maxElement ? Math.max(0,Math.min(1,(Number(source.element)||0)/(maxElement+1))) : 0;
    return Math.max(0,Math.min(1,(spine+inside)/total));
  }
  return null;
}

function textProgressForBook(book,anchor){
  if(!book || !anchor || anchor.pi==null) return null;
  const source=sourceAnchorForParagraph(book,anchor.pi);
  const sourceProgress=sourceProgressForBook(book,source);
  if(sourceProgress!=null) return sourceProgress;
  return Math.max(0,Math.min(1,(Number(anchor.pi)||0)/Math.max(1,(book.paras||[]).length-1)));
}

function visibleReaderProgress(){
  if(!curBook) return 0;
  if(currentReaderMode==='original'){
    const value=sourceProgressForBook(curBook,captureOriginalAnchor());
    return value==null ? (posOf(curBook.id).p||0) : value;
  }
  const value=textProgressForBook(curBook,captureAnchor());
  return value==null ? (posOf(curBook.id).p||0) : value;
}

/* ================= anchors ================= */

function captureOriginalAnchor(){
  if(!originalSession) return null;
  const inset=topInset()+10;
  const anchor=originalSession.kind==='pdf'
    ? capturePdfAnchor(inset) : captureEpubAnchor(inset);
  if(anchor && !readerAnchorHeld()) lastOriginalAnchor=anchor;
  return anchor;
}

/* Without a source anchor the reader used to jump to the very first page.
   The stored progress is a much better guess for a book whose importer left
   no coordinate map. */
function originalAnchorFromProgress(book){
  if(!originalSession) return null;
  const progress=Math.max(0,Math.min(1,Number(posOf(book&&book.id).p)||0));
  if(originalSession.kind==='pdf'){
    const total=Math.max(1,originalSession.pages.length);
    const exact=progress*total;
    const page=Math.max(1,Math.min(total,Math.floor(exact)+1));
    return {kind:'pdf',page,y:Math.max(0,Math.min(1,exact-(page-1)))};
  }
  const total=Math.max(1,originalSession.frames.length);
  return {kind:'epub',href:'',spine:Math.max(0,Math.min(total-1,Math.floor(progress*total))),element:0};
}

async function restoreOriginalAnchor(source,changeToken){
  if(!originalSession){ window.scrollTo(0,0); return false; }
  const target=source || originalAnchorFromProgress(curBook);
  if(!target){ window.scrollTo(0,0); return false; }
  const inset=topInset()+10;
  const restored=originalSession.kind==='pdf'
    ? await restorePdfAnchor(target,inset,changeToken)
    : await restoreEpubAnchor(target,inset);
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
    if(record.kind==='pdf') await openOriginalPdf(book,record,token);
    else if(record.kind==='epub') await openOriginalEpub(book,record,token);
    else throw new Error('지원하지 않는 원본 형식이에요');
  })();
  originalOpenJob=job;
  try{ await job.promise; }
  finally{ if(originalOpenJob===job) originalOpenJob=null; }
}

function leaveOriginalReader(){
  originalLoadToken++;
  originalOpenJob=null;
  lastOriginalAnchor=null;
  if(!originalSession) return;
  if(originalSession.observer) originalSession.observer.disconnect();
  (originalSession.resizeObservers||[]).forEach(observer=>observer.disconnect());
  (originalSession.urls||[]).forEach(url=>URL.revokeObjectURL(url));
  if(originalSession.pdf){ try{ originalSession.pdf.destroy(); }catch(e){} }
  originalSession = null;
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
  if(!originalSession) return;
  if(originalSession.kind==='pdf'){
    originalSession.pages.forEach((page,index)=>{
      if(page.dataset.wordCount) renderPdfSavedWordMarkers(page,originalSession.wordBoxes.get(index+1));
    });
    return;
  }
  (originalSession.frames||[]).forEach(frame=>{
    try{ if(frame&&frame.contentDocument) renderEpubSavedWordHighlights(frame.contentDocument); }catch(e){}
  });
}

function clearOriginalSelectionMarkers(){
  readerWordNodes('.original-selection-marker').forEach(marker=>marker.remove());
}
