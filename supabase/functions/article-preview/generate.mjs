export const ARTICLE_PREVIEW_MODEL = "deepseek/deepseek-v4-flash-0731";

const SYSTEM = "You write Korean editorial previews for English reading articles. Use ONLY the supplied title and excerpt as evidence. Never invent events, numbers, trends, causes, quotes, or outcomes. If the excerpt does not support a claim, omit it. Return JSON with hookTitle (short compelling Korean headline), translatedTitle (faithful Korean title translation), teaser (2-3 concise Korean sentences explaining the core and why to read). No markdown.";

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
    const sourceNumbers = new Set((title + " " + excerpt).match(/\d+(?:[.,]\d+)*/g) || []);
    if ((meta.hookTitle.match(/\d+(?:[.,]\d+)*/g) || []).some(number => !sourceNumbers.has(number)))
      throw new Error("unsupported_number");
    return { meta, model: data?.model || ARTICLE_PREVIEW_MODEL, usage: data?.usage || null,
      latencyMs: Math.round(performance.now() - started) };
  } finally { clearTimeout(timer); }
}
