// Breeze — 사전 Edge Function (Gemini / Claude 겸용)
// Supabase 대시보드 → Edge Functions → Deploy a new function → Via Editor
// 함수 이름: dict   ← 반드시 이 이름
//
// 필요한 Secret (Edge Functions → Secrets):
//   GEMINI_API_KEY      ← Google AI Studio 키  (무료 티어)
//   ANTHROPIC_API_KEY   ← Claude 키            (유료, 선택)
//   AI_PROVIDER         ← "gemini" 또는 "claude". 없으면 있는 키를 자동 선택
//   AI_DAILY_LIMIT      ← 한 사람 하루 AI 호출 한도. 없으면 200
//   AI_ANON_FREE        ← 로그인 전 기기당 평생 무료 횟수. 없으면 10
//   AI_ANON_DAILY_CAP   ← 로그인 전 요청 전체의 하루 상한(차단기). 없으면 2000
//   AI_EXPLAIN_DAILY    ← 한 사람 하루 문장 설명 횟수. 없으면 5
//   DICT_FP_SALT        ← 문장 지문에 섞는 아무 긴 문자열. 없으면 지문을 아예 안 남깁니다
//
// 먼저 sql/supabase_dict.sql 을 실행해 두어야 합니다.
//
// ── 하는 일 ──────────────────────────────────────────────────
//   op:"look"    낱말 + 문장 → 이 문장에서의 뜻 · 설명 · 다른 뜻 후보
//   op:"explain" 문장 하나 → 해석 + 왜 어려운지.  로그인 필수, 하루 5번
//   op:"warm"   함수만 깨운다. AI 를 부르지 않고 한도도 쓰지 않는다
//   op:"log"    사람이 무엇을 했는지 남긴다. AI 도, 한도도 안 씀
//   op:"delete_account"  이 사람이 서버에 가진 것을 전부 지우고 계정을 없앤다
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
/* 로그인 전에 그냥 써 볼 수 있는 횟수. 하루가 아니라 기기당 평생입니다 —
   맛보기지 무료 요금제가 아닙니다. */
const ANON_FREE = Number(Deno.env.get("AI_ANON_FREE") ?? 10);
/* 로그인 전 요청 전체의 하루 상한. 기기 표시는 지우면 새로 생기므로,
   예산을 지키는 진짜 벽은 이쪽입니다. */
const ANON_DAILY_CAP = Number(Deno.env.get("AI_ANON_DAILY_CAP") ?? 2000);
/* 문장 설명은 낱말 조회보다 답이 길어 서너 배 비쌉니다. 그리고 성격이 다릅니다 —
   낱말은 읽다가 계속 누르는 것이고, 문장은 "이건 도저히 안 읽힌다" 싶을 때
   한 번 쓰는 것입니다. 하루 다섯 번이면 그 쓰임에 모자라지 않습니다. */
const EXPLAIN_DAILY = Number(Deno.env.get("AI_EXPLAIN_DAILY") ?? 5);
/* 예전 꾹 누르기 UI가 남긴 기록과 새 버튼 UI의 사용량은 섞지 않습니다. 전자는
   화면을 닫은 뒤에도 요청이 끝나 기록될 수 있어, 실제로 본 횟수의 근거가 될 수 없었습니다. */
const EXPLAIN_QUOTA_VERSION = "button-v2";

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
  required: ["lemma", "pos", "ko", "gloss", "phrase"],
  properties: {
    lemma: { type: "string" },
    pos: { type: "string" },
    ko: { type: "string" },
    gloss: { type: "string" },
    phrase: { type: "string" },
  },
};

function lookPrompt(word: string, clicked: string, sentence: string, avoid: string[]) {
  const isPhrase = /\s/.test(word.trim());
  const form = isPhrase ? `표현: ${word}` : clicked && clicked.toLowerCase() !== word.toLowerCase()
    ? `단어: ${word} (문장에서는 "${clicked}")` : `단어: ${word}`;
  const skip = avoid.length ? `\n이 뜻들은 이미 보여 줬으니 고르지 마세요: ${avoid.join(", ")}\n` : "";
  return `${form}
문장: ${sentence || "(문장 없음 — 일반적인 뜻으로 답하세요)"}
${skip}
이 문장에서 이 ${isPhrase ? "표현 전체가" : "단어가"} 어떤 뜻으로 쓰였는지 판단하세요.

- lemma: 사전 표제어(원형). 표현이면 표현 전체를 그대로, 고유명사나 약어면 그대로
- pos: 명사|동사|형용사|부사|전치사|기타 중 하나
- ko: 이 문장에서의 뜻. 한국어로 8자 내외. 설명이 아니라 사전에 실릴 짧은 뜻
- gloss: 이 뜻이 어떤 때 쓰이는지 한국어 한 문장으로 설명하세요. 예문을 쓰지 말고
  뜻의 성질을 설명하세요. ("어떤 행동이나 상태가 멈추지 않고 이어질 때 씁니다")
- phrase: 이 문장에서 클릭한 단어를 포함해 **통째로 알아야 뜻이 달라지는** 아주 확실한
  고정 표현 하나만 적으세요. (예: "hot take", "per se", "prime minister")
  단순히 자주 붙는 단어, 애매한 조합, 문장 전체는 절대 넣지 말고 빈 문자열로 두세요.

{"lemma":"","pos":"","ko":"","gloss":"","phrase":""}`;
}

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const cleanList = (v: unknown, n: number, max: number) =>
  (Array.isArray(v) ? v : []).map((x) => clean(x, max)).filter(Boolean).slice(0, n);

async function opLook(body: any, userId: string | null, seeding = false) {
  const word = clean(body.word, 60).toLowerCase();
  const clicked = clean(body.clicked, 60);
  const sentence = clean(body.sentence, 600);
  const avoid = cleanList(body.avoid, 4, 40);
  const retry = !!body.retry;

  /* AI 가 뜻의 유일한 출처가 되었으니, 한도가 유일한 문지기입니다. 걸리면 앱은
     조용히 무료 사전으로 내려갑니다 — 화면이 비지는 않습니다. */
  let anonLeft: number | null = null;
  if (seeding) {
    /* 씨앗 만들기는 한도를 지나갑니다 — 위에서 비밀값을 이미 확인했습니다. */
  } else if (!userId) {
    const verdict = await takeAnonQuota(clean(body.device, 64));
    if (verdict.status === "spent") {
      logEvent({ userId: null, action: "quota", word, clicked, sentence, meta: { anon: 1 } });
      return json({ error: "anon_exhausted", free: ANON_FREE }, 429);
    }
    /* 기기 표시가 없거나(옛 앱) 하루 상한에 걸렸으면 로그인을 권합니다.
       둘은 원인이 다르지만 사용자가 할 수 있는 일은 같습니다. */
    if (verdict.status !== "ok") return json({ error: "login_required" }, 401);
    anonLeft = Math.max(0, ANON_FREE - (verdict.calls ?? ANON_FREE));
  } else if (!(await takeQuota(userId))) {
    logEvent({ userId, action: "quota", word, clicked, sentence });
    return json({ error: "quota_exceeded", limit: DAILY_LIMIT }, 429);
  }

  const out = await ask({
    prompt: lookPrompt(word, clicked, sentence, avoid),
    maxTokens: 450,
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
  const gloss = clean(parsed.gloss, 300);
  const answer = {
    lemma,
    pos: clean(parsed.pos, 12),
    ko,
    gloss,
    phrase: clean(parsed.phrase, 80),
    provider: out.provider,
    /* 로그인 전이면 몇 번 남았는지 함께 돌려줍니다. 마지막 한두 번쯤에
       미리 알려 줘야, 다음 낱말에서 갑자기 막히지 않습니다. */
    ...(anonLeft === null ? {} : { left: anonLeft }),
  };
  if (!answer.ko) return json({ error: "empty_answer" }, 502);

  /* 씨앗은 사람이 읽다가 누른 것이 아닙니다. 행동 기록에 섞이면
     "이 낱말을 사람들이 많이 눌렀다" 가 거짓이 됩니다. */
  if (seeding) return json(answer);

  logEvent({
    userId, action: retry ? "retry" : "look", word, clicked, sentence,
    lemma, pos: answer.pos, aiKo: answer.ko, provider: out.provider,
    book: clean(body.book, 200),
    meta: { gloss: answer.gloss ? 1 : 0, phrase: answer.phrase ? 1 : 0,
            avoid: avoid.length, ...(anonLeft === null ? {} : { anon: 1 }) },
  });
  return json(answer);
}

/* ── op:"explain" — 이 문장은 어떻게 읽는가 ──────────────────

   낱말을 다 알아도 문장이 안 읽히는 때가 있습니다. 관계절이 겹쳤거나,
   도치됐거나, 낱말은 쉬운데 합쳐 놓으니 다른 뜻이 되는 관용구일 때.
   그때 필요한 것은 뜻 하나가 아니라 "이 문장은 이렇게 읽는다" 입니다.

   ── 한도를 따로 세는 이유 ──
   `ai_usage` 를 같이 쓰면 문장 설명 다섯 번이 낱말 조회 다섯 번을 잡아먹습니다.
   둘은 성격이 달라서 한 통에 담으면 안 됩니다. 그래서 오늘 남긴 `explain`
   기록을 세는 것으로 한도를 삼습니다 — 표를 하나 더 만들지 않아도 되고,
   무엇보다 "실제로 답을 받은 횟수"를 세게 됩니다.
   동시에 두 번 들어오면 둘 다 통과할 수 있지만, 하루 다섯 번짜리 한도에서
   그건 문제가 아닙니다.

   ── 문장은 남지 않습니다 ──
   AI 에게는 보냅니다(보내지 않으면 답할 것이 없습니다). 표에 들어가는 것은
   소금을 섞은 지문과 낱말 수뿐입니다 — 낱말 조회와 완전히 같은 규칙입니다. */
const EXPLAIN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ko", "points"],
  properties: {
    ko: { type: "string" },
    points: { type: "array", items: { type: "string" } },
  },
};

function explainPrompt(sentence: string) {
  return `문장: ${sentence}

영어를 읽는 한국인에게 이 문장 하나를 설명하세요.

- ko: 문장 전체의 한국어 해석. 직역하지 말고 한국어로 자연스럽게 읽히게 쓰세요.
- points: 이 문장이 어려운 이유 2~3개. 각각 한국어 한 문장.
  문장의 뼈대(무엇이 주어이고 무엇이 동사인지), 겹친 관계절, 도치,
  생략된 것, 낱말 뜻만으로는 안 잡히는 관용구나 비유 같은 것을 짚으세요.
  쉬운 문장이면 억지로 세 개를 채우지 말고 하나만 쓰세요.
  낱말 하나의 뜻풀이는 쓰지 마세요 — 그건 낱말을 누르면 나옵니다.

{"ko":"","points":[""]}`;
}

function seoulDayBounds() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date()).reduce<Record<string, string>>((out, part) => { out[part.type] = part.value; return out; }, {});
  const year = Number(parts.year), month = Number(parts.month), day = Number(parts.day);
  const start = Date.UTC(year, month - 1, day) - 9 * 60 * 60 * 1000;
  return { day: `${parts.year}-${parts.month}-${parts.day}`, since: new Date(start).toISOString(), until: new Date(start + 86400000).toISOString() };
}

async function explainsToday(userId: string): Promise<{ used: number; day: string }> {
  const bounds = seoulDayBounds();
  const { count, error } = await SR.from("dict_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("action", "explain")
    .contains("meta", { quota_version: EXPLAIN_QUOTA_VERSION })
    .gte("at", bounds.since).lt("at", bounds.until);
  /* 셀 수 없으면 막습니다. 낱말 조회와 반대인데, 문장 설명은 값이 비싸고
     막혀도 낱말 사전은 그대로 열려 있기 때문입니다. */
  if (error) { console.warn("explain quota failed, refusing:", error.message); return { used: EXPLAIN_DAILY, day: bounds.day }; }
  return { used: count ?? 0, day: bounds.day };
}

async function opExplain(body: any, userId: string | null) {
  if (!userId) return json({ error: "login_required" }, 401);
  const sentence = clean(body.sentence, 600);
  if (sentence.length < 12) return json({ error: "bad_sentence" }, 400);
  const quota = await explainsToday(userId);
  if (quota.used >= EXPLAIN_DAILY) {
    logEvent({ userId, action: "quota", word: "", sentence, meta: { of: "explain", quota_version: EXPLAIN_QUOTA_VERSION, day: quota.day } });
    return json({ error: "quota_exceeded", limit: EXPLAIN_DAILY, left: 0, day: quota.day }, 429);
  }

  const out = await ask({
    prompt: explainPrompt(sentence),
    maxTokens: 600,
    schema: EXPLAIN_SCHEMA,
  });
  const parsed = parseJson(out.text);
  if (!parsed) return json({ error: "parse_failed", raw: out.text.slice(0, 300) }, 502);
  const ko = clean(parsed.ko, 500);
  if (!ko) return json({ error: "empty_answer" }, 502);
  const points = cleanList(parsed.points, 3, 300);

  await logEvent({
    userId, action: "explain", word: "", sentence,
    provider: out.provider, book: clean(body.book, 200),
    meta: { points: points.length, quota_version: EXPLAIN_QUOTA_VERSION, day: quota.day },
  });
  return json({ ko, points, provider: out.provider, left: Math.max(0, EXPLAIN_DAILY - quota.used - 1), day: quota.day });
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
/* 표가 고장 나면 통과시킵니다. 로그인한 사람은 누군지 알고 수가 정해져 있어서,
   잘못 열리는 쪽이 잘못 막히는 쪽보다 쌉니다. */
async function takeQuota(userId: string) {
  const { data, error } = await SR.rpc("take_ai_quota", { p_user: userId, p_limit: DAILY_LIMIT });
  if (error) { console.warn("quota check failed, allowing:", error.message); return true; }
  return data !== false;
}

/* 로그인 전 몫. 위와 반대로, 고장 나면 막습니다 — 로그인 전 요청은 수가 정해져
   있지 않아서, 열린 채로 두면 표 하나 고장 난 날 예산이 통째로 나갑니다. */
type AnonVerdict = { status: string; calls?: number };
async function takeAnonQuota(device: string): Promise<AnonVerdict> {
  if (!device) return { status: "bad_device" };
  const { data, error } = await SR.rpc("take_anon_quota", {
    p_device: device, p_limit: ANON_FREE, p_daily_cap: ANON_DAILY_CAP,
  });
  if (error) { console.warn("anon quota failed, refusing:", error.message); return { status: "closed" }; }
  return (data ?? { status: "closed" }) as AnonVerdict;
}

/* ================= 계정 지우기 =================
   로그인이 있는 앱은 앱 안에서 계정을 지울 수 있어야 합니다(App Store 심사
   지침 5.1.1(v)). 심사와 별개로, 나갈 문이 없는 저장소에 자기 것을 맡기라고
   할 수는 없습니다.

   순서가 전부입니다. auth 사용자를 먼저 지우면 남은 줄들은 주인을 잃고,
   주인이 없으면 두 번 다시 찾아가 지울 수 없습니다. 그래서 가진 것을 모두
   지운 뒤에 계정을 지웁니다 — 중간에 끊기면 다시 눌러 이어서 지웁니다.

   `ai_usage` 는 auth 사용자를 따라 저절로 지워지고(on delete cascade),
   `dict_events` 는 user_id 만 비도록 되어 있습니다. 하지만 계정을 지운다는
   말은 "내 것을 남기지 말아 달라"는 뜻이므로 여기서 손수 지웁니다. */
async function opDeleteAccount(userId: string | null) {
  if (!userId) return json({ error: "login_required" }, 401);

  const listed = await SR.storage.from("books").list(userId, { limit: 1000 });
  const files = (listed.data ?? []).map((file) => `${userId}/${file.name}`);
  if (files.length) {
    const removed = await SR.storage.from("books").remove(files);
    if (removed.error) {
      return json({ error: "delete_failed", message: removed.error.message }, 500);
    }
  }

  for (const table of ["words", "positions", "books", "dict_events", "ai_usage"]) {
    const { error } = await SR.from(table).delete().eq("user_id", userId);
    if (error) return json({ error: "delete_failed", message: error.message }, 500);
  }

  const { error } = await SR.auth.admin.deleteUser(userId);
  if (error) return json({ error: "delete_failed", message: error.message }, 500);
  return json({ ok: true });
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

    /* 앱에 실어 보낼 사전 씨앗을 만들 때만 쓰는 통로입니다. 맛보기 글에 나오는
       낱말 전부를 한 번에 받아 와야 해서 한도를 지나갑니다 — 그래서 비밀값을
       아는 사람만 쓸 수 있고, 값을 정해 두지 않으면 아예 열리지 않습니다.
       기록도 남기지 않습니다. 사람이 읽다가 누른 것이 아니니까요. */
    const seedToken = Deno.env.get("SEED_TOKEN") ?? "";
    const isSeed = op === "seed" && !!seedToken &&
      req.headers.get("x-seed-token") === seedToken;
    if (op === "seed" && !isSeed) return json({ error: "seed_forbidden" }, 403);

    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (token) {
      const { data } = await SR.auth.getUser(token);
      userId = data?.user?.id ?? null;
    }

    if (op === "log") return await opLog(body, userId);
    if (op === "delete_account") return await opDeleteAccount(userId);
    /* 아래의 낱말 검사보다 먼저 나갑니다 — 문장 설명에는 낱말이 없습니다. */
    if (op === "explain") return await opExplain(body, userId);

    const word = String(body.word ?? "").slice(0, 60).trim();
    if (!/^[A-Za-z][A-Za-z'’\- ]*$/.test(word)) return json({ error: "bad_word" }, 400);
    if (op === "look" || isSeed) return await opLook(body, userId, isSeed);
    return json({ error: "bad_op" }, 400);
  } catch (e) {
    console.error(e);
    const message = String(e);
    if (message.includes("server_not_configured")) return json({ error: "server_not_configured" }, 500);
    return json({ error: "internal", message }, 500);
  }
});
