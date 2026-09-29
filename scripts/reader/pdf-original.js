/* Original PDF reader: lazy PDF.js canvases and glyph-based page geometry.
   Lookup and every word/phrase marker share the same normalized boxes. CSS
   scales canvas and markers together; scroll/resize/pinch never measure text. */

let pdfDrawToken = 0;

// Reuse the original reader's generation and original-byte identity. A page
// number alone cannot establish ownership across documents (or an A-B-A reopen).
function currentPdfSession(session=originalSession){
  return !!session && session===originalSession && session.kind==='pdf'
    && session.loadToken===originalLoadToken && session.bookId===curBook?.id
    && (!(curBook.original?.hash||curBook.sourceHash)||session.hash===(curBook.original?.hash||curBook.sourceHash));
}
function ownsPdfPage(page,session=originalSession){
  return currentPdfSession(session) && !!page && page.isConnected
    && session.pages[Number(page.dataset.page)-1]===page;
}
function ownsPdfBoxes(page,boxes,session=originalSession){
  if(!ownsPdfPage(page,session))return false;
  const map=session.wordBoxes.get(Number(page.dataset.page));
  return !!map && (boxes===map || boxes.every(box=>map.includes(box)));
}

// Committed paper rectangles in scroller content coordinates. All pages stay
// represented, including unrendered placeholders and gaps. Only layout changes
// invalidate this map; scrolling changes the query offset, not the rectangles.
function invalidatePdfPageLayout(session=originalSession){
  if(session?.kind==='pdf')session.pageLayout=null;
}
function pdfPageLayout(session=originalSession){
  if(!currentPdfSession(session))return null;
  const scroller=readerScroller(),outer=scroller.getBoundingClientRect();
  const key=[outer.width,outer.height,scroller.scrollHeight,originalZoom(),session.pages.length].join('|');
  if(!session.pageLayout || session.pageLayout.key!==key){
    session.pageLayout={key,rects:session.pages.map(page=>{
      const r=page.getBoundingClientRect();
      return [r.left-outer.left+scroller.scrollLeft,r.top-outer.top+scroller.scrollTop,r.width,r.height];
    })};
  }
  return {rects:session.pageLayout.rects,outer,scroller};
}
function pdfPageIndexAtY(rects,y){
  let low=0,high=rects.length;
  while(low<high){const mid=(low+high)>>1,r=rects[mid];if(r[1]+r[3]<y)low=mid+1;else high=mid;}
  return low;
}
function pdfPagesInView(session,reach=0){
  const layout=pdfPageLayout(session);if(!layout)return [];
  const {rects,scroller}=layout,start=scroller.scrollTop-reach,end=scroller.scrollTop+scroller.clientHeight+reach;
  const pages=[];
  for(let i=pdfPageIndexAtY(rects,start);i<rects.length&&rects[i][1]<=end;i++)pages.push(i+1);
  return pages;
}
function schedulePdfSharpen(session=originalSession){
  if(!currentPdfSession(session))return;
  clearTimeout(session.sharpenTimer);
  session.sharpenTimer=setTimeout(()=>{if(currentPdfSession(session))resharpenOriginalPages();},180);
}
function pdfScrollBusy(session=originalSession,includeContacts=true){
  return (includeContacts&&originalPdfContacts>0) || performance.now()-(session?.lastScrollAt??-Infinity)<160;
}
function schedulePdfPaint(session=originalSession){
  if(!currentPdfSession(session)||session.paintTimer)return;
  session.paintTimer=setTimeout(()=>{session.paintTimer=0;void drainPdfPaint(session);},0);
}
async function drainPdfPaint(session){
  if(!currentPdfSession(session)||session.paintActive||!session.paintQueue?.size)return;
  const visible=new Set(pdfPagesInView(session)),nearby=new Set(pdfPagesInView(session,1300));
  for(const [n,job] of session.paintQueue){
    if(job.options?.prefetch&&!nearby.has(n)){session.paintQueue.delete(n);job.resolve();}
  }
  const jobs=[...session.paintQueue.values()].sort((a,b)=>Number(visible.has(b.pageNumber))-Number(visible.has(a.pageNumber)));
  const job=jobs.find(item=>!originalPdfPaintPaused(item.options?.prepare?false:!!session.settled.has(item.pageNumber))
    && (!item.options?.prefetch||visible.has(item.pageNumber)||!pdfScrollBusy(session))
    && (!item.options?.prepare||item.options?.lookup||!pdfScrollBusy(session,false))
    && (!item.options?.resharpen||!pdfScrollBusy(session)));
  if(!jobs.length)return;
  if(!job){session.paintTimer=setTimeout(()=>{session.paintTimer=0;void drainPdfPaint(session);},160);return;}
  session.paintQueue.delete(job.pageNumber);session.paintActive=job;
  let result;
  try{result=await paintOriginalPdfPage(session,job.pageNumber,job.options);}
  catch(error){console.warn('PDF page preparation skipped:',error);}
  finally{
    session.paintActive=null;
    // Retry work interrupted by scrolling, not an operator/PDF failure.
    if((!job.options?.prepare||result==='deferred')&&currentPdfSession(session)&&session.settled.has(job.pageNumber)&&!session.wordBoxes.has(job.pageNumber))
      void renderOriginalPdfPage(session,job.pageNumber,{prepare:true,prefetch:true});
    job.resolve();schedulePdfPaint(session);
  }
}
function renderOriginalPdfPage(session,pageNumber,options){
  if(!currentPdfSession(session))return Promise.resolve();
  if(session.paintActive?.pageNumber===pageNumber){
    const pending=session.paintActive.promise;
    return options?.prefetch?pending:pending.then(()=>{
      if(currentPdfSession(session)&&session.settled.has(pageNumber)&&!session.wordBoxes.has(pageNumber))
        return renderOriginalPdfPage(session,pageNumber,{prepare:true,lookup:true});
    });
  }
  if(session.settled.has(pageNumber)&&!session.wordBoxes.has(pageNumber)&&!options?.prefetch)
    options={...options,prepare:true,lookup:true};
  session.paintQueue ||= new Map();
  const existing=session.paintQueue.get(pageNumber);
  if(existing){
    if(!options?.prefetch)existing.options={...existing.options,...options,prefetch:false};
    return existing.promise;
  }
  if(session.settled.has(pageNumber)&&!options?.resharpen&&!options?.prepare)return session.rendering.get(pageNumber)||Promise.resolve();
  let resolve;const promise=new Promise(done=>{resolve=done;});
  session.paintQueue.set(pageNumber,{pageNumber,options,promise,resolve});schedulePdfPaint(session);
  if(options?.prefetch||options?.prepare)return promise;
  return promise.then(()=>{
    if(currentPdfSession(session)&&session.settled.has(pageNumber)&&!session.wordBoxes.has(pageNumber))
      return renderOriginalPdfPage(session,pageNumber,{prepare:true,lookup:true});
  });
}

/* ================= 확대 =================
   손가락으로 벌리면 종이만 커집니다. 단추도, 쪽마다 나뉜 가로 스크롤 칸도
   없습니다 — 문서 전체가 종이 한 장처럼 같은 축에서 움직입니다.

   두 번을 돌아 여기 왔습니다.

   처음에는 `+`/`−` 단추와 쪽마다의 가로 칸이었습니다. 쪽을 넓히면 문서가
   넓어지고, 문서가 화면보다 넓어지면 폰 브라우저는 스크롤바를 주는 대신 화면을
   통째로 축소해 버립니다 — 1.7배로 키운 만큼 1.66배로 축소되어 글자가 하나도
   안 커졌습니다. 칸을 나눈 것은 문서 폭을 안 바꾸려는 우회로였습니다.

   다음에는 브라우저의 벌리기에 맡기고, 떠 있는 것들만 `visualViewport` 배율의
   역수로 되돌렸습니다. 그 보정은 늘 한 박자 늦었습니다 — 벌어지는 그림은
   컴포지터가 혼자 그리고 자바스크립트는 그 뒤를 따라가니까요.

   지금은 확대가 종이 안쪽 일입니다. `#original-zoom` 이 `transform` 으로 커지고
   바깥은 아무것도 안 변합니다. 문서 폭도 그대로라 브라우저가 축소할 이유가
   없고, 시트·단추·상단바는 되돌릴 것 자체가 없습니다
   (`scripts/reader/reader-scroll.js`).

   ---- 선명함 ----
   벌리는 동안 보는 것은 늘어난 그림이라 조금 흐립니다. `devicePixelRatio` 보다
   한 단계 넉넉하게 그려 두어 웬만큼은 버티고, 손을 뗀 뒤 그 배율로 눈에 보이는
   쪽만 다시 그립니다. 벌리는 **도중에** 다시 그리면 손짓이 끊깁니다.
   위 한도(4배)는 캔버스 크기가 곧 메모리라서 둡니다 — 긴 PDF 는 쪽이 많습니다. */
const PDF_OVERSAMPLE = 1.6;
const PDF_MAX_RENDER_ZOOM = 3;   // 이보다 더 벌리면 늘린 그림으로 봅니다

/* ---- 멀어진 쪽은 놓아 줍니다 ----
   캔버스의 크기가 곧 메모리입니다. 폭 932px 짜리 쪽을 `devicePixelRatio` 2 인
   화면에서 그리면 2982×3872 — 한 쪽에 46MB 입니다. 예전에는 한 번 그린 쪽을
   책을 닫을 때까지 안 놓았습니다. 605쪽짜리 교재를 마흔 쪽만 넘겨도 1.8GB 고,
   거기서부터는 그리는 일보다 메모리를 밀어내는 일이 더 오래 걸립니다. 램이
   넉넉한 기기는 이것을 힘으로 이기고, 그렇지 않은 기기는 통째로 느려집니다.

   놓는 문턱(4000px)은 그리는 문턱(1300px)보다 멉니다. 그 사이가 여유입니다 —
   한 쪽쯤 되돌아가는 것으로는 방금 놓은 쪽을 다시 그리지 않습니다.

   놓아도 자리는 한 톨도 안 움직입니다. 쪽 상자는 첫 렌더에서 제 비율을 이미
   배웠고 그 값은 그대로 두기 때문입니다 — 읽던 줄이 흔들리지 않습니다. */
const PDF_KEEP_REACH = 4000;
const PDF_MAX_PAGE_PIXELS = 6 * 1024 * 1024;
const PDF_MAX_CACHE_PIXELS = 24 * 1024 * 1024;

/* 새로 그릴 때마다 훑습니다. "자리를 새로 얻을 때 남는 자리를 만든다"는 뜻이라,
   가만히 있으면 아무 일도 안 하고 늘어날 때만 정리합니다. 놓친 쪽이 있어도
   다음 렌더가 다시 훑으므로 영영 남지 않습니다. */
function releaseDistantPdfPages(session,exceptPage,reservePixels=0){
  if(!currentPdfSession(session)) return;
  // Initial pages can paint during a held finger/scrollbar drag, so eviction
  // must run then too. Keep Touch.target nodes attached while dropping pixels.
  const nearby=new Set(pdfPagesInView(session,PDF_KEEP_REACH)),visible=new Set(pdfPagesInView(session));
  for(const pageNumber of [...session.settled]){
    if(pageNumber!==exceptPage&&!nearby.has(pageNumber))releaseOriginalPdfPage(session,pageNumber);
  }
  const pixels=n=>{const c=session.pages[n-1]?.querySelector('canvas');return c?c.width*c.height:0;};
  let total=reservePixels;
  for(const n of session.settled)total+=pixels(n);
  const candidates=[...session.settled].filter(n=>n!==exceptPage&&!visible.has(n))
    .sort((a,b)=>Math.abs(b-exceptPage)-Math.abs(a-exceptPage));
  for(const n of candidates){
    if(total<=PDF_MAX_CACHE_PIXELS)break;
    total-=pixels(n);releaseOriginalPdfPage(session,n);
  }
}

function releaseOriginalPdfPage(session,pageNumber){
  BreezePdfInk.release(session,pageNumber,{keepShell:true});
  session.settled.delete(pageNumber);
  session.rendering.delete(pageNumber);
  session.drawnAt.delete(pageNumber);
  session.drawToken.delete(pageNumber);   // 아직 도는 일감이 있으면 이걸로 물러납니다
  session.wordBoxes.delete(pageNumber);
  const pageElement=session.pages[pageNumber-1];
  if(!pageElement) return;
  /* DOM 에서 떼는 것만으로는 모자랍니다. 크기를 0 으로 만들어야 브라우저가 뒤에
     잡아 둔 그림판(iOS 에서는 GPU 쪽)을 그 자리에서 놓습니다. */
  pageElement.querySelectorAll('canvas').forEach(canvas=>{canvas.width=0;canvas.height=0;});
  delete pageElement.dataset.wordCount;
  // Keep the page's canvas and ink shell attached, including scrollbar drags
  // that never appear in originalPdfContacts. Only their payload is released.
  const loading=pageElement.querySelector('.pdf-page-loading');
  if(loading)loading.hidden=false;
  for(const marker of pageElement.querySelectorAll('.breeze-original-word')){
    if(originalPdfContacts){marker.setAttribute('data-pdf-retired','');marker.style.visibility='hidden';}
    else marker.remove();
  }
}

async function openOriginalPdf(book,record,token){
  const alive=()=>token===originalLoadToken && curBook?.id===book.id;
  await ensurePdfLib();
  if(!alive())return;
  const data=await record.blob.arrayBuffer();
  if(!alive())return;
  const pdf = await pdfjsLib.getDocument({isEvalSupported:false,data}).promise;
  if(!alive()){ void pdf.destroy(); return; }
  let first;
  try{first=await pdf.getPage(1);}catch(error){void pdf.destroy();if(alive())throw error;return;}
  if(!alive()){ void pdf.destroy(); return; }
  const content = document.getElementById('original-content');
  content.innerHTML='';
  content.className='original-content pdf-original';
  const firstViewport = first.getViewport({scale:1});
  const ratio = firstViewport.width/firstViewport.height;
  const pages=[];
  const session={kind:'pdf',bookId:book.id,hash:record.hash,loadToken:token,pdf,pages,
                 glyphs:book.glyphs||null,
                 /* 쪽마다 "어느 배율로 그렸나". 그보다 많이 벌리면 다시 그립니다. */
                 rendering:new Map(),drawnAt:new Map(),wordBoxes:new Map(),urls:[],
                 /* settled: 다 그려진 쪽 — 놓아 줄 수 있는 것은 이 쪽들뿐입니다.
                    drawToken: 쪽마다 "지금 유효한 일감". 놓아 주면 지워지므로,
                    돌고 있던 일감이 뒤늦게 캔버스를 끼워 넣지 못합니다. */
                 settled:new Set(),drawToken:new Map()};
  for(let pageNumber=1; pageNumber<=pdf.numPages; pageNumber++){
    const page=document.createElement('article');
    page.className='pdf-source-page';
    page.dataset.page=String(pageNumber);
    page.style.aspectRatio=String(ratio);
    page.innerHTML=`<div class="pdf-page-loading">${pageNumber}</div>`;
    content.appendChild(page); pages.push(page);
  }
  originalSession=session;
  BreezePdfInk.open(session);
  if(typeof updateOriginalZoomControls === 'function') updateOriginalZoomControls();
  const hint=document.getElementById('original-selection-hint');
  if(hint) hint.textContent='단어를 한 번 눌러 뜻을 봐요';
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{ if(entry.isIntersecting) renderOriginalPdfPage(session,Number(entry.target.getAttribute('data-page')),{prefetch:true}); });
  },{root:readerScroller(),rootMargin:'1300px 0px'});
  session.observer=observer;
  pages.forEach(page=>observer.observe(page));
  await renderOriginalPdfPage(session,1);
}

async function prepareOriginalPdfPage(session,pageNumber,options){
  const element=session.pages[pageNumber-1],token=session.drawToken.get(pageNumber);
  const alive=()=>ownsPdfPage(element,session)&&session.drawToken.get(pageNumber)===token&&session.settled.has(pageNumber);
  const allowed=()=>alive()&&(options?.lookup||!pdfScrollBusy(session,false));
  if(!alive()||session.wordBoxes.has(pageNumber))return;
  if(!allowed())return 'deferred';
  const page=await session.pdf.getPage(pageNumber);
  try{
    if(!allowed())return alive()?'deferred':undefined;
    const boxes=await buildPdfWordBoxes(page,page.getViewport({scale:1}),session.glyphs,session.pdf,allowed);
    if(!alive())return;
    if(!boxes)return 'deferred';
    session.wordBoxes.set(pageNumber,boxes);element.dataset.wordCount=String(boxes.length);
    renderPdfSavedWordMarkers(element,boxes);
  }finally{page.cleanup();}
}

async function paintOriginalPdfPage(session,pageNumber,options){
  if(!currentPdfSession(session)) return;
  if(options?.prepare)return prepareOriginalPdfPage(session,pageNumber,options);
  if(originalPdfPaintPaused(session.settled.has(pageNumber))) return;
  const requestedZoom=Math.min(PDF_MAX_RENDER_ZOOM,Math.max(1,originalZoom()));
  // Moving pages need readable pixels first, not a full oversized zoom canvas.
  const zoom=!session.settled.has(pageNumber)&&pdfScrollBusy(session)?1/PDF_OVERSAMPLE:requestedZoom;
  const drawn=session.rendering.get(pageNumber);
  if(drawn){
    /* 이미 그려진 쪽입니다. 벌린 만큼 눈에 띄게 흐려졌을 때만 다시 그립니다 —
       1.25배까지는 넉넉히 그려 둔 여유(PDF_OVERSAMPLE)로 버팁니다. */
    if(!options || !options.resharpen) return drawn;
    if(zoom <= (session.drawnAt.get(pageNumber)||1) * 1.25) return drawn;
  }
  const redraw=!!drawn;
  const previousZoom=session.drawnAt.get(pageNumber)||1;
  session.drawnAt.set(pageNumber,zoom);
  /* 이 쪽에 대해 지금 유효한 일감. 도중에 이 쪽을 놓아 주면 이 표가 지워지고,
     그러면 아래의 `alive()` 가 거짓이 되어 일감이 조용히 물러납니다. */
  const drawToken=++pdfDrawToken;
  session.drawToken.set(pageNumber,drawToken);
  const alive=()=>currentPdfSession(session) && ownsPdfPage(session.pages[pageNumber-1],session) && session.drawToken.get(pageNumber)===drawToken;
  /* 그리기 전에 한 번, 그리고 나서 또 한 번 훑습니다. 멀리 건너뛰면 떠나온 자리의
     쪽들과 새 자리의 쪽들이 잠깐 함께 남는데, 앞의 한 번이 그 겹침을 없앱니다 —
     가장 크게 잡히는 순간이 곧 이 기능의 한도라서, 그 봉우리를 깎는 일입니다. */
  releaseDistantPdfPages(session,pageNumber);
  let cleanupPage=()=>{};
  const job=(async()=>{
    const pageElement=session.pages[pageNumber-1];
    const page=await session.pdf.getPage(pageNumber);
    cleanupPage=()=>page.cleanup();
    if(!alive()) return;
    if(originalPdfPaintPaused(redraw)){
      if(redraw) session.drawnAt.set(pageNumber,previousZoom);
      else { session.rendering.delete(pageNumber); session.drawnAt.delete(pageNumber); }
      return;
    }
    const base=page.getViewport({scale:1});
    /* 레이아웃 폭은 벌려도 안 변합니다 — 커지는 것은 바깥의 `transform` 뿐입니다.
       그래서 이 값은 늘 같고, 벌릴 때마다 문서가 다시 흐르지 않습니다. */
    const cssWidth=Math.max(240,pageElement.clientWidth||document.getElementById('original-content').clientWidth||700);
    const cssScale=cssWidth/base.width;
    const viewport=page.getViewport({scale:cssScale});
    const outputScale=Math.min(4,(window.devicePixelRatio||1)*PDF_OVERSAMPLE*zoom,
      Math.sqrt(PDF_MAX_PAGE_PIXELS/(viewport.width*viewport.height)));
    releaseDistantPdfPages(session,pageNumber,Math.floor(viewport.width*outputScale)*Math.floor(viewport.height*outputScale));
    if(!originalPdfContacts)pageElement.querySelectorAll('[data-pdf-retired]').forEach(node=>node.remove());
    const canvas=(!redraw&&pageElement.querySelector('canvas'))||document.createElement('canvas');
    canvas.removeAttribute('data-pdf-retired');canvas.style.visibility='';
    canvas.width=Math.floor(viewport.width*outputScale);
    canvas.height=Math.floor(viewport.height*outputScale);
    canvas.style.width=viewport.width+'px'; canvas.style.height=viewport.height+'px';
    const context=canvas.getContext('2d',{alpha:false});
    const transform=outputScale===1 ? null : [outputScale,0,0,outputScale,0,0];
    if(redraw){
      /* 다시 그릴 때는 캔버스만 갈아 끼웁니다. 통째로 비우면 칠해 둔 낱말과
         지금 눌러 둔 낱말 표시가 함께 지워집니다 — 뜻을 보는 중에 벌리면
         보고 있던 그 낱말의 표시가 사라졌습니다. */
      await page.render({canvasContext:context,viewport,transform}).promise;
      if(!alive()){ canvas.width=0; canvas.height=0; return; }
      // A new pinch may have started while PDF.js was painting. Its Touch.target
      // must stay attached until release; retry sharpening after that gesture.
      if(originalPdfPaintPaused()){
        canvas.width=0; canvas.height=0;
        session.drawnAt.set(pageNumber,previousZoom);
        return;
      }
      const old=pageElement.querySelector('canvas');
      if(old){ old.replaceWith(canvas); old.width=0; old.height=0; }
      else pageElement.insertBefore(canvas,pageElement.firstChild);
      return;
    }
    /* Placeholders all use the first page's proportions. When a page that has
       already scrolled past learns its real ratio, the height change would
       push the text the reader is looking at. Move the scroll by the same
       amount so the visible line never moves. */
    const before=pageElement.getBoundingClientRect();
    // Preserve an active finger's Touch.target until it lifts.
    const loading=pageElement.querySelector('.pdf-page-loading');
    if(loading)loading.hidden=true;
    const ratioChanged=Math.abs(before.width/Math.max(1,before.height)-base.width/base.height)>0.0001;
    if(ratioChanged)pageElement.style.aspectRatio=`${base.width}/${base.height}`;
    if(canvas.parentElement!==pageElement)pageElement.appendChild(canvas);
    if(ratioChanged){
      invalidatePdfPageLayout(session);
      const after=pageElement.getBoundingClientRect();
      if(before.bottom<=0 && after.height!==before.height) readerScrollBy(after.height-before.height);
    }
    await page.render({canvasContext:context,viewport,transform}).promise;
    if(!alive()) return;
    // Yield between canvas work and operator-map work. Only one page job runs.
    await new Promise(resolve=>setTimeout(resolve,0));
    if(!alive())return;
    await BreezePdfInk.mount(session,pageNumber,base);
    // Native scrollbar drags need not deliver DOM finger contacts. Recent
    // scroll events defer word/marker work, while the new paper and ink show.
    const allowed=()=>alive()&&(!options?.prefetch||!pdfScrollBusy(session,false));
    if(!allowed())return;
    const wordBoxes=await buildPdfWordBoxes(page,base,session.glyphs,session.pdf,allowed);
    if(!wordBoxes||!alive())return;
    session.wordBoxes.set(pageNumber,wordBoxes);
    pageElement.dataset.wordCount=String(wordBoxes.length);
    renderPdfSavedWordMarkers(pageElement,wordBoxes);
  })().catch(error=>console.warn('PDF page render skipped:',error));
  /* 다시 그리는 동안에도 "이 쪽은 그려졌다"는 사실은 그대로 둡니다 — 실패해도
     옛 캔버스가 그 자리에 남아 있으니까요. */
  if(!redraw) session.rendering.set(pageNumber,job);
  await job;
  // PDF.js keeps operator lists and decoded images separately from our canvas.
  // cleanup() only releases completed page work; an in-flight task defers it.
  cleanupPage();
  /* 다 그려진 쪽만 놓아 줄 수 있습니다. 이 쪽 자신은 빼고 훑습니다 — 자리를
     되돌리기 전에 미리 그려 두는 곳이 있어서(restorePdfSentence), 방금 그린
     것을 그 자리에서 도로 놓으면 헛일이 됩니다. */
  if(alive() && session.rendering.has(pageNumber)) session.settled.add(pageNumber);
  releaseDistantPdfPages(session,pageNumber);
  if(alive()&&zoom<requestedZoom)schedulePdfSharpen(session);
  return job;
}

/* ---- 손을 뗀 뒤 다시 또렷하게 ----
   벌리는 도중에는 안 합니다. 긴 PDF 에서 쪽마다 캔버스를 다시 그리면 손짓이
   끊깁니다. 보이는 쪽과 그 위아래 한 화면씩만 손봅니다.
   부르는 곳은 `scripts/reader/pdf-pinch.js` 의 손짓이 끝나는 자리입니다. */
function resharpenOriginalPages(){
  originalPdfRenderPending = false;
  const session=originalSession;
  if(!session || session.kind!=='pdf') return;
  for(const pageNumber of pdfPagesInView(session,readerViewHeight())){
    const options=session.settled.has(pageNumber)?{resharpen:true,prefetch:true}:{prefetch:true};
    void renderOriginalPdfPage(session,pageNumber,options);
  }
}

/* ================= word map ================= */

/* Read the same glyph widths, TJ adjustments, text state and font metrics
   used by PDF.js canvas rendering. Work only when a lazy page is first drawn;
   resharpen replaces canvas pixels while keeping these scale-free boxes. */
async function buildPdfWordBoxes(page,viewport,glyphs,pdf,allowed=()=>true){
  const ops=pdfjsLib.OPS;
  const operatorList=await page.getOperatorList({annotationMode:pdfjsLib.AnnotationMode.DISABLE});
  if(!allowed())return null;
  const ids=new Set();
  operatorList.fnArray.forEach((op,index)=>{
    const args=operatorList.argsArray[index];
    if(op===ops.setFont) ids.add(args[0]);
    if(op===ops.setGState) args[0].forEach(([key,value])=>{if(key==='Font') ids.add(value[0]);});
  });
  const fonts=new Map();
  await Promise.all(Array.from(ids,async id=>{
    fonts.set(id,await new Promise(resolve=>page.commonObjs.get(id,resolve)));
  }));
  const optionalContent=await pdf.getOptionalContentConfig();
  if(!allowed())return null;
  const entries=pdfOperatorEntries(operatorList,fonts,viewport,ops,
    group=>optionalContent.isVisible(group));
  const {boxes,text}=pdfPageWords(entries,viewport.width,viewport.height,
    value=>applyLigatures(value,glyphs));
  const sentenceAt=bridgeSentenceFinder(text),parts=bridgeSentences(text);
  boxes.forEach(box=>{
    box.example=sentenceAt(box.offset);
    const part=parts.find(item=>box.offset>=item.start&&box.offset<=item.end);
    box.sentenceStart=part ? part.start : box.offset;
    box.tokenIndex=part&&typeof lookupSentenceTokens==='function'
      ? lookupSentenceTokens(text.slice(part.start,box.offset)).length : -1;
  });
  return boxes;
}

/* ================= markers ================= */

function makePdfWordMarker(page,box,className,status,wordKey){
  const marker=document.createElement('span');
  marker.className=`breeze-original-word ${className}${status ? ` s${status}` : ''}`;
  marker.textContent=box.word;
  marker.dataset.w=wordKey||keyOf(box.word);
  marker.dataset.example=box.example||'';
  if(Number.isInteger(box.tokenIndex)&&box.tokenIndex>=0)marker.dataset.clickedTokenIndex=String(box.tokenIndex);
  marker.dataset.readerAnchor=JSON.stringify({kind:'pdf',page:+page.dataset.page,y:box.y});
  if(className.includes('original-selection-marker'))wordLookupTargets.set(marker,
    {owner:page,start:`${box.x}:${box.y}`,end:`${box.w}:${box.h}`});
  marker.setAttribute('aria-hidden','true');
  marker.style.cssText=`left:${box.x*100}%;top:${box.y*100}%;width:${box.w*100}%;height:${box.h*100}%`;
  page.appendChild(marker);
  return marker;
}

function renderPdfSavedWordMarkers(page,boxes){
  if(!ownsPdfBoxes(page,boxes||[])) return;
  page.querySelectorAll('.original-saved-marker').forEach(marker=>marker.remove());
  const list=boxes||[],matches=list.map(box=>[box.word]);
  const claimed=new Map();
  if(typeof savedPhraseStarts==='function'&&typeof savedPhraseMatch==='function'){
    const starts=savedPhraseStarts();
    for(let index=0;index<matches.length;index++){
      const choices=[];lemmaCands(matches[index][0]).forEach(part=>(starts.get(part)||[]).forEach(item=>{if(!choices.includes(item))choices.push(item);}));
      for(const item of choices){const found=savedPhraseMatch(matches,index,item);if(!found)continue;
        found.selected.forEach(at=>claimed.set(at,item));index=found.end;break;}
    }
  }
  list.forEach((box,index)=>{
    const phrase=claimed.get(index);
    if(phrase&&phrase.w.mark!==false){makePdfWordMarker(page,box,'original-saved-marker phrase',phrase.w.status,phrase.key);return;}
    const key=keyOf(box.word);
    const saved=words[key];
    if(saved && saved.mark !== false) makePdfWordMarker(page,box,'original-saved-marker',saved.status,key);
  });
}

function pdfParagraphCue(page,matched,paragraphHint){
  if(!page || !matched || !matched.length) return null;
  const pageNumber=+page.dataset.page;
  const first=matched.slice().sort((a,b)=>a.y-b.y||a.x-b.x)[0];
  const paragraph=paragraphHint==null
    ? paragraphForSource(curBook,{kind:'pdf',page:pageNumber,y:first.y}) : paragraphHint;
  const start=paragraph==null ? null : sourceAnchorForParagraph(curBook,paragraph);
  const next=paragraph==null ? null : sourceAnchorForParagraph(curBook,paragraph+1);
  const pageBoxes=originalSession&&originalSession.wordBoxes.get(pageNumber)||matched;
  const lower=start&&start.page===pageNumber ? start.y-.01
    : start&&start.page<pageNumber ? 0 : Math.min(...matched.map(box=>box.y))-.01;
  const upper=next&&next.page===pageNumber ? next.y-.012
    : next&&next.page>pageNumber ? 1 : Math.max(...matched.map(box=>box.y+box.h))+.01;
  const paragraphBoxes=pageBoxes.filter(box=>box.y+box.h>=lower&&box.y<=upper);
  const bounds=paragraphBoxes.length ? paragraphBoxes : matched;
  const minMatched=Math.min(...bounds.map(box=>box.y));
  const maxMatched=Math.max(...bounds.map(box=>box.y+box.h));
  /* PDF의 원본 문단 경계는 반입 때 만든 sourceMap이 가장 잘 압니다. 다음 문단이
     같은 쪽에 있으면 그 직전까지, 쪽 끝이면 현재 문장이 닿는 데까지 칠합니다. */
  const top=start&&start.page===pageNumber ? Math.min(start.y,minMatched) : minMatched;
  let bottom=next&&next.page===pageNumber ? Math.max(maxMatched,next.y-.012) : maxMatched;
  bottom=Math.min(.985,Math.max(top+.018,bottom));
  const inside=pageBoxes.filter(box=>box.y+box.h>=top-.01&&box.y<=bottom+.01);
  const source=inside.length ? inside : matched;
  const left=Math.max(.008,Math.min(...source.map(box=>box.x))-.012);
  const right=Math.min(.992,Math.max(...source.map(box=>box.x+box.w))+.012);
  return {x:left,y:Math.max(.006,top-.008),right,bottom:Math.min(.994,bottom+.008)};
}

function showPdfModeCue(page,boxes,duration,paragraphHint){
  if(!boxes?.length || !ownsPdfBoxes(page,boxes)) return;
  const block=pdfParagraphCue(page,boxes,paragraphHint);
  if(!block) return;
  const cue=document.createElement('span'); cue.className='reader-mode-cue reader-mode-cue-block';
  if(paragraphHint!=null) cue.dataset.pi=paragraphHint;
  cue.style.cssText=`left:${block.x*100}%;top:${block.y*100}%;width:${(block.right-block.x)*100}%;height:${(block.bottom-block.y)*100}%`;
  page.appendChild(cue);
  if(duration) readerModeCueTimer=setTimeout(clearReaderModeCue,duration);
}

/* ---- 문장 하나만 칠하기 ----
   위의 `showPdfModeCue` 는 문단을 칠합니다. 모드를 옮길 때 "읽던 데가 여기"를
   가리키는 일이라 넓을수록 찾기 쉽습니다. 꾹 눌러 문장을 물어볼 때는 반대입니다 —
   무엇을 물어봤는지가 곧 그 문장이라, 문단을 칠하면 답과 질문이 어긋납니다.

   PDF 글리프 지도에 저장된 줄 ID로 묶어, 줄마다 실제 낱말의 경계까지 칠합니다 —
   글자 화면에서 문장 하나에 색이 차오르는 것과 같은 그림입니다. */
function showPdfSentenceCue(page,boxes){
  if(!boxes?.length || !ownsPdfBoxes(page,boxes)) return;
  const layer=createReaderSentenceCue(page,true),lines=new Map();
  boxes.forEach(box=>{
    if(!lines.has(box.line)) lines.set(box.line,[]);
    lines.get(box.line).push(box);
  });
  lines.forEach(items=>{
    const left=Math.min(...items.map(b=>b.x)),right=Math.max(...items.map(b=>b.x+b.w));
    const top=Math.min(...items.map(b=>b.y)),bottom=Math.max(...items.map(b=>b.y+b.h));
    const cue=document.createElement('span');cue.className='reader-sentence-cue';
    cue.style.cssText=`left:${left*100}%;top:${top*100}%;width:${(right-left)*100}%;height:${(bottom-top)*100}%`;
    layer.appendChild(cue);
  });
}

function showPdfParagraphModeCue(paragraph,duration,preferredPage){
  if(paragraph==null || !originalSession || !originalSession.pages) return false;
  const start=sourceAnchorForParagraph(curBook,paragraph);
  const next=sourceAnchorForParagraph(curBook,paragraph+1);
  if(!start || start.kind!=='pdf') return false;
  const pageNumber=Math.max(start.page,Math.min(Number(preferredPage)||start.page,
    next&&next.kind==='pdf' ? next.page : start.page));
  const page=originalSession.pages[pageNumber-1];
  const boxes=originalSession.wordBoxes.get(pageNumber)||[];
  if(!page) return false;
  const lower=pageNumber===start.page ? (start.y||0)-.01 : 0;
  const upper=next&&next.kind==='pdf'&&next.page===pageNumber ? (next.y||0)-.012 : 1;
  const inside=boxes.filter(box=>box.y+box.h>=lower&&box.y<=upper);
  const left=inside.length ? Math.max(.008,Math.min(...inside.map(box=>box.x))-.012) : .04;
  const right=inside.length ? Math.min(.992,Math.max(...inside.map(box=>box.x+box.w))+.012) : .96;
  const top=Math.max(.006,inside.length ? Math.min(...inside.map(box=>box.y))-.008 : lower);
  const bottom=Math.min(.994,Math.max(top+.018,
    inside.length ? Math.max(...inside.map(box=>box.y+box.h))+.008 : upper));
  const cue=document.createElement('span'); cue.className='reader-mode-cue reader-mode-cue-block';
  cue.dataset.pi=paragraph;
  cue.style.cssText=`left:${left*100}%;top:${top*100}%;width:${(right-left)*100}%;height:${(bottom-top)*100}%`;
  page.appendChild(cue);
  if(duration) readerModeCueTimer=setTimeout(clearReaderModeCue,duration);
  return true;
}

/* ================= tapping a word ================= */

function pdfWordAtPoint(page,clientX,clientY){
  if(!ownsPdfPage(page)) return null;
  const rect=page.getBoundingClientRect();
  if(!rect.width || !rect.height) return null;
  const boxes=originalSession.wordBoxes.get(+page.dataset.page)||[];
  const x=(clientX-rect.left)/rect.width, y=(clientY-rect.top)/rect.height;
  const padX=4/rect.width, padY=3/rect.height;
  let best=null, bestScore=Infinity;
  boxes.forEach(box=>{
    if(x<box.x-padX || x>box.x+box.w+padX || y<box.y-padY || y>box.y+box.h+padY) return;
    const dx=(x-(box.x+box.w/2))*rect.width;
    const dy=(y-(box.y+box.h/2))*rect.height;
    const score=dx*dx+dy*dy;
    if(score<bestScore){ best=box; bestScore=score; }
  });
  return best;
}

function pdfPageAtPoint(clientX,clientY){
  if(!currentPdfSession()) return null;
  const layout=pdfPageLayout();if(!layout)return null;
  const {rects,outer,scroller}=layout;
  const x=clientX-outer.left+scroller.scrollLeft,y=clientY-outer.top+scroller.scrollTop;
  const i=pdfPageIndexAtY(rects,y),r=rects[i];
  return r&&x>=r[0]&&x<=r[0]+r[2]&&y>=r[1]&&y<=r[1]+r[3]?originalSession.pages[i]:null;
}

function openPdfWord(page,box){
  if(!box || !ownsPdfBoxes(page,[box])) return;
  // openWord compares the old source occurrence before transferring marker ownership.
  const key=keyOf(box.word);
  /* Freeze the resolved key on the marker. keyOf() can legitimately change
     after a new lemma is saved; a selected marker must not change identity. */
  const marker=makePdfWordMarker(page,box,'original-selection-marker',words[key]&&words[key].mark!==false&&words[key].status,key);
  openWord(key,marker);
}

/* ================= anchors and mode bridging ================= */

function capturePdfAnchor(inset){
  const layout=pdfPageLayout();if(!layout)return null;
  const {rects,outer,scroller}=layout,y=inset-outer.top+scroller.scrollTop;
  const i=pdfPageIndexAtY(rects,y),r=rects[i];if(!r)return null;
  return {kind:'pdf',page:i+1,y:Math.max(0,Math.min(1,(y-r[1])/Math.max(1,r[3])))};
}

async function restorePdfAnchor(source,inset,changeToken,isCurrent){
  const session=originalSession;
  if(!currentPdfSession(session))return false;
  const pageNumber=Math.max(1,Math.min(originalSession.pages.length,Number(source.page)||1));
  const page=originalSession.pages[pageNumber-1];
  if(!page) return false;
  /* 화면 좌표(`getBoundingClientRect`)는 벌린 배율을 이미 담고 있고, 읽는 칸의
     `scrollTop` 도 같은 단위입니다. 그래서 이 셈은 배율이 얼마든 그대로입니다. */
  readerScrollTo(readerScrollTop()+page.getBoundingClientRect().top-inset);
  await renderOriginalPdfPage(originalSession,pageNumber);
  if(!ownsPdfPage(page,session) || (changeToken!=null && (changeToken!==readerModeChangeToken || currentReaderMode!=='original'))
      || (isCurrent&&!isCurrent())) return false;
  const rect=page.getBoundingClientRect();
  readerScrollTo(readerScrollTop()+rect.top-inset
    +Math.max(0,Math.min(1,Number(source.y)||0))*rect.height);
  return true;
}

function pdfSentenceBridge(source){
  const boxes=originalSession.wordBoxes.get(source.page)||[];
  const visual=boxes.filter(box=>box.y+box.h>=source.y-.01)
    .sort((a,b)=>Math.abs(a.y-b.y)<.012 ? a.x-b.x : a.y-b.y);
  const candidates=[];
  visual.forEach(box=>{
    const value=box.example&&box.example.trim();
    if(value && !candidates.includes(value) && candidates.length<4) candidates.push(value);
  });
  const paragraph=paragraphForSource(curBook,source);
  const match=candidates.length ? bridgeFindSequence(boxes,candidates[0]) : null;
  /* PDF 추출 문자열에는 간혹 보이지 않는 합자·기호가 섞여 문장 토큰 전체가
     일치하지 않습니다. 그래도 현재 앵커 바로 아래 첫 줄은 알고 있으므로, 그 줄을
     문단 단서로 넘깁니다. pdfParagraphCue가 sourceMap 경계까지 넓혀 칠합니다. */
  const first=visual[0];
  const fallback=first ? boxes.filter(box=>Math.abs(box.y-first.y)<.018) : [];
  return {candidates,source,paragraph,
    boxes:match ? boxes.slice(match.start,match.start+match.length) : fallback};
}

async function restorePdfSentence(candidates,source,changeToken,paragraphHint){
  const session=originalSession;
  if(!currentPdfSession(session))return false;
  const alive=()=>currentPdfSession(session)&&changeToken===readerModeChangeToken&&currentReaderMode==='original';
  const total=session.pages.length;
  const base=Math.max(1,Math.min(total,Number(source&&source.page)||1));
  const pages=[base,base+1,base-1,base+2,base-2,base+3,base-3,base+4,base-4]
    .filter((value,index,list)=>value>=1&&value<=total&&list.indexOf(value)===index);
  for(const pageNumber of pages){
    let boxes=session.wordBoxes.get(pageNumber)||[];
    if(!boxes.length){
      /* Looking at nearby page text is cheap; only paint a canvas after a
         sentence match, so the wider fallback does not render nine pages. */
      const pdfPage=await session.pdf.getPage(pageNumber);
      if(!alive())return false;
      const textContent=await pdfPage.getTextContent();
      if(!alive())return false;
      const stream=[];
      (textContent.items||[]).forEach(item=>
        stream.push(...bridgeTokens(applyLigatures(item.str||'',session.glyphs))));
      if(!(candidates||[]).some(candidate=>bridgeFindSequence(stream,candidate))) continue;
      await renderOriginalPdfPage(session,pageNumber);
      if(!alive())return false;
      boxes=session.wordBoxes.get(pageNumber)||[];
    }
    if(!alive()) return false;
    const list=candidates||[];
    for(let position=0; position<list.length; position++){
      /* 한 쪽 안에서만 찾으므로 near 는 0 이면 충분합니다. 뒤 문장까지 맞는
         자리가 있으면 그쪽을 고릅니다 — 같은 쪽에 같은 말이 두 번 나올 때. */
      const match=bridgeFindSequence(boxes,list[position],{follow:list[position+1]||'',near:0});
      if(!match) continue;
      const matched=boxes.slice(match.start,match.start+match.length);
      const first=matched.slice().sort((a,b)=>a.y-b.y||a.x-b.x)[0];
      const page=session.pages[pageNumber-1];
      const rect=page.getBoundingClientRect();
      readerScrollTo(readerScrollTop()+rect.top-(topInset()+readerViewHeight()*.32)+first.y*rect.height);
      if(!showPdfParagraphModeCue(paragraphHint,10000,pageNumber))
        showPdfModeCue(page,matched,10000,paragraphHint);
      return true;
    }
  }
  return false;
}

/* ================= 스캔본이라는 종이 =================
   탭은 낱말, 꾹 누르기는 이 문장 — 그 판정은 여기서 하지 않습니다
   (scripts/reader/gesture.js). 여기 있는 것은 "이 좌표에 무엇이 있는가"뿐입니다.

   예전에는 이 자리에 문서 전역 capture 리스너가 넷 있었고, 그중 `pointerup` 과
   `click` 이 **같은 탭을 두 번** 낱말 찾기로 보냈습니다. 그 둘을 450ms 벽시계로
   서로 걸렀고, 앞뒤로 `sentencePressBusy()` 를 세 번 물었습니다. 손짓을
   판정하는 주인이 생기면서 그 넷과 벽시계가 함께 사라졌습니다.

   `pdfPaperEvent` 도 없어졌습니다 — "떠 있는 것들"을 하나씩 세어 거르는 대신,
   종이라고 등록된 곳에서 시작한 손짓만 이 종이의 것입니다. 상단바·확대 단추·
   낱말 창·해석 창은 종이가 아니므로 애초에 여기까지 오지 않습니다. */

async function openPdfWordAt(clientX,clientY){
  const page=pdfPageAtPoint(clientX,clientY);
  if(!page) return false;
  const session=originalSession, pageNumber=+page.dataset.page;
  /* 캔버스는 먼저 보이고 단어 좌표표는 PDF.js의 textContent가 끝난 뒤 생깁니다.
     그 짧은 사이의 첫 탭을 버리면 두 번 눌러야 합니다. 같은 렌더 작업을 기다린
     뒤 사용자가 눌렀던 좌표로 다시 찾습니다. */
  if(!(session.wordBoxes.get(pageNumber)||[]).length){
    await renderOriginalPdfPage(session,pageNumber);
    if(!ownsPdfPage(page,session)) return false;
  }
  const box=pdfWordAtPoint(page,clientX,clientY);
  if(!box) return false;
  openPdfWord(page,box);
  return true;
}

registerReaderSurface({
  name:'pdf',
  claims(event){
    if(!currentPdfSession()) return false;
    const target=event.target;
    return !!(target && target.closest && target.closest('#originalwrap'));
  },
  document(){ return document; },
  openWordAt:openPdfWordAt,
  sentenceAt(clientX,clientY){
    if(!currentPdfSession()) return null;
    const page=pdfPageAtPoint(clientX,clientY);
    if(!page) return null;
    const box=pdfWordAtPoint(page,clientX,clientY);
    const sentence=box && box.example ? String(box.example).trim() : '';
    if(!sentence) return null;
    /* 같은 문장에서 잘라 낸 낱말 상자들이 곧 그 문장의 자리입니다 — 위의
       `buildPdfWordBoxes` 가 상자마다 `example` 을 적어 둡니다. 스캔본은 문단이
       아니라 그 문장의 줄들만 칠합니다: 무엇을 물어봤는지가 곧 그 문장이라
       문단을 칠하면 질문과 답이 어긋납니다. */
    const boxes=(originalSession.wordBoxes.get(+page.dataset.page)||[])
      .filter(item=>item.sentenceStart===box.sentenceStart);
    return { sentence, paint(){ showPdfSentenceCue(page,boxes); } };
  },
});

/* ---- 형식 표에 넘겨줄 조각들 (scripts/reader/original-formats.js) ---- */

function pdfAnchorFromProgress(session,progress){
  const total=Math.max(1,session.pages.length);
  const exact=progress*total;
  const page=Math.max(1,Math.min(total,Math.floor(exact)+1));
  return {kind:'pdf',page,y:Math.max(0,Math.min(1,exact-(page-1)))};
}
/* 진행도는 쪽 번호로 셉니다. 세션이 열려 있으면 진짜 쪽수를, 아니면 좌표
   지도가 아는 마지막 쪽을 전체로 봅니다. */
function pdfSourceProgress(map,source,session){
  const mapped=sourceMapFact(map,'lastPage',
    list=>list.reduce((max,item)=>Math.max(max,(item&&item.page)||0),0));
  const total=Math.max(1,session ? session.pages.length : 0,mapped,Number(source.page)||1);
  return Math.max(0,Math.min(1,((Math.max(1,Number(source.page)||1)-1)
    + Math.max(0,Math.min(1,Number(source.y)||0)))/total));
}
function refreshPdfSavedWords(session,statusKey=null){
  // Existing markers are recolored by paintWord; their source geometry is unchanged.
  if(statusKey!==null)return;
  session.pages.forEach((page,index)=>{
    if(page.dataset.wordCount) renderPdfSavedWordMarkers(page,session.wordBoxes.get(index+1));
  });
}
