/* ================= lemmatizer ================= */
const IRREG = {
  was:'be',were:'be',is:'be',are:'be',am:'be',been:'be',being:'be',
  has:'have',had:'have',having:'have',does:'do',did:'do',done:'do',doing:'do',
  went:'go',gone:'go',goes:'go',going:'go',said:'say',made:'make',took:'take',taken:'take',
  came:'come',got:'get',gotten:'get',gave:'give',given:'give',found:'find',thought:'think',
  told:'tell',became:'become',left:'leave',felt:'feel',brought:'bring',began:'begin',begun:'begin',
  kept:'keep',held:'hold',wrote:'write',written:'write',stood:'stand',heard:'hear',meant:'mean',
  met:'meet',ran:'run',paid:'pay',sat:'sit',spoke:'speak',spoken:'speak',led:'lead',grew:'grow',
  grown:'grow',lost:'lose',fell:'fall',fallen:'fall',sent:'send',built:'build',understood:'understand',
  drew:'draw',drawn:'draw',broke:'break',broken:'break',spent:'spend',rose:'rise',risen:'rise',
  drove:'drive',driven:'drive',bought:'buy',wore:'wear',worn:'wear',chose:'choose',chosen:'choose',
  ate:'eat',eaten:'eat',knew:'know',known:'know',saw:'see',seen:'see',sold:'sell',taught:'teach',
  caught:'catch',fought:'fight',sought:'seek',flew:'fly',flown:'fly',threw:'throw',thrown:'throw',
  lain:'lie',lay:'lie',woke:'wake',woken:'wake',hidden:'hide',hid:'hide',
  men:'man',women:'woman',children:'child',feet:'foot',teeth:'tooth',mice:'mouse',
  leaves:'leaf',lives:'life',wives:'wife',knives:'knife',selves:'self',shelves:'shelf',
  movies:'movie',cookies:'cookie',calories:'calorie',
  better:'good',best:'good',worse:'bad',worst:'bad'
};
const NO_LEMMA = new Set(['news','always','perhaps','these','those','series','species','during',
  'evening','morning','nothing','something','anything','everything','indeed','hundred','sacred',
  'hatred','united','ing','analysis','basis','crisis','thesis',
  /* 재귀대명사는 -s를 떼면 "themselve" 같은 없는 낱말이 되어 사전이 빕니다. */
  'themselves','ourselves','yourselves','myself','yourself','himself','herself','itself','oneself']);
function lemma(w){
  if(IRREG[w]) return IRREG[w];
  if(w.length<4 || NO_LEMMA.has(w)) return w;
  const hasVowel = s => /[aeiouy]/.test(s);
  if(/ies$/.test(w) && w.length>4) return w.slice(0,-3)+'y';
  if(/(sses|shes|ches|xes|zes)$/.test(w)) return w.slice(0,-2);
  if(/oes$/.test(w) && w.length>4) return w.slice(0,-2);
  if(/s$/.test(w) && !/(ss|us|is)$/.test(w)) return w.slice(0,-1);
  if(/ing$/.test(w) && w.length>5){
    let b = w.slice(0,-3);
    if(!hasVowel(b)) return w;
    if(b.length>2 && b[b.length-1]===b[b.length-2] && !/(ll|ss|zz)$/.test(b)) return b.slice(0,-1);
    if(/[^aeiou][aeiou][^aeiouwxy]$/.test(b)) return b+'e';
    return b;
  }
  if(/ed$/.test(w) && w.length>4 && !/eed$/.test(w)){
    let b = w.slice(0,-2);
    if(!hasVowel(b)) return w;
    if(b.length>2 && b[b.length-1]===b[b.length-2] && !/(ll|ss|zz)$/.test(b)) return b.slice(0,-1);
    if(/[^aeiou][aeiou][^aeiouwxy]$/.test(b)) return b+'e';
    return b;
  }
  return w;
}
const isAcro = w => /^[A-Z]{2,6}s?$/.test(w);
function lemmaCands(raw){
  const w0 = raw.toLowerCase().replace(/’/g,"'");
  if(isAcro(raw)) return [w0.replace(/s$/,'')];
  const set = new Set([lemma(w0)]);
  const addWithE = b => { set.add(b); set.add(b+'e'); if(b.length>2 && b[b.length-1]===b[b.length-2]) set.add(b.slice(0,-1)); };
  if(/ing$/.test(w0) && w0.length>5 && /[aeiouy]/.test(w0.slice(0,-3))) addWithE(w0.slice(0,-3));
  if(/ed$/.test(w0) && w0.length>4 && /[aeiouy]/.test(w0.slice(0,-2))) addWithE(w0.slice(0,-2));
  set.add(w0);
  [...set].forEach(c=>{ if(c!==w0 && c.endsWith('e')) set.add(c.slice(0,-1)); });
  return [...set];
}

function sentenceOf(span){
  if(span && span.dataset && span.dataset.example) return span.dataset.example;
  const paragraph = span && span.closest ? span.closest('[data-pi]') : null;
  const paraText = paragraph ? (curBook.paras[+paragraph.dataset.pi]||'') : '';
  const sents = paraText.match(/[^.!?…]+[.!?…]*/g) || [paraText];
  const re = new RegExp('\\b'+span.textContent.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i');
  return (sents.find(s=>re.test(s)) || sents[0]).trim();
}
function readerWordNodes(selector){
  const nodes=[...document.querySelectorAll(selector)];
  if(originalSession && originalSession.frames){
    originalSession.frames.forEach(frame=>{
      try{ if(frame&&frame.contentDocument) nodes.push(...frame.contentDocument.querySelectorAll(selector)); }catch(e){}
    });
  }
  return nodes;
}
function addWord(k, span){
  const raw = span.textContent.replace(/’/g,"'");
  const acro = isAcro(raw);
  const display = acro ? raw.replace(/s$/,'') : k;
  const forms = acro ? [display] : [...new Set([k, ...lemmaCands(raw), raw.toLowerCase()])];
  words[k] = { word:display, clicked:raw, forms, ko:'', phon:'', defs:[], kodict:[],
    example:sentenceOf(span), book:curBook.title, status:1, addedAt:Date.now(), up:Date.now() };
  /* 이제 이 기기에 잃을 것이 생겼습니다 — 저장소를 영구로 표시해 달라고 부탁합니다.
     한 번만 물어보고, 이미 물어봤으면 조용히 지나갑니다. */
  requestDurableLocalStorage();
  delete dead[k]; save(LS_DEAD, dead);
  saveWords(); queueSync();
  paintWord(k);
  selectWord(k, span);
  fetchDict(k);
}
/* 단어를 누르는 규칙은 한 곳에만 둡니다. 처음 누르면 단어장에 넣고, 이미
   저장된 단어를 또 누르면 "아직 모른다"는 뜻이라 별을 하나 올립니다.
   예전에는 이 규칙이 글자 화면에만 있어서, 원본 화면에서는 같은 단어를
   몇 번을 눌러도 별이 ★에 머물렀습니다. */
function openWord(k, node){
  if(!words[k]){ addWord(k, node); return; }
  if(words[k].status < 3) setStatus(k, words[k].status + 1);
  selectWord(k, node);
}
function selectWord(k, span){
  selKey = k;
  readerWordNodes('.w.sel,.breeze-original-word.sel').forEach(s=>s.classList.remove('sel'));
  if(span) span.classList.add('sel');
  renderPanel();
  document.getElementById('panel').classList.add('on');
  document.getElementById('sheetbg').classList.add('on');
  pinReaderChrome(true);      // 뜻을 보는 동안 상단바는 그대로 (scripts/reader/reader.js)
}
function closePanel(){
  selKey=null;
  /* 창을 닫았으면 그 답은 아무도 안 봅니다. 그런데 하루 한도는 이미 나갔습니다 —
     훑어 읽을 때 이 손실이 제일 큽니다. 그래서 여기서 끊습니다. */
  abortLook();
  document.getElementById('panel').classList.remove('on');
  document.getElementById('sheetbg').classList.remove('on');
  pinReaderChrome(false);
  readerWordNodes('.w.sel,.breeze-original-word.sel').forEach(s=>s.classList.remove('sel'));
}
/* 원본의 PDF 표시는 지우고 다시 만듭니다. 그래서 칠하기가 먼저면 방금 칠한
   덩어리가 사라집니다 — 예전에는 뒤에 한 번 더 칠해서 덮었는데, 그러면 한
   프레임 동안 옛 색이 보입니다. 다시 만든 다음에 칠하면 한 번이면 됩니다. */
function paintWord(k){
  const w = words[k];
  refreshOriginalSavedWords();
  readerWordNodes(`.w[data-w="${CSS.escape(k)}"],.breeze-original-word[data-w="${CSS.escape(k)}"]`)
    .forEach(s=>{
      s.classList.remove('s1','s2','s3');
      if(w) s.classList.add('s'+w.status);
    });
}
function setStatus(k, st){
  const resolved=words[k] ? k : keyOf(k);
  if(!words[resolved]) return;
  selKey=resolved;
  words[resolved].status = st; words[resolved].up = Date.now();
  saveWords(); paintWord(resolved); queueSync();
  renderPanel();
}
/* 화면에 뜰 뜻 후보들. AI 가 고른 뜻이 맨 앞, 그 다음이 AI 가 준 다른 뜻,
   마지막이 무료 사전이 준 것들. 같은 낱말이 두 번 뜨지 않게 걸러 냅니다. */
function meaningChips(w){
  const ai = w.ai || {};
  const out = [], seen = new Set();
  const push = (term, pos, fromAi) => {
    const t = String(term||'').trim();
    if(!t || seen.has(t)) return;
    seen.add(t); out.push({ term:t, pos:pos||'', ai:!!fromAi });
  };
  push(ai.ko, ai.pos, true);
  for(const a of (w.alts||[])) push(a, ai.pos, true);
  for(const d of (w.kodict||[])) for(const t of (d.terms||[])) push(t, d.pos, false);
  /* 사람이 직접 써 넣은 뜻은 어느 사전에도 없으니 따로 넣어 줍니다 —
     안 그러면 자기가 고른 뜻만 칩에서 빠져 보입니다. */
  if(w.ko) push(w.ko, ai.pos, false);
  return out.slice(0, 8);
}
function renderPanel(){
  const w = words[selKey]; if(!w) return;
  const k = selKey;
  document.getElementById('p-word').textContent = w.word;
  document.getElementById('p-phon').textContent = w.phon || '';
  document.getElementById('p-clicked').textContent =
    (w.clicked && w.clicked.toLowerCase()!==w.word.toLowerCase()) ? `클릭한 형태: ${w.clicked}` : '';
  document.getElementById('p-ex').textContent = w.example || '—';
  document.getElementById('p-naver').href = 'https://en.dict.naver.com/#/search?query='+encodeURIComponent(w.word);
  document.querySelectorAll('.stbtn').forEach(b=>b.classList.toggle('on', +b.dataset.s===w.status));

  /* ── 뜻이 사는 칸. 하나뿐입니다 ──
     예전에는 이 박스가 "AI 가 알려준 것"이고 아래 파란 칸이 "내 단어장에 적히는 것"이라
     같은 뜻이 화면에 두 번 있었습니다. 고치는 건 아래 칸에서만 됐고요. 이제 여기 뜬 뜻을
     그 자리에서 누르면 고쳐지고, 그게 그대로 단어장에 들어갑니다. */
  const aiBox = document.getElementById('p-ai');
  const aiKo = document.getElementById('p-ai-ko'), aiPos = document.getElementById('p-ai-pos');
  const aiN = document.getElementById('p-ai-note'), aiTip = document.getElementById('p-ai-tip');
  const aiG = document.getElementById('p-ai-gloss');
  const aiCap = document.getElementById('p-ai-cap-t'), aiRetry = document.getElementById('p-airetry');
  const ai = w.ai || {};
  const asking = !!w.aiLoading && !w.aiSlow;
  const shown = w.ko || ai.ko || '';
  if(asking){
    aiBox.className = 'on load';
    aiCap.textContent = w.aiRetrying ? '다른 뜻을 찾는 중' : '문맥 뜻 · AI';
  }else if(shown){
    aiBox.className = 'on' + (w.koEdited ? ' edited' : '');
    /* noteDone 은 예전 모양입니다. 이미 저장된 단어를 다시 눌렀을 때
       AI 가 답했던 사실이 사라져 보이지 않게 함께 봅니다. */
    aiCap.textContent = w.koEdited ? '내가 고친 뜻'
      : ai.cached ? '전에 찾아본 뜻'
      : ((ai.done || ai.noteDone) ? '문맥 뜻 · AI' : '뜻');
    /* 편집 중에 renderPanel 이 돌아도 커서가 앞으로 튀지 않게, 달라졌을 때만 씁니다. */
    if(aiKo.textContent !== shown) aiKo.textContent = shown;
    aiPos.textContent = ai.pos || '';
    /* 윗줄에는 이 문장 이야기를 씁니다. 그게 없으면 뜻의 성질(gloss)이 올라와
       윗줄 자리를 지킵니다 — 예전에 프롬프트가 "뻔하면 빈 문자열"을 허락해서
       설명 줄이 통째로 사라져 있었습니다. 뜻만 덩그러니 있으면 사전이 아닙니다. */
    const top = ai.note || ai.gloss || (w.aiSlow ? '조금 오래 걸렸어요. 아래에서 다시 시도할 수 있어요.' : '');
    const under = (ai.note && ai.gloss && ai.gloss !== ai.note) ? ai.gloss : '';
    aiN.textContent = top;
    aiN.style.display = top ? 'block' : 'none';
    aiG.textContent = under;
    aiG.style.display = under ? 'block' : 'none';
    aiTip.textContent = w.koEdited ? '직접 고친 뜻이에요' : '뜻을 눌러 직접 고칠 수 있어요';
    aiRetry.style.display = (sb && sbUser && w.example) ? 'inline' : 'none';
  }else{
    aiBox.className = '';
  }

  /* 단추는 AI 가 답하지 못한 이유가 있을 때만 나옵니다. 평소에는 클릭한 순간
     이미 다녀왔으므로 누를 것이 없고, 뜻이 안 맞을 때는 박스 안의 링크가 받습니다. */
  const aiBtn = document.getElementById('p-aibtn'), aiHint = document.getElementById('p-aihint');
  const off = asking ? '' : (w.aiOff || '');
  aiBtn.style.display = (off && off !== 'quota') ? 'flex' : 'none';
  document.getElementById('p-aibtn-t').textContent =
      (off === 'trial' || off === 'login') ? '로그인하고 계속 쓰기'
    : (off === 'error' || w.aiSlow)        ? '다시 시도'
    :                                        'Let AI handle this';
  /* 맛보기가 몇 번 안 남았으면 미리 말해 둡니다. 다음 낱말에서 갑자기 막히는 것보다
     낫습니다. 아직 넉넉할 때는 아무 말도 하지 않습니다 — 읽는 중이니까요. */
  const trialWarn = (!sbUser && !off && anonLooksLeft !== null && anonLooksLeft <= 3)
    ? (anonLooksLeft > 0
        ? `무료 체험 ${anonLooksLeft}번 남았어요 · 로그인하면 계속 쓸 수 있어요`
        : '무료 체험을 다 썼어요')
    : '';
  aiHint.style.display = (off || trialWarn) ? 'block' : 'none';
  aiHint.textContent =
      off === 'trial'   ? '무료 체험을 다 썼어요. 로그인하면 이어서 쓸 수 있어요'
    : off === 'login'   ? '로그인하면 이 문장에 맞는 뜻을 찾아줘요'
    : off === 'quota'   ? '오늘 AI 사전을 다 썼어요. 자정에 다시 채워집니다'
    : off === 'offline' ? '오프라인이라 무료 사전만 보여주고 있어요'
    : off === 'error'   ? '잠깐 문제가 있었어요. 다시 눌러 보세요'
    : trialWarn         ? trialWarn
    :                     '뜻이 문맥과 안 맞을 때 눌러보세요';

  /* 문장 통째로 가는 문. 예문이 없으면 물어볼 것이 없습니다. */
  document.getElementById('p-explain').style.display = w.example ? 'flex' : 'none';

  const kod = document.getElementById('p-kodict');
  kod.innerHTML='';
  const chips = meaningChips(w);
  if(!chips.length){
    kod.innerHTML = w.loading
      ? '<span style="color:var(--soft2);font-size:13px">불러오는 중…</span>'
      : '<span style="color:var(--soft2);font-size:13px">다른 뜻 후보가 없어요</span>';
  }else{
    for(const c of chips){
      const b = document.createElement('button');
      b.className = 'kochip' + (w.ko===c.term ? ' on':'');
      b.innerHTML = (c.pos ? `<span class="pos">${esc(c.pos)}</span>` : '') + esc(c.term);
      b.onclick = ()=>{
        w.ko = c.term;
        /* AI 가 고른 뜻으로 되돌아온 것은 "고쳤다"가 아닙니다. */
        if(c.term === (w.ai && w.ai.ko)) delete w.koEdited; else w.koEdited = true;
        w.up = Date.now(); saveWords(); queueSync(); renderPanel();
        logDict('pick', k);
      };
      kod.appendChild(b);
    }
  }

  const col = document.getElementById('p-colloc'), colSec = document.getElementById('p-colloc-sec');
  if(w.colloc && w.colloc.length){
    col.className = 'on'; colSec.className = 'p-sec on';
    col.innerHTML = w.colloc.map(c=>'<span class="colloc">'+esc(c)+'</span>').join('');
  }else{
    col.className = ''; colSec.className = 'p-sec'; col.innerHTML = '';
  }
  const defs = document.getElementById('p-defs');
  if(w.loading) defs.innerHTML = '<span style="color:var(--soft2)">불러오는 중…</span>';
  else if(!w.defs || !w.defs.length) defs.innerHTML = '<span style="color:var(--soft2)">영어 뜻을 찾지 못했어요</span>';
  else defs.innerHTML = w.defs.map(d=>`<div><span class="pos">${esc(d.pos)}</span>${esc(d.def)}</div>`).join('');
}
document.querySelectorAll('.stbtn').forEach(b=>b.onclick=()=>{
  setStatus(selKey, +b.dataset.s);
  logDict('star', selKey, { meta:{ status:+b.dataset.s } });
});
document.getElementById('p-know').onclick = ()=>{
  if(!selKey) return;
  const k = selKey;
  logDict('known', k);
  delete words[k]; dead[k] = Date.now(); save(LS_DEAD, dead);
  saveWords(); paintWord(k); closePanel(); queueSync(); toast('단어장에서 뺐어요');
};
/* 뜻을 고치는 곳이 뜻이 뜨는 곳입니다. 사람이 손으로 쓴 뜻은 그 뒤로 AI 가 덮지 않습니다 —
   "다른 뜻으로 다시" 를 눌렀을 때만 덮습니다. 그때는 새 뜻을 달라는 뜻이니까요. */
const aiKoBox = document.getElementById('p-ai-ko');
aiKoBox.addEventListener('blur', ()=>{
  if(!selKey || !words[selKey]) return;
  const w = words[selKey];
  const next = aiKoBox.textContent.replace(/\s+/g,' ').trim();
  if(next === (w.ko||'')) return;
  w.ko = next;
  w.koEdited = next !== ((w.ai && w.ai.ko) || '');
  w.up = Date.now(); saveWords(); queueSync(); renderPanel();
  if(w.koEdited) logDict('edit', selKey);
});
/* contenteditable 에서 엔터는 줄바꿈입니다. 뜻은 한 줄이므로 저장하고 나갑니다. */
aiKoBox.addEventListener('keydown', e=>{
  if(e.key === 'Enter'){ e.preventDefault(); aiKoBox.blur(); }
  if(e.key === 'Escape'){ e.preventDefault(); renderPanel(); aiKoBox.blur(); }
});

/* ---- dictionary lookups ---- */
async function fetchKo(w, form){
  const r = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&dt=bd&q='+encodeURIComponent(form));
  const j = await r.json();
  const ko = (j[0]||[]).map(x=>x&&x[0]).filter(Boolean).join('').trim();
  const dict = (j[1]||[]).map(e=>({pos:e[0]||'', terms:(e[1]||[]).slice(0,5)}));
  if(ko && ko.toLowerCase()!==form.toLowerCase()){ w.ko = w.ko || ko; }
  if(dict.length){ w.kodict = dict; if(!w.ko && dict[0].terms[0]) w.ko = dict[0].terms[0]; return true; }
  return !!w.ko;
}
/* metaOnly = 발음만 받아 오고 영어 뜻은 건드리지 않습니다. */
async function fetchEn(w, form, metaOnly){
  const r = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(form));
  if(!r.ok) return false;
  const j = await r.json();
  if(!j || !j[0]) return false;
  w.phon = j[0].phonetic || ((j[0].phonetics||[]).find(p=>p.text)||{}).text || '';
  w.audio = ((j[0].phonetics||[]).find(p=>p.audio) || {}).audio || '';   // 원어민 녹음
  if(metaOnly) return true;
  w.defs = [];
  for(const m of j[0].meanings||[]){
    for(const d of m.definitions.slice(0,2)){
      w.defs.push({pos:m.partOfSpeech, def:d.definition});
      if(w.defs.length>=5) break;
    }
    if(w.defs.length>=5) break;
  }
  return w.defs.length>0;
}
async function fetchEnWik(w, form){
  const r = await fetch('https://en.wiktionary.org/api/rest_v1/page/definition/'+encodeURIComponent(form)+'?redirect=true');
  if(!r.ok) return false;
  const j = await r.json();
  const entries = j.en || j[Object.keys(j)[0]];
  if(!entries) return false;
  w.defs = [];
  for(const e of entries){
    for(const d of (e.definitions||[]).slice(0,2)){
      const txt = (d.definition||'').replace(/<[^>]*>/g,'').trim();
      if(txt) w.defs.push({pos:e.partOfSpeech||'', def:txt});
      if(w.defs.length>=5) break;
    }
    if(w.defs.length>=5) break;
  }
  return w.defs.length>0;
}
/* ---- AI 사전: Edge Function 경유 (키는 서버에만) ----

   층이 하나입니다. 뜻은 AI 가 문장을 보고 답하고, 그 답은 이 기기에만 남습니다.
   서버에 낱말 항목을 쌓아 두고 재사용하던 공용 사전은 접었습니다 — 화면의 두 줄 중
   "이 뜻이 대체로 어떤 뜻인가" 쪽만 캐시하면서, 정작 Breeze 가 잘하는 "이 문장에서
   어떻게 쓰였나" 는 하나도 재사용하지 못했고, 대신 문맥에 안 맞는 뜻을 확신 있게
   내놓을 새 경로를 하나 만들었기 때문입니다.

   캐시 열쇠에 문장이 들어갑니다. 예전에는 낱말 이름만으로 캐시해서,
   "The heat continues." 에서 받은 설명이 "He continues to argue." 에서도 떴습니다.

     l:<낱말>|<문장 해시>   이 문장에서의 뜻 · 설명 · 다른 뜻 후보

   무료 사전은 이제 경쟁하는 답이 아닙니다. 발음과 영어 뜻을 채우고,
   로그인 전·한도 초과·오프라인·서버 장애일 때 뜻자리를 대신 지킵니다. */
const AI_TIMEOUT  = 9000;   // 이보다 오래 걸리면 기다림을 끊고 "다시 시도"를 내밉니다
const AI_MIN_WAIT = 280;    // 갓 받은 답은 이만큼은 바람을 보여 준 뒤에 놓습니다

function sentenceHash(text){
  const s = String(text||'').trim().toLowerCase();
  let h = 2166136261;
  for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h>>>0).toString(36);
}
/* 원형 후보를 모두 열쇠로 봅니다. "continues"를 눌렀는데 이미 "continue"를
   같은 문장에서 물어봤다면 그것으로 끝나야 합니다. */
function entryKeys(w){
  const raw = w.clicked || w.word || '';
  return [...new Set([w.word, ...lemmaCands(raw)].filter(Boolean).map(s=>String(s).toLowerCase()))];
}
const lookKey = (word, sentence) =>
  'l:' + String(word||'').toLowerCase() + '|' + sentenceHash(sentence);

/* ---- 로그인 전 맛보기 ----
   Breeze 가 남과 다른 점은 "이 문장에서는 이런 뜻" 하나입니다. 그게 로그인 뒤에만
   보이면 처음 온 사람이 보는 것은 구글 번역 결과이고, 그 상태로 "로그인하면
   좋아져요"라고 말해 봐야 믿을 이유가 없습니다. 먼저 보여 주고 나서 물어봅니다.

   이 표시는 "몇 번 남았나"를 세기 위한 것뿐입니다. 서버의 기록 표에는 들어가지
   않습니다 — 로그인 전 사람을 이어 붙일 수 있게 되는 순간 다른 종류의 기록이 됩니다. */
function deviceId(){
  let id = load('breeze.device', '');
  if(!id){
    id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
       : 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2,12);
    save('breeze.device', id);
  }
  return id;
}
/* 서버가 답할 때마다 알려 주는 남은 횟수. 모르면 null. */
let anonLooksLeft = null;

/* ---- 앱과 함께 오는 사전 씨앗 ----
   맛보기 글에 나오는 낱말은 답을 미리 받아 앱에 실어 둡니다. 열쇠는 AI 에게
   물어봤을 때 저장하는 것과 완전히 같은 `l:<낱말>|<문장해시>` 라서, 앞으로
   오는 모든 조회가 이걸 그냥 캐시로 씁니다 — 사전 코드에는 씨앗을 아는
   갈래가 하나도 없습니다.

   덕분에 첫 사용자는 로그인 전에도, 인터넷이 없어도, 어느 낱말을 눌러도
   기다리지 않습니다. 바람은 그대로 붑니다(AI_MIN_WAIT 는 갓 받은 답에만
   걸리지만, 캐시된 답도 창이 열리며 한 번 지나갑니다).

   한 번 부으면 끝입니다. 판(version)이 오르면 다시 붓습니다.

   ── 지금은 그 파일이 없습니다 ──
   씨앗을 **만드는** 일은 접어 두었습니다(`modules/dict-seed/README.md`). 받는 쪽인
   이 함수는 일부러 살려 둡니다 — 되살리는 일이 파일 한 장 떨어뜨리기가 되게 하려고요.
   파일이 없으면 조용히 지나가고, 맛보기 글의 낱말도 다른 글과 똑같이 AI 에게
   물어봅니다. */
const DICT_SEED_FILE = 'assets/samples/dict-seed.json';
const LS_DICT_SEED = 'breeze.dict-seed';

async function loadDictSeed(){
  try{
    const response = await fetch(DICT_SEED_FILE);
    if(!response.ok) return;
    const seed = await response.json();
    if(!seed || !seed.entries) return;
    if(load(LS_DICT_SEED, 0) >= (seed.version || 1)) return;
    const keys = Object.keys(seed.entries);
    /* 이미 있는 답은 덮지 않습니다. 사용자가 그 문장에서 직접 받은 답이
       씨앗보다 새것이고, 다시 물어본 답이라면 더더욱 그렇습니다. */
    const mine = await dictExistingKeys(keys);
    const pairs = keys.filter(key => !mine.has(key))
      .map(key => [key, Object.assign({}, seed.entries[key], { done:true, seed:true })]);
    await dictPutAll(pairs);
    save(LS_DICT_SEED, seed.version || 1);
    if(pairs.length) console.info(`사전 씨앗 ${pairs.length}개 준비됨`);
  }catch(error){
    /* 씨앗이 없어도 앱은 그냥 AI 에게 물어봅니다. 조용히 지나갑니다. */
    console.warn('사전 씨앗을 읽지 못했습니다:', error && error.message);
  }
}

async function dictCall(payload, signal){
  if(!sb || navigator.onLine === false) return null;
  let token = SB_KEY;
  try{ const { data:{ session } } = await sb.auth.getSession(); if(session) token = session.access_token; }catch(e){}
  const opt = {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+token, 'apikey': SB_KEY },
    body: JSON.stringify(payload)
  };
  if(signal) opt.signal = signal;
  try{
    const r = await fetch(SB_URL.replace(/\/$/,'') + '/functions/v1/dict', opt);
    const j = await r.json().catch(()=>null);
    if(!r.ok || !j) console.warn('dict', r.status, j && j.error);
    /* 오류도 답입니다. 한도 초과와 서버 장애는 화면에서 다르게 말해야 하므로
       null 로 뭉개지 않고 그대로 올려 보냅니다. */
    return j || null;
  }catch(e){ console.warn('dict failed', e); return null; }
}

/* 읽기 시작할 때 함수만 깨워 둡니다. AI 도 한도도 쓰지 않습니다. */
let warmedAt = 0;
function warmDict(){
  if(!sb || navigator.onLine === false) return;
  if(Date.now() - warmedAt < 120000) return;   // Edge Function 이 식기 전에 다시 부를 이유가 없습니다
  warmedAt = Date.now();
  dictCall({ op:'warm' });
}

/* 사람이 사전으로 무엇을 했는지. 낱말과 뜻 자체는 어디에도 있지만 이 기록은 없습니다.
   문장 본문은 보내되 서버는 지문만 남깁니다 — 자세한 규칙은 DICT.md. */
function logDict(action, k, extra){
  const w = words[k]; if(!w || !sb || !sbUser) return;
  const withSentence = (action === 'edit' || action === 'pick');
  dictCall(Object.assign({
    op:'log', action,
    word: w.word || k, clicked: w.clicked || '', lemma: w.aiLemma || '',
    ai_ko: (w.ai && w.ai.ko) || '', user_ko: w.ko || '',
    sentence: withSentence ? (w.example || '') : '',
    book: w.book || ''
  }, extra || {}));
}

/* 진행 중인 조회 하나만 살려 둡니다. 낱말을 연달아 누르거나 창을 닫으면
   앞의 것은 아무도 안 볼 답이므로 끊습니다 — 하루 한도가 거기서 새 나갑니다. */
let lookCtrl = null;
function abortLook(){
  if(lookCtrl){ try{ lookCtrl.abort(); }catch(e){} lookCtrl = null; }
}

/* 답이 어디서 오느냐에 따라 기다림이 다릅니다. 둘은 사람에게 다른 사건입니다.

   ① 씨앗 — 이 사람은 이 낱말을 물어본 적이 없습니다. 앱이 미리 받아 뒀을
      뿐이고, 화면에서 벌어지는 일은 "지금 물어봤다" 입니다. 0초에 튀어나오면
      무슨 일이 일어났는지 못 알아채고, 맛보기 글에서만 사전이 이상하게
      빨라 보이는 것은 자랑이 아니라 다른 앱처럼 보이는 일입니다. 기다립니다.
   ② 내가 전에 물어본 것 — 기다림은 거짓말이 됩니다. 이미 아는 답인데 기다린
      척할 이유가 없고, 오히려 "아까 봤다" 는 사실이 곧바로 와야 합니다.
      그래서 곧장 내놓고, 창의 머리글도 다르게 답니다. */
async function loadCachedLook(k, began){
  const w = words[k]; if(!w) return false;
  for(const key of entryKeys(w)){
    const hit = await dictGet(lookKey(key, w.example));
    if(hit && hit.ko){
      if(hit.seed){
        const left = AI_MIN_WAIT - (Date.now() - (began || Date.now()));
        if(left > 0) await new Promise(res => setTimeout(res, left));
      }
      applyLook(w, hit, k, { cached:!hit.seed });
      return true;
    }
  }
  return false;
}

/* 낱말 하나 · 문장 하나 · 왕복 한 번. 뜻과 이 문장에서의 설명과 다른 뜻 후보가
   같이 옵니다. 예전에는 entry(700토큰) → pick → explain 로 세 번 다녀왔습니다. */
async function fetchLook(k, opt){
  const w = words[k]; if(!w) return false;
  opt = opt || {};
  if(navigator.onLine === false){ w.aiOff = 'offline'; if(selKey===k) renderPanel(); return false; }
  /* 서버 주소조차 없으면(config 미설정) 할 수 있는 일이 없습니다. 로그인 여부는
     더 이상 여기서 막지 않습니다 — 맛보기 횟수는 서버가 셉니다. */
  if(!sb){ w.aiOff = 'login'; if(selKey===k) renderPanel(); return false; }

  const began = Date.now();
  abortLook();
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  lookCtrl = ctrl;
  w.aiLoading = true; w.aiRetrying = !!opt.retry;
  delete w.aiSlow; delete w.aiOff;
  if(selKey===k) renderPanel();
  /* 9초가 넘으면 무작정 기다리게 두지 않습니다. 기다림 자체보다
     "언제 끝날지 모른다"가 더 답답하기 때문입니다. */
  const slow = setTimeout(function(){
    if(!words[k]) return;
    words[k].aiSlow = true; words[k].aiOff = 'error';
    if(ctrl) try{ ctrl.abort(); }catch(e){}
    if(selKey===k) renderPanel();
  }, AI_TIMEOUT);
  try{
    const j = await dictCall({
      op:'look',
      word: w.word || k, clicked: w.clicked || '', cands: entryKeys(w),
      sentence: w.example || '', book: w.book || '',
      retry: !!opt.retry, avoid: opt.retry ? (w.asked || []) : [],
      /* 로그인 전에만 보냅니다. 로그인한 뒤에는 계정이 곧 신원이라 필요 없습니다. */
      device: sbUser ? '' : deviceId()
    }, ctrl ? ctrl.signal : null);
    if(!j || j.error || !j.ko){
      const e = j && j.error;
      w.aiOff = e === 'quota_exceeded' ? 'quota'
              : e === 'anon_exhausted' ? 'trial'
              : e === 'login_required' ? 'login' : 'error';
      if(w.aiOff === 'quota') toast('오늘 AI 사전 한도를 다 썼어요. 무료 사전으로 보여줄게요');
      if(w.aiOff === 'trial'){ anonLooksLeft = 0; toast('무료 체험을 다 썼어요. 로그인하면 계속 쓸 수 있어요'); }
      return false;
    }
    if(typeof j.left === 'number') anonLooksLeft = j.left;
    await dictPut(lookKey(j.lemma || w.word || k, w.example), Object.assign({}, j, { done:true }));
    /* 갓 받은 답은 최소 0.28초는 바람을 보여 준 뒤에 놓습니다. 답이 너무 빨리 오면
       화면이 튄 것처럼 느껴져서, 무슨 일이 일어났는지 못 알아챕니다.
       기기에 이미 있던 답은 그냥 띄웁니다 — 기다린 척할 이유가 없습니다. */
    const left = AI_MIN_WAIT - (Date.now() - began);
    if(left > 0) await new Promise(res=>setTimeout(res, left));
    applyLook(w, j, k, opt);
    return true;
  }finally{
    clearTimeout(slow);
    if(lookCtrl === ctrl) lookCtrl = null;
    delete w.aiLoading; delete w.aiRetrying;
    if(selKey===k) renderPanel();
  }
}

function applyLook(w, j, k, opt){
  opt = opt || {};
  delete w.aiLoading; delete w.aiOff;
  w.ai = { ko: j.ko || '', pos: j.pos || '', gloss: j.gloss || '', note: j.note || '', done:true,
           /* 이 기기가 전에 물어봤던 답인지. 머리글 한 줄이 달라집니다 —
              한도를 쓰지 않았다는 것을 그 자리에서 알 수 있게. */
           cached: !!opt.cached };
  w.aiLemma = j.lemma || w.aiLemma || '';
  w.alts = (j.alts || []).filter(Boolean).slice(0,3);
  if((j.colloc || []).length) w.colloc = j.colloc.slice(0,3);
  /* 사람이 손으로 고친 뜻은 덮지 않습니다. "다른 뜻으로 다시" 를 눌렀을 때만 덮습니다 —
     그때는 새 뜻을 달라는 뜻이니까요. */
  if(opt.retry || !w.koEdited) w.ko = j.ko || w.ko;
  if(opt.retry) delete w.koEdited;
  if(j.lemma && !isAcro(w.word) && /^[A-Za-z][A-Za-z'’-]*$/.test(j.lemma)) w.word = j.lemma.toLowerCase();
  /* 이미 보여 준 뜻은 "다시 물어보기" 때 제외 목록으로 보냅니다.
     그래야 같은 답을 두 번 받고 한도만 쓰는 일이 없습니다. */
  if(j.ko) w.asked = [...new Set([...(w.asked||[]), j.ko])].slice(-4);
  w.up = Date.now();
  saveWords(); queueSync();
  if(selKey===k) renderPanel();
}

/* "이 뜻이 아닌 것 같다" — 이미 보여 준 뜻을 빼고 다시 묻습니다. AI 가 틀렸다는
   가장 강한 신호라서 서버에도 retry 로 기록됩니다. */
async function askOtherSense(k){
  const w = words[k]; if(!w) return;
  await fetchLook(k, { retry:true });
}
function askAI(){
  const k = selKey; if(!k || !words[k]) return;
  const off = words[k].aiOff;
  /* 맛보기를 다 썼거나 서버가 로그인을 요구하면, 다시 부르는 것은 같은 답을
     한 번 더 받는 일입니다. 할 수 있는 일이 있는 곳으로 보냅니다. */
  if(off === 'trial' || off === 'login'){ openSyncModal(); return; }
  fetchLook(k, {});
}
document.getElementById('p-aibtn').onclick   = ()=>askAI();
document.getElementById('p-airetry').onclick = ()=>{ if(selKey && words[selKey]) askOtherSense(selKey); };

/* 무료 사전. 발음과 영어 뜻은 여기서만 오고, AI 가 답하지 못했을 때는 뜻자리도 지킵니다.
   fetchKo 는 w.ko 가 비어 있을 때만 채우므로 AI 답을 밀어내지 않습니다. */
async function fillFromFreeDicts(k){
  const w = words[k]; if(!w) return;
  const forms = w.forms && w.forms.length ? w.forms : [k];
  let validated = null;
  for(const f of forms){ try{ if(await fetchEn(w,f,false)){ validated=f; break; } }catch(e){} }
  if(!validated){ for(const f of forms){ try{ if(await fetchEnWik(w,f)){ validated=f; break; } }catch(e){} } }
  /* AI 가 표제어를 정했으면 그것을 씁니다. 무료 사전은 "뜻이 실려 있는 형태"를 찾아 준
     것일 뿐이라, 둘이 다를 때 무료 사전을 따르면 AI 가 답한 낱말과 화면의 낱말이 어긋납니다. */
  if(!w.aiLemma && validated && !isAcro(w.word) && validated!==w.word) w.word = validated;
  if(selKey===k) renderPanel();
  const koForms = validated ? [validated, ...forms.filter(f=>f!==validated)] : forms;
  for(const f of koForms){ try{ if(await fetchKo(w,f)) break; }catch(e){} }
  if(selKey===k) renderPanel();
}

async function fetchDict(k){
  const w = words[k]; if(!w) return;
  const began = Date.now();
  /* 창이 열리는 순간부터 바람이 붑니다. 답이 어디서 오든 — 씨앗이든, 예전에
     물어본 것이든, 지금 AI 에게 묻든 — 사용자가 보는 것은 같은 한 번의 바람입니다. */
  w.loading = true; w.aiLoading = true;
  if(selKey===k) renderPanel();

  /* 무료 사전은 AI 와 서로 기다릴 이유가 없으므로 같이 출발합니다. 발음과 영어 뜻이
     먼저 도착해서, AI 를 기다리는 동안에도 패널이 채워집니다. */
  const free = fillFromFreeDicts(k);

  /* ① 이 기기에 이 문장으로 물어본 적 있나 — 0원, 기다림 없음 */
  const cached = await loadCachedLook(k, began);
  /* ② 없으면 AI. 뜻의 유일한 출처입니다.
     fetchLook 은 오프라인·설정없음일 때 aiLoading 을 건드리지 않고 빠져나가므로,
     넘기기 전에 여기서 내려놓습니다 — 안 그러면 바람이 영영 붑니다. */
  if(!cached){ delete w.aiLoading; await fetchLook(k, {}); }

  await free;
  delete w.loading;
  w.up = Date.now();
  saveWords(); queueSync();
  if(selKey===k) renderPanel();
}

/* ================= vocab ================= */
function renderVocab(){
  const list = Object.entries(words).sort((a,b)=>b[1].addedAt-a[1].addedAt);
  const q = document.getElementById('vsearch').value.trim().toLowerCase();
  const rows = list.filter(([k,w]) => !q || w.word.toLowerCase().includes(q)
    || (w.ko||'').includes(q) || (w.book||'').toLowerCase().includes(q));
  document.getElementById('vcnt').textContent = `${list.length}개 저장됨`;
  const wrap = document.getElementById('vtablewrap');
  if(!rows.length){ wrap.innerHTML = '<div id="vempty">아직 저장된 단어가 없어요.<br>책을 읽다가 모르는 단어를 눌러 보세요!</div>'; return; }
  const stName = {1:'★',2:'★★',3:'★★★'};
  wrap.innerHTML = `<table><thead><tr>
    <th>단어</th><th>뜻</th><th>예문 · 출처</th><th>모르는 정도</th><th>저장일</th><th></th>
  </tr></thead><tbody>` + rows.map(([k,w])=>`
    <tr data-k="${esc(k)}">
      <td class="c-word">${esc(w.word)}</td>
      <td class="c-mean" contenteditable="true" spellcheck="false">${esc(w.ko||'')}</td>
      <td class="c-ex">${esc(w.example||'')}${w.book?`<span class="src">📖 ${esc(w.book)}</span>`:''}</td>
      <td><span class="chip s${w.status}" title="클릭해서 변경">${stName[w.status]}</span></td>
      <td style="color:var(--soft2);font-size:12px;white-space:nowrap">${new Date(w.addedAt).toLocaleDateString('ko-KR')}</td>
      <td><button class="rowdel" title="삭제">✕</button></td>
    </tr>`).join('') + '</tbody></table>';
  wrap.querySelectorAll('tr[data-k]').forEach(tr=>{
    const k = tr.dataset.k;
    tr.querySelector('.chip').onclick = ()=>{ setStatus(k, words[k].status%3+1); renderVocab(); };
    tr.querySelector('.rowdel').onclick = ()=>{ delete words[k]; dead[k]=Date.now(); save(LS_DEAD,dead); saveWords(); queueSync(); renderVocab(); };
    tr.querySelector('.c-mean').addEventListener('blur', e=>{
      if(words[k]){ words[k].ko = e.target.textContent.trim(); words[k].up = Date.now(); saveWords(); queueSync(); }
    });
  });
}
document.getElementById('vsearch').addEventListener('input', renderVocab);
/* 내보내기는 CSV 입니다. 엑셀·넘버스·구글 시트가 전부 그냥 엽니다.
   예전에는 이 버튼 하나 때문에 xlsx 라이브러리 881KB를 모든 사용자가 매번
   받았습니다 — 앱 전체 코드의 세 배가 넘는 짐이었습니다. */
function csvCell(value){
  const text = String(value == null ? '' : value);
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g,'""') + '"' : text;
}
document.getElementById('btn-export').onclick = ()=>{
  const list = Object.values(words).sort((a,b)=>b.addedAt-a.addedAt);
  if(!list.length){ toast('내보낼 단어가 없어요'); return; }
  const stName = {1:'★',2:'★★',3:'★★★'};
  const rows = [['단어','뜻','영어 뜻','예문','모르는 정도','책','저장일'],
    ...list.map(w=>[w.word, w.ko||'', (w.defs||[]).map(d=>`(${d.pos}) ${d.def}`).join(' / '),
      w.example||'', stName[w.status], w.book||'', new Date(w.addedAt).toLocaleDateString('ko-KR')])];
  /* 엑셀은 BOM 이 없으면 CSV 를 라틴1로 읽어 한글을 깹니다. */
  const csv = '﻿' + rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url; link.download = 'breeze_vocab.csv'; link.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
};
