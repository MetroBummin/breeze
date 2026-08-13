/* Original PDF reader: lazy PDF.js canvases plus a page-ratio word map.
   PDF.js의 글자 레이어는 눈에 보이는 캔버스와 별개의 좌표계입니다.
   패널이 열려 페이지 폭이 바뀌면 브라우저 selection 사각형은 쉽게 밀립니다.
   그래서 PDF 자체 좌표에서 단어 상자를 한 번 만들고 페이지 크기의 비율로
   저장합니다. 하이라이트와 클릭 판정이 같은 상자를 사용하므로 서로 어긋나지
   않으며, 화면 폭이 바뀌어도 다시 계산할 필요가 없습니다. */

let originalPdfPointer = null;
let pdfDrawToken = 0;

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

/* 새로 그릴 때마다 훑습니다. "자리를 새로 얻을 때 남는 자리를 만든다"는 뜻이라,
   가만히 있으면 아무 일도 안 하고 늘어날 때만 정리합니다. 놓친 쪽이 있어도
   다음 렌더가 다시 훑으므로 영영 남지 않습니다. */
function releaseDistantPdfPages(session,exceptPage){
  if(!session || session!==originalSession || session.kind!=='pdf') return;
  session.settled.forEach(pageNumber=>{
    if(pageNumber===exceptPage) return;
    const pageElement=session.pages[pageNumber-1];
    if(!pageElement) return;
    const rect=pageElement.getBoundingClientRect();
    if(rect.bottom>-PDF_KEEP_REACH && rect.top<PDF_KEEP_REACH+readerViewHeight()) return;
    releaseOriginalPdfPage(session,pageNumber);
  });
}

function releaseOriginalPdfPage(session,pageNumber){
  session.settled.delete(pageNumber);
  session.rendering.delete(pageNumber);
  session.drawnAt.delete(pageNumber);
  session.drawToken.delete(pageNumber);   // 아직 도는 일감이 있으면 이걸로 물러납니다
  session.wordBoxes.delete(pageNumber);
  const pageElement=session.pages[pageNumber-1];
  if(!pageElement) return;
  /* DOM 에서 떼는 것만으로는 모자랍니다. 크기를 0 으로 만들어야 브라우저가 뒤에
     잡아 둔 그림판(iOS 에서는 GPU 쪽)을 그 자리에서 놓습니다. */
  const canvas=pageElement.querySelector('canvas');
  if(canvas){ canvas.width=0; canvas.height=0; }
  delete pageElement.dataset.wordCount;
  pageElement.innerHTML=`<div class="pdf-page-loading">${pageNumber}</div>`;
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
  if(typeof updateOriginalZoomControls === 'function') updateOriginalZoomControls();
  const hint=document.getElementById('original-selection-hint');
  if(hint) hint.textContent='단어를 한 번 눌러 뜻을 봐요';
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{ if(entry.isIntersecting) renderOriginalPdfPage(session,+entry.target.dataset.page); });
  },{root:readerScroller(),rootMargin:'1300px 0px'});
  session.observer=observer;
  pages.forEach(page=>observer.observe(page));
  await renderOriginalPdfPage(session,1);
}

async function renderOriginalPdfPage(session,pageNumber,options){
  if(!session || session!==originalSession) return;
  const zoom=Math.min(PDF_MAX_RENDER_ZOOM,Math.max(1,originalZoom()));
  const drawn=session.rendering.get(pageNumber);
  if(drawn){
    /* 이미 그려진 쪽입니다. 벌린 만큼 눈에 띄게 흐려졌을 때만 다시 그립니다 —
       1.25배까지는 넉넉히 그려 둔 여유(PDF_OVERSAMPLE)로 버팁니다. */
    if(!options || !options.resharpen) return drawn;
    if(zoom <= (session.drawnAt.get(pageNumber)||1) * 1.25) return drawn;
  }
  const redraw=!!drawn;
  session.drawnAt.set(pageNumber,zoom);
  /* 이 쪽에 대해 지금 유효한 일감. 도중에 이 쪽을 놓아 주면 이 표가 지워지고,
     그러면 아래의 `alive()` 가 거짓이 되어 일감이 조용히 물러납니다. */
  const drawToken=++pdfDrawToken;
  session.drawToken.set(pageNumber,drawToken);
  const alive=()=>session===originalSession && session.drawToken.get(pageNumber)===drawToken;
  /* 그리기 전에 한 번, 그리고 나서 또 한 번 훑습니다. 멀리 건너뛰면 떠나온 자리의
     쪽들과 새 자리의 쪽들이 잠깐 함께 남는데, 앞의 한 번이 그 겹침을 없앱니다 —
     가장 크게 잡히는 순간이 곧 이 기능의 한도라서, 그 봉우리를 깎는 일입니다. */
  releaseDistantPdfPages(session,pageNumber);
  const job=(async()=>{
    const pageElement=session.pages[pageNumber-1];
    const page=await session.pdf.getPage(pageNumber);
    if(!alive()) return;
    const base=page.getViewport({scale:1});
    /* 레이아웃 폭은 벌려도 안 변합니다 — 커지는 것은 바깥의 `transform` 뿐입니다.
       그래서 이 값은 늘 같고, 벌릴 때마다 문서가 다시 흐르지 않습니다. */
    const cssWidth=Math.max(240,pageElement.clientWidth||document.getElementById('original-content').clientWidth||700);
    const cssScale=cssWidth/base.width;
    const viewport=page.getViewport({scale:cssScale});
    const outputScale=Math.min(4,(window.devicePixelRatio||1)*PDF_OVERSAMPLE*zoom);
    const canvas=document.createElement('canvas');
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
      if(!alive()) return;
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
    pageElement.innerHTML='';
    pageElement.style.aspectRatio=`${viewport.width}/${viewport.height}`;
    pageElement.appendChild(canvas);
    const after=pageElement.getBoundingClientRect();
    if(before.bottom<=0 && after.height!==before.height) readerScrollBy(after.height-before.height);
    await page.render({canvasContext:context,viewport,transform}).promise;
    const textContent=await page.getTextContent();
    if(!alive()) return;
    const wordBoxes=buildPdfWordBoxes(textContent,viewport,session.glyphs);
    if(!alive()) return;
    session.wordBoxes.set(pageNumber,wordBoxes);
    pageElement.dataset.wordCount=String(wordBoxes.length);
    renderPdfSavedWordMarkers(pageElement,wordBoxes);
  })().catch(error=>console.warn('PDF page render skipped:',error));
  /* 다시 그리는 동안에도 "이 쪽은 그려졌다"는 사실은 그대로 둡니다 — 실패해도
     옛 캔버스가 그 자리에 남아 있으니까요. */
  if(!redraw) session.rendering.set(pageNumber,job);
  await job;
  /* 다 그려진 쪽만 놓아 줄 수 있습니다. 이 쪽 자신은 빼고 훑습니다 — 자리를
     되돌리기 전에 미리 그려 두는 곳이 있어서(restorePdfSentence), 방금 그린
     것을 그 자리에서 도로 놓으면 헛일이 됩니다. */
  if(alive()) session.settled.add(pageNumber);
  releaseDistantPdfPages(session,pageNumber);
  return job;
}

/* ---- 손을 뗀 뒤 다시 또렷하게 ----
   벌리는 도중에는 안 합니다. 긴 PDF 에서 쪽마다 캔버스를 다시 그리면 손짓이
   끊깁니다. 보이는 쪽과 그 위아래 한 화면씩만 손봅니다.
   부르는 곳은 `scripts/reader/reader-scroll.js` 의 손짓이 끝나는 자리입니다. */
function resharpenOriginalPages(){
  const session=originalSession;
  if(!session || session.kind!=='pdf') return;
  const reach=readerViewHeight();
  session.pages.forEach((pageElement,index)=>{
    if(!session.rendering.has(index+1)) return;
    const rect=pageElement.getBoundingClientRect();
    if(rect.bottom < -reach || rect.top > reach*2) return;
    renderOriginalPdfPage(session,index+1,{resharpen:true});
  });
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
  const sentenceAt=bridgeSentenceFinder(text);
  boxes.forEach(box=>{ box.example=sentenceAt(box.offset); });
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
  if(!page || !boxes || !boxes.length) return;
  const block=pdfParagraphCue(page,boxes,paragraphHint);
  if(!block) return;
  const cue=document.createElement('span'); cue.className='reader-mode-cue reader-mode-cue-block';
  if(paragraphHint!=null) cue.dataset.pi=paragraphHint;
  cue.style.cssText=`left:${block.x*100}%;top:${block.y*100}%;width:${(block.right-block.x)*100}%;height:${(block.bottom-block.y)*100}%`;
  page.appendChild(cue);
  if(duration) readerModeCueTimer=setTimeout(clearReaderModeCue,duration);
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

function pdfPageAtPoint(clientX,clientY){
  if(!originalSession || !originalSession.pages) return null;
  return originalSession.pages.find(page=>{
    const rect=page.getBoundingClientRect();
    return clientX>=rect.left && clientX<=rect.right && clientY>=rect.top && clientY<=rect.bottom;
  })||null;
}

function openPdfWord(page,box){
  if(!page || !box) return;
  clearOriginalSelectionMarkers();
  const key=keyOf(box.word);
  /* Freeze the resolved key on the marker. keyOf() can legitimately change
     after a new lemma is saved; a selected marker must not change identity. */
  const marker=makePdfWordMarker(page,box,'original-selection-marker',words[key]&&words[key].mark!==false&&words[key].status,key);
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
  /* 화면 좌표(`getBoundingClientRect`)는 벌린 배율을 이미 담고 있고, 읽는 칸의
     `scrollTop` 도 같은 단위입니다. 그래서 이 셈은 배율이 얼마든 그대로입니다. */
  readerScrollTo(readerScrollTop()+page.getBoundingClientRect().top-inset);
  await renderOriginalPdfPage(originalSession,pageNumber);
  if(changeToken!=null && (changeToken!==readerModeChangeToken || currentReaderMode!=='original')) return false;
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
      readerScrollTo(readerScrollTop()+rect.top-(topInset()+readerViewHeight()*.32)+first.y*rect.height);
      if(!showPdfParagraphModeCue(paragraphHint,10000,pageNumber))
        showPdfModeCue(page,matched,10000,paragraphHint);
      return true;
    }
  }
  return false;
}

/* A tap opens the word under the finger; a drag is a scroll, not a lookup. */
(function(){
  const content=document.getElementById('original-content');
  /* 파란 표시·저장 단어 마커가 PDF 위에 올라와 있습니다. 그 레이어가 자기
     이벤트를 멈춰도, 읽는 칸의 capture 단계에서 탭 시작점을 먼저 기억합니다. */
  content.addEventListener('pointerdown',event=>{
    if(!originalSession || originalSession.kind!=='pdf') return;
    /* Touch PointerEvent의 button 값은 브라우저마다 0/-1로 다릅니다. 마우스의
       오른쪽·가운데 버튼만 걸러야 한 번 탭한 단어도 놓치지 않습니다. */
    if(event.pointerType==='mouse' && event.button!==0) return;
    if(!event.isPrimary){ originalPdfPointer=null; return; }
    originalPdfPointer={id:event.pointerId,x:event.clientX,y:event.clientY};
  },true);
  content.addEventListener('pointercancel',()=>{ originalPdfPointer=null; });
  content.addEventListener('pointerup',event=>{
    if(!originalSession || originalSession.kind!=='pdf') return;
    const start=originalPdfPointer;
    originalPdfPointer=null;
    if(!start || start.id!==event.pointerId || Math.hypot(event.clientX-start.x,event.clientY-start.y)>9) return;
    /* PDF canvas, 선택 마커, 모드 표시 중 무엇을 눌렀는지는 중요하지 않습니다.
       좌표 아래의 종이를 직접 찾으면 겹친 레이어가 바뀌어도 한 번 탭은 항상 같습니다. */
    const page=pdfPageAtPoint(event.clientX,event.clientY);
    const box=pdfWordAtPoint(page,event.clientX,event.clientY);
    if(box) openPdfWord(page,box);
  },true);
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
