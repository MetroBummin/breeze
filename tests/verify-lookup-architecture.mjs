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
assert.doesNotMatch(server,/DETAIL_SCHEMA|detailPrompt|opDetail|op==="detail"/);

assert.doesNotMatch(server,/JEV_API_KEY|JEV_MODEL|api\.typesafe\.ai|function opJudge|AI_REQUIRED/);
assert.doesNotMatch(server,/function opRoute|function opPhrase|function opRepair|JEV_PHRASE_CONFIDENCE/);
assert.doesNotMatch(server,/BREEZE_LEXICON|OEWN|baseSenseId|translationQuality/);

assert.doesNotMatch(client,/op:'judge'|savedMeaningCandidates|resolveSavedWordContext|AI_REQUIRED/);
assert.doesNotMatch(client,/op:'route'|op:'phrase'|op:'repair'/);
assert.match(client,/저장된 lexical item은 네트워크 판정 없이 기기에 있는 Meaning을 즉시 보여 줍니다/);

assert.match(client,/function expressionFromMini/);
assert.match(client,/phraseCardKey\(phrase\.canonical\)/);
assert.match(client,/phraseParts:phrase\.parts,phraseGaps:phrase\.gaps/);
assert.match(client,/tokens:lookupTokens\.map\(token=>\(\{text:token\.text\}\)\),clickedIndex/);

const firstLookup=(client.match(/async function fetchDict\(k,node\)\{[\s\S]*?\n\}/)||[''])[0];
assert.match(firstLookup,/loadCachedLook/);
assert.match(firstLookup,/fetchLook\(k,\{life,node\}\)/);
assert.doesNotMatch(firstLookup,/op:'judge'|ensureMeaningDetail|routeJevTarget/);

assert.doesNotMatch(client,/ensureMeaningDetail|detailKey|op:'detail'|detailLoading/);
assert.doesNotMatch(client,/ai\.note\b|ai\.gloss\b|j\.note\b|j\.gloss\b|oldAi\.note\b|oldAi\.gloss\b/);

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

assert.doesNotMatch(telemetry,/\|"detail"/);
assert.doesNotMatch(telemetry,/\|"judge"|\|"route"|\|"phrase"|\|"repair"|\|"jev"/);

console.log('Lookup architecture checks passed');
