/* Snapshot study sets. All state, vocabulary and time are explicit
   inputs. No storage, vocabulary writes, scheduling, network or AI calls. */
const BreezeStudySets = (() => {
  const VERSION=2;
  /** @typedef {{id:string,key:string,word:string,ko:string,example:string,book:string,addedAt:number,status:number,root?:string,group?:string,acceptedMeanings?:string[],senses?:Card[]}} Card */
  /** @typedef {{id:string,outcome:string,at:number}} Answer */
  /** @typedef {{id:string,startedAt:number,round:number,queue:Card[],index:number,answers:Answer[],revealed:boolean,format:number,serial:number,stars?:number[]}} Session */
  /** @typedef {{at:number,id:string}} Change */
  /** @typedef {{id:string,name:string,bookTitles:string[],createdAt:number,updatedAt:number,cards:Card[],excludedIds:string[],session:Session|null,archivedSessions?:Session[],nameChange?:Change,cardChanges?:Object<string,Change & {present:boolean}>,exclusionChanges?:Object<string,Change & {excluded:boolean}>,statusChanges?:Object<string,Change & {status:number}>}} StudySet */
  /** @typedef {{version:number,sequence:number,sets:StudySet[],deletedSetIds?:string[]}} State */
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
    const session={id:raw.id,startedAt:raw.startedAt,round:raw.round,queue,index:passed.length,answers,revealed:raw.revealed,format:2,serial:legacy?answers.length:raw.serial};
    const stars=sessionStars(raw.stars);
    if(stars.length)session.stars=stars;
    return session;
  }
  function sessionStars(raw){
    if(!Array.isArray(raw))return [];
    const stars=[];
    for(const value of raw)if([1,2,3].includes(value)&&!stars.includes(value))stars.push(value);
    return stars.sort((a,b)=>a-b);
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
      const set={id:item.id,name:item.name,bookTitles,createdAt:item.createdAt,updatedAt:item.updatedAt,cards,excludedIds,session};
      const exclusionChanges=copyChanges(item.exclusionChanges,'excluded'),cardChanges=copyChanges(item.cardChanges,'present');
      if(exclusionChanges)set.exclusionChanges=exclusionChanges;
      if(cardChanges)set.cardChanges=cardChanges;
      if(item.nameChange!==undefined){
        if(!record(item.nameChange)||!count(item.nameChange.at)||!nonblank(item.nameChange.id))fail();
        set.nameChange={at:item.nameChange.at,id:item.nameChange.id};
      }
      if(item.statusChanges!==undefined){
        if(!record(item.statusChanges))fail();
        set.statusChanges={};
        for(const [id,change] of Object.entries(item.statusChanges)){
          if(!nonblank(id)||!record(change)||!count(change.at)||!nonblank(change.id)||![1,2,3].includes(change.status))fail();
          set.statusChanges[id]={at:change.at,id:change.id,status:change.status};
        }
      }
      if(item.archivedSessions!==undefined){
        if(!Array.isArray(item.archivedSessions)||item.archivedSessions.some(value=>value===null))fail();
        set.archivedSessions=item.archivedSessions.map(copySession);
      }
      return set;
    });
    if(new Set(sets.map(item=>item.id)).size!==sets.length)fail();
    const state={version:VERSION,sequence:raw.sequence,sets};
    if(raw.deletedSetIds!==undefined){
      state.deletedSetIds=strings(raw.deletedSetIds);
      if(state.deletedSetIds.some(id=>sets.some(set=>set.id===id)))fail();
    }
    return state;
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
  /** Unique saved meanings per book. Same selection as cards(words, [book]).length. */
  function countsByBook(words){
    if(!record(words))return new Map();
    const counts=new Map(),seen=new Map();
    for(const [key,item] of Object.entries(words)){
      if(!nonblank(key)||!record(item)||!own(item,'word')||!own(item,'ko')||!nonblank(item.word)||!nonblank(item.ko))continue;
      const book=text(item.book)?item.book:'',id=identity(item.word,item.ko);
      let ids=seen.get(book);
      if(!ids){ids=new Set();seen.set(book,ids);}
      if(ids.has(id))continue;
      ids.add(id);counts.set(book,(counts.get(book)||0)+1);
    }
    return counts;
  }
  function get(state,id){return state.sets.find(item=>item.id===id)||null;}
  function activeCards(set){const excluded=new Set(set.excludedIds);return set.cards.filter(card=>!excluded.has(card.id)&&present(set,card.id));}
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

  function uniqueId(){
    if(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function')return crypto.randomUUID();
    if(typeof crypto!=='undefined'&&typeof crypto.getRandomValues==='function')return [...crypto.getRandomValues(new Uint32Array(4))].map(value=>value.toString(16).padStart(8,'0')).join('');
    // The fallback serves older WebViews and isolated test realms. New records
    // never rely on a device-local counter for their distributed identity.
    return Array.from({length:4},()=>Math.floor(Math.random()*0x100000000).toString(16).padStart(8,'0')).join('');
  }
  function stamp(at,value){return {...value,at,id:uniqueId()};}
  function copyChanges(raw,field){
    if(raw===undefined)return undefined;
    if(!record(raw))fail();
    const output={};
    for(const [key,value] of Object.entries(raw)){
      if(!nonblank(key)||!record(value)||typeof value[field]!=='boolean'||!count(value.at)||!nonblank(value.id))fail();
      output[key]={[field]:value[field],at:value.at,id:value.id};
    }
    return output;
  }
  function present(set,id){return set.cardChanges?.[id]?.present!==false;}
  function markCards(set,items,at,presentValue){
    if(!items.length)return;
    if(!set.cardChanges)set.cardChanges={};
    for(const card of items)set.cardChanges[card.id]=stamp(Math.max(at,(set.cardChanges[card.id]?.at??-1)+1),{present:presentValue});
  }
  function allocate(state,prefix){
    if(state.sequence>=Number.MAX_SAFE_INTEGER)throw new RangeError('Study set sequence exhausted');
    state.sequence++;
    return `${prefix}-${uniqueId()}`;
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
    set.name=name.trim();set.nameChange=stamp(Math.max(at,(set.nameChange?.at??set.createdAt)+1),{});set.updatedAt=Math.max(set.updatedAt,at);
    return result(state,id,true);
  }
  function remove(raw,id){
    const state=normalize(raw),set=get(state,id);
    if(!set)return result(state,id,false);
    state.sets=state.sets.filter(item=>item.id!==id);
    state.deletedSetIds=[...new Set([...(state.deletedSetIds||[]),id])];
    return result(state,id,true);
  }
  function setExcluded(raw,id,cardId,excluded,now){
    const state=normalize(raw),set=get(state,id),at=time(now);
    if(!set||!set.cards.some(card=>card.id===cardId)||set.excludedIds.includes(cardId)===excluded)return result(state,id,false);
    set.excludedIds=excluded?[...set.excludedIds,cardId]:set.excludedIds.filter(value=>value!==cardId);
    if(!set.exclusionChanges)set.exclusionChanges={};
    set.exclusionChanges[cardId]=stamp(Math.max(at,(set.exclusionChanges[cardId]?.at??-1)+1),{excluded});
    set.updatedAt=Math.max(set.updatedAt,at);
    return result(state,id,true);
  }
  function setStatus(raw,id,cardId,status,now){
    if(![1,2,3].includes(status))throw new TypeError('Invalid study card status');
    const state=normalize(raw),set=get(state,id),at=time(now),card=set?.cards.find(item=>item.id===cardId);
    if(!card||card.status===status)return result(state,id,false);
    card.status=status;if(!set.statusChanges)set.statusChanges={};
    set.statusChanges[cardId]=stamp(Math.max(at,(set.statusChanges[cardId]?.at??set.createdAt)+1),{status});set.updatedAt=Math.max(set.updatedAt,at);
    return result(state,id,true);
  }
  function exclude(raw,id,cardId,now){return setExcluded(raw,id,cardId,true,now);}
  function restore(raw,id,cardId,now){return setExcluded(raw,id,cardId,false,now);}
  function newCards(set,words){
    const current=set.cards.filter(card=>present(set,card.id));
    const known=new Set([...current.map(card=>card.id),...set.excludedIds]);
    const knownKeys=new Set(current.map(card=>card.key));
    // An edited meaning keeps the captured card. Only a new save is added.
    return cards(words,set.bookTitles).filter(card=>!known.has(card.id)&&!knownKeys.has(card.key));
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
    set.bookTitles.push(...additions);appendCards(set,pending,at);set.updatedAt=Math.max(set.updatedAt,at);
    return result(state,id,true,pending.length);
  }
  function importNew(raw,id,words,now){
    const state=normalize(raw),set=get(state,id),at=time(now);
    if(!set)return result(state,id,false);
    const pending=newCards(set,words);
    if(!pending.length)return result(state,id,false);
    appendCards(set,pending,at);set.updatedAt=Math.max(set.updatedAt,at);
    return result(state,id,true,pending.length);
  }
  function appendCards(set,pending,at){
    const known=new Set(set.cards.map(card=>card.id));
    set.cards.push(...pending.filter(card=>!known.has(card.id)));
    markCards(set,pending,at,true);
  }
  function deletedKeys(options){
    const values=options?.deletedKeys;
    return values instanceof Set?values:new Set(Array.isArray(values)?values:record(values)?Object.keys(values):[]);
  }
  function deletionLookup(options){
    const values=options?.deletedKeys;
    return {has:key=>values instanceof Set?values.has(key):Array.isArray(values)?values.includes(key):record(values)?own(values,key):false};
  }
  function liveIdentities(vocabulary){return new Set(cards(vocabulary).map(card=>card.id));}
  // An in-place meaning edit keeps its snapshot. A record is gone only when its
  // key is absent and no remaining save still has the same word and meaning.
  function meaningGone(card,vocabulary,live,deleted){
    if(!deleted.has(card.key))return false;
    const current=vocabulary[card.key];
    if(record(current)&&nonblank(current.word)&&nonblank(current.ko))return false;
    return !live.has(card.id);
  }
  function sessionReferences(session){
    const ids=new Set();if(!session)return ids;
    for(const card of session.queue){ids.add(card.id);for(const sense of card.senses||[])ids.add(sense.id);}
    return ids;
  }
  function sessionIsActive(session){
    if(!session)return false;
    const pending=session.queue.map(card=>card.id);
    for(const answer of session.answers){
      const at=pending.indexOf(answer.id);if(at<0)continue;
      pending.splice(at,1);if(answer.outcome==='repeat')pending.push(answer.id);
    }
    return pending.length>0;
  }
  function dropMissingCards(set,vocabulary,options,at){
    const live=liveIdentities(vocabulary),deleted=deletedKeys(options),gone=[];
    for(const card of set.cards)if(present(set,card.id)&&meaningGone(card,vocabulary,live,deleted))gone.push(card);
    if(!gone.length)return 0;
    markCards(set,gone,at,false);
    const excluded=new Set(set.excludedIds);
    set.cards=set.cards.filter(card=>present(set,card.id)||excluded.has(card.id));
    return gone.length;
  }
  /** Cards the set list should show. An active round keeps a deleted word until
      that round ends; a finished round hides it without breaking Undo. */
  function listedCards(set,vocabulary,excludedSide=false,options={}){
    const excluded=new Set(set.excludedIds),protect=sessionIsActive(set.session)?sessionReferences(set.session):new Set();
    const deleted=deletionLookup(options);
    // Most renders have no missing, explicitly deleted source. They need only
    // this set's snapshots, never an enumeration of the whole wordbook.
    const needsLive=!excludedSide&&record(vocabulary)&&set.cards.some(card=>{
      const current=vocabulary[card.key];
      return !protect.has(card.id)&&deleted.has(card.key)&&!(record(current)&&nonblank(current.word)&&nonblank(current.ko));
    });
    const live=needsLive?(options.index?.identities||liveIdentities(vocabulary)):null;
    return set.cards.filter(card=>{
      if(excluded.has(card.id)!==!!excludedSide)return false;
      if(excludedSide||protect.has(card.id))return true;
      if(!present(set,card.id))return false;
      return !live||!meaningGone(card,vocabulary,live,deleted);
    });
  }
  // Book sets follow later saves from their books. Exclusions stay out. An
  // active or finished round keeps every card it still references.
  function syncVocabulary(raw,vocabulary,now,options={}){
    const state=normalize(raw),at=time(now);
    if(!record(vocabulary))return {state,accepted:false,added:0,removed:0};
    const live=liveIdentities(vocabulary),deleted=deletedKeys(options);let added=0,removed=0,reactivated=0;
    for(const set of state.sets){
      const pending=newCards(set,vocabulary),protect=sessionReferences(set.session),gone=new Set();
      const returning=set.cards.filter(card=>!present(set,card.id)&&live.has(card.id));
      for(const card of set.cards)if(present(set,card.id)&&meaningGone(card,vocabulary,live,deleted)&&!protect.has(card.id))gone.add(card.id);
      if(!pending.length&&!gone.size&&!returning.length)continue;
      if(returning.length){markCards(set,returning,at,true);reactivated+=returning.length;}
      if(pending.length){appendCards(set,pending,at);added+=pending.length;}
      if(gone.size){
        markCards(set,set.cards.filter(card=>gone.has(card.id)),at,false);
        // Keep excluded snapshots as durable evidence even while their source
        // is deleted. A later return cannot erase the user's exclusion choice.
        const excluded=new Set(set.excludedIds);
        set.cards=set.cards.filter(card=>!gone.has(card.id)||excluded.has(card.id));removed+=gone.size;
      }
      set.updatedAt=Math.max(set.updatedAt,at);
    }
    return {state,accepted:added+removed+reactivated>0,added,removed};
  }
  function indexAdd(map,key,value){
    let values=map.get(key);if(!values){values=new Set();map.set(key,values);}values.add(value);
  }
  function indexRemove(map,key,value){
    const values=map.get(key);if(!values)return;values.delete(value);if(!values.size)map.delete(key);
  }
  function indexedWord(key,item){
    if(!nonblank(key)||!record(item)||!own(item,'word')||!own(item,'ko')||!nonblank(item.word)||!nonblank(item.ko))return null;
    return {id:identity(item.word,item.ko),book:text(item.book)?item.book:''};
  }
  /** Build once after account hydration or a full remote vocabulary replacement.
      The UI discards this index on account changes and structural set edits. */
  function createVocabularySyncIndex(raw,vocabulary){
    const index={records:new Map(),identities:new Map(),books:new Map(),sources:new Map(),meanings:new Map(),positions:new Map(),setCount:raw.sets.length};
    for(const [key,item] of Object.entries(vocabulary||{})){
      const entry=indexedWord(key,item);if(!entry)continue;
      index.records.set(key,entry);indexAdd(index.identities,entry.id,key);
    }
    raw.sets.forEach((set,position)=>{
      index.positions.set(set.id,position);
      for(const book of set.bookTitles)indexAdd(index.books,book,set.id);
      for(const card of set.cards){indexAdd(index.sources,card.key,set.id);indexAdd(index.meanings,card.id,set.id);}
    });
    return index;
  }
  /** Apply keyed local changes only to their related sets. The input collection
      was validated when hydrated; unrelated sets retain their object identity.
      A full sync is still required after external collection replacement. */
  function syncVocabularyChanges(raw,vocabulary,changedKeys,now,index,options={}){
    const at=time(now);
    if(!index||index.setCount!==raw.sets.length||!Array.isArray(changedKeys))throw new TypeError('A current study vocabulary index and changed keys are required');
    const keys=[...new Set(changedKeys.filter(nonblank))],related=new Set(),changed={},affectedIdentities=new Set(),returnedIdentities=new Set();
    for(const key of keys){
      const previous=index.records.get(key),next=indexedWord(key,vocabulary[key]);
      for(const setId of index.sources.get(key)||[])related.add(setId);
      for(const identity of [previous?.id,next?.id])if(identity!==undefined)for(const setId of index.meanings.get(identity)||[])related.add(setId);
      for(const book of [previous?.book,next?.book])if(book!==undefined)for(const setId of index.books.get(book)||[])related.add(setId);
      if(previous){affectedIdentities.add(previous.id);indexRemove(index.identities,previous.id,key);index.records.delete(key);}
      if(next){affectedIdentities.add(next.id);returnedIdentities.add(next.id);index.records.set(key,next);indexAdd(index.identities,next.id,key);changed[key]=vocabulary[key];}
    }
    const deleted=deletionLookup(options);
    const live={has:id=>index.identities.has(id)},keySet=new Set(keys),replacements=new Map();let added=0,removed=0,reactivated=0;
    for(const id of related){
      const position=index.positions.get(id),original=raw.sets[position];
      if(!original||original.id!==id)throw new TypeError('The study vocabulary index is stale');
      const set=normalize({version:raw.version,sequence:raw.sequence,sets:[original]}).sets[0];
      const pending=newCards(set,changed),protect=sessionReferences(set.session),gone=new Set();
      const returning=set.cards.filter(card=>!present(set,card.id)&&returnedIdentities.has(card.id));
      for(const card of set.cards)if((keySet.has(card.key)||affectedIdentities.has(card.id))&&present(set,card.id)&&meaningGone(card,vocabulary,live,deleted)&&!protect.has(card.id))gone.add(card.id);
      if(!pending.length&&!gone.size&&!returning.length)continue;
      if(returning.length){markCards(set,returning,at,true);reactivated+=returning.length;}
      if(pending.length){appendCards(set,pending,at);added+=pending.length;}
      if(gone.size){
        markCards(set,set.cards.filter(card=>gone.has(card.id)),at,false);
        const excluded=new Set(set.excludedIds);
        set.cards=set.cards.filter(card=>!gone.has(card.id)||excluded.has(card.id));removed+=gone.size;
      }
      set.updatedAt=Math.max(set.updatedAt,at);replacements.set(position,set);
      for(const card of original.cards){indexRemove(index.sources,card.key,id);indexRemove(index.meanings,card.id,id);}
      for(const card of set.cards){indexAdd(index.sources,card.key,id);indexAdd(index.meanings,card.id,id);}
    }
    if(!replacements.size)return {state:raw,accepted:false,added:0,removed:0,touched:related.size,changedSetIds:[]};
    const state={...raw,sets:raw.sets.slice()};
    for(const [position,set] of replacements)state.sets[position]=set;
    return {state,accepted:added+removed+reactivated>0,added,removed,touched:related.size,changedSetIds:[...replacements.values()].map(set=>set.id)};
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
  function session(state,set,queue,now,round=1,stars=[]){
    set.session={id:allocate(state,'session'),startedAt:now,round,
      queue:queue.map(copyCard),index:0,answers:[],revealed:false,format:2,serial:0};
    const chosen=sessionStars(stars);
    if(chosen.length)set.session.stars=chosen;
    set.updatedAt=Math.max(set.updatedAt,now);
  }
  function start(raw,id,now,options={restart:false}){
    const state=normalize(raw),set=get(state,id),at=time(now);
    if(!set)return {...snapshot(state,id),accepted:false};
    if(set.session&&options.restart!==true){
      set.session.revealed=false;
      return {...snapshot(state,id),accepted:true};
    }
    // The round being replaced kept deleted words so its own queue stayed valid.
    if(record(options.words))dropMissingCards(set,options.words,options,at);
    const stars=sessionStars(options.stars);
    let queue=groupedCards(set);
    if(stars.length)queue=queue.filter(card=>stars.includes(card.status||1));
    if(!queue.length){
      // Explicit restart of an all-excluded set ends the old completed/active
      // session without inventing progress or reintroducing excluded cards.
      const cleared=options.restart===true&&!!set.session;
      if(cleared){set.session=null;set.updatedAt=Math.max(set.updatedAt,at);}
      return {...snapshot(state,id),accepted:cleared};
    }
    session(state,set,queue,at,1,stars);
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
  function canonical(value){
    if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
    if(record(value))return '{'+Object.keys(value).sort(compare).map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
    return JSON.stringify(value);
  }
  function newerChange(left,right){
    return !left?right:!right?left:left.at!==right.at?(left.at>right.at?left:right):compare(left.id,right.id)>=0?left:right;
  }
  function mergeChanges(left,right){
    const result={};
    for(const id of [...new Set([...Object.keys(left||{}),...Object.keys(right||{})])].sort(compare))
      result[id]=newerChange(left?.[id],right?.[id]);
    return result;
  }
  function sessionAncestor(left,right){
    return left.id===right.id&&left.serial<=right.serial&&canonical(left.queue)===canonical(right.queue)
      &&left.answers.length<=right.answers.length&&left.answers.every((answer,index)=>canonical(answer)===canonical(right.answers[index]));
  }
  function mergeSet(left,right){
    const leftName=left.nameChange||{at:left.createdAt,id:'legacy-name:'+left.name},rightName=right.nameChange||{at:right.createdAt,id:'legacy-name:'+right.name};
    const nameChange=newerChange(leftName,rightName),latest=nameChange===leftName?left:right;
    const merged={...latest,createdAt:Math.min(left.createdAt,right.createdAt),updatedAt:Math.max(left.updatedAt,right.updatedAt),
      nameChange,bookTitles:[...new Set([...left.bookTitles,...right.bookTitles])].sort(compare)};
    const exclusions=set=>{
      const changes={...set.exclusionChanges};
      for(const id of set.excludedIds)if(!changes[id])changes[id]={excluded:true,at:set.createdAt,id:'legacy-exclusion'};
      return changes;
    };
    merged.exclusionChanges=mergeChanges(exclusions(left),exclusions(right));
    merged.cardChanges=mergeChanges(left.cardChanges,right.cardChanges);
    merged.statusChanges=mergeChanges(left.statusChanges,right.statusChanges);
    const captured=new Map();
    for(const card of [...left.cards,...right.cards]){
      const previous=captured.get(card.id);
      const chosen=!previous||compare(canonical({...card,status:0}),canonical({...previous,status:0}))<0?card:previous;
      captured.set(card.id,{...chosen,status:merged.statusChanges[card.id]?.status||Math.max(card.status,previous?.status||1)});
    }
    const sessions=new Map();
    for(const session of [...(left.archivedSessions||[]),...(right.archivedSessions||[]),left.session,right.session])
      if(session)sessions.set(canonical(session),session);
    const candidates=[...sessions.values()].sort((a,b)=>a.startedAt-b.startedAt||a.serial-b.serial||compare(canonical(a),canonical(b)));
    merged.session=candidates.at(-1)||null;
    merged.archivedSessions=candidates.filter(candidate=>candidate!==merged.session&&!candidates.some(other=>other!==candidate
      &&sessionAncestor(candidate,other)&&(candidate.serial<other.serial||candidate.answers.length<other.answers.length||compare(canonical(candidate),canonical(other))<0)));
    // A frozen queue remains independently playable even if the remote writer
    // has removed a source or excluded its captured meaning in the meantime.
    for(const card of merged.session?.queue||[])for(const sense of card.senses||[card])if(!captured.has(sense.id))captured.set(sense.id,sense);
    const protectedIds=sessionReferences(merged.session),excluded=new Set(Object.entries(merged.exclusionChanges).filter(([,change])=>change.excluded).map(([id])=>id));
    merged.cards=[...captured.values()].filter(card=>present(merged,card.id)||excluded.has(card.id)||protectedIds.has(card.id))
      .sort((a,b)=>a.addedAt-b.addedAt||compare(a.id,b.id));
    const available=new Set(merged.cards.map(card=>card.id));
    merged.excludedIds=[...excluded].filter(id=>available.has(id)).sort(compare);
    return merged;
  }
  /** A set deletion is permanent for its unique ID. Concurrent sessions are
      retained whole; answering two different frozen queues is never combined. */
  function mergeStates(local,remote){
    const left=normalize(local),right=normalize(remote),deleted=[...new Set([...(left.deletedSetIds||[]),...(right.deletedSetIds||[])])].sort(compare);
    const tombstones=new Set(deleted),merged=new Map(left.sets.filter(set=>!tombstones.has(set.id)).map(set=>[set.id,set]));
    for(const set of right.sets)if(!tombstones.has(set.id))merged.set(set.id,merged.has(set.id)?mergeSet(merged.get(set.id),set):set);
    const state={version:VERSION,sequence:Math.max(left.sequence,right.sequence),sets:[...merged.values()].sort((a,b)=>a.createdAt-b.createdAt||compare(a.id,b.id))};
    if(deleted.length)state.deletedSetIds=deleted;
    return normalize(state);
  }
  /** The caller persists namespace with the source backup/import journal before
      publishing this state. Reusing it makes retry after interruption idempotent.
      Semantic card IDs already encode the full exact word/meaning tuple. */
  function migrateIds(raw,namespace,options={}){
    if(!nonblank(namespace))throw new TypeError('A stable study import namespace is required');
    const state=normalize(raw),setIds={},sessionIds={},wordKeys=record(options.wordKeys)?options.wordKeys:{};
    const mapped=(id,prefix,table)=>{
      const next=new RegExp('^'+prefix+'-[0-9]+$').test(id)?prefix+'-import-'+encodeURIComponent(namespace)+'-'+id:id;
      table[id]=next;return next;
    };
    const cardKeys=card=>{
      if(own(wordKeys,card.key))card.key=wordKeys[card.key];
      if(card.root&&own(wordKeys,card.root))card.root=wordKeys[card.root];
      if(card.senses){
        card.senses.forEach(cardKeys);
        const roots=new Set(card.senses.map(sense=>sense.root).filter(nonblank));
        card.group=groupIdentity(card.senses[0],roots);
      }
    };
    for(const set of state.sets){
      set.id=mapped(set.id,'set',setIds);set.cards.forEach(cardKeys);
      for(const session of [set.session,...(set.archivedSessions||[])])if(session){session.id=mapped(session.id,'session',sessionIds);session.queue.forEach(cardKeys);}
    }
    if(state.deletedSetIds)state.deletedSetIds=state.deletedSetIds.map(id=>mapped(id,'set',setIds));
    return {state:normalize(state),setIds,sessionIds};
  }
  // Compatibility entry: repeats stay in the current session, not a completed round.
  function nextRound(raw,id,now){time(now);return {...view(raw,id),accepted:false};}
  return Object.freeze({VERSION,normalize,decode,cards,countsByBook,create,rename,remove,exclude,restore,setStatus,
    importPreview,importNew,addBooks,groupedCards,listedCards,syncVocabulary,createVocabularySyncIndex,syncVocabularyChanges,view,start,reveal,grade,nextRound,undo,mergeStates,migrateIds});
})();
