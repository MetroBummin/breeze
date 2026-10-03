// Offline only; makes no network/provider calls and reads no credentials.
// node tools/compare-rss-quality.mjs baseline.json [v2-results.json]
import {readFileSync} from 'node:fs';
import {pairedReport} from '../server/rss-quality/compare.mjs';
const [baselinePath,nextPath]=process.argv.slice(2);
if(!baselinePath)throw Error('usage: baseline.json [v2-results.json]');
const baseline=JSON.parse(readFileSync(baselinePath,'utf8'));
const reference=baseline.map(({id,url,source})=>({id,url,source}));
console.log(JSON.stringify(pairedReport(reference,baseline,nextPath?JSON.parse(readFileSync(nextPath,'utf8')):[]),null,2));
