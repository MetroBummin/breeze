/* Local-only, deterministic review engine. The caller supplies time, reads the
   latest state and commits one value before advancing. No vocabulary writes. */
const BreezeReview = (() => {
  const VERSION=2, DAY=86400000, RETRY=600000, INTERVALS=[1,3,7,14,30];
  const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
  const record=value=>!!value && typeof value==='object' && !Array.isArray(value);
  const count=value=>Number.isSafeInteger(value) && value>=0;
  const text=value=>typeof value==='string' ? value : '';
  const compare=(a,b)=>a<b?-1:a>b?1:0;
  const nowValue=value=>count(value)?value:0;
  const dayKey=at=>{const d=new Date(at);return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;};
  const defaults={newLimit:20,reviewLimit:100,batchSize:5};
  function settings(raw){
    return Object.fromEntries(Object.entries(defaults).map(([key,value])=>
      [key,record(raw)&&count(raw[key])&&(key!=='batchSize'||raw[key]>0)?raw[key]:value]));
  }
  // v1 embedded mutable source fields. Project both formats to the stable tuple.
  function identity(value){
    try{const parts=JSON.parse(value);if(Array.isArray(parts)&&parts.length===6)
      return JSON.stringify([parts[0],parts[1],parts[2],parts[5]]);
    }catch{/* Invalid identities cannot match a saved card. */}
    return value;
  }
  function session(saved){
    if(!record(saved)||!text(saved.id)||!count(saved.startedAt)||!Array.isArray(saved.queue)||!saved.queue.length
      ||!count(saved.index)||saved.index>saved.queue.length||!count(saved.remembered)||!count(saved.confused)
      ||(saved.uncertain!==undefined&&!count(saved.uncertain))
      ||saved.remembered+saved.confused+(saved.uncertain||0)>saved.index)return null;
    const keys=new Set(),queue=[];
    for(const item of saved.queue){
      if(!record(item)||!text(item.key)||!text(item.identity)||keys.has(item.key))return null;
      keys.add(item.key);queue.push({key:item.key,identity:identity(item.identity)});
    }
    return {id:saved.id,startedAt:saved.startedAt,queue,index:saved.index,
      remembered:saved.remembered,confused:saved.confused,uncertain:saved.uncertain||0,
      practice:saved.practice===true,extraDay:text(saved.extraDay),
      batchStart:count(saved.batchStart)&&saved.batchStart<=saved.index?saved.batchStart:0,
      batchEnd:count(saved.batchEnd)&&saved.batchEnd>=saved.index&&saved.batchEnd<=queue.length?saved.batchEnd:queue.length};
  }
  function normalize(raw){
    const state={version:VERSION,sequence:0,progress:Object.create(null),session:null,
      suspended:[],settings:settings(null),daily:Object.create(null),history:[]};
    if(!record(raw)||!own(raw,'version')||![1,VERSION].includes(raw.version))return state;
    state.sequence=count(raw.sequence)?raw.sequence:0;
    state.settings=settings(raw.settings);
    if(record(raw.daily))for(const [day,value] of Object.entries(raw.daily)){
      if(!record(value))continue;
      state.daily[day]={new:[...new Set(Array.isArray(value.new)?value.new.filter(x=>typeof x==='string'):[])],
        review:[...new Set(Array.isArray(value.review)?value.review.filter(x=>typeof x==='string'):[])],
        responses:count(value.responses)?value.responses:0,practice:count(value.practice)?value.practice:0,legacy:value.legacy===true};
    }
    if(record(raw.progress))for(const [key,item] of Object.entries(raw.progress)){
      if(!record(item)||!['identity','streak','dueAt','lastReviewedAt'].every(field=>own(item,field))
        ||!text(item.identity)||!count(item.streak)||item.streak>INTERVALS.length
        ||!count(item.dueAt)||!count(item.lastReviewedAt)||item.dueAt<item.lastReviewedAt)continue;
      state.progress[key]={identity:identity(item.identity),streak:item.streak,dueAt:item.dueAt,
        lastReviewedAt:item.lastReviewedAt,relearning:item.relearning===true||(raw.version===1&&item.streak===0)};
      if(raw.version===1){
        // v1 has no event history. Reserve both budgets conservatively for its
        // last known day; do not invent outcomes or exact first-learning dates.
        const day=dayKey(item.lastReviewedAt),entry=state.daily[day]||emptyDay();
        entry.new.push(identity(item.identity));entry.review.push(identity(item.identity));entry.legacy=true;
        state.daily[day]=entry;
      }
    }
    state.session=session(raw.session);
    state.suspended=Array.isArray(raw.suspended)?raw.suspended.map(session).filter(Boolean):[];
    if(Array.isArray(raw.history)){
      const ids=new Set();
      for(const event of raw.history){
        if(!record(event)||!text(event.id)||ids.has(event.id)||!count(event.at)||!text(event.identity)
          ||!['new','review','relearning','practice'].includes(event.kind)
          ||!['remembered','confused','uncertain'].includes(event.outcome))continue;
        ids.add(event.id);state.history.push({id:event.id,at:event.at,identity:identity(event.identity),kind:event.kind,outcome:event.outcome});
      }
    }
    return state;
  }
  function emptyDay(){return {new:[],review:[],responses:0,practice:0,legacy:false};}
  function cards(words){
    if(!record(words))return [];
    return Object.entries(words).filter(([key,item])=>key&&record(item)&&own(item,'word')&&own(item,'ko')&&text(item.word).trim()&&text(item.ko).trim())
      .map(([key,item])=>{const addedAt=count(item.addedAt)?item.addedAt:0;
        return {key,identity:JSON.stringify([key,item.word,item.ko,addedAt]),word:item.word,ko:item.ko,
          example:text(item.example),book:text(item.book),addedAt};});
  }
  function reconcile(state,available){
    const byKey=new Map(available.map(card=>[card.key,card]));
    for(const [key,item] of Object.entries(state.progress))if(byKey.get(key)?.identity!==item.identity)delete state.progress[key];
    for(const saved of [state.session,...state.suspended].filter(Boolean)){
      while(saved.index<saved.batchEnd&&byKey.get(saved.queue[saved.index].key)?.identity!==saved.queue[saved.index].identity)saved.index++;
    }
    return byKey;
  }
  function kind(state,card){const p=state.progress[card.key];return !p?'new':p.relearning?'relearning':'review';}
  function allowed(state,card,at,extra=false){
    const type=kind(state,card),p=state.progress[card.key],used=state.daily[dayKey(at)]||emptyDay();
    if(p&&p.dueAt>at)return false;
    if(type==='relearning'||extra)return true;
    // Same-day relearning never consumes another new/review card slot.
    if(used.new.includes(card.identity)||used.review.includes(card.identity))return true;
    return used[type].length<state.settings[type==='new'?'newLimit':'reviewLimit'];
  }
  function eligible(state,available,at,extra=false){
    const used=state.daily[dayKey(at)]||emptyDay();
    let newLeft=Math.max(0,state.settings.newLimit-used.new.length),reviewLeft=Math.max(0,state.settings.reviewLimit-used.review.length);
    const priority={relearning:0,review:1,new:2};
    return available.filter(card=>allowed(state,card,at,extra)).sort((a,b)=>
      priority[kind(state,a)]-priority[kind(state,b)]||
      (state.progress[a.key]?.dueAt??a.addedAt)-(state.progress[b.key]?.dueAt??b.addedAt)||compare(a.key,b.key))
      .filter(card=>{
        const type=kind(state,card);
        if(extra||type==='relearning'||used.new.includes(card.identity)||used.review.includes(card.identity))return true;
        return type==='new'?newLeft-->0:reviewLeft-->0;
      });
  }
  function schedule(previous,outcome){
    const prior=previous?.streak||0;
    const streak=outcome==='remembered'?Math.min(prior+1,INTERVALS.length):outcome==='uncertain'?Math.max(1,prior):0;
    return {streak,delay:outcome==='confused'?RETRY:INTERVALS[streak-1]*DAY,relearning:outcome==='confused'};
  }
  function snapshot(state,available,at){
    const byKey=reconcile(state,available),saved=state.session,due=eligible(state,available,at);
    const used=state.daily[dayKey(at)]||emptyDay();
    let nextDueAt=null,nextRelearningAt=null,dueReviewCount=0,newCount=0,relearningCount=0;
    for(const card of available){
      const p=state.progress[card.key];
      if(!p){newCount++;continue;}
      if(p.relearning){relearningCount++;if(p.dueAt>at&&(nextRelearningAt===null||p.dueAt<nextRelearningAt))nextRelearningAt=p.dueAt;}
      else if(p.dueAt<=at)dueReviewCount++;
      if(p.dueAt>at&&(nextDueAt===null||p.dueAt<nextDueAt))nextDueAt=p.dueAt;
    }
    let status=!available.length?'empty':due.length?'idle':'waiting',card=null,token='';
    if(saved){
      status=saved.index<saved.batchEnd?'active':'complete';
      if(status==='active'){
        const ref=saved.queue[saved.index],candidate=byKey.get(ref.key);
        if(saved.practice||allowed(state,candidate,at,saved.extraDay===dayKey(at))){
          card={...candidate};token=JSON.stringify([saved.id,saved.index,ref.key,ref.identity]);
        }else status='paused';
      }
    }
    return {state,status,card,token,completed:saved?saved.index-saved.batchStart:0,total:saved?saved.batchEnd-saved.batchStart:0,
      practiceRemaining:saved?.practice?saved.queue.length-saved.index:0,
      remembered:saved?.remembered||0,confused:saved?.confused||0,uncertain:saved?.uncertain||0,
      intervals:card?Object.fromEntries(['confused','uncertain','remembered'].map(outcome=>[outcome,schedule(state.progress[card.key],outcome).delay])):null,
      eligibleCount:due.length,nextDueAt,nextRelearningAt,relearningCount,dueReviewCount,newCount,
      dueRelearningCount:available.filter(card=>state.progress[card.key]?.relearning&&state.progress[card.key].dueAt<=at).length,
      newUsed:used.new.length,reviewUsed:used.review.length,responses:used.responses,practiceResponses:used.practice,legacyUsage:used.legacy,
      limitReached:eligible(state,available,at,true).length>due.length};
  }
  function view(raw,words,now){return snapshot(normalize(raw),cards(words),nowValue(now));}
  function activate(state,predicate){
    if(state.session&&predicate(state.session)&&state.session.index<state.session.queue.length)return true;
    if(state.session&&state.session.index<state.session.queue.length)state.suspended.push(state.session);
    const index=state.suspended.findIndex(saved=>predicate(saved)&&saved.index<saved.queue.length);
    state.session=index<0?null:state.suspended.splice(index,1)[0];
    return !!state.session;
  }
  function createSession(state,chosen,at,practice=false,extra=false){
    if(!chosen.length)return;
    state.sequence=state.sequence<Number.MAX_SAFE_INTEGER?state.sequence+1:1;
    state.session={id:JSON.stringify([at,state.sequence]),startedAt:at,
      queue:chosen.map(card=>({key:card.key,identity:card.identity})),index:0,remembered:0,confused:0,uncertain:0,practice,extraDay:extra?dayKey(at):'',batchStart:0,batchEnd:chosen.length};
  }
  function start(raw,words,now,extra=false){
    const state=normalize(raw),available=cards(words),at=nowValue(now);reconcile(state,available);
    if(activate(state,saved=>!saved.practice)){
      if(extra)state.session.extraDay=dayKey(at);
      // A resumed new-card queue must not hide relearning or reviews that became
      // due while away. Park it intact and serve higher-priority work first.
      const saved=state.session,current=available.find(card=>card.key===saved.queue[saved.index].key);
      const priority={relearning:0,review:1,new:2},pending=new Set(saved.queue.slice(saved.index).map(ref=>ref.key));
      const ready=eligible(state,available,at,extra);
      const urgent=ready.filter(card=>!pending.has(card.key)&&(priority[kind(state,card)]<priority[kind(state,current)]
        ||!allowed(state,current,at,saved.extraDay===dayKey(at))));
      if(urgent.length){state.suspended.unshift(saved);state.session=null;createSession(state,urgent.slice(0,state.settings.batchSize),at,false,extra);}
      return snapshot(state,available,at);
    }
    createSession(state,eligible(state,available,at,extra).slice(0,state.settings.batchSize),at,false,extra);
    return snapshot(state,available,at);
  }
  function startSelection(raw,words,keys,now,batchSize){
    const state=normalize(raw),available=cards(words),at=nowValue(now),byKey=reconcile(state,available);
    const selected=[...new Set(Array.isArray(keys)?keys:[])].map(key=>byKey.get(key)).filter(Boolean);
    // Empty explicit scopes never expand or replace unfinished work.
    if(!selected.length)return snapshot(state,available,at);
    const signature=JSON.stringify(selected.map(card=>({key:card.key,identity:card.identity})));
    if(!activate(state,saved=>saved.practice&&JSON.stringify(saved.queue.filter(ref=>byKey.get(ref.key)?.identity===ref.identity))===signature)){
      createSession(state,selected,at,true);
      state.session.batchEnd=Math.min(selected.length,count(batchSize)&&batchSize>0?batchSize:selected.length);
    }else if(state.session.index>=state.session.batchEnd){
      const saved=state.session;saved.batchStart=saved.index;
      saved.batchEnd=Math.min(saved.queue.length,saved.index+(count(batchSize)&&batchSize>0?batchSize:state.settings.batchSize));
      saved.remembered=0;saved.confused=0;saved.uncertain=0;
    }
    return snapshot(state,available,at);
  }
  function configure(raw,values){const state=normalize(raw);state.settings=settings({...state.settings,...values});return state;}
  function grade(raw,words,token,outcome,now){
    const state=normalize(raw),available=cards(words),at=nowValue(now),current=snapshot(state,available,at);
    if(current.status!=='active'||typeof token!=='string'||token!==current.token
      ||!['remembered','confused','uncertain'].includes(outcome)||state.history.some(event=>event.id===token))return {...current,accepted:false};
    const card=current.card,type=state.session.practice?'practice':kind(state,card),used=state.daily[dayKey(at)]||emptyDay();
    if(type!=='practice'){
      const {streak,delay,relearning}=schedule(state.progress[card.key],outcome);
      state.progress[card.key]={identity:card.identity,streak,dueAt:Math.min(at+delay,Number.MAX_SAFE_INTEGER),lastReviewedAt:at,relearning};
      if((type==='new'||type==='review')&&!used.new.includes(card.identity)&&!used.review.includes(card.identity))used[type].push(card.identity);
      used.responses++;
    }else used.practice++;
    state.daily[dayKey(at)]=used;
    state.history.push({id:token,at,identity:card.identity,kind:type,outcome});
    state.session.index++;state.session[outcome]++;
    return {...snapshot(state,available,at),accepted:true};
  }
  return Object.freeze({normalize,view,start,startSelection,grade,configure});
})();
