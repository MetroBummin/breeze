/* A small routing layer for unread saved articles. Reader owns the read timestamp. */
const ARTICLE_PREVIEW_CACHE = 'breeze.article-preview.v1';
const articlePreviewJobs = new Map();
let articlePreviewBook = null;
let articlePreviewImageUrl = '';
let articlePreviewGeneration = 0;

function articlePreviewExcerpt(book){
  const lines=(book.blocks || []).filter(block=>block.r==='p' || block.r==='quote')
    .map(block=>String(block.t || '').trim()).filter(line=>line.length>=35);
  const fallback=(book.paras || []).slice(1).map(line=>String(line || '').trim())
    .filter(line=>line.length>=20 && !line.startsWith(IMG_MARK));
  const picked=(lines.length ? lines : fallback).slice(0,3);
  let used=0;
  return picked.map(line=>{const part=line.slice(0,Math.max(0,540-used));used+=part.length;return part;})
    .filter(Boolean);
}
function articlePreviewKey(book){
  return (book.sourceUrl ? articleUrlKey(book.sourceUrl) : book.id)+'|'+(book.fingerprint || book.id);
}
function articlePreviewCached(key){
  try{return JSON.parse(localStorage.getItem(ARTICLE_PREVIEW_CACHE)||'{}')[key] || null;}catch{return null;}
}
function articlePreviewSave(key,meta){
  try{
    const all=JSON.parse(localStorage.getItem(ARTICLE_PREVIEW_CACHE)||'{}');
    all[key]=meta;
    const keys=Object.keys(all);for(const old of keys.slice(0,Math.max(0,keys.length-100)))delete all[old];
    localStorage.setItem(ARTICLE_PREVIEW_CACHE,JSON.stringify(all));
  }catch{}
}
async function articlePreviewMetadata(book){
  const key=articlePreviewKey(book),cached=articlePreviewCached(key);
  if(cached)return cached;
  if(articlePreviewJobs.has(key))return articlePreviewJobs.get(key);
  const job=(async()=>{
    if(!navigator.onLine || !SB_URL || !SB_KEY)return null;
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),9000);
    try{
      let token=SB_KEY;
      try{const {data:{session}}=await sb.auth.getSession();if(session)token=session.access_token;}catch{}
      const response=await fetch(SB_URL.replace(/\/$/,'')+'/functions/v1/article-preview',{
        method:'POST',signal:controller.signal,
        headers:{'Content-Type':'application/json','apikey':SB_KEY,'Authorization':'Bearer '+token},
        body:JSON.stringify({url:book.sourceUrl,title:book.title,excerpt:articlePreviewExcerpt(book).join('\n\n'),device:deviceId()})
      });
      if(!response.ok)return null;
      const meta=await response.json();
      if(!meta || typeof meta.hookTitle!=='string' || typeof meta.translatedTitle!=='string' || typeof meta.teaser!=='string')return null;
      articlePreviewSave(key,meta);return meta;
    }catch{return null;}finally{clearTimeout(timeout);}
  })();
  articlePreviewJobs.set(key,job);
  try{return await job;}finally{articlePreviewJobs.delete(key);}
}
function articlePreviewClose(){
  const dialog=/** @type {HTMLDialogElement} */(document.getElementById('article-preview'));
  articlePreviewGeneration++;
  if(dialog.open)dialog.close();
  articlePreviewBook=null;
  if(articlePreviewImageUrl){URL.revokeObjectURL(articlePreviewImageUrl);articlePreviewImageUrl='';}
}
function openCasualPreviewOrReader(book){
  if(book.kind!=='article' || posOf(book.id).t)return openBook(book);
  const dialog=/** @type {HTMLDialogElement} */(document.getElementById('article-preview'));
  articlePreviewClose();
  articlePreviewBook=book;
  const generation=articlePreviewGeneration;
  const hero=dialog.querySelector('.ap-hero'),image=/** @type {HTMLImageElement} */(hero.querySelector('img'));
  image.hidden=true;image.removeAttribute('src');
  hero.querySelector('.ap-art').innerHTML=coverArtwork(book.id);
  dialog.querySelector('.ap-source').textContent=book.site || '';
  dialog.querySelector('.ap-title').textContent=book.title;
  /** @type {HTMLElement} */(dialog.querySelector('#ap-hook')).hidden=true;
  /** @type {HTMLElement} */(dialog.querySelector('.ap-teaser')).hidden=true;
  const excerpt=dialog.querySelector('.ap-excerpt');excerpt.replaceChildren();
  for(const line of articlePreviewExcerpt(book)){const p=document.createElement('p');p.textContent=line;excerpt.appendChild(p);}
  dialog.showModal();
  /** @type {HTMLElement} */(dialog.querySelector('.ap-close')).focus();
  if(book.cover)bookImageBlob(book,book.cover).then(blob=>{
    if(!blob || generation!==articlePreviewGeneration || !dialog.open)return;
    articlePreviewImageUrl=URL.createObjectURL(blob);image.src=articlePreviewImageUrl;image.hidden=false;
  }).catch(()=>{});
  if(book.sourceUrl)articlePreviewMetadata(book).then(meta=>{
    if(!meta || generation!==articlePreviewGeneration || !dialog.open)return;
    const hook=/** @type {HTMLElement} */(dialog.querySelector('#ap-hook'));
    const teaser=/** @type {HTMLElement} */(dialog.querySelector('.ap-teaser'));
    hook.textContent=meta.hookTitle;hook.hidden=false;
    teaser.textContent=meta.teaser;teaser.hidden=false;
  });
  return book;
}
const articlePreviewDialog=/** @type {HTMLDialogElement} */(document.getElementById('article-preview'));
/** @type {HTMLButtonElement} */(articlePreviewDialog.querySelector('.ap-close')).onclick=articlePreviewClose;
/** @type {HTMLButtonElement} */(articlePreviewDialog.querySelector('.ap-start')).onclick=async()=>{
  const book=articlePreviewBook;
  articlePreviewClose();
  if(book)await openBook(book);
};
articlePreviewDialog.addEventListener('cancel',articlePreviewClose);
articlePreviewDialog.addEventListener('click',event=>{if(event.target===articlePreviewDialog)articlePreviewClose();});
