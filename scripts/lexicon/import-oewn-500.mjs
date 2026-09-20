#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SOURCE_PATH, sortSenses } from './lib.mjs';

const jsonDir = process.argv[2];
if (!jsonDir) throw new Error('Usage: node scripts/lexicon/import-oewn-500.mjs <extracted OEWN JSON directory>');
const selectionPath = path.join(ROOT, 'data/lexicon/headwords.json');
const selection = JSON.parse(fs.readFileSync(selectionPath, 'utf8'));
const wanted = new Set(Object.values(selection.categories).flat());
if (wanted.size !== 500) throw new Error(`Selection must contain exactly 500 unique headwords; got ${wanted.size}`);

const entries = new Map();
for (const name of fs.readdirSync(jsonDir).filter(name => /^entries-.+\.json$/.test(name)).sort()) {
  const chunk = JSON.parse(fs.readFileSync(path.join(jsonDir, name), 'utf8'));
  for (const [lemma, value] of Object.entries(chunk)) if (wanted.has(lemma)) entries.set(lemma, value);
}
const missing = [...wanted].filter(lemma => !entries.has(lemma));
if (missing.length) throw new Error(`Headwords absent from OEWN: ${missing.join(', ')}`);

const neededSynsets = new Set();
for (const value of entries.values()) {
  for (const posValue of Object.values(value)) for (const sense of posValue.sense || []) neededSynsets.add(sense.synset);
}
const synsets = new Map();
for (const name of fs.readdirSync(jsonDir).filter(name => /^(?:noun|verb|adj|adv)\..+\.json$/.test(name)).sort()) {
  const chunk = JSON.parse(fs.readFileSync(path.join(jsonDir, name), 'utf8'));
  for (const [id, value] of Object.entries(chunk)) if (neededSynsets.has(id)) synsets.set(id, value);
}

const posNames = { n: 'noun', v: 'verb', a: 'adjective', s: 'adjective', r: 'adverb' };
const rows = [];
for (const lemma of [...wanted].sort((a, b) => a.localeCompare(b, 'en'))) {
  for (const [posKey, posValue] of Object.entries(entries.get(lemma))) {
    for (const sense of posValue.sense || []) {
      const synset = synsets.get(sense.synset);
      if (!synset) throw new Error(`Missing synset ${sense.synset} for ${sense.id}`);
      rows.push({
        sense_id: sense.id,
        synset_id: sense.synset,
        ili: synset.ili || null,
        lemma,
        pos: posNames[posKey[0]] || posKey,
        en_gloss: (synset.definition || []).join('; '),
        examples: synset.example || [],
        synonyms: (synset.members || []).filter(member => member !== lemma),
      });
    }
  }
}
fs.mkdirSync(path.dirname(SOURCE_PATH), { recursive: true });
fs.writeFileSync(SOURCE_PATH, `${sortSenses(rows).map(row => JSON.stringify(row)).join('\n')}\n`);
console.log(`Imported ${wanted.size} headwords and ${rows.length} senses to ${path.relative(ROOT, SOURCE_PATH)}.`);
