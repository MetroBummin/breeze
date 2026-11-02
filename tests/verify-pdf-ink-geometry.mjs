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
 const cut=eraseStroke({tool:'highlighter',color:'#91df80',width:12,points:[[0,0],[100,0]]},[50,0],[50,0],8);
 assert.equal(cut.length,2);
 assert.equal(Math.round(cut[0].points.at(-1)[0]*1000)/1000,36);
 assert.equal(Math.round(cut[1].points[0][0]*1000)/1000,64);
 const ends=[4,8,16].map(r=>eraseStroke(stroke([[0,0],[100,0]]),[50,0],[50,0],r)[0].points.at(-1)[0]);
 assert.deepEqual(ends.map(v=>Math.round(v)),[45,41,33]);
});
test('pencil dabs overlap into a grainy line and do not shrink below the selected width',()=>{
 const pts=[];for(let x=0;x<=180;x+=3)pts.push([x,40]);
 const mid=geometry.pencilDabs(pts,pts.map(()=>0.55),2,false);
 const light=geometry.pencilDabs(pts,pts.map(()=>0.15),2,false);
 const hard=geometry.pencilDabs(pts,pts.map(()=>0.95),2,false);
 assert.deepEqual(geometry.pencilDabs(pts,pts.map(()=>0.55),2,false),mid);
 assert.ok(mid.length>80,'stamps are dense, not a dashed stroke');
 const covered=Array.from({length:40},(_,i)=>{
  const x=10+i*4;
  return mid.filter(d=>Math.hypot(d.cx-x,d.cy-40)<=d.ry+0.05).length;
 });
 assert.ok(covered.filter(n=>n>=2).length>34,'neighbouring dabs cover the same paper');
 const opacities=mid.map(d=>d.opacity);
 assert.ok(Math.max(...opacities)-Math.min(...opacities)>0.15,'page grain changes darkness');
 assert.ok(Math.max(...mid.map(d=>d.ry))<=1.4,'dabs stay near the selected radius');
 assert.ok(hard.reduce((s,d)=>s+d.opacity,0)/hard.length>light.reduce((s,d)=>s+d.opacity,0)/light.length+0.12);
 assert.equal(geometry.penWidthFactor(0.2),1,'a light stored pressure is the selected pen width');
 assert.ok(geometry.penWidthFactor(0.9)>geometry.penWidthFactor(0.2));
 const colored=geometry.pencilDabs(pts,pts.map(()=>0.55),3,true);
 assert.ok(colored.length>40&&colored.every(d=>d.ry<=2));
});
test('rotated sweeps keep every segment outside the capsule',()=>{
 const s=stroke([[0,0],[100,100]]),parts=eraseStroke(s,[20,80],[80,20],4);
 assert.equal(parts.length,2);
 const low=parts[0].points.at(-1),high=parts[1].points[0];
 assert.ok(Math.abs(low[0]-(50-5/Math.sqrt(2)))<1e-7);
 assert.ok(Math.abs(high[0]-(50+5/Math.sqrt(2)))<1e-7);
});
