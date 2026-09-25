/* Preview never owns reading progress. Optional metadata must not block Reader. */
const ARTICLE_PREVIEW_CACHE = 'breeze.article-preview.v2';
const ARTICLE_PREVIEW_TIMEOUT = 15000;
const ARTICLE_PREVIEW_CACHE_AGE = 30 * 86400000;
const articlePreviewJobs = new Map();
let articlePreviewBook = null;
let articlePreviewImageUrl = '';
let articlePreviewGeneration = 0;
let articlePreviewOpening = null;

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
  const limits={hookTitle:[5,90],translatedTitle:[1,180],teaser:[25,500]},meta={};
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
  if(!input)return null;
  const cached=articlePreviewCached(key);if(cached)return cached;
  if(articlePreviewJobs.has(key))return articlePreviewJobs.get(key);
  if(navigator.onLine===false || !SB_URL || !SB_KEY || articlePreviewJobs.size>=4)return null;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),ARTICLE_PREVIEW_TIMEOUT);
  const job=(async()=>{
    try{
      let token=SB_KEY;
      try{
        const auth=await articlePreviewUntil(sb.auth.getSession(),controller.signal);
        if(auth?.data?.session?.access_token)token=auth.data.session.access_token;
      }catch{if(controller.signal.aborted)return null;}
      const response=await articlePreviewUntil(fetch(SB_URL.replace(/\/$/,'')+'/functions/v1/article-preview',{
        method:'POST',signal:controller.signal,
        headers:{'Content-Type':'application/json','apikey':SB_KEY,'Authorization':'Bearer '+token},
        body:JSON.stringify({...input,device:deviceId()})
      }),controller.signal);
      if(!response.ok)return null;
      const meta=articlePreviewValid(await articlePreviewUntil(response.json(),controller.signal));
      if(meta && !controller.signal.aborted)articlePreviewSave(key,meta);
      return controller.signal.aborted ? null : meta;
    }catch{return null;}finally{clearTimeout(timeout);}
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
function articlePreviewClose(){
  articlePreviewGeneration++;
  articlePreviewBook=null;
  const image=/** @type {HTMLImageElement} */(articlePreviewDialog.querySelector('.ap-hero img'));
  image.hidden=true;image.removeAttribute('src');
  if(articlePreviewImageUrl){URL.revokeObjectURL(articlePreviewImageUrl);articlePreviewImageUrl='';}
  if(articlePreviewDialog.open)articlePreviewDialog.close();
}
function articlePreviewPaint(meta){
  for(const [selector,field] of [['#ap-hook','hookTitle'],['.ap-teaser','teaser']]){
    const node=/** @type {HTMLElement} */(articlePreviewDialog.querySelector(selector));
    node.textContent=meta ? meta[field] : '';node.hidden=!meta;
  }
}
function openCasualPreviewOrReader(book){
  if(articlePreviewOpening)return articlePreviewOpening;
  if(book.kind!=='article' || posOf(book.id).t){articlePreviewClose();return openBook(book);}
  if(articlePreviewDialog.open && articlePreviewBook===book)return book;
  articlePreviewClose();articlePreviewBook=book;
  const generation=articlePreviewGeneration,dialog=articlePreviewDialog;
  const image=/** @type {HTMLImageElement} */(dialog.querySelector('.ap-hero img'));
  dialog.querySelector('.ap-art').innerHTML=coverArtwork(book.id);
  dialog.querySelector('.ap-source').textContent=book.site || '';
  dialog.querySelector('.ap-title').textContent=book.title;
  const cached=articlePreviewCached(articlePreviewKey(book));
  articlePreviewPaint(cached);
  articlePreviewStatus(cached ? '' : articlePreviewInput(book) && navigator.onLine!==false
    ? '한국어 소개를 준비하고 있어요.' : '원문은 바로 읽을 수 있어요.');
  const start=/** @type {HTMLButtonElement} */(dialog.querySelector('.ap-start'));
  start.disabled=false;start.textContent='읽기 시작';start.removeAttribute('aria-busy');
  const excerpt=dialog.querySelector('.ap-excerpt');excerpt.replaceChildren();
  const opening=articlePreviewExcerpt(book)[0] || '';
  if(opening){const p=document.createElement('p');p.textContent=opening.slice(0,260)+(opening.length>260?'…':'');excerpt.appendChild(p);}
  dialog.querySelector('.ap-scroll').scrollTop=0;
  dialog.showModal();
  /** @type {HTMLElement} */(dialog.querySelector('.ap-close')).focus({preventScroll:true});
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
  if(!cached)void articlePreviewMetadata(book).then(meta=>{
    if(!articlePreviewActive(generation) || articlePreviewOpening)return;
    articlePreviewPaint(meta);
    articlePreviewStatus(meta ? '' : '한국어 소개 없이도 바로 읽을 수 있어요.');
  });
  return book;
}
async function articlePreviewStart(){
  if(articlePreviewOpening || !articlePreviewBook)return;
  const book=articlePreviewBook,generation=articlePreviewGeneration;
  const start=/** @type {HTMLButtonElement} */(articlePreviewDialog.querySelector('.ap-start'));
  start.disabled=true;start.textContent='글 여는 중…';start.setAttribute('aria-busy','true');
  articlePreviewStatus('');
  const job=Promise.resolve().then(()=>openBook(book,{onPresented:()=>{
    if(articlePreviewActive(generation))articlePreviewClose();
  }}));
  articlePreviewOpening=job;
  try{
    await job;
    if(articlePreviewActive(generation))articlePreviewClose();
  }catch{
    if(articlePreviewActive(generation))articlePreviewStatus('글을 열지 못했어요. 다시 눌러 주세요.');
    else if(typeof toast==='function')toast('글을 열지 못했어요. 다시 시도해 주세요.');
  }finally{
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
const articlePreviewStatusNode=document.createElement('p');
articlePreviewStatusNode.className='ap-status';articlePreviewStatusNode.setAttribute('role','status');
articlePreviewStatusNode.setAttribute('aria-live','polite');
articlePreviewDialog.querySelector('.ap-actions').prepend(articlePreviewStatusNode);
/** @type {HTMLButtonElement} */(articlePreviewDialog.querySelector('.ap-close')).onclick=articlePreviewClose;
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
window.addEventListener('pagehide',articlePreviewClose);
