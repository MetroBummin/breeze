/* Score actual native output at independently drawn word locations. Difficult
 * cases remain visible even when inaccurate. Only declared clean controls gate
 * accuracy; the report is a corpus observation, never a population accuracy rate. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
const raw=JSON.parse(readFileSync(process.argv[2],'utf8'));
const corpus=JSON.parse(readFileSync(new URL('./fixtures/pdf-ocr-stress/manifest.json',import.meta.url),'utf8'));
assert.equal(raw.native,true,'mock results cannot be scored as native accuracy');
const context=vm.createContext({openDb:()=>()=>{},document:{addEventListener(){}},window:{}});
const adapt=vm.runInContext(readFileSync(new URL('../scripts/reader/pdf-ocr.js',import.meta.url),'utf8')+'\nBreezePdfOcr.boxesFromWords;',context);
const rows=[];const failures=[];
for(const sample of corpus.cases){
 const result=raw.cases.find(x=>x.id===sample.id);assert.ok(result,`missing native case ${sample.id}`);
 assert.equal(result.error,null,`native failure in ${sample.id}`);
 const boxes=adapt(result.words),used=new Set(),correct=[],wrong=[];
 for(const box of boxes){
  const cx=box.x+box.w/2,cy=box.y+box.h/2;
  const at=sample.expected.findIndex((t,i)=>!used.has(i)&&cx>=t.x-.01&&cx<=t.x+t.w+.01&&cy>=t.y-.01&&cy<=t.y+t.h+.01);
  if(at>=0&&box.word.toLowerCase()===sample.expected[at].word.toLowerCase()){used.add(at);correct.push({word:box.word,expectedIndex:at});}
  else wrong.push({word:box.word,at,confidence:result.words.find(w=>w.word===box.word&&w.x===box.x)?.confidence??null});
 }
 const row={id:sample.id,kind:sample.kind,strict:sample.strict,expected:sample.expected.length,accepted:boxes.length,
  correct:correct.length,missed:sample.expected.length-used.size,wrong,milliseconds:result.milliseconds,
  geometry:'word center within independently drawn ink bounds, with 1% page tolerance'};
 rows.push(row);
 if(sample.strict&&(row.missed||wrong.length))failures.push(sample.id);
}
const report={engine:raw.engine,environment:raw.environment,native:true,rows,repetitions:raw.repetitions,
 limitations:['Synthetic corpus only; vector ink is not representative human handwriting.','macOS Vision differs from iOS-device model/runtime.','PSS/RSS include models and harness; bounded observations cannot prove absence of leaks.'],strictFailures:failures};
writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
assert.deepEqual(failures,[],'clean corpus controls failed; inspect the unmodified output and coordinate evidence');
