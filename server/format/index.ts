// Breeze — selective whole-book typography Edge Function (v3)
// Deploy as a Supabase Edge Function named: format.
// The browser sends only structural candidates; ordinary prose never reaches AI.

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
};
const json = (body:unknown, status=200) => new Response(JSON.stringify(body), {
  status, headers:{ ...CORS, "Content-Type":"application/json" },
});

const VERSION = 3;
const GEMINI_MODEL = Deno.env.get("FORMAT_GEMINI_MODEL") || "gemini-3.5-flash-lite";
const CLAUDE_MODEL = Deno.env.get("FORMAT_CLAUDE_MODEL") || "claude-haiku-4-5-20251001";
const ROLES = new Set(["h1", "h2", "h3", "quote", "note", "toc"]);
const BREAKS = new Set(["none", "section", "page"]);

type Item = {
  i:number; t:string; a:string; e:string; r:string;
  z:number; w:boolean; l:boolean; c:boolean; d:number; p:number; v:boolean;
};
type Op = { i:number; n:number; r:string; b:string };
type Usage = Record<string, unknown> | null;

const SYSTEM =
  "You are a conservative book-structure classifier, not a writer or editor. " +
  "The supplied blocks are only candidates selected from a whole-book layout analysis. " +
  "Ordinary body prose is the default and MUST be omitted from output. " +
  "Never rewrite, correct, quote, translate, summarize, or return source text. " +
  "Return only a compact position map for confident non-body blocks.";

const SCHEMA = {
  type:"object",
  additionalProperties:false,
  required:["ops"],
  properties:{
    ops:{
      type:"array",
      items:{
        type:"object",
        additionalProperties:false,
        required:["i", "r"],
        properties:{
          i:{type:"integer"},
          n:{type:"integer", minimum:1, maximum:12},
          r:{type:"string", enum:["h1", "h2", "h3", "quote", "note", "toc"]},
          b:{type:"string", enum:["none", "section", "page"]},
        },
      },
    },
  },
};

function itemFlags(item:Item){
  return [
    `p${item.p||0}`, `z${item.z.toFixed(2)}`, item.w?"bold":"",
    item.l?"italic":"", item.c?"center":"", item.d>=0.05?`in${item.d.toFixed(2)}`:"",
    item.v?"tracked":"", item.r!=="p"?`base=${item.r}`:"",
  ].filter(Boolean).join(",");
}

function buildPrompt(title:string, grammar:string, batchIndex:number, batchCount:number, items:Item[]){
  const rows = items.map(item =>
    `${item.i}|${itemFlags(item)}|${item.t}` +
    (item.a ? `|<${item.a}` : "") + (item.e ? `|>${item.e}` : "")
  ).join("\n");
  return `Book: ${title || "(unknown)"}
Batch: ${batchIndex+1}/${batchCount}
Whole-book layout grammar: ${grammar}

Each row is: block-id | layout evidence | candidate text | optional previous/next context.
"<" is previous context and ">" is next context; context is never part of the candidate.

${rows}

Return: {"ops":[{"i":block-id,"r":"h1|h2|h3|quote|note|toc","n":optional-range,"b":optional-break}]}

Rules:
- Omit ordinary body blocks completely. Do not output r="p".
- h1 is Part/Book level, h2 is Chapter level, h3 is a short section heading.
- toc is a contents entry, not a reading-flow heading.
- A long multi-sentence paragraph is body unless unmistakably a separately typeset quotation.
- A quotation inside ordinary prose does not make the whole paragraph quote.
- Repeated page furniture, city/year strings, credits, and running headers are body here; omit them.
- n groups only consecutive quote/note/toc blocks. Headings always use n=1 or omit n.
- Return operations in ascending block-id order without overlaps.
- b=page only for confident h1/h2, b=section for a strong division, otherwise omit b.
- Treat wide tracking such as P A R T O N E as layout evidence only. The browser restores spacing.
- Do not add punctuation such as a dash between a part label and title.
- When uncertain, omit the block. Never return source text or explanations.`;
}

async function callGemini(key:string, prompt:string){
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const base:Record<string, unknown> = {
    system_instruction:{parts:[{text:SYSTEM}]},
    contents:[{role:"user", parts:[{text:prompt}]}],
    generationConfig:{
      responseMimeType:"application/json", responseJsonSchema:SCHEMA,
      maxOutputTokens:1400, temperature:0,
    },
  };
  const noThinking = structuredClone(base);
  (noThinking.generationConfig as Record<string,unknown>).thinkingConfig = {thinkingBudget:0};
  for(const body of [noThinking, base]){
    const response = await fetch(url, {
      method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(body),
    });
    if(response.ok){
      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts
        ?.map((part:{text?:string})=>part.text||"").join("") || "";
      return {text, usage:(data?.usageMetadata||null) as Usage};
    }
    const detail = await response.text();
    console.error("gemini format error", response.status, detail.slice(0,300));
    if(response.status !== 400) throw new Error(`gemini_${response.status}`);
  }
  throw new Error("gemini_400");
}

async function callClaude(key:string, prompt:string){
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{
      "content-type":"application/json", "x-api-key":key,
      "anthropic-version":"2023-06-01",
    },
    body:JSON.stringify({
      model:CLAUDE_MODEL, max_tokens:1400, temperature:0, system:SYSTEM,
      messages:[{role:"user", content:prompt}],
      tools:[{
        name:"submit_typography_map",
        description:"Submit confident non-body positions only.",
        input_schema:SCHEMA,
      }],
      tool_choice:{type:"tool", name:"submit_typography_map"},
    }),
  });
  if(!response.ok){
    console.error("claude format error", response.status, (await response.text()).slice(0,300));
    throw new Error(`claude_${response.status}`);
  }
  const data = await response.json();
  const tool = data?.content?.find((block:{type?:string;name?:string}) =>
    block.type === "tool_use" && block.name === "submit_typography_map"
  );
  return {text:JSON.stringify(tool?.input||{}), usage:(data?.usage||null) as Usage};
}

async function runModel(preferred:string, prompt:string, geminiKey?:string, claudeKey?:string){
  const invoke = (provider:string) => provider === "gemini"
    ? callGemini(geminiKey!, prompt) : callClaude(claudeKey!, prompt);
  try{ return {provider:preferred, output:await invoke(preferred)}; }
  catch(error){
    const fallback = preferred === "gemini" ? "claude" : "gemini";
    const key = fallback === "gemini" ? geminiKey : claudeKey;
    if(!key) throw error;
    return {provider:fallback, output:await invoke(fallback)};
  }
}

function parseJson(raw:string):Record<string,unknown>|null{
  const text = String(raw||"").trim();
  try{ return JSON.parse(text); }catch{ /* try embedded JSON */ }
  const match = text.match(/\{[\s\S]*\}/);
  if(!match) return null;
  try{ return JSON.parse(match[0]); }catch{ return null; }
}

function safeHeading(item:Item, role:string){
  if(!role.startsWith("h")) return role;
  const limits:Record<string,{chars:number;words:number}> = {
    h1:{chars:120,words:18}, h2:{chars:180,words:28}, h3:{chars:240,words:40},
  };
  const limit = limits[role];
  const words = item.t ? item.t.split(/\s+/).length : 0;
  const ends = (item.t.match(/[.!?](?=(?:["'”’\])]|\s|$))/g)||[]).length;
  return !limit || item.t.length>limit.chars || words>limit.words || ends>1 ? "p" : role;
}

function normalizeOps(raw:unknown, items:Item[]):Op[]|null{
  if(!Array.isArray(raw) || raw.length > items.length) return null;
  const byId = new Map(items.map(item=>[item.i,item]));
  const ops:Op[] = [];
  let lastEnd = -1;
  for(const value of raw){
    const op = (value||{}) as Record<string,unknown>;
    const i = Math.floor(Number(op.i));
    const n = Math.max(1, Math.min(12, Math.floor(Number(op.n)||1)));
    const requested = String(op.r||"");
    if(!Number.isFinite(i) || i<lastEnd || !ROLES.has(requested)) return null;
    for(let offset=0; offset<n; offset++) if(!byId.has(i+offset)) return null;
    if(requested.startsWith("h") && n!==1) return null;
    const first = byId.get(i)!;
    const role = safeHeading(first, requested);
    if(role === "p"){ lastEnd=i+n; continue; }
    if(role === "toc" && first.t.length>260){ lastEnd=i+n; continue; }
    const total = Array.from({length:n},(_,offset)=>byId.get(i+offset)!.t).join(" ").length;
    if((role==="quote" || role==="note") && total>4200){ lastEnd=i+n; continue; }
    if(role==="quote" && n===1 && first.t.length>900
        && !first.l && !/^["“'‘]/.test(first.t.trim())){ lastEnd=i+n; continue; }
    let before = BREAKS.has(String(op.b||"")) ? String(op.b) : "none";
    if(before==="page" && role!=="h1" && role!=="h2") before="section";
    ops.push({i,n,r:role,b:before});
    lastEnd=i+n;
  }
  return ops;
}

Deno.serve(async request=>{
  if(request.method === "OPTIONS") return new Response("ok", {headers:CORS});
  if(request.method !== "POST") return json({error:"POST only"},405);
  try{
    const authorization = request.headers.get("Authorization")||"";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      {global:{headers:{Authorization:authorization}}},
    );
    const {data:{user}} = await supabase.auth.getUser();
    if(!user) return json({error:"login_required"},401);

    const body = await request.json().catch(()=>({}));
    if(Number(body.version)!==VERSION) return json({error:"bad_version"},400);
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if(!rawItems.length || rawItems.length>64) return json({error:"bad_items"},400);
    const items:Item[] = rawItems.map((raw:Record<string,unknown>)=>({
      i:Math.max(0,Math.floor(Number(raw.i)||0)),
      t:String(raw.t||"").replace(/\s+/g," ").slice(0,900).trim(),
      a:String(raw.a||"").replace(/\s+/g," ").slice(0,140).trim(),
      e:String(raw.e||"").replace(/\s+/g," ").slice(0,140).trim(),
      r:String(raw.r||"p").slice(0,8),
      z:Math.max(.5,Math.min(4,Number(raw.z)||1)), w:!!raw.w, l:!!raw.l, c:!!raw.c,
      d:Math.max(0,Math.min(1,Number(raw.d)||0)),
      p:Math.max(0,Math.floor(Number(raw.p)||0)), v:!!raw.v,
    }));
    for(let index=1; index<items.length; index++){
      if(items[index].i<=items[index-1].i) return json({error:"items_not_sorted"},400);
    }
    const totalChars = items.reduce((sum,item)=>sum+item.t.length+item.a.length+item.e.length,0);
    if(totalChars>12500) return json({error:"batch_too_big"},400);

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const claudeKey = Deno.env.get("ANTHROPIC_API_KEY");
    let preferred = (Deno.env.get("AI_PROVIDER")||"").toLowerCase();
    if(preferred!=="gemini" && preferred!=="claude") preferred=geminiKey?"gemini":(claudeKey?"claude":"");
    if(!preferred || (preferred==="gemini"&&!geminiKey) || (preferred==="claude"&&!claudeKey)){
      return json({error:"server_not_configured"},500);
    }

    const batchIndex = Math.max(0,Math.floor(Number(body.batchIndex)||0));
    const batchCount = Math.max(1,Math.min(100,Math.floor(Number(body.batchCount)||1)));
    const grammar = JSON.stringify(body.grammar && typeof body.grammar==="object" ? body.grammar : {})
      .slice(0,3000);
    const prompt = buildPrompt(String(body.title||"").slice(0,160), grammar, batchIndex, batchCount, items);
    const result = await runModel(preferred,prompt,geminiKey,claudeKey);
    const parsed = parseJson(result.output.text);
    const ops = normalizeOps(parsed?.ops,items);
    if(!ops) return json({error:"format_parse_failed"},502);
    return json({version:VERSION,batchIndex,batchCount,ops,provider:result.provider,usage:result.output.usage});
  }catch(error){
    console.error(error);
    return json({error:"internal",message:String(error)},500);
  }
});
