import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const admin = read('ready/admin/app.js');
const student = read('ready/app.js');
const api = read('ready/api.js');
const edge = read('server/ready/index.ts');
const operationPattern = /(?:call|readyApi|record)\(['"]([a-z_]+)['"]/g;
const clientOps = new Set([...admin.matchAll(operationPattern), ...student.matchAll(operationPattern)].map(match => match[1]));
const serverOps = new Set([...edge.matchAll(/case "([a-z_]+)"/g)].map(match => match[1]));
const serverOnlyOps = new Set([
  'create_passage', // authenticated structured-data ingress used by ChatGPT Work tooling
  'delete_student', 'delete_passage', // selected through the typed delete modal's operation map
]);

for (const op of clientOps) assert(serverOps.has(op), `Frontend operation has no server contract: ${op}`);
for (const op of serverOps) assert(clientOps.has(op) || serverOnlyOps.has(op), `Server operation has no active caller: ${op}`);
for (const removed of ['create_passage_batch', 'update_passage_study', 'retry_passage_study', 'reorder_passages', 'student_study_library', 'set_student_active', 'create_exam', 'update_exam_passages', 'delete_exam', 'delete_scope', 'student_exam', 'generate_order', 'student_questions', 'submit_attempt', 'update_question', 'set_question_status', 'delete_question']) {
  assert(!serverOps.has(removed), `Legacy operation is still dispatched: ${removed}`);
}

assert.match(admin, /data-select-passage/, 'Passage Library checkbox is missing');
assert.match(admin, /assign-passages-to-scope[\s\S]*assign_scope_passages/, 'Selected Passages are not assigned to a current Scope');
assert.doesNotMatch(admin, /draggable="true"|reorder_passages|draggedPassageId/, 'Passage drag reorder remains in the critical path');
assert.match(admin, /delete_impact/, 'Delete UI does not fetch server-side impact counts');
assert.match(edge, /ready_set_current_scope_passages/, 'Scope and Passage links are not updated atomically');
assert.match(edge, /async function countWhere[\s\S]*?\.select\("\*", \{ count: "exact", head: true \}\)/, 'Delete impact counting assumes every relation has an id column');
assert.match(edge, /ready_delete_student_cascade[\s\S]*ready_delete_passage_cascade/, 'Administrator deletion is not delegated to atomic cascade RPCs');
assert.match(api, /READ_ONLY_OPS[\s\S]*const attempts = READ_ONLY_OPS\.has\(op\) \? 2 : 1/, 'Mutation requests can still retry');
assert.doesNotMatch(student, /student_exam|data-exam-id|data-back-exams|renderExams/, 'Student still has an Exam selection step');
assert.match(student, /student_bootstrap[\s\S]*state\.scope=data\.scope[\s\S]*renderScope/, 'Student does not enter the current Scope directly');
assert.match(student, /reading-passage[\s\S]*reading-sentence/, 'Reader is not rendered as a continuous passage');
assert.match(student, /courseKey[\s\S]*source_type!=='TEXTBOOK'[\s\S]*scopePassagesHtml/, 'Textbook Passages are not grouped by course in the student list');
assert.match(edge, /select\("id,title,display_order,source_type,source_label"\)/, 'Student passage list lacks textbook course metadata');
assert.match(edge, /output_json[\s\S]*AI 구조화 응답이 비어 있습니다/, 'Anthropic structured output has no robust response parser');
assert.doesNotMatch(admin + edge, /renderAnalytics|question-editor|studentQuestions|submitAttempt|generateOrderQuestion/, 'Dormant Question/Attempt runtime is still active');
assert.doesNotMatch(admin, /import-core|renderImportPreview|create-passage-form|\btsv\b/, 'READY Admin still contains an Import workflow');

const migrations = readdirSync(resolve(root, 'supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
assert.deepEqual(migrations, [
  '20260826150000_ready_current_baseline.sql',
  '20260826155500_ready_atomic_passage_import.sql',
  '20260826161000_ready_golden_path_stabilization.sql',
  '20260826170000_ready_scope_simplification.sql',
  '20260826174000_ready_legacy_delete_cleanup.sql',
  '20260827030000_ready_reader_intelligence.sql',
  '20260827034500_ready_stable_lexical_identity.sql',
  '20260827040000_ready_bake_snapshot_lint_fix.sql',
  '20260827041500_ready_bake_lint_ambiguity_fix.sql',
  '20260827050000_ready_passage_revision.sql',
]);
const baseline = read(`supabase/migrations/${migrations[0]}`);
assert.match(baseline, /create table if not exists public\.ready_students/);
assert.match(baseline, /create table if not exists public\.ready_exam_passages/);
assert.match(baseline, /create table if not exists public\.ready_attempts/);
assert.doesNotMatch(baseline, /ready_study_sets|ready_publications|ready_publication_questions/, 'Clean schema recreates legacy runtime tables');
const scopeMigration = read(`supabase/migrations/${migrations[3]}`);
const legacyDeleteMigration = read(`supabase/migrations/${migrations[4]}`);
const intelligenceMigration = read(`supabase/migrations/${migrations[5]}`);
const stableIdentityMigration = read(`supabase/migrations/${migrations[6]}`);
const bakeSnapshotFix = read(`supabase/migrations/${migrations[7]}`);
const bakeLintFix = read(`supabase/migrations/${migrations[8]}`);
assert.match(scopeMigration, /ready_exams_one_current_scope_idx/, 'School and grade can have multiple current Scopes');
assert.match(scopeMigration, /\('중앙고', '1학년'\)[\s\S]*\('한빛고', '2학년'\)/, 'Eight permanent Scope slots are not seeded');
assert.doesNotMatch(scopeMigration + edge + admin, /delete_scope|ready_delete_scope_cascade|data-delete-scope/, 'Permanent Scope slots can still be deleted');
assert.match(scopeMigration, /set_config\('ready\.allow_cascade_delete', 'on', true\)/, 'Cascade deletion cannot safely remove append-only Attempts');
assert.match(legacyDeleteMigration, /to_regclass\('public\.ready_publication_questions'\)[\s\S]*execute 'delete from public\.ready_publication_questions/, 'Production legacy Publication links still block Passage deletion');
assert.match(intelligenceMigration,/ready_apply_passage_bake[\s\S]*ready_sentence_tokens[\s\S]*ready_lexical_occurrences/,'Bake output is not applied atomically');
assert.match(intelligenceMigration,/ready_saved_lexical_items[\s\S]*unique\(student_id, concept_id\)/,'Saved lexical concepts are not deduplicated per student');
assert.match(stableIdentityMigration,/v_old_occurrences[\s\S]*v_old_concept_id[\s\S]*ready_lexical_concept_aliases/,'Rebake does not preserve or explicitly remap lexical identity');
assert.doesNotMatch(stableIdentityMigration + bakeSnapshotFix,/create temporary table|ready_bake_old_occurrences/,'Bake identity snapshots still depend on temporary relations');
assert.doesNotMatch(bakeLintFix,/declare[^;]*old_occurrence jsonb/,'Bake remap function reintroduced the ambiguous alias variable');

console.log(`READY API contracts verified (${clientOps.size} frontend operations).`);
