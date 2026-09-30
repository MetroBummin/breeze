/* A bounded thumbnail strip above the existing bottom pill. Source pages,
   lexical geometry and ink retain their document/session ownership. */
let pdfNavigation=null,pdfNavigationGeneration=0,pdfNavigationTask=null;
const PDF_THUMB_SLOT=112;
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
  if(pdfNavigation){const left=pdfNavigation.strip.scrollLeft;buildPdfNavigation(false);pdfNavigation.strip.scrollLeft=left;paintPdfThumbnails();}
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
}
async function goPdfPage(n){
  const session=originalSession;
  if(currentReaderMode!=='original'||!currentPdfSession(session)||pdfDeletionBusy||BreezePdfInk.busy()||originalPinchBusy())return;
  n=pdfNearestPage(session,n);
  if(typeof closePanel==='function')closePanel();
  closePdfNavigation();expandReaderChrome();
  const token=++readerModeChangeToken;
  await restorePdfAnchor({kind:'pdf',page:n,y:0},topInset(),token);
  if(!currentPdfSession(session)||token!==readerModeChangeToken)return;
  saveReadingState();updatePfill(true);updatePdfNavigationControls();
}
function updatePdfNavigationControls(){
  const button=document.getElementById('pdf-page-button');if(!button)return;
  const ready=currentReaderMode==='original'&&currentPdfSession();
  button.hidden=!ready;
  document.getElementById('aa-pdf-direction').hidden=!ready;
  for(const direction of ['vertical','horizontal'])document.querySelector(`[data-pdf-direction="${direction}"]`)?.setAttribute('aria-pressed',String(studyPrefs.direction===direction));
  for(const id of ['pdf-page-prev','pdf-page-next'])document.getElementById(id).hidden=!ready||!pdfHorizontal();
  if(!ready){closePdfNavigation();return;}
  const n=pdfCurrentPage();button.textContent=`${pdfAvailablePages().indexOf(n)+1} / ${pdfAvailablePages().length}`;button.setAttribute('aria-label',`${n}페이지, 페이지 탐색`);
  document.getElementById('pdf-page-prev').toggleAttribute('disabled',n===pdfAvailablePages()[0]);
  document.getElementById('pdf-page-next').toggleAttribute('disabled',n===pdfAvailablePages().at(-1));
  if(pdfNavigation&&pdfNavigation.session!==originalSession)closePdfNavigation();
  if(pdfNavigation)for(const button of pdfNavigation.strip.querySelectorAll('.pdf-thumbnail-jump')){
    const index=Number(button.parentElement.dataset.index);button.setAttribute('aria-current',String(pdfNavigation.pages[index]===n));
  }
}
function closePdfNavigation(){
  if(!pdfNavigation)return;
  pdfNavigationGeneration++;pdfNavigationTask?.cancel();pdfNavigationTask=null;
  document.getElementById('pdf-page-navigation')?.setAttribute('hidden','');
  document.getElementById('readchrome')?.classList.remove('page-nav-open');
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
  panel.hidden=false;document.getElementById('readchrome').classList.add('page-nav-open');positionPdfStrip();
  document.getElementById('pdf-page-button').setAttribute('aria-expanded','true');
  // The strip leaves the existing back/settings controls available.
  pinReaderChrome(true,'page-navigation');buildPdfNavigation(true);
}
function buildPdfNavigation(focusCurrent){
  const nav=pdfNavigation;if(!nav)return;
  pdfNavigationTask?.cancel();pdfNavigationTask=null;nav.generation=++pdfNavigationGeneration;
  const bookmarks=readPdfBookmarks(nav.session)||[];
  nav.pages=(nav.bookmarksOnly?bookmarks:pdfAvailablePages(nav.session)).filter(n=>!nav.session.deletedPages?.has(n));
  nav.bookmarks=new Set(bookmarks);nav.strip.replaceChildren();
  document.getElementById('pdf-bookmarks-only').setAttribute('aria-pressed',String(nav.bookmarksOnly));
  const track=document.createElement('div');track.className='pdf-thumbnail-track';
  track.style.width=`${nav.pages.length*PDF_THUMB_SLOT+Math.max(0,nav.strip.clientWidth-PDF_THUMB_SLOT)}px`;
  nav.strip.append(track);nav.track=track;
  if(!nav.pages.length){track.textContent='북마크한 페이지가 없어요.';track.style.width='100%';}
  if(focusCurrent)nav.strip.scrollLeft=Math.max(0,nav.pages.indexOf(pdfCurrentPage()))*PDF_THUMB_SLOT;
  paintPdfThumbnails();
}
function paintPdfThumbnails(){
  const nav=pdfNavigation;if(!nav||!currentPdfSession(nav.session))return;
  if(nav.pages.length)nav.track.style.width=`${nav.pages.length*PDF_THUMB_SLOT+Math.max(0,nav.strip.clientWidth-PDF_THUMB_SLOT)}px`;
  const start=Math.max(0,Math.floor(nav.strip.scrollLeft/PDF_THUMB_SLOT)-1);
  const end=Math.min(nav.pages.length,start+Math.ceil(nav.strip.clientWidth/PDF_THUMB_SLOT)+3);
  for(const child of [...nav.track.children])if(+child.dataset.index<start||+child.dataset.index>=end){
    const canvas=child.querySelector('canvas');if(canvas){canvas.width=0;canvas.height=0;}child.remove();
  }
  for(let i=start;i<end;i++){
    if(nav.track.querySelector(`[data-index="${i}"]`))continue;
    const n=nav.pages[i],cell=document.createElement('div');cell.className='pdf-thumbnail';cell.dataset.index=String(i);cell.style.left=`${i*PDF_THUMB_SLOT}px`;
    const jump=document.createElement('button');jump.type='button';jump.className='pdf-thumbnail-jump';jump.setAttribute('aria-label',`${n}페이지로 이동`);
    jump.setAttribute('aria-current',String(n===pdfCurrentPage()));
    const pressed=attachLongPress(jump,()=>offerPdfPageDeletion(nav.session,n));
    jump.onclick=event=>{if(event.detail===0||!pressed())void goPdfPage(n);};
    jump.oncontextmenu=event=>{event.preventDefault();offerPdfPageDeletion(nav.session,n);};
    const label=document.createElement('span');label.textContent=String(n);jump.append(label);
    const bookmark=document.createElement('button');bookmark.type='button';bookmark.className='pdf-thumbnail-bookmark';bookmark.textContent='⚑';
    bookmark.setAttribute('aria-label',`${n}페이지 북마크`);bookmark.setAttribute('aria-pressed',String(nav.bookmarks.has(n)));
    bookmark.onclick=()=>togglePdfBookmark(nav.session,n);cell.append(jump,bookmark);nav.track.append(cell);
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
      const base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(176/base.width,208/base.height)});
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      const task=page.render({canvasContext:canvas.getContext('2d'),viewport});pdfNavigationTask=task;
      try{await task.promise;}catch(error){if(error.name!=='RenderingCancelledException')console.warn('Thumbnail unavailable',error);}
      if(pdfNavigationTask===task)pdfNavigationTask=null;
      if(pdfNavigation===nav&&nav.generation===generation&&cell.isConnected)cell.querySelector('.pdf-thumbnail-jump').prepend(canvas);
      else{canvas.width=0;canvas.height=0;}
    }
  }catch(error){console.warn('Thumbnail unavailable',error);}
  finally{nav.rendering=false;if(pdfNavigation===nav&&nav.generation!==generation)void renderPdfThumbnailQueue(nav);}
}
document.addEventListener('DOMContentLoaded',()=>{
  document.addEventListener('click',event=>{
    if(event.target instanceof Element&&event.target.closest('#aafab,#pdf-ink-tools,[data-ink-toggle]'))closePdfNavigation();
  },true);
  document.getElementById('pdf-thumbnail-strip').addEventListener('scroll',paintPdfThumbnails,{passive:true});
  document.getElementById('pdf-bookmarks-only').onclick=()=>{if(pdfNavigation){pdfNavigation.bookmarksOnly=!pdfNavigation.bookmarksOnly;buildPdfNavigation(true);}};
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&pdfNavigation){closePdfNavigation();document.getElementById('pdf-page-button').focus();}
  });
  const resize=new ResizeObserver(()=>{positionPdfStrip();if(pdfNavigation)paintPdfThumbnails();});
  resize.observe(document.getElementById('readmain'));resize.observe(document.getElementById('readpill'));
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
async function offerPdfPageDeletion(session,n){
  if(pdfDeletionBusy||!currentPdfSession(session))return;
  if(pdfAvailablePages(session).length<=1){toast('마지막 페이지는 삭제할 수 없어요.');return;}
  if(await breezeTaskDialog({title:`${n}페이지를 삭제할까요?`,description:'텍스트 모드에서도 이 페이지의 내용이 사라집니다.',action:'삭제',danger:true})){
    if(currentPdfSession(session))void deletePdfPage(session,n);
  }
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

function positionPdfStrip(){
  const chrome=document.getElementById('readchrome'),pill=document.getElementById('readpill');
  if(!chrome||!pill)return;
  const bottom=chrome.getBoundingClientRect().bottom-pill.getBoundingClientRect().top+12;
  for(const id of ['pdf-page-navigation','pdf-ink-settings']){
    const panel=document.getElementById(id);if(panel)panel.style.bottom=`${Math.max(56,bottom)}px`;
  }
}
