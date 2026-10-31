/* Preview never owns reading progress. Optional metadata must not block Reader. */
const ARTICLE_PREVIEW_CACHE = 'breeze.article-preview.v5';
const ARTICLE_PREVIEW_PROMPT_VERSION = 5;
const ARTICLE_PREVIEW_SUMMARY_MIN = 40;
const ARTICLE_PREVIEW_TIMEOUT = 15000;
const ARTICLE_PREVIEW_CACHE_AGE = 30 * 86400000;
const articlePreviewJobs = new Map();
let articlePreviewBook = null;
let articlePreviewImageUrl = '';
let articlePreviewGeneration = 0;
let articlePreviewOpening = null;
let articlePreviewOpenController=null;
let articlePreviewSummaryUrl='';
let articlePreviewSummaryPending=null;

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
    return title && excerpt.length>=ARTICLE_PREVIEW_SUMMARY_MIN ? {url:url.href,title,excerpt} : null;
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
  return entry && entry.promptVersion===ARTICLE_PREVIEW_PROMPT_VERSION && Number.isFinite(entry.at) && entry.at<=now && now-entry.at<ARTICLE_PREVIEW_CACHE_AGE
    ? articlePreviewValid(entry.meta) : null;
}
function articlePreviewSave(key,meta){
  try{
    const now=Date.now(),all=articlePreviewCacheEntries();
    all[key]={at:now,meta,promptVersion:ARTICLE_PREVIEW_PROMPT_VERSION};
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
function articlePreviewReadingBase(){
  try{return typeof readingCacheBase==='function'?readingCacheBase():'';}catch{return '';}
}
async function articlePreviewReadCache(input, signal){
  const base=articlePreviewReadingBase();
  if(!base)return {reason:'off'};
  const hash=await readingSha256('article-preview-v5\n'+input.url+'\n'+input.title+'\n'+input.excerpt);
  const response=await fetch(base+'/previews/v5/'+hash+'.json',{credentials:'omit',signal});
  if(response.status===404)return {reason:'miss'};
  if(!response.ok)return {reason:'network'};
  const meta=articlePreviewValid(await response.json());
  return meta?{meta}:{reason:'network'};
}
async function articlePreviewMetadata(book){
  const input=articlePreviewInput(book),key=articlePreviewKey(book);
  const failed=reason=>({meta:null,reason});
  if(!input)return failed('source');
  const cached=articlePreviewCached(key);if(cached)return {meta:cached,reason:''};
  if(articlePreviewJobs.has(key))return articlePreviewJobs.get(key);
  if(navigator.onLine===false)return failed('offline');
  const reading=!!articlePreviewReadingBase();
  if(!reading && (!SB_URL || !SB_KEY))return failed('unavailable');
  if(articlePreviewJobs.size>=4)return failed('busy');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),ARTICLE_PREVIEW_TIMEOUT);
  const job=(async()=>{
    try{
      if(reading){
        let found;
        try{found=await articlePreviewUntil(articlePreviewReadCache(input,controller.signal),controller.signal);}
        catch{return failed(controller.signal.aborted?'timeout':'network');}
        if(found.meta){articlePreviewSave(key,found.meta);return {meta:found.meta,reason:''};}
        if(found.reason==='network')return failed('network');
        if(!SB_URL || !SB_KEY)return failed('unavailable');
      }
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
        let reason=response.status===404?'unavailable':response.status===401||response.status===403?'auth':
          response.status===429?'quota':response.status>=500?'service':'request';
        try{
          const error=await articlePreviewUntil(response.json(),controller.signal);
          const reasons={validation_failed:'invalid',generation_timeout:'timeout',busy:'busy'};
          if(reasons[error?.error])reason=reasons[error.error];
        }catch{/* Keep the HTTP category for non-JSON failures. */}
        return failed(reason);
      }
      const payload=await articlePreviewUntil(response.json(),controller.signal);
      const meta=articlePreviewValid(payload);
      if(controller.signal.aborted)return failed('timeout');
      if(!meta)return failed('invalid');
      // Older servers remain readable, but cannot populate the new editorial cache.
      if(payload.promptVersion===ARTICLE_PREVIEW_PROMPT_VERSION)articlePreviewSave(key,meta);
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
function articlePreviewUrl(book){
  try{return book?.sourceUrl?articleUrlKey(book.sourceUrl):'';}catch{return '';}
}
function articlePreviewApply(meta,reason){
  articlePreviewPaint(meta);articlePreviewMetadataState(meta?'ready':'fallback',reason);
}
function articlePreviewStatus(text){
  articlePreviewDialog.querySelector('.ap-status').textContent=text;
}
function articlePreviewClose(cancelOpening=true){
  if(cancelOpening!==false&&articlePreviewOpenController){articlePreviewOpenController.abort();articlePreviewOpenController=null;articlePreviewOpening=null;}

  articlePreviewDialog.dataset.preparing='false';
  articlePreviewDialog.dataset.kind='article';
  if(typeof articlePreviewChapters!=='undefined'){articlePreviewChapters.hidden=true;articlePreviewChapters.textContent='';}
  articlePreviewDialog.querySelector('.ap-links')?.remove();
  if(typeof articlePreviewSubtitle!=='undefined'){articlePreviewSubtitle.hidden=true;articlePreviewSubtitle.textContent='';}
  articlePreviewGeneration++;
  articlePreviewBook=null;
  articlePreviewSummaryUrl='';
  articlePreviewSummaryPending=null;
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
  const messages={source:'소개 없이 원문을 읽을 수 있어요.',offline:'오프라인이에요. 원문은 바로 읽을 수 있어요.',
    unavailable:'한국어 소개를 아직 사용할 수 없어요.',auth:'한국어 소개 연결을 확인하지 못했어요.',
    quota:'한국어 소개의 이용 한도에 도달했어요.',timeout:'한국어 소개가 늦어지고 있어요.',
    network:'한국어 소개를 불러오지 못했어요.',service:'한국어 소개를 잠시 사용할 수 없어요.',
    busy:'다른 소개를 준비 중이에요. 잠시 후 다시 시도해 주세요.',
    invalid:'한국어 소개를 준비하지 못했어요.',request:'한국어 소개를 요청하지 못했어요.',
    preparing_failed:'본문을 불러오지 못했어요.'};
  articlePreviewMetaLabel.textContent=state==='loading'?(reason==='preparing'?'본문을 가져오는 중…':'한국어 소개를 준비하고 있어요…'):
    state==='ready'?'':messages[reason]||'소개 없이도 원문을 읽을 수 있어요.';
  articlePreviewMetaStatus.hidden=state==='ready';
  articlePreviewSummaryCard.setAttribute('aria-busy',String(state==='loading'));
  articlePreviewDialog.setAttribute('aria-labelledby','ap-original-title');
  articlePreviewRetry.hidden=state!=='fallback'||['source','preparing_failed',''].includes(reason);
}
function articlePreviewRequest(book,generation){
  const url=articlePreviewUrl(book);
  articlePreviewSummaryUrl=url;
  articlePreviewSummaryPending=null;
  articlePreviewMetadataState('loading');
  articlePreviewRetry.onclick=()=>{
    const current=articlePreviewBook;
    if(articlePreviewDialog.open&&current&&articlePreviewUrl(current)===url&&!articlePreviewOpening)
      articlePreviewRequest(current,articlePreviewGeneration);
  };
  void articlePreviewMetadata(book).then(({meta,reason})=>{
    // A body replacement increments the generation for the same article.
    // Read can also be in flight. Neither may drop an invitation for this URL.
    if(!articlePreviewDialog.open||articlePreviewUrl(articlePreviewBook)!==url)return;
    if(articlePreviewOpening){articlePreviewSummaryPending={meta,reason,url};return;}
    if(generation!==articlePreviewGeneration&&articlePreviewDialog.dataset.metadata==='ready')return;
    articlePreviewApply(meta,reason);
  });
}
function articlePreviewPaintPending(){
  const pending=articlePreviewSummaryPending;
  if(!pending||articlePreviewUrl(articlePreviewBook)!==pending.url){articlePreviewSummaryPending=null;return;}
  articlePreviewSummaryPending=null;
  articlePreviewApply(pending.meta,pending.reason);
}
function previewLongRead(id){
  if(!id)return null;
  const offered=typeof classicCatalogOffers==='function'&&classicCatalogOffers().find(read=>read.id===id);
  if(offered)return offered;
  return typeof LONG_READS!=='undefined'&&LONG_READS.find(read=>read.id===id)||null;
}
function openCasualPreviewOrReader(book,options={}){
  const bundled=book.longReadId&&previewLongRead(book.longReadId);
  if(bundled&&!posOf(book.id).t)return openLongReadPreview(bundled);
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
  articlePreviewDialog.dataset.kind='article';
  articlePreviewDetails.hidden=true;
  const generation=articlePreviewGeneration,dialog=articlePreviewDialog;
  const image=/** @type {HTMLImageElement} */(dialog.querySelector('.ap-hero img'));
  dialog.querySelector('.ap-art').innerHTML=coverArtwork(book.id);
  dialog.querySelector('.ap-source').textContent=book.site || '';
  dialog.querySelector('.ap-title').textContent=book.title;
  // Body arrival replaces the provisional sheet. Keep an invitation that already
  // started from the feed summary; a second excerpt must not erase it.
  const summaryLive=!!articlePreviewSummaryUrl&&articlePreviewSummaryUrl===articlePreviewUrl(book)
    &&(articlePreviewDialog.dataset.metadata==='ready'||articlePreviewDialog.dataset.metadata==='loading');
  const cached=articlePreviewCached(articlePreviewKey(book));
  if(!summaryLive){
    articlePreviewPaint(cached);
    articlePreviewMetadataState(cached?'ready':'fallback',articlePreviewInput(book)?'':'source');
  }
  articlePreviewStatus('');
  const start=/** @type {HTMLButtonElement} */(dialog.querySelector('.ap-start'));
  start.onclick=articlePreviewStart;start.disabled=false;start.textContent='읽기 시작';start.removeAttribute('aria-busy');
  dialog.querySelector('.ap-scroll').scrollTop=0;
  if(!dialog.open){
    dialog.showModal();
    dialog.setAttribute('tabindex','-1');dialog.focus({preventScroll:true});
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
  if(!summaryLive&&!cached&&articlePreviewInput(book))articlePreviewRequest(book,generation);
  return book;
}
/* RSS preparation stays in memory after dismissal; neither books nor images
   are persisted until the user explicitly chooses Read. */
function articlePreviewPrepare(entry,card){
  const url=entry.readUrl||entry.url;
  const existing=books.find(book=>book.sourceUrl&&articleUrlKey(book.sourceUrl)===articleUrlKey(url));
  if(existing)return null;
  const lead=String(entry.summary||'').replace(/\s+/g,' ').trim();
  // Forty characters of collapsed summary is enough to invite, and that invitation
  // stays when the body arrives. A missing or shorter summary waits for the body's
  // first paragraph instead of starting from a headline-sized fragment.
  const provisional={id:'preparing:'+url,kind:'article',title:entry.title,site:entry.source,sourceUrl:url,
    paras:lead.length>=ARTICLE_PREVIEW_SUMMARY_MIN?[lead]:[]};
  const cover=card?.querySelector('img.cover');
  const src=cover?.currentSrc||cover?.getAttribute('src')||entry.photo||'';
  // Paint known discovery metadata synchronously. The feed summary can invite
  // reading before the body arrives; a missing body must not hide that invitation.
  openCasualPreviewOrReader(provisional,{replace:true,photo:src});
  const generation=articlePreviewGeneration,start=/** @type {HTMLButtonElement} */(articlePreviewDialog.querySelector('.ap-start'));
  articlePreviewDialog.dataset.preparing='true';
  if(articlePreviewDialog.dataset.metadata!=='ready'&&articlePreviewDialog.dataset.metadata!=='loading')
    articlePreviewMetadataState('loading','preparing');
  articlePreviewStatus('');start.disabled=true;start.textContent='본문 준비 중…';
  return {
    finish(book){if(articlePreviewActive(generation))openCasualPreviewOrReader(book,{replace:true,photo:src});},
    fail(retry){if(!articlePreviewActive(generation))return;
      if(articlePreviewDialog.dataset.metadata!=='ready')articlePreviewMetadataState('fallback','preparing_failed');
      articlePreviewStatus('본문을 준비하지 못했어요. 다시 시도할 수 있어요.');
      start.disabled=false;start.textContent='다시 시도';start.onclick=()=>{if(articlePreviewActive(generation))retry();};
    }
  };
}
async function articlePreviewStart(){
  if(articlePreviewOpening || !articlePreviewBook || articlePreviewDialog.dataset.preparing==='true')return;
  const book=articlePreviewBook,generation=articlePreviewGeneration;
  const start=/** @type {HTMLButtonElement} */(articlePreviewDialog.querySelector('.ap-start'));
  const remote=!!book.bundledRead?.remote;
  if(remote&&typeof remoteClassicOffline==='function'&&remoteClassicOffline(book.bundledRead)){
    articlePreviewStatus('오프라인이에요. 연결되면 다시 눌러 주세요.');
    start.disabled=false;start.textContent='다시 시도';start.removeAttribute('aria-busy');
    return;
  }
  start.disabled=true;start.textContent=remote?'받는 중…':'글 여는 중…';start.setAttribute('aria-busy','true');
  articlePreviewStatus('');
  const controller=new AbortController();articlePreviewOpenController=controller;
  const deadline=setTimeout(()=>controller.abort(),remote?120000:15000);
  const openingOptions={signal:controller.signal,onPresented:()=>{if(articlePreviewActive(generation))articlePreviewClose(false);}};
  const job=articlePreviewUntil(Promise.resolve().then(async()=>{
    // The CTA is the save boundary. A dismissed preparation never reaches here.
    const saved=book.bundledRead
      ? await importLongRead(book.bundledRead,null,{signal:controller.signal,bytes:book.bundledRead.bytes,onProgress:remote?ratio=>{
          if(!articlePreviewActive(generation))return;
          if(ratio>=1){start.textContent='글 여는 중…';return;}
          if(ratio>0)start.textContent=`받는 중… ${Math.max(1,Math.min(99,Math.round(ratio*100)))}%`;
        }:undefined})
      : await commitArticleDraft(book,undefined,{signal:controller.signal});
    if(!saved)throw new Error('Book preparation failed');
    if(controller.signal.aborted||!articlePreviewActive(generation))return;
    await openBook(saved,openingOptions);
    if(!controller.signal.aborted&&saved.social?.scope==='single-post')toast('게시글 1개를 가져왔어요. 답글·연속 글 전체는 포함하지 않아요.');
  }),controller.signal);
  articlePreviewOpening=job;
  try{
    await job;
    if(articlePreviewActive(generation))articlePreviewClose(false);
  }catch{
    if(articlePreviewActive(generation))articlePreviewStatus(remote?'받지 못했어요. 다시 눌러 주세요.':'저장하거나 글을 열지 못했어요. 다시 눌러 주세요.');
    else if(!controller.signal.aborted&&typeof toast==='function')toast('글을 열지 못했어요. 다시 시도해 주세요.');
  }finally{
    clearTimeout(deadline);if(articlePreviewOpenController===controller)articlePreviewOpenController=null;
    if(articlePreviewOpening===job)articlePreviewOpening=null;
    if(articlePreviewActive(generation)){
      articlePreviewPaintPending();
      start.disabled=false;start.textContent=remote?'다시 시도':book.bundledRead?longReadPreviewAction(book.bundledRead):'읽기 시작';start.removeAttribute('aria-busy');
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
articlePreviewRetry.type='button';articlePreviewRetry.className='ap-retry';articlePreviewRetry.textContent='소개 다시 시도';
articlePreviewRetry.hidden=true;articlePreviewRetry.setAttribute('aria-label','한국어 소개 다시 시도');
articlePreviewMetaStatus.append(articlePreviewMetaSpinner,articlePreviewMetaLabel,articlePreviewRetry);
const articlePreviewSummaryCard=document.createElement('section');
articlePreviewSummaryCard.className='ap-summary-card';articlePreviewSummaryCard.setAttribute('aria-label','한국어 소개');
const articlePreviewSummaryHeading=document.createElement('div');articlePreviewSummaryHeading.className='ap-summary-heading';
articlePreviewSummaryHeading.textContent='짧게 살펴보기';
articlePreviewSummaryCard.append(articlePreviewSummaryHeading,articlePreviewMetaStatus,articlePreviewDialog.querySelector('.ap-summary'));
articlePreviewDialog.querySelector('.ap-title').after(articlePreviewSummaryCard);
const articlePreviewDetails=document.createElement('p');
articlePreviewDetails.className='ap-details';articlePreviewDetails.hidden=true;
articlePreviewSummaryCard.after(articlePreviewDetails);
function longReadPreviewAction(read){
  const book=books.find(item=>item.longReadId===read.id);
  if(book&&posOf(book.id).t)return '이어서 읽기';
  return read.remote?'읽기 시작':'읽기';
}
function openLongReadPreviewOrReader(read){
  // Resolve the live library record at tap time; preview alone never starts it.
  const book=books.find(item=>item.longReadId===read.id);
  if(book&&posOf(book.id).t)return openCasualPreviewOrReader(book);
  return openLongReadPreview(read);
}
function openLongReadPreview(read){
  cancelPendingBookOpen();articlePreviewClose();
  const dialog=articlePreviewDialog;
  dialog.dataset.kind='longread';
  articlePreviewBook={id:'preview:'+read.id,kind:'txt',bundledRead:read};
  dialog.querySelector('.ap-art').innerHTML=coverArtwork(read.id);
  dialog.querySelector('.ap-source').textContent=read.author;
  dialog.querySelector('.ap-title').textContent=typeof classicDisplayTitle==='function'?classicDisplayTitle(read):read.title;
  articlePreviewPaint({summaryKo:read.hook});articlePreviewMetadataState('ready');
  articlePreviewDetails.hidden=false;
  articlePreviewDetails.textContent=`${read.edition} · ${read.wordCount.toLocaleString()} words · ${Math.max(1,Math.round(read.wordCount/180))} min (approx.)\n${read.license}`;
  const source=document.createElement('a');
  source.href=read.sourceUrl;source.target='_blank';source.rel='noopener noreferrer';
  source.textContent=`Source acknowledgment: ${read.site}`;
  articlePreviewDetails.append(document.createElement('br'),source);
  const image=/** @type {HTMLImageElement} */(dialog.querySelector('.ap-hero img'));
  if(read.cover){image.src=read.cover;image.hidden=false;image.onerror=()=>{image.hidden=true;};}
  const owned=books.find(book=>book.longReadId===read.id),generation=articlePreviewGeneration;
  if(owned?.cover)void bookImageBlob(owned,owned.cover).then(blob=>{
    if(!blob||!articlePreviewActive(generation))return;
    articlePreviewImageUrl=URL.createObjectURL(blob);
    image.src=articlePreviewImageUrl;image.hidden=false;
  }).catch(()=>{/* The catalog cover or ordinary text fallback remains usable. */});
  const start=/** @type {HTMLButtonElement} */(dialog.querySelector('.ap-start'));
  start.onclick=articlePreviewStart;start.disabled=false;start.textContent=longReadPreviewAction(read);start.removeAttribute('aria-busy');
  articlePreviewStatus('');dialog.querySelector('.ap-scroll').scrollTop=0;
  dialog.showModal();dialog.setAttribute('tabindex','-1');dialog.focus({preventScroll:true});
  if(typeof remoteClassicOffline==='function'&&remoteClassicOffline(read))
    articlePreviewStatus('오프라인이에요. 연결되면 받을 수 있어요.');
}
/* ================= 웹소설 미리보기 =================
   같은 #article-preview 시트를 그대로 씁니다. 따로 띄우는 화면은 없습니다.
   dataset.kind='webnovel' 로 표시하고, 소개·작가 표기·원문 링크를 채운 뒤
   제목·소개 바로 아래에 1화·2화… 회차 목록을 눌러지는 줄로 깝니다. 주소가
   있는 회차(available && url)는 원문을 열고, 아직 없는 회차는 '곧 공개' 로
   표시하고 이동하지 않습니다. 하단 버튼은 1화를 그 같은 경로로 엽니다. */
const articlePreviewChapters=document.createElement('section');
articlePreviewChapters.className='ap-chapters';articlePreviewChapters.hidden=true;
articlePreviewChapters.setAttribute('aria-label','회차 목록');
/* 웹소설의 영어 원제 아래에 두는 한국어 한 줄(읽기 · 소개). 다른 미리보기에서는 숨깁니다. */
const articlePreviewSubtitle=document.createElement('p');
articlePreviewSubtitle.className='ap-subtitle';articlePreviewSubtitle.hidden=true;
articlePreviewDialog.querySelector('.ap-title').after(articlePreviewSubtitle);
articlePreviewSubtitle.after(articlePreviewChapters);
function webNovelPreviewLink(label,url){
  const link=document.createElement('a');
  link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=label;
  return link;
}
function webNovelChapterOne(work){
  const chapters=Array.isArray(work&&work.chapters)?work.chapters:[];
  return chapters.find(chapter=>chapter&&Number(chapter.n)===1)||null;
}
function webNovelChapterBookId(work,chapter){
  return 'webnovel:'+(work&&work.id)+':'+(chapter&&chapter.n);
}
async function openWebNovelChapter(work,chapter){
  // A chapter with bundled text opens in the Reader. A placeholder never navigates.
  if(!(chapter&&chapter.available&&chapter.file)){
    articlePreviewStatus('곧 공개될 회차예요.');
    return;
  }
  const id=webNovelChapterBookId(work,chapter);
  let book=typeof books!=='undefined'&&books.find(item=>item&&item.id===id);
  try{
    if(!book){
      const response=await fetch(chapter.file);
      if(!response.ok) throw new Error('chapter');
      const text=await response.text();
      const paras=parseTXT(text,{preserveParagraphs:true});
      if(!paras.length) throw new Error('empty');
      book={
        id,
        title:typeof webNovelDisplayTitle==='function'?webNovelDisplayTitle(work):(work.koTitle||work.title),
        originalTitle:work.title,
        author:work.credit||work.author||'',
        kind:'txt',
        paras,
        formatting:null,
        sourceMap:null,
        webNovelId:work.id,
        webNovelChapter:chapter.n,
        longReadId:id,
        sourceUrl:work.royalRoadUrl||'',
        site:'Royal Road',
        addedAt:Date.now(),
        textAvailable:true,
        fingerprint:typeof bookContentFingerprint==='function'?bookContentFingerprint(paras):'',
      };
      await bookPut(book);
      books.unshift(book);
      if(typeof applyLongReadCover==='function'&&work.cover) await applyLongReadCover({id,cover:work.cover});
    }
    if(typeof webNovelProgress==='function'&&typeof save==='function'){
      const progress=webNovelProgress();
      progress[work.id]=chapter.n;
      save(WEBNOVEL_PROGRESS_KEY,progress);
    }
    articlePreviewClose();
    if(typeof renderHome==='function') renderHome();
    return openBook(book);
  }catch(error){
    console.error(error);
    articlePreviewStatus('회차를 열지 못했어요.');
  }
}
function renderWebNovelChapters(work){
  const list=articlePreviewChapters;
  list.replaceChildren();
  const chapters=Array.isArray(work.chapters)?work.chapters:[];
  const heading=document.createElement('div');
  heading.className='ap-chapters-heading';
  const label=document.createElement('span');
  label.className='ap-chapters-label';
  label.textContent='회차';
  const all=document.createElement('button');
  all.type='button';
  all.className='ap-chapters-all';
  all.textContent='전체 '+chapters.length+'화 ›';
  all.onclick=()=>{
    const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    list.scrollIntoView({block:'start',behavior:reduce?'auto':'smooth'});
  };
  heading.append(label,all);
  list.append(heading);
  for(const chapter of chapters){
    const row=document.createElement('button');
    row.type='button';
    row.className='ap-chapter-row';
    const available=!!(chapter.available&&(chapter.file||chapter.url));
    if(!available){row.classList.add('is-soon');row.setAttribute('aria-disabled','true');}
    const label=document.createElement('span');
    label.className='ap-chapter-title';
    label.textContent=chapter.title||(chapter.n+'화');
    const state=document.createElement('span');
    state.className='ap-chapter-state';
    state.textContent=available?'읽기':'곧 공개';
    row.append(label,state);
    row.onclick=()=>openWebNovelChapter(work,chapter);
    list.append(row);
  }
  list.hidden=!chapters.length;
}
function openWebNovelPreview(work){
  cancelPendingBookOpen();articlePreviewClose();
  const dialog=articlePreviewDialog;
  dialog.dataset.kind='webnovel';
  articlePreviewBook={id:'webnovel:'+work.id,kind:'webnovel',webNovel:work};
  dialog.querySelector('.ap-art').innerHTML=coverArtwork(work.id);
  dialog.querySelector('.ap-source').textContent=work.credit||work.author||'';
  dialog.querySelector('.ap-title').textContent=typeof webNovelDisplayTitle==='function'?webNovelDisplayTitle(work):work.title;
  const english=typeof webNovelEnglishTitle==='function'?webNovelEnglishTitle(work):'';
  articlePreviewSubtitle.textContent=english;
  articlePreviewSubtitle.hidden=!english;
  articlePreviewPaint({summaryKo:work.intro||''});articlePreviewMetadataState('ready');
  // Intro + author credit + original links. Royal Road for all; Kindle ONLY
  // when the work carries a kindleUrl (Chasing Sunlight).
  articlePreviewDetails.hidden=false;
  articlePreviewDetails.replaceChildren();
  const credit=document.createElement('div');
  credit.textContent=(work.credit||work.author||'')+' · 작가 공개 무료 연재';
  articlePreviewDetails.append(credit);
  const links=document.createElement('div');links.className='ap-links';
  if(work.royalRoadUrl)links.append(webNovelPreviewLink('원문 보기 · Royal Road',work.royalRoadUrl));
  if(work.kindleUrl)links.append(webNovelPreviewLink('Amazon Kindle',work.kindleUrl));
  articlePreviewSubtitle.after(links);
  renderWebNovelChapters(work);
  const image=/** @type {HTMLImageElement} */(dialog.querySelector('.ap-hero img'));
  if(work.cover){image.src=work.cover;image.hidden=false;image.onerror=()=>{image.hidden=true;};}
  else{image.hidden=true;image.removeAttribute('src');}
  // Same entry as the chapter-1 row. The top X still closes the sheet.
  // An unavailable chapter keeps this button enabled and shows the row's status.
  const start=/** @type {HTMLButtonElement} */(dialog.querySelector('.ap-start'));
  start.onclick=()=>openWebNovelChapter(work,webNovelChapterOne(work));
  start.disabled=false;start.textContent='1화 보기';start.removeAttribute('aria-busy');
  articlePreviewStatus('');dialog.querySelector('.ap-scroll').scrollTop=0;
  dialog.showModal();dialog.setAttribute('tabindex','-1');dialog.focus({preventScroll:true});
}
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
