/* ================= 기사 URL =================
   주소만 넣으면 본문만 골라 옵니다. 추출은 전부 기기 안에서, 브라우저가 이미
   가진 DOMParser로 합니다 — AI를 쓰지 않습니다. 서버가 하는 일은 CORS를 넘겨
   HTML 원문을 그대로 건네주는 것 하나뿐입니다(`server/article`).

   지금은 무료로 열리는 기사만 됩니다. 로그인·결제가 걸린 기사는 서버가 받아
   오는 HTML에도 본문이 없어서, 어떤 규칙을 써도 나오지 않습니다. 그럴 때는
   솔직하게 그렇다고 말하고 붙여넣기를 권합니다. */

const ARTICLE_MIN_CHARS = 500;      // 이보다 짧으면 본문이 아니라 미리보기입니다
const ARTICLE_MIN_PARA = 40;        // 문단으로 칠 최소 길이
const ARTICLE_TAIL_CHARS = 100;     // 이만큼 긴 문단이 글의 진짜 끝입니다
/* 이 소제목부터는 글이 아니라 딸린 목록입니다(위키백과·긴 해설 기사). */
const ARTICLE_END_MATTER = /^(references?|externallinks?|furtherreading|seealso|notes?|bibliography|citations?|sources?|footnotes?|relatedarticles?)$/i;
/* 기사 자체의 제목·대표 사진도 <header> 안에 듭니다(ProPublica). header는 여기서
   지우지 말고, 본문을 고른 뒤 nav·주변 장치만 걸러 냅니다. */
const ARTICLE_DROP = 'script,style,noscript,template,nav,footer,aside,form,iframe,' +
  'svg,button,select,textarea,label,figure,figcaption,table,video,audio,object,embed';
/* 클래스·id에 이런 말이 있으면 본문이 아니라 주변 장치입니다. */
/* `inline-promos`처럼 본문 컨테이너 이름에 우연히 든 말은 광고가 아닙니다
   (The Conversation). 독립된 promo 또는 명시적인 promo-box/module/banner만 버립니다. */
const ARTICLE_NOISE = /(comment|(?:^|[\s_-])promo(?:[\s_-](?:box|module|banner)|$)|related|recirc|newsletter|advert|sponsor|share|social|subscribe|cookie|consent|banner|sidebar|breadcrumb|byline|most-read|read-more|trending|tag-list|caption|disclaimer|copyright|reference|reflist|citation|footnote|navbox|infobox|catlinks|editsection|metadata|cite[-_](note|ref))/i;

/* ---------- 사진 ----------
   사진은 대부분 <figure> 안에 있는데 그 <figure>는 곧 통째로 버려집니다.
   그래서 버리기 전에 "여기에 사진이 있었다"는 표시로 바꿔 둡니다. */
/* 크기는 긴 변으로 봅니다. 가로 사진은 250x144 처럼 한쪽이 짧아서, 두 변을
   모두 재면 진짜 사진이 아이콘과 함께 걸러집니다. 짧은 변은 띠(spacer)만
   막을 만큼만 봅니다. */
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
function articleMarkImages(doc, url){
  const seen = new Set();
  for(const image of doc.querySelectorAll('img')){
    if(!image.isConnected) continue;               // 앞의 <figure>와 함께 이미 떨어져 나감
    const src = articleAbsolute(articleBestSrc(image), url);
    if(!src || articleTooSmall(image) || ARTICLE_IMG_BAD.test(src) || seen.has(src)){
      /* 버리는 것은 이 <img> 하나뿐입니다. 담고 있는 <figure>까지 지우면
         안 됩니다 — BBC 는 사진 한 장과 매체 로고를 한 <figure>에 같이
         넣어 두어서, 로고를 버리다가 사진까지 통째로 날아갔습니다. */
      image.remove();
      continue;
    }
    seen.add(src);
    const mark = doc.createElement('breeze-img');
    mark.setAttribute('data-src', src);
    (image.closest('figure') || image).replaceWith(mark);
  }
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

const articleNoisy = element => ARTICLE_NOISE.test(
  (element.getAttribute('class') || '') + ' ' + (element.id || '') + ' ' +
  (element.getAttribute('data-component') || ''));
/* 각주 항목처럼 자기 자신은 깨끗하고 담긴 상자만 이름을 가진 경우가 있어
   위로 몇 칸 올려다봅니다. 걸리면 그 덩어리 하나만 버립니다. */
function articleNoisyChain(element, root){
  let node = element;
  for(let depth = 0; node && node !== root && depth < 4; depth++, node = node.parentElement){
    if(articleNoisy(node)) return true;
  }
  return false;
}

/* 본문 후보 고르기 — 긴 <p>가 가장 많이 모인 곳이 본문입니다.
   조상으로 올라갈수록 점수를 깎아, 페이지 전체가 이기지 않게 합니다. */
function articleBestHost(scope){
  const score = new Map();
  scope.querySelectorAll('p').forEach(paragraph => {
    const length = paragraph.textContent.trim().length;
    if(length < 50) return;
    let node = paragraph.parentElement;
    for(let depth = 0; node && depth < 4; depth++, node = node.parentElement){
      if(articleNoisy(node)) break;
      score.set(node, (score.get(node) || 0) + length / (depth + 1));
    }
  });
  let best = null, top = 0;
  score.forEach((value, node) => { if(value > top){ top = value; best = node; } });
  return best;
}
/* ---------- X(트위터) ----------
   X 의 글 페이지 한 장에는 <article> 이 여럿입니다. 첫 번째가 그 글이고 나머지는
   답글입니다. 그대로 두면 답글 본문과 답글에 딸린 사진까지 책에 들어옵니다.
   실제로 그랬습니다 — 남의 책 요약 이미지 두 장이 남의 글 한가운데 끼어 있었습니다. */
const ARTICLE_X_HOST = /(^|\.)(x|twitter)\.com$/i;

function articleFocusPost(doc, host){
  if(!ARTICLE_X_HOST.test(host || '')) return;
  const posts = [...doc.querySelectorAll('article')];
  if(posts.length < 2) return;
  /* 본문이 가장 많은 것이 그 글입니다. 답글은 짧아서 긴 문단이 하나도 없습니다.
     "첫 번째"로 정하지 않는 이유는, 언젠가 순서가 바뀌어도 이 기준은 버티기 때문입니다. */
  const weigh = post => [...post.querySelectorAll('p')]
    .filter(p => p.textContent.trim().length > ARTICLE_MIN_PARA).length;
  let best = posts[0], bestScore = weigh(posts[0]);
  for(const post of posts.slice(1)){
    const score = weigh(post);
    if(score > bestScore){ best = post; bestScore = score; }
  }
  posts.forEach(post => { if(post !== best) post.remove(); });
  return best;
}

/* X 의 긴 글(Article)은 본문 사진을 <img> 로 그려 두지 않습니다. 페이지에 실려 오는
   편집기 상태(DraftJS) 안에만 주소가 있고, 화면은 그걸 보고 나중에 그립니다.
   그래서 DOM 만 보면 표지 한 장만 나오고 글 중간의 그림은 통째로 빠집니다.

   블록 목록에는 문단이 순서대로 들어 있고, 사진 자리는 type:"atomic" 입니다.
   그 바로 앞 문단의 글자를 열쇠로 삼아 화면의 같은 문단을 찾아 그 뒤에 끼웁니다.
   남의 내부 형식이라 언젠가 바뀝니다. 그래서 하나라도 어긋나면 아무 일도 하지
   않고 지금까지처럼 동작합니다 — 엉뚱한 자리에 사진을 넣는 것보다 낫습니다. */
function articleRecoverXMedia(doc, html, host){
  if(!ARTICLE_X_HOST.test(host || '')) return;
  try{
    const blockRe = /content_state:blocks:(\d+)"[^{]*\{[^}]*?text:"((?:[^"\\]|\\.)*)",type:"([^"]*)"/g;
    const blocks = [];
    let found;
    while((found = blockRe.exec(html))) blocks.push({ i:+found[1], text:found[2], type:found[3] });
    if(!blocks.length) return;
    blocks.sort((a, b) => a.i - b.i);

    const slots = [];
    blocks.forEach((block, index) => {
      if(block.type !== 'atomic') return;
      for(let back = index - 1; back >= 0; back--){
        const anchor = blocks[back].text.replace(/\\"/g, '"').trim();
        if(anchor.length >= 20){ slots.push(anchor); return; }
      }
      slots.push('');
    });
    if(!slots.length || slots.some(anchor => !anchor)) return;

    const rendered = new Set([...doc.querySelectorAll('img')]
      .map(image => (image.getAttribute('src') || '').split('?')[0]));
    const missing = [...new Set((html.match(/original_img_url:"([^"]+)"/g) || [])
      .map(one => one.slice(18, -1)))]
      .filter(src => !rendered.has(src.split('?')[0]));
    /* 자리 수와 사진 수가 정확히 같을 때만 짝지어 넣습니다. */
    if(missing.length !== slots.length) return;

    const paragraphs = [...doc.querySelectorAll('article p')];
    slots.forEach((anchor, index) => {
      const head = anchor.slice(0, 60);
      const hits = paragraphs.filter(p => p.textContent.trim().startsWith(head));
      if(hits.length !== 1) return;                 // 여러 곳에 맞으면 자리를 못 정합니다
      const mark = doc.createElement('breeze-img');
      mark.setAttribute('data-src', missing[index]);
      hits[0].after(mark);
    });
  }catch(error){ /* 남의 내부 형식입니다. 실패하면 없던 일로 둡니다. */ }
}

function articleRoot(doc, preferred){
  /* 어느 덩어리가 본문인지 이미 아는 경우가 있습니다(X 는 답글을 떼어 내면서 골라 둡니다).
     그때는 찾지 않습니다 — querySelector 는 문서에 먼저 나오는 것을 주므로, X 에서는
     <main> 이 <article> 보다 앞이라 화면 제목("Post")까지 본문으로 딸려 왔습니다. */
  if(preferred && preferred.isConnected) return preferred;
  const marked = doc.querySelector('article, [itemprop="articleBody"], main');
  const scored = articleBestHost(doc);
  if(!marked) return scored || doc.body;
  if(!scored) return marked;
  /* 사이트가 붙여 둔 <article> 안에 본문이 다 들어 있으면 그쪽을 믿습니다.
     밖이면 실제로 글이 모인 쪽을 씁니다(<article>이 목록인 경우). */
  return marked.contains(scored) ? marked : scored;
}

const articleText = element => element.textContent.replace(/\s+/g,' ').trim();

function articleSite(doc, host){
  const meta = doc.querySelector('meta[property="og:site_name"]');
  const name = meta && (meta.getAttribute('content') || '').trim();
  return name || articleHostNames(host)[0] || host;
}
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
function articleTitle(doc, root, site, host){
  const meta = doc.querySelector('meta[property="og:title"], meta[name="twitter:title"]');
  const fromMeta = meta && (meta.getAttribute('content') || '').trim();
  const heading = root.querySelector('h1') || doc.querySelector('h1');
  /* X 는 og:title 이 늘 "이름 (@아이디) on X" 라 무슨 글인지 알 수 없습니다.
     긴 글에는 진짜 제목이 본문 h1 에 들어 있으므로 그쪽을 먼저 봅니다. */
  const raw = (ARTICLE_X_HOST.test(host || '') && heading && articleText(heading))
    || fromMeta || (heading && articleText(heading)) || (doc.title || '').trim() || host;
  return articleStripSite(raw, site, host);
}

function articleBlockRole(element){
  const tag = element.tagName.toLowerCase();
  if(tag === 'h1' || tag === 'h2') return 'h2';
  if(tag === 'h3' || tag === 'h4') return 'h3';
  if(tag === 'blockquote') return 'quote';
  return 'p';
}

/* HTML -> 읽을 수 있는 문단들. 못 찾으면 null 을 돌려줍니다. */
function parseArticleHtml(html, url){
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  if(!doc || !doc.body) return null;
  let host = '';
  try{ host = new URL(url).hostname; }catch(e){}
  /* 순서가 중요합니다. 답글을 먼저 떼어 내야 답글 사진이 자리 표시로 바뀌지 않고,
     빠진 사진을 먼저 끼워 넣어야 그 자리도 함께 표시로 바뀝니다. */
  const focus = articleFocusPost(doc, host);
  articleRecoverXMedia(doc, html, host);
  articleMarkImages(doc, url);      // <figure>를 버리기 전에 사진 자리를 남깁니다
  doc.querySelectorAll(ARTICLE_DROP).forEach(node => node.remove());
  doc.querySelectorAll('[aria-hidden="true"],[hidden]').forEach(node => node.remove());
  /* 각주 번호는 문단 안에 박혀 있어 덩어리째 버릴 수 없습니다.
     "knows.[1][2][3]" 처럼 읽는 흐름을 끊으므로 낱개로 뗍니다. */
  doc.querySelectorAll('sup').forEach(node => {
    if(/^\[?\s*(\d{1,3}|[a-z])\s*\]?$/i.test(node.textContent.trim())) node.remove();
  });

  const root = articleRoot(doc, focus);
  const site = articleSite(doc, host);
  const title = articleTitle(doc, root, site, host);

  let blocks = [];
  for(const element of root.querySelectorAll('p,h1,h2,h3,h4,blockquote,li,breeze-img')){
    if(element.tagName.toLowerCase() === 'breeze-img'){
      if(articleNoisyChain(element, root)) continue;   // 광고·추천 상자에 딸린 사진
      blocks.push({ r:'img', t:element.getAttribute('data-src') });
      continue;
    }
    // 다른 덩어리를 품고 있으면 껍데기입니다. 안쪽에서 다시 만납니다.
    if(element.querySelector('p,li,blockquote,h1,h2,h3,h4')) continue;
    if(articleNoisyChain(element, root)) continue;
    const text = articleText(element);
    if(!text) continue;
    const role = articleBlockRole(element);
    // "References" 아래는 글이 아니라 딸린 목록입니다. 거기서 멈춥니다.
    if(role !== 'p' && ARTICLE_END_MATTER.test(text.replace(/[\s:[\]]/g,''))) break;
    const isList = element.tagName.toLowerCase() === 'li';
    if(role === 'p' && text.length < (isList ? 60 : ARTICLE_MIN_PARA)) continue;
    if(role !== 'p' && text.length > 200) continue;    // 제목이 이렇게 길 리 없습니다
    if(blocks.length && blocks[blocks.length-1].t === text) continue; // 큰제목 중복
    blocks.push({ r:role, t:text });
  }

  /* 글 끝에는 "Most viewed", 분류 목록 같은 것이 따라붙습니다. 규칙으로
     하나하나 알아보는 대신, 마지막 진짜 문단 뒤를 통째로 자릅니다 —
     따라붙는 것은 언제나 짧기 때문입니다. */
  let end = blocks.length;
  while(end > 0 && !(blocks[end-1].r === 'p' && blocks[end-1].t.length >= ARTICLE_TAIL_CHARS)) end--;
  blocks.length = Math.max(end, 0);

  /* 사진 수는 여기서 자릅니다. 표시할 때 세면 표 안의 배지처럼 곧 버려질
     그림까지 자릿수를 차지해, 정작 본문 사진이 밀려납니다. */
  let photos = 0;
  blocks = blocks.filter(block => block.r !== 'img' || ++photos <= ARTICLE_IMG_MAX);

  const body = blocks.filter(block => block.r === 'p' || block.r === 'quote');
  const chars = body.reduce((sum, block) => sum + block.t.length, 0);
  if(!body.length || chars < ARTICLE_MIN_CHARS) return null;

  // 제목이 첫 덩어리로 또 들어와 있으면 뺍니다.
  while(blocks.length && blocks[0].r !== 'p' && blocks[0].r !== 'img' && blocks[0].t === title) blocks.shift();

  /* 대표 사진. 매체가 og:image 로 알려주는 것이 가장 정확하고, 없으면 본문
     첫 사진을 씁니다. Casuals 카드의 표지가 됩니다. */
  const meta = doc.querySelector('meta[property="og:image"], meta[name="twitter:image"]');
  const lead = meta ? articleAbsolute(meta.getAttribute('content'), url) : '';
  const firstInBody = blocks.find(block => block.r === 'img');
  const cover = lead || (firstInBody ? firstInBody.t : '');

  return { title, site, url, cover, blocks, ...articleAssemble(title, blocks) };
}

/* 덩어리 목록 -> 저장할 문단과 조판. 사진을 못 받아 덩어리가 빠지면 다시
   부릅니다 — 문단 번호(f)가 밀리기 때문에 손으로 고칠 수 없습니다. */
function articleAssemble(title, blocks){
  let quotes = 0;
  const paras = [title, ...blocks.map(block =>
    block.r === 'img' ? IMG_MARK + articleImageKey(block.t) : block.t)];
  const formatted = blocks.map((block, index) => {
    const out = { r:block.r, t:paras[index+1], f:index+1 };
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

async function fetchArticleHtml(url){
  /* 스스로 CORS를 열어 둔 곳(위키백과 등)은 서버를 거치지 않습니다. */
  try{
    const direct = await fetch(url, { headers:{ Accept:'text/html' } });
    if(direct.ok){
      const text = await direct.text();
      if(text.length > 200) return text;
    }
  }catch(e){}

  const endpoint = articleProxyUrl(url);
  if(!endpoint) throw new Error('설정에 Supabase 주소가 없어 기사를 가져올 수 없어요');
  let response;
  try{
    response = await fetch(endpoint, {
      headers:{ 'Authorization':'Bearer ' + SB_KEY, 'apikey': SB_KEY }
    });
  }catch(networkError){
    /* 함수가 없으면 프리플라이트 응답에 CORS 머리글이 없어서, 브라우저는
       404가 아니라 그냥 "실패"로 알려 줍니다. 둘 다 짚어 줍니다. */
    throw new Error('기사 서버에 닿지 못했어요. 인터넷 연결을 확인하거나, '
      + '아직 배포 전이라면 supabase functions deploy article 을 한 번 실행해 주세요.');
  }
  if(response.status === 404) throw new Error(
    '기사 가져오기 기능이 아직 서버에 배포되지 않았어요 (supabase functions deploy article)');
  const payload = await response.json().catch(()=>null);
  if(!response.ok || !payload || !payload.html){
    throw new Error((payload && payload.message) || `기사를 열지 못했어요 (${response.status})`);
  }
  return payload.html;
}

/* 사진 한 장 가져오기. 스스로 CORS를 열어 둔 곳은 바로, 아니면 중계를 거칩니다.
   못 받으면 null — 사진 하나 때문에 기사를 통째로 못 읽으면 손해입니다. */
async function fetchArticleImage(url){
  let response = null;
  try{ response = await fetch(url); }catch(e){}
  if(!response || !response.ok){
    const endpoint = articleProxyUrl(url, 'image');
    if(!endpoint) return null;
    response = null;
    try{
      response = await fetch(endpoint, {
        headers:{ 'Authorization':'Bearer ' + SB_KEY, 'apikey': SB_KEY }
      });
    }catch(e){}
  }
  if(!response || !response.ok) return null;
  const blob = await response.blob().catch(()=>null);
  if(!blob || !blob.size || !/^image\//.test(blob.type) || /svg/.test(blob.type)) return null;
  return blob;
}
/* 사진은 넣는 순간 기기에 담습니다. 나중에 비행기 안에서도 같은 화면이
   나와야 하고, 읽을 때마다 그 매체 서버에 발자국을 남기지 않기 위해서입니다. */
async function attachArticleImages(parsed){
  const wanted = [];
  if(parsed.cover) wanted.push(parsed.cover);
  parsed.blocks.forEach(block => {
    if(block.r === 'img' && wanted.indexOf(block.t) < 0) wanted.push(block.t);
  });
  if(!wanted.length) return { wanted:0, missed:0 };

  const fetched = await Promise.all(wanted.map(url =>
    fetchArticleImage(url).then(blob => [url, blob], () => [url, null])));
  const stored = new Set();
  for(const [url, blob] of fetched){
    if(!blob) continue;
    try{ await imgPut(articleImageKey(url), blob); stored.add(url); }catch(e){}
  }

  parsed.blocks = parsed.blocks.filter(block => block.r !== 'img' || stored.has(block.t));
  parsed.cover = stored.has(parsed.cover) ? articleImageKey(parsed.cover) : '';
  /* 어느 사진이 어느 주소에서 왔는지 적어 둡니다. 다른 기기는 이것만 있으면
     같은 사진을 스스로 받아 옵니다 — 서버에 남의 사진을 쌓아 둘 이유가
     없습니다. 주소 몇 줄이라 동기화 짐도 늘지 않습니다. */
  parsed.imgSrc = {};
  stored.forEach(url => { parsed.imgSrc[articleImageKey(url)] = url; });
  Object.assign(parsed, articleAssemble(parsed.title, parsed.blocks));
  return { wanted:wanted.length, missed:wanted.length - stored.size };
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

/* ================= 사진을 글과 함께 보내기 =================
   지금까지 다른 기기로는 사진의 주소만 갔습니다. 받는 쪽이 그 주소로 다시
   받아 오면 된다는 생각이었는데, 자주 실패합니다 — 매체는 흔히 자기 페이지에서
   온 요청에만 사진을 내주고, CDN 주소는 며칠이면 바뀌며, 중계를 한 번 더 타야
   합니다. 그래서 폰에서 받은 기사는 어떤 건 사진이 뜨고 어떤 건 안 떴습니다.
   이미 이 기기에 있는 바이트를 함께 보내면 그 갈림이 사라집니다.

   예산을 둡니다. 사진 여덟 장을 통째로 실으면 "짧은 글"이 몇 MB가 되는데,
   짧은 글은 묻지도 않고 저절로 내려받습니다 — 셀룰러로 그러면 안 됩니다.
   예산을 넘는 사진은 지금까지처럼 주소로 받아 옵니다. 없어지는 길이 아니라
   뒷길로 남습니다.

   ── 보내기 전에 한 번 줄입니다 ──
   매체가 내주는 사진은 2000~3000px 짜리 원본입니다. 인쇄용 크기지, 폰에서
   가로 400px 로 보는 카드에 쓸 크기가 아닙니다. 긴 변 1400px · JPEG 로 다시
   구우면 대개 8배쯤 줄어듭니다 — 화면에서 달라 보이는 것은 없고, 서버에 쌓이는
   양과 셀룰러로 흐르는 양만 줄어듭니다.

   기기에 있는 원본은 건드리지 않습니다. 줄인 것은 **보내는 판**일 뿐이라,
   이 기기에서 읽을 때는 늘 원본을 봅니다. */
const BOOK_PHOTO_BUDGET = 700_000;   // 실제로 오가는 크기(base64) 기준
const PHOTO_MAX_EDGE    = 1400;
const PHOTO_QUALITY     = 0.72;
const PHOTO_SKIP_UNDER  = 120_000;   // 이미 작은 사진은 다시 굽지 않습니다

async function decodeImage(blob){
  if(typeof createImageBitmap === 'function'){
    try{ return await createImageBitmap(blob); }catch(e){}
  }
  return await new Promise(resolve => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload  = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    image.src = url;
  });
}
/* 못 줄이면 원본을 그대로 돌려줍니다. 사진을 못 보내는 것보다 크게 보내는
   편이 낫고, 예산이 뒤에서 한 번 더 막아 줍니다. */
async function shrinkPhotoForTransport(blob){
  if(!blob || blob.size <= PHOTO_SKIP_UNDER) return blob;
  const source = await decodeImage(blob);
  const width  = source && (source.width  || source.naturalWidth);
  const height = source && (source.height || source.naturalHeight);
  if(!width || !height) return blob;
  const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width  = Math.max(1, Math.round(width  * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  try{
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    const baked = await new Promise(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', PHOTO_QUALITY));
    if(source.close) source.close();
    return (baked && baked.size && baked.size < blob.size) ? baked : blob;
  }catch(e){ return blob; }
}

function blobToDataUrl(blob){
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload  = () => resolve(String(reader.result || ''));
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
}
function dataUrlToBlob(value){
  const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(String(value || ''));
  if(!match) return null;
  try{
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for(let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: match[1] });
  }catch(e){ return null; }
}
/* 표지가 먼저, 그다음 본문에 나오는 차례대로. 예산이 모자라면 뒤가 잘리므로
   순서가 곧 중요도입니다 — 카드에 뜨는 표지가 가장 아쉬운 한 장입니다. */
function bookPhotoKeys(book, coverOnly){
  const keys = [];
  if(book.cover) keys.push(book.cover);
  if(coverOnly) return keys;
  (book.paras || []).forEach(paragraph => {
    if(!paragraph.startsWith(IMG_MARK)) return;
    const key = paragraph.slice(IMG_MARK.length);
    if(keys.indexOf(key) < 0) keys.push(key);
  });
  return keys;
}
async function collectBookPhotos(book, coverOnly){
  const photos = {};
  let spent = 0;
  for(const key of bookPhotoKeys(book, coverOnly)){
    const stored = await imgGet(key);
    if(!stored || !stored.size) continue;
    const dataUrl = await blobToDataUrl(await shrinkPhotoForTransport(stored));
    /* 예산은 base64 로 부풀린 뒤의 길이로 셉니다. 원본 바이트로 세면 실제로
       오가는 양은 언제나 그보다 3분의 1 더 많습니다. */
    if(!dataUrl || spent + dataUrl.length > BOOK_PHOTO_BUDGET) continue;
    photos[key] = dataUrl;
    spent += dataUrl.length;
  }
  return photos;
}
/* 받는 쪽. 이 기기에 이미 있는 사진은 건드리지 않습니다 — 같은 열쇠라도
   내가 직접 받아 둔 것이 언제나 더 믿을 만합니다. */
async function storeBookPhotos(photos){
  for(const key of Object.keys(photos || {})){
    if(await imgGet(key)) continue;
    const blob = dataUrlToBlob(photos[key]);
    if(!blob) continue;
    try{ await imgPut(key, blob); }catch(e){}
  }
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
    const html = await fetchArticleHtml(url);
    const parsed = parseArticleHtml(html, url);
    if(!parsed){
      status.classList.add('bad');
      status.innerHTML = '본문을 찾지 못했어요.<br>로그인이나 결제가 필요한 기사일 수 있어요 — 본문을 복사해서 붙여넣어 주세요.';
      return;
    }
    status.textContent = '사진을 담는 중…';
    const photos = await attachArticleImages(parsed);
    field.value = '';
    await saveCasualBook(parsed, { kind:'article', site:parsed.site, sourceUrl:parsed.url,
                                   cover:parsed.cover || null, imgSrc:parsed.imgSrc || null });
    /* 사진 실패를 조용히 넘기면 "사진이 원래 없는 기사"와 구별되지 않습니다.
       한 장도 못 받았다면 중계가 배포되지 않은 것이 거의 확실합니다. */
    if(photos.missed === photos.wanted && photos.wanted > 0){
      toast('사진을 못 가져왔어요 — supabase functions deploy article 을 한 번 실행해 주세요');
    }else if(photos.missed){
      toast(`사진 ${photos.missed}장은 못 가져왔어요`);
    }
  }catch(error){
    console.error(error);
    status.classList.add('bad');
    status.textContent = error.message || '기사를 가져오지 못했어요';
  }finally{
    button.disabled = false;
  }
}
