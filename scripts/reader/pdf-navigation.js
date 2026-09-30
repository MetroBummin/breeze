/* A bounded vertical thumbnail panel beside the PDF. Source pages,
   lexical geometry and ink retain their document/session ownership. */
let pdfNavigation=null,pdfNavigationGeneration=0,pdfNavigationTask=null;
let lastPdfDirectionState=null;
const PDF_THUMB_SLOT=224;
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
  const session=originalSession,anchor=currentPdfSession(session)?capturePdfAnchor(topInset()):null;
  if(!persistStudyPrefs({...studyPrefs,direction}))return;
  if(anchor){const token=++readerModeChangeToken;applyPdfDirection(session,anchor.page);await restorePdfAnchor(anchor,topInset(),token);}
  if(currentPdfSession(session)){saveReadingState();updatePfill(true);}
  if(direction==='horizontal')toast('좌우 방향키나 스와이프로 페이지를 넘겨요.');
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
  const ready=currentReaderMode==='original'&&currentPdfSession();
  if(button.hidden===ready)button.hidden=!ready;
  const control=document.getElementById('pdf-page-control');if(control.hidden===ready)control.hidden=!ready;
  const directionRow=document.getElementById('aa-pdf-direction');if(directionRow.hidden===ready)directionRow.hidden=!ready;
  if(lastPdfDirectionState!==studyPrefs.direction){
    for(const direction of ['vertical','horizontal'])document.querySelector(`[data-pdf-direction="${direction}"]`)?.setAttribute('aria-pressed',String(studyPrefs.direction===direction));
    lastPdfDirectionState=studyPrefs.direction;
  }
  if(!ready){closePdfNavigation();return;}
  const n=measuredAnchor?.kind==='pdf'&&measuredAnchor.page?measuredAnchor.page:pdfCurrentPage();
  const aria=`${n}페이지, 페이지 탐색`;if(button.getAttribute('aria-label')!==aria)button.setAttribute('aria-label',aria);
  if(pdfNavigation&&pdfNavigation.session!==originalSession)closePdfNavigation();
  if(pdfNavigation)for(const button of pdfNavigation.strip.querySelectorAll('.pdf-thumbnail-jump')){
    const index=Number(button.parentElement.dataset.index),current=String(pdfNavigation.pages[index]===n);
    if(button.getAttribute('aria-current')!==current)button.setAttribute('aria-current',current);
    const actions=button.parentElement.querySelector('.pdf-thumbnail-actions');if(actions&&current!=='true')actions.hidden=true;
    const more=button.parentElement.querySelector('.pdf-thumbnail-more');if(more)more.hidden=current!=='true'||!actions.hidden;
  }
}
function closePdfNavigation(){
  if(!pdfNavigation)return;
  pdfNavigationGeneration++;pdfNavigationTask?.cancel();pdfNavigationTask=null;
  document.getElementById('pdf-page-navigation')?.setAttribute('hidden','');
  document.getElementById('pdf-navigation-dismiss').hidden=true;
  document.getElementById('pdf-page-button')?.setAttribute('aria-expanded','false');
  if(pdfNavigation){
    pdfNavigation.strip.replaceChildren();pdfNavigation=null;
    pinReaderChrome(false,'page-navigation');
  }
}
function togglePdfNavigation(){
  if(pdfNavigation){closePdfNavigation();return;}
  if(currentReaderMode!=='original'||!currentPdfSession()||BreezePdfInk.busy()||originalPinchBusy())return;
  closeAa();expandReaderChrome();
  const settings=document.getElementById('pdf-ink-settings');if(settings)settings.hidden=true;
  const panel=document.getElementById('pdf-page-navigation'),strip=document.getElementById('pdf-thumbnail-strip');
  pdfNavigation={session:originalSession,strip,bookmarksOnly:false,pages:[],generation:++pdfNavigationGeneration};
  panel.hidden=false;document.getElementById('pdf-navigation-dismiss').hidden=false;
  document.getElementById('pdf-page-button').setAttribute('aria-expanded','true');
  // A transparent dismissal surface prevents a closing tap reaching the page.
  pinReaderChrome(true,'page-navigation');buildPdfNavigation(true);
}
function buildPdfNavigation(focusCurrent){
  const nav=pdfNavigation;if(!nav)return;
  pdfNavigationTask?.cancel();pdfNavigationTask=null;nav.generation=++pdfNavigationGeneration;
  const bookmarks=readPdfBookmarks(nav.session)||[];
  nav.pages=(nav.bookmarksOnly?bookmarks:pdfAvailablePages(nav.session)).filter(n=>!nav.session.deletedPages?.has(n));
  document.getElementById('pdf-bookmarks-only').setAttribute('aria-pressed',String(nav.bookmarksOnly));
  nav.bookmarks=new Set(bookmarks);nav.strip.replaceChildren();
  const track=document.createElement('div');track.className='pdf-thumbnail-track';
  track.style.height=`${nav.pages.length*PDF_THUMB_SLOT+Math.max(0,nav.strip.clientHeight-PDF_THUMB_SLOT)}px`;
  nav.strip.append(track);nav.track=track;
  if(!nav.pages.length)track.style.height='0px';
  if(focusCurrent)nav.strip.scrollTop=Math.max(0,nav.pages.indexOf(pdfCurrentPage()))*PDF_THUMB_SLOT;
  paintPdfThumbnails();
}
function paintPdfThumbnails(){
  const nav=pdfNavigation;if(!nav||!currentPdfSession(nav.session))return;
  const currentPage=pdfCurrentPage();
  if(nav.pages.length){
    const height=`${nav.pages.length*PDF_THUMB_SLOT+Math.max(0,nav.strip.clientHeight-PDF_THUMB_SLOT)}px`;
    if(nav.track.style.height!==height)nav.track.style.height=height;
  }
  const start=Math.max(0,Math.floor(nav.strip.scrollTop/PDF_THUMB_SLOT)-1);
  const end=Math.min(nav.pages.length,start+Math.ceil(nav.strip.clientHeight/PDF_THUMB_SLOT)+3);
  for(const child of [...nav.track.children])if(+child.dataset.index<start||+child.dataset.index>=end){
    const canvas=child.querySelector('canvas');if(canvas){canvas.width=0;canvas.height=0;}child.remove();
  }
  for(let i=start;i<end;i++){
    if(nav.track.querySelector(`[data-index="${i}"]`))continue;
    const n=nav.pages[i],cell=document.createElement('div');cell.className='pdf-thumbnail';cell.dataset.index=String(i);cell.style.top=`${i*PDF_THUMB_SLOT}px`;
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
    bookmark.onclick=()=>togglePdfBookmark(nav.session,n);cell.append(jump,bookmark,more,actions);nav.track.append(cell);
  }
  void renderPdfThumbnailQueue(nav);
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
      const base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(176/base.width,208/base.height)*Math.min(2,window.devicePixelRatio||1)});
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      const task=page.render({canvasContext:canvas.getContext('2d'),viewport});pdfNavigationTask=task;
      try{await task.promise;}catch(error){if(error.name!=='RenderingCancelledException')console.warn('Thumbnail unavailable',error);}
      if(pdfNavigationTask===task)pdfNavigationTask=null;
      if(pdfNavigation===nav&&nav.generation===generation&&cell.isConnected)cell.querySelector('.pdf-thumbnail-paper').append(canvas);
      else{canvas.width=0;canvas.height=0;}
    }
  }catch(error){console.warn('Thumbnail unavailable',error);}
  finally{nav.rendering=false;if(pdfNavigation===nav&&nav.generation!==generation)void renderPdfThumbnailQueue(nav);}
}
document.addEventListener('DOMContentLoaded',()=>{
  document.addEventListener('click',event=>{
    if(event.target instanceof Element&&event.target.closest('#aafab,#pdf-ink-tools,[data-ink-toggle]'))closePdfNavigation();
  },true);
  document.getElementById('pdf-bookmarks-only').onclick=()=>{if(pdfNavigation){pdfNavigation.bookmarksOnly=!pdfNavigation.bookmarksOnly;buildPdfNavigation(true);}};
  document.getElementById('pdf-thumbnail-strip').addEventListener('scroll',paintPdfThumbnails,{passive:true});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&pdfNavigation&&!document.querySelector('dialog[open]')){
      const cancel=pdfNavigation.strip.querySelector('.pdf-thumbnail-actions:not([hidden]) [data-pdf-delete-cancel]');
      if(cancel){cancel.click();return;}
      closePdfNavigation();document.getElementById('pdf-page-button').focus();}
    if(!['ArrowLeft','ArrowRight'].includes(event.key)||event.defaultPrevented||event.repeat||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;
    if(currentReaderMode!=='original'||!pdfHorizontal()||document.activeElement?.matches('input,textarea,select,[contenteditable]')||document.querySelector('dialog[open]')||sentenceModalOpen()||wordPanelOpen()||aaPopOpen()||pdfNavigation||BreezePdfInk.busy()||originalPinchBusy())return;
    event.preventDefault();void stepPdfPage(event.key==='ArrowRight'?1:-1);
  });
  const resize=new ResizeObserver(entries=>{
    if(entries.some(entry=>entry.target.id!=='pdf-thumbnail-strip'))positionPdfInkSettings();
    if(pdfNavigation&&entries.some(entry=>entry.target.id!=='readpill'))paintPdfThumbnails();
  });
  resize.observe(document.getElementById('readmain'));resize.observe(document.getElementById('readpill'));resize.observe(document.getElementById('pdf-thumbnail-strip'));
  /* Observe single direct-finger swipes; never claim a Pencil, palm or pinch.
     The existing gesture controller cancels lookup when movement exceeds slop. */
  let swipe=null;
  const box=readerScroller();
  box.addEventListener('touchstart',event=>{
    if(!pdfHorizontal()||currentReaderMode!=='original'||originalZoom()>1.01||BreezePdfInk.busy()||event.touches.length!==1){swipe=null;return;}
    const touch=event.touches[0];
    if(Reflect.get(touch,'touchType')==='stylus'||!BreezePdfInk.finger(touch)||!(event.target instanceof Element)||!event.target.closest('.pdf-source-page')){swipe=null;return;}
    swipe={id:touch.identifier,x:touch.clientX,y:touch.clientY,session:originalSession};
  },{passive:true});
  box.addEventListener('touchend',event=>{
    const start=swipe;swipe=null;if(!start||event.touches.length||start.session!==originalSession||originalPinchBusy()||BreezePdfInk.busy())return;
    const touch=[...event.changedTouches].find(t=>t.identifier===start.id);if(!touch)return;
    const dx=touch.clientX-start.x,dy=touch.clientY-start.y;
    if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.6)void stepPdfPage(dx<0?1:-1);
  },{passive:true});
  box.addEventListener('touchcancel',()=>{swipe=null;},{passive:true});
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
