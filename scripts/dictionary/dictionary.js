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

/* ================= 내장 사전 =================
   dict300.js가 함께 있으면 표제어 300개는 인터넷 없이 즉시 뜹니다.
   그 파일이 없어도 앱은 그대로 돌아갑니다(예전처럼 인터넷 사전만 씁니다). */
const BD = (window.BREEZE_DICT && window.BREEZE_DICT.w) ? window.BREEZE_DICT.w : null;
/* 연어를 비교할 때 무시할 말. 관사·대명사처럼 아무 문장에나 나오는 것만 뺍니다.
   out·up·off 같은 건 뜻을 가르는 열쇠라서 일부러 남겨 둡니다(run out ↔ run up). */
const BD_STOP = {};
'a an the of to in on at for from with by his her their its my your our this that these those be is are was were been and or as it he she they you we i some any very so than not no more one'
  .split(' ').forEach(function(t){ BD_STOP[t] = 1; });

function bdTokens(s){ return String(s||'').toLowerCase().match(/[a-z']+/g) || []; }
/* ships ↔ ship 처럼 어미만 다른 경우까지 같은 말로 봅니다.
   짧은 쪽이 4글자는 되어야 합니다 — 안 그러면 "a"가 "away"에 걸려 엉뚱한 뜻이 뽑힙니다. */
function bdSame(tok, list){
  for(let i=0;i<list.length;i++){
    const s = list[i];
    if(s === tok) return true;
    const shortW = s.length < tok.length ? s : tok;
    const longW  = s.length < tok.length ? tok : s;
    if(shortW.length >= 4 && longW.length - shortW.length <= 3 && longW.indexOf(shortW) === 0) return true;
  }
  return false;
}
/* 클릭한 단어의 여러 형태 중 사전에 있는 것을 찾습니다 */
function bdLookup(w){
  if(!BD) return null;
  const cands = (w.forms && w.forms.length) ? w.forms : lemmaCands(w.clicked || w.word || '');
  for(let i=0;i<cands.length;i++){ if(BD[cands[i]]) return { word:cands[i], entry:BD[cands[i]] }; }
  return null;
}
/* 뜻이 여러 개일 때, 문장에 함께 나온 말을 보고 고릅니다.
   예: "abandon the ship"의 ship이 문장에 있으면 '버리고 떠나다'를 위로 올립니다. */
function bdPickSense(entry, head, sentence){
  const senses = entry.s || [];
  if(senses.length < 2) return { sense: senses[0] || null, hit:'' };
  const sent = bdTokens(sentence);
  if(!sent.length) return { sense: senses[0], hit:'' };
  let best = senses[0], bestScore = 0, bestHit = '';
  for(let i=0;i<senses.length;i++){
    const cs = senses[i].c || [];
    for(let j=0;j<cs.length;j++){
      const keys = bdTokens(cs[j]).filter(function(t){
        return t.length >= 3 && !BD_STOP[t] && t.indexOf(head) !== 0 && head.indexOf(t) !== 0;
      });
      if(!keys.length) continue;
      let hit = 0;
      for(let n=0;n<keys.length;n++) if(bdSame(keys[n], sent)) hit++;
      const score = hit / keys.length;
      if(score > bestScore){ bestScore = score; best = senses[i]; bestHit = cs[j]; }
    }
  }
  return { sense: best, hit: bestScore > 0 ? bestHit : '' };
}
/* 찾았으면 단어에 붙여 줍니다. 네트워크를 기다리지 않으므로 즉시 뜹니다. */
function applyBuiltin(w){
  const found = bdLookup(w);
  if(!found) return false;
  const picked = bdPickSense(found.entry, found.word, w.example || '');
  if(!picked.sense) return false;
  const pos = found.entry.p || '';
  if(!isAcro(w.word)) w.word = found.word;
  w.dictSrc = 'builtin';
  if(!w.ko) w.ko = picked.sense.k;
  w.kodict = [{ pos: pos, terms: found.entry.s.map(function(x){ return x.k; }).slice(0,5) }];
  w.defs   = found.entry.s.map(function(x){ return { pos: pos, def: x.d }; }).slice(0,5);
  w.colloc = (picked.sense.c || []).slice(0,3);
  w.collocHit = picked.hit;
  return true;
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
}
function closePanel(){
  selKey=null;
  document.getElementById('panel').classList.remove('on');
  document.getElementById('sheetbg').classList.remove('on');
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
function renderPanel(){
  const w = words[selKey]; if(!w) return;
  document.getElementById('p-word').textContent = w.word;
  document.getElementById('p-phon').textContent = w.phon || '';
  document.getElementById('p-clicked').textContent =
    (w.clicked && w.clicked.toLowerCase()!==w.word.toLowerCase()) ? `클릭한 형태: ${w.clicked}` : '';
  document.getElementById('p-ko').textContent = w.ko || (w.loading?'…':'');
  document.getElementById('p-ex').textContent = w.example || '—';
  document.getElementById('p-naver').href = 'https://en.dict.naver.com/#/search?query='+encodeURIComponent(w.word);
  document.querySelectorAll('.stbtn').forEach(b=>b.classList.toggle('on', +b.dataset.s===w.status));
  const aiBox = document.getElementById('p-ai');
  const aiM = document.getElementById('p-ai-m'), aiN = document.getElementById('p-ai-note');
  const aiG = document.getElementById('p-ai-gloss');
  const ai = w.ai || {};
  const noting = !!w.aiLoading && !w.aiSlow;
  if(ai.ko){
    /* 뜻은 공용 사전에서 이미 왔습니다. 문장 설명을 기다리는 동안에도 그걸 지우지 않습니다 —
       예전에는 "찾고 있어요…"가 뜻을 밀어내서, 이미 알던 것까지 잠깐 사라졌습니다. */
    aiBox.className = 'on' + (noting ? ' noting' : '');
    aiM.innerHTML = esc(ai.ko) + (ai.pos?`<span class="pos">${esc(ai.pos)}</span>`:'');
    /* 윗줄은 이 문장 이야기, 아랫줄은 이 뜻 자체의 성질.
       문장 설명이 아직이면 뜻 설명이 그 자리를 대신 지킵니다 — 칸이 비지 않게. */
    aiN.textContent = ai.note
      || (noting ? '이 문장에서 어떻게 쓰였는지 보는 중…'
        : w.aiSlow ? '조금 오래 걸리네요. 아래에서 다시 시도할 수 있어요.'
        : (ai.gloss || ''));
    const under = (ai.note && ai.gloss && ai.gloss !== ai.note) ? ai.gloss : '';
    aiG.textContent = under;
    aiG.style.display = under ? 'block' : 'none';
  }else if(w.aiSlow){
    aiBox.className='on'; aiM.textContent='조금 오래 걸리네요';
    aiN.textContent='서버가 붐비는 것 같아요. 아래에서 다시 시도할 수 있어요.';
    aiG.style.display='none';
  }else if(noting){
    aiBox.className='on load'; aiM.textContent='문맥에 맞는 뜻을 찾고 있어요…';
    aiN.textContent=''; aiG.style.display='none';
  }else{
    aiBox.className=''; aiG.style.display='none';
  }
  /* 단추는 "이 문장에서의 설명"이 아직 없을 때만 보여 줍니다.
     뜻이 떴다고 숨기면, 정작 물어보고 싶을 때 물어볼 데가 없어집니다. */
  const aiBtn = document.getElementById('p-aibtn'), aiHint = document.getElementById('p-aihint');
  const hasNote = !!(ai.note || ai.noteDone);
  aiBtn.style.display = (hasNote || noting) ? 'none' : 'flex';
  aiHint.style.display = (hasNote || noting) ? 'none' : 'block';
  document.getElementById('p-aibtn-t').textContent = w.aiSlow ? '다시 시도' : 'Let AI handle this';
  aiHint.textContent = w.aiSlow ? '' : '뜻이 문맥과 안 맞을 때 눌러보세요';
  const kod = document.getElementById('p-kodict');
  kod.innerHTML='';
  if(w.loading) kod.innerHTML = '<span style="color:var(--soft2);font-size:13px">불러오는 중…</span>';
  else if(!w.kodict || !w.kodict.length) kod.innerHTML = '<span style="color:var(--soft2);font-size:13px">사전 항목 없음</span>';
  else {
    for(const d of w.kodict){
      for(const t of d.terms){
        const c = document.createElement('button');
        c.className = 'kochip' + (w.ko===t ? ' on':'');
        c.innerHTML = `<span class="pos">${esc(d.pos)}</span>${esc(t)}`;
        c.onclick = ()=>{ w.ko = t; w.up = Date.now(); saveWords(); queueSync(); renderPanel(); };
        kod.appendChild(c);
      }
    }
  }
  /* 내장 사전에서 온 뜻이면 출처를 밝히고, 함께 쓰는 말도 보여 줍니다.
     문장과 맞아떨어진 연어에는 표시를 해서 "왜 이 뜻인지"가 보이게 합니다. */
  const src = document.getElementById('p-src');
  src.className = (w.dictSrc === 'builtin' || w.dictSrc === 'shared') ? 'on' : '';
  src.textContent = w.dictSrc === 'shared' ? '공용 사전' : '기본 사전';
  const col = document.getElementById('p-colloc'), colSec = document.getElementById('p-colloc-sec');
  if(w.colloc && w.colloc.length){
    col.className = 'on'; colSec.className = 'p-sec on';
    col.innerHTML = w.colloc.map(function(c){
      return '<span class="colloc' + (c === w.collocHit ? ' hit' : '') + '">' + esc(c) + '</span>';
    }).join('');
  }else{
    col.className = ''; colSec.className = 'p-sec'; col.innerHTML = '';
  }
  const defs = document.getElementById('p-defs');
  if(w.loading) defs.innerHTML = '<span style="color:var(--soft2)">불러오는 중…</span>';
  else if(!w.defs || !w.defs.length) defs.innerHTML = '<span style="color:var(--soft2)">영어 뜻을 찾지 못했어요</span>';
  else defs.innerHTML = w.defs.map(d=>`<div><span class="pos">${esc(d.pos)}</span>${esc(d.def)}</div>`).join('');
}
document.querySelectorAll('.stbtn').forEach(b=>b.onclick=()=>setStatus(selKey, +b.dataset.s));
document.getElementById('p-know').onclick = ()=>{
  if(!selKey) return;
  const k = selKey;
  delete words[k]; dead[k] = Date.now(); save(LS_DEAD, dead);
  saveWords(); paintWord(k); closePanel(); queueSync(); toast('단어장에서 뺐어요');
};
document.getElementById('p-ko').addEventListener('blur', e=>{
  if(!selKey || !words[selKey]) return;
  words[selKey].ko = e.target.textContent.trim(); words[selKey].up = Date.now(); saveWords(); queueSync();
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
/* metaOnly = 내장 사전에서 이미 뜻을 얻은 경우. 발음만 받아 오고 뜻은 건드리지 않습니다. */
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
/* ---- 공용 사전: Edge Function 경유 (키는 서버에만) ----

   캐시가 세 층입니다. 예전에는 한 층뿐이었고, 그 열쇠에 문장이 없었습니다 —
   "The heat continues." 에서 한 번 물어보면 "He continues to argue." 에서도
   그때 받은 문맥 설명이 그대로 떴습니다. 문맥 사전이 문맥을 무시한 셈입니다.

     w:<낱말>             뜻 목록과 뜻마다의 설명. 문장과 무관하므로 낱말로 캐시
     n:<낱말>|<문장 해시>  이 문장에서의 설명. 문장까지 넣어야 맞는 캐시

   그리고 낱말을 누르는 순간에는 AI 를 부르지 않습니다. 공용 사전을 먼저 봅니다. */
const AI_TIMEOUT = 6000;      // 이보다 오래 걸리면 "다시 시도"를 내밉니다
const AI_MIN_WAIT = 500;      // 너무 빨리 와도 이만큼은 보여 줍니다(화면이 깜빡이지 않게)

function sentenceHash(text){
  const s = String(text||'').trim().toLowerCase();
  let h = 2166136261;
  for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h>>>0).toString(36);
}
/* 원형 후보를 모두 열쇠로 봅니다. "continues"를 눌렀는데 누군가 이미
   "continue"를 물어봤다면 그것으로 끝나야 합니다. */
function entryKeys(w){
  const raw = w.clicked || w.word || '';
  return [...new Set([w.word, ...lemmaCands(raw)].filter(Boolean).map(s=>String(s).toLowerCase()))];
}
const noteKey = w => 'n:' + String(w.word||'').toLowerCase() + '|' + sentenceHash(w.example);

async function loadCachedEntry(k){
  const w = words[k]; if(!w) return false;
  for(const key of entryKeys(w)){
    const hit = await dictGet('w:'+key);
    if(hit){ applyEntry(w, hit, k); await loadCachedNote(k); return true; }
  }
  return false;
}
async function loadCachedNote(k){
  const w = words[k]; if(!w || !w.example) return false;
  const hit = await dictGet(noteKey(w));
  /* note 가 빈 문자열인 것도 답입니다 — "이 문장에서 더 보탤 말이 없다".
     그걸 답으로 안 치면 단추가 다시 나타나고, 누를 때마다 같은 값을 돈 주고 다시 받습니다. */
  if(!hit || !(hit.note || hit.done)) return false;
  w.ai = Object.assign({}, w.ai, { note: hit.note || '', noteDone: true });
  if(selKey===k) renderPanel();
  return true;
}

/* 세 갈래 요청이 같은 문을 씁니다. 로그인은 문 앞이 아니라 AI 앞에 있습니다 —
   공용 사전을 읽는 것은 로그인 없이도 되어야 가장 싼 길이 열립니다. */
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
    if(!r.ok || !j || j.error){ console.warn('dict', r.status, j && j.error); return null; }
    return j;
  }catch(e){ console.warn('dict failed', e); return null; }
}

/* 공용 사전 조회. 여기서 걸리면 AI 는 한 번도 안 부릅니다.
   아무도 물어본 적 없는 낱말일 때만 서버가 항목을 한 번 만들고, 그건 모두의 것이 됩니다. */
async function fetchEntry(k){
  const w = words[k]; if(!w) return false;
  const j = await dictCall({ op:'entry', word: w.clicked || w.word || k, cands: entryKeys(w) });
  if(!j || j.miss || !(j.senses||[]).length) return false;
  await dictPut('w:'+String(j.lemma || w.word || k).toLowerCase(), j);
  applyEntry(w, j, k);
  await loadCachedNote(k);
  return true;
}

/* 이 문장에서 왜 그 뜻인지. 단추를 눌렀을 때만 부릅니다. */
async function fetchExplain(k, force){
  const w = words[k]; if(!w) return false;
  if(navigator.onLine === false){ toast('오프라인이라 AI 뜻을 가져올 수 없어요'); return false; }
  if(!sb || !sbUser){ toast('문맥 설명은 로그인 후 사용할 수 있어요'); openSyncModal(); return false; }
  if(!w.example){ toast('설명할 문장이 없어요'); return false; }

  const key = noteKey(w);
  if(!force){
    const hit = await dictGet(key);
    if(hit && (hit.note || hit.done)){ applyNote(w, hit.note || '', k); return true; }
  }

  const began = Date.now();
  w.aiLoading = true; delete w.aiSlow; if(selKey===k) renderPanel();
  /* 6초가 넘으면 무작정 기다리게 두지 않고 "다시 시도"를 내밉니다.
     기다림 자체보다 "언제 끝날지 모른다"가 더 답답하기 때문입니다. */
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const slow = setTimeout(function(){
    if(!words[k]) return;
    words[k].aiSlow = true;
    if(ctrl) try{ ctrl.abort(); }catch(e){}
    if(selKey===k) renderPanel();
  }, AI_TIMEOUT);
  try{
    const j = await dictCall({ op:'explain', word: w.word || k, sentence: w.example, ko: w.ko || '' },
                             ctrl ? ctrl.signal : null);
    if(!j) return false;
    await dictPut(key, { note: j.note || '', done: true });
    /* 답이 너무 빨리 와도 최소 0.5초는 보여 줍니다.
       화면이 깜빡하고 바뀌면 무슨 일이 일어났는지 못 알아채거든요. */
    const left = AI_MIN_WAIT - (Date.now() - began);
    if(left > 0) await new Promise(function(res){ setTimeout(res, left); });
    applyNote(w, j.note || '', k);
    return true;
  }finally{ clearTimeout(slow); delete w.aiLoading; if(selKey===k) renderPanel(); }
}

/* "이 뜻이 아닌 것 같다" — 문장을 보고 뜻을 다시 고른 뒤 설명까지 새로 받습니다.
   고르는 일은 서버에서 연어·쌓인 단서로 먼저 해 보고, 정 안 되면 그때만 AI 를 씁니다. */
async function askOtherSense(k){
  const w = words[k]; if(!w) return;
  const j = await dictCall({ op:'pick', word: w.word || k, sentence: w.example || '' });
  const picked = j && j.no != null && (w.senses||[]).find(s=>s.no===j.no);
  if(picked){
    w.senseNo = picked.no;
    w.ko = picked.ko;
    w.ai = Object.assign({}, w.ai, { ko: picked.ko, gloss: picked.gloss || '' });
    saveWords(); queueSync(); if(selKey===k) renderPanel();
  }
  await fetchExplain(k, true);
}

async function askAI(force){
  const k = selKey; if(!k || !words[k]) return;
  await fetchExplain(k, force);
}
document.getElementById('p-aibtn').onclick   = ()=>askAI(!!(selKey && words[selKey] && words[selKey].aiSlow));
document.getElementById('p-airetry').onclick = ()=>{ if(selKey && words[selKey]) askOtherSense(selKey); };

function applyEntry(w, e, k){
  delete w.aiLoading;
  w.senses = (e.senses || []).map(s=>({ no:s.no, ko:s.ko, def:s.def, gloss:s.gloss||'', colloc:s.colloc||[] }));
  const chosen = w.senses.find(s=>s.no===w.senseNo) || w.senses[0] || null;
  if(chosen) w.senseNo = chosen.no;
  w.ai = { ko: (chosen && chosen.ko) || e.ko || '',
           pos: e.pos || '',
           gloss: (chosen && chosen.gloss) || e.gloss || '',
           note: (w.ai && w.ai.note) || '' };
  if(e.lemma && !isAcro(w.word) && /^[A-Za-z][A-Za-z'’-]*$/.test(e.lemma)) w.word = e.lemma.toLowerCase();
  /* 예전에는 여기서 w.ko 를 덮어썼습니다. 그때는 이 값이 문맥을 보고 고른 뜻이었으니까요.
     이제 이건 첫 번째 뜻일 뿐이라, 이미 있는 뜻을 밀어내면 안 됩니다. */
  if(!w.ko && w.ai.ko) w.ko = w.ai.ko;
  const terms = w.senses.map(s=>s.ko).filter(Boolean).slice(0,5);
  if(terms.length) w.kodict = [{ pos: e.pos || '', terms }, ...(w.kodict||[]).filter(d=>d.pos!==(e.pos||''))].slice(0,3);
  const defs = w.senses.map(s=>({ pos: e.pos || '', def: s.def })).filter(d=>d.def);
  if(defs.length) w.defs = [...defs, ...(w.defs||[])].slice(0,5);
  if((chosen && chosen.colloc || []).length) w.colloc = chosen.colloc.slice(0,3);
  w.dictSrc = 'shared';
  w.up = Date.now();
  saveWords(); queueSync();
  if(selKey===k) renderPanel();
}
function applyNote(w, note, k){
  delete w.aiLoading;
  w.ai = Object.assign({}, w.ai, { note: note || '', noteDone: true });
  w.up = Date.now();
  saveWords(); queueSync();
  if(selKey===k) renderPanel();
}

async function fetchDict(k){
  const w = words[k]; if(!w) return;
  w.loading = true; if(selKey===k) renderPanel();

  /* ① 이 기기에 이미 있나 — 0원, 기다림 없음 */
  const cached = await loadCachedEntry(k);
  /* ② 내장 사전 300개 — 인터넷을 안 기다립니다 */
  const built  = !cached && applyBuiltin(w);
  if((cached || built) && selKey===k) renderPanel();
  /* ③ 모두가 함께 쓰는 사전 */
  const shared = !cached && await fetchEntry(k);

  /* ④ 이 문장에서의 설명은 예전처럼 여기서 미리 부릅니다.
     단추를 누르고 나서 부르면, 누른 사람이 처음부터 끝까지 기다립니다. 지금 부르면
     읽는 사람이 뜻·발음을 보는 동안 옵니다 — 기다림이 읽기 뒤에 숨습니다.
     예전과 다른 점은 이 호출이 낱말 항목까지 새로 만들지는 않는다는 것입니다.
     항목은 ③에서 이미 왔고, 여기서는 이 문장 이야기만 받아 옵니다. */
  if(w.example && sb && sbUser && navigator.onLine !== false && !(w.ai && w.ai.note))
    fetchExplain(k, false);

  /* 여기까지 뜻을 얻었으면 무료 사전에서는 발음만 받아 옵니다(호출 3회 → 1회). */
  const rich = cached || shared || built;
  const forms = w.forms && w.forms.length ? w.forms : [k];
  let validated = null;
  for(const f of forms){ try{ if(await fetchEn(w,f,rich)){ validated=f; break; } }catch(e){} }
  if(!validated && !rich){ for(const f of forms){ try{ if(await fetchEnWik(w,f)){ validated=f; break; } }catch(e){} } }
  if(!rich && validated && !isAcro(w.word) && validated!==w.word) w.word = validated;
  if(selKey===k) renderPanel();
  if(!rich){
    const koForms = validated ? [validated, ...forms.filter(f=>f!==validated)] : forms;
    for(const f of koForms){ try{ if(await fetchKo(w,f)) break; }catch(e){} }
  }
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
