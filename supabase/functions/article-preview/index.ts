import { createClient } from "jsr:@supabase/supabase-js@2";
import { generateArticlePreview } from "./generate.mjs";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});

async function digest(value:string){
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
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
    const result=await generateArticlePreview(title,excerpt,Deno.env.get("OPENROUTER_API_KEY"));
    const meta=result.meta;
    console.info("article_preview_ai",JSON.stringify({model:result.model,latencyMs:result.latencyMs,
      promptTokens:result.usage?.prompt_tokens??null,completionTokens:result.usage?.completion_tokens??null}));
    const {error:insertError}=await db.from("article_preview_cache").insert({cache_key:cacheKey,source_url:parsed.href,
      hook_title:meta.hookTitle,translated_title:meta.translatedTitle,teaser:meta.teaser});
    if(insertError && insertError.code!=="23505")return reply({error:"cache_write"},503);
    return reply(meta);
  }catch(error){console.error("article_preview",error instanceof Error?error.message:"unknown");return reply({error:"preview_unavailable"},503);}
});
