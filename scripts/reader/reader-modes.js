/* Switching between the reflowed 글자 view and the 원본 document.
   The two views have completely different heights, so the switch is described
   by the sentence the reader can actually see, with the importer's coordinate
   map as the fallback. */

let readerModeCueTimer = 0;

/* 원본 화면이 있을 수 있는 책인지. 붙여넣은 글과 TXT에는 원본이 영영 없으므로
   전환 버튼을 아예 내지 않습니다. 전에는 버튼이 보인 뒤 "원본 파일을 연결해
   주세요"라는 막다른 안내로 이어졌습니다. */
function bookSupportsOriginal(book){
  if(!book) return false;
  const kind = book.kind || (book.original && book.original.kind) || '';
  if(kind) return kind === 'pdf' || kind === 'epub';
  // 형식을 저장하지 않던 시절의 책: 원본 좌표 지도가 있으면 PDF·EPUB입니다.
  return !!(book.sourceMap && book.sourceMap.length);
}

function updateReaderModeControls(){
  const switcher = document.getElementById('reader-mode-switch');
  if(!switcher) return;
  const hasOriginalMode = bookSupportsOriginal(curBook);
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
  if(!source || !originalSession) return null;
  return originalSession.kind==='pdf' ? pdfSentenceBridge(source) : epubSentenceBridge(source);
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
    if(!target && options.initial){
      target = record.kind==='pdf'
        ? {kind:'pdf',page:1,y:0}
        : {kind:'epub',href:'',spine:0,element:0};
    }
    target = target || sourceAnchorForParagraph(curBook,posOf(curBook.id).pi);
    await restoreOriginalAnchor(target,changeToken);
    if(changeToken!==readerModeChangeToken || curBook!==bookAtStart || currentReaderMode!=='original') return;
    if(sentenceBridge){
      /* Search failure is deliberately quiet: the source-map anchor above is
         still a stable and useful fallback. */
      if(record.kind==='pdf') await restorePdfSentence(sentenceBridge.candidates,target,changeToken);
      else await restoreEpubSentence(sentenceBridge.candidates,target,changeToken);
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
