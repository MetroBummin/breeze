/* Display saved source text unchanged. Position metadata selects an occurrence;
   a unique whole-token match is the only fallback when that metadata is absent. */
function storedStudyExampleRanges(card){
  const sentence=typeof card.example==='string'?card.example:'';
  if(!sentence)return [];
  const record=words[card.key]||card,tokens=lookupSentenceTokens(sentence),matches=tokens.map(t=>Object.assign([t.text],{index:t.start}));
  const savedPhrase=Array.isArray(record.phraseParts)?record:words[record.root],parts=lookupSentenceTokens(card.word).map(token=>lemmaCands(token.text)[0]||token.text.toLowerCase());
  const phrase=savedPhrase|| (parts.length>1?{phraseParts:parts}:null);
  const candidates=[];
  if(phrase&&Array.isArray(phrase.phraseParts)&&phrase.phraseParts.length>1){
    const gaps=Array.isArray(phrase.phraseGaps)&&phrase.phraseGaps.length===phrase.phraseParts.length-1?phrase.phraseGaps:new Array(phrase.phraseParts.length-1).fill(0);
    for(let i=0;i<matches.length;i++){
      if(!lemmaCands(matches[i][0]).includes(phrase.phraseParts[0]))continue;
      const match=savedPhraseMatch(matches,i,{parts:phrase.phraseParts,gaps});if(match)candidates.push(match.selected);
    }
  }else{
    const same=record.example===sentence,forms=[card.word,...(same?[record.clicked,...(Array.isArray(record.forms)?record.forms:[])]:[])].filter(v=>typeof v==='string'&&v.trim()).map(v=>v.toLowerCase().trim());
    for(let i=0;i<tokens.length;i++)if(forms.includes(tokens[i].text.toLowerCase())||lemmaCands(tokens[i].text).some(v=>forms.includes(v)))candidates.push([i]);
  }
  const prefix='v2:'+sentenceHash(sentence)+':';
  const stored=(Array.isArray(record.contextHashes)?record.contextHashes:[]).filter(v=>typeof v==='string'&&v.startsWith(prefix)).map(v=>Number(v.slice(prefix.length)));
  const hints=[...(record.example===sentence&&Number.isInteger(record.clickedIndex)?[record.clickedIndex]:[]),...stored].filter(n=>Number.isInteger(n)&&n>=0&&n<tokens.length);
  const selected=hints.map(n=>candidates.find(c=>c.includes(n))).find(Boolean)||(candidates.length===1?candidates[0]:null);
  if(!selected)return [];
  return selected.map(i=>({start:tokens[i].start,end:tokens[i].end}));
}
function renderStoredStudyExample(target,card){
  target.replaceChildren();const sentence=typeof card.example==='string'?card.example:'';
  const ranges=storedStudyExampleRanges(card);let end=0;
  for(const range of ranges){target.append(document.createTextNode(sentence.slice(end,range.start)));const strong=document.createElement('strong');strong.textContent=sentence.slice(range.start,range.end);target.append(strong);end=range.end;}
  target.append(document.createTextNode(sentence.slice(end)));return !!sentence;
}
