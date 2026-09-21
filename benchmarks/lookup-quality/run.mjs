import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {lookCases} from './cases.mjs';
import {holdout} from './holdout.mjs';
const access=process.env.BREEZE_EVAL_URL&&process.env.BREEZE_EVAL_TOKEN?{url:process.env.BREEZE_EVAL_URL,token:process.env.BREEZE_EVAL_TOKEN}:JSON.parse(readFileSync(process.env.BREEZE_EVAL_ACCESS||'/tmp/breeze-eval-access.json','utf8'));
const variants=(process.env.VARIANTS||'baseline,candidate').split(',');
const repeats=Number(process.env.REPEATS||1);
const cases=(process.env.SUITE==='holdout'?holdout:lookCases).filter(c=>!process.env.CASE_FILTER||new RegExp(process.env.CASE_FILTER).test(c.id));
const jobs=cases.flatMap(c=>Array.from({length:repeats},(_,repeat)=>variants.map(variant=>({c,repeat,variant})))).flat();
const results=[];let cursor=0;
const dir=new URL(`results/${new Date().toISOString().replaceAll(':','-')}/`,import.meta.url);mkdirSync(dir,{recursive:true});
writeFileSync(new URL('lookup.ts.txt',dir),readFileSync(new URL('../../server/dict/lookup.ts',import.meta.url)));
async function worker(){while(cursor<jobs.length){const {c,repeat,variant}=jobs[cursor++];const start=performance.now();let response,status=0;try{const r=await fetch(access.url,{method:'POST',headers:{'content-type':'application/json','x-eval-token':access.token},body:JSON.stringify({...c,variant}),signal:AbortSignal.timeout(15000)});status=r.status;response=await r.json();}catch(e){response={error:String(e)}}
 const a=response.answer||{},kind=a.kind===c.expected.kind,canonical=String(a.canonical||'').toLowerCase()===c.expected.canonical.toLowerCase(),members=JSON.stringify(a.members)===JSON.stringify(c.expected.members);
 results.push({id:c.id,category:c.category,variant,repeat,expected:c.expected,expectedKo:c.expectedKo,korean:c.expectedKo?new RegExp(c.expectedKo).test(a.ko||''):null,sentence:c.sentence,clickedIndex:c.clickedIndex,status,ms:Math.round(performance.now()-start),response,kind,canonical,members,exact:status===200&&kind&&canonical&&members&&!!a.ko});
 if(results.length%20===0)console.log(`${results.length}/${jobs.length}`);
 writeFileSync(new URL('raw.json',dir),JSON.stringify(results,null,2));
}}
await Promise.all(Array.from({length:4},worker));
const summary=Object.fromEntries(variants.map(v=>{const rows=results.filter(r=>r.variant===v),exp=rows.filter(r=>r.expected.kind==='expression'),word=rows.filter(r=>r.expected.kind==='word'),ms=rows.map(r=>r.ms).sort((a,b)=>a-b);return [v,{n:rows.length,koreanPass:rows.filter(r=>r.korean===true).length,koreanN:rows.filter(r=>r.korean!==null).length,retrySuccess:rows.filter(r=>(r.response.attempts||1)>1).length,httpOK:rows.filter(r=>r.status===200).length,exact:rows.filter(r=>r.exact).length,expressionRecall:exp.filter(r=>r.kind).length,expressionN:exp.length,falseExpressions:word.filter(r=>r.response.answer?.kind==='expression').length,wordN:word.length,valid:rows.filter(r=>r.response.valid).length,p50:ms[Math.floor(ms.length*.5)],p95:ms[Math.floor(ms.length*.95)],inputTokens:rows.reduce((n,r)=>n+(r.response.usage?.prompt_tokens||0),0),outputTokens:rows.reduce((n,r)=>n+(r.response.usage?.completion_tokens||0),0)}]}));
writeFileSync(new URL('summary.json',dir),JSON.stringify(summary,null,2));console.log(JSON.stringify({directory:dir.pathname,summary},null,2));
