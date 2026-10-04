/* A bounded vertical thumbnail panel beside the PDF. Source pages,
   lexical geometry and ink retain their document/session ownership. */
let pdfNavigation=null,pdfNavigationGeneration=0,pdfNavigationTask=null,pdfNavigationCloseTimer=null;
let lastPdfDirectionState=null;
function currentEpubNavigationSession(){
  return currentReaderMode==='original'&&originalSession?.kind==='epub'
    &&originalSession.bookId===curBook?.id&&originalSession.frames.some(Boolean);
}
function pdfHorizontal(session=originalSession){return session?.kind==='pdf'&&session.readDirection==='horizontal';}
function pdfCurrentPage(){
  if(!currentPdfSession())return 1;
  if(pdfHorizontal())return originalSession.navigationPage||1;
  return Math.min(originalSession.pages.length,capturePdfAnchor(topInset())?.page||1);
}
function pdfBookmarkKey(session){return 'breeze.pdf-bookmarks.v1:'+String(session.hash||session.bookId);}
function readPdfBookmarks(session){
  try{
    const value=JSON.parse(localStorage.getItem(pdfBookmarkKey(session))||'[]');
    if(!Array.isArray(value)||value.some(n=>!Number.isInteger(n)||n<1))throw Error('Invalid bookmarks');
    return value.filter(n=>n<=session.pages.length);
  }catch(error){toast('북마크 정보를 읽지 못했어요.');return null;}
}
function togglePdfBookmark(session,n){
  if(!currentPdfSession(session))return false;
  const bookmarks=readPdfBookmarks(session);if(!bookmarks)return false;
  const next=bookmarks.includes(n)?bookmarks.filter(p=>p!==n):[...bookmarks,n].sort((a,b)=>a-b);
  try{localStorage.setItem(pdfBookmarkKey(session),JSON.stringify(next));}
  catch(error){toast('북마크를 저장하지 못했어요.');return false;}
  if(pdfNavigation){const left=pdfNavigation.strip.scrollTop;buildPdfNavigation(false);pdfNavigation.strip.scrollTop=left;paintPdfThumbnails();}
  return true;
}
function epubBookmarkKey(session){return 'breeze.epub-bookmarks.v1:'+String(session.hash||session.bookId);}
function readEpubBookmarks(session){
  try{
    const value=JSON.parse(localStorage.getItem(epubBookmarkKey(session))||'[]');
    if(!Array.isArray(value)||value.some(a=>!a||!Number.isInteger(a.spine)||a.spine<0||!Number.isInteger(a.element)||a.element< -1||!Number.isFinite(a.offset)||a.offset<0||a.offset>1))throw Error('Invalid bookmarks');
    return value;
  }catch(error){toast('북마크 정보를 읽지 못했어요.');return null;}
}
function epubBookmarkPage(nav,anchor){
  const frame=nav.session.frames[anchor.spine],height=nav.pageHeights[anchor.spine];
  if(!frame||!height)return null;
  const element=anchor.element===-1?frame.contentDocument?.body:frame.contentDocument?.querySelector(`[data-breeze-ei="${anchor.element}"]`);
  if(!element)return null;
  const rect=element.getBoundingClientRect(),y=Math.max(0,rect.top+rect.height*anchor.offset);
  const last=(nav.firstPages[anchor.spine+1]??nav.pages.length)-1;
  return Math.min(last,nav.firstPages[anchor.spine]+Math.floor(y/height));
}
function toggleEpubBookmark(nav,pageIndex){
  if(pdfNavigation!==nav||!currentEpubNavigationSession())return false;
  const bookmarks=readEpubBookmarks(nav.session);if(!bookmarks)return false;
  const keys=new Set((nav.bookmarkAnchors.get(pageIndex)||[]).map(anchor=>JSON.stringify(anchor)));
  const marked=keys.size>0;
  let next=bookmarks.filter(anchor=>!keys.has(JSON.stringify(anchor)));
  if(!marked){
    const page=nav.pages[pageIndex],doc=nav.session.frames[page.spine].contentDocument;
    const elements=[...doc.querySelectorAll('[data-breeze-ei]')];
    const element=firstElementBelow(elements,page.y+1)||elements.at(-1)||doc.body;
    if(!element){toast('이 페이지의 북마크 위치를 찾지 못했어요.');return false;}
    const rect=element.getBoundingClientRect();
    const offset=Math.max(0,Math.min(1,(page.y+1-rect.top)/Math.max(1,rect.height)));
    next.push({spine:page.spine,element:element.dataset.breezeEi===undefined?-1:+element.dataset.breezeEi,offset});
  }
  try{localStorage.setItem(epubBookmarkKey(nav.session),JSON.stringify(next));}
  catch(error){toast('북마크를 저장하지 못했어요.');return false;}
  buildEpubNavigation(false);return true;
}
function applyPdfDirection(session,page=1){
  if(!currentPdfSession(session))return;
  session.readDirection=studyPrefs.direction;
  session.navigationPage=pdfNearestPage(session,page);
  document.getElementById('original-content').classList.toggle('pdf-horizontal',pdfHorizontal(session));
  session.pages.forEach((node,i)=>node.classList.toggle('pdf-page-offstage',session.deletedPages?.has(i+1)||(pdfHorizontal(session)&&i+1!==session.navigationPage)));
  invalidatePdfPageLayout(session);layoutOriginalZoom();updatePdfNavigationControls();
}
async function setPdfReadDirection(direction){
  if(!['vertical','horizontal'].includes(direction)||pdfDeletionBusy||BreezePdfInk.busy()||originalPinchBusy())return;
  if(direction===studyPrefs.direction)return;
  const session=originalSession,anchor=currentPdfSession(session)?capturePdfAnchor(topInset()):null;
  if(!persistStudyPrefs({...studyPrefs,direction}))return;
  if(anchor){const token=++readerModeChangeToken;applyPdfDirection(session,anchor.page);await restorePdfAnchor(anchor,topInset(),token);}
  if(currentPdfSession(session)){saveReadingState();updatePfill(true);}
}
async function goPdfPage(n,{keepNavigation=false}={}){
  const session=originalSession;
  if(currentReaderMode!=='original'||!currentPdfSession(session)||pdfDeletionBusy||BreezePdfInk.busy()||originalPinchBusy())return;
  n=pdfNearestPage(session,n);
  if(typeof closePanel==='function')closePanel();
  if(!keepNavigation)closePdfNavigation();expandReaderChrome();
  const token=++readerModeChangeToken;
  await restorePdfAnchor({kind:'pdf',page:n,y:0},topInset(),token);
  if(!currentPdfSession(session)||token!==readerModeChangeToken)return;
  saveReadingState();updatePfill(true);updatePdfNavigationControls();
}
function updatePdfNavigationControls(measuredAnchor){
  const button=document.getElementById('pdf-page-button');if(!button)return;
  const pdfReady=currentReaderMode==='original'&&currentPdfSession();
  const epubReady=currentEpubNavigationSession(),ready=!!(pdfReady||epubReady);
  if(button.hidden===ready)button.hidden=!ready;
  const control=document.getElementById('pdf-page-control');if(control.hidden===ready)control.hidden=!ready;
  const directionRow=document.getElementById('aa-pdf-direction');if(directionRow.hidden===!!pdfReady)directionRow.hidden=!pdfReady;
  const bookmarks=document.getElementById('pdf-bookmarks-only');if(bookmarks.hidden===ready)bookmarks.hidden=!ready;
  const panel=document.getElementById('pdf-page-navigation'),label=epubReady?'EPUB 페이지 탐색':'PDF 페이지 탐색';
  if(panel.getAttribute('aria-label')!==label)panel.setAttribute('aria-label',label);
  if(lastPdfDirectionState!==studyPrefs.direction){
    for(const direction of ['vertical','horizontal'])document.querySelector(`[data-pdf-direction="${direction}"]`)?.setAttribute('aria-pressed',String(studyPrefs.direction===direction));
    lastPdfDirectionState=studyPrefs.direction;
  }
  if(!ready){closePdfNavigation();return;}
  if(epubReady){
    if(pdfNavigation&&pdfNavigation.session!==originalSession)closePdfNavigation();
    if(measuredAnchor?.kind==='epub')originalSession.navigationSpine=measuredAnchor.spine;
    const nav=pdfNavigation||originalSession.navigationPreview;
    const n=nav?.pages?.length?epubNavigationCurrentPage(nav):1;
    const aria=`${n}페이지, 페이지 탐색`;if(button.getAttribute('aria-label')!==aria)button.setAttribute('aria-label',aria);
    if(pdfNavigation)for(const entry of nav.track.querySelectorAll('.pdf-thumbnail-jump')){
      const current=String(+entry.dataset.epubPage===n);if(entry.getAttribute('aria-current')!==current)entry.setAttribute('aria-current',current);
    }
    return;
  }
  const n=measuredAnchor?.kind==='pdf'&&measuredAnchor.page?measuredAnchor.page:pdfCurrentPage();
  const aria=`${n}페이지, 페이지 탐색`;if(button.getAttribute('aria-label')!==aria)button.setAttribute('aria-label',aria);
  if(pdfNavigation&&pdfNavigation.session!==originalSession)closePdfNavigation();
  if(pdfNavigation)for(const button of pdfNavigation.strip.querySelectorAll('.pdf-thumbnail-jump')){
    const index=Number(button.closest('.pdf-thumbnail').dataset.index),current=String(pdfNavigation.pages[index]===n);
    if(button.getAttribute('aria-current')!==current)button.setAttribute('aria-current',current);
    const actions=button.parentElement.querySelector('.pdf-thumbnail-actions');if(actions&&current!=='true')actions.hidden=true;
    const more=button.parentElement.querySelector('.pdf-thumbnail-more');if(more)more.hidden=current!=='true'||!actions.hidden;
  }
}
function closePdfNavigation({release=false}={}){
  if(!pdfNavigation){
    if(release){
      clearTimeout(pdfNavigationCloseTimer);pdfNavigationCloseTimer=null;
      document.getElementById('pdf-page-navigation').hidden=true;
      document.getElementById('pdf-thumbnail-strip').replaceChildren();
      document.getElementById('pdf-page-control').classList.remove('pdf-navigation-closing');
      if(originalSession)originalSession.navigationPreview=null;
    }
    return;
  }
  pdfNavigationGeneration++;pdfNavigationTask?.cancel();pdfNavigationTask=null;
  const panel=document.getElementById('pdf-page-navigation'),control=document.getElementById('pdf-page-control');
  const nav=pdfNavigation,strip=nav.strip,restoreFocus=panel.contains(document.activeElement);
  nav.generation=pdfNavigationGeneration;nav.contact=null;
  for(const cell of strip.querySelectorAll('.pdf-thumbnail[data-rendered]'))if(!cell.querySelector('canvas'))delete cell.dataset.rendered;
  if(release)nav.session.navigationPreview=null;
  control.classList.add('pdf-navigation-closing');panel.inert=true;
  document.getElementById('pdf-navigation-dismiss').hidden=true;
  document.getElementById('pdf-page-button')?.setAttribute('aria-expanded','false');
  pdfNavigation=null;pinReaderChrome(false,'page-navigation');
  clearTimeout(pdfNavigationCloseTimer);
  const finish=()=>{
    panel.hidden=true;if(release)strip.replaceChildren();control.classList.remove('pdf-navigation-closing');pdfNavigationCloseTimer=null;
    if(restoreFocus&&!control.hidden&&(document.activeElement===document.body||panel.contains(document.activeElement)))document.getElementById('pdf-page-button').focus({preventScroll:true});
  };
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)finish();
  else pdfNavigationCloseTimer=setTimeout(finish,220);
}
function togglePdfNavigation(){
  if(pdfNavigation){closePdfNavigation();return;}
  if(currentReaderMode!=='original'||(!currentPdfSession()&&!currentEpubNavigationSession())||document.getElementById('originalwrap').hasAttribute('data-reader-preparing')||sentenceWaitingActive()||BreezePdfInk.busy()||originalPinchBusy())return;
  if(pdfNavigationCloseTimer){clearTimeout(pdfNavigationCloseTimer);pdfNavigationCloseTimer=null;}
  document.getElementById('pdf-page-control').classList.remove('pdf-navigation-closing');
  closePanel();closeSentence();closeAa();expandReaderChrome();
  const settings=document.getElementById('pdf-ink-settings');if(settings)settings.hidden=true;
  const panel=document.getElementById('pdf-page-navigation'),strip=document.getElementById('pdf-thumbnail-strip');
  pdfNavigation=originalSession.navigationPreview||{session:originalSession,strip,bookmarksOnly:false,pages:[]};
  pdfNavigation.generation=++pdfNavigationGeneration;
  originalSession.navigationPreview=pdfNavigation;
  panel.hidden=false;panel.inert=false;document.getElementById('pdf-navigation-dismiss').hidden=false;
  document.getElementById('pdf-page-button').setAttribute('aria-expanded','true');
  // A transparent dismissal surface prevents a closing tap reaching the page.
  pinReaderChrome(true,'page-navigation');
  if(currentEpubNavigationSession())buildEpubNavigation();else buildPdfNavigation(true);
}
/* EPUB has flowing source pages. A book-shaped slice (1:sqrt(2)) fills the
   sidebar without turning tall phone viewports into narrow thumbnail strips.
   This is navigation pagination only; publisher layout stays untouched. */
const EPUB_NAV_PAGE_RATIO=Math.SQRT2;
function epubNavigationCurrentPage(nav){
  const inset=topInset(),spine=nav.session.navigationSpine??0;
  const frame=nav.session.frames[spine];
  const offset=Math.max(0,(inset-(frame?.getBoundingClientRect().top||0))/originalZoom());
  // WebKit scroll offsets can truncate a CSS pixel below the requested slice.
  const local=Math.floor((offset+1/originalZoom())/(nav.pageHeights[spine]||1));
  const first=nav.firstPages[spine]??0;
  return Math.min(nav.pages.length,Math.max(1,first+local+1));
}
function buildEpubNavigation(focusCurrent=true){
  const nav=pdfNavigation;if(!nav||!currentEpubNavigationSession())return;
  // Reflow must not remove the button between contact down and its click.
  if(nav.contact!=null){nav.needsLayout={focusCurrent:focusCurrent||!!nav.needsLayout?.focusCurrent};return;}
  nav.needsLayout=null;
  const signature=nav.session.frames.map(frame=>frame?`${frame.clientWidth}:${frame.clientHeight}`:'').join('|');
  if(nav.signature!==signature){
    nav.signature=signature;nav.pageHeights=[];nav.pages=[];nav.firstPages=[];nav.previewHtml=new Map();
    nav.session.frames.forEach((frame,spine)=>{
      if(!frame||!frame.clientWidth)return;nav.firstPages[spine]=nav.pages.length;
      const pageHeight=frame.clientWidth*EPUB_NAV_PAGE_RATIO;nav.pageHeights[spine]=pageHeight;
      for(let y=0;y<frame.clientHeight;y+=pageHeight)nav.pages.push({spine,y,width:frame.clientWidth,height:frame.clientHeight});
    });
    nav.strip.replaceChildren();nav.track=document.createElement('div');nav.track.className='pdf-thumbnail-track';nav.strip.append(nav.track);
  }
  const width=Math.max(44,nav.strip.clientWidth-8),first=epubNavigationCurrentPage(nav);
  const widthChanged=nav.width!==width;nav.width=width;
  nav.previewWidth=width;
  nav.cellHeight=width*EPUB_NAV_PAGE_RATIO+20;
  const bookmarks=readEpubBookmarks(nav.session)||[];
  nav.bookmarkAnchors=new Map();
  for(const anchor of bookmarks){
    const index=epubBookmarkPage(nav,anchor);if(index===null)continue;
    if(!nav.bookmarkAnchors.has(index))nav.bookmarkAnchors.set(index,[]);
    nav.bookmarkAnchors.get(index).push(anchor);
  }
  nav.bookmarkPages=new Set(nav.bookmarkAnchors.keys());
  const visible=nav.pages.map((_,index)=>index).filter(index=>!nav.bookmarksOnly||nav.bookmarkPages.has(index));
  const filterChanged=!nav.visiblePages||visible.length!==nav.visiblePages.length||visible.some((index,i)=>index!==nav.visiblePages[i]);
  nav.visiblePages=visible;
  document.getElementById('pdf-bookmarks-only').setAttribute('aria-pressed',String(nav.bookmarksOnly));
  nav.track.style.height=`${visible.length*nav.cellHeight}px`;
  if(widthChanged||filterChanged)nav.track.replaceChildren();
  if(focusCurrent)nav.strip.scrollTop=Math.max(0,visible.indexOf(first-1))*nav.cellHeight;
  for(const cell of nav.track.children)cell.querySelector('.pdf-thumbnail-bookmark')?.setAttribute('aria-pressed',String(nav.bookmarkPages.has(+cell.dataset.pageIndex)));
  paintEpubThumbnails();updatePdfNavigationControls();
}
// One source slice, one bounded motion. A newer selection or user scroll wins.
async function goEpubNavigationPage(nav,index){
  if(pdfNavigation!==nav||!currentEpubNavigationSession())return;
  const page=nav.pages[index],source=page&&nav.session.frames[page.spine];if(!source)return;
  const session=nav.session,token=++readerModeChangeToken;
  if(typeof closePanel==='function')closePanel();
  session.pendingAnchor=null;
  const start=readerScrollTop(),target=Math.max(0,Math.min(readerContentHeight()-readerViewHeight(),
    start+source.getBoundingClientRect().top+page.y*originalZoom()-topInset()));
  const current=()=>session===originalSession&&currentReaderMode==='original'&&token===readerModeChangeToken;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)readerScrollTo(target);
  else await new Promise(resolve=>{
    const began=performance.now();let applied=start;
    const step=now=>{
      if(!current()||!!activeGesture||Math.abs(readerScrollTop()-applied)>2){resolve();return;}
      // A queued rAF timestamp can predate the event that began this move.
      const t=Math.max(0,Math.min(1,(now-began)/200));
      readerScrollTo(start+(target-start)*(1-Math.pow(1-t,3)));applied=readerScrollTop();
      if(t<1)requestAnimationFrame(step);else resolve();
    };requestAnimationFrame(step);
  });
  if(!current())return;
  // Capture where the motion actually ended if direct input interrupted it.
  session.navigationSpine=page.spine;saveReadingState();updatePfill(true);updatePdfNavigationControls();
}
function installEpubNavigationContact(){
  const strip=document.getElementById('pdf-thumbnail-strip');
  strip.addEventListener('pointerdown',event=>{
    const nav=pdfNavigation;if(nav?.session.kind==='epub'&&event.isPrimary!==false)nav.contact={id:event.pointerId};
  },{capture:true,passive:true});
  const finish=event=>{
    const nav=pdfNavigation,contact=nav?.contact;if(!contact||contact.id!==event.pointerId)return;
    // The click belongs to the pressed button before deferred reflow/virtualization.
    requestAnimationFrame(()=>{
      if(pdfNavigation!==nav||nav.contact!==contact)return;
      nav.contact=null;
      if(nav.needsLayout){const focus=nav.needsLayout.focusCurrent;nav.needsLayout=null;buildEpubNavigation(focus);}
      else paintEpubThumbnails();
    });
  };
  document.addEventListener('pointerup',finish,{capture:true,passive:true});
  document.addEventListener('pointercancel',finish,{capture:true,passive:true});
}
function paintEpubThumbnails(){
  const nav=pdfNavigation;if(!nav||nav.session.kind!=='epub'||!nav.track)return;
  if(nav.contact!=null)return;
  const start=Math.max(0,Math.floor(nav.strip.scrollTop/nav.cellHeight)-1);
  const end=Math.min(nav.visiblePages.length,Math.ceil((nav.strip.scrollTop+nav.strip.clientHeight)/nav.cellHeight)+1);
  for(const cell of [...nav.track.children])if(+cell.dataset.index<start||+cell.dataset.index>=end)cell.remove();
  for(let i=start;i<end;i++){
    if(nav.track.querySelector(`[data-index="${i}"]`))continue;
    const pageIndex=nav.visiblePages[i],page=nav.pages[pageIndex];
    const cell=document.createElement('div');cell.className='pdf-thumbnail';cell.dataset.index=String(i);cell.dataset.pageIndex=String(pageIndex);
    cell.style.top=`${i*nav.cellHeight}px`;cell.style.height=`${nav.cellHeight-8}px`;
    const holder=document.createElement('div');holder.className='pdf-thumbnail-frame';
    const jump=document.createElement('button');jump.type='button';jump.className='pdf-thumbnail-jump';jump.dataset.epubPage=String(pageIndex+1);
    jump.setAttribute('aria-label',`${pageIndex+1}페이지로 이동`);jump.setAttribute('aria-current',String(pageIndex+1===epubNavigationCurrentPage(nav)));
    jump.onclick=()=>void goEpubNavigationPage(nav,pageIndex);
    const paper=document.createElement('div');paper.className='pdf-thumbnail-paper epub-thumbnail-paper';
    paper.style.width=`${nav.previewWidth}px`;paper.style.height=`${nav.previewWidth*EPUB_NAV_PAGE_RATIO}px`;
    const label=document.createElement('span');label.textContent=String(pageIndex+1);
    const bookmark=document.createElement('button');bookmark.type='button';bookmark.className='pdf-thumbnail-bookmark';
    bookmark.innerHTML='<svg viewBox="0 0 24 32" aria-hidden="true"><path d="M3 1h18v28l-9-6-9 6Z"/></svg>';
    bookmark.setAttribute('aria-label',`${pageIndex+1}페이지 북마크`);bookmark.setAttribute('aria-pressed',String(nav.bookmarkPages.has(pageIndex)));
    bookmark.onclick=()=>toggleEpubBookmark(nav,pageIndex);
    jump.append(paper,label);holder.append(jump,bookmark);cell.append(holder);nav.track.append(cell);
  }
  syncPdfNavigationScrollbar();
  void renderEpubPreviewQueue(nav);
}
/* Let the shared sidebar land before laying out publisher documents. One
   visible preview per turn keeps navigation responsive; close/reopen cancels
   stale work through the same generation used by PDF rendering. */
async function renderEpubPreviewQueue(nav){
  if(nav.previewRendering)return;
  nav.previewRendering=true;
  const generation=nav.generation;
  try{
    await Promise.allSettled(document.getElementById('pdf-page-control').getAnimations().map(animation=>animation.finished));
    while(pdfNavigation===nav&&nav.generation===generation&&nav.contact==null){
      const paper=nav.track.querySelector('.epub-thumbnail-paper:not(:has(iframe))');
      if(!paper)break;
      const page=nav.pages[+paper.closest('.pdf-thumbnail').dataset.pageIndex];
      const source=nav.session.frames[page.spine],scale=nav.previewWidth/page.width;
      const preview=document.createElement('iframe');preview.className='epub-page-preview';preview.tabIndex=-1;preview.setAttribute('aria-hidden','true');
      preview.setAttribute('sandbox','allow-same-origin');preview.setAttribute('scrolling','no');
      preview.style.width=`${page.width}px`;preview.style.height=`${Math.min(nav.pageHeights[page.spine],page.height-page.y)}px`;
      preview.style.transform=`scale(${scale})`;
      if(!nav.previewHtml.has(page.spine)){
        const root=source.contentDocument.documentElement.cloneNode(true);
        root.querySelectorAll('.original-selection-marker,script').forEach(node=>node.remove());
        root.querySelectorAll('img[loading]').forEach(img=>img.setAttribute('loading','eager'));
        [...root.querySelectorAll('style')].forEach((style,index)=>{
          try{style.textContent=[...source.contentDocument.querySelectorAll('style')[index].sheet.cssRules].map(rule=>rule.cssText).join('\n');}catch(error){}
        });
        nav.previewHtml.set(page.spine,'<!doctype html>'+root.outerHTML);
      }
      // Keep the browsing viewport one slice high. Translating a chapter-tall
      // iframe can leave distant WebKit tiles unpainted (and allocates a huge
      // surface for each tiny thumbnail). Scroll inside the bounded viewport.
      preview.addEventListener('load',async()=>{
        const doc=preview.contentDocument;if(!doc||!preview.isConnected)return;
        doc.documentElement.style.height=`${page.height}px`;
        doc.documentElement.style.scrollBehavior='auto';
        preview.contentWindow.scrollTo(0,page.y);
        await doc.fonts?.ready;
        if(preview.isConnected){preview.contentWindow.scrollTo(0,page.y);preview.dataset.ready='true';}
      },{once:true});
      preview.srcdoc=nav.previewHtml.get(page.spine);
      paper.append(preview);
      await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
    }
  }finally{
    nav.previewRendering=false;
    if(pdfNavigation===nav&&nav.generation!==generation)void renderEpubPreviewQueue(nav);
  }
}

function buildPdfNavigation(focusCurrent){
  const nav=pdfNavigation;if(!nav)return;
  pdfNavigationTask?.cancel();pdfNavigationTask=null;nav.generation=++pdfNavigationGeneration;
  for(const cell of nav.track?.querySelectorAll('.pdf-thumbnail[data-rendered]')||[])if(!cell.querySelector('canvas'))delete cell.dataset.rendered;
  const bookmarks=readPdfBookmarks(nav.session)||[];
  const pages=(nav.bookmarksOnly?bookmarks:pdfAvailablePages(nav.session)).filter(n=>!nav.session.deletedPages?.has(n));
  document.getElementById('pdf-bookmarks-only').setAttribute('aria-pressed',String(nav.bookmarksOnly));
  nav.bookmarks=new Set(bookmarks);
  if(nav.track?.isConnected&&pages.length===nav.pages.length&&pages.every((n,i)=>n===nav.pages[i])){
    layoutPdfThumbnails(nav);
    for(const cell of nav.track.querySelectorAll('.pdf-thumbnail'))cell.querySelector('.pdf-thumbnail-bookmark').setAttribute('aria-pressed',String(nav.bookmarks.has(nav.pages[+cell.dataset.index])));
    if(focusCurrent)nav.strip.scrollTop=nav.offsets[Math.max(0,nav.pages.indexOf(pdfCurrentPage()))]||0;
    paintPdfThumbnails();updatePdfNavigationControls();return;
  }
  nav.pages=pages;nav.strip.replaceChildren();
  const track=document.createElement('div');track.className='pdf-thumbnail-track';
  nav.strip.append(track);nav.track=track;nav.offsets=null;
  layoutPdfThumbnails(nav);
  if(focusCurrent)nav.strip.scrollTop=nav.offsets[Math.max(0,nav.pages.indexOf(pdfCurrentPage()))]||0;
  paintPdfThumbnails();
}
function pdfThumbnailIndexAtOffset(offsets,y){
  let low=0,high=Math.max(0,offsets.length-1);
  while(low<high){const mid=(low+high)>>1;if(offsets[mid+1]<=y)low=mid+1;else high=mid;}
  return low;
}
function pdfThumbnailRatio(nav,n){
  const known=nav.session.thumbnailRatios?.get(n);if(known)return known;
  const raw=nav.session.pages[n-1]?.style.aspectRatio||'0.77';
  const [width,height=1]=raw.split('/').map(Number);return width/height||.77;
}
function layoutPdfThumbnails(nav){
  const previous=nav.offsets,index=previous?pdfThumbnailIndexAtOffset(previous,nav.strip.scrollTop):0;
  const delta=previous?nav.strip.scrollTop-(previous[index]||0):0;
  nav.width=nav.strip.clientWidth;nav.previewWidth=Math.max(44,nav.width-8);
  const offsets=[0];
  for(const n of nav.pages)offsets.push(offsets.at(-1)+Math.max(44,Math.min(180,nav.previewWidth/pdfThumbnailRatio(nav,n))+12)+8);
  nav.offsets=offsets;nav.track.style.height=`${Math.max(0,offsets.at(-1)-8)}px`;
  for(const cell of nav.track.children){
    const i=+cell.dataset.index;cell.style.top=`${offsets[i]}px`;cell.style.height=`${offsets[i+1]-offsets[i]-8}px`;
    const canvas=cell.querySelector('canvas');if(canvas)canvas.style.width=`${Math.min(nav.previewWidth,180*pdfThumbnailRatio(nav,nav.pages[i]))}px`;
  }
  if(previous)nav.strip.scrollTop=(offsets[index]||0)+delta;
}
function paintPdfThumbnails(){
  syncPdfNavigationScrollbar();
  if(pdfNavigation?.session.kind==='epub'){paintEpubThumbnails();return;}
  const nav=pdfNavigation;if(!nav||!currentPdfSession(nav.session))return;
  const currentPage=pdfCurrentPage();
  if(nav.width!==nav.strip.clientWidth)layoutPdfThumbnails(nav);
  const start=Math.max(0,pdfThumbnailIndexAtOffset(nav.offsets,nav.strip.scrollTop)-1);
  const end=Math.min(nav.pages.length,pdfThumbnailIndexAtOffset(nav.offsets,nav.strip.scrollTop+nav.strip.clientHeight)+3);
  for(const child of [...nav.track.children])if(+child.dataset.index<start||+child.dataset.index>=end){
    const canvas=child.querySelector('canvas');if(canvas){canvas.width=0;canvas.height=0;}child.remove();
  }
  for(let i=start;i<end;i++){
    if(nav.track.querySelector(`[data-index="${i}"]`))continue;
    const n=nav.pages[i],cell=document.createElement('div');cell.className='pdf-thumbnail';cell.dataset.index=String(i);cell.style.top=`${nav.offsets[i]}px`;cell.style.height=`${nav.offsets[i+1]-nav.offsets[i]-8}px`;
    const frame=document.createElement('div');frame.className='pdf-thumbnail-frame';
    const jump=document.createElement('button');jump.type='button';jump.className='pdf-thumbnail-jump';jump.setAttribute('aria-label',`${n}페이지로 이동`);
    jump.setAttribute('aria-current',String(n===currentPage));
    jump.onclick=()=>void goPdfPage(n,{keepNavigation:true});
    const paper=document.createElement('div');paper.className='pdf-thumbnail-paper';jump.append(paper);
    const more=document.createElement('button');more.type='button';more.className='pdf-thumbnail-more';more.hidden=n!==currentPage;
    more.setAttribute('aria-label',`${n}페이지 삭제 옵션`);more.setAttribute('aria-expanded','false');
    more.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
    const actions=document.createElement('div');actions.className='pdf-thumbnail-actions';actions.hidden=true;
    actions.setAttribute('role','group');actions.setAttribute('aria-label',`${n}페이지 삭제`);
    const cancel=document.createElement('button');cancel.type='button';cancel.setAttribute('aria-label','삭제 취소');cancel.dataset.pdfDeleteCancel='';
    cancel.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';
    cancel.onclick=()=>{actions.hidden=true;more.hidden=false;more.setAttribute('aria-expanded','false');more.focus({preventScroll:true});};
    const remove=document.createElement('button');remove.type='button';remove.setAttribute('aria-label',`${n}페이지 삭제`);remove.dataset.pdfDeleteConfirm='';
    remove.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7"/></svg>';
    remove.onclick=()=>{if(currentPdfSession(nav.session)&&pdfNavigation===nav){remove.disabled=true;void deletePdfPage(nav.session,n).finally(()=>{if(remove.isConnected)remove.disabled=false;});}};
    actions.append(cancel,remove);
    more.onclick=()=>offerPdfPageDeletion(nav.session,n);
    const label=document.createElement('span');label.textContent=String(n);jump.append(label);
    const bookmark=document.createElement('button');bookmark.type='button';bookmark.className='pdf-thumbnail-bookmark';bookmark.innerHTML='<svg viewBox="0 0 24 32" aria-hidden="true"><path d="M3 1h18v28l-9-6-9 6Z"/></svg>';
    bookmark.setAttribute('aria-label',`${n}페이지 북마크`);bookmark.setAttribute('aria-pressed',String(nav.bookmarks.has(n)));
    bookmark.onclick=()=>togglePdfBookmark(nav.session,n);frame.append(jump,bookmark,more,actions);cell.append(frame);nav.track.append(cell);
  }
  void renderPdfThumbnailQueue(nav);
}
function alignPdfBookmark(cell){
  const paper=cell.querySelector('.pdf-thumbnail-paper'),bookmark=cell.querySelector('.pdf-thumbnail-bookmark');
  if(paper&&bookmark)bookmark.style.right=`${cell.querySelector('.pdf-thumbnail-frame').getBoundingClientRect().right-paper.getBoundingClientRect().right}px`;
}
async function renderPdfThumbnailQueue(nav){
  if(nav.rendering)return;nav.rendering=true;
  const generation=nav.generation;
  try{
    while(pdfNavigation===nav&&nav.generation===generation&&currentPdfSession(nav.session)){
      const cell=nav.track.querySelector('.pdf-thumbnail:not([data-rendered])');if(!cell)break;
      cell.dataset.rendered='true';const n=nav.pages[+cell.dataset.index];
      const page=await nav.session.pdf.getPage(n);
      if(pdfNavigation!==nav||nav.generation!==generation||!cell.isConnected)continue;
      const base=page.getViewport({scale:1});
      const aspect=base.width/base.height;
      const ratioChanged=Math.abs(pdfThumbnailRatio(nav,n)-aspect)>.0001;
      nav.session.thumbnailRatios??=new Map();
      nav.session.thumbnailRatios.set(n,aspect);
      if(ratioChanged){layoutPdfThumbnails(nav);nav.needsPaint=true;}
      const scale=Math.min(nav.previewWidth/base.width,180/base.height);
      const ratio=Math.min(2,window.devicePixelRatio||1),viewport=page.getViewport({scale:scale*ratio});
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      canvas.style.width=`${base.width*scale}px`;canvas.style.height='auto';canvas.style.aspectRatio=`${base.width} / ${base.height}`;
      const task=page.render({canvasContext:canvas.getContext('2d'),viewport});pdfNavigationTask=task;
      try{await task.promise;}catch(error){if(error.name!=='RenderingCancelledException')console.warn('Thumbnail unavailable',error);}
      if(pdfNavigationTask===task)pdfNavigationTask=null;
      if(pdfNavigation===nav&&nav.generation===generation&&cell.isConnected){cell.querySelector('.pdf-thumbnail-paper').append(canvas);alignPdfBookmark(cell);}
      else{canvas.width=0;canvas.height=0;}
    }
  }catch(error){console.warn('Thumbnail unavailable',error);}
  finally{
    nav.rendering=false;
    if(pdfNavigation===nav){
      if(nav.generation!==generation)void renderPdfThumbnailQueue(nav);
      else if(nav.needsPaint){nav.needsPaint=false;paintPdfThumbnails();}
    }
  }
}
/* A narrow visual thumb with a larger touch target works in WKWebView too,
   where overlay scrollbars cannot reliably be grabbed with a finger. */
function syncPdfNavigationScrollbar(){
  const strip=document.getElementById('pdf-thumbnail-strip'),thumb=document.getElementById('pdf-navigation-scrollbar');
  if(!strip||!thumb)return;
  const height=strip.clientHeight,range=Math.max(0,strip.scrollHeight-height);
  thumb.hidden=!pdfNavigation||range<1||height<1;
  if(thumb.hidden)return;
  const size=Math.min(height,Math.max(44,height*height/strip.scrollHeight));
  const top=(height-size)*Math.max(0,Math.min(1,strip.scrollTop/range));
  const h=`${size}px`,y=`translateY(${top}px)`;
  if(thumb.style.height!==h)thumb.style.height=h;
  if(thumb.style.transform!==y)thumb.style.transform=y;
  thumb.setAttribute('aria-valuenow',String(Math.round(100*Math.max(0,Math.min(1,strip.scrollTop/range)))));
}
function installPdfNavigationScrollbar(){
  const strip=document.getElementById('pdf-thumbnail-strip'),thumb=document.getElementById('pdf-navigation-scrollbar');
  let drag=null;
  thumb.addEventListener('pointerdown',event=>{
    if(event.button!==0||thumb.hidden)return;
    const range=strip.scrollHeight-strip.clientHeight,travel=strip.clientHeight-thumb.offsetHeight;
    if(range<=0||travel<=0)return;
    event.preventDefault();event.stopPropagation();
    drag={id:event.pointerId,y:event.clientY,top:strip.scrollTop,ratio:range/travel};
    thumb.setPointerCapture(event.pointerId);thumb.classList.add('dragging');
  });
  thumb.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    event.preventDefault();strip.scrollTop=drag.top+(event.clientY-drag.y)*drag.ratio;
  });
  const finish=event=>{
    if(!drag||drag.id!==event.pointerId)return;
    drag=null;thumb.classList.remove('dragging');
    if(thumb.hasPointerCapture(event.pointerId))thumb.releasePointerCapture(event.pointerId);
  };
  for(const name of ['pointerup','pointercancel','lostpointercapture'])thumb.addEventListener(name,finish);
  thumb.addEventListener('keydown',event=>{
    const step=event.key==='ArrowDown'?44:event.key==='ArrowUp'?-44:event.key==='PageDown'?strip.clientHeight:event.key==='PageUp'?-strip.clientHeight:0;
    if(!step&&!['Home','End'].includes(event.key))return;
    event.preventDefault();strip.scrollTop=event.key==='Home'?0:event.key==='End'?strip.scrollHeight:strip.scrollTop+step;
  });
}
// The original-input owner (pdf-pinch.js) feeds this one candidate. Edge-open
// and horizontal paging are mutually exclusive; no independent swipe listeners.
let originalNavigationContact=null,originalNavigationTail=false;
function originalNavigationAllowed(){
  return document.body.classList.contains('reading')&&currentReaderMode==='original'
    &&(currentPdfSession()||currentEpubNavigationSession())&&originalZoom()<=1.01
    &&!readerPositionPending()&&!BreezePdfInk.busy()&&!originalPinchBusy()&&!originalPinchTouches
    &&!pdfNavigation&&!sentenceModalOpen()&&!wordPanelOpen()&&!aaPopOpen()
    &&!sentenceWaitingActive()&&!document.querySelector('dialog[open],#pdf-ink-settings:not([hidden])');
}
function cancelOriginalNavigation(){originalNavigationContact=null;}
function originalNavigationStart(event){
  // Any added contact cancels, including a Pencil or a finger left after pinch.
  originalNavigationContact=null;
  // touchstart with one live contact is a new sequence, even if the browser
  // reuses an identifier after losing the old terminal delivery.
  if(event.touches.length!==1||!event.cancelable||!originalNavigationAllowed())return;
  originalNavigationTail=false; // A fresh live list also recovers a lost terminal event.
  const touch=event.touches[0],target=touch.target;
  if(!BreezePdfInk.finger(touch)||!(target instanceof Element)
      ||!target.closest('#originalwrap')||target.closest('button,input,textarea,select,[role=dialog]'))return;
  const box=readerScroller(),rect=box.getBoundingClientRect(),x=touch.clientX-rect.left;
  const edge=x>=0&&x<=24;
  if(!edge&&(!pdfHorizontal()||!target.closest('.pdf-source-page')))return;
  originalNavigationContact={id:touch.identifier,x:touch.clientX,y:touch.clientY,
    session:originalSession,gesture:activeGesture,edge,claimed:false,top:box.scrollTop,left:box.scrollLeft};
}
function originalNavigationMove(event){
  const contact=originalNavigationContact;if(!contact)return false;
  if(event.touches.length!==1||!event.cancelable||!originalNavigationAllowed()||contact.gesture?.dispatched){
    cancelOriginalNavigation();return false;
  }
  const touch=[...event.touches].find(t=>t.identifier===contact.id);if(!touch){cancelOriginalNavigation();return false;}
  const dx=touch.clientX-contact.x,dy=touch.clientY-contact.y;
  // Native scroll that was already admitted keeps the contact. No late stealing.
  const box=readerScroller();
  if(box.scrollTop!==contact.top||box.scrollLeft!==contact.left){
    cancelOriginalNavigation();return false;
  }
  if(!contact.claimed&&Math.hypot(dx,dy)>10){
    if(Math.abs(dx)<Math.abs(dy)*1.8||(contact.edge&&dx<=0)){
      cancelOriginalNavigation();return false;
    }
    contact.claimed=true;originalNavigationTail=true;
    cancelGesture('original navigation owns contact');reclaimReaderSelection();
  }
  if(contact.claimed){event.preventDefault();return true;}
  return false;
}
function originalNavigationEnd(event){
  const contact=originalNavigationContact;
  if(!contact||![...event.changedTouches].some(t=>t.identifier===contact.id))return;
  originalNavigationContact=null;
  if(!contact.claimed||event.type!=='touchend'||event.touches.length
      ||contact.session!==originalSession||!originalNavigationAllowed())return;
  const touch=[...event.changedTouches].find(t=>t.identifier===contact.id);
  const dx=touch.clientX-contact.x,dy=touch.clientY-contact.y;
  if(event.cancelable)event.preventDefault();
  if(Math.abs(dx)<60||Math.abs(dx)<Math.abs(dy)*1.8)return;
  if(contact.edge){if(dx>0)togglePdfNavigation();}
  else void stepPdfPage(dx<0?1:-1);
}
function originalNavigationPointerEnd(event){
  if(originalNavigationContact&&event.pointerType==='touch')originalNavigationContact.pointerEnded=true;
}
function originalNavigationLostCapture(){
  if(originalNavigationContact&&!originalNavigationContact.pointerEnded)cancelOriginalNavigation();
}
function originalNavigationConsumes(event){
  if(event.type==='pointerdown'&&!originalNavigationContact)originalNavigationTail=false;
  return !!originalNavigationContact?.claimed||(event.type==='click'&&event.detail!==0&&originalNavigationTail);
}
window.addEventListener('resize',cancelOriginalNavigation);
window.addEventListener('blur',cancelOriginalNavigation);
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelOriginalNavigation();});

document.addEventListener('DOMContentLoaded',()=>{
  installPdfNavigationScrollbar();installEpubNavigationContact();
  document.addEventListener('click',event=>{
    if(event.target instanceof Element&&event.target.closest('#aafab,#pdf-ink-tools,[data-ink-toggle]'))closePdfNavigation();
  },true);
  document.getElementById('pdf-bookmarks-only').onclick=()=>{if(pdfNavigation){pdfNavigation.bookmarksOnly=!pdfNavigation.bookmarksOnly;if(pdfNavigation.session.kind==='epub')buildEpubNavigation(true);else buildPdfNavigation(true);}};
  document.getElementById('pdf-thumbnail-strip').addEventListener('scroll',paintPdfThumbnails,{passive:true});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&pdfNavigation&&!document.querySelector('dialog[open]')){
      const cancel=pdfNavigation.strip.querySelector('.pdf-thumbnail-actions:not([hidden]) [data-pdf-delete-cancel]');
      if(cancel){cancel.click();return;}
      closePdfNavigation();}
    if(!['ArrowLeft','ArrowRight'].includes(event.key)||event.defaultPrevented||event.repeat||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;
    if(currentReaderMode!=='original'||!pdfHorizontal()||document.activeElement?.matches('input,textarea,select,[contenteditable]')||document.querySelector('dialog[open]')||sentenceModalOpen()||wordPanelOpen()||aaPopOpen()||pdfNavigation||BreezePdfInk.busy()||originalPinchBusy())return;
    event.preventDefault();void stepPdfPage(event.key==='ArrowRight'?1:-1);
  });
  const resize=new ResizeObserver(entries=>{
    if(entries.some(entry=>entry.target.id!=='pdf-thumbnail-strip'))positionPdfInkSettings();
    if(pdfNavigation?.session.kind==='epub'&&entries.some(entry=>entry.target.id!=='readpill')){buildEpubNavigation(false);}
    if(pdfNavigation&&currentPdfSession(pdfNavigation.session)&&entries.some(entry=>entry.target.id!=='readpill')){
      paintPdfThumbnails();
      pdfNavigation.track.querySelectorAll('.pdf-thumbnail').forEach(alignPdfBookmark);
    }
  });
  resize.observe(document.getElementById('readmain'));resize.observe(document.getElementById('readpill'));resize.observe(document.getElementById('pdf-thumbnail-strip'));

});

let pdfDeletionBusy=false;
function pdfAvailablePages(session=originalSession){
  if(!session?.pages)return [];
  if(!session.availablePages)session.availablePages=session.pages.map((_,i)=>i+1).filter(n=>!session.deletedPages?.has(n));
  return session.availablePages;
}
function pdfNearestPage(session,n){
  const available=pdfAvailablePages(session);
  return available.find(page=>page>=n)||available.at(-1)||1;
}
function stepPdfPage(direction){
  const pages=pdfAvailablePages(),index=pages.indexOf(pdfCurrentPage());
  return goPdfPage(pages[Math.max(0,Math.min(pages.length-1,index+direction))]||1);
}
function offerPdfPageDeletion(session,n){
  if(pdfDeletionBusy||!currentPdfSession(session)||pdfNavigation?.session!==session)return;
  if(pdfAvailablePages(session).length<=1){toast('마지막 페이지는 삭제할 수 없어요.');return;}
  const cell=pdfNavigation.track.querySelector(`[data-index="${pdfNavigation.pages.indexOf(n)}"]`);
  if(!cell)return;
  const more=cell.querySelector('.pdf-thumbnail-more'),actions=cell.querySelector('.pdf-thumbnail-actions');
  more.hidden=true;more.setAttribute('aria-expanded','true');actions.hidden=false;
  actions.querySelector('[data-pdf-delete-cancel]').focus({preventScroll:true});
}
async function deletePdfPage(session,n){
  if(pdfDeletionBusy||!currentPdfSession(session)||BreezePdfInk.busy()||originalPinchBusy()||pdfAvailablePages(session).length<=1)return false;
  const book=curBook;if(!book||book.transient)return false;
  pdfDeletionBusy=true;
  const deleted=new Set(session.deletedPages||[]);deleted.add(n);
  const anchor=capturePdfAnchor(topInset());
  try{
    toast('페이지와 텍스트를 정리하고 있어요…');
    // Re-extract retained source pages: a paragraph can cross a page boundary,
    // so deleting by paragraph.startPage would erase or retain the wrong words.
    const parsed=await extractPdfParagraphs(session.pdf,deleted,()=>{});
    if(!currentPdfSession(session)||curBook!==book)return false;
    const signals=parsed.sig||[],paras=Array.from(parsed,text=>applyLigatures(text,book.glyphs));
    const textAvailable=paras.length>0;
    if(!textAvailable){paras.push('이 PDF에는 선택할 수 있는 글자가 없어요. 원본 모드에서 읽어주세요.');signals.push({p:pdfAvailablePages(session).find(page=>page!==n)||1,y:0});}
    const formatting=buildFormattingFromLayout(paras,signals,null);
    const candidate={...book,deletedPdfPages:[...deleted].sort((a,b)=>a-b),paras,
      sourceMap:buildSourceMap(signals),layoutSignals:packLayoutSignals(signals),
      formatting:formatting&&validateFormattingBlocks(paras,formatting.blocks)?formatting:null,
      textAvailable,localSourceAt:Date.now()};
    await bookPut(candidate);
    Object.assign(book,candidate);
    if(!currentPdfSession(session)||curBook!==book)return true;
    session.deletedPages=deleted;session.availablePages=null;
    ++readerModeChangeToken;
    closePdfNavigation();renderBookBody(book);applyPdfDirection(session,anchor?.page||1);
    await restorePdfAnchor({...anchor,page:pdfNearestPage(session,anchor?.page||1)},topInset());
    saveReadingState();updatePfill(true);toast('페이지를 삭제했어요');return true;
  }catch(error){console.warn('Page deletion failed',error);toast('페이지를 삭제하지 못했어요. 다시 시도해 주세요.');return false;}
  finally{pdfDeletionBusy=false;}
}

function positionPdfInkSettings(){
  const panel=document.getElementById('pdf-ink-settings');
  if(!panel||panel.hidden)return;
  const chrome=document.getElementById('readchrome'),pill=document.getElementById('readpill');
  if(!chrome||!pill)return;
  const bottom=chrome.getBoundingClientRect().bottom-pill.getBoundingClientRect().top+12;
  const value=`${Math.max(56,bottom)}px`;
  if(panel.style.bottom!==value)panel.style.bottom=value;
}
