/* Original PDF/EPUB reader.
   Raw files live only in IndexedDB. PDF pages are rendered lazily with PDF.js;
   EPUB chapters are sanitised and shown in script-free sandboxed frames. */

let currentReaderMode = 'text';
let originalSession = null;
let originalLoadToken = 0;
let originalOpenJob = null;
let readerModeChangeToken = 0;
let originalSelectionNoticeAt = 0;
let originalPdfPointer = null;

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

function updateReaderModeControls(){
  const switcher = document.getElementById('reader-mode-switch');
  if(!switcher) return;
  const canReconnect = !!curBook && !curBook.builtin;
  const hasOriginalMode = canReconnect && (!curBook.original || curBook.original.kind !== 'txt');
  switcher.classList.toggle('available',hasOriginalMode);
  switcher.querySelectorAll('button').forEach(button=>{
    button.classList.toggle('on',button.dataset.mode===currentReaderMode);
    button.setAttribute('aria-pressed',button.dataset.mode===currentReaderMode ? 'true':'false');
  });
}

function rememberReaderMode(mode){
  if(!curBook) return;
  positions[curBook.id] = {...posOf(curBook.id),mode,t:Date.now()};
  save(LS_POS,positions);
}

async function switchReaderMode(mode,options){
  options = options || {};
  if(!curBook || (mode!=='text' && mode!=='original')) return;
  if(mode==='original' && curBook.builtin) return;

  const changeToken=++readerModeChangeToken;
  const bookAtStart=curBook;
  const previousMode = currentReaderMode;
  const textAnchor = previousMode==='text' ? captureAnchor() : null;
  let bridge = previousMode==='text'
    ? sourceAnchorForParagraph(curBook,(textAnchor||{}).pi)
    : captureOriginalAnchor();
  /* A quick round trip inside the same paragraph should return to the exact
     original page percentage, not merely that paragraph's first line. */
  const rememberedOriginal = posOf(curBook.id).original;
  if(previousMode==='text' && textAnchor && rememberedOriginal
      && paragraphForSource(curBook,rememberedOriginal)===textAnchor.pi){
    bridge=rememberedOriginal;
  }
  if(options.initial) bridge=null;
  if(previousMode!==mode) saveReadingState();
  if(typeof suspendReaderScrollSave==='function') suspendReaderScrollSave(1400);
  currentReaderMode = mode;
  rememberReaderMode(mode);
  closePanel();

  const textWrap = document.getElementById('readwrap');
  const originalWrap = document.getElementById('originalwrap');
  document.body.classList.toggle('reader-original',mode==='original');
  textWrap.hidden = mode==='original';
  originalWrap.hidden = mode!=='original';
  updateReaderModeControls();

  if(mode==='text'){
    const targetPi = paragraphForSource(curBook,bridge);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(changeToken!==readerModeChangeToken || curBook!==bookAtStart || currentReaderMode!=='text') return;
      if(targetPi!=null){
        const element = document.querySelector(`#rtext [data-pi="${targetPi}"]`);
        if(element) window.scrollTo(0,Math.max(0,window.scrollY+element.getBoundingClientRect().top-topInset()-10));
      }else{
        const position = posOf(curBook.id);
        if(!restoreAnchor(position)) window.scrollTo(0,position.y||0);
      }
      lastAnchor = captureAnchor();
      if(typeof suspendReaderScrollSave==='function') suspendReaderScrollSave(450);
      updatePfill();
    }));
    return;
  }

  const record = await originalGetForBook(curBook);
  if(!record){
    showOriginalReconnect(curBook);
    updatePfill();
    return;
  }
  if(options.reload) leaveOriginalReader();
  try{
    await renderOriginalBook(curBook,record);
    if(changeToken!==readerModeChangeToken || curBook!==bookAtStart || currentReaderMode!=='original') return;
    let target = bridge || posOf(curBook.id).original;
    if(!target && options.initial){
      target = record.kind==='pdf'
        ? {kind:'pdf',page:1,y:0}
        : {kind:'epub',href:'',spine:0,element:0};
    }
    target = target || sourceAnchorForParagraph(curBook,posOf(curBook.id).pi);
    await restoreOriginalAnchor(target,changeToken);
    if(changeToken!==readerModeChangeToken || curBook!==bookAtStart || currentReaderMode!=='original') return;
    /* EPUB images and webfonts can change a chapter's height just after load.
       Re-apply the same source anchor once, so browser scroll anchoring does
       not leave a first-open book halfway down the next chapter. */
    if(record.kind==='epub' && target){
      const sessionAtRestore=originalSession;
      setTimeout(()=>{
        if(originalSession===sessionAtRestore && changeToken===readerModeChangeToken
            && curBook===bookAtStart && currentReaderMode==='original'){
          suspendReaderScrollSave(450);
          restoreOriginalAnchor(target,changeToken);
        }
      },650);
    }
    if(typeof suspendReaderScrollSave==='function') suspendReaderScrollSave(500);
    updatePfill();
  }catch(error){
    if(changeToken!==readerModeChangeToken || curBook!==bookAtStart) return;
    console.error(error);
    showOriginalError(error);
  }
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
  if(!originalSession) return;
  if(originalSession.observer) originalSession.observer.disconnect();
  (originalSession.resizeObservers||[]).forEach(observer=>observer.disconnect());
  (originalSession.urls||[]).forEach(url=>URL.revokeObjectURL(url));
  if(originalSession.pdf){ try{ originalSession.pdf.destroy(); }catch(e){} }
  originalSession = null;
  const content = document.getElementById('original-content');
  if(content){ content.innerHTML=''; content.className='original-content'; }
}

async function openOriginalPdf(book,record,token){
  pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({data:await record.blob.arrayBuffer()}).promise;
  if(token!==originalLoadToken){ pdf.destroy(); return; }
  const content = document.getElementById('original-content');
  content.innerHTML='';
  content.className='original-content pdf-original';
  const first = await pdf.getPage(1);
  const firstViewport = first.getViewport({scale:1});
  const ratio = firstViewport.width/firstViewport.height;
  const pages=[];
  for(let pageNumber=1; pageNumber<=pdf.numPages; pageNumber++){
    const page=document.createElement('article');
    page.className='pdf-source-page';
    page.dataset.page=pageNumber;
    page.style.aspectRatio=String(ratio);
    page.innerHTML=`<div class="pdf-page-loading">${pageNumber}</div>`;
    content.appendChild(page); pages.push(page);
  }
  const session={kind:'pdf',bookId:book.id,hash:record.hash,pdf,pages,
                 rendering:new Map(),wordBoxes:new Map(),urls:[]};
  originalSession=session;
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
    pageElement.innerHTML='';
    pageElement.style.aspectRatio=`${viewport.width}/${viewport.height}`;
    pageElement.appendChild(canvas);
    await page.render({canvasContext:context,viewport,transform}).promise;
    const textContent=await page.getTextContent();
    if(textContent.items && textContent.items.length){
      const wordBoxes=buildPdfWordBoxes(textContent,viewport);
      session.wordBoxes.set(pageNumber,wordBoxes);
      pageElement.dataset.wordCount=String(wordBoxes.length);
      const layer=document.createElement('div');
      layer.className='pdf-text-layer';
      layer.style.width=viewport.width+'px'; layer.style.height=viewport.height+'px';
      layer.style.setProperty('--scale-factor',String(viewport.scale));
      layer.setAttribute('aria-hidden','true');
      pageElement.appendChild(layer);
      const task=pdfjsLib.renderTextLayer({textContentSource:textContent,container:layer,viewport,textDivs:[]});
      if(task&&task.promise) await task.promise;
      renderPdfSavedWordMarkers(pageElement,wordBoxes);
    }else pageElement.classList.add('scan-page');
  })().catch(error=>console.warn('PDF page render skipped:',error));
  session.rendering.set(pageNumber,job);
  await job;
  return job;
}

/* PDF.js의 글자 레이어는 눈에 보이는 캔버스와 별개의 좌표계입니다.
   패널이 열려 페이지 폭이 바뀌면 브라우저 selection 사각형은 쉽게 밀립니다.
   그래서 PDF 자체 좌표에서 단어 상자를 한 번 만들고 페이지 크기의 비율로
   저장합니다. 하이라이트와 클릭 판정이 같은 상자를 사용하므로 서로 어긋나지
   않으며, 화면 폭이 바뀌어도 다시 계산할 필요가 없습니다. */
function pdfTextTransform(viewport,item){
  if(pdfjsLib.Util && pdfjsLib.Util.transform){
    return pdfjsLib.Util.transform(viewport.transform,item.transform);
  }
  const a=viewport.transform, b=item.transform;
  return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],
    a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],
    a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
}

function buildPdfWordBoxes(textContent,viewport){
  const boxes=[];
  const canvas=document.createElement('canvas');
  const context=canvas.getContext('2d');
  const pageText=(textContent.items||[]).map(item=>item.str||'').join(' ');
  const wordPattern=/[A-Za-z](?:[A-Za-z'’\-]*[A-Za-z])?/g;
  (textContent.items||[]).forEach(item=>{
    const value=String(item.str||'');
    if(!value || !/[A-Za-z]/.test(value)) return;
    const tx=pdfTextTransform(viewport,item);
    const angle=Math.atan2(tx[1],tx[0]);
    const direction={x:Math.cos(angle),y:Math.sin(angle)};
    const normal={x:Math.sin(angle),y:-Math.cos(angle)};
    const fontHeight=Math.max(1,Math.hypot(tx[2],tx[3]));
    const style=(textContent.styles||{})[item.fontName]||{};
    const ascent=pdfFontAscentRatio(style)*fontHeight;
    const itemWidth=Math.max(1,Math.abs((Number(item.width)||0)*viewport.scale));
    if(context) context.font=`${fontHeight}px ${style.fontFamily||'sans-serif'}`;
    const measured=context ? context.measureText(value).width : value.length;
    const unit=measured>0 ? itemWidth/measured : itemWidth/Math.max(1,value.length);
    wordPattern.lastIndex=0;
    let match;
    while((match=wordPattern.exec(value))){
      const before=value.slice(0,match.index);
      const through=value.slice(0,match.index+match[0].length);
      const startMeasure=context ? context.measureText(before).width : before.length;
      const endMeasure=context ? context.measureText(through).width : through.length;
      const bounds=pdfWordBounds({x:tx[4],y:tx[5]},direction,normal,
        startMeasure*unit,Math.max(1,(endMeasure-startMeasure)*unit),ascent,fontHeight);
      const left=Math.max(0,Math.min(viewport.width,bounds.left));
      const top=Math.max(0,Math.min(viewport.height,bounds.top));
      const right=Math.max(left,Math.min(viewport.width,bounds.right));
      const bottom=Math.max(top,Math.min(viewport.height,bounds.bottom));
      boxes.push({
        word:match[0],
        x:left/viewport.width,
        y:top/viewport.height,
        w:Math.max(1,right-left)/viewport.width,
        h:Math.max(1,bottom-top)/viewport.height,
        example:originalSentence(pageText,match[0]),
      });
    }
  });
  return boxes;
}

function makePdfWordMarker(page,box,className,status){
  const marker=document.createElement('span');
  marker.className=`breeze-original-word ${className}${status ? ` s${status}` : ''}`;
  marker.textContent=box.word;
  marker.dataset.w=keyOf(box.word);
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
    const saved=words[keyOf(box.word)];
    if(saved) makePdfWordMarker(page,box,'original-saved-marker',saved.status);
  });
}

function renderEpubSavedWordHighlights(doc){
  const view=doc&&doc.defaultView;
  if(!doc || !view || !view.CSS || !view.CSS.highlights || !view.Highlight) return;
  ['breeze-saved-1','breeze-saved-2','breeze-saved-3'].forEach(name=>view.CSS.highlights.delete(name));
  const ranges=[[],[],[]];
  const walker=doc.createTreeWalker(doc.body,NodeFilter.SHOW_TEXT,{acceptNode(node){
    const parent=node.parentElement;
    if(!parent || !node.data || !/[A-Za-z]/.test(node.data)
        || parent.closest('script,style,noscript,textarea,.breeze-original-word')) return NodeFilter.FILTER_REJECT;
    return NodeFilter.FILTER_ACCEPT;
  }});
  const pattern=/[A-Za-z](?:[A-Za-z'’\-]*[A-Za-z])?/g;
  let node;
  while((node=walker.nextNode())){
    pattern.lastIndex=0;
    let match;
    while((match=pattern.exec(node.data))){
      const saved=words[keyOf(match[0])];
      if(!saved) continue;
      const range=doc.createRange();
      range.setStart(node,match.index); range.setEnd(node,match.index+match[0].length);
      ranges[Math.max(0,Math.min(2,(saved.status||1)-1))].push(range);
    }
  }
  ranges.forEach((items,index)=>{
    if(items.length) view.CSS.highlights.set(`breeze-saved-${index+1}`,new view.Highlight(...items));
  });
}

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
  const marker=makePdfWordMarker(page,box,'original-selection-marker',words[key]&&words[key].status);
  if(words[key]) selectWord(key,marker);
  else addWord(key,marker);
}

function epubMime(path){
  const ext=(path.split('.').pop()||'').toLowerCase();
  return ({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',
    woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',mp3:'audio/mpeg',mp4:'video/mp4'})[ext]
    || 'application/octet-stream';
}
function epubDirectory(path){ return path.includes('/') ? path.slice(0,path.lastIndexOf('/')+1) : ''; }
function cleanEpubReference(value){ return decodeURIComponent(String(value||'').split('#')[0].split('?')[0]); }

async function buildEpubResources(archive,session){
  const resources=new Map();
  const skip=/\.(?:x?html?|css|opf|ncx|xml)$/i;
  for(const path of Object.keys(archive.zip.files)){
    const file=archive.zip.files[path];
    if(file.dir || skip.test(path)) continue;
    try{
      const blob=new Blob([await file.async('arraybuffer')],{type:epubMime(path)});
      const url=URL.createObjectURL(blob);
      resources.set(decodeURIComponent(path),url); session.urls.push(url);
    }catch(e){}
  }
  return resources;
}

function rewriteEpubCssUrls(css,cssPath,resources){
  const base=epubDirectory(cssPath);
  return String(css||'').replace(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi,(all,quote,raw)=>{
    if(/^(?:data:|blob:)/i.test(raw)) return all;
    if(/^(?:https?:|javascript:|file:)/i.test(raw)) return 'url("")';
    const fragment=raw.includes('#') ? '#'+raw.split('#').slice(1).join('#') : '';
    const path=cleanEpubReference(joinPath(base,raw));
    const url=resources.get(path);
    return url ? `url("${url}${fragment}")` : 'url("")';
  });
}

async function resolveEpubCss(archive,path,resources,seen){
  path=decodeURIComponent(path); seen=seen||new Set();
  if(seen.has(path)) return '';
  seen.add(path);
  const file=archive.zip.file(path);
  if(!file) return '';
  let css=await file.async('text');
  const imports=[...css.matchAll(/@import\s+(?:url\()?\s*['"]?([^'"\s;)]+)['"]?\s*\)?\s*;/gi)];
  for(const match of imports){
    const importedPath=joinPath(epubDirectory(path),cleanEpubReference(match[1]));
    const imported=await resolveEpubCss(archive,importedPath,resources,seen);
    css=css.replace(match[0],imported);
  }
  return rewriteEpubCssUrls(css,path,resources);
}

async function sanitiseEpubChapter(archive,chapter,resources){
  const file=archive.zip.file(chapter.path) || archive.zip.file(decodeURIComponent(chapter.href));
  if(!file) return '';
  const doc=new DOMParser().parseFromString(await file.async('text'),'text/html');
  doc.querySelectorAll('script,iframe,frame,object,embed,form,input,button,textarea,meta[http-equiv],base').forEach(node=>node.remove());
  doc.querySelectorAll('*').forEach(element=>{
    [...element.attributes].forEach(attribute=>{
      if(/^on/i.test(attribute.name) || attribute.name==='srcdoc'
          || /^(?:javascript:|data:text\/html)/i.test(attribute.value.trim())){
        element.removeAttribute(attribute.name);
      }
    });
  });
  doc.querySelectorAll('[srcset]').forEach(element=>element.removeAttribute('srcset'));
  let elementIndex=0;
  doc.querySelectorAll('p,h1,h2,h3,h4,li,img,image').forEach(element=>{
    element.dataset.breezeEi=String(elementIndex++);
  });
  const base=epubDirectory(chapter.path);
  const cssParts=[];
  for(const link of [...doc.querySelectorAll('link[rel~="stylesheet"][href]')]){
    const cssPath=joinPath(base,cleanEpubReference(link.getAttribute('href')));
    cssParts.push(await resolveEpubCss(archive,cssPath,resources));
    link.remove();
  }
  doc.querySelectorAll('style').forEach(style=>{
    style.textContent=rewriteEpubCssUrls(style.textContent,chapter.path,resources);
  });
  doc.querySelectorAll('[style]').forEach(element=>{
    element.setAttribute('style',rewriteEpubCssUrls(element.getAttribute('style'),chapter.path,resources));
  });
  doc.querySelectorAll('[src]').forEach(element=>{
    const raw=element.getAttribute('src');
    if(!raw || /^(?:data:|blob:)/i.test(raw)) return;
    const path=joinPath(base,cleanEpubReference(raw));
    if(resources.has(path)) element.setAttribute('src',resources.get(path));
    else element.removeAttribute('src');
    element.removeAttribute('srcset');
  });
  doc.querySelectorAll('image').forEach(element=>{
    const raw=element.getAttribute('href')||element.getAttribute('xlink:href');
    if(!raw) return;
    const path=joinPath(base,cleanEpubReference(raw));
    if(resources.has(path)){
      element.setAttribute('href',resources.get(path));
      element.setAttribute('xlink:href',resources.get(path));
    }
  });
  doc.querySelectorAll('a[href]').forEach(anchor=>{
    const raw=anchor.getAttribute('href')||'';
    if(/^javascript:/i.test(raw)) anchor.removeAttribute('href');
    else if(/^https?:/i.test(raw)){ anchor.target='_blank'; anchor.rel='noopener noreferrer'; }
    else if(!raw.startsWith('#')){
      anchor.dataset.epubHref=joinPath(base,cleanEpubReference(raw));
      anchor.removeAttribute('href');
    }
  });
  const safety=`html,body{max-width:100%;min-height:1px}img,svg,video{max-width:100%;height:auto}
    .breeze-original-word{border-radius:.18em;cursor:pointer}.breeze-original-word:hover{background:rgba(37,137,190,.18)}
    .breeze-original-word.s1{background:rgba(255,226,138,.45)}.breeze-original-word.s2{background:rgba(255,171,120,.42)}
    .breeze-original-word.s3{background:rgba(255,140,140,.42)}::selection{background:rgba(37,137,190,.3)}
    ::highlight(breeze-saved-1){background:rgba(255,226,138,.28)}
    ::highlight(breeze-saved-2){background:rgba(255,171,120,.25)}
    ::highlight(breeze-saved-3){background:rgba(255,140,140,.27)}`;
  const style=doc.createElement('style'); style.textContent=cssParts.join('\n')+'\n'+safety; doc.head.appendChild(style);
  return '<!doctype html>'+doc.documentElement.outerHTML;
}

async function openOriginalEpub(book,record,token){
  const archive=await openEpubArchive(record.blob);
  if(token!==originalLoadToken) return;
  const content=document.getElementById('original-content');
  content.innerHTML=''; content.className='original-content epub-original';
  const session={kind:'epub',bookId:book.id,hash:record.hash,archive,urls:[],frames:[],frameReady:[],resizeObservers:[]};
  originalSession=session;
  const hint=document.getElementById('original-selection-hint');
  if(hint) hint.textContent='단어는 더블클릭하거나 드래그해서 선택해요';
  const resources=await buildEpubResources(archive,session);
  for(let index=0; index<archive.spine.length; index++){
    if(token!==originalLoadToken) return;
    const chapter=archive.spine[index];
    const html=await sanitiseEpubChapter(archive,chapter,resources);
    if(!html) continue;
    const section=document.createElement('section');
    section.className='epub-source-chapter'; section.dataset.spine=index; section.dataset.href=chapter.path;
    const frame=document.createElement('iframe');
    frame.className='epub-chapter-frame'; frame.setAttribute('sandbox','allow-same-origin');
    frame.setAttribute('scrolling','no'); frame.title=`${book.title} ${index+1}`;
    const ready=new Promise(resolve=>{
      frame.onload=()=>{
        const frameDoc=frame.contentDocument;
        const resize=()=>{
          if(!frameDoc) return;
          frame.style.height=Math.max(60,Math.ceil(frameDoc.documentElement.scrollHeight))+'px';
        };
        resize(); setTimeout(resize,80); setTimeout(resize,500);
        if(window.ResizeObserver && frameDoc){
          const observer=new ResizeObserver(resize); observer.observe(frameDoc.documentElement);
          session.resizeObservers.push(observer);
        }
        if(frameDoc) frameDoc.addEventListener('pointerup',()=>{
          setTimeout(()=>openOriginalSelection(frameDoc),0);
        });
        if(frameDoc) renderEpubSavedWordHighlights(frameDoc);
        resolve(frame);
      };
    });
    frame.srcdoc=html; section.appendChild(frame); content.appendChild(section);
    session.frames[index]=frame; session.frameReady[index]=ready;
  }
  await Promise.all(session.frameReady.filter(Boolean).slice(0,2));
}

function originalSentence(text,word){
  const clean=String(text||'').replace(/\s+/g,' ').trim();
  if(clean.length<=500) return clean;
  const sentences=clean.match(/[^.!?…]+[.!?…]*/g)||[clean];
  const lower=String(word||'').toLowerCase();
  const match=sentences.find(sentence=>sentence.toLowerCase().includes(lower))||sentences[0];
  return match.trim().slice(0,700);
}

function clearOriginalSelectionMarkers(){
  readerWordNodes('.original-selection-marker').forEach(marker=>marker.remove());
}

/* PDF.js의 투명 글자 span을 잘라 다시 감싸면 원본의 transform이 깨져서
   선택 범위가 옆 단어까지 번집니다. 브라우저가 실제로 선택한 한 단어만
   받아서, 본문을 수정하지 않는 독립 하이라이트를 얹습니다. */
function openOriginalSelection(doc){
  const selection=doc&&doc.getSelection ? doc.getSelection() : null;
  if(!selection || selection.isCollapsed || !selection.rangeCount) return;
  const raw=selection.toString().replace(/^[^A-Za-z]+|[^A-Za-z'’\-]+$/g,'').trim();
  if(!/^[A-Za-z](?:[A-Za-z'’\-]*[A-Za-z])?$/.test(raw)){
    if(/[A-Za-z]/.test(raw) && Date.now()-originalSelectionNoticeAt>1800){
      originalSelectionNoticeAt=Date.now();
      toast('단어 하나만 선택해 주세요');
    }
    return;
  }
  const range=selection.getRangeAt(0);
  let owner=range.commonAncestorContainer;
  if(owner.nodeType!==1) owner=owner.parentElement;
  if(!owner || (owner.closest&&owner.closest('a'))) return;
  const rect=[...range.getClientRects()].find(item=>item.width>0&&item.height>0);
  if(!rect) return;
  clearOriginalSelectionMarkers();
  const marker=doc.createElement('span');
  marker.className='breeze-original-word original-selection-marker';
  marker.textContent=raw;
  const key=keyOf(raw); marker.dataset.w=key;
  const block=owner.closest&&owner.closest('p,li,blockquote,h1,h2,h3,h4');
  const pageText=!block&&doc===document ? owner.closest('.pdf-text-layer') : null;
  marker.dataset.example=originalSentence((block||pageText||owner).textContent,raw);
  marker.setAttribute('aria-hidden','true');
  if(words[key]) marker.classList.add('s'+words[key].status);
  if(doc===document){
    const page=owner.closest&&owner.closest('.pdf-source-page');
    if(!page) return;
    const pageRect=page.getBoundingClientRect();
    marker.style.cssText=`left:${rect.left-pageRect.left}px;top:${rect.top-pageRect.top}px;width:${rect.width}px;height:${rect.height}px`;
    page.appendChild(marker);
  }else{
    marker.style.cssText=`position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;pointer-events:none;z-index:2147483646;color:transparent;background:rgba(37,137,190,.25);border-radius:3px`;
    doc.body.appendChild(marker);
  }
  selection.removeAllRanges();
  if(words[key]) selectWord(key,marker);
  else addWord(key,marker);
}

function captureOriginalAnchor(){
  if(!originalSession) return null;
  const inset=topInset()+10;
  if(originalSession.kind==='pdf'){
    const page=originalSession.pages.find(element=>element.getBoundingClientRect().bottom>inset);
    if(!page) return null;
    const rect=page.getBoundingClientRect();
    return {kind:'pdf',page:+page.dataset.page,y:Math.max(0,Math.min(1,(inset-rect.top)/Math.max(1,rect.height)))};
  }
  const chapters=[...document.querySelectorAll('.epub-source-chapter')];
  const section=chapters.find(element=>element.getBoundingClientRect().bottom>inset);
  if(!section) return null;
  const spine=+section.dataset.spine;
  const frame=originalSession.frames[spine];
  const doc=frame&&frame.contentDocument;
  let element=0;
  if(doc){
    const frameTop=frame.getBoundingClientRect().top;
    const nodes=[...doc.querySelectorAll('[data-breeze-ei]')];
    const found=nodes.find(node=>frameTop+node.getBoundingClientRect().bottom>inset);
    if(found) element=+found.dataset.breezeEi;
  }
  return {kind:'epub',href:section.dataset.href||'',spine,element};
}

async function restoreOriginalAnchor(source,changeToken){
  if(!source || !originalSession){ window.scrollTo(0,0); return false; }
  const inset=topInset()+10;
  if(originalSession.kind==='pdf'){
    const pageNumber=Math.max(1,Math.min(originalSession.pages.length,Number(source.page)||1));
    const page=originalSession.pages[pageNumber-1];
    window.scrollTo(0,Math.max(0,window.scrollY+page.getBoundingClientRect().top-inset));
    await renderOriginalPdfPage(originalSession,pageNumber);
    if(changeToken!=null && (changeToken!==readerModeChangeToken || currentReaderMode!=='original')) return false;
    const rect=page.getBoundingClientRect();
    window.scrollTo(0,Math.max(0,window.scrollY+rect.top-inset+Math.max(0,Math.min(1,Number(source.y)||0))*rect.height));
    return true;
  }
  const spine=Math.max(0,Math.min(originalSession.frames.length-1,Number(source.spine)||0));
  const frame=originalSession.frames[spine];
  if(!frame) return false;
  if(originalSession.frameReady[spine]) await originalSession.frameReady[spine];
  const doc=frame.contentDocument;
  const element=doc&&doc.querySelector(`[data-breeze-ei="${Math.max(0,Number(source.element)||0)}"]`);
  const offset=(element ? element.getBoundingClientRect().top : 0);
  window.scrollTo(0,Math.max(0,window.scrollY+frame.getBoundingClientRect().top+offset-inset));
  return true;
}

document.getElementById('original-content').addEventListener('click',event=>{
  const marker=event.target.closest&&event.target.closest('.original-selection-marker');
  if(!marker) return;
  const key=marker.dataset.w||keyOf(marker.textContent);
  if(words[key]) selectWord(key,marker);
});
document.getElementById('original-content').addEventListener('pointerdown',event=>{
  if(!originalSession || originalSession.kind!=='pdf' || event.button!==0) return;
  originalPdfPointer={id:event.pointerId,x:event.clientX,y:event.clientY};
});
document.getElementById('original-content').addEventListener('pointercancel',()=>{
  originalPdfPointer=null;
});
document.getElementById('original-content').addEventListener('pointerup',event=>{
  if(!originalSession || originalSession.kind!=='pdf') return;
  const start=originalPdfPointer;
  originalPdfPointer=null;
  if(!start || start.id!==event.pointerId || Math.hypot(event.clientX-start.x,event.clientY-start.y)>9) return;
  const page=event.target.closest&&event.target.closest('.pdf-source-page');
  const box=pdfWordAtPoint(page,event.clientX,event.clientY);
  if(box) openPdfWord(page,box);
});
