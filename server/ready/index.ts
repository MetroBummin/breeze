// READY Milestone 1 — Supabase Edge Function
// Deploy with JWT verification disabled; the public anon key only reaches this API.
// Teacher operations additionally require READY_TEACHER_KEY in x-ready-teacher-key.
// AI secrets stay here: READY_AI_PROVIDER, READY_AI_MODEL and the provider API key.

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  isCorrectOrder, shuffled, splitSentences, validateGeneratedOrder, validateTeacherOrder,
} from "./order-core.mjs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-ready-teacher-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const db = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);
const teacherOps = new Set([
  "teacher_bootstrap", "create_set", "create_passage", "generate_order", "update_question",
  "set_question_status", "delete_question", "publish_set",
]);

function clean(value: unknown, max = 10000) {
  return String(value ?? "").trim().slice(0, max);
}
function required(value: unknown, name: string, max = 10000) {
  const out = clean(value, max);
  if (!out) throw new ApiError(400, `${name} 값이 필요합니다.`);
  return out;
}
class ApiError extends Error {
  status: number;
  detail?: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message); this.status = status; this.detail = detail;
  }
}
function rows<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new ApiError(500, result.error.message);
  return result.data as T;
}
function assertTeacher(req: Request) {
  const expected = Deno.env.get("READY_TEACHER_KEY") ?? "";
  const supplied = req.headers.get("x-ready-teacher-key") ?? "";
  if (!expected) throw new ApiError(503, "READY_TEACHER_KEY가 서버에 설정되지 않았습니다.");
  if (supplied !== expected) throw new ApiError(401, "교사용 키를 확인해 주세요.");
}
async function isPublishedQuestion(questionId: string) {
  const result = await db.from("ready_publication_questions").select("question_id").eq("question_id", questionId).limit(1);
  return rows(result).length > 0;
}

const ORDER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["difficulty", "chunks", "correctOrder"],
  properties: {
    difficulty: { type: "integer", minimum: 1, maximum: 4 },
    chunks: {
      type: "array", minItems: 2,
      items: {
        type: "object", additionalProperties: false, required: ["id", "sentenceIds", "text"],
        properties: {
          id: { type: "string" },
          sentenceIds: { type: "array", minItems: 1, items: { type: "string" } },
          text: { type: "string" },
        },
      },
    },
    correctOrder: { type: "array", minItems: 2, items: { type: "string" } },
  },
};

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
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  const model = Deno.env.get("READY_AI_MODEL");
  if (!key || !model) throw new ApiError(503, "ANTHROPIC_API_KEY와 READY_AI_MODEL을 설정해 주세요.");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: 5000, temperature: 0,
      messages: [{ role: "user", content: prompt }],
      tools: [{ name: "submit_order", description: "Return the validated ORDER question", input_schema: ORDER_SCHEMA }],
      tool_choice: { type: "tool", name: "submit_order" },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new ApiError(502, data?.error?.message || "AI 요청에 실패했습니다.");
  const tool = data?.content?.find((item: any) => item.type === "tool_use" && item.name === "submit_order");
  if (!tool?.input) throw new ApiError(502, "AI가 구조화 결과를 반환하지 않았습니다.");
  return tool.input;
}

async function generateWithOpenAI(prompt: string) {
  const key = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("READY_AI_MODEL");
  if (!key || !model) throw new ApiError(503, "OPENAI_API_KEY와 READY_AI_MODEL을 설정해 주세요.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "authorization": `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model, input: prompt, store: false, max_output_tokens: 5000,
      text: { format: { type: "json_schema", name: "ready_order", strict: true, schema: ORDER_SCHEMA } },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new ApiError(502, data?.error?.message || "AI 요청에 실패했습니다.");
  const text = data?.output_text || data?.output?.flatMap((item: any) => item.content || [])
    .find((item: any) => item.type === "output_text")?.text;
  try { return JSON.parse(text); } catch { throw new ApiError(502, "AI JSON을 읽지 못했습니다."); }
}

async function generateOrder(sentences: any[], difficulty: number) {
  const provider = (Deno.env.get("READY_AI_PROVIDER") || "anthropic").toLowerCase();
  const prompt = orderPrompt(sentences, difficulty);
  const raw = provider === "openai" ? await generateWithOpenAI(prompt)
    : provider === "anthropic" ? await generateWithAnthropic(prompt)
    : (() => { throw new ApiError(503, `지원하지 않는 READY_AI_PROVIDER: ${provider}`); })();
  try { return validateGeneratedOrder(raw, sentences, difficulty); }
  catch (error) { throw new ApiError(502, `AI 결과 검증 실패: ${error instanceof Error ? error.message : error}`); }
}

async function teacherBootstrap() {
  const [students, sets, passages, sentences, questions, publications, links, attempts] = await Promise.all([
    db.from("ready_students").select("*").order("sort_order").order("name"),
    db.from("ready_study_sets").select("*").order("created_at", { ascending: false }),
    db.from("ready_passages").select("*").order("position").order("created_at"),
    db.from("ready_passage_sentences").select("*").order("sentence_index"),
    db.from("ready_questions").select("*").order("created_at"),
    db.from("ready_publications").select("*").order("published_at", { ascending: false }),
    db.from("ready_publication_questions").select("*").order("position"),
    db.from("ready_attempts").select("*").order("created_at", { ascending: false }),
  ]);
  return {
    students: rows(students), sets: rows(sets), passages: rows(passages), sentences: rows(sentences),
    questions: rows(questions), publications: rows(publications), publicationQuestions: rows(links), attempts: rows(attempts),
  };
}

async function createSet(body: any) {
  const result = await db.from("ready_study_sets").insert({
    title: required(body.title, "학습세트 제목", 120), description: clean(body.description, 500),
  }).select().single();
  return { set: rows(result) };
}

async function createPassage(body: any) {
  const sourceText = required(body.sourceText, "영어 지문", 30000);
  const pieces = splitSentences(sourceText);
  if (pieces.length < 2) throw new ApiError(400, "ORDER 문제에는 문장이 2개 이상 필요합니다.");
  if (pieces.length > 80) throw new ApiError(400, "한 지문은 80문장 이하로 나눠 주세요.");
  const passageResult = await db.from("ready_passages").insert({
    study_set_id: required(body.studySetId, "학습세트"), title: required(body.title, "지문 제목", 120), source_text: sourceText,
  }).select().single();
  const passage: any = rows(passageResult);
  const sentenceResult = await db.from("ready_passage_sentences").insert(
    pieces.map((text, sentence_index) => ({ passage_id: passage.id, sentence_index, text })),
  ).select().order("sentence_index");
  return { passage, sentences: rows(sentenceResult) };
}

async function generateOrderQuestion(body: any) {
  const passageId = required(body.passageId, "지문");
  const difficulty = Number(body.difficulty);
  if (![1, 2, 3, 4].includes(difficulty)) throw new ApiError(400, "난이도는 1–4입니다.");
  const sentenceResult = await db.from("ready_passage_sentences").select("id,sentence_index,text")
    .eq("passage_id", passageId).order("sentence_index");
  const sentences: any[] = rows(sentenceResult);
  if (sentences.length < 2) throw new ApiError(400, "문장이 부족합니다.");
  const payload = await generateOrder(sentences, difficulty);
  const previousId = clean(body.replaceQuestionId, 80);
  let generation = 1;
  if (previousId) {
    if (await isPublishedQuestion(previousId)) throw new ApiError(409, "게시된 문제는 교체할 수 없습니다. 새 문제를 생성해 주세요.");
    const old = await db.from("ready_questions").select("generation").eq("id", previousId).maybeSingle();
    if (old.error) throw new ApiError(500, old.error.message);
    generation = Number(old.data?.generation || 0) + 1;
  }
  const inserted = await db.from("ready_questions").insert({
    passage_id: passageId, type: "order", difficulty, payload, status: "draft", generation,
  }).select().single();
  if (previousId) {
    const removed = await db.from("ready_questions").delete().eq("id", previousId);
    if (removed.error) throw new ApiError(500, removed.error.message);
  }
  return { question: rows(inserted) };
}

async function updateQuestion(body: any) {
  const questionId = required(body.questionId, "문제");
  if (await isPublishedQuestion(questionId)) throw new ApiError(409, "게시된 문제는 수정할 수 없습니다.");
  let payload;
  try { payload = validateTeacherOrder(body.payload); }
  catch (error) { throw new ApiError(400, error instanceof Error ? error.message : "문제 형식이 올바르지 않습니다."); }
  const result = await db.from("ready_questions").update({ payload, difficulty: payload.difficulty, updated_at: new Date().toISOString() })
    .eq("id", questionId).eq("type", "order").select().single();
  return { question: rows(result) };
}

async function setQuestionStatus(body: any) {
  const questionId = required(body.questionId, "문제");
  const status = body.status === "approved" ? "approved" : "draft";
  if (await isPublishedQuestion(questionId)) throw new ApiError(409, "게시된 문제의 상태는 바꿀 수 없습니다.");
  const result = await db.from("ready_questions").update({ status, updated_at: new Date().toISOString() })
    .eq("id", questionId).select().single();
  return { question: rows(result) };
}

async function deleteQuestion(body: any) {
  const questionId = required(body.questionId, "문제");
  if (await isPublishedQuestion(questionId)) throw new ApiError(409, "게시된 문제는 삭제할 수 없습니다.");
  const result = await db.from("ready_questions").delete().eq("id", questionId);
  if (result.error) throw new ApiError(500, result.error.message);
  return { deleted: questionId };
}

async function publishSet(body: any) {
  const studySetId = required(body.studySetId, "학습세트");
  const result = await db.rpc("ready_publish_study_set", { p_study_set_id: studySetId });
  const published: any = rows<any[]>(result)[0];
  if (!published) throw new ApiError(400, "게시할 승인 문제가 없습니다.");
  return { publication: { id: published.publication_id, study_set_id: studySetId }, questionCount: published.question_count };
}

async function studentHome() {
  const [studentsResult, publicationsResult, setsResult, linksResult] = await Promise.all([
    db.from("ready_students").select("id,name").eq("active", true).order("sort_order").order("name"),
    db.from("ready_publications").select("id,study_set_id,published_at").eq("active", true).order("published_at", { ascending: false }),
    db.from("ready_study_sets").select("id,title,description"),
    db.from("ready_publication_questions").select("publication_id,question_id"),
  ]);
  const publications: any[] = rows(publicationsResult);
  const sets = new Map(rows<any[]>(setsResult).map(set => [set.id, set]));
  const links: any[] = rows(linksResult);
  return {
    students: rows(studentsResult),
    sets: publications.map(publication => ({
      publicationId: publication.id, publishedAt: publication.published_at,
      ...sets.get(publication.study_set_id),
      total: links.filter(link => link.publication_id === publication.id).length,
    })),
  };
}

async function studentQuestions(body: any) {
  const studentId = required(body.studentId, "학생");
  const publicationId = required(body.publicationId, "게시본");
  const [studentResult, publicationResult, linkResult] = await Promise.all([
    db.from("ready_students").select("id,name").eq("id", studentId).eq("active", true).maybeSingle(),
    db.from("ready_publications").select("id,study_set_id").eq("id", publicationId).eq("active", true).maybeSingle(),
    db.from("ready_publication_questions").select("question_id,position").eq("publication_id", publicationId).order("position"),
  ]);
  if (studentResult.error || !studentResult.data) throw new ApiError(404, "학생을 찾지 못했습니다.");
  if (publicationResult.error || !publicationResult.data) throw new ApiError(404, "게시된 학습세트를 찾지 못했습니다.");
  const links: any[] = rows(linkResult);
  const ids = links.map(link => link.question_id);
  const questionResult = await db.from("ready_questions").select("id,passage_id,type,difficulty,payload").in("id", ids);
  const questions = new Map(rows<any[]>(questionResult).map(question => [question.id, question]));
  const passageIds = [...new Set([...questions.values()].map(question => question.passage_id))];
  const passageResult = await db.from("ready_passages").select("id,title").in("id", passageIds);
  const passages = new Map(rows<any[]>(passageResult).map(passage => [passage.id, passage]));
  return {
    student: studentResult.data,
    questions: links.map(link => questions.get(link.question_id)).filter(Boolean).map((question: any) => ({
      id: question.id, type: question.type, difficulty: question.difficulty,
      passageTitle: passages.get(question.passage_id)?.title || "Passage",
      items: shuffled(question.payload.chunks).map((chunk: any) => ({ id: chunk.id, text: chunk.text })),
    })),
  };
}

async function submitAttempt(body: any) {
  const studentId = required(body.studentId, "학생");
  const publicationId = required(body.publicationId, "게시본");
  const questionId = required(body.questionId, "문제");
  const order = Array.isArray(body.order) ? body.order.map((id: unknown) => clean(id, 100)) : [];
  const elapsedMs = Math.max(0, Math.min(86_400_000, Math.round(Number(body.elapsedMs) || 0)));
  const linkResult = await db.from("ready_publication_questions").select("question_id")
    .eq("publication_id", publicationId).eq("question_id", questionId).maybeSingle();
  if (linkResult.error || !linkResult.data) throw new ApiError(404, "이 게시본에 없는 문제입니다.");
  const questionResult = await db.from("ready_questions").select("type,payload").eq("id", questionId).single();
  const question: any = rows(questionResult);
  if (question.type !== "order") throw new ApiError(400, "Milestone 1은 ORDER 문제만 채점합니다.");
  const correctOrder = question.payload.correctOrder.map(String);
  const expected = [...correctOrder].sort();
  if (JSON.stringify([...order].sort()) !== JSON.stringify(expected)) throw new ApiError(400, "응답 항목이 문제와 일치하지 않습니다.");
  const correct = isCorrectOrder(order, correctOrder);
  const result = await db.from("ready_attempts").insert({
    student_id: studentId, publication_id: publicationId, question_id: questionId,
    response: { type: "order", order }, correct, elapsed_ms: elapsedMs,
  }).select("id,correct,created_at").single();
  return { attempt: rows(result) };
}

async function dispatch(op: string, body: any) {
  switch (op) {
    case "teacher_bootstrap": return teacherBootstrap();
    case "create_set": return createSet(body);
    case "create_passage": return createPassage(body);
    case "generate_order": return generateOrderQuestion(body);
    case "update_question": return updateQuestion(body);
    case "set_question_status": return setQuestionStatus(body);
    case "delete_question": return deleteQuestion(body);
    case "publish_set": return publishSet(body);
    case "student_home": return studentHome();
    case "student_questions": return studentQuestions(body);
    case "submit_attempt": return submitAttempt(body);
    default: throw new ApiError(404, "알 수 없는 READY 작업입니다.");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST만 받습니다." }, 405);
  try {
    const body = await req.json();
    const op = clean(body?.op, 60);
    if (teacherOps.has(op)) assertTeacher(req);
    return json(await dispatch(op, body));
  } catch (error) {
    console.error(error);
    if (error instanceof ApiError) return json({ error: error.message, detail: error.detail }, error.status);
    return json({ error: "READY 서버에서 요청을 처리하지 못했습니다." }, 500);
  }
});
