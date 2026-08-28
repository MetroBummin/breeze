import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bearerToken, randomSessionToken, secureEqual, sha256Hex, validPin } from '../server/ready/auth-core.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(resolve(root,path),'utf8');

assert.equal(validPin('1234'),true);
assert.equal(validPin('123456'),true);
assert.equal(validPin('123'),false);
const token=randomSessionToken();
assert.match(token,/^[A-Za-z0-9_-]{43}$/);
assert.equal(bearerToken(`Bearer ${token}`),token);
assert.equal((await sha256Hex(token)).length,64);
assert.equal(secureEqual('same-secret','same-secret'),true);

const baseline=read('supabase/migrations/20260826150000_ready_current_baseline.sql');
const questionMigration=read('supabase/migrations/20260828150000_ready_question_first.sql');
const edge=read('server/ready/index.ts');
const app=read('ready/app.js');
const css=read('ready/ready.css');

assert.match(baseline,/ready_questions[\s\S]*type text[\s\S]*payload jsonb/,'Question must remain generic JSON-backed data');
assert.match(baseline,/ready_attempts_are_immutable[\s\S]*before update or delete/,'Attempts must remain append-only');
assert.match(questionMigration,/ready_import_question_bundle[\s\S]*jsonb_array_elements[\s\S]*return imported/,'Atomic bundle import is missing');
assert.match(questionMigration,/multiple_choice[\s\S]*written_response/,'Both deterministic response types are not indexed/importable');
assert.match(questionMigration,/source_question_no[\s\S]*section/,'Source identity is not validated');

assert.match(edge,/studentOps = new Set\(\["student_bootstrap", "student_passage", "student_questions", "student_review_questions", "submit_attempt"\]\)/,'Student runtime exposes operations outside the Question-first path');
assert.doesNotMatch(edge.match(/async function dispatch[\s\S]*?\n\}/)?.[0]||'',/word_lookup|save_word|save_sentence|personal_library/,'Dormant lexical operations remain dispatched');
assert.match(edge,/function publicQuestion[\s\S]*responseSlots[\s\S]*variantSegments[\s\S]*contentBlocks/,'Structured public Question contract is incomplete');
assert.doesNotMatch(edge.match(/function publicQuestion[\s\S]*?\n\}/)?.[0]||'',/accepted_answers|payload\.answer/,'Public Question exposes grading data');
assert.match(edge,/type === "multiple_choice"[\s\S]*selected\.length === answer\.length[\s\S]*selected\.every/,'MCQ grading is not deterministic set equality');
assert.match(edge,/type === "written_response"|question\.type === "written_response"/,'Written response grading is missing');
assert.match(edge,/normalize\("NFKC"\)[\s\S]*toLowerCase\(\)[\s\S]*replace\(\/\\s\+\/g/,'Written normalization is incomplete');
assert.match(edge,/accepted_response_sets[\s\S]*acceptedSets\.some/,'Linked written-response combinations are not graded atomically');
assert.match(edge,/inlineOptionGroups[\s\S]*inlineSelected[\s\S]*inlineAnswer/,'Inline passage-option grading is missing');
assert.match(edge,/\["grammar", "vocabulary"\]\.includes[\s\S]*inlineOptionGroups/,'Inline options can leak from a shared Passage into an unrelated question type');
assert.match(edge,/target_ranges[\s\S]*inline_positions/,'Inline target/position contracts are missing');
assert.match(edge,/unresolvedQuestionIds[\s\S]*latest\.has[\s\S]*!correct/,'Review is not derived from the latest append-only Attempt');
assert.match(edge,/studentReviewQuestions[\s\S]*unresolvedQuestionIds/,'Review queue endpoint is missing');

assert.match(app,/function renderReader[\s\S]*plainPassage/,'Reader does not render continuous prose');
assert.doesNotMatch(app,/openLexical|openSentence|translation_view|save_sentence|savedWord|savedSentence/,'Lexical/sentence study remains connected to the student frontend');
assert.match(app,/family\|\|'standard'[\s\S]*questionPassageHtml/,'Question family renderer is missing');
assert.match(app,/contentBlocks[\s\S]*variantSegments[\s\S]*summaryText/,'Question variants and summary blocks are not rendered');
assert.match(app,/responseType==='written'[\s\S]*data-written-slot/,'Written response UI is missing');
assert.match(app,/questionSetKey[\s\S]*question-set-nav[\s\S]*data-question-index/,'Passage question-set navigation is missing');
assert.match(app,/data-inline-group[\s\S]*data-target-choice[\s\S]*data-position-choice/,'Direct passage interactions are missing');
assert.match(app,/inactiveVariantText[\s\S]*question\.interaction!==['"]inline_options['"][\s\S]*canonicalHasOption/,'Inactive annotations are not cleaned when moving within a question set');
assert.doesNotMatch(app.match(/function renderScope\(\)[\s\S]*?\n\}/)?.[0]||'',/data-open-review/,'Home still duplicates the top-level wrong-answer review route');
assert.match(app,/student_review_questions[\s\S]*복습 문제/,'Wrong-answer review UI is missing');
assert.match(app,/continuationQuestion[\s\S]*question_count/,'Quick start can select a Passage without questions');
assert.match(app,/function exitQuestions[\s\S]*loadDashboard/,'Leaving a question session can show a stale Review count');
assert.match(css,/Question-first reset[\s\S]*reading-passage\{[\s\S]*display:block/,'Reader prose reset is missing');
assert.match(css,/question-block\.group[\s\S]*question-segment\.blank[\s\S]*written-response/,'Question family styling is incomplete');
assert.match(css,/inline-answer[\s\S]*question-set-nav/,'Question-set and inline interaction styling is missing');
assert.match(css,/question-prompt\{[^}]*clamp\(18px,1\.65vw,22px\)/,'Question prompt has regressed to an oversized display heading');
assert.match(readFileSync('tools/ready-extract-exam4you-mcq.py','utf8'),/stimulus[\s\S]*target_ranges[\s\S]*city_tour_blocks/,'Question-set source repairs are missing from the importer');

console.log('READY Question-first core checks passed');
