// Breeze — two-stage rolling book typography Edge Function
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

const VERSION = 2;
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

type Join = { i:number; n:number };
type Segment = Item & { k:number; n:number };
type Usage = Record<string, unknown> | null;

const BOUNDARY_SYSTEM =
  "You restore paragraph boundaries in extracted books. Preserve every source character and its order. " +
  "Do not classify headings or quotes. Never rewrite, summarize, translate, quote, or return the source text. " +
  "Return only a compact JSON boundary map.";

const ROLE_SYSTEM =
  "You classify already-restored book paragraphs for typography. Paragraph boundaries are final. " +
  "Never join, split, rewrite, summarize, translate, quote, or return the source text. " +
  "Return exactly one compact JSON role for every supplied segment.";

const BOUNDARY_SCHEMA = {
  type:"object",
  additionalProperties:false,
  required:["joins"],
  properties:{
    joins:{
      type:"array",
      items:{
        type:"object",
        additionalProperties:false,
        required:["i", "n"],
        properties:{
          i:{ type:"integer" },
          n:{ type:"integer", minimum:2, maximum:12 },
        },
      },
    },
  },
};

const ROLE_SCHEMA = {
  type:"object",
  additionalProperties:false,
  required:["roles"],
  properties:{
    roles:{
      type:"array",
      items:{
        type:"object",
        additionalProperties:false,
        required:["k", "r", "b"],
        properties:{
          k:{ type:"integer" },
          r:{ type:"string", enum:["p", "h1", "h2", "h3", "quote", "note"] },
          b:{ type:"string", enum:["none", "section", "page"] },
        },
      },
    },
  },
};

function layoutText(item: Item) {
  return [
    `size=${item.z.toFixed(2)}`,
    item.w ? "bold" : "",
    item.c ? "center" : "",
    item.d >= 0.05 ? `indent=${item.d.toFixed(2)}` : "",
  ].filter(Boolean).join(",");
}

function buildBoundaryPrompt(title: string, from: number, to: number, items: Item[]) {
  const lines = items.map(item => `${item.i}|${layoutText(item)}|${item.t}`).join("\n");
  return `책 제목: ${title || "(unknown)"}
검토 범위: 추출 문단 ${from} 이상 ${to} 미만

1단계 작업은 오직 문단 경계 복원입니다.
각 줄은 "원문 문단번호|PDF/EPUB 조판 단서|원문"입니다.

${lines}

출력 형식:
{"joins":[{"i":합치기 시작 문단,"n":연속해서 합칠 문단 수}]}

규칙:
- PDF 줄바꿈 때문에 하나의 문단이나 하나의 제목이 여러 조각으로 잘린 경우에만 합치세요.
- 서로 독립된 완전한 문단, 대사, 목록 항목은 절대 합치지 마세요.
- 앞 조각이 완전한 문장으로 끝나고 다음 조각이 새 문장으로 시작하면 보통 별도 문단입니다.
- 이미 올바른 경계는 출력하지 않습니다. 줄바꿈 유지가 기본값입니다.
- 이미지([IMAGE])를 다른 문단과 합치지 마세요.
- i는 ${from} 이상 ${to} 미만, n은 2~12이며 범위끼리 겹치면 안 됩니다.
- 제목·본문·인용문 역할은 여기서 판단하지 마세요.
- 책 글자는 절대 출력하지 말고 JSON만 출력하세요.`;
}

function buildRolePrompt(title: string, segments: Segment[]) {
  const lines = segments.map(segment =>
    `${segment.k}|source=${segment.i}..${segment.i + segment.n - 1},current=${segment.r},${layoutText(segment)}|${segment.t}`
  ).join("\n");
  return `책 제목: ${title || "(unknown)"}

2단계 작업은 완성된 문단의 마크다운 역할 판정입니다.
각 줄은 "구간번호|원문 위치와 임시 조판/PDF·EPUB 단서|경계가 확정된 원문"입니다.

${lines}

출력 형식:
{"roles":[{"k":구간번호,"r":"p|h1|h2|h3|quote|note","b":"none|section|page"}]}

규칙:
- 모든 구간에 대해 정확히 하나씩, k 오름차순으로 출력하세요. p도 생략하지 마세요.
- h1=Part/Book급, h2=Chapter급, h3=짧은 소제목입니다.
- 여러 완전한 문장으로 이루어진 긴 문단은 제목이 아닙니다. 대문자로 시작한다는 이유만으로 제목으로 만들지 마세요.
- 짧은 대사·사람 이름·문장 조각을 제목으로 만들지 마세요.
- quote는 독립된 인용문·편지·시·경구, note는 연습문제·활동 상자·역주에만 씁니다.
- 문단 안에 따옴표가 일부 있다는 이유만으로 전체를 quote로 만들지 마세요.
- b=page는 큰 Part/Chapter 앞, b=section은 장면 전환이나 강한 구분 앞, 나머지는 none입니다.
- 경계는 이미 확정됐습니다. 문단을 합치거나 나누지 마세요.
- 문단을 삭제하는 역할은 없습니다. 애매하면 p를 선택하세요.
- 책 글자는 절대 출력하지 말고 JSON만 출력하세요.`;
}

async function callGemini(
  key: string,
  prompt: string,
  system: string,
  schema: Record<string, unknown>,
) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const base: Record<string, unknown> = {
    system_instruction: { parts: [{ text:system }] },
    contents: [{ role:"user", parts:[{ text:prompt }] }],
    generationConfig: {
      responseMimeType:"application/json",
      responseJsonSchema:schema,
      maxOutputTokens:4096,
      temperature:0,
    },
  };
  const noThinking = structuredClone(base);
  (noThinking.generationConfig as Record<string, unknown>).thinkingConfig = { thinkingBudget:0 };

  for (const body of [noThinking, base]) {
    const response = await fetch(url, {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body:JSON.stringify(body),
    });
    if (response.ok) {
      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts
        ?.map((part: { text?:string }) => part.text || "").join("") || "";
      return { text, usage:(data?.usageMetadata || null) as Usage };
    }
    const detail = await response.text();
    console.error("gemini format error", response.status, detail.slice(0, 300));
    if (response.status !== 400) throw new Error(`gemini_${response.status}`);
  }
  throw new Error("gemini_400");
}

async function callClaude(
  key: string,
  prompt: string,
  system: string,
  schema: Record<string, unknown>,
  toolName: string,
) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{
      "content-type":"application/json",
      "x-api-key":key,
      "anthropic-version":"2023-06-01",
    },
    body:JSON.stringify({
      model:CLAUDE_MODEL,
      max_tokens:4096,
      temperature:0,
      system,
      messages:[{ role:"user", content:prompt }],
      tools:[{
        name:toolName,
        description:"Submit the validated typography decision map.",
        input_schema:schema,
      }],
      tool_choice:{ type:"tool", name:toolName },
    }),
  });
  if (!response.ok) {
    console.error("claude format error", response.status, (await response.text()).slice(0, 300));
    throw new Error(`claude_${response.status}`);
  }
  const data = await response.json();
  const toolUse = data?.content?.find((block: { type?:string; name?:string }) =>
    block.type === "tool_use" && block.name === toolName
  );
  return { text:JSON.stringify(toolUse?.input || {}), usage:(data?.usage || null) as Usage };
}

function parseJson(raw: string): Record<string, unknown> | null {
  const text = String(raw || "").trim();
  try { return JSON.parse(text); } catch { /* try a fenced response */ }
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

async function runStage(
  preferred: string,
  prompt: string,
  system: string,
  schema: Record<string, unknown>,
  toolName: string,
  geminiKey?: string,
  claudeKey?: string,
) {
  const invoke = (provider: string) => provider === "gemini"
    ? callGemini(geminiKey!, prompt, system, schema)
    : callClaude(claudeKey!, prompt, system, schema, toolName);
  try {
    return { provider:preferred, output:await invoke(preferred) };
  } catch (error) {
    const fallback = preferred === "gemini" ? "claude" : "gemini";
    const fallbackKey = fallback === "gemini" ? geminiKey : claudeKey;
    if (!fallbackKey) throw error;
    return { provider:fallback, output:await invoke(fallback) };
  }
}

function joinLooksSafe(items: Item[], i: number, n: number) {
  const selected = items.filter(item => item.i >= i && item.i < i + n);
  if (selected.length !== n || selected.some(item => item.t === "[IMAGE]")) return false;
  let hasBrokenBoundary = false;
  for (let index = 0; index < selected.length - 1; index++) {
    const left = selected[index].t.trim();
    const right = selected[index + 1].t.trim();
    const leftComplete = /[.!?]["'”’)]?$/.test(left);
    const rightStartsNew = /^[A-ZÀ-Þ0-9“"'‘]/.test(right);
    if (!leftComplete || !rightStartsNew) hasBrokenBoundary = true;
  }
  return hasBrokenBoundary;
}

function normalizeJoins(raw: unknown, from: number, to: number, items: Item[]) {
  if (!Array.isArray(raw) || raw.length > items.length) return null;
  const joins: Join[] = [];
  let lastEnd = from;
  for (const value of raw) {
    const join = (value || {}) as Record<string, unknown>;
    const i = Math.floor(Number(join.i));
    const n = Math.max(2, Math.min(12, Math.floor(Number(join.n) || 2)));
    if (!Number.isFinite(i) || i < from || i + n > to || i < lastEnd) return null;
    if (!joinLooksSafe(items, i, n)) continue;
    joins.push({ i, n });
    lastEnd = i + n;
  }
  return joins;
}

function buildSegments(items: Item[], from: number, to: number, joins: Join[]) {
  const byId = new Map(items.map(item => [item.i, item]));
  const joinByStart = new Map(joins.map(join => [join.i, join]));
  const segments: Segment[] = [];
  let cursor = from;
  while (cursor < to) {
    const first = byId.get(cursor)!;
    if (!first || first.t === "[IMAGE]") { cursor++; continue; }
    const join = joinByStart.get(cursor);
    const n = join ? join.n : 1;
    const members = Array.from({ length:n }, (_, offset) => byId.get(cursor + offset)!);
    segments.push({
      k:segments.length,
      i:cursor,
      n,
      t:members.map(item => item.t).join(" "),
      r:first.r,
      z:Math.max(...members.map(item => item.z)),
      w:members.some(item => item.w),
      c:members.every(item => item.c),
      d:members.reduce((sum, item) => sum + item.d, 0) / members.length,
    });
    cursor += n;
  }
  return segments;
}

function safeHeadingRole(segment: Segment, role: string) {
  if (!role.startsWith("h")) return role;
  const limits: Record<string, { chars:number; words:number; spans:number }> = {
    h1:{ chars:120, words:18, spans:3 },
    h2:{ chars:180, words:28, spans:4 },
    h3:{ chars:240, words:40, spans:4 },
  };
  const limit = limits[role];
  const text = segment.t.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const sentenceEnds = (text.match(/[.!?](?=(?:["'”’\])]|\s|$))/g) || []).length;
  if (!limit || text.length > limit.chars || words > limit.words
      || segment.n > limit.spans || sentenceEnds > 1) return "p";
  return role;
}

function normalizeRoles(raw: unknown, segments: Segment[]) {
  if (!Array.isArray(raw) || raw.length !== segments.length) return null;
  const ops: Array<{ i:number; n:number; r:string; j:boolean; b:string }> = [];
  for (let index = 0; index < raw.length; index++) {
    const value = (raw[index] || {}) as Record<string, unknown>;
    const segment = segments[index];
    const k = Math.floor(Number(value.k));
    const requestedRole = String(value.r || "");
    if (k !== index || !ROLES.has(requestedRole)) return null;
    const role = safeHeadingRole(segment, requestedRole);
    let before = BREAKS.has(String(value.b || "")) ? String(value.b) : "none";
    if (requestedRole.startsWith("h") && role === "p" && before === "page") before = "none";
    if (before === "page" && role !== "h1" && role !== "h2") before = "section";
    ops.push({ i:segment.i, n:segment.n, r:role, j:segment.n > 1, b:before });
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
    let preferred = (Deno.env.get("AI_PROVIDER") || "").toLowerCase();
    if (preferred !== "gemini" && preferred !== "claude") {
      preferred = geminiKey ? "gemini" : (claudeKey ? "claude" : "");
    }
    if (!preferred || (preferred === "gemini" && !geminiKey)
        || (preferred === "claude" && !claudeKey)) {
      return json({ error:"server_not_configured" }, 500);
    }

    const title = String(body.title || "").slice(0, 160);
    const boundaryStage = await runStage(
      preferred,
      buildBoundaryPrompt(title, from, to, items),
      BOUNDARY_SYSTEM,
      BOUNDARY_SCHEMA,
      "submit_boundaries",
      geminiKey,
      claudeKey,
    );
    const boundaryJson = parseJson(boundaryStage.output.text);
    const joins = normalizeJoins(boundaryJson?.joins, from, to, items);
    if (!joins) return json({ error:"boundary_parse_failed" }, 502);

    const segments = buildSegments(items, from, to, joins);
    if (!segments.length) {
      return json({ version:VERSION, from, to, ops:[], provider:boundaryStage.provider,
                    usage:{ boundaries:boundaryStage.output.usage, roles:null } });
    }

    const roleStage = await runStage(
      boundaryStage.provider,
      buildRolePrompt(title, segments),
      ROLE_SYSTEM,
      ROLE_SCHEMA,
      "submit_roles",
      geminiKey,
      claudeKey,
    );
    const roleJson = parseJson(roleStage.output.text);
    const ops = normalizeRoles(roleJson?.roles, segments);
    if (!ops) return json({ error:"role_parse_failed" }, 502);

    const provider = boundaryStage.provider === roleStage.provider
      ? roleStage.provider
      : `${boundaryStage.provider}->${roleStage.provider}`;
    return json({
      version:VERSION,
      from,
      to,
      ops,
      provider,
      stages:{ joins:joins.length, segments:segments.length },
      usage:{ boundaries:boundaryStage.output.usage, roles:roleStage.output.usage },
    });
  } catch (error) {
    console.error(error);
    return json({ error:"internal", message:String(error) }, 500);
  }
});
