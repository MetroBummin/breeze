/* Local, resumable PDF preparation. Cards observe this owner; they never wait
   for it. Recognition itself is admitted only by BreezePdfOcr's global lane. */
const BreezePdfOcrLibrary=(()=>{
  const jobs=new Map();
  let timer=0,busy=false,held=null;
  const hash=book=>book?.original?.hash||book?.sourceHash||'';
  const current=job=>jobs.get(job.id)===job&&books.some(b=>b.id===job.id&&hash(b)===job.hash);
  const bookOf=job=>books.find(b=>b.id===job.id&&hash(b)===job.hash);
  const activePages=job=>{
    const deleted=new Set(bookOf(job)?.deletedPdfPages||[]);
    return Array.from({length:job.total||0},(_,i)=>i+1).filter(n=>!deleted.has(n));
  };
  function summary(job){
    const pages=activePages(job),done=pages.filter(n=>job.done.has(n)).length;
    return {done,total:pages.length,complete:!!job.total&&done===pages.length};
  }
  function paint(job){
    if(jobs.get(job.id)!==job)return;
    const s=summary(job);
    for(const node of document.querySelectorAll('[data-ocr-book]')){
      if(!(node instanceof HTMLElement))continue;
      if(node.dataset.ocrBook!==job.id)continue;
      node.hidden=job.state==='missing'||s.complete;
      if(node.hidden)continue;
      const text=node.querySelector('span'),bar=node.querySelector('progress'),retry=node.querySelector('button');
      const count=s.total?' · '+s.done+'/'+s.total+'쪽':'';
      text.textContent=(job.state==='paused'?'글자 인식 일시 중지':'글자 인식 중')+count;
      bar.max=Math.max(1,s.total);bar.value=s.done;
      if(!s.total)bar.removeAttribute('value');
      retry.hidden=job.state!=='paused';
      node.setAttribute('aria-label',text.textContent);
    }
  }
  function schedule(delay=350){
    if(timer||document.hidden)return;
    timer=setTimeout(()=>{timer=0;void drain();},delay);
  }
  async function release(){
    const old=held;held=null;
    if(old)try{await old.pdf.destroy();}catch{}
  }
  async function prepare(job){
    if(held?.job===job)return held.pdf;
    await release();
    const book=bookOf(job),original=await originalGetForBook(book);
    if(!current(job))return null;
    if(!original?.blob||original.hash!==job.hash){job.state='missing';paint(job);return null;}
    await ensurePdfLib();
    const pdf=await pdfjsLib.getDocument({data:await original.blob.arrayBuffer(),isEvalSupported:false}).promise;
    if(!current(job)){await pdf.destroy();return null;}
    held={job,pdf};job.total=pdf.numPages;
    job.done=await BreezePdfOcr.completed(book);paint(job);
    return pdf;
  }
  async function drain(){
    if(busy||document.hidden||!BreezePdfOcr.available())return;
    const candidates=[...jobs.values()].filter(j=>current(j)&&j.state==='queued'&&!summary(j).complete);
    const job=candidates.find(j=>j.id===curBook?.id)||candidates[0];
    if(!job)return;
    busy=true;
    try{
      const pdf=await prepare(job);if(!pdf||!current(job))return;
      const book=bookOf(job);
      // A foreground page may have completed since the last background turn.
      job.done=await BreezePdfOcr.completed(book);
      const remaining=activePages(job).filter(n=>!job.done.has(n));
      if(!remaining.length){paint(job);await release();return;}
      const visible=currentPdfSession()&&originalSession.bookId===job.id?pdfPagesInView(originalSession):[];
      const n=remaining.find(n=>visible.includes(n))||remaining[0];
      const result=await BreezePdfOcr.background(book,n,pdf,()=>current(job));
      if(!current(job))return;
      if(result==='done')job.done.add(n);
      else if(['failed','storage','blocked'].includes(result))job.state='paused';
      paint(job);
      if(summary(job).complete||job.state==='paused')await release();
    }catch{
      if(current(job)){job.state='paused';paint(job);}
      await release();
    }finally{busy=false;if([...jobs.values()].some(j=>current(j)&&j.state==='queued'&&!summary(j).complete))schedule();}
  }
  function track(book,{restart=false}={}){
    if(book?.kind!=='pdf'||!hash(book)||!BreezePdfOcr.available())return null;
    let job=jobs.get(book.id);
    if(job&&job.hash!==hash(book)){forget(book.id);job=null;}
    if(!job){job={id:book.id,hash:hash(book),done:new Set(),total:0,state:'queued'};jobs.set(book.id,job);}
    if(restart&&['missing','paused'].includes(job.state))job.state='queued';
    schedule();return job;
  }
  function mount(tile,book){
    const job=track(book);if(!job)return;
    let node=tile.querySelector('[data-ocr-book]');
    if(!node){
      node=document.createElement('div');node.className='book-ocr-progress';node.dataset.ocrBook=book.id;
      const text=document.createElement('span'),bar=document.createElement('progress'),retry=document.createElement('button');
      bar.setAttribute('aria-label','글자 인식 진행');retry.type='button';retry.textContent='다시 시도';
      retry.onclick=event=>{event.stopPropagation();const latest=jobs.get(book.id);if(latest){latest.state='queued';paint(latest);schedule();}};
      node.append(text,bar,retry);tile.append(node);
    }
    // The tile may not yet be connected, so initialise it before the shared update.
    node.hidden=summary(job).complete||job.state==='missing';
    const s=summary(job);node.querySelector('span').textContent='글자 인식 중'+(s.total?' · '+s.done+'/'+s.total+'쪽':'');
    const bar=node.querySelector('progress');bar.max=Math.max(1,s.total);bar.value=s.done;
    if(!s.total)bar.removeAttribute('value');
    node.querySelector('button').hidden=job.state!=='paused';
    queueMicrotask(()=>paint(job));
  }
  function forget(id){
    const job=jobs.get(id);jobs.delete(id);
    if(held?.job===job)void release();
  }
  function restore(){
    if(typeof books==='undefined')return;
    for(const book of books)track(book);
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){restore();schedule();}});
  return {mount,track,restore,forget,summary};
})();
