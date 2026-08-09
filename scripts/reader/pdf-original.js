/* Original PDF reader: lazy PDF.js canvases plus a page-ratio word map.
   PDF.js의 글자 레이어는 눈에 보이는 캔버스와 별개의 좌표계입니다.
   패널이 열려 페이지 폭이 바뀌면 브라우저 selection 사각형은 쉽게 밀립니다.
   그래서 PDF 자체 좌표에서 단어 상자를 한 번 만들고 페이지 크기의 비율로
   저장합니다. 하이라이트와 클릭 판정이 같은 상자를 사용하므로 서로 어긋나지
   않으며, 화면 폭이 바뀌어도 다시 계산할 필요가 없습니다. */

let originalPdfPointer = null;

/* ================= 확대 =================
   손가락으로 화면을 벌리면 쪽만 커지는 것이 아니라 화면 전체가 커집니다 —
   뜻이 뜨는 바텀시트까지 함께 커져서, 작은 글씨를 보려고 벌릴수록 시트가
   화면을 덮습니다. 그래서 쪽만 키우는 단추를 둡니다. 시트와 떠 있는 단추는
   fixed 라 제 크기 그대로 남습니다.

   CSS 로 늘이기만 하면 캔버스가 흐려집니다. 그래서 지금 보고 있는 쪽은 새 너비로
   다시 그립니다 — 나머지는 화면에 들어올 때 관찰자가 알아서 다시 부릅니다.
   200쪽짜리를 통째로 다시 그리면 확대 한 번에 몇 초가 걸립니다. */
const PDF_ZOOM_STEPS = [1, 1.3, 1.7, 2.2, 3];
let pdfZoomStep = 0;

function paintPdfZoom(){
  /* 원본 세션은 글자 화면으로 돌아가도 열린 채 남습니다. 그래서 "PDF 세션이
     있는가"가 아니라 "지금 그 PDF 를 보고 있는가"로 판단합니다. */
  const live = currentReaderMode === 'original'
    && !!originalSession && originalSession.kind === 'pdf';
  document.documentElement.style.setProperty(
    '--pdf-zoom', String(live ? PDF_ZOOM_STEPS[pdfZoomStep] : 1));
  const zoomIn = document.getElementById('pdfzoom-in');
  const zoomOut = document.getElementById('pdfzoom-out');
  if(zoomIn){ zoomIn.hidden = !live; zoomIn.disabled = pdfZoomStep === PDF_ZOOM_STEPS.length-1; }
  if(zoomOut){ zoomOut.hidden = !live; zoomOut.disabled = pdfZoomStep === 0; }
}
function resetPdfZoom(){
  pdfZoomStep = 0;
  paintPdfZoom();
}

/* 옆으로 민 만큼은 쪽마다 따로 두지 않습니다. 한 줄을 읽으려고 오른쪽으로 밀어
   놓았는데 다음 쪽이 왼쪽 끝에서 시작하면, 쪽을 넘길 때마다 같은 손짓을 다시
   해야 합니다. 마지막으로 민 비율을 하나만 들고 다니며 새로 뜨는 쪽에 얹습니다. */
function applyPdfPan(session, pageElement){
  const lane = pageElement && pageElement.parentElement;
  if(!lane || !lane.classList.contains('pdf-page-lane')) return;
  const room = lane.scrollWidth - lane.clientWidth;
  lane.scrollLeft = room > 0 ? (session.panRatio || 0) * room : 0;
}

async function pdfZoom(direction){
  const session = originalSession;
  if(!session || session.kind !== 'pdf') return;
  const next = Math.max(0, Math.min(PDF_ZOOM_STEPS.length-1, pdfZoomStep + direction));
  if(next === pdfZoomStep) return;
  /* 확대해도 보던 자리는 그대로여야 합니다. 쪽 높이가 통째로 바뀌므로 픽셀이
     아니라 "몇 쪽의 어디쯤"으로 붙잡아 뒀다가 되돌립니다. */
  const inset = topInset()+10;
  const anchor = capturePdfAnchor(inset);
  pdfZoomStep = next;
  paintPdfZoom();
  /* 이미 그려 둔 캔버스는 옛 너비로 그린 그림이라, 늘리기만 하면 흐려집니다.
     지금 화면에 있는 쪽만 다시 그립니다 — 200쪽짜리를 통째로 다시 그리면
     확대 한 번에 몇 초가 걸리고, 나머지는 화면에 들어올 때 관찰자가 부릅니다. */
  session.rendering.clear();
  const visible = session.pages.filter(page => {
    const rect = page.getBoundingClientRect();
    return rect.bottom > -400 && rect.top < window.innerHeight + 400;
  });
  for(const page of visible) await renderOriginalPdfPage(session, +page.dataset.page);
  if(anchor) await restorePdfAnchor(anchor, inset, readerModeChangeToken);
}

async function openOriginalPdf(book,record,token){
  await ensurePdfLib();
  const pdf = await pdfjsLib.getDocument({data:await record.blob.arrayBuffer()}).promise;
  if(token!==originalLoadToken){ pdf.destroy(); return; }
  const content = document.getElementById('original-content');
  content.innerHTML='';
  content.className='original-content pdf-original';
  const first = await pdf.getPage(1);
  const firstViewport = first.getViewport({scale:1});
  const ratio = firstViewport.width/firstViewport.height;
  const pages=[];
  const session={kind:'pdf',bookId:book.id,hash:record.hash,pdf,pages,
                 glyphs:book.glyphs||null,panRatio:0,
                 rendering:new Map(),wordBoxes:new Map(),urls:[]};
  for(let pageNumber=1; pageNumber<=pdf.numPages; pageNumber++){
    const page=document.createElement('article');
    page.className='pdf-source-page';
    page.dataset.page=pageNumber;
    page.style.aspectRatio=String(ratio);
    page.innerHTML=`<div class="pdf-page-loading">${pageNumber}</div>`;
    /* 확대했을 때 옆으로 미는 칸. 배율이 1 이면 넘칠 것이 없어 아무 일도
       하지 않습니다 — 늘 있어도 평소에는 보이지 않습니다. */
    const lane=document.createElement('div');
    lane.className='pdf-page-lane';
    lane.appendChild(page);
    lane.addEventListener('scroll',()=>{
      const room=lane.scrollWidth-lane.clientWidth;
      if(room>0) session.panRatio=lane.scrollLeft/room;
    },{passive:true});
    content.appendChild(lane); pages.push(page);
  }
  originalSession=session;
  resetPdfZoom();                  // 앞 책의 배율을 물려받지 않습니다
  const hint=document.getElementById('original-selection-hint');
  if(hint) hint.textContent='단어를 한 번 눌러 뜻을 봐요';
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{ if(entry.isIntersecting) renderOriginalPdfPage(session,+entry.target.dataset.page); });
  },{rootMargin:'1300px 0px'});
  session.observer=observer;
  pages.forEach(page=>observer.observe(page));
  await renderOriginalPdfPage(session,1);
}

async function renderOriginalPdfPage(session,pageNumber){
  if(!session || session!==originalSession || session.rendering.has(pageNumber)) return session&&session.rendering.get(pageNumber);
  const job=(async()=>{
    const pageElement=session.pages[pageNumber-1];
    const page=await session.pdf.getPage(pageNumber);
    if(session!==originalSession) return;
    const base=page.getViewport({scale:1});
    const cssWidth=Math.max(240,pageElement.clientWidth||document.getElementById('original-content').clientWidth||700);
    const cssScale=cssWidth/base.width;
    const viewport=page.getViewport({scale:cssScale});
    const outputScale=Math.min(2,window.devicePixelRatio||1);
    const canvas=document.createElement('canvas');
    canvas.width=Math.floor(viewport.width*outputScale);
    canvas.height=Math.floor(viewport.height*outputScale);
    canvas.style.width=viewport.width+'px'; canvas.style.height=viewport.height+'px';
    const context=canvas.getContext('2d',{alpha:false});
    const transform=outputScale===1 ? null : [outputScale,0,0,outputScale,0,0];
    /* Placeholders all use the first page's proportions. When a page that has
       already scrolled past learns its real ratio, the height change would
       push the text the reader is looking at. Move the scroll by the same
       amount so the visible line never moves. */
    const before=pageElement.getBoundingClientRect();
    pageElement.innerHTML='';
    pageElement.style.aspectRatio=`${viewport.width}/${viewport.height}`;
    pageElement.appendChild(canvas);
    const after=pageElement.getBoundingClientRect();
    if(before.bottom<=0 && after.height!==before.height) window.scrollBy(0,after.height-before.height);
    await page.render({canvasContext:context,viewport,transform}).promise;
    const textContent=await page.getTextContent();
    const wordBoxes=buildPdfWordBoxes(textContent,viewport,session.glyphs);
    session.wordBoxes.set(pageNumber,wordBoxes);
    pageElement.dataset.wordCount=String(wordBoxes.length);
    renderPdfSavedWordMarkers(pageElement,wordBoxes);
    applyPdfPan(session,pageElement);
  })().catch(error=>console.warn('PDF page render skipped:',error));
  session.rendering.set(pageNumber,job);
  await job;
  return job;
}

/* ================= word map ================= */

function pdfTextTransform(viewport,item){
  if(pdfjsLib.Util && pdfjsLib.Util.transform){
    return pdfjsLib.Util.transform(viewport.transform,item.transform);
  }
  const a=viewport.transform, b=item.transform;
  return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],
    a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],
    a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
}

/* Widths come from the browser's own text metrics and are then rescaled to the
   width PDF.js reports for the item, so an unavailable embedded font only
   changes how the characters are distributed inside a known total. */
function pdfWordMeasurer(){
  const context=document.createElement('canvas').getContext('2d');
  if(!context) return value=>value.length;
  return (value,entry)=>{
    context.font=`${entry.fontHeight}px ${entry.fontFamily}`;
    return context.measureText(value).width;
  };
}

/* 글자 화면에서 되살린 붙임글자는 원본 화면에서도 같아야 합니다. 다르면
   같은 문장이 두 화면에서 다른 낱말이 되어, 모드를 바꿀 때 자리를 못 찾습니다. */
function buildPdfWordBoxes(textContent,viewport,glyphs){
  const styles=textContent.styles||{};
  const entries=(textContent.items||[]).map(item=>pdfTextEntry(
    pdfTextTransform(viewport,item),
    applyLigatures(item.str,glyphs),
    Math.abs((Number(item.width)||0)*viewport.scale),
    pdfFontAscentRatio(styles[item.fontName]||{}),
    (styles[item.fontName]||{}).fontFamily));
  const {boxes,text}=pdfPageWords(entries,pdfWordMeasurer(),viewport.width,viewport.height);
  boxes.forEach(box=>{ box.example=bridgeSentenceAt(text,box.offset); });
  return boxes;
}

/* ================= markers ================= */

function makePdfWordMarker(page,box,className,status,wordKey){
  const marker=document.createElement('span');
  marker.className=`breeze-original-word ${className}${status ? ` s${status}` : ''}`;
  marker.textContent=box.word;
  marker.dataset.w=wordKey||keyOf(box.word);
  marker.dataset.example=box.example||'';
  marker.setAttribute('aria-hidden','true');
  marker.style.cssText=`left:${box.x*100}%;top:${box.y*100}%;width:${box.w*100}%;height:${box.h*100}%`;
  page.appendChild(marker);
  return marker;
}

function renderPdfSavedWordMarkers(page,boxes){
  if(!page) return;
  page.querySelectorAll('.original-saved-marker').forEach(marker=>marker.remove());
  (boxes||[]).forEach(box=>{
    const key=keyOf(box.word);
    const saved=words[key];
    if(saved) makePdfWordMarker(page,box,'original-saved-marker',saved.status,key);
  });
}

function showPdfModeCue(page,boxes,duration){
  if(!page || !boxes || !boxes.length) return;
  const lines=[];
  boxes.slice().sort((a,b)=>Math.abs(a.y-b.y)<.012 ? a.x-b.x : a.y-b.y).forEach(box=>{
    let line=lines.find(item=>Math.abs(item.y-box.y)<Math.max(item.h,box.h)*.65);
    if(!line){ line={x:box.x,y:box.y,right:box.x+box.w,bottom:box.y+box.h,h:box.h}; lines.push(line); }
    else{ line.x=Math.min(line.x,box.x); line.y=Math.min(line.y,box.y); line.right=Math.max(line.right,box.x+box.w); line.bottom=Math.max(line.bottom,box.y+box.h); line.h=Math.max(line.h,box.h); }
  });
  lines.forEach(line=>{
    const cue=document.createElement('span'); cue.className='reader-mode-cue';
    cue.style.cssText=`left:${line.x*100}%;top:${line.y*100}%;width:${(line.right-line.x)*100}%;height:${(line.bottom-line.y)*100}%`;
    page.appendChild(cue);
  });
  if(duration) readerModeCueTimer=setTimeout(clearReaderModeCue,duration);
}

/* ================= tapping a word ================= */

function pdfWordAtPoint(page,clientX,clientY){
  if(!originalSession || originalSession.kind!=='pdf' || !page) return null;
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

function openPdfWord(page,box){
  if(!page || !box) return;
  clearOriginalSelectionMarkers();
  const key=keyOf(box.word);
  /* Freeze the resolved key on the marker. keyOf() can legitimately change
     after a new lemma is saved; a selected marker must not change identity. */
  const marker=makePdfWordMarker(page,box,'original-selection-marker',words[key]&&words[key].status,key);
  openWord(key,marker);
}

/* ================= anchors and mode bridging ================= */

function capturePdfAnchor(inset){
  const page=firstElementBelow(originalSession.pages,inset);
  if(!page) return null;
  const rect=page.getBoundingClientRect();
  return {kind:'pdf',page:+page.dataset.page,
          y:Math.max(0,Math.min(1,(inset-rect.top)/Math.max(1,rect.height)))};
}

async function restorePdfAnchor(source,inset,changeToken){
  const pageNumber=Math.max(1,Math.min(originalSession.pages.length,Number(source.page)||1));
  const page=originalSession.pages[pageNumber-1];
  if(!page) return false;
  window.scrollTo(0,Math.max(0,window.scrollY+page.getBoundingClientRect().top-inset));
  await renderOriginalPdfPage(originalSession,pageNumber);
  if(changeToken!=null && (changeToken!==readerModeChangeToken || currentReaderMode!=='original')) return false;
  const rect=page.getBoundingClientRect();
  window.scrollTo(0,Math.max(0,window.scrollY+rect.top-inset
    +Math.max(0,Math.min(1,Number(source.y)||0))*rect.height));
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
  if(!candidates.length) return null;
  const match=bridgeFindSequence(boxes,candidates[0]);
  return {candidates,source,boxes:match ? boxes.slice(match.start,match.start+match.length) : []};
}

async function restorePdfSentence(candidates,source,changeToken){
  const total=originalSession.pages.length;
  const base=Math.max(1,Math.min(total,Number(source&&source.page)||1));
  const pages=[base,base+1,base-1,base+2,base-2,base+3,base-3,base+4,base-4]
    .filter((value,index,list)=>value>=1&&value<=total&&list.indexOf(value)===index);
  for(const pageNumber of pages){
    let boxes=originalSession.wordBoxes.get(pageNumber)||[];
    if(!boxes.length){
      /* Looking at nearby page text is cheap; only paint a canvas after a
         sentence match, so the wider fallback does not render nine pages. */
      const pdfPage=await originalSession.pdf.getPage(pageNumber);
      const textContent=await pdfPage.getTextContent();
      const stream=[];
      (textContent.items||[]).forEach(item=>
        stream.push(...bridgeTokens(applyLigatures(item.str||'',originalSession.glyphs))));
      if(!(candidates||[]).some(candidate=>bridgeFindSequence(stream,candidate))) continue;
      await renderOriginalPdfPage(originalSession,pageNumber);
      boxes=originalSession.wordBoxes.get(pageNumber)||[];
    }
    if(changeToken!==readerModeChangeToken || currentReaderMode!=='original') return false;
    const list=candidates||[];
    for(let position=0; position<list.length; position++){
      /* 한 쪽 안에서만 찾으므로 near 는 0 이면 충분합니다. 뒤 문장까지 맞는
         자리가 있으면 그쪽을 고릅니다 — 같은 쪽에 같은 말이 두 번 나올 때. */
      const match=bridgeFindSequence(boxes,list[position],{follow:list[position+1]||'',near:0});
      if(!match) continue;
      const matched=boxes.slice(match.start,match.start+match.length);
      const first=matched.slice().sort((a,b)=>a.y-b.y||a.x-b.x)[0];
      const page=originalSession.pages[pageNumber-1];
      const rect=page.getBoundingClientRect();
      window.scrollTo(0,Math.max(0,window.scrollY+rect.top-topInset()-10+first.y*rect.height));
      showPdfModeCue(page,matched,10000);
      return true;
    }
  }
  return false;
}

/* A tap opens the word under the finger; a drag is a scroll, not a lookup. */
(function(){
  const content=document.getElementById('original-content');
  content.addEventListener('pointerdown',event=>{
    if(!originalSession || originalSession.kind!=='pdf' || event.button!==0) return;
    originalPdfPointer={id:event.pointerId,x:event.clientX,y:event.clientY};
  });
  content.addEventListener('pointercancel',()=>{ originalPdfPointer=null; });
  content.addEventListener('pointerup',event=>{
    if(!originalSession || originalSession.kind!=='pdf') return;
    const start=originalPdfPointer;
    originalPdfPointer=null;
    if(!start || start.id!==event.pointerId || Math.hypot(event.clientX-start.x,event.clientY-start.y)>9) return;
    const page=event.target.closest&&event.target.closest('.pdf-source-page');
    const box=pdfWordAtPoint(page,event.clientX,event.clientY);
    if(box) openPdfWord(page,box);
  });
})();

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
  const mapped=map.reduce((max,item)=>Math.max(max,(item&&item.page)||0),0);
  const total=Math.max(1,session ? session.pages.length : 0,mapped,Number(source.page)||1);
  return Math.max(0,Math.min(1,((Math.max(1,Number(source.page)||1)-1)
    + Math.max(0,Math.min(1,Number(source.y)||0)))/total));
}
function refreshPdfSavedWords(session){
  session.pages.forEach((page,index)=>{
    if(page.dataset.wordCount) renderPdfSavedWordMarkers(page,session.wordBoxes.get(index+1));
  });
}
