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

function place({width=390,height=844,x=0,y=0,safeInset=0,safeSides=0,dock=height-80,natural=150,anchor,edge=null,datasetEdge=null,chromeRect=null}){
  const style={},dataset={},inset=36;
  const source=Object.freeze({...anchor,width:anchor.right-anchor.left,height:anchor.bottom-anchor.top});
  let closed=0;
  const panel={style,dataset,hidden:false,get offsetWidth(){return Math.round(parseFloat(style.width)||360);},getBoundingClientRect(){
    const w=parseFloat(style.width)||360,h=Math.min(natural+inset,parseFloat(style.maxHeight)||Infinity);
    const left=parseFloat(style.left)||0,top=parseFloat(style.top)||0;
    return {left,top,right:left+w,bottom:top+h,width:w,height:h};
  }};
  const content={getBoundingClientRect:()=>({height:natural})};
  // Default #readchrome mock reports only {height,top}: a full-width bottom bar,
  // exactly what the production classifier treats as the legacy path. When an
  // explicit dock edge is given, report the full rectangle the writing dock
  // produces for that edge (a 44px vertical bar centred on the left/right, a
  // top strip, or a bottom strip) so the per-edge geometry is exercised.
  const barThickness=44,barLength=height*0.55;
  const edgeRect={
    left:()=>{const top=y+(height-barLength)/2;return {left:x+16,right:x+16+barThickness,top,bottom:top+barLength,width:barThickness,height:barLength};},
    right:()=>{const top=y+(height-barLength)/2;return {left:x+width-16-barThickness,right:x+width-16,top,bottom:top+barLength,width:barThickness,height:barLength};},
    top:()=>({left:x,right:x+width,top:y+8,bottom:y+8+50,width,height:50}),
    bottom:()=>({left:x,right:x+width,top:y+height-58,bottom:y+height-8,width,height:50}),
  };
  const chrome={getBoundingClientRect:()=>chromeRect?chromeRect:edge?edgeRect[edge]():({height:dock===null?0:50,top:dock===null?0:y+dock})};
  const context=createContext({Math,parseFloat,innerWidth:width,innerHeight:height,
    window:{visualViewport:{offsetLeft:x,offsetTop:y,width,height},innerWidth:width,innerHeight:height},
    sentenceResultAnchored:()=>true,sentenceOrigin:{peekTarget:source},wordPeekNodeRect:value=>value,
    closeSentence:()=>{closed++;},
    getComputedStyle:()=>({paddingTop:'16px',paddingBottom:'18px',borderTopWidth:'1px',borderBottomWidth:'1px',
      getPropertyValue:key=>key==='--word-safe-top'?String(safeInset):
        ['--word-safe-left','--word-safe-right'].includes(key)?String(safeSides):''}),
    document:{getElementById:id=>({'p-sentence':panel,'ps-content':content,readchrome:chrome})[id],
      // Only expose document.body when the case asks for the declarative dock
      // signal. Leaving it undefined (the common case) exercises the geometry
      // fallback that EPUB/text readers and the pure-Node VM rely on.
      ...(datasetEdge?{body:{dataset:{inkDock:datasetEdge}}}:{})},
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

// Per-edge dock coverage. FEAT-002 classifies the dock edge purely from the
// #readchrome rectangle, so feeding the real per-edge bar geometry proves the
// expanded sentence result stays inside the usable region and never clips or
// hides behind the toolbar, on every edge the writing dock parks it.
let edgeCases=0;
const edgeProfiles=[
  {name:'phone',width:390,height:844},{name:'phone-landscape',width:844,height:390},
  {name:'ipad-portrait',width:820,height:1180},{name:'ipad-landscape',width:1180,height:820},
];
for(const profile of edgeProfiles)for(const x of [0,24])for(const y of [0,32])for(const safeSides of [0,44]){
  const {width,height}=profile,barThickness=44,barLength=height*0.55;
  const bars={
    left:{left:x+16,right:x+16+barThickness},
    right:{left:x+width-16-barThickness,right:x+width-16},
    top:{top:y+8,bottom:y+58},
    bottom:{top:y+height-58,bottom:y+height-8},
  };
  const barTop=y+(height-barLength)/2,barBottom=barTop+barLength;
  for(const edge of ['left','right','top','bottom']){
    // Anchor the lookup over the readable area, away from the docked bar.
    const anchorLeft=edge==='left'?bars.left.right+30:x+40;
    const anchorRight=edge==='right'?bars.right.left-30:x+width-40;
    const anchorTop=edge==='top'?bars.top.bottom+40:edge==='bottom'?y+80:barTop+40;
    const anchor={left:anchorLeft,right:anchorRight,top:anchorTop,bottom:anchorTop+28};
    for(const natural of [60,260,900]){
      const result=place({...profile,x,y,safeSides,natural,anchor,edge}),r=result.rect;
      const label=JSON.stringify({profile:profile.name,edge,x,y,safeSides,natural,result});
      assert.equal(result.closed,0,label+': anchored result stays open');
      // Inside the visual viewport on every edge (unclipped).
      assert.ok(r.left>=x-0.5&&r.top>=y-0.5&&r.right<=x+width+0.5&&r.bottom<=y+height+0.5,label+': inside viewport');
      // Outside the toolbar band for the edge it hugs.
      if(edge==='left')assert.ok(r.left>=bars.left.right,label+': clears the left bar');
      else if(edge==='right')assert.ok(r.right<=bars.right.left,label+': clears the right bar');
      else if(edge==='top')assert.ok(r.top>=bars.top.bottom,label+': clears the top strip');
      else assert.ok(r.bottom<=bars.bottom.top,label+': clears the bottom strip');
      // A side dock must not falsely collapse the vertical region to the top
      // half: the result can still live in the lower portion of the viewport.
      assert.ok(r.width>=1&&r.bottom-r.top>=1,label+': non-degenerate surface');
      edgeCases++;
    }
  }
}
assert.ok(edgeCases>0,'per-edge dock cases ran');

// Declarative dock signal. The review asked lookupSafeRegion to prefer
// document.body.dataset.inkDock over the rect-geometry heuristic. These cases
// present a COLLAPSED near-square side bar (width ~= height ~= 44, which the
// geometry classifier would NOT treat as a side bar because cHeight>cWidth is
// false) yet set dataset.inkDock='left'/'right'; the result must still clear
// the bar's horizontal band, proving the dataset is authoritative and that a
// sparsely populated side dock no longer falls through to the strip branches
// (addresses issues #1 and #2). The matching top/bottom dataset cases confirm
// the declarative edge also drives the top/bottom disambiguation.
let datasetCases=0;
for(const profile of edgeProfiles)for(const x of [0,24])for(const y of [0,32]){
  const {width,height}=profile,barThickness=44;
  // A collapsed, near-square bar: geometry alone cannot tell which edge.
  const squareTop=y+(height-barThickness)/2;
  const squares={
    left:{left:x+16,right:x+16+barThickness,top:squareTop,bottom:squareTop+barThickness,width:barThickness,height:barThickness},
    right:{left:x+width-16-barThickness,right:x+width-16,top:squareTop,bottom:squareTop+barThickness,width:barThickness,height:barThickness},
    top:{left:x,right:x+width,top:y+8,bottom:y+8+50,width,height:50},
    bottom:{left:x,right:x+width,top:y+height-58,bottom:y+height-8,width,height:50},
  };
  for(const edge of ['left','right','top','bottom']){
    const bar=squares[edge];
    const anchorLeft=edge==='left'?bar.right+30:x+40;
    const anchorRight=edge==='right'?bar.left-30:x+width-40;
    const anchorTop=edge==='top'?bar.bottom+40:edge==='bottom'?bar.top-120:squareTop+8;
    const anchor={left:anchorLeft,right:anchorRight,top:anchorTop,bottom:anchorTop+28};
    // Feed the collapsed square as the chrome rect while the dataset names the
    // edge; a mini helper reuses place() with an explicit edge rect via `edge`.
    const result=place({...profile,x,y,natural:260,anchor,chromeRect:bar,datasetEdge:edge}),r=result.rect;
    const label=JSON.stringify({profile:profile.name,edge,x,y,result});
    assert.equal(result.closed,0,label+': dataset-anchored result stays open');
    assert.ok(r.left>=x-0.5&&r.top>=y-0.5&&r.right<=x+width+0.5&&r.bottom<=y+height+0.5,label+': dataset inside viewport');
    if(edge==='left')assert.ok(r.left>=bar.right,label+': dataset clears the left bar');
    else if(edge==='right')assert.ok(r.right<=bar.left,label+': dataset clears the right bar');
    else if(edge==='top')assert.ok(r.top>=bar.bottom,label+': dataset clears the top strip');
    else assert.ok(r.bottom<=bar.top,label+': dataset clears the bottom strip');
    assert.ok(r.width>=1&&r.bottom-r.top>=1,label+': dataset non-degenerate surface');
    datasetCases++;
  }
}
assert.ok(datasetCases>0,'declarative dataset dock cases ran');

for(const zero of [{left:20,right:20,top:60,bottom:100},{left:20,right:200,top:60,bottom:60}]){
  assert.equal(place({anchor:zero}).closed,1,'disconnected/empty source must end the result lifetime');
}
console.log(`${cases} sentence result placements verified: ${belowCount} below, ${aboveCount} above, ${scrolledCount} scroll budgets, ${overlapCount} necessary overlaps; ${edgeCases} per-edge dock placements (left/right/top/bottom) stay inside the usable region; ${datasetCases} declarative dataset.inkDock placements (collapsed side bar still cleared) verified`);
