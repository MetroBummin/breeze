// Temporary authenticated evaluator. Deploy only with explicit run approval.
// No reference notes/gold labels are available to this function or model.
import {createClient} from '@supabase/supabase-js';
import {loadArticle} from '../../../server/rss-quality/extract.mjs';
import {evaluateArticle,qualityKey,VERSION,MODEL} from '../../../server/rss-quality/jev.mjs';
const TOKEN_HASH='__EVAL_TOKEN_SHA256__'; // deployment substitutes only a SHA-256 hash
const EXPIRES_AT='__EVAL_EXPIRES_AT__';
const PROJECT='hrtfhojbhqvaoiulspto';
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const digest=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const safeErrors=new Set(['restricted','incomplete','unsupported_post','body_limit','language_unavailable','source_unavailable','bad_url','too_big','provider_unavailable','invalid_evaluation']);
Deno.serve(async(req:Request)=>{
  if(!Number.isFinite(Date.parse(EXPIRES_AT))||Date.now()>Date.parse(EXPIRES_AT))return json({error:'expired'},410);
  const token=req.headers.get('authorization')?.replace(/^Bearer /,'')||'';
  if(token.length!==64||await digest(token)!==TOKEN_HASH)return json({error:'unauthorized'},401);
  const url=new URL(req.url),id=url.searchParams.get('id');
  if(!id||!/^RSS-\d{3}$/.test(id)||[...url.searchParams].length!==1)return json({error:'id'},400);
  if(!['GET','POST'].includes(req.method))return json({error:'method'},405);
  const host=Deno.env.get('SUPABASE_URL')||'';
  if(host!==`https://${PROJECT}.supabase.co`)return json({error:'project_mismatch'},503);
  const db=createClient(host,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false}});
  const key=Deno.env.get('JEV_API_KEY');
  if(!key)return json({error:'not_configured'},503); // reveal name availability, never value
  if(req.method==='GET'){
    const {data,error}=await db.from('breeze_rss_eval_106').select('id,status,result').eq('id',id).single();
    return error?json({error:'cache_unavailable'},503):json(data);
  }
  const {data:claim,error}=await db.rpc('claim_breeze_rss_eval_106',{p_id:id});
  if(error)return json({error:'cache_unavailable'},503);
  if(!claim.claimed)return json({id,status:claim.item.status,result:claim.item.result,cached:true});
  let result:any={id,mode:'not_evaluated',status:'error',version:VERSION,model:MODEL,fetchedAt:new Date().toISOString()};
  try{
    const entry=claim.item,loaded=await loadArticle({url:entry.url,title:entry.title,source:entry.source,
      feedUrl:entry.source==='Medium'?'https://medium.com/feed':new URL(entry.url).origin},AbortSignal.timeout(45000));
    const hash=await qualityKey(loaded.url,loaded.article);
    result={...result,resolvedUrl:loaded.url,contentKey:hash,bodySha256:await digest(loaded.article.paragraphs.join('\n')),
      characters:loaded.article.paragraphs.join('\n').length,words:loaded.article.paragraphs.join(' ').split(/\s+/).length};
    // Reserve identity before billing. Duplicate content never causes another call.
    const reserved=await db.from('breeze_rss_eval_106').update({content_key:hash}).eq('id',id);
    if(reserved.error){
      const prior=await db.from('breeze_rss_eval_106').select('result').eq('content_key',hash).single();
      result=prior.data?.result?{...prior.data.result,id,cached:true}:{...result,status:'uncertain',reason:['duplicate_pending']};
    }else{
      result.mode='attempted';
      // Pinned model: <=64k input tokens/request at $0.042/M => <=$0.284928/106 calls.
      // Direct HTTP has no automatic retries. Claimed rows are never claimed again.
      const verdict=await evaluateArticle(loaded.article,key);
      result={...result,...verdict,mode:'live'};
    }
  }catch(error){const message=error instanceof Error?error.message:'';result={...result,status:'error',error:safeErrors.has(message)?message:'evaluation_unavailable'};
    if(error instanceof Error&&'diagnostic' in error)result.diagnostic=error.diagnostic;
  }
  const saved=await db.from('breeze_rss_eval_106').update({status:result.status,result,finished_at:new Date().toISOString()}).eq('id',id).eq('status','running');
  if(saved.error)return json({id,status:'pending',error:'result_write_failed'},503);
  return json({id,status:result.status,result});
});
