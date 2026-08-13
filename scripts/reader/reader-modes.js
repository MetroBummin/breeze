/* Switching between the reflowed 글자 view and the 원본 document.
   The two views have completely different heights, so the switch is described
   by the sentence the reader can actually see, with the importer's coordinate
   map as the fallback. */

let readerModeCueTimer = 0;
let recentModeLanding = null;
let textModeMovedByUser = false;

/* 프로그램이 앵커를 가운데로 맞춘 스크롤과 사람이 읽으며 움직인 스크롤은 다릅니다.
   scroll 이벤트만 보면 둘을 구분할 수 없어서 실제 입력만 기록합니다. */
document.addEventListener('DOMContentLoaded',()=>{
  const box=readerScroller(); if(!box) return;
  const moved=()=>{ if(currentReaderMode==='text') textModeMovedByUser=true; };
  box.addEventListener('wheel',moved,{passive:true});
  box.addEventListener('touchmove',moved,{passive:true});
  box.addEventListener('keydown',event=>{
    if(['PageDown','PageUp','ArrowDown','ArrowUp','Home','End',' '].includes(event.key)) moved();
  });
});

/* `bookSupportsOriginal()`은 형식 표와 같은 자리에 있습니다 —
   scripts/reader/original-formats.js */

/* 전환하는 길은 오른쪽 아래 동그란 단추 하나뿐입니다. 상단에 있던 두 칸짜리
   스위치는 걷어냈습니다 — 같은 일을 하는 것이 둘이면 자리가 어긋납니다.
   단추는 지금 모드의 반대쪽을 그리므로, 누르면 그 그림으로 갑니다. */
function toggleReaderMode(){
  const next = currentReaderMode==='original' ? 'text' : 'original';
  miniToast(next==='original' ? '원본' : '글자');   // 글자 없는 단추라 한 번 알려 줍니다
  switchReaderMode(next);
}

function updateReaderModeControls(){
  const fab = document.getElementById('modefab');
  if(!fab) return;
  fab.hidden = !bookSupportsOriginal(curBook);
  const label = currentReaderMode==='original' ? '글자로 보기' : '원본으로 보기';
  fab.title = label;
  fab.setAttribute('aria-label', label);
  if(typeof updateOriginalZoomControls === 'function') updateOriginalZoomControls();
}

function rememberReaderMode(mode){
  if(!curBook) return;
  positions[curBook.id] = {...posOf(curBook.id),mode,t:Date.now()};
  save(LS_POS,positions);
}

function readerModeDelay(ms){ return new Promise(resolve=>setTimeout(resolve,ms)); }

/* ================= DOM text helpers ================= */

function domPositionAt(root,offset){
  const doc=root.ownerDocument||document;
  const walker=doc.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let left=Math.max(0,offset), node;
  while((node=walker.nextNode())){
    if(left<=node.data.length) return {node,offset:left};
    left-=node.data.length;
  }
  return {node:root,offset:root.childNodes.length};
}

function domRangeForOffsets(root,start,end){
  const doc=root.ownerDocument||document;
  const a=domPositionAt(root,start), b=domPositionAt(root,end);
  const range=doc.createRange();
  try{ range.setStart(a.node,a.offset); range.setEnd(b.node,b.offset); }
  catch(error){ range.selectNodeContents(root); }
  return range;
}

function domWordStream(root){
  const doc=root.ownerDocument||document;
  const walker=doc.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node){
    const parent=node.parentElement;
    return !parent || parent.closest('script,style,noscript,.breeze-original-word')
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
  }});
  const pattern=/[A-Za-z0-9](?:[A-Za-z0-9'’\-]*[A-Za-z0-9])?/g;
  const stream=[];
  let node;
  while((node=walker.nextNode())){
    pattern.lastIndex=0;
    let match;
    while((match=pattern.exec(node.data))){
      stream.push({word:match[0],node,start:match.index,end:match.index+match[0].length});
    }
  }
  return stream;
}

function rangeForWordMatch(stream,match){
  if(!match || !stream[match.start]) return null;
  const first=stream[match.start];
  const last=stream[Math.min(stream.length-1,match.start+match.length-1)];
  const doc=first.node.ownerDocument||document;
  const range=doc.createRange();
  range.setStart(first.node,first.start); range.setEnd(last.node,last.end);
  return range;
}

/* ================= choosing the bridging sentence ================= */

function textSentenceBridge(){
  const inset=topInset()+8;
  const elements=[...document.querySelectorAll('#rtext [data-pi]')];
  const startIndex=Math.max(0,elements.findIndex(element=>element.getBoundingClientRect().bottom>inset));
  const entries=[];
  for(let index=startIndex; index<elements.length && entries.length<5; index++){
    const element=elements[index];
    const sentences=bridgeSentences(element.textContent);
    for(const sentence of sentences){
      const range=domRangeForOffsets(element,sentence.start,sentence.end);
      const rects=[...range.getClientRects()];
      if(index===startIndex && rects.length && rects.every(rect=>rect.bottom<=inset)) continue;
      entries.push({text:sentence.text,range,pi:+element.dataset.pi,block:element});
      if(entries.length>=5) break;
    }
  }
  if(!entries.length) return null;
  /* A heading such as "Chapter 36" is too ambiguous. In that case the next
     full sentence is a much safer bridge, exactly as the reader expects. */
  const preferred=Math.max(0,entries.findIndex(entry=>bridgeTokens(entry.text).length>=5));
  const chosen=entries[preferred];
  const ordered=[...entries.slice(preferred),...entries.slice(0,preferred)].map(entry=>entry.text);
  return {candidates:ordered,range:chosen.range,pi:chosen.pi,paragraph:chosen.pi,
    block:chosen.block};
}

function originalSentenceBridge(){
  const source=captureOriginalAnchor();
  const format=originalFormat();
  if(!source || !format) return null;
  return format.sentenceBridge(source);
}

/* PDF importers sometimes split one visual sentence into several stored
   paragraphs, so the book is searched as one word stream. But a stream that
   long needs a hint about where the reader already is — otherwise a common
   sentence matches chapter one. `targetPi` is that hint. */
function findTextSentence(candidates,targetPi){
  const elements=[...document.querySelectorAll('#rtext [data-pi]')];
  if(!elements.length) return null;
  const stream=[], starts=[];
  elements.forEach(element=>{ starts.push(stream.length); stream.push(...domWordStream(element)); });
  const index=targetPi==null ? -1
    : elements.findIndex(element=>+element.dataset.pi>=targetPi);
  const near=index<0 ? null : starts[index];
  const list=candidates||[];
  for(let position=0; position<list.length; position++){
    const match=bridgeFindSequence(stream,list[position],{follow:list[position+1]||'',near});
    const range=rangeForWordMatch(stream,match);
    if(range) return {range,stream,match};
  }
  return null;
}

async function restoreTextSentence(candidates,targetPi){
  let found=findTextSentence(candidates,targetPi);
  if(!found) return false;
  /* 지연 단어 상자는 화면에 들어온 뒤 원래 TextNode를 span으로 교체합니다.
     그 교체 직전에 만든 Range는 Safari에서 빈 범위가 되어 파란 표시가 사라졌습니다.
     찾은 문장이 든 문단을 먼저 고정하고, 새 TextNode 기준으로 한 번 더 찾습니다. */
  const end=found.match.start+found.match.length;
  const blocks=[...new Set(found.stream.slice(found.match.start,end)
    .map(item=>item.node.parentElement&&item.node.parentElement.closest('[data-pi]'))
    .filter(Boolean))];
  if(typeof hydrateWordSpanBatch==='function' && blocks.length){
    hydrateWordSpanBatch(blocks);
    found=findTextSentence(candidates,targetPi);
    if(!found) return false;
  }
  const rect=found.range.getBoundingClientRect();
  readerScrollTo(readerScrollTop()+rect.top-(topInset()+readerViewHeight()*.32));
  const refreshedEnd=found.match.start+found.match.length;
  const cueBlocks=[...new Set(found.stream.slice(found.match.start,refreshedEnd)
    .map(item=>item.node.parentElement&&item.node.parentElement.closest('[data-pi]'))
    .filter(Boolean))];
  /* 문장과 문단을 겹쳐 칠하면 읽을 곳보다 장치가 먼저 보입니다. 목적지는 문단
     하나로만 알려 줍니다. 지연 span 재조립 뒤에도 이 표시는 안정적으로 남습니다. */
  /* 문장은 두 화면 사이에서 같은 곳을 찾기 위한 검색어일 뿐입니다. 실제 표시는
     sourceMap이 정한 같은 문단 하나여야 출발·도착의 크기가 달라지지 않습니다. */
  const canonical=document.querySelector(`#rtext [data-pi="${targetPi}"]`)||cueBlocks[0];
  if(canonical) canonical.classList.add('reader-mode-cue-block');
  readerModeCueTimer=setTimeout(clearReaderModeCue,10000);
  return true;
}

/* ================= the "you were here" cue ================= */

function clearReaderModeCue(){
  clearTimeout(readerModeCueTimer); readerModeCueTimer=0;
  document.querySelectorAll('.reader-mode-cue').forEach(node=>node.remove());
  document.querySelectorAll('.reader-mode-cue-block').forEach(node=>node.classList.remove('reader-mode-cue-block'));
  document.querySelectorAll('.reader-mode-cue-word').forEach(node=>node.classList.remove('reader-mode-cue-word'));
  try{ if(CSS.highlights) CSS.highlights.delete('breeze-mode-cue'); }catch(error){}
  if(originalSession&&originalSession.kind==='epub'){
    originalSession.frames.forEach(frame=>{
      try{
        const view=frame.contentWindow, doc=frame.contentDocument;
        if(view&&view.CSS&&view.CSS.highlights) view.CSS.highlights.delete('breeze-mode-cue');
        if(doc){
          doc.querySelectorAll('.reader-mode-cue-dom').forEach(node=>node.remove());
          doc.querySelectorAll('.reader-mode-cue-block').forEach(node=>node.classList.remove('reader-mode-cue-block'));
        }
      }catch(error){}
    });
  }
}

function showElementModeCue(element,duration){
  if(!element) return;
  const doc=element.ownerDocument||document;
  if(doc!==document && !doc.getElementById('breeze-mode-cue-block-style')){
    const style=doc.createElement('style'); style.id='breeze-mode-cue-block-style';
    style.textContent='.reader-mode-cue-block{background:rgba(77,174,214,.16)!important;border-radius:5px}';
    doc.head.appendChild(style);
  }
  element.classList.add('reader-mode-cue-block');
  if(duration) readerModeCueTimer=setTimeout(clearReaderModeCue,duration);
}

function showRangeModeCue(range,duration){
  if(!range) return;
  const doc=range.startContainer.ownerDocument||document;
  const view=doc.defaultView||window;
  let painted=false;
  try{
    if(view.CSS&&view.CSS.highlights&&view.Highlight){
      let style=doc.getElementById('breeze-mode-cue-style');
      if(!style){
        style=doc.createElement('style'); style.id='breeze-mode-cue-style';
        /* 원본 EPUB 은 샌드박스 iframe 이라 우리 CSS 가 닿지 않습니다. 같은 바람색을 안에도 넣어 둡니다. */
        style.textContent='::highlight(breeze-mode-cue){background:rgba(77,174,214,.34);color:inherit}';
        doc.head.appendChild(style);
      }
      view.CSS.highlights.set('breeze-mode-cue',new view.Highlight(range));
      painted=true;
    }
  }catch(error){}
  /* Safari versions without the Custom Highlight API still get the same cue.
     These rectangles live in the scrolling box's own coordinates, so they follow
     the reader instead of remaining stuck to the viewport.
     EPUB 은 샌드박스 iframe 이라 그 안의 문서가 제 스크롤을 갖습니다. 우리 쪽
     문서는 스크롤하지 않으므로(읽는 칸이 대신합니다) 기준이 다릅니다. */
  if(!painted){
    const inFrame = doc !== document;
    const host = inFrame ? doc.body : readerScroller();
    const base = host ? host.getBoundingClientRect() : null;
    const offsetX = inFrame ? (view.scrollX||0) : (base ? host.scrollLeft - base.left : 0);
    const offsetY = inFrame ? (view.scrollY||0) : (base ? host.scrollTop  - base.top  : 0);
    [...range.getClientRects()].filter(rect=>rect.width>0&&rect.height>0).forEach(rect=>{
      const cue=doc.createElement('span'); cue.className='reader-mode-cue reader-mode-cue-dom';
      cue.style.cssText=`left:${rect.left+offsetX}px;top:${rect.top+offsetY}px;width:${rect.width}px;height:${rect.height}px`;
      (host || doc.body).appendChild(cue);
    });
  }
  if(duration) readerModeCueTimer=setTimeout(clearReaderModeCue,duration);
}

function showBridgeSourceCue(bridge){
  clearReaderModeCue();
  if(!bridge) return;
  if(bridge.block) showElementModeCue(bridge.block,0);
  else if(bridge.source&&bridge.source.kind==='pdf'&&originalSession&&originalSession.pages){
    showPdfModeCue(originalSession.pages[bridge.source.page-1],bridge.boxes,0,bridge.paragraph);
  }else if(bridge.range) showRangeModeCue(bridge.range,0);
}

function showOriginalLandingCue(record,target,paragraphHint){
  if(!record || !target || !originalSession) return false;
  const format=ORIGINAL_FORMATS[record.kind];
  const landing=format&&format.sentenceBridge(target);
  if(!landing) return false;
  const paragraph=paragraphHint==null ? landing.paragraph : paragraphHint;
  if(record.kind==='pdf'){
    const page=originalSession.pages&&originalSession.pages[landing.source.page-1];
    if(!page || !landing.boxes || !landing.boxes.length) return false;
    showPdfModeCue(page,landing.boxes,10000,paragraph);
  }else if(landing.block) showElementModeCue(landing.block,10000);
  else if(landing.range) showRangeModeCue(landing.range,10000);
  else return false;
  return true;
}

/* PDF는 placeholder가 실제 쪽 비율을 배울 때 높이가 한 번 더 바뀔 수 있습니다.
   한 줄의 px 보정보다, 독자가 보던 문장(없으면 원본 앵커)을 두 번 다시 가운데에
   놓는 편이 쪽 크기가 섞인 스캔본에도 견고합니다. */
function stabilizePdfModeTarget(record,target,bridge,changeToken,bookAtStart){
  if(!record || record.kind!=='pdf' || !target) return;
  [360,900].forEach(delay=>setTimeout(async()=>{
    if(changeToken!==readerModeChangeToken || curBook!==bookAtStart || currentReaderMode!=='original') return;
    suspendReaderScrollSave(500);
    const found=bridge ? await ORIGINAL_FORMATS.pdf.restoreSentence(
      bridge.candidates,target,changeToken,bridge.paragraph) : false;
    if(!found) await restoreOriginalAnchor(target,changeToken);
  },delay));
}

/* ================= the switch itself ================= */

async function switchReaderMode(mode,options){
  options = options || {};
  if(!curBook || (mode!=='text' && mode!=='original')) return;
  if(mode==='original' && !bookSupportsOriginal(curBook)) return;

  const changeToken=++readerModeChangeToken;
  const bookAtStart=curBook;
  const previousMode = currentReaderMode;
  let sentenceBridge = !options.initial && previousMode!==mode
    ? (previousMode==='text' ? textSentenceBridge() : originalSentenceBridge())
    : null;
  /* 어디를 찾을지는 왕복 안정성을 위해 아래에서 바뀔 수 있지만, 출발 화면에서
     무엇을 읽고 있었는지는 지금 이미 확정돼 있습니다. 둘을 같은 변수로 쓰면
     빠른 왕복의 문장 검색을 끌 때 출발지의 파란 표시까지 사라집니다. */
  const sourceCueBridge=sentenceBridge;
  const textAnchor = previousMode==='text' ? captureAnchor() : null;
  let bridge = previousMode==='text'
    ? sourceAnchorForParagraph(curBook,(textAnchor||{}).pi)
    : captureOriginalAnchor();
  /* 원본→글자 직후 다시 원본으로 돌아갈 때는, 사용자가 글자를 실제로 스크롤하지
     않았다면 방금 떠난 원본 좌표가 가장 정확합니다. 매번 화면 첫 문단을 다시 고르면
     위에 걸친 문단 때문에 왕복할수록 한 쪽씩 위로 기어갑니다. */
  if(previousMode==='text' && recentModeLanding
      && recentModeLanding.bookId===curBook.id && recentModeLanding.mode==='text'
      && Date.now()-recentModeLanding.at<12000
      && !textModeMovedByUser){
    bridge=recentModeLanding.originalAnchor;
    /* 이 경우 정확한 원본 좌표가 이미 있습니다. 문장 검색까지 다시 하면 그 문장의
       첫 줄을 가운데 놓느라 좌표가 덮여, 반복할수록 이전 쪽으로 밀립니다. */
    sentenceBridge=null;
  }
  /* A quick round trip inside the same paragraph should return to the exact
     original page percentage, not merely that paragraph's first line. */
  const rememberedOriginal = posOf(curBook.id).original;
  if(previousMode==='text' && textAnchor && rememberedOriginal
      && paragraphForSource(curBook,rememberedOriginal)===textAnchor.pi){
    bridge=rememberedOriginal;
  }
  if(options.initial) bridge=null;
  if(previousMode!==mode) saveReadingState();
  if(sourceCueBridge){
    showBridgeSourceCue(sourceCueBridge);
    document.body.classList.add('reader-mode-transition');
    const reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    await readerModeDelay(reduced ? 180 : 600);
    if(changeToken!==readerModeChangeToken || curBook!==bookAtStart) return;
  }
  clearReaderModeCue();
  suspendReaderScrollSave(1400);
  currentReaderMode = mode;
  rememberReaderMode(mode);
  closePanel();

  document.body.classList.toggle('reader-original',mode==='original');
  /* ---- 글자 화면으로 오면 배율은 1 입니다 ----
     벌린 것은 종이였습니다. 글자 화면에는 벌릴 이유가 없습니다 — 글자 크기는
     Aa 안에 있고, 그쪽은 줄바꿈까지 다시 흘려 화면 폭에 맞춰 줍니다. 벌리기는
     같은 일을 더 나쁘게 합니다(한 줄을 읽으려고 옆으로 밀어야 하니까요).

     예전에는 이 한 줄이 꼼수였습니다. 브라우저 배율을 내리는 API 가 없어서
     `<meta name=viewport>` 에 `maximum-scale=1` 을 얹어 사파리가 스스로 배율을
     끌어내리게 하고, 400ms 뒤에 그 문장을 도로 떼어 냈습니다. 이제 배율은 우리
     것이라 그냥 1 을 적습니다 (scripts/reader/reader-scroll.js).

     원본으로 돌아갈 때는 되돌리지 않습니다 — 벌려 놓고 잠깐 글자 화면에
     다녀온 사람에게 배율까지 뺏을 이유는 없습니다. */
  if(mode==='text') resetOriginalZoom();
  document.getElementById('readwrap').hidden = mode==='original';
  document.getElementById('originalwrap').hidden = mode!=='original';
  /* 숨어 있는 동안에는 잴 것이 없습니다. 드러난 다음 프레임에 한 번 재 둡니다 —
     확대된 종이가 차지할 자리는 여기서 정해집니다. */
  if(mode==='original') requestAnimationFrame(layoutOriginalZoom);
  updateReaderModeControls();
  requestAnimationFrame(()=>document.body.classList.remove('reader-mode-transition'));

  if(mode==='text'){
    const targetPi = paragraphForSource(curBook,bridge);
    requestAnimationFrame(()=>requestAnimationFrame(async()=>{
      if(changeToken!==readerModeChangeToken || curBook!==bookAtStart || currentReaderMode!=='text') return;
      const canonicalPi=sentenceBridge&&sentenceBridge.paragraph!=null
        ? sentenceBridge.paragraph : targetPi;
      const sentenceFound=sentenceBridge
        ? await restoreTextSentence(sentenceBridge.candidates,canonicalPi) : false;
      if(!sentenceFound && targetPi!=null){
        const element = document.querySelector(`#rtext [data-pi="${targetPi}"]`);
        if(element){
          readerScrollTo(readerScrollTop()+element.getBoundingClientRect().top-(topInset()+readerViewHeight()*.24));
          /* PDF 문장 검색이 실패해도 sourceMap이 가리킨 문단은 확실한 목적지입니다. */
          element.classList.add('reader-mode-cue-block');
          readerModeCueTimer=setTimeout(clearReaderModeCue,6000);
        }
      }else if(!sentenceFound){
        const position = posOf(curBook.id);
        if(!restoreAnchor(position)) readerScrollTo(position.y||0);
      }
      lastAnchor = captureAnchor();
      recentModeLanding={bookId:curBook.id,mode:'text',at:Date.now(),textTop:readerScrollTop(),
        originalAnchor:previousMode==='original' ? bridge : null};
      textModeMovedByUser=false;
      suspendReaderScrollSave(450);
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
    // 처음 여는 책은 맨 앞부터 — 형식별 "맨 앞"은 형식 표가 압니다.
    if(!target && options.initial){
      target = ORIGINAL_FORMATS[record.kind].anchorFromProgress(originalSession,0);
    }
    target = target || sourceAnchorForParagraph(curBook,posOf(curBook.id).pi);
    await restoreOriginalAnchor(target,changeToken);
    if(changeToken!==readerModeChangeToken || curBook!==bookAtStart || currentReaderMode!=='original') return;
    if(sentenceBridge){
      /* Search failure is deliberately quiet: the source-map anchor above is
         still a stable and useful fallback. */
      const sentenceFound=await ORIGINAL_FORMATS[record.kind].restoreSentence(
        sentenceBridge.candidates,target,changeToken,sentenceBridge.paragraph);
      if(!sentenceFound){
        const canonical=sourceAnchorForParagraph(curBook,sentenceBridge.paragraph)||target;
        showOriginalLandingCue(record,canonical,sentenceBridge.paragraph);
      }
    }else if(sourceCueBridge){
      /* 빠른 왕복에서는 정확한 원본 좌표를 지키려고 문장 재검색을 생략합니다.
         좌표는 건드리지 않고, 그 좌표의 문단만 목적지 표시로 다시 칠합니다. */
      showOriginalLandingCue(record,target);
    }
    stabilizePdfModeTarget(record,target,sentenceBridge,changeToken,bookAtStart);
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
    suspendReaderScrollSave(500);
    updatePfill();
  }catch(error){
    if(changeToken!==readerModeChangeToken || curBook!==bookAtStart) return;
    console.error(error);
    showOriginalError(error);
  }
}
