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
let rssEntries = [];
let rssLoadedAt = 0;
let rssLoading = null;
let rssRenderId = 0;
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
  try{ return new URL(url, base).href; }catch(error){ return ''; }
}
function rssEntryUrl(entry, base){
  const links = [...entry.children].filter(node => rssLocal(node) === 'link');
  const atom = links.find(link => (link.getAttribute('rel') || 'alternate') === 'alternate') || links[0];
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
  const key = rssUrlKey(entry.url);
  return books.some(book => book.sourceUrl && rssUrlKey(book.sourceUrl) === key);
}
function parseRss(xml, feed){
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if(doc.querySelector('parsererror')) throw new Error('RSS 형식을 읽지 못했어요');
  const nodes = [...doc.querySelectorAll('entry, item')];
  return nodes.map(node => {
    const content = rssText(node, ['content', 'encoded', 'description', 'summary']);
    const title = rssHtmlText(rssText(node, ['title']));
    const url = rssEntryUrl(node, feed.url);
    return {
      source:feed.name, title, url,
      summary:rssHtmlText(content), photo:rssImage(node, content, feed.url),
      date:rssDate(rssText(node, ['published', 'updated', 'pubdate', 'date'])),
    };
  }).filter(entry => entry.title && entry.url);
}
async function loadRss(force){
  if(!force && rssEntries.length && Date.now() - rssLoadedAt < RSS_CACHE_MS) return rssEntries;
  if(rssLoading) return rssLoading;
  rssLoading = Promise.all(RSS_FEEDS.map(async feed => {
    const html = await fetchArticleHtml(feed.url);
    const pictured = parseRss(html, feed).filter(entry => entry.photo);
    if(!pictured.length) return [];
    /* 새 글이 아직 안 올라와도 ↻가 같은 세 장만 되풀이하면 단추가 무의미합니다.
       피드의 다음 묶음으로 넘어가고, 끝에서는 다시 처음으로 이어집니다. */
    const start = (rssPage * RSS_PER_FEED) % pictured.length;
    const count = Math.min(RSS_PER_FEED, pictured.length);
    return Array.from({length:count}, (_, index) => pictured[(start + index) % pictured.length]);
  })).then(groups => {
    rssEntries = groups.flat();
    rssLoadedAt = Date.now();
    return rssEntries;
  }).finally(() => { rssLoading = null; });
  return rssLoading;
}
function rssCard(entry){
  const card = document.createElement('article');
  const color = entry.source === 'ProPublica' ? 1 : 0;
  card.className = 'casual rss-card cpal' + color;
  card.innerHTML = `<div class="thumb rss-thumb"><img class="cover" alt="" loading="lazy">
      <div class="src"></div><div class="lede"></div>${WAVE('#FFFFFF','.35')}</div>`;
  if(entry.photo){
    const image = card.querySelector('.cover');
    image.src = entry.photo;
    card.querySelector('.thumb').classList.add('has-cover');
  }
  card.querySelector('.src').textContent = entry.date ? `${entry.source} · ${entry.date}` : entry.source;
  card.querySelector('.lede').textContent = entry.summary;
  card.onclick = () => importRssEntry(entry, card);
  return card;
}
async function importRssEntry(entry, card){
  card.classList.add('busy');
  try{
    const html = await fetchArticleHtml(entry.url);
    const parsed = parseArticleHtml(html, entry.url);
    if(!parsed) throw new Error('본문을 찾지 못했어요');
    const photos = await attachArticleImages(parsed);
    await saveCasualBook(parsed, { kind:'article', site:parsed.site || entry.source,
      sourceUrl:parsed.url, cover:parsed.cover || null, imgSrc:parsed.imgSrc || null });
    if(photos.missed === photos.wanted && photos.wanted > 0) toast('글은 담았지만 사진은 못 가져왔어요');
  }catch(error){
    console.error(error);
    toast((error && error.message) || '기사를 가져오지 못했어요');
  }finally{ card.classList.remove('busy'); }
}
function appendRssCards(rail, force){
  const renderId = ++rssRenderId;
  rail.querySelectorAll('.rss-card').forEach(card => card.remove());
  loadRss(force).then(entries => {
    if(renderId !== rssRenderId || !rail.isConnected) return;
    const before = rail.querySelector('.casual.add');
    entries.filter(entry => !rssAlreadySaved(entry))
      .forEach(entry => rail.insertBefore(rssCard(entry), before));
  }).catch(error => { console.error(error); });
}
document.getElementById('rss-refresh').onclick = () => {
  rssPage++;
  rssLoadedAt = 0;
  renderHome();
};
