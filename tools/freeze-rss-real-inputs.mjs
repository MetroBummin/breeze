// Fetch public sources once; never invoke Jev. Full inputs are private, untracked.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchDocument,extractArticle} from '../server/rss-quality/extract.mjs';
import {loadArms,sealPack,sha} from './rss-paired-eval.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const [privatePath,manifestPath,capturePath]=process.argv.slice(2);
if(!privatePath || !manifestPath)throw Error('usage: node tools/freeze-rss-real-inputs.mjs PRIVATE_PACK_PATH PUBLIC_MANIFEST_PATH');
// Refuse publisher bodies inside the checkout or its .git metadata.
const rel=relative(root,resolve(privatePath));
if(!rel.startsWith('..'))throw Error('private_pack_must_be_outside_checkout');
const seeds=JSON.parse(await readFile(new URL('../tests/fixtures/rss-quality/real-source-seeds.json',import.meta.url),'utf8'));
const captured=capturePath?JSON.parse(await readFile(capturePath,'utf8')):null;
if(captured && (captured.schema!=='rss-public-capture-v1' || captured.sources.length!==seeds.length || captured.sources.some((x,i)=>x.id!==seeds[i].id || x.requestedUrl!==seeds[i].url)))throw Error('capture_seed_mismatch');
if(captured?.sources.some(x=>x.stage==='infrastructure' || ['network_unavailable','capture_network_unavailable'].includes(x.code)))throw Error('capture_infrastructure_blocked_not_a_publisher_verdict');
const arms=await loadArms(),inputs=[],createdAt=new Date().toISOString(),runId='rss-real-'+createdAt.replace(/[^0-9]/g,'');
for(const seed of seeds){
  let source;
  const frozen=captured?.sources.find(x=>x.id===seed.id);
  if(frozen?.stage==='source'){inputs.push({id:seed.id,url:seed.url,title:seed.title,stage:'source',code:frozen.code,fetchedAt:frozen.fetchedAt});continue;}
  try{source=frozen || await fetchDocument(seed.url,new AbortController().signal);}
  catch(error){
    // A managed-workspace DNS failure is an infrastructure preflight blocker,
    // not evidence that every publisher is unavailable.
    if(error.code==='EAI_AGAIN')throw Error('workspace_dns_unavailable_use_fixed_public_capture');
    inputs.push({id:seed.id,url:seed.url,title:seed.title,stage:'source',code:'source_unavailable'});continue;
  }
  const base={id:seed.id,url:seed.url,resolvedUrl:source.url,title:seed.title,sourceHtmlSha:sha(source.html),...(frozen?{sourceBytesSha:frozen.sourceBytesSha,fetchedAt:frozen.fetchedAt,httpStatus:frozen.httpStatus}:{})};
  try{inputs.push({...base,stage:'ready',article:extractArticle(source.html,source.url,seed.title)});}
  catch(error){
    const allowed=new Set(['body_limit','restricted','unsupported_post','incomplete','language_unavailable','body_too_short','encoding_damage']);
    inputs.push({...base,stage:'extraction',code:allowed.has(error.message)?error.message:'extraction_unavailable'});
  }
}
const {pack,manifest}=sealPack({runId,createdAt,inputs,seeds,arms,capture:captured?{sha:sha(captured),transport:captured.transport}:null});
await mkdir(dirname(resolve(privatePath)),{recursive:true,mode:0o700});
await writeFile(privatePath,JSON.stringify(pack),{flag:'wx',mode:0o600});
await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({runId,packSha:manifest.packSha,counts:manifest.counts,maximumReadyAttempts:manifest.counts.ready*2,providerCalls:0,rows:manifest.inputs.map(x=>({id:x.id,stage:x.stage,code:x.code,characters:x.readiness?.characters,paragraphs:x.readiness?.paragraphs}))},null,2));
