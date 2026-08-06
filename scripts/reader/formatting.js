/* Reader formatting derived from the document's own layout signals.
   The table-of-contents and full-book AI tidy paths are intentionally disabled.
   Formatting never rewrites source text; it only assigns display roles. */

function isInvalidHeadingText(text){
  const value = String(text || '').trim();
  if(!value || value.length > 110) return true;
  if(endsSentence(value) && value.length > 45) return true;
  if(/^["“'']/.test(value) && value.length > 40) return true;
  return (value.match(/[.!?]/g) || []).length >= 2;
}

function packLayoutSignals(signals){
  if(!signals) return null;
  const packed = new Array(signals.length);
  let retained = 0;

  for(let index = 0; index < signals.length; index++){
    const signal = signals[index];
    if(!signal){
      packed[index] = null;
      continue;
    }
    const meaningful = signal.r || signal.v
      || (signal.z || 1) >= 1.05
      || signal.b
      || signal.it
      || signal.c
      || (signal.in || 0) >= 0.05;
    packed[index] = meaningful ? signal : null;
    if(meaningful) retained++;
  }
  return retained ? packed : null;
}

/* Compact bridge between reflowed paragraphs and the original document.
   It stores only source coordinates, never another copy of the text. */
function buildSourceMap(signals){
  if(!signals || !signals.length) return null;
  let retained = 0;
  const map = signals.map(signal=>{
    if(!signal) return null;
    if(Number(signal.p) > 0){
      retained++;
      return { page:Number(signal.p), y:Math.max(0,Math.min(1,Number(signal.y)||0)) };
    }
    if(signal.src || Number.isFinite(signal.si)){
      retained++;
      return { href:String(signal.src||''), spine:Math.max(0,Number(signal.si)||0),
               element:Math.max(0,Number(signal.ei)||0) };
    }
    return null;
  });
  return retained ? map : null;
}

function classifyLayoutRole(signal, text){
  if(!signal) return '';
  if(signal.r) return signal.r;

  const scale = signal.z || 1;
  const value = String(text || '').trim();
  const short = value.length <= 180 && value.split(/\s+/).length <= 28;
  /* False positives hurt more than missed decoration. Large scale must be
     accompanied by short text, and smaller headings need bold/centred proof. */
  if(short && scale >= 1.65) return 'h1';
  if(short && scale >= 1.38 && (signal.b || signal.c)) return 'h2';
  if(short && scale >= 1.2 && signal.b) return 'h3';
  if((signal.in || 0) >= 0.08 && signal.it && value.length <= 420) return 'quote';
  return '';
}

function buildFormattingFromLayout(paragraphs, signals, navigation){
  if(!signals || !signals.length) return null;

  const roles = [];
  for(let index = 0; index < paragraphs.length; index++){
    if(paragraphs[index].startsWith(IMG_MARK)){
      roles[index] = 'img';
      continue;
    }
    let role = classifyLayoutRole(signals[index], paragraphs[index]);
    if(role.startsWith('h') && isInvalidHeadingText(paragraphs[index])) role = '';
    roles[index] = role;
  }

  // EPUB navigation is reliable structure metadata. It improves formatting only;
  // no navigation button or table-of-contents UI is created from it.
  const navigationAt = {};
  (navigation || []).forEach(item => {
    if(paragraphs[item.pi] === undefined || roles[item.pi] === 'img') return;
    navigationAt[item.pi] = item;
    roles[item.pi] = 'h' + Math.min(3, Math.max(1, item.l || 1));
  });

  const headingCount = roles.filter(role => role && role.startsWith('h')).length;
  const navigationCount = Object.keys(navigationAt).length;
  if(navigationCount < 2 && (headingCount < 2 || headingCount > paragraphs.length * 0.35)){
    return null;
  }

  const blocks = [];
  const usedHeadingLevels = new Set();
  let index = 0;

  while(index < paragraphs.length){
    const role = roles[index];

    if(role === 'img'){
      blocks.push({ r:'img', t:paragraphs[index], f:index });
      index++;
      continue;
    }

    if(role && role.startsWith('h')){
      const text = paragraphs[index];
      const count = 1;
      const level = Number(role.slice(1)) || 2;

      /* 연속된 큰 글자를 합치면 페이지 머리글 + PART + 장 제목이 하나의
         거대한 제목이 되는 피해가 큽니다. PDF 줄 내부는 반입기가 이미
         복원하므로, 서로 다른 문단은 기본판에서 안전하게 분리합니다. */

      const navigationItem = navigationAt[index];
      const headingText = navigationItem ? navigationItem.t : text;
      const headingLevel = navigationItem ? Number(role.slice(1)) || level : level;
      const display = (signals[index] || {}).v;
      blocks.push({ r:'h' + headingLevel, t:headingText, v:display || '', f:index });
      usedHeadingLevels.add(headingLevel);
      index += count;
      continue;
    }

    if(role === 'quote' || role === 'note'){
      const group = index;
      while(index < paragraphs.length && roles[index] === role){
        blocks.push({ r:role, t:paragraphs[index], f:index, g:group });
        index++;
      }
      continue;
    }

    blocks.push({ r:'p', t:paragraphs[index], f:index });
    index++;
  }

  // Normalize only the heading levels used by this document.
  const levels = [...usedHeadingLevels].sort((a, b) => a - b);
  const rank = new Map(levels.map((level, position) => [level, position + 1]));
  blocks.forEach(block => {
    if(block.r.startsWith('h')){
      const originalLevel = Number(block.r.slice(1));
      block.r = 'h' + Math.min(3, rank.get(originalLevel) || originalLevel);
    }
  });

  return {
    blocks,
    start: 0,
    levels: levels.length,
    source: navigationCount ? 'epub-navigation' : 'document-layout',
    createdAt: Date.now(),
  };
}

function buildPlainBlocks(paragraphs){
  return paragraphs.map((text, index) => {
    if(text.startsWith(IMG_MARK)) return { r:'img', t:text, f:index };
    const value = String(text || '').trim();
    const veryLikelyHeading = value.length <= 55
      && value.split(/\s+/).length <= 8
      && !/[.!?;:]$/.test(value)
      && (/^[A-Z\d][A-Z\d\s'’&\-–—]+$/.test(value)
          || /^(part|book|chapter|section|prologue|epilogue|introduction)\b/i.test(value));
    return { r:veryLikelyHeading ? 'h2' : 'p', t:text, f:index };
  });
}

function validateFormattingBlocks(paragraphs, blocks){
  for(const block of blocks){
    if(block.r === 'img') continue;
    const source = paragraphs[block.f];
    if(source === undefined) return false;
    if(block.t === source || source.endsWith(block.t)) continue;

    let joined = '';
    let matched = false;
    for(let index = block.f; index < paragraphs.length && joined.length <= block.t.length; index++){
      joined += (joined ? ' ' : '') + paragraphs[index];
      if(joined === block.t){
        matched = true;
        break;
      }
    }
    if(matched) continue;

    // EPUB navigation labels may differ in whitespace from visible heading text.
    // They are accepted only when every normalized token exists somewhere in the book.
    if(!block.r.startsWith('h')) return false;
    const vocabulary = new Set(
      paragraphs.flatMap(text => String(text || '').toLowerCase().match(/[a-z0-9]+/g) || [])
    );
    const tokens = String(block.t || '').toLowerCase().match(/[a-z0-9]+/g) || [];
    if(!tokens.length || tokens.some(token => !vocabulary.has(token))) return false;
  }
  return true;
}
