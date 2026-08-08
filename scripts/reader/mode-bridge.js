/* Sentence matching shared by the reflowed and original readers.
   We compare word streams instead of raw strings so PDF line breaks,
   smart quotes and repeated whitespace do not break a mode transition. */

/* \ubd99\uc784\uae00\uc790(\ufb01 \ufb02 \ufb00 \u2026)\ub294 \ud55c \uae00\uc790\ub85c \uc800\uc7a5\ub418\uc9c0\ub9cc \uc77d\uc744 \ub54c\ub294 \ub450 \uae00\uc790\uc785\ub2c8\ub2e4. \uc5ec\uae30\uc11c
   \ud480\uc5b4 \ub450\uc9c0 \uc54a\uc73c\uba74 "o\ufb03ce"\uac00 "o"\uc640 "ce"\ub85c \ucabc\uac1c\uc838 \ub450 \ud654\uba74\uc758 \ub0b1\ub9d0\uc774 \uc5b4\uae0b\ub0a9\ub2c8\ub2e4. */
function bridgeNormalizeToken(value){
  return normalizeLigatures(value)
    .toLowerCase()
    .replace(/[\u2018\u2019]/g,"'")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g,'');
}

function bridgeTokens(value){
  const matches=String(value||'')
    .match(/[A-Za-z0-9\ufb00-\ufb06](?:[A-Za-z0-9'\u2019\-\ufb00-\ufb06]*[A-Za-z0-9\ufb00-\ufb06])?/g)||[];
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

/* 문장 하나는 자리를 가리키기에 모자랍니다. "He nodded." 같은 문장은 책 어디에나
   있는데, 예전에는 **처음 나오는 자리**를 그냥 돌려주었습니다. 그래서 400쪽짜리
   책 한가운데서 모드를 바꾸면 1장으로 튀었습니다.

   이제는 맞는 자리를 모두 모아 놓고 고릅니다:
     ① 바로 뒤 문장까지 이어서 맞는 곳   — 가장 확실한 증거
     ② 더 길게 맞는 곳
     ③ 읽던 자리에 가까운 곳
   가까운 자리를 알 수 없고, 짧은 문장이 여러 곳에서 똑같이 맞으면 아무 데도
   가지 않습니다. 엉뚱한 곳으로 뛰느니 문단 위치로 돌아가는 편이 낫습니다. */
const BRIDGE_SHORT_TOKENS = 5;    // 이보다 짧으면 문장 혼자서는 증거가 못 됩니다
const BRIDGE_FOLLOW_GAP = 24;     // 다음 문장이 이 안에서 시작하면 같은 자리로 봅니다
const BRIDGE_FAR = 1500;          // 읽던 자리에서 이만큼 떨어졌으면 그건 다른 곳입니다
const BRIDGE_MAX_HITS = 400;

function bridgeRunLength(source,wanted,start){
  let matched=0;
  while(matched<wanted.length && start+matched<source.length
      && source[start+matched]===wanted[matched]) matched++;
  return matched;
}

function bridgeFindSequence(haystack,candidate,options){
  const settings=options||{};
  const source=(haystack||[]).map(item=>bridgeNormalizeToken(typeof item==='string' ? item : item.word));
  const wanted=Array.isArray(candidate) ? candidate.map(bridgeNormalizeToken) : bridgeTokens(candidate);
  if(!source.length || !wanted.length) return null;
  const required=Math.min(wanted.length,14);
  const follow=settings.follow ? bridgeTokens(settings.follow).slice(0,8) : [];
  const near=Number.isFinite(settings.near) ? settings.near : null;

  const hits=[];
  for(let start=0; start+required<=source.length; start++){
    const matched=bridgeRunLength(source,wanted,start);
    if(matched<required) continue;
    let confirmed=0;
    for(let gap=0; gap<=BRIDGE_FOLLOW_GAP && follow.length; gap++){
      const run=bridgeRunLength(source,follow,start+matched+gap);
      if(run>=Math.min(follow.length,3)){ confirmed=run; break; }
    }
    hits.push({start,length:matched,confirmed});
    if(hits.length>=BRIDGE_MAX_HITS) break;
  }
  if(!hits.length) return null;
  const rank=hit=>hit.length*2+hit.confirmed*3;
  const away=hit=>near==null ? hit.start : Math.abs(hit.start-near);
  hits.sort((a,b)=>rank(b)-rank(a) || away(a)-away(b));
  const best=hits[0];
  /* 읽던 자리를 아는데도 저 멀리에서 맞았다면, 같은 문장이 우연히 또 있는
     것입니다. 모드를 바꾼다고 책이 옮겨 다니지는 않습니다. */
  if(near!=null && !best.confirmed && Math.abs(best.start-near)>BRIDGE_FAR) return null;
  if(near==null && !best.confirmed && wanted.length<BRIDGE_SHORT_TOKENS
      && hits.filter(hit=>rank(hit)===rank(best)).length>1) return null;
  return {start:best.start,length:best.length,
          confidence:best.length/wanted.length,confirmed:!!best.confirmed};
}
