// Breeze — 사전 Edge Function (Gemini / Claude 겸용)
// Supabase 대시보드 → Edge Functions → Deploy a new function → Via Editor
// 함수 이름: dict   ← 반드시 이 이름
//
// 필요한 Secret (Edge Functions → Secrets):
//   GEMINI_API_KEY      ← Google AI Studio 키  (무료 티어)
//   ANTHROPIC_API_KEY   ← Claude 키            (유료, 선택)
//   AI_PROVIDER         ← "gemini" 또는 "claude". 없으면 있는 키를 자동 선택
//   AI_DAILY_LIMIT      ← 한 사람 하루 AI 호출 한도. 없으면 200
//   DICT_FP_SALT        ← 문장 지문에 섞는 아무 긴 문자열. 없으면 지문을 아예 안 남깁니다
//
// 먼저 sql/supabase_dict.sql 을 실행해 두어야 합니다.
//
// ── 하는 일 ──────────────────────────────────────────────────
//   op:"look"   낱말 + 문장 → 이 문장에서의 뜻 · 설명 · 다른 뜻 후보.  AI 를 부르는 유일한 곳
//   op:"warm"   함수만 깨운다. AI 를 부르지 않고 한도도 쓰지 않는다
//   op:"log"    사람이 무엇을 했는지 남긴다. AI 도, 한도도 안 씀
//
// 예전에는 entry / pick / explain 세 갈래였습니다. 낱말 항목을 서버 표에 쌓아 두고
// 재사용하려면 "표에 적기 / 표에서 고르기 / 문장 설명하기"가 각각 필요했으니까요.
// 그 표를 접으면서 세 갈래가 존재 이유를 잃었습니다. 첫 조회 기준으로
// 왕복 3번 · 출력 900토큰이 왕복 1번 · 출력 250토큰이 되었습니다.

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const GEMINI_MODEL = "gemini-3.5-flash-lite";
const CLAUDE_MODEL = "claude-haiku-4-5";
const DAILY_LIMIT = Number(Deno.env.get("AI_DAILY_LIMIT") ?? 200);

const SYSTEM =
  "You are a precise bilingual dictionary for Korean learners reading English books. " +
  "Reply with ONLY minified JSON. No markdown, no code fence, no commentary.";

/* 표는 앱이 직접 읽지 않습니다. 이 함수만 service_role 로 손댑니다. */
const SR = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

/* ── 낱말 쪼개기 ─────────────────────────────────────────── */
const tokens = (s: string) => String(s || "").toLowerCase().match(/[a-z']+/g) ?? [];

/* 기록에 남길 수 있는 기능어. 닫힌 목록입니다 — 여기 없는 낱말은 사용자 문장에서
   길어 온 것이므로 남기지 않습니다. "continue 뒤에 to 가 왔다"는 판별에 결정적이지만
   그것만으로 문장을 되짚을 수는 없습니다. */
const FUNCTION_WORDS = new Set(
  ("about above across after against along among around as at back before behind below beneath " +
   "beside besides between beyond but by despite down during except for from in inside into like " +
   "near of off on onto out outside over past round since than through throughout till to toward " +
   "towards under underneath until up upon with within without " +
   "away forth together apart aside ahead " +
   "not no never ever again still yet already just only even too so very much many few " +
   "and or if while when where because though although unless whether that which who whom whose " +
   "a an the this these those " +
   "be am is are was were been being have has had having do does did done will would shall should " +
   "can could may might must ought used need dare")
    .split(/\s+/),
);

/* ── 문장 지문 ───────────────────────────────────────────── */
/* 문장 자체는 어디에도 저장하지 않습니다. 대신 지문만 남겨서 "같은 문장을 여러 사람이
   물어봤다"를 셀 수 있게 합니다.
   소금(DICT_FP_SALT)이 반드시 필요합니다. 소금 없이 해시만 남기면, 책 원문을 가진
   사람이 전수 대조로 "이 사용자가 이 문장을 읽었다"를 되짚을 수 있습니다.
   그건 저작권 문제가 아니라 사생활 문제입니다. 소금이 없으면 지문을 안 남깁니다. */
async function sentFp(sentence: string): Promise<string | null> {
  const salt = Deno.env.get("DICT_FP_SALT") ?? "";
  if (!salt || !sentence) return null;
  const norm = sentence.trim().toLowerCase().replace(/\s+/g, " ");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + "\n" + norm));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* 누른 낱말의 앞뒤 한 칸. 기능어 목록에 있을 때만 남깁니다. */
function neighbors(sentence: string, word: string, clicked: string) {
  const t = tokens(sentence);
  const targets = new Set([word.toLowerCase(), clicked.toLowerCase()]);
  let i = t.findIndex((x) => targets.has(x));
  if (i < 0) {
    const stem = word.toLowerCase().slice(0, Math.max(4, word.length - 2));
    i = stem.length >= 4 ? t.findIndex((x) => x.startsWith(stem)) : -1;
  }
  if (i < 0) return { before: null, after: null };
  const keep = (x?: string) => (x && FUNCTION_WORDS.has(x) ? x : null);
  return { before: keep(t[i - 1]), after: keep(t[i + 1]) };
}

/* ── AI 호출 ─────────────────────────────────────────────── */
type Ask = { prompt: string; maxTokens: number; schema?: unknown; system?: string };

async function callGemini(key: string, ask: Ask) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const base: Record<string, unknown> = {
    maxOutputTokens: ask.maxTokens,
    temperature: 0.2,
  };
  /* Gemini 의 responseSchema 는 OpenAPI 의 일부만 받습니다 — Claude 쪽 스키마를 그대로
     보내면 400 이 납니다. 여기서는 "JSON 으로 답하라"까지만 하고 모양은 프롬프트에 맡깁니다.
     모양이 어긋나도 parseJson 이 받아 냅니다. */
  if (ask.schema) base.responseMimeType = "application/json";

  const withNoThinking = { ...base, thinkingConfig: { thinkingBudget: 0 } };
  /* 1차는 생각 끄기(토큰 절약). 모델이 그 설정을 모르면 400 이 나므로 그때만 2차로 재시도합니다. */
  for (const cfg of [withNoThinking, base]) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: ask.system ?? SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: ask.prompt }] }],
        generationConfig: cfg,
      }),
    });
    if (r.ok) {
      const d = await r.json();
      const text = d?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p?.text ?? "").join("") ?? "";
      return { text: text.trim(), usage: d?.usageMetadata ?? null };
    }
    console.error("gemini error", r.status, (await r.text()).slice(0, 300));
    if (r.status !== 400) throw new Error(`gemini_${r.status}`);
  }
  throw new Error("gemini_400");
}

async function callClaude(key: string, ask: Ask) {
  const body: Record<string, unknown> = {
    model: CLAUDE_MODEL,
    max_tokens: ask.maxTokens,
    system: ask.system ?? SYSTEM,
    messages: [{ role: "user", content: ask.prompt }],
  };
  /* 구조화 출력. 모양이 보장되므로 파싱 실패로 두 배 비용을 내는 재시도가 없습니다. */
  if (ask.schema) body.output_config = { format: { type: "json_schema", schema: ask.schema } };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    console.error("claude error", r.status, (await r.text()).slice(0, 300));
    throw new Error(`claude_${r.status}`);
  }
  const d = await r.json();
  return { text: (d?.content?.[0]?.text ?? "").trim(), usage: d?.usage ?? null };
}

function providerKeys() {
  const gKey = Deno.env.get("GEMINI_API_KEY");
  const cKey = Deno.env.get("ANTHROPIC_API_KEY");
  let provider = (Deno.env.get("AI_PROVIDER") ?? "").toLowerCase();
  if (provider !== "gemini" && provider !== "claude") provider = gKey ? "gemini" : (cKey ? "claude" : "");
  return { gKey, cKey, provider };
}

async function ask(a: Ask) {
  const { gKey, cKey, provider } = providerKeys();
  if (!provider || (provider === "gemini" && !gKey) || (provider === "claude" && !cKey)) {
    throw new Error("server_not_configured");
  }
  try {
    const out = provider === "gemini" ? await callGemini(gKey!, a) : await callClaude(cKey!, a);
    return { ...out, provider };
  } catch (e) {
    const alt = provider === "gemini" ? cKey : gKey;
    if (!alt) throw e;
    console.warn("primary provider failed, falling back:", String(e));
    const out = provider === "gemini" ? await callClaude(cKey!, a) : await callGemini(gKey!, a);
    return { ...out, provider: provider === "gemini" ? "claude" : "gemini" };
  }
}

/* 구조화 출력을 쓰면 여기까지 올 일이 거의 없습니다. Gemini 쪽 보험으로만 남깁니다. */
function parseJson(raw: string): Record<string, unknown> | null {
  try { return JSON.parse(raw); } catch { /* 아래에서 한 번 더 */ }
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* 포기 */ } }
  return null;
}

/* ── op:"look" — 이 문장에서 이 낱말은 무슨 뜻인가 ───────── */
const LOOK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["lemma", "pos", "ko", "note", "alts", "colloc"],
  properties: {
    lemma: { type: "string" },
    pos: { type: "string" },
    ko: { type: "string" },
    note: { type: "string" },
    alts: { type: "array", items: { type: "string" } },
    colloc: { type: "array", items: { type: "string" } },
  },
};

function lookPrompt(word: string, clicked: string, sentence: string, avoid: string[]) {
  const form = clicked && clicked.toLowerCase() !== word.toLowerCase()
    ? `단어: ${word} (문장에서는 "${clicked}")` : `단어: ${word}`;
  const skip = avoid.length ? `\n이 뜻들은 이미 보여 줬으니 고르지 마세요: ${avoid.join(", ")}\n` : "";
  return `${form}
문장: ${sentence || "(문장 없음 — 일반적인 뜻으로 답하세요)"}
${skip}
이 문장에서 이 단어가 어떤 뜻으로 쓰였는지 판단하세요.

- lemma: 사전 표제어(원형). 고유명사나 약어면 그대로
- pos: 명사|동사|형용사|부사|전치사|기타 중 하나
- ko: 이 문장에서의 뜻. 한국어로 8자 내외. 설명이 아니라 사전에 실릴 짧은 뜻
- note: 이 문장에서 어떻게 쓰였는지 한국어 한 문장. 사전 뜻을 되풀이하지 말고,
  이 문장을 봐야 알 수 있는 것을 쓰세요. 정말 뻔하면 빈 문자열
- alts: 이 단어의 다른 흔한 뜻 2~3개. 한국어로 짧게. ko 와 겹치지 않게
- colloc: 이 뜻과 자주 함께 쓰이는 표현 2~3개. 사용자 문장을 베끼지 말고 일반 지식으로

{"lemma":"","pos":"","ko":"","note":"","alts":[""],"colloc":[""]}`;
}

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const cleanList = (v: unknown, n: number, max: number) =>
  (Array.isArray(v) ? v : []).map((x) => clean(x, max)).filter(Boolean).slice(0, n);

async function opLook(body: any, userId: string | null) {
  const word = clean(body.word, 60).toLowerCase();
  const clicked = clean(body.clicked, 60);
  const sentence = clean(body.sentence, 600);
  const avoid = cleanList(body.avoid, 4, 40);
  const retry = !!body.retry;

  /* AI 가 뜻의 유일한 출처가 되었으니, 로그인과 한도가 유일한 문지기입니다.
     둘 중 하나에 걸리면 앱은 조용히 무료 사전으로 내려갑니다 — 화면이 비지는 않습니다. */
  if (!userId) return json({ error: "login_required" }, 401);
  if (!(await takeQuota(userId))) {
    logEvent({ userId, action: "quota", word, clicked, sentence });
    return json({ error: "quota_exceeded", limit: DAILY_LIMIT }, 429);
  }

  const out = await ask({
    prompt: lookPrompt(word, clicked, sentence, avoid),
    maxTokens: 350,
    schema: LOOK_SCHEMA,
  });
  const parsed = parseJson(out.text);
  if (!parsed) return json({ error: "parse_failed", raw: out.text.slice(0, 300) }, 502);

  /* 원형은 앱이 만들어 둔 후보 안에서만 받습니다. AI 가 자유롭게 정하게 두면
     "running"은 run, "ran"은 다른 것을 주는 날이 오고 캐시가 갈라집니다. */
  const cands = cleanList(body.cands, 8, 60).map((c) => c.toLowerCase());
  const aiLemma = clean(parsed.lemma, 60).toLowerCase();
  const lemma = cands.includes(aiLemma) || aiLemma === word ? aiLemma : (word || cands[0] || "");

  const ko = clean(parsed.ko, 60);
  const answer = {
    lemma,
    pos: clean(parsed.pos, 12),
    ko,
    note: clean(parsed.note, 300),
    alts: cleanList(parsed.alts, 3, 40).filter((a) => a !== ko),
    colloc: cleanList(parsed.colloc, 3, 60),
    provider: out.provider,
  };
  if (!answer.ko) return json({ error: "empty_answer" }, 502);

  logEvent({
    userId, action: retry ? "retry" : "look", word, clicked, sentence,
    lemma, pos: answer.pos, aiKo: answer.ko, provider: out.provider,
    book: clean(body.book, 200),
    meta: { alts: answer.alts.length, note: answer.note ? 1 : 0, avoid: avoid.length },
  });
  return json(answer);
}

/* ── op:"log" — 사람이 무엇을 했는가 ─────────────────────── */
/* 낱말·뜻은 상품이지만 이 기록은 아닙니다. AI 도 한도도 쓰지 않습니다. */
const LOG_ACTIONS = new Set(["edit", "pick", "star", "known"]);

async function opLog(body: any, userId: string | null) {
  if (!userId) return json({ ok: false, reason: "anonymous" });
  const action = clean(body.action, 20);
  if (!LOG_ACTIONS.has(action)) return json({ error: "bad_action" }, 400);
  await logEvent({
    userId, action,
    word: clean(body.word, 60).toLowerCase(),
    clicked: clean(body.clicked, 60),
    sentence: clean(body.sentence, 600),
    lemma: clean(body.lemma, 60),
    aiKo: clean(body.ai_ko, 60),
    userKo: clean(body.user_ko, 60),
    book: clean(body.book, 200),
    meta: (body.meta && typeof body.meta === "object") ? body.meta : {},
  });
  return json({ ok: true });
}

type EventIn = {
  userId: string | null; action: string; word: string; clicked?: string; sentence?: string;
  lemma?: string; pos?: string; aiKo?: string; userKo?: string; provider?: string;
  book?: string; meta?: Record<string, unknown>;
};

async function logEvent(e: EventIn) {
  try {
    const sentence = e.sentence ?? "";
    const nb = sentence ? neighbors(sentence, e.word, e.clicked ?? "") : { before: null, after: null };
    await SR.from("dict_events").insert({
      user_id: e.userId,
      action: e.action,
      word: e.word,
      clicked: e.clicked || null,
      lemma: e.lemma || null,
      pos: e.pos || null,
      ai_ko: e.aiKo || null,
      user_ko: e.userKo || null,
      sent_fp: await sentFp(sentence),
      sent_len: sentence ? tokens(sentence).length : null,
      cue_before: nb.before,
      cue_after: nb.after,
      book_fp: await sentFp(e.book ?? ""),
      provider: e.provider || null,
      meta: e.meta ?? {},
    });
  } catch (err) {
    /* 기록이 실패해도 사전은 답해야 합니다. */
    console.warn("log failed", String(err));
  }
}

/* ── 하루 한도 ───────────────────────────────────────────── */
async function takeQuota(userId: string) {
  const { data, error } = await SR.rpc("take_ai_quota", { p_user: userId, p_limit: DAILY_LIMIT });
  if (error) { console.warn("quota check failed, allowing:", error.message); return true; }
  return data !== false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const op = String(body.op ?? "look").trim();

    /* 함수를 깨우기만 하는 요청. 문단이 화면에 들어올 때 한 번 옵니다.
       콜드스타트가 첫 낱말 클릭 뒤에 숨지 않고 그 앞에서 끝나도록. */
    if (op === "warm") return json({ ok: true });

    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (token) {
      const { data } = await SR.auth.getUser(token);
      userId = data?.user?.id ?? null;
    }

    if (op === "log") return await opLog(body, userId);

    const word = String(body.word ?? "").slice(0, 60).trim();
    if (!/^[A-Za-z][A-Za-z'’\- ]*$/.test(word)) return json({ error: "bad_word" }, 400);
    if (op === "look") return await opLook(body, userId);
    return json({ error: "bad_op" }, 400);
  } catch (e) {
    console.error(e);
    const message = String(e);
    if (message.includes("server_not_configured")) return json({ error: "server_not_configured" }, 500);
    return json({ error: "internal", message }, 500);
  }
});
