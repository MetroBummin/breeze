// READY — fixed Scope > Passage Reader
// Custom opaque sessions are validated here. Deploy this Edge Function with JWT verification disabled.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { bearerToken, randomSessionToken, secureEqual, sha256Hex, validPin } from "./auth-core.mjs";
import { conceptKey, tokenizeSentence } from "./lexical-core.mjs";

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
const adminOps = new Set(["teacher_bootstrap", "delete_impact", "assign_scope_passages", "set_scope_passages", "create_passage", "update_passage", "delete_passage", "bake_passage", "create_student", "set_student_pin", "delete_student"]);
const studentOps = new Set(["student_bootstrap", "student_passage", "word_lookup", "save_lexical", "translation_view", "save_sentence", "personal_library"]);
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

const ALT_SENSE_SCHEMA = { type:"object", additionalProperties:false, required:["senseKey","meaning"], properties:{ senseKey:{type:"string"}, meaning:{type:"string"} } };
const BAKE_SCHEMA = {
  type:"object",additionalProperties:false,required:["sentences"],properties:{sentences:{
    type:"array",items:{type:"object",additionalProperties:false,
      required:["sentenceId","concepts"],
      properties:{sentenceId:{type:"string"},concepts:{
        type:"array",items:{type:"object",additionalProperties:false,
          required:["kind","canonicalForm","lemma","senseKey","partOfSpeech","contextMeaning","alternativeSenses","tokenIndexes"],
          properties:{kind:{type:"string",enum:["word","phrase"]},canonicalForm:{type:"string"},lemma:{type:"string"},senseKey:{type:"string"},partOfSpeech:{type:"string"},contextMeaning:{type:"string"},alternativeSenses:{type:"array",items:ALT_SENSE_SCHEMA},tokenIndexes:{type:"array",items:{type:"integer"}}}
        }
      }}
    }
  }}
};
function anthropicOutputSchema(schema: any): any {
  // Raw Messages API schemas do not support every JSON Schema constraint.
  if (Array.isArray(schema)) return schema.map(anthropicOutputSchema);
  if (!schema || typeof schema !== "object") return schema;
  const { minimum, maximum, minLength, maxLength, minItems, maxItems, pattern, ...supported } = schema;
  return Object.fromEntries(Object.entries(supported).map(([key, value]) => [key, anthropicOutputSchema(value)]));
}
async function generateWithAnthropic(prompt: string, schema: any, maxTokens = 5000) {
  const key = Deno.env.get("ANTHROPIC_API_KEY"), model = Deno.env.get("READY_AI_MODEL");
  if (!key || !model) throw new ApiError(503, "ANTHROPIC_API_KEY와 READY_AI_MODEL을 설정해 주세요.");
  const response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }], output_config: { format: { type: "json_schema", schema: anthropicOutputSchema(schema) } } }) });
  const data = await response.json();
  if (!response.ok) throw new ApiError(502, data?.error?.message || "AI 요청에 실패했습니다.");
  const content = Array.isArray(data?.content) ? data.content : [];
  const structured = content.find((item: any) => item?.type === "output_json" || item?.type === "json")?.json;
  if (structured && typeof structured === "object") return structured;
  const text = content.filter((item: any) => item?.type === "text").map((item: any) => item.text || "").join("\n").trim().replace(/^```json\s*|\s*```$/g, "");
  if (!text) throw new ApiError(502, `AI 구조화 응답이 비어 있습니다 (${data?.stop_reason || "unknown"}).`);
  try { return JSON.parse(text); } catch { throw new ApiError(502, `AI JSON을 읽지 못했습니다 (${data?.stop_reason || "unknown"}).`); }
}
async function generateWithOpenAI(prompt: string, schema: any, maxTokens = 5000) {
  const key = Deno.env.get("OPENAI_API_KEY"), model = Deno.env.get("READY_AI_MODEL");
  if (!key || !model) throw new ApiError(503, "OPENAI_API_KEY와 READY_AI_MODEL을 설정해 주세요.");
  const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ model, input: prompt, store: false, max_output_tokens: maxTokens, text: { format: { type: "json_schema", name: "ready_structured", strict: true, schema } } }) });
  const data = await response.json();
  if (!response.ok) throw new ApiError(502, data?.error?.message || "AI 요청에 실패했습니다.");
  const text = data?.output_text || data?.output?.flatMap((item: any) => item.content || []).find((item: any) => item.type === "output_text")?.text;
  try { return JSON.parse(text); } catch { throw new ApiError(502, "AI JSON을 읽지 못했습니다."); }
}
function bakePrompt(sentences: Array<{id:string;text:string;tokens:any[]}>,existingConcepts:any[]) {
  return `You identify concise English vocabulary and phrase help for Korean high-school students. Return structured JSON only.
Never change, translate, summarize, grade, or explain the teacher sentences. Inspect every source sentence exactly once only to identify lexical concepts.
For each sentence, emit at most 4 high-value concepts total: prioritize exam-relevant content words, idioms, phrasal verbs, and expressions. Skip low-value function words and obvious beginner vocabulary.
Use the supplied zero-based tokenIndexes. Phrases may be inflected or discontinuous; list only semantic component token indexes in source order.
kind=word uses one token. kind=phrase uses at least two tokens. canonicalForm and lemma are lowercase dictionary forms.
senseKey is a stable short ENGLISH semantic identity, independent of Korean wording, such as create.object, cause.state, compensate.for. Use the same senseKey for the same meaning across passages and a different one for a different meaning.
An existing concept registry is provided. When an existing entry has the same canonical form and semantic meaning, you MUST reuse its exact senseKey. Create a new senseKey only for a genuinely different sense.
alternativeSenses contains at most one genuinely useful contrastive sense per concept; otherwise return an empty array.
Source JSON:
${JSON.stringify(sentences)}
Existing concept registry:
${JSON.stringify(existingConcepts)}`;
}
function normalizedBake(raw:any, source:Array<{id:string;text:string;tokens:any[]}>) {
  if(!raw || !Array.isArray(raw.sentences) || raw.sentences.length!==source.length) throw new ApiError(502,"AI 어휘 분석의 문장 ID 개수가 원문과 다릅니다.");
  const byId=new Map(source.map(sentence=>[sentence.id,sentence])); const seen=new Set<string>();
  const sentences=raw.sentences.map((item:any)=>{
    const sourceSentence=byId.get(clean(item.sentenceId,80)); if(!sourceSentence || seen.has(sourceSentence.id)) throw new ApiError(502,"AI 문장 ID가 원문과 다릅니다."); seen.add(sourceSentence.id);
    const concepts=(Array.isArray(item.concepts)?item.concepts:[]).map((candidate:any,index:number)=>{
      const kind=candidate.kind==="phrase"?"phrase":"word", canonicalForm=required(candidate.canonicalForm,"canonical form",120).toLowerCase(), senseKey=required(candidate.senseKey,"sense key",120).toLowerCase();
      const tokenIndexes:number[]=[...new Set<number>((Array.isArray(candidate.tokenIndexes)?candidate.tokenIndexes:[]).map((value:any)=>Number(value)))].sort((a,b)=>a-b);
      // A malformed optional vocabulary occurrence must never block the lexical
      // bake. Do not guess or shift indexes: omitting it is safer than attaching
      // a meaning to the wrong word in the Reader.
      if(!tokenIndexes.length || tokenIndexes.some(value=>!Number.isInteger(value)||value<0||value>=sourceSentence.tokens.length) || (kind==="word"&&tokenIndexes.length!==1) || (kind==="phrase"&&tokenIndexes.length<2)) return null;
      const alternatives=(Array.isArray(candidate.alternativeSenses)?candidate.alternativeSenses:[]).map((alt:any)=>{const altSense=required(alt.senseKey,"alternative sense",120).toLowerCase();return {senseKey:altSense,meaning:required(alt.meaning,"alternative meaning",500),conceptKey:conceptKey(kind,canonicalForm,altSense)};});
      return {kind,canonicalForm,lemma:clean(candidate.lemma,120).toLowerCase(),senseKey,partOfSpeech:clean(candidate.partOfSpeech,40),contextMeaning:required(candidate.contextMeaning,"context meaning",500),alternativeSenses:alternatives,tokenIndexes,conceptKey:conceptKey(kind,canonicalForm,senseKey),occurrenceKey:`${kind}:${canonicalForm.replace(/[^a-z0-9]+/g,"_")}:${tokenIndexes.join("-")}`,surfaceText:tokenIndexes.map(i=>sourceSentence.tokens[i].surface).join(" … ")};
    }).filter(Boolean);
    return {sentenceId:sourceSentence.id,tokens:sourceSentence.tokens,concepts};
  });
  return {sentences};
}
async function bakePassage(body:any){
  const passageId=required(body.passageId,"지문",80), passage=rows<any>(await db.from("ready_passages").select("id,bake_generation").eq("id",passageId).single());
  const source=rows<any[]>(await db.from("ready_passage_sentences").select("id,text").eq("passage_id",passageId).order("sentence_index")).map(sentence=>({...sentence,tokens:tokenizeSentence(sentence.text)}));
  if(!source.length)throw new ApiError(400,"분석할 문장이 없습니다."); const generation=Number(passage.bake_generation||0)+1;
  const started=await db.from("ready_passages").update({bake_status:"processing",bake_error:null}).eq("id",passageId); if(started.error)throw new ApiError(500,started.error.message);
  try{
    const registry=rows<any[]>(await db.from("ready_lexical_concepts").select("concept_key,kind,canonical_form,lemma,sense_key,context_meaning").limit(800));
    const provider=(Deno.env.get("READY_AI_PROVIDER")||"openai").toLowerCase(), prompt=bakePrompt(source,registry);
    const raw=provider==="anthropic"?await generateWithAnthropic(prompt,BAKE_SCHEMA,16000):provider==="openai"?await generateWithOpenAI(prompt,BAKE_SCHEMA,16000):(()=>{throw new ApiError(503,`지원하지 않는 READY_AI_PROVIDER: ${provider}`)})();
    const bake=normalizedBake(raw,source), applied=await db.rpc("ready_apply_passage_bake",{p_passage_id:passageId,p_generation:generation,p_bake:bake});
    if(applied.error)throw new ApiError(500,applied.error.message); return {passageId,status:"ready",generation,conceptCount:bake.sentences.reduce((sum:any,s:any)=>sum+s.concepts.length,0)};
  }catch(error){const message=error instanceof Error?error.message:String(error);await db.from("ready_passages").update({bake_status:"failed",bake_error:message.slice(0,1000)}).eq("id",passageId);throw error;}
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
    const [attempts, savedWords, savedLexical, savedSentences, wordLookups, translationViews] = await Promise.all([
      countWhere("ready_attempts", "student_id", targetId), countWhere("ready_saved_words", "student_id", targetId),
      countWhere("ready_saved_lexical_items", "student_id", targetId),
      countWhere("ready_saved_sentences", "student_id", targetId), countWhere("ready_word_lookup_events", "student_id", targetId),
      countWhere("ready_sentence_translation_view_events", "student_id", targetId),
    ]);
    const counts = { attempts, savedWords, savedLexical, savedSentences, wordLookups, translationViews };
    return { targetType, targetId, label: student.data.name, counts };
  }
  if (targetType === "passage") {
    const passage = await db.from("ready_passages").select("id,title").eq("id", targetId).maybeSingle();
    if (passage.error) throw new ApiError(500, passage.error.message); if (!passage.data) throw new ApiError(404, "지문을 찾지 못했습니다.");
    const questions = rows<any[]>(await db.from("ready_questions").select("id").eq("passage_id", targetId)), questionIds = questions.map(item => item.id);
    const attempts = questionIds.length ? rows<any[]>(await db.from("ready_attempts").select("id").in("question_id", questionIds)).length : 0;
    const [sentences, tokens, lexicalOccurrences, lexicalSources, examLinks, savedWords, savedSentences, wordLookups, translationViews] = await Promise.all([
      countWhere("ready_passage_sentences", "passage_id", targetId),countWhere("ready_sentence_tokens", "passage_id", targetId),countWhere("ready_lexical_occurrences", "passage_id", targetId),countWhere("ready_saved_lexical_sources", "passage_id", targetId),countWhere("ready_exam_passages", "passage_id", targetId),
      countWhere("ready_saved_words", "passage_id", targetId), countWhere("ready_saved_sentences", "passage_id", targetId),
      countWhere("ready_word_lookup_events", "passage_id", targetId), countWhere("ready_sentence_translation_view_events", "passage_id", targetId),
    ]);
    const counts = { sentences, tokens, lexicalOccurrences, lexicalSources, questions: questions.length, examLinks, attempts, savedWords, savedSentences, wordLookups, translationViews };
    return { targetType, targetId, label: passage.data.title, counts };
  }
  throw new ApiError(400, "삭제 대상 종류가 올바르지 않습니다.");
}
async function deleteStudent(body: any) {
  const studentId = required(body.studentId, "학생", 80), result = await db.rpc("ready_delete_student_cascade", { p_student_id: studentId });
  if (result.error) throw new ApiError(500, result.error.message); return { deleted: studentId };
}

async function teacherBootstrap() {
  const [students, exams, passages, sentences, examPassages] = await Promise.all([
    db.from("ready_students").select("id,name,school,grade,sort_order,active,created_at").order("school").order("grade").order("sort_order").order("name"), db.from("ready_exams").select("id,school,grade,title,is_current").eq("is_current", true).order("school").order("grade"), db.from("ready_passages").select("id,title,source_type,grade,source_year,source_month,source_label,display_order,study_status,bake_status,bake_error,created_at,updated_at").order("display_order").order("created_at"), db.from("ready_passage_sentences").select("id,passage_id,sentence_index,text,translation").order("sentence_index"), db.from("ready_exam_passages").select("exam_id,passage_id,position").order("position"),
  ]);
  return { students: rows(students), exams: rows(exams), passages: rows(passages), sentences: rows(sentences), examPassages: rows(examPassages) };
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
  return { passage: rows<any>(await db.from("ready_passages").select("*").eq("id", passageId).single()), sentences: rows<any[]>(await db.from("ready_passage_sentences").select("*").eq("passage_id", passageId).order("sentence_index")) };
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
async function studentExamAccess(examId: string, student: Student) {
  const result = await db.from("ready_exams").select("id,school,grade,title,description").eq("id", examId).eq("school", student.school).eq("grade", student.grade).eq("is_current", true).maybeSingle();
  if (result.error) throw new ApiError(500, result.error.message); if (!result.data) throw new ApiError(404, "현재 배정된 시험범위가 아닙니다."); return result.data as any;
}
async function scopePassages(examId: string) {
  const links = rows<any[]>(await db.from("ready_exam_passages").select("passage_id,position").eq("exam_id", examId).order("position"));
  const linkedIds = links.map(item => item.passage_id);
  const sourcePassages = linkedIds.length ? rows<any[]>(await db.from("ready_passages").select("id,title,display_order,source_type,source_label").in("id", linkedIds)) : [];
  const byId = new Map(sourcePassages.map(item => [item.id, item]));
  const passages = links.map(link => ({ ...byId.get(link.passage_id), position: link.position })).filter(item => item.id);
  return passages;
}
async function studentBootstrap(session: ReadySession) {
  const student = await studentForSession(session), scope = rows<any>(await db.from("ready_exams").select("id,school,grade").eq("school", student.school).eq("grade", student.grade).eq("is_current", true).maybeSingle());
  const passages = scope ? await scopePassages(scope.id) : [];
  return { student: { id: student.id, name: student.name, school: student.school, grade: student.grade }, scope, passages };
}
async function studentPassageAccess(examId: string, passageId: string, student: Student) { await studentExamAccess(examId, student); const linked = await db.from("ready_exam_passages").select("passage_id").eq("exam_id", examId).eq("passage_id", passageId).maybeSingle(); if (linked.error) throw new ApiError(500, linked.error.message); if (!linked.data) throw new ApiError(404, "현재 시험범위에 없는 지문입니다."); return rows<any>(await db.from("ready_passages").select("id,title,study_status,processing_error,bake_status,bake_error,updated_at").eq("id", passageId).single()); }
async function studentPassage(body: any, session: ReadySession) {
  const student=await studentForSession(session),examId=required(body.examId,"Exam",80),passageId=required(body.passageId,"지문",80),passage=await studentPassageAccess(examId,passageId,student);
  const [sentences,tokens,occurrences,savedLexical,savedSentences]=await Promise.all([
    db.from("ready_passage_sentences").select("id,sentence_index,text,translation").eq("passage_id",passageId).order("sentence_index"),
    db.from("ready_sentence_tokens").select("id,sentence_id,token_index,surface,normalized,lemma,start_offset,end_offset").eq("passage_id",passageId).order("token_index"),
    db.from("ready_lexical_occurrences").select("id,sentence_id,occurrence_key,surface_text,token_ids,specificity,concept:ready_lexical_concepts(id,concept_key,kind,canonical_form,lemma,sense_key,part_of_speech,context_meaning,alternative_senses)").eq("passage_id",passageId),
    db.from("ready_saved_lexical_items").select("concept_id").eq("student_id",student.id),
    db.from("ready_saved_sentences").select("sentence_id").eq("student_id",student.id).eq("passage_id",passageId),
  ]);
  const sentenceRows=rows<any[]>(sentences),persistedTokens=rows<any[]>(tokens),sentencesWithTokens=new Set(persistedTokens.map(token=>token.sentence_id));
  const readerTokens=[...persistedTokens,...sentenceRows.filter(sentence=>!sentencesWithTokens.has(sentence.id)).flatMap(sentence=>tokenizeSentence(sentence.text).map(token=>({id:`fallback-${sentence.id}-${token.tokenIndex}`,sentence_id:sentence.id,token_index:token.tokenIndex,surface:token.surface,normalized:token.normalized,lemma:token.lemma,start_offset:token.startOffset,end_offset:token.endOffset})))];
  return {passage,sentences:sentenceRows,tokens:readerTokens,occurrences:rows(occurrences),savedConceptIds:rows<any[]>(savedLexical).map(item=>item.concept_id),savedSentenceIds:rows<any[]>(savedSentences).map(item=>item.sentence_id)};
}
function normalizedWord(value: unknown) { return clean(value, 100).toLowerCase().replace(/[^a-z']/g, "").replace(/^'+|'+$/g, ""); }
async function studyContext(body: any, session: ReadySession, sentenceRequired = false) { const student = await studentForSession(session), examId = required(body.examId, "Exam", 80), passageId = required(body.passageId, "지문", 80), passage = await studentPassageAccess(examId, passageId, student), sentenceId = clean(body.sentenceId, 80); let sentence:any = null; if (sentenceRequired || sentenceId) { sentence = rows<any>(await db.from("ready_passage_sentences").select("id,text,translation").eq("id", required(sentenceId, "문장", 80)).eq("passage_id", passage.id).single()); } return { student, examId, passage, sentence }; }
async function wordLookup(body: any, session: ReadySession) { const context = await studyContext(body, session), surfaceWord = required(body.word, "단어", 100), normalized = normalizedWord(surfaceWord); if (!normalized) throw new ApiError(400, "영어 단어만 조회할 수 있습니다."); let occurrence:any=null;
  if(body.occurrenceId){occurrence=rows<any>(await db.from("ready_lexical_occurrences").select("id,sentence_id,surface_text,concept_id").eq("id",required(body.occurrenceId,"어휘 occurrence",80)).eq("passage_id",context.passage.id).single());}
  const event = await db.from("ready_word_lookup_events").insert({ student_id: context.student.id, exam_id: context.examId, passage_id: context.passage.id, sentence_id: occurrence?.sentence_id||context.sentence?.id||null, surface_word: occurrence?.surface_text||surfaceWord, normalized_word: normalized,concept_id:occurrence?.concept_id||null,occurrence_id:occurrence?.id||null }); if (event.error) throw new ApiError(500, event.error.message);
  if(occurrence)return {recorded:true};
  const cached = await db.from("ready_word_cache").select("meaning").eq("normalized_word", normalized).maybeSingle(); if (cached.error) throw new ApiError(500, cached.error.message); if (cached.data?.meaning) return { word: surfaceWord, normalizedWord: normalized, meaning: cached.data.meaning, cached: true,baked:false }; let meaning = "뜻을 찾지 못했어요."; try { const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q=${encodeURIComponent(normalized)}`), json = await response.json(), value = (json?.[0] || []).map((item:any) => item?.[0]).filter(Boolean).join("").trim(); if (value) meaning = value; } catch { /* TODO(READY): replace this fallback with Breeze dictionary candidates; runtime AI is never allowed. */ }
  if (meaning !== "뜻을 찾지 못했어요.") await db.from("ready_word_cache").upsert({ normalized_word: normalized, meaning, updated_at: new Date().toISOString() }); return { word: surfaceWord, normalizedWord: normalized, meaning, cached: false }; }
async function saveLexical(body:any,session:ReadySession){const context=await studyContext(body,session),occurrence=rows<any>(await db.from("ready_lexical_occurrences").select("id,sentence_id,surface_text,concept:ready_lexical_concepts(*)").eq("id",required(body.occurrenceId,"어휘 occurrence",80)).eq("passage_id",context.passage.id).single()),base=occurrence.concept;let concept=base;
  const selected=clean(body.conceptKey,300);if(selected&&selected!==base.concept_key){const alternative=(base.alternative_senses||[]).find((item:any)=>item.conceptKey===selected);if(!alternative)throw new ApiError(400,"선택한 뜻이 이 단어의 후보가 아닙니다.");const upsert=await db.from("ready_lexical_concepts").upsert({concept_key:alternative.conceptKey,kind:base.kind,canonical_form:base.canonical_form,lemma:base.lemma,sense_key:alternative.senseKey,part_of_speech:base.part_of_speech,context_meaning:alternative.meaning,alternative_senses:[]},{onConflict:"concept_key"}).select().single();concept=rows<any>(upsert);}
  const item=rows<any>(await db.from("ready_saved_lexical_items").upsert({student_id:context.student.id,concept_id:concept.id,meaning_snapshot:concept.context_meaning},{onConflict:"student_id,concept_id"}).select().single());
  const source=await db.from("ready_saved_lexical_sources").upsert({saved_item_id:item.id,occurrence_id:occurrence.id,passage_id:context.passage.id,sentence_id:occurrence.sentence_id,surface_text:occurrence.surface_text},{onConflict:"saved_item_id,occurrence_id",ignoreDuplicates:true});if(source.error)throw new ApiError(500,source.error.message);return {saved:true,conceptId:concept.id,conceptKey:concept.concept_key};}
async function translationView(body: any, session: ReadySession) { const context = await studyContext(body, session, true); const event = await db.from("ready_sentence_translation_view_events").insert({ student_id: context.student.id, exam_id: context.examId, passage_id: context.passage.id, sentence_id: context.sentence.id }); if (event.error) throw new ApiError(500, event.error.message); return { recorded:true }; }
async function saveSentence(body: any, session: ReadySession) { const context = await studyContext(body, session, true); const saved = await db.from("ready_saved_sentences").upsert({ student_id: context.student.id, exam_id: context.examId, passage_id: context.passage.id, sentence_id: context.sentence.id, source_text_snapshot: context.sentence.text, translation_snapshot: context.sentence.translation }, { onConflict: "student_id,sentence_id", ignoreDuplicates: true }).select().maybeSingle(); if (saved.error) throw new ApiError(500, saved.error.message); return { saved: true }; }
async function personalLibrary(_body:any,session:ReadySession){const student=await studentForSession(session),[lexical,sentences]=await Promise.all([
  db.from("ready_saved_lexical_items").select("id,meaning_snapshot,created_at,concept:ready_lexical_concepts(id,concept_key,kind,canonical_form,lemma,sense_key),sources:ready_saved_lexical_sources(surface_text,passage:ready_passages(title))").eq("student_id",student.id).order("created_at",{ascending:false}),
  db.from("ready_saved_sentences").select("id,source_text_snapshot,translation_snapshot,created_at,passage:ready_passages(title)").eq("student_id",student.id).order("created_at",{ascending:false})]);return {lexical:rows(lexical),sentences:rows(sentences)};}
async function dispatch(op: string, body: any, session: ReadySession | null) {
  switch (op) {
    case "list_students": return listStudents(); case "student_login": return studentLogin(body); case "admin_login": return adminLogin(body); case "logout": return revokeSession(session as ReadySession);
    case "teacher_bootstrap": return teacherBootstrap(); case "delete_impact": return deleteImpact(body); case "create_student": return createStudent(body); case "set_student_pin": return setStudentPin(body); case "delete_student": return deleteStudent(body);
    case "assign_scope_passages": return setScopePassages(body, false); case "set_scope_passages": return setScopePassages(body, true); case "create_passage": return createPassage(body); case "update_passage": return updatePassage(body); case "delete_passage": return deletePassage(body); case "bake_passage": return bakePassage(body);
    case "student_bootstrap": return studentBootstrap(session as ReadySession); case "student_passage": return studentPassage(body, session as ReadySession); case "word_lookup": return wordLookup(body, session as ReadySession); case "save_lexical": return saveLexical(body, session as ReadySession); case "translation_view": return translationView(body, session as ReadySession); case "save_sentence": return saveSentence(body, session as ReadySession); case "personal_library": return personalLibrary(body,session as ReadySession);
    default: throw new ApiError(404, "알 수 없는 READY 작업입니다.");
  }
}
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS }); if (req.method !== "POST") return json({ error: "POST만 받습니다." }, 405);
  try { const body = await req.json(), op = clean(body?.op, 60); let session: ReadySession | null = null; if (adminOps.has(op)) session = await authenticate(req, "admin"); else if (studentOps.has(op)) session = await authenticate(req, "student"); else if (op === "logout") session = await authenticate(req); else if (!publicOps.has(op)) throw new ApiError(404, "알 수 없는 READY 작업입니다."); return json(await dispatch(op, body, session)); }
  catch (error) { console.error(error); return error instanceof ApiError ? json({ error: error.message, detail: error.detail }, error.status) : json({ error: "READY 서버에서 요청을 처리하지 못했습니다." }, 500); }
});
