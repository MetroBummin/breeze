import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isCorrectOrder, shuffled, splitSentences, validateGeneratedOrder, validateTeacherOrder,
} from '../server/ready/order-core.mjs';
import { bearerToken, randomSessionToken, secureEqual, sha256Hex, validPin } from '../server/ready/auth-core.mjs';
import { parsePassageRows, validatePassageRows } from '../ready/admin/import-core.mjs';

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

const pasted = parsePassageRows("This is sentence one. This is sentence two.\t두 문장이 한 행에 있다.\n\nThe writer's long, quoted sentence remains intact.\t글쓴이의 긴 문장도 그대로 유지된다.");
assert.deepEqual(pasted.errors, []);
assert.equal(pasted.rows.length, 2, 'One pasted row was split again at punctuation');
assert.equal(pasted.rows[0].text, 'This is sentence one. This is sentence two.');
assert.equal(pasted.rows[1].text, "The writer's long, quoted sentence remains intact.");
assert.match(parsePassageRows('English only\t').errors[0], /1번 행의 한국어 해석/);
assert.match(parsePassageRows('\t한국어만').errors[0], /1번 행의 영어 문장/);
assert.match(parsePassageRows('a\tb\textra').errors[0], /두 열/);
assert.match(validatePassageRows([{ text:'', translation:'해석' }])[0], /1번 행의 영어 문장/);

const sql = readFileSync(resolve(root, 'sql/ready_milestone_1.sql'), 'utf8');
assert.match(sql, /ready_questions[\s\S]*type text[\s\S]*payload jsonb/, 'Question is no longer generic JSON-backed data');
assert.match(sql, /ready_attempts_are_immutable[\s\S]*before update or delete/, 'Attempts are no longer append-only');
assert.match(sql, /grant all on table[\s\S]*ready_students[\s\S]*to service_role/, 'READY server role lacks table privileges');

const examSql = readFileSync(resolve(root, 'sql/ready_exam_refactor.sql'), 'utf8');
assert.match(examSql, /create table if not exists public\.ready_exams/, 'Exam table is missing');
assert.match(examSql, /add column if not exists exam_id/, 'Passage is not attached to an Exam');
assert.match(examSql, /add column if not exists school[\s\S]*add column if not exists grade/, 'Student school and grade are missing');
assert.match(examSql, /publication_id drop not null/, 'New attempts still require a Publication');
assert.match(examSql, /status in \('draft', 'available'\)/, 'Question availability state is missing');

const passageLibrarySql = readFileSync(resolve(root, 'sql/ready_passage_library_refactor.sql'), 'utf8');
assert.match(passageLibrarySql, /create table if not exists public\.ready_exam_passages/, 'Exam-to-Passage join table is missing');
assert.match(passageLibrarySql, /position integer not null/, 'Exam Passage order is missing');
assert.match(passageLibrarySql, /add column if not exists exam_id uuid/, 'Attempt Exam context is missing');
assert.match(passageLibrarySql, /disable trigger ready_attempts_no_update[\s\S]*enable trigger ready_attempts_no_update/, 'Attempt backfill does not restore append-only protection');

const authSql = readFileSync(resolve(root, 'sql/ready_auth_migration.sql'), 'utf8');
assert.match(authSql, /pin_hash = extensions\.crypt\(p_pin, pin_hash\)/, 'Student PIN is not verified against a password hash');
assert.match(authSql, /extensions\.crypt\(p_pin, extensions\.gen_salt\('bf'/, 'Student PIN is not stored as bcrypt');
assert.match(authSql, /ready_sessions[\s\S]*token_hash/, 'Opaque sessions are missing');
assert.doesNotMatch(authSql, /\bpin\s+text\s*(?:not null)?[,)]/i, 'A plaintext PIN column was added');
assert.match(authSql, /grant all on table public\.ready_sessions, public\.ready_login_attempts to service_role/, 'READY server role lacks auth-table privileges');

const edge = readFileSync(resolve(root, 'server/ready/index.ts'), 'utf8');
assert.match(edge, /READY_AI_PROVIDER/, 'AI provider is hard-coded');
assert.match(edge, /READY_AI_MODEL/, 'AI model is hard-coded');
assert.match(edge, /function anthropicOutputSchema/, 'Claude schema compatibility transform is missing');
assert.match(edge, /output_config:\s*\{ format: \{ type: "json_schema", schema: anthropicOutputSchema\(schema\) \}/, 'Claude Sonnet 5 structured JSON output is not configured');
assert.doesNotMatch(edge, /model, max_tokens: 5000, temperature: 0/, 'Claude Sonnet 5 rejects temperature: 0');
assert.doesNotMatch(edge, /tool_choice: \{ type: "tool", name: "submit_order" \}/, 'Forced tool use conflicts with Claude 5 adaptive thinking');
assert.match(edge, /SUPABASE_SECRET_KEYS/, 'READY does not use Supabase server-side secret keys');
assert.match(edge, /authenticate\(req, "student"\)/, 'Student APIs do not require a student session');
assert.match(edge, /student_id: student\.id/, 'Attempt student identity does not come from the authenticated session');
assert.match(edge, /studentExamAccess/, 'Server does not check Exam access from the authenticated student');
assert.match(edge, /"school", student\.school[\s\S]*"grade", student\.grade/, 'Exam is not constrained by student school and grade');
assert.match(edge, /ready_exam_passages/, 'Runtime does not use the Exam-to-Passage relationship');
assert.match(edge, /exam_id: examId/, 'Attempt does not retain the verified Exam context');
assert.match(edge, /async function updateExamPassages/, 'Exam Passage range cannot be edited');
assert.doesNotMatch(edge, /async function reorderPassages|reorder_passages/, 'Passage drag reorder remains in the runtime');
assert.match(edge, /studentPassageAccess[\s\S]*ready_word_lookup_events/, 'Passage Study events are not authenticated against Exam access');
assert.doesNotMatch(edge, /translateSentences|createPassageBatch|retryPassageStudy/, 'Legacy Passage AI/batch mutation paths remain active');
assert.match(edge, /sentenceRows/, 'Table imports do not preserve explicit sentence rows');
const createPassageBody = edge.match(/async function createPassage\(body: any\) \{[\s\S]*?\n\}/)?.[0] || '';
assert.match(createPassageBody, /ready_create_passage_with_sentences/, 'Teacher rows are not saved through the atomic Passage RPC');
assert.doesNotMatch(createPassageBody, /splitSentences|translateSentences|preparePassageStudy/, 'Passage import still re-splits or AI-processes teacher rows');
assert.match(edge, /async function deleteImpact[\s\S]*ready_attempts[\s\S]*async function deleteStudent/, 'Student deletion does not inspect learning history');
assert.doesNotMatch(edge, /ready_publish_study_set|ready_publication_questions/, 'New READY runtime still depends on Publication');
assert.doesNotMatch(edge, /READY_TEACHER_KEY|x-ready-teacher-key/, 'Raw teacher secret authentication is still active');

const app = readFileSync(resolve(root, 'ready/app.js'), 'utf8');
const adminApp = readFileSync(resolve(root, 'ready/admin/app.js'), 'utf8');
const adminHtml = readFileSync(resolve(root, 'ready/admin/index.html'), 'utf8');
const readyConfig = readFileSync(resolve(root, 'ready/config.js'), 'utf8');
const atomicPassageSql = readFileSync(resolve(root, 'supabase/migrations/20260826155500_ready_atomic_passage_import.sql'), 'utf8');
assert.match(atomicPassageSql, /ready_create_passage_with_sentences/, 'Atomic Passage import RPC is missing');
assert.match(atomicPassageSql, /insert into public\.ready_passages[\s\S]*insert into public\.ready_passage_sentences/, 'Passage and sentence rows are not in one database transaction');
assert.match(atomicPassageSql, /with ordinality/, 'Pasted row order is not preserved as sentence_index');
assert.doesNotMatch(app, /submit_attempt|data-order-move|student_questions/, 'ORDER UI remains in the Golden Path');
assert.match(app, /student_passage[\s\S]*data-study-toggle[\s\S]*preview-translation/, 'Student Passage Reader does not show stored row translations');
assert.doesNotMatch(app + adminApp, /studySetId|publicationId|publish_set/, 'Frontend still depends on StudySet or Publication');
assert.doesNotMatch(app, /main_idea|sentence_translation|vocabulary/, 'A future question type was implemented early');
assert.match(adminApp, /admin_login/, 'Admin session login is missing');
assert.match(adminApp, /student-school-filter[\s\S]*student-grade-filter/, 'Student school/grade filters are missing');
assert.match(adminApp, /confirmation.*DELETE|DELETE.*confirmation/, 'Student DELETE confirmation is missing');
assert.match(adminApp, /data-update-exam/, 'Exam Passage checkbox editing is missing');
assert.match(adminApp, /data-select-passage[\s\S]*create-exam-from-passages/, 'Passage checkbox to Exam flow is missing');
assert.doesNotMatch(adminApp, /reorder_passages|draggedPassageId|draggable="true"/, 'Passage drag order remains in the UI');
assert.match(adminApp, /update-passage-form/, 'Passage editing is missing');
assert.match(adminApp, /parsePassageRows[\s\S]*renderImportPreview/, 'Paste does not stop at editable Preview before saving');
assert.match(adminHtml, /passage-import-modal[\s\S]*지문 미리보기/, 'Passage Preview sheet is missing');
assert.match(adminHtml, /data-route="students"[\s\S]*data-route="passages"[\s\S]*data-route="exams"/, 'Admin navigation order is incorrect');
assert.doesNotMatch(adminHtml, /create-exam-form|새 Exam|Exam 만들기/, 'Exam list view still exposes Exam creation');
assert.doesNotMatch(adminApp, /reorder_students|saveGroupOrder/, 'Student manual ordering remains in the admin UI');
assert.doesNotMatch(app + adminApp + readyConfig, /SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|READY_ADMIN_PASSWORD|READY_TEACHER_KEY/, 'A server secret name/value leaked into frontend runtime code');

console.log('READY core checks passed');
