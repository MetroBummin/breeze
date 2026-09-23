/* ================= Discover RSS =================
   RSS는 글을 보관하는 새 저장소가 아닙니다. 목록을 잠깐 보여 주고, 고른 한 편만
   기존 URL 반입기로 넘깁니다. 그래서 오프라인·사전·단어장 흐름은 기사 URL과
   완전히 같고, 피드 자체나 카드 사진을 서버/IndexedDB에 쌓지 않습니다. */

const RSS_FEEDS = [
  { name:'The Conversation', url:'https://theconversation.com/global/articles.atom' },
  { name:'ProPublica', url:'https://www.propublica.org/feeds/propublica/main' },
];
const RSS_PER_FEED = 3;
const RSS_CACHE_MS = 10 * 60 * 1000;
const RSS_PHOTO_MS = 8000;
let rssCands = [];
let rssLoadedAt = 0;
let rssLoading = null;
const rssFeedErrors = new Set();
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
  const media = [...entry.children].find(node => ['content', 'thumbnail'].includes(rssLocal(node)) && node.getAttribute('url'));
  const image = media && media.getAttribute('url');
  if(image) return rssAbsolute(image, base);
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const img = doc.querySelector('img[src]');
  return img ? rssAbsolute(img.getAttribute('src'), base) : '';
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
function parseRss(xml, feed){
  if(String(xml).length > 3000000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('피드를 읽지 못했어요');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if(doc.querySelector('parsererror')) throw new Error('RSS 형식을 읽지 못했어요');
  if(!['rss','feed','rdf'].includes(rssLocal(doc.documentElement))) throw new Error('RSS 또는 Atom 주소를 확인해 주세요');
  const nodes = [...doc.querySelectorAll('entry, item')].slice(0,100);
  const seen = new Set();
  return nodes.map(node => {
    const content = rssText(node, ['content', 'encoded', 'description', 'summary']);
    const title = rssHtmlText(rssText(node, ['title']));
    const url = rssEntryUrl(node, feed.url);
    return {
      source:feed.name, title, url, author:rssText(node,['author','creator']), publishedAt:rssText(node,['published','updated','pubdate','date']),
      kind:rssPostKind(url), readUrl:rssLinkedArticle(content,url), contentHtml:content.slice(0,200000), feedUrl:feed.url,
      summary:rssHtmlText(content).slice(0,280), photo:rssImage(node, content, feed.url),
      date:rssDate(rssText(node, ['published', 'updated', 'pubdate', 'date'])),
    };
  }).filter(entry => {
    if(!entry.title || !entry.url) return false;
    const key = articleUrlKey(entry.url); if(seen.has(key)) return false; seen.add(key); return true;
  });
}
/* 후보를 여기서 자르지 않습니다. 사진이 실제로 뜨는지는 카드가 그려질 때
   `rssCardPhoto()` 가 딱 한 번 봅니다 — 여기서 미리 한 번 더 재 두면 "주소는
   떴는데 카드에서는 안 뜬다"는 두 가지 상태가 생기고, 사용자가 보는 것은 늘
   두 번째입니다. 그래서 이 단계는 순서만 정해서 넘깁니다. */
async function loadRss(force){
  if(!force && rssCands.length && Date.now() - rssLoadedAt < RSS_CACHE_MS) return rssCands;
  if(rssLoading) return rssLoading;
  rssLoading = Promise.all(rssSources().map(async feed => {
    try{
    const location = {};
    const html = await fetchArticleHtml(feed.url,location);
    const pictured = parseRss(html, {...feed,url:location.url || feed.url});
    rssFeedErrors.delete(feed.url);
    /* 새 글이 아직 안 올라와도 ↻가 같은 세 장만 되풀이하면 단추가 무의미합니다.
       피드의 다음 묶음으로 넘어가고, 끝에서는 다시 처음으로 이어집니다. */
    const start = pictured.length ? (rssPage * RSS_PER_FEED) % pictured.length : 0;
    return pictured.map((_, step) => pictured[(start + step) % pictured.length]);
    }catch(error){ rssFeedErrors.add(feed.url); console.warn('Feed unavailable:',feed.url); return []; }
  })).then(groups => {
    rssCands = groups;
    rssLoadedAt = Date.now();
    if(document.querySelector('.feed-discovery[open]')) renderFeedSources();
    return rssCands;
  }).finally(() => { rssLoading = null; });
  return rssLoading;
}
/* Prefer a decoded cover, but keep text-only discovery cards when an image fails. */
function rssCardPhoto(card, entry){
  const image = /** @type {HTMLImageElement} */(card.querySelector('.cover'));
  const thumb = card.querySelector('.thumb');
  return new Promise(resolve => {
    const done = ok => { clearTimeout(timer); image.onload = image.onerror = null; resolve(ok); };
    const timer = setTimeout(() => done(false), RSS_PHOTO_MS);
    image.onload = () => {
      if(image.naturalWidth < 60 || image.naturalHeight < 60) return done(false);
      image.hidden = false; thumb.classList.add('has-cover'); done(true);
    };
    image.onerror = () => done(false);
    /* `loading="lazy"` 는 일부러 두지 않습니다 — 아직 문서에 붙지 않은(그리고
       `hidden` 인) 엘리먼트는 화면에 자리가 없어 브라우저가 "가까워졌다"를 잴
       수 없고, 그러면 지연 로드가 영영 안 걸립니다. */
    image.src = entry.photo;
  });
}
function rssCard(entry){
  const card = document.createElement('article');
  const color = entry.source === 'ProPublica' ? 1 : 0;
  card.className = 'casual rss-card cpal' + color;
  card.innerHTML = `<div class="thumb rss-thumb"><img class="cover" alt="" hidden>
      <div class="src"></div><div class="lede"></div>${WAVE('#FFFFFF','.35')}</div>
    <div class="ct"></div><div class="cm"></div>`;
  card.querySelector('.src').textContent = entry.source;
  card.querySelector('.lede').textContent = entry.summary;
  card.querySelector('.ct').textContent = entry.title;
  card.querySelector('.cm').textContent = entry.date ? `${entry.date} · 탭해서 담기` : '탭해서 담기';
  card.onclick = () => importRssEntry(entry, card);
  return card;
}
async function importRssEntry(entry, card){
  if(card.classList.contains('busy')) return;
  card.classList.add('busy');
  try{
    if(entry.readUrl){
      await ingestArticle(entry.readUrl,{...entry,discoveredFromUrl:entry.url});
    }else if(entry.kind){
      await ingestFeedPost(entry);
    }else{
      await ingestArticle(entry.url,entry);
    }
  }catch(error){
    const meta = card.querySelector('.cm');
    meta.textContent = '본문을 가져오지 못했어요 · ';
    const link = articleOriginalLink(entry.url); link.onclick = event=>event.stopPropagation(); meta.appendChild(link);
  }finally{ card.classList.remove('busy'); }
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
async function ingestFeedPost(entry){
  const existing = books.find(book=>book.sourceUrl && articleUrlKey(book.sourceUrl) === articleUrlKey(entry.url));
  if(existing) return openBook(existing);
  const parsed = parseFeedPost(entry);
  if(!parsed) throw new Error('피드에서 읽을 만한 본문을 찾지 못했어요');
  const photos = await attachArticleImages(parsed);
  const book = await saveCasualBook(parsed,{kind:'article',contentType:'post',site:entry.source,
    sourceUrl:entry.url,feedUrl:entry.feedUrl,author:entry.author,publishedAt:entry.publishedAt,
    cover:parsed.cover || null,imgSrc:parsed.imgSrc || null});
  if(photos.missed) toast('일부 사진을 가져오지 못했어요. 원문에서 확인할 수 있어요.');
  return book;
}
/* Images are optional: an essay without a cover remains useful reading. */
async function rssFeedCards(entries, renderId, rail){
  const cards = [];
  for(const entry of entries){
    if(cards.length >= RSS_PER_FEED || renderId !== rssRenderIds.get(rail)) break;
    if(rssAlreadySaved(entry)) continue;
    const card = rssCard(entry);
    if(entry.photo) await rssCardPhoto(card, entry);
    cards.push(card);
  }
  return cards;
}
function renderRssCards(rail, force, empty){
  const renderId=(rssRenderIds.get(rail)||0)+1;
  rssRenderIds.set(rail,renderId);
  if(empty && !rail.querySelector('.rss-card')){
    empty.hidden=false;
    empty.textContent='새로운 기사를 불러오는 중이에요.';
  }
  return loadRss(force).then(async groups=>{
    const stamp=JSON.stringify([groups,books.map(book=>book.sourceUrl||'')]);
    if(rail.dataset.rssStamp===stamp){
      if(empty)empty.hidden=!!rail.querySelector('.rss-card');
      return;
    }
    const cards=(await Promise.all(groups.map(entries=>rssFeedCards(entries,renderId,rail)))).flat();
    if(renderId!==rssRenderIds.get(rail)||!rail.isConnected)return;
    // Keep the previous shelf visible until replacement images are decoded.
    rail.querySelectorAll('.rss-card').forEach(card=>card.remove());
    const before=rail.querySelector('.casual.add');
    cards.forEach(card=>rail.insertBefore(card,before));
    rail.dataset.rssStamp=stamp;
    if(empty){ empty.textContent=cards.length?'':'새로운 기사를 찾지 못했어요. 잠시 후 다시 시도해 주세요.'; empty.hidden=cards.length>0; }
  }).catch(error=>{
    console.error(error);
    if(empty){ empty.textContent='새로운 기사를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'; empty.hidden=false; }
  });
}
function appendRssCards(rail, force){
  return renderRssCards(rail,force);
}

// Small, local source list. Article feeds provide discovery metadata; a short
// social post may be read from its feed body when enough text is present.
function rssSources(){
  const custom = load('breeze.feed-sources',[]);
  return [...RSS_FEEDS, ...(Array.isArray(custom) ? custom.filter(feed=>feed && normalizeArticleUrl(feed.url)) : [])].slice(0,12);
}
async function discoverFeed(raw){
  let url = normalizeArticleUrl(raw); if(!url) throw new Error('주소를 확인해 주세요');
  if(rssPostKind(url) === 'x')
    throw new Error('X 계정은 공개 RSS를 제공하지 않아요. 접근 가능한 RSS/Atom 주소를 입력해 주세요.');
  const location = {};
  let body = '';
  try{body = await fetchArticleHtml(url,location); url = location.url || url;}catch{}
  try { parseRss(body,{url,name:new URL(url).hostname}); const doc=new DOMParser().parseFromString(body,'application/xml'); return {url,name:rssText(doc.querySelector('channel') || doc.documentElement,['title']) || new URL(url).hostname}; } catch {}
  const doc = new DOMParser().parseFromString(body,'text/html');
  const candidates = [...doc.querySelectorAll('link[rel~="alternate"]')]
    .filter(link=>/application\/(rss\+xml|atom\+xml)/i.test(link.getAttribute('type') || ''))
    .map(link=>({url:articleAbsolute(link.getAttribute('href'),url),name:link.getAttribute('title') || new URL(url).hostname})).filter(feed=>feed.url);
  const address = new URL(url);
  let conventional = new URL('/feed',url).href;
  if(address.hostname === 'medium.com') conventional = address.origin+'/feed'+address.pathname;
  if(/(^|\.)reddit\.com$/.test(address.hostname)) conventional = url.replace(/\/$/,'')+'/.rss';
  if(!candidates.some(feed=>feed.url === conventional)) candidates.push({url:conventional,name:address.hostname});
  for(const feed of candidates.slice(0,4)){
    try {parseRss(await fetchArticleHtml(feed.url),feed); return feed;} catch {}
  }
  throw new Error('공개 RSS/Atom을 찾지 못했어요. 피드 주소를 직접 입력해 주세요.');
}
async function addFeedSource(event){
  event.preventDefault();
  const input = /** @type {HTMLInputElement} */(document.getElementById('feed-url'));
  const status = document.getElementById('feed-status');
  const button = /** @type {HTMLButtonElement} */(document.getElementById('feed-add'));
  button.disabled = true; status.textContent = '읽을 거리를 확인하는 중…';
  try{
    const feed = await discoverFeed(input.value);
    const all = rssSources();
    if(all.some(item=>articleUrlKey(item.url) === articleUrlKey(feed.url))) throw new Error('이미 추가한 출처예요');
    if(all.length >= 12) throw new Error('출처는 최대 12개까지 추가할 수 있어요');
    const custom = all.slice(RSS_FEEDS.length); custom.push(feed);
    if(!save('breeze.feed-sources',custom)) throw new Error('출처를 저장하지 못했어요. 다시 시도해 주세요.');
    rssLoadedAt = 0; input.value = '';
    status.textContent = '추가했어요'; renderFeedSources();
    renderRssCards(document.getElementById('casual-discover-rail'),true,document.getElementById('casual-discover-empty'));
  }catch(error){status.textContent = error.message;}finally{button.disabled = false;}
}
function renderFeedSources(){
  const host = document.getElementById('feed-sources'); host.replaceChildren();
  rssSources().slice(RSS_FEEDS.length).forEach(feed=>{
    const button = document.createElement('button'); button.type = 'button'; button.textContent = feed.name + ' ×';
    button.setAttribute('aria-label',feed.name+' 출처 삭제');
    if(rssFeedErrors.has(feed.url)){
      button.classList.add('feed-unavailable');
      button.title = '지금은 피드를 불러오지 못했어요';
      button.textContent = feed.name + ' · 불러오기 실패 ×';
    }
    button.onclick = ()=>{if(!save('breeze.feed-sources',rssSources().slice(RSS_FEEDS.length).filter(item=>item.url !== feed.url))) return; rssLoadedAt=0; rssCands=[]; renderFeedSources(); renderCasualLibrary();};
    host.appendChild(button);
  });
}
