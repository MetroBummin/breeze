// Legacy Supabase tidy Edge Function
//
// Disabled during the clean-code refactor on 2026-08-05.
// The table-of-contents button and its execution path were intentionally removed.
// Every legacy line below stays commented so it can be consulted without running.
//
// // Breeze — 반입 정리(AI) Edge Function
// // Supabase 대시보드 → Edge Functions → Deploy a new function → Via Editor
// // 함수 이름: tidy   ← 반드시 이 이름
// //
// // 필요한 Secret (dict 함수와 같은 것을 그대로 씁니다. 추가 설정 없음):
// //   GEMINI_API_KEY  /  ANTHROPIC_API_KEY  /  AI_PROVIDER
// //
// // ── 이 함수의 원칙 ────────────────────────────────────────────
// // AI는 책을 처음부터 끝까지 읽지만, **글자를 단 한 자도 돌려주지 않습니다.**
// // 돌려받는 것은 위치 지시뿐입니다 — 몇 번 문단이 제목이고, 어디가 인용문이고, 어디가 찌꺼기인지.
// // 제목 글자는 앱이 원문 문단에서 그대로 이어 붙여 만듭니다. AI가 지어낼 여지가 없습니다.
// // 그래서 원문이 바뀔 수 없고, 언제든 꺼서 원래대로 되돌릴 수 있습니다.
// //
// // 읽는 순서가 중요합니다:
// //   front  → 앞단을 자르고, 책이 스스로 적어 둔 목차 페이지를 찾습니다.
// //   blocks → 그 목차를 "정답지"로 들고 본문 전체를 순서대로 읽습니다.
// // 목차를 알고 읽으면 "이 짧은 줄이 제목인가 대사인가"를 추측할 필요가 없습니다.
// 
// import { createClient } from "jsr:@supabase/supabase-js@2";
// 
// const CORS = {
//   "Access-Control-Allow-Origin": "*",
//   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
//   "Access-Control-Allow-Methods": "POST, OPTIONS",
// };
// const json = (body: unknown, status = 200) =>
//   new Response(JSON.stringify(body), {
//     status,
//     headers: { ...CORS, "Content-Type": "application/json" },
//   });
// 
// const GEMINI_MODEL = "gemini-3.5-flash-lite";
// const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
// 
// const SYSTEM =
//   "You analyse the structure of a book that was extracted from a PDF/EPUB. " +
//   "You never rewrite or reproduce the text. You only report positions. " +
//   "Reply with ONLY minified JSON. No markdown, no code fence, no commentary.";
// 
// type Item = { i: number; t: string; n: number };
// type Cand = { i: number; t: string; x: string; z: number; b: boolean; c: boolean };
// 
// /* ── 1) 앞단 자르기 + 이 책이 스스로 적어 둔 목차 페이지 찾기 ────── */
// function promptFront(items: Item[], title: string) {
//   const list = items.map((x) => `${x.i}|${x.n}|${x.t}`).join("\n");
//   return `아래는 책 앞부분의 문단 목록입니다. 각 줄은 "문단번호|글자수|앞부분" 형식입니다.
// 
// ${list}
// 
// 두 가지를 찾아 주세요.
// 
// (1) **실제 본문이 시작되는 문단 번호**
// 본문이 아닌 것: 표지, 판권지, ISBN, 출판사 정보, 저작권 문구, 헌정사, 추천사,
// 감사의 말, 목차 페이지, 광고, 다른 책 소개.
// 저자가 쓴 서문(Preface/Introduction)의 **본문**은 본문으로 봅니다.
// 단, 목차 안에 있는 "Introduction"이라는 한 줄은 목차의 일부입니다.
// 
// (2) **이 책의 목차 페이지가 있으면 그 범위**
// "Contents", "Table Of Contents" 같은 제목 뒤에 장 제목이 줄줄이 나열된 부분입니다.
// 그 나열이 시작되는 문단 번호와 끝나는 문단 번호를 알려 주세요.
// 이 목록이 나중에 장 제목의 정답지로 쓰입니다. 없으면 -1.
// 
// 아래 JSON 형식으로만 답하세요.
// {"start": 본문이 시작되는 문단 번호(정수),
//  "tocFrom": 목차 나열이 시작되는 문단 번호(없으면 -1),
//  "tocTo": 목차 나열이 끝나는 문단 번호(없으면 -1),
//  "why": "start를 그렇게 정한 이유 한국어 한 문장",
//  "title": "책 제목으로 보이는 것. 모르면 빈 문자열",
//  "author": "저자로 보이는 것. 모르면 빈 문자열"}
// 
// 규칙:
// - tocFrom 에는 "Contents"라는 제목 줄 자체는 넣지 말고, 그 다음 항목부터 넣으세요.
// - start 는 tocTo 보다 뒤여야 합니다.
// - 잘라낼 것이 없으면 start 는 ${items.length ? items[0].i : 0}.
// - 확신이 없으면 덜 자르세요. 본문을 잘라내는 쪽이 훨씬 나쁩니다.
// - 파일 이름은 "${title}" 입니다. 참고만 하세요.`;
// }
// 
// /* ── 2) 구조 판정 ───────────────────────────────────────────────
//    앞뒤 맥락 없이 짧은 줄만 보면 대사와 제목을 구별할 수 없습니다.
//    그래서 문단을 **전문 그대로, 빠짐없이 순서대로** 받습니다.
//    그리고 책이 스스로 적어 둔 목차를 정답지로 함께 넘겨 줍니다.
//    목차를 알고 읽으면 "이 줄이 제목인가?"를 추측할 필요가 없어집니다.     */
// function promptBlocks(items: Item[], toc: string[], prev: string) {
//   const list = items.map((x) => `${x.i}|${x.t}`).join("\n");
// 
//   const tocBlock = toc.length
//     ? `\n■ 이 책이 스스로 적어 둔 목차 (정답지)
// 아래는 이 책의 목차 페이지에 실제로 적혀 있던 장 제목들입니다.
// 이 제목들은 본문 안에 **반드시 그대로 나옵니다**. 찾아서 head 로 표시해 주세요.
// PDF에서 뽑은 것이라 한 제목이 2~3줄로 쪼개져 있을 수 있습니다. n 으로 묶으세요.
// 이 목록에 있는 것은 전부 같은 단계(장)입니다.
// 
// ${toc.map((t, n) => `${n + 1}. ${t}`).join("\n")}
// 
// 이번 구간에 해당 장이 없으면 없는 대로 두세요. 억지로 맞추지 마세요.\n`
//     : "";
// 
//   const prevBlock = prev
//     ? `\n(참고: 바로 앞 구간에서 마지막으로 확인된 제목은 "${prev}" 였습니다.
// 그 다음 장부터 찾으면 됩니다.)\n`
//     : "";
// 
//   return `아래는 한 책의 문단 목록입니다. 빠진 번호 없이 순서대로, 글자를 자르지 않은 전문입니다.
// 각 줄은 "문단번호|문단 전문" 형식입니다.
// 
// ${list}
// ${tocBlock}${prevBlock}
// 이 책을 **종이책처럼 다시 조판**하려고 합니다. 각 문단이 무엇인지 알려 주세요.
// 
// ■ 종류(k)
// - "head"  : 부·장·절 제목
// - "quote" : 인용문, 편지, 일기, 시, 장 머리의 경구처럼 본문과 구분되어야 하는 덩어리
// - "note"  : 연습문제·활동 상자·역주·부록 안내처럼 본문 흐름에서 빠져 있는 상자
//             (원서에서 테두리 상자나 작은 글씨로 따로 조판되던 것)
// - "drop"  : 본문이 아닌 찌꺼기. 쪽 번호, 머리글, 워터마크, 광고, 잘린 조각
// 
// 본문 문단은 아무것도 적지 마세요. 목록에 없는 번호는 전부 본문으로 봅니다.
// 
// ■ 제목의 단계(l) — head 일 때만
// - 1 = 부(Part One, 제1부)   2 = 장(Chapter 3)   3 = 장 안의 절·소제목
// 부가 없는 책이면 장을 2로 두세요. 앱이 알아서 위로 끌어올립니다.
// 
// ■ 여러 문단에 걸친 덩어리 (n)
// PDF에서 뽑아낸 것이라 큰 글씨 제목이 줄 단위로 쪼개집니다. 예를 들어
// 
// 53|197|If the above traits sound good to you, your journey of
// 54|7|Chapter
// 55|12|The Nice Guy
// 56|8|Syndrome
// 57|71|"I'm a Nice Guy. I'm one of the nicest guys you're ever
// 
// 54·55·56은 따로가 아니라 합쳐서 "Chapter The Nice Guy Syndrome"이라는 제목 하나입니다.
// {"i":54,"n":3,"k":"head","l":2} 처럼 시작 번호와 합칠 개수를 주세요.
// quote·note 도 여러 문단으로 이어지면 n 으로 묶어 주세요(상자 하나로 그립니다).
// 
// 아래 JSON 형식으로만 답하세요.
// {"blocks":[{"i":시작 문단번호,"n":문단 수,"k":"head|quote|note|drop","l":1|2|3}]}
// 
// 규칙:
// - **위 정답지 목차에 있는 장을 빠뜨리지 마세요. 이것이 가장 중요합니다.**
// - head 의 n 은 보통 1이고, 쪼개진 제목일 때만 2~3 입니다.
// - quote·note 는 n 이 10까지 가능합니다. note 는 제목 줄까지 포함해서 묶으세요.
//   ("Breaking Free Activity #13" 과 그 아래 지시문은 하나의 note 입니다.)
// - 대사("Yes, sir."), 목록 항목, 문장 조각은 제목이 아닙니다.
//   단, 사람 이름 한 줄이 사례 소개의 소제목으로 반복해서 쓰이면 head l:3 으로 넣으세요.
// - 한 문단이 온전한 문장으로 끝나면(마침표·물음표·따옴표) 제목이 아니라 본문입니다.
// - drop 은 확실할 때만. 본문을 지우는 쪽이 훨씬 나쁩니다.
// - 애매하면 아무것도 적지 마세요(=본문으로 둡니다).
// - blocks 는 문단 번호 오름차순, 서로 겹치지 않게 주세요.`;
// }
// 
// /* ── 2b) 위계만 판정 (싼 경로) ──────────────────────────────────
//    본문을 보내지 않습니다. 앱이 조판(글자 크기·굵기·가운데 정렬)으로 뽑아 둔
//    제목 후보와, 각 후보 뒤에 오는 첫 문장만 받습니다. 후보가 50개 안팎이라
//    전권을 읽히는 것보다 토큰이 50배쯤 적게 듭니다.
//    AI가 할 일은 "찾기"가 아니라 "줄 세우기"입니다.                        */
// function promptLevels(items: Cand[], toc: string[], title: string) {
//   const list = items.map((x) =>
//     `${x.i}|z=${x.z}${x.b ? ",bold" : ""}${x.c ? ",center" : ""}|${x.t}` +
//     (x.x ? `\n    └ 뒤: ${x.x}` : "")
//   ).join("\n");
// 
//   const tocBlock = toc.length
//     ? `\n■ 이 책이 스스로 적어 둔 목차 (정답지)
// ${toc.map((t, n) => `${n + 1}. ${t}`).join("\n")}
// 
// **이 목록에 있는 것은 무조건 장(가장 큰 단위)입니다.** 후보 중에 이것과 같은 제목이
// 있으면 반드시 그 단계로 매기세요. 목록에 없는 후보는 그 아래 단계(소단원)로 봅니다.
// 다만 목록에 없더라도 명백히 새로운 장이 열리는 자리면 장으로 매겨도 됩니다.\n`
//     : `\n이 책은 목차 페이지가 없습니다. 후보들의 글자 크기(z)와 이름 생김새를 보고
// 직접 위계를 세워 주세요.\n`;
// 
//   return `아래는 한 책에서 뽑은 **제목 후보** 목록입니다.
// 각 줄은 "문단번호|조판정보|후보 글자" 이고, 그 아래 "└ 뒤:" 는 바로 뒤에 오는 문장입니다.
// z 는 본문 글자 대비 크기입니다(z=1.6 이면 본문의 1.6배). bold=굵게, center=가운데 정렬.
// 
// ${list}
// ${tocBlock}
// 각 후보가 몇 단계 제목인지, 아니면 제목이 아닌지 알려 주세요.
// 
// ■ 단계(l)
// - 1 = 부(Part One, 제1부)처럼 가장 큰 묶음
// - 2 = 장(Chapter 3)
// - 3 = 장 안의 절·소제목
// - 0 = **제목이 아님**(본문 강조, 대사, 저자 이름, 표지 문구, 날짜 줄 등)
// 
// ■ 판단 요령
// - 글자가 크다고 다 제목은 아닙니다. 표지의 부제, 저자 이름, 헌사는 0 입니다.
// - "└ 뒤:" 문장이 그 제목에서 새로 시작하는 이야기처럼 보이면 진짜 제목입니다.
// - 같은 z 값끼리는 대체로 같은 단계입니다. 크기가 클수록 윗 단계입니다.
// - 부(Part)가 없는 책이면 장을 2 로 두세요. 앱이 알아서 위로 끌어올립니다.
// - 사람 이름 한 줄이 사례 소개로 반복되면 3 으로 넣으세요.
// 
// 아래 JSON 형식으로만 답하세요. 받은 후보를 하나도 빠뜨리지 마세요.
// {"levels":[{"i":문단번호,"l":0|1|2|3}]}
// 
// 파일 이름은 "${title}" 입니다. 참고만 하세요.`;
// }
// 
// /* ── Gemini ─────────────────────────────────────────────── */
// async function callGemini(key: string, prompt: string, maxOut: number) {
//   const url =
//     `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
//   const base: Record<string, unknown> = {
//     system_instruction: { parts: [{ text: SYSTEM }] },
//     contents: [{ role: "user", parts: [{ text: prompt }] }],
//     generationConfig: {
//       responseMimeType: "application/json",
//       maxOutputTokens: maxOut,
//       temperature: 0,
//     },
//   };
//   const withNoThinking = structuredClone(base);
//   (withNoThinking.generationConfig as Record<string, unknown>).thinkingConfig = {
//     thinkingBudget: 0,
//   };
//   for (const body of [withNoThinking, base]) {
//     const r = await fetch(url, {
//       method: "POST",
//       headers: { "content-type": "application/json" },
//       body: JSON.stringify(body),
//     });
//     if (r.ok) {
//       const d = await r.json();
//       const text = d?.candidates?.[0]?.content?.parts
//         ?.map((p: { text?: string }) => p?.text ?? "").join("") ?? "";
//       return { text, usage: d?.usageMetadata ?? null };
//     }
//     const detail = await r.text();
//     console.error("gemini error", r.status, detail.slice(0, 300));
//     if (r.status !== 400) throw new Error(`gemini_${r.status}`);
//   }
//   throw new Error("gemini_400");
// }
// 
// /* ── Claude ─────────────────────────────────────────────── */
// async function callClaude(key: string, prompt: string, maxOut: number) {
//   const r = await fetch("https://api.anthropic.com/v1/messages", {
//     method: "POST",
//     headers: {
//       "content-type": "application/json",
//       "x-api-key": key,
//       "anthropic-version": "2023-06-01",
//     },
//     body: JSON.stringify({
//       model: CLAUDE_MODEL,
//       max_tokens: maxOut,
//       system: SYSTEM,
//       messages: [{ role: "user", content: prompt }],
//     }),
//   });
//   if (!r.ok) {
//     console.error("claude error", r.status, (await r.text()).slice(0, 300));
//     throw new Error(`claude_${r.status}`);
//   }
//   const d = await r.json();
//   return { text: (d?.content?.[0]?.text ?? "").trim(), usage: d?.usage ?? null };
// }
// 
// function parseJson(raw: string): Record<string, unknown> | null {
//   const s = (raw ?? "").trim();
//   try {
//     return JSON.parse(s);
//   } catch {
//     const m = s.match(/\{[\s\S]*\}/);
//     if (m) { try { return JSON.parse(m[0]); } catch { /* ignore */ } }
//   }
//   return null;
// }
// 
// // blocks 응답이 토큰 한도에 걸려 중간에 잘리면 위 parseJson은 실패합니다.
// // 이때 전체를 버리지 않고, 온전히 끝난 {...} 조각만 건져서 씁니다.
// // (마지막 하나가 잘렸어도 그 앞까지는 정상적인 JSON 객체이기 때문입니다.)
// function salvageBlocks(raw: string): unknown[] {
//   const out: unknown[] = [];
//   const re = /\{[^{}]*\}/g;
//   let m: RegExpExecArray | null;
//   while ((m = re.exec(raw ?? ""))) {
//     try { out.push(JSON.parse(m[0])); } catch { /* 마지막 조각은 잘렸을 수 있음 — 건너뜀 */ }
//   }
//   return out;
// }
// 
// Deno.serve(async (req) => {
//   if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
//   if (req.method !== "POST") return json({ error: "POST only" }, 405);
// 
//   try {
//     // ── 1) 로그인한 사용자만 (키 남용 방지) ────────────────────────
//     const authHeader = req.headers.get("Authorization") ?? "";
//     const sb = createClient(
//       Deno.env.get("SUPABASE_URL")!,
//       Deno.env.get("SUPABASE_ANON_KEY")!,
//       { global: { headers: { Authorization: authHeader } } },
//     );
//     const { data: { user } } = await sb.auth.getUser();
//     if (!user) return json({ error: "login_required" }, 401);
// 
//     // ── 2) 입력 검증 ─────────────────────────────────────────────
//     const body = await req.json().catch(() => ({}));
//     const mode = String(body.mode ?? "");
//     // ping = 함수만 깨워 두기. AI를 부르지 않으므로 토큰이 들지 않습니다.
//     if (mode === "ping") return json({ ok: true });
//     if (mode !== "front" && mode !== "blocks" && mode !== "levels") {
//       return json({ error: "bad_mode" }, 400);
//     }
// 
//     const rawItems = Array.isArray(body.items) ? body.items : [];
//     // 앱이 글자 수 기준으로 나눠 부릅니다. 여기 숫자는 사고 방지용 상한입니다.
//     const MAX_ITEMS = mode === "front" ? 200 : (mode === "levels" ? 400 : 600);
//     if (!rawItems.length || rawItems.length > MAX_ITEMS) return json({ error: "bad_items" }, 400);
// 
//     // front 는 앞부분만으로 충분합니다. blocks 는 전문을 봅니다(제목·인용문·상자를 가리려면 글자가 필요).
//     const CAP = mode === "front" ? 90 : (mode === "levels" ? 120 : 3000);
//     const items: Item[] = rawItems.slice(0, MAX_ITEMS).map((x: Record<string, unknown>) => ({
//       i: Math.max(0, Math.floor(Number(x.i) || 0)),
//       t: String(x.t ?? "").replace(/\s+/g, " ").slice(0, CAP).trim(),
//       n: Math.max(0, Math.floor(Number(x.n) || 0)),
//     }));
//     const totalChars = items.reduce((s, x) => s + x.t.length, 0);
//     if (totalChars > 200000) return json({ error: "batch_too_big" }, 400);
//     const title = String(body.title ?? "").slice(0, 120).trim();
// 
//     // 책이 스스로 적어 둔 목차 = 장 제목의 정답지. blocks 판정의 기준으로 씁니다.
//     const bookToc: string[] = (Array.isArray(body.toc) ? body.toc : [])
//       .slice(0, 200)
//       .map((t: unknown) => String(t ?? "").replace(/\s+/g, " ").slice(0, 160).trim())
//       .filter((t: string) => t.length > 0);
//     const prevHead = String(body.prev ?? "").replace(/\s+/g, " ").slice(0, 160).trim();
// 
//     // ── 3) 공급자 선택 (dict 함수와 동일) ─────────────────────────
//     const gKey = Deno.env.get("GEMINI_API_KEY");
//     const cKey = Deno.env.get("ANTHROPIC_API_KEY");
//     let provider = (Deno.env.get("AI_PROVIDER") ?? "").toLowerCase();
//     if (provider !== "gemini" && provider !== "claude") {
//       provider = gKey ? "gemini" : (cKey ? "claude" : "");
//     }
//     if (!provider) return json({ error: "server_not_configured" }, 500);
//     if (provider === "gemini" && !gKey) return json({ error: "server_not_configured" }, 500);
//     if (provider === "claude" && !cKey) return json({ error: "server_not_configured" }, 500);
// 
//     const cands: Cand[] = mode === "levels"
//       ? rawItems.slice(0, MAX_ITEMS).map((x: Record<string, unknown>) => ({
//           i: Math.max(0, Math.floor(Number(x.i) || 0)),
//           t: String(x.t ?? "").replace(/\s+/g, " ").slice(0, 120).trim(),
//           x: String(x.x ?? "").replace(/\s+/g, " ").slice(0, 90).trim(),
//           z: Number(x.z) || 1,
//           b: !!x.b,
//           c: !!x.c,
//         })).filter((x) => x.t.length > 0)
//       : [];
// 
//     const prompt = mode === "front"
//       ? promptFront(items, title)
//       : (mode === "levels"
//           ? promptLevels(cands, bookToc, title)
//           : promptBlocks(items, bookToc, prevHead));
//     const maxOut = mode === "front" ? 500 : (mode === "levels" ? 4000 : 8000);
// 
//     let out;
//     try {
//       out = provider === "gemini"
//         ? await callGemini(gKey!, prompt, maxOut)
//         : await callClaude(cKey!, prompt, maxOut);
//     } catch (e) {
//       const alt = provider === "gemini" ? cKey : gKey;
//       if (!alt) return json({ error: "upstream", detail: String(e) }, 502);
//       console.warn("primary provider failed, falling back:", String(e));
//       out = provider === "gemini"
//         ? await callClaude(cKey!, prompt, maxOut)
//         : await callGemini(gKey!, prompt, maxOut);
//       provider = provider === "gemini" ? "claude" : "gemini";
//     }
// 
//     let parsed = parseJson(out.text ?? "");
//     if (!parsed && (mode === "blocks" || mode === "levels")) {
//       // 온전한 JSON으로는 못 읽었어도, 잘린 지점 앞까지는 건질 수 있는지 시도합니다.
//       const salvaged = salvageBlocks(out.text ?? "");
//       if (salvaged.length) parsed = mode === "levels" ? { levels: salvaged } : { blocks: salvaged };
//     }
//     if (!parsed) return json({ error: "parse_failed", raw: (out.text ?? "").slice(0, 300) }, 502);
// 
//     // ── 4) 정규화 ────────────────────────────────────────────────
//     // AI가 없는 문단 번호를 지어내도 여기서 걸러집니다.
//     const valid = new Set(items.map((x) => x.i));
// 
//     if (mode === "front") {
//       let start = Math.floor(Number(parsed.start));
//       if (!valid.has(start)) start = items[0].i;
//       let tocFrom = Math.floor(Number(parsed.tocFrom));
//       let tocTo = Math.floor(Number(parsed.tocTo));
//       // 목차 범위는 앞뒤가 맞고 본문 시작보다 앞이어야 인정합니다
//       if (!valid.has(tocFrom) || !valid.has(tocTo) || tocTo < tocFrom || tocTo >= start) {
//         tocFrom = -1;
//         tocTo = -1;
//       }
//       return json({
//         mode: "front",
//         start,
//         tocFrom,
//         tocTo,
//         why: String(parsed.why ?? "").slice(0, 200),
//         title: String(parsed.title ?? "").slice(0, 120).trim(),
//         author: String(parsed.author ?? "").slice(0, 80).trim(),
//         provider,
//         usage: out.usage,
//       });
//     }
// 
//     if (mode === "levels") {
//       const ok = new Set(cands.map((x) => x.i));
//       const seen = new Set<number>();
//       const levels: { i: number; l: number }[] = [];
//       const arr = Array.isArray(parsed.levels) ? parsed.levels : [];
//       for (const it of arr) {
//         const o = it as Record<string, unknown>;
//         const i = Math.floor(Number(o?.i));
//         let l = Math.floor(Number(o?.l));
//         if (!ok.has(i) || seen.has(i)) continue;
//         if (!(l >= 0 && l <= 3)) l = 0;
//         seen.add(i);
//         levels.push({ i, l });
//       }
//       levels.sort((a, b) => a.i - b.i);
//       return json({ mode: "levels", levels, provider, usage: out.usage });
//     }
// 
//     const raw = Array.isArray(parsed.blocks) ? parsed.blocks : [];
//     const KINDS: Record<string, number> = { head: 1, quote: 1, note: 1, drop: 1 };
//     const used = new Set<number>();
//     const blocks: { i: number; n: number; k: string; l?: number }[] = [];
//     for (const h of raw) {
//       const o = h as Record<string, unknown>;
//       const i = Math.floor(Number(o?.i));
//       const k = String(o?.k ?? "head");
//       if (!valid.has(i) || used.has(i) || !KINDS[k]) continue;
//       let n = Math.floor(Number(o?.n));
//       if (!(n >= 1)) n = 1;
//       if (n > (k === "head" ? 3 : 10)) n = k === "head" ? 3 : 10;
//       // 실제로 이어져 있고 아직 안 쓰인 문단까지만 묶습니다(겹침 방지)
//       while (n > 1 && (!valid.has(i + n - 1) || used.has(i + n - 1))) n--;
//       for (let d = 0; d < n; d++) used.add(i + d);
//       const b: { i: number; n: number; k: string; l?: number } = { i, n, k };
//       if (k === "head") {
//         const lv = Math.floor(Number(o?.l));
//         b.l = lv === 1 || lv === 3 ? lv : 2;
//       }
//       blocks.push(b);
//     }
//     blocks.sort((a, b) => a.i - b.i);
//     return json({ mode: "blocks", blocks, provider, usage: out.usage });
//   } catch (e) {
//     console.error(e);
//     return json({ error: "internal", message: String(e) }, 500);
//   }
// });
