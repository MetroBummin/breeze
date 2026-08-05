// Breeze — rolling book typography Edge Function
// Deploy as a Supabase Edge Function named: format
// Secrets: GEMINI_API_KEY and/or ANTHROPIC_API_KEY, optional AI_PROVIDER.

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, "Content-Type": "application/json" },
});

const VERSION = 1;
const GEMINI_MODEL = Deno.env.get("FORMAT_GEMINI_MODEL") || "gemini-3.5-flash-lite";
const CLAUDE_MODEL = Deno.env.get("FORMAT_CLAUDE_MODEL") || "claude-haiku-4-5-20251001";
const ROLES = new Set(["p", "h1", "h2", "h3", "quote", "note"]);
const BREAKS = new Set(["none", "section", "page"]);

type Item = {
  i: number;
  t: string;
  r: string;
  z: number;
  w: boolean;
  c: boolean;
  d: number;
};

const SYSTEM =
  "You are a meticulous book typographer. Preserve every source character. " +
  "Never rewrite, summarize, translate, quote, or return the book text. " +
  "Return only a compact JSON position map.";

const OUTPUT_SCHEMA = {
  type:"object",
  additionalProperties:false,
  required:["ops"],
  properties:{
    ops:{
      type:"array",
      items:{
        type:"object",
        additionalProperties:false,
        required:["i", "n", "r", "j", "b"],
        properties:{
          i:{ type:"integer" },
          n:{ type:"integer", minimum:1, maximum:12 },
          r:{ type:"string", enum:["p", "h1", "h2", "h3", "quote", "note"] },
          j:{ type:"boolean" },
          b:{ type:"string", enum:["none", "section", "page"] },
        },
      },
    },
  },
};

function buildPrompt(title: string, from: number, to: number, items: Item[]) {
  const lines = items.map(item => {
    const layout = [
      `current=${item.r}`,
      `size=${item.z.toFixed(2)}`,
      item.w ? "bold" : "",
      item.c ? "center" : "",
      item.d >= 0.05 ? `indent=${item.d.toFixed(2)}` : "",
    ].filter(Boolean).join(",");
    return `${item.i}|${layout}|${item.t}`;
  }).join("\n");

  return `책 제목: ${title || "(unknown)"}
검토 범위: 문단 ${from} 이상 ${to} 미만

각 줄은 "문단번호|현재 임시 조판과 PDF/EPUB 단서|원문"입니다.
현재 임시 조판은 참고만 하고, 원문 문맥을 읽어 더 정갈한 종이책 구조를 결정하세요.

${lines}

출력 형식:
{"ops":[{"i":시작문단,"n":묶을문단수,"r":"p|h1|h2|h3|quote|note","j":true|false,"b":"none|section|page"}]}

규칙:
- 목록에 없는 문단은 모두 평범한 본문 p입니다. 본문 p를 일일이 출력하지 마세요.
- h1=Part급, h2=Chapter급, h3=소제목입니다. 짧은 대사·사람 이름·문장 조각을 제목으로 만들지 마세요.
- quote는 인용문·편지·시·경구, note는 연습문제·활동 상자·역주에만 씁니다.
- PDF에서 제목이나 한 문단이 여러 조각으로 갈라진 경우 n과 j=true로 합치세요. 합칠 때 앱이 원문 사이에 공백만 넣습니다.
- 독립된 문단끼리는 합치지 마세요. 줄바꿈을 없애야 확실히 같은 문단인 경우에만 j=true입니다.
- b=page는 큰 Part/Chapter 앞, b=section은 장면 전환이나 강한 문단 구분 앞, 나머지는 none입니다.
- 문단을 삭제하는 역할은 없습니다. 광고·머리글처럼 보여도 p로 남겨 원문 손실을 막습니다.
- i는 ${from} 이상 ${to} 미만, n은 1~12, 서로 겹치지 않고 i 오름차순이어야 합니다.
- 책 글자는 절대 출력하지 말고 JSON만 출력하세요.`;
}

async function callGemini(key: string, prompt: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const base: Record<string, unknown> = {
    system_instruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: OUTPUT_SCHEMA,
      maxOutputTokens: 4096,
    },
  };
  const noThinking = structuredClone(base);
  (noThinking.generationConfig as Record<string, unknown>).thinkingConfig = { thinkingBudget: 0 };

  for (const body of [noThinking, base]) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) {
      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text || "").join("") || "";
      return { text, usage: data?.usageMetadata || null };
    }
    const detail = await response.text();
    console.error("gemini format error", response.status, detail.slice(0, 300));
    if (response.status !== 400) throw new Error(`gemini_${response.status}`);
  }
  throw new Error("gemini_400");
}

async function callClaude(key: string, prompt: string) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
      tools:[{
        name:"submit_typography",
        description:"Submit the validated book typography position map.",
        input_schema:OUTPUT_SCHEMA,
      }],
      tool_choice:{ type:"tool", name:"submit_typography" },
    }),
  });
  if (!response.ok) {
    console.error("claude format error", response.status, (await response.text()).slice(0, 300));
    throw new Error(`claude_${response.status}`);
  }
  const data = await response.json();
  const toolUse = data?.content?.find((block: { type?:string; name?:string }) =>
    block.type === "tool_use" && block.name === "submit_typography"
  );
  return { text: JSON.stringify(toolUse?.input || {}), usage: data?.usage || null };
}

function parseJson(raw: string): Record<string, unknown> | null {
  const text = String(raw || "").trim();
  try { return JSON.parse(text); } catch { /* try a fenced response */ }
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function normalizeOps(raw: unknown, from: number, to: number, items: Item[]) {
  if (!Array.isArray(raw) || raw.length > items.length) return null;
  const itemIds = new Set(items.filter(item => item.t !== "[IMAGE]").map(item => item.i));
  const ops: Array<{ i:number; n:number; r:string; j:boolean; b:string }> = [];
  let lastEnd = from;

  for (const value of raw) {
    const op = (value || {}) as Record<string, unknown>;
    const i = Math.floor(Number(op.i));
    const n = Math.max(1, Math.min(12, Math.floor(Number(op.n) || 1)));
    const r = String(op.r || "");
    const b = BREAKS.has(String(op.b || "")) ? String(op.b) : "none";
    if (!Number.isFinite(i) || i < from || i + n > to || i < lastEnd || !ROLES.has(r)) return null;
    for (let index = i; index < i + n; index++) if (!itemIds.has(index)) return null;
    ops.push({ i, n, r, j:!!op.j, b });
    lastEnd = i + n;
  }
  return ops;
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers:CORS });
  if (request.method !== "POST") return json({ error:"POST only" }, 405);

  try {
    const authorization = request.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global:{ headers:{ Authorization:authorization } } },
    );
    const { data:{ user } } = await supabase.auth.getUser();
    if (!user) return json({ error:"login_required" }, 401);

    const body = await request.json().catch(() => ({}));
    if (Number(body.version) !== VERSION) return json({ error:"bad_version" }, 400);
    const from = Math.max(0, Math.floor(Number(body.from) || 0));
    const to = Math.max(from + 1, Math.floor(Number(body.to) || 0));
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!rawItems.length || rawItems.length > 140) return json({ error:"bad_items" }, 400);

    const items: Item[] = rawItems.map((raw: Record<string, unknown>) => ({
      i:Math.max(0, Math.floor(Number(raw.i) || 0)),
      t:String(raw.t || "").replace(/\s+/g, " ").slice(0, 3000).trim(),
      r:ROLES.has(String(raw.r || "")) ? String(raw.r) : "p",
      z:Math.max(0.5, Math.min(4, Number(raw.z) || 1)),
      w:!!raw.w,
      c:!!raw.c,
      d:Math.max(0, Math.min(1, Number(raw.d) || 0)),
    }));
    if (items[0].i !== from || items[items.length - 1].i + 1 !== to) {
      return json({ error:"window_mismatch" }, 400);
    }
    for (let index = 1; index < items.length; index++) {
      if (items[index].i !== items[index - 1].i + 1) return json({ error:"non_contiguous" }, 400);
    }
    const totalChars = items.reduce((sum, item) => sum + item.t.length, 0);
    if (totalChars > 30000) return json({ error:"batch_too_big" }, 400);

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const claudeKey = Deno.env.get("ANTHROPIC_API_KEY");
    let provider = (Deno.env.get("AI_PROVIDER") || "").toLowerCase();
    if (provider !== "gemini" && provider !== "claude") {
      provider = geminiKey ? "gemini" : (claudeKey ? "claude" : "");
    }
    if (!provider || (provider === "gemini" && !geminiKey) || (provider === "claude" && !claudeKey)) {
      return json({ error:"server_not_configured" }, 500);
    }

    const prompt = buildPrompt(String(body.title || "").slice(0, 160), from, to, items);
    let output;
    try {
      output = provider === "gemini"
        ? await callGemini(geminiKey!, prompt)
        : await callClaude(claudeKey!, prompt);
    } catch (error) {
      const fallback = provider === "gemini" ? claudeKey : geminiKey;
      if (!fallback) return json({ error:"upstream", detail:String(error) }, 502);
      output = provider === "gemini"
        ? await callClaude(claudeKey!, prompt)
        : await callGemini(geminiKey!, prompt);
      provider = provider === "gemini" ? "claude" : "gemini";
    }

    const parsed = parseJson(output.text);
    const ops = normalizeOps(parsed?.ops, from, to, items);
    if (!ops) return json({ error:"parse_failed" }, 502);
    return json({ version:VERSION, from, to, ops, provider, usage:output.usage });
  } catch (error) {
    console.error(error);
    return json({ error:"internal", message:String(error) }, 500);
  }
});
