// Offline tests of the unchanged deployed auth-helper snapshot. HTTP responses
// are mocks, not live JWT verification or calls to the production function.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {operatorAuthorized} from './fixtures/rss-quality/production-v6-operator-auth.mjs';
const review=JSON.parse(readFileSync(new URL('../docs/qa/rss-purpose-20261005/v6-source-review.json',import.meta.url)));
const config={url:'https://unit-test.invalid',apiKey:'test-public-apikey'};
const request=(authorization='Bearer caller-jwt')=>new Request('https://unit-test.invalid/functions/v1/rss-quality',{
  method:'POST',headers:authorization===null?{}:{Authorization:authorization}});
test('review records the deployed gateway and service-only INVOKER RPC boundary',()=>{
  assert.equal(review.deploymentVersion,6);assert.equal(review.verifyJwt,true);
  assert.equal(review.operatorRpc.securityDefiner,false);assert.equal(review.operatorRpc.searchPath,'');
  assert.deepEqual([review.operatorRpc.anonExecute,review.operatorRpc.authenticatedExecute,review.operatorRpc.serviceRoleExecute],[false,false,true]);
  assert.match(review.operatorRpc.definition,/current_user = 'service_role'/);
});
test('tested auth helper is byte-identical to the fetched v6 source',()=>{
  const source=readFileSync(new URL('./fixtures/rss-quality/production-v6-operator-auth.mjs',import.meta.url));
  assert.equal(createHash('sha256').update(source).digest('hex'),review.files.find(f=>f.name==='server/rss-quality/operator-auth.mjs').sha256);
});
test('auth forwards the exact caller header using the public apikey and fixed RPC',async()=>{
  let calls=0;
  const ok=await operatorAuthorized(request(),{...config,fetcher:async(url,options)=>{
    calls++;assert.equal(url,'https://unit-test.invalid/rest/v1/rpc/rss_quality_operator_authorized');
    assert.equal(options.method,'POST');assert.equal(options.body,'{}');assert.equal(options.redirect,'error');
    assert.equal(options.headers.Authorization,'Bearer caller-jwt');assert.equal(options.headers.apikey,'test-public-apikey');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json(true);
  }});
  assert.equal(ok,true);assert.equal(calls,1);
});
test('missing config or malformed bearer performs no authorization request',async()=>{
  let calls=0;const fetcher=async()=>{calls++;return Response.json(true);};
  for(const authorization of [null,'Basic caller','Bearer','Bearer a b'])assert.equal(await operatorAuthorized(request(authorization),{...config,fetcher}),false);
  for(const override of [{url:''},{apiKey:''}])assert.equal(await operatorAuthorized(request(),{...config,...override,fetcher}),false);
  assert.equal(calls,0);
});
test('HTTP rejection, false, truthy non-booleans and invalid responses fail closed',async()=>{
  for(const response of [Response.json(true,{status:401}),Response.json(true,{status:403}),Response.json(false),
    Response.json('true'),Response.json(1),Response.json({authorized:true}),new Response('invalid-json')]){
    assert.equal(await operatorAuthorized(request(),{...config,fetcher:async()=>response}),false);
  }
});
test('network exceptions and forged role claims cannot bypass PostgREST rejection',async()=>{
  assert.equal(await operatorAuthorized(request(),{...config,fetcher:async()=>{throw Error('test transport');}}),false);
  let called=false;
  // Merely carrying service_role in an unsigned token is not authorization.
  const fake='eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.invalid';
  assert.equal(await operatorAuthorized(request('Bearer '+fake),{...config,fetcher:async()=>{called=true;return Response.json(false,{status:401});}}),false);
  assert.equal(called,true);
});
test('captured RPC definition plus observed ACL rejects ordinary roles (local Postgres)',async()=>{
  const db=new PGlite();
  try{
    await db.exec('create role anon; create role authenticated; create role service_role;');
    await db.exec(review.operatorRpc.definition);
    // Reconstruct the observed ACL in an ephemeral database only.
    await db.exec('revoke all on function public.rss_quality_operator_authorized() from public, anon, authenticated; grant execute on function public.rss_quality_operator_authorized() to service_role;');
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role);
      await assert.rejects(db.query('select public.rss_quality_operator_authorized()'),/permission denied/);
      await db.exec('reset role');
    }
    assert.equal((await db.query('select public.rss_quality_operator_authorized() as authorized')).rows[0].authorized,false);
    await db.exec('set role service_role');
    assert.equal((await db.query('select public.rss_quality_operator_authorized() as authorized')).rows[0].authorized,true);
    await db.exec('reset role');
    assert.equal((await db.query("select prosecdef from pg_proc where proname='rss_quality_operator_authorized'")).rows[0].prosecdef,false);
  }finally{await db.close();}
});
