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
function remoteClassicSources(value){
  if(!Array.isArray(value))return undefined;
  const sources=value.slice(0,8).map(item=>{
    if(!item||typeof item!=='object')return null;
    const title=remoteClassicText(item.title,200);
    const url=remoteClassicUrl(item.url);
    return title&&url?{title,url}:null;
  }).filter(Boolean);
  return sources.length?sources:undefined;
}
function remoteClassicAnchor(value,max){
  const text=String(value||'').replace(/\s+/g,' ').trim();
  if(!text||text.length>max)return '';
  return text;
}
const REMOTE_SECTION_ROLES=new Set(['title','subtitle','dedication','signature','contents-heading','contents','chapter','section','end','scene','verse','label','inscription']);
function remoteClassicSections(value){
  if(!Array.isArray(value))return undefined;
  const sections=[];
  for(const item of value){
    if(sections.length>=200)break;
    if(!item||typeof item!=='object')continue;
    const paragraph=Number(item.paragraph);
    const text=remoteClassicAnchor(item.text,500);
    const named=String(item.role||'').trim();
    const role=named==='heading'?'section':named;
    if(!Number.isInteger(paragraph)||paragraph<0||paragraph>100000||!text||!REMOTE_SECTION_ROLES.has(role))continue;
    sections.push({paragraph,text,role});
  }
  return sections.length?sections:undefined;
}
function remoteClassicIllustrations(value){
  if(!Array.isArray(value))return undefined;
  const seen=new Set(),images=[];
  for(const item of value){
    if(images.length>=30)break;
    if(!item||typeof item!=='object')continue;
    const id=remoteClassicText(item.id,80);
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)||seen.has(id))continue;
    const before=remoteClassicAnchor(item.before,500);
    const after=remoteClassicAnchor(item.after,500);
    const paragraph=Number(item.paragraph);
    const file=remoteClassicUrl(item.file);
    const alt=remoteClassicText(item.alt,300);
    const width=Number(item.width),height=Number(item.height);
    if(!before||!after||!file||!alt)continue;
    if(!Number.isInteger(paragraph)||paragraph<1||paragraph>100000)continue;
    if(!Number.isInteger(width)||width<1||width>8000)continue;
    if(!Number.isInteger(height)||height<1||height>8000)continue;
    seen.add(id);
    images.push({id,before,after,paragraph,file,alt,width,height});
  }
  return images.length?images:undefined;
}
function bundledLongRead(id){
  return typeof LONG_READS!=='undefined'&&LONG_READS.find(read=>read.id===id)||null;
}
function remoteClassicEntry(raw){
  if(!raw||typeof raw!=='object')return null;
  const id=remoteClassicText(raw.id,80);
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))return null;
  const bundled=bundledLongRead(id);
  if(bundled&&!bundled.dormant)return null;
  if(typeof CLASSICS!=='undefined'&&CLASSICS.some(classic=>classic.id===id))return null;
  const title=remoteClassicText(raw.title,200);
  const author=remoteClassicText(raw.author,200);
  const content=remoteClassicUrl(raw.content||raw.contentUrl||raw.file);
  const version=String(raw.contentVersion||raw.sha256||'').replace(/^sha256:/i,'').trim().toLowerCase();
  if(!title||!author||!content||!/^[a-f0-9]{64}$/.test(version))return null;
  /* A dormant bundled id is offered again from the copy already in the app.
     Remote text is not substituted, so its scenes, lookups and saved copies
     stay on the bundled paragraphs. content/contentVersion keep the cache
     entry parsable on the next launch. */
  if(bundled&&bundled.dormant){
    return {...bundled,dormant:false,surfacedDormant:true,remote:false,content,contentVersion:version};
  }
  const bytes=Number(raw.bytes??raw.size);
  const words=Number(raw.wordCount);
  const sources=remoteClassicSources(raw.sources);
  const illustrations=remoteClassicIllustrations(raw.illustrations);
  const sections=remoteClassicSections(raw.sections||raw.headings);
  const style=raw.style==='holmes'||id.startsWith('sherlock-holmes-')?'holmes':'';
  return {
    id, remote:true, title, author, file:content, sha256:version, contentVersion:version,
    cover:remoteClassicUrl(raw.cover||raw.coverUrl),
    coverPosition:remoteClassicText(raw.coverPosition,40)||'center top',
    bytes:Number.isFinite(bytes)&&bytes>=0?Math.round(bytes):0,
    wordCount:Number.isFinite(words)&&words>0?Math.round(words):0,
    sourceUrl:remoteClassicUrl(raw.sourceUrl),
    site:remoteClassicText(raw.site,80),
    license:remoteClassicText(raw.license,120),
    licenseUrl:remoteClassicUrl(raw.licenseUrl),
    originalTitle:remoteClassicText(raw.originalTitle,200)||title,
    koTitle:remoteClassicText(raw.koTitle,200)||title,
    series:remoteClassicText(raw.series,80)||'FREE CLASSIC',
    hook:remoteClassicText(raw.hook,400),
    edition:remoteClassicText(raw.edition,120)||'Project Gutenberg text',
    editionNote:remoteClassicText(raw.editionNote,800),
    glossary:remoteClassicText(raw.glossary,400),
    ...(raw.presentation==='story'?{presentation:'story'}:{}),
    ...(sources?{sources}:{}),
    ...(illustrations?{illustrations}:{}),
    ...(sections?{sections}:{}),
    ...(style?{style}:{}),
    ...(raw.sourceTitle===true?{sourceTitle:true}:{}),
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
let remoteClassicsRefreshing=null;
function refreshRemoteClassics(){
  if(remoteClassicsRefreshing)return remoteClassicsRefreshing;
  const pending=(async()=>{
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
  })();
  const refreshing=pending.finally(()=>{if(remoteClassicsRefreshing===refreshing)remoteClassicsRefreshing=null;});
  remoteClassicsRefreshing=refreshing;
  return refreshing;
}
if(typeof window!=='undefined'&&window.addEventListener){
  const repaint=()=>{if(typeof renderAllBookViews==='function')renderAllBookViews();};
  window.addEventListener('online',repaint);
  window.addEventListener('offline',repaint);
}
