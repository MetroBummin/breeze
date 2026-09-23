/* App Group links stay in the native inbox. Listing them never acknowledges or
   copies them into web storage, so a storage quota error cannot erase a share. */
let sharedLinks = [];
const unavailableSharedLinks = new Set();
const sharedAttemptKey = item => JSON.stringify([item.id,item.savedAt]);
const nativeShareWindow = /** @type {any} */ (window);

function sharedLinkLabel(item) {
  const url = new URL(item.url);
  const source = url.hostname.replace(/^www\./, '');
  const text = [item.title, item.originalText]
    .find(value => typeof value === 'string' && value.trim() && !/^https?:\/\//i.test(value.trim()));
  if (text) {
    const firstLine = text.trim().split(/\r?\n/).find(line => line.trim() && !/^https?:\/\//i.test(line.trim()));
    if (firstLine) return {title: firstLine.trim(), source};
  }
  if (['x.com', 'twitter.com'].includes(source)) {
    const handle = url.pathname.match(/^\/([^/]+)\/status\/\d+/i)?.[1];
    if (handle) return {title: `@${handle}의 게시물`, source: 'X'};
  }
  return {title: source, source};
}

function sharedLinkDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ko-KR', {month: 'numeric', day: 'numeric'}).format(date);
}

function sharedHomeCard(item) {
  const label = sharedLinkLabel(item);
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'casual shared-card';
  card.setAttribute('aria-label', `Breeze에서 읽기: ${label.title}`);
  const thumb = document.createElement('span');
  thumb.className = 'thumb';
  const source = document.createElement('span');
  source.className = 'src';
  source.textContent = label.source;
  const lede = document.createElement('span');
  lede.className = 'lede';
  lede.textContent = label.title;
  const hint = document.createElement('span');
  hint.className = 'shared-card-hint';
  hint.textContent = 'Breeze에서 읽기';
  thumb.append(source, lede, hint);
  const title = document.createElement('span');
  title.className = 'ct';
  title.textContent = label.title;
  const meta = document.createElement('span');
  meta.className = 'cm';
  meta.textContent = [item.openedAt ? '읽은 글' : '저장한 글', sharedLinkDate(item.savedAt)].filter(Boolean).join(' · ');
  card.append(thumb, title, meta);
  card.addEventListener('click', () => openSharedArticle(item,card));
  return card;
}

function homeSharedLinkSpecs() {
  return sharedLinks.filter(item => !item.openedAt && !unavailableSharedLinks.has(sharedAttemptKey(item))).map(item => ({
    key: `shared:${item.url}`,
    stamp: JSON.stringify([item.id, item.title, item.originalText, item.savedAt]),
    create: () => sharedHomeCard(item),
  }));
}

function renderReadSharedLinks(container) {
  const read = sharedLinks.filter(item => item.openedAt && !sharedArticleBook(item) && !unavailableSharedLinks.has(sharedAttemptKey(item)));
  for (const item of read) container.appendChild(sharedHomeCard(item));
  return read.length;
}

function receiveSharedLinks(items) {
  const byURL = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item.id !== 'string' || typeof item.url !== 'string') continue;
    let url;
    try { url = new URL(item.url); } catch { continue; }
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) continue;
    const current = byURL.get(url.href);
    if (!current || String(item.savedAt || '') > String(current.savedAt || '')) {
      byURL.set(url.href, {...item, url: url.href, domain: url.hostname});
    }
  }
  sharedLinks = [...byURL.values()].sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
  if (typeof activeAppView !== 'function') return;
  if (activeAppView() === 'home') {
    const rail = document.getElementById('casual-rail');
    const scrollLeft = rail?.scrollLeft || 0;
    renderHome();
    if (rail) rail.scrollLeft = scrollLeft;
  } else if (activeAppView() === 'casuals') renderCasualLibrary();
}

window.addEventListener('breeze-share-inbox', event => receiveSharedLinks(/** @type {CustomEvent} */ (event).detail));
if (Array.isArray(nativeShareWindow.breezeShareInboxPending)) receiveSharedLinks(nativeShareWindow.breezeShareInboxPending);

function sharedArticleBook(item){
  return books.find(book=>book.sourceUrl && articleUrlKey(book.sourceUrl) === articleUrlKey(item.url));
}
async function openSharedArticle(item,card){
  if(card.disabled) return;
  card.disabled = true;
  const hint = card.querySelector('.shared-card-hint'); hint.textContent = '본문을 가져오는 중…';
  try{
    await ingestArticle(item.url);
    unavailableSharedLinks.delete(sharedAttemptKey(item));
    // Persisted Reader content is the handoff boundary. Never delete the original inbox record.
    nativeShareWindow.breezeShareInbox?.markRead?.(item.id);
  }catch(error){
    unavailableSharedLinks.add(sharedAttemptKey(item));
    if(activeAppView()==='home')renderHome();
    else if(activeAppView()==='casuals')renderCasualLibrary();
  }finally{card.disabled = false;}
}
