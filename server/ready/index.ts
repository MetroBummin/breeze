// READY — fixed Scope > Passage Reader
// Custom opaque sessions are validated here. Deploy this Edge Function with JWT verification disabled.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { bearerToken, randomSessionToken, secureEqual, sha256Hex, validPin } from "./auth-core.mjs";
import { lemma, tokenizeSentence } from "./lexical-core.mjs";

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
const adminOps = new Set(["teacher_bootstrap", "delete_impact", "assign_scope_passages", "set_scope_passages", "create_passage", "update_passage", "delete_passage", "create_student", "set_student_pin", "delete_student", "import_questions"]);
const studentOps = new Set(["student_bootstrap", "student_passage", "student_questions", "student_review_questions", "submit_attempt"]);
const publicOps = new Set(["list_students", "student_login", "admin_login"]);
// Match Breeze's free Gemini dictionary defaults. The API key remains a
// Supabase Edge Function Secret and is never part of any public response.
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const AI_DAILY_LIMIT = Math.max(1, Math.min(1_000, Number(Deno.env.get("AI_DAILY_LIMIT") ?? 100)));
const GEMINI_SYSTEM = "You are a precise bilingual dictionary for Korean learners reading English books. Reply with ONLY minified JSON. No markdown, no code fence, no commentary.";

type ReadySession = { id: string; actor_type: "student" | "admin"; student_id: string | null; remembered: boolean; expires_at: string };
type Student = { id: string; name: string; school: string; grade: string };
class ApiError extends Error { constructor(public status: number, message: string, public detail?: unknown) { super(message); } }
function clean(value: unknown, max = 10_000) { return String(value ?? "").trim().slice(0, max); }
function required(value: unknown, name: string, max = 10_000) { const out = clean(value, max); if (!out) throw new ApiError(400, `${name} 값이 필요합니다.`); return out; }
function rows<T>(result: { data: T | null; error: { message: string } | null }): T { if (result.error) throw new ApiError(500, result.error.message); return result.data as T; }
function cleanList(value: unknown, count: number, max: number) { return (Array.isArray(value) ? value : []).map(item => clean(item, max)).filter(Boolean).slice(0, count); }
function parseJson(raw: string) { try { return JSON.parse(raw); } catch { /* Gemini occasionally adds a wrapper despite JSON mode. */ } const found = raw.match(/\{[\s\S]*\}/); if (!found) return null; try { return JSON.parse(found[0]); } catch { return null; } }

function geminiLookPrompt(word: string, clicked: string, sentence: string) {
  const form = clicked && clicked.toLowerCase() !== word.toLowerCase() ? `단어: ${word} (문장에서는 "${clicked}")` : `단어: ${word}`;
  return `${form}
문장: ${sentence || "(문장 없음 — 일반적인 뜻으로 답하세요)"}

이 문장에서 이 단어가 어떤 뜻으로 쓰였는지 판단하세요.

- lemma: 사전 표제어(원형). 고유명사나 약어면 그대로
- pos: 명사|동사|형용사|부사|전치사|기타 중 하나
- ko: 이 문장에서의 뜻. 한국어 8자 내외의 짧은 사전식 뜻
- note: 이 문장에서 어떻게 쓰였는지 한국어 한 문장으로 설명
- phrase: 클릭한 단어를 포함한 아주 확실한 고정 표현 하나만. 없으면 빈 문자열
- alts: 지금 문맥의 뜻과 겹치지 않는 흔한 다른 한국어 뜻을 최대 3개

{"lemma":"","pos":"","ko":"","note":"","phrase":"","alts":[""]}`;
}

async function callGeminiLook(word: string, clicked: string, sentence: string) {
  const provider = (Deno.env.get("AI_PROVIDER") ?? "").trim().toLowerCase();
  const key = Deno.env.get("GEMINI_API_KEY");
  if (provider !== "gemini" || !key) throw new ApiError(503, "Gemini 사전이 아직 연결되지 않았습니다.");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  // Breeze intentionally requests JSON mode without responseSchema: Gemini's
  // OpenAPI-schema subset differs between models, while this prompt is stable.
  const base = { maxOutputTokens: 450, temperature: 0.2, responseMimeType: "application/json" };
  let lastError = "";
  // This is the same compatibility fallback Breeze uses for Gemini models
  // that do not yet accept thinkingConfig.
  for (const generationConfig of [{ ...base, thinkingConfig: { thinkingBudget: 0 } }, base]) {
    const response = await fetch(url, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ system_instruction: { parts: [{ text: GEMINI_SYSTEM }] }, contents: [{ role: "user", parts: [{ text: geminiLookPrompt(word, clicked, sentence) }] }], generationConfig }),
    });
    if (response.ok) {
      const payload = await response.json();
      const text = (payload?.candidates?.[0]?.content?.parts || []).map((part: { text?: string }) => part?.text || "").join("").trim();
      const parsed = parseJson(text);
      if (parsed && clean(parsed.ko, 60)) return parsed;
      throw new ApiError(502, "Gemini가 단어 뜻을 읽지 못했습니다.");
    }
    lastError = (await response.text()).slice(0, 300);
    if (response.status !== 400) break;
  }
  console.error("READY Gemini lookup failed:", lastError);
  throw new ApiError(502, "Gemini 단어 사전을 잠시 사용할 수 없습니다.");
}

async function studentForSession(session: ReadySession): Promise<Student> {
  const result = await db.from("ready_students").select("id,name,school,grade").eq("id", session.student_id).eq("active", true).maybeSingle();
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

async function listStudents() { return { students: rows(await db.from("ready_students").select("id,name").eq("active", true).not("pin_hash", "is", null).order("school").order("grade").order("name")) }; }
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
  const result = await db.rpc("ready_create_student", { p_name: name, p_school: school, p_grade: grade, p_pin: pin, p_sort_order: 0 });
  return { student: rows<any[]>(result)[0] };
}
async function setStudentPin(body: any) { const studentId = required(body.studentId, "학생", 80), pin = clean(body.pin, 10); if (!validPin(pin)) throw new ApiError(400, "PIN은 숫자 4~6자리여야 합니다."); const result = await db.rpc("ready_set_student_pin", { p_student_id: studentId, p_pin: pin }); if (result.error) throw new ApiError(500, result.error.message); return { updated: studentId }; }
async function countWhere(table: string, column: string, value: string) {
  const result = await db.from(table).select("*", { count: "exact", head: true }).eq(column, value);
  if (result.error) throw new ApiError(500, result.error.message);
  return result.count || 0;
}
async function deleteImpact(body: any) {
  const targetType = clean(body.targetType, 20), targetId = required(body.targetId, "삭제 대상", 80);
  if (targetType === "student") {
    const student = await db.from("ready_students").select("id,name").eq("id", targetId).maybeSingle();
    if (student.error) throw new ApiError(500, student.error.message); if (!student.data) throw new ApiError(404, "학생을 찾지 못했습니다.");
    const [attempts, savedWords, savedSentences, wordLookups, translationViews] = await Promise.all([
      countWhere("ready_attempts", "student_id", targetId), countWhere("ready_saved_words", "student_id", targetId),
      countWhere("ready_saved_sentences", "student_id", targetId), countWhere("ready_word_lookup_events", "student_id", targetId),
      countWhere("ready_sentence_translation_view_events", "student_id", targetId),
    ]);
    const counts = { attempts, savedWords, savedSentences, wordLookups, translationViews };
    return { targetType, targetId, label: student.data.name, counts };
  }
  if (targetType === "passage") {
    const passage = await db.from("ready_passages").select("id,title").eq("id", targetId).maybeSingle();
    if (passage.error) throw new ApiError(500, passage.error.message); if (!passage.data) throw new ApiError(404, "지문을 찾지 못했습니다.");
    const questions = rows<any[]>(await db.from("ready_questions").select("id").eq("passage_id", targetId)), questionIds = questions.map(item => item.id);
    const attempts = questionIds.length ? rows<any[]>(await db.from("ready_attempts").select("id").in("question_id", questionIds)).length : 0;
    const [sentences, examLinks, savedWords, savedSentences, wordLookups, translationViews] = await Promise.all([
      countWhere("ready_passage_sentences", "passage_id", targetId),countWhere("ready_exam_passages", "passage_id", targetId),
      countWhere("ready_saved_words", "passage_id", targetId), countWhere("ready_saved_sentences", "passage_id", targetId),
      countWhere("ready_word_lookup_events", "passage_id", targetId), countWhere("ready_sentence_translation_view_events", "passage_id", targetId),
    ]);
    const counts = { sentences, questions: questions.length, examLinks, attempts, savedWords, savedSentences, wordLookups, translationViews };
    return { targetType, targetId, label: passage.data.title, counts };
  }
  throw new ApiError(400, "삭제 대상 종류가 올바르지 않습니다.");
}
async function deleteStudent(body: any) {
  const studentId = required(body.studentId, "학생", 80), result = await db.rpc("ready_delete_student_cascade", { p_student_id: studentId });
  if (result.error) throw new ApiError(500, result.error.message); return { deleted: studentId };
}

async function teacherBootstrap() {
  const [students, exams, passages, examPassages] = await Promise.all([
    db.from("ready_students").select("id,name,school,grade,created_at").order("school").order("grade").order("name"), db.from("ready_exams").select("id,school,grade,title,is_current").eq("is_current", true).order("school").order("grade"), db.from("ready_passages").select("id,title,source_type,grade,source_year,source_month,source_label,created_at,updated_at").order("display_order").order("created_at"), db.from("ready_exam_passages").select("exam_id,passage_id,position").order("position"),
  ]);
  return { students: rows(students), exams: rows(exams), passages: rows(passages), examPassages: rows(examPassages) };
}
function ids(value: unknown) { return Array.isArray(value) ? [...new Set(value.map(item => clean(item, 80)).filter(Boolean))] : []; }
async function setScopePassages(body: any, replace: boolean) {
  const passageIds = ids(body.passageIds), school = required(body.school, "학교", 80), grade = required(body.grade, "학년", 40);
  if (!replace && !passageIds.length) throw new ApiError(400, "배정할 지문을 하나 이상 선택해 주세요.");
  const result = await db.rpc("ready_set_current_scope_passages", { p_school: school, p_grade: grade, p_passage_ids: passageIds, p_replace: replace });
  if (result.error) throw new ApiError(400, result.error.message); return { scopeId: result.data as string };
}
async function createPassage(body: any) {
  if (!Array.isArray(body.sentenceRows)) throw new ApiError(400, "영어와 한국어 2열 rows가 필요합니다.");
  if (body.sentenceRows.length < 1 || body.sentenceRows.length > 80) throw new ApiError(400, "한 지문은 1~80행이어야 합니다.");
  const structuredRows = body.sentenceRows.map((row: any, index: number) => {
    const text = clean(row?.text, 5001), translation = clean(row?.translation, 5001);
    if (!text) throw new ApiError(400, `${index + 1}번 행의 영어 문장이 비어 있습니다.`);
    if (!translation) throw new ApiError(400, `${index + 1}번 행의 한국어 해석이 비어 있습니다.`);
    if (text.length > 5000 || translation.length > 5000) throw new ApiError(400, `${index + 1}번 행이 너무 깁니다.`);
    return { text, translation };
  });
  const sourceType = body.sourceType === "MOCK_EXAM" ? "MOCK_EXAM" : "TEXTBOOK", title = required(body.title, "지문 제목", 120), grade = required(body.grade, "학년", 40), sourceYear = body.sourceYear ? Math.round(Number(body.sourceYear)) : null, sourceMonth = body.sourceMonth ? Math.round(Number(body.sourceMonth)) : null;
  if (sourceType === "MOCK_EXAM" && (!sourceYear || !sourceMonth)) throw new ApiError(400, "모의고사는 연도와 월이 필요합니다.");
  const passageId = rows<string>(await db.rpc("ready_create_passage_with_sentences", { p_title: title, p_source_type: sourceType, p_grade: grade, p_source_year: sourceYear, p_source_month: sourceMonth, p_source_label: clean(body.sourceLabel, 120), p_rows: structuredRows }));
  return { passageId };
}
async function updatePassage(body: any) {
  const passageId = required(body.passageId, "지문", 80), sourceType = body.sourceType === "MOCK_EXAM" ? "MOCK_EXAM" : "TEXTBOOK", sourceYear = body.sourceYear ? Math.round(Number(body.sourceYear)) : null, sourceMonth = body.sourceMonth ? Math.round(Number(body.sourceMonth)) : null;
  if (sourceType === "MOCK_EXAM" && (!sourceYear || !sourceMonth)) throw new ApiError(400, "모의고사는 연도와 월이 필요합니다.");
  const patch = { title: required(body.title, "지문 제목", 120), source_type: sourceType, grade: required(body.grade, "학년", 40), source_year: sourceYear, source_month: sourceMonth };
  return { passage: rows(await db.from("ready_passages").update(patch).eq("id", passageId).select().single()) };
}
async function deletePassage(body: any) {
  const passageId = required(body.passageId, "지문", 80), result = await db.rpc("ready_delete_passage_cascade", { p_passage_id: passageId });
  if (result.error) throw new ApiError(500, result.error.message); return { deleted: passageId };
}
async function importQuestions(body: any) {
  if (!Array.isArray(body.questions)) throw new ApiError(400, "검증된 Question 배열이 필요합니다.");
  const result = await db.rpc("ready_import_question_bundle", { p_questions: body.questions });
  if (result.error) throw new ApiError(400, result.error.message);
  return { imported: Number(result.data) || 0 };
}
async function studentExamAccess(examId: string, student: Student) {
  const result = await db.from("ready_exams").select("id").eq("id", examId).eq("school", student.school).eq("grade", student.grade).eq("is_current", true).maybeSingle();
  if (result.error) throw new ApiError(500, result.error.message); if (!result.data) throw new ApiError(404, "현재 배정된 시험범위가 아닙니다."); return result.data as any;
}
async function scopePassages(examId: string) {
  const links = rows<any[]>(await db.from("ready_exam_passages").select("passage_id,position").eq("exam_id", examId).order("position"));
  const linkedIds = links.map(item => item.passage_id);
  const sourcePassages = linkedIds.length ? rows<any[]>(await db.from("ready_passages").select("id,title,source_type,source_label").in("id", linkedIds)) : [];
  const availableQuestions = linkedIds.length ? rows<any[]>(await db.from("ready_questions").select("passage_id").in("passage_id", linkedIds).in("type", ["multiple_choice", "written_response"]).eq("status", "available")) : [];
  const questionCounts = new Map<string, number>();
  availableQuestions.forEach(question => questionCounts.set(question.passage_id, (questionCounts.get(question.passage_id) || 0) + 1));
  const byId = new Map(sourcePassages.map(item => [item.id, item]));
  const passages = links.map(link => ({ ...byId.get(link.passage_id), position: link.position, question_count: questionCounts.get(link.passage_id) || 0 })).filter(item => item.id);
  return passages;
}
async function studentBootstrap(session: ReadySession) {
  const student = await studentForSession(session), scope = rows<any>(await db.from("ready_exams").select("id,school,grade").eq("school", student.school).eq("grade", student.grade).eq("is_current", true).maybeSingle());
  const passages = scope ? await scopePassages(scope.id) : [];
  const reviewCount = scope ? (await unresolvedQuestionIds(student.id, scope.id)).length : 0;
  return { student: { id: student.id, school: student.school, grade: student.grade }, scope, passages, reviewCount };
}
async function studentPassageAccess(examId: string, passageId: string, student: Student) { await studentExamAccess(examId, student); const linked = await db.from("ready_exam_passages").select("passage_id").eq("exam_id", examId).eq("passage_id", passageId).maybeSingle(); if (linked.error) throw new ApiError(500, linked.error.message); if (!linked.data) throw new ApiError(404, "현재 시험범위에 없는 지문입니다."); return rows<any>(await db.from("ready_passages").select("id,title,updated_at").eq("id", passageId).single()); }
async function studentPassage(body: any, session: ReadySession) {
  const student=await studentForSession(session),examId=required(body.examId,"Exam",80),passageId=required(body.passageId,"지문",80),passage=await studentPassageAccess(examId,passageId,student);
  const sentences=await db.from("ready_passage_sentences").select("id,sentence_index,text").eq("passage_id",passageId).order("sentence_index");
  return {passage,sentences:rows<any[]>(sentences)};
}
function answerIndexes(value: unknown, choiceCount: number) {
  if (!Array.isArray(value)) throw new ApiError(500, "문제 정답 형식이 올바르지 않습니다.");
  const indexes = [...new Set(value.map(item => Number(item)).filter(item => Number.isInteger(item) && item >= 0 && item < choiceCount))].sort((a, b) => a - b);
  if (!indexes.length || indexes.length !== value.length) throw new ApiError(500, "문제 정답 형식이 올바르지 않습니다.");
  return indexes;
}
function publicSegments(value: unknown) {
  return (Array.isArray(value) ? value : []).slice(0, 500).map((segment: any) => ({ text: clean(segment?.text, 5_000), kind: clean(segment?.kind, 20), label: clean(segment?.label, 20) }));
}
function publicBlocks(value: unknown) {
  return (Array.isArray(value) ? value : []).slice(0, 80).map((block: any) => ({ kind: clean(block?.kind, 20), label: clean(block?.label, 80), text: clean(block?.text, 10_000), url: clean(block?.url, 2_000), alt: clean(block?.alt, 200), caption: clean(block?.caption, 500), segments: publicSegments(block?.segments) }));
}
function inlineOptionGroups(value: unknown) {
  const text = clean(value, 30_000), groups: Array<{label:string,options:string[]}> = [];
  for (const match of text.matchAll(/([ⓐ-ⓩ]|\([A-H]\))\s*\[([^\]]+)\]/g)) {
    const options = match[2].split("/").map(option => clean(option, 100)).filter(Boolean);
    if (options.length >= 2 && options.length <= 4) groups.push({ label: match[1], options });
  }
  return groups.length && groups.length <= 8 ? groups : [];
}
function publicTargetRanges(value: unknown) {
  return (Array.isArray(value) ? value : []).slice(0, 8).map((target: any) => ({ label: clean(target?.label, 20), text: clean(target?.text, 200) })).filter(target => target.label && target.text);
}
function normalizedCombination(value: unknown) { return clean(value, 1_000).normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
function inlineAnswer(payload: any, choiceCount: number) {
  const groups = inlineOptionGroups(payload?.variant_text), answer = answerIndexes(payload?.answer, choiceCount);
  if (!groups.length || answer.length !== 1) return [];
  const expected = normalizedCombination(payload?.choices?.[answer[0]]), selected: number[] = [];
  function visit(index: number, parts: string[]): boolean {
    if (index === groups.length) return normalizedCombination(parts.join(" ")) === expected;
    for (let option = 0; option < groups[index].options.length; option += 1) {
      if (visit(index + 1, [...parts, groups[index].options[option]])) { selected[index] = option; return true; }
    }
    return false;
  }
  return visit(0, []) ? selected : [];
}
function publicQuestion(row: any, passageText = "") {
  const payload = row.payload || {}, type = clean(row.type, 40), choices = Array.isArray(payload.choices) ? payload.choices.map((item: unknown) => clean(item, 1_000)).filter(Boolean) : [];
  if (type === "multiple_choice" && (choices.length < 2 || choices.length > 8)) throw new ApiError(500, "문제 선택지 형식이 올바르지 않습니다.");
  if (!["multiple_choice", "written_response"].includes(type)) throw new ApiError(500, "지원하지 않는 문제 형식입니다.");
  const responseSlots = (Array.isArray(payload.response_slots) ? payload.response_slots : []).slice(0, 12).map((slot: any, index: number) => ({ label: clean(slot?.label, 80) || `답 ${index + 1}` }));
  const sourceQuestionNo = Number(payload.source?.source_question_no) || null;
  const inlineGroups = type === "multiple_choice" && ["grammar", "vocabulary"].includes(clean(payload.skill, 40)) ? inlineOptionGroups(payload.variant_text) : [];
  const storedTargets = publicTargetRanges(payload.target_ranges), targetRanges = storedTargets.length ? storedTargets : sourceQuestionNo === 123 ? [
    { label: "ⓐ", text: "exists" }, { label: "ⓑ", text: "to hedge" }, { label: "ⓒ", text: "what" }, { label: "ⓓ", text: "reinvesting" }, { label: "ⓔ", text: "from which" },
  ] : [];
  const interaction = targetRanges.length ? "inline_targets" : inlineGroups.length ? "inline_options" : payload.skill === "insertion" && choices.every((choice: string) => /^\([A-H]\)$/.test(choice)) ? "inline_positions" : "choices";
  const summaryText = clean(payload.summary_text, 10_000) || (sourceQuestionNo === 127 ? "The real barriers to trade lie in transaction costs, but a common currency can help to ㉠________ them, which in turn leads to a(n) ㉡________ in the overall economy." : "");
  return {
    id: row.id, type, family: clean(payload.family, 40) || (type === "written_response" ? "written" : "standard"), skill: clean(payload.skill, 40),
    prompt: clean(payload.prompt, 1_000), choices, multiSelect: payload.multi_select === true, responseType: type === "written_response" ? "written" : "choice", responseSlots,
    passageText: clean(passageText, 30_000), variantText: clean(payload.variant_text, 30_000) || null, variantSegments: publicSegments(payload.variant_segments), contentBlocks: publicBlocks(payload.content_blocks),
    stimulus: clean(payload.stimulus, 10_000), summaryText, interaction, inlineGroups, targetRanges, source: payload.source ? { exam: clean(payload.source.exam, 160), passageNo: Number(payload.source.passage_no) || null, questionNo: sourceQuestionNo, section: clean(payload.source.section, 20) } : null,
  };
}
async function studentQuestions(body: any, session: ReadySession) {
  const study = await studentPassage(body, session), passageId = study.passage.id;
  const questionRows = rows<any[]>(await db.from("ready_questions").select("id,type,payload,created_at").eq("passage_id", passageId).in("type", ["multiple_choice", "written_response"]).eq("status", "available").order("created_at"));
  questionRows.sort((a, b) => (Number(a.payload?.position) || 0) - (Number(b.payload?.position) || 0));
  const passageText = study.sentences.map((sentence: any) => sentence.text).join(" ");
  return { ...study, questions: questionRows.map(row => publicQuestion(row, passageText)) };
}
async function unresolvedQuestionIds(studentId: string, examId: string) {
  const attempts = rows<any[]>(await db.from("ready_attempts").select("question_id,correct,created_at").eq("student_id", studentId).eq("exam_id", examId).order("created_at", { ascending: false }));
  const latest = new Map<string, boolean>();
  for (const attempt of attempts) if (!latest.has(attempt.question_id)) latest.set(attempt.question_id, attempt.correct === true);
  return [...latest.entries()].filter(([, correct]) => !correct).map(([questionId]) => questionId);
}
async function studentReviewQuestions(body: any, session: ReadySession) {
  const student = await studentForSession(session), examId = required(body.examId, "Exam", 80);
  await studentExamAccess(examId, student);
  const questionIds = await unresolvedQuestionIds(student.id, examId);
  if (!questionIds.length) return { items: [] };
  const questionRows = rows<any[]>(await db.from("ready_questions").select("id,passage_id,type,payload,created_at").in("id", questionIds).in("type", ["multiple_choice", "written_response"]).eq("status", "available"));
  if (!questionRows.length) return { items: [] };
  const passageIds = [...new Set(questionRows.map(question => question.passage_id))];
  const sentenceRows = rows<any[]>(await db.from("ready_passage_sentences").select("passage_id,sentence_index,text").in("passage_id", passageIds).order("sentence_index"));
  const passageText = new Map<string, string>();
  for (const passageId of passageIds) passageText.set(passageId, sentenceRows.filter(sentence => sentence.passage_id === passageId).map(sentence => sentence.text).join(" "));
  questionRows.sort((a, b) => (Number(a.payload?.source?.passage_no) || 0) - (Number(b.payload?.source?.passage_no) || 0) || (Number(a.payload?.position) || 0) - (Number(b.payload?.position) || 0));
  return { items: questionRows.map(row => ({ question: publicQuestion(row, passageText.get(row.passage_id) || "") })) };
}
async function submitAttempt(body: any, session: ReadySession) {
  const student = await studentForSession(session), examId = required(body.examId, "Exam", 80), questionId = required(body.questionId, "문제", 80);
  const question = rows<any>(await db.from("ready_questions").select("id,passage_id,type,payload,status").eq("id", questionId).in("type", ["multiple_choice", "written_response"]).eq("status", "available").maybeSingle());
  if (!question) throw new ApiError(404, "현재 풀 수 없는 문제입니다.");
  await studentPassageAccess(examId, question.passage_id, student);
  const spec = publicQuestion(question); let response: any, answer: any, correct = false;
  if (question.type === "multiple_choice") {
    if (spec.interaction === "inline_options") {
      const selected = Array.isArray(body.inlineSelected) ? body.inlineSelected.map(Number) : [], expected = inlineAnswer(question.payload, spec.choices.length);
      if (selected.length !== spec.inlineGroups.length || selected.some((value: number, index: number) => !Number.isInteger(value) || value < 0 || value >= spec.inlineGroups[index].options.length)) throw new ApiError(400, "본문의 모든 단어를 선택해 주세요.");
      if (expected.length !== selected.length) throw new ApiError(500, "본문 선택형 정답을 해석하지 못했습니다.");
      correct = selected.every((value: number, index: number) => value === expected[index]); response = { inlineSelected: selected }; answer = expected;
    } else {
      const selected = answerIndexes(body.selected, spec.choices.length); answer = answerIndexes(question.payload?.answer, spec.choices.length);
      if (!spec.multiSelect && selected.length !== 1) throw new ApiError(400, "답을 하나만 선택해 주세요.");
      correct = selected.length === answer.length && selected.every((value, index) => value === answer[index]); response = { selected };
    }
  } else {
    const responses = cleanList(body.responses, 12, 2_000), accepted = Array.isArray(question.payload?.accepted_answers) ? question.payload.accepted_answers : [];
    if (!responses.length || responses.length !== accepted.length) throw new ApiError(400, "모든 답을 입력해 주세요.");
    const normalize = (value: unknown) => clean(value, 2_000).normalize("NFKC").toLowerCase().replace(/[“”‘’'".,!?;:()[\]{}]/g, "").replace(/\s+/g, " ").trim();
    const acceptedSets = Array.isArray(question.payload?.accepted_response_sets) ? question.payload.accepted_response_sets : [];
    correct = acceptedSets.length
      ? acceptedSets.some((set: unknown) => Array.isArray(set) && set.length === responses.length && set.every((candidate, index) => normalize(candidate) === normalize(responses[index])))
      : responses.every((value, index) => (Array.isArray(accepted[index]) ? accepted[index] : [accepted[index]]).some((candidate: unknown) => normalize(candidate) === normalize(value)));
    response = { responses }; answer = accepted.map((slot: unknown) => (Array.isArray(slot) ? slot : [slot]).map(candidate => clean(candidate, 2_000)));
  }
  const elapsedMs = Math.max(0, Math.min(3_600_000, Math.round(Number(body.elapsedMs) || 0)));
  const attempt = rows<any>(await db.from("ready_attempts").insert({ student_id: student.id, question_id: question.id, exam_id: examId, response, correct, elapsed_ms: elapsedMs }).select("id,correct,created_at").single());
  return { attempt, correct, answer };
}
function normalizedWord(value: unknown) { return clean(value, 100).toLowerCase().replace(/[^a-z']/g, "").replace(/^'+|'+$/g, ""); }
async function studyContext(body: any, session: ReadySession, sentenceRequired = false) { const student = await studentForSession(session), examId = required(body.examId, "Exam", 80), passageId = required(body.passageId, "지문", 80), passage = await studentPassageAccess(examId, passageId, student), sentenceId = clean(body.sentenceId, 80); let sentence:any = null; if (sentenceRequired || sentenceId) { sentence = rows<any>(await db.from("ready_passage_sentences").select("id,text,translation").eq("id", required(sentenceId, "문장", 80)).eq("passage_id", passage.id).single()); } return { student, examId, passage, sentence }; }
async function wordLookup(body: any, session: ReadySession) {
  const context = await studyContext(body, session), surfaceWord = required(body.word, "단어", 100), normalized = normalizedWord(surfaceWord), root = lemma(normalized);
  if (!normalized) throw new ApiError(400, "영어 단어만 조회할 수 있습니다.");
  const [knownState, savedSenses] = await Promise.all([
    db.from("ready_word_states").select("known").eq("student_id", context.student.id).eq("passage_id", context.passage.id).eq("normalized_word", root).maybeSingle(),
    db.from("ready_saved_words").select("meaning_snapshot").eq("student_id", context.student.id).eq("passage_id", context.passage.id).eq("normalized_word", root).order("created_at"),
  ]);
  if (knownState.error) throw new ApiError(500, knownState.error.message);
  if (savedSenses.error) throw new ApiError(500, savedSenses.error.message);
  const known = knownState.data?.known === true;
  const existingMeanings = rows<any[]>(savedSenses).map(item => clean(item.meaning_snapshot, 500)).filter(Boolean);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const used = await db.from("ready_word_lookup_events").select("id", { count: "exact", head: true }).eq("student_id", context.student.id).gte("created_at", today.toISOString());
  if (used.error) throw new ApiError(500, used.error.message);
  if ((used.count || 0) >= AI_DAILY_LIMIT) throw new ApiError(429, `오늘 Gemini 단어 사전 ${AI_DAILY_LIMIT}회를 모두 사용했습니다.`);
  const event = await db.from("ready_word_lookup_events").insert({ student_id: context.student.id, exam_id: context.examId, passage_id: context.passage.id, sentence_id: context.sentence?.id || null, surface_word: surfaceWord, normalized_word: root });
  if (event.error) throw new ApiError(500, event.error.message);
  // Do not use the legacy lemma-only cache here: the same lemma can mean
  // different things in two sentences. Breeze caches by lemma + context.
  const result = await callGeminiLook(root, surfaceWord, context.sentence?.text || "");
  const meaning = clean(result.ko, 60), alts = cleanList(result.alts, 3, 40).filter(item => item !== meaning);
  if (!known && meaning) {
    const automaticSave = await db.from("ready_saved_words").upsert({
      student_id: context.student.id, passage_id: context.passage.id, sentence_id: context.sentence?.id || null,
      word: surfaceWord, normalized_word: root, meaning_snapshot: meaning, meaning_key: meaningKey(meaning),
    }, { onConflict: "student_id,passage_id,normalized_word,meaning_key", ignoreDuplicates: true });
    if (automaticSave.error) throw new ApiError(500, automaticSave.error.message);
  }
  return {
    word: surfaceWord, normalizedWord: root, meaning, meanings: [meaning, ...alts],
    pos: clean(result.pos, 12), note: clean(result.note, 300), phrase: clean(result.phrase, 80),
    provider: "gemini", cached: false, known, savedMeanings: known ? existingMeanings : [...new Set([...existingMeanings, meaning])].filter(Boolean),
    remaining: Math.max(0, AI_DAILY_LIMIT - (used.count || 0) - 1),
  };
}
function meaningKey(value: string) { return clean(value, 500).toLowerCase().replace(/\s+/g, " "); }
async function saveWord(body:any,session:ReadySession){const context=await studyContext(body,session),word=required(body.word,"단어",100),normalized=normalizedWord(body.normalizedWord||word),root=lemma(normalized),meaning=required(body.meaning,"선택한 뜻",500);if(!root)throw new ApiError(400,"영어 단어만 저장할 수 있습니다.");const known=await db.from("ready_word_states").select("known").eq("student_id",context.student.id).eq("passage_id",context.passage.id).eq("normalized_word",root).maybeSingle();if(known.error)throw new ApiError(500,known.error.message);if(known.data?.known)throw new ApiError(409,"아는 단어로 표시했습니다. 다시 학습하기를 누른 뒤 저장할 수 있습니다.");const saved=await db.from("ready_saved_words").upsert({student_id:context.student.id,passage_id:context.passage.id,sentence_id:context.sentence?.id||null,word,normalized_word:root,meaning_snapshot:meaning,meaning_key:meaningKey(meaning)},{onConflict:"student_id,passage_id,normalized_word,meaning_key",ignoreDuplicates:true}).select("id,meaning_snapshot").maybeSingle();if(saved.error)throw new ApiError(500,saved.error.message);return {saved:true,normalizedWord:root,meaning};}
async function setWordKnown(body:any,session:ReadySession,known:boolean){const context=await studyContext(body,session),root=lemma(normalizedWord(required(body.normalizedWord||body.word,"단어",100)));if(!root)throw new ApiError(400,"영어 단어만 처리할 수 있습니다.");const result=await db.rpc("ready_set_word_known",{p_student_id:context.student.id,p_passage_id:context.passage.id,p_normalized_word:root,p_known:known});if(result.error)throw new ApiError(500,result.error.message);return {known,normalizedWord:root};}
async function deleteSavedWord(body:any,session:ReadySession){const student=await studentForSession(session),savedWordId=required(body.savedWordId,"저장 단어",80),result=await db.from("ready_saved_words").delete().eq("id",savedWordId).eq("student_id",student.id).select("id,normalized_word").maybeSingle();if(result.error)throw new ApiError(500,result.error.message);if(!result.data)throw new ApiError(404,"저장 단어를 찾지 못했습니다.");return {deleted:result.data.id,normalizedWord:result.data.normalized_word};}
async function translationView(body: any, session: ReadySession) { const context = await studyContext(body, session, true); const event = await db.from("ready_sentence_translation_view_events").insert({ student_id: context.student.id, exam_id: context.examId, passage_id: context.passage.id, sentence_id: context.sentence.id }); if (event.error) throw new ApiError(500, event.error.message); return { recorded:true }; }
async function saveSentence(body: any, session: ReadySession) { const context = await studyContext(body, session, true); const saved = await db.from("ready_saved_sentences").upsert({ student_id: context.student.id, exam_id: context.examId, passage_id: context.passage.id, sentence_id: context.sentence.id, source_text_snapshot: context.sentence.text, translation_snapshot: context.sentence.translation }, { onConflict: "student_id,sentence_id", ignoreDuplicates: true }).select().maybeSingle(); if (saved.error) throw new ApiError(500, saved.error.message); return { saved: true }; }
async function deleteSavedSentence(body:any,session:ReadySession){const student=await studentForSession(session),savedSentenceId=required(body.savedSentenceId,"저장 문장",80),result=await db.from("ready_saved_sentences").delete().eq("id",savedSentenceId).eq("student_id",student.id).select("id,sentence_id").maybeSingle();if(result.error)throw new ApiError(500,result.error.message);if(!result.data)throw new ApiError(404,"저장 문장을 찾지 못했습니다.");return {deleted:result.data.id,sentenceId:result.data.sentence_id};}
async function personalLibrary(_body:any,session:ReadySession){const student=await studentForSession(session),[words,sentences]=await Promise.all([
  db.from("ready_saved_words").select("id,word,normalized_word,meaning_snapshot,created_at,passage:ready_passages(title)").eq("student_id",student.id).order("created_at",{ascending:false}),
  db.from("ready_saved_sentences").select("id,sentence_id,source_text_snapshot,translation_snapshot,created_at,passage:ready_passages(title)").eq("student_id",student.id).order("created_at",{ascending:false})]);return {words:rows(words),sentences:rows(sentences)};}
async function dispatch(op: string, body: any, session: ReadySession | null) {
  switch (op) {
    case "list_students": return listStudents(); case "student_login": return studentLogin(body); case "admin_login": return adminLogin(body); case "logout": return revokeSession(session as ReadySession);
    case "teacher_bootstrap": return teacherBootstrap(); case "delete_impact": return deleteImpact(body); case "create_student": return createStudent(body); case "set_student_pin": return setStudentPin(body); case "delete_student": return deleteStudent(body);
    case "assign_scope_passages": return setScopePassages(body, false); case "set_scope_passages": return setScopePassages(body, true); case "create_passage": return createPassage(body); case "update_passage": return updatePassage(body); case "delete_passage": return deletePassage(body); case "import_questions": return importQuestions(body);
    case "student_bootstrap": return studentBootstrap(session as ReadySession); case "student_passage": return studentPassage(body, session as ReadySession); case "student_questions": return studentQuestions(body, session as ReadySession); case "student_review_questions": return studentReviewQuestions(body, session as ReadySession); case "submit_attempt": return submitAttempt(body, session as ReadySession);
    default: throw new ApiError(404, "알 수 없는 READY 작업입니다.");
  }
}
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS }); if (req.method !== "POST") return json({ error: "POST만 받습니다." }, 405);
  try { const body = await req.json(), op = clean(body?.op, 60); let session: ReadySession | null = null; if (adminOps.has(op)) session = await authenticate(req, "admin"); else if (studentOps.has(op)) session = await authenticate(req, "student"); else if (op === "logout") session = await authenticate(req); else if (!publicOps.has(op)) throw new ApiError(404, "알 수 없는 READY 작업입니다."); return json(await dispatch(op, body, session)); }
  catch (error) { console.error(error); return error instanceof ApiError ? json({ error: error.message, detail: error.detail }, error.status) : json({ error: "READY 서버에서 요청을 처리하지 못했습니다." }, 500); }
});
