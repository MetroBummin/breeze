import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {buildReport,selectedIds} from './run.mjs';

export function compare(baseline,candidate) {
  assert.equal(baseline.mode,'real','contract tests are not benchmark comparisons');
  assert.equal(candidate.mode,'real','contract tests are not benchmark comparisons');
  assert.ok(['Apple Vision','bundled ML Kit 16.0.1'].includes(baseline.engine));
  assert.equal(candidate.engine,'baidu/Unlimited-OCR (local vLLM)');
  assert.deepEqual(baseline.corpus,candidate.corpus,'corpus mismatch');
  // Recompute scores, rather than trusting imported summaries.
  const a=buildReport(baseline.engine,baseline.provenance,baseline.rawCases);
  const b=buildReport(candidate.engine,candidate.provenance,candidate.rawCases);
  assert.deepEqual(a.corpus,baseline.corpus,'report differs from checkout corpus');
  return {schema:1,mode:'real',baseline:a.engine,candidate:b.engine,
    provenance:{baseline:a.provenance,candidate:b.provenance},corpus:a.corpus,
    rows:selectedIds.map((id,i)=>({id,baseline:a.rows[i],candidate:b.rows[i]})),
    verdict:'No automatic replacement recommendation. Compare text/order, then independently establish word geometry and device/server resource budgets.',
    limitations:[...new Set([...a.limitations,...b.limitations]),
      'Averaging across cases hides failures; paired per-case rows are retained.',
      'Cold/warm state and timing scope must be reviewed before claiming a latency advantage.']};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    assert.equal(process.argv.length,5,'usage: node compare.mjs baseline.json unlimited.json comparison.json');
    const report=compare(...process.argv.slice(2,4).map(p=>JSON.parse(readFileSync(p,'utf8'))));
    writeFileSync(process.argv[4],JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({out:process.argv[4],cases:report.rows.length,mode:report.mode}));
  } catch(error) { console.error(error.message); process.exitCode=1; }
}
