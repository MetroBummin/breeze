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
  'hatred','united','ing','analysis','basis','crisis','thesis']);
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
function paintWord(k){
  const w = words[k];
  const paint=()=>readerWordNodes(`.w[data-w="${CSS.escape(k)}"],.breeze-original-word[data-w="${CSS.escape(k)}"]`).forEach(s=>{
    s.classList.remove('s1','s2','s3');
    if(w) s.classList.add('s'+w.status);
  });
  paint();
  refreshOriginalSavedWords();
  /* refreshOriginalSavedWords rebuilds persistent PDF markers. Repaint once
     more so both the rebuilt marker and the current selection share status. */
  paint();
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
  if(w.aiSlow && !(w.ai && w.ai.ko)){
    aiBox.className='on'; aiM.textContent='조금 오래 걸리네요';
    aiN.textContent='서버가 붐비는 것 같아요. 아래에서 다시 시도할 수 있어요.';
  }else if(w.aiLoading){
    aiBox.className='on load'; aiM.textContent='문맥에 맞는 뜻을 찾고 있어요…'; aiN.textContent='';
  }else if(w.ai && w.ai.ko){
    aiBox.className='on';
    aiM.innerHTML = esc(w.ai.ko) + (w.ai.pos?`<span class="pos">${esc(w.ai.pos)}</span>`:'');
    aiN.textContent = w.ai.note || '';
  }else{
    aiBox.className='';
  }
  // on-demand 버튼: AI 결과가 있으면 숨기고, 없을 때만 보여준다
  const aiBtn = document.getElementById('p-aibtn'), aiHint = document.getElementById('p-aihint');
  const hasAI = !!(w.ai && w.ai.ko);
  const busy = w.aiLoading && !w.aiSlow;
  aiBtn.style.display = (hasAI || busy) ? 'none' : 'flex';
  aiHint.style.display = (hasAI || busy) ? 'none' : 'block';
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
  src.className = w.dictSrc === 'builtin' ? 'on' : '';
  src.textContent = '기본 사전';
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
/* ---- Claude 기반 사전: Edge Function 경유 (키는 서버에만) ---- */
const AI_TIMEOUT = 6000;      // 이보다 오래 걸리면 "다시 시도"를 내밉니다
const AI_MIN_WAIT = 500;      // 너무 빨리 와도 이만큼은 보여 줍니다(화면이 깜빡이지 않게)
const aiCacheKey = w => (w.clicked || w.word || '').toLowerCase();

/* 캐시에만 있으면 복원 — 네트워크·비용 0 */
async function loadCachedAI(k){
  const w = words[k]; if(!w || w.ai) return false;
  const hit = await dictGet(aiCacheKey(w));
  if(hit){ applyAI(w, hit, k); return true; }
  return false;
}

/* 버튼을 눌렀을 때 실제 호출 */
async function askAI(force){
  const k = selKey; if(!k || !words[k]) return;
  if(navigator.onLine === false){ toast('오프라인이라 AI 뜻을 가져올 수 없어요'); return; }
  if(!sb || !sbUser){ toast('AI 뜻은 로그인 후 사용할 수 있어요'); openSyncModal(); return; }
  await fetchAI(k, force);
}

document.getElementById('p-aibtn').onclick   = ()=>askAI(!!(selKey && words[selKey] && words[selKey].aiSlow));
document.getElementById('p-airetry').onclick = ()=>askAI(true);

async function fetchAI(k, force){
  const w = words[k]; if(!w) return false;
  if(!sb || !sbUser) return false;                    // 로그인 필요
  const cacheKey = aiCacheKey(w);

  if(!force){
    const hit = await dictGet(cacheKey);
    if(hit){ applyAI(w, hit, k); return true; }
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
    const { data:{ session } } = await sb.auth.getSession();
    const opt = {
      method:'POST',
      headers:{ 'Content-Type':'application/json',
                'Authorization':'Bearer ' + (session ? session.access_token : SB_KEY),
                'apikey': SB_KEY },
      body: JSON.stringify({ word: w.clicked || w.word || k, sentence: w.example || '' })
    };
    if(ctrl) opt.signal = ctrl.signal;
    const r = await fetch(SB_URL.replace(/\/$/,'') + '/functions/v1/dict', opt);
    const j = await r.json().catch(()=>null);
    if(!r.ok || !j || j.error){ console.warn('AI dict:', r.status, j && j.error); return false; }
    await dictPut(cacheKey, j);
    /* 답이 너무 빨리 와도 최소 0.5초는 보여 줍니다.
       화면이 깜빡하고 바뀌면 무슨 일이 일어났는지 못 알아채거든요. */
    const left = AI_MIN_WAIT - (Date.now() - began);
    if(left > 0) await new Promise(function(res){ setTimeout(res, left); });
    applyAI(w, j, k);
    return true;
  }catch(e){ console.warn('AI dict failed', e); return false; }
  finally{ clearTimeout(slow); delete w.aiLoading; if(selKey===k) renderPanel(); }
}
function applyAI(w, ai, k){
  delete w.aiLoading;
  w.ai = { ko:ai.ko||'', pos:ai.pos||'', note:ai.note||'' };
  if(ai.lemma && !isAcro(w.word) && /^[A-Za-z][A-Za-z'’-]*$/.test(ai.lemma)) w.word = ai.lemma.toLowerCase();
  if(ai.ko) w.ko = ai.ko;                                    // 문맥 뜻을 기본 뜻으로
  const extra = (ai.ko_all||[]).filter(t=>t && t!==ai.ko);
  if(extra.length){
    const chips = { pos: ai.pos || '', terms: [ai.ko, ...extra].filter(Boolean).slice(0,5) };
    w.kodict = [chips, ...(w.kodict||[]).filter(d=>d.pos!==chips.pos)].slice(0,3);
  }
  if(ai.en) w.defs = [{pos:ai.pos||'', def:ai.en}, ...(w.defs||[])].slice(0,5);
  w.up = Date.now();
  saveWords(); queueSync();
  if(selKey===k) renderPanel();
}

async function fetchDict(k){
  const w = words[k]; if(!w) return;
  w.loading = true; if(selKey===k) renderPanel();
  loadCachedAI(k);                  // 이미 물어본 단어면 캐시에서 무료로 복원 (API 호출 없음)
  /* 내장 사전에 있으면 인터넷을 기다리지 않고 바로 보여 줍니다.
     그 뒤 발음만 받아 오고, 한국어·영어 뜻 조회는 통째로 건너뜁니다(호출 3회 → 1회). */
  const built = applyBuiltin(w);
  if(built && selKey===k) renderPanel();
  /* 내장 사전에 없으면 문맥 뜻을 미리 요청합니다. */
  if(!built && sb && sbUser && navigator.onLine !== false) fetchAI(k, false);
  const forms = w.forms && w.forms.length ? w.forms : [k];
  let validated = null;
  for(const f of forms){ try{ if(await fetchEn(w,f,built)){ validated=f; break; } }catch(e){} }
  if(!validated && !built){ for(const f of forms){ try{ if(await fetchEnWik(w,f)){ validated=f; break; } }catch(e){} } }
  if(!built && validated && !isAcro(w.word) && validated!==w.word) w.word = validated;
  if(selKey===k) renderPanel();
  if(!built){
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
document.getElementById('btn-xlsx').onclick = ()=>{
  const list = Object.values(words).sort((a,b)=>b.addedAt-a.addedAt);
  if(!list.length){ toast('내보낼 단어가 없어요'); return; }
  const stName = {1:'★',2:'★★',3:'★★★'};
  const aoa = [['단어','뜻','영어 뜻','예문','모르는 정도','책','저장일'],
    ...list.map(w=>[w.word, w.ko||'', (w.defs||[]).map(d=>`(${d.pos}) ${d.def}`).join(' / '),
      w.example||'', stName[w.status], w.book||'', new Date(w.addedAt).toLocaleDateString('ko-KR')])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{wch:16},{wch:24},{wch:50},{wch:60},{wch:10},{wch:28},{wch:12}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Breeze 단어장');
  XLSX.writeFile(wb, 'breeze_vocab.xlsx');
};
