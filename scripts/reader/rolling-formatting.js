/* Book-wide AI typography, version 3.
   The browser builds a stable layout first. AI sees only structural candidates
   (not ordinary body paragraphs) and returns only exceptions to the body role.
   A result is applied atomically after every batch has passed local validation. */

const ROLLING_FORMAT_VERSION = 3; // Kept as the persisted key for older books.
const BOOK_FORMAT_MAX_CANDIDATES = 420;
const BOOK_FORMAT_MAX_SENT_CHARS = 55000;
const BOOK_FORMAT_BATCH_ITEMS = 64;
const BOOK_FORMAT_BATCH_CHARS = 12000;
const BOOK_FORMAT_ROLES = new Set(['h1', 'h2', 'h3', 'quote', 'note', 'toc']);
const bookFormatJobs = new Map();
const bookFormatTimers = new Map();
let bookFormattingPausedUntil = 0;

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
    r:text.startsWith(IMG_MARK) ? 'img' : 'p', start:index, n:1,
    group:index, join:false, before:'none',
  }));
  const formatting = book.formatting || book.tidy || null;
  const blocks = formatting && Array.isArray(formatting.blocks) ? formatting.blocks : [];

  blocks.forEach(block => {
    const start = Math.max(0, Math.floor(Number(block.f) || 0));
    if(start >= paragraphs.length || paragraphs[start].startsWith(IMG_MARK)) return;
    const allowed = block.r === 'p' || BOOK_FORMAT_ROLES.has(block.r);
    const role = allowed ? block.r : 'p';
    const span = Math.min(formattingSourceSpan(paragraphs, block), paragraphs.length - start);
    if(role === 'quote' || role === 'note' || role === 'toc'){
      for(let offset = 0; offset < span; offset++){
        info[start + offset] = { r:role, start:start + offset, n:1,
          group:start, join:false, before:'none' };
      }
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

function encodeCandidateRanges(ids){
  const sorted = [...new Set(ids)].sort((a,b)=>a-b);
  const ranges = [];
  sorted.forEach(id=>{
    const last = ranges[ranges.length-1];
    if(last && last[0] + last[1] === id) last[1]++;
    else ranges.push([id, 1]);
  });
  return ranges;
}

function candidateIdsFromRanges(ranges){
  const ids = new Set();
  (ranges || []).forEach(range=>{
    const start = Math.max(0, Math.floor(Number(range[0]) || 0));
    const count = Math.max(0, Math.floor(Number(range[1]) || 0));
    for(let offset=0; offset<count; offset++) ids.add(start + offset);
  });
  return ids;
}

function readyBookFormatting(book){
  const state = book && book.aiFormatting;
  return state && state.version === ROLLING_FORMAT_VERSION
    && state.status === 'ready' && Array.isArray(state.ops) ? state : null;
}

function bookRoleInfo(book){
  const paragraphs = book.paras || [];
  const info = baselineRoleInfo(book);
  const state = readyBookFormatting(book);
  if(!state) return info;

  // Candidates are AI-owned. An omitted candidate is deliberately plain body.
  candidateIdsFromRanges(state.candidateRanges).forEach(index=>{
    if(index < 0 || index >= paragraphs.length || paragraphs[index].startsWith(IMG_MARK)) return;
    info[index] = { r:'p', start:index, n:1, group:index, join:false, before:'none' };
  });

  state.ops.forEach(op=>{
    const start = op.i;
    const span = op.n || 1;
    if(op.r === 'quote' || op.r === 'note' || op.r === 'toc'){
      for(let offset=0; offset<span; offset++){
        const index = start + offset;
        info[index] = { r:op.r, start:index, n:1, group:start,
          join:false, before:offset === 0 ? (op.b || 'none') : 'none' };
      }
      return;
    }
    info[start] = { r:op.r, start, n:1, group:start,
      join:false, before:op.b || 'none' };
  });
  return info;
}

function buildRollingDisplayBlocks(book){
  const paragraphs = book.paras || [];
  const info = bookRoleInfo(book);
  const signals = book.layoutSignals || [];
  const blocks = [];

  for(let index=0; index<paragraphs.length; index++){
    if(paragraphs[index].startsWith(IMG_MARK)){
      blocks.push({ r:'img', t:paragraphs[index], f:index });
      continue;
    }
    const role = info[index] || { r:'p', start:index, n:1, group:index, join:false, before:'none' };
    if(role.start !== index) continue;
    const span = Math.max(1, role.n || 1);
    const text = role.join ? paragraphs.slice(index, index + span).join(' ') : paragraphs[index];
    const visual = role.r.charAt(0) === 'h' && span === 1 && signals[index]
      ? String(signals[index].v || '') : '';
    blocks.push({ r:role.r, t:text, v:visual, f:index, g:role.group, before:role.before });
  }
  return blocks;
}

function typographyGrammar(book, baseline){
  const signals = book.layoutSignals || [];
  const sizes = {};
  let centered = 0, bold = 0, italic = 0, indented = 0, pages = 0;
  signals.forEach(signal=>{
    if(!signal) return;
    const band = (Math.round((Number(signal.z)||1)*20)/20).toFixed(2);
    sizes[band] = (sizes[band] || 0) + 1;
    if(signal.c) centered++;
    if(signal.b) bold++;
    if(signal.it) italic++;
    if((signal.in||0) >= 0.05) indented++;
    pages = Math.max(pages, Number(signal.p)||0);
  });
  const roles = {};
  baseline.forEach(item=>{ roles[item.r] = (roles[item.r]||0)+1; });
  return {
    paragraphs:(book.paras||[]).length,
    pages,
    sizeBands:Object.entries(sizes).sort((a,b)=>Number(a[0])-Number(b[0])).slice(-10),
    signals:{ centered, bold, italic, indented },
    provisionalRoles:roles,
  };
}

function typographyCandidateScore(text, signal, provisionalRole){
  if(!text || text.startsWith(IMG_MARK)) return 0;
  const short = text.length <= 220;
  const words = text.trim().split(/\s+/).length;
  let score = provisionalRole !== 'p' ? 8 : 0;
  if(signal){
    const scale = Number(signal.z)||1;
    if(scale >= 1.35) score += 7;
    else if(scale >= 1.12) score += 4;
    else if(scale >= 1.05) score += 2;
    if(signal.b && short) score += 3;
    if(signal.it) score += 2;
    if(signal.c && short) score += 3;
    if((signal.in||0) >= 0.05) score += 4;
    if(signal.v) score += 4;
    if(signal.r) score += 8; // EPUB semantic markup is strong evidence, still validated.
  }
  if(short && /^[A-Z\d][A-Z\d\s'’:&,.\-–—]+$/.test(text) && words <= 18) score += 4;
  if(short && /^(part|book|chapter|section|prologue|epilogue|introduction)\b/i.test(text)) score += 5;
  if(short && /\s\d{1,4}$/.test(text) && !/[.!?]["'”’)]?\s\d{1,4}$/.test(text)) score += 3;
  return score;
}

function clippedContext(text, side){
  const value = String(text || '').replace(/\s+/g,' ').trim();
  if(value.length <= 140) return value;
  return side === 'before' ? value.slice(-140) : value.slice(0,140);
}

function buildBookTypographyPlan(book){
  const paragraphs = book.paras || [];
  const signals = book.layoutSignals || [];
  const baseline = baselineRoleInfo(book);
  const ranked = [];

  paragraphs.forEach((text,index)=>{
    const signal = signals[index] || null;
    const provisional = (baseline[index] || {}).r || 'p';
    const score = typographyCandidateScore(text, signal, provisional);
    if(score < 4) return;
    ranked.push({ index, score, estimated:Math.min(text.length,900)
      + Math.min((paragraphs[index-1]||'').length,140)
      + Math.min((paragraphs[index+1]||'').length,140) + 90 });
  });

  ranked.sort((a,b)=>b.score-a.score || a.index-b.index);
  let sentChars = 0;
  const selected = [];
  for(const candidate of ranked){
    if(selected.length >= BOOK_FORMAT_MAX_CANDIDATES) break;
    if(sentChars + candidate.estimated > BOOK_FORMAT_MAX_SENT_CHARS) continue;
    sentChars += candidate.estimated;
    selected.push(candidate.index);
  }
  selected.sort((a,b)=>a-b);

  const items = selected.map(index=>{
    const signal = signals[index] || {};
    return {
      i:index,
      t:String(paragraphs[index]||'').replace(/\s+/g,' ').slice(0,900),
      a:clippedContext(paragraphs[index-1], 'before'),
      e:clippedContext(paragraphs[index+1], 'after'),
      r:(baseline[index]||{}).r || 'p',
      z:Number(signal.z)||1,
      w:!!signal.b,
      l:!!signal.it,
      c:!!signal.c,
      d:Number(signal.in)||0,
      p:Number(signal.p)||0,
      v:!!signal.v,
    };
  });
  return { grammar:typographyGrammar(book, baseline), items, sentChars };
}

function splitTypographyBatches(items){
  const batches = [];
  let batch = [], chars = 0;
  items.forEach(item=>{
    const size = item.t.length + item.a.length + item.e.length + 100;
    if(batch.length && (batch.length >= BOOK_FORMAT_BATCH_ITEMS || chars + size > BOOK_FORMAT_BATCH_CHARS)){
      batches.push(batch); batch = []; chars = 0;
    }
    batch.push(item); chars += size;
  });
  if(batch.length) batches.push(batch);
  return batches;
}

function safeBookFormattingRole(book, start, requestedRole){
  const text = String((book.paras||[])[start] || '').trim();
  if(requestedRole.charAt(0) !== 'h') return requestedRole;
  const limits = {
    h1:{chars:120,words:18}, h2:{chars:180,words:28}, h3:{chars:240,words:40},
  };
  const limit = limits[requestedRole];
  const words = text ? text.split(/\s+/).length : 0;
  const sentenceEnds = (text.match(/[.!?](?=(?:["'”’\])]|\s|$))/g)||[]).length;
  if(!limit || text.length>limit.chars || words>limit.words || sentenceEnds>1) return 'p';
  return requestedRole;
}

function validateBookTypographyOps(book, candidateIds, rawOps){
  if(!Array.isArray(rawOps) || rawOps.length > candidateIds.size) return null;
  const ops = [];
  let lastEnd = -1;
  const paragraphs = book.paras || [];
  for(const raw of rawOps){
    const i = Math.floor(Number(raw.i));
    const n = Math.max(1, Math.min(12, Math.floor(Number(raw.n)||1)));
    const requested = String(raw.r||'');
    if(!Number.isFinite(i) || i < 0 || i+n > paragraphs.length || i < lastEnd) return null;
    if(!BOOK_FORMAT_ROLES.has(requested)) return null;
    for(let offset=0; offset<n; offset++){
      if(!candidateIds.has(i+offset) || paragraphs[i+offset].startsWith(IMG_MARK)) return null;
    }
    let role = safeBookFormattingRole(book, i, requested);
    if((role === 'quote' || role === 'note')
        && paragraphs.slice(i,i+n).join(' ').length > 4200) role = 'p';
    if(role === 'quote' && n === 1 && paragraphs[i].length > 900){
      const signal = (book.layoutSignals||[])[i] || {};
      if(!signal.it && !/^["“'‘]/.test(paragraphs[i].trim())) role = 'p';
    }
    if(role === 'toc' && paragraphs[i].length > 260) role = 'p';
    if(role === 'p'){ lastEnd = i+n; continue; }
    let before = ['none','section','page'].includes(raw.b) ? raw.b : 'none';
    if(before === 'page' && role !== 'h1' && role !== 'h2') before = 'section';
    ops.push({ i, n, r:role, b:before });
    lastEnd = i+n;
  }
  return ops;
}

async function callBookFormatter(book, grammar, items, batchIndex, batchCount){
  if(!sb || !sbUser) throw new Error('login_required');
  const auth = await sb.auth.getSession();
  const session = auth && auth.data ? auth.data.session : null;
  if(!session) throw new Error('login_required');
  const response = await fetch(SB_URL.replace(/\/$/,'') + '/functions/v1/format', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+session.access_token, apikey:SB_KEY },
    body:JSON.stringify({
      version:ROLLING_FORMAT_VERSION,
      bookId:book.id,
      fingerprint:ensureBookFingerprint(book),
      title:book.title||'',
      grammar,
      batchIndex,
      batchCount,
      items,
    }),
  });
  let body = null;
  try{ body = await response.json(); }catch(e){}
  if(!response.ok || !body || body.error){
    const error = new Error((body&&body.error)||('http_'+response.status));
    error.status = response.status;
    throw error;
  }
  return body;
}

async function runRollingFormatting(book){
  if(!book || book.builtin || !book.paras || !book.paras.length) return;
  if(readyBookFormatting(book) || bookFormatJobs.has(book.id)) return;
  if(Date.now() < bookFormattingPausedUntil) return;

  const job = (async()=>{
    try{
      const plan = buildBookTypographyPlan(book);
      const candidateIds = new Set(plan.items.map(item=>item.i));
      const batches = splitTypographyBatches(plan.items);
      if(typeof miniToast === 'function') miniToast('책 전체 디자인을 백그라운드에서 정리하고 있어요');
      const allOps = [];
      const usage = [];
      for(let index=0; index<batches.length; index++){
        const response = await callBookFormatter(book, plan.grammar, batches[index], index, batches.length);
        if(response.version !== ROLLING_FORMAT_VERSION) throw new Error('format_version_mismatch');
        const batchIds = new Set(batches[index].map(item=>item.i));
        const validated = validateBookTypographyOps(book, batchIds, response.ops);
        if(!validated) throw new Error('invalid_format_map');
        allOps.push(...validated);
        usage.push(response.usage||null);
      }
      const validated = validateBookTypographyOps(book, candidateIds, allOps.sort((a,b)=>a.i-b.i));
      if(!validated) throw new Error('invalid_complete_map');
      const sourceChars = book.paras.reduce((sum,text)=>sum+String(text||'').length,0);
      book.aiFormatting = {
        version:ROLLING_FORMAT_VERSION,
        status:'ready',
        candidateRanges:encodeCandidateRanges([...candidateIds]),
        ops:validated,
        stats:{
          candidates:candidateIds.size,
          sourceChars,
          sentChars:plan.sentChars,
          sentPercent:sourceChars ? Math.min(100,Math.round(plan.sentChars/sourceChars*100)) : 0,
          batches:batches.length,
          usage,
        },
        createdAt:Date.now(),
      };
      await bookPut(book);
      if(typeof queueBookFormattingSync === 'function') queueBookFormattingSync(book);
      if(typeof miniToast === 'function'){
        const percent = book.aiFormatting.stats.sentPercent;
        miniToast(curBook && curBook.id === book.id
          ? `AI 조판 준비 완료 · 원문의 ${percent}%만 분석 · 다시 열 때 적용돼요`
          : `AI 조판 준비 완료 · 원문의 ${percent}%만 분석했어요`);
      }
      // Do not re-render an open book. The finished map is applied atomically next open.
    }catch(error){
      const unavailable = error && (error.status===404 || error.message==='server_not_configured');
      bookFormattingPausedUntil = Date.now() + (unavailable ? 10*60*1000 : 60*1000);
      console.warn('Book formatting skipped:', error && error.message);
    }finally{
      bookFormatJobs.delete(book.id);
    }
  })();
  bookFormatJobs.set(book.id, job);
  return job;
}

function scheduleRollingFormatting(book){
  if(!book || book.builtin || !navigator.onLine || readyBookFormatting(book)) return;
  if(typeof sb==='undefined' || !sb || typeof sbUser==='undefined' || !sbUser) return;
  if(typeof requestRollingFormattingConsent==='function' && !requestRollingFormattingConsent()) return;
  const previous = bookFormatTimers.get(book.id);
  if(previous) clearTimeout(previous);
  const timer = setTimeout(()=>{
    bookFormatTimers.delete(book.id);
    runRollingFormatting(book);
  }, 500);
  bookFormatTimers.set(book.id, timer);
}
