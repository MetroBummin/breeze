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
const ARTICLE_DROP = 'script,style,noscript,template,nav,header,footer,aside,form,iframe,' +
  'svg,button,select,textarea,label,figure,figcaption,table,video,audio,object,embed';
/* 클래스·id에 이런 말이 있으면 본문이 아니라 주변 장치입니다. */
const ARTICLE_NOISE = /(comment|promo|related|recirc|newsletter|advert|sponsor|share|social|subscribe|cookie|consent|banner|sidebar|breadcrumb|byline|most-read|read-more|trending|tag-list|caption|disclaimer|copyright|reference|reflist|citation|footnote|navbox|infobox|catlinks|editsection|metadata|cite[-_](note|ref))/i;

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
function articleRoot(doc){
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
  const raw = fromMeta || (heading && articleText(heading)) || (doc.title || '').trim() || host;
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
  doc.querySelectorAll(ARTICLE_DROP).forEach(node => node.remove());
  doc.querySelectorAll('[aria-hidden="true"],[hidden]').forEach(node => node.remove());
  /* 각주 번호는 문단 안에 박혀 있어 덩어리째 버릴 수 없습니다.
     "knows.[1][2][3]" 처럼 읽는 흐름을 끊으므로 낱개로 뗍니다. */
  doc.querySelectorAll('sup').forEach(node => {
    if(/^\[?\s*(\d{1,3}|[a-z])\s*\]?$/i.test(node.textContent.trim())) node.remove();
  });

  let host = '';
  try{ host = new URL(url).hostname; }catch(e){}
  const root = articleRoot(doc);
  const site = articleSite(doc, host);
  const title = articleTitle(doc, root, site, host);

  const blocks = [];
  for(const element of root.querySelectorAll('p,h1,h2,h3,h4,blockquote,li')){
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

  const body = blocks.filter(block => block.r === 'p' || block.r === 'quote');
  const chars = body.reduce((sum, block) => sum + block.t.length, 0);
  if(!body.length || chars < ARTICLE_MIN_CHARS) return null;

  // 제목이 첫 덩어리로 또 들어와 있으면 뺍니다.
  while(blocks.length && blocks[0].r !== 'p' && blocks[0].t === title) blocks.shift();

  let quotes = 0;
  const paras = [title, ...blocks.map(block => block.t)];
  const formatted = blocks.map((block, index) => {
    const out = { r:block.r, t:block.t, f:index+1 };
    if(block.r === 'quote') out.g = ++quotes;   // 인용문은 한 칸씩 따로 묶습니다
    return out;
  });
  return { title, site, url, paras,
    formatting: { blocks:[{r:'h1', t:title, f:0}, ...formatted],
                  start:0, levels:2, source:'article-url', createdAt:Date.now() } };
}

/* ---------- 가져오기 ---------- */

function articleProxyUrl(url){
  if(!SB_URL) return '';
  return SB_URL.replace(/\/+$/,'') + '/functions/v1/article?url=' + encodeURIComponent(url);
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
    field.value = '';
    await saveCasualBook(parsed, { kind:'article', site:parsed.site, sourceUrl:parsed.url });
  }catch(error){
    console.error(error);
    status.classList.add('bad');
    status.textContent = error.message || '기사를 가져오지 못했어요';
  }finally{
    button.disabled = false;
  }
}
