/* Analytic PDF text-state fixtures, independent of browser font metrics. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),pdfjs=require('../assets/lib/pdf-3.11.174.min.js');
const g={};new Script(readFileSync(new URL('../scripts/reader/pdf-word-geometry.js',import.meta.url),'utf8')).runInNewContext(g);
const ops=pdfjs.OPS,font={ascent:.8,descent:-.2,fontMatrix:[.001,0,0,.001,0,0]};
const fonts=new Map([['f',font],['type3',{isType3Font:true,bbox:[0,-200,1000,800],fontMatrix:[.001,0,0,.001,0,0]}]]);
const viewport={width:600,height:800,transform:[1,0,0,-1,0,800]};
const width=ch=>'il'.includes(ch)?200:'mw'.includes(ch)?900:ch===' '?250:500;
const glyphs=text=>Array.from(text,ch=>({unicode:ch,width:width(ch),isSpace:ch===' '}));
const operators=list=>({fnArray:list.map(([name])=>ops[name]),argsArray:list.map(([,args=[]])=>args)});
const run=(list,v=viewport,normalize)=>{
 const entries=g.pdfOperatorEntries(operators(list),fonts,v,ops);
 return g.pdfPageWords(entries,v.width,v.height,normalize);
};
const setup=[['beginText'],['setFont',['f',10]],['setTextMatrix',[1,0,0,1,40,700]]];
const box=(result,word)=>result.boxes.find(b=>b.word===word);
const near=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-9,`${label}: ${actual} vs ${expected}`);
const sample=[...setup,['setCharSpacing',[.7]],['setWordSpacing',[3]],
 ['showText',[glyphs("ill minimum world maximum, don't well-known.")]]];
const result=run(sample);
assert.deepEqual(Array.from(result.boxes,b=>b.word),['ill','minimum','world','maximum',"don't",'well-known']);
near(box(result,'ill').x*600,40,'first glyph');
near(box(result,'ill').w*600,7.4,'three narrow glyphs + two explicit character gaps');
near(box(result,'minimum').x*600,54.3,'word spacing and final char spacing');
near(box(result,'ill').y*800,92,'PDF ascent');near(box(result,'ill').h*800,10,'PDF ascent/descent');
assert.equal(box(result,'minimum').offset,result.text.indexOf('minimum'));
// TJ spacing, line movement, text rise, horizontal scaling, q/Q, cm, Form matrices.
const positioned=run([...setup,['setHScale',[150]],['setTextRise',[3]],
 ['showText',[[...glyphs('ill'),-200,...glyphs(' world')]]],
 ['save'],['transform',[2,0,0,2,10,20]],['setTextMatrix',[1,0,0,1,20,300]],
 ['showText',[glyphs('wide')]],['restore'],['setLeading',[20]],['nextLine'],['showText',[glyphs('again')]],
 ['paintFormXObjectBegin',[[1,0,0,1,30,40],[0,0,600,800]]],['setTextMatrix',[1,0,0,1,10,300]],
 ['showText',[glyphs('form')]],['paintFormXObjectEnd']]);
near(box(positioned,'ill').w*600,9,'horizontal scale');near(box(positioned,'ill').y*800,89,'rise');
near(box(positioned,'world').x*600,55.75,'TJ displacement and space');
near(box(positioned,'wide').x*600,50,'graphics CTM');near(box(positioned,'wide').w*600,63,'graphics scale');
near(box(positioned,'again').x*600,40,'restore line origin');near(box(positioned,'again').y*800,109,'leading');
near(box(positioned,'form').x*600,40,'Form origin');
const rotated=run(sample,{width:800,height:600,transform:[0,1,1,0,0,0]});
near(box(rotated,'ill').x*800,698,'90 degree rotation x');near(box(rotated,'ill').y*600,40,'90 degree rotation y');
near(box(rotated,'ill').h*600,7.4,'90 degree rotation advance');
for(const scale of [.8,1,1.5,2.5]){
 const scaled=run(sample,{width:600*scale,height:800*scale,transform:[scale,0,0,-scale,0,800*scale]});
 for(let i=0;i<result.boxes.length;i++)for(const key of ['x','y','w','h'])near(scaled.boxes[i][key],result.boxes[i][key],`scale ${scale} ${key}`);
}
// One glyph per operator, and a ligature representing multiple Unicode letters.
const perGlyph=[...setup];for(const ch of 'minimum')perGlyph.push(['showText',[glyphs(ch)]]);
assert.equal(run(perGlyph).boxes[0].word,'minimum');near(run(perGlyph).boxes[0].w*600,41,'per-glyph operators');
const ligature=run([...setup,['showText',[[{unicode:'ﬁ',width:600},...glyphs('ll')]]]],viewport,s=>s.replaceAll('ﬁ','fi'));
assert.equal(ligature.boxes[0].word,'fill');near(ligature.boxes[0].w*600,10,'ligature retains whole glyph');
const type3=run([...setup,['setFont',['type3',10]],['showText',[glyphs('ill')]]]);near(type3.boxes[0].w*600,6,'Type3 font matrix');
const gs=run([...setup,['setGState',[[['Font',['f',20]]]]],['showText',[glyphs('ill')]]]);near(gs.boxes[0].w*600,12,'graphics-state font');
const paragraphs=run([...setup,['showText',[glyphs('world')]],['setLeading',[20]],['nextLine'],['showText',[glyphs('world')]]]);
assert.notEqual(paragraphs.boxes[0].line,paragraphs.boxes[1].line);assert.notEqual(paragraphs.boxes[0].offset,paragraphs.boxes[1].offset);
// Groups use the incoming CTM, while text in a soft-mask is excluded.
const group=run([...setup,['beginGroup',[{matrix:[2,0,0,2,100,100]}]],['showText',[glyphs('world')]],['endGroup'],
 ['beginGroup',[{smask:{}}]],['showText',[glyphs('hidden')]],['endGroup']]);
assert.deepEqual(Array.from(group.boxes,b=>b.word),['world']);near(group.boxes[0].x*600,40,'group CTM');
console.log('PDF glyph geometry: spacing, fonts, punctuation, ligatures, multiline, transforms, rotation and scale passed');
