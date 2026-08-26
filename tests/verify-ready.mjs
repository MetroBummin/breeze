import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isCorrectOrder, shuffled, splitSentences, validateGeneratedOrder, validateTeacherOrder,
} from '../server/ready/order-core.mjs';
import { bearerToken, randomSessionToken, secureEqual, sha256Hex, validPin } from '../server/ready/auth-core.mjs';

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

assert.equal(validPin('1234'), true);
assert.equal(validPin('123456'), true);
assert.equal(validPin('123'), false);
assert.equal(validPin('12a4'), false);
const sessionToken = randomSessionToken();
assert.match(sessionToken, /^[A-Za-z0-9_-]{43}$/);
assert.equal(bearerToken(`Bearer ${sessionToken}`), sessionToken);
assert.equal((await sha256Hex(sessionToken)).length, 64);
assert.equal(secureEqual('same-secret', 'same-secret'), true);
assert.equal(secureEqual('same-secret', 'other-secret'), false);

const sql = readFileSync(resolve(root, 'sql/ready_milestone_1.sql'), 'utf8');
assert.match(sql, /ready_questions[\s\S]*type text[\s\S]*payload jsonb/, 'Question is no longer generic JSON-backed data');
assert.match(sql, /ready_attempts_are_immutable[\s\S]*before update or delete/, 'Attempts are no longer append-only');
assert.match(sql, /ready_publish_study_set/, 'Publish is not atomic');
assert.match(sql, /grant all on table[\s\S]*ready_students[\s\S]*to service_role/, 'READY server role lacks table privileges');

const authSql = readFileSync(resolve(root, 'sql/ready_auth_migration.sql'), 'utf8');
assert.match(authSql, /pin_hash = extensions\.crypt\(p_pin, pin_hash\)/, 'Student PIN is not verified against a password hash');
assert.match(authSql, /extensions\.crypt\(p_pin, extensions\.gen_salt\('bf'/, 'Student PIN is not stored as bcrypt');
assert.match(authSql, /ready_sessions[\s\S]*token_hash/, 'Opaque sessions are missing');
assert.doesNotMatch(authSql, /\bpin\s+text\s*(?:not null)?[,)]/i, 'A plaintext PIN column was added');
assert.match(authSql, /grant all on table public\.ready_sessions, public\.ready_login_attempts to service_role/, 'READY server role lacks auth-table privileges');

const edge = readFileSync(resolve(root, 'server/ready/index.ts'), 'utf8');
assert.match(edge, /READY_AI_PROVIDER/, 'AI provider is hard-coded');
assert.match(edge, /READY_AI_MODEL/, 'AI model is hard-coded');
assert.match(edge, /output_config:\s*\{ format: \{ type: "json_schema", schema: ORDER_SCHEMA \}/, 'Claude Sonnet 5 structured JSON output is not configured');
assert.doesNotMatch(edge, /model, max_tokens: 5000, temperature: 0/, 'Claude Sonnet 5 rejects temperature: 0');
assert.doesNotMatch(edge, /tool_choice: \{ type: "tool", name: "submit_order" \}/, 'Forced tool use conflicts with Claude 5 adaptive thinking');
assert.match(edge, /SUPABASE_SECRET_KEYS/, 'READY does not use Supabase server-side secret keys');
assert.match(edge, /authenticate\(req, "student"\)/, 'Student APIs do not require a student session');
assert.match(edge, /student_id: session\.student_id/, 'Attempt student identity does not come from the authenticated session');
assert.doesNotMatch(edge, /READY_TEACHER_KEY|x-ready-teacher-key/, 'Raw teacher secret authentication is still active');

const app = readFileSync(resolve(root, 'ready/app.js'), 'utf8');
const adminApp = readFileSync(resolve(root, 'ready/admin/app.js'), 'utf8');
const readyConfig = readFileSync(resolve(root, 'ready/config.js'), 'utf8');
assert.match(app, /submit_attempt/, 'Student attempts are not sent to the server');
assert.match(app, /data-order-move="up"/, 'ORDER has no mobile-friendly non-drag control');
assert.doesNotMatch(app, /main_idea|sentence_translation|vocabulary/, 'A future question type was implemented early');
assert.doesNotMatch(app, /submit_attempt[^\n]*studentId|studentId[^\n]*submit_attempt/, 'Student can choose the attempt owner');
assert.match(adminApp, /admin_login/, 'Admin session login is missing');
assert.doesNotMatch(app + adminApp + readyConfig, /SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|READY_ADMIN_PASSWORD|READY_TEACHER_KEY/, 'A server secret name/value leaked into frontend runtime code');

console.log('READY core checks passed');
