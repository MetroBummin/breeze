/* Preview never owns reading progress. Optional metadata must not block Reader. */
const ARTICLE_PREVIEW_CACHE = 'breeze.article-preview.v4';
const ARTICLE_PREVIEW_TIMEOUT = 15000;
const ARTICLE_PREVIEW_CACHE_AGE = 30 * 86400000;
const articlePreviewJobs = new Map();
let articlePreviewBook = null;
let articlePreviewImageUrl = '';
let articlePreviewGeneration = 0;
let articlePreviewOpening = null;
let articlePreviewOpenController=null;

function articlePreviewExcerpt(book){
  const blocks=Array.isArray(book.formatting?.blocks) ? book.formatting.blocks : book.blocks;
  const lines=(Array.isArray(blocks) ? blocks : []).filter(block=>block && (block.r==='p' || block.r==='quote'))
    .map(block=>String(block.t || '').trim()).filter(line=>line.length>=35);
  const fallback=(Array.isArray(book.paras) ? book.paras : []).map(line=>String(line || '').trim())
    .filter(line=>line.length>=20 && line!==String(book.title || '').trim() && !line.startsWith(IMG_MARK));
  let used=0;
  return (lines.length ? lines : fallback).slice(0,3).map(line=>{
    const part=line.slice(0,Math.max(0,540-used));used+=part.length;return part;
  }).filter(Boolean);
}
function articlePreviewInput(book){
  try{
    const url=new URL(articleUrlKey(book.sourceUrl));
    if(!['http:','https:'].includes(url.protocol) || url.username || url.password || url.href.length>2048)return null;
    const title=String(book.title || '').trim().slice(0,250),excerpt=articlePreviewExcerpt(book).join('\n\n');
    return title && excerpt.length>=60 ? {url:url.href,title,excerpt} : null;
  }catch{return null;}
}
function articlePreviewKey(book){
  const input=articlePreviewInput(book);
  // Include the exact source evidence, not just an id that survives title/body edits.
  return input ? JSON.stringify([input.url,input.title,input.excerpt]) : '';
}
function articlePreviewValid(value){
  if(!value || typeof value!=='object')return null;
  const limits={summaryKo:[40,600]},meta={};
  for(const field of Object.keys(limits)){
    const text=typeof value[field]==='string' ? value[field].trim() : '';
    if(text.length<limits[field][0] || text.length>limits[field][1] || !/[가-힣]/.test(text))return null;
    meta[field]=text;
  }
  return meta;
}
function articlePreviewCacheEntries(){
  try{
    const all=JSON.parse(localStorage.getItem(ARTICLE_PREVIEW_CACHE)||'{}');
    return all && typeof all==='object' && !Array.isArray(all) ? all : {};
  }catch{return {};}
}
function articlePreviewCached(key){
  const entry=articlePreviewCacheEntries()[key],now=Date.now();
  return entry && Number.isFinite(entry.at) && entry.at<=now && now-entry.at<ARTICLE_PREVIEW_CACHE_AGE
    ? articlePreviewValid(entry.meta) : null;
}
function articlePreviewSave(key,meta){
  try{
    const now=Date.now(),all=articlePreviewCacheEntries();
    all[key]={at:now,meta};
    const kept=Object.entries(all).filter(([,entry])=>entry && Number.isFinite(entry.at) &&
      entry.at<=now && now-entry.at<ARTICLE_PREVIEW_CACHE_AGE && articlePreviewValid(entry.meta))
      .sort((a,b)=>b[1].at-a[1].at).slice(0,100);
    localStorage.setItem(ARTICLE_PREVIEW_CACHE,JSON.stringify(Object.fromEntries(kept)));
  }catch{/* Storage denial/quota never makes a readable article unavailable. */}
}
function articlePreviewUntil(value,signal){
  // Abort fetch AND waits that do not consume AbortSignal (auth and body parsing).
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(new Error('preview_timeout'));
    if(signal.aborted){abort();return;}
    signal.addEventListener('abort',abort,{once:true});
    Promise.resolve(value).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
}
async function articlePreviewMetadata(book){
  const input=articlePreviewInput(book),key=articlePreviewKey(book);
  const failed=reason=>({meta:null,reason});
  if(!input)return failed('source');
  const cached=articlePreviewCached(key);if(cached)return {meta:cached,reason:''};
  if(articlePreviewJobs.has(key))return articlePreviewJobs.get(key);
  if(navigator.onLine===false)return failed('offline');
  if(!SB_URL || !SB_KEY)return failed('unavailable');
  if(articlePreviewJobs.size>=4)return failed('busy');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),ARTICLE_PREVIEW_TIMEOUT);
  const job=(async()=>{
    try{
      let token=SB_KEY;
      try{
        const auth=await articlePreviewUntil(sb.auth.getSession(),controller.signal);
        if(auth?.data?.session?.access_token)token=auth.data.session.access_token;
      }catch{if(controller.signal.aborted)return failed('timeout');}
      const response=await articlePreviewUntil(fetch(SB_URL.replace(/\/$/,'')+'/functions/v1/article-preview',{
        method:'POST',signal:controller.signal,
        headers:{'Content-Type':'application/json','apikey':SB_KEY,'Authorization':'Bearer '+token},
        body:JSON.stringify({...input,device:deviceId()})
      }),controller.signal);
      if(!response.ok){
        // Do not swallow every failure into null. Keep a bounded, non-sensitive
        // cause for honest UX and diagnostics; never render a raw server error.
        const reason=response.status===404?'unavailable':response.status===401||response.status===403?'auth':
          response.status===429?'quota':response.status>=500?'service':'request';
        return failed(reason);
      }
      const meta=articlePreviewValid(await articlePreviewUntil(response.json(),controller.signal));
      if(controller.signal.aborted)return failed('timeout');
      if(!meta)return failed('invalid');
      articlePreviewSave(key,meta);
      return {meta,reason:''};
    }catch{return failed(controller.signal.aborted?'timeout':'network');}
    finally{clearTimeout(timeout);}
  })();
  articlePreviewJobs.set(key,job);
  try{return await job;}finally{if(articlePreviewJobs.get(key)===job)articlePreviewJobs.delete(key);}
}
const articlePreviewDialog=/** @type {HTMLDialogElement} */(document.getElementById('article-preview'));
function articlePreviewActive(generation){
  return generation===articlePreviewGeneration && articlePreviewDialog.open;
}
function articlePreviewStatus(text){
  articlePreviewDialog.querySelector('.ap-status').textContent=text;
}
function articlePreviewClose(cancelOpening=true){
  if(cancelOpening!==false&&articlePreviewOpenController){articlePreviewOpenController.abort();articlePreviewOpenController=null;articlePreviewOpening=null;}

  articlePreviewDialog.dataset.preparing='false';
  articlePreviewGeneration++;
  articlePreviewBook=null;
  const image=/** @type {HTMLImageElement} */(articlePreviewDialog.querySelector('.ap-hero img'));
  image.hidden=true;image.removeAttribute('src');
  if(articlePreviewImageUrl){URL.revokeObjectURL(articlePreviewImageUrl);articlePreviewImageUrl='';}
  if(articlePreviewDialog.open)articlePreviewDialog.close();
}
function articlePreviewPaint(meta){
  const node=/** @type {HTMLElement} */(articlePreviewDialog.querySelector('.ap-summary'));
  node.textContent=meta ? meta.summaryKo : '';node.hidden=!meta;
}
function articlePreviewMetadataState(state,reason=''){
  articlePreviewDialog.dataset.metadata=state;
  articlePreviewDialog.dataset.metadataReason=reason;
  const messages={source:'요약 없이 원문을 읽을 수 있어요.',offline:'오프라인이에요. 원문은 바로 읽을 수 있어요.',
    unavailable:'한국어 요약을 아직 사용할 수 없어요.',auth:'한국어 요약 연결을 확인하지 못했어요.',
    quota:'한국어 요약의 이용 한도에 도달했어요.',timeout:'한국어 요약이 늦어지고 있어요.',
    network:'한국어 요약을 불러오지 못했어요.',service:'한국어 요약을 잠시 사용할 수 없어요.',
    busy:'다른 요약을 준비 중이에요. 잠시 후 다시 시도해 주세요.',
    invalid:'한국어 요약을 준비하지 못했어요.',request:'한국어 요약을 요청하지 못했어요.',
    preparing_failed:'본문을 불러오지 못했어요.'};
  articlePreviewMetaLabel.textContent=state==='loading'?(reason==='preparing'?'본문을 가져오는 중…':'한국어 요약을 준비하고 있어요…'):
    state==='ready'?'':messages[reason]||'요약 없이도 원문을 읽을 수 있어요.';
  articlePreviewMetaStatus.hidden=state==='ready';
  articlePreviewDialog.setAttribute('aria-labelledby','ap-original-title');
  articlePreviewRetry.hidden=state!=='fallback'||['source','preparing_failed',''].includes(reason);
}
function articlePreviewRequest(book,generation){
  articlePreviewMetadataState('loading');
  articlePreviewRetry.onclick=()=>{
    if(articlePreviewActive(generation)&&!articlePreviewOpening)articlePreviewRequest(book,generation);
  };
  void articlePreviewMetadata(book).then(({meta,reason})=>{
    if(!articlePreviewActive(generation)||articlePreviewOpening)return;
    articlePreviewPaint(meta);articlePreviewMetadataState(meta?'ready':'fallback',reason);
  });
}
function openCasualPreviewOrReader(book,options={}){
  if(articlePreviewOpening)articlePreviewClose();
  if(book.kind!=='article' || posOf(book.id).t){articlePreviewClose();return openBook(book);}
  if(articlePreviewDialog.open && articlePreviewBook===book)return book;
  cancelPendingBookOpen();
  const replacing=options.replace===true&&articlePreviewDialog.open;
  if(replacing){
    articlePreviewGeneration++;
    if(articlePreviewImageUrl){URL.revokeObjectURL(articlePreviewImageUrl);articlePreviewImageUrl='';}
  }else articlePreviewClose();
  articlePreviewDialog.dataset.preparing='false';articlePreviewBook=book;
  const generation=articlePreviewGeneration,dialog=articlePreviewDialog;
  const image=/** @type {HTMLImageElement} */(dialog.querySelector('.ap-hero img'));
  dialog.querySelector('.ap-art').innerHTML=coverArtwork(book.id);
  dialog.querySelector('.ap-source').textContent=book.site || '';
  dialog.querySelector('.ap-title').textContent=book.title;
  const cached=articlePreviewCached(articlePreviewKey(book));
  articlePreviewPaint(cached);
  articlePreviewMetadataState(cached?'ready':'fallback',articlePreviewInput(book)?'':'source');
  articlePreviewStatus('');
  const start=/** @type {HTMLButtonElement} */(dialog.querySelector('.ap-start'));
  start.onclick=articlePreviewStart;start.disabled=false;start.textContent='읽기 시작';start.removeAttribute('aria-busy');
  dialog.querySelector('.ap-scroll').scrollTop=0;
  if(!dialog.open){
    dialog.showModal();
    /** @type {HTMLElement} */(dialog.querySelector('.ap-close')).focus({preventScroll:true});
  }
  // A draft uses an existing RSS/public image URL, never an IndexedDB write.
  const draft=articleDrafts.get(book);
  const photo=options.photo||draft?.coverUrl||'';
  image.hidden=true;image.removeAttribute('src');
  if(photo&&/^(https?:|blob:)/.test(photo)){
    image.referrerPolicy='no-referrer';image.src=photo;image.hidden=false;
    image.onerror=()=>{if(articlePreviewActive(generation))image.hidden=true;};
  }

  if(book.cover)void (async()=>{
    try{
      const blob=await bookImageBlob(book,book.cover);
      if(!blob || !articlePreviewActive(generation))return;
      const url=URL.createObjectURL(blob);articlePreviewImageUrl=url;
      const decoded=new Image();decoded.src=url;await decoded.decode();
      if(!articlePreviewActive(generation))return;
      image.src=url;image.hidden=false;
    }catch{
      if(articlePreviewActive(generation) && articlePreviewImageUrl){
        URL.revokeObjectURL(articlePreviewImageUrl);articlePreviewImageUrl='';
      }
    }
  })();
  // A bounded in-flight request may finish into cache after dismissal. It can
  // never paint another article or reopen the dialog; reopening shares the job.
  if(!cached&&articlePreviewInput(book))articlePreviewRequest(book,generation);
  return book;
}
/* RSS preparation stays in memory after dismissal; neither books nor images
   are persisted until the user explicitly chooses Read. */
function articlePreviewPrepare(entry,card){
  const url=entry.readUrl||entry.url;
  const existing=books.find(book=>book.sourceUrl&&articleUrlKey(book.sourceUrl)===articleUrlKey(url));
  if(existing)return null;
  const provisional={id:'preparing:'+url,kind:'article',title:entry.title,site:entry.source,sourceUrl:url,paras:[]};
  openCasualPreviewOrReader(provisional);
  const generation=articlePreviewGeneration,start=/** @type {HTMLButtonElement} */(articlePreviewDialog.querySelector('.ap-start'));
  articlePreviewDialog.dataset.preparing='true';articlePreviewMetadataState('loading','preparing');
  articlePreviewStatus('');start.disabled=true;start.textContent='본문 준비 중…';
  const cover=card?.querySelector('img.cover');
  const src=cover?.currentSrc||cover?.getAttribute('src')||'';
  if(/^(https?:|blob:)/.test(src)){
    const image=/** @type {HTMLImageElement} */(articlePreviewDialog.querySelector('.ap-hero img'));
    image.src=src;image.hidden=false;
  }
  return {
    finish(book){if(articlePreviewActive(generation))openCasualPreviewOrReader(book,{replace:true,photo:src});},
    fail(retry){if(!articlePreviewActive(generation))return;
      articlePreviewMetadataState('fallback','preparing_failed');articlePreviewStatus('본문을 준비하지 못했어요. 다시 시도할 수 있어요.');
      start.disabled=false;start.textContent='다시 시도';start.onclick=()=>{if(articlePreviewActive(generation)){articlePreviewClose();retry();}};
    }
  };
}
async function articlePreviewStart(){
  if(articlePreviewOpening || !articlePreviewBook || articlePreviewDialog.dataset.preparing==='true')return;
  const book=articlePreviewBook,generation=articlePreviewGeneration;
  const start=/** @type {HTMLButtonElement} */(articlePreviewDialog.querySelector('.ap-start'));
  start.disabled=true;start.textContent='글 여는 중…';start.setAttribute('aria-busy','true');
  articlePreviewStatus('');
  const controller=new AbortController();articlePreviewOpenController=controller;
  const deadline=setTimeout(()=>controller.abort(),15000);
  const openingOptions={signal:controller.signal,onPresented:()=>{if(articlePreviewActive(generation))articlePreviewClose(false);}};
  const job=articlePreviewUntil(Promise.resolve().then(async()=>{
    // The CTA is the save boundary. A dismissed preparation never reaches here.
    const saved=await commitArticleDraft(book);
    if(controller.signal.aborted||!articlePreviewActive(generation))return;
    await openBook(saved,openingOptions);
  }),controller.signal);
  articlePreviewOpening=job;
  try{
    await job;
    if(articlePreviewActive(generation))articlePreviewClose(false);
  }catch{
    if(articlePreviewActive(generation))articlePreviewStatus('저장하거나 글을 열지 못했어요. 다시 눌러 주세요.');
    else if(!controller.signal.aborted&&typeof toast==='function')toast('글을 열지 못했어요. 다시 시도해 주세요.');
  }finally{
    clearTimeout(deadline);if(articlePreviewOpenController===controller)articlePreviewOpenController=null;
    if(articlePreviewOpening===job)articlePreviewOpening=null;
    if(articlePreviewActive(generation)){
      start.disabled=false;start.textContent='읽기 시작';start.removeAttribute('aria-busy');
    }
  }
}
// The accessible name must exist before AI responds, including offline mode.
const articlePreviewTitle=articlePreviewDialog.querySelector('.ap-title');
articlePreviewTitle.id='ap-original-title';
articlePreviewDialog.setAttribute('aria-labelledby','ap-original-title');
// Status sits next to the missing Korean content, not only in a quiet footer.
const articlePreviewMetaStatus=document.createElement('div');
articlePreviewMetaStatus.className='ap-metadata-status';articlePreviewMetaStatus.setAttribute('role','status');
articlePreviewMetaStatus.setAttribute('aria-live','polite');
const articlePreviewMetaSpinner=document.createElement('span');
articlePreviewMetaSpinner.className='ap-metadata-spinner';articlePreviewMetaSpinner.setAttribute('aria-hidden','true');
const articlePreviewMetaLabel=document.createElement('span');
articlePreviewMetaLabel.className='ap-metadata-label';
const articlePreviewRetry=document.createElement('button');
articlePreviewRetry.type='button';articlePreviewRetry.className='ap-retry';articlePreviewRetry.textContent='요약 다시 시도';
articlePreviewRetry.hidden=true;articlePreviewRetry.setAttribute('aria-label','한국어 요약 다시 시도');
articlePreviewMetaStatus.append(articlePreviewMetaSpinner,articlePreviewMetaLabel,articlePreviewRetry);
articlePreviewDialog.querySelector('.ap-title').after(articlePreviewMetaStatus);
const articlePreviewStatusNode=document.createElement('p');
articlePreviewStatusNode.className='ap-status';articlePreviewStatusNode.setAttribute('role','status');
articlePreviewStatusNode.setAttribute('aria-live','polite');
articlePreviewDialog.querySelector('.ap-actions').prepend(articlePreviewStatusNode);
/** @type {HTMLButtonElement} */(articlePreviewDialog.querySelector('.ap-close')).onclick=()=>articlePreviewClose();
/** @type {HTMLButtonElement} */(articlePreviewDialog.querySelector('.ap-start')).onclick=articlePreviewStart;
articlePreviewDialog.addEventListener('cancel',event=>{event.preventDefault();articlePreviewClose();});
articlePreviewDialog.addEventListener('close',()=>{
  // close is queued: an old close event must not clear a newly opened article.
  if(!articlePreviewDialog.open && articlePreviewBook)articlePreviewClose();
});
let articlePreviewBackdrop=false;
articlePreviewDialog.addEventListener('pointerdown',event=>{articlePreviewBackdrop=event.target===articlePreviewDialog;});
articlePreviewDialog.addEventListener('pointercancel',()=>{articlePreviewBackdrop=false;});
articlePreviewDialog.addEventListener('click',event=>{
  if(articlePreviewBackdrop && event.target===articlePreviewDialog)articlePreviewClose();
  articlePreviewBackdrop=false;
});
window.addEventListener('pagehide',()=>articlePreviewClose());
