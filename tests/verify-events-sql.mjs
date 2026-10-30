// Real inserts into product_events through the production migrations, as the
// anon and authenticated roles PostgREST uses. pg_cron is stubbed; everything
// else is the migration SQL as written.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';

const user='44444444-4444-4444-8444-444444444444';
const other='55555555-5555-4555-8555-555555555555';
const migration=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');

async function database(){
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text);
    create table auth.identities(user_id uuid,provider_id text,identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated,service_role;
    grant select on auth.users,auth.identities to service_role;
    grant execute on function auth.uid() to anon,authenticated;
    insert into auth.users values ('${user}','reader@example.com'),('${other}','other@example.com');
    create schema cron;
    create table cron.job(jobid serial primary key,jobname text unique,active boolean default true);
    create table cron.job_run_details(jobid integer,start_time timestamptz);
    create function cron.schedule(name text,cron text,command text) returns integer language sql as $$
      insert into cron.job(jobname) values (name) on conflict (jobname) do update set jobname=excluded.jobname returning jobid $$;
    create function cron.alter_job(job_id integer,active boolean) returns void language sql as $$
      update cron.job set active=alter_job.active where jobid=job_id $$;`);
  await db.exec(migration('20261026054149_product_events.sql').replace(/^create extension if not exists pg_cron.*$/m,''));
  await db.exec(migration('20261030150000_product_events_referrer.sql'));
  return db;
}
const row=(patch={})=>({name:'app_open',device_id:'device-0001',app_version:'1.9.9',platform:'web',onboarding_version:'v1',props:{},...patch});
async function insertAs(db,role,sub,rows){
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[sub||'']);
  await db.exec('set role '+role);
  try{
    for(const r of rows){
      const cols=Object.keys(r);
      await db.query(`insert into public.product_events (${cols.join(',')}) values (${cols.map((_,i)=>'$'+(i+1)).join(',')})`,
        cols.map(c=>typeof r[c]==='object'&&r[c]!==null?JSON.stringify(r[c]):r[c]));
    }
  }finally{await db.exec('reset role');}
}

test('anon and signed-in inserts store UTM, referrer host, and the JWT user only',async()=>{
  const db=await database();
  try{
    const touch={utm_source:'x',utm_medium:'post',utm_campaign:'261030-launch',utm_content:'t1',referrer_host:'t.co'};
    await insertAs(db,'anon','',[row({...touch}),row({name:'onboarding_start',props:{replay:false},...touch})]);
    // A signed-in client gets its own id even if it claims another one.
    await insertAs(db,'authenticated',user,[row({name:'app_open',device_id:'device-0002',user_id:user,...touch})]);
    await insertAs(db,'authenticated',user,[row({name:'vocab_save',device_id:'device-0002',props:{first:true}})]);
    // The guard trigger replaces any client-supplied id with auth.uid().
    await insertAs(db,'authenticated',user,[row({name:'first_word_tap',device_id:'device-0002',user_id:other})]);
    await insertAs(db,'anon','',[row({name:'first_word_tap',device_id:'device-0001',user_id:user})]);
    // Insert-only: neither role can read back.
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role);
      await assert.rejects(db.query('select * from public.product_events'),/permission denied/);
      await assert.rejects(db.query('select * from public.product_events_analysis'),/permission denied/);
      await db.exec('reset role');
    }
    // Only a bare host name fits the column.
    for(const bad of ['https://t.co/abc','t.co/path','T.CO','localhost','a b.com']){
      await assert.rejects(insertAs(db,'anon','',[row({device_id:'device-0003',referrer_host:bad})]),/referrer_host_chk/,bad);
    }
    await db.exec('set role service_role');
    const stored=(await db.query(`select name,device_id,user_id,utm_source,utm_medium,utm_campaign,utm_content,referrer_host
      from public.product_events_analysis order by created_at,name`)).rows;
    await db.exec('reset role');
    assert.equal(stored.length,6);
    const anon=stored.filter(r=>r.device_id==='device-0001');
    assert.deepEqual(anon.map(r=>r.name).sort(),['app_open','first_word_tap','onboarding_start']);
    assert.ok(anon.every(r=>r.user_id===null));
    for(const r of anon.filter(r=>r.name!=='first_word_tap')){
      assert.equal(r.user_id,null);
      assert.equal(r.utm_source,'x');assert.equal(r.utm_campaign,'261030-launch');assert.equal(r.referrer_host,'t.co');
    }
    const signed=stored.filter(r=>r.device_id==='device-0002');
    assert.equal(signed.length,3);
    assert.ok(signed.every(r=>r.user_id===user));
    assert.equal(signed.find(r=>r.name==='vocab_save').referrer_host,null);
  }finally{await db.close();}
});

test('the browser logger payload is accepted by the database as sent',async()=>{
  const db=await database();
  try{
    const memory=new Map(),bodies=[];
    const context={
      localStorage:{getItem:k=>memory.has(k)?memory.get(k):null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)},
      URL,URLSearchParams,JSON,Date,Math,Number,String,Object,Array,Promise,setTimeout,clearTimeout,crypto,console,
      location:{search:'?utm_source=threads&utm_medium=post&utm_campaign=261030-launch&ref_host=www.threads.net',hostname:'breeze.io.kr',protocol:'https:'},
      document:{referrer:'https://breeze.io.kr/landing/'},
      BREEZE_CONFIG:{SB_URL:'https://example.supabase.co',SB_KEY:'anon-key'},
      fetch:async(_url,init)=>{bodies.push({auth:init.headers.Authorization,rows:JSON.parse(init.body)});return {ok:true,status:201};}
    };
    context.globalThis=context;context.window=context;
    vm.createContext(context);
    vm.runInContext(readFileSync(new URL('../scripts/core/events.js',import.meta.url),'utf8'),context);
    context.trackEvent('app_open');
    context.trackEvent('onboarding_start',{replay:false});
    await context.eventFlush();
    assert.equal(bodies.length,1);
    assert.equal(bodies[0].auth,'Bearer anon-key');
    await insertAs(db,'anon','',bodies[0].rows);
    await db.exec('set role service_role');
    const stored=(await db.query('select name,utm_source,utm_medium,utm_campaign,referrer_host,user_id from public.product_events order by name')).rows;
    await db.exec('reset role');
    assert.deepEqual(stored.map(r=>({...r})),[
      {name:'app_open',utm_source:'threads',utm_medium:'post',utm_campaign:'261030-launch',referrer_host:'threads.net',user_id:null},
      {name:'onboarding_start',utm_source:'threads',utm_medium:'post',utm_campaign:'261030-launch',referrer_host:'threads.net',user_id:null}
    ]);
  }finally{await db.close();}
});
