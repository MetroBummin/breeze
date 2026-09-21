import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const client=readFileSync(resolve(root,'scripts/dictionary/dictionary.js'),'utf8');
const server=readFileSync(resolve(root,'server/dict/index.ts'),'utf8');
const telemetry=readFileSync(resolve(root,'server/dict/telemetry.ts'),'utf8');

assert.match(server,/OPENROUTER_MODEL="deepseek\/deepseek-v4-flash-0731"/);
assert.match(server,/required:\["kind","canonical","members","ko"\]/);
assert.match(server,/maxTokens:120,schema:LOOK_SCHEMA/);
assert.match(server,/const DETAIL_SCHEMA=.*required:\["pos","gloss"\]/);
assert.match(server,/maxTokens:180,schema:DETAIL_SCHEMA/);

assert.match(server,/criteria\.AI_REQUIRED=/);
assert.match(server,/ordinary collocation/);
assert.match(server,/확신이 낮으면 AI_REQUIRED/);
assert.doesNotMatch(server,/function opRoute|function opPhrase|function opRepair|JEV_PHRASE_CONFIDENCE/);
assert.doesNotMatch(server,/BREEZE_LEXICON|OEWN|baseSenseId|translationQuality/);

assert.match(client,/function savedMeaningCandidates/);
assert.match(client,/senses:senses\.map\(item=>\(\{id:item\.id,meaning:item\.meaning,pos:item\.pos,gloss:item\.gloss\}\)\)/);
assert.match(client,/verdict\.selected!=='AI_REQUIRED'/);
assert.equal((client.match(/op:'judge'/g)||[]).length,1);
assert.doesNotMatch(client,/op:'route'|op:'phrase'|op:'repair'/);

assert.match(client,/function expressionFromMini/);
assert.match(client,/phraseCardKey\(phrase\.canonical\)/);
assert.match(client,/phraseParts:phrase\.parts,phraseGaps:phrase\.gaps/);
assert.match(client,/tokens:lookupTokens\.map\(token=>\(\{text:token\.text\}\)\),clickedIndex/);

const firstLookup=(client.match(/async function fetchDict\(k,node\)\{[\s\S]*?\n\}/)||[''])[0];
assert.match(firstLookup,/loadCachedLook/);
assert.match(firstLookup,/fetchLook\(k,\{life,node\}\)/);
assert.doesNotMatch(firstLookup,/op:'judge'|ensureMeaningDetail|routeJevTarget/);

assert.match(client,/function ensureMeaningDetail/);
assert.match(client,/op:'detail'/);
assert.match(client,/function expandWordDetail\([\s\S]*?ensureMeaningDetail/);
assert.doesNotMatch((client.match(/function renderWordPeek\([\s\S]*?\n\}/)||[''])[0],/ensureMeaningDetail/);

for(const path of [
  'public/lexicon/lexicon.min.json',
  'scripts/lexicon/build-lexicon.mjs',
  'scripts/lexicon/import-oewn-500.mjs',
  'scripts/lexicon/lib.mjs',
  'scripts/lexicon/select-headwords.py',
  'scripts/lexicon/validate-lexicon.mjs',
]){
  assert.equal(existsSync(resolve(root,path)),false,`${path} survived the OEWN rollback`);
}

assert.match(telemetry,/\|"detail"/);
assert.doesNotMatch(telemetry,/\|"route"|\|"phrase"|\|"repair"/);

console.log('Lookup architecture checks passed');
