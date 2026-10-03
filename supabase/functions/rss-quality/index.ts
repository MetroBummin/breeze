import {createClient} from '@supabase/supabase-js';
import {createQualityService,databaseStore} from '../../../server/rss-quality/service.mjs';
import {qualityHandler} from '../../../server/rss-quality/handler.mjs';
declare const EdgeRuntime: {waitUntil(job: Promise<unknown>): void};
// Neither off nor shadow lets public requests trigger paid work. Shadow runs
// through an explicitly authorized service-side evaluator, not this endpoint.
const mode=Deno.env.get('RSS_QUALITY_MODE')==='active'?'active':'off';
if(mode==='off')Deno.serve(()=>Response.json({mode:'off'},{status:503}));
else {
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const service=createQualityService({store:databaseStore(db),key:Deno.env.get('JEV_API_KEY'),mode,
    log:(event: unknown)=>console.info(JSON.stringify(event))});
  Deno.serve(qualityHandler(service,(job: Promise<unknown>)=>EdgeRuntime.waitUntil(job),{mode}));
}
