/* ---- 붙여넣은 글 ----
   기사 한 토막, X 스레드, 메모 — DRM도 파일도 없는 아무 영어 텍스트.

   붙여넣는 글의 모양이 한 가지가 아닙니다. 깃허브에서 남의 README 를 긁어오면
   마크다운이 오고, 페이지 소스를 긁어오면 HTML 이 옵니다. 그걸 평범한 글로 다루면
   `## Getting started`, `|---|---|`, `[docs](https://…)` 가 본문에 그대로 남아
   읽을 수 없습니다. 그래서 먼저 무슨 모양인지 알아보고 그에 맞게 읽습니다.

     HTML      -> 기사 URL 과 같은 추출기를 씁니다 (parseArticleHtml)
     마크다운  -> 제목·목록·표·코드·인용을 Breeze 덩어리로 옮깁니다
     평범한 글 -> 예전 그대로
                    첫 줄         -> 제목
                    빈 줄         -> 문단 경계
                    빈 줄이 없음  -> 줄마다 한 장의 카드 (스레드)

   어느 쪽이든 추측이 필요한 판단은 넣지 않았습니다. 마크다운은 구조를 글로 적어 두는
   형식이라, 눈에 보이는 기호만 읽으면 결과를 미리 예상할 수 있습니다. */
const PASTE_TITLE_MAX = 90;
const cutPasteTitle = t => {
  const s = String(t||'').replace(/\s+/g,' ').trim();
  return s.length > PASTE_TITLE_MAX ? s.slice(0,PASTE_TITLE_MAX).trim()+'…' : s;
};

/* 표 구분선. 줄 하나가 전부 칸막이·붙임표·쌍점일 때만 참입니다 (`|---|:--:|`). */
const MD_TABLE_RULE = /^\|?[\s:|-]*-[\s:|-]*\|[\s:|-]*$/;
const MD_FENCE = /^\s{0,3}(```|~~~)/;
const MD_LIST  = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

/* 마크다운인지 알아봅니다. 기호 하나로 정하지 않습니다 — 평범한 글에도 링크 하나쯤은
   있고, 그것 때문에 X 스레드가 카드로 안 펼쳐지면 손해가 더 큽니다. 그래서 구조를
   만드는 기호(제목·코드·표·목록·인용)가 반드시 하나는 있어야 하고, 점수도 3점을
   넘어야 마크다운으로 봅니다. */
function looksMarkdown(text){
  const heading = /^\s{0,3}#{1,6}\s+\S/m.test(text);
  const fence   = MD_FENCE.test(text) || /\n\s{0,3}(```|~~~)/.test(text);
  const bullet  = /^\s*[-*+]\s+\S/m.test(text);
  const number  = /^\s*\d+[.)]\s+\S/m.test(text);
  const quote   = /^\s{0,3}>\s?\S/m.test(text);
  const setext  = /\n(=|-){3,}\s*(\n|$)/.test(text);
  const table   = text.split('\n').some(line => MD_TABLE_RULE.test(line.trim()));
  if(!(heading || fence || bullet || number || quote || setext || table)) return false;
  let score = 0;
  if(heading) score += 2;
  if(fence) score += 2;
  if(table) score += 2;
  if(bullet) score += 1;
  if(number) score += 1;
  if(quote) score += 1;
  if(setext) score += 1;
  if(/\[[^\]\n]+\]\([^)\s]+\)/.test(text)) score += 1;
  if(/!\[[^\]\n]*\]\([^)\s]+\)/.test(text)) score += 1;
  if(/(\*\*|__)[^*_\n]+\1/.test(text)) score += 1;
  if(/`[^`\n]+`/.test(text)) score += 1;
  return score >= 3;
}

/* HTML 로 붙여넣었나. 태그가 글 앞쪽에 실제로 있고 닫는 태그도 여럿이어야 합니다 —
   본문에 "a < b" 가 섞인 것만으로 HTML 이라고 하면 안 됩니다. */
function looksHtml(text){
  const head = text.slice(0, 4000);
  return /<(?:!doctype\s+html|html|body|article|main|section|div|p|h[1-6]|table|ul|ol|pre|blockquote)\b[^>]*>/i.test(head)
      && (text.match(/<\/[a-z][a-z0-9]*>/gi) || []).length >= 3;
}

/* 마크다운의 줄 안쪽 기호를 벗깁니다. 읽는 사람에게 남길 것은 글자뿐입니다.
   사진·배지는 버립니다 — 붙여넣은 글에는 받아 올 주소가 없어서 빈 칸만 남습니다. */
function mdInline(raw){
  let s = String(raw||'')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/!\[[^\]]*\]\[[^\]]*\]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/<((?:https?|mailto):[^>\s]+)>/gi, '$1')   // <https://…> 는 주소만 남깁니다
    .replace(/<\/?[a-z][a-z0-9]*(?:\s[^>]*)?>/gi, '')
    .replace(/`+([^`]+)`+/g, '$1')
    /* 굵게. 안쪽에 기호가 또 들어오지 못하게 막습니다 — 느슨하게 두면 `**+**가 하나씩
       있고, **두 줄은` 에서 첫 여는 기호가 한참 뒤의 기호까지 삼켜 문장이 뭉개집니다. */
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1');
  /* 홑기호 기울임. snake_case 낱말을 건드리지 않도록 양옆을 확인합니다.
     뒤돌아보기(lookbehind)는 오래된 사파리가 모르므로 쓰지 않습니다. */
  s = s.replace(/(^|[^\w*])\*([^*\n]+)\*(?=[^\w*]|$)/g, '$1$2')
       .replace(/(^|[^\w_])_([^_\n]+)_(?=[^\w_]|$)/g, '$1$2')
       .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, '$1');
  return s.replace(/\s+/g, ' ').trim();
}

/* 덩어리 목록 -> 저장할 문단과 조판.
   f 는 문단 번호입니다. 읽던 자리와 단어장 예문이 이 번호로 붙으므로 어긋나면 안 됩니다. */
function assemblePasted(items, source){
  const paras = [], blocks = [];
  for(const item of items){
    const t = String(item.t||'').trim();
    if(!t) continue;
    const r = item.r || 'p';
    const f = paras.length;
    paras.push(t);
    const block = { r, t, f };
    /* 인용·표·코드는 여러 덩어리가 한 상자로 묶입니다. 묶음표를 파서가 붙여 준 대로
       씁니다 — 역할만 보고 묶으면 나란히 붙은 두 코드가 한 상자로 합쳐집니다. */
    if(item.g != null) block.g = r + ':' + item.g;
    blocks.push(block);
  }
  if(!paras.length) return null;
  const levels = new Set(blocks.filter(b=>b.r.charAt(0)==='h').map(b=>b.r)).size;
  return { paras, formatting: { blocks, start:0, levels: levels || 1, source, createdAt:Date.now() } };
}

/* 마크다운 -> Breeze 덩어리. 줄 단위 상태 기계입니다.
   여는 기호를 만나면 닫힐 때까지 그 안을 그 규칙대로 담습니다. */
function parseMarkdownBlocks(text){
  const lines = text.split('\n');
  const items = [];
  let i = 0, fenceNo = 0, quoteNo = 0, tableNo = 0;

  /* 맨 앞 --- 사이의 YAML 머리말은 글이 아니라 설정입니다(정적 사이트 생성기가 씁니다). */
  if(/^---\s*$/.test(lines[0] || '')){
    let j = 1;
    while(j < lines.length && !/^(---|\.\.\.)\s*$/.test(lines[j])) j++;
    if(j < lines.length) i = j + 1;
  }

  const push = (r, t, g) => {
    const value = String(t||'').trim();
    if(value) items.push(g != null ? { r, t:value, g } : { r, t:value });
  };
  const blockStart = line =>
    /^\s{0,3}#{1,6}\s+\S/.test(line) || MD_FENCE.test(line) || MD_LIST.test(line)
    || /^\s{0,3}>\s?/.test(line) || /^\s{0,3}(\*{3,}|-{3,}|_{3,})\s*$/.test(line)
    || MD_TABLE_RULE.test(line.trim());

  while(i < lines.length){
    const line = lines[i];
    const trimmed = line.trim();
    if(!trimmed){ i++; continue; }

    /* 코드 울타리. 안쪽은 마크다운이 아니므로 한 글자도 손대지 않습니다. */
    const fence = trimmed.match(/^(```|~~~)/);
    if(fence && MD_FENCE.test(line)){
      const close = fence[1];
      const body = [];
      i++;
      while(i < lines.length && !lines[i].trim().startsWith(close)) body.push(lines[i++]);
      i++;
      /* 코드는 줄바꿈이 뜻을 가지므로 한 덩어리로 둡니다. 줄마다 쪼개면 상자가 스무 개로
         늘고, 문단 번호가 코드 줄 수만큼 밀립니다. */
      const code = body.join('\n').replace(/\s+$/,'');
      if(code.trim()) push('code', code, ++fenceNo);
      continue;
    }

    // 밑줄로 그은 제목 (다음 줄이 ==== 또는 ----). reStructuredText 로 쓴 글도 여기 걸립니다.
    const under = (lines[i+1] || '').trim();
    if(!blockStart(line) && /^=+$/.test(under)){ push('h1', mdInline(trimmed)); i += 2; continue; }
    if(!blockStart(line) && /^-{2,}$/.test(under)){ push('h2', mdInline(trimmed)); i += 2; continue; }

    const heading = trimmed.match(/^(#{1,6})\s+(.*?)\s*#*$/);
    if(heading){
      push('h' + Math.min(3, heading[1].length), mdInline(heading[2]));
      i++;
      continue;
    }

    // 가로줄은 읽기에 보탤 것이 없습니다. 문단 경계는 이미 지켜지고 있습니다.
    if(/^(\*{3,}|-{3,}|_{3,}|={3,})$/.test(trimmed)){ i++; continue; }

    /* 표. 읽는 화면에 격자를 그리지는 않고, 한 행을 한 줄로 ` · ` 로 이어 상자에 담습니다 —
       문단으로 풀면 낱말이 어느 칸의 것인지 사라지고, 격자를 그리면 폰에서 옆으로 넘칩니다.
       칸마다 머리글을 앞에 붙여야 두 번째 행부터도 무슨 값인지 압니다. */
    if(trimmed.includes('|') && MD_TABLE_RULE.test((lines[i+1]||'').trim())){
      const cells = row => row.trim().replace(/^\||\|$/g,'').split('|').map(c=>mdInline(c));
      const head = cells(line);
      const rows = [];
      i += 2;
      while(i < lines.length && lines[i].includes('|') && lines[i].trim()){ rows.push(cells(lines[i])); i++; }
      const group = ++tableNo;
      const headText = head.filter(Boolean).join(' · ');
      if(headText) push('note', headText, group);
      for(const row of rows){
        const text = row.map((c,n) => (head[n] && c) ? head[n] + ': ' + c : c).filter(Boolean).join(' · ');
        if(text) push('note', text, group);
      }
      continue;
    }

    /* 인용. 안쪽에 또 마크다운이 있을 수 있어서 기호만 벗기고 이어 붙입니다. */
    if(/^\s{0,3}>\s?/.test(line)){
      const body = [];
      while(i < lines.length && (/^\s{0,3}>\s?/.test(lines[i]) || (body.length && lines[i].trim()))){
        body.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
        i++;
      }
      const group = ++quoteNo;
      // 인용 안의 빈 줄은 문단 경계입니다. 한 상자 안에서 문단만 갈라 둡니다.
      body.join('\n').split(/\n\s*\n+/).forEach(part => push('quote', mdInline(part.replace(/\n/g,' ')), group));
      continue;
    }

    /* 목록. 항목 하나가 한 문단입니다 — 통째로 이으면 열 줄이 한 덩어리가 되고,
       줄마다 쪼개면 한 항목의 이어진 줄이 따로 떨어집니다. */
    if(MD_LIST.test(line)){
      while(i < lines.length){
        const m = lines[i].match(MD_LIST);
        if(!m) break;
        const depth = Math.min(2, Math.floor(m[1].replace(/\t/g,'  ').length / 2));
        const parts = [m[3]];
        i++;
        // 다음 항목이 시작되기 전까지 이어진 줄은 같은 항목입니다.
        while(i < lines.length && lines[i].trim() && !MD_LIST.test(lines[i])
              && !/^\s{0,3}#{1,6}\s/.test(lines[i]) && !MD_FENCE.test(lines[i])){
          parts.push(lines[i].trim());
          i++;
        }
        let body = mdInline(parts.join(' '));
        // 체크상자는 기호로 바꿉니다. [ ] [x] 를 글자로 두면 무슨 뜻인지 안 보입니다.
        body = body.replace(/^\[\s\]\s*/, '☐ ').replace(/^\[[xX]\]\s*/, '☑ ');
        /* 깊이는 글머리표로만 나타냅니다. 앞에 공백을 넣어 봐야 HTML 이 지우고,
           push 도 앞뒤를 다듬으므로 남지 않습니다. */
        const mark = /^\d/.test(m[2]) ? m[2].replace(/[.)]$/,'.') + ' ' : (depth ? '– ' : '• ');
        if(body) push('p', mark + body);
        if(i < lines.length && !lines[i].trim()){
          // 빈 줄 하나는 느슨한 목록의 항목 사이입니다. 두 줄이면 목록이 끝난 것으로 봅니다.
          if(/^\s*$/.test(lines[i+1] || 'x')) break;
          i++;
        }
      }
      continue;
    }

    // 참조 링크 정의와 HTML 주석은 읽을 글이 아닙니다.
    if(/^\[[^\]]+\]:\s*\S+/.test(trimmed)){ i++; continue; }
    if(/^<!--/.test(trimmed)){
      while(i < lines.length && !lines[i].includes('-->')) i++;
      i++;
      continue;
    }

    // 평범한 문단. 빈 줄이나 다른 덩어리가 시작될 때까지 이어 붙입니다.
    const para = [];
    while(i < lines.length && lines[i].trim() && !blockStart(lines[i])
          && !(lines[i].includes('|') && MD_TABLE_RULE.test((lines[i+1]||'').trim()))
          && !/^=+$/.test((lines[i+1]||'').trim())){
      para.push(lines[i].trim());
      i++;
    }
    // 배지만 있는 줄은 여기서 빈 문자열이 되어 저절로 빠집니다.
    push('p', mdInline(para.join(' ')));
  }
  return items;
}

function parsePastedMarkdown(text){
  const items = parseMarkdownBlocks(text);
  if(!items.length) return null;
  /* 읽을 글이 정말 있는지 봅니다. 배지와 코드만 있는 README 를 책으로 만들면
     열었을 때 읽을 것이 없습니다. */
  if(!items.some(item => item.r === 'p' || item.r === 'quote')) return null;

  /* 제목은 첫 h1 입니다. 없으면 첫 덩어리를 제목으로 쓰고 h1 로 올립니다 —
     README 는 거의 늘 첫 줄이 제목이라 이쪽이 예상과 맞습니다. */
  let title = '';
  const firstHead = items.findIndex(item => item.r === 'h1');
  if(firstHead >= 0) title = items[firstHead].t;
  else if(items.length > 1){ title = items[0].t; items[0] = { r:'h1', t:items[0].t }; }
  else title = items[0].t;

  const assembled = assemblePasted(items, 'pasted-markdown');
  if(!assembled) return null;
  return { title: cutPasteTitle(title), paras: assembled.paras, thread:false,
           formatting: assembled.formatting };
}

/* HTML 붙여넣기는 기사 URL 과 같은 추출기를 씁니다. 규칙을 두 벌 갖고 있으면
   한쪽만 고쳐지는 날이 옵니다. */
function parsePastedHtml(text){
  if(typeof parseArticleHtml !== 'function' || typeof articleAssemble !== 'function') return null;
  let parsed = null;
  try{ parsed = parseArticleHtml(text, ''); }catch(e){ return null; }
  if(!parsed || !parsed.blocks) return null;
  /* 붙여넣은 HTML 에는 사진을 받아 올 주소가 없습니다. 자리만 잡고 빈 칸으로 남으므로
     아예 뺍니다 — 문단 번호가 밀리지 않게 다시 조립합니다. */
  const blocks = parsed.blocks.filter(block => block.r !== 'img');
  if(!blocks.length) return null;
  const title = parsed.title || blocks[0].t;
  const assembled = articleAssemble(title, blocks);
  return { title: cutPasteTitle(title), paras: assembled.paras, thread:false,
           formatting: Object.assign({}, assembled.formatting, { source:'pasted-html' }) };
}

function parsePastedText(raw){
  // 웹에서 복사한 글에는 눈에 보이지 않는 고정폭·너비 0 공백이 섞여 옵니다.
  const text = String(raw||'').replace(/\r/g,'')
    .replace(/[\u00a0\u200b\u2028\u2029]/g,' ').trim();
  if(!text) return null;

  /* 모양을 알아보고 맞는 쪽으로 보냅니다. 어느 쪽이든 실패하면 평범한 글로 읽습니다 —
     붙여넣기가 아무것도 안 되는 것보다 낫습니다. */
  if(looksHtml(text)){
    const asHtml = parsePastedHtml(text);
    if(asHtml) return asHtml;
  }
  if(looksMarkdown(text)){
    const asMarkdown = parsePastedMarkdown(text);
    if(asMarkdown) return asMarkdown;
  }

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
  /* 구텐베르크의 TXT 판은 표시 한 줄로만 본문의 시작과 끝을 알립니다. */
  const cut = trimGutenbergText(blocks);
  return mergeWrapped(cut ? blocks.slice(cut.from, cut.to) : blocks, null);
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
    /* 빈칸 문제의 밑줄은 그림이라 글자로 안 뽑히고, 자리만 텅 비어 옵니다.
       그대로 두면 "just describe the ." 처럼 무엇을 묻는지 사라집니다.
       낱말 사이 공백은 0.6em 안팎이고 그 자리는 7.8em이었습니다 — 열두 배라
       헷갈릴 여지가 없습니다. 본문 글자는 건드리지 않고 사본에만 남깁니다. */
    let blanked = '';
    let sawBlank = false;
    ps.forEach((p,i)=>{
      if(i===0){ text = p.s; blanked = p.s; return; }
      const prev = ps[i-1];
      const gapX = p.x - (prev.x + prev.w);
      const needSpace = gapX > Math.max(0.16*(p.h||10), 0.4) && !/\s$/.test(text) && !/^\s/.test(p.s);
      text += (needSpace ? ' ' : '') + p.s;
      const isBlank = gapX > (p.h || 10) * 2.5;
      if(isBlank) sawBlank = true;
      blanked += (isBlank ? ' ______ ' : (needSpace ? ' ' : '')) + p.s;
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
    return { y:r.y, h:r.h, text, display,
             blank: sawBlank ? blanked.replace(/\s+/g,' ').trim() : '',
             drop:!!r.drop, bold: tw>0 && bw/tw > 0.6,
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
  await ensurePdfLib();
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
      if(!lines.length) continue;
      /* 문항 번호 줄은 본문보다 왼쪽으로 내어 조판됩니다. 내어쓰기 폭과 쪽 안
         세로 위치를 남겨 두면 `modules/exam-shorts`가 같은 줄을 다시 읽습니다. */
      const lefts = lines.map(line => line.left).sort((a, b) => a - b);
      const bodyLeft = lefts[Math.floor(lefts.length / 2)];
      lines.forEach(line => { line.outdent = bodyLeft - line.left; line.rel = line.y / h; });
      pages.push({ n:i, h, lines });
    }
  }
  const paragraphs = assembleParagraphs(pages);
  paragraphs.sheets = pages;          // modules/exam-shorts/exam.js 가 소비합니다
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

/* ---- 저작권 보호(DRM)가 걸린 책 ----
   서점에서 산 EPUB 상당수는 열쇠 없이는 못 읽습니다. 이걸 알아보지 못하면
   "EPUB 책 정보를 찾지 못했어요" 같은 말이 나오고, 그러면 사용자는 앱이
   고장 났다고 생각합니다. 우리가 못 여는 것이 아니라 열 수 없는 파일이라는
   것을 말해 주어야, 다른 파일을 찾아볼 생각을 합니다.

   조심할 것: encryption.xml 이 있다고 다 DRM 이 아닙니다. 글꼴을 살짝 가려
   두는(obfuscation) 것은 표준에 있는 정상 기능이고 그런 책은 잘 읽힙니다.
   그래서 "무엇이 잠겼는가"를 봅니다 — 글꼴만 잠긴 책은 통과시킵니다. */
const EPUB_FONT_OBFUSCATION = new Set([
  'http://www.idpf.org/2008/embedding',      // IDPF 표준 글꼴 가리기
  'http://ns.adobe.com/pdf/enc#RC',          // 어도비 글꼴 가리기
]);
async function epubProtection(zip){
  if(zip.file('META-INF/rights.xml')) return 'Adobe DRM';       // 어도비 ADEPT
  if(zip.file('META-INF/sinf.xml'))   return 'Apple FairPlay';  // 애플 북스
  const encryptionFile = zip.file('META-INF/encryption.xml');
  if(!encryptionFile) return '';
  let doc;
  try{ doc = new DOMParser().parseFromString(await encryptionFile.async('text'), 'text/xml'); }
  catch(e){ return ''; }
  /* 이름공간 접두사(enc:, ds:)는 책마다 달라서 지역 이름으로 찾습니다. */
  const blocks = [...doc.getElementsByTagNameNS('*','EncryptedData')];
  for(const block of blocks){
    const method = block.getElementsByTagNameNS('*','EncryptionMethod')[0];
    if(EPUB_FONT_OBFUSCATION.has(method ? method.getAttribute('Algorithm')||'' : '')) continue;
    /* 알고리즘이 낯설어도 잠긴 것이 글꼴 파일뿐이면 본문은 멀쩡합니다. */
    const reference = block.getElementsByTagNameNS('*','CipherReference')[0];
    if(/\.(ttf|otf|woff2?)$/i.test(reference ? reference.getAttribute('URI')||'' : '')) continue;
    return 'DRM';
  }
  return '';
}

async function openEpubArchive(file){
  await ensureZipLib();
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const protection = await epubProtection(zip);
  if(protection){
    const locked = new Error('저작권 보호(DRM)가 걸린 책이에요');
    locked.drm = protection;      // 화면에서 "읽지 못했다"가 아니라 "잠겨 있다"로 말하기 위해
    throw locked;
  }
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
/* ---- 프로젝트 구텐베르크 껍데기 벗기기 ----
   구텐베르크 파일은 본문 앞뒤에 라이선스 안내가 붙어 있습니다. 그대로 두면
   개츠비를 열었을 때 1쪽이 소설이 아니라 저작권 안내입니다 — 원서를 읽어
   보려고 큰마음 먹고 누른 사람이 처음 보는 화면이 그것이면 안 됩니다.

   내장 고전만 미리 손봐 두지 않고 반입기에서 벗기는 이유는, 사용자가 직접
   구텐베르크에서 받아 온 파일도 똑같이 깨끗해야 하기 때문입니다.

   표시는 두 겹입니다. EPUB3 판은 `id="pg-header"` · `id="pg-footer"` 로 감싸
   두고, 옛 판과 TXT 는 `*** START OF ... ***` 한 줄로만 알립니다. 둘 다 봅니다. */
const PG_START = /\*\*\*\s*START OF (?:TH(?:E|IS)\s+)?PROJECT GUTENBERG EBOOK\b[^*]*\*\*\*/i;
const PG_END   = /\*\*\*\s*END OF (?:TH(?:E|IS)\s+)?PROJECT GUTENBERG EBOOK\b[^*]*\*\*\*/i;
const PG_WRAPPER_IDS = '#pg-header, #pg-footer, #pg-start-separator, #pg-end-separator, #pg-machine-header';

function stripGutenbergWrapper(doc){
  doc.querySelectorAll(PG_WRAPPER_IDS).forEach(node => node.remove());
}
/* 문단이 다 모인 뒤 한 번 더 봅니다 — 표시만 있고 감싸는 태그가 없는 판을 위해서.
   표시를 못 찾으면 아무것도 자르지 않습니다. 구텐베르크가 아닌 책이 잘리는 것이
   라이선스 안내가 남는 것보다 훨씬 나쁩니다. */
function trimGutenbergText(paras){
  const start = paras.findIndex(p => PG_START.test(p));
  const end   = paras.findIndex(p => PG_END.test(p));
  if(start < 0 && end < 0) return null;
  const from = start >= 0 ? start + 1 : 0;
  const to   = end   >  start ? end : paras.length;
  if(to - from < 20) return null;        // 너무 많이 자르면 표시를 잘못 읽은 것입니다
  return { from, to };
}

/* ---- EPUB 표지 ----
   서가는 표지로 읽힙니다. 지금까지 책 카드에 있던 것은 색과 제목뿐이었는데,
   표지 그림은 처음부터 파일 안에 들어 있었습니다 — 꺼내 쓰지 않았을 뿐입니다.
   내장 고전 세 권도, 사용자가 끌어다 놓는 EPUB 도 같은 길로 표지를 얻습니다.

   가리키는 방법이 판마다 다릅니다. EPUB3 은 manifest 항목에
   properties="cover-image" 를 달고, EPUB2 는 <meta name="cover" content="항목id">
   로 가리킵니다. 둘 다 없는 파일도 흔해서, 마지막에는 이름으로 찾아봅니다
   (구텐베르크 파일이 이쪽입니다: `..._cover.jpg`).

   SVG 는 받지 않습니다 — 그림처럼 생겼지만 스크립트를 품을 수 있는 문서입니다. */
async function epubCoverImage(archive, key){
  const items = Object.keys(archive.manifest).map(id => archive.manifest[id]);
  const usable = item => item && /^image\/(jpeg|png|gif|webp)$/i.test(item.mediaType || '');
  let cover = items.find(item => usable(item) && /(^|\s)cover-image(\s|$)/.test(item.properties || ''));
  if(!cover){
    const meta = archive.opf.querySelector('metadata > meta[name="cover"]');
    const pointed = meta && archive.manifest[meta.getAttribute('content') || ''];
    if(usable(pointed)) cover = pointed;
  }
  if(!cover) cover = items.find(item => usable(item) && /cover/i.test(item.href || ''));
  if(!cover) return '';
  const path = decodeURIComponent(joinPath(archive.opfDir, cover.href));
  const file = archive.zip.file(path);
  if(!file) return '';
  try{
    const blob = new Blob([await file.async('arraybuffer')], {type:cover.mediaType});
    await imgPut(key, blob);
    return key;
  }catch(error){ return ''; }
}

async function parseEPUB(f, bookId){
  const archive = await openEpubArchive(f);
  const zip = archive.zip;
  /* 표지는 본문 그림과 같은 접두어를 씁니다. 책을 지울 때 `imgPurge(id+'|')`
     한 번에 함께 쓸려 나가야 하고, 반입이 끝나고 임시 ID 를 진짜 ID 로 바꿀 때
     (`imgRename`) 같이 따라와야 하기 때문입니다. */
  const cover = await epubCoverImage(archive, bookId+'|cover');
  const paras=[]; let imgIdx=0; const seenImg={};
  const sig=[];
  for(let spineIndex=0; spineIndex<archive.spine.length; spineIndex++){
    const chapter = archive.spine[spineIndex];
    const chPath = chapter.path;
    const file = zip.file(chPath) || zip.file(decodeURIComponent(chapter.href));
    if(!file) continue;
    const chDir = chPath.includes('/') ? chPath.slice(0,chPath.lastIndexOf('/')+1) : '';
    const doc = new DOMParser().parseFromString(await file.async('text'),'text/html');
    stripGutenbergWrapper(doc);
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
  /* 감싸는 태그가 없는 옛 판을 위해 한 번 더. 자를 자리를 못 찾으면 그대로 둡니다. */
  const cut = trimGutenbergText(paras);
  const merged = cut
    ? mergeWrapped(paras.slice(cut.from, cut.to), sig.slice(cut.from, cut.to))
    : mergeWrapped(paras, sig);
  merged.cover = cover;
  return merged;
}
