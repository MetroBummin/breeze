// Legacy table-of-contents and full-book AI tidy implementation
//
// Disabled during the clean-code refactor on 2026-08-05.
// The table-of-contents button and its execution path were intentionally removed.
// Every legacy line below stays commented so it can be consulted without running.
//
// The old dictionary warm-up also called /functions/v1/tidy with mode=ping.
// That active call was removed together with the disabled tidy function.
//
// LEGACY CSS
// /* ---------- 목차 ---------- */
//   #toc-sheet{position:fixed; inset:0; z-index:175; background:rgba(24,54,74,.35); display:none;
//     align-items:center; justify-content:center; padding:20px;}
//   #toc-sheet.on{display:flex;}
//   #toc-card{background:var(--paper2); border-radius:20px; width:min(520px,100%); max-height:76vh;
//     display:flex; flex-direction:column; box-shadow:var(--shadow); overflow:hidden;}
//   body.dark #toc-card{background:#1F2327;}
//   #toc-head{display:flex; align-items:center; padding:16px 20px 12px; border-bottom:1px solid var(--line);}
//   #toc-head span{font-size:15px; font-weight:600; color:var(--ink); flex:1;}
//   #toc-head button{border:none; background:none; font-size:16px; color:var(--soft); cursor:pointer;}
//   /* overscroll-behavior: 목록 끝까지 내렸을 때 뒤에 있는 책이 따라 스크롤되는 것을 막습니다.
//      이 속성을 모르는 구형 브라우저를 위해 아래 JS에서 한 번 더 막아 둡니다. */
//   #toc-list{overflow-y:auto; -webkit-overflow-scrolling:touch; overscroll-behavior:contain; padding:6px 0 12px;}
//   #toc-sheet{overscroll-behavior:contain;}
//   .toc-i{display:flex; align-items:baseline; gap:9px; width:100%; text-align:left; border:none;
//     background:none; cursor:pointer; padding:11px 18px; font-size:14.5px; color:var(--ink);
//     font-family:var(--serif); line-height:1.45;}
//   .toc-i:hover{background:var(--sky);}
//   .toc-i .tt{flex:1; min-width:0;}
//   .toc-i .tt small{display:block; font-size:11.5px; color:var(--soft2); font-family:var(--ui);
//     margin-top:3px; line-height:1.4; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
//   .toc-i .tm{flex:none; font-size:11.5px; color:var(--soft2); font-family:var(--ui);}
//   .toc-i .tw{flex:none; width:14px; text-align:center; color:var(--soft2); font-family:var(--ui);
//     font-size:13px; transition:transform .15s; align-self:center;}
//   .toc-i .tw.open{transform:rotate(90deg);}
//   .toc-i .tw.off{color:transparent;}
//   .toc-i.l2{padding-left:41px; font-size:13.5px; color:var(--soft);}
//   .toc-i.l3{padding-left:60px; font-size:12.5px; color:var(--soft2);}
//   .toc-i.here{color:var(--blue);}
//   .toc-i.here .tt{font-weight:600;}
//   .toc-i.l1{font-weight:500;}
//   #toc-empty{padding:34px 20px; text-align:center; color:var(--soft); font-size:13.5px; line-height:1.8;}
//   #aa-tidy-row{display:none; padding:12px 20px; border-bottom:1px solid var(--line); gap:12px;
//     align-items:center; background:var(--sky); flex:none;}
//   #aa-tidy-row.on{display:flex;}
//   body.dark #aa-tidy-row{background:#1B2429;}
//   #aa-tidy-row .aa-label{flex:1; font-size:13.5px; color:var(--ink);}
//   #aa-tidy-row .aa-label small{display:block; font-size:10.5px; color:var(--soft2); font-weight:400; letter-spacing:0;}
//   #aa-tidy-row .aa-label small.warn{color:#B08A3E;}
//   body.dark #aa-tidy-row .aa-label small.warn{color:#C9A253;}
//   #aa-tidy-run{border:1px solid var(--line); background:none; border-radius:14px; padding:6px 12px;
//     font-size:12.5px; color:var(--blue); font-family:var(--ui); cursor:pointer; white-space:nowrap;}
//   #aa-tidy-run:hover{background:var(--sky);}
//   #aafab:hover{color:var(--blue);}
//   body.scrolling #focusbtn, body.scrolling #aafab{opacity:.3;}
//   body.dark #aafab{background:rgba(31,35,39,.9); border-color:#2A2E33;}
//   .aa-legend{display:flex; flex-direction:column; gap:5px; font-size:11.5px; color:var(--soft);
//     padding-bottom:10px; margin-bottom:4px; border-bottom:1px solid var(--line);}
//   .aa-legend i{display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:6px; vertical-align:0;}
//   #focusbtn:hover{color:var(--blue);}
//   body.focusmode #topbar, body.focusmode #rbar, body.focusmode #rhint{display:none;}
//   
// 
// LEGACY HTML
// <div id="toc-sheet"><div id="toc-card">
//   <div id="toc-head"><span>목차</span><button onclick="closeToc()">✕</button></div>
//   <div class="aa-row" id="aa-tidy-row">
//     <span class="aa-label">AI 정리<small id="aa-tidy-sub"></small></span>
//     <button id="aa-tidy" class="aa-toggle" onclick="toggleTidy()"><i></i></button>
//     <button id="aa-tidy-run" onclick="tidyNow()">정리하기</button>
//   </div>
//   <div id="toc-list"></div>
// </div></div>
// <button id="tocfab" title="목차" onclick="openToc()">
//   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
//     <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>
// </button>
// 
// 
// LEGACY JAVASCRIPT
// /* ================= AI 반입 정리 =================
//    AI는 책을 처음부터 끝까지 읽습니다. 대신 글자는 단 한 자도 돌려받지 않습니다.
//    돌려받는 것은 위치 지시뿐입니다 — 몇 번 문단이 제목이고, 어디가 인용문이고, 어디가 찌꺼기인지.
//    제목 글자는 언제나 원문 문단에서 그대로 이어 붙여 만듭니다. AI가 지어낼 여지가 없습니다.
//    그래서 원문이 바뀔 수 없고, 언제든 꺼서 원래대로 되돌릴 수 있습니다. */
// const LS_TIDYOFF = 'breeze.tidyoff';
// let tidyOff = load(LS_TIDYOFF, {});       // { 책ID: true } — 이 책은 AI 정리를 끔
// function tidyActive(b){ return !!(b && b.tidy && !tidyOff[b.id]); }
// 
// /* 서버로 보낼 한 줄. 문단을 자르지 않고 전문 그대로 보냅니다.
//    앞부분만 보내면 AI가 "이 줄로 문장이 끝나는지"를 알 수 없어서
//    대사·목록 조각을 제목으로 착각합니다. 목차 품질은 여기서 갈립니다. */
// const TIDY_PARA_CAP = 3000;     // 비정상적으로 긴 문단만 잘라 냄(사고 방지)
// function tidyItem(paras, i){
//   const p = paras[i];
//   return { i:i, n:p.length, t: p.length <= TIDY_PARA_CAP ? p : p.slice(0, TIDY_PARA_CAP) };
// }
// const NUMWORD = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen'
//               + '|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|\\d{1,2}';
// const NUMWORD_LEAD = new RegExp('^(?:' + NUMWORD + ')\\s+(?=(?:chapter|part|book)\\b)', 'i');
// const NUMWORD_ONLY = new RegExp('^(?:' + NUMWORD + ')[.)]?$', 'i');
// /* 떨어져 나온 장 번호를 제자리에 끼워 넣습니다.
//    "Chapter Get The Love You Want" + "Seven" → "Chapter Seven Get The Love You Want" */
// function tocPutNum(t, num){
//   if(!t || !num) return t;
//   const m = t.match(/^(chapter|part|book)\s+/i);
//   if(!m) return t;
//   const rest = t.slice(m[0].length);
//   if(NUMWORD_ONLY.test((rest.split(/\s+/)[0] || ''))) return t;   // 번호가 이미 있음
//   return m[0] + num + ' ' + rest;
// }
// 
// /* 책의 목차 페이지에서 장 제목 목록을 뽑습니다.
//    목차 페이지는 대개 2단으로 짜여 있어서 번호와 제목이 서로 다른 줄에 떨어집니다.
//      26| Chapter Get The Love You Want: Success Strategies…
//      27| Seven                                    ← 26번의 번호
//      29| Eight Chapter Nine Get the Life You Want… ← 앞의 Eight는 28번의 번호
//    번호만 있는 조각을 버리지 않고 앞 항목에 되돌려 놓습니다. */
// function tidyBookToc(paras, from, to){
//   const out = [];
//   if(!(from >= 0) || !(to >= from)) return out;
//   for(let i=from; i<=to && i<paras.length; i++){
//     let t = (paras[i]||'').trim();
//     if(!t || paras[i].startsWith(IMG_MARK) || t.length > 140) continue;
//     let carry = '';
//     const lead = t.match(NUMWORD_LEAD);
//     if(lead){ carry = lead[0].trim(); t = t.slice(lead[0].length).trim(); }
//     else if(NUMWORD_ONLY.test(t)){ carry = t.replace(/[.)]$/, ''); t = ''; }
//     if(carry && out.length) out[out.length-1] = tocPutNum(out[out.length-1], carry);
//     if(t) out.push(t);
//   }
//   return out;
// }
// 
// /* 제목일 수 없는 글자. 어느 경로로 판정됐든(AI든 조판 신호든) 마지막에 한 번 더 거릅니다.
//    AI가 본문 문단을 제목이라고 우겨도 여기서 걸러야 목차에 본문이 통째로 들어가지 않습니다. */
// function badHeadText(t){
//   t = (t || '').trim();
//   if(!t) return true;
//   if(t.length > 110) return true;                        // 제목은 이렇게 길지 않습니다
//   if(endsSentence(t) && t.length > 45) return true;      // 문장으로 끝나는 긴 줄은 본문입니다
//   if(/^["“'']/.test(t) && t.length > 40) return true;    // 따옴표로 시작하는 긴 줄은 대사입니다
//   if((t.match(/[.!?]/g) || []).length >= 2) return true; // 문장이 둘 이상이면 본문입니다
//   return false;
// }
// 
// /* 제목끼리 얼마나 같은지 — 책이 스스로 적어 둔 목차와 본문 제목을 맞출 때 씁니다 */
// function tocWords(s){ return String(s||'').toLowerCase().match(/[a-z0-9]+/g) || []; }
// 
// /* PDF는 제목 마지막 줄을 본문 첫 문단 앞에 붙여 놓곤 합니다.
//      707| Chapter        708| Reclaim Your
//      709| Personal Power One Saturday morning a few years back, my wife…
//    제목은 이미 온전히 그렸으므로 본문에 남은 "Personal Power"는 군더더기입니다.
//    제목에서 아직 안 쓴 단어가 본문 맨 앞에 그대로 이어질 때만, 그만큼의 글자 수를 셉니다.
//    글자를 고쳐 쓰는 게 아니라 "여기부터 본문"이라는 위치를 기록할 뿐입니다. */
// function tocTrimLead(title, headText, para){
//   const used = {};
//   tocWords(headText).forEach(function(w){ used[w] = (used[w]||0) + 1; });
//   const rest = {};
//   tocWords(title).forEach(function(w){
//     if(used[w]) used[w]--; else rest[w] = (rest[w]||0) + 1;
//   });
//   const re = /[A-Za-z0-9]+/g;
//   let m, cut = 0, n = 0;
//   while((m = re.exec(para))){
//     const w = m[0].toLowerCase();
//     if(!rest[w]) break;
//     rest[w]--; n++; cut = m.index + m[0].length;
//   }
//   return n >= 2 ? cut : 0;      // 두 단어 이상 이어질 때만 — 우연한 한 단어는 그냥 둡니다
// }
// const TOC_HIT = 0.6;            // 목차 항목의 이만큼이 들어 있으면 같은 제목으로 봅니다
// 
// /* 목차 항목(t)이 본문 후보(u)의 **앞머리**에 얼마나 들어 있는지 (0~1).
//    두 가지를 견뎌야 합니다.
//    ① PDF가 번호를 흘림 — 본문에는 "Chapter / Reclaim Your / Masculinity" 뿐이고 "Six"가 없음.
//       목차 쪽 단어를 기준으로 세므로 몇 개 빠져도 점수가 남습니다.
//    ② 제목 끝이 본문에 눌어붙음 — "Personal Power One Saturday morning a few years back…".
//       후보의 앞부분만 보므로 뒤에 붙은 본문이 점수를 흐리지 않습니다.
//    분모가 언제나 목차 항목 쪽이라는 게 핵심입니다. 짧은 쪽으로 나누면
//    "Reclaim Your" 두 단어가 다섯 단어짜리 제목에 만점을 받아 엉뚱한 곳에 장이 박힙니다. */
// function tocLead(t, u){
//   const a = tocWords(t);
//   if(!a.length) return 0;
//   const b = tocWords(u).slice(0, a.length + 3);   // 목차 길이 + 약간의 여유만 봅니다
//   if(!b.length) return 0;
//   const seen = {};
//   b.forEach(function(w){ seen[w] = (seen[w]||0) + 1; });
//   let hit = 0;
//   a.forEach(function(w){ if(seen[w]){ seen[w]--; hit++; } });
//   return hit / a.length;
// }
// function bestTocMatch(t, list, from){
//   let bestAt = -1, best = 0;
//   for(let k=from; k<list.length; k++){
//     const score = tocLead(list[k], t);
//     if(score > best){ best = score; bestAt = k; }
//   }
//   return best >= TOC_HIT ? bestAt : -1;
// }
// 
// /* 이 문단이 "제목 단어로만" 이루어져 있는지 (0~1).
//    길이로 재면 안 됩니다. PDF는 제목 끝줄에 본문 첫 문장을 붙여 놓는 일이 잦은데
//      571| A Priority "I want you to know that I'm really uncomfortable…"
//    이건 104자짜리 짧은 문단이지만 대부분이 본문입니다. 길이로 걸렀다간 본문을 먹습니다.
//    반대로 한 줄로 온전히 적힌 긴 제목은 길이로 걸러선 안 됩니다. */
// function tocOwn(tw, para){
//   const b = tocWords(para);
//   if(!b.length) return 0;
//   let hit = 0;
//   b.forEach(function(w){ if(tw[w]) hit++; });
//   return hit / b.length;
// }
// 
// /* 책 목차에는 있는데 AI가 놓친 장을 본문에서 직접 찾아 채웁니다.
//    AI가 한 구간을 통째로 실패했더라도 여기서 장이 되살아납니다.
//    이미 확정된 앞 장의 뒤쪽만 뒤지므로 순서가 뒤집힐 수 없습니다. */
// const SWEEP_OWN = 0.8;          // 문단의 이만큼이 제목 단어여야 제목 줄로 칩니다
// const SWEEP_MAX = 200;          // 제목치고 이보다 길면 아예 보지 않습니다
// const SWEEP_RUN = 8;            // 큰 글씨 제목은 이만큼 잘게 쪼개지기도 합니다
// function tocSweep(paras, bookToc, anchor, heads, taken, start, add){
//   for(let k=0; k<bookToc.length; k++){
//     if(anchor[k] >= 0) continue;                       // 이미 찾은 장
//     let lo = start, hi = paras.length;
//     for(let j=k-1; j>=0; j--) if(anchor[j] >= 0){ lo = anchor[j] + 1; break; }
//     for(let j=k+1; j<bookToc.length; j++) if(anchor[j] >= 0){ hi = anchor[j]; break; }
// 
//     const tw = {};
//     tocWords(bookToc[k]).forEach(function(w){ tw[w] = 1; });
// 
//     let bestAt = -1, bestN = 0, best = 0;
//     for(let i=lo; i<hi; i++){
//       const p0 = paras[i];
//       if(p0 === undefined || p0.startsWith(IMG_MARK) || heads[i]) continue;
//       if(p0.length > SWEEP_MAX || tocOwn(tw, p0) < SWEEP_OWN) continue;  // 제목 줄에서만 시작
//       let t = '', headN = 0;
//       for(let n=1; n<=SWEEP_RUN && i+n-1 < hi; n++){
//         const p = paras[i+n-1];
//         if(p === undefined || p.startsWith(IMG_MARK) || heads[i+n-1]) break;
//         t += (t ? ' ' : '') + p;
//         const mine = p.length <= SWEEP_MAX && tocOwn(tw, p) >= SWEEP_OWN;
//         if(mine) headN = n;                            // 제목으로 삼는 건 제목 줄까지
//         const s = tocLead(bookToc[k], t);
//         if(headN && s > best + 1e-9){ best = s; bestAt = i; bestN = headN; }
//         /* 본문이 섞인 문단은 점수를 매기는 데만 쓰고 본문으로 남깁니다.
//            제목 끝이 본문 첫 줄에 눌어붙은 걸 알아보되, 본문을 먹지는 않습니다. */
//         if(!mine) break;
//       }
//     }
//     if(bestAt >= 0 && best >= TOC_HIT){
//       anchor[k] = bestAt;
//       add(bestAt, bestN, bookToc[k]);
//       for(let d=0; d<bestN; d++) taken[bestAt+d] = 1;
//     }
//   }
// }
// 
// async function tidyCall(mode, items, title, extra){
//   const got = await sb.auth.getSession();
//   const session = got && got.data ? got.data.session : null;
//   const payload = { mode:mode, items:items, title:title||'' };
//   if(extra){ for(const k in extra) payload[k] = extra[k]; }
//   const r = await fetch(SB_URL.replace(/\/$/,'') + '/functions/v1/tidy', {
//     method:'POST',
//     headers:{ 'Content-Type':'application/json',
//               'Authorization':'Bearer ' + (session ? session.access_token : SB_KEY),
//               'apikey': SB_KEY },
//     body: JSON.stringify(payload)
//   });
//   let j = null; try{ j = await r.json(); }catch(e){}
//   if(!r.ok || !j || j.error) throw new Error((j && j.error) || ('http_'+r.status));
//   return j;
// }
// /* 배치는 문단 수가 아니라 글자 수로 끊습니다. 문단 길이가 책마다 천차만별이라
//    문단 수로 끊으면 어떤 책은 한 번에 너무 많이, 어떤 책은 너무 적게 보내게 됩니다. */
// const TIDY_CHARS = 45000;   // 한 번에 보낼 글자 수 (≈ 1.2만 토큰)
// const TIDY_MAX_ITEMS = 500; // 서버 상한(600)보다 낮게
// const TIDY_OVERLAP = 6;     // 구간 경계에서 제목이 잘리지 않도록 겹쳐 읽기
// 
// /* 본문을 글자 수 기준 구간으로 나눕니다. 책이 길면 구간이 늘 뿐, 잘려 나가지 않습니다. */
// function tidyBatches(paras, body){
//   const out = [];
//   let cur = [], chars = 0;
//   for(let k=0; k<body.length; k++){
//     const i = body[k];
//     const len = Math.min(paras[i].length, TIDY_PARA_CAP);
//     if(cur.length && (chars + len > TIDY_CHARS || cur.length >= TIDY_MAX_ITEMS)){
//       out.push(cur);
//       cur = cur.slice(Math.max(0, cur.length - TIDY_OVERLAP));  // 경계 겹치기
//       chars = cur.reduce(function(s, j){ return s + Math.min(paras[j].length, TIDY_PARA_CAP); }, 0);
//     }
//     cur.push(i); chars += len;
//   }
//   if(cur.length) out.push(cur);
//   return out;
// }
// /* 조판 단서를 책에 저장할 때 쓸모없는 것은 버립니다.
//    본문 문단은 z=1, 굵기·가운데·들여쓰기 없음이라 저장할 게 없습니다.
//    실제로는 1600문단 중 50개 안팎만 남습니다. */
// function packSig(sig){
//   if(!sig) return null;
//   const out = new Array(sig.length);
//   let kept = 0;
//   for(let i=0;i<sig.length;i++){
//     const s = sig[i];
//     if(!s){ out[i] = null; continue; }
//     const keep = s.r || (s.z||1) >= 1.05 || s.b || s.c || (s.in||0) >= 0.05;
//     out[i] = keep ? s : null;
//     if(keep) kept++;
//   }
//   return kept ? out : null;
// }
// 
// /* ===== 싼 경로: 제목 후보만 AI에 보내기 =====
//    본문을 통째로 보내지 않습니다. 조판 신호로 뽑은 제목 후보와, 그 뒤에 오는 첫 문장 80자만
//    보냅니다. 실측(No More Mr. Nice Guy)으로 후보가 50개라 약 1,500토큰 — 전권 8만 토큰의 2%.
//    v22에서 실패한 "후보만 보내기"와 다른 점은 후보를 고르는 기준입니다. 그때는 글자로
//    추측했고(짧은 줄+대문자), 지금은 조판이 남긴 신호(크기·굵기·가운데)를 씁니다. */
// function headCandidates(paras, sig){
//   const out = [];
//   if(!sig) return out;
//   for(let i=0; i<paras.length; i++){
//     const s = sig[i];
//     if(!s || paras[i].startsWith(IMG_MARK)) continue;
//     const r = s.r || '';
//     const z = s.z || 1;
//     /* 확정 제목보다 그물을 넓게 칩니다 — 애매한 것도 AI에게 물어보는 게 낫습니다.
//        어차피 후보는 짧은 줄이라 몇 개 늘어도 토큰이 거의 안 늘어납니다. */
//     const near = r.charAt(0) === 'h' || z >= 1.05 || s.b || s.c;
//     if(!near || badHeadText(paras[i])) continue;
//     let x = '';
//     for(let k=i+1; k<paras.length && k<i+4; k++){
//       if(paras[k].startsWith(IMG_MARK)) continue;
//       x = paras[k].slice(0, 80); break;                 // 뒤따르는 문장 = 장이 열리는지 판단할 실마리
//     }
//     out.push({ i:i, t:paras[i].slice(0,110), x:x, z:+z.toFixed(2), b:!!s.b, c:!!s.c });
//   }
//   return out;
// }
// 
// /* 연달아 붙은 같은 종류를 한 덩어리로 묶습니다 (인용문 상자용) */
// function runsOf(paras, sig, kind){
//   const out = [];
//   let i = 0;
//   while(i < paras.length){
//     if(sigRole(sig[i]) !== kind){ i++; continue; }
//     let n = 1;
//     while(i+n < paras.length && sigRole(sig[i+n]) === kind) n++;
//     out.push({ i:i, n:Math.min(n,10), k:kind });
//     i += n;
//   }
//   return out;
// }
// 
// async function runTidyFast(paras, sig, title, onStep){
//   const cand = headCandidates(paras, sig);
//   if(cand.length < 3) return null;                      // 후보가 없으면 전권 읽기로 넘깁니다
// 
//   if(onStep) onStep('앞부분을 살펴보는 중…');
//   const idx = [];
//   for(let i=0;i<paras.length;i++) if(!paras[i].startsWith(IMG_MARK)) idx.push(i);
//   const head = idx.slice(0, 140).map(function(i){
//     return { i:i, n:paras[i].length, t:paras[i].slice(0,70) };
//   });
//   const f = await tidyCall('front', head, title);
//   const start = f.start || 0;
//   const bookToc = tidyBookToc(paras, f.tocFrom, f.tocTo);
// 
//   if(onStep) onStep('목차를 정리하는 중… (후보 ' + cand.length + '개)');
//   const use = cand.filter(function(c){ return c.i >= start; }).slice(0, 400);
//   const r = await tidyCall('levels', use, title, { toc: bookToc });
//   const lv = {};
//   (r.levels || []).forEach(function(x){ lv[x.i] = x.l; });
// 
//   /* AI가 준 단계 + 조판으로 잡은 인용문 → 기존 조립기에 그대로 태웁니다.
//      쪼개진 제목("Chapter"/"The Nice Guy"/"Syndrome")은 후보마다 따로 판정되므로
//      여기서 다시 한 줄로 묶어 줍니다. 안 그러면 장 하나가 목차에 세 줄로 따로 뜹니다.
//      (sigStructure 의 무료 경로에 있던 것과 같은 병합 규칙입니다.) */
//   const raw = [];
//   const merged = {};
//   use.forEach(function(c){
//     if(merged[c.i] || !(lv[c.i] > 0)) return;
//     let t = paras[c.i], n = 1, lev = lv[c.i];
//     while(paras[c.i+n] !== undefined && lv[c.i+n] > 0
//           && (t + ' ' + paras[c.i+n]).length < 130 && !endsSentence(t) && n < 6){
//       merged[c.i+n] = 1;
//       t += ' ' + paras[c.i+n];
//       lev = Math.min(lev, lv[c.i+n]);
//       n++;
//     }
//     raw.push({ i:c.i, n:n, k:'head', l:lev });
//   });
//   runsOf(paras, sig, 'quote').forEach(function(q){ if(q.i >= start && !lv[q.i]) raw.push(q); });
// 
//   const built = tidyBuildToc(paras, raw, bookToc, start);
//   if(!built.toc.length) return null;
//   if(!blocksIntact(paras, built.blocks)) throw new Error('text_mismatch');
//   return { start:start, why:f.why||'', blocks:built.blocks, toc:built.toc,
//            levels:built.levels, title:f.title||'', author:f.author||'',
//            src:'fast', at:Date.now() };
// }
// 
// async function runTidy(paras, title, onStep){
//   const idx = [];
//   for(let i=0;i<paras.length;i++) if(!paras[i].startsWith(IMG_MARK)) idx.push(i);
//   if(idx.length < 20) throw new Error('too_short');
// 
//   /* 1) 앞단 자르기 + 이 책이 스스로 적어 둔 목차 페이지 위치 */
//   if(onStep) onStep('앞부분을 살펴보는 중…');
//   const head = idx.slice(0, 140).map(function(i){
//     return { i:i, n:paras[i].length, t:paras[i].slice(0,70) };
//   });
//   const f = await tidyCall('front', head, title);
//   const start = f.start || 0;
// 
//   /* 책이 적어 둔 목차 = 장 제목의 정답지. 본문 제목이 쪼개져 있어도 이걸로 복원합니다. */
//   const bookToc = tidyBookToc(paras, f.tocFrom, f.tocTo);
// 
//   /* 2) 구조 판정 — 책을 처음부터 끝까지, 문단 전문 그대로 순서대로 읽힙니다.
//         매 구간마다 책 자체 목차를 "정답지"로 같이 보내서, AI가 무엇을 찾아야 하는지
//         알고 읽게 합니다. 직전 구간에서 확정된 제목도 알려 줘 흐름이 끊기지 않게 합니다. */
//   const body = idx.filter(function(i){ return i >= start; });
//   const parts = tidyBatches(paras, body);
//   const raw = [];
//   let prevHead = '';
//   for(let b=0; b<parts.length; b++){
//     const part = parts[b].map(function(i){ return tidyItem(paras, i); });
//     if(onStep) onStep('책을 읽는 중… ' + (b+1) + '/' + parts.length);
//     try{
//       const h = await tidyCall('blocks', part, title, { toc: bookToc, prev: prevHead });
//       const got = h.blocks || [];
//       got.forEach(function(x){ raw.push(x); });
//       /* 이 구간에서 마지막으로 찾은 제목 — 다음 구간에 이어 붙일 실마리 */
//       for(let k=got.length-1; k>=0; k--){
//         if(got[k].k === 'head' && paras[got[k].i]){ prevHead = paras[got[k].i].slice(0,120); break; }
//       }
//     }catch(e){
//       /* 한 구간이 실패해도 전체를 멈추지 않습니다 — 그 구간은 그냥 본문으로 남습니다.
//          뒤에서 목차 보완(tocSweep)이 놓친 장을 다시 주워 담습니다. */
//       console.warn('tidy batch failed', b, e);
//       if(onStep) onStep('한 구간을 건너뛰었어요… ' + (b+1) + '/' + parts.length);
//     }
//   }
// 
//   const built = tidyBuildToc(paras, raw, bookToc, start);
//   /* 조립된 글자가 정말 원문에서만 왔는지 코드가 확인합니다.
//      어긋나면 정리를 쓰지 않습니다 — 원문이 조용히 달라지는 것보다 안 예쁜 편이 낫습니다. */
//   if(!blocksIntact(paras, built.blocks)) throw new Error('text_mismatch');
//   return { start:start, why:f.why||'', blocks:built.blocks, toc:built.toc,
//            levels:built.levels, title:f.title||'', author:f.author||'', at:Date.now() };
// }
// 
// /* AI가 준 블록 목록 → 화면용 지도 + 목차.
//    제목 글자는 언제나 본문에서 그대로 이어 붙여 만듭니다. AI가 지어낼 여지가 없습니다. */
// function tidyBuildToc(paras, raw, bookToc, start){
//   /* 겹치는 블록은 먼저 온 것이 이깁니다(번호 오름차순 → 넓은 것 순) */
//   const items = raw.slice().sort(function(a,b){ return a.i - b.i || (b.n||1) - (a.n||1); });
//   const taken = {};
//   const heads = {}, blocks = {}, drop = {}, toc = [];
//   /* 큰 글씨 제목은 PDF에서 "Chapter" / "Reclaim Your" / "Masculinity" 처럼 줄 단위로 쪼개집니다.
//      그대로 그리면 제목이 세 줄로 따로 놉니다. 그래서 첫 줄에 온전한 제목을 몰아 주고(htext)
//      나머지 조각은 그리지 않습니다(hskip). 글자는 원문 조각을 이어 붙인 것뿐입니다. */
//   const htext = {}, hskip = {}, htrim = {};
// 
//   items.forEach(function(x){
//     const i = x.i;
//     if(paras[i] === undefined || taken[i]) return;
//     const cap = x.k === 'head' ? 3 : 10;
//     let n = Math.max(1, Math.min(cap, x.n || 1));
//     while(n > 1 && (paras[i+n-1] === undefined || taken[i+n-1])) n--;
// 
//     /* 제목이라고 온 것부터 검문합니다. AI가 본문 문단을 제목이라고 우기는 일이 있는데,
//        그대로 받으면 목차에 본문이 통째로 한 줄로 들어갑니다. */
//     if(x.k === 'head'){
//       let t = '';
//       for(let d=0; d<n; d++){
//         const p = paras[i+d];
//         if(p === undefined || p.startsWith(IMG_MARK)) break;
//         t += (t ? ' ' : '') + p;
//       }
//       t = t.trim();
//       if(!t || badHeadText(t)) return;           // 본문으로 그냥 둡니다
//       for(let d=0; d<n; d++){
//         if(paras[i+d] === undefined || paras[i+d].startsWith(IMG_MARK)) break;
//         taken[i+d] = 1;
//         if(d === 0) heads[i] = x.l || 2; else hskip[i+d] = 1;
//       }
//       toc.push({ pi:i, t:t, l:x.l || 2 });
//       if(n > 1) htext[i] = t;
//       return;
//     }
// 
//     for(let d=0; d<n; d++){
//       const p = paras[i+d];
//       if(p === undefined || p.startsWith(IMG_MARK)) break;
//       taken[i+d] = 1;
//       if(x.k === 'drop') drop[i+d] = 1;
//       else blocks[i+d] = { k:x.k, g:i };            // g = 이 상자가 시작된 문단 번호
//     }
//   });
// 
//   /* 책이 적어 둔 목차와 대조 — 순서를 지키며 한 항목당 한 번만 씁니다.
//      여기서 맞아떨어진 것은 "확실한 장"이므로 나중에 위계를 정할 때 기준이 됩니다. */
//   if(bookToc && bookToc.length){
//     const anchor = bookToc.map(function(){ return -1; });
//     let cursor = 0;
//     toc.forEach(function(x){
//       if(x.l > 2) return;                       // 소제목까지 목차 페이지와 맞추지는 않습니다
//       const at = bestTocMatch(x.t, bookToc, cursor);
//       if(at >= 0){
//         x.t = bookToc[at]; x.sure = true; anchor[at] = x.pi; cursor = at + 1;
//         htext[x.pi] = x.t;          // 책이 적어 둔 온전한 제목으로 갈아 끼웁니다
//       }
//     });
// 
//     /* AI가 놓친 장을 본문에서 직접 찾아 채웁니다.
//        책이 "이런 장이 있다"고 적어 둔 이상, 본문 어딘가에 반드시 있습니다. */
//     tocSweep(paras, bookToc, anchor, heads, taken, start, function(pi, n, title){
//       for(let d=0; d<n; d++){
//         delete drop[pi+d]; delete blocks[pi+d];
//         if(d === 0) heads[pi] = 2; else hskip[pi+d] = 1;
//       }
//       htext[pi] = title;
//       toc.push({ pi:pi, t:title, l:2, sure:true });
//     });
//     toc.sort(function(a,b){ return a.pi - b.pi; });
// 
//     /* 제목 꼬리가 눌어붙은 본문 첫 문단에서 그 꼬리만큼을 떼어 냅니다.
//        AI가 찾은 장이든 여기서 채운 장이든 똑같이 적용합니다. */
//     toc.forEach(function(x){
//       if(!x.sure) return;
//       let end = x.pi + 1;
//       while(hskip[end]) end++;
//       const p = paras[end];
//       if(p === undefined || p.startsWith(IMG_MARK) || heads[end]) return;
//       let headText = paras[x.pi] || '';
//       for(let j=x.pi+1; j<end; j++) headText += ' ' + paras[j];
//       const cut = tocTrimLead(x.t, headText, p);
//       if(cut > 0 && cut < p.length - 20) htrim[end] = cut;
//     });
//   }
// 
//   /* 위계 정규화 — 부(Part)가 없는 책은 장이 1단계가 되어야 합니다.
//      안 그러면 목차 전체가 한 칸씩 들여쓰기된 채로 나옵니다. */
//   const used = {};
//   toc.forEach(function(x){ used[x.l] = 1; });
//   const present = Object.keys(used).map(Number).sort(function(a,b){ return a-b; });
//   const rank = {};
//   present.forEach(function(l, n){ rank[l] = n + 1; });
//   toc.forEach(function(x){ x.l = rank[x.l]; });
//   Object.keys(heads).forEach(function(pi){ heads[pi] = rank[heads[pi]] || heads[pi]; });
// 
//   /* 책 목차와 맞은 항목이 있으면 그것들이 진짜 장입니다.
//      맞은 것보다 아래 단계로 매겨진 게 있으면 한 칸 내려 위계를 바로잡습니다. */
//   let sureLv = 0;
//   toc.forEach(function(x){ if(x.sure && (!sureLv || x.l < sureLv)) sureLv = x.l; });
//   if(sureLv){
//     toc.forEach(function(x){ if(!x.sure && x.l <= sureLv) x.l = sureLv + 1; });
//   }
//   toc.forEach(function(x){ if(x.l > 3) x.l = 3; });
// 
//   /* 여기까지가 "판정"이고, 아래가 "조립"입니다.
//      지금까지는 이 판정 맵들을 그대로 화면에 넘겨서, 그릴 때마다 여섯 군데를 겹쳐 봐야 했습니다.
//      이제는 여기서 한 번에 블록 배열로 만들어 넘깁니다. 화면은 그냥 순서대로 그리면 됩니다. */
//   return { blocks: assembleBlocks(paras, start, {
//              heads:heads, blk:blocks, drop:drop, htext:htext, hskip:hskip, htrim:htrim
//            }), toc:toc, levels:present.length };
// }
// 
// /* 판정 결과 + 원문 → 화면에 그릴 블록의 나열.
//      { r:'h1'|'h2'|'h3'|'p'|'quote'|'note'|'img', t:글자, f:원문 문단 번호, g:상자 묶음 }
//    글자는 언제나 원문 문단에서 그대로 옵니다. 합치거나 앞을 떼어 낼 뿐 고쳐 쓰지 않습니다.
//    f 를 들고 있어서 읽던 위치(data-pi)와 목차가 예전 그대로 동작합니다. */
// function assembleBlocks(paras, start, d){
//   const out = [];
//   for(let pi = start; pi < paras.length; pi++){
//     const p = paras[pi];
//     if(p === undefined) continue;
//     if(d.drop[pi]) continue;                       // 쪽번호·워터마크 찌꺼기
//     if(d.hskip[pi]) continue;                      // 쪼개진 제목의 뒷조각 — 앞 블록에 이미 합쳐졌음
//     if(p.startsWith(IMG_MARK)){ out.push({ r:'img', t:p, f:pi }); continue; }
//     const lvl = d.heads[pi] || 0;
//     if(lvl){ out.push({ r:'h' + Math.min(3, lvl), t:(d.htext[pi] || p), f:pi }); continue; }
//     let t = p;
//     if(d.htrim[pi]) t = t.slice(d.htrim[pi]).replace(/^[\s.,:;]+/, '');   // 눌어붙은 제목 꼬리 제거
//     if(!t) continue;
//     const b = d.blk[pi];
//     if(b) out.push({ r:b.k, t:t, f:pi, g:b.g });
//     else out.push({ r:'p', t:t, f:pi });
//   }
//   return out;
// }
// 
// /* ===== 조판 단서만으로 구조 세우기 (AI 호출 0회) =====
//    지금까지는 AI가 1순위였고 규칙이 백업이었습니다. 순서를 뒤집습니다.
//    제목이 제목인 이유는 "크게·굵게·가운데" 찍혔기 때문이고, EPUB이면 아예 <h1>이라고
//    적혀 있습니다. 그 단서를 그대로 쓰면 추측할 일이 없습니다. */
// function sigRole(s){
//   if(!s) return '';
//   if(s.r) return s.r;                        // EPUB: 태그가 그대로 알려 줍니다
//   const z = s.z || 1;                        // PDF: 본문 글자 대비 크기
//   if(z >= 1.5) return 'h1';
//   if(z >= 1.25) return 'h2';
//   if(z >= 1.12 && (s.b || s.c)) return 'h3';
//   /* 모든 줄이 본문보다 안쪽에서 시작하는 덩어리 = 인용문·편지·발췌 */
//   if((s.in || 0) >= 0.05) return 'quote';
//   return '';
// }
// function sigStructure(paras, sig, nav){
//   if(!sig || !sig.length) return null;
//   const roles = [];
//   for(let i=0;i<paras.length;i++){
//     if(paras[i].startsWith(IMG_MARK)){ roles[i] = 'img'; continue; }
//     let r = sigRole(sig[i]);
//     /* 제목은 짧습니다. 글자가 커도 길거나 문장으로 끝나면 본문입니다
//        (장 첫머리의 경구, 드롭캡 문단이 여기 걸립니다). */
//     if(r.charAt(0) === 'h' && badHeadText(paras[i])) r = '';
//     roles[i] = r;
//   }
//   /* EPUB의 진짜 목차가 가리키는 자리는 두말할 것 없이 장입니다 */
//   const navAt = {};
//   (nav||[]).forEach(function(x){
//     if(paras[x.pi] === undefined || roles[x.pi] === 'img') return;
//     navAt[x.pi] = x; roles[x.pi] = 'h' + x.l;
//   });
// 
//   let heads = 0;
//   roles.forEach(function(r){ if(r && r.charAt(0) === 'h') heads++; });
//   const navHeads = Object.keys(navAt).length;
//   /* 책이 스스로 적어 둔 목차는 추측이 아니라 정답이므로 아래 의심 규칙을 적용하지 않습니다.
//      조판 신호로만 잡은 경우에만, 없거나(스캔 PDF) 터무니없이 많으면(크기가 뭉개진 PDF)
//      믿지 않고 AI에 맡깁니다. */
//   if(navHeads < 2 && (heads < 2 || heads > paras.length * 0.35)) return null;
// 
//   const blocks = [], toc = [];
//   let i = 0;
//   while(i < paras.length){
//     const r = roles[i];
//     if(r === 'img'){ blocks.push({ r:'img', t:paras[i], f:i }); i++; continue; }
//     if(r && r.charAt(0) === 'h'){
//       /* 큰 글씨 제목은 PDF에서 줄 단위로 쪼개집니다 — 한 줄로 합칩니다 */
//       let t = paras[i], n = 1, lv = +r.charAt(1);
//       while(i+n < paras.length && roles[i+n] && roles[i+n].charAt(0) === 'h'
//             && !navAt[i+n] && paras[i+n].length < 60
//             && (t + ' ' + paras[i+n]).length < 130 && !/[.!?]["'\u201d\u2019)\]]?$/.test(t) && n < 6){
//         t += ' ' + paras[i+n];
//         lv = Math.min(lv, +roles[i+n].charAt(1));   // 조각 중 가장 큰 글씨가 그 제목의 단계입니다
//         n++;
//       }
//       const title = navAt[i] ? navAt[i].t : t;
//       const rr = navAt[i] ? r : ('h' + lv);
//       blocks.push({ r:rr, t:title, f:i });
//       toc.push({ pi:i, t:title, l:+rr.charAt(1), sure: !!navAt[i] });
//       i += n; continue;
//     }
//     if(r === 'quote' || r === 'note'){
//       const g = i;
//       while(i < paras.length && roles[i] === r){ blocks.push({ r:r, t:paras[i], f:i, g:g }); i++; }
//       continue;
//     }
//     blocks.push({ r:'p', t:paras[i], f:i }); i++;
//   }
//   /* 위계 정규화 — 실제로 쓰인 단계만 1·2·3으로 당깁니다 */
//   const used = {}; toc.forEach(function(x){ used[x.l] = 1; });
//   const present = Object.keys(used).map(Number).sort(function(a,b){ return a-b; });
//   const rank = {}; present.forEach(function(l,n){ rank[l] = n+1; });
//   toc.forEach(function(x){ x.l = rank[x.l]; });
//   blocks.forEach(function(b){
//     if(b.r.charAt(0) === 'h') b.r = 'h' + Math.min(3, rank[+b.r.charAt(1)] || +b.r.charAt(1));
//   });
//   return { blocks:blocks, toc:toc, start:0, levels:present.length,
//            src: (nav && nav.length) ? 'nav' : 'layout', at:Date.now() };
// }
// 
// /* AI 정리를 안 했거나 꺼 둔 책 — 원문 그대로 한 문단이 한 블록입니다. */
// function plainBlocks(paras){
//   const out = [];
//   paras.forEach(function(p, pi){
//     if(p === undefined) return;
//     if(p.startsWith(IMG_MARK)){ out.push({ r:'img', t:p, f:pi }); return; }
//     out.push({ r: looksHeading(p) ? 'h2' : 'p', t:p, f:pi });
//   });
//   return out;
// }
// 
// /* 조립된 블록의 글자가 정말 원문에서만 왔는지 기계적으로 확인합니다.
//    AI는 위치만 말하고 글자는 앱이 원문에서 가져오지만, 그 약속이 지켜졌는지
//    사람 눈이 아니라 코드가 봅니다. 어긋나면 정리를 통째로 버리고 원문을 씁니다. */
// function blocksIntact(paras, blocks){
//   let vocab = null;                                 // 무거우니 필요할 때만 만듭니다
//   for(let i=0; i<blocks.length; i++){
//     const b = blocks[i];
//     if(b.r === 'img') continue;
//     const p = paras[b.f];
//     if(p === undefined) return false;
//     if(b.t === p || p.endsWith(b.t)) continue;      // 원문 그대로거나, 앞만 떼어 낸 것
//     let joined = '', ok = false;                    // 쪼개진 문단을 이어 붙인 것
//     for(let k=b.f; k<paras.length && joined.length <= b.t.length; k++){
//       joined += (joined ? ' ' : '') + paras[k];
//       if(joined === b.t){ ok = true; break; }
//     }
//     if(ok) continue;
//     /* 본문은 여기서 끝입니다. 원문 문단 그대로거나, 앞을 뗀 것이거나, 이어 붙인 것.
//        셋 중 어느 것도 아니면 글자가 바뀐 것이므로 바로 실패입니다. */
//     if(b.r.charAt(0) !== 'h') return false;
//     /* 여기까지 오는 건 장 제목뿐입니다. 제목은 본문 자리가 아니라 책의 목차
//        페이지에서 가져오고, 2단 조판 때문에 떨어져 있던 번호를 제자리에 끼우기도 합니다
//        ("Chapter Get The Love…" + "Seven" → "Chapter Seven Get The Love…").
//        그래서 통째로 이어진 문자열로는 원문에 없습니다. 대신 쓰인 낱말이 전부
//        이 책 안에 있는지를 봅니다. 없는 낱말이 하나라도 섞이면 지어낸 것입니다. */
//     if(vocab === null){
//       vocab = Object.create(null);
//       for(let k=0; k<paras.length; k++){
//         const ws = tocWords(paras[k]);
//         for(let j=0; j<ws.length; j++) vocab[ws[j]] = 1;
//       }
//     }
//     const w = tocWords(b.t);
//     if(!w.length) return false;
//     for(let j=0; j<w.length; j++) if(!vocab[w[j]]) return false;
//   }
//   return true;
// }
// 
// /* 지금 보고 있는 책을 정리합니다 (Aa 설정 → 정리하기) */
// async function tidyNow(){
//   const b = curBook;
//   if(!b || b.builtin){ toast('샘플 책은 정리할 수 없어요'); return; }
//   if(!sb || !sbUser){ toast('AI 정리는 로그인 후 사용할 수 있어요'); openSyncModal(); return; }
//   /* 조판 단서(b.sig)가 있으면 제목 후보만 보내는 싼 경로를 씁니다(수 초, 토큰 1/50).
//      이 단서는 반입할 때만 만들어지므로, 그 전에 넣은 책이나 스캔 PDF는 없습니다.
//      이 경우엔 전권을 읽혀야 해서 확인창부터 다르게 보여 줍니다 — 조용히 느린 길로
//      새면 "왜 오래 걸리지" 싶은 순간이 생기기 때문입니다. */
//   const fast = !!b.sig;
//   const msg = fast
//     ? 'AI가 목차 후보만 보고 위계를 정리합니다.\n\n'
//     + '본문은 서버로 보내지 않습니다 — 제목처럼 보이는 짧은 줄과 그 다음 문장만 보냅니다.\n'
//     + '몇 초면 끝나요. 결과가 마음에 안 들면 바로 끌 수 있어요.'
//     : 'AI가 책 전체를 읽고 목차와 소제목을 정리합니다.\n\n'
//     + '이 책은 (예전에 넣었거나 스캔본이라) 빠른 정리에 쓸 단서가 없어서 전권을 읽어야 해요.\n'
//     + '본문이 서버를 거치지만 AI는 글자를 돌려주지 않고, 제목은 언제나 원문 그대로예요.\n'
//     + '책 길이에 따라 1~3분 걸립니다. 다시 넣으면 다음엔 몇 초짜리 빠른 정리를 쓸 수 있어요.';
//   if(!confirm(msg)) return;
//   const runBtn = document.getElementById('aa-tidy-run');
//   runBtn.disabled = true;
//   try{
//     let t = fast ? await runTidyFast(b.paras, b.sig, b.title, function(msg){ toast(msg); }) : null;
//     if(fast && !t) toast('후보로는 부족해서 전체를 다시 읽을게요…');   // 조용히 안 넘어갑니다
//     if(!t) t = await runTidy(b.paras, b.title, function(msg){ toast(msg); });
//     b.tidy = t;
//     delete tidyOff[b.id]; save(LS_TIDYOFF, tidyOff);
//     await bookPut(b);
//     toast((t.src === 'fast' ? '빠른 정리 완료' : '정리 완료')
//         + ' — 앞 ' + t.start + '문단 접고, 목차 ' + t.toc.length + '개');
//     keepPlace(function(){ renderBookBody(b); });
//     syncTidyUI();
//   }catch(e){
//     console.error(e);
//     toast(e.message === 'login_required' ? '로그인이 필요해요'
//         : e.message === 'too_short' ? '문단이 너무 적어 정리할 게 없어요'
//         : e.message === 'text_mismatch' ? '정리 결과가 원문과 달라서 취소했어요 (원문은 그대로예요)'
//         : 'AI 정리에 실패했어요: ' + e.message);
//   }finally{ runBtn.disabled = false; }
// }
// function toggleTidy(){
//   const b = curBook; if(!b || !b.tidy) return;
//   if(tidyOff[b.id]) delete tidyOff[b.id]; else tidyOff[b.id] = true;
//   save(LS_TIDYOFF, tidyOff);
//   keepPlace(function(){ renderBookBody(b); });
//   syncTidyUI(); renderTocList();
//   toast(tidyOff[b.id] ? 'AI 정리를 껐어요 (원본 그대로)' : 'AI 정리를 켰어요');
// }
// function syncTidyUI(){
//   const b = curBook;
//   const row = document.getElementById('aa-tidy-row');
//   if(!b || b.builtin){ row.className = 'aa-row'; return; }
//   row.className = 'aa-row on';
//   const has = !!b.tidy;
//   const src = has ? (b.tidy.src || 'ai') : '';
//   /* 이미 코드로 목차가 잡혀 있어도 AI로 더 다듬을 수 있게 버튼은 남겨 둡니다.
//      책이 스스로 적어 둔 목차(EPUB nav)는 정답이라 AI가 나아지게 할 게 없습니다. */
//   document.getElementById('aa-tidy').style.display = has ? 'block' : 'none';
//   document.getElementById('aa-tidy').classList.toggle('on', tidyActive(b));
//   document.getElementById('aa-tidy-run').style.display = (has && src !== 'layout') ? 'none' : 'block';
//   document.getElementById('aa-tidy-run').textContent = has ? 'AI로 다듬기' : '정리하기';
//   const sub = document.getElementById('aa-tidy-sub');
//   if(!has){ sub.textContent = '앞부분 자르기 · 소제목 찾기'; sub.className = ''; return; }
//   if(!tidyActive(b)){ sub.textContent = '꺼짐 — 원본 그대로'; sub.className = ''; return; }
//   const n = buildToc(b).length;
//   if(src === 'nav'){
//     sub.textContent = '책에 들어 있는 목차 ' + n + '줄';
//     sub.className = '';
//   }else if(src === 'layout'){
//     sub.textContent = '글자 크기로 자동 정리 · 목차 ' + n + '줄 — 제목이 부정확할 수 있어요';
//     sub.className = 'warn';
//   }else{
//     sub.textContent = '앞 ' + b.tidy.start + '문단 접음 · 목차 ' + n + '줄';
//     sub.className = '';
//   }
// }
// 
// /* ================= 목차 ================= */
// /* 목차는 두 가지를 합쳐 만듭니다.
//    ① 글자로 적힌 소제목 (AI 정리를 했으면 그 판정, 아니면 규칙 판정)
//    ② 드롭캡으로 시작하는 문단 = 장이 바뀌는 자리
//    ②가 필요한 이유: 전자책으로 변환된 PDF는 장 제목이 그림이라 글자가 아예 없는 경우가 많습니다.
//    그때는 제목을 지어내지 않고 "1장"과 첫 문장 몇 글자를 보여 줍니다. */
// function buildToc(b){
//   if(!b || !b.paras) return [];
//   const T = tidyActive(b) ? b.tidy : null;
//   /* AI 정리를 했으면 그때 만들어 둔 목록을 씁니다.
//      "짧고 대문자로 시작하면 소제목" 같은 규칙은 목차로 쓰기엔 너무 지저분합니다
//      (판권지·인명·대사가 줄줄이 섞여 들어옵니다). 그래서 규칙 추측은 목차에 안 씁니다. */
//   let out;
//   if(T && T.toc){
//     out = T.toc.filter(function(x){ return x.pi >= T.start && b.paras[x.pi] !== undefined; })
//                .map(function(x){ return { pi:x.pi, t:x.t, l:x.l, sure:x.sure }; });
//   }else{
//     /* AI 정리 전이라도 드롭캡으로 장이 확실히 잡히는 책은 그것만 보여 줍니다.
//        제목 글자가 없으므로 지어내지 않고 "Chapter N"으로 둡니다. */
//     out = [];
//     let n = 0;
//     (b.chapters || []).forEach(function(pi){
//       if(T && pi < T.start) return;
//       const p = b.paras[pi];
//       if(p === undefined || p.startsWith(IMG_MARK)) return;
//       out.push({ pi:pi, l:1, t:'Chapter ' + (++n),
//                  hint: p.slice(0,52).replace(/\s+\S*$/,'') + '…' });
//     });
//   }
//   /* 항목마다 "여기부터 다음 항목까지 몇 분" — 한 장만 읽고 자기 같은 판단에 쓰입니다 */
//   const stops = out.map(function(x){ return x.pi; });
//   stops.push(b.paras.length);
//   const top = out.length ? Math.min.apply(null, out.map(function(x){ return x.l; })) : 1;
//   out.forEach(function(x, i){
//     if(x.l !== top) return;                       // 최상위 단계에만 붙입니다
//     let next = b.paras.length;
//     for(let j=i+1; j<out.length; j++){ if(out[j].l === top){ next = out[j].pi; break; } }
//     let words = 0;
//     const src = (T && Array.isArray(T.blocks)) ? T.blocks : plainBlocks(b.paras);
//     src.forEach(function(bl){
//       if(bl.r === 'img' || bl.f < x.pi || bl.f >= next) return;
//       words += bl.t.split(/\s+/).length;
//     });
//     if(words > 120) x.mins = Math.max(1, Math.round(words/180));
//   });
//   return out;
// }
// function openToc(){
//   if(!curBook) return;
//   syncTidyUI();
//   renderTocList();
//   document.getElementById('toc-sheet').classList.add('on');
// }
// /* 펼쳐 둔 상위 항목 (책마다 기억) */
// let tocOpen = {};
// function renderTocList(){
//   const b = curBook; if(!b) return;
//   const items = buildToc(b);
//   const list = document.getElementById('toc-list');
//   if(!items.length){
//     list.innerHTML = '<div id="toc-empty">이 책에서는 소제목을 찾지 못했어요.<br>'
//       + '전자책으로 바뀐 PDF는 장 제목이 그림이라 글자가 없는 경우가 많아요.<br>'
//       + '위의 AI 정리를 해보면 더 찾을 수 있어요.</div>';
//     return;
//   }
//   const top = Math.min.apply(null, items.map(function(x){ return x.l; }));
//   const here = lastAnchor ? lastAnchor.pi : -1;
//   let cur = -1;
//   for(let i=0;i<items.length;i++) if(items[i].pi <= here) cur = i;
//   /* 지금 읽고 있는 곳이 속한 상위 항목은 자동으로 펼칩니다 */
//   let curTop = -1;
//   for(let i=0;i<items.length;i++){ if(items[i].l === top && items[i].pi <= here) curTop = items[i].pi; }
//   const hasChild = {};
//   let last = -1;
//   items.forEach(function(x){
//     if(x.l === top){ last = x.pi; return; }
//     if(last >= 0) hasChild[last] = (hasChild[last] || 0) + 1;
//   });
// 
//   let ownerPi = -1;
//   const html = [];
//   items.forEach(function(x, i){
//     const isTop = x.l === top;
//     if(isTop) ownerPi = x.pi;
//     const shown = isTop || tocOpen[ownerPi] || ownerPi === curTop;
//     if(!shown) return;
//     const kids = hasChild[x.pi] || 0;
//     const parts = ['<button class="toc-i l' + (x.l - top + 1) + (i===cur ? ' here' : '') +
//                    '" data-pi="' + x.pi + '">'];
//     if(isTop && kids){
//       const open = tocOpen[x.pi] || x.pi === curTop;
//       parts.push('<span class="tw' + (open ? ' open' : '') + '" data-tw="' + x.pi + '">›</span>');
//     }else if(isTop) parts.push('<span class="tw off"></span>');
//     parts.push('<span class="tt">' + esc(x.t) + (x.hint ? '<small>' + esc(x.hint) + '</small>' : '') + '</span>');
//     if(x.mins) parts.push('<span class="tm">' + x.mins + '분</span>');
//     parts.push('</button>');
//     html.push(parts.join(''));
//   });
//   list.innerHTML = html.join('');
//   list.querySelectorAll('.toc-i').forEach(function(el){
//     el.onclick = function(e){
//       const tw = e.target.closest ? e.target.closest('.tw') : null;
//       if(tw && !tw.classList.contains('off')){        // 화살표를 누르면 접기·펴기만
//         const pi = +tw.dataset.tw;
//         if(tocOpen[pi]) delete tocOpen[pi]; else tocOpen[pi] = 1;
//         renderTocList();
//         return;
//       }
//       closeToc();
//       const target = document.querySelector('#rtext [data-pi="' + el.dataset.pi + '"]');
//       if(target) window.scrollTo(0, Math.max(0, window.scrollY + target.getBoundingClientRect().top - topInset()));
//       updatePfill();
//     };
//   });
// }
// function closeToc(){ document.getElementById('toc-sheet').classList.remove('on'); }
// document.getElementById('toc-sheet').addEventListener('click', function(e){
//   if(e.target.id === 'toc-sheet') closeToc();
// });
// /* 목차를 끝까지 내렸을 때 뒤에 있는 책이 따라 움직이지 않게 합니다.
//    (overscroll-behavior를 모르는 구형 브라우저용 안전장치) */
// (function(){
//   const sheet = document.getElementById('toc-sheet');
//   const list  = document.getElementById('toc-list');
//   let ty = 0;
//   list.addEventListener('touchstart', function(e){ ty = e.touches[0].clientY; }, {passive:true});
//   list.addEventListener('touchmove', function(e){
//     const dy = e.touches[0].clientY - ty;                     // >0 이면 아래로 끌어당김
//     const canScroll = list.scrollHeight > list.clientHeight + 1;
//     if(!canScroll){ e.preventDefault(); return; }
//     const atTop = list.scrollTop <= 0;
//     const atEnd = list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
//     if((atTop && dy > 0) || (atEnd && dy < 0)) e.preventDefault();
//   }, {passive:false});
//   sheet.addEventListener('touchmove', function(e){
//     if(!list.contains(e.target)) e.preventDefault();          // 배경·머리글에서는 아예 안 움직임
//   }, {passive:false});
//   sheet.addEventListener('wheel', function(e){
//     if(!list.contains(e.target)) e.preventDefault();
//   }, {passive:false});
// })();
//

//
// LEGACY EPUB NAVIGATION / TABLE-OF-CONTENTS EXTRACTION
//
// /* EPUB에는 사람이 아니라 기계가 읽으라고 만든 진짜 목차가 들어 있습니다
//    (EPUB3는 nav.xhtml, EPUB2는 toc.ncx). 제목과 가리키는 위치가 정확히 적혀 있어서
//    추측할 필요가 없습니다. 이게 있으면 AI를 한 번도 부르지 않고 목차가 완성됩니다. */
// async function epubNav(zip, opf, opfDir, manifest, anchors){
//   const out = [];
//   const read = async function(href){
//     try{
//       const path = decodeURIComponent(joinPath(opfDir, href));
//       const file = zip.file(path) || zip.file(decodeURIComponent(href));
//       if(!file) return null;
//       const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')+1) : '';
//       return { doc: new DOMParser().parseFromString(await file.async('text'), 'text/html'), dir: dir };
//     }catch(e){ return null; }
//   };
//   const place = function(dir, href, depth, title){
//     if(!title) return;
//     const raw = decodeURIComponent(href || '').split('#');
//     const path = decodeURIComponent(joinPath(dir, raw[0] || ''));
//     const key = raw[1] ? path + '#' + raw[1] : path;
//     let pi = anchors[key];
//     if(pi === undefined) pi = anchors[path];
//     if(pi === undefined) return;                 // 어디를 가리키는지 못 찾으면 버립니다
//     out.push({ pi: pi, t: title, l: Math.min(3, depth) });
//   };
// 
//   /* EPUB3: <nav epub:type="toc"> */
//   let navHref = null;
//   opf.querySelectorAll('manifest > item').forEach(it=>{
//     if((it.getAttribute('properties')||'').split(/\s+/).indexOf('nav') >= 0) navHref = it.getAttribute('href');
//   });
//   if(!navHref){
//     /* properties="nav" 가 빠진 EPUB도 흔합니다. 파일 이름으로 한 번 더 찾습니다. */
//     const cand = Object.keys(manifest).map(function(k){ return manifest[k]; })
//       .find(function(h){ return /(^|\/)(nav|toc)\.x?html?$/i.test(h||''); });
//     if(cand) navHref = cand;
//   }
//   if(navHref){
//     const g = await read(navHref);
//     /* epub:type 은 콜론이 들어가 CSS 선택자로 잡히지 않습니다. 직접 훑습니다. */
//     let nav = null;
//     if(g){
//       const navs = g.doc.querySelectorAll('nav');
//       for(let i=0;i<navs.length;i++){
//         const ty = navs[i].getAttribute('epub:type') || navs[i].getAttribute('type') || '';
//         if(ty.split(/\s+/).indexOf('toc') >= 0){ nav = navs[i]; break; }
//       }
//       if(!nav) nav = navs[0] || null;
//     }
//     if(nav){
//       nav.querySelectorAll('a[href]').forEach(a=>{
//         let depth = 0;
//         for(let n = a.parentNode; n && n !== nav; n = n.parentNode){
//           if(n.tagName && n.tagName.toLowerCase() === 'ol') depth++;
//         }
//         place(g.dir, a.getAttribute('href'), Math.max(1, depth), a.textContent.replace(/\s+/g,' ').trim());
//       });
//     }
//   }
//   /* EPUB2: toc.ncx */
//   if(!out.length){
//     let ncx = manifest['ncx'] || manifest['toc'] || null;
//     if(!ncx){
//       const spine = opf.querySelector('spine');
//       const id = spine && spine.getAttribute('toc');
//       if(id) ncx = manifest[id];
//     }
//     if(!ncx) ncx = Object.keys(manifest).map(k=>manifest[k]).find(h=>/\.ncx$/i.test(h||''));
//     if(!ncx){                                  // manifest 에 없으면 zip 안을 직접 뒤집니다
//       const hit = Object.keys(zip.files).find(k=>/\.ncx$/i.test(k));
//       if(hit) ncx = hit.indexOf(opfDir)===0 ? hit.slice(opfDir.length) : ('/'+hit);
//     }
//     if(ncx){
//       const g = await read(ncx);
//       if(g) g.doc.querySelectorAll('navPoint').forEach(np=>{
//         let depth = 0;
//         for(let n = np.parentNode; n; n = n.parentNode){
//           if(n.tagName && n.tagName.toLowerCase() === 'navpoint') depth++;
//         }
//         const c = np.querySelector('content');
//         const lab = np.querySelector('navLabel text') || np.querySelector('text');
//         place(g.dir, c && c.getAttribute('src'), depth + 1,
//               lab ? lab.textContent.replace(/\s+/g,' ').trim() : '');
//       });
//     }
//   }
//   out.sort((a,b)=>a.pi-b.pi);
//   return out.filter((x,i)=> i===0 || x.pi !== out[i-1].pi);   // 같은 자리 중복 제거
// }
