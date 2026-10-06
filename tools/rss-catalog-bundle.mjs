// Prepare exact connector arguments only. Does not connect, apply, deploy,
// activate, inspect secrets, fetch publishers or change any release counter.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const project_id='hrtfhojbhqvaoiulspto';
const paths=[
  'supabase/functions/rss-catalog/index.ts','supabase/functions/rss-catalog/deno.json','supabase/functions/rss-catalog/deno.lock',
  'server/rss-catalog/service.mjs','server/rss-catalog/handler.mjs','server/rss-catalog/metadata.mjs','server/rss-catalog/discovery.mjs',
  'server/rss-quality/feeds.mjs','server/rss-quality/language.mjs','server/article/public-fetch.mjs'
];
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const files=paths.map(name=>({name,content:read(name)}));
const hash=content=>createHash('sha256').update(content).digest('hex');
console.log(JSON.stringify({
  deployment:{project_id,name:'rss-catalog',entrypoint_path:paths[0],import_map_path:paths[1],verify_jwt:false,files},
  migration:{project_id,name:'rss_public_catalog',query:read('server/rss-catalog/schema/rss_public_catalog.sql')},
  optionalScheduleMigration:{project_id,name:'rss_public_catalog_schedule',query:read('server/rss-catalog/schema/rss_public_catalog_schedule.sql')},
  hashes:Object.fromEntries(files.map(file=>[file.name,hash(file.content)]))
},null,2));
