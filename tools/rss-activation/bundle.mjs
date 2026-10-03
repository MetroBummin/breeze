// Offline deployment payload. No credentials, network, mode changes or deployment.
import {readFileSync} from 'node:fs';
const paths=['supabase/functions/rss-quality/index.ts','supabase/functions/rss-quality/deno.json','supabase/functions/rss-quality/deno.lock',
 'server/article/public-fetch.mjs',...['service.mjs','handler.mjs','operator.mjs','cohort.json','feeds.mjs','extract.mjs','language.mjs','jev.mjs'].map(x=>'server/rss-quality/'+x)];
console.log(JSON.stringify({project_id:'hrtfhojbhqvaoiulspto',name:'rss-quality',verify_jwt:true,
 entrypoint_path:paths[0],import_map_path:paths[1],files:paths.map(name=>({name,content:readFileSync(name,'utf8')}))},null,2));
