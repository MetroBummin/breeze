/* AO3 work import. One explicit request brings one public work, as AO3's own
   EPUB, into the existing file reader. A login-only work stops at the public
   page and never requests the download. Author notes are optional; quotations
   inside the story stay. */

const AO3_NOTES_KEY = 'breeze.ao3-notes.v1';
const AO3_HOST = /^(?:www\.)?archiveofourown\.org$/i;
const AO3_ID = /^[1-9]\d{0,11}$/;
const AO3_NOTE_LABELS = new Set(['Notes', 'Chapter Notes', 'Chapter End Notes', 'End Notes']);
const AO3_MESSAGES = {
  ao3_restricted: '이 작품은 AO3에 로그인한 사람만 볼 수 있어요. 로그인을 우회하지 않아요.',
  ao3_adult: 'AO3가 성인 작품 확인을 요구해요. AO3에서 작품을 한 번 연 다음 다시 가져와 주세요.',
  ao3_missing: '그 주소에서 작품을 찾지 못했어요.',
  ao3_unavailable: 'AO3에서 이 작품을 받을 수 없어요.',
  ao3_rate_limited: 'AO3가 잠시 요청을 멈춰 달라고 했어요. 조금 뒤에 이 작품만 다시 시도해 주세요.',
  ao3_too_big: '이 작품이 너무 커요. AO3에서 EPUB을 받아 파일로 넣어 주세요.',
  ao3_timeout: 'AO3 응답이 너무 느려요. 조금 뒤에 이 작품만 다시 시도해 주세요.',
  ao3_unreachable: 'AO3에 연결하지 못했어요. 인터넷을 확인한 뒤 다시 시도해 주세요.',
  ao3_import: '작품을 서재에 넣지 못했어요.',
  busy: '이미 한 작품을 가져오는 중이에요. 끝난 뒤에 다시 시도해 주세요.',
  bad_url: 'AO3 작품 주소를 다시 확인해 주세요.',
};

function ao3Error(code, message){
  const known = /** @type {Record<string, string>} */ (AO3_MESSAGES)[code];
  return Object.assign(new Error(message || known || AO3_MESSAGES.ao3_unavailable), {code});
}

function ao3WorkId(value){
  const text = String(value || '');
  return AO3_ID.test(text) ? text : '';
}

/* A work, a chapter of a work, a bare chapter, or the official download link.
   Anything else on AO3 — series, tags, search, users — is not one work. */
function parseAo3WorkUrl(raw){
  const text = String(raw || '').trim();
  if(!text) return null;
  let parsed;
  try { parsed = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text); }
  catch { return null; }
  if(parsed.username || parsed.password) return null;
  if(parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if(!AO3_HOST.test(parsed.hostname)) return null;
  const parts = parsed.pathname.split('/').filter(Boolean);
  let workId = '', chapterId = '';
  if(parts.length === 2 && parts[0] === 'works' && ao3WorkId(parts[1])) workId = parts[1];
  else if(parts.length === 4 && parts[0] === 'works' && ao3WorkId(parts[1]) && parts[2] === 'chapters' && ao3WorkId(parts[3])){
    workId = parts[1]; chapterId = parts[3];
  }else if(parts.length === 2 && parts[0] === 'chapters' && ao3WorkId(parts[1])) chapterId = parts[1];
  else if(parts.length === 3 && parts[0] === 'downloads' && ao3WorkId(parts[1]) && /\.epub$/i.test(parts[2])) workId = parts[1];
  else return null;
  const canonicalUrl = workId
    ? 'https://archiveofourown.org/works/' + workId + (chapterId ? '/chapters/' + chapterId : '')
    : 'https://archiveofourown.org/chapters/' + chapterId;
  return {workId, chapterId, canonicalUrl};
}

function ao3EpubUrl(workId){
  return 'https://archiveofourown.org/downloads/' + workId + '/work.epub';
}
function ao3WorkPageUrl(workId){
  return 'https://archiveofourown.org/works/' + workId + '?view_adult=true';
}
function ao3ChapterPageUrl(chapterId){
  return 'https://archiveofourown.org/chapters/' + chapterId + '?view_adult=true';
}

function ao3HasWorkBody(html){
  return /id=["']workskin["']/i.test(html) || /id=["']chapters["']/i.test(html);
}

function classifyAo3Page(html, finalUrl){
  const source = String(html || '');
  const body = ao3HasWorkBody(source);
  /* Login-only is AO3's own sentence. A redirect, a 403, or a login URL is not
     that sentence, and a public chapter can quote it beside the work body. */
  if(/This work is only available to registered users of the Archive/i.test(source) && !body) return 'ao3_restricted';
  if(/hidden by an admin/i.test(source) && !body) return 'ao3_unavailable';
  if(/can(?:'|’)t download an unrevealed work/i.test(source) && !body) return 'ao3_unavailable';
  if(/can(?:'|’)t download a draft/i.test(source) && !body) return 'ao3_unavailable';
  if(/downloads are currently disabled/i.test(source) && !body) return 'ao3_unavailable';
  if(/Adult Content Warning/i.test(source) && /willing to see such content/i.test(source) && !body) return 'ao3_adult';
  if(/Error 404|page you were looking for doesn(?:'|’)t exist/i.test(source) && !body) return 'ao3_missing';
  if(!body) return 'ao3_unavailable';
  return '';
}

function ao3StatusCode(status){
  if(status === 429) return 'ao3_rate_limited';
  if(status === 404) return 'ao3_missing';
  if(status < 200 || status >= 300) return 'ao3_unavailable';
  return '';
}

function ao3Decode(bytes){
  return new TextDecoder('utf-8').decode(bytes);
}

/* Notes live in AO3's download preface, chapter meta, and end-note blocks.
   A quotation in the chapter body is not one of those labels, so it stays. */
function stripAo3AuthorNotes(doc){
  let removed = false;
  doc.querySelectorAll('[id^="endnotes"]').forEach(node => { node.remove(); removed = true; });
  doc.querySelectorAll('#preface, #afterword, div.meta').forEach(scope => {
    for(const paragraph of [...scope.querySelectorAll('p')]){
      if(!paragraph.isConnected) continue;
      const label = paragraph.textContent.replace(/\s+/g, ' ').trim();
      if(!AO3_NOTE_LABELS.has(label)) continue;
      let sibling = paragraph.nextElementSibling;
      if(sibling && sibling.matches('blockquote, .endnote-link')){
        const drop = sibling;
        sibling = sibling.nextElementSibling;
        drop.remove();
      }
      if(sibling && sibling.matches('.endnote-link')) sibling.remove();
      paragraph.remove();
      removed = true;
    }
    scope.querySelectorAll('.endnote-link').forEach(node => { node.remove(); removed = true; });
  });
  return removed;
}

function ao3XmlText(doc, name){
  const nodes = [...doc.querySelectorAll('*')].filter(node => node.localName === name || node.localName === 'dc:' + name);
  return nodes.map(node => node.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

async function ao3EpubMeta(bytes){
  await ensureZipLib();
  const zip = await JSZip.loadAsync(bytes);
  const container = await zip.file('META-INF/container.xml')?.async('string');
  if(!container) return {title:'', author:''};
  const root = new DOMParser().parseFromString(container, 'text/xml').querySelector('rootfile');
  const opfPath = root && root.getAttribute('full-path');
  const opfFile = opfPath && zip.file(opfPath);
  if(!opfFile) return {title:'', author:''};
  const opf = new DOMParser().parseFromString(await opfFile.async('string'), 'text/xml');
  return {title: ao3XmlText(opf, 'title')[0] || '', author: ao3XmlText(opf, 'creator').join(', ')};
}

async function ao3EpubForImport(bytes, includeNotes){
  if(includeNotes) return bytes;
  await ensureZipLib();
  const zip = await JSZip.loadAsync(bytes);
  let changed = false;
  for(const name of Object.keys(zip.files)){
    if(!/\.x?html?$/i.test(name) || zip.files[name].dir) continue;
    const text = await zip.file(name).async('string');
    const doc = new DOMParser().parseFromString(text, 'text/html');
    if(!stripAo3AuthorNotes(doc)) continue;
    zip.file(name, '<!DOCTYPE html>\n' + doc.documentElement.outerHTML);
    changed = true;
  }
  return changed ? await zip.generateAsync({type:'uint8array'}) : bytes;
}

function ao3FileName(title, workId){
  const clean = String(title || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return (clean || ('AO3 ' + workId)) + '.epub';
}

function ao3BytesFrom(value){
  if(value instanceof Uint8Array) return value;
  if(value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array();
}

function ao3Concat(chunks){
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for(const chunk of chunks){ out.set(chunk, offset); offset += chunk.length; }
  return out;
}

async function ao3NativeLoad(url){
  const bridge = /** @type {any} */ (window).breezeAo3;
  if(!bridge || typeof bridge.fetch !== 'function') return null;
  const head = await bridge.fetch(url);
  if(!head || typeof head !== 'object') throw ao3Error('ao3_unreachable');
  if(head.error) throw ao3Error(head.code || 'ao3_unavailable', head.message);
  if(typeof head.text === 'string' && head.text){
    return {status:Number(head.status) || 200, url:head.finalURL || url, contentType:head.contentType || 'text/html', bytes:new TextEncoder().encode(head.text)};
  }
  const size = Number(head.size) || 0;
  if(!head.id || size < 0 || size > 40 * 1024 * 1024) throw ao3Error('ao3_unavailable');
  const chunks = [];
  for(let offset = 0; offset < size;){
    const encoded = await bridge.read(head.id, offset);
    if(typeof encoded !== 'string' || encoded.length > 4 * Math.ceil((256 * 1024) / 3)) throw ao3Error('ao3_unavailable');
    const text = atob(encoded);
    const expected = Math.min(256 * 1024, size - offset);
    if(text.length !== expected) throw ao3Error('ao3_unavailable');
    chunks.push(Uint8Array.from(text, char => char.charCodeAt(0)));
    offset += text.length;
  }
  if(typeof bridge.discard === 'function') await bridge.discard(head.id);
  return {status:Number(head.status) || 200, url:head.finalURL || url, contentType:head.contentType || '', bytes:ao3Concat(chunks)};
}

async function ao3RelayLoad(url){
  if(typeof articleProxyUrl !== 'function' || !articleProxyUrl(url, 'ao3')) throw ao3Error('ao3_unreachable');
  const endpoint = articleProxyUrl(url, 'ao3');
  let response;
  try{
    response = await fetch(endpoint, {
      signal:AbortSignal.timeout(50_000),
      headers:{'Authorization':'Bearer ' + SB_KEY, 'apikey':SB_KEY},
    });
  }catch(error){
    if(error && error.name === 'AbortError') throw ao3Error('ao3_timeout');
    throw ao3Error('ao3_unreachable');
  }
  const type = response.headers.get('content-type') || '';
  if(/epub|octet-stream|zip/i.test(type) && !/json|html/i.test(type)){
    const bytes = ao3BytesFrom(await response.arrayBuffer());
    if(response.ok && bytes[0] === 0x50 && bytes[1] === 0x4b){
      return {status:response.status, url:response.headers.get('x-ao3-url') || url, contentType:type, bytes};
    }
  }
  const payload = await response.json().catch(() => null);
  const code = payload && payload.error || (response.status === 429 ? 'ao3_rate_limited' : 'ao3_unreachable');
  throw ao3Error(code, payload && payload.message);
}

async function ao3DirectLoad(url, epub){
  const response = await fetch(url, {
    credentials:'omit',
    redirect:'follow',
    cache:'no-store',
    signal:AbortSignal.timeout(epub ? 45_000 : 20_000),
    headers:{Accept: epub ? 'application/epub+zip,application/octet-stream;q=0.8' : 'text/html,application/xhtml+xml'},
  });
  return {status:response.status, url:response.url || url, contentType:response.headers.get('content-type') || '', bytes:ao3BytesFrom(await response.arrayBuffer())};
}

async function ao3Transport(url, kind){
  const native = await ao3NativeLoad(url);
  if(native) return native;
  const epub = kind === 'epub';
  try { return await ao3DirectLoad(url, epub); }
  catch(error){
    if(error && error.name === 'AbortError') throw ao3Error('ao3_timeout');
    if(error && error.code) throw error;
    return ao3RelayLoad(url);
  }
}

function ao3PageError(loaded){
  const html = ao3Decode(loaded.bytes || new Uint8Array());
  if(classifyAo3Page(html, loaded.url) === 'ao3_restricted') return 'ao3_restricted';
  const status = ao3StatusCode(loaded.status);
  if(status) return status;
  if(loaded.bytes && loaded.bytes.length > 2_000_000) return 'ao3_too_big';
  return classifyAo3Page(html, loaded.url);
}

function ao3WorkIdFromPage(loaded){
  const fromUrl = parseAo3WorkUrl(loaded.url || '');
  if(fromUrl && fromUrl.workId) return fromUrl.workId;
  const html = ao3Decode(loaded.bytes || new Uint8Array());
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i);
  const href = canonical && (canonical[0].match(/href=["']([^"']+)["']/i) || [])[1];
  const parsed = href && parseAo3WorkUrl(href);
  if(parsed && parsed.workId) return parsed.workId;
  const found = html.match(/https?:\/\/(?:www\.)?archiveofourown\.org\/works\/([1-9]\d{0,11})(?:\/|["'#?]|$)/i);
  return found ? found[1] : '';
}

let ao3Tail = Promise.resolve();
async function importAo3WorkNow(raw, options){
  const parsed = parseAo3WorkUrl(raw);
  if(!parsed) throw ao3Error('bad_url');
  const transport = options.transport || ao3Transport;
  let workId = parsed.workId;
  const pageUrl = workId ? ao3WorkPageUrl(workId) : ao3ChapterPageUrl(parsed.chapterId);
  const page = await transport(pageUrl, 'page');
  const pageCode = ao3PageError(page);
  if(pageCode) throw ao3Error(pageCode);
  if(!workId) workId = ao3WorkIdFromPage(page);
  if(!workId) throw ao3Error('ao3_missing');
  const epub = await transport(ao3EpubUrl(workId), 'epub');
  const epubStatus = ao3StatusCode(epub.status);
  if(epubStatus) throw ao3Error(epubStatus);
  const bytes = epub.bytes instanceof Uint8Array ? epub.bytes : ao3BytesFrom(epub.bytes);
  if(!(bytes[0] === 0x50 && bytes[1] === 0x4b) || /html/i.test(epub.contentType || '')){
    const code = classifyAo3Page(ao3Decode(bytes), epub.url) || 'ao3_unavailable';
    throw ao3Error(code);
  }
  const includeNotes = options.includeNotes !== false;
  const prepared = await ao3EpubForImport(bytes, includeNotes);
  const meta = await ao3EpubMeta(prepared);
  const title = meta.title || ('AO3 ' + workId);
  const file = new File([prepared], ao3FileName(title, workId), {type:'application/epub+zip'});
  file.breezeBytes = prepared;
  const canonical = 'https://archiveofourown.org/works/' + workId;
  const receipt = await importFile(file, {
    title, author:meta.author || '', site:'AO3', sourceUrl:canonical,
    ao3:{workId, includeNotes},
  }, {folderId:options.folderId ?? '', signal:options.signal});
  if(!receipt || !receipt.bookId) throw ao3Error('ao3_import');
  const book = typeof books !== 'undefined' && books.find(item => item.id === receipt.bookId);
  if(options.present !== false && book && typeof openBook === 'function') await openBook(book);
  return book || {id:receipt.bookId, title, sourceUrl:canonical};
}

function importAo3Work(raw, options={}){
  const run = ao3Tail.then(() => importAo3WorkNow(raw, options));
  ao3Tail = run.then(() => {}, () => {});
  return run;
}

function ao3NotesChecked(){
  const box = /** @type {HTMLInputElement|null} */ (typeof document !== 'undefined' ? document.getElementById('am-ao3-notes-input') : null);
  if(box) return box.checked;
  try { return localStorage.getItem(AO3_NOTES_KEY) !== '0'; }
  catch { return true; }
}

function syncAo3NotesToggle(){
  const field = /** @type {HTMLInputElement|null} */ (document.getElementById('am-url'));
  const notes = document.getElementById('am-ao3-notes');
  if(!field || !notes) return;
  notes.hidden = !parseAo3WorkUrl(field.value);
}

async function importAo3FromComposer(){
  const field = /** @type {HTMLInputElement|null} */ (document.getElementById('am-url'));
  const status = document.getElementById('am-url-status');
  const button = /** @type {HTMLButtonElement|null} */ (document.getElementById('am-url-go'));
  if(!field || !status || !button) return;
  status.classList.remove('bad');
  button.disabled = true;
  status.textContent = 'AO3에서 작품을 가져오는 중…';
  try{
    await importAo3Work(field.value, {includeNotes:ao3NotesChecked(), folderId:typeof addImportFolder === 'string' ? addImportFolder : ''});
    field.value = '';
    status.textContent = '';
    if(typeof closeAddModal === 'function') closeAddModal();
    syncAo3NotesToggle();
  }catch(error){
    status.classList.add('bad');
    status.textContent = (error && error.message) || AO3_MESSAGES.ao3_unavailable;
  }finally{
    button.disabled = false;
  }
}

let ao3InboxReady = false;
let ao3InboxItems = [];
const ao3InboxAttempts = new Set();
let ao3InboxJob = null;

function receiveAo3Inbox(items){
  const unique = new Map();
  for(const item of Array.isArray(items) ? items : []){
    if(!item || typeof item.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(item.id)) continue;
    if(!parseAo3WorkUrl(item.url)) continue;
    unique.set(item.id, {id:item.id, url:parseAo3WorkUrl(item.url).canonicalUrl});
  }
  ao3InboxItems = [...unique.values()];
  if(ao3InboxReady) void importPendingAo3();
}

function importPendingAo3(){
  if(ao3InboxJob) return ao3InboxJob;
  if(!ao3InboxReady) return Promise.resolve();
  ao3InboxJob = (async() => {
    for(const item of ao3InboxItems){
      if(ao3InboxAttempts.has(item.id)) continue;
      ao3InboxAttempts.add(item.id);
      try{
        await importAo3Work(item.url, {includeNotes:ao3NotesChecked(), folderId:''});
        await /** @type {any} */ (window).breezeAo3?.ack?.(item.id);
      }catch(error){
        if(typeof toast === 'function') toast((error && error.message) || AO3_MESSAGES.ao3_unavailable);
        const terminal = ['ao3_restricted','ao3_adult','ao3_missing','ao3_unavailable','bad_url'].includes(error && error.code);
        if(terminal) await /** @type {any} */ (window).breezeAo3?.ack?.(item.id);
      }
    }
  })().finally(() => { ao3InboxJob = null; });
  return ao3InboxJob;
}

function startAo3Inbox(){
  ao3InboxReady = true;
  if(Array.isArray(/** @type {any} */ (window).breezeAo3Pending)) receiveAo3Inbox(/** @type {any} */ (window).breezeAo3Pending);
  return importPendingAo3();
}

if(typeof window !== 'undefined'){
  window.addEventListener('breeze-ao3-inbox', event => receiveAo3Inbox(/** @type {CustomEvent} */ (event).detail));
}
if(typeof document !== 'undefined' && document.getElementById('am-url')){
  const notes = /** @type {HTMLInputElement|null} */ (document.getElementById('am-ao3-notes-input'));
  const urlField = document.getElementById('am-url');
  try { if(notes) notes.checked = localStorage.getItem(AO3_NOTES_KEY) !== '0'; } catch {}
  if(urlField) urlField.addEventListener('input', syncAo3NotesToggle);
  if(notes) notes.addEventListener('change', () => {
    try { localStorage.setItem(AO3_NOTES_KEY, notes.checked ? '1' : '0'); } catch {}
  });
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState !== 'visible') return;
    ao3InboxAttempts.clear();
    /** @type {any} */ (window).breezeAo3?.list?.();
  });
  syncAo3NotesToggle();
}
