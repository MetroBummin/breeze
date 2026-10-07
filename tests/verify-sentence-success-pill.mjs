/* Deterministic geometry contracts against the production placement functions.
 * Complements browser/video proof; this does not claim rendered-device evidence.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,createContext} from 'node:vm';

const sentence=readFileSync(new URL('../scripts/dictionary/sentence.js',import.meta.url),'utf8');
const dictionary=readFileSync(new URL('../scripts/dictionary/dictionary.js',import.meta.url),'utf8');
const between=(source,start,end)=>{
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,'production function boundary missing: '+start);
  return source.slice(a,b);
};
const script=new Script(
  between(dictionary,'function placeLookupPeek(','function stopWordMorph(')+
  between(sentence,'function placeSentenceResult(','function revealAnchoredSentenceResult('));

function place({width=390,height=844,x=0,y=0,safeInset=0,safeSides=0,dock=height-80,natural=150,anchor}){
  const style={},dataset={},inset=36;
  const source=Object.freeze({...anchor,width:anchor.right-anchor.left,height:anchor.bottom-anchor.top});
  let closed=0;
  const panel={style,dataset,hidden:false,get offsetWidth(){return Math.round(parseFloat(style.width)||360);},getBoundingClientRect(){
    const w=parseFloat(style.width)||360,h=Math.min(natural+inset,parseFloat(style.maxHeight)||Infinity);
    const left=parseFloat(style.left)||0,top=parseFloat(style.top)||0;
    return {left,top,right:left+w,bottom:top+h,width:w,height:h};
  }};
  const content={getBoundingClientRect:()=>({height:natural})};
  const chrome={getBoundingClientRect:()=>({height:dock===null?0:50,top:dock===null?0:y+dock})};
  const context=createContext({Math,parseFloat,innerWidth:width,innerHeight:height,
    window:{visualViewport:{offsetLeft:x,offsetTop:y,width,height},innerWidth:width,innerHeight:height},
    sentenceResultAnchored:()=>true,sentenceOrigin:{peekTarget:source},wordPeekNodeRect:value=>value,
    closeSentence:()=>{closed++;},
    getComputedStyle:()=>({paddingTop:'16px',paddingBottom:'18px',borderTopWidth:'1px',borderBottomWidth:'1px',
      getPropertyValue:key=>key==='--word-safe-top'?String(safeInset):
        ['--word-safe-left','--word-safe-right'].includes(key)?String(safeSides):''}),
    document:{getElementById:id=>({'p-sentence':panel,'ps-content':content,readchrome:chrome})[id]},
    readerScrollTo:()=>assert.fail('placement must never write Reader scroll'),
  });
  script.runInContext(context);context.placeSentenceResult();
  return {rect:panel.getBoundingClientRect(),direction:dataset.expandDirection,closed,style};
}

const profiles=[
  {name:'phone',width:390,height:844},{name:'narrow',width:320,height:568},
  {name:'phone-landscape',width:844,height:390},{name:'ipad-portrait',width:820,height:1180},
  {name:'ipad-landscape',width:1180,height:820},{name:'desktop',width:1440,height:900},
  {name:'keyboard',width:390,height:340},
];
let cases=0,aboveCount=0,belowCount=0,overlapCount=0,scrolledCount=0;
for(const profile of profiles)for(const x of [0,24])for(const y of [0,32])for(const safeInset of [0,44])for(const safeSides of [0,44]){
  const {width,height}=profile,top=y+16+safeInset,dock=height-76,bottom=y+dock-8;
  for(const natural of [46,100,200,490,2500])for(const sourceHeight of [22,70,180,height-72]){
    for(const fraction of [0,.15,.45,.75,.95]){
      const sourceTop=top+(bottom-top-sourceHeight)*fraction;
      const anchor={left:x+26,top:sourceTop,right:x+width-30,bottom:sourceTop+sourceHeight};
      const result=place({...profile,x,y,safeInset,safeSides,dock,natural,anchor}),r=result.rect;
      const label=JSON.stringify({profile:profile.name,x,y,safeInset,safeSides,natural,sourceHeight,fraction,result});
      assert.equal(result.closed,0,label);
      assert.ok(r.left>=x+15.5+safeSides&&r.right<=x+width-15.5-safeSides,label+': horizontal viewport/safe inset');
      assert.ok(r.top>=top-.5&&r.bottom<=bottom+.5,label+': vertical viewport/dock');
      assert.ok(r.width<=600&&r.width<=width-32,label+': responsive maximum width');
      if(width>=820)assert.ok(r.width>450,label+': tablet retains phone width');
      const desired=Math.min(520,bottom-top,natural+36);
      const below=bottom-anchor.bottom-8,above=anchor.top-top-8,useful=Math.min(desired,160);
      if(below>=desired){
        assert.equal(result.direction,'below',label+': full below priority');
        assert.ok(r.top>=anchor.bottom+7.5,label+': below whole source union');belowCount++;
      }else if(above>=desired){
        assert.equal(result.direction,'above',label+': full above fallback');
        assert.ok(r.bottom<=anchor.top-7.5,label+': above whole source union');aboveCount++;
      }else if(below>=useful){
        assert.equal(result.direction,'below',label+': useful below scroll budget');
        assert.ok(r.top>=anchor.bottom+7.5,label+': avoidable below overlap');scrolledCount++;
      }else if(above>=useful){
        assert.equal(result.direction,'above',label+': useful above scroll budget');
        assert.ok(r.bottom<=anchor.top-7.5,label+': avoidable above overlap');scrolledCount++;
      }else if(r.top<anchor.bottom&&r.bottom>anchor.top){overlapCount++;}
      assert.equal(anchor.top,sourceTop,label+': placement mutated source');cases++;
    }
  }
}
assert.ok(aboveCount>0&&belowCount>0&&scrolledCount>0&&overlapCount>0,'placement branches not covered');
for(const zero of [{left:20,right:20,top:60,bottom:100},{left:20,right:200,top:60,bottom:60}]){
  assert.equal(place({anchor:zero}).closed,1,'disconnected/empty source must end the result lifetime');
}
console.log(`${cases} sentence result placements verified: ${belowCount} below, ${aboveCount} above, ${scrolledCount} scroll budgets, ${overlapCount} necessary overlaps`);
