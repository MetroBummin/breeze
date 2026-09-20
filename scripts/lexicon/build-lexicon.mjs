#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertLexicon, compactLexicon, OUTPUT_PATH } from './lib.mjs';

const result = assertLexicon();
const output = compactLexicon(result);
fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output)}\n`);
console.log(`Built ${path.relative(process.cwd(), OUTPUT_PATH)}: ${result.headwords} headwords, ${result.senses} senses.`);
