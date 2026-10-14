import { writeFileSync } from 'node:fs';
import { loadJunePassages, loadRealExamPassages, scoreAll } from './score.mjs';

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

function sumRows(rows){
  const out = { taps: 0, exact: 0, truncated: 0, missing: 0, overlong: 0, wrong: 0 };
  for (const row of rows){
    for (const key of Object.keys(out)) out[key] += row[key] || 0;
  }
  out.accuracy = out.taps ? Number((100 * out.exact / out.taps).toFixed(1)) : 0;
  return out;
}

function printRule(id, rule){
  console.log(`${id}  ${String(rule.runtimeMs).padStart(7)} ${line(rule.overall)}  ${rule.name}`);
  for (const [dataset, row] of Object.entries(rule.datasets))
    console.log(`   ${dataset.padEnd(16)} ${line(row)}`);
  const options = sumRows(Object.entries(rule.categories).filter(([key]) => key.startsWith('opt-')).map(([, row]) => row));
  if (options.taps) console.log(`   ${'options'.padEnd(16)} ${line(options)}`);
  for (const [category, row] of Object.entries(rule.categories))
    console.log(`   · ${category.padEnd(16)} ${line(row)}`);
}

function redact(report, note){
  return {
    passages: report.passages,
    taps: report.taps,
    note,
    rules: Object.fromEntries(Object.entries(report.rules).map(([id, rule]) => [id, {
      name: rule.name,
      runtimeMs: rule.runtimeMs,
      overall: rule.overall,
      datasets: rule.datasets,
      categories: rule.categories,
      failureKinds: rule.failures.map(sample => ({ dataset: sample.dataset, category: sample.category, kind: sample.kind })),
    }])),
  };
}

const june = loadJunePassages();
if (june.length){
  const juneReport = scoreAll(june);
  const juneLines = scoreAll(loadJunePassages('\n'));
  console.log(`\nMAIN  2024 고1 6월  passages ${juneReport.passages}  word taps ${juneReport.taps}  (PDF lines joined with a space)`);
  console.log('rule  ms   acc%  exact trunc  miss   long  wrong  taps');
  for (const [id, rule] of Object.entries(juneReport.rules)) printRule(id, rule);
  console.log('same labels if each PDF line stayed on its own line:');
  for (const [id, rule] of Object.entries(juneLines.rules)){
    const options = sumRows(Object.entries(rule.categories).filter(([key]) => key.startsWith('opt-')).map(([, row]) => row));
    console.log(`   ${id}  space-join ${juneReport.rules[id].overall.accuracy.toFixed(1)}  line-break ${rule.overall.accuracy.toFixed(1)}  options ${options.accuracy.toFixed(1)} (${options.taps})`);
  }
  writeFileSync('/tmp/example-scope-june.json', JSON.stringify(redact(juneReport, '2024 June text layer. Sentence text is local only.'), null, 2) + '\n');
  writeFileSync('/tmp/example-scope-june-lines.json', JSON.stringify(redact(juneLines, 'Same labels, newline between parts.'), null, 2) + '\n');
  writeFileSync('/tmp/example-scope-june-failures.json', JSON.stringify(juneReport.failures, null, 2) + '\n');
}

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
