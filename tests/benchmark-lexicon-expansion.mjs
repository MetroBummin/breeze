import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
const require=createRequire(import.meta.url),api=require('../scripts/dictionary/local-lexicon-packs.js');
const out=new URL('../assets/dictionaries/en-ko-expansion/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',out),'utf8'));
const definitions=[{...api.baseMetadata,...manifest.baseline},...manifest.packs];
for(let i=0;i<3;i++)global.gc?.();
const before=process.memoryUsage().heapUsed;
let packs=[],parseMs=0,bytes=0;
for(const meta of definitions){
  const raw=readFileSync(new URL(meta.file,out),'utf8');bytes+=Buffer.byteLength(raw);
  const began=performance.now();const data=JSON.parse(raw);parseMs+=performance.now()-began;
  packs.push({data,meta});
}
const words=packs.flatMap(p=>Object.keys(p.data.entries));
const start=performance.now();const engine=api.create(packs,{allowExperimentalFallback:true});
const initMs=performance.now()-start;packs=null;
for(let i=0;i<3;i++)global.gc?.();
const retainedHeapDelta=global.gc?Math.max(0,process.memoryUsage().heapUsed-before):null;
const timing=[];
for(let i=0;i<6000;i++){
  const word=words[(i*7919)%words.length];const input={sentence:word,clicked:word,clickedIndex:0};
  const start=performance.now();engine.lookup(input);const dt=performance.now()-start;
  if(i>=1000)timing.push(dt);
}
timing.sort((a,b)=>a-b);
const result={environment:{node:process.version,platform:process.platform,arch:process.arch},headwords:engine.stats().headwords,
  jsonBytes:bytes,gzipBytes:200116+manifest.packs.reduce((sum,p)=>sum+p.gzipBytes,0),parseMs,initMs,
  retainedHeapDeltaBytes:retainedHeapDelta,lookupP50Ms:timing[Math.floor(timing.length*.5)],lookupP95Ms:timing[Math.floor(timing.length*.95)],
  measurement:'Single-process Node benchmark; heap delta includes resolver and headword list after dropping input dictionaries. Not browser or iPhone tap-to-paint.'};
console.log(JSON.stringify(result,null,2));if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');
