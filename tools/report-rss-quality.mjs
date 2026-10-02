// Usage: node tools/report-rss-quality.mjs reference.json results.json
// Both files contain metadata only; no credentials or full article bodies.
import {readFileSync} from 'node:fs';
import {qualityReport} from '../server/rss-quality/report.mjs';
const [reference,results]=process.argv.slice(2);
if(!reference || !results)throw new Error('Expected reference.json and results.json');
console.log(JSON.stringify(qualityReport(JSON.parse(readFileSync(reference,'utf8')),JSON.parse(readFileSync(results,'utf8'))),null,2));
