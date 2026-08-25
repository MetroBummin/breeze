import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isCorrectOrder, shuffled, splitSentences, validateGeneratedOrder, validateTeacherOrder,
} from '../server/ready/order-core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sentences = [
  { id:'s1', sentence_index:0, text:'First, a claim is introduced.' },
  { id:'s2', sentence_index:1, text:'The next sentence explains it.' },
  { id:'s3', sentence_index:2, text:'For example, evidence follows.' },
  { id:'s4', sentence_index:3, text:'In contrast, another view appears.' },
  { id:'s5', sentence_index:4, text:'Therefore, the passage concludes.' },
];

assert.deepEqual(splitSentences('Dr. Kim arrived at 3.14 p.m. He waited. Then he left!'), [
  'Dr. Kim arrived at 3.14 p.m.', 'He waited.', 'Then he left!',
]);

const generated = validateGeneratedOrder({
  difficulty:1,
  chunks:[
    { id:'chunk_a', sentenceIds:['s1','s2'], text:'First, a claim is introduced. The next sentence explains it.' },
    { id:'chunk_b', sentenceIds:['s3','s4'], text:'For example, evidence follows. In contrast, another view appears.' },
    { id:'chunk_c', sentenceIds:['s5'], text:'Therefore, the passage concludes.' },
  ],
  correctOrder:['chunk_a','chunk_b','chunk_c'],
}, sentences, 1);
assert.equal(generated.chunks.length, 3);
assert.throws(() => validateGeneratedOrder({
  ...generated,
  chunks: generated.chunks.map((chunk, index) => index ? chunk : { ...chunk, text:'A paraphrased claim.' }),
}, sentences, 1), /rewrote/);
assert.throws(() => validateGeneratedOrder({ ...generated, correctOrder:['chunk_a','chunk_b','chunk_b'] }, sentences, 1), /correctOrder/);
assert.throws(() => validateGeneratedOrder({ ...generated, correctOrder:['chunk_b','chunk_a','chunk_c'] }, sentences, 1), /source sentence order/);

const edited = validateTeacherOrder({ ...generated, chunks:generated.chunks.map((chunk, index) => index ? chunk : { ...chunk, text:'Teacher-edited display text.' }) });
assert.equal(edited.chunks[0].text, 'Teacher-edited display text.');
assert.equal(isCorrectOrder(['chunk_a','chunk_b','chunk_c'], generated.correctOrder), true);
assert.equal(isCorrectOrder(['chunk_b','chunk_a','chunk_c'], generated.correctOrder), false);
assert.notDeepEqual(shuffled(generated.chunks, () => 0.999), generated.chunks, 'A practical shuffle must not leave the original order unchanged');

const sql = readFileSync(resolve(root, 'sql/ready_milestone_1.sql'), 'utf8');
assert.match(sql, /ready_questions[\s\S]*type text[\s\S]*payload jsonb/, 'Question is no longer generic JSON-backed data');
assert.match(sql, /ready_attempts_are_immutable[\s\S]*before update or delete/, 'Attempts are no longer append-only');
assert.match(sql, /ready_publish_study_set/, 'Publish is not atomic');

const edge = readFileSync(resolve(root, 'server/ready/index.ts'), 'utf8');
assert.match(edge, /READY_AI_PROVIDER/, 'AI provider is hard-coded');
assert.match(edge, /READY_AI_MODEL/, 'AI model is hard-coded');
assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/, 'READY data is being exposed through direct browser table access');

const app = readFileSync(resolve(root, 'ready/app.js'), 'utf8');
assert.match(app, /submit_attempt/, 'Student attempts are not sent to the server');
assert.match(app, /data-order-move="up"/, 'ORDER has no mobile-friendly non-drag control');
assert.doesNotMatch(app, /main_idea|sentence_translation|vocabulary/, 'A future question type was implemented early');

console.log('READY core checks passed');
