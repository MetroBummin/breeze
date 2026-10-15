/* Saved-set recall tests. Exact matches are local. Meaning equivalence is
   decided later by the caller. This store never writes vocabulary or study sets. */
const BreezeStudySetTest=(()=>{
  const VERSION=1,MAX_ANSWER=1000,MAX_RECORDS=40,KEY='breeze.study-set-tests.v1';
  const compact=value=>String(value??'').normalize('NFC').trim().toLocaleLowerCase('ko-KR').replace(/[.,!?;:·…~"'“”‘’()[\]{}<>]/g,'').replace(/\s+/g,'');
  function matches(answer,meanings){
    const left=compact(answer);
    if(!left||!Array.isArray(meanings))return false;
    return meanings.some(meaning=>compact(meaning)===left);
  }
  function questions(cards,count,random=Math.random){
    const pool=(Array.isArray(cards)?cards:[]).map(card=>{
      const meanings=[...(Array.isArray(card?.acceptedMeanings)&&card.acceptedMeanings.length?card.acceptedMeanings:[card?.ko])].map(value=>String(value??'').trim()).filter(Boolean);
      return {id:String(card?.id??''),word:String(card?.word??'').trim(),meanings:[...new Set(meanings)]};
    }).filter(card=>card.id&&card.word&&card.meanings.length);
    const size=count;
    if(!Number.isInteger(size)||size<1||size>pool.length)throw new Error('Invalid study set test count');
    for(let i=0;i<size;i++){
      const span=pool.length-i;
      const j=i+Math.min(span-1,Math.floor(Math.max(0,Math.min(0.999999,Number(random())||0))*span));
      [pool[i],pool[j]]=[pool[j],pool[i]];
    }
    return pool.slice(0,size);
  }
  function score(correct,total){
    if(!Number.isInteger(correct)||!Number.isInteger(total)||total<1||correct<0||correct>total)return null;
    return Math.round(correct/total*100);
  }
  function read(raw){
    if(raw==null||raw==='')return {ok:true,data:{version:VERSION,sets:{}}};
    let data;
    try{data=JSON.parse(raw);}catch{return {ok:false};}
    if(!data||data.version!==VERSION||!data.sets||typeof data.sets!=='object'||Array.isArray(data.sets))return {ok:false};
    return {ok:true,data};
  }
  function records(raw,setId){
    const parsed=read(raw);
    if(!parsed.ok||typeof setId!=='string'||!setId)return [];
    const list=parsed.data.sets[setId];
    if(!Array.isArray(list))return [];
    return list.filter(row=>row&&typeof row.id==='string'&&Number.isFinite(row.at)&&Number.isInteger(row.count)&&row.count>0&&Number.isInteger(row.correct)&&row.correct>=0&&row.correct<=row.count&&row.score===score(row.correct,row.count));
  }
  function save(raw,setId,record){
    const parsed=read(raw);
    if(!parsed.ok||typeof setId!=='string'||!setId)return {ok:false,raw};
    if(!record||typeof record.id!=='string'||!Number.isFinite(record.at)||score(record.correct,record.count)!==record.score)return {ok:false,raw};
    const next={version:VERSION,sets:{...parsed.data.sets}};
    const list=records(raw,setId).filter(row=>row.id!==record.id);
    list.unshift({id:record.id,at:record.at,count:record.count,correct:record.correct,score:record.score});
    next.sets[setId]=list.slice(0,MAX_RECORDS);
    return {ok:true,raw:JSON.stringify(next)};
  }
  return {VERSION,MAX_ANSWER,MAX_RECORDS,KEY,compact,matches,questions,score,read,records,save};
})();
