export const ARTICLE_PREVIEW_MODEL = "deepseek/deepseek-v4-flash-0731";

const SYSTEM = "Using ONLY the supplied English title and excerpt, write a reading-decision preview in natural Korean. Return JSON with exactly one field, summaryKo, containing 2 or 3 sentences; no markdown or title translation. In 5 seconds the reader should understand what this piece covers and, only when the source supports it, why it may be worth reading. Write as a Korean editor introducing an article, not sentence-by-sentence translation. You may lead with a real surprise, conflict, contrast or result from the source, with restrained curiosity. Never invent a person, outcome, cause, trend, quantity or opinion; never strengthen uncertainty or attribution. No clickbait or sensational words such as 충격적, 믿기 힘든, 역대급. Omit numbers, comment counts and likes unless central to understanding the story; if used, preserve them exactly. Avoid generic openings like 이 글은 and calls to click. Check each claim against the supplied text before returning; with sparse evidence, stay appropriately modest.";

function validate(value) {
  if (!value || typeof value !== "object") return null;
  if (Object.keys(value).length !== 1 || typeof value.summaryKo !== "string") return null;
  const summaryKo = value.summaryKo.trim();
  if (summaryKo.length < 40 || summaryKo.length > 600 || !/[가-힣]/.test(summaryKo)) return null;
  return { summaryKo };
}

async function generateAttempt(title, excerpt, key, request, signal, repair = false) {
  if (!key) throw new Error("not_configured");
  const started = performance.now();
  {
    const response = await request("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", signal,
      headers: { "content-type": "application/json", "authorization": `Bearer ${key}`,
        "HTTP-Referer": "https://breeze.io.kr", "X-Title": "Breeze" },
      body: JSON.stringify({ model: ARTICLE_PREVIEW_MODEL,
        messages: [{ role: "system", content: SYSTEM + (repair ? " Your previous response failed validation. Write a fresh, shorter 2-sentence introduction using only the supplied evidence. Omit ALL numeric details, dates, ages, amounts, rankings and counts instead of reformatting them. Never replace a number with a vague unsupported comparison. Return complete valid JSON." : "") }, { role: "user", content: JSON.stringify({ title, excerpt }) }],
        temperature: 0.2, max_tokens: 600, stream: false, reasoning: { enabled: false },
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
    const sourceNumbers = numericEvidence(title + " " + excerpt, true);
    if ([...numericEvidence(meta.summaryKo)].some(number => !sourceNumbers.has(number)))
      throw Object.assign(new Error("unsupported_number"), { candidate: meta });
    return { meta, model: data?.model || ARTICLE_PREVIEW_MODEL, usage: data?.usage || null,
      latencyMs: Math.round(performance.now() - started) };
  }
}

// Compare quantities, not their typography: 100,000 and 10만 are the same
// amount. Do not admit the coefficient of a scaled value as a separate count.
export function numericEvidence(text, source = false) {
  const values = new Set();
  const scales = {hundred:100,thousand:1000,million:1e6,billion:1e9,trillion:1e12,백:100,천:1000,만:1e4,억:1e8,조:1e12};
  const pattern = /\d+(?:,\d{3})*(?:\.\d+)?(?:\s*(?:hundred|thousand|million|billion|trillion)\b|\s*[백천만억조](?![가-힣])|[백천만억조](?=[가-힣]|$))?/gi;
  for (const match of text.matchAll(pattern)) {
    const raw=match[0].replaceAll(',',''), amount=parseFloat(raw), unit=raw.match(/[a-z]+|[백천만억조]/i)?.[0]?.toLowerCase();
    values.add(String(Number((amount*(scales[unit]||1)).toPrecision(14))));
  }
  if (source) {
    const months = ['Jan(?:uary)?','Feb(?:ruary)?','Mar(?:ch)?','Apr(?:il)?','May','Jun(?:e)?','Jul(?:y)?','Aug(?:ust)?','Sep(?:t(?:ember)?)?','Oct(?:ober)?','Nov(?:ember)?','Dec(?:ember)?'];
    months.forEach((month,i)=>{if(new RegExp(`\\b${month}\\b`,'i').test(text))values.add(String(i+1));});
    const small = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
    const tens = ['twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
    const words = new RegExp(`\\b(${[...small,...tens].join('|')})(?:[- ](${small.slice(1,10).join('|')}))?(?:\\s+(hundred|thousand|million|billion|trillion))?\\b`,'gi');
    for(const m of text.matchAll(words)){
      const word=m[1].toLowerCase(),base=small.includes(word)?small.indexOf(word):(tens.indexOf(word)+2)*10;
      values.add(String((base+(m[2]?small.indexOf(m[2].toLowerCase()):0))*(scales[m[3]?.toLowerCase()]||1)));
    }
  }
  return values;
}

export async function generateArticlePreview(title, excerpt, key, request = fetch) {
  if (!key) throw new Error('not_configured');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000),started=performance.now();
  try {
    for(let attempt=0;attempt<2;attempt++) {
      try {
        const result=await generateAttempt(title,excerpt,key,request,controller.signal,attempt===1);
        return {...result,attempts:attempt+1,latencyMs:Math.round(performance.now()-started)};
      } catch(error) {
        if(controller.signal.aborted)throw new Error('generation_timeout');
        // One repair within the same quota charge and total deadline. Never
        // retry auth, quota, network or arbitrary upstream errors automatically.
        if(attempt || !['unsupported_number','bad_metadata'].includes(error.message))throw error;
      }
    }
  } finally {clearTimeout(timer);}
}
