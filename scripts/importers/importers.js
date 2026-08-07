/* ---- 붙여넣은 글 ----
   기사 한 토막, X 스레드, 메모 — DRM도 파일도 없는 아무 영어 텍스트.
   구조를 알려주는 JSON이 없으니 눈에 보이는 것만 규칙으로 씁니다.
     첫 줄         -> 제목
     빈 줄         -> 문단 경계
     빈 줄이 없음  -> 줄마다 한 장의 카드 (스레드)
   규칙이 세 줄이면 결과를 미리 예상할 수 있고, 예상할 수 있으면 버그로
   보이지 않습니다. 추측이 필요한 판단은 일부러 넣지 않았습니다. */
const PASTE_TITLE_MAX = 90;

function parsePastedText(raw){
  // 웹에서 복사한 글에는 눈에 보이지 않는 고정폭·너비 0 공백이 섞여 옵니다.
  const text = String(raw||'').replace(/\r/g,'')
    .replace(/[\u00a0\u200b\u2028\u2029]/g,' ').trim();
  if(!text) return null;
  const lines = text.split('\n').map(line=>line.trim());
  const start = lines.findIndex(line=>line);
  if(start < 0) return null;

  const title = lines[start];
  const rest = lines.slice(start+1);
  const thread = rest.filter(Boolean).length >= 2 && !rest.some(line=>!line);
  const bodies = thread
    ? rest.filter(Boolean)
    : rest.join('\n').split(/\n\s*\n+/)
        .map(block=>block.split('\n').filter(Boolean).join(' ').trim())
        .filter(Boolean);

  // 한 줄만 붙여넣었다면 그건 제목이 아니라 그냥 본문입니다.
  const titleRole = bodies.length ? 'h1' : '';
  const merged = mergeWrapped([title, ...bodies],
    [{r:titleRole}, ...bodies.map(()=>({r: thread ? 'note' : ''}))]);
  const roles = merged.sig || [];
  const blocks = merged.map((value,index)=>{
    const role = (roles[index] && roles[index].r) || '';
    // 카드는 한 장씩 따로 묶어야 여러 줄이 한 상자로 합쳐지지 않습니다.
    if(role === 'note') return { r:'note', t:value, f:index, g:index };
    return { r: role === 'h1' ? 'h1' : 'p', t:value, f:index };
  });
  return {
    title: title.length > PASTE_TITLE_MAX ? title.slice(0,PASTE_TITLE_MAX).trim()+'…' : title,
    paras: merged.slice(),
    thread,
    formatting: { blocks, start:0, levels:1, source:'pasted-text', createdAt:Date.now() },
  };
}

function parseTXT(text){
  const blocks = text.replace(/\r/g,'').split(/\n\s*\n+/)
    .map(blk => blk.split('\n').map(l=>l.trim()).join(' '));
  return mergeWrapped(blocks, null);
}

/* 줄바꿈이 문단처럼 저장된 파일을 되돌립니다.
   TXT나 조악하게 변환된 EPUB은 화면 폭에 맞춰 끊어 둔 줄을 그대로 문단으로 저장합니다.
     "…sometimes calculated and at other"   ← 문장이 안 끝났는데 문단이 끊김
     "times delusional. He has a…"          ← 소문자로 이어짐
   이러면 읽을 때 두세 줄마다 문단이 바뀌어 눈이 튑니다.
   앞이 문장으로 끝나지 않았는데 다음이 소문자로 이어지면 원래 한 문단입니다.
   (PDF는 줄 단위에서 이미 같은 판단을 하고 있어서 여기 오지 않습니다.) */
function mergeWrapped(paras, sig){
  const out = [], outSig = [], map = {};
  const roleOf = function(x){ return x && x.r ? x.r : ''; };
  for(let i=0; i<paras.length; i++){
    const p = (paras[i] || '').trim();
    if(!p) continue;
    const r = sig ? (sig[i] || null) : null;
    const last = out.length ? out[out.length-1] : null;
    const lastR = out.length ? outSig[outSig.length-1] : null;
    if(last !== null
       && !p.startsWith(IMG_MARK) && !last.startsWith(IMG_MARK)
       && !roleOf(r) && !roleOf(lastR)          // 제목·인용문 경계는 절대 넘지 않습니다
       && !endsSentence(last)
       && /^[a-z,;)’']/.test(p)){
      out[out.length-1] = last.endsWith('-') ? last.slice(0,-1) + p : last + ' ' + p;
      map[i] = out.length - 1;                  // 앞 문단에 흡수됨
      continue;
    }
    map[i] = out.length;
    out.push(p); outSig.push(r);
  }
  if(sig) out.sig = outSig;
  out.imap = map;               // 옛 문단번호 → 새 문단번호 (배열의 map 메서드를 가리지 않게 imap)
  return out;
}

/* --- PDF: rebuild paragraphs from positioned text, drop headers/footers --- */
/* ================= PDF text cleanup (rule-based, no AI) =================
   PDF에는 "문단"이 없고 글자 조각과 좌표만 있습니다. 아래 3단계로 복원합니다.
   ① 조각 -> 줄   ② 머리글/꼬리글 같은 잡동사니 제거   ③ 줄 -> 문단            */

/* 기호 폰트(Wingdings 등)의 글머리표는 텍스트로 뽑으면 l, n, u, q 처럼 나옵니다.
   오탐을 막으려고 "문서 안에서 2번 이상 + 뒤에 대문자" 일 때만 글머리표로 인정합니다. */
/* 글머리표는 두 종류로 나눠 다룹니다.
   - 확실한 기호(•, ·, ▪ …)  : 뒤에 무슨 글자가 와도 글머리표로 인정
   - 애매한 글자(l, n, u, q) : 기호 폰트가 깨져 나온 것이므로 뒤가 대문자일 때만 인정
   두 경우 모두 "문서 안에서 2회 이상"이어야 규칙을 켭니다(오탐 방지).            */
const BULLET_SURE   = '•·▪●§Ø¡';
const BULLET_LETTER = 'lnuq';
const BULLET_RE = new RegExp(
  '(?:^|\\s)(?:[' + BULLET_SURE + ']\\s*(?=[A-Za-z“"\'(])|[' + BULLET_LETTER + ']\\s+(?=[A-Z“"\']))', 'g');
const BULLET_START_RE = new RegExp(
  '^(?:[' + BULLET_SURE + ']\\s*[A-Za-z“"\'(]|[' + BULLET_LETTER + ']\\s+[A-Z“"\'])');

function median(arr){
  if(!arr.length) return 0;
  const a = arr.slice().sort((x,y)=>x-y);
  return a[Math.floor(a.length/2)];
}
function pct(arr, p){
  if(!arr.length) return 0;
  const a = arr.slice().sort((x,y)=>x-y);
  return a[Math.min(a.length-1, Math.floor(a.length*p))];
}
const endsSentence = t => /[.!?…:;]["'”’»)\]]?$/.test(t.trim());
const startsFresh  = t => /^[A-Z0-9“"'(\[]/.test(t.trim());

/* ---------- ① 글자 조각 -> 줄 ----------
   조각 사이의 가로 간격을 보고 띄어쓸지 붙일지 결정합니다.
   (무조건 공백으로 이으면 "ethic the"처럼 없던 띄어쓰기가 생기고,
    무조건 붙이면 "ethicthe"처럼 띄어쓰기가 사라집니다)              */
/* 드롭캡 다음에 띄어쓸지 붙일지 판단합니다.
   T·W·B 같은 글자는 언제나 뒷글자와 한 단어입니다 (T + he → The).
   I·A·O는 그 자체로 단어라서 "I gave"처럼 띄어야 할 때가 있습니다. */
const DROP_WORDS = {};
('it in if is its im ill id ive after and an as at all also although always again around '
+'another above against alone among any are on of or one once only over our out other')
  .split(' ').forEach(function(w){ DROP_WORDS[w] = 1; });
function dropJoins(letter, rest){
  if(!/^[IAO]$/.test(letter)) return true;
  const tok = (rest.match(/^[A-Za-z’']+/) || [''])[0];
  if(tok.length <= 2) return true;                          // I+t, A+nd 같은 조각
  return !!DROP_WORDS[(letter + tok).toLowerCase().replace(/[’']/g, '')];
}
function itemsToLines(items){
  const rows = [];
  const drops = [];                       // 드롭캡: 문단 첫 글자를 크게 키운 장식
  const hs = [];
  for(const it of items){ if(it.str && it.str.trim()) hs.push(it.height || Math.abs(it.transform[3]) || 10); }
  const medH = median(hs) || 10;
  for(const it of items){
    if(!it.str || !it.str.trim()) continue;
    const y = it.transform[5], x = it.transform[4];
    const h = it.height || Math.abs(it.transform[3]) || 10;
    /* 드롭캡은 글자 하나가 두세 줄 높이입니다. 기준선이 아래쪽 줄에 있어서
       그대로 두면 "…the majority of my T coworkers"처럼 문단 한가운데로 끼어듭니다. */
    if(it.str.trim().length === 1 && h > medH*1.8 && /[A-Za-z]/.test(it.str)){
      drops.push({x:x, y:y, h:h, s:it.str.trim()});
      continue;
    }
    let row = rows.find(r => Math.abs(r.y - y) <= Math.max(1.5, h*0.35));
    if(!row){ row = {y, h, parts:[]}; rows.push(row); }
    row.h = Math.max(row.h, h);
    row.parts.push({x, w:it.width||0, s:it.str, h, f:it.fontName||''});
  }
  /* 드롭캡이 덮고 있는 줄 중 맨 윗줄 앞에 붙여 줍니다 (T + he → The) */
  drops.forEach(function(d){
    let target = null;
    rows.forEach(function(r){
      if(r.y >= d.y - d.h*0.15 && r.y <= d.y + d.h && (!target || r.y > target.y)) target = r;
    });
    if(target){ target.drop = d.s; target.dropX = d.x; }
    else rows.push({y:d.y, h:d.h, parts:[{x:d.x, w:0, s:d.s, h:d.h}]});
  });
  return rows.sort((a,b)=>b.y-a.y).map(r=>{
    const ps = r.parts.sort((a,b)=>a.x-b.x);
    let text = '';
    const gaps = [];
    ps.forEach((p,i)=>{
      if(i) gaps.push(Math.max(0, p.x - (ps[i-1].x + ps[i-1].w)));
    });
    ps.forEach((p,i)=>{
      if(i===0){ text = p.s; return; }
      const prev = ps[i-1];
      const gapX = p.x - (prev.x + prev.w);
      const needSpace = gapX > Math.max(0.16*(p.h||10), 0.4) && !/\s$/.test(text) && !/^\s/.test(p.s);
      text += (needSpace ? ' ' : '') + p.s;
    });
    /* 넓은 자간으로 찍힌 제목은 PDF 추출기가 "P A R T  O N E"처럼
       글자 사이를 실제 공백으로 오해합니다. 원문 추출값은 그대로 두고,
       좌표 간격으로 복원한 화면용 문자열만 조판 단서에 보관합니다. */
    let display = text;
    const visibleParts = ps.filter(p=>String(p.s||'').trim());
    const singleRatio = visibleParts.length
      ? visibleParts.filter(p=>String(p.s||'').trim().length <= 2).length / visibleParts.length
      : 0;
    const positiveGaps = gaps.filter(g=>g>0.15);
    const trackingGap = median(positiveGaps);
    if(visibleParts.length >= 4 && singleRatio >= 0.7 && trackingGap > r.h*0.08){
      display = '';
      visibleParts.forEach((p,i)=>{
        if(i){
          const prev = visibleParts[i-1];
          const gap = Math.max(0, p.x - (prev.x + prev.w));
          if(gap > Math.max(trackingGap*1.75, r.h*0.5)) display += ' ';
        }
        display += String(p.s||'').replace(/\s+/g,'');
      });
      display = display.replace(/\s+/g,' ').trim();
      if(display.replace(/\s/g,'') !== text.replace(/\s/g,'')) display = text;
    }
    if(r.drop){
      const rest = text.replace(/^\s+/,'');
      text = r.drop + (dropJoins(r.drop, rest) ? '' : ' ') + rest;
    }
    text = text.replace(/\s+/g,' ').trim();
    /* 굵기: 이 줄 글자의 대부분이 Bold 계열 폰트로 찍혔는가.
       제목은 크거나 굵거나 둘 다입니다. 조판이 남긴 단서라 추측보다 훨씬 셉니다. */
    let bw = 0, iw = 0, tw = 0;
    ps.forEach(p=>{
      const n=(p.s||'').length; tw+=n;
      if(/bold|black|heavy|semib/i.test(p.f||'')) bw+=n;
      if(/italic|oblique/i.test(p.f||'')) iw+=n;
    });
    return { y:r.y, h:r.h, text, display, drop:!!r.drop, bold: tw>0 && bw/tw > 0.6,
             italic:tw>0 && iw/tw > 0.6,
             left: r.drop ? Math.min(r.dropX, ps.length?ps[0].x:r.dropX) : ps[0].x,
             right: ps.length ? ps[ps.length-1].x + (ps[ps.length-1].w||0) : r.dropX };
  }).filter(l=>l.text);
}

/* ---------- ①-2. 단(column) 가르기 ----------
   2단으로 조판된 PDF에서 한 화면 줄의 왼쪽과 오른쪽은 서로 다른 글입니다.
   y좌표만 보고 묶으면 두 단이 한 줄로 접합돼 문장이 통째로 섞입니다.

     "This is a very common human tendency ③ what is describe the . There is"
      └── 왼쪽 단 ──────────────────────┘ └── 오른쪽 단 ─────────────────┘

   글자가 거의 지나가지 않는 세로 띠(거터)를 찾아 단을 먼저 가릅니다.
   순수 좌표 계산이라 출판사나 문서 종류를 가리지 않습니다. */
function detectColumnGutter(items, pageWidth){
  const width = Math.ceil(pageWidth) + 1;
  if(!(width > 1) || !items.length) return null;
  const cover = new Uint32Array(width);
  const spans = [];
  for(const it of items){
    if(!it.str || !it.str.trim()) continue;
    const a = it.transform[4], b = a + Math.abs(it.width || 0);
    spans.push({a, b});
    const x0 = Math.max(0, Math.floor(a)), x1 = Math.min(width, Math.ceil(b));
    for(let x = x0; x < x1; x++) cover[x]++;     // 끝점은 잉크가 아니므로 반열림 구간
  }
  if(spans.length < 40) return null;
  /* 진짜 전폭 제목 몇 줄이 페이지 전체를 거부하게 두지 않습니다. */
  const tolerance = Math.floor(spans.length * 0.004);
  const lo = Math.floor(width * 0.30), hi = Math.ceil(width * 0.70);
  let best = null, run = -1;
  for(let x = lo; x <= hi; x++){
    if(cover[x] <= tolerance){ if(run < 0) run = x; }
    else { if(run >= 0 && (!best || x - run > best.w)) best = {a:run, w:x - run}; run = -1; }
  }
  if(run >= 0 && (!best || hi - run + 1 > best.w)) best = {a:run, w:hi - run + 1};
  if(!best || best.w < 6) return null;
  const cut = best.a + best.w / 2;
  const left = spans.filter(s => s.b <= cut).length;
  const right = spans.filter(s => s.a >= cut).length;
  // 양쪽이 모두 충분히 차 있고, 띠를 실제로 넘는 글자가 거의 없어야 단입니다.
  if(left < spans.length * 0.2 || right < spans.length * 0.2) return null;
  if(spans.length - left - right > spans.length * 0.02) return null;
  return {cut};
}

/* 한 장의 종이를 단별로 나눠 돌려줍니다. 단이 없으면 통째로 한 덩이입니다.
   단 경계는 문단을 이어 붙이면 안 되므로, 쪽 경계와 똑같이 다룹니다. */
function pdfPageColumns(items, pageWidth){
  const gutter = detectColumnGutter(items, pageWidth);
  if(!gutter) return [items];
  const left = [], right = [];
  for(const it of items){
    const a = it.transform[4], b = a + Math.abs(it.width || 0);
    // 두 단을 가로지르는 소수의 줄(전폭 제목)은 왼쪽 단의 흐름에 둡니다.
    if(a >= gutter.cut) right.push(it); else left.push(it);
  }
  return [left, right];
}

/* ---------- ②+③ 줄 -> 문단 ---------- */
function assembleParagraphs(pages){
  const allLines = pages.reduce(function(a,p){ return a.concat(p.lines); }, []);
  if(!allLines.length) return [];

  /* ② 잡동사니: 페이지 번호 / 저작권 / 여러 페이지 같은 자리에 반복되는 머리글·꼬리글 */
  const norm = t => t.replace(/\d+/g,'#');
  const freq = {}, freqExact = {};
  allLines.forEach(l => {
    const k=norm(l.text); freq[k]=(freq[k]||0)+1;
    const e=l.text.trim(); freqExact[e]=(freqExact[e]||0)+1;
  });
  // 한 쪽이 여러 단으로 쪼개져 들어오므로, 반복 기준은 종이 장수로 셉니다.
  const sheets = new Set(pages.map(p => p.n)).size || pages.length;
  const repeatMin = Math.max(2, Math.round(sheets*0.2));
  const isJunk = (l, pageH) => {
    const t = l.text;
    if(/^\d{1,4}$/.test(t)) return true;
    if(/^©|^Copyright\b/i.test(t) || /all rights reserved/i.test(t)) return true;
    /* 워터마크: 쪽마다 아무 자리에나 찍히는 짧은 반복 문구(OceanofPDF.com 같은 것).
       "Chapter 1", "Chapter 2"는 글자가 서로 달라서 여기 걸리지 않습니다. */
    if(t.length <= 45 && !endsSentence(t) && freqExact[t.trim()] >= repeatMin) return true;
    if(t.length > 90) return false;
    // 반복되더라도 본문 한가운데 있는 문장은 절대 지우지 않습니다.
    // 실측: 본문은 페이지 높이의 91%까지 올라오고, 꼬리글은 4~8%에 모여 있습니다.
    // 본문을 잘못 지우는 쪽이 훨씬 나쁘므로 띠를 좁게 잡습니다.
    const nearTop = l.y > pageH*0.94, nearBottom = l.y < pageH*0.10;
    return (nearTop || nearBottom) && freq[norm(t)] >= repeatMin;
  };
  /* `n` is the real PDF page number and has to survive this filter. Numbering
     the surviving pages 1..N instead would silently shift every coordinate
     after the first dropped page, so 원본 모드 would open several pages away
     from the sentence the reader was on — and drift further into the book. */
  const cleanPages = pages.map(p => ({...p, lines: p.lines.filter(l => !isJunk(l, p.h))}))
                          .filter(p => p.lines.length);
  const lines = cleanPages.reduce(function(a,p){ return a.concat(p.lines); }, []);
  if(!lines.length) return [];

  /* 본문 좌/우 경계와 보통 줄간격을 통계로 추정 */
  const bodyLeft  = median(lines.map(l=>l.left));
  const bodyRight = pct(lines.map(l=>l.right), 0.9);
  const width = Math.max(1, bodyRight - bodyLeft);
  const gaps = [];
  cleanPages.forEach(p => p.lines.forEach((l,i)=>{ if(i) gaps.push(p.lines[i-1].y - l.y); }));
  const medGap = pct(gaps.filter(g=>g>0), 0.4) || 14;

  const isIndented = l => l.left > bodyLeft + width*0.035;
  const isShort    = l => l.right < bodyRight - width*0.10;

  /* 글머리표 존재 여부를 문서 전체에서 먼저 확인 (2회 이상일 때만 인정) */
  let bulletHits = 0;
  lines.forEach(l => { BULLET_RE.lastIndex=0; if(BULLET_RE.test(' '+l.text)) bulletHits++; });
  const bulletsOn = bulletHits >= 2;
  const startsBullet = t => bulletsOn && BULLET_START_RE.test(t.trim());

  /* 조판이 남긴 단서. 제목은 "크게 / 굵게 / 가운데" 찍혀 있습니다.
     PDF에서 글자만 뽑아내면 이 정보가 사라져서, 나중에 글자만 보고 제목을 되찾으려니
     어려웠던 겁니다. 여기서 문단마다 같이 들고 갑니다.
       z = 본문 글자 크기 대비 몇 배   b = 굵은 글씨   c = 가운데 정렬 */
  const medH = median(lines.map(l=>l.h).filter(h=>h>0)) || 10;
  const paras = [];
  const sig = [];
  const chapters = [];        // 드롭캡으로 시작하는 문단 = 장이 바뀌는 자리
  let cur = '', curDisplay = '', prev = null, prevPage = -1, curDrop = false;
  let curPage = 0, curY = 0;
  let curH = 0, curBold = true, curItalic = true, curCenter = true, curLines = 0;
  let curLeft = Infinity, curRight = -Infinity;
  const noteLine = l => {
    /* 드롭캡(문단 첫 글자를 두세 줄 높이로 키운 장식)은 글자 크기 단서를 망칩니다.
       본문 첫 문단이 제목보다 커 보이게 되므로 그 줄은 크기 계산에서 뺍니다. */
    if(!l.drop) curH = Math.max(curH, l.h || 0);
    if(!l.bold) curBold = false;
    if(!l.italic) curItalic = false;
    const padL = l.left - bodyLeft, padR = bodyRight - l.right;
    if(!(padL > width*0.06 && Math.abs(padL - padR) < width*0.14)) curCenter = false;
    /* 인용문·발췌는 좌우가 안쪽으로 들어가 조판됩니다. 본문은 첫 줄만 들여쓰고
       둘째 줄부터는 왼쪽 끝에 붙으므로, "모든 줄이 안쪽"이면 인용문입니다. */
    curLeft = Math.min(curLeft, l.left);
    curRight = Math.max(curRight, l.right);
    curLines++;
  };
  const flush = ()=>{
    const t = cur.trim();
    if(t){
      if(curDrop) chapters.push(paras.length);
      paras.push(t);
      const signal = { z: +(curH/medH).toFixed(2), b: curBold && curLines>0,
                       it:curItalic && curLines>0,
                       c: curCenter && curLines>0, p:curPage, y:curY,
                       in: (curLines >= 2) ? +(((curLeft - bodyLeft)/width).toFixed(3)) : 0 };
      const visual = curDisplay.trim().replace(/\s+/g,' ');
      if(visual && visual !== t && visual.replace(/\s/g,'') === t.replace(/\s/g,'')) signal.v = visual;
      sig.push(signal);
    }
    cur=''; curDisplay=''; curDrop=false; curY=0;
    curH=0; curBold=true; curItalic=true; curCenter=true; curLines=0;
    curLeft=Infinity; curRight=-Infinity;
  };

  cleanPages.forEach((page, pi) => {
    const pageNumber = page.n || pi + 1;
    page.lines.forEach(l => {
      const t = l.text;
      if(!prev){
        cur = t; curDisplay = l.display || t; curPage = pageNumber;
        curY = +Math.max(0, Math.min(1, 1 - l.y/page.h)).toFixed(4);
        curDrop = !!l.drop; noteLine(l); prev = l; prevPage = pi; return;
      }

      const samePage = pi === prevPage;
      const gap = samePage ? (prev.y - l.y) : null;
      let brk;

      if(startsBullet(t)){
        brk = true;                                   // 목록 항목은 항상 새 줄
      }else if(!endsSentence(prev.text) && !startsFresh(t)){
        brk = false;                                  // ★ 문장이 안 끝났고 소문자로 이어짐 -> 무조건 이어붙임
      }else if(isShort(prev) && isShort(l) && startsFresh(t) && !endsSentence(prev.text)){
        /* 짧은 줄이 연달아 나오면서 각각 대문자로 시작 -> 짧은 항목 목록입니다.
           본문은 오른쪽 끝까지 차므로 두 줄이 동시에 짧을 일이 거의 없습니다.
           이 규칙이 없으면 목록 한 쪽이 통째로 한 문단이 됩니다. */
        brk = true;
      }else if(gap === null){
        brk = endsSentence(prev.text) && (isShort(prev) || isIndented(l));   // 페이지 경계
      }else if(gap > medGap*1.55){
        brk = endsSentence(prev.text) || startsFresh(t) || isIndented(l);
      }else if(isIndented(l) && endsSentence(prev.text)){
        brk = true;                                   // 첫 줄 들여쓰기
      }else if(isShort(prev) && endsSentence(prev.text) && gap > medGap*1.15){
        brk = true;                                   // 앞줄이 일찍 끝났고 간격도 넓음
      }else{
        brk = false;
      }

      if(brk) flush();
      if(!cur){
        curPage = pageNumber;
        curY = +Math.max(0, Math.min(1, 1 - l.y/page.h)).toFixed(4);
      }
      if(!cur && l.drop) curDrop = true;
      const visualLine = l.display || t;
      if(cur.endsWith('-') && /^[a-z]/.test(t)){
        cur = cur.slice(0,-1) + t;                      // 줄바꿈 하이픈 복원
        curDisplay = curDisplay.replace(/-\s*$/, '') + visualLine;
      }else{
        cur += (cur ? ' ' : '') + t;
        curDisplay += (curDisplay ? ' ' : '') + visualLine;
      }
      noteLine(l);
      prev = l; prevPage = pi;
    });
  });
  flush();

  /* 문단 중간에 섞여 들어간 글머리표를 항목으로 분리 */
  if(bulletsOn){
    const MARK = '\u0001';
    const out = [], outSig = [];
    paras.forEach(function(p, pi){
      const marked = (' ' + p).replace(BULLET_RE, MARK);
      const pieces = marked.split(MARK).map(x=>x.trim()).filter(Boolean);
      if(!pieces.length) return;
      const firstIsItem = marked.startsWith(MARK);
      pieces.forEach(function(piece, i){
        out.push(((firstIsItem || i > 0) ? '• ' : '') + piece);
        /* 쪼개진 조각도 원래 문단의 조판 단서를 물려받습니다.
           단, 글머리표 항목은 제목일 수 없으니 크기 단서를 지웁니다. */
        const sg = sig[pi] || { z:1, b:false, c:false };
        outSig.push((firstIsItem || i > 0)
          ? { z:1, b:sg.b, it:sg.it, c:false, p:sg.p, y:sg.y, in:sg.in }
          : sg);
      });
    });
    out.sig = outSig;
    return out;
  }
  paras.chapters = chapters;          // 배열에 얹어 보냅니다 (반입할 때 책에 저장)
  paras.sig = sig;
  return paras;
}

async function parsePDF(f){
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({data: await f.arrayBuffer()}).promise;
  const pages = [];
  for(let i=1;i<=pdf.numPages;i++){
    if(i===1 || i%20===0) toast(`책 기본판 준비 중… ${i}/${pdf.numPages}쪽`);
    const page = await pdf.getPage(i);
    const h = page.getViewport({scale:1}).height;
    const content = await page.getTextContent();
    const width = page.getViewport({scale:1}).width;
    /* 단마다 따로 담습니다. `n`은 실제 쪽 번호라 원본 좌표 지도는 그대로이고,
       단 경계는 쪽 경계와 같은 규칙으로 문단이 끊깁니다. */
    for(const column of pdfPageColumns(content.items, width)){
      const lines = itemsToLines(column);
      if(lines.length) pages.push({ n:i, h, lines });
    }
  }
  const paragraphs = assembleParagraphs(pages);
  try{ await pdf.destroy(); }catch(e){}
  return paragraphs;
}

/* --- EPUB: unzip -> spine order -> extract text + images --- */
function joinPath(baseDir, rel){
  if(rel.startsWith('/')) return rel.slice(1);
  const out=[];
  for(const p of (baseDir+rel).split('/')){
    if(p==='.'||p==='') continue;
    if(p==='..') out.pop(); else out.push(p);
  }
  return out.join('/');
}
const MIME = {jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml'};
async function openEpubArchive(file){
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const containerFile = zip.file('META-INF/container.xml');
  if(!containerFile) throw new Error('EPUB container.xml을 찾지 못했어요');
  const container = await containerFile.async('text');
  const rootfile = new DOMParser().parseFromString(container,'text/xml').querySelector('rootfile');
  const opfPath = rootfile && rootfile.getAttribute('full-path');
  if(!opfPath || !zip.file(opfPath)) throw new Error('EPUB 책 정보를 찾지 못했어요');
  const opfDir = opfPath.includes('/') ? opfPath.slice(0,opfPath.lastIndexOf('/')+1) : '';
  const opf = new DOMParser().parseFromString(await zip.file(opfPath).async('text'),'text/xml');
  const manifest = {};
  opf.querySelectorAll('manifest > item').forEach(item=>{
    manifest[item.getAttribute('id')] = {
      href:item.getAttribute('href') || '',
      mediaType:item.getAttribute('media-type') || '',
      properties:item.getAttribute('properties') || '',
    };
  });
  const spine = [];
  opf.querySelectorAll('spine > itemref').forEach(ref=>{
    const item = manifest[ref.getAttribute('idref')];
    if(!item || !item.href) return;
    spine.push({
      id:ref.getAttribute('idref'),
      href:item.href,
      path:decodeURIComponent(joinPath(opfDir, item.href)),
      linear:ref.getAttribute('linear') !== 'no',
    });
  });
  return { zip, opf, opfPath, opfDir, manifest, spine };
}
async function parseEPUB(f, bookId){
  const archive = await openEpubArchive(f);
  const zip = archive.zip;
  const paras=[]; let imgIdx=0; const seenImg={};
  const sig=[];
  for(let spineIndex=0; spineIndex<archive.spine.length; spineIndex++){
    const chapter = archive.spine[spineIndex];
    const chPath = chapter.path;
    const file = zip.file(chPath) || zip.file(decodeURIComponent(chapter.href));
    if(!file) continue;
    const chDir = chPath.includes('/') ? chPath.slice(0,chPath.lastIndexOf('/')+1) : '';
    const doc = new DOMParser().parseFromString(await file.async('text'),'text/html');
    let elementIndex = 0;
    for(const el of doc.querySelectorAll('p, h1, h2, h3, h4, li, img, image')){
      const sourceElement = elementIndex++;
      const tag = el.tagName.toLowerCase();
      if(tag==='img' || tag==='image'){
        const src = el.getAttribute('src') || el.getAttribute('xlink:href') || el.getAttribute('href');
        if(!src || src.startsWith('data:') || src.startsWith('http')) continue;
        const path = decodeURIComponent(joinPath(chDir, src));
        let imgFile = zip.file(path);
        if(!imgFile){
          const base = path.split('/').pop();
          const cand = Object.keys(zip.files).find(k=>k.endsWith('/'+base)||k===base);
          if(cand) imgFile = zip.file(cand);
        }
        if(!imgFile) continue;
        if(seenImg[imgFile.name]!==undefined){
          paras.push(IMG_MARK+seenImg[imgFile.name]);
          sig.push({src:chPath,si:spineIndex,ei:sourceElement});
          continue;
        }
        const ext = (imgFile.name.split('.').pop()||'').toLowerCase();
        const blob = new Blob([await imgFile.async('arraybuffer')], {type: MIME[ext]||'image/jpeg'});
        const id = bookId+'|'+(imgIdx++);
        try{
          await imgPut(id, blob); seenImg[imgFile.name]=id; paras.push(IMG_MARK+id);
          sig.push({src:chPath,si:spineIndex,ei:sourceElement});
        }catch(e){}
      }else{
        if(tag==='li' && el.querySelector('p,h1,h2,h3,h4')) continue;
        let t = el.textContent.replace(/\s+/g,' ').trim();
        /* 불법 복제본에 찍힌 워터마크는 본문 끝에 눌어붙어 나옵니다.
           PDF는 위치·반복으로 걸러내지만 EPUB은 그냥 글자라서 여기서 뗍니다. */
        t = t.replace(/\s*(OceanofPDF\.com|Downloaded from [^\s]+)\s*$/i, '').trim();
        if(!t || /^(OceanofPDF\.com)$/i.test(t)) continue;
        /* EPUB은 원래 HTML입니다. 제목은 <h1>·<h2>로 이미 표시되어 있고
           인용문은 <blockquote>, 곁가지 상자는 <aside>로 감싸여 있습니다.
           지금까지는 글자만 꺼내고 이 표시를 버렸습니다. 이제 같이 들고 갑니다.
           PDF에서 변환된 EPUB은 <h1> 대신 <p class="chapter-title">을 쓰기도 해서
           class 이름도 함께 봅니다. */
        const cls = (el.getAttribute('class') || '');
        let r = '';
        if(tag === 'h1') r = 'h1';
        else if(tag === 'h2') r = 'h2';
        else if(tag === 'h3' || tag === 'h4') r = 'h3';
        else if(/(^|[\s_-])(chap|chapter|title|head|sect)/i.test(cls)) r = 'h2';
        if(el.closest && el.closest('blockquote')) r = r || 'quote';
        else if(el.closest && el.closest('aside')) r = r || 'note';
        paras.push(t);
        sig.push({ r:r, src:chPath, si:spineIndex, ei:sourceElement });
      }
    }
  }
  // Keep EPUB heading tags and paragraph signals, but do not build navigation metadata.
  return mergeWrapped(paras, sig);
}
