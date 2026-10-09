import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {logicalLookup,lookupFingerprint} from '../server/dict/logical-lookup.ts';
import * as lookup from '../server/dict/lookup.ts';
import {transpileModule} from 'typescript';
import {runInNewContext} from 'node:vm';
const db=new PGlite();
try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    insert into auth.users values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');`);
  const base=readFileSync(new URL('../sql/supabase_dict.sql',import.meta.url),'utf8');
  await db.exec(base.slice(base.indexOf('create table if not exists public.ai_usage'),base.indexOf('-- 2) 행동 기록')));
  const migration=readFileSync(new URL('../supabase/migrations/20260928152749_word_lookup_receipts.sql',import.meta.url),'utf8');
  await db.exec(migration);
  await db.exec(readFileSync(new URL('../supabase/migrations/20260928160147_lookup_trial_limits.sql',import.meta.url),'utf8'));
  await db.exec('grant usage on schema public to service_role;grant execute on function public.take_ai_quota(uuid,integer,integer) to service_role;');
  const user='00000000-0000-0000-0000-000000000001',id=crypto.randomUUID(),fp='a'.repeat(64);
  const answer={kind:'word',canonical:'patient',members:[0],ko:'참을성 있는'};
  const receipt=async({u=user,device='',request=id,fingerprint=fp,result=null,cap=2000,kind='word'}={})=>
    (await db.query(`select public.${kind}_lookup_receipt($1,$2,$3,$4,$5,3000,50,$6) as r`,[u,device,request,fingerprint,result,cap])).rows[0].r;
  const calls=async()=>Number((await db.query('select coalesce(sum(calls),0) as n from public.ai_usage where user_id=$1',[user])).rows[0].n);
  assert.equal((await receipt()).status,'ok');assert.equal(await calls(),0);
  await assert.rejects(logicalLookup(result=>receipt({result}),async()=>{throw Error('timeout');}));
  assert.equal(await calls(),0,'technical failure debited quota');
  assert.equal((await logicalLookup(result=>receipt({result}),async()=>answer)).status,'replay');
  assert.equal(await calls(),1);
  let generated=0;
  const replay=await logicalLookup(result=>receipt({result}),async()=>{generated++;return answer;});
  assert.equal(generated,0);assert.deepEqual(replay.answer,answer);assert.equal(await calls(),1);
  assert.equal((await receipt({fingerprint:'b'.repeat(64),result:answer})).status,'request_conflict');
  assert.equal(await calls(),1);
  const duplicate=crypto.randomUUID();
  await Promise.all([receipt({request:duplicate,result:answer}),receipt({request:duplicate,result:answer})]);
  assert.equal(await calls(),2,'duplicate successful logical request charged twice');
  // Explicit quality retry has a new ID and costs one more.
  await receipt({request:crypto.randomUUID(),result:answer});assert.equal(await calls(),3);
  await db.query('update public.ai_usage set calls=2999 where user_id=$1',[user]);
  const last=await Promise.all([receipt({request:crypto.randomUUID(),result:answer}),receipt({request:crypto.randomUUID(),result:answer})]);
  assert.equal(last.filter(r=>r.status==='replay').length,1);assert.equal(await calls(),3000);
  assert.equal((await receipt()).status,'replay','lost-response recovery rejected at cap');
  assert.equal((await receipt({request:crypto.randomUUID()})).status,'quota_exceeded');
  // Account/device identities cannot spend each other's receipt.
  await receipt({u:'00000000-0000-0000-0000-000000000002',result:answer});
  for(let n=0;n<30;n++)await receipt({u:null,device:'device-1234',request:crypto.randomUUID(),result:answer});
  assert.equal((await receipt({u:null,device:'device-1234',request:crypto.randomUUID()})).status,'ok');
  const anonId=crypto.randomUUID();
  await receipt({u:null,device:'device-5678',request:anonId,result:answer});
  await receipt({u:null,device:'device-5678',request:anonId,result:answer});
  assert.equal((await db.query("select calls from public.anon_usage where device='device-5678'")).rows[0].calls,1);
  await db.exec("update public.anon_daily set calls=2000");
  assert.equal((await receipt({u:null,device:'device-blocked',request:crypto.randomUUID(),result:answer})).status,'login_required');
  assert.equal((await db.query("select calls from public.anon_usage where device='device-blocked'")).rows.length,0);
  // Execute the real Edge handler against the real receipt SQL with fake providers.
  let handler,providerCalls=0,broken=false,providerAnswer=answer;
  const sr={auth:{getUser:async token=>({data:{user:token==='fixture'?{id:user}:null}})},rpc:async(name,p)=>{
    assert.ok(['word_lookup_receipt','sentence_lookup_receipt'].includes(name));
    const data=await receipt({u:p.p_user,device:p.p_device,request:p.p_request,fingerprint:p.p_fingerprint,result:p.p_answer,kind:name.startsWith('sentence')?'sentence':'word'});
    return {data,error:null};
  }};
  const edge=readFileSync(new URL('../server/dict/index.ts',import.meta.url),'utf8').replace(/^import .*;$/gm,'');
  runInNewContext(transpileModule(edge,{compilerOptions:{target:99,module:99}}).outputText,{
    ...lookup,logicalLookup,lookupFingerprint,crypto,TextEncoder,AbortSignal,Response,console,
    createClient:()=>sr,newAiTrace:()=>({}),
    meteredFetch:async()=>{providerCalls++;return Response.json({choices:[{message:{content:broken?'invalid JSON':JSON.stringify(providerAnswer)}}]});},
    Deno:{env:{get:key=>key==='OPENROUTER_API_KEY'?'fixture':key==='SUPABASE_URL'?'fixture':null},serve:fn=>handler=fn}
  });
  await db.query('update public.ai_usage set calls=0 where user_id=$1',[user]);
  const invoke=async(lookupId,patch={},token='fixture')=>{
    const res=await handler(new Request('http://fixture',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({op:'look_v2',lookupId,word:'patient',clicked:'patient',sentence:'patient reader',clickedIndex:0,cands:['patient'],...patch})}));
    return {status:res.status,body:await res.json()};
  };
  await db.exec('set role service_role');
  const edgeId=crypto.randomUUID();broken=true;
  assert.equal((await invoke(edgeId)).status,502);assert.equal(await calls(),0);
  broken=false;assert.equal((await invoke(edgeId)).body.ko,answer.ko);assert.equal(await calls(),1);
  const beforeReplay=providerCalls;assert.equal((await invoke(edgeId)).body.ko,answer.ko);
  assert.equal(providerCalls,beforeReplay);assert.equal(await calls(),1);
  await invoke(crypto.randomUUID());assert.equal(await calls(),2);
  // A canonical outside every old lemma candidate succeeds on one provider
  // response, then replays from the real SQL receipt without another charge.
  const selfieId=crypto.randomUUID(),selfieBody={word:'selfy',clicked:'Selfies',sentence:'Selfies are popular.',clickedIndex:0,cands:['selfy','selfies']};
  providerAnswer={kind:'word',canonical:'selfie',members:[0],ko:'셀카'};
  const beforeSelfie=providerCalls;
  const selfie=await invoke(selfieId,selfieBody);
  assert.equal(selfie.status,200);assert.equal(selfie.body.canonical,'selfie');assert.equal(selfie.body.lemma,'selfie');
  assert.equal(providerCalls,beforeSelfie+1);assert.equal(await calls(),3);
  assert.equal((await invoke(selfieId,selfieBody)).body.ko,'셀카');
  assert.equal(providerCalls,beforeSelfie+1);assert.equal(await calls(),3);
  const beforeDenied=providerCalls;
  assert.equal((await invoke(crypto.randomUUID(),selfieBody,'invalid-fixture')).status,401);
  assert.equal(providerCalls,beforeDenied);assert.equal(await calls(),3);
  await db.exec('reset role');
  await db.query('update public.ai_usage set calls=3000 where user_id=$1',[user]);
  await db.exec('set role service_role');
  assert.equal((await invoke(crypto.randomUUID(),selfieBody)).status,429);
  assert.equal(providerCalls,beforeDenied);assert.equal(await calls(),3000);
  await db.exec('reset role');
  await db.query('update public.ai_usage set calls=3 where user_id=$1',[user]);
  await db.exec('reset role;update public.anon_daily set calls=0');
  for(let n=0;n<10;n++)await receipt({u:null,device:'device-1234',kind:'sentence',request:crypto.randomUUID(),result:{ko:'문장 해석'}});
  assert.equal((await receipt({u:null,device:'device-1234',kind:'sentence',request:crypto.randomUUID()})).status,'anon_exhausted');
  assert.equal((await receipt({u:null,device:'device-1234',request:crypto.randomUUID()})).status,'anon_exhausted');
  assert.equal((await receipt({u:null,device:'new-device',kind:'sentence',request:crypto.randomUUID()})).status,'ok');
  const sentenceId=crypto.randomUUID();
  await receipt({u:null,device:'new-device',kind:'sentence',request:sentenceId,result:{ko:'문장 해석'}});
  await receipt({u:null,device:'new-device',kind:'sentence',request:sentenceId,result:{ko:'문장 해석'}});
  assert.equal((await db.query("select calls from public.anon_usage where device='new-device'")).rows[0].calls,2);
  await db.exec("update public.anon_usage set calls=49 where device='new-device'");
  assert.equal((await receipt({u:null,device:'new-device',kind:'sentence',request:crypto.randomUUID(),result:{ko:'문장 해석'}})).status,'anon_exhausted');
  await receipt({u:null,device:'new-device',request:crypto.randomUUID(),result:answer});
  assert.equal((await db.query("select calls from public.anon_usage where device='new-device'")).rows[0].calls,50);
  const beforeSentence=await calls();
  await receipt({kind:'sentence',request:crypto.randomUUID(),result:{ko:'문장 해석'}});
  assert.equal(await calls(),beforeSentence+2);
  // RLS and function privileges deny direct client use.
  await db.exec('reset role;set role anon');
  await assert.rejects(receipt(),/permission denied/);
  await assert.rejects(db.query('select * from public.word_lookup_receipts'),/permission denied/);
  await db.exec('reset role');
  console.log('word lookup quota SQL + Edge orchestration: passed');
}finally{await db.close();}
