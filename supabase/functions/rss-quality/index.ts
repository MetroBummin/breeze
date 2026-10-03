import {createClient} from '@supabase/supabase-js';
import {createQualityService,databaseStore} from '../../../server/rss-quality/service.mjs';
import {qualityHandler} from '../../../server/rss-quality/handler.mjs';
import {evaluateCohortItem,operatorAuthorized} from '../../../server/rss-quality/operator.mjs';
import cohort from '../../../server/rss-quality/cohort.json' with {type:'json'};
declare const EdgeRuntime: {waitUntil(job: Promise<unknown>): void};
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const db=createClient(Deno.env.get('SUPABASE_URL')!,serviceKey!,{auth:{persistSession:false}});
const store=databaseStore(db),key=Deno.env.get('JEV_API_KEY');
const services=new Map<string,ReturnType<typeof createQualityService>>();
const reply=(body:unknown,status=200)=>Response.json(body,{status});
function logger(mode:string){return (event:any)=>{
  // Fixed diagnostic labels, hashes and validated counts only; no body/evidence.
  const row={mode,stage:event.stage,code:event.code,detail:event.detail??null,field:event.field??null,
    feed:event.feed??null,cache_key:event.key??null,input_tokens:event.usage?.inputTokens??null,output_tokens:event.usage?.outputTokens??null};
  console.info(JSON.stringify(row));
  EdgeRuntime.waitUntil(Promise.resolve(db.from('rss_quality_events').insert(row).then(({error})=>{if(error)console.info('{"stage":"telemetry","code":"write_failed"}');})));
};}
Deno.serve(async request=>{
  if(request.method==='OPTIONS')return qualityHandler({} as any,()=>{})(request);
  const {data:control,error}=await db.from('rss_quality_control').select('mode,evaluation_until').eq('id',true).single();
  if(error)return reply({error:'control_unavailable'},503);
  const mode=control.mode;
  if(mode==='off')return reply({mode:'off'},503);
  if(!key)return reply({error:'not_configured'},503);
  const log=logger(mode);
  let service=services.get(mode);
  if(!service){service=createQualityService({store,key,mode,log});services.set(mode,service);}
  if(request.method==='POST'){
    if(!operatorAuthorized(request,serviceKey))return reply({error:'operator_required'},403);
    let body;try{body=await request.json();}catch{return reply({error:'request'},400);}
    if(body.operation==='evaluate' && mode==='shadow' && Object.keys(body).length===2){
      const item=cohort.find(item=>item.id===body.id);if(!item)return reply({error:'cohort'},400);
      const jobs={async claim(id:string){const r=await db.rpc('claim_rss_eval',{p_id:id});if(r.error)throw Error('cache_unavailable');return r.data;},
        async finish(id:string,token:string,result:unknown){const r=await db.from('rss_quality_eval').update({status:'done',result}).eq('id',id).eq('token',token);if(r.error)throw Error('cache_unavailable');}};
      try{return reply(await evaluateCohortItem(item,{store,jobs,key,log}));}catch{return reply({error:'evaluation_unavailable'},503);}
    }
    if(body.operation==='warm' && Object.keys(body).length===2 && Number.isInteger(body.feed) && body.feed>=0 && body.feed<=12){
      try{await service.refresh(body.feed);return reply({feed:body.feed,entries:await service.candidates(body.feed)});}catch{return reply({error:'warm_unavailable'},503);}
    }
    return reply({error:'operation'},400);
  }
  return qualityHandler(service,(job:Promise<unknown>)=>EdgeRuntime.waitUntil(job),{mode})(request);
});
