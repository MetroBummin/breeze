/* Original EPUB reader: chapters are stripped of scripts and active content,
   then shown in same-origin sandboxed frames so the publisher's own typography
   survives without letting the book run anything. */

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
  /* 마우스가 있는 화면에서는 커서가 곧 안내문입니다. 출판사 조판을 그대로
     보여 주느라 본문은 평범한 글자라, 그냥 두면 커서가 글자 고르는 I 자로 떠서
     "여기서 할 일은 드래그"라고 말합니다 — 실제로 할 일은 한 번 누르는 것인데도.
     글자를 담은 칸만 손가락 커서로 바꿉니다(여백은 그대로 화살표).
     iOS의 native callout은 문장 꾹 누르기를 가로채므로 EPUB 본문 안에서만
     선택과 callout을 끕니다. */
  /* ---- callout 은 끄되 선택 자체는 끄지 않습니다 ----
     한때 여기에 `user-select:none` 이 있었습니다. iOS 의 Look Up 메뉴를 막으려고
     넣은 것인데, 그 선언은 브라우저에 따라 caret hit-test 까지 함께 끕니다 —
     그리고 EPUB 의 낱말 찾기는 caret 에 기대고 있었습니다. 한 증상을 막으려던
     규칙이 다른 증상을 만든 자리입니다.

     지금은 둘을 나눕니다. 메뉴를 부르는 스위치(`-webkit-touch-callout`)만 끄고,
     iOS 가 몰래 만든 선택은 생기는 족족 지웁니다(`suppressReaderSelection`) —
     글자 화면이 쓰는 것과 같은 방법입니다. 선택 기능 자체는 살아 있으므로
     어느 엔진에서든 caret 이 대답합니다. 그래도 대답하지 않으면 낱말 찾기가
     기하로 한 번 더 시도합니다(`epubWordRangeAtPoint`). */
  const safety=`html,body{max-width:100%;min-height:1px}img,svg,video{max-width:100%;height:auto}
    body{-webkit-touch-callout:none}
    p,li,blockquote,h1,h2,h3,h4,h5,h6,dd,dt,td,th{cursor:pointer}
    .breeze-original-word{border-radius:.18em;cursor:pointer}.breeze-original-word:hover{background:rgba(37,137,190,.18)}
    .breeze-original-word.s1{background:rgba(255,226,138,.45)}.breeze-original-word.s2{background:rgba(255,171,120,.42)}
    .breeze-original-word.s3{background:rgba(255,140,140,.42)}`;
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
  if(hint) hint.textContent='단어를 한 번 눌러 뜻을 봐요';
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
          installEpubWordTap(frameDoc);
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

/* EPUB 원본은 iframe 안의 진짜 글자입니다. 예전에는 브라우저 selection만 읽어서
   마우스로 더블클릭하거나 손가락으로 드래그해야 selection이 생겼습니다. PDF는
   이미 좌표표로 한 번 탭을 처리했지만 EPUB에는 그 길이 없었고, 겉보기에는 같은
   '원본 모드'라 PDF 수정이 안 먹는 것처럼 보였습니다.

   한 번 탭은 브라우저가 알려 주는 caret에서 낱말 경계를 찾습니다. 빈 여백을
   눌렀을 때 가까운 낱말이 열리지 않도록 실제 낱말 사각형 안인지도 다시 봅니다.
   드래그/더블클릭 selection은 기존 길을 그대로 남겨 두므로 표현을 골라 복사하는
   출판사 조판의 기본 동작도 잃지 않습니다. */
/* ---- 낱말을 열면 안 되는 자리 ----
   진짜 링크 위에서는 낱말을 열지 않습니다. 누르면 갈 곳이 있는 글자라서, 뜻과
   이동이 같은 한 번의 탭을 두고 다투기 때문입니다.

   다만 `<a>` 라고 다 링크는 아닙니다. EPUB 은 목차가 가리킬 자리를 `<a id="…">`
   로 표시하는데, 구텐베르크 판은 그 닻이 **장 전체를 감쌉니다**. 태그 이름만
   보고 걸렀더니 앨리스의 본문 한 장이 통째로 "링크 안"이 되어, 원본 모드에서
   낱말도 문장도 열리지 않았습니다 — 눌러도 아무 일이 없는 화면이었습니다.
   갈 곳(`href`)이 적힌 것만 링크로 셉니다. 안쪽 링크는 반입할 때 `href` 를
   `data-epub-href` 로 옮겨 두므로 둘 다 봅니다. */
const EPUB_NO_TAP = 'a[href],a[data-epub-href],script,style,noscript,textarea';

const EPUB_WORD_RE=/[A-Za-z](?:[A-Za-z'’\-]*[A-Za-z])?/g;

/* 낱말 하나를 Range 로 싸고, 그 Range 의 사각형이 손가락을 품는지 봅니다.
   품지 않으면 여백을 누른 것입니다 — 가까운 낱말을 억지로 열지 않습니다.

   여유(`padX`/`padY`)를 두는 것은 손가락이 글자 사이 틈에 떨어져도 열리게
   하려는 것입니다. 그런데 그 여유 때문에 **줄과 줄 사이**에서는 위아래 두 줄이
   동시에 맞습니다. 그래서 맞았는지만 보고 첫 번째를 집으면, 줄 경계를 누를 때
   윗줄의 낱말이 열립니다. 얼마나 잘 맞았는지도 함께 돌려주어 부르는 쪽이
   가장 가까운 것을 고르게 합니다 — 스캔본이 쓰는 셈법과 같습니다
   (`pdfWordAtPoint`). */
const EPUB_HIT_PAD_X = 4, EPUB_HIT_PAD_Y = 3;
function epubWordHit(doc,node,match,clientX,clientY){
  const owner=node.parentElement;
  if(!owner || owner.closest(EPUB_NO_TAP)) return null;
  const range=doc.createRange();
  range.setStart(node,match.index); range.setEnd(node,match.index+match[0].length);
  let best=null;
  for(const item of range.getClientRects()){
    if(!(item.width>0&&item.height>0)) continue;
    if(clientX<item.left-EPUB_HIT_PAD_X || clientX>item.right+EPUB_HIT_PAD_X
      || clientY<item.top-EPUB_HIT_PAD_Y || clientY>item.bottom+EPUB_HIT_PAD_Y) continue;
    /* ---- 줄을 먼저 정하고, 그 줄 안에서 고릅니다 ----
       세로 여유는 줄과 줄 사이에서 위아래 두 줄을 동시에 맞힙니다. 그 상태로
       거리만 비교하면 세로 거리가 같아서 **가로 거리가 줄을 고르는** 꼴이 되고,
       그건 아무 뜻이 없습니다 — 줄 경계를 누르면 윗줄의 엉뚱한 낱말이 열렸습니다.
       세로는 반열린 구간(`top <= y < bottom`)으로 봅니다. 맞닿은 두 줄이 경계
       한 점을 두고 다투지 않고, 브라우저가 그 점을 어느 줄로 세는지와도 같습니다. */
    const onLine=clientY>=item.top && clientY<item.bottom;
    const dx=Math.max(item.left-clientX, 0, clientX-item.right);
    const dy=Math.max(item.top-clientY, 0, clientY-item.bottom);
    if(!best || (onLine && !best.onLine)
      || (onLine===best.onLine && dx*dx+dy*dy < best.dx*best.dx+best.dy*best.dy)){
      best={rect:item,onLine,dx,dy};
    }
  }
  return best ? {range,raw:match[0],owner,rect:best.rect,
                 onLine:best.onLine,gap:best.dx*best.dx+best.dy*best.dy} : null;
}

/* ---- 빠른 길: 브라우저가 알려 주는 caret ---- */
function epubWordByCaret(doc,clientX,clientY){
  let node=null, offset=0;
  if(doc.caretPositionFromPoint){
    const caret=doc.caretPositionFromPoint(clientX,clientY);
    if(caret){ node=caret.offsetNode; offset=caret.offset; }
  }else if(doc.caretRangeFromPoint){
    const caret=doc.caretRangeFromPoint(clientX,clientY);
    if(caret){ node=caret.startContainer; offset=caret.startOffset; }
  }
  if(!node) return null;
  if(node.nodeType!==Node.TEXT_NODE){
    const walker=doc.createTreeWalker(node,NodeFilter.SHOW_TEXT);
    node=walker.nextNode(); offset=0;
  }
  if(!node || !node.data || !/[A-Za-z]/.test(node.data)) return null;
  EPUB_WORD_RE.lastIndex=0;
  let match;
  while((match=EPUB_WORD_RE.exec(node.data))){
    if(offset>=match.index && offset<=match.index+match[0].length)
      return epubWordHit(doc,node,match,clientX,clientY);
  }
  return null;
}

/* ---- 예비 길: 눌린 칸의 낱말들을 재어 봅니다 ----
   caret hit-test 는 엔진마다 조건이 다릅니다. 어떤 WebKit 판은 선택을 끈 곳에서
   caret 을 돌려주지 않고, 어떤 판은 그림·표 안쪽에서 빗나갑니다. 그때 손짓을
   그냥 버리면 "눌러도 아무 일이 없는 화면"이 됩니다.

   caret 이 대답하지 않으면 눌린 칸(`elementFromPoint`)의 글자들을 낱말 단위로
   재어 손가락을 품는 것을 고릅니다. 한 문단 안의 일이라 탭 한 번에 몇 밀리초면
   끝나고, 무엇보다 브라우저의 선택 기능에 전혀 기대지 않습니다. */
function epubWordByGeometry(doc,clientX,clientY){
  let element=null;
  try{ element=doc.elementFromPoint(clientX,clientY); }catch(error){ return null; }
  const block=element && element.closest
    ? (element.closest('p,li,blockquote,h1,h2,h3,h4,h5,h6,dd,dt,td,th')||element) : null;
  if(!block || (block.closest && block.closest(EPUB_NO_TAP))) return null;
  const walker=doc.createTreeWalker(block,NodeFilter.SHOW_TEXT,{acceptNode(node){
    return node.data && /[A-Za-z]/.test(node.data)
      ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
  }});
  /* 맞는 것을 모두 모아 하나를 고릅니다. 손가락이 놓인 줄에 있는 것이 먼저이고,
     같은 줄 안에서는 가까운 것입니다. 글자 안에 정확히 떨어졌으면(`gap` 0) 더
     볼 것이 없으므로 거기서 멈춥니다 — 긴 문단을 끝까지 훑지 않습니다. */
  let best=null, node;
  while((node=walker.nextNode())){
    EPUB_WORD_RE.lastIndex=0;
    let match;
    while((match=EPUB_WORD_RE.exec(node.data))){
      const hit=epubWordHit(doc,node,match,clientX,clientY);
      if(!hit) continue;
      if(hit.onLine && hit.gap===0) return hit;
      if(!best || (hit.onLine && !best.onLine)
        || (hit.onLine===best.onLine && hit.gap<best.gap)) best=hit;
    }
  }
  return best;
}

/* 어느 길로 찾았는지는 손짓 기록에 남습니다 — 실기기에서 "EPUB 만 안 된다"가
   다시 나왔을 때, 추측하지 않고 이 한 줄을 보면 됩니다. */
let epubLastHitPath='';
function epubWordRangeAtPoint(doc,clientX,clientY){
  const byCaret=epubWordByCaret(doc,clientX,clientY);
  if(byCaret){ epubLastHitPath='caret'; return byCaret; }
  const byGeometry=epubWordByGeometry(doc,clientX,clientY);
  epubLastHitPath=byGeometry ? 'geometry (caret returned null)' : 'miss';
  return byGeometry;
}

/* ================= EPUB 이라는 종이 =================
   장마다 제 문서(iframe)라 귀는 그 문서에도 한 벌 답니다. 그러나 판정하는 코드는
   글자판·스캔본과 똑같은 그 한 곳입니다 — scripts/reader/gesture.js.

   예전에는 여기에 리스너가 여섯 개 있었고, 그중 `pointerup` 이 **한 손짓을 두 번**
   판정했습니다: 먼저 caret 으로 낱말을 찾고, 그것이 실패하면 `setTimeout(…,0)`
   뒤에 브라우저 selection 으로 또 한 번 찾았습니다. 그 두 번째 길은 지금
   도달할 수 없습니다 — iOS 가 만든 선택은 생기는 족족 지워지므로(위의 safety
   CSS 설명) 볼 selection 이 없습니다. 그래서 걷어냈습니다. 낱말을 고르는 길은
   세 화면 모두 하나입니다: 한 번 누른다. */
function installEpubWordTap(doc){
  attachReaderGestures(doc);
  suppressReaderSelection(doc, ()=>true);
}

registerReaderSurface({
  name:'epub',
  claims(event){
    if(!originalSession || !originalSession.frames) return false;
    const doc=event.target && event.target.ownerDocument;
    if(!doc || doc===document) return false;
    return originalSession.frames.some(frame=>{
      try{ return frame && frame.contentDocument===doc; }catch(error){ return false; }
    });
  },
  document(){ return epubActiveDocument() || document; },
  openWordAt(clientX,clientY){
    const doc=epubActiveDocument();
    if(!doc) return false;
    const hit=epubWordRangeAtPoint(doc,clientX,clientY);
    if(!hit) return false;
    openOriginalRange(doc,hit.range,hit.raw,hit.owner,hit.rect);
    return true;
  },
  sentenceAt(clientX,clientY){
    const doc=epubActiveDocument();
    if(!doc) return null;
    /* 누른 자리가 문단 어디쯤인지를 세어 그 자리를 품은 문장을 고릅니다. 낱말이
       어느 문장에 **들어 있는지**로 찾으면 같은 낱말이 문단에 두 번 나올 때 늘
       앞의 것이 잡히고, 짧은 문단에서는 문단 전체가 통째로 넘어갔습니다 —
       "이 문장"이라고 해 놓고 다섯 문장을 물어보는 셈이었습니다. */
    const hit=epubWordRangeAtPoint(doc,clientX,clientY);
    if(!hit || typeof bridgeSentences!=='function') return null;
    const owner=hit.owner;
    const block=(owner && owner.closest && owner.closest('p,li,blockquote,h1,h2,h3,h4')) || owner;
    if(!block) return null;
    let at=0;
    try{
      const before=doc.createRange();
      before.selectNodeContents(block);
      before.setEnd(hit.range.startContainer, hit.range.startOffset);
      at=before.toString().length;
    }catch(error){ at=0; }
    const parts=bridgeSentences(block.textContent);
    const part=parts.find(item=>at>=item.start && at<item.end) || parts[0];
    const sentence=part ? part.text.replace(/\s+/g,' ').trim() : '';
    if(!sentence) return null;
    const range=domRangeForOffsets(block, part.start, part.end);
    return { sentence, paint(){ showRangeModeCue(range, 0); } };
  },
  trace(){ return `caret path: ${epubLastHitPath||'—'}`; },
});

/* 손짓이 시작된 장의 문서. 좌표는 그 문서의 것이라 다른 장에 물으면 어긋납니다. */
function epubActiveDocument(){
  if(!originalSession || !originalSession.frames) return null;
  const doc=readerGestureDocument();
  if(!doc || doc===document) return null;
  return originalSession.frames.some(frame=>{
    try{ return frame && frame.contentDocument===doc; }catch(error){ return false; }
  }) ? doc : null;
}

function openOriginalRange(doc,range,raw,owner,rect){
  if(!doc || !range || !raw || !owner || !rect) return;
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
    ? {candidates:sentences.map(item=>item.text),source,block:element,
       paragraph:paragraphForSource(curBook,source),
       range:domRangeForOffsets(element,sentences[0].start,sentences[0].end)} : null;
}

async function restoreEpubSentence(candidates,source,changeToken,paragraphHint){
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
      const canonical=paragraphHint==null ? null : sourceAnchorForParagraph(curBook,paragraphHint);
      const block=canonical&&canonical.kind==='epub'
        ? epubElementAt(canonical.spine,canonical.element) : range.commonAncestorContainer.parentElement;
      showElementModeCue(block,10000);
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
  const mapped=sourceMapFact(map,'lastSpine',
    list=>list.reduce((max,item)=>Math.max(max,item&&!item.page ? (item.spine||0)+1 : 0),0));
  const total=Math.max(1,session ? session.frames.length : 0,mapped,(Number(source.spine)||0)+1);
  const spine=Math.max(0,Math.min(total-1,Number(source.spine)||0));
  const maxElement=sourceMapFact(map,'lastElement:'+spine,
    list=>list.reduce((max,item)=>item&&!item.page&&(item.spine||0)===spine
      ? Math.max(max,item.element||0) : max,0));
  const inside=maxElement ? Math.max(0,Math.min(1,(Number(source.element)||0)/(maxElement+1))) : 0;
  return Math.max(0,Math.min(1,(spine+inside)/total));
}
function refreshEpubSavedWords(session){
  (session.frames||[]).forEach(frame=>{
    try{ if(frame&&frame.contentDocument) renderEpubSavedWordHighlights(frame.contentDocument); }catch(e){}
  });
}
