#!/usr/bin/env node
import fs from 'node:fs';
import { assertLexicon, compactLexicon, OUTPUT_PATH } from './lib.mjs';

const result = assertLexicon();
const expected = `${JSON.stringify(compactLexicon(result))}\n`;
if (!fs.existsSync(OUTPUT_PATH)) throw new Error('Compact output is missing; run npm run lexicon:build');
if (fs.readFileSync(OUTPUT_PATH, 'utf8') !== expected) {
  throw new Error('Compact output is stale or non-deterministic; run npm run lexicon:build');
}
console.log(`Lexicon valid: ${result.headwords} headwords, ${result.senses} senses, source/Korean IDs match, compact output is reproducible.`);
