/* App Group links stay in the native inbox. Listing them never acknowledges or
   copies them into web storage, so a storage quota error cannot erase a share. */
let sharedLinks = [];
const nativeShareWindow = /** @type {any} */ (window);

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
  renderSharedLinks();
}

function renderSharedLinks() {
  const section = document.getElementById('shared-links-section');
  const list = document.getElementById('shared-links-list');
  if (!section || !list) return;
  section.hidden = sharedLinks.length === 0;
  document.getElementById('shared-links-count').textContent = sharedLinks.length ? `${sharedLinks.length}개` : '';
  list.replaceChildren();
  for (const item of sharedLinks) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shared-link';
    button.setAttribute('aria-label', `원문 열기: ${item.title || item.url}`);
    const copy = document.createElement('span');
    copy.className = 'shared-link-copy';
    const title = document.createElement('span');
    title.className = 'shared-link-title';
    title.textContent = (typeof item.title === 'string' && item.title.trim()) || item.url;
    const domain = document.createElement('span');
    domain.className = 'shared-link-domain';
    domain.textContent = item.domain;
    const arrow = document.createElement('span');
    arrow.className = 'shared-link-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '↗';
    copy.append(title, domain);
    button.append(copy, arrow);
    button.addEventListener('click', () => nativeShareWindow.breezeShareInbox?.open(item.id));
    list.appendChild(button);
  }
}

window.addEventListener('breeze-share-inbox', event => receiveSharedLinks(/** @type {CustomEvent} */ (event).detail));
if (Array.isArray(nativeShareWindow.breezeShareInboxPending)) receiveSharedLinks(nativeShareWindow.breezeShareInboxPending);
