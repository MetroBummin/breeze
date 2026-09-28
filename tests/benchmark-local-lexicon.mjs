import {readFileSync,writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import '../modules/lexical/core.js';
import '../scripts/dictionary/local-lexicon.js';
const bytes=readFileSync(new URL('../assets/dictionaries/en-ko-10k/dictionary.json',import.meta.url));
global.gc?.();const before=process.memoryUsage().heapUsed,t=performance.now();
const data=JSON.parse(bytes),parsed=performance.now();
const resolver=BreezeLocalLexicon.create(data),ready=performance.now();
const heap=process.memoryUsage().heapUsed-before;
const words=Object.keys(data.entries),samples=[];
for(let i=0;i<Math.min(words.length,1000);i++)resolver.lookup({sentence:words[i],clicked:words[i],clickedIndex:0});
for(const word of words){const t=performance.now();resolver.lookup({sentence:word,clicked:word,clickedIndex:0});samples.push(performance.now()-t);}
samples.sort((a,b)=>a-b);
const report={environment:`Node ${process.version}; ${process.platform}/${process.arch}; NOT physical-device paint time`,
 dictionaryBytes:bytes.length,jsonParseMs:parsed-t,initializeMs:ready-parsed,
 approximateHeapGrowthBytes:heap,lookupSamples:samples.length,p50LookupMs:samples[Math.floor(samples.length*.5)],
 p95LookupMs:samples[Math.floor(samples.length*.95)],maxLookupMs:samples.at(-1)};
console.log(JSON.stringify(report,null,2));
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
