import {createClient} from '@supabase/supabase-js';
import {createCatalogService,databaseStore,feedIds} from '../../../server/rss-catalog/service.mjs';
import {catalogHandler,catalogReply,serviceAuthorization} from '../../../server/rss-catalog/handler.mjs';

// Requires separate schema/deployment/publisher review. Existing built-in
// service credentials stay server-side; no new credentials or paid provider.
if(Deno.env.get('RSS_CATALOG_MODE')!=='active')Deno.serve(request=>request.method==='OPTIONS'
  ?new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'apikey,authorization,if-none-match','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}})
  :catalogReply({mode:'off'},503));
else{
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  const db=createClient(Deno.env.get('SUPABASE_URL')!,key,{auth:{persistSession:false}});
  const service=createCatalogService({store:databaseStore(db),enabled:feedIds(Deno.env.get('RSS_CATALOG_FEED_IDS')||''),
    originalEnabled:feedIds(Deno.env.get('RSS_CATALOG_ORIGINAL_FEED_IDS')||'')});
  Deno.serve(catalogHandler(service,{authorize:serviceAuthorization(key)}));
}
