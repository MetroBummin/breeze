/* ================= Discover RSS =================
   RSS는 글을 보관하는 새 저장소가 아닙니다. 목록을 잠깐 보여 주고, 고른 한 편만
   기존 URL 반입기로 넘깁니다. 그래서 오프라인·사전·단어장 흐름은 기사 URL과
   완전히 같고, 카드 사진은 서버/IndexedDB에 쌓지 않습니다. 공개 기본 피드만
   제한된 로컬 캐시를 사용하며, 사용자 지정 피드는 메모리에만 남습니다. */

const RSS_FEEDS = [
  { name:'Dexerto · Entertainment', url:'https://www.dexerto.com/feed/category/entertainment/', category:'entertainment' },
  { name:'The Conversation', url:'https://theconversation.com/global/articles.atom', category:'general' },
  { name:'TMZ', url:'https://www.tmz.com/rss.xml', category:'entertainment' },
  { name:'The Daily Dot', url:'https://dailydot.com/feed', category:'entertainment' },
  { name:'ProPublica', url:'https://www.propublica.org/feeds/propublica/main', category:'society' },
  { name:'NASA', url:'https://www.nasa.gov/technology/feed/', category:'science' },
  { name:'Bloody Disgusting', url:'https://bloody-disgusting.com/feed/', category:'entertainment' },
  { name:'WIRED', url:'https://www.wired.com/feed/rss', category:'general' },
  { name:'All That’s Interesting', url:'https://allthatsinteresting.com/feed', category:'entertainment' },
  { name:'Medium · Technology', url:'https://medium.com/feed/tag/technology', category:'science' },
  { name:'Reddit · r/science', url:'https://www.reddit.com/r/science/.rss', category:'science' },
  { name:'Medium · Culture', url:'https://medium.com/feed/tag/culture', category:'culture' },
  { name:'Medium · Business', url:'https://medium.com/feed/tag/business', category:'business' },
];
const RSS_CATEGORIES = [
  {id:'entertainment',label:'엔터테인먼트'}, {id:'general',label:'종합'}, {id:'society',label:'시사·사회'},
  {id:'science',label:'과학·기술'}, {id:'culture',label:'문화·생활'},
  {id:'business',label:'경제·비즈니스'},
];
function rssCategory(value){return RSS_CATEGORIES.some(item=>item.id===value) ? value : 'general';}
function refreshFeedRails(){
  const home=document.getElementById('casual-rail');delete home.dataset.rssStamp;
  renderHome();
}
const RSS_PER_FEED = 3;
const RSS_SOURCE_LIMIT = 20;
const RSS_CACHE_MS = 10 * 60 * 1000;
const RSS_PHOTO_MS = 4000;
const RSS_PUBLIC_CACHE_KEY='breeze.rss-public.v1';
const RSS_PUBLIC_CACHE_BYTES=1000000;
const RSS_PUBLIC_FEED_BYTES=64000;
const RSS_PUBLIC_STALE_MS=86400000;
const RSS_CATALOG_CACHE_KEY='breeze.rss-catalog.v1';
const RSS_CATALOG_BYTES=200000;
const RSS_CATALOG_CACHE_BYTES=250000;
let rssCatalogCache=null;
function rssCatalogEnabled(){return window.BREEZE_CONFIG?.RSS_CATALOG===true;}
const rssListeners = new Set();
let rssCands = [];
let rssLoadedAt = 0;
let rssLoading = null;
let rssLoadedOffline=false;
let rssPublicCache=null;
const rssPublicFeedJobs = new Map();
const rssPreparedArticles = new Map();
const rssRenderIds = new WeakMap();
let rssPage = 0;
const RSS_COVER_CACHE_KEY='breeze.rss-cover-metadata.v2';
const RSS_COVER_CACHE_BYTES=64000;
const RSS_COVER_CACHE_LIMIT=100;
const RSS_COVER_TTL_MS=86400000;
const RSS_COVER_EMPTY_MS=1800000;
const RSS_COVER_LOOKUPS=2;
const RSS_COVER_PREFIX_BYTES=128*1024;
let rssCoverCache=null;
let rssCoverPass=0;
let rssCoverRemaining=RSS_COVER_LOOKUPS;
let rssCoverTail=Promise.resolve();
const rssCoverJobs=new Map();
const rssCoverOwners=new WeakMap();
const rssCoverActiveOwners=new Set();
const rssCardCoverWork=new WeakMap();

// Automatic lookups accept public DNS names, never credentials, local names or
// IP literals. The existing relay additionally validates/pins public DNS.
function rssCoverPublicUrl(raw){
  if(typeof raw!=='string'||raw.length>4096)return '';
  try{
    const url=new URL(raw),host=url.hostname;
    if(!/^https?:$/.test(url.protocol)||url.username||url.password||url.port&&url.port!==(url.protocol==='https:'?'443':'80')
      ||!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(host)
      ||/(^|\.)(localhost|local|internal|home|lan|onion)$/i.test(host)
      ||[...url.searchParams.keys()].some(key=>/^(?:token|access_token|api_?key|auth|authorization|secret|password|session|jwt|signature|sig|AWSAccessKeyId|GoogleAccessId|(?:x-amz|x-goog)-(?:credential|signature|security-token))$/i.test(key)))return '';
    url.hash='';return url.href;
  }catch{return '';}
}
function rssCoverCached(url){
  if(!rssCoverCache){
    rssCoverCache=Object.create(null);
    try{
      const current=localStorage.getItem(RSS_COVER_CACHE_KEY);
      const raw=current||localStorage.getItem('breeze.rss-cover-metadata.v1');
      if(raw&&raw.length<=RSS_COVER_CACHE_BYTES){
        const parsed=JSON.parse(raw);
        if(rssCacheBytes(parsed)<=RSS_COVER_CACHE_BYTES){
          for(const [key,record] of Object.entries(parsed).slice(0,RSS_COVER_CACHE_LIMIT)){
            if(rssCoverPublicUrl(key)!==key||!record||typeof record.photo!=='string'
              ||record.photo&&rssCoverPublicUrl(record.photo)!==record.photo)continue;
            // v1 stored retrieval failures/truncated prefixes as photo absence.
            // Keep its successful photos; only v2 negatives have that provenance.
            if(!current&&!record.photo)continue;
            const age=Date.now()-record.at;
            if(Number.isFinite(record.at)&&age>=0&&age<(record.photo?RSS_COVER_TTL_MS:RSS_COVER_EMPTY_MS))
              rssCoverCache[key]={at:record.at,photo:record.photo};
          }
        }
      }
    }catch{/* Denied or corrupt storage cannot block discovery. */}
  }
  const record=rssCoverCache[url],age=record?Date.now()-record.at:Infinity;
  if(record&&(age<0||age>=(record.photo?RSS_COVER_TTL_MS:RSS_COVER_EMPTY_MS)))delete rssCoverCache[url];
  return rssCoverCache[url]||null;
}
function rssCoverStore(url,photo){
  if(!rssCoverPublicUrl(url)||photo&&!rssCoverPublicUrl(photo))return;
  rssCoverCached(url);rssCoverCache[url]={at:Date.now(),photo};
  const oldest=Object.keys(rssCoverCache).sort((a,b)=>rssCoverCache[a].at-rssCoverCache[b].at);
  while(oldest.length>RSS_COVER_CACHE_LIMIT||rssCacheBytes(rssCoverCache)>RSS_COVER_CACHE_BYTES)
    delete rssCoverCache[oldest.shift()];
  try{localStorage.setItem(RSS_COVER_CACHE_KEY,JSON.stringify(rssCoverCache));}catch{/* Reuse in memory. */}
}
function rssCoverEligible(entry){
  return !entry.photo&&!entry.kind&&!entry.readUrl&&RSS_FEEDS.some(feed=>feed.url===entry.feedSourceUrl)
    &&!!rssCoverPublicUrl(entry.url)&&(typeof window==='undefined'||!rssCatalogEnabled());
}
function rssCoverHydrate(entry){
  if(rssCoverEligible(entry)){
    const record=rssCoverCached(rssCoverPublicUrl(entry.url));
    if(record?.photo){entry.photo=record.photo;entry.coverFallback=false;}
  }
  return entry;
}
// Decode only a top-level relay {url,html} string prefix. Appending a closing
// quote after trimming a dangling JSON escape preserves quotes/Unicode safely.
function rssCoverPayloadPrefix(text){
  let i=0,url='';
  const space=()=>{while(/\s/.test(text[i]||'')&&i<text.length)i++;};
  const string=partial=>{
    if(text[i]!=='"')return null;
    const start=i++;let escaped=false;
    while(i<text.length){const char=text[i++];if(escaped){escaped=false;continue;}
      if(char==='\\'){escaped=true;continue;}if(char==='"')return JSON.parse(text.slice(start,i));}
    if(!partial)return null;
    for(let trim=0;trim<=6&&i-trim>start;trim++){
      try{return JSON.parse(text.slice(start,i-trim)+'"');}catch{/* Incomplete escape at the stream boundary. */}
    }
    return null;
  };
  try{
    space();if(text[i++]!=='{')return null;
    while(i<text.length){
      space();const key=string(false);if(key===null)return null;
      space();if(text[i++]!==':')return null;space();
      const value=string(key==='html');if(value===null)return null;
      if(key==='url')url=value;
      if(key==='html')return {url,html:value};
      space();if(text[i++]!==',')return null;
    }
  }catch{/* Unexpected response shape is not article metadata. */}
  return null;
}
function rssCoverPhoto(html,base,complete=true){
  const origin=rssCoverPublicUrl(base);if(!origin)return '';
  // Ignore a partial final tag; HTML stays in an inert document, never the UI.
  const end=html.lastIndexOf('>');if(end<0)return '';
  const doc=new DOMParser().parseFromString(html.slice(0,end+1),'text/html');
  doc.querySelectorAll('script,style,noscript,template').forEach(node=>node.remove());
  const attribute=(node,name)=>[...node.attributes].find(item=>item.name.toLowerCase()===name)?.value??null;
  const declared=[...doc.querySelectorAll('base')].find(node=>attribute(node,'href')!==null);
  const resolvedBase=declared?rssCoverPublicUrl(articleAbsolute(attribute(declared,'href').trim()||origin,origin)):complete?origin:'';
  let ambiguousBase=false;
  const photoFor=raw=>{
    if(!String(raw||'').trim())return '';
    if(!resolvedBase){try{new URL(raw);}catch{ambiguousBase=true;return '';}}
    const photo=rssCoverPublicUrl(articleAbsolute(raw,resolvedBase||undefined));
    return ARTICLE_IMG_BAD.test(photo)?'':photo;
  };
  const metas=[...doc.querySelectorAll('meta')];
  for(const name of ['og:image','og:image:url','twitter:image','twitter:image:src']){
    for(const node of metas.filter(node=>(attribute(node,'property')||attribute(node,'name')||'').trim().toLowerCase()===name)){
      const photo=photoFor(attribute(node,'content'));if(photo)return photo;
      // A later first <base> can change relative metadata in a streamed head.
      if(ambiguousBase&&!complete&&!declared)return '';
    }
  }
  if(!/"isAccessibleForFree"\s*:\s*(?:false|"false")/i.test(html))for(const image of doc.querySelectorAll('img')){
    const attributes={getAttribute:name=>attribute(image,name)};
    if(articleTooSmall(attributes))continue;
    const photo=photoFor(articleBestSrc(attributes));if(photo)return photo;
    if(ambiguousBase&&!complete&&!declared)return '';
  }
  if(ambiguousBase&&(complete||declared))throw Error('cover_base_unsafe');
  return '';
}
async function rssCoverFetch(url,signal){
  const endpoint=articleProxyUrl(url);if(!endpoint)return null;
  const response=await fetch(endpoint,{credentials:'omit',signal,
    headers:{Authorization:'Bearer '+SB_KEY,apikey:SB_KEY}});
  if(!response.ok||!response.body||!/application\/json/i.test(response.headers.get('content-type')||'')){
    await response.body?.cancel().catch(()=>{});
    return null;
  }
  const reader=response.body.getReader(),decoder=new TextDecoder();let text='',retainedBytes=0,complete=false;
  try{
    while(retainedBytes<RSS_COVER_PREFIX_BYTES){
      const {done,value}=await reader.read();if(done){complete=true;break;}
      const prefix=value.subarray(0,RSS_COVER_PREFIX_BYTES-retainedBytes);
      retainedBytes+=prefix.byteLength;text+=decoder.decode(prefix,{stream:true});
      const payload=rssCoverPayloadPrefix(text);
      const photo=payload&&rssCoverPhoto(payload.html,rssCoverPublicUrl(payload.url)||url,false);
      if(photo)return {photo};
    }
    text+=decoder.decode();
    // A bounded prefix with no photo is unknown, not a successful no-image page.
    if(!complete)return null;
    try{
      const payload=JSON.parse(text);
      return typeof payload?.html==='string'
        ?{photo:rssCoverPhoto(payload.html,rssCoverPublicUrl(payload.url)||url)}:null;
    }catch{return null;}
  }finally{await reader.cancel().catch(()=>{});}
  // This bounds retained client parsing, not upstream or billed bytes. The
  // existing relay reads the entire page (up to its 3 MB cap) before responding.
}
function rssCoverVisible(owner,card){
  if(owner.cancelled||owner.pass!==rssCoverPass||!owner.rail.isConnected||!card.isConnected
    ||typeof card.getBoundingClientRect!=='function'||document.visibilityState==='hidden')return false;
  const rect=card.getBoundingClientRect(),rail=owner.rail.getBoundingClientRect();
  const width=Math.min(rect.right,rail.right,window.innerWidth)-Math.max(rect.left,rail.left,0);
  const height=Math.min(rect.bottom,rail.bottom,window.innerHeight)-Math.max(rect.top,rail.top,0);
  return rect.width>0&&rect.height>0&&width>0&&height>0&&width*height>=rect.width*rect.height*.1;
}
function rssCoverCurrent(consumer){
  const {owner,card,entry}=consumer;
  return rssCoverVisible(owner,card)&&owner.entries.get(card)===entry&&card.dataset.rssUrl===entry.url
    &&rssCands.some(group=>group.includes(entry))&&rssCoverEligible(entry);
}
function rssCoverRelease(consumer){
  if(consumer&&rssCardCoverWork.get(consumer.card)===consumer){
    rssCardCoverWork.delete(consumer.card);consumer.card.classList.remove('rss-cover-pending');
  }
  const job=consumer?.job;if(!job)return;
  job.consumers.delete(consumer);
  if(![...job.consumers].some(rssCoverCurrent))job.controller.abort();
}
function rssCoverLookup(url,consumer){
  let job=rssCoverJobs.get(url);
  if(job?.controller.signal.aborted)job=null;
  if(!job){
    job={controller:new AbortController(),consumers:new Set(),promise:null};
    const currentJob=job;rssCoverJobs.set(url,job);
    job.promise=rssCoverTail.catch(()=>{}).then(async()=>{
      if(![...currentJob.consumers].some(rssCoverCurrent))return null;
      const cached=rssCoverCached(url);if(cached)return cached;
      const timeout=setTimeout(()=>currentJob.controller.abort(),15000);
      try{
        const result=await rssCoverFetch(url,currentJob.controller.signal);
        if(result&&!currentJob.controller.signal.aborted&&[...currentJob.consumers].some(rssCoverCurrent))
          rssCoverStore(url,result.photo);
        return currentJob.controller.signal.aborted?null:result;
      }catch{return null;}finally{clearTimeout(timeout);}
    }).finally(()=>{if(rssCoverJobs.get(url)===currentJob)rssCoverJobs.delete(url);});
    rssCoverTail=job.promise;
  }
  consumer.job=job;job.consumers.add(consumer);return job.promise;
}
function rssCoverCancel(owner,keepPhotos=false){
  if(!owner||owner.cancelled)return;
  owner.cancelled=true;rssCoverRelease(owner.consumer);owner.observer?.disconnect();
  if(!keepPhotos)owner.entries.forEach((_entry,card)=>rssCardCoverWork.get(card)?.cancel?.());
  cancelAnimationFrame(owner.frame);
  owner.rail.removeEventListener?.('scroll',owner.changed);
  window.removeEventListener?.('scroll',owner.changed,true);window.removeEventListener?.('resize',owner.changed);
  document.removeEventListener?.('visibilitychange',owner.changed);window.removeEventListener?.('pagehide',owner.hidden);
  rssCoverActiveOwners.delete(owner);
}
function rssCoverAdvance(){
  rssCoverPass++;rssCoverRemaining=RSS_COVER_LOOKUPS;
  // Refresh retains the existing card/image; replacement or view exit cancels it.
  rssCoverActiveOwners.forEach(owner=>rssCoverCancel(owner,true));
}
function rssCoverBegin(rail){
  let owner=rssCoverOwners.get(rail);
  if(owner&&!owner.cancelled&&owner.pass===rssCoverPass)return owner;
  rssCoverCancel(owner);
  owner={rail,pass:rssCoverPass,remaining:RSS_COVER_LOOKUPS,entries:new Map(),attempted:new Set(),cancelled:false,running:false,consumer:null,frame:0,observer:null,changed:null,hidden:null};
  owner.changed=()=>{
    if(owner.cancelled||owner.pass!==rssCoverPass)return;
    if(owner.consumer&&!rssCoverCurrent(owner.consumer))rssCoverRelease(owner.consumer);
    if(rail.getClientRects?.().length===0||document.visibilityState==='hidden')
      owner.entries.forEach((_entry,card)=>rssCardCoverWork.get(card)?.cancel?.());
    else owner.entries.forEach((entry,card)=>{
      if(card.isConnected&&entry?.photo&&!card.dataset.photoStarted){
        card.dataset.photoStarted='true';void rssCardPhoto(card,entry);
      }
    });
    if(!owner.frame&&!owner.cancelled)owner.frame=requestAnimationFrame(()=>{owner.frame=0;void rssCoverPump(owner);});
  };
  owner.hidden=()=>rssCoverCancel(owner);
  if(typeof IntersectionObserver==='function')owner.observer=new IntersectionObserver(owner.changed);
  rail.addEventListener?.('scroll',owner.changed);
  window.addEventListener?.('scroll',owner.changed,true);window.addEventListener?.('resize',owner.changed);
  document.addEventListener?.('visibilitychange',owner.changed);window.addEventListener?.('pagehide',owner.hidden);
  rssCoverOwners.set(rail,owner);rssCoverActiveOwners.add(owner);return owner;
}
function rssCoverWatch(owner,cards,entries){
  if(!owner||owner.cancelled||owner.pass!==rssCoverPass)return;
  owner.observer?.disconnect();
  owner.entries=new Map(cards.map(card=>[card,entries.find(entry=>entry.url===card.dataset.rssUrl)]));
  owner.entries.forEach((entry,card)=>rssCardEntries.set(card,entry));
  cards.forEach(card=>owner.observer?.observe(card));owner.changed();
}
async function rssCoverPump(owner){
  if(owner.running||owner.cancelled||!rssOnline())return;
  owner.running=true;
  try{
    while(owner.remaining>0&&rssCoverRemaining>0&&!owner.cancelled){
      const pair=[...owner.entries].find(([card,entry])=>entry&&rssCoverEligible(entry)
        &&!owner.attempted.has(entry.url)&&!rssCoverCached(rssCoverPublicUrl(entry.url))&&rssCoverVisible(owner,card));
      if(!pair)break;
      const [card,entry]=pair,consumer={owner,card,entry,job:null};
      owner.attempted.add(entry.url);owner.remaining--;owner.consumer=consumer;
      const url=rssCoverPublicUrl(entry.url),existing=rssCoverJobs.get(url);
      if(!existing||existing.controller.signal.aborted)rssCoverRemaining--;
      rssCardCoverWork.set(card,consumer);card.classList.add('rss-cover-pending');
      const result=await rssCoverLookup(url,consumer);
      if(result?.photo&&rssCoverCurrent(consumer)){
        entry.photo=result.photo;entry.coverFallback=false;rssCardIdentities.set(card,rssCardIdentity(entry));
        card.dataset.photoStarted='true';void rssCardPhoto(card,entry);
      }
      rssCoverRelease(consumer);if(owner.consumer===consumer)owner.consumer=null;
    }
  }finally{owner.running=false;}
}

function rssOnline(){return typeof navigator==='undefined'||navigator.onLine!==false;}
function rssCacheBytes(value){
  const text=JSON.stringify(value);
  // The fallback is a conservative UTF-8 upper bound, including surrogate pairs.
  return typeof TextEncoder==='function'?new TextEncoder().encode(text).length:text.length*3;
}
function rssCacheEntry(entry){
  if(!entry||typeof entry!=='object'||Array.isArray(entry))return null;
  const fields=['source','category','title','url','author','publishedAt','kind','readUrl',
    'feedUrl','feedSourceUrl','summary','photo','date'];
  const value=Object.fromEntries(fields.map(key=>[key,typeof entry[key]==='string'?entry[key]:'']));
  if(!value.title||value.title.length>1000||!normalizeArticleUrl(value.url)
    ||[value.url,value.readUrl,value.photo,value.feedUrl,value.feedSourceUrl].some(url=>url.length>4096))return null;
  for(const raw of [value.url,value.readUrl,value.photo,value.feedUrl,value.feedSourceUrl].filter(Boolean)){
    try{const url=new URL(raw);if(!/^https?:$/.test(url.protocol)||url.username||url.password
      ||[...url.searchParams.keys()].some(key=>/^(?:token|access_token|api_?key|auth|authorization|secret|password|session|jwt|signature|sig)$/i.test(key)))return null;}
    catch{return null;}
  }
  value.author=value.author.slice(0,512);value.summary=value.summary.slice(0,280);
  value.publishedAt=value.publishedAt.slice(0,100);value.date=value.date.slice(0,100);
  value.source=value.source.slice(0,256);value.category=rssCategory(value.category);
  value.kind=['x','reddit'].includes(value.kind)?value.kind:'';
  return {...value,contentHtml:'',bodyProvided:false,discoveryFiltered:true};
}
function rssPublicCacheEntries(){
  if(rssPublicCache)return rssPublicCache;
  rssPublicCache={};
  try{
    const raw=localStorage.getItem(RSS_PUBLIC_CACHE_KEY);
    if(!raw||raw.length>RSS_PUBLIC_CACHE_BYTES)return rssPublicCache;
    const stored=JSON.parse(raw),now=Date.now();
    if(rssCacheBytes(stored)>RSS_PUBLIC_CACHE_BYTES)return rssPublicCache;
    for(const feed of RSS_FEEDS){
      const record=stored?.[feed.url];
      if(!record||!Number.isFinite(record.at)||record.at>now||now-record.at>RSS_PUBLIC_STALE_MS
        ||!Array.isArray(record.entries)||record.entries.length>100)continue;
      const entries=record.entries.map(rssCacheEntry);
      if(entries.some(entry=>!entry)||rssCacheBytes({at:record.at,entries})>RSS_PUBLIC_FEED_BYTES)continue;
      rssPublicCache[feed.url]={at:record.at,entries};
    }
  }catch{/* Cache corruption or denied storage cannot block public discovery. */}
  return rssPublicCache;
}
function rssStorePublicFeed(feed,entries,at){
  // Never persist custom sources, arbitrary article fetches or authenticated data.
  if(!RSS_FEEDS.some(source=>source.url===feed.url))return;
  const kept=[];
  for(const entry of entries.slice(0,100)){
    let value=rssCacheEntry(entry);if(!value)continue;
    if(rssCacheBytes({at,entries:[...kept,value]})>RSS_PUBLIC_FEED_BYTES){
      value={...value,contentHtml:'',bodyProvided:false};
      if(rssCacheBytes({at,entries:[...kept,value]})>RSS_PUBLIC_FEED_BYTES)break;
    }
    kept.push(value);
  }
  const cache=rssPublicCacheEntries();cache[feed.url]={at,entries:kept};
  const oldest=Object.keys(cache).sort((a,b)=>cache[a].at-cache[b].at);
  while(rssCacheBytes(cache)>RSS_PUBLIC_CACHE_BYTES&&oldest.length)delete cache[oldest.shift()];
  try{localStorage.setItem(RSS_PUBLIC_CACHE_KEY,JSON.stringify(cache));}
  catch{/* Memory still reuses valid entries when persistent storage is unavailable. */}
}
async function rssFeedEntries(feed,force){
  const cache=rssPublicCacheEntries(),record=cache[feed.url],now=Date.now();
  const usable=record&&record.at<=now&&now-record.at<=RSS_PUBLIC_STALE_MS;
  if(usable&&(!rssOnline()||!force&&now-record.at<RSS_CACHE_MS)){
    // Clone: rotation and cover preparation must not mutate the stored cache.
    return {at:record.at,entries:record.entries.map(entry=>({...entry,source:feed.name,
      category:feed.category,feedSourceUrl:feed.url}))};
  }
  if(!rssOnline())throw new Error('feed_offline');
  try{
    const location={};const html=await fetchArticleHtml(feed.url,location);
    const entries=parseRss(html,{...feed,sourceUrl:feed.url,url:location.url||feed.url}).map(rssCacheEntry).filter(Boolean);
    rssStorePublicFeed(feed,entries,now);
    return {at:now,entries};
  }catch(error){
    if(usable)return {at:record.at,entries:record.entries.map(entry=>({...entry,source:feed.name,
      category:feed.category,feedSourceUrl:feed.url}))};
    throw error;
  }
}

function rssLocal(element){ return (element && (element.localName || element.nodeName) || '').toLowerCase(); }
function rssChild(element, names){
  const children = [...(element ? element.children : [])];
  /* RSS에는 짧은 description과 진짜 본문(content:encoded)이 같이 있습니다.
     문서에 나온 순서가 아니라, 호출한 쪽이 정한 우선순서를 따라야 사진을 놓치지 않습니다. */
  for(const name of names){
    const child = children.find(node => rssLocal(node) === name);
    if(child) return child;
  }
  return null;
}
function rssText(element, names){
  const child = rssChild(element, names);
  return child && child.textContent ? child.textContent.trim() : '';
}
function rssHtmlText(html){
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  return doc.body.textContent.replace(/\s+/g, ' ').trim();
}
function rssAbsolute(url, base){
  if(!String(url || '').trim()) return '';
  return articleAbsolute(url,base);
}
function rssEntryUrl(entry, base){
  const links = [...entry.children].filter(node => rssLocal(node) === 'link');
  const atom = links.find(link => (link.getAttribute('rel') || 'alternate') === 'alternate');
  return rssAbsolute(atom ? (atom.getAttribute('href') || atom.textContent) : rssText(entry, ['link']), base);
}
function rssImage(entry, html, base){
  const tooSmall=node=>['width','height'].some(attr=>{const size=parseInt(node.getAttribute(attr)||'0',10);return size>0&&size<60;});
  const media=[...entry.querySelectorAll('*')].filter(node=>['content','thumbnail','enclosure','link'].includes(rssLocal(node)));
  const priority={enclosure:0,content:1,thumbnail:2,link:3};
  media.sort((a,b)=>priority[rssLocal(a)]-priority[rssLocal(b)]);
  for(const node of media){
    const kind=rssLocal(node);
    if(!['content','thumbnail','enclosure','link'].includes(kind))continue;
    if(kind==='link' && node.getAttribute('rel')!=='enclosure')continue;
    const type=(node.getAttribute('type') || '').trim().toLowerCase();
    const medium=(node.getAttribute('medium') || '').trim().toLowerCase();
    if(medium && medium!=='image')continue;
    if((kind==='enclosure'||kind==='link') && !type.startsWith('image/'))continue;
    if(type && !type.startsWith('image/'))continue;
    const src=rssAbsolute(node.getAttribute('url')||node.getAttribute('href'),base);
    if(src && !tooSmall(node) && !ARTICLE_IMG_BAD.test(src))return src;
  }
  // The body and the photo need not live in the same feed field. A publisher
  // may supply image-less full content and a photo in its description/summary.
  // Inspect only those supplied fields; never fetch an article to fill a cover.
  const supplied=new Set([String(html || ''),...['encoded','content','description','summary']
    .map(name=>rssText(entry,[name]))]);
  for(const value of supplied){
    if(!value)continue;
    const doc = new DOMParser().parseFromString(value.slice(0,200000), 'text/html');
    for(const img of doc.querySelectorAll('img')){
      const src=rssAbsolute(articleBestSrc(img),base);
      if(src && !tooSmall(img) && !ARTICLE_IMG_BAD.test(src))return src;
    }
  }
  return '';
}
function rssDate(value){
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ko-KR', { month:'short', day:'numeric' });
}
function rssUrlKey(raw){
  try{
    const url = new URL(raw);
    url.hash = '';
    return url.href;
  }catch(error){ return String(raw || ''); }
}
function rssAlreadySaved(entry){
  const key = rssUrlKey(entry.readUrl || entry.url);
  return books.some(book => book.sourceUrl && rssUrlKey(book.sourceUrl) === key);
}
function rssPostKind(url){
  try{
    const host = new URL(url).hostname.replace(/^www\./,'');
    if(/(^|\.)(x|twitter)\.com$/.test(host)) return 'x';
    if(/(^|\.)reddit\.com$/.test(host)) return 'reddit';
  }catch(error){}
  return '';
}
function rssLinkedArticle(html, postUrl){
  if(rssPostKind(postUrl) !== 'reddit') return '';
  const doc = new DOMParser().parseFromString(html,'text/html');
  const link = [...doc.querySelectorAll('a[href]')].find(node => /^\[link\]$/i.test(node.textContent.trim()));
  const url = link ? articleAbsolute(link.getAttribute('href'),postUrl) : '';
  return url && !rssPostKind(url) ? url : '';
}
// Discovery is for English reading. Judge the supplied prose, not only a title
// or the script: Indonesian and English both use Latin letters.
const RSS_ENGLISH_WORDS = new Set('the a an and or but if in on at to of for from with by as is are was were be been being it its this that these those they their them we our you your he she his her who which what when where how not no can could would should will have has had do does did more most some any all one about into over after before than there here also such through between while because only other'.split(' '));
const RSS_OTHER_WORDS = new Set('yang dan dengan untuk dari pada dalam tidak adalah sebagai juga mereka saya kamu kita ini itu tersebut oleh karena maka akan telah sudah dapat bisa namun tetapi seorang beberapa waktu lalu ketika sebuah serta tentang menurut menjadi orang sangat atau antara dari kepada la les des une un et dans pour avec sur aux est sont nous vous ils elle il ce cette ces pas qui que je de du en mais au se son ses plus una uno los las el ella del por con para como sobre sus este esta estos estas pero porque muy anche della delle sono che non per gli una uno einen eine und der die das nicht ist ich wir sie den dem auf mit ein zu im von es sich des et cette une les dans pour avec qui que pas aux du au est sont nous vous je'.split(' '));
function rssLooksEnglish(entry){
  const body=rssHtmlText(entry.contentHtml || entry.summary || '').slice(0,6000);
  const sample=(body.length>=100 ? body : [entry.title,entry.summary].join(' ')).toLowerCase();
  const letters=sample.match(/\p{L}/gu)?.length || 0;
  if(letters>=20 && (sample.match(/[a-z]/g)?.length || 0)/letters<.65)return false;
  const words=sample.match(/[a-z]+(?:'[a-z]+)?/g)?.slice(0,450) || [];
  if(words.length<3)return false;
  const english=words.filter(word=>RSS_ENGLISH_WORDS.has(word)).length;
  const other=words.filter(word=>RSS_OTHER_WORDS.has(word) && !RSS_ENGLISH_WORDS.has(word)).length;
  return english>=Math.max(words.length<15?1:2,Math.ceil(words.length*.055)) && english>other;
}
// Narrow local junk check, not an article-quality judgment. Ambiguous entries stay.
function rssObviousPromo(entry){
  const title=String(entry?.title || '');
  const promotional=/\b(?:coupon|promo|discount|voucher)\s+codes?\b/i.test(title) ||
    /\b\d{1,2}%\s+off\b/i.test(title) && /\b(?:deal|today|limited.time)\b/i.test(title);
  if(!promotional)return false;
  const body=String(entry.contentHtml || entry.summary || '').slice(0,200000)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
  // A short feed excerpt cannot establish that a longer article is promo-only.
  // Strong editorial signals or a developed body make this uncertain, so retain it.
  if(body.length>1200 || /\b(?:review|buying guide|report(?:ing)?|analysis|research|study|investigat\w*|discuss\w*|explain\w*|compare\w*|tested|strategy|announc\w*|how|why)\b/i.test(title+' '+body))return false;
  const redeem=/\b(?:use|enter|apply)\s+(?:the\s+)?(?:coupon\s+|promo\s+)?code\b|\bat checkout\b/i.test(body);
  const saving=/\b\d{1,2}%\s+off\b|\bsave\s+(?:up to\s+)?(?:\d{1,2}%|[$£€]\d+)|\bfree (?:shipping|delivery)\b/i.test(body);
  const boilerplate=/\b(?:verified|working)\s+(?:coupon\s+|promo\s+)?codes?\b|\b(?:limited.time|expires? (?:today|soon)|valid until|shop now|claim (?:this|your|the) deal)\b/i.test(body);
  return redeem && saving && boilerplate;
}
function parseRss(xml, feed){
  if(String(xml).length > 3000000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('피드를 읽지 못했어요');
  let source=String(xml);
  // Some publishers append a script after a complete XML document. Only trim
  // content beyond the root close; malformed XML inside the feed still fails.
  const root=source.match(/^\s*(?:<\?xml[^>]*\?>\s*)?<(rss|feed)\b/i)?.[1]?.toLowerCase();
  const close=root?source.lastIndexOf(`</${root}>`):-1;
  if(close>=0)source=source.slice(0,close+root.length+3);
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if(doc.querySelector('parsererror')) throw new Error('RSS 형식을 읽지 못했어요');
  if(!['rss','feed','rdf'].includes(rssLocal(doc.documentElement))) throw new Error('RSS 또는 Atom 주소를 확인해 주세요');
  const nodes = [...doc.querySelectorAll('entry, item')].slice(0,100);
  const seen = new Set();
  return nodes.map(node => {
    const content = rssText(node, ['encoded', 'content', 'description', 'summary']);
    const bodyProvided = !!rssText(node, ['encoded', 'content']);
    const title = rssHtmlText(rssText(node, ['title']));
    const url = rssEntryUrl(node, feed.url);
    return {
      source:feed.name, category:rssCategory(feed.category), title, url, author:rssText(node,['author','creator']), publishedAt:rssText(node,['published','updated','pubdate','date']),
      bodyProvided:bodyProvided && content.length <= 200000, kind:rssPostKind(url), readUrl:rssLinkedArticle(content,url), contentHtml:content.slice(0,200000), feedUrl:feed.url, feedSourceUrl:feed.sourceUrl || feed.url,
      summary:rssHtmlText(rssText(node,['summary','description']) || content).slice(0,280), photo:rssImage(node, content, feed.url),
      date:rssDate(rssText(node, ['published', 'updated', 'pubdate', 'date'])),
    };
  }).filter(entry => {
    if(!entry.title || !entry.url || rssObviousPromo(entry) || (!entry.readUrl && !rssLooksEnglish(entry))) return false;
    const key = articleUrlKey(entry.url); if(seen.has(key)) return false; seen.add(key); return true;
  });
}
// Medium topic feeds are discovery summaries. Resolve their public author or
// publication feed only after a card is selected, using the same content parser.
function rssMediumSource(feed){
  try{return /(^|\.)medium\.com$/i.test(new URL(feed.url).hostname);}catch{return false;}
}
function rssPublicFeedUrl(entry){
  const url=new URL(entry.url);
  if(url.hostname==='medium.com' || url.hostname==='www.medium.com'){
    const owner=url.pathname.split('/').filter(Boolean)[0];
    return owner ? 'https://medium.com/feed/'+owner : '';
  }
  return new URL('/feed',url).href;
}
function rssStoryKey(raw){
  const url=new URL(raw);
  return url.pathname.match(/-([a-f0-9]{12})\/?$/i)?.[1] || articleUrlKey(raw);
}
async function rssPublicArticle(entry){
  if(parseFeedArticle(entry))return entry;
  if(!rssOnline())return null;
  const url=rssPublicFeedUrl(entry);if(!url)return null;
  let job=rssPublicFeedJobs.get(url);
  if(!job){
    if(rssPublicFeedJobs.size>=40)rssPublicFeedJobs.delete(rssPublicFeedJobs.keys().next().value);
    job=fetchArticleHtml(url).then(xml=>parseRss(xml,{name:entry.source,url})).catch(()=>[]);
    rssPublicFeedJobs.set(url,job);
  }
  const match=(await job).find(item=>rssStoryKey(item.url)===rssStoryKey(entry.url));
  if(!match || !parseFeedArticle(match))return null;
  return {...entry,bodyProvided:true,contentHtml:match.contentHtml,
    author:match.author || entry.author,photo:entry.photo || match.photo};
}
async function rssResolveSelectedEntry(entry){
  if(rssMediumSource({url:entry.feedSourceUrl||entry.feedUrl||entry.url}))return await rssPublicArticle(entry)||entry;
  if(entry.kind&&!entry.readUrl&&!entry.contentHtml){
    const feedUrl=entry.feedUrl||entry.feedSourceUrl;
    if(!feedUrl)return entry;
    const xml=await fetchArticleHtml(feedUrl);
    const match=parseRss(xml,{url:feedUrl,name:entry.source,category:entry.category})
      .find(item=>articleUrlKey(item.url)===articleUrlKey(entry.url));
    return match?{...entry,contentHtml:match.contentHtml,bodyProvided:match.bodyProvided}:entry;
  }
  return entry;
}
function rssDiscoveryEntry(entry){return rssCoverHydrate({...entry,coverFallback:!entry.photo});}
function rssCatalogValidate(raw){
  const now=Date.now();
  if(raw?.version!==1||!Array.isArray(raw.feeds)||raw.feeds.length!==RSS_FEEDS.length||rssCacheBytes(raw)>RSS_CATALOG_CACHE_BYTES)throw Error('catalog_invalid');
  const seen=new Set();
  const feeds=raw.feeds.map(record=>{
    if(!Number.isInteger(record.id)||!RSS_FEEDS[record.id]||seen.has(record.id)||!Number.isFinite(record.at)
      ||record.at<0||record.at>now||!['ready','stale','disabled','unavailable'].includes(record.status)
      ||!Array.isArray(record.entries)||record.entries.length>20)throw Error('catalog_invalid');
    seen.add(record.id);
    const feed=RSS_FEEDS[record.id],usable=['ready','stale'].includes(record.status)&&now-record.at<=RSS_PUBLIC_STALE_MS;
    if(!['ready','stale'].includes(record.status)&&record.entries.length)throw Error('catalog_invalid');
    const entries=record.entries.map(entry=>rssCacheEntry({...entry,source:feed.name,category:feed.category,
      feedUrl:feed.url,feedSourceUrl:feed.url,date:rssDate(entry.publishedAt)}));
    if(entries.some(entry=>!entry))throw Error('catalog_invalid');
    return {id:record.id,at:record.at,status:usable?record.status:'unavailable',entries:usable?entries:[]};
  });
  return {version:1,feeds};
}
function rssCatalogStored(){
  const now=Date.now();
  if(rssCatalogCache&&rssCatalogCache.receivedAt<=now&&now-rssCatalogCache.receivedAt<=RSS_PUBLIC_STALE_MS)return rssCatalogCache;
  rssCatalogCache=null;
  try{
    const raw=localStorage.getItem(RSS_CATALOG_CACHE_KEY);
    if(!raw||raw.length>RSS_CATALOG_CACHE_BYTES+10000)return null;
    const record=JSON.parse(raw);
    if(!Number.isFinite(record.receivedAt)||record.receivedAt>now||now-record.receivedAt>RSS_PUBLIC_STALE_MS)return null;
    rssCatalogCache={receivedAt:record.receivedAt,etag:typeof record.etag==='string'?record.etag.slice(0,2000):'',catalog:rssCatalogValidate(record.catalog)};
    return rssCatalogCache;
  }catch{return null;}
}
async function rssCatalogFetch(force){
  const record=rssCatalogStored(),now=Date.now(),previous=record?rssCatalogValidate(record.catalog):null;
  if(previous&&(!rssOnline()||!force&&now-record.receivedAt<RSS_CACHE_MS))return previous;
  if(!rssOnline())throw Error('catalog_offline');
  try{
    const response=await fetch(SB_URL.replace(/\/$/,'')+'/functions/v1/rss-catalog',{
      credentials:'omit',headers:{apikey:SB_KEY,...(record?.etag?{'If-None-Match':record.etag}:{})},signal:AbortSignal.timeout(12000)});
    let catalog;
    if(response.status===304&&previous)catalog=previous;
    else{
      if(!response.ok)throw Error('catalog_unavailable');
      // Bound the stream before JSON parsing, including missing Content-Length.
      const reader=response.body.getReader(),chunks=[];let size=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
        if(size>RSS_CATALOG_BYTES)throw Error('catalog_too_big');chunks.push(value);}}
      finally{await reader.cancel();}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      catalog=rssCatalogValidate(JSON.parse(new TextDecoder().decode(bytes)));
    }
    rssCatalogCache={receivedAt:now,etag:(response.headers.get('etag')||record?.etag||'').slice(0,2000),catalog};
    try{localStorage.setItem(RSS_CATALOG_CACHE_KEY,JSON.stringify(rssCatalogCache));}catch{/* Memory still works. */}
    return catalog;
  }catch(error){if(previous)return previous;throw error;}
}
async function loadRssCatalog(force){
  if(rssLoading)return rssLoading;
  rssCoverAdvance();
  const sources=rssSources();
  const stored=rssCatalogStored();
  const current=stored?rssCatalogValidate(stored.catalog):{feeds:[]};
  rssCands=sources.map((_,index)=>index<RSS_FEEDS.length?(current.feeds.find(feed=>feed.id===index)?.entries||[]).map(rssDiscoveryEntry):[]);
  // Catalog failure cannot initiate a per-client rebuild of the default feeds.
  rssLoading=(async()=>{
    let catalog;try{catalog=await rssCatalogFetch(force);}catch{catalog={feeds:[]};}
    return Promise.all(sources.map(async(feed,index)=>{
      let entries=[];
      if(index<RSS_FEEDS.length)entries=catalog.feeds.find(record=>record.id===index)?.entries||[];
      else try{entries=(await rssFeedEntries(feed,force)).entries;}catch{/* Custom feeds stay local. */}
      const start=entries.length?(rssPage*RSS_PER_FEED)%entries.length:0;
      rssCands[index]=entries.map((_,step)=>rssDiscoveryEntry(entries[(start+step)%entries.length]));
      rssListeners.forEach(notify=>notify(rssCands));return rssCands[index];
    }));
  })().then(groups=>{rssCands=groups;rssLoadedAt=Date.now();return groups;}).finally(()=>{rssLoading=null;});
  return rssLoading;
}
/* In active mode the server owns public RSS eligibility. No article text or local history is
   sent to it. Candidate uncertainty remains labeled and never becomes approval. */
const RSS_QUALITY_VERSION = 'rss-quality-v2:jev-1.13.0:readability-0.6.0-v1';
let rssQualityRetry = null;
let rssQualityRetryCount = 0;
let rssQualityPending = false;
function rssQualityApproved(entry){
  return entry?.quality?.status==='approved' && entry.quality.version===RSS_QUALITY_VERSION &&
    Number.isFinite(entry.quality.checkedAt) && Date.now()-entry.quality.checkedAt<7*86400000;
}
function rssQualityEligible(entry){
  return rssQualityApproved(entry) || entry?.quality?.status==='uncertain' && entry.quality.eligibility==='candidate' &&
    entry.quality.version===RSS_QUALITY_VERSION && Number.isFinite(entry.quality.checkedAt) &&
    entry.quality.checkedAt<=Date.now() && Date.now()-entry.quality.checkedAt<7*86400000;
}
async function rssQualityFeed(feed){
  const id=RSS_FEEDS.findIndex(item=>item.url===feed.url);
  // Legacy custom sources stay saved locally, but are not sent for paid evaluation.
  if(id<0)return {entries:[],pending:false};
  const response=await fetch(SB_URL.replace(/\/$/,'')+'/functions/v1/rss-quality?feed='+id,{
    headers:{apikey:SB_KEY},signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw new Error('quality_unavailable');
  const result=await response.json();
  if(result.version!==RSS_QUALITY_VERSION || !Array.isArray(result.entries))throw new Error('quality_invalid');
  return {entries:result.entries.filter(rssQualityEligible).map(entry=>({...entry,category:feed.category})),pending:!!result.pending};
}
/* Keep eligible cards during refresh; the server advances its own candidate cursor. */
/** @type {string} */
const RSS_QUALITY_MODE = 'off'; // Activation requires a reviewed client release.
async function loadRssLegacy(force){
  if(rssCatalogEnabled())return loadRssCatalog(force);
  if(rssLoading) return rssLoading;
  const now=Date.now(),cache=rssPublicCacheEntries();
  const expiredPublic=RSS_FEEDS.some((feed,index)=>{
    const record=cache[feed.url];
    return rssCands[index]?.length&&record&&(record.at>now||now-record.at>RSS_PUBLIC_STALE_MS);
  });
  if(!force && rssCands.length && !expiredPublic && now>=rssLoadedAt && now-rssLoadedAt<RSS_CACHE_MS
    &&(!rssLoadedOffline||!rssOnline())) return rssCands;
  rssCoverAdvance();
  rssPublicFeedJobs.clear();
  rssPreparedArticles.clear();
  const sources = rssSources();
  const previous = rssCands;
  rssLoadedOffline=!rssOnline();
  rssCands = sources.map((_,i)=>previous[i] || []);
  rssLoading = Promise.all(sources.map(async (feed,index) => {
    try{
    const result=await rssFeedEntries(feed,force),entries=result.entries;
    /* 새 글이 아직 안 올라와도 ↻가 같은 세 장만 되풀이하면 단추가 무의미합니다.
       피드의 다음 묶음으로 넘어가고, 끝에서는 다시 처음으로 이어집니다. */
    const start = entries.length ? (rssPage * RSS_PER_FEED) % entries.length : 0;
    const ordered=entries.map((_, step) => entries[(start + step) % entries.length]);
    const publish=entries=>{rssCands[index]=entries;rssListeners.forEach(notify=>notify(rssCands));};
    publish(ordered.map(rssDiscoveryEntry));
    return rssCands[index];
    }catch(error){
      // Public stale fallback belongs to rssFeedEntries, which checks its age.
      // Reusing the previous group here would bypass that limit in an open page.
      rssCands[index]=RSS_FEEDS.some(source=>source.url===feed.url)?[]:previous[index]||[];
      rssListeners.forEach(notify=>notify(rssCands));console.warn('Feed unavailable:',feed.url);
      return rssCands[index];
    }
  })).then(groups => {
    rssCands = groups;
    rssLoadedAt = Date.now();
    return rssCands;
  }).finally(() => { rssLoading = null; });
  return rssLoading;
}
async function loadRss(force){
  if(RSS_QUALITY_MODE!=='active')return loadRssLegacy(force);
  if(rssLoading)return rssLoading;
  if(!force && rssCands.length && Date.now()-rssLoadedAt<RSS_CACHE_MS)return rssCands;
  rssCoverAdvance();
  if(force)rssQualityRetryCount=0;
  if(rssQualityRetry){clearTimeout(rssQualityRetry);rssQualityRetry=null;}
  rssPublicFeedJobs.clear();rssPreparedArticles.clear();
  const sources=rssSources(),previous=rssCands;
  rssCands=sources.map((_,i)=>(previous[i] || []).filter(rssQualityEligible));
  let pending=false;
  rssLoading=Promise.all(sources.map(async(feed,index)=>{
    const publish=entries=>{rssCands[index]=entries;rssListeners.forEach(notify=>notify(rssCands));};
    try{
      const result=await rssQualityFeed(feed);pending=pending || result.pending;
      const start=result.entries.length ? (rssPage*RSS_PER_FEED)%result.entries.length : 0;
      const ordered=result.entries.map((_,step)=>result.entries[(start+step)%result.entries.length]);
      // Eligibility stays owned by Jev; article bodies wait for selection.
      publish(ordered.filter(entry=>!rssAlreadySaved(entry)).map(entry=>rssDiscoveryEntry({...entry,contentHtml:'',bodyProvided:false})));
    }catch{pending=true;/* Retain last-good approved cards through service outages. */}
    return rssCands[index];
  })).then(groups=>{rssCands=groups;rssQualityPending=pending;rssLoadedAt=Date.now();return groups;}).finally(()=>{
    rssLoading=null;
    // Bounded cold-start polling lets completed background work populate Home.
    if(pending && rssQualityRetryCount<4){rssQualityRetryCount++;
      rssQualityRetry=setTimeout(()=>{rssQualityRetry=null;rssLoadedAt=0;void loadRss(false).then(()=>refreshFeedRails());},20000);
    }
  });
  return rssLoading;
}
function refreshRssPhotoEmpty(rail){
  const empty=document.getElementById(rail.id==='casual-rail'?'home-feed-empty':'casual-discover-empty');
  if(!empty)return;
  const hasPhoto=!!rail.querySelector('.rss-card:not([hidden])');
  empty.textContent=rssQualityPending?'새 글을 확인하고 있어요. 잠시 후 다시 새로고침해 주세요.':'새 글을 찾지 못했어요.';
  empty.hidden=hasPhoto || !!rssLoading;
}

/* Cover work owns only the thumbnail shimmer; known metadata stays tappable. */
function rssCardPhoto(card, entry){
  const existing=rssCardCoverWork.get(card);if(existing?.promise)return existing.promise;
  const image = /** @type {HTMLImageElement} */(card.querySelector('.cover'));
  const thumb = card.querySelector('.thumb');
  const photo=entry.photo;
  let stopDecode=null,cancelled=false;
  const task={promise:null,cancel:()=>{
    cancelled=true;stopDecode?.();
    if(rssCardCoverWork.get(card)===task){
      rssCardCoverWork.delete(card);delete card.dataset.photoStarted;rssCardReady(card);
    }
  }};
  const current=()=>!cancelled&&rssCardCoverWork.get(card)===task&&card.isConnected
    &&card.dataset.rssUrl===entry.url&&entry.photo===photo;
  rssCardCoverWork.set(card,task);card.classList.add('rss-cover-pending');
  image.referrerPolicy = 'no-referrer';
  const decode = src => new Promise(resolve=>{
    let settled=false;
    const done=ok=>{
      if(settled)return;settled=true;
      clearTimeout(timer);image.onload=image.onerror=null;stopDecode=null;
      if(!ok)image.removeAttribute('src');resolve(ok);
    };
    const timer=setTimeout(()=>done(false),RSS_PHOTO_MS);
    stopDecode=()=>{image.removeAttribute('src');done(false);};
    image.onload=()=>{
      if(image.naturalWidth<60||image.naturalHeight<60){done(false);return;}
      if(typeof image.decode==='function')image.decode().then(()=>done(true),()=>done(false));
      else done(true);
    };
    image.onerror=()=>done(false);image.src=src;
  });
  task.promise=(async()=>{
    try{
      let ok=await decode(photo);
      // Hotlink failures retain the existing bounded image transport and budget.
      if(!ok && current()){
        const blob=await fetchArticleImage(photo);
        if(blob && current()){
          const local=URL.createObjectURL(blob);
          try{ok=await decode(local);}finally{URL.revokeObjectURL(local);}
        }
      }
      if(!current())return false;
      if(ok){
        image.hidden=false;thumb.classList.add('has-cover');card.hidden=false;
        if(card.closest('#v-home'))homeSmartCrop(image,photo,3/4,()=>fetchArticleImage(photo));
        const rail=card.parentElement;
        if(rail?.dataset.rssResetStart)rssAlignRailStart(rail);
      }
      refreshRssPhotoEmpty(card.parentElement);
      return ok;
    }catch{return false;}
    finally{
      if(rssCardCoverWork.get(card)===task){rssCardCoverWork.delete(card);rssCardReady(card);}
    }
  })();
  return task.promise;
}

function rssCardReady(card){
  card.classList.remove('rss-cover-pending');card.removeAttribute('aria-busy');
  card.removeAttribute('aria-disabled');card.tabIndex=0;
}
function rssSkeletonMarkup(){
  return '<div class="rss-skeleton" aria-hidden="true"><span class="rss-skeleton-source"></span><span class="rss-skeleton-title"><i></i><i></i><i></i></span></div>';
}

function rssCard(entry){
  const card = document.createElement('article');
  card.hidden = false;
  const color = entry.source === 'ProPublica' ? 1 : 0;
  card.className = 'casual rss-card cpal' + color;
  card.dataset.rssUrl=entry.url;
  accessibleLibraryCard(card,[entry.title,entry.source,'미리보기 열기'].filter(Boolean).join(' · '));
  card.innerHTML = `<div class="thumb rss-thumb editorial-cover">${coverArtwork(entry.url)}<img class="cover" alt="" hidden>
      <div class="src"></div><div class="lede"></div>${WAVE('#FFFFFF','.35')}</div>
    <div class="ct"></div><div class="cm"></div>`;
  card.insertAdjacentHTML('beforeend',rssSkeletonMarkup());
  card.querySelector('.src').textContent = entry.source;
  card.querySelector('.lede').textContent = entry.title;
  card.querySelector('.ct').textContent = entry.title;
  card.querySelector('.cm').textContent = entry.date ? `${entry.date} · 탭해서 담기` : '탭해서 담기';
  let pressedAt = 0;
  card.addEventListener('pointerdown', () => { pressedAt = performance.now(); });
  card.addEventListener('contextmenu', event => event.preventDefault());
  card.onclick = event => {
    if(pressedAt && performance.now() - pressedAt >= 500){event.preventDefault();return;}
    importRssEntry(rssCardEntries.get(card)||entry, card);
  };
  return card;
}
async function importRssEntry(entry, card){
  if(card.classList.contains('busy'))return;
  rssCoverCancel(rssCoverOwners.get(card.parentElement));
  card.classList.add('busy');
  const preparation=articlePreviewPrepare(entry,card);
  const selectedEntry=entry;
  const options={preview:true,present:!preparation,deferSave:true};
  const intent=++readerOpenIntent;
  try{
    entry=await rssResolveSelectedEntry(entry);
    if(intent!==readerOpenIntent)return;
    let book;
    if(entry.readUrl)book=await ingestArticle(entry.readUrl,{...entry,discoveredFromUrl:entry.url,...options});
    else if(entry.kind)book=await ingestFeedPost(entry,options);
    else book=await ingestArticle(entry.url,{...entry,preparedArticle:rssPreparedArticles.get(articleUrlKey(entry.url)),...options});
    rssSelectedCover(selectedEntry,card,book);
    if(preparation)preparation.finish(book);
  }catch(error){
    // A transient read/storage failure must not delete cards or decoded covers.
    if(preparation)preparation.fail(()=>importRssEntry(entry,card));
    else toast(error?.code?.startsWith('social_') ? error.message : '지금은 글을 열지 못했어요. 잠시 후 다시 시도해 주세요.');
  }finally{card.classList.remove('busy');}
}
// An article selected by the person has already supplied its cover. Project it
// back to that same discovery entry/card without another lookup.
function rssSelectedCover(entry,card,book){
  const photo=articleDrafts.get(book)?.coverUrl;
  if(entry.photo || !photo || ARTICLE_IMG_BAD.test(photo) || !rssCands.some(group=>group.includes(entry)))return;
  entry.photo=photo;entry.coverFallback=false;
  if(card.isConnected && card.dataset.rssUrl===entry.url){
    rssCardIdentities.set(card,rssCardIdentity(entry));
    card.dataset.photoStarted='true';void rssCardPhoto(card,entry);
  }
}
/* A feed's own post body is enough for short posts. It never becomes live HTML:
   only text, explicit marks and validated image URLs enter the existing Reader. */
function parseFeedPost(entry){
  if(!entry.kind || !entry.contentHtml || entry.contentHtml.length > 200000) return null;
  const doc = new DOMParser().parseFromString(entry.contentHtml,'text/html');
  doc.body.querySelectorAll('script,style,iframe,form,svg,video,audio,object,embed').forEach(node=>node.remove());
  if(entry.kind === 'reddit') doc.body.querySelectorAll('table').forEach(table=>{
    if(/submitted by/i.test(table.textContent) && /\[comments\]/i.test(table.textContent)) table.remove();
  });
  const blocks = [];
  for(const node of doc.body.querySelectorAll('p,blockquote,li,h2,h3,img')){
    if(node.tagName === 'IMG'){
      const src = articleAbsolute(articleBestSrc(node),entry.url);
      if(src && !articleTooSmall(node) && !ARTICLE_IMG_BAD.test(src) && blocks.filter(block=>block.r==='img').length < ARTICLE_IMG_MAX)
        blocks.push({r:'img',t:src,alt:node.getAttribute('alt') || ''});
      continue;
    }
    if(node.querySelector('p,blockquote,li,h2,h3')) continue;
    const value = articleInline(node,entry.url);
    if(!value.t) continue;
    const tag = node.tagName.toLowerCase();
    const r = tag === 'blockquote' || node.closest('blockquote') ? 'quote'
      : tag === 'h2' || tag === 'h3' ? tag : 'p';
    blocks.push({r,...value,list:tag === 'li' ? (node.parentElement?.tagName === 'OL' ? '1.' : '•') : ''});
  }
  let bodyLength = blocks.filter(block=>block.r!=='img').reduce((total,block)=>total+block.t.length,0);
  if(!bodyLength && entry.kind === 'x'){
    const value = articleInline(doc.body,entry.url);
    if(value.t) blocks.push({r:'p',...value});
    bodyLength = value.t.length;
  }
  // A Reddit prompt often consists solely of its title. Include it as a
  // paragraph so lookup works, but reject a bare feed headline as an X body.
  if(!bodyLength && entry.kind === 'reddit' && entry.title.length >= 40)
    blocks.push({r:'p',t:entry.title,marks:[]});
  if(bodyLength > 30000 || blocks.length > 200 ||
     !blocks.some(block=>block.r!=='img' && block.t.length >= 20)) return null;
  const title = entry.title || new URL(entry.url).hostname;
  return {title,site:entry.source,url:entry.url,cover:entry.photo || '',blocks,...articleAssemble(title,blocks)};
}
async function ingestFeedPost(entry,options={}){
  const intent=++readerOpenIntent;
  const existing = books.find(book=>book.sourceUrl && articleUrlKey(book.sourceUrl) === articleUrlKey(entry.url));
  if(existing){
    if(options.present===false)return existing;
    return options.preview?openCasualPreviewOrReader(existing):openBook(existing);
  }
  const parsed = parseFeedPost(entry);
  if(!parsed) throw new Error('피드에서 읽을 만한 본문을 찾지 못했어요');
  const draft=makeArticleDraft(parsed,{kind:'article',contentType:'post',site:entry.source,
    sourceUrl:entry.url,feedUrl:entry.feedUrl,author:entry.author,publishedAt:entry.publishedAt});
  const book=options.preview||options.deferSave?draft:await commitArticleDraft(draft);
  if(options.present!==false && intent===readerOpenIntent){
    if(options.preview)openCasualPreviewOrReader(book);
    else{
      if(articleDrafts.get(draft)?.missed)toast('일부 사진을 가져오지 못했어요. 원문에서 확인할 수 있어요.');
      await openBook(book);
    }
  }
  return book;
}
/* Supplied photos stay authoritative. Missing visible photos have a separate
   bounded metadata lookup; article bodies remain selected-intent work. */
const rssCardIdentities=new WeakMap();
const rssCardEntries=new WeakMap();
function rssCardIdentity(entry){
  // Retained cards point to the current entry. Keep decoded DOM only when its
  // import payload and visible metadata still match. Refresh timestamps
  // and ranking alone do not change that payload; content/version/verdict do.
  const {quality,...content}=entry;
  return JSON.stringify([content,quality?.key,quality?.version,quality?.status,quality?.eligibility,quality?.resolvedUrl]);
}
async function rssFeedCards(entries, renderId, rail, limit=RSS_PER_FEED){
  const cards = [];
  for(const entry of entries){
    if(cards.length >= limit || renderId !== rssRenderIds.get(rail)) break;
    if(rssAlreadySaved(entry) || !entry.discoveryFiltered&&rssObviousPromo(entry)) continue;
    if(!entry.photo&&!entry.coverFallback) continue;
    const card = rssCard(entry);
    rssCardIdentities.set(card,rssCardIdentity(entry));
    // Covers load only after insertion; text never waits for an image.
    cards.push(card);
  }
  return cards;
}
/* Local discovery ranking. No requests, new tracking, or stored profile: use
   existing article progress only. Keep feed rotation and Reader/Preview intact. */
function rssRecommendationUrl(raw){
  try{
    const url=new URL(raw);
    if(!/^https?:$/.test(url.protocol))return '';
    url.hash='';
    for(const name of [...url.searchParams.keys()])
      if(/^utm_|^(fbclid|gclid)$/i.test(name))url.searchParams.delete(name);
    url.searchParams.sort();
    return url.href;
  }catch{return '';}
}
function rssRecommendationHost(raw){
  try{return new URL(raw).hostname.replace(/^www\./,'');}catch{return '';}
}
/**
 * Rank one unread discovery entry per feed, preserving the feed's refresh order.
 * Progress is an interest hint, not proof of comprehension or dwell time.
 * @param {Array<Array<any>>} groups
 * @param {{library?: Array<any>, positions?: Object, sources?: Array<any>, now?: number}} options
 * @returns {Array<Array<any>>}
 */
function rssRankRecommendations(groups, options={}){
  const day=86400000;
  const now=Number.isFinite(options.now)?options.now:Date.now();
  const library=Array.isArray(options.library)?options.library:[];
  const history=options.positions || {};
  const sources=Array.isArray(options.sources)?options.sources:[];
  const byFeed=new Map(), byHost=new Map();
  for(const feed of sources){
    if(!feed)continue;
    const key=rssRecommendationUrl(feed.url), host=rssRecommendationHost(key);
    if(!key)continue;
    const category=rssCategory(feed.category);
    byFeed.set(key,category);
    if(!byHost.has(host))byHost.set(host,new Set());
    byHost.get(host).add(category);
  }
  const aliases=book=>[book.sourceUrl,book.resolvedUrl,book.discoveredFromUrl]
    .map(rssRecommendationUrl).filter(Boolean);
  const saved=new Set(library.filter(Boolean).flatMap(aliases));
  const sourceWeights=new Map(), categoryWeights=new Map(), learned=new Set();
  const add=(map,key,value)=>{if(key)map.set(key,(map.get(key)||0)+value);};
  // A Preview/import without reading progress must not train the ranking.
  const reads=library.filter(book=>{
    const position=book && history[book.id];
    return book?.kind==='article' && !book.transient && position &&
      Number.isFinite(position.t) && position.t>0 && position.t<=now &&
      now-position.t<=60*day && Number.isFinite(position.p) && position.p>=.1;
  }).sort((a,b)=>history[b.id].t-history[a.id].t || String(a.id).localeCompare(String(b.id)));
  let count=0;
  for(const book of reads){
    const keys=aliases(book);
    if(!keys.length || keys.some(key=>learned.has(key)))continue;
    if(count++>=50)break;
    keys.forEach(key=>learned.add(key));
    const host=rssRecommendationHost(book.resolvedUrl || book.sourceUrl);
    const categories=byHost.get(host);
    // Do not guess which Medium topic a saved link belongs to.
    const category=byFeed.get(rssRecommendationUrl(book.feedUrl)) ||
      (categories?.size===1?[...categories][0]:'');
    const position=history[book.id];
    const weight=Math.min(1,position.p)*Math.pow(.5,(now-position.t)/(14*day));
    add(sourceWeights,host,weight);add(categoryWeights,category,weight);
  }
  const affinity=(map,key,max)=>max*(1-Math.exp(-(map.get(key)||0)/2));
  const seenFeeds=new Set();
  const queues=[];
  for(const group of (Array.isArray(groups)?groups:[]).slice(0,RSS_SOURCE_LIMIT)){
    if(!Array.isArray(group))continue;
    const entries=group.slice(0,100).filter(entry=>entry && (entry.discoveryFiltered || !rssObviousPromo(entry)) &&
      typeof entry.title==='string' && entry.title.trim() &&
      ((typeof entry.photo==='string' && entry.photo.trim()) || entry.coverFallback===true) &&
      rssRecommendationUrl(entry.url) && (!entry.readUrl || rssRecommendationUrl(entry.readUrl)))
      .map(entry=>{
        const keys=[entry.url,entry.readUrl].map(rssRecommendationUrl).filter(Boolean);
        const host=rssRecommendationHost(entry.readUrl || entry.url);
        const feed=rssRecommendationUrl(entry.feedSourceUrl || entry.feedUrl);
        const category=byFeed.get(feed) || rssCategory(entry.category);
        const published=Date.parse(entry.publishedAt);
        const age=now-published;
        // Missing/bogus/future dates get no freshness bonus, not a crash.
        const freshness=Number.isFinite(published) && age>=0 ? 2/(1+age/(3*day)) : 0;
        const preference=affinity(categoryWeights,category,2)+affinity(sourceWeights,host,1.5);
        return {entry,keys,host,feed,category,freshness,preference};
      }).filter(item=>!item.keys.some(key=>saved.has(key)));
    if(!entries.length)continue;
    const feed=entries[0].feed || entries[0].host;
    if(seenFeeds.has(feed))continue;
    seenFeeds.add(feed);queues.push(entries);
  }
  const result=[], used=new Set(), publishers=new Map(), categories=new Map();
  let lastCategory='';
  while(queues.length){
    // Duplicates across feeds fall through to the next entry in that feed.
    const choices=queues.map((queue,index)=>({item:queue.find(item=>!item.keys.some(key=>used.has(key))),index}))
      .filter(choice=>choice.item);
    if(!choices.length)break;
    let pool=choices;
    // Keep the first few cards from being several feeds of the same publisher.
    if(result.length<4){
      const diverse=pool.filter(({item})=>!publishers.has(item.host));
      if(diverse.length)pool=diverse;
    }
    const explore=(result.length+1)%4===0 && (sourceWeights.size>0 || categoryWeights.size>0);
    if(explore){
      const unfamiliar=pool.filter(({item})=>!categoryWeights.has(item.category));
      if(unfamiliar.length)pool=unfamiliar;
      else{
        const newSource=pool.filter(({item})=>!sourceWeights.has(item.host));
        if(newSource.length)pool=newSource;
      }
    }
    const score=item=>item.freshness+(explore?0:item.preference)
      -.65*(publishers.get(item.host)||0)-.35*(categories.get(item.category)||0)
      -(item.category===lastCategory ? .4 : 0);
    pool.sort((a,b)=>score(b.item)-score(a.item) || a.item.keys[0].localeCompare(b.item.keys[0]));
    const {item,index}=pool[0];
    result.push([item.entry]);item.keys.forEach(key=>used.add(key));
    add(publishers,item.host,1);add(categories,item.category,1);lastCategory=item.category;
    queues.splice(index,1);
  }
  return result;
}

const rssStartFrames=new WeakMap();
function rssAlignRailStart(rail){
  cancelAnimationFrame(rssStartFrames.get(rail));
  // DOM replacement can make CSS snap retain the outgoing card's position.
  // Keep snap suspended until the new layout has had a frame to settle.
  rail.style.scrollSnapType='none';
  rail.scrollLeft=0;
  rssStartFrames.set(rail,requestAnimationFrame(()=>{
    rail.scrollLeft=0;
    rssStartFrames.set(rail,requestAnimationFrame(()=>{
      rail.style.removeProperty('scroll-snap-type');
      rail.scrollLeft=0;
      delete rail.dataset.rssResetStart;
      rssStartFrames.delete(rail);
    }));
  }));
}

function renderRssCards(rail, force, empty){
  let coverOwner;
  const category='all';
  if(force || rail.dataset.rssCategory!==category){
    rail.dataset.rssCategory=category;
    rail.dataset.rssResetStart='1';
    rail.scrollLeft=0;
  }
  const renderId=(rssRenderIds.get(rail)||0)+1;
  rssRenderIds.set(rail,renderId);
  rail.querySelectorAll('.shared-card').forEach(card=>card.remove());
  if(!rail.querySelector('.rss-card,.rss-loading')){
    for(let slot=0;slot<3;slot++){
      const placeholder=document.createElement('article');placeholder.className='casual rss-loading';
      if(!slot){placeholder.setAttribute('role','status');placeholder.setAttribute('aria-label','글 불러오는 중');}
      else placeholder.setAttribute('aria-hidden','true');
      placeholder.innerHTML='<div class="thumb"></div>'+rssSkeletonMarkup();
      rail.insertBefore(placeholder,rail.querySelector('.casual.add'));
    }
  }
  if(empty)empty.hidden=true;
  let revision=0;
  const recommendationContext=rail.id==='casual-rail' && category==='all'
    ? {library:books,positions,sources:rssSources(),now:Date.now()} : null;
  const recommendationStamp=recommendationContext ? JSON.stringify([
    Math.floor(recommendationContext.now/RSS_CACHE_MS),recommendationContext.sources,
    books.map(book=>[book.id,book.kind,book.sourceUrl,book.resolvedUrl,book.discoveredFromUrl,
      book.feedUrl,book.transient,positions[book.id]?.p,positions[book.id]?.t]),
  ]) : '';
  const paint=async groups=>{
    const current=++revision;
    if(renderId!==rssRenderIds.get(rail))return;
    groups.flat().forEach(rssCoverHydrate);
    const stamp=JSON.stringify([category,groups,rssQualityPending,books.map(book=>book.sourceUrl||'')]);
    if(!force && rail.dataset.rssStamp===stamp && rail.dataset.rssRecommendationStamp===recommendationStamp){
      if(rail.querySelector('.rss-card') || !rssLoading)rail.querySelectorAll('.rss-loading').forEach(node=>node.remove());
      if(empty)empty.hidden=!!rail.querySelector('.rss-card') || !!rssLoading;
      if(rail.dataset.rssResetStart)rssAlignRailStart(rail);
      rssCoverWatch(coverOwner,[...rail.querySelectorAll('.rss-card')],groups.flat());
      return;
    }
    const selected=recommendationContext?rssRankRecommendations(groups,recommendationContext):groups;
    const cards=(await Promise.all(selected.map(entries=>rssFeedCards(entries,renderId,rail,category==='all'?1:RSS_PER_FEED)))).flat();
    if(current!==revision||renderId!==rssRenderIds.get(rail)||!rail.isConnected)return;
    // Do not reshuffle cards under a scrolled/focused/pressed recommendation rail
    // when another feed arrives. New cards append; explicit refresh may rerank.
    if(rail.id==='casual-rail' && category==='all' && !force &&
       (rail.scrollLeft>0 || rail.contains(document.activeElement) || rail.querySelector('.rss-card.busy'))){
      const order=new Map([...rail.querySelectorAll('.rss-card')].map((card,index)=>[card.dataset.rssUrl,index]));
      cards.sort((a,b)=>(order.get(a.dataset.rssUrl)??Infinity)-(order.get(b.dataset.rssUrl)??Infinity));
    }
    // Preserve decoded cards and append newly available sources without resetting images.
    const existing=new Map();
    for(const card of rail.querySelectorAll('.rss-card')){
      const url=card.dataset.rssUrl;
      if(!existing.has(url))existing.set(url,[]);
      existing.get(url).push(card);
    }
    for(let i=0;i<cards.length;i++){
      const old=existing.get(cards[i].dataset.rssUrl)?.shift();
      if(old && rssCardIdentities.get(old)===rssCardIdentities.get(cards[i]))cards[i]=old;
      else if(old){rssCardCoverWork.get(old)?.cancel?.();old.remove();}
    }
    existing.forEach(duplicates=>duplicates.forEach(card=>{rssCardCoverWork.get(card)?.cancel?.();card.remove();}));
    const keepStart=!!rail.dataset.rssResetStart || rail.scrollLeft<=1;
    const slots=[...rail.querySelectorAll('.rss-loading')];
    const before=slots[0] || rail.querySelector('.casual.add');
    cards.forEach(card=>rail.insertBefore(card,before));
    slots.forEach((slot,index)=>{if(index<cards.length || !rssLoading)slot.remove();});
    if(keepStart)rssAlignRailStart(rail);
    const entries=groups.flat();
    rssCoverWatch(coverOwner,cards,entries);
    rail.dataset.rssStamp=stamp;
    rail.dataset.rssRecommendationStamp=recommendationStamp;
    if(empty){ empty.textContent=cards.length?'':rssQualityPending?'새 글을 확인하고 있어요. 잠시 후 다시 새로고침해 주세요.':category==='all'?'새 글을 찾지 못했어요.':'이 카테고리에 새 글이 없어요.'; empty.hidden=cards.length>0 || !!rssLoading; }
  };
  const notify=groups=>{void paint(groups);};
  rssListeners.add(notify);
  const pending=loadRss(force);
  coverOwner=rssCoverBegin(rail);
  if(rssCands.some(entries=>entries.length))notify(rssCands);
  return pending.then(paint).catch(error=>{
    if(renderId!==rssRenderIds.get(rail))return;
    rail.querySelectorAll('.rss-loading').forEach(node=>node.remove());
    console.error(error);
    if(empty){ empty.textContent='새로운 기사를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'; empty.hidden=false; }
  }).finally(()=>rssListeners.delete(notify));
}
function appendRssCards(rail, force){
  return renderRssCards(rail,force,document.getElementById('home-feed-empty'));
}

// Dismissing Preview returns to the same Home without repainting its rail.
// Resume canceled photo work from current metadata, without loading feeds.
if(typeof document!=='undefined')document.getElementById?.('article-preview')?.addEventListener('close',()=>{
  const rail=document.getElementById('casual-rail');
  if(!rail?.isConnected||!rail.closest('#v-home.on')||document.getElementById('article-preview').hasAttribute('open'))return;
  rssCoverWatch(rssCoverBegin(rail),[...rail.querySelectorAll('.rss-card')],rssCands.flat());
});

// Small, local source list. Article feeds provide discovery metadata; a short
// social post may be read from its feed body when enough text is present.
function rssSources(){
  const custom = load('breeze.feed-sources',[]);
  const categories=load('breeze.feed-source-categories',{}) || {};
  return [...RSS_FEEDS, ...(Array.isArray(custom) ? custom.filter(feed=>feed && normalizeArticleUrl(feed.url)) : [])].slice(0,RSS_SOURCE_LIMIT)
    .map(feed=>({...feed,category:rssCategory(categories[feed.url] || feed.category)}));
}
