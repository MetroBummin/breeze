// Breeze — 사전 Edge Function (Gemini / Claude 겸용)
// Supabase 대시보드 → Edge Functions → Deploy a new function → Via Editor
// 함수 이름: dict   ← 반드시 이 이름
//
// 필요한 Secret (Edge Functions → Secrets):
//   GEMINI_API_KEY      ← Google AI Studio 키  (무료 티어)
//   ANTHROPIC_API_KEY   ← Claude 키            (유료, 선택)
//   AI_PROVIDER         ← "gemini" 또는 "claude". 없으면 있는 키를 자동 선택
//   AI_DAILY_LIMIT      ← 한 사람 하루 AI 호출 한도. 없으면 200
//
// 먼저 sql/supabase_dict.sql 을 실행해 두어야 합니다.
//
// ── 하는 일이 셋으로 나뉩니다 ────────────────────────────────
//   op:"entry"    낱말 항목을 만든다        무겁다 · 낱말당 전 세계에서 딱 한 번
//   op:"pick"     이 문장은 몇 번 뜻인가    가볍다 · 공짜 방법부터 · AI 는 최후에 8토큰
//   op:"explain"  이 문장에서 왜 그 뜻인가  중간   · 사용자가 단추를 눌렀을 때만
//
// 예전에는 셋 다 한 프롬프트에 max_tokens 500 이었습니다. 숫자 하나만 받으면 되는
// 질문에도 사전을 새로 쓸 자리를 잡아 두고 기다린 셈입니다.

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

/* 사전 표는 앱이 직접 읽지 않습니다. 이 함수만 service_role 로 손댑니다.
   그래야 로그인하지 않은 사람도 공용 사전을 쓸 수 있습니다 — 가장 싼 길이 캐시 적중인데
   로그인 안 했다고 그 길을 막으면 앞뒤가 안 맞습니다. */
const SR = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

/* ── 낱말 쪼개기 ─────────────────────────────────────────── */
const tokens = (s: string) => String(s || "").toLowerCase().match(/[a-z']+/g) ?? [];

/* 판별 근거로 남길 수 있는 기능어. 닫힌 목록입니다 — 여기 없는 낱말은
   사용자 문장에서 새로 길어 온 것이므로 절대 저장하지 않습니다. */
const FUNCTION_WORDS = new Set(
  ("about above across after against along among around as at back before behind below beneath " +
   "beside besides between beyond but by despite down during except for from in inside into like " +
   "near of off on onto out outside over past round since than through throughout till to toward " +
   "towards under underneath until up upon with within without " +
   "away back forth together apart aside ahead over under out up down off on in " +
   "not no never ever again still yet already just only even too so very much many few " +
   "and or if while when where because though although unless whether that which who whom whose " +
   "be am is are was were been being have has had having do does did done will would shall should " +
   "can could may might must ought used need dare get got gets getting make makes made keep keeps")
    .split(/\s+/),
);

/* ── AI 호출 ─────────────────────────────────────────────── */
type Ask = { prompt: string; maxTokens: number; schema?: unknown; system?: string };

/* 뜻 번호 하나만 받을 때는 JSON 을 시키지 않습니다. `{"no":1}` 은 8토큰을 넘겨 잘립니다. */
const PICK_SYSTEM =
  "You choose the correct dictionary sense for a word in a sentence. " +
  "Reply with the sense number only. No words, no punctuation.";

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
  /* 구조화 출력. 모양이 보장되므로 "코드펜스가 섞여도 살려내는" 파서가 필요 없습니다.
     파싱 실패로 인한 재시도는 비용이 두 배로 드는 실패였습니다. */
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

/* ── op:"entry" — 낱말 항목 ──────────────────────────────── */
const ENTRY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["lemma", "pos", "senses"],
  properties: {
    lemma: { type: "string" },
    pos: { type: "string" },
    senses: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ko", "def", "gloss", "colloc"],
        properties: {
          ko: { type: "string" },
          def: { type: "string" },
          gloss: { type: "string" },
          colloc: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

const entryPrompt = (word: string) => `단어: ${word}

이 단어의 사전 항목을 만드세요. 특정 문장이 아니라 일반 지식으로만 씁니다.

- lemma: 사전 표제어(원형). 고유명사나 약어면 그대로
- pos: 명사|동사|형용사|부사|전치사|기타 중 하나
- senses: 주요 뜻 2~4개. 흔한 것부터
  - ko: 한국어 뜻. 8자 내외로 짧게
  - def: 영어 학습자용 쉬운 영어 정의 한 문장
  - gloss: 이 뜻이 어떤 때 쓰이는지 한국어 한 문장. 예문을 쓰지 말고 성질을 설명하세요
  - colloc: 이 뜻과 함께 자주 쓰이는 표현 2~3개 (일반 지식으로만)

{"lemma":"","pos":"","senses":[{"ko":"","def":"","gloss":"","colloc":[""]}]}`;

async function readEntry(lang: string, word: string, uiLang: string) {
  const { data } = await SR.from("dict_shared")
    .select("*").eq("lang", lang).eq("word", word).eq("ui_lang", uiLang).maybeSingle();
  return data ?? null;
}

/* 응답은 예전 모양(ko / ko_all / en)을 그대로 포함합니다.
   앱이 새 함수와 옛 함수 중 무엇을 만나든 화면이 비지 않게 하기 위해서입니다. */
function entryResponse(row: Record<string, any>, senseNo: number | null, extra: Record<string, unknown> = {}) {
  const senses = (row.senses ?? []).filter((s: any) => !s.deprecated);
  const chosen = senses.find((s: any) => s.no === senseNo) ?? senses[0] ?? null;
  return {
    lemma: row.lemma ?? row.word,
    pos: row.pos ?? "",
    kind: row.kind ?? "word",
    senses: senses.map((s: any) => ({
      no: s.no, ko: s.ko, def: s.def, gloss: s.gloss ?? "", colloc: s.colloc ?? [],
    })),
    sense_no: chosen ? chosen.no : null,
    ko: chosen ? chosen.ko : "",
    ko_all: senses.map((s: any) => s.ko).filter(Boolean).slice(0, 5),
    en: chosen ? chosen.def : "",
    gloss: chosen ? (chosen.gloss ?? "") : "",
    note: "",
    ...extra,
  };
}

async function opEntry(body: any, userId: string | null) {
  const lang = "en", uiLang = "ko";
  const word = String(body.word ?? "").slice(0, 60).trim().toLowerCase();
  /* 앱이 이미 만들어 둔 원형 후보를 함께 받습니다. 원형을 AI 가 정하게 두면
     "running"은 run 을 주고 "ran"은 다른 걸 주는 날이 오고, 그때 한 낱말이 두 항목이 됩니다. */
  const cands: string[] = Array.isArray(body.cands)
    ? body.cands.map((c: unknown) => String(c).toLowerCase().trim()).filter(Boolean).slice(0, 8)
    : [];
  const order = [...new Set([word, ...cands])].filter(Boolean);

  for (const cand of order) {
    const row = await readEntry(lang, cand, uiLang);
    if (row) {
      SR.from("dict_shared").update({ hits: (row.hits ?? 0) + 1 })
        .eq("lang", lang).eq("word", cand).eq("ui_lang", uiLang).then(() => {}, () => {});
      return json(entryResponse(row, null, { from_cache: true }));
    }
  }

  /* 여기까지 왔으면 아무도 물어본 적 없는 낱말입니다. 이때만 AI 를 부릅니다 —
     그리고 이 비용은 소모가 아니라 자산입니다. 다음 사람부터는 위에서 끝납니다. */
  if (!userId) return json({ miss: true, reason: "login_required" });
  if (!(await takeQuota(userId))) return json({ error: "quota_exceeded" }, 429);

  const out = await ask({ prompt: entryPrompt(word), maxTokens: 700, schema: ENTRY_SCHEMA });
  const parsed = parseJson(out.text);
  if (!parsed) return json({ error: "parse_failed", raw: out.text.slice(0, 300) }, 502);

  const aiLemma = String(parsed.lemma ?? word).toLowerCase().trim();
  const lemma = order.includes(aiLemma) ? aiLemma : order[0];
  const rawSenses = Array.isArray(parsed.senses) ? parsed.senses.slice(0, 4) : [];
  if (!rawSenses.length) return json({ error: "empty_senses" }, 502);

  /* 새 행이므로 번호는 1..N 로 시작합니다. 뜻을 나중에 더할 때는 next_sense_no() 를 씁니다 —
     배열 길이를 세어 번호를 붙이면 언젠가 두 사람이 같은 번호를 받습니다. */
  const senses = rawSenses.map((s: any, i: number) => ({
    no: i + 1,
    ko: String(s.ko ?? "").trim(),
    def: String(s.def ?? "").trim(),
    gloss: String(s.gloss ?? "").trim(),
    colloc: Array.isArray(s.colloc) ? s.colloc.map((c: unknown) => String(c).trim()).filter(Boolean).slice(0, 3) : [],
  })).filter((s: any) => s.ko);

  const row = {
    lang, word: lemma, ui_lang: uiLang, kind: String(body.kind ?? "word"),
    lemma, pos: String(parsed.pos ?? "").trim(), senses,
    sense_seq: senses.length, source: "ai", model: out.provider, updated_at: new Date().toISOString(),
  };
  await SR.from("dict_shared").upsert(row, { onConflict: "lang,word,ui_lang", ignoreDuplicates: true });
  const stored = await readEntry(lang, lemma, uiLang);
  return json(entryResponse(stored ?? row, null, { from_cache: false, provider: out.provider }));
}

/* ── op:"pick" — 이 문장은 몇 번 뜻인가 ──────────────────── */
/* 1) 연어 대조  2) 쌓인 단서 대조  3) 그래도 못 가리면 AI(8토큰)
   3까지 가더라도 그 답을 단서로 남깁니다. 다음 사람은 2에서 끝납니다. */

function pickByColloc(senses: any[], sentence: string, head: string) {
  const sent = new Set(tokens(sentence));
  let best: any = null, bestScore = 0, hit = "";
  for (const s of senses) {
    for (const c of s.colloc ?? []) {
      const keys = tokens(c).filter((t) =>
        t.length >= 3 && !FUNCTION_WORDS.has(t) && !t.startsWith(head) && !head.startsWith(t));
      if (!keys.length) continue;
      const score = keys.filter((t) => sent.has(t)).length / keys.length;
      if (score > bestScore) { bestScore = score; best = s; hit = c; }
    }
  }
  return bestScore >= 0.5 ? { no: best.no, hit } : null;
}

async function pickByCues(lang: string, word: string, sentence: string) {
  const { data } = await SR.from("sense_cues")
    .select("sense_no,cue,n").eq("lang", lang).eq("word", word);
  if (!data || !data.length) return null;
  const sent = new Set(tokens(sentence));
  const score = new Map<number, number>();
  for (const row of data) {
    if (!sent.has(row.cue)) continue;
    score.set(row.sense_no, (score.get(row.sense_no) ?? 0) + row.n);
  }
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return null;
  const [top, n] = ranked[0];
  const runnerUp = ranked[1]?.[1] ?? 0;
  /* 근거가 얇거나 2등과 비슷하면 아무 말도 하지 않습니다.
     반쯤 확신한 답을 내놓는 것이 모른다고 하는 것보다 나쁩니다. */
  if (n < 5 || n < runnerUp * 2) return null;
  return { no: top, n };
}

function cuesFrom(sentence: string, senses: any[], head: string) {
  const allowed = new Set(FUNCTION_WORDS);
  for (const s of senses) for (const c of s.colloc ?? []) for (const t of tokens(c)) allowed.add(t);
  return [...new Set(tokens(sentence))]
    .filter((t) => t !== head && allowed.has(t)).slice(0, 8);
}

async function opPick(body: any, userId: string | null) {
  const lang = "en", uiLang = "ko";
  const word = String(body.word ?? "").slice(0, 60).trim().toLowerCase();
  const sentence = String(body.sentence ?? "").slice(0, 600).trim();
  const row = await readEntry(lang, word, uiLang);
  if (!row) return json({ error: "no_entry" }, 404);
  const senses = (row.senses ?? []).filter((s: any) => !s.deprecated);
  if (senses.length < 2) return json({ no: senses[0]?.no ?? null, by: "only" });

  const byColloc = pickByColloc(senses, sentence, word);
  if (byColloc) return json({ no: byColloc.no, by: "colloc", hit: byColloc.hit });

  const byCue = await pickByCues(lang, word, sentence);
  if (byCue) return json({ no: byCue.no, by: "cue" });

  if (!userId) return json({ no: senses[0].no, by: "default" });
  if (!(await takeQuota(userId))) return json({ no: senses[0].no, by: "default" });

  const menu = senses.map((s: any) => `${s.no}. ${s.ko} — ${s.def}`).join("\n");
  const out = await ask({
    prompt: `문장: ${sentence}\n단어: ${word}\n\n${menu}\n\n이 문장에서 쓰인 뜻의 번호만 쓰세요. 숫자 하나.`,
    maxTokens: 8,
    system: PICK_SYSTEM,
  });
  const no = Number((out.text.match(/\d+/) ?? [])[0]);
  const chosen = senses.find((s: any) => s.no === no) ?? senses[0];

  /* AI 의 답을 규칙으로 굳힙니다. 문장도, 낱말 순서도 남기지 않습니다 —
     기능어와 colloc 안에 이미 있던 토큰만 한 칸씩 셉니다. */
  for (const cue of cuesFrom(sentence, senses, word)) {
    SR.rpc("bump_sense_cue", { p_lang: lang, p_word: word, p_sense: chosen.no, p_cue: cue })
      .then(() => {}, () => {});
  }
  return json({ no: chosen.no, by: "ai", provider: out.provider });
}

/* ── op:"explain" — 이 문장에서 왜 그 뜻인가 ─────────────── */
const EXPLAIN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["note"],
  properties: { note: { type: "string" } },
};

async function opExplain(body: any, userId: string | null) {
  if (!userId) return json({ error: "login_required" }, 401);
  if (!(await takeQuota(userId))) return json({ error: "quota_exceeded" }, 429);
  const word = String(body.word ?? "").slice(0, 60).trim();
  const sentence = String(body.sentence ?? "").slice(0, 600).trim();
  const ko = String(body.ko ?? "").slice(0, 80).trim();
  if (!sentence) return json({ error: "no_sentence" }, 400);

  const out = await ask({
    prompt: `문장: ${sentence}\n단어: ${word}${ko ? `\n뜻: ${ko}` : ""}

이 문장에서 이 단어가 무엇을 가리키는지 한국어 한 문장으로 쓰세요.
사전 뜻을 다시 말하지 말고, 이 문장에서만 알 수 있는 것을 쓰세요.
뻔하면 빈 문자열을 쓰세요.

{"note":""}`,
    maxTokens: 200,
    schema: EXPLAIN_SCHEMA,
  });
  const parsed = parseJson(out.text);
  /* 문장도 설명도 여기서 끝입니다. 어느 표에도 쓰지 않습니다. */
  return json({ note: String(parsed?.note ?? "").trim(), provider: out.provider });
}

/* ── 옛 앱을 위한 길 ─────────────────────────────────────── */
/* 함수를 먼저 배포하고 앱을 나중에 올리는 동안, 옛 앱은 op 없이 {word, sentence} 를 보냅니다.
   그 사이 사전이 죽지 않도록 예전 모양 그대로 답해 줍니다. */
async function opLegacy(body: any, userId: string | null) {
  if (!userId) return json({ error: "login_required" }, 401);
  const entry = await opEntry({ ...body, cands: body.cands ?? [] }, userId);
  const data = await entry.json();
  if (data.error || data.miss) return json(data, entry.status);
  const explained = await opExplain({ ...body, ko: data.ko }, userId).catch(() => null);
  const note = explained ? (await explained.json()).note ?? "" : "";
  return json({ ...data, note });
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
    const op = String(body.op ?? "").trim();

    const word = String(body.word ?? "").slice(0, 60).trim();
    if (op !== "explain" && !/^[A-Za-z][A-Za-z'’\- ]*$/.test(word)) {
      return json({ error: "bad_word" }, 400);
    }

    /* 로그인은 이제 문 앞이 아니라 AI 앞에 있습니다.
       공용 사전을 읽는 것은 누구나 할 수 있어야 합니다. */
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (token) {
      const { data } = await SR.auth.getUser(token);
      userId = data?.user?.id ?? null;
    }

    if (op === "entry") return await opEntry(body, userId);
    if (op === "pick") return await opPick(body, userId);
    if (op === "explain") return await opExplain(body, userId);
    if (!op) return await opLegacy(body, userId);
    return json({ error: "bad_op" }, 400);
  } catch (e) {
    console.error(e);
    const message = String(e);
    if (message.includes("server_not_configured")) return json({ error: "server_not_configured" }, 500);
    return json({ error: "internal", message }, 500);
  }
});
