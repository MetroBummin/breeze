export const ARTICLE_PREVIEW_MODEL = "deepseek/deepseek-v4-flash-0731";

const SYSTEM = "Write a Korean editorial preview using ONLY the supplied English title and excerpt as evidence. Return JSON with hookTitle, translatedTitle, and teaser; no markdown. hookTitle: a short, specific, curiosity-provoking Korean headline based on a concrete person, question, or detail in the source. When several parties dispute a claim, base the hook on the original title's main conflict instead of the contested detail; never assign one party's claim to its critic. translatedTitle: a faithful Korean translation of the original title. teaser: two natural Korean sentences about the subject and why it matters; do not refer to 'this article' or address the reader with phrases like '확인해 보세요'. Use established Korean spellings for names (Saddam Hussein is 사담 후세인), and natural Korean rather than literal translation or stock editorial phrases. Preserve the source's exact level of certainty, attribution, quantity, and meaning in every field. Never change 'some' to 'many' or 'most', private aggregate/statistical data into personal medical records, a speculation into a fact, or a dismissal as 'old news' into a claim of false reporting. Do not use '진실', '실체', or '밝혀졌다' to imply that a disputed or speculative claim was proven; identify whose claim it is. Never invent or intensify events, numbers, trends, causes, quotes, or outcomes. Copy numeric digits in hookTitle only when they appear exactly in the supplied text; otherwise leave numbers out of the hook. Avoid sensational adjectives such as '충격적인', '초대형', and '숨겨진' unless the supplied text supports that strength. Before returning JSON, check every concrete claim against the supplied title and excerpt; omit unsupported claims while keeping the hook engaging.";

function validate(value) {
  if (!value || typeof value !== "object") return null;
  const fields = ["hookTitle", "translatedTitle", "teaser"];
  if (fields.some(field => typeof value[field] !== "string" || !/[가-힣]/.test(value[field]))) return null;
  const meta = Object.fromEntries(fields.map(field => [field, value[field].trim()]));
  if (meta.hookTitle.length > 90 || meta.translatedTitle.length > 180 || meta.teaser.length > 500 ||
      meta.hookTitle.length < 5 || meta.teaser.length < 25) return null;
  return meta;
}

export async function generateArticlePreview(title, excerpt, key, request = fetch) {
  if (!key) throw new Error("not_configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  const started = performance.now();
  try {
    const response = await request("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", signal: controller.signal,
      headers: { "content-type": "application/json", "authorization": `Bearer ${key}`,
        "HTTP-Referer": "https://breeze.io.kr", "X-Title": "Breeze" },
      body: JSON.stringify({ model: ARTICLE_PREVIEW_MODEL,
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify({ title, excerpt }) }],
        temperature: 0.2, max_tokens: 400, stream: false, reasoning: { enabled: false },
        provider: { sort: "throughput", max_price: { prompt: 0.10, completion: 0.30 } },
        response_format: { type: "json_object" } })
    });
    if (!response.ok) throw new Error(`openrouter_${response.status}`);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const raw = Array.isArray(content) ? content.map(part => part?.text || "").join("") : String(content || "");
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw new Error("bad_metadata"); }
    const meta = validate(parsed);
    if (!meta) throw new Error("bad_metadata");
    const sourceText = title + " " + excerpt;
    const sourceNumbers = new Set(sourceText.match(/\d+(?:[.,]\d+)*/g) || []);
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    months.forEach((month, index) => {
      if (new RegExp(`\\b${month}\\s+\\d+`, "i").test(sourceText)) sourceNumbers.add(String(index + 1));
    });
    if ((meta.hookTitle.match(/\d+(?:[.,]\d+)*/g) || []).some(number => !sourceNumbers.has(number)))
      throw Object.assign(new Error("unsupported_number"), { candidate: meta });
    return { meta, model: data?.model || ARTICLE_PREVIEW_MODEL, usage: data?.usage || null,
      latencyMs: Math.round(performance.now() - started) };
  } finally { clearTimeout(timer); }
}
