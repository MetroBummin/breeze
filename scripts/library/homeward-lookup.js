/* Curated local answers for the exact bundled Homeward Bound Text book.
   The source paragraph comparison is intentional: a different edition, a
   changed paragraph, or a user-imported copy must use the ordinary lookup. */
function homewardLookupChapter(pi){
  const book=typeof curBook==='undefined'?null:curBook;
  if(!book||book.longReadId!=='backroom-homeward-bound'||book.kind!=='txt')return null;
  const data=globalThis.HOMEWARD_LOOKUP_DATA;
  if(!data||!Array.isArray(book.paras))return null;
  const chapter=data.chapters.find(item=>pi>=item.start&&pi<item.end);
  if(!chapter||book.paras.length!==data.paragraphCount)return null;
  for(let index=chapter.start;index<chapter.end;index++){
    if(book.paras[index]!==chapter.paragraphs[index-chapter.start])return null;
  }
  return chapter;
}
function homewardSentenceParts(pi,text){
  const chapter=homewardLookupChapter(pi);
  if(!chapter||chapter.paragraphs[pi-chapter.start]!==text)return null;
  return (chapter.sentences[pi-chapter.start]||[]).map(part=>({
    start:part[0],end:part[1],text:text.slice(part[0],part[1]),
  }));
}
function homewardSentenceAnswer(text,pi){
  const clean=String(text||'').replace(/\s+/g,' ').trim();
  const data=globalThis.HOMEWARD_LOOKUP_DATA;
  if(!data)return null;
  for(const chapter of data.chapters){
    if(Number.isInteger(pi)&&(pi<chapter.start||pi>=chapter.end))continue;
    if(!homewardLookupChapter(chapter.start))continue;
    for(let offset=0;offset<chapter.sentences.length;offset++){
      if(Number.isInteger(pi)&&chapter.start+offset!==pi)continue;
      const para=chapter.paragraphs[offset];
      const parts=chapter.sentences[offset]||[];
      for(const part of parts){
        if(para.slice(part[0],part[1]).replace(/\s+/g,' ').trim()===clean)
          return part[2]||null;
      }
    }
  }
  return null;
}
function homewardWordAnswer(input,node){
  if(!node||!node.closest)return null;
  const block=node.closest('[data-pi]');
  if(!block)return null;
  const pi=Number(block.dataset.pi),chapter=homewardLookupChapter(pi);
  if(!chapter)return null;
  const sentence=String(input&&input.sentence||'').replace(/\s+/g,' ').trim();
  const index=Number(input&&input.clickedIndex);
  if(!Number.isInteger(index)||index<0)return null;
  return (chapter.words||[]).find(item=>item.pi===pi&&item.sentence===sentence
    &&item.members.includes(index))||null;
}
function homewardAnswerAsLook(item){
  if(!item)return null;
  return {ko:item.ko,pos:item.pos||'',lemma:item.canonical||item.lemma||'',
    kind:item.members.length>1?'expression':'word',
    canonical:item.members.length>1?item.canonical||'':'',
    members:item.members.length>1?item.members:undefined,alts:[]};
}
function homewardPresentationWait(started,alive){
  const remaining=Math.max(0,950-(Date.now()-started));
  return remaining&&alive()?new Promise(resolve=>setTimeout(resolve,remaining)):Promise.resolve();
}
