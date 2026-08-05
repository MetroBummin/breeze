// Breeze — AI 사전 Edge Function (Gemini / Claude 겸용)
// Supabase 대시보드 → Edge Functions → Deploy a new function → Via Editor
// 함수 이름: dict   ← 반드시 이 이름
//
// 필요한 Secret (Edge Functions → Secrets):
//   GEMINI_API_KEY      ← Google AI Studio 키  (무료 티어)
//   ANTHROPIC_API_KEY   ← Claude 키            (유료, 선택)
//   AI_PROVIDER         ← "gemini" 또는 "claude". 없으면 있는 키를 자동 선택
//
// 둘 다 넣어두고 AI_PROVIDER 하나만 바꾸면 즉시 전환됩니다.

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
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

const SYSTEM =
  "You are a precise bilingual dictionary for Korean learners reading English books. " +
  "Reply with ONLY minified JSON. No markdown, no code fence, no commentary.";

function buildPrompt(word: string, sentence: string) {
  return `단어: ${word}
${sentence ? `문장: ${sentence}` : "(문장 정보 없음)"}

아래 JSON 형식으로만 답하세요.

{"lemma":"사전 표제어(원형). 고유명사나 약어면 그대로",
 "pos":"명사|동사|형용사|부사|전치사|기타",
 "ko":"위 문장의 문맥에 맞는 한국어 뜻. 8자 내외로 짧게",
 "ko_all":["문맥과 무관한 주요 뜻 2~4개를 짧게"],
 "en":"영어 학습자용 쉬운 영어 정의 한 문장",
 "note":"이 문장에서 어떤 의미로 쓰였는지 한국어 한 문장. 뻔하면 빈 문자열"}

규칙:
- ko 는 반드시 위 문장의 문맥에 맞는 뜻이어야 합니다. 사전 첫 번째 뜻을 그냥 쓰지 마세요.
- 문장에서 비유적/관용적으로 쓰였다면 그 의미를 반영하세요.
- ko_all 에는 ko 와 겹치는 뜻을 넣지 마세요.`;
}

/* ── Gemini ─────────────────────────────────────────────── */
async function callGemini(key: string, prompt: string) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const base: Record<string, unknown> = {
    system_instruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 1024,
      temperature: 0.2,
    },
  };

  // 1차: thinking 끄기 (토큰 절약). 지원하지 않는 경우 2차로 재시도.
  const withNoThinking = structuredClone(base);
  (withNoThinking.generationConfig as Record<string, unknown>).thinkingConfig = {
    thinkingBudget: 0,
  };

  for (const body of [withNoThinking, base]) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      const d = await r.json();
      const text = d?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p?.text ?? "").join("") ?? "";
      return { text, usage: d?.usageMetadata ?? null };
    }
    const detail = await r.text();
    console.error("gemini error", r.status, detail.slice(0, 300));
    if (r.status !== 400) throw new Error(`gemini_${r.status}`);
    // 400 이면 thinkingConfig 미지원 가능성 → 다음 루프에서 재시도
  }
  throw new Error("gemini_400");
}

/* ── Claude ─────────────────────────────────────────────── */
async function callClaude(key: string, prompt: string) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!r.ok) {
    console.error("claude error", r.status, (await r.text()).slice(0, 300));
    throw new Error(`claude_${r.status}`);
  }
  const d = await r.json();
  return { text: (d?.content?.[0]?.text ?? "").trim(), usage: d?.usage ?? null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    // ── 1) 로그인한 사용자만 허용 (키 남용 방지) ──────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: "login_required" }, 401);

    // ── 2) 입력 검증 ─────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const word = String(body.word ?? "").slice(0, 60).trim();
    const sentence = String(body.sentence ?? "").slice(0, 600).trim();
    if (!/^[A-Za-z][A-Za-z'’\- ]*$/.test(word)) return json({ error: "bad_word" }, 400);

    // ── 3) 공급자 선택 ───────────────────────────────────────────
    const gKey = Deno.env.get("GEMINI_API_KEY");
    const cKey = Deno.env.get("ANTHROPIC_API_KEY");
    let provider = (Deno.env.get("AI_PROVIDER") ?? "").toLowerCase();
    if (provider !== "gemini" && provider !== "claude") {
      provider = gKey ? "gemini" : (cKey ? "claude" : "");
    }
    if (provider === "gemini" && !gKey) return json({ error: "server_not_configured" }, 500);
    if (provider === "claude" && !cKey) return json({ error: "server_not_configured" }, 500);
    if (!provider) return json({ error: "server_not_configured" }, 500);

    const prompt = buildPrompt(word, sentence);
    let out;
    try {
      out = provider === "gemini"
        ? await callGemini(gKey!, prompt)
        : await callClaude(cKey!, prompt);
    } catch (e) {
      // 한 쪽이 실패하면 다른 키가 있으면 자동 대체
      const alt = provider === "gemini" ? cKey : gKey;
      if (!alt) return json({ error: "upstream", detail: String(e) }, 502);
      console.warn("primary provider failed, falling back:", String(e));
      out = provider === "gemini"
        ? await callClaude(cKey!, prompt)
        : await callGemini(gKey!, prompt);
      provider = provider === "gemini" ? "claude" : "gemini";
    }

    // ── 4) JSON 파싱 (코드펜스가 섞여도 살려냄) ────────────────────
    const raw = (out.text ?? "").trim();
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
    }
    if (!parsed) return json({ error: "parse_failed", raw: raw.slice(0, 300) }, 502);

    // ── 5) 정규화해서 반환 ───────────────────────────────────────
    return json({
      lemma: String(parsed.lemma ?? word).trim(),
      pos: String(parsed.pos ?? "").trim(),
      ko: String(parsed.ko ?? "").trim(),
      ko_all: Array.isArray(parsed.ko_all)
        ? parsed.ko_all.map((x) => String(x).trim()).filter(Boolean).slice(0, 4)
        : [],
      en: String(parsed.en ?? "").trim(),
      note: String(parsed.note ?? "").trim(),
      provider,
      usage: out.usage,
    });
  } catch (e) {
    console.error(e);
    return json({ error: "internal", message: String(e) }, 500);
  }
});
