import { createClient } from "jsr:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});

function validate(value:unknown){
  if(!value || typeof value!=="object")return null;
  const raw=value as Record<string,unknown>;
  const fields=["hookTitle","translatedTitle","teaser"] as const;
  if(fields.some(field=>typeof raw[field]!=="string" || !/[가-힣]/.test(raw[field] as string)))return null;
  const meta={hookTitle:String(raw.hookTitle).trim(),translatedTitle:String(raw.translatedTitle).trim(),teaser:String(raw.teaser).trim()};
  if(meta.hookTitle.length>90 || meta.translatedTitle.length>180 || meta.teaser.length>500 ||
    meta.hookTitle.length<5 || meta.teaser.length<25)return null;
  return meta;
}
async function digest(value:string){
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}
async function generate(title:string,excerpt:string){
  const key=Deno.env.get("GEMINI_API_KEY");if(!key)throw new Error("not_configured");
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key="+key,{
      method:"POST",signal:controller.signal,headers:{"Content-Type":"application/json"},
      body:JSON.stringify({system_instruction:{parts:[{text:
        "You write Korean editorial previews for English reading articles. Use ONLY the supplied title and excerpt as evidence. Never invent events, numbers, trends, causes, quotes, or outcomes. If the excerpt does not support a claim, omit it. Return JSON with hookTitle (short compelling Korean headline), translatedTitle (faithful Korean title translation), teaser (2-3 concise Korean sentences explaining the core and why to read). No markdown."}]},
        contents:[{role:"user",parts:[{text:JSON.stringify({title,excerpt})}]}],
        generationConfig:{temperature:0.2,maxOutputTokens:400,responseMimeType:"application/json"}})
    });
    if(!response.ok)throw new Error("ai_failed");
    const data=await response.json();
    const raw=data?.candidates?.[0]?.content?.parts?.map((part:{text?:string})=>part.text||"").join("")||"";
    const meta=validate(JSON.parse(raw));if(!meta)throw new Error("bad_metadata");
    // A new numeral in the hook is an especially misleading form of embellishment.
    const sourceNumbers=new Set((title+" "+excerpt).match(/\d+(?:[.,]\d+)*/g)||[]);
    if(((meta.hookTitle.match(/\d+(?:[.,]\d+)*/g))||[]).some(number=>!sourceNumbers.has(number)))throw new Error("unsupported_number");
    return meta;
  }finally{clearTimeout(timer);}
}

Deno.serve(async request=>{
  if(request.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(request.method!=="POST")return reply({error:"method"},405);
  try{
    const body=await request.json();
    const url=String(body.url||"").trim(),title=String(body.title||"").trim().slice(0,250),excerpt=String(body.excerpt||"").trim().slice(0,2000);
    let parsed:URL;try{parsed=new URL(url);}catch{return reply({error:"url"},400);}
    if(!["https:","http:"].includes(parsed.protocol) || !title || excerpt.length<60 || url.length>2048)return reply({error:"input"},400);
    parsed.hash="";
    for(const key of [...parsed.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(key))parsed.searchParams.delete(key);
    const cacheKey=await digest(parsed.href+"\n"+title+"\n"+excerpt);
    const {data:hit,error:readError}=await db.from("article_preview_cache").select("hook_title,translated_title,teaser").eq("cache_key",cacheKey).maybeSingle();
    if(readError)return reply({error:"cache_unavailable"},503);
    if(hit)return reply({hookTitle:hit.hook_title,translatedTitle:hit.translated_title,teaser:hit.teaser,cached:true});
    const token=(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
    const {data:user}=await db.auth.getUser(token);
    if(user.user){
      const {data,error}=await db.rpc("take_ai_quota",{p_user:user.user.id,p_limit:300,p_cost:1});
      if(error || data?.ok===false)return reply({error:"quota"},429);
    }else{
      const device=String(body.device||"").slice(0,64);
      if(!device)return reply({error:"device"},400);
      const {data,error}=await db.rpc("take_anon_quota",{p_device:device,p_limit:10,p_daily_cap:2000});
      if(error || data?.status!=="ok")return reply({error:"quota"},429);
    }
    const meta=await generate(title,excerpt);
    const {error:insertError}=await db.from("article_preview_cache").insert({cache_key:cacheKey,source_url:parsed.href,
      hook_title:meta.hookTitle,translated_title:meta.translatedTitle,teaser:meta.teaser});
    if(insertError && insertError.code!=="23505")return reply({error:"cache_write"},503);
    return reply(meta);
  }catch(error){console.error("article_preview",error instanceof Error?error.message:"unknown");return reply({error:"preview_unavailable"},503);}
});
