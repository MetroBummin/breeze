import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {test} from 'node:test';
const geometry=runInNewContext(readFileSync(new URL('../scripts/reader/pdf-ink-geometry.js',import.meta.url),'utf8')+';BreezeInkGeometry;');
const {eraseStroke}=geometry;
const stroke=points=>({color:'#111111',width:2,points});
const plain=x=>JSON.parse(JSON.stringify(x,(_,v)=>typeof v==='number'?Math.round(v*1e8)/1e8:v));
test('tap erases only the covered part and preserves original stroke data',()=>{
 const s=stroke([[0,0],[100,0]]),before=JSON.stringify(s),parts=eraseStroke(s,[50,0],[50,0],4);
 assert.equal(parts.length,2);assert.deepEqual(plain(parts.map(p=>p.points)),[[[0,0],[45,0]],[[55,0],[100,0]]]);
 assert.equal(JSON.stringify(s),before);
});
test('fast sparse eraser movement sweeps its full path without holes',()=>{
 const s=stroke([[0,0],[100,0]]),parts=eraseStroke(s,[50,-100],[50,100],8);
 assert.deepEqual(plain(parts.map(p=>p.points)),[[[0,0],[41,0]],[[59,0],[100,0]]]);
});
test('size controls change the erased area',()=>{
 const s=stroke([[0,0],[100,0]]);
 const ends=[4,8,16].map(r=>eraseStroke(s,[50,0],[50,0],r)[0].points.at(-1)[0]);
 assert.deepEqual(ends,[45,41,33]);
});
test('curves split into multiple retained pieces, without reconnecting cuts',()=>{
 const parts=eraseStroke(stroke([[0,0],[100,0],[0,20],[100,20]]),[50,-20],[50,40],4);
 assert.equal(parts.length,4);
 assert.ok(parts.every(s=>s.points.every(p=>p[0]<=45+1e-7||p[0]>=55-1e-7)));
});
test('dots, complete coverage, misses and tangencies are stable',()=>{
 const dot=stroke([[5,5]]),line=stroke([[0,0],[10,0]]);
 assert.equal(eraseStroke(dot,[5,5],[5,5],4).length,0);
 assert.equal(eraseStroke(dot,[100,100],[100,100],4)[0],dot);
 assert.equal(eraseStroke(line,[-10,0],[20,0],4).length,0);
 assert.equal(eraseStroke(line,[5,5],[5,5],4)[0],line);
 assert.equal(eraseStroke(stroke([[5,5],[5,5]]),[5,5],[5,5],4).length,0);
});
test('highlighter and eraser widths ignore pen pressure',()=>{
 const {widthAt,penWidthFactor}=geometry;
 const highlight={tool:'highlighter',width:12,pressure:[0.05,0.9],points:[[0,0],[10,0]]};
 assert.equal(widthAt(highlight,0),12);
 assert.equal(widthAt(highlight,1),12);
 assert.equal(widthAt({tool:'pen',width:1.5,pressure:[0.05],points:[[0,0]]},0),1.5*penWidthFactor(0.05));
 assert.equal(widthAt({tool:'pencil',width:2,pressure:[0.1,0.9],points:[[0,0],[10,0]]},0),2,'a saved pencil keeps its stored width');
 assert.equal(penWidthFactor(0.2),1,'light pen pressure stays at the selected width');
 assert.ok(penWidthFactor(0.9)>1);
 const cut=eraseStroke({tool:'highlighter',color:'#91df80',width:12,points:[[0,0],[100,0]]},[50,0],[50,0],8);
 assert.equal(cut.length,2);
 assert.equal(Math.round(cut[0].points.at(-1)[0]*1000)/1000,36);
 assert.equal(Math.round(cut[1].points[0][0]*1000)/1000,64);
 const ends=[4,8,16].map(r=>eraseStroke(stroke([[0,0],[100,0]]),[50,0],[50,0],r)[0].points.at(-1)[0]);
 assert.deepEqual(ends.map(v=>Math.round(v)),[45,41,33]);
});
test('rotated sweeps keep every segment outside the capsule',()=>{
 const s=stroke([[0,0],[100,100]]),parts=eraseStroke(s,[20,80],[80,20],4);
 assert.equal(parts.length,2);
 const low=parts[0].points.at(-1),high=parts[1].points[0];
 assert.ok(Math.abs(low[0]-(50-5/Math.sqrt(2)))<1e-7);
 assert.ok(Math.abs(high[0]-(50+5/Math.sqrt(2)))<1e-7);
});
