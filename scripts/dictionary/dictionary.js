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
  caught:'catch',fought:'fight',sought:'seek',swept:'sweep',flew:'fly',flown:'fly',threw:'throw',thrown:'throw',
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
/* `hoping → hope` 처럼 사라진 e 를 되살리는 자리입니다. 그런데 이 규칙은
   마지막 음절에 힘이 실린 낱말에서만 맞습니다 — `consider` 도 `offer` 도
   `open` 도 끝이 "자음+모음+자음" 이라 규칙에는 걸리는데, 실제로는 e 가 없습니다.
   그래서 `considering → considere`, `answered → answere` 같은 없는 낱말이
   표제어로 저장되고 있었습니다.

   가르는 신호는 하나로 충분합니다: **음절이 둘 이상이면서 끝이 힘 없는
   -er/-en/-el/-on/-or 인 어간에는 e 를 붙이지 않습니다.** `bore·store·phone·
   clone·come` 처럼 e 가 진짜 필요한 쪽은 전부 한 음절이라 그대로 지나갑니다. */
const DULL_TAIL = /(?:er|en|el|on|or)$/;
const vowelRuns = s => (s.match(/[aeiouy]+/g)||[]).length;
const needsSilentE = b =>
  /[^aeiou][aeiou][^aeiouwxy]$/.test(b) && !(DULL_TAIL.test(b) && vowelRuns(b) > 1);
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
    if(needsSilentE(b)) return b+'e';
    return b;
  }
  if(/ed$/.test(w) && w.length>4 && !/eed$/.test(w)){
    let b = w.slice(0,-2);
    if(!hasVowel(b)) return w;
    if(b.length>2 && b[b.length-1]===b[b.length-2] && !/(ll|ss|zz)$/.test(b)) return b.slice(0,-1);
    /* charge→charged, use→used처럼 e가 사라진 형태. 일반 CVC 규칙보다 먼저
       대표적인 어말 묶음을 복원해야 charg 같은 가짜 표제어가 생기지 않습니다. */
    if(/(?:[cgsv]|bl|gl|iz)$/.test(b)) return b+'e';
    if(needsSilentE(b)) return b+'e';
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
/* 한 문장만으로는 뜻이 안 잡히는 자리가 있습니다. 앞뒤 문장을 한 번 더 붙여
   물어보면 대명사·생략·비유가 풀립니다. */
function expandedContextFor(w, sentence){
  const target=String(sentence||'').replace(/\s+/g,' ').trim();
  if(!target || !curBook || !Array.isArray(curBook.paras)) return target;
  const normalized=value=>String(value||'').replace(/\s+/g,' ').trim();
  const index=curBook.paras.findIndex(para=>normalized(para).includes(target));
  if(index<0) return target;
  const here=normalized(curBook.paras[index]);
  const parts=here.match(/[^.!?…]+[.!?…]*/g)||[here];
  const at=Math.max(0,parts.findIndex(part=>normalized(part)===target || normalized(part).includes(target)));
  const before=at>0 ? parts[at-1] : curBook.paras[index-1];
  const after=at<parts.length-1 ? parts[at+1] : curBook.paras[index+1];
  return [before,target,after].filter(Boolean).map(normalized).join(' ').slice(0, 600);
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
    example:sentenceOf(span), book:curBook.title, status:1, mark:true, addedAt:Date.now(), up:Date.now() };
  recentWordOpens.set(k, Date.now());
  /* 이제 이 기기에 잃을 것이 생겼습니다 — 저장소를 영구로 표시해 달라고 부탁합니다.
     한 번만 물어보고, 이미 물어봤으면 조용히 지나갑니다. */
  requestDurableLocalStorage();
  delete dead[k]; save(LS_DEAD, dead);
  saveWords(); queueSync();
  paintWord(k);
  selectWord(k, span);
  fetchDict(k);
}
/* 같은 낱말을 눌러 사전 창을 막 닫았다 다시 여는 것은 "더 모른다"가 아니라
   화면을 다시 확인하는 일입니다. 별은 읽는 동안 쌓이는 소음이 아니라, 시간을
   두고 다시 막혔을 때만 하나 올립니다. 이 기록은 동기화할 학습 데이터가 아니라
   잠깐의 손짓이므로 기기 메모리에만 둡니다. */
const RECENT_WORD_OPEN_MS = 30000;
const recentWordOpens = new Map();
/* 다른 문장에서 이미 저장한 낱말을 만났을 때의 임시 화면 상태입니다. 저장한 뜻을
   그대로 보여 주면서 "이 문장에서는?" 하나를 더 내밀 뿐이고, 읽는 중의 문장을
   저장 카드에 덮어 쓰지 않습니다. 눌러서 새 뜻을 받으면 그 순간 Meaning 이 하나
   생깁니다 — 미리보기 상태도, 저장 여부를 묻는 단계도 없습니다. */
let contextView = null, phraseView = null;
/* ＋ 로 뜻을 직접 적는 동안만 켜지는 칸입니다. */
let addingMeaning = false;
function currentContext(k){ return contextView && contextView.key === k ? contextView : null; }
function currentPhrase(k){ return phraseView && phraseView.key === k ? phraseView : null; }
function answerFromLook(j, cached){
  const oldAi=j.ai||{};
  /* `gloss` 는 옛 이름입니다 — 기기에 남아 있는 예전 답을 그대로 읽기 위해 함께 봅니다. */
  return { ko:j.ko||oldAi.ko||'', ai:{ko:j.ko||oldAi.ko||'',pos:j.pos||oldAi.pos||'',
      note:j.note||j.gloss||oldAi.note||oldAi.gloss||'',done:true,cached:!!cached},
    alts:Array.isArray(j.alts)?j.alts:[], phrase:j.phrase||'', aiLemma:j.lemma||'' };
}
function contextCardKey(root, sentence){ return `${root}::${sentenceHash(sentence)}`; }
function senseCardKey(root, meaning){ return `${root}::sense:${sentenceHash(meaning)}`; }
function phraseCardKey(text){ return `phrase:${phraseParts(text).join(' ')}`; }
function meaningKey(meaning){ return String(meaning||'').trim().replace(/\s+/g,' ').toLowerCase(); }
function findContextCard(root, sentence){
  const id=contextCardKey(root,sentence);
  return words[id] ? id : null;
}
function findSavedSense(root, sentence){
  return Object.keys(words).find(id=>{
    const item=words[id];
    return item && item.sense && item.root===root && item.example===sentence;
  }) || null;
}
function findSenseByMeaning(root, meaning){
  const wanted=meaningKey(meaning); if(!wanted) return null;
  const pairs=Object.entries(words).filter(([id,item])=>item&&(id===root||item.root===root)
    && meaningKey(item.ko)===wanted);
  pairs.sort(([a],[b])=>(a===root?-1:0)-(b===root?-1:0));
  return pairs.length ? pairs[0][0] : null;
}
/* ── Meaning 목록 ──
   화면에서 낱말은 하나지만, 뜻은 여러 개일 수 있습니다. 저장은 지금까지처럼
   root 아래의 독립 카드로 하되(별·예문·복습이 뜻마다 따로여야 하므로), 팝업은
   그것을 "저장된 뜻" 한 줄로 보여 줍니다.

   순서 규칙은 하나뿐입니다: 지금 보고 있는 뜻이 늘 맨 앞, 그 뒤는 최근에 고른 순.
   그래야 칩을 눌러 뜻을 바꿨을 때 방금 고른 것이 첫 자리로 올라옵니다. */
function meaningPickedAt(item){ return (item&&(item.pickedAt||item.up||item.addedAt))||0; }
function meaningCards(root, activeId){
  /* `areca nut` 같은 표현도 자기 뜻을 여러 개 가질 수 있는 표제어입니다. 표현이라는
     이유로 대표 카드를 목록에서 빼면, 첫 번째로 적은 뜻이 화면에서 사라진 채
     저장소에만 남습니다. 걸러 낼 것은 "다른 표현 카드"뿐입니다. */
  const cards=Object.entries(words).filter(([id,item])=>item&&(id===root||item.root===root)
    && item.ko && (id===root || !item.phraseParts));
  cards.sort(([a,aw],[b,bw])=>(a===activeId?-1:0)-(b===activeId?-1:0)
    || meaningPickedAt(bw)-meaningPickedAt(aw));
  const unique=new Set();
  return cards.filter(([,item])=>{
    const key=meaningKey(item.ko); if(!key||unique.has(key)) return false;
    unique.add(key); return true;
  });
}
/* 고른 뜻은 다음에도 맨 앞에서 만납니다. 화면 순서일 뿐이라 조용히 적어 둡니다. */
function touchMeaning(id){
  const item=words[id]; if(!item) return;
  item.pickedAt=Date.now();
}
/* 뜻을 만드는 곳은 여기 하나입니다 — ＋ 직접 입력도, 추천 뜻 클릭도,
   "이 문장에서는?" 의 AI 답도 모두 이 문을 지납니다. 만들면 곧바로 저장이고
   곧바로 지금 뜻입니다. 물어보는 단계는 없습니다. */
function createMeaning(root, text, source){
  const meaning=String(text||'').replace(/\s+/g,' ').trim();
  const base=words[root]; if(!meaning || !base) return '';
  const from=source||{};
  const already=findSenseByMeaning(root,meaning);
  if(already){ touchMeaning(already); dropSuggestion(root,meaning); saveWords(); queueSync(); return already; }
  const ai={...(from.ai||{}),ko:meaning,note:(from.ai&&(from.ai.note||from.ai.gloss))||''};
  /* 아직 뜻이 하나도 없는 낱말이면 대표 카드의 빈 뜻자리를 채웁니다. 빈 카드를
     남겨 두고 옆에 새 카드를 만들면, 화면에 없는 뜻이 저장소에만 생깁니다. */
  if(!String(base.ko||'').trim()){
    base.ko=meaning; base.ai=ai; delete base.koEdited;
    if(from.example) base.example=from.example;
    if(from.book) base.book=from.book;
    base.pickedAt=Date.now(); base.up=Date.now();
    dropSuggestion(root,meaning); saveWords(); queueSync(); return root;
  }
  /* 뜻 카드의 주소는 뜻 글자에서 나옵니다. 그래서 지웠던 뜻을 똑같이 다시 적으면
     주소도 똑같고, 그 주소에는 "지웠다"는 표(`dead`)가 아직 붙어 있습니다. 표를
     떼지 않으면 이 기기는 살아 있는 카드와 그 카드의 부고를 함께 올려 보냅니다 —
     두 시각이 같은 순간에 찍히면 합칠 때 부고가 이깁니다. 만드는 순간 뗍니다
     (낱말을 다시 넣을 때 `addWord` 가 하는 일과 같습니다). */
  const id=senseCardKey(root,meaning), previous=words[id];
  if(dead[id]){ delete dead[id]; save(LS_DEAD,dead); }
  words[id]={...(previous||{}), word:base.word, root, sense:true,
    clicked:from.clicked||base.clicked||base.word, forms:base.forms||[base.word],
    example:from.example||base.example||'', book:from.book||base.book||'',
    status:previous?previous.status:(base.status||1), mark:previous?previous.mark:base.mark!==false,
    ko:meaning, ai, alts:Array.isArray(from.alts)?from.alts:[], phrase:from.phrase||'',
    defs:[], kodict:[], addedAt:previous?previous.addedAt:Date.now(),
    pickedAt:Date.now(), up:Date.now()};
  dropSuggestion(root,meaning); saveWords(); queueSync();
  return id;
}
/* 저장한 뜻은 더 이상 추천이 아닙니다. 같은 말이 두 줄에 동시에 있으면
   "칩을 누르면 이 뜻을 본다"는 규칙이 흔들립니다. */
function dropSuggestion(root, meaning){
  const wanted=meaningKey(meaning); if(!wanted) return;
  Object.entries(words).forEach(([id,item])=>{
    if(!item || (id!==root && item.root!==root) || !Array.isArray(item.alts)) return;
    item.alts=item.alts.filter(alt=>meaningKey(alt)!==wanted);
  });
}
/* × — 뜻 하나를 지웁니다. 확인창은 없습니다.

   지우는 문은 둘입니다: 지금 보는 뜻은 메인 뜻 칸에서, 나머지는 그 칩에서.
   지금 보던 뜻을 지우면 남은 것 중 가장 최근에 봤던 것이 곧바로 지금 뜻이 되고,
   다른 뜻을 지우면 보고 있던 뜻은 그대로 있습니다. 하나도 남지 않으면 낱말은
   단어장에 그대로 두고 뜻자리만 비웁니다(＋ 와 추천 뜻은 그 자리에 있습니다). */
function deleteMeaning(id){
  const item=words[id]; if(!item) return;
  const root=item.root||id;
  const wasActive=id===selKey;
  const rest=meaningCards(root,null).filter(([mid])=>mid!==id);
  const bury=key=>{ delete words[key]; dead[key]=Date.now(); save(LS_DEAD,dead); };
  let next=wasActive ? '' : selKey;
  if(!rest.length){
    if(id!==root && words[root]) bury(id);
    else{
      const base=words[root];
      base.ko=''; base.ai={...(base.ai||{}),ko:'',note:'',gloss:''}; delete base.koEdited;
      base.up=Date.now();
    }
    next=root;
  }else if(id===root){
    /* 대표 카드의 주소는 원문 색칠이 기대는 열쇠라 비울 수 없습니다. 다른 뜻 하나를
       그 자리로 올립니다 — 보고 있던 뜻이 따로 있으면 그것을 올려, 칩 하나 지웠을
       뿐인데 화면의 뜻이 바뀌는 일이 없게 합니다. */
    const keep=!wasActive && rest.some(([mid])=>mid===selKey) ? selKey : rest[0][0];
    const promote=words[keep];
    words[root]={...promote, root:undefined, sense:undefined, word:item.word,
      clicked:item.clicked, forms:item.forms, addedAt:item.addedAt,
      pickedAt:wasActive ? Date.now() : (promote.pickedAt||Date.now()), up:Date.now()};
    bury(keep);
    next=root;
  }else{
    bury(id);
    if(wasActive){ const [nextId]=rest[0]; touchMeaning(nextId); next=nextId; }
  }
  if(!next || !words[next]) next=root;
  addingMeaning=false;
  saveWords(); queueSync(); paintWord(root); refreshReaderWords();
  if(typeof renderVocab==='function' && document.getElementById('v-vocab').classList.contains('on')) renderVocab();
  contextView=null; selectWord(next,null);
}

/* 단어를 누르는 규칙은 한 곳에만 둡니다. 처음 누르면 단어장에 넣고, 이미
   저장된 단어를 다시 만났을 때만 별을 하나 올립니다. */
function openWord(k, node){
  if(!words[k]){ addWord(k, node); return; }
  const nextExample = sentenceOf(node);
  const root=words[k].root||k;
  const savedContext=nextExample && (findContextCard(root,nextExample)||findSavedSense(root,nextExample));
  if(savedContext){
    const now=Date.now(), seenAt=recentWordOpens.get(savedContext)||0;
    if(now-seenAt>=RECENT_WORD_OPEN_MS && words[savedContext].status<3) setStatus(savedContext,words[savedContext].status+1);
    recentWordOpens.set(savedContext,now); contextView=null; selectWord(savedContext,node); return;
  }
  /* 저장해 둔 낱말은 마지막으로 보던 뜻으로 열립니다 — 캐시된 뜻이 곧바로 메인
     뜻입니다. 기다림도, 한도도 쓰지 않습니다. */
  const active = (meaningCards(root, null)[0] || [k])[0];
  const now = Date.now();
  const seenAt = recentWordOpens.get(active) || 0;
  if(now - seenAt >= RECENT_WORD_OPEN_MS && words[active].status < 3) setStatus(active, words[active].status + 1);
  recentWordOpens.set(active, now);

  /* 새 문장에서는 저장한 뜻을 그대로 보여 주고 "이 문장에서는?" 하나만 더 내밉니다.
     자동으로 AI를 부르거나 저장한 예문을 바꾸지 않습니다. */
  if(nextExample && nextExample !== words[active].example){
    const w = words[active];
    contextView = { key:active, sentence:nextExample, clicked:node.textContent.replace(/’/g,"'"),
      book:(curBook&&curBook.title)||w.book };
    selectWord(active, node);
    return;
  }
  contextView = null;
  selectWord(active, node);
}
/* 낱말 창은 두 가지 물건입니다. 폰에서는 화면을 덮는 바텀시트, 넓은 화면에서는
   본문 옆에 나란히 서는 칸. 상단바를 어떻게 다룰지가 여기서 갈립니다. */
function panelIsSheet(){
  if(!window.matchMedia) return false;
  return window.matchMedia('(max-width:760px)').matches && !window.matchMedia('(pointer:fine)').matches;
}
function selectWord(k, span){
  /* 다른 낱말을 열면 앞 문장의 해석 창은 남겨 둘 이유가 없습니다. */
  if(typeof closeSentence === 'function') closeSentence();
  if(!currentContext(k)) contextView = null;
  if(!phraseView || phraseView.key !== k) phraseView = null;
  if(selKey!==k) addingMeaning=false;
  /* 칩을 눌러 고른 뜻은 다음에 열 때 맨 앞에서 만납니다. */
  if(words[k] && words[k].ko){ touchMeaning(k); saveWords(); }
  selKey = k;
  readerWordNodes('.w.sel,.breeze-original-word.sel').forEach(s=>s.classList.remove('sel'));
  if(span) span.classList.add('sel');
  renderPanel();
  const panel=document.getElementById('panel');
  /* 패널은 한 번 열린 뒤에도 자기 안의 스크롤 위치를 기억합니다. 다른 낱말을
     눌렀는데 중간부터 보였던 이유가 이것입니다. 내용을 바꾼 직후와 레이아웃이
     한 번 그려진 뒤에 모두 0으로 돌려, 항상 낱말 제목부터 열리게 합니다. */
  const resetPanelScroll=()=>{ panel.scrollTop=0; };
  resetPanelScroll();
  panel.classList.add('on');
  if(typeof updateOriginalZoomControls === 'function') updateOriginalZoomControls();
  document.getElementById('sheetbg').classList.add('on');
  if(typeof rememberAppView==='function') rememberAppView(activeAppView());
  requestAnimationFrame(resetPanelScroll);
  /* 폰의 바텀시트는 화면을 덮으므로, 그 동안 상단바가 걷혔다 돌아오면 시트가
     함께 흔들립니다 — 그래서 붙잡습니다. 넓은 화면의 패널은 본문 옆에 나란히
     서 있을 뿐이라 상단바는 평소처럼 스크롤을 따라가게 둡니다. 대신 패널의
     자리와 높이는 상단바가 있을 때로 고정입니다(styles/dictionary.css). */
  pinReaderChrome(panelIsSheet());
}
function closePanel(){
  selKey=null;
  contextView=null; phraseView=null; addingMeaning=false;
  /* 창을 닫았으면 그 답은 아무도 안 봅니다. 그런데 하루 한도는 이미 나갔습니다 —
     훑어 읽을 때 이 손실이 제일 큽니다. 그래서 여기서 끊습니다. */
  abortLook();
  const panel=document.getElementById('panel');
  panel.classList.remove('on');
  if(typeof updateOriginalZoomControls === 'function') updateOriginalZoomControls();
  panel.scrollTop=0;
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
      if(w && w.mark !== false) s.classList.add('s'+w.status);
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
  const base = words[selKey]; if(!base) return;
  const k = selKey;
  const context = currentContext(k);
  const phrase = !context && currentPhrase(k);
  /* 다른 문장에서 만난 낱말은 저장해 둔 뜻을 그대로 보여 줍니다 — 화면에 뜬
     문장만 지금 읽는 문장으로 바꿔서. 새 뜻은 "이 문장에서는?" 을 눌렀을 때만
     생기고, 생기는 순간 저장된 뜻이 되므로 미리보기 상태가 없습니다. */
  const w = context ? Object.assign({}, base, {
    example:context.sentence, clicked:context.clicked, book:context.book,
    aiLoading:!!context.loading, aiSlow:false, aiOff:context.error||'',
  }) : phrase ? Object.assign({}, base, phrase.answer || { ko:'', ai:{}, phrase:'' }, {
    word:phrase.phrase, clicked:'', example:phrase.sentence, book:phrase.book,
    aiLoading:!!phrase.loading, aiSlow:false, aiOff:phrase.error||'',
  }) : base;
  /* 화면의 단어 칸은 내부 key 가 아니라 지금 열어 둔 카드의 표시값입니다. 읽는
     글자일 뿐, 고치는 칸이 아닙니다 — 표제어를 손으로 바꾸면 원문 색칠이 기대는
     열쇠와 화면의 글자가 갈라집니다. 잘못 잡힌 낱말은 단어장에서 빼고 다시 누릅니다. */
  document.getElementById('p-word').textContent=w.word;
  /* 표제어 아래 한 줄. 원형이 따로 있을 때만 뜹니다 — "spared에서 찾음". */
  const clickedLine=document.getElementById('p-clicked');
  const original = phrase ? `표현 뜻 보기 · ${phrase.phrase}`
    : (w.clicked && w.clicked.toLowerCase()!==w.word.toLowerCase()) ? `${w.clicked}에서 찾음` : '';
  clickedLine.textContent = original;
  clickedLine.classList.toggle('on', !!original);
  document.getElementById('p-ex').textContent = w.example || '—';
  document.getElementById('p-naver').href = 'https://en.dict.naver.com/#/search?query='+encodeURIComponent(w.word);
  document.querySelectorAll('.stbtn').forEach(b=>b.classList.toggle('on', +b.dataset.s===w.status));
  const mark = document.getElementById('p-mark');
  const marked = base.mark !== false;
  mark.classList.toggle('on', marked);
  mark.setAttribute('aria-pressed', String(marked));
  mark.querySelector('span').textContent = marked ? '색칠 ON' : '색칠 OFF';
  mark.title = marked ? '이 단어의 본문 색칠 끄기' : '이 단어의 본문 색칠 켜기';

  /* ── 뜻이 사는 칸. 하나뿐입니다 ──
     지금 보고 있는 Meaning 하나가 여기 뜹니다. 이 칸에서 할 수 있는 일은 지우기(×)
     하나뿐이고, 만들기는 아래 ＋, 고르기는 아래 칩입니다 — 세 손짓이 서로 다른
     자리에 있어야 작은 화면에서 부딪히지 않습니다. */
  const aiBox = document.getElementById('p-ai');
  const aiKo = document.getElementById('p-ai-ko'), aiPos = document.getElementById('p-ai-pos');
  const aiN = document.getElementById('p-ai-note');
  const aiCap = document.getElementById('p-ai-cap-t'), aiRetry = document.getElementById('p-airetry');
  const ai = w.ai || {};
  const asking = !!w.aiLoading && !w.aiSlow;
  const shown = w.ko || ai.ko || '';
  if(asking){
    aiBox.className = 'on load';
    aiCap.textContent = '문맥 뜻 · AI';
  }else if(shown){
    aiBox.className = 'on' + (w.koEdited ? ' edited' : '');
    /* noteDone 은 예전 모양입니다. 이미 저장된 단어를 다시 눌렀을 때
       AI 가 답했던 사실이 사라져 보이지 않게 함께 봅니다. */
    aiCap.textContent = w.koEdited ? '내가 적은 뜻'
      : ai.cached ? '전에 찾아본 뜻'
      : ((ai.done || ai.noteDone) ? '문맥 뜻 · AI' : '뜻');
    aiKo.textContent = shown;
    aiPos.textContent = ai.pos || '';
    /* 뜻 아래 한 줄은 "이 문장에서 어떻게 쓰였나" 입니다. 뜻의 일반적인 성질은
       사전이 이미 말해 주는 것이고, 이 자리에서 Breeze 만 할 수 있는 말은 이쪽입니다.
       그래서 화면에 뜬 문장이 이 뜻이 배운 그 문장일 때만 답니다 — 다른 문장에서
       만난 낱말에는 바로 아래 "이 문장에서는?" 이 그 문장의 줄을 새로 받아 옵니다. */
    const said = context ? '' : (ai.note || ai.gloss || '');
    const top = said || (w.aiSlow ? '조금 오래 걸렸어요. 다시 시도할 수 있어요.' : '');
    aiN.textContent = top;
    aiN.style.display = top ? 'block' : 'none';
    /* 이 문장만으로 안 풀릴 때 앞뒤 문장까지 붙여 한 번 더 묻는 길입니다.
       새 답은 지금 뜻을 덮지 않고 뜻 하나로 더해집니다 — 마음에 안 들면 × 입니다. */
    aiRetry.hidden = !(sb && sbUser && w.example);
  }else{
    aiBox.className = '';
    aiRetry.hidden = true;
  }

  /* 이미 저장해 둔 뜻을 다른 문장에서 보고 있을 때만 여는 문입니다. 방금 이 문장으로
     받아 온 뜻이면 다시 물어볼 것이 없으므로 아예 뜨지 않습니다. */
  const contextBtn=/** @type {HTMLButtonElement} */(document.getElementById('p-context'));
  contextBtn.classList.toggle('on', !!context && !!shown);
  contextBtn.disabled=!!(context && context.loading);
  contextBtn.innerHTML = context && context.loading ? '이 문장을 살펴보는 중…'
    : `<span class="sp">✦</span>${context && context.error ? '이 문장에서 다시 보기' : '이 문장에서는?'}`;

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

  /* 숙어는 뜻이 아니라 다른 표제어입니다. 그래서 뜻 칩들과 섞지 않고 낱말 바로
     아래에, 이 문장에서 확신이 설 때만 한 줄로 둡니다. */
  const col = document.getElementById('p-colloc');
  if(w.phrase){
    col.className = 'on';
    col.innerHTML = '<button type="button" class="phrase-suggestion" title="표현 전체의 뜻 보기"><span class="phrase-star">✦</span>'+esc(w.phrase)+'<span class="phrase-go">→</span></button>';
    col.querySelector('button').onclick=()=>openPhrase(k);
  }else{
    col.className = ''; col.innerHTML = '';
  }
  /* ── 저장된 뜻 ──
     칩 = 선택. ＋ = 생성. 칩 안에 × 를 넣지 않는 이유는 두 가지입니다: 작은 칩
     안에서 두 손짓의 터치 자리가 겹치고, 지우는 문이 둘이 되면 "칩을 누르면 이
     뜻을 본다"는 한 줄짜리 규칙이 깨집니다. */
  const root=base.root||k, savedSec=document.getElementById('p-saved-senses-sec');
  const savedBox=document.getElementById('p-saved-senses'), meanings=phrase?[]:meaningCards(root,k);
  const canAdd=!phrase;
  savedSec.className='p-sec p-sec-row'+(canAdd?' on':'');
  if(meanings.length){
    savedBox.className='on';
    /* 첫 칩은 지금 보고 있는 뜻이라 지우는 문이 이미 메인 뜻 칸에 있습니다. 두 번째
       칩부터는 그 문이 없으므로, 정리할 길을 칩 안에 하나 둡니다. */
    savedBox.innerHTML=meanings.map(([id,item],index)=>`<button type="button" class="saved-sense${index===0?' on':''}" data-k="${esc(id)}">${index===0?'<span class="sense-tick">✓</span>':''}${esc(item.ko)}${index===0?'':'<span class="sense-remove" role="img" aria-label="이 뜻 지우기">×</span>'}</button>`).join('');
    [...savedBox.querySelectorAll('.saved-sense')].forEach(button=>{
      const chip=/** @type {HTMLElement} */(button);
      chip.onclick=event=>{
        const id=chip.dataset.k||'';
        if((/** @type {HTMLElement} */(event.target)).closest('.sense-remove')){ deleteMeaning(id); return; }
        if(id===selKey) return;
        addingMeaning=false; contextView=null; phraseView=null; selectWord(id,null);
      };
    });
  }else{ savedBox.className=''; savedBox.innerHTML=''; }
  /* 뜻이 하나뿐이면 지우는 문을 닫아 둡니다. 뜻 없는 낱말을 만들 수 있는 유일한
     길이었고, 그렇게 만들어 두면 다음에 열었을 때 빈 칸부터 마주칩니다.
     낱말째로 빼는 것은 아래 "단어장에서 빼기"가 맡습니다. */
  document.getElementById('p-meaning-del').hidden = !(shown && !asking && !phrase && meanings.length>1);
  const addBox=document.getElementById('p-sense-add');
  const addInput=/** @type {HTMLInputElement} */(document.getElementById('p-sense-input'));
  addBox.hidden=!(canAdd && addingMeaning);
  if(addBox.hidden) addInput.value='';
  /* 추천 뜻은 아직 Meaning 이 아닙니다. 한 번 누르면 저장된 뜻이 되어 이 줄을
     떠납니다. 싫은 추천에는 × 를 두지 않습니다 — 그냥 지나치면 됩니다. */
  const altSec=document.getElementById('p-alt-sec'), altBox=document.getElementById('p-alts');
  const savedKeys=new Set(meanings.map(([,item])=>meaningKey(item.ko)));
  const alts=[...new Set((w.alts||[]).map(item=>String(item||'').trim())
    .filter(item=>item && !savedKeys.has(meaningKey(item)) && meaningKey(item)!==meaningKey(shown)))].slice(0,3);
  if(alts.length && !phrase){
    altSec.className='p-sec on'; altBox.className='on';
    altBox.innerHTML=alts.map(item=>`<button type="button" class="kochip" data-meaning="${esc(item)}">${esc(item)}</button>`).join('');
    [...altBox.querySelectorAll('.kochip')].forEach(button=>{
      const chip=/** @type {HTMLElement} */(button);
      chip.onclick=()=>adoptSuggestion(k,chip.dataset.meaning||'');
    });
  }else{ altSec.className='p-sec'; altBox.className=''; altBox.innerHTML=''; }
  const defs = document.getElementById('p-defs');
  if(w.loading) defs.innerHTML = '<span style="color:var(--soft2)">불러오는 중…</span>';
  else if(!w.defs || !w.defs.length) defs.innerHTML = '<span style="color:var(--soft2)">영어 뜻을 찾지 못했어요</span>';
  else defs.innerHTML = w.defs.map(d=>`<div><span class="pos">${esc(d.pos)}</span>${esc(d.def)}</div>`).join('');
}
/* 추천 뜻 클릭 = 그 뜻을 저장하고 지금 뜻으로 삼기. 확인은 묻지 않습니다 —
   누른 것 자체가 대답입니다. */
function adoptSuggestion(k, meaning){
  const base=words[k]; if(!base || !meaning) return;
  const root=base.root||k;
  const id=createMeaning(root, meaning, {clicked:base.clicked, example:base.example, book:base.book, ai:base.ai});
  if(!id) return;
  logDict('pick', id);
  addingMeaning=false; contextView=null; phraseView=null;
  paintWord(root); selectWord(id,null);
}
/* ＋ 로 적어 넣는 뜻. 적어서 Enter 를 누르면 그 자리에서 저장되고 지금 뜻이 됩니다. */
function addMeaningFromInput(){
  const input=/** @type {HTMLInputElement} */(document.getElementById('p-sense-input'));
  const base=words[selKey], text=input.value.replace(/\s+/g,' ').trim();
  if(!base){ addingMeaning=false; renderPanel(); return; }
  if(!text){ addingMeaning=false; renderPanel(); return; }
  const root=base.root||selKey;
  const id=createMeaning(root, text, {clicked:base.clicked, example:base.example, book:base.book,
    ai:{ko:text, pos:'', note:'', done:false}});
  if(!id) return;
  const card=words[id];
  if(card){ card.koEdited=true; card.up=Date.now(); saveWords(); queueSync(); }
  logDict('edit', id);
  input.value=''; addingMeaning=false; contextView=null; phraseView=null;
  paintWord(root); selectWord(id,null);
}
/* 뜻과 관련해 외울 손짓은 셋뿐입니다: 칩을 누르면 이 뜻을 본다, ＋ 는 만든다,
   × 는 지금 뜻을 없앤다. 그 셋을 여기서 한 번에 답니다. */
document.getElementById('p-meaning-del').onclick=()=>{ if(selKey && words[selKey]) deleteMeaning(selKey); };
document.getElementById('p-add-sense').onclick=()=>{
  if(!selKey || !words[selKey]) return;
  addingMeaning=!addingMeaning; renderPanel();
  if(addingMeaning) requestAnimationFrame(()=>document.getElementById('p-sense-input').focus());
};
const senseInput=/** @type {HTMLInputElement} */(document.getElementById('p-sense-input'));
senseInput.addEventListener('keydown',event=>{
  if(event.key==='Enter'){ event.preventDefault(); addMeaningFromInput(); }
  if(event.key==='Escape'){ event.preventDefault(); addingMeaning=false; renderPanel(); }
});
senseInput.addEventListener('blur',()=>{
  /* 비어 있는 칸은 조용히 접습니다. 적다 만 글자는 남겨 둡니다 — 스크롤하다
     초점을 잃었을 뿐일 수 있으니까요. */
  if(!senseInput.value.trim()){ addingMeaning=false; renderPanel(); }
});
document.querySelectorAll('.stbtn').forEach(b=>b.onclick=()=>{
  setStatus(selKey, +b.dataset.s);
  logDict('star', selKey, { meta:{ status:+b.dataset.s } });
});
document.getElementById('p-mark').onclick=()=>{
  const w=words[selKey]; if(!w) return;
  w.mark = w.mark === false;
  w.up=Date.now(); saveWords(); paintWord(selKey); queueSync(); renderPanel();
};

/* 고정 표현은 낱말 하나와 뜻이 달라질 수 있습니다. 칩을 누르면 대표 단어를
   바꾸지 않고, 지금 열린 패널에서만 표현 전체를 하나의 표제어로 다시 풉니다. */
async function openPhrase(k){
  const base=words[k], text=base&&base.phrase;
  if(!base || !text || (phraseView && phraseView.key===k && phraseView.loading)) return;
  const view={key:k, phrase:text, sentence:base.example||'', book:base.book||'', loading:true};
  phraseView=view; renderPanel();
  try{
    const cacheKey=lookKey('phrase:'+text,view.sentence);
    const hit=await dictGet(cacheKey);
    if(hit && hit.ko){ view.answer=answerFromLook(hit,!hit.seed); adoptPhrase(k,view); return; }
    const j=await dictCall({op:'look',word:text,clicked:text,cands:[text.toLowerCase()],
      sentence:view.sentence,book:view.book});
    if(!j || j.error || !j.ko){ view.error=(j&&j.error)||'error'; return; }
    await dictPut(cacheKey,Object.assign({},j,{done:true}));
    view.answer=answerFromLook(j,false);
    adoptPhrase(k,view);
  }finally{
    view.loading=false;
    if(currentPhrase(k)===view && selKey===k) renderPanel();
  }
}

/* 표현 칩을 고른 것은 "이 낱말 하나"가 아니라 "이 덩어리"를 외우겠다는 선택입니다.
   따라서 flare 카드를 남겨 두지 않고 표현 카드로 바꾸며, 글자 화면도 같은 기준으로
   다시 조립합니다. */
function adoptPhrase(k, view){
  const base=words[k], answer=view.answer, parts=phraseParts(view.phrase);
  if(!base || !answer || parts.length<2) return;
  const id=phraseCardKey(view.phrase), previous=words[id];
  words[id]={
    ...(previous||{}), word:view.phrase, clicked:view.phrase, forms:parts, phraseParts:parts,
    example:view.sentence||base.example, book:view.book||base.book, status:previous?previous.status:base.status,
    mark:previous?previous.mark:base.mark, ko:answer.ko, ai:answer.ai||{}, alts:answer.alts||[], phrase:'',
    defs:[], kodict:[], addedAt:previous?previous.addedAt:Date.now(), up:Date.now()
  };
  if(id!==k){ delete words[k]; dead[k]=Date.now(); }
  contextView=null; phraseView=null; selKey=id;
  saveWords(); save(LS_DEAD,dead); queueSync();
  if(curBook && currentReaderMode==='text'){
    const anchor=captureAnchor();
    renderBookBody(curBook);
    requestAnimationFrame(()=>{ if(anchor) restoreAnchor(anchor); });
  }
  paintWord(id); renderPanel(); announcePhraseSaved(view.phrase);
}
/* 표현의 색칠은 원문의 낱말이 저장한 순서 그대로 붙어 있을 때만 앉습니다.
   `takes care of` · `taken care of` 같은 변형은 잡지만, `take good care of`
   처럼 사이에 낱말이 끼거나 원본(PDF·EPUB) 모드에서는 안 칠해집니다.
   여기를 더 똑똑하게 만드는 값보다, 처음 한 번 그렇다고 말해 두는 값이
   큽니다 — 표현의 핵심은 발견하고 뜻을 알고 저장하는 것이지 색칠이 아닙니다. */
const LS_PHRASE_HINT='breeze.phraseHint';
function announcePhraseSaved(text){
  let seen=false;
  try{ seen=localStorage.getItem(LS_PHRASE_HINT)==='1'; }catch(e){}
  if(seen){ toast(`“${text}”을(를) 표현으로 저장했어요`); return; }
  try{ localStorage.setItem(LS_PHRASE_HINT,'1'); }catch(e){}
  toast('표현을 저장했어요 · 문장 모양에 따라 본문에서 색칠되지 않을 수 있어요');
}
document.getElementById('p-context').onclick=()=>{ if(selKey) askCurrentContext(selKey); };
document.getElementById('p-know').onclick = ()=>{
  if(!selKey) return;
  const k = selKey;
  logDict('known', k);
  const root=words[k]&&words[k].root;
  /* 대표 단어를 빼면 그 아래의 문맥 카드도 함께 빼야 유령 카드가 남지 않습니다.
     반대로 take의 두 번째 뜻 카드만 빼는 경우에는 그 카드 하나만 지웁니다. */
  if(!root){
    Object.keys(words).filter(id=>words[id]&&words[id].root===k).forEach(id=>delete words[id]);
  }
  delete words[k]; dead[k] = Date.now(); save(LS_DEAD, dead);
  saveWords(); paintWord(k); closePanel(); queueSync(); toast('단어장에서 뺐어요');
};
function refreshReaderWords(){
  if(curBook && currentReaderMode==='text'){
    const anchor=captureAnchor();
    renderBookBody(curBook);
    requestAnimationFrame(()=>{ if(anchor) restoreAnchor(anchor); });
  }else if(typeof refreshOriginalSavedWords==='function') refreshOriginalSavedWords();
}
/* 표제어를 손으로 고치는 칸은 없습니다. 화면의 낱말은 원문 색칠·캐시·동기화가
   모두 기대는 열쇠에서 나온 글자라, 그 자리에서 글자만 바꾸면 화면과 열쇠가
   갈라집니다(고친 이름으로는 본문이 안 칠해지고, 캐시도 옛 이름으로 남습니다).
   잘못 잡힌 표제어는 "단어장에서 빼기" 뒤에 원하는 낱말을 다시 누르면 됩니다. */

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
  let r = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(form));
  /* 이 공개 사전은 가끔 첫 요청에 502를 돌려줍니다. IPA가 사라지면 사전창이
     반쯤 비어 보이므로, 한 번만 짧게 다시 물어봅니다. */
  if(!r.ok && r.status>=500){ await new Promise(resolve=>setTimeout(resolve,300)); r=await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(form)); }
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
const LS_AI_LEFT='breeze.ai-left';
/* 하루는 한국 날짜로 셉니다. 서버의 한도가 그렇게 돌아가므로 화면도 같은
   날짜를 봐야 "자정에 다시 채워집니다"가 거짓말이 되지 않습니다. */
function aiDay(){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'})
    .formatToParts(new Date());
  const at=type=>(parts.find(part=>part.type===type)||{value:''}).value;
  return `${at('year')}-${at('month')}-${at('day')}`;
}
function rememberAiLeft(left){
  if(typeof left!=='number') return;
  if(sbUser) save(LS_AI_LEFT,{day:aiDay(),left}); else anonLooksLeft=left;
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
/* 운영 기록으로 나가는 것은 **표제어 하나와 무슨 손짓이었나** 뿐입니다.
   읽던 문장·책 제목·AI 가 준 뜻·내가 적은 뜻은 보내지 않습니다 — 서버가
   답하고 싶은 질문("어떤 낱말에서 뜻 추천이 자주 빗나가나")은 표제어만으로
   전부 답해지고, 나머지는 얻는 것 없이 사람의 읽기 기록만 밖으로 내보냅니다.
   그래서 여기서 아예 만들지 않습니다. 서버가 버려 주기를 믿지 않습니다. */
function logDict(action, k, extra){
  const w = words[k]; if(!w || !sb || !sbUser) return;
  dictCall(Object.assign({
    op:'log', action,
    lemma: w.aiLemma || w.word || '',
    pos: (w.ai && w.ai.pos) || ''
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

/* 이미 저장한 낱말을 다른 문장에서 만났을 때의 문입니다. 답이 오면 그것으로 끝나지
   않고 곧바로 Meaning 이 하나 생깁니다 — 저장할지 묻지 않고, 기존 뜻도 지우지
   않습니다. 예전 뜻으로 돌아가고 싶으면 칩을 한 번 누르면 됩니다. */
async function askCurrentContext(k){
  const w=words[k], context=currentContext(k);
  if(!w || !context || context.loading) return;
  if(navigator.onLine===false){ context.error='offline'; renderPanel(); return; }
  if(!sb){ context.error='login'; renderPanel(); return; }
  context.loading=true; delete context.error; renderPanel();
  try{
    for(const key of entryKeys(w)){
      const hit=await dictGet(lookKey(key,context.sentence));
      if(hit && hit.ko){ adoptContextAnswer(k,context,answerFromLook(hit,!hit.seed)); return; }
    }
    const j=await dictCall({op:'look',word:w.word||k,clicked:context.clicked||'',cands:entryKeys(w),
      sentence:context.sentence,book:context.book||'',device:sbUser?'':deviceId()});
    if(!j || j.error || !j.ko){
      context.error=(j&&j.error)==='anon_exhausted' ? 'trial' : (j&&j.error)||'error';
      return;
    }
    if(typeof j.left==='number') rememberAiLeft(j.left);
    await dictPut(lookKey(j.lemma||w.word||k,context.sentence),Object.assign({},j,{done:true}));
    adoptContextAnswer(k,context,answerFromLook(j,false));
  }finally{
    context.loading=false;
    if(currentContext(k)===context && selKey===k) renderPanel();
  }
}

/* AI 문맥 분석 → Meaning 생성 → saved → active. 특별한 상태를 만들지 않습니다. */
function adoptContextAnswer(k, context, answer){
  const w=words[k]; if(!w || !answer || !answer.ko) return;
  const root=w.root||k;
  const id=createMeaning(root, answer.ko, {clicked:context.clicked||'', example:context.sentence,
    book:context.book||'', ai:answer.ai, alts:answer.alts, phrase:answer.phrase});
  if(!id) return;
  context.loading=false; contextView=null;
  paintWord(root); selectWord(id,null);
}

/* 낱말 하나 · 문장 하나 · 왕복 한 번. 뜻과 이 문장에서의 설명과 다른 뜻 후보가
   같이 옵니다. 예전에는 entry(700토큰) → pick → explain 로 세 번 다녀왔습니다. */
async function fetchLook(k, opt){
  const w = words[k]; if(!w) return false;
  opt = opt || {};
  const querySentence=opt.sentence || w.example || '';
  /* `hold` 는 답을 카드에 바르지 않고 그대로 돌려 달라는 뜻입니다. 넓은 문맥으로
     다시 물어본 답은 지금 뜻을 덮는 것이 아니라 새 뜻이 되기 때문입니다. */
  if(navigator.onLine === false){ w.aiOff = 'offline'; if(selKey===k) renderPanel(); return false; }
  /* 서버 주소조차 없으면(config 미설정) 할 수 있는 일이 없습니다. 로그인 여부는
     더 이상 여기서 막지 않습니다 — 맛보기 횟수는 서버가 셉니다. */
  if(!sb){ w.aiOff = 'login'; if(selKey===k) renderPanel(); return false; }

  const began = Date.now();
  abortLook();
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  lookCtrl = ctrl;
  w.aiLoading = true;
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
      sentence: querySentence, book: w.book || '',
      retry: !!opt.wider, avoid: opt.wider ? (opt.avoid || []) : [],
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
    if(typeof j.left === 'number') rememberAiLeft(j.left);
    await dictPut(lookKey(j.lemma || w.word || k, querySentence), Object.assign({}, j, { done:true }));
    /* 갓 받은 답은 최소 0.28초는 바람을 보여 준 뒤에 놓습니다. 답이 너무 빨리 오면
       화면이 튄 것처럼 느껴져서, 무슨 일이 일어났는지 못 알아챕니다.
       기기에 이미 있던 답은 그냥 띄웁니다 — 기다린 척할 이유가 없습니다. */
    const left = AI_MIN_WAIT - (Date.now() - began);
    if(left > 0) await new Promise(res=>setTimeout(res, left));
    if(opt.hold) return j;
    applyLook(w, j, k, opt);
    return true;
  }finally{
    clearTimeout(slow);
    if(lookCtrl === ctrl) lookCtrl = null;
    delete w.aiLoading;
    if(selKey===k) renderPanel();
  }
}

function applyLook(w, j, k, opt){
  opt = opt || {};
  delete w.aiLoading; delete w.aiOff;
  w.ai = { ko: j.ko || '', pos: j.pos || '', note: j.note || j.gloss || '', done:true,
           /* 이 기기가 전에 물어봤던 답인지. 머리글 한 줄이 달라집니다 —
              한도를 쓰지 않았다는 것을 그 자리에서 알 수 있게. */
           cached: !!opt.cached };
  w.aiLemma = j.lemma || w.aiLemma || '';
  w.alts = Array.isArray(j.alts) ? j.alts : [];
  w.colloc = [];
  w.phrase = j.phrase || '';
  /* 사람이 직접 적은 뜻은 AI 가 덮지 않습니다. 바꾸고 싶으면 사람이 × 로 지우고
     ＋ 로 다시 적습니다 — 저장한 것을 AI 가 말없이 갈아 끼우는 일은 없습니다. */
  if(!w.koEdited) w.ko = j.ko || w.ko;
  if(j.lemma && !isAcro(w.word) && /^[A-Za-z][A-Za-z'’-]*$/.test(j.lemma)) w.word = j.lemma.toLowerCase();
  w.up = Date.now();
  saveWords(); queueSync();
  if(selKey===k) renderPanel();
}

/* "이 뜻이 아닌 것 같다" — 이미 보여 준 뜻을 빼고, 앞뒤 문장까지 붙여 다시 묻습니다.
   AI 가 틀렸다는 가장 강한 신호라서 서버에도 retry 로 기록됩니다. 돌아온 답은
   지금 뜻을 덮지 않고 새 Meaning 이 됩니다. */
async function askWiderContext(k){
  const w=words[k]; if(!w || w.aiLoading) return;
  const root=w.root||k;
  const sentence=expandedContextFor(w, w.example||'');
  /* 이미 저장해 둔 뜻은 빼고 물어봅니다. 같은 답을 한 번 더 받고 한도만 쓰는 일이
     없도록, 그리고 "다른 뜻"을 달라는 뜻이 서버에도 그대로 전해지도록. */
  const avoid=meaningCards(root,null).map(([,item])=>item.ko).filter(Boolean).slice(0,4);
  const answer=await fetchLook(k, {sentence, wider:true, hold:true, avoid});
  if(!answer || !answer.ko) return;
  const id=createMeaning(root, answer.ko, {clicked:w.clicked, example:w.example, book:w.book,
    ai:answerFromLook(answer,false).ai, alts:answer.alts, phrase:answer.phrase});
  if(!id) return;
  paintWord(root); selectWord(id,null);
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
document.getElementById('p-airetry').onclick = ()=>{ if(selKey && words[selKey]) askWiderContext(selKey); };

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
  const grouped=new Map();
  list.forEach(([k,w])=>{
    const groupKey=w.root||k;
    if(!grouped.has(groupKey)) grouped.set(groupKey,[]);
    grouped.get(groupKey).push([k,w]);
  });
  const groups=[...grouped.values()].filter(entries=>entries.some(([,w])=>!q || w.word.toLowerCase().includes(q)
    || (w.ko||'').includes(q) || (w.book||'').toLowerCase().includes(q)));
  document.getElementById('vcnt').textContent = `${list.length}개 저장됨`;
  const wrap = document.getElementById('vtablewrap');
  if(!groups.length){ wrap.innerHTML = '<div id="vempty">아직 저장된 단어가 없어요.<br>책을 읽다가 모르는 단어를 눌러 보세요!</div>'; return; }
  const stName = {1:'★',2:'★★',3:'★★★'};
  wrap.innerHTML = `<table><thead><tr>
    <th>단어</th><th>뜻</th><th>예문 · 출처</th><th>모르는 정도</th><th>저장일</th><th></th>
  </tr></thead><tbody>` + groups.map(entries=>{
    /* 대표 뜻을 먼저 두되, 같은 표제어의 문맥 카드들은 하나의 word cell 아래로
       묶습니다. 학습 데이터는 분리된 채라 별·삭제·예문은 각각 독립입니다. */
    entries.sort((a,b)=>(a[0]===((a[1].root)||a[0])?-1:0)-(b[0]===((b[1].root)||b[0])?-1:0)
      || (b[1].addedAt||0)-(a[1].addedAt||0));
    const [firstKey,first]=entries[0], span=entries.length;
    return entries.map(([k,w],index)=>`
      <tr class="vocab-sense${index===0?' group-start':''}" data-k="${esc(k)}">
        ${index===0?`<td class="c-word" rowspan="${span}">${esc(first.word)}${span>1?`<span class="c-sense-count">뜻 ${span}</span>`:''}</td>`:''}
        <td class="c-mean" contenteditable="true" spellcheck="false">${esc(w.ko||'')}</td>
        <td class="c-ex">${esc(w.example||'')}${w.book?`<span class="src">📖 ${esc(w.book)}</span>`:''}</td>
        <td><span class="chip s${w.status}" title="클릭해서 변경">${stName[w.status]}</span></td>
        <td style="color:var(--soft2);font-size:12px;white-space:nowrap">${new Date(w.addedAt).toLocaleDateString('ko-KR')}</td>
        <td><button class="rowdel" title="이 뜻만 삭제">✕</button></td>
      </tr>`).join('');
  }).join('') + '</tbody></table>';
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
