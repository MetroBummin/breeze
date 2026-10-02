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
  const defaults={newLimit:20,reviewLimit:100,batchSize:5,dailyLimit:null};
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
      practice:saved.practice===true,journey:saved.journey===true,extraDay:text(saved.extraDay),
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
        responses:count(value.responses)?value.responses:0,practice:count(value.practice)?value.practice:0,legacy:value.legacy===true,
        studied:[...new Set(Array.isArray(value.studied)?value.studied.filter(x=>typeof x==='string'):[])],
        plan:record(value.plan)&&count(value.plan.target)&&count(value.plan.pendingStage)&&value.plan.pendingStage<=5?
          {target:value.plan.target,pendingStage:value.plan.pendingStage,newLimit:value.plan.newLimit,reviewLimit:value.plan.reviewLimit,dailyLimit:count(value.plan.dailyLimit)?value.plan.dailyLimit:null,
            steps:validSteps(value.plan.steps,value.plan.target)?[...value.plan.steps]:stageEnds(value.plan.target)}:null};
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
        // Older v2 values predate the journey; recover distinct answers from real
        // events only, never from v1's ambiguous last-review timestamps.
        if(event.kind!=='practice'){const key=dayKey(event.at),day=state.daily[key]||emptyDay();
          if(!day.studied.includes(identity(event.identity)))day.studied.push(identity(event.identity));state.daily[key]=day;}
      }
    }
    return state;
  }
  function emptyDay(){return {new:[],review:[],responses:0,practice:0,legacy:false,studied:[],plan:null};}
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
    if(extra)return true;
    // Same-day relearning never consumes another new/review card slot.
    if(used.new.includes(card.identity)||used.review.includes(card.identity))return true;
    if(count(state.settings.dailyLimit))return new Set([...used.new,...used.review]).size<state.settings.dailyLimit;
    return used[type==='new'?'new':'review'].length<state.settings[type==='new'?'newLimit':'reviewLimit'];
  }
  function eligible(state,available,at,extra=false){
    const used=state.daily[dayKey(at)]||emptyDay();
    let newLeft=Math.max(0,state.settings.newLimit-used.new.length),reviewLeft=Math.max(0,state.settings.reviewLimit-used.review.length);
    let totalLeft=count(state.settings.dailyLimit)?Math.max(0,state.settings.dailyLimit-new Set([...used.new,...used.review]).size):null;
    const priority={relearning:0,review:1,new:2};
    return available.filter(card=>allowed(state,card,at,extra)).sort((a,b)=>
      priority[kind(state,a)]-priority[kind(state,b)]||
      (state.progress[a.key]?.dueAt??a.addedAt)-(state.progress[b.key]?.dueAt??b.addedAt)||compare(a.key,b.key))
      .filter(card=>{
        const type=kind(state,card);
        if(extra||used.new.includes(card.identity)||used.review.includes(card.identity))return true;
        if(totalLeft!==null)return totalLeft-->0;
        return type==='new'?newLeft-->0:reviewLeft-->0;
      });
  }
  // A small opening followed by progressively larger stages. The
  // percentages displayed to users still reflect actual unique responses.
  function stageEnds(target){
    if(!target)return [];
    const size=Math.min(5,target),weights=[5,10,20,30,35].slice(0,size),sum=weights.reduce((a,b)=>a+b,0);
    const ideal=weights.map(w=>target*w/sum),amounts=ideal.map(n=>Math.max(1,Math.floor(n)));
    let remaining=target-amounts.reduce((a,b)=>a+b,0);
    while(remaining!==0){
      let best=-1;
      for(let i=0;i<size;i++)if(remaining>0||amounts[i]>1){
        if(best<0||(remaining>0?ideal[i]-amounts[i]>ideal[best]-amounts[best]:amounts[i]-ideal[i]>amounts[best]-ideal[best]))best=i;
      }
      const step=remaining>0?1:-1;amounts[best]+=step;remaining-=step;
    }
    amounts.sort((a,b)=>a-b); // Rounding must never make a later stage smaller.
    let total=0;return amounts.map(n=>total+=n);
  }
  function validSteps(steps,target){return Array.isArray(steps)&&steps.length===Math.min(5,target)
    &&steps.every((n,i)=>count(n)&&n>(i?steps[i-1]:0))&&(target===0||steps.at(-1)===target);}
  function stageProgress(day){
    const target=day.plan?.target||0,done=Math.min(target,day.studied.length),ends=day.plan?.steps||stageEnds(target),stages=ends.length;
    const completed=ends.filter(end=>done>=end).length,stage=Math.min(stages,completed+1);
    const previous=stage>1?ends[stage-2]:0,end=stage?ends[stage-1]:0;
    return {target,done,stages,ends:[...ends],completed,stage,percent:end>previous?Math.round((done-previous)/(end-previous)*100):0,
      distinct:day.studied.length,repeats:Math.max(0,day.responses-day.studied.length),milestone:day.plan?.pendingStage||0};
  }
  function ensurePlan(state,available,at){
    const key=dayKey(at),day=state.daily[key]||emptyDay();
    const remaining=eligible(state,available,at).filter(card=>!day.studied.includes(card.identity)).length,previousTarget=day.plan?.target;
    if(!day.plan)day.plan={target:day.studied.length+remaining,pendingStage:0,newLimit:state.settings.newLimit,reviewLimit:state.settings.reviewLimit,dailyLimit:state.settings.dailyLimit};
    else if(day.plan.newLimit!==state.settings.newLimit||day.plan.reviewLimit!==state.settings.reviewLimit||day.plan.dailyLimit!==state.settings.dailyLimit){
      // A lower cap may reduce today's goal, but never removes queued cards or
      // fabricates responses. A higher cap doesn't move an earned finish line.
      day.plan.target=day.studied.length?Math.max(day.studied.length,Math.min(day.plan.target,day.studied.length+remaining)):remaining;
      day.plan.newLimit=state.settings.newLimit;day.plan.reviewLimit=state.settings.reviewLimit;day.plan.dailyLimit=state.settings.dailyLimit;
      day.plan.pendingStage=0;
    }
    if(day.plan.target===0&&!day.studied.length)day.plan.target=remaining;
    if(day.studied.length<day.plan.target)day.plan.target=Math.min(day.plan.target,day.studied.length+remaining);
    if(previousTarget!==day.plan.target||!validSteps(day.plan.steps,day.plan.target))day.plan.steps=stageEnds(day.plan.target);
    day.plan.pendingStage=Math.min(day.plan.pendingStage,day.plan.steps.length);
    state.daily[key]=day;
    return day;
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
    const journey=saved?.journey&&!saved.practice&&used.plan?.target>0?stageProgress(used):null;
    if(journey?.milestone){status='complete';card=null;token='';}
    return {state,status,card,token,journey,completed:saved?saved.index-saved.batchStart:0,total:saved?saved.batchEnd-saved.batchStart:0,
      practiceRemaining:saved?.practice?saved.queue.length-saved.index:0,
      remembered:saved?.remembered||0,confused:saved?.confused||0,uncertain:saved?.uncertain||0,
      intervals:card?Object.fromEntries(['confused','uncertain','remembered'].map(outcome=>[outcome,schedule(state.progress[card.key],outcome).delay])):null,
      eligibleCount:due.length,nextDueAt,nextRelearningAt,relearningCount,dueReviewCount,newCount,
      dueRelearningCount:available.filter(card=>state.progress[card.key]?.relearning&&state.progress[card.key].dueAt<=at).length,
      uniqueUsed:new Set([...used.new,...used.review]).size,newUsed:used.new.length,reviewUsed:used.review.length,responses:used.responses,practiceResponses:used.practice,legacyUsage:used.legacy,
      limitReached:eligible(state,available,at,true).length>due.length&&(!count(state.settings.dailyLimit)||new Set([...used.new,...used.review]).size>=state.settings.dailyLimit)};
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
      queue:chosen.map(card=>({key:card.key,identity:card.identity})),index:0,remembered:0,confused:0,uncertain:0,practice,journey:false,extraDay:extra?dayKey(at):'',batchStart:0,batchEnd:chosen.length};
  }
  function start(raw,words,now,extra=false){
    const state=normalize(raw),available=cards(words),at=nowValue(now);reconcile(state,available);
    if(activate(state,saved=>!saved.practice)){
      if(state.session.index>=state.session.batchEnd){const saved=state.session;saved.batchStart=saved.index;
        saved.batchEnd=Math.min(saved.queue.length,saved.index+state.settings.batchSize);saved.remembered=0;saved.confused=0;saved.uncertain=0;}
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
  function startJourney(raw,words,now,extra=false){
    const state=normalize(raw),available=cards(words),at=nowValue(now);
    reconcile(state,available);ensurePlan(state,available,at).plan.pendingStage=0;
    state.settings.batchSize=Math.min(10,state.settings.batchSize);
    const result=start(state,words,at,extra),saved=result.state.session;
    if(saved&&!saved.practice){saved.journey=true;saved.batchEnd=Math.min(saved.batchEnd,saved.index+10);}
    return snapshot(result.state,available,at);
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
    const state=normalize(raw),available=cards(words),at=nowValue(now);
    if(state.session?.journey&&!state.session.practice)ensurePlan(state,available,at);
    const current=snapshot(state,available,at);
    if(current.status!=='active'||typeof token!=='string'||token!==current.token
      ||!['remembered','confused','uncertain'].includes(outcome)||state.history.some(event=>event.id===token))return {...current,accepted:false};
    const card=current.card,type=state.session.practice?'practice':kind(state,card),used=state.daily[dayKey(at)]||emptyDay();
    if(type!=='practice'){
      const {streak,delay,relearning}=schedule(state.progress[card.key],outcome);
      state.progress[card.key]={identity:card.identity,streak,dueAt:Math.min(at+delay,Number.MAX_SAFE_INTEGER),lastReviewedAt:at,relearning};
      if(!used.new.includes(card.identity)&&!used.review.includes(card.identity))used[type==='new'?'new':'review'].push(card.identity);
      const before=stageProgress(used).completed;
      if(!used.studied.includes(card.identity))used.studied.push(card.identity);
      used.responses++;
      const after=stageProgress(used).completed;
      if(state.session.journey&&used.plan&&after>before)used.plan.pendingStage=after;
    }else used.practice++;
    state.daily[dayKey(at)]=used;
    state.history.push({id:token,at,identity:card.identity,kind:type,outcome});
    state.session.index++;state.session[outcome]++;
    return {...snapshot(state,available,at),accepted:true};
  }
  return Object.freeze({normalize,view,start,startJourney,startSelection,grade,configure});
})();
