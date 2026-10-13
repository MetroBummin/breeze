/* Recall tests are local snapshots, separate from vocabulary, card study and FSRS.
   No string comparison here claims that a Korean response is semantically correct. */
const BreezeVocabularyTest=(()=>{
  // Retain the prototype and saved answers, but exclude its UI from 1.9.3.
  const ENABLED=false;
  const VERSION=1,MAX_ANSWER=1000;
  const text=v=>typeof v==='string',nonblank=v=>text(v)&&!!v.trim();
  const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const integer=v=>Number.isSafeInteger(v)&&v>=0;
  const fail=()=>{throw new Error('Invalid vocabulary test data. Original data retained.');};
  const identity=(key,word,ko,addedAt)=>JSON.stringify([key,word,ko,addedAt]);
  function cards(entries){
    const seen=new Set(),result=[];
    for(const [key,item] of entries){
      if(!nonblank(key)||!object(item)||!nonblank(item.word)||!nonblank(item.ko))continue;
      const addedAt=integer(item.addedAt)?item.addedAt:0,id=identity(key,item.word,item.ko,addedAt);
      if(seen.has(id))continue;seen.add(id);
      result.push({id,key,group:nonblank(item.root)?item.root:key,word:item.word,ko:item.ko,addedAt,example:text(item.example)?item.example:'',
        forms:[item.clicked,...(Array.isArray(item.forms)?item.forms:[])].filter(nonblank).slice(0,32)});
    }
    return result;
  }
  function prompt(card){
    if(card.acceptedMeanings?.length>1)return {text:'',ranges:[]};
    const example=typeof card.example==='string'?card.example.trim():'';
    // Source metadata is not trustworthy: instructions, translations, markup and
    // ambiguous fragments are omitted rather than promoted to a recall question.
    if(!example||example.length>1500||/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af\u3400-\u9fff<>]/u.test(example)
      ||(example.match(/[A-Za-z]+/g)||[]).length<4||!/[.!?]["'”’)]?$/.test(example)
      ||/\b(choose|select|underline|instructions?|ignore\s+(?:previous|prior)|read\s+the\s+(?:passage|text)|complete\s+the\s+sentence|which\s+of|match\s+the|fill\s+in|blank|correct\s+answer|following\s+(?:question|sentence)|multiple.choice|translate|meaning\s+of|question\s*\d|answer\s*[:：])\b/i.test(example)
      ||example.toLocaleLowerCase().includes(card.ko.trim().toLocaleLowerCase()))return {text:'',ranges:[]};
    const forms=[card.word,...(Array.isArray(card.forms)?card.forms:[])].map(s=>s.trim()).filter(Boolean).sort((a,b)=>b.length-a.length);
    const alternatives=[...new Set(forms)].map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
    const re=new RegExp('(^|[^\\p{L}\\p{N}_])('+alternatives.join('|')+')(?=$|[^\\p{L}\\p{N}_])','giu'),ranges=[];
    for(const match of example.matchAll(re)){const start=match.index+match[1].length;ranges.push({start,end:start+match[2].length});}
    return ranges.length?{text:example,ranges}:{text:'',ranges:[]};
  }
  function groups(available){
    const byGroup=new Map();for(const card of available){if(!byGroup.has(card.group))byGroup.set(card.group,[]);byGroup.get(card.group).push(card);}return byGroup;
  }
  function start(available,scope,size=20,random=Math.random,now=Date.now()){
    const grouped=groups(available),total=grouped.size;
    if(!total)throw new Error('No vocabulary test cards');
    const count=size;
    if(!Number.isSafeInteger(count)||count<1||count>total)throw new Error('Invalid vocabulary test question count');
    const selected=[...grouped.values()].map(senses=>({...senses[0],senses,
      acceptedMeanings:[...new Set(senses.map(card=>card.ko))]}));
    // Partial Fisher-Yates selects unique word groups and freezes their order.
    for(let i=0;i<count;i++){const j=i+Math.min(selected.length-i-1,Math.floor(Math.max(0,random())*(selected.length-i)));[selected[i],selected[j]]=[selected[j],selected[i]];}
    return {version:VERSION,id:String(now)+'-'+Math.random().toString(36).slice(2),scope,createdAt:now,cards:selected.slice(0,count)};
  }
  function validateManifest(raw){
    if(!object(raw)||raw.version!==VERSION||!nonblank(raw.id)||!nonblank(raw.scope)||!integer(raw.createdAt)||!Array.isArray(raw.cards)||!raw.cards.length)fail();
    const seen=new Set(),wordGroups=new Set();
    for(const card of raw.cards){
      if(!object(card)||!nonblank(card.key)||!nonblank(card.group)||wordGroups.has(card.group)||!nonblank(card.word)||!nonblank(card.ko)||!integer(card.addedAt)||!text(card.example)
        ||!Array.isArray(card.forms)||card.forms.length>32||card.forms.some(v=>!nonblank(v))||card.id!==identity(card.key,card.word,card.ko,card.addedAt)||seen.has(card.id))fail();
      if(!Array.isArray(card.senses)||!card.senses.length||!Array.isArray(card.acceptedMeanings)||!card.acceptedMeanings.length
        ||card.acceptedMeanings.some(value=>!nonblank(value))||JSON.stringify(card.acceptedMeanings)!==JSON.stringify([...new Set(card.senses.map(sense=>sense.ko))])
        ||card.senses.some(sense=>!object(sense)||sense.group!==card.group||!nonblank(sense.word)||!nonblank(sense.ko)||!text(sense.example)||sense.id!==identity(sense.key,sense.word,sense.ko,sense.addedAt)))fail();
      seen.add(card.id);wordGroups.add(card.group);
    }
    return raw;
  }
  function validateMeta(raw,total){
    if(!object(raw)||raw.version!==VERSION||!nonblank(raw.id)||!integer(raw.revision)||!integer(raw.index)||raw.index>total
      ||!['answering','results'].includes(raw.phase)||(raw.phase==='results')!==(raw.index===total))fail();
    return raw;
  }
  function validateAnswer(raw,total){
    if(!object(raw)||!integer(raw.index)||raw.index>=total||!text(raw.text)||raw.text.length>MAX_ANSWER||typeof raw.submitted!=='boolean'
      ||![null,'remembered','revisit','unsure'].includes(raw.verdict)||!integer(raw.at))fail();
    return raw;
  }
  function restore(manifest,meta,answers,batches=[]){
    if(manifest===undefined&&meta===undefined&&!answers.length&&!batches.length)return null;
    validateManifest(manifest);validateMeta(meta,manifest.cards.length);
    if(manifest.id!==meta.id||!Array.isArray(answers))fail();
    const seen=new Set();
    for(const answer of answers){validateAnswer(answer,manifest.cards.length);if(seen.has(answer.index)||answer.index>meta.index||answer.submitted!==(answer.index<meta.index)||meta.phase!=='results'&&answer.verdict!==null)fail();seen.add(answer.index);}
    for(let i=0;i<meta.index;i++)if(!seen.has(i))fail();
    const batchStarts=new Set();
    for(const batch of batches){
      if(!object(batch)||batch.sessionId!==manifest.id||!integer(batch.start)||batch.start%10!==0||batch.end!==Math.min(batch.start+10,manifest.cards.length)||batch.end>meta.index
        ||!['waiting','grading','complete','error'].includes(batch.status)||batch.token!==manifest.id+':batch-'+batch.start||batchStarts.has(batch.start)
        ||(batch.status==='complete'?!Array.isArray(batch.results)||batch.results.length!==batch.end-batch.start:batch.results!==null))fail();
      if(batch.results&&batch.results.some((result,i)=>!object(result)||result.id!==manifest.cards[batch.start+i].id||!['correct','incorrect','uncertain'].includes(result.status)||!text(result.reason)))fail();
      batchStarts.add(batch.start);
    }
    for(let start=0;start<meta.index;start+=10)if(Math.min(start+10,manifest.cards.length)<=meta.index&&!batchStarts.has(start))fail();
    return {manifest,meta,answers:new Map(answers.map(answer=>[answer.index,answer])),batches:new Map(batches.map(batch=>[batch.start,batch]))};
  }
  return {ENABLED,VERSION,MAX_ANSWER,cards,groups,prompt,start,validateManifest,validateMeta,validateAnswer,restore};
})();
