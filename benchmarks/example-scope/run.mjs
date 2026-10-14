import { writeFileSync } from 'node:fs';
import { loadRealExamPassages, scoreAll } from './score.mjs';

const report = scoreAll();
const out = new URL('./results.json', import.meta.url);
writeFileSync(out, JSON.stringify(report, null, 2) + '\n');

function line(row){
  return [row.accuracy.toFixed(1).padStart(6), String(row.exact).padStart(5), String(row.truncated).padStart(5), String(row.missing).padStart(5), String(row.overlong).padStart(5), String(row.wrong).padStart(5), String(row.taps).padStart(5)].join(' ');
}

console.log(`passages ${report.passages}  word taps ${report.taps}`);
console.log('rule  ms   acc%  exact trunc  miss   long  wrong  taps');
for (const [id, rule] of Object.entries(report.rules)){
  console.log(`${id}  ${String(rule.runtimeMs).padStart(7)} ${line(rule.overall)}  ${rule.name}`);
  for (const [dataset, row] of Object.entries(rule.datasets))
    console.log(`   ${dataset.padEnd(14)} ${line(row)}`);
  for (const [category, row] of Object.entries(rule.categories))
    console.log(`   · ${category.padEnd(16)} ${line(row)}`);
}
console.log(`wrote ${out.pathname}`);

const exams = loadRealExamPassages();
if (exams.length){
  const examReport = scoreAll(exams);
  const redacted = {
    passages: examReport.passages,
    taps: examReport.taps,
    note: 'Photo-scan OCR. Sentence text is local only and is not written here.',
    rules: Object.fromEntries(Object.entries(examReport.rules).map(([id, rule]) => [id, {
      name: rule.name,
      runtimeMs: rule.runtimeMs,
      overall: rule.overall,
      datasets: rule.datasets,
      categories: rule.categories,
      failureKinds: rule.failures.map(sample => ({ dataset: sample.dataset, kind: sample.kind })),
    }])),
  };
  console.log(`\nreal exams  passages ${examReport.passages}  word taps ${examReport.taps}`);
  for (const [id, rule] of Object.entries(examReport.rules)){
    console.log(`${id}  ${String(rule.runtimeMs).padStart(7)} ${line(rule.overall)}  ${rule.name}`);
    for (const [dataset, row] of Object.entries(rule.datasets))
      console.log(`   ${dataset.padEnd(14)} ${line(row)}`);
  }
  writeFileSync('/tmp/example-scope-real-exam.json', JSON.stringify(redacted, null, 2) + '\n');
  writeFileSync('/tmp/example-scope-real-exam-failures.json', JSON.stringify(examReport.failures, null, 2) + '\n');
}
