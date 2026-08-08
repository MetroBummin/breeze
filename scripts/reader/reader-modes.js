/* Switching between the reflowed 글자 view and the 원본 document.
   The two views have completely different heights, so the switch is described
   by the sentence the reader can actually see, with the importer's coordinate
   map as the fallback. */

let readerModeCueTimer = 0;

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
      entries.push({text:sentence.text,range,pi:+element.dataset.pi});
      if(entries.length>=5) break;
    }
  }
  if(!entries.length) return null;
  /* A heading such as "Chapter 36" is too ambiguous. In that case the next
     full sentence is a much safer bridge, exactly as the reader expects. */
  const preferred=Math.max(0,entries.findIndex(entry=>bridgeTokens(entry.text).length>=5));
  const chosen=entries[preferred];
  const ordered=[...entries.slice(preferred),...entries.slice(0,preferred)].map(entry=>entry.text);
  return {candidates:ordered,range:chosen.range,pi:chosen.pi};
}

function originalSentenceBridge(){
  const source=captureOriginalAnchor();
  const format=originalFormat();
  if(!source || !format) return null;
  return format.sentenceBridge(source);
}

function findTextSentence(candidates,targetPi){
  /* PDF importers sometimes split one visual sentence into several stored
     paragraphs. Search the rendered book as one word stream first, so that
     mode switching still lands on that sentence across block boundaries. */
  const root=document.getElementById('rtext');
  const fullStream=root ? domWordStream(root) : [];
  for(const candidate of candidates||[]){
    const match=bridgeFindSequence(fullStream,candidate);
    const range=rangeForWordMatch(fullStream,match);
    if(range) return {range,stream:fullStream,match};
  }
  const elements=[...document.querySelectorAll('#rtext [data-pi]')];
  const start=Math.max(0,elements.findIndex(element=>+element.dataset.pi>=(targetPi==null ? 0 : targetPi)));
  const ordered=[...elements.slice(start,start+18),...elements.slice(0,start)];
  for(const candidate of candidates||[]){
    for(const element of ordered){
      const stream=domWordStream(element);
      const match=bridgeFindSequence(stream,candidate);
      const range=rangeForWordMatch(stream,match);
      if(range) return {range,stream,match};
    }
  }
  return null;
}

async function restoreTextSentence(candidates,targetPi){
  const found=findTextSentence(candidates,targetPi);
  if(!found) return false;
  const rect=found.range.getBoundingClientRect();
  window.scrollTo(0,Math.max(0,window.scrollY+rect.top-topInset()-12));
  const end=found.match.start+found.match.length;
  found.stream.slice(found.match.start,end).forEach(item=>{
    const word=item.node.parentElement&&item.node.parentElement.closest('.w');
    if(word) word.classList.add('reader-mode-cue-word');
  });
  showRangeModeCue(found.range,10000);
  return true;
}

/* ================= the "you were here" cue ================= */

function clearReaderModeCue(){
  clearTimeout(readerModeCueTimer); readerModeCueTimer=0;
  document.querySelectorAll('.reader-mode-cue').forEach(node=>node.remove());
  document.querySelectorAll('.reader-mode-cue-word').forEach(node=>node.classList.remove('reader-mode-cue-word'));
  try{ if(CSS.highlights) CSS.highlights.delete('breeze-mode-cue'); }catch(error){}
  if(originalSession&&originalSession.kind==='epub'){
    originalSession.frames.forEach(frame=>{
      try{
        const view=frame.contentWindow, doc=frame.contentDocument;
        if(view&&view.CSS&&view.CSS.highlights) view.CSS.highlights.delete('breeze-mode-cue');
        if(doc) doc.querySelectorAll('.reader-mode-cue-dom').forEach(node=>node.remove());
      }catch(error){}
    });
  }
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
        style.textContent='::highlight(breeze-mode-cue){background:rgba(111,196,148,.30);color:inherit}';
        doc.head.appendChild(style);
      }
      view.CSS.highlights.set('breeze-mode-cue',new view.Highlight(range));
      painted=true;
    }
  }catch(error){}
  /* Safari versions without the Custom Highlight API still get the same cue.
     These rectangles live in document coordinates, so they follow scrolling
     instead of remaining stuck to the viewport. */
  if(!painted){
    [...range.getClientRects()].filter(rect=>rect.width>0&&rect.height>0).forEach(rect=>{
      const cue=doc.createElement('span'); cue.className='reader-mode-cue reader-mode-cue-dom';
      cue.style.cssText=`left:${rect.left+(view.scrollX||0)}px;top:${rect.top+(view.scrollY||0)}px;width:${rect.width}px;height:${rect.height}px`;
      doc.body.appendChild(cue);
    });
  }
  if(duration) readerModeCueTimer=setTimeout(clearReaderModeCue,duration);
}

function showBridgeSourceCue(bridge){
  clearReaderModeCue();
  if(!bridge) return;
  if(bridge.range) showRangeModeCue(bridge.range,0);
  else if(bridge.source&&bridge.source.kind==='pdf'&&originalSession&&originalSession.pages){
    showPdfModeCue(originalSession.pages[bridge.source.page-1],bridge.boxes,0);
  }
}

/* ================= the switch itself ================= */

async function switchReaderMode(mode,options){
  options = options || {};
  if(!curBook || (mode!=='text' && mode!=='original')) return;
  if(mode==='original' && !bookSupportsOriginal(curBook)) return;

  const changeToken=++readerModeChangeToken;
  const bookAtStart=curBook;
  const previousMode = currentReaderMode;
  const sentenceBridge = !options.initial && previousMode!==mode
    ? (previousMode==='text' ? textSentenceBridge() : originalSentenceBridge())
    : null;
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
  if(sentenceBridge){
    showBridgeSourceCue(sentenceBridge);
    document.body.classList.add('reader-mode-transition');
    const reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    await readerModeDelay(reduced ? 60 : 600);
    if(changeToken!==readerModeChangeToken || curBook!==bookAtStart) return;
  }
  clearReaderModeCue();
  suspendReaderScrollSave(1400);
  currentReaderMode = mode;
  rememberReaderMode(mode);
  closePanel();

  document.body.classList.toggle('reader-original',mode==='original');
  document.getElementById('readwrap').hidden = mode==='original';
  document.getElementById('originalwrap').hidden = mode!=='original';
  updateReaderModeControls();
  requestAnimationFrame(()=>document.body.classList.remove('reader-mode-transition'));

  if(mode==='text'){
    const targetPi = paragraphForSource(curBook,bridge);
    requestAnimationFrame(()=>requestAnimationFrame(async()=>{
      if(changeToken!==readerModeChangeToken || curBook!==bookAtStart || currentReaderMode!=='text') return;
      const sentenceFound=sentenceBridge
        ? await restoreTextSentence(sentenceBridge.candidates,targetPi) : false;
      if(!sentenceFound && targetPi!=null){
        const element = document.querySelector(`#rtext [data-pi="${targetPi}"]`);
        if(element) window.scrollTo(0,Math.max(0,window.scrollY+element.getBoundingClientRect().top-topInset()-10));
      }else if(!sentenceFound){
        const position = posOf(curBook.id);
        if(!restoreAnchor(position)) window.scrollTo(0,position.y||0);
      }
      lastAnchor = captureAnchor();
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
      await ORIGINAL_FORMATS[record.kind].restoreSentence(sentenceBridge.candidates,target,changeToken);
    }
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
