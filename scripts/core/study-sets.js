/* Local-only snapshot study sets. All state, vocabulary and time are explicit
   inputs. No storage, vocabulary writes, scheduling, network or AI calls. */
const BreezeStudySets = (() => {
  const VERSION=1;
  /** @typedef {{id:string,key:string,word:string,ko:string,example:string,book:string,addedAt:number,status:number}} Card */
  /** @typedef {{id:string,outcome:string,at:number}} Answer */
  /** @typedef {{id:string,startedAt:number,round:number,queue:Card[],index:number,answers:Answer[],revealed:boolean}} Session */
  /** @typedef {{id:string,name:string,bookTitles:string[],createdAt:number,updatedAt:number,cards:Card[],excludedIds:string[],session:Session|null}} StudySet */
  /** @typedef {{version:number,sequence:number,sets:StudySet[]}} State */
  const record=value=>!!value && typeof value==='object' && !Array.isArray(value);
  const text=value=>typeof value==='string';
  const nonblank=value=>text(value) && !!value.trim();
  const count=value=>Number.isSafeInteger(value) && value>=0;
  const compare=(a,b)=>a<b?-1:a>b?1:0;
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  const fail=()=>{throw new TypeError('Invalid study sets data. The saved value was not changed.');};
  const time=value=>{if(!count(value)||value>8640000000000000)throw new RangeError('Invalid study set time');return value;};
  const identity=(word,ko)=>JSON.stringify([word,ko]);
  /** @returns {State} */
  function empty(){return {version:VERSION,sequence:0,sets:[]};}
  function strings(value,allowEmpty=false){
    if(!Array.isArray(value)||value.some(item=>allowEmpty?!text(item):!nonblank(item))||new Set(value).size!==value.length)fail();
    return [...value];
  }
  /** The exact saved definition distinguishes meanings; source/record addresses
      do not. Avoid a hash collision or spelling-only merge by storing the tuple. */
  /** @returns {Card} */
  function copyCard(raw){
    if(!record(raw)||!nonblank(raw.word)||!nonblank(raw.ko)||!nonblank(raw.key)
      ||raw.id!==identity(raw.word,raw.ko)||!text(raw.example)||!text(raw.book)||!count(raw.addedAt)||(raw.status!==undefined&&![1,2,3].includes(raw.status)))fail();
    return {id:raw.id,key:raw.key,word:raw.word,ko:raw.ko,example:raw.example,book:raw.book,addedAt:raw.addedAt,status:raw.status||1};
  }
  /** @returns {Card[]} */
  function copyCards(raw){
    if(!Array.isArray(raw))fail();
    const result=raw.map(copyCard);
    if(new Set(result.map(card=>card.id)).size!==result.length)fail();
    return result;
  }
  /** @returns {Session|null} */
  function copySession(raw){
    if(raw===null)return null;
    if(!record(raw)||!nonblank(raw.id)||!count(raw.startedAt)||!count(raw.round)||raw.round<1
      ||!count(raw.index)||!Array.isArray(raw.answers)||typeof raw.revealed!=='boolean')fail();
    const queue=copyCards(raw.queue);
    if(!queue.length||raw.index>queue.length||raw.answers.length!==raw.index
      ||(raw.revealed&&raw.index===queue.length))fail();
    const answers=raw.answers.map((answer,index)=>{
      if(!record(answer)||answer.id!==queue[index].id||!['remembered','repeat'].includes(answer.outcome)||!count(answer.at))fail();
      return {id:answer.id,outcome:answer.outcome,at:answer.at};
    });
    return {id:raw.id,startedAt:raw.startedAt,round:raw.round,queue,index:raw.index,answers,revealed:raw.revealed};
  }
  /** Strictly decode one known schema. Corruption and future versions must stop
      writes instead of being silently replaced with an empty collection.
      @returns {State} */
  function normalize(raw){
    if(raw===null||raw===undefined)return empty();
    if(record(raw)&&typeof raw.version==='number'&&raw.version>VERSION)
      throw new RangeError('This study sets version is newer than this app. The saved value was not changed.');
    if(!record(raw)||raw.version!==VERSION||!count(raw.sequence)||!Array.isArray(raw.sets))fail();
    const sets=raw.sets.map(item=>{
      if(!record(item)||!nonblank(item.id)||!nonblank(item.name)||!count(item.createdAt)
        ||!count(item.updatedAt)||item.updatedAt<item.createdAt)fail();
      const bookTitles=strings(item.bookTitles,true),cards=copyCards(item.cards),excludedIds=strings(item.excludedIds);
      if(!bookTitles.length)fail();
      const session=copySession(item.session);
      // A session freezes its content; its cards must still belong to this set.
      // Excluded cards remain stored and are not pruned from an active round.
      const ids=new Set(cards.map(card=>card.id));
      if(excludedIds.some(id=>!ids.has(id))||(session&&session.queue.some(card=>!ids.has(card.id))))fail();
      return {id:item.id,name:item.name,bookTitles,createdAt:item.createdAt,updatedAt:item.updatedAt,cards,excludedIds,session};
    });
    if(new Set(sets.map(item=>item.id)).size!==sets.length)fail();
    return {version:VERSION,sequence:raw.sequence,sets};
  }
  /** Only an absent storage value means a new collection. JSON null is damage. */
  function decode(serialized){
    if(serialized===null||serialized===undefined)return empty();
    if(!text(serialized))fail();
    let parsed;
    try{parsed=JSON.parse(serialized);}catch{fail();}
    if(parsed===null)fail();
    return normalize(parsed);
  }
  /** Select current saved Meanings only, and preserve their exact display text.
      Duplicate content chooses the oldest record (then key) deterministically.
      @returns {Card[]} */
  function cards(words,bookTitles){
    if(!record(words))return [];
    const selected=Array.isArray(bookTitles)?new Set(bookTitles):null;
    const available=Object.entries(words).filter(([key,item])=>nonblank(key)&&record(item)
      &&own(item,'word')&&own(item,'ko')&&nonblank(item.word)&&nonblank(item.ko)
      &&(!selected||selected.has(text(item.book)?item.book:'')))
      .map(([key,item])=>({id:identity(item.word,item.ko),key,word:item.word,ko:item.ko,
        example:text(item.example)?item.example:'',book:text(item.book)?item.book:'',addedAt:count(item.addedAt)?item.addedAt:0,status:[1,2,3].includes(item.status)?item.status:1}))
      .sort((a,b)=>a.addedAt-b.addedAt||compare(a.key,b.key));
    const seen=new Set();
    return available.filter(card=>{if(seen.has(card.id))return false;seen.add(card.id);return true;});
  }
  function get(state,id){return state.sets.find(item=>item.id===id)||null;}
  function activeCards(set){const excluded=new Set(set.excludedIds);return set.cards.filter(card=>!excluded.has(card.id));}
  function allocate(state,prefix){
    if(state.sequence>=Number.MAX_SAFE_INTEGER)throw new RangeError('Study set sequence exhausted');
    state.sequence++;
    return `${prefix}-${state.sequence}`;
  }
  function result(state,id,accepted,added=0){return {state,set:get(state,id),accepted,added};}
  function create(raw,options,words,now){
    const state=normalize(raw),at=time(now);
    if(!record(options)||!nonblank(options.name)||!Array.isArray(options.bookTitles))return result(state,'',false);
    // Empty book names are the existing Memory 'directly added' source.
    const bookTitles=[...new Set(options.bookTitles.filter(text))];
    if(!bookTitles.length)return result(state,'',false);
    let id;
    do{id=allocate(state,'set');}while(get(state,id));
    const snapshots=cards(words,bookTitles);
    state.sets.push({id,name:options.name.trim(),bookTitles,createdAt:at,updatedAt:at,cards:snapshots,excludedIds:[],session:null});
    return result(state,id,true,snapshots.length);
  }
  function rename(raw,id,name,now){
    const state=normalize(raw),set=get(state,id),at=time(now);
    if(!set||!nonblank(name)||name.trim()===set.name)return result(state,id,false);
    set.name=name.trim();set.updatedAt=Math.max(set.updatedAt,at);
    return result(state,id,true);
  }
  function remove(raw,id){
    const state=normalize(raw),set=get(state,id);
    if(!set)return result(state,id,false);
    state.sets=state.sets.filter(item=>item.id!==id);
    return result(state,id,true);
  }
  function setExcluded(raw,id,cardId,excluded,now){
    const state=normalize(raw),set=get(state,id),at=time(now);
    if(!set||!set.cards.some(card=>card.id===cardId)||set.excludedIds.includes(cardId)===excluded)return result(state,id,false);
    set.excludedIds=excluded?[...set.excludedIds,cardId]:set.excludedIds.filter(value=>value!==cardId);
    set.updatedAt=Math.max(set.updatedAt,at);
    return result(state,id,true);
  }
  function setStatus(raw,id,cardId,status,now){
    if(![1,2,3].includes(status))throw new TypeError('Invalid study card status');
    const state=normalize(raw),set=get(state,id),at=time(now),card=set?.cards.find(item=>item.id===cardId);
    if(!card||card.status===status)return result(state,id,false);
    card.status=status;set.updatedAt=Math.max(set.updatedAt,at);
    return result(state,id,true);
  }
  function exclude(raw,id,cardId,now){return setExcluded(raw,id,cardId,true,now);}
  function restore(raw,id,cardId,now){return setExcluded(raw,id,cardId,false,now);}
  function newCards(set,words){
    const known=new Set([...set.cards.map(card=>card.id),...set.excludedIds]);
    return cards(words,set.bookTitles).filter(card=>!known.has(card.id));
  }
  function importPreview(raw,id,words){
    const state=normalize(raw),set=get(state,id),pending=set?newCards(set,words):[];
    return {cards:pending,count:pending.length};
  }
  function importNew(raw,id,words,now){
    const state=normalize(raw),set=get(state,id),at=time(now);
    if(!set)return result(state,id,false);
    const pending=newCards(set,words);
    if(!pending.length)return result(state,id,false);
    set.cards.push(...pending);set.updatedAt=Math.max(set.updatedAt,at);
    return result(state,id,true,pending.length);
  }
  function snapshot(state,id){
    const set=get(state,id),session=set?.session||null;
    const total=session?session.queue.length:0,completed=session?session.index:0;
    const card=session&&completed<total?session.queue[completed]:null;
    const repeatIds=session?session.answers.filter(answer=>answer.outcome==='repeat').map(answer=>answer.id):[];
    return {state,set,status:!set?'missing':session?(card?'active':'complete'):activeCards(set).length?'idle':'empty',
      card,token:card?JSON.stringify([set.id,session.id,session.round,session.index,card.id]):'',
      revealed:!!card&&session.revealed,total,completed,
      remembered:completed-repeatIds.length,repeat:repeatIds.length,repeatIds,round:session?session.round:0};
  }
  function view(raw,id){return snapshot(normalize(raw),id);}
  function session(state,set,queue,now,round=1){
    set.session={id:allocate(state,'session'),startedAt:now,round,
      queue:queue.map(copyCard),index:0,answers:[],revealed:false};
    set.updatedAt=Math.max(set.updatedAt,now);
  }
  function start(raw,id,now,options={restart:false}){
    const state=normalize(raw),set=get(state,id),at=time(now);
    if(!set)return {...snapshot(state,id),accepted:false};
    if(set.session&&options.restart!==true){
      set.session.revealed=false;
      return {...snapshot(state,id),accepted:true};
    }
    const queue=activeCards(set);
    if(!queue.length){
      // Explicit restart of an all-excluded set ends the old completed/active
      // session without inventing progress or reintroducing excluded cards.
      const cleared=options.restart===true&&!!set.session;
      if(cleared){set.session=null;set.updatedAt=Math.max(set.updatedAt,at);}
      return {...snapshot(state,id),accepted:cleared};
    }
    session(state,set,queue,at);
    return {...snapshot(state,id),accepted:true};
  }
  function reveal(raw,id,token){
    const current=view(raw,id);
    if(current.status!=='active'||!text(token)||token!==current.token||current.revealed)return {...current,accepted:false};
    current.set.session.revealed=true;
    return {...snapshot(current.state,id),accepted:true};
  }
  function grade(raw,id,token,outcome,now){
    const current=view(raw,id),at=time(now);
    if(current.status!=='active'||!current.revealed||!text(token)||token!==current.token
      ||!['remembered','repeat'].includes(outcome))return {...current,accepted:false};
    const set=current.set,round=set.session;
    round.answers.push({id:current.card.id,outcome,at});round.index++;round.revealed=false;
    set.updatedAt=Math.max(set.updatedAt,at);
    return {...snapshot(current.state,id),accepted:true};
  }
  function nextRound(raw,id,now){
    const current=view(raw,id),at=time(now);
    if(current.status!=='complete'||!current.repeat)return {...current,accepted:false};
    const repeat=new Set(current.repeatIds),set=current.set,previous=set.session;
    session(current.state,set,previous.queue.filter(card=>repeat.has(card.id)),at,previous.round+1);
    return {...snapshot(current.state,id),accepted:true};
  }
  return Object.freeze({VERSION,normalize,decode,cards,create,rename,remove,exclude,restore,setStatus,
    importPreview,importNew,view,start,reveal,grade,nextRound});
})();
