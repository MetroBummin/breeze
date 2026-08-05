/* Rolling AI typography.
   The model sees roughly eight upcoming display pages and returns positions
   and roles only. Source text never comes back from the model and is never
   replaced. */

const ROLLING_FORMAT_VERSION = 2;
const ROLLING_FORMAT_PAGE_CHARS = 1700;
const ROLLING_FORMAT_WINDOW_PAGES = 8;
const ROLLING_FORMAT_WINDOW_CHARS = ROLLING_FORMAT_PAGE_CHARS * ROLLING_FORMAT_WINDOW_PAGES;
const ROLLING_FORMAT_PREFETCH_CHARS = ROLLING_FORMAT_PAGE_CHARS * 2;
const ROLLING_FORMAT_MAX_ITEMS = 140;
const ROLLING_FORMAT_MAX_WINDOWS = 24;
const ROLLING_FORMAT_ROLES = new Set(['p', 'h1', 'h2', 'h3', 'quote', 'note']);
const rollingFormatJobs = new Map();
let rollingFormatTimer = null;
let rollingFormatPausedUntil = 0;

function formattingSourceSpan(paragraphs, block){
  if(!block || block.f == null || block.r === 'img') return 1;
  if(block.t === paragraphs[block.f]) return 1;
  let joined = '';
  for(let count = 1; count <= 12 && block.f + count <= paragraphs.length; count++){
    joined += (joined ? ' ' : '') + paragraphs[block.f + count - 1];
    if(joined === block.t) return count;
    if(joined.length > String(block.t || '').length) break;
  }
  return 1;
}

function baselineRoleInfo(book){
  const paragraphs = book.paras || [];
  const info = paragraphs.map((text, index) => ({
    r: text.startsWith(IMG_MARK) ? 'img' : 'p',
    start:index,
    n:1,
    group:index,
    join:false,
    before:'none',
  }));
  const formatting = book.formatting || book.tidy || null;
  const blocks = formatting && Array.isArray(formatting.blocks) ? formatting.blocks : [];

  blocks.forEach(block => {
    const start = Math.max(0, Math.floor(Number(block.f) || 0));
    if(start >= paragraphs.length || paragraphs[start].startsWith(IMG_MARK)) return;
    const role = ROLLING_FORMAT_ROLES.has(block.r) ? block.r : 'p';
    const span = Math.min(formattingSourceSpan(paragraphs, block), paragraphs.length - start);
    if(role === 'quote' || role === 'note'){
      info[start] = { r:role, start, n:1, group:block.g == null ? start : block.g,
                      join:false, before:'none' };
      return;
    }
    info[start] = { r:role, start, n:span, group:start,
                    join:span > 1, before:'none' };
    for(let offset = 1; offset < span; offset++){
      info[start + offset] = { r:role, start, n:span, group:start,
                               join:true, before:'none' };
    }
  });
  return info;
}

function normalizedRollingWindows(book){
  const state = book.aiFormatting;
  if(!state || state.version !== ROLLING_FORMAT_VERSION || !Array.isArray(state.windows)) return [];
  return state.windows.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

function rollingRoleInfo(book){
  const paragraphs = book.paras || [];
  const info = baselineRoleInfo(book);

  normalizedRollingWindows(book).forEach(windowState => {
    const from = Math.max(0, Math.floor(Number(windowState.from) || 0));
    const to = Math.min(paragraphs.length, Math.floor(Number(windowState.to) || 0));

    // A processed window is 100% AI-owned. Omitted items mean ordinary paragraphs,
    // not "keep the heuristic guess".
    for(let index = from; index < to; index++){
      if(paragraphs[index].startsWith(IMG_MARK)) continue;
      info[index] = { r:'p', start:index, n:1, group:index,
                      join:false, before:'none' };
    }

    (windowState.ops || []).forEach(op => {
      const start = op.i;
      const span = op.n;
      const before = op.b || 'none';
      const shouldJoin = !!op.j || op.r.charAt(0) === 'h';
      if((op.r === 'quote' || op.r === 'note') && !shouldJoin){
        for(let offset = 0; offset < span; offset++){
          const index = start + offset;
          info[index] = { r:op.r, start:index, n:1, group:start,
                          join:false, before:offset === 0 ? before : 'none' };
        }
        return;
      }

      if(shouldJoin && span > 1){
        for(let offset = 0; offset < span; offset++){
          info[start + offset] = { r:op.r, start, n:span, group:start,
                                   join:true, before:offset === 0 ? before : 'none' };
        }
      }else{
        for(let offset = 0; offset < span; offset++){
          const index = start + offset;
          info[index] = { r:op.r, start:index, n:1, group:index,
                          join:false, before:offset === 0 ? before : 'none' };
        }
      }
    });
  });
  return info;
}

function buildRollingDisplayBlocks(book){
  const paragraphs = book.paras || [];
  const info = rollingRoleInfo(book);
  const blocks = [];

  for(let index = 0; index < paragraphs.length; index++){
    if(paragraphs[index].startsWith(IMG_MARK)){
      blocks.push({ r:'img', t:paragraphs[index], f:index });
      continue;
    }
    const role = info[index] || { r:'p', start:index, n:1, group:index, join:false, before:'none' };
    if(role.start !== index) continue;

    if(role.r === 'quote' || role.r === 'note'){
      const span = Math.max(1, role.n || 1);
      const text = role.join
        ? paragraphs.slice(index, index + span).join(' ')
        : paragraphs[index];
      blocks.push({ r:role.r, t:text, f:index, g:role.group,
                    before:role.before });
      continue;
    }

    const span = Math.max(1, role.n || 1);
    const text = role.join
      ? paragraphs.slice(index, index + span).join(' ')
      : paragraphs[index];
    blocks.push({ r:role.r, t:text, f:index, before:role.before });
  }
  return blocks;
}

function rollingWindowBounds(book, requestedStart){
  const paragraphs = book.paras || [];
  const from = Math.max(0, Math.min(paragraphs.length - 1, Math.floor(requestedStart) || 0));
  let to = from;
  let chars = 0;
  let items = 0;

  while(to < paragraphs.length && items < ROLLING_FORMAT_MAX_ITEMS){
    chars += paragraphs[to].startsWith(IMG_MARK) ? 300 : paragraphs[to].length;
    to++;
    items++;
    if(chars >= ROLLING_FORMAT_WINDOW_CHARS && items >= 10) break;
  }
  return { from, to, chars };
}

function rollingCharsBetween(book, from, to){
  let chars = 0;
  for(let index = from; index < to && index < book.paras.length; index++){
    chars += book.paras[index].startsWith(IMG_MARK) ? 300 : book.paras[index].length;
  }
  return chars;
}

function rollingWindowItems(book, bounds){
  const current = rollingRoleInfo(book);
  return book.paras.slice(bounds.from, bounds.to).map((text, offset) => {
    const index = bounds.from + offset;
    const signal = (book.layoutSignals || [])[index] || {};
    return {
      i:index,
      t:text.startsWith(IMG_MARK) ? '[IMAGE]' : text.slice(0, 3000),
      r:(current[index] || {}).r || 'p',
      z:Number(signal.z) || 1,
      w:!!signal.b,
      c:!!signal.c,
      d:Number(signal.in) || 0,
    };
  });
}

function rollingJoinLooksSafe(paragraphs, start, span){
  if(span <= 1) return true;
  let hasBrokenBoundary = false;
  for(let index = start; index < start + span - 1; index++){
    const left = String(paragraphs[index] || '').trim();
    const right = String(paragraphs[index + 1] || '').trim();
    if(left.startsWith(IMG_MARK) || right.startsWith(IMG_MARK)) return false;
    const leftComplete = /[.!?]["'”’)]?$/.test(left);
    const rightStartsNew = /^[A-ZÀ-Þ0-9“"'‘]/.test(right);
    if(!leftComplete || !rightStartsNew) hasBrokenBoundary = true;
  }
  return hasBrokenBoundary;
}

function safeRollingRole(paragraphs, start, span, requestedRole){
  if(requestedRole.charAt(0) !== 'h') return requestedRole;
  const limits = {
    h1:{ chars:120, words:18, spans:3 },
    h2:{ chars:180, words:28, spans:4 },
    h3:{ chars:240, words:40, spans:4 },
  };
  const limit = limits[requestedRole];
  const text = paragraphs.slice(start, start + span).join(' ').trim();
  const words = text ? text.split(/\s+/).length : 0;
  const sentenceEnds = (text.match(/[.!?](?=(?:["'”’\])]|\s|$))/g) || []).length;
  if(!limit || text.length > limit.chars || words > limit.words
      || span > limit.spans || sentenceEnds > 1) return 'p';
  return requestedRole;
}

function validateRollingOps(book, bounds, rawOps){
  if(!Array.isArray(rawOps) || rawOps.length > ROLLING_FORMAT_MAX_ITEMS) return null;
  const ops = [];
  let lastEnd = bounds.from;

  for(const raw of rawOps){
    const i = Math.floor(Number(raw.i));
    const requestedSpan = Math.max(1, Math.min(12, Math.floor(Number(raw.n) || 1)));
    const requestedRole = String(raw.r || '');
    if(!Number.isFinite(i) || i < bounds.from || i + requestedSpan > bounds.to) return null;
    if(i < lastEnd || !ROLLING_FORMAT_ROLES.has(requestedRole)) return null;
    for(let index = i; index < i + requestedSpan; index++){
      if(book.paras[index].startsWith(IMG_MARK)) return null;
    }
    const joinIsSafe = !raw.j || rollingJoinLooksSafe(book.paras, i, requestedSpan);
    const n = joinIsSafe ? requestedSpan : 1;
    const r = safeRollingRole(book.paras, i, n, requestedRole);
    let b = ['none', 'section', 'page'].includes(raw.b) ? raw.b : 'none';
    if(requestedRole.charAt(0) === 'h' && r === 'p' && b === 'page') b = 'none';
    if(b === 'page' && r !== 'h1' && r !== 'h2') b = 'section';
    ops.push({ i, n, r, j:joinIsSafe && !!raw.j, b });
    lastEnd = i + requestedSpan;
  }
  return ops;
}

function nextRollingStart(book, paragraphIndex){
  const windows = normalizedRollingWindows(book);
  const current = windows.slice().reverse().find(windowState =>
    paragraphIndex >= windowState.from && paragraphIndex < windowState.to
  );
  if(!current) return Math.max(0, paragraphIndex - 2);
  if(rollingCharsBetween(book, paragraphIndex, current.to) > ROLLING_FORMAT_PREFETCH_CHARS) return null;
  return Math.max(0, current.to - 3);
}

async function callRollingFormatter(book, bounds){
  if(!sb || !sbUser) throw new Error('login_required');
  const auth = await sb.auth.getSession();
  const session = auth && auth.data ? auth.data.session : null;
  if(!session) throw new Error('login_required');

  const response = await fetch(SB_URL.replace(/\/$/, '') + '/functions/v1/format', {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Authorization':'Bearer ' + session.access_token,
      'apikey':SB_KEY,
    },
    body:JSON.stringify({
      version:ROLLING_FORMAT_VERSION,
      bookId:book.id,
      fingerprint:ensureBookFingerprint(book),
      title:book.title || '',
      from:bounds.from,
      to:bounds.to,
      items:rollingWindowItems(book, bounds),
    }),
  });
  let body = null;
  try{ body = await response.json(); }catch(e){}
  if(!response.ok || !body || body.error){
    const error = new Error((body && body.error) || ('http_' + response.status));
    error.status = response.status;
    throw error;
  }
  return body;
}

async function runRollingFormatting(book, requestedStart){
  if(!book || book.builtin || !book.paras || !book.paras.length) return;
  if(Date.now() < rollingFormatPausedUntil) return;
  const bounds = rollingWindowBounds(book, requestedStart);
  const key = book.id + ':' + bounds.from + ':' + bounds.to;
  const existing = normalizedRollingWindows(book).find(windowState =>
    windowState.from === bounds.from && windowState.to === bounds.to
  );
  if(existing || rollingFormatJobs.has(key)) return;

  const job = (async()=>{
    try{
      const response = await callRollingFormatter(book, bounds);
      if(response.version !== ROLLING_FORMAT_VERSION
          || response.from !== bounds.from || response.to !== bounds.to) throw new Error('window_mismatch');
      const ops = validateRollingOps(book, bounds, response.ops);
      if(!ops) throw new Error('invalid_format_map');

      const windows = normalizedRollingWindows(book)
        .filter(windowState => !(windowState.from === bounds.from && windowState.to === bounds.to));
      windows.push({ from:bounds.from, to:bounds.to, ops,
                     provider:String(response.provider || ''), createdAt:Date.now() });
      book.aiFormatting = {
        version:ROLLING_FORMAT_VERSION,
        windows:windows.slice(-ROLLING_FORMAT_MAX_WINDOWS),
      };
      await bookPut(book);
      if(typeof queueBookFormattingSync === 'function') queueBookFormattingSync(book);

      if(curBook && curBook.id === book.id){
        const anchor = captureAnchor();
        renderBookBody(book);
        if(anchor) requestAnimationFrame(()=>requestAnimationFrame(()=>restoreAnchor(anchor)));
      }
    }catch(error){
      const unavailable = error && (error.status === 404 || error.message === 'server_not_configured');
      rollingFormatPausedUntil = Date.now() + (unavailable ? 10 * 60 * 1000 : 60 * 1000);
      console.warn('Rolling formatting skipped:', error && error.message);
    }finally{
      rollingFormatJobs.delete(key);
    }
  })();
  rollingFormatJobs.set(key, job);
  return job;
}

function scheduleRollingFormatting(book, paragraphIndex){
  if(!book || book.builtin || !navigator.onLine) return;
  if(typeof sb === 'undefined' || !sb || typeof sbUser === 'undefined' || !sbUser) return;
  if(typeof requestRollingFormattingConsent === 'function' && !requestRollingFormattingConsent()) return;
  const start = nextRollingStart(book, Math.max(0, Math.floor(paragraphIndex) || 0));
  if(start == null) return;
  clearTimeout(rollingFormatTimer);
  rollingFormatTimer = setTimeout(()=>runRollingFormatting(book, start), 350);
}
