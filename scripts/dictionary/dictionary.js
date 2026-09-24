/* ================= shared lexical core ================= */
const { lemma, lemmaCands, isAcro } = globalThis.BreezeLexical || {};
if (!lemma || !lemmaCands || !isAcro) throw new Error('BreezeLexical core failed to load');

function sentenceOf(span){
  if(span && span.dataset && span.dataset.example) return span.dataset.example;
  /* 글자판에서는 누른 **자리**가 문장을 정합니다. 아래의 글자로 찾는 길은 한
     문단에 같은 낱말이 두 번 나오면 늘 앞의 것을 집었습니다 — 꾹 눌러 문장을
     물어볼 때 옆 문장이 뜨던 까닭이 그것이었고, 낱말 카드에 적히는 예문도
     같은 자리에서 어긋났습니다(scripts/reader/reader.js 의 `textSentencePartAt`). */
  const spot = typeof textSentencePartAt === 'function' ? textSentencePartAt(span) : null;
  if(spot && spot.sentence) return spot.sentence;
  const paragraph = span && span.closest ? span.closest('[data-pi]') : null;
  const paraText = paragraph ? (curBook.paras[+paragraph.dataset.pi]||'') : '';
  const sents = paraText.match(/[^.!?…]+[.!?…]*/g) || [paraText];
  const re = new RegExp('\\b'+span.textContent.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i');
  return (sents.find(s=>re.test(s)) || sents[0]).trim();
}
const LOOKUP_TOKEN_RE=/[A-Za-z](?:[A-Za-z'’\-]*[A-Za-z])?/g;
function lookupSentenceTokens(sentence){
  const tokens=[];let match;LOOKUP_TOKEN_RE.lastIndex=0;
  while((match=LOOKUP_TOKEN_RE.exec(String(sentence||'')))) tokens.push({text:match[0],start:match.index,end:match.index+match[0].length});
  return tokens;
}
function lookupClickedTokenIndex(span,sentence,tokens){
  const hint=span&&span.dataset&&span.dataset.clickedTokenIndex;
  const hinted=hint===undefined||hint===null?NaN:Number(hint);
  if(Number.isInteger(hinted)&&hinted>=0&&hinted<tokens.length)return hinted;
  const spot=typeof textSentencePartAt==='function'?textSentencePartAt(span):null;
  if(spot&&Number.isInteger(spot.tokenIndex)&&spot.tokenIndex>=0&&spot.tokenIndex<tokens.length)return spot.tokenIndex;
  const raw=String((span&&span.textContent)||'').replace(/’/g,"'").toLowerCase();
  const matches=tokens.map((token,index)=>({token,index})).filter(item=>item.token.text.replace(/’/g,"'").toLowerCase()===raw);
  return matches.length===1?matches[0].index:-1;
}
function lexicalIdentityFromMembers(tokens,indexes,canonical){
  const ordered=[...new Set(indexes)].sort((a,b)=>a-b);
  const parts=ordered.map(index=>lemmaCands(tokens[index].text)[0]||tokens[index].text.toLowerCase());
  const gaps=ordered.slice(1).map((index,at)=>Math.max(0,index-ordered[at]-1));
  const surface=ordered.map((index,at)=>`${at&&gaps[at-1]>0?' … ':at?' ':''}${tokens[index].text}`).join('');
  return {parts,gaps,surface,canonical:String(canonical||'').replace(/\s+/g,' ').trim(),indexes:ordered};
}
/* 한 문장만으로는 뜻이 안 잡히는 자리가 있습니다. 새 AI 조회와 Retry에는
   앞뒤 문장을 붙이되, 선택 문장과 클릭 위치는 그대로 둡니다. */
function lookupRequestFor(w,node,wider){
  const context=currentContext(selKey);
  const sentence=(context&&context.sentence)||(node?sentenceOf(node):'')||w.example||'';
  const tokens=lookupSentenceTokens(sentence);
  let clickedIndex=context&&Number.isInteger(context.clickedIndex)?context.clickedIndex:lookupClickedTokenIndex(node,sentence,tokens);
  if(clickedIndex<0){
    const raw=String(w.clicked||w.word||'').replace(/’/g,"'").toLowerCase();
    const matches=tokens.flatMap((t,i)=>t.text.replace(/’/g,"'").toLowerCase()===raw?[i]:[]);
    if(matches.length===1)clickedIndex=matches[0];
  }
  let before='',after='';
  if(wider){
    const spot=typeof textSentencePartAt==='function'?textSentencePartAt(node):null;
    const partsOf=text=>typeof bridgeSentences==='function'?bridgeSentences(text):[];
    if(spot){
      const parts=partsOf(spot.block.textContent),at=parts.findIndex(p=>p.start===spot.part.start);
      const pi=Number(spot.block.dataset.pi),paras=curBook&&curBook.paras||[];
      before=at>0?parts[at-1].text:(partsOf(paras[pi-1]||'').slice(-1)[0]||{}).text||'';
      after=at>=0&&at<parts.length-1?parts[at+1].text:(partsOf(paras[pi+1]||'')[0]||{}).text||'';
    }else if(node&&node.dataset){before=node.dataset.contextBefore||'';after=node.dataset.contextAfter||'';}
    if(!before&&!after&&curBook&&Array.isArray(curBook.paras)){
      const matches=curBook.paras.flatMap((p,i)=>String(p).includes(sentence)?[i]:[]);
      if(matches.length===1){
        const pi=matches[0],parts=partsOf(curBook.paras[pi]),at=parts.findIndex(p=>p.text===sentence);
        before=at>0?parts[at-1].text:(partsOf(curBook.paras[pi-1]||'').slice(-1)[0]||{}).text||'';
        after=at>=0&&at<parts.length-1?parts[at+1].text:(partsOf(curBook.paras[pi+1]||'')[0]||{}).text||'';
      }
    }
  }
  // Crop around the selected occurrence, never from the start of the preceding paragraph.
  let target=sentence,index=clickedIndex;
  if((target.length>2400||tokens.length>400)&&tokens[index]){
    const center=tokens[index],first=Math.max(index-150,tokens.findIndex(t=>t.start>=Math.max(0,center.start-1000)));
    let last=Math.min(tokens.length-1,index+150);while(last>index&&tokens[last].end>center.end+1000)last--;
    target=sentence.slice(tokens[first].start,tokens[last].end);index-=first;
  }
  return {sentence:target,clicked:tokens[clickedIndex]?tokens[clickedIndex].text:w.clicked||w.word,
    clickedIndex:index,before:before.slice(-400),after:after.slice(0,400),book:(context&&context.book)||(curBook&&curBook.title)||w.book||''};
}
function homewardWordFor(w,node,input){
  if(!node||!curBook||curBook.longReadId!=='backroom-homeward-bound'
    ||typeof homewardWordAnswer!=='function')return null;
  return homewardWordAnswer(input||lookupRequestFor(w,node,false),node);
}

function readerWordNodes(selector){
  const nodes=[...document.querySelectorAll(selector)];
  /* 숨겨 둔 original session 은 다음 mode switch 를 위한 보관물이지 Text interaction
     의 surface 가 아닙니다. Text 에서 단어 하나를 만질 때 EPUB spine 비용을 내지
     않습니다. */
  if(currentReaderMode==='original' && originalSession && originalSession.frames){
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
  const buried = dead[k] || 0;
  words[k] = { word:display, clicked:raw, forms, ko:'', phon:'', defs:[],
    example:sentenceOf(span), book:curBook.title, status:1, mark:true,
    addedAt:Date.now(), up:Math.max(Date.now(),buried+1) };
  recentWordOpens.set(k, Date.now());
  /* 먼저 필을 그립니다. 저장·색칠·네트워크는 첫 paint 다음 프레임으로 미뤄
     탭한 손가락에 보이는 반응이 다른 모든 일보다 앞서게 합니다. */
  selectWord(k, span, true);
  markPendingWord(k, buried);
  const life=wordLookupLife;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(!wordLookupAlive(life)||!words[k]) return;
    requestDurableLocalStorage();
    delete dead[k]; save(LS_DEAD, dead);
    saveWords(); paintWord(k);
    fetchDict(k,span);
  }));
}
/* ---- 뜻이 확정된 낱말 ----
   낱말을 확정시키는 길은 둘뿐입니다.

     ① AI 가 지금 문장의 대표 뜻을 답했다      `applyLook`
     ② 사람이 뜻을 채택했다                    `createMeaning`
                                               (추천 뜻 클릭 · ＋ 직접 입력)

   둘 다 `ko` 를 남깁니다. 그래서 확정 여부를 묻는 자리는 여기 하나면 됩니다.
   묻는 것은 "AI 가 답했나" 가 아니라 **"쓸 뜻 하나가 정해졌나"** 입니다 — 그래서
   AI 가 한도에 걸리든 실패하든, 사람이 고른 뜻은 그대로 확정입니다.

   한국어 뜻은 저장된 Meaning 또는 문맥 AI 답만 채웁니다. */
function hasResolvedMeaning(word){
  if(!word) return false;
  return !!(String(word.ko||'').trim() || String((word.ai&&word.ai.ko)||'').trim());
}
/* 뜻이 아직 없을 때 그 자리에 적는 한 줄. 왜 못 정했는지와, 아래에서 고를 수
   있는지를 말합니다. */
/** @param {string} off @returns {string} */
function meaningWaitLine(off){
  /* 연결이 없다는 것만 말합니다. "문맥 뜻"이 무엇인지, 어디서 못 받았는지는
     안에서 벌어진 일이지 읽는 사람이 알 바가 아닙니다. */
  if(off === 'offline'){
    return '오프라인이라 뜻을 찾을 수 없어요';
  }
  const why =
      off === 'quota'   ? '오늘의 문맥 뜻 사용량을 모두 썼어요'
    : off === 'trial'   ? '무료 체험을 다 썼어요'
    : off === 'login'   ? ''
    : off === 'error'   ? '문맥 뜻을 받지 못했어요'
    :                     '아직 뜻이 정해지지 않았어요';
  return why;
}
/* ---- 이번 조회에서 처음 만들어진 낱말 ----
   낱말을 누르는 그 순간 단어장에 자리가 하나 생기고, 뜻은 그 뒤에 옵니다. 그래서
   AI 를 기다리는 동안 창을 닫으면 뜻이 하나도 없는 낱말이 남았습니다. 한도가
   떨어졌을 때도, 요청이 실패했을 때도 같은 껍데기가 남습니다 — 실사용에서 제일
   자주 만나는 쓰레기입니다.

   규칙은 하나입니다: **새 조회는 창이 살아 있는 동안에만 낱말이 될 수 있습니다.**
   확정되지 않은 채로 창이 끝나면 그 조회는 그 자리에서 없던 일입니다.

   그래서 이 표는 **창이 열려 있는 동안만** 삽니다. 닫힌 뒤에도 남아 답을 기다리는
   자리는 없습니다 — 늦게 온 답이 낱말을 되살리는 길을 아예 만들지 않기 위해서,
   그리고 동기화가 신경 쓸 것이 애초에 안 생기게 하기 위해서입니다. 지우는 것은
   이 조회가 만든 것뿐이라, 전에 저장해 둔 낱말은 여기 적히지도 않습니다
   (`addWord` 만 적습니다). */
let pendingWord = null;
/* The first contextual answer is replaceable during its lookup opening. */
let firstLookupMeaning = null;
function markPendingWord(k, buried){ pendingWord = { key:k, deadAt:buried || 0 }; }
/* 대표 카드가 확정됐거나, 이 낱말에 딸린 뜻 카드가 하나라도 확정됐으면 확정입니다
   — ＋ 로 적은 두 번째 뜻부터는 딸린 카드가 되기 때문입니다. */
function pendingWordResolved(key){
  const w = words[key];
  if(!w) return true;
  if(hasResolvedMeaning(w)) return true;
  return Object.values(words).some(item=>item && item.root===key && hasResolvedMeaning(item));
}
/* 확정되는 순간 이 낱말은 더 이상 "이번 조회가 만든 껍데기"가 아닙니다. 표를
   그때 떼지 않으면, 뜻을 받은 뒤에 사람이 그 뜻을 × 로 지웠을 때 낱말까지 함께
   사라집니다 — 그것은 이 규칙이 볼 일이 아니라 단어장을 손보는 일이고,
   `deleteMeaning` 은 빈 뜻자리를 남기기로 되어 있습니다.
   화면을 다시 그리는 자리에서 봅니다. 사람이 뜻을 만질 수 있으려면 그 뜻이 먼저
   화면에 그려져야 하므로, 여기를 지나지 않고 지워지는 뜻은 없습니다. */
function settlePendingWord(){
  if(pendingWord && pendingWordResolved(pendingWord.key)) pendingWord = null;
}
function discardPendingWord(){
  const held = pendingWord;
  pendingWord = null;
  if(!held || pendingWordResolved(held.key)) return;
  delete words[held.key];
  /* 지웠던 낱말을 다시 눌렀다가 그냥 닫은 것이라면, `addWord` 가 떼어 낸 부고를
     그 시각 그대로 도로 붙입니다. 새 부고를 쓰는 것이 아니라 `addWord` 가 한 일을
     되돌리는 것이라, 이 조회 전후의 저장소가 한 글자도 다르지 않게 됩니다. */
  if(held.deadAt){ dead[held.key]=held.deadAt; save(LS_DEAD, dead); }
  saveWords();
  paintWord(held.key);
}
/* 같은 낱말을 눌러 사전 창을 막 닫았다 다시 여는 것은 "더 모른다"가 아니라
   화면을 다시 확인하는 일입니다. 별은 읽는 동안 쌓이는 소음이 아니라, 시간을
   두고 다시 막혔을 때만 하나 올립니다. 이 기록은 동기화할 학습 데이터가 아니라
   잠깐의 손짓이므로 기기 메모리에만 둡니다. */
const RECENT_WORD_OPEN_MS = 30000;
const recentWordOpens = new Map();
function deferWordOpenState(id,bump){
  const item=words[id];
  requestAnimationFrame(()=>{
    if(!item||words[id]!==item)return;
    const changed=bump&&item.status<3;
    if(item.ko)touchMeaning(id);
    if(changed){item.status++;item.up=Date.now();}
    // Pick order and the automatic star bump belong to the same opening.
    saveWords(id);
    if(changed){
      paintWord(item.root||id);queueSync();
      if(selKey===id)renderWordLookup();
    }
  });
}
/* 다른 문장에서 이미 저장한 낱말을 만났을 때의 임시 화면 상태입니다. 저장한 뜻을
   저장된 뜻은 즉시 보여 주고, 새 뜻이 필요할 때만 사용자가 다시 찾기를 선택합니다. 읽는 중의
   문장은 저장 카드에 덮어 쓰지 않습니다. 새 뜻이 필요하면 그 순간 Meaning 이 하나
   생깁니다 — 미리보기 상태도, 저장 여부를 묻는 단계도 없습니다. */
let contextView = null;
/* ＋ 로 뜻을 직접 적는 동안만 켜지는 칸입니다. */
let addingMeaning = false;
function currentContext(k){ return contextView && contextView.key === k ? contextView : null; }
function answerFromLook(j, cached){
  const oldAi=j.ai||{};
  return { ko:j.ko||oldAi.ko||'', ai:{ko:j.ko||oldAi.ko||'',pos:j.pos||oldAi.pos||'',
      done:true,cached:!!cached},
    alts:Array.isArray(j.alts)?j.alts:[], aiLemma:j.lemma||'' };
}
function contextCardKey(root, sentence){ return `${root}::${sentenceHash(sentence)}`; }
function senseCardKey(root, meaning){ return `${root}::sense:${sentenceHash(meaning)}`; }
function phraseCardKey(canonical){return 'phrase:'+String(canonical||'').trim().replace(/\s+/g,' ').toLowerCase();}
function meaningKey(meaning){ return String(meaning||'').trim().replace(/\s+/g,' ').toLowerCase(); }
function findContextCard(root, sentence){
  const id=contextCardKey(root,sentence);
  return words[id] ? id : null;
}
function rememberSenseContext(id, sentence, clickedIndex=-1){
  const item=words[id],hash='v2:'+sentenceHash(sentence)+':'+clickedIndex;
  if(!item||!hash)return;
  const prior=Array.isArray(item.contextHashes)?item.contextHashes.filter(value=>typeof value==='string'&&value&&value!==hash):[];
  item.contextHashes=[hash,...prior].slice(0,32);
}
function findSavedSense(root,sentence,clickedIndex=-1){
  const hash='v2:'+sentenceHash(sentence)+':'+clickedIndex;
  const candidates=Object.entries(words).filter(([id,item])=>item&&(id===root||item.root===root)&&validWordMeaning(item));
  const exact=candidates.find(([,item])=>Array.isArray(item.contextHashes)&&item.contextHashes.includes(hash));
  if(exact)return exact[0];
  const legacy=candidates.find(([,item])=>item.example===sentence&&lookupSentenceTokens(sentence)
    .filter(t=>t.text.toLowerCase()===String(item.clicked||item.word).toLowerCase()).length===1);
  return legacy?legacy[0]:null;
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
  const cards=savedMeaningRecords(root).filter(([id,item])=>id===root || !item.phraseParts);
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
   다른 문장에서 NEW로 판정된 AI 답도 모두 이 문을 지납니다. 만들면 곧바로 저장이고
   곧바로 지금 뜻입니다. 물어보는 단계는 없습니다. */
function createMeaning(root, text, source){
  const meaning=String(text||'').replace(/\s+/g,' ').trim();
  const base=words[root]; if(!meaning || !base) return '';
  const from=source||{};
  const already=findSenseByMeaning(root,meaning);
  if(already){touchMeaning(already);dropSuggestion(root,meaning);saveWords();queueSync();return already;}
  const buriedMeaning=dead[senseCardKey(root,meaning)]||0;
  if(from.automatic&&buriedMeaning)return '';
  if(buriedMeaning&&!from.automatic){delete dead[senseCardKey(root,meaning)];save(LS_DEAD,dead);}
  const ai={...(from.ai||{}),ko:meaning};
  /* 아직 뜻이 하나도 없는 낱말이면 대표 카드의 빈 뜻자리를 채웁니다. 빈 카드를
     남겨 두고 옆에 새 카드를 만들면, 화면에 없는 뜻이 저장소에만 생깁니다. */
  if(!String(base.ko||'').trim()){
    base.ko=meaning; base.ai=ai; delete base.koEdited;
    /* 한도·오프라인·오류로 못 정했던 자국입니다. 뜻이 정해진 낱말에 남겨 두면
       다음에 열었을 때 정해진 뜻 옆에 "못 가져왔어요"가 함께 뜹니다. */
    delete base.aiOff; delete base.aiSlow;
    if(from.example) base.example=from.example;
    if(from.book) base.book=from.book;
    base.pickedAt=Date.now(); base.up=Math.max(Date.now(),(base.up||0)+1,buriedMeaning+1);
    dropSuggestion(root,meaning); saveWords(); queueSync(); return root;
  }
  /* 뜻 카드의 주소는 뜻 글자에서 나옵니다. 그래서 지웠던 뜻을 똑같이 다시 적으면
     주소도 똑같고, 그 주소에는 "지웠다"는 표(`dead`)가 아직 붙어 있습니다. 표를
     떼지 않으면 이 기기는 살아 있는 카드와 그 카드의 부고를 함께 올려 보냅니다 —
     두 시각이 같은 순간에 찍히면 합칠 때 부고가 이깁니다. 만드는 순간 뗍니다
     (낱말을 다시 넣을 때 `addWord` 가 하는 일과 같습니다). */
  const id=senseCardKey(root,meaning), previous=words[id];
  const buried=Math.max(dead[id]||0,buriedMeaning);
  if(dead[id]){ delete dead[id]; save(LS_DEAD,dead); }
  words[id]={...(previous||{}), word:base.word, root, sense:true,
    clicked:from.clicked||base.clicked||base.word, forms:base.forms||[base.word],
    example:from.example||base.example||'', book:from.book||base.book||'',
    status:previous?previous.status:(base.status||1), mark:previous?previous.mark:base.mark!==false,
    ko:meaning, ai, alts:Array.isArray(from.alts)?from.alts:[],
    defs:[], addedAt:previous?previous.addedAt:Date.now(),
    pickedAt:Date.now(), up:Math.max(Date.now(),buried+1)};
  dropSuggestion(root,meaning); saveWords(); queueSync();
  return id;
}
/* Keep one replaceable retry slot. During a new word's first lookup, update its
   initial AI answer in place. For an established word, preserve the old meaning
   and replace only the previous retry result. */
function saveRetriedMeaning(root, text, source){
  const meaning=String(text||'').replace(/\s+/g,' ').trim(),base=words[root];
  if(!meaning||!base)return '';
  const from=source||{},ai={...(from.ai||{}),ko:meaning};
  if(firstLookupMeaning&&firstLookupMeaning.root===root&&firstLookupMeaning.life===wordLookupLife&&!base.koEdited){
    base.ko=meaning;base.ai=ai;delete base.koEdited;
    base.alts=Array.isArray(from.alts)?from.alts:[];
    if(from.example)base.example=from.example;
    if(from.book)base.book=from.book;
    base.up=Date.now();base.pickedAt=base.up;
    saveWords();queueSync();return root;
  }
  const retry=Object.entries(words).find(([id,item])=>id!==root&&item&&item.retryCandidate
    &&(item.retryOwner||item.root)===root);
  const existing=findSenseByMeaning(root,meaning);
  if(existing){
    if(retry&&retry[0]!==existing)discardRetryCandidate(retry[0]);
    const item=words[existing];
    if(item){if(!retry||retry[0]!==existing)delete item.retryCandidate;touchMeaning(existing);}
    saveWords();queueSync();return existing;
  }
  if(retry&&meaningKey(words[retry[0]].ko)!==meaningKey(meaning))discardRetryCandidate(retry[0]);
  const id=createMeaning(root,meaning,{...from,ai});
  if(id&&id!==root){words[id].retryCandidate=true;saveWords();queueSync();}
  return id;
}
function discardRetryCandidate(id){
  const item=words[id];if(!item||!item.retryCandidate)return;
  const root=item.retryOwner||item.root||id;
  const key=item.root?senseCardKey(root,item.ko):id;
  dead[key]=Math.max(Date.now(),(item.up||item.addedAt||0)+1,(dead[key]||0)+1);
  delete words[id];save(LS_DEAD,dead);saveWords();queueSync();
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
   다른 뜻을 지우면 보고 있던 뜻은 그대로 있습니다. 마지막 뜻을 지우면
   낱말도 지우고 부고를 남겨 다른 기기의 예전 사본이 되살리지 못하게 합니다. */
function deleteMeaning(id){
  const item=words[id]; if(!item) return;
  const panelWasOpen=document.getElementById('panel').classList.contains('on');
  const root=item.root||id;
  dead[senseCardKey(root,item.ko)]=Math.max(Date.now(),(item.up||0)+1);
  save(LS_DEAD,dead);
  const wasActive=id===selKey;
  let next=wasActive ? '' : selKey;
  /* Destructive decisions use every stored meaning, never the filtered/deduped
     presentation cards. */
  const rest=savedMeaningRecords(root).filter(([mid])=>mid!==id);
  rest.sort(([a,aw],[b,bw])=>(a===selKey?-1:0)-(b===selKey?-1:0)
    || meaningPickedAt(bw)-meaningPickedAt(aw));
  const bury=key=>{
    dead[key]=Math.max(Date.now(),(words[key]&&(words[key].up||words[key].addedAt)||0)+1);
    delete words[key]; save(LS_DEAD,dead);
  };
  if(!rest.length){
    Object.keys(words).filter(key=>key===root || (words[key]&&words[key].root===root))
      .forEach(key=>bury(key));
    next='';
  }else if(id===root){
    /* 대표 카드의 주소는 원문 색칠이 기대는 열쇠라 비울 수 없습니다. 다른 뜻 하나를
       그 자리로 올립니다 — 보고 있던 뜻이 따로 있으면 그것을 올려, 칩 하나 지웠을
       뿐인데 화면의 뜻이 바뀌는 일이 없게 합니다. */
    const keep=!wasActive && rest.some(([mid])=>mid===selKey) ? selKey : rest[0][0];
    const promote=words[keep];
    const now=Math.max(Date.now(),item.up||item.addedAt||0,promote.up||promote.addedAt||0)+1;
    words[root]=promotedRootMeaning(item,promote,now);
    words[root].pickedAt=wasActive ? now : (promote.pickedAt||now);
    bury(keep);
    next=root;
  }else{
    bury(id);
    if(wasActive){ const [nextId]=rest[0]; touchMeaning(nextId); next=nextId; }
  }
  if(!next || !words[next]) next=words[root]?root:'';
  addingMeaning=false;
  saveWords(); queueSync(); paintWord(root); refreshReaderWords();
  if(typeof renderVocab==='function' && document.getElementById('v-vocab').classList.contains('on')) renderVocab();
  contextView=null;
  if(panelWasOpen){
    if(next) selectWord(next,null);
    else closePanel();
  }
}

/* 단어를 누르는 규칙은 한 곳에만 둡니다. 처음 누르면 단어장에 넣고, 이미
   저장된 단어를 다시 만났을 때만 별을 하나 올립니다. */
let previewWordCard=null;
function displayedWord(k){ return previewWordCard && previewWordCard.key===k ? previewWordCard : words[k]; }
const wordTapPoints=new WeakMap();
function openWord(k, node, point){
  if(point&&node)wordTapPoints.set(node,point);
  if(typeof onboardingOwnsReader==='function' && onboardingOwnsReader()){ openOnboardingWord(node); return; }
  if(wordPeekSameTarget(k,node)) return;
  if(!words[k]){ addWord(k, node); return; }
  const root=words[k].root||k;
  contextView=null;
  const request=lookupRequestFor(words[k],node,false);
  const savedContext=findSavedSense(root,request.sentence,request.clickedIndex);
  const active=savedContext||((meaningCards(root,null)[0]||[k])[0]);
  const now=Date.now(),seenAt=recentWordOpens.get(root)||0;
  const bump=now-seenAt>=RECENT_WORD_OPEN_MS&&words[active].status<3;
  recentWordOpens.set(root,now);
  const ready=!!String(words[active].ko||(words[active].ai&&words[active].ai.ko)||'').trim();
  contextView=ready
    ? (words[active].example===request.sentence?null:{key:active,...request,loading:''})
    : {key:active,...request,loading:'checking'};
  selectWord(active,node,true,bump);
  if(!ready)resolveCurrentLookup(active,request,wordLookupLife,node);
}
async function resolveCurrentLookup(k,input,life,node){
  const w=words[k];if(!w)return;
  const local=homewardWordFor(w,node,input);
  let answer=local?homewardAnswerAsLook(local):null;
  if(local)await homewardPresentationWait(Date.now(),()=>wordLookupAlive(life));
  else answer=await dictGet(lookKey(w.word,input.sentence,input.clickedIndex));
  if(!wordLookupAlive(life))return;
  if(!answer)answer=await fetchLook(k,{...input,node,hold:true,life});
  if(!wordLookupAlive(life)||!words[k])return;
  const context=currentContext(k);
  if(!answer||!answer.ko){if(context){context.loading='';context.error=w.aiOff||'error';}renderWordLookup();return;}
  const phrase=expressionFromMini(answer,input.sentence,input.clicked,input.clickedIndex);
  if(phrase){saveDetectedExpression(k,phrase,input.sentence,input.book,answer,life,{automatic:true,clickedIndex:input.clickedIndex});return;}
  const id=createMeaning(w.root||k,answer.ko,{...input,example:input.sentence,ai:answerFromLook(answer,false).ai,automatic:true});
  if(id){
    if(id===(w.root||k))firstLookupMeaning={root:w.root||k,life};
    rememberSenseContext(id,input.sentence,input.clickedIndex);selKey=id;
    contextView=words[id].example===input.sentence?null:{key:id,...input,loading:''};
    saveWords();
  }
  else if(context){context.loading='';context.error='deleted';}
  renderWordLookup();
}

/* 한 번의 word opening 이 선택 표시 하나를 소유합니다. 선택을 만든 node 를 이미
   받았는데 닫을 때 다시 책 전체와 모든 EPUB frame 에서 `.sel` 을 찾는 것은
   ownership 을 버렸다가 interaction 순간에 재발견하는 일이었습니다. */
let activeSelectedWordNode=null;
let wordPeekActive=false;
let wordPeekAnchor=null;
let wordPeekRetryState=null;
let wordDetailAnchored=false,wordMorphAnimation=null,wordMorphGeneration=0;
function wordPeekOpen(){ return wordPeekActive; }
function wordSurfaceAnchored(){ return wordPeekActive||wordDetailAnchored; }
function wordLookupOpen(){
  const panel=document.getElementById('panel');
  return wordPeekActive||!!(panel&&panel.classList.contains('on'));
}
function wordPeekNodeRect(node){
  if(!node||!node.getBoundingClientRect) return null;
  const doc=node.ownerDocument,point=wordTapPoints.get(node);
  const fragments=typeof node.getClientRects==='function'?[...node.getClientRects()].filter(r=>r.width&&r.height):[];
  const distance=r=>point?Math.hypot(Math.max(r.left-point.x,0,point.x-r.right),Math.max(r.top-point.y,0,point.y-r.bottom)):0;
  const rect=fragments.length?fragments.reduce((best,r)=>distance(r)<distance(best)?r:best):node.getBoundingClientRect();
  if(!doc||doc===document) return {left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,
    width:rect.width,height:rect.height};
  const frame=doc.defaultView&&doc.defaultView.frameElement;
  if(!frame) return null;
  const outer=frame.getBoundingClientRect();
  const sx=frame.clientWidth?outer.width/frame.clientWidth:1,sy=frame.clientHeight?outer.height/frame.clientHeight:1;
  return {left:outer.left+rect.left*sx,top:outer.top+rect.top*sy,right:outer.left+rect.right*sx,
    bottom:outer.top+rect.bottom*sy,width:rect.width*sx,height:rect.height*sy};
}
function rememberWordPeekAnchor(node){
  const rect=wordPeekNodeRect(node);
  if(!rect) return null;
  wordPeekAnchor={...rect,direction:null};
  return wordPeekAnchor;
}
function wordPeekSameTarget(k,node){
  if(!wordPeekActive||!selKey||!words[selKey]||!wordPeekAnchor) return false;
  const root=words[selKey].root||selKey;
  if(k!==root&&k!==selKey) return false;
  const rect=wordPeekNodeRect(node);
  if(!rect) return node===activeSelectedWordNode;
  return Math.hypot((rect.left+rect.right-wordPeekAnchor.left-wordPeekAnchor.right)/2,
    (rect.top+rect.bottom-wordPeekAnchor.top-wordPeekAnchor.bottom)/2)<6;
}
function wordPeekState(w,context){
  if(context&&context.error)return {text:context.error==='deleted'?'지운 뜻이에요'
    : (context.error==='trial'||context.error==='login')?'로그인하고 뜻 보기':meaningWaitLine(context.error),loading:false};
  if(context&&context.loading)return {text:context.loading==='new'?'새 뜻 찾는 중':context.loading==='repair'?'뜻 다듬는 중':'뜻 확인 중',loading:true};
  if(wordPeekRetryState && wordPeekRetryState.key===selKey){
    if(wordPeekRetryState.loading) return {text:'뜻 다시 찾는 중',loading:true};
    const retryOff=wordPeekRetryState.error||'';
    if(retryOff==='quota') return {text:'오늘 뜻 사용량을 다 썼어요',loading:false};
    if(retryOff==='trial'||retryOff==='login') return {text:'로그인하고 뜻 보기',loading:false};
    if(retryOff==='offline') return {text:'오프라인이에요',loading:false};
    if(retryOff) return {text:'뜻을 찾지 못했어요',loading:false};
  }
  const meaning=String((w&&(w.ko||(w.ai&&w.ai.ko)))||'').trim();
  if(meaning) return {text:meaning,loading:false};
  if(w&&(w.loading||w.aiLoading)&&!w.aiSlow) return {text:'뜻 찾는 중',loading:true};
  const off=navigator.onLine===false?'offline':(w&&w.aiOff)||'';
  if(off==='quota') return {text:'오늘 뜻 사용량을 다 썼어요',loading:false};
  if(off==='trial'||off==='login') return {text:'로그인하고 뜻 보기',loading:false};
  if(off==='offline') return {text:'오프라인이에요',loading:false};
  if(off==='error'||(w&&w.aiSlow)) return {text:'뜻을 찾지 못했어요',loading:false};
  return {text:'뜻 찾는 중',loading:true};
}
function placeWordPeek(){
  const pill=document.getElementById('word-peek');
  if(!pill||pill.hidden||!wordPeekAnchor) return;
  const view=window.visualViewport;
  const vx=view?view.offsetLeft:0,vy=view?view.offsetTop:0;
  const vw=view?view.width:window.innerWidth,vh=view?view.height:window.innerHeight;
  const gap=8,edge=16,box=pill.getBoundingClientRect();
  const chrome=document.getElementById('readchrome').getBoundingClientRect();
  const safeTop=vy+edge+(parseFloat(getComputedStyle(pill).getPropertyValue('--word-safe-top'))||0);
  const safeBottom=Math.min(vy+vh-edge,chrome.height&&chrome.top>safeTop?chrome.top-gap:vy+vh-edge);
  const above=Math.max(0,wordPeekAnchor.top-gap-safeTop);
  const below=Math.max(0,safeBottom-wordPeekAnchor.bottom-gap);
  // Reserve room for the future detail surface, not only today's 44px pill.
  // Freeze the chosen side for the lookup lifetime so async text cannot flip it.
  if(!wordPeekAnchor.direction){
    const detailHeight=Math.min(420,(safeBottom-safeTop)*.7);
    wordPeekAnchor.direction=below>=detailHeight?'below':above>=detailHeight?'above':below>=above?'below':'above';
  }
  let left=(wordPeekAnchor.left+wordPeekAnchor.right-box.width)/2;
  left=Math.max(vx+edge,Math.min(left,vx+vw-edge-box.width));
  let top=wordPeekAnchor.direction==='above' ? wordPeekAnchor.top-gap-box.height : wordPeekAnchor.bottom+gap;
  top=Math.max(safeTop,Math.min(top,safeBottom-box.height));
  pill.dataset.expandDirection=wordPeekAnchor.direction;
  pill.style.transformOrigin=wordPeekAnchor.direction==='below'?'50% 0%':'50% 100%';
  pill.style.left=`${Math.round(left)}px`;pill.style.top=`${Math.round(top)}px`;

}
function stopWordMorph(){
  wordMorphGeneration++;
  if(wordMorphAnimation) wordMorphAnimation.cancel();
  wordMorphAnimation=null;
  document.getElementById('panel').classList.remove('morphing');
  document.getElementById('word-peek').style.visibility='';
}
function anchoredDetailRect(){
  const viewport=window.visualViewport,edge=16,gap=8;
  const x=viewport?viewport.offsetLeft:0,y=viewport?viewport.offsetTop:0;
  const width=viewport?viewport.width:innerWidth,height=viewport?viewport.height:innerHeight;
  const chrome=document.getElementById('readchrome').getBoundingClientRect();
  const safeTop=y+edge+(parseFloat(getComputedStyle(document.getElementById('word-peek')).getPropertyValue('--word-safe-top'))||0);
  const bottom=Math.min(y+height-edge,chrome.height&&chrome.top>safeTop?chrome.top-gap:y+height-edge);
  const below=wordPeekAnchor.direction==='below';
  const hinge=below?Math.min(bottom-44,Math.max(safeTop,wordPeekAnchor.bottom+gap)):Math.max(safeTop+44,Math.min(bottom,wordPeekAnchor.top-gap));
  const h=Math.max(44,Math.min(380,below?bottom-hinge:hinge-safeTop));
  const w=Math.min(360,width-edge*2);
  const left=Math.max(x+edge,Math.min((wordPeekAnchor.left+wordPeekAnchor.right-w)/2,x+width-edge-w));
  return {left,top:below?hinge:hinge-h,width:w,height:h};
}
function placeWordDetail(){
  if(!wordDetailAnchored||!wordPeekAnchor) return;
  const panel=document.getElementById('panel'),r=anchoredDetailRect();
  for(const key of ['left','top','width','height']) panel.style[key]=r[key]+'px';
}
function morphWordSurface(from,to,collapsing=false){
  const panel=document.getElementById('panel'),pill=document.getElementById('word-peek');
  stopWordMorph();
  if(matchMedia('(prefers-reduced-motion: reduce)').matches||!panel.animate){
    if(collapsing){panel.classList.remove('on','anchored');pill.style.visibility='';}
    return;
  }
  const generation=wordMorphGeneration;
  panel.classList.add('morphing');
  if(collapsing)pill.style.visibility='hidden';
  const frame=(r,radius)=>({left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',borderRadius:radius+'px'});
  wordMorphAnimation=panel.animate([frame(from,collapsing?24:28),frame(to,collapsing?28:24)],
    {duration:collapsing?220:280,easing:'cubic-bezier(.2,.8,.2,1)',fill:'none'});
  wordMorphAnimation.finished.then(()=>{
    if(generation!==wordMorphGeneration)return;
    wordMorphAnimation=null;panel.classList.remove('morphing');
    if(collapsing){panel.classList.remove('on','anchored');pill.style.visibility='';}
  }).catch(()=>{});
}
function renderWordPeek(){
  settlePendingWord();
  const pill=document.getElementById('word-peek'),w=displayedWord(selKey);
  if(!wordPeekActive||!w){pill.hidden=true;return;}
  const state=wordPeekState(w,currentContext(selKey));
  document.getElementById('word-peek-meaning').textContent=state.text;
  pill.classList.toggle('loading',state.loading);
  const retry=document.getElementById('word-peek-retry');
  if(state.loading) retry.setAttribute('disabled','');
  else retry.removeAttribute('disabled');
  pill.hidden=false;
  requestAnimationFrame(placeWordPeek);
}
function renderWordLookup(){
  if(wordPeekActive) renderWordPeek();
  else renderPanel();
}
function clearActiveWordSelection(){
  const node=activeSelectedWordNode;
  activeSelectedWordNode=null;
  if(!node) return;
  try{
    if(node.classList) node.classList.remove('sel');
    if(node.classList&&node.classList.contains('original-selection-marker')&&node.remove) node.remove();
  }catch(error){}
}
function selectWord(k, span, peek, bump=false){
  const panel=document.getElementById('panel');
  const keepAnchor=wordDetailAnchored&&!span;
  stopWordMorph();
  if(!keepAnchor){wordDetailAnchored=false;panel.classList.remove('anchored');panel.removeAttribute('style');}
  /* 여기서부터가 새 열림입니다. 앞 열림에 딸린 조회는 이 줄에서 임자를 잃습니다. */
  beginWordLookupLife();
  wordPeekRetryState=null;
  /* 다른 낱말을 열면 앞 문장의 해석 창은 남겨 둘 이유가 없습니다. */
  if(typeof closeSentence === 'function') closeSentence();
  if(!currentContext(k)) contextView = null;
  if(selKey!==k) addingMeaning=false;
  /* 칩을 눌러 고른 뜻은 다음에 열 때 맨 앞에서 만납니다. */
  const remember=!!(words[k]&&words[k].ko);
  selKey = k;
  if(!keepAnchor) clearActiveWordSelection();
  const metadataLife=wordLookupLife;
  if(!previewWordCard&&!homewardWordFor(words[k],span))
    requestAnimationFrame(()=>{if(wordLookupAlive(metadataLife))void fillDictionaryMetadata(k,metadataLife);});
  if(span){ span.classList.add('sel'); activeSelectedWordNode=span; rememberWordPeekAnchor(span); }
  if(peek){
    wordPeekActive=true;
    panel.classList.remove('on');
    panel.setAttribute('aria-hidden','true');
    document.getElementById('word-modal-scrim').classList.remove('on');
    if(typeof updateOriginalZoomControls==='function') updateOriginalZoomControls();
    renderWordPeek();
    if(remember||bump) deferWordOpenState(k,bump);
    return;
  }
  wordPeekActive=false;
  document.getElementById('word-peek').hidden=true;
  renderPanel();
  /* 패널은 한 번 열린 뒤에도 자기 안의 스크롤 위치를 기억합니다. 다른 낱말을
     눌렀는데 중간부터 보였던 이유가 이것입니다. 내용을 바꾼 직후와 레이아웃이
     한 번 그려진 뒤에 모두 0으로 돌려, 항상 낱말 제목부터 열리게 합니다. */
  const resetPanelScroll=()=>{ panel.scrollTop=0; };
  resetPanelScroll();
  panel.classList.add('on');
  panel.setAttribute('aria-hidden','false');
  if(typeof updateOriginalZoomControls === 'function') updateOriginalZoomControls();
  document.getElementById('word-modal-scrim').classList.toggle('on',!wordDetailAnchored);
  panel.setAttribute('aria-modal',String(!wordDetailAnchored));
  if(wordDetailAnchored) placeWordDetail();
  if(typeof rememberAppView==='function') rememberAppView(activeAppView());
  requestAnimationFrame(resetPanelScroll);
  if(remember||bump) deferWordOpenState(k,bump);
}

function expandWordDetail(){
  if(!wordPeekActive||!selKey||!displayedWord(selKey)) return;
  const pill=document.getElementById('word-peek');placeWordPeek();
  const from=pill.getBoundingClientRect();
  if(!previewWordCard)void fillDictionaryMetadata(selKey,wordLookupLife);
  wordPeekActive=false;wordDetailAnchored=true;
  pill.hidden=true;
  renderPanel();
  const panel=document.getElementById('panel');
  panel.classList.add('on','anchored');panel.scrollTop=0;
  panel.setAttribute('aria-hidden','false');panel.setAttribute('aria-modal','false');
  document.getElementById('word-modal-scrim').classList.remove('on');
  placeWordDetail();
  morphWordSurface(from,panel.getBoundingClientRect());
  if(typeof updateOriginalZoomControls==='function') updateOriginalZoomControls();
  if(typeof rememberAppView==='function') rememberAppView(activeAppView());
  panel.focus({preventScroll:true});
}
/* 미니필의 보조 동작입니다. 저장된 대표 뜻을 다시 펼치는 것이 아니라, 지금 누른
   자리의 문장을 서버에 다시 보내 판정합니다. 결과는 기존 Meaning 저장 규칙을
   그대로 지나고, 미니필은 상세창으로 바뀌지 않습니다. */
async function retryWordPeek(){
  if(previewWordCard){ openOnboardingWord(activeSelectedWordNode,true); return; }
  const k=selKey,w=words[k];
  const blocked=currentContext(k);
  const reason=(blocked&&blocked.error)||(wordPeekRetryState&&wordPeekRetryState.error)||(w&&w.aiOff);
  if(w && (reason==='trial'||reason==='login')){ openSyncModal(); return; }
  if(!wordPeekActive||!k||!w||w.loading||w.aiLoading||
     (wordPeekRetryState&&wordPeekRetryState.key===k&&wordPeekRetryState.loading)) return;
  const input=lookupRequestFor(w,activeSelectedWordNode,true);
  const {sentence,clicked,clickedIndex,book}=input;
  const root=w.retryOwner||w.root||k,life=wordLookupLife;
  wordPeekRetryState={key:k,loading:true,error:''};
  renderWordPeek();
  const answer=await fetchLook(k,{...input,node:activeSelectedWordNode,
    retry:true,hold:true,life});
  if(!wordLookupAlive(life)||!wordPeekActive||!words[k]) return;
  if(!answer||!String(answer.ko||'').trim()){
    wordPeekRetryState={key:k,loading:false,error:words[k].aiOff||'error'};
    renderWordPeek();
    return;
  }
  const parsed=answerFromLook(answer,false);
  const phrase=expressionFromMini(answer,sentence,clicked,clickedIndex);
  if(phrase){
    wordPeekRetryState=null;
    saveDetectedExpression(k,phrase,sentence,book,answer,life,{explicit:true,clickedIndex});
    return;
  }
  let targetRoot=root;
  if(firstLookupMeaning&&firstLookupMeaning.root===root&&firstLookupMeaning.life===life
     &&words[root]?.phraseParts&&answer.kind==='word'){
    const wordId=keyOf(answer.canonical||clicked);
    if(wordId&&wordId!==root&&!words[wordId]){
      const old=words[root],stamp=Math.max(Date.now(),(old.up||old.addedAt||0)+1);
      words[wordId]={...old,word:answer.canonical||wordId,clicked,
        forms:[...new Set([wordId,...lemmaCands(clicked)])],ko:'',ai:{},example:sentence,book,
        up:stamp,pickedAt:stamp};
      delete words[wordId].phraseParts;delete words[wordId].phraseGaps;
      delete words[wordId].retryCandidate;delete words[wordId].retryOwner;
      dead[root]=Math.max(stamp,(dead[root]||0)+1);delete words[root];save(LS_DEAD,dead);
      firstLookupMeaning={root:wordId,life};targetRoot=wordId;
      refreshReaderWords();
    }
  }
  const id=saveRetriedMeaning(targetRoot,parsed.ko,{clicked,example:sentence,book,ai:parsed.ai,
    alts:parsed.alts,phrase:parsed.phrase});
  if(id){ rememberSenseContext(id,sentence,clickedIndex);saveWords();selKey=id; contextView=null; paintWord(targetRoot); }
  wordPeekRetryState=null;
  renderWordPeek();
}
document.getElementById('word-peek-retry').onclick=retryWordPeek;
document.getElementById('word-peek-more').onclick=expandWordDetail;

/* ---- 낱말 창을 치우는 일도 여기 하나뿐입니다 ----
   상세 popup은 바깥 · Escape · 뒤로가기로 닫히고, 작은 필은 빈 곳 · 스크롤 ·
   페이지 이동 · 확대 · 다른 lookup으로 닫힙니다. 어느 길이든 이 cleanup 하나로
   끝납니다. 바깥 탭은 gesture owner가 받아 Reader로 관통하지 않습니다.

   해석 창에서 먼저 겪은 일입니다: 바깥으로 닫는 길만 판정 계층 밖에 있으면
   같은 탭이 뒤의 Reader까지 내려갈 수 있습니다. 낱말 popup도 그 예외를 두지
   않습니다. */
function closePanel(){
  const panel=document.getElementById('panel');
  stopWordMorph();wordDetailAnchored=false;
  panel.classList.remove('anchored');panel.removeAttribute('style');
  for(const fold of panel.querySelectorAll('details')) fold.open=false;
  wordPeekActive=false;wordPeekAnchor=null;
  wordPeekRetryState=null;
  selKey=null;
  previewWordCard=null;
  contextView=null; addingMeaning=false;
  /* 창을 닫았으면 그 답은 아무도 안 봅니다. 그런데 하루 한도는 이미 나갔습니다 —
     훑어 읽을 때 이 손실이 제일 큽니다. 그래서 여기서 끊습니다. 끊는 것은 AI
     한 번이 아니라 이 열림에 딸린 전부입니다. */
  endWordLookupLife();
  panel.classList.remove('on');
  panel.setAttribute('aria-hidden','true');
  if(typeof updateOriginalZoomControls === 'function') updateOriginalZoomControls();
  panel.scrollTop=0;
  document.getElementById('word-modal-scrim').classList.remove('on');
  document.getElementById('word-peek').hidden=true;
  clearActiveWordSelection();
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
  saveWords(resolved); paintWord(resolved); queueSync();
  renderWordLookup();
}
function renderPanel(){
  settlePendingWord();
  const base = displayedWord(selKey); if(!base) return;
  const k = selKey;
  const context = currentContext(k);
  /* 다른 문장의 저장 뜻을 정답처럼 먼저 보여 주지 않습니다. */
  const w = context ? Object.assign({}, base, {
    example:context.sentence, clicked:context.clicked, book:context.book,
    ko:context.loading||context.error?'':base.ko, ai:context.loading||context.error?Object.assign({},base.ai||{},{ko:''}):base.ai,
    aiLoading:!!context.loading, aiSlow:false, aiOff:context.error||'',
  }) : base;
  /* 화면의 단어 칸은 내부 key 가 아니라 지금 열어 둔 카드의 표시값입니다. 읽는
     글자일 뿐, 고치는 칸이 아닙니다 — 표제어를 손으로 바꾸면 원문 색칠이 기대는
     열쇠와 화면의 글자가 갈라집니다. 잘못 잡힌 낱말은 단어장에서 빼고 다시 누릅니다. */
  document.getElementById('p-word').textContent=w.word;
  /* 표제어 아래 한 줄. 원형이 따로 있을 때만 뜹니다 — "spared에서 찾음". */
  const clickedLine=document.getElementById('p-clicked');
  const original = (w.clicked && w.clicked.toLowerCase()!==w.word.toLowerCase()) ? `${w.clicked}에서 찾음` : '';
  clickedLine.textContent = original;
  clickedLine.classList.toggle('on', !!original);
  document.getElementById('p-ex').textContent = w.example || '—';
  document.getElementById('p-ex-preview').textContent=w.example||'';
  document.getElementById('p-know').hidden=!!previewWordCard;
  document.getElementById('p-highlight-row').hidden=!!previewWordCard;
  document.querySelectorAll('.stbtn').forEach(b=>{
    const active=+b.dataset.s===w.status;b.classList.toggle('on',active);
    b.setAttribute('aria-pressed',String(active));b.setAttribute('aria-label','모르는 정도 '+b.getAttribute('data-s'));
  });
  const mark = document.getElementById('p-mark');
  const marked = base.mark !== false;
  mark.classList.toggle('on', marked);
  mark.setAttribute('aria-pressed', String(marked));
  mark.querySelector('span').textContent = marked ? '켜짐' : '꺼짐';
  mark.title = marked ? '이 단어의 본문 색칠 끄기' : '이 단어의 본문 색칠 켜기';

  /* ── 뜻이 사는 칸. 하나뿐입니다 ──
     지금 보고 있는 Meaning 하나가 여기 뜹니다. 이 칸에서 할 수 있는 일은 지우기(×)
     하나뿐이고, 만들기는 아래 ＋, 고르기는 아래 칩입니다 — 세 손짓이 서로 다른
     자리에 있어야 작은 화면에서 부딪히지 않습니다. */
  const aiBox = document.getElementById('p-ai');
  const aiKo = document.getElementById('p-ai-ko'), aiPos = document.getElementById('p-ai-pos');
  const aiN = document.getElementById('p-ai-note');
  const aiCap = document.getElementById('p-ai-cap-t');
  const ai = w.ai || {};
  /* 이 자리에 글자가 오르는 것은 뜻이 정해진 뒤입니다. */
  const shown = w.ko || ai.ko || '';
  /* 오로라는 **이 칸에 아직 들어올 것이 남았을 때**만 붑니다. 뜻이 정해졌으면
     달리던 물음은 이 칸을 바꾸지 못합니다 — 늦게 와도 후보 줄로 갑니다
     (`applyLook`). 기다리는 동안 후보 하나를 고르면 그 뜻이 곧바로 여기 서고,
     끊긴 물음의 바람이 빈 칸 위에서 계속 불지 않습니다. */
  const asking = !!w.aiLoading && !w.aiSlow && !shown;
  /* 지금 연결이 없다는 것은 이 낱말에 무슨 일이 있었는지와 상관없는 사실입니다.
     거꾸로 뜻이 정해진 낱말에는 지난 실패를 붙들고 있지 않습니다 — 화면과 속이
     어긋나는 자리가 거기였습니다. */
  const offline = !previewWordCard && navigator.onLine === false;
  const off = offline ? 'offline'
    : asking ? ''
    : (w.aiOff === 'offline' || shown) ? '' : (w.aiOff || '');
  if(asking){
    aiBox.className = 'on load';
    aiCap.textContent = '문맥 뜻';
    aiKo.textContent = ''; aiPos.textContent = ''; aiN.textContent = '';
    aiN.style.display = 'none';
  }else if(!shown){
    /* 뜻이 아직 없습니다. 칸을 접지 않고 무슨 일인지 그 자리에 적습니다 —
       칸이 사라졌다 나타나면 화면이 출렁이고, 무엇을 기다렸는지도 남지 않습니다. */
    aiBox.className = 'on wait';
    aiCap.textContent = '뜻';
    aiKo.textContent = ''; aiPos.textContent = '';
    const waitLine = meaningWaitLine(off);
    aiN.textContent = waitLine;
    aiN.style.display = waitLine ? 'block' : 'none';
  }else{
    aiBox.className = 'on' + (w.koEdited ? ' edited' : '');
    /* noteDone 은 예전 모양입니다. 이미 저장된 단어를 다시 눌렀을 때
       AI 가 답했던 사실이 사라져 보이지 않게 함께 봅니다. */
    aiCap.textContent = w.koEdited ? '내가 적은 뜻'
      : ai.cached ? '전에 찾아본 뜻'
      : ((ai.done || ai.noteDone) ? '문맥 뜻' : '뜻');
    aiKo.textContent = shown;
    aiPos.textContent = ai.pos || '';
    const top = w.aiSlow ? '조금 오래 걸렸어요. 다시 시도할 수 있어요.' : '';
    aiN.textContent = top;
    aiN.style.display = top ? 'block' : 'none';
  }

  /* ── 담겼습니다 ──
     이 앱에는 저장 단추가 없습니다. 그래서 방금 누른 낱말이 정말 단어장에 남았는지
     확인할 자리가 없었습니다. 여기서 새로 판단하는 것은 하나도 없습니다 — 뜻이
     확정됐는지 묻는 자는 이미 `pendingWordResolved` 하나뿐이고(그 안에서
     `hasResolvedMeaning`), 그 답을 그대로 뜻 카드 머리에 적을 뿐입니다.

     기다리는 동안에는 적지 않습니다. */
  const savedBadge = document.getElementById('p-ai-saved');
  if(savedBadge) savedBadge.hidden = !(!asking && words[k] && pendingWordResolved(k));

  /* 단추는 AI 가 답하지 못한 이유가 있을 때만 나옵니다. 평소에는 클릭한 순간
     이미 다녀왔으므로 누를 것이 없고, 뜻이 안 맞을 때는 박스 안의 링크가 받습니다.
     한도(quota)와 마찬가지로 오프라인도 지금 눌러서 될 일이 아닙니다 — 단추를
     숨기고 아래 안내 한 줄만 남겨서 "다시 눌러 보세요"처럼 보이지 않게 합니다. */
  const aiBtn = document.getElementById('p-aibtn'), aiHint = document.getElementById('p-aihint');
  /* `off` 는 위에서 한 번 정했습니다 — 메인 뜻 칸과 이 아래가 같은 사실을 봐야
     하기 때문입니다. 여기서 다시 정하면 두 자리가 다른 말을 할 수 있습니다. */
  /* 뜻 칸이 이미 이유를 말한 상태에서는 아래에서 되풀이하지 않습니다. 누를 것이
     있는 상태(체험 소진·로그인·오류)만 단추와 함께 한 줄을 남깁니다. */
  const hintOff = (!shown && (off === 'quota' || off === 'offline' || off === 'login' || off === 'trial')) ? '' : off;
  aiBtn.style.display = (off && off !== 'quota' && off !== 'offline') ? 'flex' : 'none';
  document.getElementById('p-aibtn-t').textContent =
      (off === 'trial' || off === 'login') ? '로그인하고 계속 쓰기'
    : (off === 'error' || w.aiSlow)        ? '다시 시도'
    :                                        '문맥 뜻 찾기';
  // Successful signed-out lookups use the same quiet surface as signed-in lookups.
  aiHint.style.display = hintOff ? 'block' : 'none';
  /* `#p-aihint` 는 단추 바로 아래 붙도록 음수 margin 으로 당겨져 있습니다
     (styles/dictionary.css). 단추가 사라지면(quota·offline) 끌어당길 것이
     없어서 그 위의 낱말 칸(`#p-clicked`)까지 겹쳐 올라갑니다 — 그래서 단추가
     실제로 그려질 때만 당기고, 아니면 평범한 간격으로 놔둡니다. */
  aiHint.classList.toggle('tight', aiBtn.style.display !== 'none');
  aiHint.textContent =
      hintOff === 'trial'   ? '무료 체험을 다 썼어요. 로그인하면 이어서 쓸 수 있어요'
    : hintOff === 'quota'   ? '오늘의 문맥 뜻 사용량을 모두 썼어요. 자정에 다시 채워집니다'
    : hintOff === 'offline' ? '오프라인이라 새로운 뜻은 불러올 수 없어요'
    : hintOff === 'error'   ? '잠깐 문제가 있었어요. 다시 눌러 보세요'
    :                     '뜻이 문맥과 안 맞을 때 눌러보세요';

  /* ── 저장된 뜻 ──
     다른 뜻은 문맥 뜻 아래 칩으로 둡니다. 본체는 선택, 끝의 × 는 삭제입니다. */
  document.getElementById('p-ex-fold').hidden=!w.example;
  if(previewWordCard){
    document.getElementById('p-saved-senses').className='';
    document.getElementById('p-saved-senses').innerHTML='';
    document.getElementById('p-en-section').hidden=!(w.defs&&w.defs.length);
    renderOnboardingWordDetail(w);
    return;
  }
  const root=base.root||k;
  const savedBox=document.getElementById('p-saved-senses'), meanings=meaningCards(root,k);
  const otherMeanings=meanings.filter(([id])=>id!==k);
  const canAdd=true;
  if(otherMeanings.length){
    savedBox.className='on';
    /* 첫 칩은 지금 보고 있는 뜻이라 지우는 문이 이미 메인 뜻 칸에 있습니다. 두 번째
       칩부터는 그 문이 없으므로, 정리할 길을 칩 안에 하나 둡니다. */
    savedBox.innerHTML=otherMeanings.map(([id,item])=>`<button type="button" class="saved-sense" data-k="${esc(id)}"><span>${esc(item.ko)}</span><span class="sense-remove" aria-hidden="true">×</span></button>`).join('');
    [...savedBox.querySelectorAll('.saved-sense')].forEach(button=>{
      const chip=/** @type {HTMLElement} */(button);
      chip.onclick=event=>{
        const id=chip.dataset.k||'';
        if((/** @type {HTMLElement} */(event.target)).closest('.sense-remove')){ deleteMeaning(id); return; }
        if(id===selKey) return;
        addingMeaning=false; contextView=null; selectWord(id,null);
      };
    });
  }else{ savedBox.className=''; savedBox.innerHTML=''; }
  /* 뜻이 하나뿐이면 지우는 문을 닫아 둡니다. 뜻 없는 낱말을 만들 수 있는 유일한
     길이었고, 그렇게 만들어 두면 다음에 열었을 때 빈 칸부터 마주칩니다.
     낱말째로 빼는 것은 아래 "단어장에서 빼기"가 맡습니다. */
  /* 추천 뜻은 아직 Meaning 이 아닙니다. 한 번 누르면 저장된 뜻이 되어 이 줄을
     떠납니다. 싫은 추천에는 × 를 두지 않습니다 — 그냥 지나치면 됩니다. */
  const altSec=document.getElementById('p-alt-sec'), altBox=document.getElementById('p-alts');
  const savedKeys=new Set(meanings.map(([,item])=>meaningKey(item.ko)));
  const alts=[...new Set((w.alts||[]).map(item=>String(item||'').trim())
    .filter(item=>item && !savedKeys.has(meaningKey(item)) && meaningKey(item)!==meaningKey(shown)))]
    .slice(0, 3);
  if(alts.length){
    altSec.className='p-sec on'; altBox.className='on';
    altSec.textContent = '추천 뜻';
    altBox.innerHTML=alts.map(item=>`<button type="button" class="kochip" data-meaning="${esc(item)}">${esc(item)}</button>`).join('');
    [...altBox.querySelectorAll('.kochip')].forEach(button=>{
      const chip=/** @type {HTMLElement} */(button);
      chip.onclick=()=>adoptSuggestion(k,chip.dataset.meaning||'');
    });
  }else{ altSec.className='p-sec'; altBox.className=''; altBox.innerHTML=''; }
  const defs = document.getElementById('p-defs');
  document.getElementById('p-en-section').hidden=!(w.enLoading||(w.defs&&w.defs.length)||w.enError);
  if(w.defs&&w.defs.length) defs.innerHTML=w.defs.map(d=>`<div><span class="pos">${esc(d.pos)}</span>${esc(d.def)}</div>`).join('');
  else if(w.enLoading) defs.textContent='영어 뜻 찾는 중…';
  else if(w.enError) defs.innerHTML='<button type="button" id="p-en-retry" aria-label="영어 뜻 다시 시도" title="다시 시도"><svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7v5h-5M20 12a8 8 0 1 0-2.3 5.7"/></svg></button>';
  else defs.textContent='';
  if(w.defs?.length&&w.definitionSource==='wiktionary'){
    defs.insertAdjacentHTML('beforeend',`<small class="p-dict-source"><a href="https://en.wiktionary.org/wiki/${encodeURIComponent(w.definitionSourceWord||w.word)}#English" target="_blank" rel="noopener">Wiktionary</a> · <a href="https://freedictionaryapi.com/" target="_blank" rel="noopener">FreeDictionaryAPI</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a></small>`);
  }
  const retry=document.getElementById('p-en-retry');
  if(retry)retry.onclick=()=>{delete words[k].enRetryAt;void fillDictionaryMetadata(k,wordLookupLife,true);};

}
/* 추천 뜻 클릭 = 그 뜻을 저장하고 지금 뜻으로 삼기. 확인은 묻지 않습니다 —
   누른 것 자체가 대답입니다. */
function adoptSuggestion(k, meaning){
  const base=words[k]; if(!base || !meaning) return;
  const root=base.root||k;
  const id=createMeaning(root, meaning, {clicked:base.clicked, example:base.example, book:base.book, ai:base.ai});
  if(!id) return;
  addingMeaning=false; contextView=null;
  paintWord(root); selectWord(id,null);
}
/* ＋ 로 적어 넣는 뜻. 적어서 Enter 를 누르면 그 자리에서 저장되고 지금 뜻이 됩니다. */
document.querySelectorAll('.stbtn').forEach(b=>b.onclick=()=>{
  setStatus(selKey, +b.dataset.s);
});
document.getElementById('p-mark').onclick=()=>{
  const selected=words[selKey];if(!selected)return;
  const key=selected.root||selKey,w=words[key]||selected;
  w.mark = w.mark === false;
  w.up=Date.now(); saveWords(key); paintWord(key); queueSync(); renderPanel();
};

document.getElementById('p-know').onclick = ()=>{
  if(!selKey) return;
  const k=words[selKey]&&(words[selKey].root||selKey);if(!k)return;
  const expression=Array.isArray(words[k]&&words[k].phraseParts);
  Object.keys(words).filter(id=>id===k||words[id]&&words[id].root===k).forEach(id=>{
    const item=words[id],stamp=Math.max(Date.now(),(item.up||0)+1,dead[id]||0);
    if(item.ko)dead[senseCardKey(k,item.ko)]=stamp;
    dead[id]=stamp;delete words[id];
  });
  save(LS_DEAD,dead);closePanel();saveWords();paintWord(k);if(expression)refreshReaderWords();queueSync();
};
function refreshReaderWords(){
  if(curBook && currentReaderMode==='text'){
    // Lexical identity is metadata, not document structure. Keep the paragraphs,
    // text nodes and selected token alive; no scroll restoration is necessary.
    const starts=savedPhraseStarts();
    document.querySelectorAll('#rtext [data-word-spans="1"]').forEach(paragraph=>{
      const template=document.createElement('template');
      template.innerHTML=wordSpans(paragraph.textContent,starts,!!curBook.transient);
      const next=template.content.querySelectorAll('.w');
      paragraph.querySelectorAll('.w').forEach((node,index)=>{
        const replacement=next[index];
        if(!replacement) return;
        for(const name of ['phrase','s1','s2','s3']) node.classList.toggle(name,replacement.classList.contains(name));
        node.setAttribute('data-w',replacement.getAttribute('data-w'));
      });
    });
  }else if(typeof refreshOriginalSavedWords==='function') refreshOriginalSavedWords();
}
/* 표제어를 손으로 고치는 칸은 없습니다. 화면의 낱말은 원문 색칠·캐시·동기화가
   모두 기대는 열쇠에서 나온 글자라, 그 자리에서 글자만 바꾸면 화면과 열쇠가
   갈라집니다(고친 이름으로는 본문이 안 칠해지고, 캐시도 옛 이름으로 남습니다).
   잘못 잡힌 표제어는 "단어장에서 빼기" 뒤에 원하는 낱말을 다시 누르면 됩니다. */

/* ---- metadata-only English dictionary lookup ----
   한국어 뜻이나 문맥 판단에는 관여하지 않습니다. 상세 화면에서 실제로 쓰는 IPA,
   녹음 URL, 영어 정의만 채웁니다. 공유 캐시는 독립적으로 완료하고 카드 반영은 살아 있는 lookup만 합니다. */
// Public dictionary data has a word-level lifetime, separate from contextual AI.
// A completed response may warm the cache; it can never recreate a deleted card.
const englishMetadataRequests=new Map();
const englishCardRequests=new WeakMap();
async function fetchEnMetadata(form,force=false){
  const key='en:v2:'+form;
  if(englishMetadataRequests.has(key))return englishMetadataRequests.get(key);
  const request=(async()=>{
    const cached=force?null:await dictGet(key);
    if(cached&&cached.expires>Date.now())return cached;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),3500);
    try{
      const response=await fetch('https://freedictionaryapi.com/api/v1/entries/en/'+encodeURIComponent(form)+'?translations=false',{signal:controller.signal});
      if(response.status===404){const missing={missing:true,expires:Date.now()+86400000};await dictPut(key,missing);return missing;}
      if(!response.ok)throw new Error('Dictionary unavailable');
      const data=await response.json();
      if(!Array.isArray(data.entries))throw new Error('Invalid dictionary response');
      const entries=data.entries.filter(entry=>entry.language?.code==='en');
      const definitions=[];
      for(const entry of entries){
        for(const sense of (entry.senses||[]).slice(0,2)){
          if(typeof sense.definition==='string'&&sense.definition.trim())definitions.push({pos:entry.partOfSpeech||'',def:sense.definition});
          if(definitions.length>=5)break;
        }
        if(definitions.length>=5)break;
      }
      if(!definitions.length){const missing={missing:true,expires:Date.now()+86400000};await dictPut(key,missing);return missing;}
      const value={defs:definitions,phon:entries.flatMap(entry=>entry.pronunciations||[]).find(p=>p.type==='ipa')?.text||'',
        source:'wiktionary',sourceWord:data.word||form,expires:Date.now()+30*86400000};
      await dictPut(key,value);return value;
    }finally{clearTimeout(timer);}
  })();
  englishMetadataRequests.set(key,request);
  try{return await request;}finally{englishMetadataRequests.delete(key);}
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

   영어 metadata 조회는 이 한국어 뜻 경로와 완전히 분리되어 있습니다. */
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
const lookKey = (word, sentence, clickedIndex=-1) =>
  'l2:' + String(word||'').toLowerCase() + '|' + sentenceHash(sentence) + '|' + clickedIndex;

/* ---- 로그인 전 맛보기 ----
   Breeze 가 남과 다른 점은 "이 문장에서는 이런 뜻" 하나입니다. 그게 로그인 뒤에만
   보이면 처음 온 사람은 문맥 뜻을 경험할 수 없습니다. 먼저 보여 주고 나서 물어봅니다.

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
/* 서버가 답할 때마다 알려 주는 남은 횟수. 모르면 null.

   ---- 세는 곳은 서버 하나입니다 ----
   여기서는 한 번도 빼지 않습니다. `j.left` 를 받아 적을 뿐입니다. 그래서 화면의
   수명(열림)과 셈의 수명(요청)이 애초에 섞이지 않습니다:

     캐시에서 꺼냄        요청이 없으므로 0회
     열림이 먼저 끝남     요청을 보내지 않으므로 0회 (fetchDict 의 `wordLookupAlive`)
     보냈고 답이 옴       서버가 1회 뺀 수를 알려 주고, 우리는 받아 적습니다
     보냈는데 우리가 끊음 서버는 이미 받았습니다. 되돌리지 않습니다 —
                          끊은 것은 우리 쪽 기다림이지 서버의 계산이 아닙니다

   끊은 경우에 화면의 남은 횟수는 옛 수인 채로 있습니다. 그것을 여기서 하나
   빼서 맞추지 않습니다 — 서버가 진짜 수를 아는 유일한 곳이고, 다음 답 한 번에
   저절로 맞습니다. 틀린 수를 지어내는 것보다 한 박자 늦는 편이 낫습니다. */
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

/* ---- 한 번의 열림이 제 조회의 임자입니다 ----

   손짓의 임자가 `pointerdown` 부터 `click` 까지라면(scripts/reader/gesture.js),
   여기의 임자는 **창이 열려 있는 동안**입니다. 낱말 하나를 열면 번호가 하나
   오르고, 그 열림에 딸린 모든 요청은 그 번호를 들고 다닙니다. 창을 닫거나 다른
   낱말을 열면 번호가 또 올라, 앞 번호를 든 답은 그 순간부터 아무도 아닌 답이
   됩니다 — 돌아와도 화면을 건드리지 않습니다.

   `selKey === k` 로만 막던 자리였습니다. 그것으로는 **같은 낱말을 닫았다 다시
   연** 경우를 가릴 수 없습니다. 앞 열림의 늦은 답이 새 열림의 것인 척 들어옵니다.

   번호와 함께 취소표(AbortController)도 하나씩 답니다. 번호는 "돌아온 답에게
   화면을 안 준다"이고 취소표는 "애초에 더 달리지 않는다"입니다. 둘 다 필요합니다 —
   metadata 조회도 같은 취소표를 받아 닫힌 lookup을 위해 계속 달리지 않습니다.

   ---- 무엇을 끊고 무엇을 남기는가 ----
   끊는 것은 **아직 안 끝난 일**입니다. 버리는 것은 **화면을 만질 권리**뿐이고,
   이미 도착한 답은 버리지 않습니다. 한도는 이미 나갔고 답은 옳기 때문입니다.

     기기에 있던 답      곧바로 보여 줍니다 — 예전 그대로
     도착한 답           캐시에 넣고 카드에도 바릅니다 — 창이 닫혔어도
     아직 달리는 요청    끊습니다. 다음 요청은 출발조차 안 합니다
     끊긴 요청           답이 아닙니다 — 오류로도 적지 않습니다
     닫힌 뒤 온 답       그리지 않고, 창을 다시 열지 않고, `selectWord` 도 안 합니다
     이미 저장된 것      되돌리지 않습니다

   한 줄로: **죽은 열림은 이후의 답으로 화면을 조종할 권리가 없습니다.** 답을
   잃는 것이 목적이 아닙니다. */
let wordLookupLife = 0;
let wordLookupCtrl = null;
/* 새 열림을 시작합니다 — 앞 열림은 여기서 끝납니다. */
function beginWordLookupLife(){
  endWordLookupLife();
  firstLookupMeaning=null;
  wordLookupCtrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  return wordLookupLife;
}
/* 창이 닫혔습니다. 번호를 올려 앞 번호를 죽이고, 달리던 것은 끊습니다 —
   아무도 안 볼 답에 하루 한도가 새 나가던 자리이기도 합니다. */
function endWordLookupLife(){
  wordLookupLife++;
  firstLookupMeaning=null;
  if(wordLookupCtrl){ try{ wordLookupCtrl.abort(); }catch(e){} wordLookupCtrl = null; }
  /* 이 열림이 끝나는 자리는 여기 하나입니다 — 창을 닫았든, 다른 낱말을 열었든.
     그래서 "확정 못 한 새 낱말을 버린다"도 여기 하나면 됩니다. 닫기에만 달면
     빈 낱말을 띄워 둔 채 옆 낱말을 눌렀을 때 껍데기가 그대로 남습니다.
     끊는 것과 같은 줄에 두는 것이 요점입니다 — 표는 이 줄에서 사라지므로, 뒤에
     오는 답이 다시 붙잡을 표가 남지 않습니다. */
  discardPendingWord();
}
function wordLookupAlive(life){ return life === wordLookupLife; }
function wordLookupSignal(){ return wordLookupCtrl ? wordLookupCtrl.signal : null; }
/* 이 열림이 아직 그 열림이면 다시 그립니다. 아니면 그릴 창이 없습니다. */
function renderIfAlive(life){ if(wordLookupAlive(life)) renderWordLookup(); }

/* DeepSeek owns lexical analysis. Stored meanings are reused locally without a remote judge.
   These helpers only turn DeepSeek's typed mini result into the existing saved-expression record. */
function expressionFromMini(answer,sentence,clicked,clickedIndex){
  if(!answer||answer.kind!=='expression'||!answer.canonical)return null;
  const tokens=lookupSentenceTokens(sentence);
  let index=Number(clickedIndex);
  if(!Number.isInteger(index)||index<0||index>=tokens.length){
    const needle=String(clicked||'').replace(/’/g,"'").toLowerCase();
    const matches=tokens.map((token,i)=>({token,i})).filter(item=>item.token.text.replace(/’/g,"'").toLowerCase()===needle);
    index=matches.length===1?matches[0].i:-1;
  }
  const indexes=Array.isArray(answer.members)?answer.members:[];
  if(indexes.some((i,at)=>!Number.isInteger(i)||i<0||i>=tokens.length||(at>0&&i<=indexes[at-1])))return null;
  if(index<0||indexes.length<2||!indexes.includes(index))return null;
  const phrase=lexicalIdentityFromMembers(tokens,indexes,answer.canonical);
  return phrase.canonical&&phrase.parts.length>=2?phrase:null;
}
function saveDetectedExpression(k,phrase,sentence,book,answer,life,opt={}){
  const base=words[k];if(!base||!phrase||!answer||!answer.ko||!wordLookupAlive(life))return '';
  const id=phraseCardKey(phrase.canonical),previous=words[id],resolved=answerFromLook(answer,false);
  const explicit=!!opt.explicit||!!(pendingWord&&pendingWord.key===k);
  const initial=!!(pendingWord&&pendingWord.key===k);
  const owner=base.retryOwner||base.root||k;
  const first=!!(opt.explicit&&firstLookupMeaning&&firstLookupMeaning.root===owner&&firstLookupMeaning.life===life);
  const priorRetry=opt.explicit?Object.entries(words).find(([key,item])=>key!==id&&item&&item.retryCandidate
    &&(item.retryOwner||item.root)===owner):null;
  if(dead[id]&&!explicit){const ctx=currentContext(k);if(ctx){ctx.loading='';ctx.error='deleted';}renderIfAlive(life);return '';}
  let active=id;
  if(previous){
    if(opt.explicit&&previous.retryCandidate&&previous.retryOwner===owner){
      previous.ko=resolved.ko;previous.ai=resolved.ai;previous.example=sentence;previous.book=book;
      previous.up=Date.now();previous.pickedAt=previous.up;
    }
    else if(opt.explicit)active=saveRetriedMeaning(id,resolved.ko,{example:sentence,book,ai:resolved.ai});
    else if(previous.koEdited){active=id;}
    else active=createMeaning(id,resolved.ko,{example:sentence,book,ai:resolved.ai,automatic:!explicit});
    if(!active){const ctx=currentContext(k);if(ctx){ctx.loading='';ctx.error='deleted';}renderIfAlive(life);return '';}
  }else{
    const buried=dead[id]||0;
    if(explicit){delete dead[id];save(LS_DEAD,dead);}
    words[id]={word:phrase.canonical,clicked:phrase.surface,forms:phrase.parts,
      phraseParts:phrase.parts,phraseGaps:phrase.gaps,example:sentence||base.example,book:book||base.book,
      status:base.status,mark:base.mark,ko:resolved.ko,ai:resolved.ai,alts:[],defs:[],
      addedAt:Date.now(),pickedAt:Date.now(),up:Math.max(Date.now(),buried+1)};
  }
  rememberSenseContext(active,sentence,opt.clickedIndex===undefined?-1:opt.clickedIndex);
  if(pendingWord&&pendingWord.key===k&&id!==k){
    const held=pendingWord;pendingWord=null;delete words[k];
    if(held.deadAt){dead[k]=held.deadAt;save(LS_DEAD,dead);}
  }
  if(initial&&!previous)firstLookupMeaning={root:id,life};
  if(opt.explicit&&active){
    if(first&&owner!==id&&!previous){
      const old=words[owner];
      if(old){dead[owner]=Math.max(Date.now(),(old.up||old.addedAt||0)+1,(dead[owner]||0)+1);delete words[owner];save(LS_DEAD,dead);}
      firstLookupMeaning={root:id,life};
    }else if(!first&&!previous){words[id].retryCandidate=true;words[id].retryOwner=owner;}
    if(priorRetry)discardRetryCandidate(priorRetry[0]);
  }
  // A single lookup can change identity from a token to an expression/Meaning.
  // Carry its cooldown so an immediate recheck is not a new learning event.
  recentWordOpens.set(id,Math.max(recentWordOpens.get(id)||0,recentWordOpens.get(base.root||k)||0,Date.now()));
  selKey=active;contextView=null;
  saveWords();queueSync();refreshReaderWords();renderIfAlive(life);return active;
}

/* 답이 어디서 오느냐에 따라 기다림이 다릅니다. 둘은 사람에게 다른 사건입니다.

   ① 씨앗 — 이 사람은 이 낱말을 물어본 적이 없습니다. 앱이 미리 받아 뒀을
      뿐이고, 화면에서 벌어지는 일은 "지금 물어봤다" 입니다. 0초에 튀어나오면
      무슨 일이 일어났는지 못 알아채고, 맛보기 글에서만 사전이 이상하게
      빨라 보이는 것은 자랑이 아니라 다른 앱처럼 보이는 일입니다. 기다립니다.
   ② 내가 전에 물어본 것 — 기다림은 거짓말이 됩니다. 이미 아는 답인데 기다린
      척할 이유가 없고, 오히려 "아까 봤다" 는 사실이 곧바로 와야 합니다.
      그래서 곧장 내놓고, 창의 머리글도 다르게 답니다. */
async function loadCachedLook(k, began, life, node){
  const w = words[k]; if(!w) return false;
  const local=homewardWordFor(w,node);
  if(local){
    const input=lookupRequestFor(w,node,false);
    const answer=homewardAnswerAsLook(local);
    await homewardPresentationWait(began||Date.now(),()=>wordLookupAlive(life));
    if(!wordLookupAlive(life)||words[k]!==w)return true;
    const phrase=expressionFromMini(answer,input.sentence,input.clicked,input.clickedIndex);
    if(phrase)saveDetectedExpression(k,phrase,input.sentence,input.book,answer,life,{clickedIndex:input.clickedIndex});
    else applyLook(w,answer,k,{life});
    return true;
  }
  for(const key of entryKeys(w)){
    const input=lookupRequestFor(w,node,false);
    const hit = await dictGet(lookKey(key,input.sentence,input.clickedIndex));
    /* 기기에 이미 있던 답입니다. 창이 닫혔어도 카드에는 바릅니다 — 여기서
       거르면 그 낱말은 답을 가진 채로 영영 빈 카드가 됩니다. 그리는 것은
       `applyLook` 이 `life` 로 가립니다. */
    if(hit && hit.ko){
      /* 바람을 보여 주는 기다림입니다. 볼 사람이 없으면 기다릴 이유도 없습니다. */
      if(hit.seed && wordLookupAlive(life)){
        const left = AI_MIN_WAIT - (Date.now() - (began || Date.now()));
        if(left > 0) await new Promise(res => setTimeout(res, left));
      }
      const tokens=lookupSentenceTokens(w.example||'');
      const index=input.clickedIndex;
      const phrase=expressionFromMini(hit,input.sentence,input.clicked,index);
      if(phrase)saveDetectedExpression(k,phrase,input.sentence,w.book||'',hit,life,{clickedIndex:index});
      else applyLook(w,hit,k,{cached:!hit.seed,life});
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
  /* 이 요청이 어느 열림의 것인지. 단추에서 바로 부를 때는 지금 열려 있는 것입니다. */
  if(opt.life === undefined) opt.life = wordLookupLife;
  const life = opt.life;
  const node=opt.node||activeSelectedWordNode;
  if(!opt.sentence)Object.assign(opt,lookupRequestFor(w,node,!opt.retry&&!opt.wider));
  else if(!opt.retry&&!opt.wider){
    // A fresh AI request may already carry the selected sentence/index from the
    // current occurrence. Keep that target authoritative; borrow only its neighbors.
    const context=lookupRequestFor(w,node,true);
    if(context.sentence===opt.sentence&&context.clickedIndex===opt.clickedIndex){
      opt.before=context.before;opt.after=context.after;
    }
  }
  const querySentence=opt.sentence || w.example || '';
  const lookupTokens=lookupSentenceTokens(querySentence);
  let clickedIndex=Number(opt.clickedIndex);
  if(!Number.isInteger(clickedIndex)||clickedIndex<0||clickedIndex>=lookupTokens.length)
    clickedIndex=lookupClickedTokenIndex(opt.node||null,querySentence,lookupTokens);
  if(clickedIndex<0){
    const needle=String(opt.clicked||w.clicked||w.word||k).replace(/’/g,"'").toLowerCase();
    const matches=lookupTokens.map((token,index)=>({token,index})).filter(item=>item.token.text.replace(/’/g,"'").toLowerCase()===needle);
    clickedIndex=matches.length===1?matches[0].index:-1;
  }
  if(clickedIndex<0){w.aiOff='error';renderIfAlive(life);return false;}
  /* `hold` 는 답을 카드에 바르지 않고 그대로 돌려 달라는 뜻입니다. 넓은 문맥으로
     다시 물어본 답은 지금 뜻을 덮는 것이 아니라 새 뜻이 되기 때문입니다. */
  if(navigator.onLine === false){ w.aiOff = 'offline'; renderIfAlive(life); return false; }
  /* 서버 주소조차 없으면(config 미설정) 할 수 있는 일이 없습니다. 로그인 여부는
     더 이상 여기서 막지 않습니다 — 맛보기 횟수는 서버가 셉니다. */
  if(!sb){ w.aiOff = 'login'; renderIfAlive(life); return false; }

  const began = Date.now();
  /* 이 물음 하나만 따로 끊을 수 있어야 합니다 — 9초가 넘었을 때. 그래서 표를
     하나 더 만들되, 열림의 표에 매답니다. 임자는 여전히 열림 하나입니다:
     열림이 끝나면 이 표도 함께 끊기고, 반대 방향은 없습니다. */
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const lookupSig = wordLookupSignal();
  if(ctrl && lookupSig){
    if(lookupSig.aborted) try{ ctrl.abort(); }catch(e){}
    else lookupSig.addEventListener('abort', ()=>{ try{ ctrl.abort(); }catch(e){} }, {once:true});
  }
  w.aiLoading = true;
  delete w.aiSlow; delete w.aiOff;
  renderIfAlive(life);
  /* 9초가 넘으면 무작정 기다리게 두지 않습니다. 기다림 자체보다
     "언제 끝날지 모른다"가 더 답답하기 때문입니다. */
  const slow = setTimeout(function(){
    if(!words[k]) return;
    words[k].aiSlow = true; words[k].aiOff = 'error';
    if(ctrl) try{ ctrl.abort(); }catch(e){}
    renderIfAlive(life);
  }, AI_TIMEOUT);
  try{
    const j = await dictCall({
      op:'look',
      word: opt.word || w.word || k, clicked: opt.clicked || w.clicked || '', cands: opt.cands || entryKeys(w),
      sentence: querySentence,before:opt.before||'',after:opt.after||'', book: opt.book || w.book || '',
      tokens:lookupTokens.map(token=>({text:token.text})),clickedIndex,
      retry: !!(opt.wider||opt.retry), avoid: (opt.wider||opt.retry) ? (opt.avoid || []) : [],
      /* 로그인 전에만 보냅니다. 로그인한 뒤에는 계정이 곧 신원이라 필요 없습니다. */
      device: sbUser ? '' : deviceId()
    }, ctrl ? ctrl.signal : null);
    /* 끊긴 요청도 `dictCall` 은 `null` 로 돌려줍니다. 그것을 오류로 적으면 닫은
       창에 오류가 남고, 다시 열었을 때 "안 됐다"가 먼저 보입니다. 끊긴 것은
       답이 아니라 없던 일입니다 — 여기서만 갈라섭니다.

       반대로 **도착한 답은 창이 닫혔어도 답입니다.** 한도는 이미 나갔고 답은
       옳으므로, 아래의 캐시와 카드 바르기는 그대로 지납니다. 닫힌 열림이 잃는
       것은 화면을 만질 권리 하나뿐입니다. */
    if(!j && ctrl && ctrl.signal.aborted) return false;
    if(!j || j.error || !j.ko){
      const e = j && j.error;
      w.aiOff = e === 'quota_exceeded' ? 'quota'
              : e === 'anon_exhausted' ? 'trial'
              : e === 'login_required' ? 'login' : 'error';
      if(w.aiOff === 'trial') anonLooksLeft = 0;
      return false;
    }
    if(typeof j.left === 'number') rememberAiLeft(j.left);
    await dictPut(lookKey(opt.word || w.word || k, querySentence,clickedIndex), Object.assign({}, j, { done:true }));
    /* 갓 받은 답은 최소 0.28초는 바람을 보여 준 뒤에 놓습니다. 답이 너무 빨리 오면
       화면이 튄 것처럼 느껴져서, 무슨 일이 일어났는지 못 알아챕니다.
       기기에 이미 있던 답은 그냥 띄웁니다 — 기다린 척할 이유가 없습니다. */
    const left = AI_MIN_WAIT - (Date.now() - began);
    /* 볼 사람이 있을 때만 뜸을 들입니다. */
    if(left > 0 && wordLookupAlive(life)) await new Promise(res=>setTimeout(res, left));
    if(opt.hold) return j;
    const phrase=expressionFromMini(j,querySentence,opt.clicked||w.clicked,clickedIndex);
    if(phrase){saveDetectedExpression(k,phrase,querySentence,opt.book||w.book||'',j,life,{clickedIndex});return true;}
    if(words[k]===w){applyLook(w,j,k,opt);rememberSenseContext(k,querySentence,clickedIndex);saveWords();}
    return true;
  }finally{
    clearTimeout(slow);
    delete w.aiLoading;
    renderIfAlive(life);
  }
}

function applyLook(w, j, k, opt){
  opt = opt || {};
  const initial=!!(pendingWord&&pendingWord.key===k&&!String(w.ko||'').trim());
  delete w.aiLoading; delete w.aiOff;
  /* 사람이 이미 뜻을 정해 놨으면 AI 가 갈아 끼우지 않습니다. 직접 적은 뜻도,
     한도가 걸린 사이에 후보에서 고른 뜻도 마찬가지입니다 — 고르자마자 늦은 답이
     도착해 방금 고른 뜻이 바뀌던 자리입니다. 답은 버리지 않고 후보 줄 맨 앞에
     세웁니다. 원하면 한 번 눌러 그쪽으로 갈 수 있습니다. */
  const settled = String(w.ko||'').trim();
  const keep = !!settled && (!!w.koEdited || meaningKey(j.ko||'') !== meaningKey(settled));
  if(!keep){
    w.ai = { ko: j.ko || '', pos: j.pos || '', done:true,
             /* 이 기기가 전에 물어봤던 답인지. 머리글 한 줄이 달라집니다 —
                한도를 쓰지 않았다는 것을 그 자리에서 알 수 있게. */
             cached: !!opt.cached };
    if(!w.koEdited) w.ko = j.ko || w.ko;
  }
  w.aiLemma = j.canonical || j.lemma || w.aiLemma || '';
  w.alts = Array.isArray(j.alts) ? j.alts : [];
  if(keep && j.ko) w.alts = [j.ko, ...w.alts];
  w.colloc = [];
  if(j.lemma && !isAcro(w.word) && /^[A-Za-z][A-Za-z'’-]*$/.test(j.lemma)) w.word = j.lemma.toLowerCase();
  w.up = Date.now();
  if(initial&&String(w.ko||'').trim())firstLookupMeaning={root:k,life:opt.life===undefined?wordLookupLife:opt.life};
  saveWords(); queueSync();
  renderIfAlive(opt.life);
}

/* A failed first lookup can still be retried from its detail state. */
function askAI(){
  const k = selKey; if(!k || !words[k]) return;
  /* 이미 묻고 있는 중이면 한 번 더 묻는 것은 한도만 쓰는 일입니다. 예전에는
     `fetchLook` 이 앞의 요청을 끊는 것으로 이 일을 했는데, 이제 끊는 표는 열림
     전체의 것이라 여기서 막습니다. */
  if(words[k].aiLoading) return;
  const off = words[k].aiOff;
  /* 맛보기를 다 썼거나 서버가 로그인을 요구하면, 다시 부르는 것은 같은 답을
     한 번 더 받는 일입니다. 할 수 있는 일이 있는 곳으로 보냅니다. */
  if(off === 'trial' || off === 'login'){ openSyncModal(); return; }
  fetchLook(k, {});
}
document.getElementById('p-aibtn').onclick   = ()=>askAI();
/* 단어창을 열어 둔 채로 연결이 끊기거나 돌아올 수 있습니다. 안내 한 줄은 지금
   연결 상태를 그대로 읽으므로(위 `off`), 그 순간 한 번 다시 그리면 됩니다. */
addEventListener('online',  () => { if(selKey) renderWordLookup(); });
addEventListener('offline', () => { if(selKey) renderWordLookup(); });

async function fillDictionaryMetadata(k,life,force=false){
  const w=words[k];if(!w||previewWordCard)return;
  const selected=activeSelectedWordNode;
  if(homewardWordFor(w,selected))return;
  if(w.defs&&w.defs.length)return;
  if(englishCardRequests.has(w)){
    await englishCardRequests.get(w);
    if(wordLookupAlive(life)&&words[k]===w)return fillDictionaryMetadata(k,life,force);
    return;
  }
  if(!force&&w.enProvider==='v2'&&w.enRetryAt>Date.now())return;
  w.enProvider='v2';
  // An expression is looked up as an expression, never as one of its members.
  const canonical=String(w.word||w.root||k).trim().toLowerCase();
  const forms=[...new Set([canonical,...(/\s/.test(canonical)?[]:(w.forms||[]))])]
    .filter(f=>/^[a-z][a-z'’ -]*$/i.test(f)).slice(0,2);
  if(!forms.length)return;
  w.enLoading=true;delete w.enError;
  const work=(async()=>{
    try{
      for(const form of forms){
        const result=await fetchEnMetadata(form,force);
        if(!wordLookupAlive(life)||words[k]!==w)return;
        if(result.missing)continue;
        Object.assign(w,{defs:result.defs,phon:result.phon,definitionSource:result.source,definitionSourceWord:result.sourceWord});
        delete w.enRetryAt;return;
      }
      if(words[k]===w)w.enRetryAt=Date.now()+86400000;
    }catch(error){
      if(words[k]===w&&wordLookupAlive(life)){w.enError=true;w.enRetryAt=Date.now()+30000;}
    }finally{
      delete w.enLoading;englishCardRequests.delete(w);
      if(words[k]===w&&wordLookupAlive(life)){saveWords();renderIfAlive(life);}
    }
  })();
  englishCardRequests.set(w,work);return work;
}

async function fetchDict(k,node){
  const w=words[k];if(!w)return;
  const life=wordLookupLife,began=Date.now();
  w.loading=true;w.aiLoading=true;renderIfAlive(life);
  const local=homewardWordFor(w,node);
  const metadata=local?null:fillDictionaryMetadata(k,life);
  const cached=await loadCachedLook(k,began,life,node);
  if(!cached&&wordLookupAlive(life)){delete w.aiLoading;await fetchLook(k,{life,node});}
  await metadata;
  if(!words[k]&&selKey!==k)return;
  if(words[k]){delete words[k].loading;delete words[k].aiLoading;words[k].up=Date.now();}
  saveWords();if(words[k]&&hasResolvedMeaning(words[k]))queueSync();renderIfAlive(life);
}

document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&wordLookupOpen()){
    event.preventDefault();closePanel();
  }
});
function wordPeekViewportChanged(){
  if(wordPeekActive) requestAnimationFrame(placeWordPeek);
  if(wordDetailAnchored){stopWordMorph();requestAnimationFrame(placeWordDetail);}
}
window.addEventListener('resize',wordPeekViewportChanged,{passive:true});
if(window.visualViewport) window.visualViewport.addEventListener('resize',wordPeekViewportChanged,{passive:true});

/* ================= vocab ================= */
/* 단어장은 **먼저 단어를 훑는 곳**입니다. 그래서 접혀 있을 때 한 줄에 있는 것은
   [단어] [뜻] [★] 셋뿐입니다. 예전에는 여섯 칸짜리 표였는데, 375px 화면에서
   표가 637px 이라 별과 삭제가 화면 밖에 있었고(가로로 밀어야 닿았습니다) 예문
   세 줄 때문에 한 줄이 108px 였습니다 — 27개가 네 화면이었습니다.
   표를 쓴 이유는 `rowspan` 하나였습니다. 같은 표제어의 뜻들을 단어 한 칸 아래로
   묶는 일인데, 그건 뜻 칸 안에서 줄을 잇는 것으로 충분합니다. 단어와 뜻의 가로
   대응은 그대로 남고 가로 스크롤만 사라집니다. */
/* 펼침은 화면에만 있는 상태입니다 — 저장하지도, 동기화하지도, `words` 에 넣지도
   않습니다. 별을 누르거나 동기화가 도착하면 목록 전체를 다시 그리므로, 열어 둔
   자리를 기억할 곳이 어딘가에는 있어야 합니다. */
const vocabOpen = new Set();
function renderVocab(){
  const list = Object.entries(words).filter(([,item])=>validWordMeaning(item))
    .sort((a,b)=>b[1].addedAt-a[1].addedAt);
  const q = document.getElementById('vsearch').value.trim().toLowerCase();
  const grouped=new Map();
  list.forEach(([k,w])=>{
    const groupKey=w.root||k;
    if(!grouped.has(groupKey)) grouped.set(groupKey,[]);
    grouped.get(groupKey).push([k,w]);
  });
  const groups=filterWordbookGroups([...grouped.entries()],q);
  renderWordbookBookOptions(list);
  document.getElementById('vcnt').textContent = groups.length===grouped.size ? `전체 ${grouped.size}단어` : `전체 ${grouped.size}단어 · ${groups.length}개 표시`;
  syncWordbookFilterLabels();
  const wrap = document.getElementById('vtablewrap');
  if(!groups.length){ wrap.innerHTML = list.length ? '<div id="vempty">검색·필터에 맞는 단어가 없어요.</div>' : '<div id="vempty">아직 저장된 단어가 없어요.<br>책을 읽다가 모르는 단어를 누르거나 +로 추가해 보세요.</div>'; return; }
  const stName = {1:'★',2:'★★',3:'★★★'};
  wrap.innerHTML = groups.map(([groupKey,entries])=>{
    /* 대표 뜻을 먼저 두되, 같은 표제어의 문맥 카드들은 단어 한 칸 아래로 묶습니다.
       학습 데이터는 분리된 채라 별·삭제·예문은 각각 독립입니다. */
    entries.sort((a,b)=>(a[0]===((a[1].root)||a[0])?-1:0)-(b[0]===((b[1].root)||b[0])?-1:0)
      || (b[1].addedAt||0)-(a[1].addedAt||0));
    const first=entries[0][1], open=vocabOpen.has(groupKey);
    /* 별은 낱말 하나에 하나입니다. 그 하나가 어느 레코드에 사는지는 이미 정해져
       있습니다 — 본문 색칠이 그 값을 씁니다. reader.js 는 낱말 조각에
       `data-w="keyOf(단어)"` 를 붙이고(뜻 카드의 주소는 본문에 나오지 않습니다),
       `paintWord` 는 그 주소로 색을 칠합니다. 그러니 표제어의 "모르는 정도"는
       언제나 대표 레코드(`w.root||k`)의 것입니다. 여기서 새로 정하는 규칙은
       없고, 그 값을 그대로 보여 주고 그대로 바꿉니다.
       대표 레코드가 없을 수 있는 경우는 하나뿐입니다 — 아래 ✕ 로 대표 뜻만
       지우고 딸린 뜻이 남았을 때. 그때는 남은 첫 뜻이 화면의 표제어이므로
       별도 그 레코드의 것을 씁니다(정렬이 이미 그 뜻을 맨 앞에 둡니다). */
    const headKey = words[groupKey] ? groupKey : entries[0][0];
    const head = words[headKey];
    return `<div class="vgroup${open?' open':''}" data-g="${esc(groupKey)}" data-head="${esc(headKey)}">
      <div class="vrow">
        <div class="vword" role="button" tabindex="0" aria-expanded="${open}">${esc(first.word)}</div>
        <div class="vsenses">${entries.map(([k,w])=>`
          <div class="vsense" data-k="${esc(k)}">
            <div class="vko"${open?' contenteditable="true" spellcheck="false"':''}>${esc(w.ko||'')}</div>
            ${open?`<div class="vmore">
              ${w.example?`<div class="vex">${esc(w.example)}</div>`:''}
              <div class="vmeta">${w.book?`📖 ${esc(w.book)} · `:''}${new Date(w.addedAt).toLocaleDateString('ko-KR')}</div>
              <button class="rowdel" title="이 뜻만 삭제">✕ 이 뜻 삭제</button>
            </div>`:''}
          </div>`).join('')}</div>
        <button class="chip s${head.status}" title="클릭해서 모르는 정도 바꾸기">${stName[head.status]}</button>
      </div>
    </div>`;
  }).join('');
  wrap.querySelectorAll('.vgroup').forEach(node=>{
    const group = /** @type {HTMLElement} */(node);
    const groupKey = group.dataset.g;
    const toggle = ()=>{
      if(vocabOpen.has(groupKey)) vocabOpen.delete(groupKey); else vocabOpen.add(groupKey);
      renderVocab();
    };
    /* 접었다 펴는 일은 줄 전체가 받습니다. 별·삭제·펼친 속은 각자 할 일이 있어서
       여기서 한 번에 비켜 줍니다 — 세 곳에 stopPropagation 을 흩뿌리는 것보다
       "무엇이 토글이 아닌지"가 한 줄에 모여 있는 편이 나중에 읽힙니다.
       펼쳤을 때의 뜻은 `contenteditable` 이라 여기서 함께 걸러집니다: 고치려고
       누른 손이 창을 닫아 버리면 고칠 수가 없습니다. */
    group.addEventListener('click', event=>{
      if((/** @type {HTMLElement} */(event.target)).closest('.chip, .rowdel, .vmore, [contenteditable]')) return;
      toggle();
    });
    /** @type {HTMLElement} */(group.querySelector('.vword')).addEventListener('keydown', event=>{
      const key=(/** @type {KeyboardEvent} */(event)).key;
      if(key==='Enter' || key===' '){ event.preventDefault(); toggle(); }
    });
    const headKey = group.dataset.head;
    /** @type {HTMLElement} */(group.querySelector('.chip')).onclick = ()=>{
      setStatus(headKey, words[headKey].status%3+1); renderVocab();
    };
    group.querySelectorAll('.vsense').forEach(row=>{
      const sense = /** @type {HTMLElement} */(row);
      const k = sense.dataset.k;
      const del = /** @type {HTMLElement} */(sense.querySelector('.rowdel'));
      if(del) del.onclick = ()=>{ deleteMeaning(k); renderVocab(); };
      sense.querySelector('.vko').addEventListener('blur', event=>{
        if(!words[k]) return;
        const value=(/** @type {HTMLElement} */(event.target)).textContent.trim();
        if(!value){ deleteMeaning(k); renderVocab(); return; }
        words[k].ko=value; words[k].koEdited=true; words[k].up=Date.now();
        saveWords(); queueSync();
      });
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
async function deliverVocabularyCsv(csv){
  const file=new File([csv],'breeze_vocab.csv',{type:'text/csv;charset=utf-8'});
  const bridge=/** @type {any} */(window).webkit?.messageHandlers?.breezeVocabularyExport;
  if(bridge){
    await new Promise((resolve,reject)=>{
      const id=String(Date.now())+'-'+Math.random().toString(36).slice(2);
      const done=event=>{
        if(event.detail?.id!==id) return;
        window.removeEventListener('breeze-vocabulary-export',done);
        event.detail.error?reject(new Error(event.detail.error)):resolve(undefined);
      };
      window.addEventListener('breeze-vocabulary-export',done);
      try{bridge.postMessage({id,csv});}catch(error){window.removeEventListener('breeze-vocabulary-export',done);reject(error);}
    });
    return;
  }
  if(navigator.canShare?.({files:[file]}) && navigator.share){
    await navigator.share({files:[file]});
    return;
  }
  if(isNativeShell()) throw new Error('내보내기를 지원하는 앱 버전이 필요해요');
  const url=URL.createObjectURL(file),link=document.createElement('a');
  link.href=url;link.download=file.name;
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
document.getElementById('btn-export').onclick = async ()=>{
  const list = Object.values(words).filter(validWordMeaning).sort((a,b)=>b.addedAt-a.addedAt);
  if(!list.length){ toast('내보낼 단어가 없어요'); return; }
  const stName = {1:'★',2:'★★',3:'★★★'};
  const rows = [['단어','뜻','영어 뜻','예문','모르는 정도','책','저장일'],
    ...list.map(w=>[w.word, w.ko||'', (w.defs||[]).map(d=>`(${d.pos}) ${d.def}`).join(' / '),
      w.example||'', stName[w.status], w.book||'', new Date(w.addedAt).toLocaleDateString('ko-KR')])];
  /* 엑셀은 BOM 이 없으면 CSV 를 라틴1로 읽어 한글을 깹니다. */
  const csv = '﻿' + rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
  const button=/** @type {HTMLButtonElement} */(document.getElementById('btn-export'));
  if(button.disabled) return;
  button.disabled=true;
  try{await deliverVocabularyCsv(csv);}
  catch(error){if(error.name!=='AbortError') toast('단어장을 내보내지 못했어요. 다시 시도해 주세요.');}
  finally{button.disabled=false;}
};
