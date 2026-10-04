import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const state=readFileSync(new URL('../scripts/core/state.js',import.meta.url),'utf8');
const source=state.slice(state.indexOf('function captureAnchor(){'),state.indexOf('function saveReadingState(){'));
function surface(quantize,coordinate,top){
 const frames=[],writes=[];
 const el={dataset:{pi:'245'},closest:()=>el,getBoundingClientRect:()=>({top:coordinate-top,bottom:coordinate-top+500})};
 const context={curBook:{},document:{elementFromPoint:()=>el,querySelector:()=>el},window:{innerWidth:390},
  topInset:()=>32,readerScrollTop:()=>top,readerScrollTo:y=>{writes.push(y);top=Math.max(0,quantize(y));},
  updatePfill(){},requestAnimationFrame:fn=>frames.push(fn)};
 new Script(source).runInNewContext(context);
 return {context,writes,setCoordinate:value=>coordinate=value,flush(){while(frames.length)frames.shift()();}};
}
for(const [name,quantize] of [['truncate',Math.trunc],['floor',Math.floor],['nearest',Math.round],['fractional',value=>value]]){
 test(`Text anchor stays idempotent through repeated reopen and font layout with ${name} scrolling`,()=>{
  for(const fraction of [0,.25,.5,.75,.984375])for(const dy of [-152,2,53,200]){
   const initial=10000+fraction,s=surface(quantize,initial,Math.round(initial-dy));
   const saved=s.context.captureAnchor();assert.equal(saved.dy,dy);
   for(let cycle=0;cycle<20;cycle++){
    const current=s.context.captureAnchor();
    assert.equal(s.context.restoreAnchor(current),true);
    assert.equal(s.context.captureAnchor().dy,dy,`${name}: reopen cycle ${cycle}, fraction ${fraction}, writes ${s.writes}`);
    s.context.keepPlace(()=>s.setCoordinate((cycle%2?10000:16000)+fraction));s.flush();
    assert.equal(s.context.captureAnchor().dy,dy,`${name}: font cycle ${cycle}, fraction ${fraction}, writes ${s.writes}`);
   }
  }
 });
}
