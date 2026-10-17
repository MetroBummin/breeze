/* Local, resumable PDF preparation. Cards observe this owner; they never wait
   for it. Recognition itself is admitted only by BreezePdfOcr's global lane.
   With the lane enabled, only the opened book is prepared, and only once
   reading and the shelf are idle. The kill switch restores the previous
   shelf-wide queue. The cover label is the only shelf view of that job. It
   shows by default, and only while a scanned page is still pending. An
   unknown job is not pending: no page count, an empty local cache, or a
   finished cache does not write the in-progress words. An EPUB or TXT
   original is not a job even if its kind field says pdf. The label does not
   raster, schedule, or keep a timer. */
const BreezePdfOcrLibrary=(()=>{
  const jobs=new Map();
  let timer=0,busy=false,held=null,yielded='',loading=null,yieldGeneration=0,detail=null,detailOpener=null,detailJobId='',detailRelease=null,focusId='',shelfScrolling=false,shelfTimer=0,stuckTimer=0;
  /* Opening the book that just finished downloading must not share the PDF
     parser with background recognition. `BREEZE_PDF_OCR_YIELD=false` keeps
     the old overlap. */
  const yieldEnabled=()=>typeof window==='undefined'||window.BREEZE_PDF_OCR_YIELD!==false;
  const hash=book=>book?.original?.hash||book?.sourceHash||'';
  const current=job=>jobs.get(job.id)===job&&books.some(b=>b.id===job.id&&hash(b)===job.hash);
  const bookOf=job=>books.find(b=>b.id===job.id&&hash(b)===job.hash);
  const lane=()=>BreezePdfOcr.laneOn?.()!==false;
  const activePages=job=>{
    const deleted=new Set(bookOf(job)?.deletedPdfPages||[]);
    return Array.from({length:job.total||0},(_,i)=>i+1).filter(n=>!deleted.has(n));
  };
  function focus(){
    if(!lane())return undefined;
    const open=typeof curBook!=='undefined'&&curBook?.kind==='pdf'&&hash(curBook)?curBook.id:'';
    if(open)focusId=open;
    return focusId||null;
  }
  function wanted(job){
    const id=focus();
    return current(job)&&job.state==='queued'&&!summary(job).complete&&(id===undefined||job.id===id);
  }
  function readingIdle(){
    if(!lane())return true;
    if(typeof currentPdfSession==='function'&&currentPdfSession()){
      if(typeof originalPdfPaintPaused==='function'&&originalPdfPaintPaused())return false;
      if(typeof pdfScrollBusy==='function'&&pdfScrollBusy(originalSession))return false;
      if(originalSession?.paintActive)return false;
      if(typeof readerPositionPending==='function'&&readerPositionPending())return false;
    }
    return !shelfScrolling;
  }
  function coverMode(){
    // The cover is the shelf. off hides it. Absent and any other value stay on the cover.
    try{
      const search=typeof location!=='undefined'&&location&&typeof location.search==='string'?location.search:'';
      const query=/[?&]ocrCover=([a-z]+)/i.exec(search);
      let stored='';
      try{stored=typeof localStorage!=='undefined'&&localStorage?localStorage.getItem('breeze.ocr-cover')||'':'';}
      catch{stored='';}
      const value=String((query&&query[1])||stored||'fill').toLowerCase();
      return value==='off'?'off':'fill';
    }catch{return 'fill';}
  }
  function statusCopy(job){
    if(job.stuck&&job.state==='paused')return '앱 완전 종료 후 다시 열기';
    if(job.state==='paused'&&job.notice==='failed')return '글자 스캔 실패';
    if(job.state==='paused')return '글자 스캔 일시 중지';
    return '글자 스캔 중';
  }
  function summary(job){
    const pages=activePages(job),done=pages.filter(n=>job.done.has(n)).length;
    return {done,total:pages.length,complete:!!job.total&&done===pages.length};
  }
  function paintCover(node,job,s){
    const button=node.querySelector('button'),label=node.querySelector('.book-ocr-label'),fill=node.querySelector('.book-ocr-fill i');
    if(!button||!label||!fill)return;
    const ratio=s.total?s.done/s.total:0;
    label.textContent=statusCopy(job);
    fill.style.width=Math.round(ratio*100)+'%';
    node.dataset.ocrState=job.state==='paused'?(job.notice==='failed'?'failed':'paused'):'active';
    const count=s.total?s.done+'/'+s.total+'쪽':'';
    button.setAttribute('aria-label',statusCopy(job)+(count?' '+count:'')+' 자세히');
  }
  function clearCover(node){
    const label=node.querySelector('.book-ocr-label'),fill=node.querySelector('.book-ocr-fill i'),button=node.querySelector('button');
    if(label)label.textContent='';
    if(fill)fill.style.width='0';
    if(button)button.setAttribute('aria-label','');
    delete node.dataset.ocrState;
  }
  function coverPending(job,s){
    if(job.state==='missing'||s.complete||!job.total)return false;
    return !!(job.scan||(job.stuck&&job.state==='paused'));
  }
  function apply(node,job){
    const s=summary(job);
    const show=coverMode()!=='off'&&coverPending(job,s);
    if(show)paintCover(node,job,s);else clearCover(node);
    if(!show&&detailOpener&&node.contains(detailOpener))closeDetail(false);
    node.hidden=!show;
  }
  function paint(job){
    if(jobs.get(job.id)!==job)return;
    for(const node of document.querySelectorAll('[data-ocr-book]')){
      if(!(node instanceof HTMLElement))continue;
      if(node.dataset.ocrBook!==job.id)continue;
      apply(node,job);
    }
    fillDetail(job);
  }
  function closeDetail(restoreFocus){
    if(!detail)return;
    detail.hidden=true;
    detailRelease?.();detailRelease=null;
    const opener=detailOpener;detailOpener=null;detailJobId='';
    if(restoreFocus&&opener?.isConnected)opener.focus();
  }
  function fillDetail(job){
    if(!detail||detail.hidden||detailJobId!==job.id)return;
    const s=summary(job),paused=job.state==='paused';
    detail.querySelector('.book-ocr-detail-status').textContent=statusCopy(job);
    detail.querySelector('.book-ocr-detail-count').textContent=s.total?s.done+'/'+s.total+'쪽':'쪽수를 확인하는 중';
    const retry=/** @type {HTMLButtonElement} */(detail.querySelector('.book-ocr-detail-retry'));
    retry.hidden=!paused;
    retry.disabled=!!(job.stuck&&paused);
  }
  function placeDetail(opener){
    const node=detail,margin=8;
    const topbar=document.getElementById('topbar'),dock=document.querySelector('.control-dock');
    const topLimit=(topbar?topbar.getBoundingClientRect().bottom:0)+margin;
    const bottomLimit=Math.min(window.innerHeight-margin,dock?dock.getBoundingClientRect().top-margin:window.innerHeight-margin);
    node.style.left='0px';node.style.top='0px';
    const width=node.offsetWidth,height=node.offsetHeight,rect=opener.getBoundingClientRect();
    let left=Math.min(Math.max(margin,rect.right-width),window.innerWidth-width-margin);
    let top=rect.top-height-margin;
    if(top<topLimit)top=rect.bottom+margin;
    if(top+height>bottomLimit)top=Math.max(topLimit,bottomLimit-height);
    node.style.left=Math.max(margin,left)+'px';
    node.style.top=Math.max(topLimit,top)+'px';
  }
  function openDetail(opener,job){
    if(!detail){
      detail=document.createElement('div');
      detail.className='book-ocr-detail';detail.hidden=true;detail.tabIndex=-1;
      detail.setAttribute('role','dialog');detail.setAttribute('aria-label','글자 인식');
      detail.innerHTML='<p class="book-ocr-detail-status"></p><p class="book-ocr-detail-count" aria-live="polite"></p><div class="book-ocr-detail-actions"><button type="button" class="book-ocr-detail-retry">다시 시도</button><button type="button" class="book-ocr-detail-close" aria-label="닫기"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button></div>';
      const stop=event=>event.stopPropagation();
      detail.addEventListener('pointerdown',stop);
      detail.addEventListener('mousedown',stop);
      detail.addEventListener('touchstart',stop,{passive:true});
      detail.addEventListener('click',stop);
      /** @type {HTMLButtonElement} */(detail.querySelector('.book-ocr-detail-close')).onclick=()=>closeDetail(true);
      /** @type {HTMLButtonElement} */(detail.querySelector('.book-ocr-detail-retry')).onclick=()=>{
        const latest=jobs.get(detailJobId);if(!latest||latest.stuck)return;
        latest.state='queued';latest.notice='';paint(latest);schedule();
      };
      document.body.append(detail);
    }
    detailOpener=opener;detailJobId=job.id;detail.hidden=false;
    fillDetail(job);placeDetail(opener);detail.focus();
    let swallow=false;
    const onKey=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeDetail(true);}};
    const onPointer=event=>{
      if(detail.hidden)return;
      const target=event.target;
      if(detail.contains(target)||detailOpener?.contains(target))return;
      swallow=true;closeDetail(false);
    };
    // The dismissing pointerdown removes the other listeners before click.
    // This one stays through that click so the book underneath does not open.
    const onClick=event=>{
      document.removeEventListener('click',onClick,true);
      if(!swallow)return;
      swallow=false;event.preventDefault();event.stopPropagation();
    };
    const onScroll=()=>closeDetail(false);
    document.addEventListener('keydown',onKey,true);
    document.addEventListener('pointerdown',onPointer,true);
    document.addEventListener('click',onClick,true);
    window.addEventListener('scroll',onScroll,true);
    window.addEventListener('resize',onScroll);
    detailRelease=()=>{
      document.removeEventListener('keydown',onKey,true);
      document.removeEventListener('pointerdown',onPointer,true);
      window.removeEventListener('scroll',onScroll,true);
      window.removeEventListener('resize',onScroll);
    };
  }
  function schedule(delay=350){
    if(timer||document.hidden||yielded)return;
    timer=setTimeout(()=>{timer=0;void drain();},delay);
  }
  function abortLoading(bookId){
    if(!loading||loading.job.id!==bookId)return;
    const task=loading.task;
    loading=null;
    try{
      const gone=task&&typeof task.destroy==='function'?task.destroy():null;
      if(gone&&typeof gone.then==='function')gone.then(()=>{},()=>{});
    }catch{}
  }
  function watchStuck(job){
    if(stuckTimer||!job.stuck)return;
    stuckTimer=setTimeout(async()=>{
      stuckTimer=0;
      const latest=jobs.get(job.id);
      if(!latest||latest.stuck!==job.stuck)return;
      let done=false;
      try{done=await BreezePdfOcr.nativeSettled(latest.stuck);}catch{done=false;}
      if(jobs.get(job.id)!==latest||latest.stuck!==job.stuck)return;
      if(done){latest.stuck='';paint(latest);return;}
      watchStuck(latest);
    },400);
  }
  async function release(){
    const old=held;held=null;
    if(old?.owned)try{await old.pdf.destroy();}catch{}
  }
  function sharedPdf(job){
    if(!lane())return null;
    const session=typeof originalSession==='undefined'?null:originalSession;
    if(!session?.pdf||session.kind!=='pdf'||session.bookId!==job.id||session.hash!==job.hash)return null;
    return session.pdf;
  }
  function readerOpening(job){
    if(!lane()||typeof curBook==='undefined'||curBook?.id!==job.id||sharedPdf(job))return false;
    if(typeof originalOpenJob!=='undefined'&&originalOpenJob)return true;
    if(typeof readerPositionPending==='function'&&readerPositionPending())return true;
    return false;
  }
  async function prepare(job){
    if(yielded&&job.id===yielded)return null;
    const shared=sharedPdf(job);
    if(shared){
      if(held?.pdf!==shared)await release();
      held={job,pdf:shared,owned:false};
      job.total=shared.numPages;
      job.done=await BreezePdfOcr.completed(bookOf(job));
      await rememberScan(job);paint(job);
      return shared;
    }
    if(held?.job===job&&held.owned)return held.pdf;
    if(held)await release();
    if(readerOpening(job))return null;
    const book=bookOf(job),original=await originalGetForBook(book);
    if(!current(job)||(yielded&&job.id===yielded))return null;
    if(!original?.blob||original.hash!==job.hash){job.state='missing';paint(job);return null;}
    await ensurePdfLib();
    if(yielded&&job.id===yielded)return null;
    const task=pdfjsLib.getDocument({data:await original.blob.arrayBuffer(),isEvalSupported:false});
    loading={job,task};
    let pdf;
    try{pdf=await task.promise;}
    catch(error){
      if(loading&&loading.task===task)loading=null;
      if(yielded&&job.id===yielded)return null;
      throw error;
    }
    if(loading&&loading.task===task)loading=null;
    if(!current(job)||(yielded&&job.id===yielded)){await pdf.destroy();return null;}
    held={job,pdf,owned:true};job.total=pdf.numPages;
    job.done=await BreezePdfOcr.completed(book);
    await rememberScan(job);paint(job);
    return pdf;
  }
  async function drain(){
    if(busy||document.hidden||!BreezePdfOcr.available())return;
    const id=focus();
    if(id===null)return;
    if(!readingIdle()){schedule(400);return;}
    const candidates=[...jobs.values()].filter(wanted);
    const job=candidates.find(j=>j.id===curBook?.id)||candidates[0];
    if(!job||(yielded&&job.id===yielded))return;
    busy=true;
    try{
      const pdf=await prepare(job);if(!pdf||!current(job))return;
      const book=bookOf(job);
      // A foreground page may have completed since the last background turn.
      job.done=await BreezePdfOcr.completed(book);
      await rememberScan(job);
      const remaining=activePages(job).filter(n=>!job.done.has(n));
      if(!remaining.length){paint(job);await release();return;}
      const visible=currentPdfSession()&&originalSession.bookId===job.id?pdfPagesInView(originalSession):[];
      const n=remaining.find(page=>visible.includes(page))||remaining[0];
      const result=await BreezePdfOcr.background(book,n,pdf,()=>current(job)&&readingIdle()&&!(yielded&&job.id===yielded));
      if(!current(job))return;
      if(result==='done'||result==='scan'){if(result==='scan')job.scan=true;job.done.add(n);}
      else if(result==='blocked'){
        const hold=BreezePdfOcr.nativeHold?.();
        if(lane()&&hold?.expired){job.state='paused';job.notice='paused';job.stuck=hold.id;watchStuck(job);}
        else if(!(lane()&&hold&&!hold.expired)){job.state='paused';job.notice='paused';}
      }else if(result==='failed'){job.state='paused';job.notice='failed';}
      else if(result==='storage'){job.state='paused';job.notice='paused';}
      paint(job);
      if(summary(job).complete||job.state==='paused')await release();
    }catch{
      if(!(yielded&&job.id===yielded)&&current(job)){job.state='paused';job.notice='failed';paint(job);}
      await release();
    }finally{busy=false;if(!yielded&&[...jobs.values()].some(wanted))schedule();}
  }
  async function rememberScan(job){
    if(job.scan||typeof BreezePdfOcr.scanned!=='function')return;
    const book=bookOf(job);if(!book)return;
    try{job.scan=!!await BreezePdfOcr.scanned(book);}catch{}
  }
  function track(book,{restart=false}={}){
    const originalKind=book?.original?.kind||'';
    if(book?.kind!=='pdf'||(originalKind&&originalKind!=='pdf')||!hash(book)||!BreezePdfOcr.available())return null;
    let job=jobs.get(book.id);
    if(job&&job.hash!==hash(book)){forget(book.id);job=null;}
    if(!job){job={id:book.id,hash:hash(book),done:new Set(),total:0,state:'queued',notice:'',stuck:''};jobs.set(book.id,job);}
    if(restart&&['missing','paused'].includes(job.state)&&!job.stuck){job.state='queued';job.notice='';}
    schedule();return job;
  }
  function coverButton(book){
    const button=document.createElement('button');
    button.type='button';button.className='book-ocr-hit';
    const label=document.createElement('span');label.className='book-ocr-label';
    const fill=document.createElement('span');fill.className='book-ocr-fill';fill.setAttribute('aria-hidden','true');
    fill.append(document.createElement('i'));
    button.append(label,fill);
    const stop=event=>event.stopPropagation();
    for(const type of ['pointerdown','mousedown','touchstart','click'])button.addEventListener(type,stop,type==='touchstart'?{passive:true}:undefined);
    button.addEventListener('click',()=>{
      const latest=jobs.get(book.id);if(!latest)return;
      if(detailOpener===button&&detail&&!detail.hidden)closeDetail(false);else openDetail(button,latest);
    });
    return button;
  }
  function ensureCover(tile,book){
    const card=tile.querySelector('.bookcard');
    const existing=card?.querySelector('.book-ocr-cover');
    if(coverMode()==='off'||!card){existing?.remove();return null;}
    if(existing)return existing;
    const node=document.createElement('div');
    node.className='book-ocr-cover';node.dataset.ocrBook=book.id;
    node.append(coverButton(book));card.append(node);
    return node;
  }
  function mount(tile,book){
    const job=track(book);if(!job)return;
    const cover=ensureCover(tile,book);
    if(cover)apply(cover,job);
    queueMicrotask(()=>paint(job));
  }
  function forget(id){
    const job=jobs.get(id);jobs.delete(id);
    if(held?.job===job)void release();
    if(detailJobId===id)closeDetail(false);
    if(focusId===id)focusId='';
  }
  function yieldToReader(bookId){
    if(!yieldEnabled()||!bookId)return;
    yielded=bookId;
    yieldGeneration++;
    if(timer){clearTimeout(timer);timer=0;}
    abortLoading(bookId);
  }
  /* The reader uses the document background recognition already parsed, so
     the open does not parse the same file again. A busy page keeps it.
     A document borrowed from the open reader is not handed back. */
  function adoptForReader(bookId){
    if(!yieldEnabled()||!bookId)return null;
    yieldToReader(bookId);
    if(busy||!held||held.job.id!==bookId||!held.owned)return null;
    const pdf=held.pdf;
    held=null;
    return pdf;
  }
  function resumeReader(bookId){
    if(!bookId||yielded!==bookId)return;
    const generation=yieldGeneration;
    if(timer){clearTimeout(timer);timer=0;}
    timer=setTimeout(()=>{
      timer=0;
      if(generation!==yieldGeneration)return;
      if(yielded===bookId)yielded='';
      void drain();
    },1200);
  }
  function restore(){
    if(typeof books==='undefined')return;
    for(const book of books)track(book);
  }
  function onShelfScroll(event){
    if(!lane())return;
    const node=event?.target;
    if(!node||node.nodeType!==1||typeof node.closest!=='function'||!node.closest('#v-home,#v-casuals,#v-longform'))return;
    shelfScrolling=true;clearTimeout(shelfTimer);
    shelfTimer=setTimeout(()=>{shelfScrolling=false;shelfTimer=0;schedule(200);},180);
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){restore();schedule();}});
  document.addEventListener('scroll',onShelfScroll,true);
  return {mount,track,restore,forget,summary,yieldToReader,adoptForReader,resumeReader,coverMode,wake(){if(focus()!==null)schedule(200);}};
})();
