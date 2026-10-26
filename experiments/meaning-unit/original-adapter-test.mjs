import assert from 'node:assert/strict';
import fs from 'node:fs';
import {originalChoiceBlocks,originalTapInput} from './original-adapter.mjs';
import {prepare,validate,highlightGlyphs} from './core.mjs';
const line=(text,x,y)=>({text,angle:0,fontHeight:10,chars:Array.from({length:text.length},(_,i)=>({left:x+i*5,right:x+(i+1)*5,top:y,bottom:y+10}))});
const lines=[line('Question header',20,10),line('A) keep oxygen',20,40),line('B) increase oxygen',20,70),line('without oxygen pressure',30,85),line('C) preserve pressure',20,115),line('Other question',200,10),line('A) reduce oxygen',200,40),line('B) reduce oxygen',200,70),line('C) retain pressure',200,115)];
let checks=0;const check=(name,fn)=>{fn();checks++;};
const extract=source=>originalChoiceBlocks({lines:source,page:1,width:400,height:300}),e=extract(lines);
check('derived columns/choices',()=>{assert.equal(e.blocks.length,8);assert.equal(e.blocks.find(b=>b.id==='p1:c0:choice:1').text,'B) increase oxygen\nwithout oxygen pressure');});
const input=originalTapInput('synthetic','1',e,{x:50,y:75}),p=prepare(input),answer={blockId:p.block.id,start:0,end:p.block.text.length,source:p.block.text,translation:'stub',complete:true};
check('source agreement',()=>{assert.equal(validate(p,JSON.stringify(answer)).source,answer.source);assert.ok(p.data.context.every(b=>b.column===0));});
check('glyph/source agreement',()=>{const g=highlightGlyphs(p,answer,e.glyphs);assert.ok(g.every(g=>g.column===0));assert.equal(g.map(g=>answer.source.slice(g.start,g.end)).join(''),answer.source.replace('\n',''));});
const repeated1=originalTapInput('synthetic','1',e,{x:90,y:75}),repeated2=originalTapInput('synthetic','1',e,{x:75,y:90});
check('repeated occurrences retain offsets',()=>assert.notEqual(repeated1.tap.start,repeated2.tap.start));
for(const [name,mutate] of [
 ['same-line choices',a=>a.map(l=>l.text.startsWith('A)')?line(l.text+' B) another option',l.chars[0].left,l.chars[0].top):l)],
 ['grammar subcolumn',a=>[...a,line('alternate grammatical form',130,70)]],
 ['nonmonotonic glyph order',a=>a.map((l,i)=>i?l:{...l,chars:[...l.chars].reverse()})],
 ['invalid cell',a=>a.map((l,i)=>i?l:{...l,chars:l.chars.map((c,j)=>j===3?{...c,right:c.left}:c)})],
 ['missing label',a=>a.filter(l=>!l.text.startsWith('B)'))],
 ['label gap',a=>a.map(l=>l.text.startsWith('C)')?line(l.text.replace('C)','E)'),l.chars[0].left,l.chars[0].top):l)],
 ['rotated',a=>a.map((l,i)=>i?l:{...l,angle:Math.PI/2})],
 ['large continuation gap',a=>a.map(l=>l.text.startsWith('without')?line(l.text,30,110):l)],
 ['gutter crossing',a=>a.map((l,i)=>i?l:line('A question crossing into the second column deliberately',20,10))],
 ['missing glyph',a=>a.map((l,i)=>i?l:{...l,chars:l.chars.map((c,j)=>j===3?null:c)})],
 ['page edge',a=>a.map(l=>l.text==='C) retain pressure'?line(l.text,200,280):l)],
])check(name,()=>assert.throws(()=>extract(mutate(lines)),/unsupported_grouping/));
check('header tap rejected',()=>assert.throws(()=>originalTapInput('s','1',e,{x:25,y:15}),/tap_outside_choice/));
check('ambiguous geometry rejected',()=>assert.throws(()=>originalTapInput('s','1',{...e,glyphs:[...e.glyphs,e.glyphs.find(g=>g.x===50&&g.y===70)]},{x:51,y:75}),/ambiguous_or_missing_tap/));
check('missing coordinate rejected',()=>assert.throws(()=>originalTapInput('s','1',e,{x:399,y:299}),/ambiguous_or_missing_tap/));
const unicode=extract([line('① oﬃce',20,40),line('② café',20,70),line('③ 한국어',20,100)]);
check('ligature normalized-to-original range',()=>{const mapping=unicode.normalization.find(n=>n.blockId==='p1:c0:choice:0');const at=mapping.text.indexOf('office'),span=mapping.originalRange(at,at+6);assert.equal(unicode.blocks[0].text.slice(span.start,span.end),'oﬃce');});
check('raw source segments preserved',()=>assert.ok(unicode.sourceMap.every(m=>unicode.blocks.find(b=>b.id===m.blockId).text.slice(m.start,m.end).length===m.lineEnd-m.lineStart)));
fs.writeFileSync(new URL('./artifacts/original-adapter-unit-results.json',import.meta.url),JSON.stringify({checks,synthetic:true,liveAiCalls:0},null,2)+'\n');console.log({checks});
