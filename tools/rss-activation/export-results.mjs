// node tools/rss-activation/export-results.mjs <saved-array-of-id-result-rows.json>
import {readFileSync} from 'node:fs';
const cohort=JSON.parse(readFileSync('server/rss-quality/cohort.json','utf8'));
const rows=JSON.parse(readFileSync(process.argv[2],'utf8'));
const seen=new Set();
console.log(JSON.stringify(rows.map(({id,result})=>{
 const ref=cohort.find(r=>r.id===id);if(!ref||seen.has(id)||!result)throw Error('invalid_export');seen.add(id);
 return {...ref,result};
}),null,2));
