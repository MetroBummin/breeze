import { createClient } from "jsr:@supabase/supabase-js@2";
import { generateArticlePreview } from "./generate.mjs";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
// Coalesce only within this runtime. Cross-isolate exactly-once is NOT promised.
const generating=new Map<string,Promise<Record<string,unknown>>>();
function validMetadata(value:any){
  if(!value || typeof value!=="object")return null;
  const fields=["hookTitle","translatedTitle","teaser"],min=[5,1,25],max=[90,180,500];
  const meta:Record<string,string>={};
  for(let i=0;i<fields.length;i++){
    const text=typeof value[fields[i]]==="string" ? value[fields[i]].trim() : "";
    if(text.length<min[i] || text.length>max[i] || !/[가-힣]/.test(text))return null;
    meta[fields[i]]=text;
  }
  return meta;
}
async function digest(value:string){
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}
async function requestBody(request:Request){
  if(!request.body)throw new Error("input");
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;if(size>16384){await reader.cancel();throw new Error("input");}chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
Deno.serve(async request=>{
  if(request.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(request.method!=="POST")return reply({error:"method"},405);
  let body:any;
  try{body=await requestBody(request);}catch{return reply({error:"input"},400);}
  if(!body || typeof body!=="object" || Array.isArray(body) ||
      [body.url,body.title,body.excerpt].some(value=>typeof value!=="string"))return reply({error:"input"},400);
  try{
    const url=body.url.trim(),title=body.title.trim().slice(0,250),excerpt=body.excerpt.trim().slice(0,2000);
    let parsed:URL;try{parsed=new URL(url);}catch{return reply({error:"url"},400);}
    if(!["https:","http:"].includes(parsed.protocol) || parsed.username || parsed.password || !title || excerpt.length<60 || url.length>2048)return reply({error:"input"},400);
    parsed.hash="";
    for(const key of [...parsed.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(key))parsed.searchParams.delete(key);
    // New prompt/validation generations must not reuse older shared metadata.
    const cacheKey=await digest("article-preview-v2\n"+parsed.href+"\n"+title+"\n"+excerpt);
    const {data:hit,error:readError}=await db.from("article_preview_cache").select("hook_title,translated_title,teaser").eq("cache_key",cacheKey).maybeSingle();
    if(readError)return reply({error:"cache_unavailable"},503);
    const cached=hit && validMetadata({hookTitle:hit.hook_title,translatedTitle:hit.translated_title,teaser:hit.teaser});
    if(cached)return reply({...cached,cached:true});
    if(hit)return reply({error:"cache_invalid"},503);
    const token=(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
    const {data:user}=await db.auth.getUser(token);
    if(user?.user){
      const {data,error}=await db.rpc("take_ai_quota",{p_user:user.user.id,p_limit:300,p_cost:1});
      if(error || typeof data?.ok!=="boolean")return reply({error:"quota_unavailable"},503);
      if(!data.ok)return reply({error:"quota"},429);
    }else{
      const device=typeof body.device==="string" ? body.device.trim().slice(0,64) : "";
      if(!device)return reply({error:"device"},400);
      const {data,error}=await db.rpc("take_anon_quota",{p_device:device,p_limit:10,p_daily_cap:2000});
      if(error || !data || typeof data.status!=="string")return reply({error:"quota_unavailable"},503);
      if(data.status!=="ok")return reply({error:"quota"},429);
    }
    // Every caller still passes quota. Coalescing saves model calls, not access checks.
    let job=generating.get(cacheKey);
    if(!job){
      if(generating.size>=16)return reply({error:"busy"},503);
      job=(async()=>{
        const result=await generateArticlePreview(title,excerpt,Deno.env.get("OPENROUTER_API_KEY"));
        const meta=validMetadata(result.meta);if(!meta)throw new Error("bad_metadata");
        console.info("article_preview_ai",JSON.stringify({model:result.model,latencyMs:result.latencyMs,
          promptTokens:result.usage?.prompt_tokens??null,completionTokens:result.usage?.completion_tokens??null}));
        let persisted=false;
        try{
          const {error}=await db.from("article_preview_cache").insert({cache_key:cacheKey,source_url:parsed.href,
            hook_title:meta.hookTitle,translated_title:meta.translatedTitle,teaser:meta.teaser});
          persisted=!error || error.code==="23505";
        }catch{/* A storage transport failure must not discard usable metadata. */}
        // A useful, paid-for result remains usable even if shared persistence fails.
        // The client may keep it locally; no failure placeholder is cached.
        return {...meta,cached:false,persisted};
      })();
      generating.set(cacheKey,job);
    }
    try{return reply(await job);}finally{if(generating.get(cacheKey)===job)generating.delete(cacheKey);}
  }catch(error){console.error("article_preview",error instanceof Error?error.message:"unknown");return reply({error:"preview_unavailable"},503);}
});
