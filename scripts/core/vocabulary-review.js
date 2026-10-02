/* Local-only practice over saved Meaning records. No vocabulary writes, network,
   clock reads or storage access: callers supply now and persist the returned state.
   A session records card identities; answer visibility is never persisted.

   start resumes an unfinished session, otherwise selects at most five due/new
   meanings. view reconciles interrupted sessions without starting a new one.
   grade requires the opaque token from the displayed card and accepts it once.
   UI callers must read the latest state and save the result before advancing. */
const BreezeReview = (() => {
  const VERSION=1, LIMIT=5, DAY=86400000, RETRY=600000, UNCERTAIN=3600000;
  const INTERVALS=[1,3,7,14,30];
  const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
  const record=value=>!!value && typeof value==='object' && !Array.isArray(value);
  const time=value=>Number.isSafeInteger(value) && value>=0;
  const count=value=>Number.isSafeInteger(value) && value>=0;
  const text=value=>typeof value==='string' ? value : '';
  const compare=(a,b)=>a<b ? -1 : a>b ? 1 : 0;
  const nowValue=value=>time(value) ? value : 0;

  /** @typedef {{identity:string,streak:number,dueAt:number,lastReviewedAt:number}} Progress */
  /** @typedef {{key:string,identity:string}} Reference */
  /** @typedef {{id:string,startedAt:number,queue:Reference[],index:number,remembered:number,confused:number,uncertain?:number,practice?:boolean}} Session */
  /** @typedef {{version:number,sequence:number,progress:Record<string,Progress>,session:Session|null}} State */
  /** @typedef {{key:string,identity:string,word:string,ko:string,example:string,book:string,addedAt:number}} Card */

  /** Normalize untrusted JSON data without retaining mutable input references.
   *  An unknown version resets only practice, never a saved Meaning.
   *  @returns {State} */
  function normalize(raw){
    /** @type {State} */
    const state={version:VERSION,sequence:0,progress:Object.create(null),session:null};
    if(!record(raw) || !own(raw,'version') || raw.version!==VERSION) return state;
    state.sequence=own(raw,'sequence') && count(raw.sequence) ? raw.sequence : 0;
    if(own(raw,'progress') && record(raw.progress)){
      for(const [key,item] of Object.entries(raw.progress)){
        if(!record(item) || !['identity','streak','dueAt','lastReviewedAt'].every(field=>own(item,field))) continue;
        if(typeof item.identity!=='string' || !item.identity || !count(item.streak)
            || item.streak>INTERVALS.length || !time(item.dueAt) || !time(item.lastReviewedAt)
            || item.dueAt<item.lastReviewedAt) continue;
        state.progress[key]={identity:item.identity,streak:item.streak,
          dueAt:item.dueAt,lastReviewedAt:item.lastReviewedAt};
      }
    }
    const saved=own(raw,'session') ? raw.session : null;
    if(!record(saved) || !['id','startedAt','queue','index','remembered','confused'].every(field=>own(saved,field))) return state;
    if(typeof saved.id!=='string' || !saved.id || !time(saved.startedAt)
        || !Array.isArray(saved.queue) || saved.queue.length<1 || (saved.practice!==true&&saved.queue.length>LIMIT)
        || !count(saved.index) || saved.index>saved.queue.length
        || !count(saved.remembered) || !count(saved.confused)
        || (saved.uncertain!==undefined&&!count(saved.uncertain))
        || saved.remembered+saved.confused+(saved.uncertain||0)>saved.index) return state;
    const keys=new Set();
    /** @type {Reference[]} */
    const queue=[];
    for(const item of saved.queue){
      if(!record(item) || !own(item,'key') || !own(item,'identity')
          || typeof item.key!=='string' || !item.key || typeof item.identity!=='string'
          || !item.identity || keys.has(item.key)) return state;
      keys.add(item.key);
      queue.push({key:item.key,identity:item.identity});
    }
    state.session={id:saved.id,startedAt:saved.startedAt,queue,index:saved.index,
      remembered:saved.remembered,confused:saved.confused};
    if(saved.practice===true)state.session.practice=true;
    if(saved.uncertain!==undefined)state.session.uncertain=saved.uncertain;
    return state;
  }

  /** Snapshot only saved fields; candidates/ai.ko are never a saved answer.
   *  Exact structural identity avoids hash collisions and invalidates reused
   *  keys, promoted meanings, edited context and explicit delete/re-adds.
   *  Mutable learning flags/up/pickedAt intentionally do not change identity.
   *  @returns {Card[]} */
  function cards(words){
    if(!record(words)) return [];
    const result=[];
    for(const [key,item] of Object.entries(words)){
      if(!key || !record(item) || !own(item,'word') || !own(item,'ko')
          || !text(item.word).trim() || !text(item.ko).trim()) continue;
      const word=item.word,ko=item.ko;
      const example=own(item,'example') ? text(item.example) : '';
      const book=own(item,'book') ? text(item.book) : '';
      const addedAt=own(item,'addedAt') && time(item.addedAt) ? item.addedAt : 0;
      const identity=JSON.stringify([key,word,ko,example,book,addedAt]);
      result.push({key,identity,word,ko,example,book,addedAt});
    }
    return result;
  }

  /** @param {State} state @param {Card[]} available */
  function reconcile(state,available){
    const byKey=new Map(available.map(card=>[card.key,card]));
    for(const [key,item] of Object.entries(state.progress)){
      const card=byKey.get(key);
      if(!card || item.identity!==card.identity) delete state.progress[key];
    }
    const session=state.session;
    if(session){
      while(session.index<session.queue.length){
        const ref=session.queue[session.index],card=byKey.get(ref.key);
        if(card && card.identity===ref.identity) break;
        session.index++;
      }
    }
    return byKey;
  }

  /** @param {State} state @param {Card[]} available */
  function eligible(state,available,now){
    return available.filter(card=>!own(state.progress,card.key) || state.progress[card.key].dueAt<=now)
      .sort((a,b)=>{
        const ap=state.progress[a.key],bp=state.progress[b.key];
        if(!!ap!==!!bp) return ap ? -1 : 1;
        return (ap ? ap.dueAt-bp.dueAt : a.addedAt-b.addedAt) || compare(a.key,b.key);
      });
  }

  function schedule(previous,outcome){
    const prior=previous?previous.streak:0;
    const streak=outcome==='remembered'?Math.min(prior+1,INTERVALS.length):outcome==='uncertain'?Math.max(0,prior-1):0;
    return {streak,delay:outcome==='remembered'?INTERVALS[streak-1]*DAY:outcome==='uncertain'?UNCERTAIN:RETRY};
  }
  /** @param {State} state @param {Card[]} available */
  function snapshot(state,available,now){
    const byKey=reconcile(state,available),session=state.session;
    const due=eligible(state,available,now);
    let nextDueAt=null;
    for(const item of Object.values(state.progress)){
      if(item.dueAt>now && (nextDueAt===null || item.dueAt<nextDueAt)) nextDueAt=item.dueAt;
    }
    let status=!available.length ? 'empty' : due.length ? 'idle' : 'waiting';
    /** @type {Card|null} */
    let card=null;
    let token='';
    if(session){
      status=session.index<session.queue.length ? 'active' : 'complete';
      if(status==='active'){
        const ref=session.queue[session.index];
        card={...byKey.get(ref.key)};
        token=JSON.stringify([session.id,session.index,ref.key,ref.identity]);
      }
    }
    return {state,status,card,token,completed:session ? session.index : 0,
      total:session ? session.queue.length : 0,remembered:session ? session.remembered : 0,
      confused:session ? session.confused : 0,uncertain:session?.uncertain||0,
      intervals:card?Object.fromEntries(['confused','uncertain','remembered'].map(outcome=>[outcome,schedule(state.progress[card.key],outcome).delay])):null,
      eligibleCount:due.length,nextDueAt};
  }

  function view(raw,words,now){
    return snapshot(normalize(raw),cards(words),nowValue(now));
  }

  function start(raw,words,now){
    const state=normalize(raw),available=cards(words),at=nowValue(now);
    reconcile(state,available);
    if(state.session && state.session.index<state.session.queue.length) return snapshot(state,available,at);
    const chosen=eligible(state,available,at).slice(0,LIMIT);
    state.session=null;
    if(chosen.length){
      // Wrap only at the safe integer limit. Time and content remain in the token.
      state.sequence=state.sequence<Number.MAX_SAFE_INTEGER ? state.sequence+1 : 1;
      state.session={id:JSON.stringify([at,state.sequence]),startedAt:at,
        queue:chosen.map(card=>({key:card.key,identity:card.identity})),
        index:0,remembered:0,confused:0};
    }
    return snapshot(state,available,at);
  }

  // Explicit practice may include future-due cards. Reconcile against ALL words
  // so a book/star filter can never prune another book's progress.
  function startSelection(raw,words,keys,now){
    const state=normalize(raw),available=cards(words),at=nowValue(now);
    const byKey=reconcile(state,available);
    const selected=[...new Set(Array.isArray(keys)?keys:[])]
      .map(key=>byKey.get(key)).filter(Boolean);
    const queue=selected.map(card=>({key:card.key,identity:card.identity}));
    if(state.session?.practice&&state.session.index<state.session.queue.length
      &&JSON.stringify(state.session.queue)===JSON.stringify(queue))return snapshot(state,available,at);
    state.session=null;
    if(queue.length){
      state.sequence=state.sequence<Number.MAX_SAFE_INTEGER?state.sequence+1:1;
      state.session={id:JSON.stringify([at,state.sequence]),startedAt:at,queue,
        index:0,remembered:0,confused:0,practice:true};
    }
    return snapshot(state,available,at);
  }

  function grade(raw,words,token,outcome,now){
    const state=normalize(raw),available=cards(words),at=nowValue(now);
    const current=snapshot(state,available,at);
    if(current.status!=='active' || typeof token!=='string' || token!==current.token
        || (outcome!=='remembered' && outcome!=='confused' && outcome!=='uncertain')) return {...current,accepted:false};
    const card=current.card,previous=state.progress[card.key];
    const {streak,delay}=schedule(previous,outcome);
    state.progress[card.key]={identity:card.identity,streak,
      dueAt:Math.min(at+delay,Number.MAX_SAFE_INTEGER),lastReviewedAt:at};
    state.session.index++;
    state.session[outcome]=(state.session[outcome]||0)+1;
    return {...snapshot(state,available,at),accepted:true};
  }

  return Object.freeze({normalize,view,start,startSelection,grade});
})();
