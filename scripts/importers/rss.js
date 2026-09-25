/* ================= Discover RSS =================
   RSS는 글을 보관하는 새 저장소가 아닙니다. 목록을 잠깐 보여 주고, 고른 한 편만
   기존 URL 반입기로 넘깁니다. 그래서 오프라인·사전·단어장 흐름은 기사 URL과
   완전히 같고, 피드 자체나 카드 사진을 서버/IndexedDB에 쌓지 않습니다. */

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
const rssListeners = new Set();
let rssCands = [];
let rssLoadedAt = 0;
let rssLoading = null;
const rssPublicFeedJobs = new Map();
const rssPreparedArticles = new Map();
const rssRenderIds = new WeakMap();
let rssPage = 0;

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
    const type=node.getAttribute('type') || '';
    if((kind==='enclosure'||kind==='link') && !type.startsWith('image/'))continue;
    if(type && !type.startsWith('image/'))continue;
    const src=rssAbsolute(node.getAttribute('url')||node.getAttribute('href'),base);
    if(src && !tooSmall(node) && !ARTICLE_IMG_BAD.test(src))return src;
  }
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  for(const img of doc.querySelectorAll('img')){
    const src=rssAbsolute(articleBestSrc(img),base);
    if(src && !tooSmall(img) && !ARTICLE_IMG_BAD.test(src))return src;
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
    if(!entry.title || !entry.url || (!entry.readUrl && !rssLooksEnglish(entry))) return false;
    const key = articleUrlKey(entry.url); if(seen.has(key)) return false; seen.add(key); return true;
  });
}
// Medium topic feeds are discovery summaries. Resolve their public author or
// publication feed before presenting a card, using the same content parser.
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
async function rssPreparePublicArticles(entries,publish){
  const ready=[];let cursor=0;
  // A bounded pair of workers; publish usable bodies without waiting for others.
  await Promise.all([0,1].map(async()=>{
    while(cursor<entries.length && ready.length<RSS_PER_FEED){
      const entry=entries[cursor++];
      const resolved=await rssPublicArticle(entry);
      if(resolved && ready.length<RSS_PER_FEED){ready.push(resolved);publish([...ready]);}
    }
  }));
  return ready;
}
async function rssPrepareCovers(entries,publish){
  publish(entries);
  const missing=entries.slice(0,RSS_PER_FEED).filter(entry=>!entry.photo && !entry.bodyProvided && !entry.kind);
  await Promise.all(missing.map(async entry=>{
    try{
      const location={};
      const html=await fetchArticleHtml(entry.url,location);
      const parsed=parseArticleHtml(html,location.url||entry.url);
      const cover=parsed?.cover || parsed?.blocks.find(block=>block.r==='img')?.t || '';
      if(!cover || ARTICLE_IMG_BAD.test(cover))return;
      entry.photo=cover;
      if(rssPreparedArticles.size>=12)rssPreparedArticles.delete(rssPreparedArticles.keys().next().value);
      rssPreparedArticles.set(articleUrlKey(entry.url),parsed);
      publish(entries);
    }catch(error){}
  }));
  return entries;
}
/* Publish each source as it arrives; one slow source never gates another. */
async function loadRss(force){
  if(rssLoading) return rssLoading;
  if(!force && rssCands.length && Date.now() - rssLoadedAt < RSS_CACHE_MS) return rssCands;
  rssPublicFeedJobs.clear();
  rssPreparedArticles.clear();
  const sources = rssSources();
  const previous = rssCands;
  rssCands = sources.map((_,i)=>previous[i] || []);
  rssLoading = Promise.all(sources.map(async (feed,index) => {
    try{
    const location = {};
    const html = await fetchArticleHtml(feed.url,location);
    const pictured = parseRss(html, {...feed,sourceUrl:feed.url,url:location.url || feed.url});
    /* 새 글이 아직 안 올라와도 ↻가 같은 세 장만 되풀이하면 단추가 무의미합니다.
       피드의 다음 묶음으로 넘어가고, 끝에서는 다시 처음으로 이어집니다. */
    const start = pictured.length ? (rssPage * RSS_PER_FEED) % pictured.length : 0;
    const ordered=pictured.map((_, step) => pictured[(start + step) % pictured.length]);
    const publish=entries=>{rssCands[index]=entries;rssListeners.forEach(notify=>notify(rssCands));};
    if(rssMediumSource(feed))publish(await rssPreparePublicArticles(ordered,publish));
    else if(ordered.slice(0,RSS_PER_FEED).some(entry=>!entry.photo && !entry.bodyProvided && !entry.kind))await rssPrepareCovers(ordered,publish);
    else publish(ordered);
    return rssCands[index];
    }catch(error){ rssCands[index]=[]; rssListeners.forEach(notify=>notify(rssCands)); console.warn('Feed unavailable:',feed.url); return []; }
  })).then(groups => {
    rssCands = groups;
    rssLoadedAt = Date.now();
    return rssCands;
  }).finally(() => { rssLoading = null; });
  return rssLoading;
}
function refreshRssPhotoEmpty(rail){
  const empty=document.getElementById(rail.id==='casual-rail'?'home-feed-empty':'casual-discover-empty');
  if(!empty)return;
  const hasPhoto=!!rail.querySelector('.rss-card:not([hidden])');
  empty.textContent='사진이 있는 새 글을 찾지 못했어요.';
  empty.hidden=hasPhoto || !!rssLoading;
}

/* Discovery only shows entries after their cover image has loaded. */
async function rssCardPhoto(card, entry){
  const image = /** @type {HTMLImageElement} */(card.querySelector('.cover'));
  const thumb = card.querySelector('.thumb');
  image.referrerPolicy = 'no-referrer';
  const decode = src => new Promise(resolve=>{
    const done=ok=>{clearTimeout(timer);image.onload=image.onerror=null;resolve(ok);};
    const timer=setTimeout(()=>done(false),RSS_PHOTO_MS);
    image.onload=()=>done(image.naturalWidth>=60 && image.naturalHeight>=60);
    image.onerror=()=>done(false);image.src=src;
  });
  let ok=await decode(entry.photo);
  // Hotlink failures can still be retrieved by the existing image transport.
  if(!ok && card.isConnected){
    const blob=await fetchArticleImage(entry.photo);
    if(blob && card.isConnected){
      const local=URL.createObjectURL(blob);
      try{ok=await decode(local);}finally{URL.revokeObjectURL(local);}
    }
  }
  if(ok && card.isConnected){
    image.hidden=false;thumb.classList.add('has-cover');card.hidden=false;
    if(card.closest('#v-home'))homeSmartCrop(image,entry.photo,3/4,()=>fetchArticleImage(entry.photo));
    const rail=card.parentElement;
    if(rail?.dataset.rssResetStart){rail.scrollLeft=0;delete rail.dataset.rssResetStart;}
    refreshRssPhotoEmpty(rail);
  }
  else if(card.isConnected){
    const rail=card.parentElement;
    card.remove();
    if(rail)refreshRssPhotoEmpty(rail);
  }
  return ok;
}

function rssCard(entry){
  const card = document.createElement('article');
  card.hidden = true;
  const color = entry.source === 'ProPublica' ? 1 : 0;
  card.className = 'casual rss-card cpal' + color;
  card.dataset.rssUrl=entry.url;
  accessibleLibraryCard(card,[entry.title,entry.source,'미리보기 열기'].filter(Boolean).join(' · '));
  card.innerHTML = `<div class="thumb rss-thumb editorial-cover">${coverArtwork(entry.url)}<img class="cover" alt="" hidden>
      <div class="src"></div><div class="lede"></div>${WAVE('#FFFFFF','.35')}</div>
    <div class="ct"></div><div class="cm"></div>`;
  card.querySelector('.src').textContent = entry.source;
  card.querySelector('.lede').textContent = entry.title;
  card.querySelector('.ct').textContent = entry.title;
  card.querySelector('.cm').textContent = entry.date ? `${entry.date} · 탭해서 담기` : '탭해서 담기';
  let pressedAt = 0;
  card.addEventListener('pointerdown', () => { pressedAt = performance.now(); });
  card.addEventListener('contextmenu', event => event.preventDefault());
  card.onclick = event => {
    if(pressedAt && performance.now() - pressedAt >= 500){event.preventDefault();return;}
    importRssEntry(entry, card);
  };
  return card;
}
async function importRssEntry(entry, card){
  if(card.classList.contains('busy'))return;
  card.classList.add('busy');
  const preparation=articlePreviewPrepare(entry,card);
  const options={preview:true,present:!preparation,deferSave:true};
  try{
    let book;
    if(entry.readUrl)book=await ingestArticle(entry.readUrl,{...entry,discoveredFromUrl:entry.url,...options});
    else if(entry.kind)book=await ingestFeedPost(entry,options);
    else book=await ingestArticle(entry.url,{...entry,preparedArticle:rssPreparedArticles.get(articleUrlKey(entry.url)),...options});
    if(preparation)preparation.finish(book);
  }catch(error){
    if(preparation)preparation.fail(()=>importRssEntry(entry,card));
    else toast('지금은 글을 열지 못했어요. 잠시 후 다시 시도해 주세요.');
  }finally{card.classList.remove('busy');}
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
/* A discovery card is shown only when its cover can be displayed. The saved
   article remains readable without a cover after the user opens it. */
async function rssFeedCards(entries, renderId, rail, limit=RSS_PER_FEED){
  const cards = [];
  for(const entry of entries){
    if(cards.length >= limit || renderId !== rssRenderIds.get(rail)) break;
    if(rssAlreadySaved(entry)) continue;
    if(!entry.photo) continue;
    const card = rssCard(entry);
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
 * Rank one unread pictured entry per feed, preserving the feed's refresh order.
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
    const entries=group.slice(0,100).filter(entry=>entry &&
      typeof entry.title==='string' && entry.title.trim() &&
      typeof entry.photo==='string' && entry.photo.trim() &&
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

function renderRssCards(rail, force, empty){
  const category='all';
  if(rail.dataset.rssCategory!==category){
    rail.dataset.rssCategory=category;
    rail.dataset.rssResetStart='1';
    rail.scrollLeft=0;
  }
  const renderId=(rssRenderIds.get(rail)||0)+1;
  rssRenderIds.set(rail,renderId);
  rail.querySelectorAll('.shared-card').forEach(card=>card.remove());
  if(!rail.querySelector('.rss-card,.rss-loading')){
    const placeholder=document.createElement('div');placeholder.className='casual rss-loading';
    placeholder.setAttribute('role','status');placeholder.setAttribute('aria-label','글 불러오는 중');
    placeholder.innerHTML='<div class="thumb"><span class="rss-spinner" aria-hidden="true"></span></div>';
    rail.insertBefore(placeholder,rail.querySelector('.casual.add'));
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
    const stamp=JSON.stringify([category,groups,books.map(book=>book.sourceUrl||'')]);
    if(!force && rail.dataset.rssStamp===stamp && rail.dataset.rssRecommendationStamp===recommendationStamp){
      if(rail.querySelector('.rss-card') || !rssLoading)rail.querySelectorAll('.rss-loading').forEach(node=>node.remove());
      if(empty)empty.hidden=!!rail.querySelector('.rss-card') || !!rssLoading;
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
      if(old)cards[i]=old;
    }
    existing.forEach(duplicates=>duplicates.forEach(card=>card.remove()));
    if(cards.length || !rssLoading)rail.querySelectorAll('.rss-loading').forEach(card=>card.remove());
    const before=rail.querySelector('.casual.add');
    cards.forEach(card=>rail.insertBefore(card,before));
    if(rail.dataset.rssResetStart){
      rail.scrollLeft=0;
      if(cards.some(card=>!card.hidden) || (!rssLoading && !cards.length))delete rail.dataset.rssResetStart;
    }
    const entries=groups.flat();
    cards.forEach(card=>{const entry=entries.find(item=>item.url===card.dataset.rssUrl);if(entry?.photo && !card.dataset.photoStarted){card.dataset.photoStarted='true';void rssCardPhoto(card,entry);}});
    rail.dataset.rssStamp=stamp;
    rail.dataset.rssRecommendationStamp=recommendationStamp;
    if(empty){ empty.textContent=cards.length?'':category==='all'?'표지 사진이 있는 새 글을 찾지 못했어요.':'이 카테고리에 표지 사진이 있는 새 글이 없어요.'; empty.hidden=cards.length>0 || !!rssLoading; }
  };
  const notify=groups=>{void paint(groups);};
  rssListeners.add(notify);
  const pending=loadRss(force);
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

// Small, local source list. Article feeds provide discovery metadata; a short
// social post may be read from its feed body when enough text is present.
function rssSources(){
  const custom = load('breeze.feed-sources',[]);
  const categories=load('breeze.feed-source-categories',{}) || {};
  return [...RSS_FEEDS, ...(Array.isArray(custom) ? custom.filter(feed=>feed && normalizeArticleUrl(feed.url)) : [])].slice(0,RSS_SOURCE_LIMIT)
    .map(feed=>({...feed,category:rssCategory(categories[feed.url] || feed.category)}));
}
