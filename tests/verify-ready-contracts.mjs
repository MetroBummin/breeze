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
const clientOps = new Set([...admin.matchAll(/call\(['"]([a-z_]+)['"]/g), ...student.matchAll(/call\(['"]([a-z_]+)['"]/g)].map(match => match[1]));
const serverOps = new Set([...edge.matchAll(/case "([a-z_]+)"/g)].map(match => match[1]));

for (const op of clientOps) assert(serverOps.has(op), `Frontend operation has no server contract: ${op}`);
for (const removed of ['create_passage_batch', 'update_passage_study', 'retry_passage_study', 'reorder_passages', 'student_study_library', 'set_student_active']) {
  assert(!serverOps.has(removed), `Legacy operation is still dispatched: ${removed}`);
}

assert.match(admin, /data-select-passage/, 'Passage Library checkbox is missing');
assert.match(admin, /create-exam-from-passages[\s\S]*create_exam/, 'Selected Passages do not create an Exam');
assert.doesNotMatch(admin, /draggable="true"|reorder_passages|draggedPassageId/, 'Passage drag reorder remains in the critical path');
assert.match(admin, /delete_impact/, 'Delete UI does not fetch server-side impact counts');
assert.match(edge, /ready_create_exam_with_passages/, 'Exam and Passage links are not created atomically');
assert.match(edge, /async function countWhere[\s\S]*?\.select\("\*", \{ count: "exact", head: true \}\)/, 'Delete impact counting assumes every relation has an id column');
assert.match(api, /READ_ONLY_OPS[\s\S]*const attempts = READ_ONLY_OPS\.has\(op\) \? 2 : 1/, 'Mutation requests can still retry');

const migrations = readdirSync(resolve(root, 'supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
assert.deepEqual(migrations, [
  '20260826150000_ready_current_baseline.sql',
  '20260826155500_ready_atomic_passage_import.sql',
  '20260826161000_ready_golden_path_stabilization.sql',
]);
const baseline = read(`supabase/migrations/${migrations[0]}`);
assert.match(baseline, /create table if not exists public\.ready_students/);
assert.match(baseline, /create table if not exists public\.ready_exam_passages/);
assert.match(baseline, /create table if not exists public\.ready_attempts/);
assert.doesNotMatch(baseline, /ready_study_sets|ready_publications|ready_publication_questions/, 'Clean schema recreates legacy runtime tables');

console.log(`READY API contracts verified (${clientOps.size} frontend operations).`);
