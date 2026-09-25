export const ARTICLE_PREVIEW_MODEL = "deepseek/deepseek-v4-flash-0731";

const SYSTEM = "Using ONLY the supplied English title and excerpt, write a reading-decision preview in natural Korean. Return JSON with exactly one field, summaryKo, containing 2 or 3 sentences; no markdown or title translation. In 5 seconds the reader should understand what this piece covers and, only when the source supports it, why it may be worth reading. Write as a Korean editor introducing an article, not sentence-by-sentence translation. You may lead with a real surprise, conflict, contrast or result from the source, with restrained curiosity. Never invent a person, outcome, cause, trend, quantity or opinion; never strengthen uncertainty or attribution. No clickbait or sensational words such as 충격적, 믿기 힘든, 역대급. Omit numbers, comment counts and likes unless central to understanding the story; if used, preserve them exactly. Avoid generic openings like 이 글은 and calls to click. Check each claim against the supplied text before returning; with sparse evidence, stay appropriately modest.";

function validate(value) {
  if (!value || typeof value !== "object") return null;
  if (Object.keys(value).length !== 1 || typeof value.summaryKo !== "string") return null;
  const summaryKo = value.summaryKo.trim();
  if (summaryKo.length < 40 || summaryKo.length > 600 || !/[가-힣]/.test(summaryKo)) return null;
  return { summaryKo };
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
      if (new RegExp(`\\b${month}\\b`).test(sourceText)) sourceNumbers.add(String(index + 1));
    });
    const writtenNumbers = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
    writtenNumbers.forEach((word, number) => {
      if (new RegExp(`\\b${word}\\b`, "i").test(sourceText)) sourceNumbers.add(String(number));
    });
    if ((meta.summaryKo.match(/\d+(?:[.,]\d+)*/g) || []).some(number => !sourceNumbers.has(number)))
      throw Object.assign(new Error("unsupported_number"), { candidate: meta });
    return { meta, model: data?.model || ARTICLE_PREVIEW_MODEL, usage: data?.usage || null,
      latencyMs: Math.round(performance.now() - started) };
  } finally { clearTimeout(timer); }
}
