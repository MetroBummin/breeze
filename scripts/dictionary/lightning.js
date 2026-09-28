/* Opt-in, bounded look-ahead. Cache is not vocabulary; only a real tap saves a Meaning. */
const BreezeLightning = (() => {
  const VERSION=1, PREF='breeze.lightning', TTL=7*86400000, MEMORY_LIMIT=32, DISK_LIMIT=160;
  const DAILY_SENTENCES=200, RESERVE=10;
  let enabled=load(PREF,false)===true, timer=0, flight=null, generation=0, scope='', stopped='';
  let lastRequest=0, cooldown=0, failureCount=0, revealAnimation=null, preparing=false, stoppedDay='';
  const memory=new Map();
  const metrics={requests:0,sentences:0,hits:0,misses:0,inputTokens:0,outputTokens:0,failures:0};
  const db=openDb('breeze-lightning',1,d=>d.createObjectStore('sentences'));
  const button=document.getElementById('aa-lightning');
  const note=document.getElementById('aa-lightning-note');
  const owner=()=>typeof sbUser!=='undefined'&&sbUser?String(sbUser.id):'';
  const currentScope=()=>JSON.stringify([owner(),curBook?.id||'',currentReaderMode]);
  const isReader=()=>!!curBook&&document.getElementById('v-read')?.classList.contains('on');
  const active=()=>enabled&&isReader()&&!document.hidden&&navigator.onLine!==false&&!!owner()
    &&!(typeof onboardingOwnsReader==='function'&&onboardingOwnsReader());
  const keyOfInput=input=>JSON.stringify([VERSION,currentScope(),String(input.sentence||''),
    String(input.before||'').slice(-400),String(input.after||'').slice(0,400)]);
  function remember(key,record){
    memory.delete(key);memory.set(key,record);
    while(memory.size>MEMORY_LIMIT)memory.delete(memory.keys().next().value);
  }
  function validRecord(record,input){
    if(!record||record.version!==VERSION||!Number.isFinite(record.at)||Date.now()-record.at>TTL
      ||record.sentence!==input.sentence||!Array.isArray(record.units))return false;
    const tokens=lookupSentenceTokens(input.sentence),seen=new Set();
    if(record.units.length>tokens.length)return false;
    return record.units.every(unit=>{
      if(!unit||!['word','expression'].includes(unit.kind)||typeof unit.canonical!=='string'
        ||!/^[A-Za-z][A-Za-z'’\- ]{0,119}$/.test(unit.canonical)||typeof unit.ko!=='string'
        ||!unit.ko.trim()||unit.ko.length>60||/[\n\r,;／/]/.test(unit.ko)
        ||!Array.isArray(unit.members)||!unit.members.length)return false;
      if(unit.kind==='word'&&(unit.members.length!==1||unit.canonical.includes(' ')))return false;
      if(unit.kind==='expression'&&(unit.members.length<2||!unit.canonical.includes(' ')))return false;
      return unit.members.every((n,i)=>{
        if(!Number.isInteger(n)||n<0||n>=tokens.length||(i&&n<=unit.members[i-1])||seen.has(n))return false;
        seen.add(n);return true;
      });
    });
  }
  async function diskGet(key,input){
    try{
      const d=await db();
      const record=await new Promise(resolve=>{
        const q=d.transaction('sentences').objectStore('sentences').get(key);
        q.onsuccess=()=>resolve(q.result);q.onerror=()=>resolve(null);
      });
      return validRecord(record,input)?record:null;
    }catch{return null;}
  }
  async function diskPut(key,record){
    try{
      const d=await db();
      await new Promise((resolve,reject)=>{
        const tx=d.transaction('sentences','readwrite'),store=tx.objectStore('sentences');
        store.put(record,key);
        const scan=store.openCursor(),rows=[];
        scan.onsuccess=()=>{
          const c=scan.result;
          if(c){rows.push({key:c.key,at:c.value?.at||0});c.continue();return;}
          rows.sort((a,b)=>b.at-a.at);
          rows.forEach((row,i)=>{if(i>=DISK_LIMIT||Date.now()-row.at>TTL)store.delete(row.key);});
        };
        tx.oncomplete=()=>resolve(null);tx.onerror=tx.onabort=()=>reject(tx.error);
      });
    }catch{ /* Optional cache failure must never disable ordinary reading. */ }
  }
  function unitFor(record,input){
    if(!record||!Number.isInteger(input.clickedIndex))return null;
    const unit=record.units.find(item=>item.members.includes(input.clickedIndex));
    if(!unit)return null;
    return {...unit,lemma:unit.canonical,pos:'',alts:[],lightning:true};
  }
  function peek(input){
    if(!enabled||!isReader())return null;
    const record=memory.get(keyOfInput(input));
    return validRecord(record,input)?unitFor(record,input):null;
  }
  async function resolve(input,signal){
    if(!enabled||!isReader()||signal?.aborted)return null;
    const epoch=generation,key=keyOfInput(input);
    const hit=peek(input);
    if(hit){metrics.hits++;return hit;}
    // Disk hydration belongs to idle preparation, never the tap's critical path.
    if(signal?.aborted)return null;
    // A tap in a sentence already being prepared joins that request instead of billing twice.
    const pending=flight;
    if(pending?.keys.includes(key)){
      if(signal){
        await new Promise(done=>{
          const abort=()=>done(null);
          signal.addEventListener('abort',abort,{once:true});
          pending.promise.finally(()=>{signal.removeEventListener('abort',abort);done(null);});
        });
      }else await pending.promise;
      if(signal?.aborted||!enabled||epoch!==generation)return null;
      const answer=peek(input);if(answer){metrics.hits++;return answer;}
    }
    metrics.misses++;return null;
  }
  function cancel(){
    generation++;
    if(flight){flight.controller.abort();flight=null;}
  }
  function prioritize(input,retry=false){
    if(!enabled)return;
    if(flight&&(retry||!flight.keys.includes(keyOfInput(input))))cancel();
  }
  function budgetKey(){return 'breeze.lightning-budget.'+owner();}
  function budget(){
    const value=load(budgetKey(),null);
    return value&&value.day===aiDay()&&Number.isFinite(value.sentences)?Math.max(0,value.sentences):0;
  }
  function updateNote(){
    if(button){button.classList.toggle('on',enabled);button.setAttribute('aria-checked',String(enabled));}
    if(!note)return;
    note.textContent=!enabled?'현재·다음 문장을 AI에 미리 전송해요. 문장당 AI 1회가 차감돼요.'
      :!owner()?'로그인 후 작동해요. 준비한 문장당 AI 1회가 차감돼요.'
      :stopped==='server'?'테스트 서버가 아직 준비되지 않았어요. 일반 조회는 그대로 쓸 수 있어요.'
      :stopped==='quota'?'오늘 미리 준비를 멈췄어요. 준비된 뜻과 일반 조회는 그대로 쓸 수 있어요.'
      :navigator.onLine===false?'오프라인에서는 준비된 뜻만 바로 볼 수 있어요.'
      :'읽는 문장을 AI에 미리 전송해요. 문장당 AI 1회가 차감돼요.';
  }
  function setEnabled(value){
    enabled=!!value;save(PREF,enabled);stopped='';failureCount=0;cooldown=0;
    cancel();endPresentation();clearTimeout(timer);timer=0;updateNote();
    if(typeof renderWordLookup==='function'&&wordLookupOpen())renderWordLookup();
    if(enabled)schedule(0);
  }
  function endPresentation(){if(revealAnimation)revealAnimation.cancel();revealAnimation=null;}
  function reveal(element){
    if(!enabled||!element||!element.animate||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    if(revealAnimation)revealAnimation.cancel();
    revealAnimation=element.animate([
      {opacity:.65,filter:'blur(1.5px)',transform:'translateY(1.5px)'},
      {opacity:1,filter:'blur(0)',transform:'translateY(0)'}
    ],{duration:200,easing:'cubic-bezier(.2,.8,.2,1)'});
  }
  // Match the exact context builder used by taps, including PDF/EPUB fallback neighbors.
  function inputFor(sentence,before='',after=''){
    const clean=String(sentence||'').replace(/\s+/g,' ').trim();
    const token=lookupSentenceTokens(clean)[0];if(!token)return null;
    const node={textContent:token.text,dataset:{example:clean,contextBefore:before,contextAfter:after,clickedTokenIndex:'0'}};
    return lookupRequestFor({word:token.text,clicked:token.text,example:clean},node,true);
  }
  function fromParts(parts,start,previous='',next=''){
    return parts.slice(start,start+2).map((part,offset)=>{
      const i=start+offset;
      return inputFor(part.text,i?parts[i-1].text:previous,i+1<parts.length?parts[i+1].text:next);
    }).filter(Boolean);
  }
  function textTargets(){
    const anchor=captureAnchor();if(!anchor)return [];
    const block=document.querySelector(`#rtext [data-pi="${anchor.pi}"]`);if(!block)return [];
    const parts=bridgeSentences(block.textContent),y=topInset()+12;
    let start=0;
    for(let i=0;i<parts.length;i++){
      const range=domRangeForOffsets(block,parts[i].start,parts[i].end);
      if(range&&range.getBoundingClientRect().bottom>=y){start=i;break;}
    }
    const paras=curBook.paras||[],previous=bridgeSentences(paras[anchor.pi-1]||'').at(-1)?.text||'';
    const next=bridgeSentences(paras[anchor.pi+1]||'');
    const items=fromParts(parts,start,previous,next[0]?.text||'');
    if(items.length<2&&next.length){
      const following=bridgeSentences(paras[anchor.pi+2]||'')[0]?.text||'';
      items.push(...fromParts(next,0,parts.at(-1)?.text||'',following).slice(0,2-items.length));
    }
    return items;
  }
  function pdfTargets(){
    const anchor=capturePdfAnchor(topInset()+12);if(!anchor)return [];
    const boxes=originalSession.wordBoxes.get(anchor.page)||[];
    const first=boxes.findIndex(box=>box.y+box.h>=anchor.y);if(first<0)return [];
    const seen=new Set(),items=[];
    for(let page=anchor.page;page<=anchor.page+1&&items.length<2;page++){
      const rows=originalSession.wordBoxes.get(page)||[];
      for(let i=page===anchor.page?first:0;i<rows.length&&items.length<2;i++){
        const box=rows[i],key=page+':'+box.sentenceStart;
        if(seen.has(key))continue;seen.add(key);
        const input=inputFor(box.example);if(input)items.push(input);
      }
    }
    return items;
  }
  function epubTargets(){
    const source=captureEpubAnchor(topInset()+12);if(!source)return [];
    const element=epubElementAt(source.spine,source.element);if(!element)return [];
    const block=element.closest('p,li,blockquote,h1,h2,h3,h4')||element;
    const parts=bridgeSentences(block.textContent),char=source.char||0;
    const start=Math.max(0,parts.findIndex(part=>char>=part.start&&char<part.end));
    const items=fromParts(parts,start);
    if(items.length<2){
      const next=epubElementAt(source.spine,source.element+1);
      if(next&&!block.contains(next))items.push(...fromParts(bridgeSentences(next.textContent),0).slice(0,2-items.length));
    }
    return items;
  }
  function targets(){
    let items=currentReaderMode==='text'?textTargets():originalSession?.kind==='pdf'?pdfTargets()
      :originalSession?.kind==='epub'?epubTargets():[];
    const seen=new Set();let total=0;
    return items.filter(input=>{
      const key=keyOfInput(input),n=lookupSentenceTokens(input.sentence).length;
      if(seen.has(key)||!n||n>48||input.sentence.length>1200||total+n>72)return false;
      seen.add(key);total+=n;return true;
    }).slice(0,2);
  }
  async function prepare(inputs,epoch){
    const missing=[],requestScope=currentScope();
    for(const input of inputs){
      const key=keyOfInput(input);
      if(validRecord(memory.get(key),input))continue;
      const record=await diskGet(key,input);
      if(epoch!==generation||requestScope!==currentScope()||!active())return;
      if(record)remember(key,record);else missing.push({key,input});
    }
    if(!missing.length||epoch!==generation||requestScope!==currentScope()||!active()||wordLookupOpen()||sentenceBusy())return;
    const used=budget(),left=load(LS_AI_LEFT,null);
    if(used+missing.length>DAILY_SENTENCES||(left?.day===aiDay()&&left.left<RESERVE+missing.length)){
      stopped='quota';stoppedDay=aiDay();updateNote();return;
    }
    const controller=new AbortController();
    const work={controller,keys:missing.map(item=>item.key),promise:Promise.resolve()};
    flight=work;lastRequest=Date.now();
    save(budgetKey(),{day:aiDay(),sentences:used+missing.length});
    metrics.requests++;metrics.sentences+=missing.length;
    work.promise=(async()=>{
      let timedOut=false;
      const timeout=setTimeout(()=>{timedOut=true;controller.abort();},8500);
      try{
        const response=await dictCall({op:'prefetch',version:VERSION,sentences:missing.map(({input})=>({
          sentence:input.sentence,before:input.before,after:input.after,
          tokens:lookupSentenceTokens(input.sentence).map(token=>({text:token.text,cands:lemmaCands(token.text)}))
        }))},controller.signal);
        if(epoch!==generation||requestScope!==currentScope()||!active())return;
        if(timedOut)throw Error('prefetch_timeout');
        if(controller.signal.aborted)return;
        if(typeof response?.left==='number')rememberAiLeft(response.left);
        if(response?.error==='login_required'||response?.error==='quota_exceeded'){
          stopped='quota';stoppedDay=aiDay();updateNote();return;
        }
        if(['prefetch_disabled','bad_op','bad_word'].includes(response?.error)){
          stopped='server';updateNote();return;
        }
        if(response?.version!==VERSION||!Array.isArray(response.sentences)||response.sentences.length!==missing.length)
          throw Error('prefetch_failed');
        const records=response.sentences.map((item,i)=>({version:VERSION,at:Date.now(),sentence:item?.sentence,units:item?.units}));
        if(records.some((record,i)=>!validRecord(record,missing[i].input)))throw Error('invalid_prefetch');
        failureCount=0;
        for(let i=0;i<missing.length;i++){
          remember(missing[i].key,records[i]);
          void diskPut(missing[i].key,records[i]);
        }
        metrics.inputTokens+=Number(response.usage?.input_tokens)||0;
        metrics.outputTokens+=Number(response.usage?.output_tokens)||0;
      }catch{
        if(epoch===generation&&requestScope===currentScope()&&(!controller.signal.aborted||timedOut)){
          metrics.failures++;failureCount++;
          cooldown=Date.now()+Math.min(120000,15000*2**Math.min(failureCount-1,3));
        }
      }finally{clearTimeout(timeout);if(flight===work)flight=null;}
    })();
    await work.promise;
  }
  function sentenceBusy(){return typeof sentenceLookupOpen==='function'&&sentenceLookupOpen();}
  async function pump(){
    timer=0;if(!enabled)return;
    const nextScope=currentScope();
    if(nextScope!==scope){cancel();scope=nextScope;stopped='';cooldown=0;memory.clear();updateNote();}
    if(stopped==='quota'&&stoppedDay!==aiDay()){stopped='';updateNote();}
    if(preparing){schedule(1200);return;}
    try{
      if(active()&&!stopped&&!flight&&!wordLookupOpen()&&!sentenceBusy()&&Date.now()>=cooldown
        &&Date.now()-lastRequest>=1200){preparing=true;await prepare(targets(),generation);}
    }catch{cooldown=Date.now()+15000;metrics.failures++;}
    finally{preparing=false;schedule(1200);}
  }
  function schedule(delay=350){
    clearTimeout(timer);timer=0;
    if(enabled&&isReader()&&!document.hidden&&navigator.onLine!==false)timer=setTimeout(pump,delay);
  }
  function interrupt(){
    if(!enabled)return;
    cancel();schedule(400);
  }
  // Keep the experiment removable. OFF delegates to the exact existing owners;
  // ON only supplies an answer/presentation, never a second vocabulary writer.
  const normal={state:wordPeekState,render:renderWordPeek,load:loadCachedLook,
    end:endWordLookupLife,fetch:fetchLook};
  let freshLife=-1,revealedLife=-1;
  function mayUse(answer,w){
    return !!answer&&!!w&&!dead[senseCardKey(w.root||selKey,answer.ko)]
      &&!(answer.kind==='expression'&&dead[phraseCardKey(answer.canonical)]);
  }
  globalThis.wordPeekState=function(w,context){
    const ordinary=normal.state(w,context);
    if(!enabled||!w||previewWordCard||context?.error||wordPeekRetryState)return ordinary;
    if(!hasResolvedMeaning(w)&&activeSelectedWordNode){
      freshLife=wordLookupLife;
      const input=lookupRequestFor(w,activeSelectedWordNode,true);
      prioritize(input);
      const answer=peek(input);
      if(mayUse(answer,w))return {text:answer.ko,loading:false};
    }
    return ordinary;
  };
  globalThis.renderWordPeek=function(){
    normal.render();
    if(!enabled||!wordPeekActive||freshLife!==wordLookupLife||revealedLife===wordLookupLife)return;
    const w=displayedWord(selKey),state=wordPeekState(w,currentContext(selKey));
    const preview=w&&!hasResolvedMeaning(w)&&activeSelectedWordNode
      ?peek(lookupRequestFor(w,activeSelectedWordNode,true)):null;
    if(!state.loading&&!wordPeekRetryState&&(hasResolvedMeaning(w)||mayUse(preview,w))){
      revealedLife=wordLookupLife;reveal(document.getElementById('word-peek-meaning'));
    }
  };
  globalThis.endWordLookupLife=function(){freshLife=-1;endPresentation();normal.end();};
  globalThis.loadCachedLook=async function(k,began,life,node){
    const w=words[k];
    if(enabled&&w){
      const input=lookupRequestFor(w,node,true),answer=await resolve(input,wordLookupSignal());
      if(!wordLookupAlive(life)||words[k]!==w)return true;
      if(enabled&&mayUse(answer,w)){
        const phrase=expressionFromMini(answer,input.sentence,input.clicked,input.clickedIndex);
        if(phrase)saveDetectedExpression(k,phrase,input.sentence,input.book,answer,life,{clickedIndex:input.clickedIndex});
        else{applyLook(w,answer,k,{cached:true,life});rememberSenseContext(k,input.sentence,input.clickedIndex);saveWords();}
        return true;
      }
    }
    return normal.load(k,began,life,node);
  };
  globalThis.fetchLook=async function(k,opt){
    if(enabled&&words[k]){
      const options=opt||{},retry=!!(options.retry||options.wider);
      const input=options.sentence?options:lookupRequestFor(words[k],options.node||activeSelectedWordNode,true);
      prioritize(input,retry);
      if(retry)freshLife=-1;
      // Existing unresolved saved words use the hold path rather than fetchDict.
      if(options.hold&&!retry){
        const life=options.life===undefined?wordLookupLife:options.life;
        const answer=await resolve(input,wordLookupSignal());
        if(!wordLookupAlive(life)||!words[k])return false;
        if(enabled&&mayUse(answer,words[k]))return answer;
      }
    }
    return normal.fetch(k,opt);
  };
  button?.addEventListener('click',()=>setEnabled(!enabled));
  readerScroller()?.addEventListener('scroll',interrupt,{passive:true});
  window.addEventListener('resize',interrupt,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancel();clearTimeout(timer);timer=0;}else schedule();});
  window.addEventListener('offline',()=>{cancel();updateNote();});
  window.addEventListener('online',()=>{stopped='';updateNote();schedule();});
  window.addEventListener('storage',event=>{
    if(event.key===PREF){enabled=load(PREF,false)===true;cancel();updateNote();schedule();}
  });
  const observer=new MutationObserver(()=>{
    if(!enabled)return;
    if(currentScope()!==scope||!isReader())cancel();
    schedule();
  });
  for(const node of document.querySelectorAll('.view,#readwrap,#originalwrap'))
    observer.observe(node,{attributes:true,attributeFilter:['class','hidden']});
  const zoom=document.getElementById('original-zoom');
  if(zoom)new MutationObserver(interrupt).observe(zoom,{attributes:true,attributeFilter:['style']});
  updateNote();if(enabled)schedule();
  return {enabled:()=>enabled,setEnabled,peek,resolve,prioritize,reveal,endPresentation,stats:()=>({...metrics,stopped}),
    // Read-only diagnostics; no sentence text or provider credentials in statistics.
    schedule};
})();
