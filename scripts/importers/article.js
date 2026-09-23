/* Public article ingestion. The existing relay only transports HTML/images.
   Readability selects content; Breeze rebuilds semantic blocks rather than
   inserting its HTML. Unsupported or restricted pages keep an original link. */

const ARTICLE_MIN_CHARS = 500;      // 이보다 짧으면 본문이 아니라 미리보기입니다
// Images remain local blobs; original URLs are retained for recovery.
const ARTICLE_IMG_MIN = 200;   // 긴 변이 이보다 작으면 아이콘·배지입니다
const ARTICLE_IMG_THIN = 60;   // 짧은 변이 이보다 얇으면 구분선·추적 픽셀입니다
const ARTICLE_IMG_MAX = 8;     // 기사 한 편에 담을 사진 수
const ARTICLE_IMG_BAD = /(logo|icon|avatar|profile[-_]image|sprite|spacer|pixel|1x1|placeholder|badge|emoji|blank)/i;

/* srcset 은 "주소 폭w, 주소 폭w …" 입니다. 가장 큰 판을 고릅니다. */
function articleBestSrc(image){
  const set = image.getAttribute('srcset') || image.getAttribute('data-srcset') || '';
  let best = '', bestWidth = -1;
  set.split(',').forEach(part => {
    const piece = part.trim().split(/\s+/);
    const width = /^\d+w$/.test(piece[1] || '') ? parseInt(piece[1], 10) : 0;
    if(piece[0] && width > bestWidth){ best = piece[0]; bestWidth = width; }
  });
  return best || image.getAttribute('src') || image.getAttribute('data-src') || '';
}
function articleAbsolute(src, base){
  if(!String(src || '').trim()) return '';
  try{
    const parsed = new URL(String(src || '').trim(), base);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : '';
  }catch(e){ return ''; }
}
function articleTooSmall(image){
  const width = parseInt(image.getAttribute('width') || '0', 10);
  const height = parseInt(image.getAttribute('height') || '0', 10);
  if(!width && !height) return false;             // 크기를 안 적어 둔 곳이 더 많습니다
  const long = Math.max(width, height), short = Math.min(width, height);
  return long < ARTICLE_IMG_MIN || (short > 0 && short < ARTICLE_IMG_THIN);
}
/* 그림의 저장 키는 주소에서 만듭니다. 책 ID는 문단이 다 모여야 정해지는데,
   그 문단 안에 이미 그림 표시가 들어가 있어야 하기 때문입니다. 주소에서
   만들면 어느 기기에서 넣어도 같은 문단 → 같은 책 ID가 나옵니다. */
function articleImageKey(url){
  let h1 = 0x811c9dc5, h2 = 0x9e3779b9;
  for(let index = 0; index < url.length; index++){
    const code = url.charCodeAt(index);
    h1 = Math.imul((h1 ^ code) >>> 0, 0x01000193) >>> 0;
    h2 = Math.imul((h2 + code * (index+1)) >>> 0, 0x85ebca6b) >>> 0;
  }
  return 'art|' + h1.toString(36) + h2.toString(36);
}

const articleText = element => element.textContent.replace(/\s+/g,' ').trim();

/* en.wikipedia.org 의 매체 이름은 "en"이 아니라 "wikipedia"입니다.
   맨 뒤 도메인과 흔한 앞자리(www·en·m·amp)를 뺀 나머지가 이름입니다. */
const ARTICLE_SUBDOMAIN = /^(www|m|amp|mobile|edition|news|[a-z]{2})$/i;
function articleHostNames(host){
  const labels = host.split('.').slice(0, -1).filter(label => !ARTICLE_SUBDOMAIN.test(label));
  return labels.length ? labels : host.split('.').slice(0, 1);
}
/* "제목 - BBC News" 처럼 매체 이름이 꼬리에 붙어 옵니다. 아는 이름일 때만
   뗍니다 — 아무 꼬리나 떼면 제목의 뒷부분이 잘립니다. */
function articleStripSite(title, site, host){
  const names = [site, ...articleHostNames(host)]
    .filter(name => name && name.length >= 3)
    .map(name => name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  if(!names.length) return title;
  const trimmed = title.replace(
    new RegExp('\\s*[|\\-–—·]\\s*(' + names.join('|') + ')[^|]{0,20}$','i'), '').trim();
  return trimmed || title;
}
/* Only this boundary sees untrusted HTML. No source nodes/attributes enter Reader. */
function articleInline(element, url){
  let text = ''; const marks = [];
  function visit(node){
    if(node.nodeType === 3){ text += node.textContent.replace(/\s+/g, ' '); return; }
    if(node.nodeType !== 1) return;
    if(node.tagName === 'BR'){ text += ' '; return; }
    const start = text.length;
    for(const child of node.childNodes) visit(child);
    const tag = node.tagName.toLowerCase();
    if(['strong','b','em','i','a'].includes(tag)){
      const href = tag === 'a' ? articleAbsolute(node.getAttribute('href'), url) : '';
      marks.push({start, end:text.length, kind:tag === 'a' ? 'link' : ['b','strong'].includes(tag) ? 'strong' : 'em', href});
    }
  }
  visit(element);
  const leading = text.length - text.trimStart().length;
  text = text.trim();
  return {t:text, marks:marks.map(mark => ({...mark, start:Math.max(0,mark.start-leading), end:Math.min(text.length,mark.end-leading)}))
    .filter(mark => mark.end > mark.start && (mark.kind !== 'link' || mark.href))};
}
function parseArticleHtml(html, url){
  if(String(html).length > 3000000) return null;
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const host = new URL(url).hostname;
  // Conversations require a post identity/thread model. Never mistake replies for an article.
  if(/(^|\.)(x|twitter|reddit)\.com$/i.test(host)) return null;
  if(doc.querySelectorAll('*').length > 25000) return null;
  // Respect declared access restrictions even if the response embeds the full body.
  if(/"isAccessibleForFree"\s*:\s*(?:false|"false")/i.test(html) ||
    doc.querySelector('[class*="paywall"], [id*="paywall"]')) return null;
  const meta = name => doc.querySelector('meta[property="'+name+'"],meta[name="'+name+'"]')?.getAttribute('content') || '';
  const cover = articleAbsolute(meta('og:image'), url);
  const author = meta('author'); const publishedAt = meta('article:published_time');
  doc.querySelectorAll('script,style,noscript,template,iframe,object,embed,form,button,nav,[hidden],[aria-hidden="true"]').forEach(node => node.remove());
  // Supply a trusted base only to the inert extraction document.
  doc.querySelectorAll('base').forEach(node => node.remove());
  const base = doc.createElement('base'); base.href = url; doc.head.appendChild(base);
  const Reader = /** @type {any} */(window).Readability;
  if(!Reader) return null;
  const result = new Reader(doc, {charThreshold:ARTICLE_MIN_CHARS, maxElemsToParse:25000, keepClasses:false}).parse();
  if(!result || result.length < ARTICLE_MIN_CHARS) return null;
  const body = new DOMParser().parseFromString(result.content, 'text/html').body;
  body.querySelectorAll('script,style,iframe,object,embed,form,svg,video,audio').forEach(node=>node.remove());
  const blocks = []; let photos = 0;
  // Recursive blocks preserve order, short list items, quote paragraphs and captions.
  function visit(element){
    const tag = element.tagName.toLowerCase();
    if(tag === 'img'){
      const src = articleAbsolute(articleBestSrc(element), url);
      if(src && !articleTooSmall(element) && !ARTICLE_IMG_BAD.test(src) && photos++ < ARTICLE_IMG_MAX)
        blocks.push({r:'img',t:src,alt:element.getAttribute('alt') || ''});
      return;
    }
    if(tag === 'pre'){ blocks.push({r:'code',t:element.textContent}); return; }
    if(tag === 'table'){
      // A plain row representation keeps cell order without importing site layout.
      for(const row of element.querySelectorAll('tr')){
        const t = [...row.children].map(cell=>articleText(cell)).join(' | ');
        if(t) blocks.push({r:'p',t,table:true});
      }
      return;
    }
    const blockTags = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,table,figure,figcaption';
    if(tag === 'li' && element.querySelector('ul,ol') && ![...element.children].some(child=>child.tagName==='P')){
      const lead = element.cloneNode(true); lead.querySelectorAll('ul,ol').forEach(node=>node.remove());
      const value = articleInline(lead,url);
      if(value.t) blocks.push({r:'p',...value,list:element.parentElement.tagName === 'OL' ? String([...element.parentElement.children].indexOf(element)+1)+'.' : '•'});
      for(const child of element.children) if(['UL','OL'].includes(child.tagName)) visit(child);
      return;
    }
    if(['p','h1','h2','h3','h4','h5','h6','li','blockquote','figcaption','div'].includes(tag) && !element.querySelector(blockTags)){
      const value = articleInline(element,url);
      if(value.t){
        let r = /^h[1-6]$/.test(tag) ? (tag === 'h1' || tag === 'h2' ? 'h2' : 'h3') : element.closest('blockquote') ? 'quote' : 'p';
        const list = element.closest('li');
        const listItem = tag === 'li' ? element : list;
        const ordered = listItem?.parentElement?.tagName === 'OL';
        blocks.push({r,...value, caption:tag === 'figcaption', list:list ? (ordered ? String([...listItem.parentElement.children].indexOf(listItem)+1)+'.' : '•') : ''});
      }
      for(const image of element.querySelectorAll('img')) visit(image);
      return;
    }
    for(const child of element.children) visit(child);
  }
  visit(body);
  const title = articleStripSite(result.title || host, result.siteName || host,host);
  while(blocks[0]?.t === title) blocks.shift();
  if(blocks.filter(b=>b.r !== 'img').reduce((n,b)=>n+b.t.length,0) < ARTICLE_MIN_CHARS) return null;
  return {title, site:result.siteName || host, author:result.byline || author,
    publishedAt:result.publishedTime || publishedAt, url, cover, blocks, ...articleAssemble(title,blocks)};
}

/* 덩어리 목록 -> 저장할 문단과 조판. 사진을 못 받아 덩어리가 빠지면 다시
   부릅니다 — 문단 번호(f)가 밀리기 때문에 손으로 고칠 수 없습니다. */
function articleAssemble(title, blocks){
  let quotes = 0;
  const paras = [title, ...blocks.map(block =>
    block.r === 'img' ? IMG_MARK + articleImageKey(block.t) : block.t)];
  const formatted = blocks.map((block, index) => {
    const out = { ...block, t:paras[index+1], f:index+1 };
    if(block.r === 'quote') out.g = ++quotes;   // 인용문은 한 칸씩 따로 묶습니다
    return out;
  });
  return { paras,
    formatting: { blocks:[{r:'h1', t:title, f:0}, ...formatted],
                  start:0, levels:2, source:'article-url', createdAt:Date.now() } };
}

/* ---------- 가져오기 ---------- */

function articleProxyUrl(url, as){
  if(!SB_URL) return '';
  return SB_URL.replace(/\/+$/,'') + '/functions/v1/article?url=' + encodeURIComponent(url)
    + (as ? '&as=' + as : '');
}
/* `new URL()`은 "notaurl!!" 같은 것도 통과시킵니다. 진짜 호스트처럼 생겼는지
   여기서 한 번 더 봅니다 — 아니면 사용자는 오탈자 대신 서버 오류를 봅니다. */
const ARTICLE_HOST = /^(?:[a-z0-9-]+\.)+[a-z]{2,}$|^\d{1,3}(?:\.\d{1,3}){3}$/i;
function normalizeArticleUrl(raw){
  const text = String(raw || '').trim();
  if(!text) return '';
  const withScheme = /^https?:\/\//i.test(text) ? text : 'https://' + text;
  try{
    const parsed = new URL(withScheme);
    if(parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return ARTICLE_HOST.test(parsed.hostname) ? parsed.href : '';
  }catch(e){ return ''; }
}

async function fetchArticleHtml(url, location = {}){
  /* 스스로 CORS를 열어 둔 곳(위키백과 등)은 서버를 거치지 않습니다. */
  try{
    const direct = await fetch(url, { credentials:'omit', signal:AbortSignal.timeout(12000), headers:{ Accept:'text/html,application/rss+xml,application/atom+xml,application/xml' } });
    if(direct.ok){
      const text = await direct.text();
      if(text.length > 3000000) throw new Error('페이지가 너무 커요');
      if(text.length){ location.url = direct.url || url; return text; }
    }
  }catch(e){}

  const endpoint = articleProxyUrl(url);
  if(!endpoint) throw new Error('설정에 Supabase 주소가 없어 기사를 가져올 수 없어요');
  let response;
  try{
    response = await fetch(endpoint, {
      signal:AbortSignal.timeout(15000), headers:{ 'Authorization':'Bearer ' + SB_KEY, 'apikey': SB_KEY }
    });
  }catch(networkError){
    /* 함수가 없으면 프리플라이트 응답에 CORS 머리글이 없어서, 브라우저는
       404가 아니라 그냥 "실패"로 알려 줍니다. 둘 다 짚어 줍니다. */
    throw new Error('기사를 가져오지 못했어요. 인터넷 연결을 확인하거나 원문을 열어 주세요.');
  }
  if(response.status === 404) throw new Error(
    '지금은 기사를 가져올 수 없어요. 원문을 열어 주세요.');
  const payload = await response.json().catch(()=>null);
  if(!response.ok || !payload || !payload.html){
    throw new Error((payload && payload.message) || `기사를 열지 못했어요 (${response.status})`);
  }
  location.url = articleAbsolute(payload.url,url) || url;
  return payload.html;
}

/* 사진 한 장 가져오기. 스스로 CORS를 열어 둔 곳은 바로, 아니면 중계를 거칩니다.
   못 받으면 null — 사진 하나 때문에 기사를 통째로 못 읽으면 손해입니다. */
async function fetchArticleImage(url){
  let response = null;
  try{ response = await fetch(url, {credentials:'omit', signal:AbortSignal.timeout(10000)}); }catch(e){}
  if(!response || !response.ok){
    const endpoint = articleProxyUrl(url, 'image');
    if(!endpoint) return null;
    response = null;
    try{
      response = await fetch(endpoint, {
        signal:AbortSignal.timeout(15000), headers:{ 'Authorization':'Bearer ' + SB_KEY, 'apikey': SB_KEY }
      });
    }catch(e){}
  }
  if(!response || !response.ok) return null;
  const blob = await response.blob().catch(()=>null);
  if(!blob || !blob.size || !/^image\//.test(blob.type) || /svg/.test(blob.type)) return null;
  return blob;
}
/* 사진은 넣는 순간 기기에 담습니다. 나중에 비행기 안에서도 같은 화면이
   나와야 하고, 읽을 때마다 그 매체 서버에 발자국을 남기지 않기 위해서입니다.

   `fallbackPhoto` 는 RSS 카드에서 온 기사일 때만 옵니다 — 그 카드에 이미 떠
   있던 사진 주소입니다. 원문에서 캐낸 표지와는 늘 다른 주소입니다(피드는 제
   나름의 크기를, 원문은 og:image 를 줍니다). 그래서 카드에서는 사진이 보이는데
   담고 나면 "사진은 못 가져왔어요" 가 뜨는 일이 있었습니다. 원문 쪽이 안 되면
   눈앞에 떠 있던 그 주소로 표지를 채웁니다. */
async function attachArticleImages(parsed, fallbackPhoto){
  const wanted = [];
  if(parsed.cover) wanted.push(parsed.cover);
  parsed.blocks.forEach(block => {
    if(block.r === 'img' && wanted.indexOf(block.t) < 0) wanted.push(block.t);
  });
  if(!wanted.length && !fallbackPhoto) return { wanted:0, missed:0 };

  const fetched = await Promise.all(wanted.map(url =>
    fetchArticleImage(url).then(blob => [url, blob], () => [url, null])));
  const stored = new Set();
  for(const [url, blob] of fetched){
    if(!blob) continue;
    try{ await imgPut(articleImageKey(url), blob); stored.add(url); }catch(e){}
  }

  parsed.blocks = parsed.blocks.filter(block => block.r !== 'img' || stored.has(block.t));
  parsed.cover = stored.has(parsed.cover) ? articleImageKey(parsed.cover) : '';
  const missing = wanted.filter(url => !stored.has(url)).length;
  /* 표지 자리가 비었을 때만 갑니다 — 원문 사진이 잘 왔으면 여기는 지나갑니다. */
  let rescued = false;
  if(!parsed.cover && fallbackPhoto && !stored.has(fallbackPhoto)){
    const blob = await fetchArticleImage(fallbackPhoto);
    if(blob){
      try{
        await imgPut(articleImageKey(fallbackPhoto), blob);
        stored.add(fallbackPhoto);
        parsed.cover = articleImageKey(fallbackPhoto);
        rescued = true;
      }catch(e){}
    }
  }

  /* 어느 사진이 어느 주소에서 왔는지 적어 둡니다. 다른 기기는 이것만 있으면
     같은 사진을 스스로 받아 옵니다 — 서버에 남의 사진을 쌓아 둘 이유가
     없습니다. 주소 몇 줄이라 동기화 짐도 늘지 않습니다. */
  parsed.imgSrc = {};
  stored.forEach(url => { parsed.imgSrc[articleImageKey(url)] = url; });
  Object.assign(parsed, articleAssemble(parsed.title, parsed.blocks));
  /* 대신 받아 온 한 장은 표지 몫을 채웠으므로 못 받은 장수에서 뺍니다. 그러지
     않으면 표지가 멀쩡히 떠 있는 화면 위로 "한 장도 못 받았어요" 가 뜹니다. */
  return { wanted:wanted.length, missed:rescued ? Math.max(missing - 1, 0) : missing };
}

/* 사진 한 장 꺼내기. 다른 기기에서 받은 기사에는 문단과 사진 주소만 있고
   사진 자체는 없으므로, 그 자리에서 한 번 더 받아 기기에 담습니다.
   EPUB 삽화는 사용자 파일에서 나온 것이라 받아 올 곳이 없습니다 — 그때는
   원본 파일을 다시 연결하면 삽화도 함께 되살아납니다. */
const bookImageMissing = new Set();      // 홈은 자주 다시 그려집니다. 한 번만 시도합니다.
async function bookImageBlob(book, key){
  const cached = await imgGet(key);
  if(cached) return cached;
  if(bookImageMissing.has(key)) return null;
  const url = book && book.imgSrc && book.imgSrc[key];
  if(!url) return null;
  const blob = await fetchArticleImage(url);
  if(!blob){ bookImageMissing.add(key); return null; }
  try{ await imgPut(key, blob); }catch(e){}
  return blob;
}

async function importArticleUrl(){
  const field = document.getElementById('am-url');
  const status = document.getElementById('am-url-status');
  const button = document.getElementById('am-url-go');
  const url = normalizeArticleUrl(field.value);
  status.classList.remove('bad');
  if(!url){ status.classList.add('bad'); status.textContent = '주소를 다시 확인해 주세요'; return; }

  button.disabled = true;
  status.textContent = '기사를 가져오는 중…';
  try{
    await ingestArticle(url);
    field.value = '';
  }catch(error){
    console.error(error);
    status.classList.add('bad');
    status.textContent = '본문을 안전하게 가져오지 못했어요. ';
    status.appendChild(articleOriginalLink(url));
  }finally{
    button.disabled = false;
  }
}

function articleUrlKey(raw){
  const url = new URL(raw); url.hash = '';
  for(const key of [...url.searchParams.keys()]) if(/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
  return url.href;
}
function articleOriginalLink(url){
  const link = document.createElement('a'); link.href = articleAbsolute(url,url);
  link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '원문 열기 ↗';
  return link;
}
const articleJobs = new Map();
async function ingestArticle(url, options = {}){
  const key = articleUrlKey(url);
  if(articleJobs.has(key)) return articleJobs.get(key);
  const job = (async()=>{
    const existing = books.find(book=>book.sourceUrl && articleUrlKey(book.sourceUrl) === key);
    if(existing){ await openBook(existing); return existing; }
    const location = {};
    const html = await fetchArticleHtml(url,location);
    const parsed = parseArticleHtml(html,location.url || url);
    if(!parsed) throw new Error('본문을 안전하게 가져오지 못했어요');
    const photos = await attachArticleImages(parsed, options.photo);
    const book = await saveCasualBook(parsed, {kind:'article', site:parsed.site || options.source, sourceUrl:url,
      resolvedUrl:parsed.url, discoveredFromUrl:options.discoveredFromUrl || '',
      author:parsed.author, publishedAt:parsed.publishedAt, cover:parsed.cover || null, imgSrc:parsed.imgSrc || null});
    if(photos.missed) toast('일부 사진을 가져오지 못했어요. 원문에서 확인할 수 있어요.');
    return book;
  })();
  articleJobs.set(key,job);
  try{return await job;}finally{articleJobs.delete(key);}
}
