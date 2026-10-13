/* Local-only snapshot study sets. All state, vocabulary and time are explicit
   inputs. No storage, vocabulary writes, scheduling, network or AI calls. */
const BreezeStudySets = (() => {
  const VERSION=2;
  /** @typedef {{id:string,key:string,word:string,ko:string,example:string,book:string,addedAt:number,status:number,root?:string,group?:string,acceptedMeanings?:string[],senses?:Card[]}} Card */
  /** @typedef {{id:string,outcome:string,at:number}} Answer */
  /** @typedef {{id:string,startedAt:number,round:number,queue:Card[],index:number,answers:Answer[],revealed:boolean,format:number,serial:number}} Session */
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
    /** @type {Card} */
    const card={id:raw.id,key:raw.key,word:raw.word,ko:raw.ko,example:raw.example,book:raw.book,addedAt:raw.addedAt,status:raw.status||1};
    if(raw.root!==undefined){if(!nonblank(raw.root))fail();card.root=raw.root;}
    const representative=raw.senses!==undefined||raw.acceptedMeanings!==undefined||raw.group!==undefined;
    if(representative){
      if(!nonblank(raw.group)||!Array.isArray(raw.senses)||!raw.senses.length
        ||raw.senses.some(sense=>!record(sense)||sense.senses!==undefined||sense.acceptedMeanings!==undefined||sense.group!==undefined))fail();
      const senses=copyCards(raw.senses),acceptedMeanings=strings(raw.acceptedMeanings);
      const roots=new Set(senses.map(sense=>sense.root).filter(nonblank));
      if(senses[0].id!==card.id||JSON.stringify(acceptedMeanings)!==JSON.stringify([...new Set(senses.map(sense=>sense.ko))])
        ||senses.some(sense=>groupIdentity(sense,roots)!==raw.group))fail();
      card.group=raw.group;card.senses=senses;card.acceptedMeanings=acceptedMeanings;
    }
    return card;
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
    if(!queue.length||raw.index>queue.length)fail();
    if(raw.format!==undefined&&raw.format!==2)fail();
    const legacy=raw.format!==2;
    if(legacy&&raw.answers.length!==raw.index)fail();
    const pending=queue.map(card=>card.id),passed=[];
    const answers=raw.answers.map((answer,index)=>{
      if(!record(answer)||!['remembered','repeat'].includes(answer.outcome)||!count(answer.at)
        ||answer.id!==(legacy?queue[index]?.id:pending[0]))fail();
      // Replay responses against a unique frozen inventory; repeat never duplicates cards.
      const at=pending.indexOf(answer.id);if(at<0)fail();pending.splice(at,1);
      if(answer.outcome==='repeat')pending.push(answer.id);else passed.push(answer.id);
      return {id:answer.id,outcome:answer.outcome,at:answer.at};
    });
    if(!legacy&&(!count(raw.serial)||raw.serial<answers.length||raw.index!==passed.length))fail();
    if(raw.revealed&&!pending.length)fail();
    return {id:raw.id,startedAt:raw.startedAt,round:raw.round,queue,index:passed.length,answers,revealed:raw.revealed,format:2,serial:legacy?answers.length:raw.serial};
  }
  /** Strictly decode one known schema. Corruption and future versions must stop
      writes instead of being silently replaced with an empty collection.
      @returns {State} */
  function normalize(raw){
    if(raw===null||raw===undefined)return empty();
    if(record(raw)&&typeof raw.version==='number'&&raw.version>VERSION)
      throw new RangeError('This study sets version is newer than this app. The saved value was not changed.');
    if(!record(raw)||![1,VERSION].includes(raw.version)||!count(raw.sequence)||!Array.isArray(raw.sets))fail();
    const sets=raw.sets.map(item=>{
      if(!record(item)||!nonblank(item.id)||!nonblank(item.name)||!count(item.createdAt)
        ||!count(item.updatedAt)||item.updatedAt<item.createdAt)fail();
      const bookTitles=strings(item.bookTitles,true),cards=copyCards(item.cards),excludedIds=strings(item.excludedIds);
      if(!bookTitles.length)fail();
      const session=copySession(item.session);
      // A session freezes its content; its cards must still belong to this set.
      // Excluded cards remain stored and are not pruned from an active round.
      const ids=new Set(cards.map(card=>card.id));
      if(excludedIds.some(id=>!ids.has(id))||(session&&session.queue.some(card=>!ids.has(card.id)||card.senses?.some(sense=>!ids.has(sense.id)))))fail();
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
        example:text(item.example)?item.example:'',book:text(item.book)?item.book:'',addedAt:count(item.addedAt)?item.addedAt:0,status:[1,2,3].includes(item.status)?item.status:1,...(nonblank(item.root)?{root:item.root}:{})}))
      .sort((a,b)=>a.addedAt-b.addedAt||compare(a.key,b.key));
    const seen=new Set();
    return available.filter(card=>{if(seen.has(card.id))return false;seen.add(card.id);return true;});
  }
  function get(state,id){return state.sets.find(item=>item.id===id)||null;}
  function activeCards(set){const excluded=new Set(set.excludedIds);return set.cards.filter(card=>!excluded.has(card.id));}
  /** Preserve every saved sense while projecting one card per word for a new
      session. Old snapshots use exact case-preserving expression identity. */
  function groupIdentity(card,roots){
    const root=card.root||(roots.has(card.key)?card.key:'');
    return root?'root:'+root:'word:'+card.word.trim().normalize('NFC').replace(/\s+/g,' ');
  }
  function groupedCards(setOrCards){
    const source=Array.isArray(setOrCards)?setOrCards:activeCards(setOrCards);
    const originals=source.flatMap(card=>card.senses||[card]),roots=new Set(originals.map(card=>card.root).filter(nonblank)),groups=new Map(),seen=new Set();
    for(const raw of originals){
      const card=copyCard(raw);if(seen.has(card.id))continue;seen.add(card.id);const group=groupIdentity(card,roots);
      if(!groups.has(group))groups.set(group,[]);
      groups.get(group).push(card);
    }
    return [...groups].map(([group,senses])=>({...senses[0],group,senses,acceptedMeanings:[...new Set(senses.map(card=>card.ko))]}));
  }

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
  function addBooks(raw,id,bookTitles,words,now){
    const state=normalize(raw),set=get(state,id),at=time(now);
    if(!set||!Array.isArray(bookTitles))return result(state,id,false);
    const additions=[...new Set(bookTitles.filter(text))].filter(title=>!set.bookTitles.includes(title));
    if(!additions.length)return result(state,id,false);
    // Capture only the explicitly added sources. Existing snapshots, exclusions
    // and the current frozen learning queue keep their identities and contents.
    const pending=newCards({...set,bookTitles:additions},words);
    set.bookTitles.push(...additions);set.cards.push(...pending);set.updatedAt=Math.max(set.updatedAt,at);
    return result(state,id,true,pending.length);
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
    const pending=session?session.queue.map(card=>card.id):[];
    for(const answer of session?.answers||[]){pending.shift();if(answer.outcome==='repeat')pending.push(answer.id);}
    const card=session&&pending.length?session.queue.find(card=>card.id===pending[0]):null;
    const repeatIds=[...new Set((session?.answers||[]).filter(answer=>answer.outcome==='repeat'&&pending.includes(answer.id)).map(answer=>answer.id))];
    const pendingSet=new Set(pending),pendingMeaningIds=[],rememberedMeaningIds=[];
    for(const representative of session?.queue||[]){const target=pendingSet.has(representative.id)?pendingMeaningIds:rememberedMeaningIds;target.push(...(representative.senses||[representative]).map(sense=>sense.id));}
    return {state,set,pendingMeaningIds,rememberedMeaningIds,status:!set?'missing':session?(card?'active':'complete'):activeCards(set).length?'idle':'empty',
      card,token:card?JSON.stringify([set.id,session.id,session.round,session.serial,card.id]):'',
      revealed:!!card&&session.revealed,total,completed,
      remembered:completed,repeat:repeatIds.length,repeatIds,round:session?session.round:0,pendingIds:pending};
  }
  function view(raw,id){return snapshot(normalize(raw),id);}
  function session(state,set,queue,now,round=1){
    set.session={id:allocate(state,'session'),startedAt:now,round,
      queue:queue.map(copyCard),index:0,answers:[],revealed:false,format:2,serial:0};
    set.updatedAt=Math.max(set.updatedAt,now);
  }
  function start(raw,id,now,options={restart:false}){
    const state=normalize(raw),set=get(state,id),at=time(now);
    if(!set)return {...snapshot(state,id),accepted:false};
    if(set.session&&options.restart!==true){
      set.session.revealed=false;
      return {...snapshot(state,id),accepted:true};
    }
    const queue=groupedCards(set);
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
    round.answers.push({id:current.card.id,outcome,at});if(outcome==='remembered')round.index++;round.serial++;round.revealed=false;
    set.updatedAt=Math.max(set.updatedAt,at);
    return {...snapshot(current.state,id),accepted:true};
  }
  function undo(raw,id,now){
    const current=view(raw,id),at=time(now),session=current.set?.session;
    if(!session?.answers.length)return {...current,accepted:false};
    const answer=session.answers.pop();if(answer.outcome==='remembered')session.index--;
    session.serial++;session.revealed=false;current.set.updatedAt=Math.max(current.set.updatedAt,at);
    return {...snapshot(current.state,id),accepted:true};
  }
  // Compatibility entry: repeats stay in the current session, not a completed round.
  function nextRound(raw,id,now){time(now);return {...view(raw,id),accepted:false};}
  return Object.freeze({VERSION,normalize,decode,cards,create,rename,remove,exclude,restore,setStatus,
    importPreview,importNew,addBooks,groupedCards,view,start,reveal,grade,nextRound,undo});
})();
