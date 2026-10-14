import { existsSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { adversarialPassages } from './data/adversarial.mjs';
import { mockExamPassages } from './data/mock-exam.mjs';
import { fromParts } from './passage.mjs';
import { RULES, normalizeExample, spanAt } from './rules.mjs';

const PRIVATE_EXAM = new URL('./data/private/real-exam.json', import.meta.url);

export function loadPassages(){
  const prose = JSON.parse(readFileSync(new URL('./data/prose-gold.json', import.meta.url), 'utf8'));
  return [...prose.passages, ...mockExamPassages(), ...adversarialPassages()];
}

/** Photo-scan exams stay out of git. An empty list means the local file is absent. */
export function loadRealExamPassages(){
  const path = fileURLToPath(PRIVATE_EXAM);
  if (!existsSync(path)) return [];
  const items = JSON.parse(readFileSync(path, 'utf8'));
  return items.map(item => fromParts(
    item.id,
    item.dataset,
    item.parts.map(part => ({ text: part, category: 'real-exam' })),
    '\n',
  ));
}

export function wordTaps(passage){
  const taps = [];
  for (const span of passage.spans){
    const slice = passage.text.slice(span.start, span.end);
    const words = [...slice.matchAll(/[A-Za-z][A-Za-z'’-]*|[0-9]+(?:\.[0-9]+)?/g)];
    const usable = words.filter(word => /[A-Za-z]/.test(word[0]));
    const pool = usable.length ? usable : words;
    if (!pool.length) continue;
    const picks = [pool[0]];
    const longer = pool.filter(word => word[0].length >= 4);
    if (longer.length) picks.push(longer[Math.min(longer.length - 1, 1)] === pool[0] ? longer[longer.length - 1] : longer[0]);
    if (pool.length > 1) picks.push(pool[pool.length - 1]);
    const afterTitle = /(?:Dr|Mr|Mrs|Ms|Prof|St|Gen|Capt|Brig)\.\s+([A-Za-z]+)/.exec(slice);
    if (afterTitle){
      const at = slice.indexOf(afterTitle[1], afterTitle.index);
      if (at >= 0) picks.push({ 0: afterTitle[1], index: at });
    }
    const seen = new Set();
    for (const word of picks){
      if (seen.has(word.index)) continue;
      seen.add(word.index);
      taps.push({
        id: `${passage.id}@${span.start}+${word.index}`,
        dataset: passage.dataset,
        category: span.category,
        passageId: passage.id,
        text: passage.text,
        offset: span.start + word.index,
        word: word[0],
        goldStart: span.start,
        goldEnd: span.end,
        gold: normalizeExample(slice),
      });
    }
  }
  return taps;
}

export function classify(tap, prediction){
  if (!prediction || tap.offset < prediction.start || tap.offset >= prediction.end) return 'missing';
  const predicted = normalizeExample(prediction.text);
  if (!predicted) return 'missing';
  if (predicted === tap.gold) return 'exact';
  const inside = prediction.start >= tap.goldStart && prediction.end <= tap.goldEnd;
  const covers = prediction.start <= tap.goldStart && prediction.end >= tap.goldEnd;
  if (inside) return 'truncated';
  if (covers) return 'overlong';
  return 'wrong';
}

function blankRow(){
  return { taps: 0, exact: 0, truncated: 0, missing: 0, overlong: 0, wrong: 0 };
}

function add(row, kind){
  row.taps++;
  row[kind]++;
}

function finish(row){
  return {
    ...row,
    accuracy: row.taps ? Number((100 * row.exact / row.taps).toFixed(1)) : 0,
  };
}

export function scoreAll(passages = loadPassages()){
  const taps = passages.flatMap(wordTaps);
  const byRule = {};
  const failures = {};
  for (const rule of RULES){
    const cache = new Map();
    const segment = text => {
      if (!cache.has(text)) cache.set(text, rule.fn(text));
      return cache.get(text);
    };
    const started = performance.now();
    for (let repeat = 0; repeat < 20; repeat++){
      cache.clear();
      for (const passage of passages) rule.fn(passage.text);
    }
    const runtimeMs = Number(((performance.now() - started) / 20).toFixed(2));
    const overall = blankRow();
    const datasets = {};
    const categories = {};
    const samples = [];
    for (const tap of taps){
      const prediction = spanAt(segment(tap.text), tap.offset);
      const kind = classify(tap, prediction);
      add(overall, kind);
      datasets[tap.dataset] ??= blankRow();
      categories[tap.category] ??= blankRow();
      add(datasets[tap.dataset], kind);
      add(categories[tap.category], kind);
      if (kind !== 'exact' && samples.length < 24)
        samples.push({
          id: tap.id,
          dataset: tap.dataset,
          category: tap.category,
          kind,
          word: tap.word,
          gold: tap.gold,
          predicted: prediction ? normalizeExample(prediction.text) : '',
        });
    }
    // Keep a spread of failures: up to two per dataset and two per category.
    const picked = [];
    const seen = new Set();
    for (const key of ['dataset', 'category']){
      const counts = {};
      for (const sample of samples){
        const bucket = sample[key];
        if ((counts[bucket] || 0) >= 2 || seen.has(sample.id)) continue;
        counts[bucket] = (counts[bucket] || 0) + 1;
        seen.add(sample.id);
        picked.push(sample);
      }
    }
    byRule[rule.id] = {
      name: rule.name,
      runtimeMs,
      perPassageMs: Number((runtimeMs / passages.length).toFixed(3)),
      overall: finish(overall),
      datasets: Object.fromEntries(Object.entries(datasets).map(([key, row]) => [key, finish(row)])),
      categories: Object.fromEntries(Object.entries(categories).map(([key, row]) => [key, finish(row)])),
      failures: picked,
    };
    failures[rule.id] = picked;
  }
  return {
    passages: passages.length,
    taps: taps.length,
    datasets: Object.fromEntries([...new Set(passages.map(passage => passage.dataset))].map(id => [id, {
      gutenberg: 'Pride and Prejudice (Project Gutenberg #1342), header and footer removed',
      'long-text': 'Speckled Band and Hound of the Baskervilles excerpts already in the repo, plus line-broken copies',
      'mock-exam': 'Original exam-style pages in the same shape as a multiple-choice PDF',
      adversarial: 'Hand-labeled dense stress paragraphs',
      'g1-exam': '중앙고 고1 공통영어2 photo scan, tesseract eng+kor, local only',
      'g2-exam': '중앙고 고2 영어II photo scan, tesseract eng+kor, local only',
    }[id] || id])),
    rules: byRule,
    failures,
  };
}
