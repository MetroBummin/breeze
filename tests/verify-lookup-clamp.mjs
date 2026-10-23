/* The meaning pill stays inside the layout viewport, including when it is
   wider than the safe area or grows after the first measurement. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../scripts/dictionary/dictionary.js',import.meta.url),'utf8');

function extract(name){
  const start=source.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,name);
  let depth=0;
  for(let i=source.indexOf('{',start);i<source.length;i++){
    if(source[i]==='{')depth++;
    else if(source[i]==='}'){depth--;if(!depth)return source.slice(start,i+1);}
  }
  throw new Error('unclosed '+name);
}

function place(options){
  const widths=options.widths||[options.width];
  let measure=0;
  const pill={
    hidden:false,
    dataset:{},
    style:{maxWidth:'',left:'',top:'',transformOrigin:''},
    getBoundingClientRect(){
      const requested=widths[Math.min(measure,widths.length-1)];
      measure++;
      const cap=parseFloat(this.style.maxWidth);
      const width=Number.isFinite(cap)?Math.min(requested,cap):requested;
      const left=parseFloat(this.style.left);
      const top=parseFloat(this.style.top);
      const x=Number.isFinite(left)?left:0;
      const y=Number.isFinite(top)?top:0;
      const height=options.height||44;
      return {width,height,left:x,right:x+width,top:y,bottom:y+height};
    },
  };
  const vw=options.vw, vh=options.vh;
  const context={
    Math,Number,parseFloat,
    document:{
      documentElement:{
        clientWidth:options.clientWidth??vw,
        clientHeight:options.clientHeight??vh,
      },
      getElementById(){
        return {getBoundingClientRect:()=>options.chrome||{height:44,top:vh-60}};
      },
    },
    window:{
      innerWidth:options.innerWidth??vw,
      innerHeight:options.innerHeight??vh,
      visualViewport:options.visualViewport===null?undefined:(options.visualViewport||{
        offsetLeft:0,offsetTop:0,width:vw,height:vh,
      }),
    },
    getComputedStyle:()=>({getPropertyValue:()=>''}),
  };
  vm.runInNewContext(extract('placeLookupPeek'),context);
  context.placeLookupPeek(pill,options.anchor);
  const box=pill.getBoundingClientRect();
  return {pill,box};
}

function inside(box,vw,edge=16){
  assert.ok(box.left>=edge-0.5,`left ${box.left} inside ${edge}`);
  assert.ok(box.right<=vw-edge+0.5,`right ${box.right} inside ${vw-edge}`);
}

test('a meaning near the right edge stays inside the 16px margin',()=>{
  const {box}=place({
    vw:390,vh:844,width:220,
    anchor:{left:340,right:372,top:300,bottom:324},
  });
  inside(box,390);
  assert.equal(box.right<=374,true);
});

test('a pill wider than the viewport shrinks before it is placed',()=>{
  const {pill,box}=place({
    vw:390,vh:844,width:500,
    anchor:{left:300,right:360,top:300,bottom:324},
  });
  inside(box,390);
  assert.equal(pill.style.maxWidth,'358px');
  assert.equal(pill.style.left,'16px');
});

test('a visual viewport wider than the layout viewport uses the layout width',()=>{
  const {box}=place({
    vw:500,vh:844,width:220,
    clientWidth:390,innerWidth:390,
    visualViewport:{offsetLeft:0,offsetTop:0,width:500,height:844},
    anchor:{left:460,right:490,top:300,bottom:324},
  });
  inside(box,390);
});

test('a pill that already fits keeps its centered place',()=>{
  const {pill,box}=place({
    vw:1000,vh:800,width:180,
    visualViewport:null,
    clientWidth:0,
    chrome:{height:0,top:800},
    anchor:{left:400,right:450,top:200,bottom:220},
  });
  assert.equal(pill.style.left,'335px');
  assert.equal(pill.style.top,'228px');
  assert.equal(pill.style.maxWidth,'');
  inside(box,1000);
});

test('a badge that widens the pill after placement is pulled back inside',()=>{
  const {pill,box}=place({
    vw:390,vh:844,widths:[180,400,400],
    anchor:{left:300,right:360,top:300,bottom:324},
  });
  inside(box,390);
  assert.equal(pill.style.maxWidth,'358px');
  assert.equal(pill.style.left,'16px');
});
