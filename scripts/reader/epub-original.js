/* Original EPUB reader: chapters are stripped of scripts and active content,
   then shown in same-origin sandboxed frames so the publisher's own typography
   survives without letting the book run anything. */

let originalSelectionNoticeAt = 0;

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
  return String(css||'').replace(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi,(all,_quote,raw)=>{
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
    .breeze-original-word.s3{background:rgba(255,140,140,.42)}::selection{background:rgba(37,137,190,.3)}`;
  const style=doc.createElement('style'); style.textContent=cssParts.join('\n')+'\n'+safety; doc.head.appendChild(style);
  return '<!doctype html>'+doc.documentElement.outerHTML;
}

/* A chapter frame that never reports load — a broken srcdoc, a resource the
   browser refuses — must not leave the reader waiting on "원본을 여는 중…". */
const EPUB_FRAME_TIMEOUT = 8000;

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
    section.className='epub-source-chapter'; section.dataset.spine=String(index); section.dataset.href=chapter.path;
    const frame=document.createElement('iframe');
    frame.className='epub-chapter-frame'; frame.setAttribute('sandbox','allow-same-origin');
    frame.setAttribute('scrolling','no'); frame.title=`${book.title} ${index+1}`;
    const ready=new Promise(resolve=>{
      let settled=false;
      const finish=()=>{ if(settled) return; settled=true; resolve(frame); };
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
        if(frameDoc){
          frameDoc.addEventListener('pointerup',()=>{ setTimeout(()=>openOriginalSelection(frameDoc),0); });
          /* EPUB 은 벌리지 않습니다 — 글자라서 크기를 키우면 줄바꿈까지 다시
             흘러 화면 폭에 맞습니다(벌리기는 한 줄을 읽으려고 옆으로 밀게 만들
             뿐입니다). 벌어지는 것은 종이를 찍은 그림인 PDF 뿐입니다.
             샌드박스 iframe 은 제 문서라 우리 쪽 귀가 안 닿으므로, 브라우저의
             벌리기를 막는 귀만 여기 한 번 겁니다. */
          blockBrowserPinch(frameDoc);
          renderEpubSavedWordHighlights(frameDoc);
        }
        finish();
      };
      frame.onerror=finish;
      setTimeout(finish,EPUB_FRAME_TIMEOUT);
    });
    frame.srcdoc=html; section.appendChild(frame); content.appendChild(section);
    session.frames[index]=frame; session.frameReady[index]=ready;
  }
  await Promise.all(session.frameReady.filter(Boolean).slice(0,2));
}

/* ================= saved vocabulary ================= */

function renderEpubSavedWordHighlights(doc){
  const view=doc&&doc.defaultView;
  if(!doc || !view || !view.CSS || !view.CSS.highlights || !view.Highlight) return;
  ['breeze-saved-1','breeze-saved-2','breeze-saved-3'].forEach(name=>view.CSS.highlights.delete(name));
  /* 저장한 단어는 글자 화면과 같은 블록으로 칠합니다. 밑줄·끄기를 더 고를 수
     있었지만 아무도 고르지 않는 설정이었습니다. */
  let markStyle=doc.getElementById('breeze-saved-mark-style');
  if(!markStyle){ markStyle=doc.createElement('style'); markStyle.id='breeze-saved-mark-style'; doc.head.appendChild(markStyle); }
  markStyle.textContent=`::highlight(breeze-saved-1){background:rgba(255,226,138,.34)}
    ::highlight(breeze-saved-2){background:rgba(255,171,120,.31)}
    ::highlight(breeze-saved-3){background:rgba(255,140,140,.33)}`;
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
      if(!saved || saved.mark === false) continue;
      const range=doc.createRange();
      range.setStart(node,match.index); range.setEnd(node,match.index+match[0].length);
      ranges[Math.max(0,Math.min(2,(saved.status||1)-1))].push(range);
    }
  }
  ranges.forEach((items,index)=>{
    if(items.length) view.CSS.highlights.set(`breeze-saved-${index+1}`,new view.Highlight(...items));
  });
}

/* ================= selecting a word ================= */

function originalSentence(text,word){
  const clean=String(text||'').replace(/\s+/g,' ').trim();
  if(clean.length<=500) return clean;
  const sentences=clean.match(/[^.!?…]+[.!?…]*/g)||[clean];
  const lower=String(word||'').toLowerCase();
  const match=sentences.find(sentence=>sentence.toLowerCase().includes(lower))||sentences[0];
  return match.trim().slice(0,700);
}

/* 출판사 조판을 그대로 보여주려면 본문 DOM을 건드리면 안 됩니다.
   브라우저가 실제로 선택한 한 단어만 받아서, 본문을 수정하지 않는
   독립 하이라이트를 그 위에 얹습니다. */
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
  marker.dataset.example=originalSentence((block||owner).textContent,raw);
  marker.setAttribute('aria-hidden','true');
  if(words[key] && words[key].mark !== false) marker.classList.add('s'+words[key].status);
  marker.style.cssText=`position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;pointer-events:none;z-index:2147483646;color:transparent;background:rgba(37,137,190,.25);border-radius:3px`;
  doc.body.appendChild(marker);
  selection.removeAllRanges();
  openWord(key,marker);
}

/* ================= anchors and mode bridging ================= */

function captureEpubAnchor(inset){
  const chapters=[...document.querySelectorAll('.epub-source-chapter')];
  const section=firstElementBelow(chapters,inset);
  if(!section) return null;
  const spine=+section.dataset.spine;
  const frame=originalSession.frames[spine];
  const doc=frame&&frame.contentDocument;
  let element=0;
  if(doc){
    const frameTop=frame.getBoundingClientRect().top;
    const found=firstElementBelow([...doc.querySelectorAll('[data-breeze-ei]')],inset-frameTop);
    if(found) element=+found.dataset.breezeEi;
  }
  return {kind:'epub',href:section.dataset.href||'',spine,element};
}

function epubElementAt(spine,elementIndex){
  const frame=originalSession.frames[spine];
  const doc=frame&&frame.contentDocument;
  return doc ? doc.querySelector(`[data-breeze-ei="${Math.max(0,Number(elementIndex)||0)}"]`) : null;
}

async function restoreEpubAnchor(source,inset){
  const spine=Math.max(0,Math.min(originalSession.frames.length-1,Number(source.spine)||0));
  const frame=originalSession.frames[spine];
  if(!frame) return false;
  if(originalSession.frameReady[spine]) await originalSession.frameReady[spine];
  const element=epubElementAt(spine,source.element);
  const offset=element ? element.getBoundingClientRect().top : 0;
  readerScrollTo(readerScrollTop()+frame.getBoundingClientRect().top+offset-inset);
  return true;
}

function epubSentenceBridge(source){
  const spine=Math.max(0,Math.min(originalSession.frames.length-1,Number(source.spine)||0));
  const element=epubElementAt(spine,source.element);
  if(!element) return null;
  const sentences=bridgeSentences(element.textContent).slice(0,4);
  return sentences.length
    ? {candidates:sentences.map(item=>item.text),source,
       range:domRangeForOffsets(element,sentences[0].start,sentences[0].end)} : null;
}

async function restoreEpubSentence(candidates,source,changeToken){
  const total=originalSession.frames.length;
  const base=Math.max(0,Math.min(total-1,Number(source&&source.spine)||0));
  const spines=[base,base+1].filter(value=>value>=0&&value<total);
  for(const spine of spines){
    if(originalSession.frameReady[spine]) await originalSession.frameReady[spine];
    if(changeToken!==readerModeChangeToken || currentReaderMode!=='original') return false;
    const frame=originalSession.frames[spine], doc=frame&&frame.contentDocument;
    if(!doc) continue;
    const stream=domWordStream(doc.body);
    const list=candidates||[];
    for(let position=0; position<list.length; position++){
      const match=bridgeFindSequence(stream,list[position],{follow:list[position+1]||'',near:0});
      const range=rangeForWordMatch(stream,match);
      if(!range) continue;
      const rect=range.getBoundingClientRect();
      readerScrollTo(readerScrollTop()+frame.getBoundingClientRect().top+rect.top-topInset()-10);
      showRangeModeCue(range,10000);
      return true;
    }
  }
  return false;
}

/* ---- 형식 표에 넘겨줄 조각들 (scripts/reader/original-formats.js) ---- */

function epubAnchorFromProgress(session,progress){
  const total=Math.max(1,session.frames.length);
  return {kind:'epub',href:'',
          spine:Math.max(0,Math.min(total-1,Math.floor(progress*total))),element:0};
}
/* 진행도는 장(spine) 번호로 세고, 장 안쪽은 요소 번호로 나눕니다. */
function epubSourceProgress(map,source,session){
  const mapped=map.reduce((max,item)=>Math.max(max,item&&!item.page ? (item.spine||0)+1 : 0),0);
  const total=Math.max(1,session ? session.frames.length : 0,mapped,(Number(source.spine)||0)+1);
  const spine=Math.max(0,Math.min(total-1,Number(source.spine)||0));
  const maxElement=map.reduce((max,item)=>item&&!item.page&&(item.spine||0)===spine
    ? Math.max(max,item.element||0) : max,0);
  const inside=maxElement ? Math.max(0,Math.min(1,(Number(source.element)||0)/(maxElement+1))) : 0;
  return Math.max(0,Math.min(1,(spine+inside)/total));
}
function refreshEpubSavedWords(session){
  (session.frames||[]).forEach(frame=>{
    try{ if(frame&&frame.contentDocument) renderEpubSavedWordHighlights(frame.contentDocument); }catch(e){}
  });
}
