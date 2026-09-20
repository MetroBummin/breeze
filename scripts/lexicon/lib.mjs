import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '../..');
export const SOURCE_PATH = path.join(ROOT, 'data/lexicon/source/oewn-500.jsonl');
export const KO_PATH = path.join(ROOT, 'data/lexicon/ko/senses-ko.jsonl');
export const MANIFEST_PATH = path.join(ROOT, 'data/lexicon/manifest.json');
export const HEADWORDS_PATH = path.join(ROOT, 'data/lexicon/headwords.json');
export const OUTPUT_PATH = path.join(ROOT, 'public/lexicon/lexicon.min.json');

export function readJsonl(file) {
  const text = fs.readFileSync(file, 'utf8');
  const rows = [];
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    if (!raw.trim()) continue;
    try {
      rows.push(JSON.parse(raw));
    } catch (error) {
      throw new Error(`${path.relative(ROOT, file)}:${index + 1}: ${error.message}`);
    }
  }
  return rows;
}

export function sortSenses(rows) {
  const posOrder = new Map([['noun', 0], ['verb', 1], ['adjective', 2], ['adverb', 3]]);
  return [...rows].sort((a, b) =>
    a.lemma.localeCompare(b.lemma, 'en') ||
    (posOrder.get(a.pos) ?? 9) - (posOrder.get(b.pos) ?? 9) ||
    a.sense_id.localeCompare(b.sense_id, 'en')
  );
}

export function assertLexicon() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const selection = JSON.parse(fs.readFileSync(HEADWORDS_PATH, 'utf8'));
  const source = readJsonl(SOURCE_PATH);
  const ko = readJsonl(KO_PATH);
  const errors = [];
  const sourceById = new Map();
  const koById = new Map();
  const sourceLemmas = new Map();
  const koLemmas = new Map();
  const requiredSource = ['sense_id', 'synset_id', 'lemma', 'pos', 'en_gloss'];
  const requiredKo = [...requiredSource, 'ko', 'ko_gloss'];

  function nonempty(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }
  function inspect(rows, byId, byLemma, required, label) {
    for (const [index, row] of rows.entries()) {
      for (const key of required) {
        if (key === 'ko') {
          if (!Array.isArray(row.ko) || row.ko.length < 1 || row.ko.length > 3 || row.ko.some(item => !nonempty(item))) {
            errors.push(`${label}:${index + 1}: ko must contain 1-3 non-empty strings`);
          }
        } else if (!nonempty(row[key])) {
          errors.push(`${label}:${index + 1}: missing ${key}`);
        }
      }
      if (nonempty(row.sense_id)) {
        if (byId.has(row.sense_id)) errors.push(`${label}:${index + 1}: duplicate sense_id ${row.sense_id}`);
        byId.set(row.sense_id, row);
      }
      if (nonempty(row.lemma)) byLemma.set(row.lemma, (byLemma.get(row.lemma) || 0) + 1);
      if (/\b(?:TODO|TBD|PLACEHOLDER)\b/i.test(JSON.stringify(row))) errors.push(`${label}:${index + 1}: placeholder text`);
      if (row.pos && !['noun', 'verb', 'adjective', 'adverb'].includes(row.pos)) errors.push(`${label}:${index + 1}: unsupported pos ${row.pos}`);
    }
  }

  inspect(source, sourceById, sourceLemmas, requiredSource, 'source');
  inspect(ko, koById, koLemmas, requiredKo, 'ko');

  if (sourceLemmas.size !== 500) errors.push(`source headwords: expected 500, got ${sourceLemmas.size}`);
  if (koLemmas.size !== 500) errors.push(`ko headwords: expected 500, got ${koLemmas.size}`);
  if (source.length !== ko.length) errors.push(`sense count mismatch: source ${source.length}, ko ${ko.length}`);
  if (manifest.counts?.headwords !== 500) errors.push('manifest headword count must be 500');
  if (manifest.counts?.senses !== source.length) errors.push(`manifest sense count: expected ${source.length}, got ${manifest.counts?.senses}`);
  const selected = Object.values(selection.categories || {}).flat();
  if (selected.length !== 500 || new Set(selected).size !== 500) errors.push(`selection must contain 500 unique headwords; got ${selected.length}/${new Set(selected).size}`);
  for (const [category, expected] of Object.entries(manifest.counts?.selection || {})) {
    if (selection.categories?.[category]?.length !== expected) errors.push(`${category} selection: expected ${expected}, got ${selection.categories?.[category]?.length}`);
  }
  for (const lemma of selected) if (!sourceLemmas.has(lemma)) errors.push(`selected headword missing from source: ${lemma}`);
  for (const lemma of sourceLemmas.keys()) if (!selected.includes(lemma)) errors.push(`source headword missing from selection: ${lemma}`);

  for (const [id, original] of sourceById) {
    const translated = koById.get(id);
    if (!translated) {
      errors.push(`missing Korean row for ${id}`);
      continue;
    }
    for (const key of requiredSource) {
      if (translated[key] !== original[key]) errors.push(`${id}: Korean row changed canonical ${key}`);
    }
    if (translated.ko.some(item => !/[가-힣]/.test(item))) errors.push(`${id}: every ko item must contain Hangul`);
    if (!/[가-힣]/.test(translated.ko_gloss || '')) errors.push(`${id}: ko_gloss has no Hangul`);
    if (translated.ko.some(item => item.length > 40)) errors.push(`${id}: ko item is longer than 40 characters`);
    if ((translated.ko_gloss || '').length < 6 || translated.ko_gloss.length > 140) errors.push(`${id}: ko_gloss length is outside 6-140 characters`);
    if (new Set(translated.ko).size !== translated.ko.length) errors.push(`${id}: duplicate ko items`);
    const mixedScript = /[\u00c0-\u024f\u0400-\u052f\u3040-\u30ff\u4e00-\u9fff]/;
    if (translated.ko.some(item => mixedScript.test(item)) || mixedScript.test(translated.ko_gloss || '')) errors.push(`${id}: unexpected mixed script`);
  }
  for (const id of koById.keys()) {
    if (!sourceById.has(id)) errors.push(`Korean row has unknown sense_id ${id}`);
  }

  for (const lemma of sourceLemmas.keys()) {
    if (!koLemmas.has(lemma)) errors.push(`missing Korean headword ${lemma}`);
    const rows = ko.filter(row => row.lemma === lemma);
    const signatures = new Set();
    for (const row of rows) {
      const signature = `${row.ko.join('|')}\u0000${row.ko_gloss}`;
      if (signatures.has(signature)) errors.push(`${lemma}: indistinguishable duplicate Korean sense: ${row.sense_id}`);
      signatures.add(signature);
    }
  }

  if (errors.length) throw new Error(`Lexicon validation failed (${errors.length})\n- ${errors.slice(0, 100).join('\n- ')}`);
  return { manifest, source: sortSenses(source), ko: sortSenses(ko), headwords: sourceLemmas.size, senses: source.length };
}

export function compactLexicon({ manifest, ko, headwords, senses }) {
  const entries = {};
  for (const row of ko) {
    (entries[row.lemma] ||= []).push({
      id: row.sense_id,
      synset: row.synset_id,
      pos: row.pos,
      en: row.en_gloss,
      ko: row.ko,
      gloss: row.ko_gloss,
    });
  }
  return {
    version: manifest.dataset_version,
    source: `${manifest.source.name} ${manifest.source.version}`,
    headword_count: headwords,
    sense_count: senses,
    entries,
  };
}
