'use strict';
let resolver=null;
const el=id=>document.getElementById(id);
el('load').onclick=async()=>{
  const include=el('experimental').checked;el('load').disabled=true;el('status').textContent='사전을 메모리에 준비하고 있습니다.';
  try{
    resolver=await BreezeLocalLexiconPacks.load('../../assets/dictionaries/en-ko-expansion/manifest.json',{allowExperimentalFallback:include});
    el('status').textContent=resolver.stats().headwords.toLocaleString()+'개 준비 완료';
    el('stats').textContent=JSON.stringify(resolver.stats(),null,2);
  }catch(e){resolver=null;el('status').textContent='준비 실패: '+e.message;}
  finally{el('load').disabled=false;}
};
function render(){
  const sentence=el('input').value,tokens=BreezeLocalLexicon.tokenize(sentence);el('text').replaceChildren();let cursor=0;
  tokens.forEach((token,index)=>{
    el('text').append(document.createTextNode(sentence.slice(cursor,token.start)));
    const button=document.createElement('button');button.className='word';button.textContent=token.text;button.type='button';
    button.onclick=()=>{
      if(!resolver){el('result').textContent='먼저 사전을 준비하세요.';return;}
      const answer=resolver.lookup({sentence,clicked:token.text,clickedIndex:index});
      el('result').textContent=answer?answer.ko:'로컬 miss — 실제 앱에서는 기존 AI 조회로 이동';
      el('result').dataset.pack=answer?.pack || '';el('result').dataset.pos=answer?.pos || 'unknown';
      el('source').replaceChildren();
      if(answer){
        const link=document.createElement('a');link.href=answer.sourceUrl;link.rel='noopener noreferrer';link.target='_blank';
        link.textContent=answer.pack+' · '+(answer.pos || '품사 미지정')+' · '+answer.license;el('source').append(link);
      }
      el('stats').textContent=JSON.stringify(resolver.stats(),null,2);
    };
    el('text').append(button);cursor=token.end;
  });el('text').append(document.createTextNode(sentence.slice(cursor)));
}
el('render').onclick=render;render();
