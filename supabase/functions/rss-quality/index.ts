import {createClient} from '@supabase/supabase-js';
import {createQualityService,databaseStore} from '../../../server/rss-quality/service.mjs';
import {qualityHandler} from '../../../server/rss-quality/handler.mjs';
declare const EdgeRuntime: {waitUntil(job: Promise<unknown>): void};
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const service=createQualityService({store:databaseStore(db),key:Deno.env.get('JEV_API_KEY')});
// Guests can read only the fixed public inventory. Durable service-role-only
// claims enforce feed cooldowns, evaluation slots and a global daily budget.
Deno.serve(qualityHandler(service,(job: Promise<unknown>)=>EdgeRuntime.waitUntil(job)));
