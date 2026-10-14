import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { loadPassages, scoreAll, wordTaps } from '../benchmarks/example-scope/score.mjs';
import { normalizeExample, ruleA, ruleB, ruleC, spanAt } from '../benchmarks/example-scope/rules.mjs';

const root = resolve(new URL('..', import.meta.url).pathname);

function saved(rule, text, word){
  const offset = text.indexOf(word);
  assert.ok(offset >= 0, `missing probe word ${word}`);
  const span = spanAt(rule(text), offset);
  return span ? normalizeExample(span.text) : '';
}

test('the experiment is not wired into the reader', () => {
  const index = readFileSync(resolve(root, 'index.html'), 'utf8');
  const bridge = readFileSync(resolve(root, 'scripts/reader/mode-bridge.js'), 'utf8');
  assert.doesNotMatch(index, /example-scope/);
  assert.match(bridge, /function bridgeSentences\(value\)/);
  assert.match(bridge, /\[\^\.!\?\\u2026\]\+/);
});

test('rule A is the production single-stop splitter', () => {
  assert.equal(JSON.stringify(ruleA('Dr. Watson arrived late.').map(span => normalizeExample(span.text))), JSON.stringify(['Dr.', 'Watson arrived late.']));
  assert.equal(JSON.stringify(ruleA('He waited... Then she spoke.').map(span => normalizeExample(span.text))), JSON.stringify(['He waited...', 'Then she spoke.']));
  assert.equal(JSON.stringify(ruleA('The value is 3.14 today.').map(span => normalizeExample(span.text))), JSON.stringify(['The value is 3.', '14 today.']));
});

test('the three rules disagree where the owner said they would', () => {
  assert.equal(saved(ruleA, 'Dr. Watson arrived late.', 'Watson'), 'Watson arrived late.');
  assert.equal(saved(ruleB, 'Dr. Watson arrived late.', 'Watson'), 'Dr. Watson arrived late.');
  assert.equal(saved(ruleC, 'Dr. Watson arrived late.', 'Watson'), 'Watson arrived late.');

  const lower = '1. apples are red\n2. bananas are yellow';
  assert.equal(saved(ruleB, lower, 'apples'), '1. apples are red');
  assert.equal(saved(ruleB, lower, 'bananas'), '2. bananas are yellow');
  assert.notEqual(saved(ruleA, lower, 'apples'), '1. apples are red');
  assert.equal(saved(ruleC, lower, 'apples'), normalizeExample(lower));

  const circled = '① The river flooded\n② The bridge held\nⒶ Paris is the capital\nⓐ Lyon is smaller\n(A) Call Dr. Rao\nB) Call Mr. Rao';
  for (const word of ['river', 'bridge', 'Paris', 'Lyon', 'Call']){
    const example = saved(ruleB, circled, word);
    assert.match(example, new RegExp(word));
    assert.equal((example.match(/[①②Ⓐⓐ]/g) || []).length + (example.includes('(A)') ? 1 : 0) + (example.includes('B)') ? 1 : 0), 1);
  }
  assert.equal(saved(ruleB, circled, 'Rao'), '(A) Call Dr. Rao');

  const inline = 'Places like Little Italy ① exist and people ② do share values.';
  assert.equal(saved(ruleB, inline, 'exist'), inline);
  assert.equal(saved(ruleC, inline, 'exist'), inline);

  const bare = 'The sample sat on the bench and nobody wrote a period';
  assert.equal(saved(ruleA, bare, 'bench'), bare);
  assert.equal(saved(ruleB, bare, 'bench'), bare);
  assert.equal(saved(ruleC, bare, 'bench'), bare);

  assert.equal(saved(ruleB, 'The value of pi is 3.14 today.', 'value'), 'The value of pi is 3.14 today.');
  assert.equal(saved(ruleC, 'The value of pi is 3.14 today.', 'value'), 'The value of pi is 3.14 today.');
  assert.notEqual(saved(ruleA, 'The value of pi is 3.14 today.', 'value'), 'The value of pi is 3.14 today.');

  const brand = 'The keynote ended. iPhone sales began the next day.';
  assert.equal(saved(ruleB, brand, 'iPhone'), 'iPhone sales began the next day.');
  assert.equal(saved(ruleC, brand, 'sales'), 'The keynote ended. iPhone sales began the next day.');

  const year = 'The war ended in 1918. 1919 brought new maps.';
  assert.equal(saved(ruleB, year, 'brought'), '1919 brought new maps.');
  assert.equal(saved(ruleC, year, 'brought'), year);

  const tag = '“What time is it?” she asked.';
  assert.equal(saved(ruleC, tag, 'asked'), tag);
  assert.notEqual(saved(ruleB, tag, 'asked'), tag);

  assert.equal(saved(ruleB, 'He waited... Then she spoke.', 'waited'), 'He waited... Then she spoke.');
  assert.equal(saved(ruleC, 'He waited... Then she spoke.', 'spoke'), 'Then she spoke.');

  const pdfNumbers = '1. apples are red 2. bananas are yellow';
  assert.equal(saved(ruleB, pdfNumbers, 'apples'), '1. apples are red');
  assert.equal(saved(ruleB, pdfNumbers, 'bananas'), '2. bananas are yellow');
});

test('the labeled set covers the four datasets and hundreds of taps', () => {
  const passages = loadPassages();
  const taps = passages.flatMap(wordTaps);
  const datasets = new Set(passages.map(passage => passage.dataset));
  assert.deepEqual([...datasets].sort(), ['adversarial', 'gutenberg', 'long-text', 'mock-exam']);
  assert.ok(taps.length >= 400, `expected at least 400 word taps, got ${taps.length}`);
  for (const token of ['①', '⑳', 'Ⓐ', 'Ⓩ', 'ⓐ', 'ⓩ', '(A)', '1.']){
    assert.ok(passages.some(passage => passage.text.includes(token)), `missing option marker ${token}`);
  }
  const categories = new Set(taps.map(tap => tap.category));
  for (const category of ['abbrev', 'options', 'options-lower', 'pdf-linebreak', 'quotes', 'decimals', 'dialogue', 'ellipsis', 'brand', 'number-start', 'no-terminator', 'inline'])
    assert.ok(categories.has(category), `missing category ${category}`);
  for (const passage of passages){
    let previous = 0;
    for (const span of passage.spans){
      assert.ok(span.start >= previous && span.end <= passage.text.length && span.start < span.end, passage.id);
      previous = span.end;
    }
  }
});

test('the headless comparison finishes and keeps every tap in one bucket', () => {
  const report = scoreAll();
  assert.ok(report.taps >= 400);
  for (const rule of Object.values(report.rules)){
    const row = rule.overall;
    assert.equal(row.exact + row.truncated + row.missing + row.overlong + row.wrong, row.taps);
    assert.ok(rule.runtimeMs >= 0);
    assert.ok(rule.failures.length > 0);
  }
  const winner = Object.entries(report.rules).sort((a, b) => b[1].overall.accuracy - a[1].overall.accuracy)[0];
  assert.ok(winner, 'comparison produced no rule');
});
