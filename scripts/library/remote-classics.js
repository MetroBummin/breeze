/* Remote classics are a public catalog, not another bundled book. A failed
   fetch keeps the last good manifest. No cache means the bundled shelf only. */
const REMOTE_CLASSICS_CACHE='breeze.remote-classics';
const REMOTE_CLASSICS_URL='https://hrtfhojbhqvaoiulspto.supabase.co/storage/v1/object/public/classics/catalog.json';
let remoteClassicCatalog=[];

function remoteClassicsCatalogUrl(){
  const configured=typeof window!=='undefined'&&window.BREEZE_CONFIG&&window.BREEZE_CONFIG.CLASSICS_CATALOG_URL;
  if(configured==='')return '';
  if(typeof configured==='string')return configured;
  return REMOTE_CLASSICS_URL;
}
function remoteClassicUrl(value){
  try{
    const url=new URL(String(value||''));
    if(url.protocol!=='https:'||url.username||url.password||url.href.length>2048)return '';
    return url.href;
  }catch{return '';}
}
function remoteClassicText(value,max){
  const text=String(value||'').replace(/\s+/g,' ').trim();
  return text?text.slice(0,max):'';
}
function remoteClassicEntry(raw){
  if(!raw||typeof raw!=='object')return null;
  const id=remoteClassicText(raw.id,80);
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))return null;
  if(typeof LONG_READS!=='undefined'&&LONG_READS.some(read=>read.id===id))return null;
  if(typeof CLASSICS!=='undefined'&&CLASSICS.some(classic=>classic.id===id))return null;
  const title=remoteClassicText(raw.title,200);
  const author=remoteClassicText(raw.author,200);
  const content=remoteClassicUrl(raw.content||raw.contentUrl||raw.file);
  const version=String(raw.contentVersion||raw.sha256||'').replace(/^sha256:/i,'').trim().toLowerCase();
  if(!title||!author||!content||!/^[a-f0-9]{64}$/.test(version))return null;
  const bytes=Number(raw.bytes??raw.size);
  const words=Number(raw.wordCount);
  return {
    id, remote:true, title, author, file:content, sha256:version, contentVersion:version,
    cover:remoteClassicUrl(raw.cover||raw.coverUrl), coverPosition:'center top',
    bytes:Number.isFinite(bytes)&&bytes>=0?Math.round(bytes):0,
    wordCount:Number.isFinite(words)&&words>0?Math.round(words):0,
    sourceUrl:remoteClassicUrl(raw.sourceUrl),
    site:remoteClassicText(raw.site,80),
    license:remoteClassicText(raw.license,120),
    licenseUrl:remoteClassicUrl(raw.licenseUrl),
    originalTitle:remoteClassicText(raw.originalTitle,200)||title,
    series:remoteClassicText(raw.series,80)||'FREE CLASSIC',
    hook:remoteClassicText(raw.hook,400),
    edition:remoteClassicText(raw.edition,120)||'Project Gutenberg text',
    editionNote:remoteClassicText(raw.editionNote,800),
  };
}
function remoteClassicEntries(manifest){
  const list=manifest&&Array.isArray(manifest.books)?manifest.books:[];
  const seen=new Set(),out=[];
  for(const raw of list){
    const entry=remoteClassicEntry(raw);
    if(!entry||seen.has(entry.id))continue;
    seen.add(entry.id);
    out.push(entry);
    if(out.length>=500)break;
  }
  return out;
}
function remoteClassicHeaders(){
  const key=typeof SB_KEY==='string'?SB_KEY:'';
  return key?{apikey:key,Authorization:'Bearer '+key}:{};
}
function rememberRemoteClassics(entries){
  remoteClassicCatalog=entries;
  if(typeof save==='function')save(REMOTE_CLASSICS_CACHE,{at:Date.now(),books:entries});
}
function remoteClassicCatalogReads(){
  return remoteClassicCatalog.slice();
}
function remoteClassicOwned(read){
  return typeof books!=='undefined'&&!!books.some(book=>book.longReadId===read.id);
}
function remoteClassicOffline(read){
  return !!(read&&read.remote&&!remoteClassicOwned(read)&&typeof navigator!=='undefined'&&navigator.onLine===false);
}
function remoteClassicOffers(){
  return remoteClassicCatalog.filter(read=>!remoteClassicOwned(read));
}
function loadCachedRemoteClassics(){
  if(typeof load!=='function')return [];
  const cached=load(REMOTE_CLASSICS_CACHE,null);
  if(!cached||!Array.isArray(cached.books))return [];
  return remoteClassicEntries({books:cached.books});
}
async function refreshRemoteClassics(){
  remoteClassicCatalog=loadCachedRemoteClassics();
  if(remoteClassicCatalog.length&&typeof renderAllBookViews==='function')renderAllBookViews();
  const url=remoteClassicsCatalogUrl();
  if(!url)return remoteClassicCatalog;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetch(url,{cache:'no-cache',headers:remoteClassicHeaders(),signal:controller.signal});
    if(!response.ok)throw new Error('HTTP '+response.status);
    const manifest=await response.json();
    const entries=remoteClassicEntries(manifest);
    if(!entries.length&&!(manifest&&Array.isArray(manifest.books)&&manifest.books.length===0))throw new Error('Remote catalog is empty');
    rememberRemoteClassics(entries);
    if(typeof renderAllBookViews==='function')renderAllBookViews();
  }catch(error){
    console.warn('원격 고전 목록을 받지 못했습니다:',error&&error.message);
  }finally{
    clearTimeout(timer);
  }
  return remoteClassicCatalog;
}
if(typeof window!=='undefined'&&window.addEventListener){
  const repaint=()=>{if(typeof renderAllBookViews==='function')renderAllBookViews();};
  window.addEventListener('online',repaint);
  window.addEventListener('offline',repaint);
}
