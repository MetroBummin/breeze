/* Sentence matching shared by the reflowed and original readers.
   We compare word streams instead of raw strings so PDF line breaks,
   smart quotes and repeated whitespace do not break a mode transition. */

function bridgeNormalizeToken(value){
  return String(value||'')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g,"'")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g,'');
}

function bridgeTokens(value){
  const matches=String(value||'').match(/[A-Za-z0-9](?:[A-Za-z0-9'\u2019\-]*[A-Za-z0-9])?/g)||[];
  return matches.map(bridgeNormalizeToken).filter(Boolean);
}

function bridgeSentences(value){
  const text=String(value||'');
  const parts=[];
  const pattern=/[^.!?\u2026]+(?:[.!?\u2026]+[\u201d\u2019"']?|$)/g;
  let match;
  while((match=pattern.exec(text))){
    const leading=(match[0].match(/^\s*/)||[''])[0].length;
    const trailing=(match[0].match(/\s*$/)||[''])[0].length;
    const start=match.index+leading;
    const end=match.index+match[0].length-trailing;
    const sentence=text.slice(start,end);
    if(bridgeTokens(sentence).length) parts.push({text:sentence,start,end});
  }
  if(!parts.length && bridgeTokens(text).length) parts.push({text:text.trim(),start:0,end:text.length});
  return parts;
}

function bridgeSentenceAt(value,offset){
  const sentences=bridgeSentences(value);
  if(!sentences.length) return '';
  const point=Math.max(0,Number(offset)||0);
  const found=sentences.find(sentence=>point>=sentence.start&&point<=sentence.end)
    || sentences.find(sentence=>sentence.start>=point)
    || sentences[sentences.length-1];
  return found.text.replace(/\s+/g,' ').trim().slice(0,900);
}

/* Returns the matching token range. Long sentences only need a distinctive
   prefix; after finding it we extend the match as far as the source permits. */
function bridgeFindSequence(haystack,candidate){
  const source=(haystack||[]).map(item=>bridgeNormalizeToken(typeof item==='string' ? item : item.word));
  const wanted=Array.isArray(candidate) ? candidate.map(bridgeNormalizeToken) : bridgeTokens(candidate);
  if(!source.length || !wanted.length) return null;
  const required=Math.min(wanted.length,Math.max(4,Math.min(14,wanted.length)));
  for(let start=0; start<=source.length-required; start++){
    let matched=0;
    while(matched<wanted.length && start+matched<source.length
        && source[start+matched]===wanted[matched]) matched++;
    if(matched>=required) return {start,length:matched,confidence:matched/wanted.length};
  }
  return null;
}
