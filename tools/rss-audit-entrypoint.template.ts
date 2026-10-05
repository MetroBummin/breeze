// Temporary isolated function. Copied into a PRIVATE bundle only after all gates.
// No production RSS imports, feed writes, quality cache writes, or control changes.
import {createClient} from '@supabase/supabase-js';
import {createAuditHandler,providerExecutor} from './audit.mjs';
import {auditStore} from './audit-store.mjs';
import {operatorAuthorized} from './operator-auth.mjs';
import * as oldImplementation from './jev-v2.mjs';
import * as newImplementation from './jev-v3.mjs';
import {pack,packSha,sourceHashes} from './audit-pack.mjs';
const url=Deno.env.get('SUPABASE_URL');
const db=createClient(url!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const handler=createAuditHandler({pack,packSha,
  arms:{old:{implementation:oldImplementation,sourceSha:sourceHashes.old},new:{implementation:newImplementation,sourceSha:sourceHashes.new}},
  store:auditStore(db),
  authorized:(request:Request)=>operatorAuthorized(request,{url,apiKey:Deno.env.get('SUPABASE_ANON_KEY')}),
  execute:providerExecutor(Deno.env.get('JEV_API_KEY')),
  log:(event:unknown)=>console.info(JSON.stringify(event)),
});
// Deployment MUST retain verify_jwt=true; native auth probe must precede deploy.
Deno.serve(handler);
