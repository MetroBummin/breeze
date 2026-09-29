// Run on a checked-out candidate; optional BASE_INTEGRITY points to baseline JS.
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';
const candidate=readFileSync(new URL('../scripts/core/word-integrity.js',import.meta.url),'utf8');
const sources={candidate,...(process.env.BASE_INTEGRITY?{baseline:readFileSync(process.env.BASE_INTEGRITY,'utf8')}:{})};
const records=Object.fromEntries(Array.from({length:2100},(_,i)=>['word'+i,{word:'word'+i,ko:'뜻',forms:['word'+i],defs:[],status:1,addedAt:1}]));
const report={environment:{node:process.version,platform:process.platform,arch:process.arch},recordCount:2100,runs:5,results:{}};
for(const [name,source] of Object.entries(sources)){
 const c={records,dead:{}};vm.createContext(c);vm.runInContext(source,c);const times=[];
 for(let i=0;i<5;i++){const start=performance.now();c.cleanOrphanWords(records,c.dead);times.push(performance.now()-start);}
 times.sort((a,b)=>a-b);report.results[name]={medianMs:times[2],minMs:times[0],maxMs:times[4]};
}
console.log(JSON.stringify(report,null,2));
