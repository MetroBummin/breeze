import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {operatorAuthorized} from '../server/rss-catalog/operator-auth.mjs';
import {catalogHandler} from '../server/rss-catalog/handler.mjs';
const url='https://catalog-db.fixture',apiKey='synthetic-public-anon-key';
const token='synthetic.service.signature';
const request=(headers={authorization:'Bearer '+token})=>new Request('https://catalog.fixture/rss-catalog',{method:'POST',headers});
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('catalog operator requires a supported Bearer JWT and configured public validation key',async()=>{
  let calls=0;const fetcher=async()=>{calls++;return Response.json(true);};
  for(const headers of [{},{apikey:token},{authorization:token},{authorization:'Basic '+token},
    {authorization:'Bearer sb_secret_synthetic'},{authorization:'Bearer one.two'},
    {authorization:'Bearer one..three'},{authorization:'Bearer one.two.three.four'},
    {authorization:'Bearer one.two.three extra'},{authorization:'Bearer  '+token}])
    assert.equal(await operatorAuthorized(request(headers),{url,apiKey,fetcher}),false,JSON.stringify(headers));
  assert.equal(await operatorAuthorized(request(),{url:'',apiKey,fetcher}),false);
  assert.equal(await operatorAuthorized(request(),{url,apiKey:'',fetcher}),false);
  assert.equal(calls,0);
});

test('only the existing same-project RPC boolean true authorizes; caller identity is preserved',async()=>{
  let calls=0;
  const authorization='bEaReR '+token;
  assert.equal(await operatorAuthorized(request({authorization,apikey:'ignored-caller-key'}),{
    url,apiKey,fetcher:async(target,options)=>{
      calls++;assert.equal(target,url+'/rest/v1/rpc/rss_quality_operator_authorized');
      assert.equal(options.method,'POST');assert.equal(options.body,'{}');
      assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);
      assert.equal(options.signal.aborted,false);
      assert.deepEqual(options.headers,{apikey:apiKey,Authorization:authorization,'Content-Type':'application/json'});
      return Response.json(true);
    }
  }),true);
  assert.equal(calls,1);
  for(const value of [false,'true',1,null,{},[true],{authorized:true}])
    assert.equal(await operatorAuthorized(request(),{url,apiKey,fetcher:async()=>Response.json(value)}),false);
});

test('anon, forged, expired, absent RPC and rejected RPC responses fail closed',async()=>{
  for(const [caller,status] of [['synthetic.anon.signature',403],['synthetic.forged.signature',401],
    ['synthetic.expired.signature',401],[token,404],[token,500],[token,403]]){
    let refreshes=0;
    const handler=catalogHandler({refresh:async()=>{refreshes++;return {}; }},{
      authorize:incoming=>operatorAuthorized(incoming,{url,apiKey,fetcher:async()=>Response.json(true,{status})})
    });
    assert.equal((await handler(request({authorization:'Bearer '+caller}))).status,401);
    assert.equal(refreshes,0);
  }
  for(const fetcher of [async()=>{throw new TypeError('redirect rejected');},async()=>{throw new Error('network');},
    async()=>new Response('',{status:307,headers:{location:'https://other.fixture/rpc'}}),
    async()=>new Response('invalid JSON'),async()=>new Response(null,{status:204})])
    assert.equal(await operatorAuthorized(request(),{url,apiKey,fetcher}),false);
});

test('operator validation aborts after five seconds and never authorizes a timeout',async()=>{
  const started=Date.now(),keepAlive=setTimeout(()=>{},6500);
  try{
    assert.equal(await operatorAuthorized(request(),{url,apiKey,fetcher:async(_url,{signal})=>new Promise((resolve,reject)=>{
      signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
    })}),false);
    const elapsed=Date.now()-started;assert.ok(elapsed>=4500&&elapsed<6500,`timeout elapsed ${elapsed} ms`);
  }finally{clearTimeout(keepAlive);}
});

test('POST awaits authorization and rejects false, non-booleans and thrown/rejected checks',async()=>{
  for(const authorize of [()=>false,async()=>false,async()=>undefined,async()=>'true',async()=>({ok:true}),
    ()=>{throw Error('auth unavailable');},async()=>{throw Error('auth unavailable');}]){
    let refreshes=0;
    const handler=catalogHandler({refresh:async()=>{refreshes++;return {}; }},{authorize});
    assert.equal((await handler(request())).status,401);assert.equal(refreshes,0);
  }
  let release,refreshes=0;
  const handler=catalogHandler({refresh:async()=>{refreshes++;return {refreshed:true};}},{authorize:()=>new Promise(resolve=>{release=resolve;})});
  const pending=handler(request());await Promise.resolve();assert.equal(refreshes,0);
  release(true);assert.equal((await pending).status,200);assert.equal(refreshes,1);
});

test('public GET and preflight never invoke operator auth or refresh',async()=>{
  const handler=catalogHandler({read:async()=>({catalog:{version:1,feeds:[]}}),refresh:()=>{throw Error('refresh');}},
    {authorize:()=>{throw Error('authorize');}});
  assert.equal((await handler(new Request('https://catalog.fixture/rss-catalog'))).status,200);
  assert.equal((await handler(new Request('https://catalog.fixture/rss-catalog',{method:'OPTIONS'}))).status,204);
});

test('Edge uses the public validation key only, keeps mode off by default and bundles helper',()=>{
  const edge=read('supabase/functions/rss-catalog/index.ts'),bundle=read('tools/rss-catalog-bundle.mjs');
  assert.match(edge,/RSS_CATALOG_MODE'\)!=='active'/);
  assert.ok(edge.indexOf("Deno.env.get('SUPABASE_ANON_KEY')")>edge.indexOf('else{'));
  assert.match(edge,/apiKey=Deno.env.get\('SUPABASE_ANON_KEY'\)\|\|''/);
  assert.match(edge,/authorize:request=>operatorAuthorized\(request,\{url,apiKey\}\)/);
  assert.doesNotMatch(edge,/serviceAuthorization|operatorAuthorized\([^\n]*(?:apiKey:key|apiKey\|\|key)/);
  assert.ok(bundle.includes("'server/rss-catalog/operator-auth.mjs'"));
});

test('existing operator RPC dependency must be stable, invoker, empty-path and service-role-only',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create function public.rss_quality_operator_authorized() returns boolean
      language sql stable security invoker set search_path='' as $$select current_user='service_role'$$;
      revoke all on function public.rss_quality_operator_authorized() from public,anon,authenticated;
      grant execute on function public.rss_quality_operator_authorized() to service_role;`);
    const row=(await db.query(`select p.provolatile='s' as stable,not p.prosecdef as invoker,
      p.proconfig @> array['search_path=""'] as empty_path,p.prorettype='boolean'::regtype as boolean_result,
      has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute,
      has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
      has_function_privilege('authenticated',p.oid,'EXECUTE') as user_execute,
      exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute
      from pg_proc p where p.oid=to_regprocedure('public.rss_quality_operator_authorized()')`)).rows[0];
    assert.deepEqual(row,{stable:true,invoker:true,empty_path:true,boolean_result:true,service_execute:true,anon_execute:false,user_execute:false,public_execute:false});
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role);
      await assert.rejects(db.query('select public.rss_quality_operator_authorized()'),{code:'42501'});
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    assert.equal((await db.query('select public.rss_quality_operator_authorized() as allowed')).rows[0].allowed,true);
    await db.exec('reset role;drop function public.rss_quality_operator_authorized();');
    assert.equal((await db.query("select to_regprocedure('public.rss_quality_operator_authorized()') is null as absent")).rows[0].absent,true);
    for(const file of ['rss_public_catalog.sql','rss_public_catalog_schedule.sql'])
      assert.doesNotMatch(read('server/rss-catalog/schema/'+file),/(?:create|alter|grant|revoke)[^;]*rss_quality_operator_authorized/i);
  }finally{await db.close();}
});
