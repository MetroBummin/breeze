// READY — Exam > Passage > Question > Attempt
// Custom opaque sessions are validated here. Deploy this Edge Function with JWT verification disabled.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { isCorrectOrder, shuffled, splitSentences, validateGeneratedOrder, validateTeacherOrder } from "./order-core.mjs";
import { bearerToken, randomSessionToken, secureEqual, sha256Hex, validPin } from "./auth-core.mjs";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
function supabaseAdminKey() {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const key = keys?.ready_secret_key || keys?.default;
    if (typeof key === "string" && key) return key;
  } catch { /* fallback below */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", supabaseAdminKey(), { auth: { persistSession: false } });
const adminOps = new Set(["teacher_bootstrap", "create_exam", "create_passage", "generate_order", "update_question", "set_question_status", "delete_question", "create_student", "set_student_pin", "set_student_active", "delete_student"]);
const studentOps = new Set(["student_bootstrap", "student_exam", "student_questions", "submit_attempt"]);
const publicOps = new Set(["list_students", "student_login", "admin_login"]);

type ReadySession = { id: string; actor_type: "student" | "admin"; student_id: string | null; remembered: boolean; expires_at: string };
type Student = { id: string; name: string; school: string; grade: string; active: boolean };
class ApiError extends Error { constructor(public status: number, message: string, public detail?: unknown) { super(message); } }
function clean(value: unknown, max = 10_000) { return String(value ?? "").trim().slice(0, max); }
function required(value: unknown, name: string, max = 10_000) { const out = clean(value, max); if (!out) throw new ApiError(400, `${name} 값이 필요합니다.`); return out; }
function rows<T>(result: { data: T | null; error: { message: string } | null }): T { if (result.error) throw new ApiError(500, result.error.message); return result.data as T; }

async function studentForSession(session: ReadySession): Promise<Student> {
  const result = await db.from("ready_students").select("id,name,school,grade,active").eq("id", session.student_id).eq("active", true).maybeSingle();
  if (result.error) throw new ApiError(500, result.error.message);
  if (!result.data) {
    await db.from("ready_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", session.id);
    throw new ApiError(401, "사용할 수 없는 학생 계정입니다.");
  }
  return result.data as Student;
}
async function authenticate(req: Request, actor?: "student" | "admin"): Promise<ReadySession> {
  const token = bearerToken(req.headers.get("authorization"));
  if (!token) throw new ApiError(401, "로그인이 필요합니다.");
  const tokenHash = await sha256Hex(token);
  const result = await db.from("ready_sessions").select("id,actor_type,student_id,remembered,expires_at").eq("token_hash", tokenHash).is("revoked_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (result.error) throw new ApiError(500, result.error.message);
  if (!result.data || (actor && result.data.actor_type !== actor)) throw new ApiError(401, "세션이 만료되었거나 권한이 없습니다.");
  const session = result.data as ReadySession;
  if (session.actor_type === "student") await studentForSession(session);
  await db.from("ready_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", session.id);
  return session;
}
async function createSession(actorType: "student" | "admin", studentId: string | null, remember = false) {
  const token = randomSessionToken(), tokenHash = await sha256Hex(token);
  const hours = actorType === "admin" ? 8 : (remember ? 24 * 30 : 12);
  const expiresAt = new Date(Date.now() + hours * 3_600_000).toISOString();
  const result = await db.from("ready_sessions").insert({ token_hash: tokenHash, actor_type: actorType, student_id: studentId, remembered: actorType === "student" && remember, expires_at: expiresAt });
  if (result.error) throw new ApiError(500, result.error.message);
  return { token, expiresAt, remember: actorType === "student" && remember };
}
async function assertLoginAllowed(identifier: string) {
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const result = await db.from("ready_login_attempts").select("id", { count: "exact", head: true }).eq("identifier", identifier).eq("successful", false).gte("created_at", cutoff);
  if (result.error) throw new ApiError(500, result.error.message);
  if ((result.count || 0) >= 5) throw new ApiError(429, "로그인 시도가 너무 많습니다. 15분 뒤 다시 시도해 주세요.");
}
async function recordLogin(identifier: string, successful: boolean) { const result = await db.from("ready_login_attempts").insert({ identifier, successful }); if (result.error) console.error("ready_login_attempts:", result.error.message); }
async function revokeSession(session: ReadySession) { const result = await db.from("ready_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", session.id); if (result.error) throw new ApiError(500, result.error.message); return { loggedOut: true }; }

const ORDER_SCHEMA = { type: "object", additionalProperties: false, required: ["difficulty", "chunks", "correctOrder"], properties: { difficulty: { type: "integer", minimum: 1, maximum: 4 }, chunks: { type: "array", minItems: 2, items: { type: "object", additionalProperties: false, required: ["id", "sentenceIds", "text"], properties: { id: { type: "string" }, sentenceIds: { type: "array", minItems: 1, items: { type: "string" } }, text: { type: "string" } } } }, correctOrder: { type: "array", minItems: 2, items: { type: "string" } } } };
function anthropicOutputSchema(schema: any): any {
  // Raw Messages API schemas do not support all JSON Schema constraints. order-core validates them after parsing.
  if (Array.isArray(schema)) return schema.map(anthropicOutputSchema);
  if (!schema || typeof schema !== "object") return schema;
  const { minimum, maximum, minLength, maxLength, minItems, maxItems, pattern, ...supported } = schema;
  return Object.fromEntries(Object.entries(supported).map(([key, value]) => [key, anthropicOutputSchema(value)]));
}
function orderPrompt(sentences: Array<{ id: string; sentence_index: number; text: string }>, difficulty: number) {
  return `You create one ORDER question for a Korean English academy.
Understand discourse flow (introduction, claim, explanation, example, contrast, cause/effect, result, conclusion) and make semantic chunks. Never split mechanically by equal length.
Level 1: exactly 3 natural semantic chunks when at least 3 sentences exist.
Level 2: 4–5 semantic chunks.
Level 3: small semantic chunks, usually 1–2 sentences.
Level 4: every sentence is one item when practical.
Use every sentence exactly once and keep source order inside every chunk. Never rewrite, paraphrase, correct, add, or omit source text. Chunk text is the included sentence text joined with one space. correctOrder contains chunk IDs in source order.
Requested difficulty: ${difficulty}
Source JSON:
${JSON.stringify(sentences)}`;
}
async function generateWithAnthropic(prompt: string) {
  const key = Deno.env.get("ANTHROPIC_API_KEY"), model = Deno.env.get("READY_AI_MODEL");
  if (!key || !model) throw new ApiError(503, "ANTHROPIC_API_KEY와 READY_AI_MODEL을 설정해 주세요.");
  const response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model, max_tokens: 5000, messages: [{ role: "user", content: prompt }], output_config: { format: { type: "json_schema", schema: anthropicOutputSchema(ORDER_SCHEMA) } } }) });
  const data = await response.json();
  if (!response.ok) throw new ApiError(502, data?.error?.message || "AI 요청에 실패했습니다.");
  try { return JSON.parse(data?.content?.find((item: any) => item.type === "text")?.text); } catch { throw new ApiError(502, "AI JSON을 읽지 못했습니다."); }
}
async function generateWithOpenAI(prompt: string) {
  const key = Deno.env.get("OPENAI_API_KEY"), model = Deno.env.get("READY_AI_MODEL");
  if (!key || !model) throw new ApiError(503, "OPENAI_API_KEY와 READY_AI_MODEL을 설정해 주세요.");
  const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ model, input: prompt, store: false, max_output_tokens: 5000, text: { format: { type: "json_schema", name: "ready_order", strict: true, schema: ORDER_SCHEMA } } }) });
  const data = await response.json();
  if (!response.ok) throw new ApiError(502, data?.error?.message || "AI 요청에 실패했습니다.");
  const text = data?.output_text || data?.output?.flatMap((item: any) => item.content || []).find((item: any) => item.type === "output_text")?.text;
  try { return JSON.parse(text); } catch { throw new ApiError(502, "AI JSON을 읽지 못했습니다."); }
}
async function generateOrder(sentences: any[], difficulty: number) {
  const provider = (Deno.env.get("READY_AI_PROVIDER") || "openai").toLowerCase(), prompt = orderPrompt(sentences, difficulty);
  const raw = provider === "anthropic" ? await generateWithAnthropic(prompt) : provider === "openai" ? await generateWithOpenAI(prompt) : (() => { throw new ApiError(503, `지원하지 않는 READY_AI_PROVIDER: ${provider}`); })();
  try { return validateGeneratedOrder(raw, sentences, difficulty); } catch (error) { throw new ApiError(502, `AI 결과 검증 실패: ${error instanceof Error ? error.message : error}`); }
}

async function listStudents() { return { students: rows(await db.from("ready_students").select("id,name").eq("active", true).not("pin_hash", "is", null).order("school").order("grade").order("sort_order").order("name")) }; }
async function studentLogin(body: any) {
  const studentId = required(body.studentId, "학생", 80), pin = clean(body.pin, 10);
  if (!validPin(pin)) throw new ApiError(400, "PIN은 숫자 4~6자리입니다.");
  const identifier = `student:${studentId}`; await assertLoginAllowed(identifier);
  const verified = await db.rpc("ready_verify_student_pin", { p_student_id: studentId, p_pin: pin });
  if (verified.error) throw new ApiError(500, verified.error.message);
  const ok = verified.data === true; await recordLogin(identifier, ok); if (!ok) throw new ApiError(401, "PIN이 맞지 않습니다.");
  const student = rows<any>(await db.from("ready_students").select("id,name,school,grade").eq("id", studentId).eq("active", true).single());
  return { session: await createSession("student", student.id, body.remember === true), student };
}
async function adminLogin(body: any) {
  const expected = Deno.env.get("READY_ADMIN_PASSWORD") || ""; if (!expected) throw new ApiError(503, "READY_ADMIN_PASSWORD가 서버에 설정되지 않았습니다.");
  await assertLoginAllowed("admin"); const supplied = String(body.password ?? "").slice(0, 200), ok = supplied.length > 0 && secureEqual(supplied, expected);
  await recordLogin("admin", ok); if (!ok) throw new ApiError(401, "관리자 비밀번호가 맞지 않습니다.");
  return { session: await createSession("admin", null, false) };
}
async function createStudent(body: any) {
  const name = required(body.name, "학생 이름", 40), school = required(body.school, "학교", 80), grade = required(body.grade, "학년", 40), pin = clean(body.pin, 10);
  if (!validPin(pin)) throw new ApiError(400, "PIN은 숫자 4~6자리여야 합니다.");
  const existing = rows<any[]>(await db.from("ready_students").select("sort_order").eq("school", school).eq("grade", grade).order("sort_order", { ascending: false }).limit(1));
  const result = await db.rpc("ready_create_student", { p_name: name, p_school: school, p_grade: grade, p_pin: pin, p_sort_order: Number(existing[0]?.sort_order ?? -1) + 1 });
  return { student: rows<any[]>(result)[0] };
}
async function setStudentPin(body: any) { const studentId = required(body.studentId, "학생", 80), pin = clean(body.pin, 10); if (!validPin(pin)) throw new ApiError(400, "PIN은 숫자 4~6자리여야 합니다."); const result = await db.rpc("ready_set_student_pin", { p_student_id: studentId, p_pin: pin }); if (result.error) throw new ApiError(500, result.error.message); return { updated: studentId }; }
async function setStudentActive(body: any) {
  const studentId = required(body.studentId, "학생", 80), active = body.active === true;
  const student = rows<any>(await db.from("ready_students").update({ active }).eq("id", studentId).select("id,name,school,grade,sort_order,active").single());
  if (!active) await db.from("ready_sessions").update({ revoked_at: new Date().toISOString() }).eq("actor_type", "student").eq("student_id", studentId).is("revoked_at", null);
  return { student };
}
async function deleteStudent(body: any) {
  const studentId = required(body.studentId, "학생", 80);
  if (clean(body.confirmation, 10) !== "DELETE") throw new ApiError(400, "DELETE를 정확히 입력해 주세요.");
  const attempts = await db.from("ready_attempts").select("id", { count: "exact", head: true }).eq("student_id", studentId);
  if (attempts.error) throw new ApiError(500, attempts.error.message);
  if ((attempts.count || 0) > 0) throw new ApiError(409, `학습기록 ${attempts.count}건 때문에 삭제할 수 없습니다.`, { attempts: attempts.count });
  const result = await db.from("ready_students").delete().eq("id", studentId).select("id").maybeSingle();
  if (result.error) throw new ApiError(500, result.error.message);
  if (!result.data) throw new ApiError(404, "학생을 찾지 못했습니다.");
  return { deleted: studentId };
}

async function teacherBootstrap() {
  const [students, exams, passages, sentences, questions, attempts] = await Promise.all([
    db.from("ready_students").select("id,name,school,grade,sort_order,active,created_at").order("school").order("grade").order("sort_order").order("name"), db.from("ready_exams").select("*").order("created_at", { ascending: false }), db.from("ready_passages").select("*").order("position").order("created_at"), db.from("ready_passage_sentences").select("*").order("sentence_index"), db.from("ready_questions").select("*").order("created_at"), db.from("ready_attempts").select("*").order("created_at", { ascending: false }),
  ]);
  return { students: rows(students), exams: rows(exams), passages: rows(passages), sentences: rows(sentences), questions: rows(questions), attempts: rows(attempts) };
}
async function createExam(body: any) { return { exam: rows(await db.from("ready_exams").insert({ school: required(body.school, "학교", 80), grade: required(body.grade, "학년", 40), title: required(body.title, "시험명", 120), description: clean(body.description, 500) }).select().single()) }; }
async function createPassage(body: any) {
  const examId = required(body.examId, "Exam", 80), sourceText = required(body.sourceText, "영어 지문", 30_000), pieces = splitSentences(sourceText);
  if (pieces.length < 2) throw new ApiError(400, "ORDER 문제에는 문장이 2개 이상 필요합니다."); if (pieces.length > 80) throw new ApiError(400, "한 지문은 80문장 이하로 나눠 주세요.");
  const exam = await db.from("ready_exams").select("id").eq("id", examId).maybeSingle(); if (exam.error || !exam.data) throw new ApiError(404, "Exam을 찾지 못했습니다.");
  const current = rows<any[]>(await db.from("ready_passages").select("position").eq("exam_id", examId).order("position", { ascending: false }).limit(1));
  const passage = rows<any>(await db.from("ready_passages").insert({ exam_id: examId, study_set_id: null, title: required(body.title, "지문 제목", 120), source_text: sourceText, position: Number(current[0]?.position ?? -1) + 1 }).select().single());
  const sentenceResult = await db.from("ready_passage_sentences").insert(pieces.map((text, sentence_index) => ({ passage_id: passage.id, sentence_index, text }))).select().order("sentence_index");
  return { passage, sentences: rows(sentenceResult) };
}
async function questionHasAttempts(questionId: string) { const result = await db.from("ready_attempts").select("id", { count: "exact", head: true }).eq("question_id", questionId); if (result.error) throw new ApiError(500, result.error.message); return (result.count || 0) > 0; }
async function generateOrderQuestion(body: any) {
  const passageId = required(body.passageId, "지문", 80), difficulty = Number(body.difficulty); if (![1, 2, 3, 4].includes(difficulty)) throw new ApiError(400, "난이도는 1–4입니다.");
  const sentences = rows<any[]>(await db.from("ready_passage_sentences").select("id,sentence_index,text").eq("passage_id", passageId).order("sentence_index")); if (sentences.length < 2) throw new ApiError(400, "문장이 부족합니다.");
  const previousId = clean(body.replaceQuestionId, 80); let generation = 1;
  if (previousId) { if (await questionHasAttempts(previousId)) throw new ApiError(409, "풀이 기록이 있는 문제는 교체할 수 없습니다. 새 문제를 생성해 주세요."); const old = await db.from("ready_questions").select("generation").eq("id", previousId).maybeSingle(); if (old.error) throw new ApiError(500, old.error.message); generation = Number(old.data?.generation || 0) + 1; }
  const question = rows<any>(await db.from("ready_questions").insert({ passage_id: passageId, type: "order", difficulty, payload: await generateOrder(sentences, difficulty), status: "draft", generation }).select().single());
  if (previousId) { const removed = await db.from("ready_questions").delete().eq("id", previousId); if (removed.error) throw new ApiError(500, removed.error.message); }
  return { question };
}
async function updateQuestion(body: any) {
  const questionId = required(body.questionId, "문제", 80); if (await questionHasAttempts(questionId)) throw new ApiError(409, "풀이 기록이 있는 문제는 수정할 수 없습니다.");
  let payload; try { payload = validateTeacherOrder(body.payload); } catch (error) { throw new ApiError(400, error instanceof Error ? error.message : "문제 형식이 올바르지 않습니다."); }
  return { question: rows(await db.from("ready_questions").update({ payload, difficulty: payload.difficulty, updated_at: new Date().toISOString() }).eq("id", questionId).eq("type", "order").select().single()) };
}
async function setQuestionStatus(body: any) { const questionId = required(body.questionId, "문제", 80), status = body.status === "available" ? "available" : "draft"; return { question: rows(await db.from("ready_questions").update({ status, updated_at: new Date().toISOString() }).eq("id", questionId).select().single()) }; }
async function deleteQuestion(body: any) { const questionId = required(body.questionId, "문제", 80); if (await questionHasAttempts(questionId)) throw new ApiError(409, "풀이 기록이 있는 문제는 삭제할 수 없습니다."); const result = await db.from("ready_questions").delete().eq("id", questionId); if (result.error) throw new ApiError(500, result.error.message); return { deleted: questionId }; }

async function studentExamAccess(examId: string, student: Student) {
  const result = await db.from("ready_exams").select("id,school,grade,title,description").eq("id", examId).eq("school", student.school).eq("grade", student.grade).maybeSingle();
  if (result.error) throw new ApiError(500, result.error.message); if (!result.data) throw new ApiError(404, "이 학생이 접근할 수 없는 Exam입니다."); return result.data as any;
}
function summary(attempts: any[]) { return { completed: new Set(attempts.map(item => item.question_id)).size, attempts: attempts.length, accuracy: attempts.length ? Math.round(attempts.filter(item => item.correct).length / attempts.length * 100) : 0 }; }
async function availableExamQuestions(examId: string) {
  const links = rows<any[]>(await db.from("ready_exam_passages").select("passage_id,position").eq("exam_id", examId).order("position"));
  const linkedIds = links.map(item => item.passage_id);
  const sourcePassages = linkedIds.length ? rows<any[]>(await db.from("ready_passages").select("id,title,display_order").in("id", linkedIds)) : [];
  const byId = new Map(sourcePassages.map(item => [item.id, item]));
  const passages = links.map(link => ({ ...byId.get(link.passage_id), position: link.position })).filter(item => item.id);
  const ids = passages.map(item => item.id), questions = ids.length ? rows<any[]>(await db.from("ready_questions").select("id,passage_id,type,difficulty,payload,status").in("passage_id", ids).eq("status", "available").order("created_at")) : [];
  return { passages, questions };
}
async function studentBootstrap(session: ReadySession) {
  const student = await studentForSession(session), exams = rows<any[]>(await db.from("ready_exams").select("id,school,grade,title,description,created_at").eq("school", student.school).eq("grade", student.grade).order("created_at", { ascending: false }));
  const examIds = exams.map(item => item.id), links = examIds.length ? rows<any[]>(await db.from("ready_exam_passages").select("exam_id,passage_id").in("exam_id", examIds)) : [], passageIds = [...new Set(links.map(item => item.passage_id))], questions = passageIds.length ? rows<any[]>(await db.from("ready_questions").select("id,passage_id").in("passage_id", passageIds).eq("status", "available")) : [];
  return { student: { id: student.id, name: student.name, school: student.school, grade: student.grade }, exams: exams.map(exam => { const ids = new Set(links.filter(link => link.exam_id === exam.id).map(link => link.passage_id)); return { ...exam, passageCount: ids.size, questionCount: questions.filter(question => ids.has(question.passage_id)).length }; }) };
}
async function studentExam(body: any, session: ReadySession) {
  const student = await studentForSession(session), examId = required(body.examId, "Exam", 80), exam = await studentExamAccess(examId, student), { passages, questions } = await availableExamQuestions(examId), questionIds = questions.map(item => item.id), attempts = questionIds.length ? rows<any[]>(await db.from("ready_attempts").select("question_id,correct,created_at").eq("student_id", student.id).in("question_id", questionIds)) : [];
  const wrong = new Map<string, number>(); for (const attempt of attempts) if (!attempt.correct) wrong.set(attempt.question_id, (wrong.get(attempt.question_id) || 0) + 1);
  return { exam, passages: passages.map(passage => { const ids = new Set(questions.filter(question => question.passage_id === passage.id).map(item => item.id)); return { ...passage, total: ids.size, ...summary(attempts.filter(item => ids.has(item.question_id))) }; }), types: [...new Set(questions.map(item => item.type))].map(type => { const ids = new Set(questions.filter(item => item.type === type).map(item => item.id)); return { type, total: ids.size, ...summary(attempts.filter(item => ids.has(item.question_id))) }; }), wrong: [...wrong.entries()].map(([questionId, wrongCount]) => { const question = questions.find(item => item.id === questionId), passage = passages.find(item => item.id === question?.passage_id); return { questionId, passageId: question?.passage_id, passageTitle: passage?.title || "Passage", type: question?.type, difficulty: question?.difficulty, wrongCount }; }).sort((a, b) => b.wrongCount - a.wrongCount) };
}
async function studentQuestions(body: any, session: ReadySession) {
  const student = await studentForSession(session), examId = required(body.examId, "Exam", 80); await studentExamAccess(examId, student);
  const { passages, questions } = await availableExamQuestions(examId), mode = clean(body.mode, 20); let selected = questions;
  if (mode === "passage") { const passageId = required(body.passageId, "지문", 80); if (!passages.some(passage => passage.id === passageId)) throw new ApiError(404, "이 Exam에 없는 지문입니다."); selected = questions.filter(question => question.passage_id === passageId); }
  else if (mode === "type") { const type = required(body.type, "문제 유형", 40); selected = questions.filter(question => question.type === type); }
  else if (mode === "wrong") { const ids = questions.map(question => question.id), attempts = ids.length ? rows<any[]>(await db.from("ready_attempts").select("question_id,correct").eq("student_id", student.id).in("question_id", ids)) : [], wrongIds = new Set(attempts.filter(item => !item.correct).map(item => item.question_id)); selected = questions.filter(question => wrongIds.has(question.id)); }
  else throw new ApiError(400, "문제 목록을 선택해 주세요.");
  const passageNames = new Map(passages.map(passage => [passage.id, passage.title]));
  return { questions: selected.map(question => ({ id: question.id, type: question.type, difficulty: question.difficulty, passageTitle: passageNames.get(question.passage_id) || "Passage", items: shuffled(question.payload.chunks).map((chunk: any) => ({ id: chunk.id, text: chunk.text })) })) };
}
async function submitAttempt(body: any, session: ReadySession) {
  const student = await studentForSession(session), questionId = required(body.questionId, "문제", 80), question = rows<any>(await db.from("ready_questions").select("id,type,payload,status,passage_id").eq("id", questionId).maybeSingle());
  if (!question || question.status !== "available") throw new ApiError(404, "현재 풀 수 없는 문제입니다.");
  const passage = rows<any>(await db.from("ready_passages").select("exam_id").eq("id", question.passage_id).maybeSingle()); if (!passage) throw new ApiError(404, "지문을 찾지 못했습니다.");
  const examId = clean(body.examId, 80) || clean(passage.exam_id, 80);
  const link = await db.from("ready_exam_passages").select("exam_id").eq("exam_id", examId).eq("passage_id", question.passage_id).maybeSingle();
  if (link.error || !link.data) throw new ApiError(404, "이 Exam에 없는 문제입니다.");
  await studentExamAccess(examId, student);
  if (question.type !== "order") throw new ApiError(400, "현재는 ORDER 문제만 채점합니다.");
  const order = Array.isArray(body.order) ? body.order.map((id: unknown) => clean(id, 100)) : [], correctOrder = question.payload.correctOrder.map(String);
  if (JSON.stringify([...order].sort()) !== JSON.stringify([...correctOrder].sort())) throw new ApiError(400, "응답 항목이 문제와 일치하지 않습니다.");
  const elapsed_ms = Math.max(0, Math.min(86_400_000, Math.round(Number(body.elapsedMs) || 0)));
  const result = await db.from("ready_attempts").insert({ student_id: student.id, exam_id: examId, question_id: questionId, response: { type: "order", order }, correct: isCorrectOrder(order, correctOrder), elapsed_ms }).select("id,correct,created_at").single();
  return { attempt: rows(result) };
}

async function dispatch(op: string, body: any, session: ReadySession | null) {
  switch (op) {
    case "list_students": return listStudents(); case "student_login": return studentLogin(body); case "admin_login": return adminLogin(body); case "logout": return revokeSession(session as ReadySession);
    case "teacher_bootstrap": return teacherBootstrap(); case "create_student": return createStudent(body); case "set_student_pin": return setStudentPin(body); case "set_student_active": return setStudentActive(body); case "delete_student": return deleteStudent(body);
    case "create_exam": return createExam(body); case "create_passage": return createPassage(body); case "generate_order": return generateOrderQuestion(body); case "update_question": return updateQuestion(body); case "set_question_status": return setQuestionStatus(body); case "delete_question": return deleteQuestion(body);
    case "student_bootstrap": return studentBootstrap(session as ReadySession); case "student_exam": return studentExam(body, session as ReadySession); case "student_questions": return studentQuestions(body, session as ReadySession); case "submit_attempt": return submitAttempt(body, session as ReadySession);
    default: throw new ApiError(404, "알 수 없는 READY 작업입니다.");
  }
}
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS }); if (req.method !== "POST") return json({ error: "POST만 받습니다." }, 405);
  try { const body = await req.json(), op = clean(body?.op, 60); let session: ReadySession | null = null; if (adminOps.has(op)) session = await authenticate(req, "admin"); else if (studentOps.has(op)) session = await authenticate(req, "student"); else if (op === "logout") session = await authenticate(req); else if (!publicOps.has(op)) throw new ApiError(404, "알 수 없는 READY 작업입니다."); return json(await dispatch(op, body, session)); }
  catch (error) { console.error(error); return error instanceof ApiError ? json({ error: error.message, detail: error.detail }, error.status) : json({ error: "READY 서버에서 요청을 처리하지 못했습니다." }, 500); }
});
