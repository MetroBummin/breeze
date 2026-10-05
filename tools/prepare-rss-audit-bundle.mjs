// Prepare private files only: never deploy, initialize live rows, read credentials,
// invoke a provider, or log publisher text. The review gate cannot be defaulted.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {pathToFileURL} from 'node:url';
import {extractionReadiness,canonical} from '../server/rss-quality/extract.mjs';
import {looksEnglish} from '../server/rss-quality/language.mjs';
import {loadArms,sealPack,sha} from './rss-paired-eval.mjs';
import {initialAuditRow,verifyAuditPack} from '../server/rss-quality/audit.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const authSha='2d612962b01784a76e1b72f5cf79de3c4972a337b6dd73b856ec67e31549ae79';
export const PROJECT='hrtfhojbhqvaoiulspto';
export const SLUG='rss-quality-paired-audit';
export function convertCapture(capture){
  if(capture?.schema!=='rss-browser-capture-v1' || !Array.isArray(capture.items) || capture.items.length!==12)throw Error('capture_requires_12_items');
  const inputs=[],seeds=[];
  for(const item of capture.items){
    if(!/^[A-Za-z0-9_-]{1,64}$/.test(item.id || '') || typeof item.title!=='string' || item.title.length>500 || typeof item.bodyText!=='string' || item.bodyText.length>3000000 || !Number.isFinite(Date.parse(item.capturedAt)) || !['breeze-reader-visible-text','publisher-visible-text'].includes(item.captureMethod) || sha(item.bodyText)!==item.bodySha256)throw Error('capture_item_invalid');
    const url=canonical(item.url);
    if(!['retain','promotion','uncertain'].includes(item.reference?.label) || item.reference.reviewStatus!=='proposed-reviewed-before-model')throw Error('reference_review_required');
    seeds.push({id:item.id,url,title:item.title,reference:{label:item.reference.label==='promotion'?'exclude':item.reference.label,reviewStatus:'pending-human-review',labelSource:'parent proposed pre-model browser audit'}});
    const blocks=item.bodyText.replace(/\r\n?/g,'\n').split(/\n+/).map(x=>x.trim()).filter(Boolean);
    const group=Math.max(1,Math.ceil(blocks.length/200));
    const paragraphs=Array.from({length:Math.ceil(blocks.length/group)},(_,i)=>blocks.slice(i*group,(i+1)*group).join('\n'));
    const links=item.links===undefined?[]:item.links;
    if(!Array.isArray(links) || links.length>100 || links.some(x=>typeof x.text!=='string'||x.text.length>120||typeof x.url!=='string'||x.url.length>4096))throw Error('capture_links_invalid');
    // Keep all captured prose (including pagination/repetition), never synthesize
    // HTML or claim that visible text is the production Readability payload.
    const readiness=extractionReadiness({paragraphs});
    const base={id:item.id,url,title:item.title,capturedAt:item.capturedAt,captureMethod:item.captureMethod,rawBodySha:item.bodySha256};
    if(readiness.status!=='ready'){inputs.push({...base,stage:'extraction',code:readiness.reasons[0]});continue;}
    if(!looksEnglish(paragraphs.join(' '))){inputs.push({...base,stage:'extraction',code:'language_unavailable'});continue;}
    const article={title:item.title,paragraphs,links,checks:{captureMethod:item.captureMethod,originalCompleteness:'unknown',productionExtractionVerified:false,linksCaptured:item.links!==undefined,readiness}};
    inputs.push({...base,stage:'ready',article});
  }
  if(new Set(inputs.map(x=>x.id)).size!==12)throw Error('duplicate_article');
  return {inputs,seeds};
}
export function executionReview(review,now=Date.now()){
  const probe=review?.invocationProof;
  if(review?.schema!=='rss-audit-execution-review-v1' || review.inputReview!=='reviewed-before-model' || review.referenceReview!=='proposed-reviewed-before-model' || review.billingTerms!=='verified-context-bound-no-retries' || !probe || probe.projectId!==PROJECT || probe.functionSlug!=='rss-quality' || probe.status!==400 || probe.error!=='operation' || !['dashboard-native-service-role-selector','existing-server-job'].includes(probe.callerKind) || !/^[A-Za-z0-9:_-]{1,128}$/.test(probe.callerId || '') || !Number.isFinite(Date.parse(probe.verifiedAt)) || Date.parse(probe.verifiedAt)>now || now-Date.parse(probe.verifiedAt)>3600000 || !Number.isFinite(Date.parse(review.expiresAt)) || Date.parse(review.expiresAt)<=now || Date.parse(review.expiresAt)-now>3600000)throw Error('verified_execution_review_required');
  if(Object.keys(probe).some(x=>!['projectId','functionSlug','status','error','callerKind','callerId','verifiedAt'].includes(x)))throw Error('proof_must_not_contain_credentials');
  return {inputReview:review.inputReview,referenceReview:review.referenceReview,callerProof:'existing-service-role-auth-probe-400-operation',billingTerms:review.billingTerms,expiresAt:review.expiresAt};
}
export async function prepareBundle(capture,review,{now=Date.now()}={}){
  const proof=executionReview(review,now),{inputs,seeds}=convertCapture(capture),arms=await loadArms();
  const createdAt=new Date(now).toISOString(),runId='browser-audit-'+sha(capture).slice(0,20);
  const {pack}=sealPack({runId,createdAt,inputs,seeds,arms,capture:{transport:'private browser-visible-text handoff',sha:sha(capture)}});
  pack.executionReview=proof;
  const packSha=sha(pack);await verifyAuditPack(pack,packSha,arms,now);
  if(!inputs.some(x=>x.stage==='ready'))throw Error('no_ready_input');
  const auth=await readFile(new URL('../tests/fixtures/rss-quality/production-v6-operator-auth.mjs',import.meta.url),'utf8');
  if(sha(auth)!==authSha)throw Error('auth_helper_changed');
  const oldSource=(await import('node:child_process')).execFileSync('git',['show','0e72a35be0fa663167acd7de2c7dd9a8dfbdfc4c:server/rss-quality/jev.mjs'],{cwd:root,encoding:'utf8'});
  const newSource=await readFile(new URL('../server/rss-quality/jev.mjs',import.meta.url),'utf8');
  if(sha(oldSource)!==arms.old.sourceSha || sha(newSource)!==arms.new.sourceSha)throw Error('arm_changed');
  const files=[
    {name:'audit.mjs',content:await readFile(new URL('../server/rss-quality/audit.mjs',import.meta.url),'utf8')},
    {name:'audit-store.mjs',content:await readFile(new URL('../server/rss-quality/audit-store.mjs',import.meta.url),'utf8')},
    {name:'audit-contract.mjs',content:await readFile(new URL('../server/rss-quality/audit-contract.mjs',import.meta.url),'utf8')},
    {name:'operator-auth.mjs',content:auth},{name:'jev-v2.mjs',content:oldSource},{name:'jev-v3.mjs',content:newSource},
    {name:'audit-pack.mjs',content:`// PRIVATE publisher inputs; delete the temporary function after audit.\nexport const pack=${JSON.stringify(pack)};\nexport const packSha=${JSON.stringify(packSha)};\nexport const sourceHashes=${JSON.stringify(Object.fromEntries(Object.entries(arms).map(([n,a])=>[n,a.sourceSha])))};\n`},
    {name:'deno.json',content:'{"imports":{"@supabase/supabase-js":"npm:@supabase/supabase-js@2.95.3"}}\n'},
    {name:'index.ts',content:await readFile(new URL('./rss-audit-entrypoint.template.ts',import.meta.url),'utf8')},
  ];
  const row=initialAuditRow(pack,packSha);
  const metadata={projectId:PROJECT,functionSlug:SLUG,verifyJwt:true,packSha,runId,createdAt,expiresAt:proof.expiresAt,readyInputs:inputs.filter(x=>x.stage==='ready').length,extractionFailures:inputs.filter(x=>x.stage==='extraction').length,maxProviderAttempts:inputs.filter(x=>x.stage==='ready').length*2,authHelperSha:authSha,referenceStatus:'proposed, not human-confirmed gold',invocationProof:{...review.invocationProof},files:files.map(x=>({name:x.name,sha:sha(x.content)})),deploymentPerformed:false,providerCalls:0};
  return {files,pack,row,metadata};
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [capturePath,reviewPath,out]=process.argv.slice(2);
  if(!capturePath || !reviewPath || !out)throw Error('usage: node tools/prepare-rss-audit-bundle.mjs PRIVATE_CAPTURE PRIVATE_REVIEW PRIVATE_OUTPUT_DIR');
  const rel=relative(root,resolve(out));if(!rel.startsWith('..'))throw Error('private_bundle_must_be_outside_checkout');
  const result=await prepareBundle(JSON.parse(await readFile(capturePath,'utf8')),JSON.parse(await readFile(reviewPath,'utf8')));
  await mkdir(resolve(out),{recursive:true,mode:0o700});
  for(const [name,data] of [['private-deploy-files.json',result.files],['private-pack.json',result.pack],['ledger-initialization.json',result.row],['bundle-metadata.json',result.metadata]])await writeFile(resolve(out,name),JSON.stringify(data),{flag:'wx',mode:0o600});
  console.log(JSON.stringify(result.metadata,null,2));
}
