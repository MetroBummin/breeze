/* On-device OCR for pages with no text layer. No network or dictionary requests.
   One raster/native job globally; only currently visible pages enter the lane.
   Native boxes use top-left ratios of PDF.js's intrinsically rotated viewport. */
const BreezePdfOcr=(()=>{
  const REVISION='scan-en-v1-2048',MAX_WORDS=3000,MAX_CACHE_PAGES=48;
  const states=new WeakMap();
  let active=null,timer=0,wanted=null,confirmation=null,confirmationNode=null;
  const cacheDb=openDb('breeze-pdf-ocr',1,db=>db.createObjectStore('pages').createIndex('at','at'));
  function state(session){
    if(!states.has(session))states.set(session,{pages:new Map(),closed:false});
    return states.get(session);
  }
  function plugin(){
    const cap=window.Capacitor;
    if(!cap?.isNativePlatform?.()||!['ios','android'].includes(cap.getPlatform?.())
        ||!cap.isPluginAvailable?.('BreezePdfOcr'))return null;
    return cap.registerPlugin('BreezePdfOcr');
  }
  function key(session,n){
    // No durable cache without original-byte identity. Never key by title/page alone.
    return session.hash?JSON.stringify([REVISION,window.Capacitor?.getPlatform?.(),session.bookId,session.hash,n]):null;
  }
  async function cached(k){
    if(!k)return null;
    try{return await localTransaction(await cacheDb(),'pages','readonly',(tx,done)=>{
      const rq=tx.objectStore('pages').get(k);rq.onsuccess=()=>done(rq.result?.words||null);
    });}catch{return null;}
  }
  async function remember(k,words,bookId){
    if(!k)return;
    try{await localTransaction(await cacheDb(),'pages','readwrite',tx=>{
      const store=tx.objectStore('pages');store.put({words,bookId,at:Date.now()},k);
      const count=store.count();count.onsuccess=()=>{
        let excess=count.result-MAX_CACHE_PAGES;if(excess<=0)return;
        const oldest=store.index('at').openKeyCursor();oldest.onsuccess=()=>{
          const cursor=oldest.result;if(!cursor||excess--<=0)return;
          store.delete(cursor.primaryKey);cursor.continue();
        };
      };
    });}catch{/* Cache quota/private-mode failures do not disable lookup. */}
  }
  async function forget(book){
    // Retire pending work before deleting entries so a late result cannot refill them.
    for(const session of new Set([wanted,active?.session]))if(session?.bookId===book.id)close(session);
    try{await localTransaction(await cacheDb(),'pages','readwrite',tx=>{
      const rq=tx.objectStore('pages').openCursor();rq.onsuccess=()=>{
        const cursor=rq.result;if(!cursor)return;
        if(cursor.value.bookId===book.id)cursor.delete();cursor.continue();
      };
    });}catch{}
  }
  function boxesFromWords(words){
    if(!Array.isArray(words)||words.length>MAX_WORDS)throw new Error('Invalid OCR result');
    let offset=0;
    const boxes=[];
    for(const item of words){
      if(!item||typeof item.word!=='string'||item.word.length>100||
          !/^[A-Za-z](?:[A-Za-z'’\-]*[A-Za-z])?$/.test(item.word))continue;
      const {x,y,w,h}=item;
      if(![x,y,w,h].every(Number.isFinite)||x<0||y<0||x>=1||y>=1||w<=0||h<=0||x+w>1.001||y+h>1.001)continue;
      if(!Number.isFinite(item.confidence)||item.confidence<0.3||item.confidence>1)continue;
      boxes.push({word:item.word,ocr:true,x,y,w:Math.min(w,1-x),h:Math.min(h,1-y),
        line:Number.isInteger(item.line)?item.line:boxes.length,offset});
      offset+=item.word.length+1;
    }
    // OCR reading order is approximate. Keep context within each recognized line;
    // do not fabricate sentences spanning columns or unrelated answer blocks.
    const lines=new Map();
    for(const box of boxes){if(!lines.has(box.line))lines.set(box.line,[]);lines.get(box.line).push(box);}
    for(const line of lines.values()){
      const example=line.map(b=>b.word).join(' ').slice(0,2400);
      line.forEach((box,i)=>{
        box.example=example;box.sentenceStart=line[0].offset;
        box.tokenIndex=i;box.easyBefore=[];box.easyAfter=[];
      });
    }
    return boxes;
  }
  function live(session,n,entry){
    return currentPdfSession(session)&&!state(session).closed&&state(session).pages.get(n)===entry
      &&ownsPdfPage(session.pages[n-1],session)&&!session.deletedPages?.has(n);
  }
  function status(session,n,entry,value){
    entry.status=value;
    if(live(session,n,entry))session.pages[n-1].dataset.ocr=value;
  }
  async function inspect(session,n,page,boxes,alive){
    if(boxes.length||state(session).pages.has(n))return;
    const content=await page.getTextContent();
    if(!alive()||content.items.some(item=>String(item.str||'').trim()))return;
    const entry={status:plugin()?'waiting':'unsupported'};
    state(session).pages.set(n,entry);status(session,n,entry,entry.status);
  }
  function publish(session,n,entry,boxes){
    if(!live(session,n,entry)||!session.settled.has(n)||!pdfPagesInView(session).includes(n))return;
    session.wordBoxes.set(n,boxes);session.pages[n-1].dataset.wordCount=String(boxes.length);
    renderPdfSavedWordMarkers(session.pages[n-1],boxes);
  }
  async function raster(session,n,valid){
    const page=await session.pdf.getPage(n);
    const canvas=document.createElement('canvas');let task;
    try{
      if(!valid())return null;
      const base=page.getViewport({scale:1});
      const scale=Math.min(2,2048/Math.max(base.width,base.height));
      const viewport=page.getViewport({scale});
      canvas.width=Math.max(1,Math.floor(viewport.width));canvas.height=Math.max(1,Math.floor(viewport.height));
      task=page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport,
        annotationMode:pdfjsLib.AnnotationMode.DISABLE});
      if(active)active.cancel=()=>task.cancel();
      await task.promise;
      if(!valid())return null;
      // Only this raster crosses the in-process bridge. It is never persisted.
      return canvas.toDataURL('image/png').split(',')[1];
    }finally{canvas.width=0;canvas.height=0;page.cleanup();if(active)active.cancel=null;}
  }
  function schedule(session=originalSession){
    if(!currentPdfSession(session)||!states.has(session)||state(session).closed||!state(session).pages.size)return;
    wanted=session;clearTimeout(timer);timer=setTimeout(()=>{timer=0;void drain();},200);
  }
  async function drain(){
    const session=wanted;
    if(active||!currentPdfSession(session)||state(session).closed||document.hidden)return;
    if(originalPdfPaintPaused()||pdfScrollBusy(session)||session.paintActive){schedule(session);return;}
    const pages=state(session).pages;
    const n=pdfPagesInView(session).find(n=>session.settled.has(n)&&pages.get(n)?.status==='waiting');
    if(!n)return;
    const entry=pages.get(n),native=plugin();
    if(!native){status(session,n,entry,'unsupported');schedule(session);return;}
    active={session,n,cancel:null};status(session,n,entry,'running');
    const valid=()=>live(session,n,entry)&&!document.hidden&&!originalPdfPaintPaused()
      &&!pdfScrollBusy(session)&&pdfPagesInView(session).includes(n);
    try{
      const k=key(session,n);let words=await cached(k);
      if(words){try{boxesFromWords(words);}catch{words=null;}}
      if(!valid()){status(session,n,entry,'waiting');return;}
      if(!words){
        const image=await raster(session,n,valid);
        if(!image){status(session,n,entry,'waiting');return;}
        const result=await native.recognize({image});words=result.words;
      }
      const boxes=boxesFromWords(words);
      // Closing/replacing the document also prevents late cache writes.
      if(!live(session,n,entry))return;
      await remember(k,words,session.bookId);
      if(!live(session,n,entry))return;
      status(session,n,entry,boxes.length?'ready':'empty');
      // Page switch/background completion may cache, but never paint the old page.
      if(valid()&&session.settled.has(n))publish(session,n,entry,boxes);
      else status(session,n,entry,'waiting');
    }catch{
      if(live(session,n,entry))status(session,n,entry,'failed');
    }finally{active=null;if(currentPdfSession(wanted))schedule(wanted);}
  }
  function release(session,n){
    const entry=states.get(session)?.pages.get(n);
    if(entry&&['ready','empty'].includes(entry.status))status(session,n,entry,'waiting');
  }
  function close(session){
    if(confirmation?.session===session)dismissConfirmation();
    if(!states.has(session))return;
    state(session).closed=true;
    if(wanted===session){wanted=null;clearTimeout(timer);timer=0;}
    if(active?.session===session)active.cancel?.();
  }
  function tap(session,n){
    const entry=states.get(session)?.pages.get(n);if(!entry)return false;
    if(entry.status==='failed'){
      status(session,n,entry,'waiting');schedule(session);
      toast('글자 인식을 다시 시도해요. 인식이 끝나면 단어를 눌러 주세요.');
    }else if(entry.status==='unsupported')toast('스캔 PDF 단어 인식은 iOS·Android 앱에서 지원해요. 앱을 최신 버전으로 업데이트해 주세요.');
    else if(entry.status==='empty')toast('이 페이지에서 읽을 수 있는 영어 단어를 찾지 못했어요.');
    else if(['waiting','running'].includes(entry.status)){
      schedule(session);toast('기기에서 영어 단어를 인식하고 있어요. 잠시 후 다시 눌러 주세요.');
    }else return false;
    return true;
  }
  function dismissConfirmation(){
    confirmation=null;
    if(confirmationNode){confirmationNode.remove();confirmationNode=null;}
  }
  function confirm(page,box,accept){
    dismissConfirmation();
    const session=originalSession,token=readerModeChangeToken;
    if(!ownsPdfBoxes(page,[box],session)||document.hidden)return;
    if(typeof closePanel==='function')closePanel();
    if(typeof closeSentence==='function')closeSentence();
    const node=document.createElement('div');node.className='pdf-ocr-confirm control-glass';
    node.setAttribute('role','group');node.setAttribute('aria-label','스캔 단어 확인');
    node.setAttribute('aria-live','polite');
    const label=document.createElement('p');label.textContent='원문과 같은 단어인지 확인해 주세요.';
    const word=document.createElement('strong');word.textContent=box.word;word.lang='en';
    const note=document.createElement('p');note.textContent='작은 글자·흐림·손글씨는 잘못 읽을 수 있어요.';
    const actions=document.createElement('div');actions.className='pdf-ocr-confirm-actions';
    const yes=document.createElement('button');yes.type='button';yes.dataset.ocrConfirm='';yes.textContent='맞아요, 뜻 보기';
    const no=document.createElement('button');no.type='button';no.dataset.ocrDismiss='';no.textContent='원문으로';
    actions.append(yes,no);node.append(label,word,note,actions);document.body.append(node);
    const entry={session,page,box,token};confirmation=entry;confirmationNode=node;
    const r=page.getBoundingClientRect(),v=window.visualViewport;
    const left=v?.offsetLeft||0,top=v?.offsetTop||0,width=v?.width||window.innerWidth,height=v?.height||window.innerHeight;
    const size=node.getBoundingClientRect(),x=r.left+(box.x+box.w/2)*r.width;
    const below=r.top+(box.y+box.h)*r.height+8,above=r.top+box.y*r.height-size.height-8;
    node.style.left=Math.max(left+12,Math.min(left+width-size.width-12,x-size.width/2))+'px';
    node.style.top=Math.max(top+12,Math.min(top+height-size.height-80,below+size.height<top+height-80?below:above))+'px';
    yes.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      const valid=confirmation===entry&&currentPdfSession(session)&&readerModeChangeToken===token
        &&ownsPdfBoxes(page,[box],session)&&!document.hidden&&!originalPdfPaintPaused()&&!pdfScrollBusy(session);
      dismissConfirmation();if(valid)accept();
    });
    no.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();dismissConfirmation();});
  }
  // This is a nonmodal spelling check, not a second gesture owner. Every reader
  // gesture continues normally; leaving the occurrence only removes the prompt.
  const outside=event=>{if(confirmationNode&&!confirmationNode.contains(event.target))dismissConfirmation();};
  document.addEventListener('pointerdown',outside,true);
  document.addEventListener('touchstart',outside,true);
  document.addEventListener('scroll',dismissConfirmation,true);
  document.addEventListener('wheel',dismissConfirmation,true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')dismissConfirmation();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)dismissConfirmation();});
  window.addEventListener?.('resize',dismissConfirmation);
  window.addEventListener?.('blur',dismissConfirmation);
  window.visualViewport?.addEventListener('resize',dismissConfirmation);
  window.visualViewport?.addEventListener('scroll',dismissConfirmation);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  return {inspect,schedule,release,close,tap,forget,boxesFromWords,confirm};
})();
