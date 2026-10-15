import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('review-only study table enforces owner access, conditional writes, shape, and account cascade locally',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role authenticated;create role anon;create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
      insert into auth.users values ('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222');`);
    await db.exec(readFileSync(new URL('../server/sync/study-state.sql',import.meta.url),'utf8'));
    const a='11111111-1111-1111-1111-111111111111',b='22222222-2222-2222-2222-222222222222';
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
    const data=JSON.stringify({version:1,revision:'first',payload:{sets:{version:2,sets:[{id:'set-a',cards:[]},{id:'set-b',cards:[]}]},tests:{kept:true}}});
    await db.query("insert into public.study_state values ($1,'learning-v1',$2)",[a,data]);
    await assert.rejects(db.query("insert into public.study_state values ($1,'learning-v1',$2)",[b,data]),/row-level security/);
    const changed=await db.query("update public.study_state set data=jsonb_set(data,'{revision}','\"second\"') where user_id=$1 and key='learning-v1' and data->>'revision'='first' returning key",[a]);
    assert.equal(changed.rows.length,1);
    assert.equal((await db.query("update public.study_state set data=$2 where user_id=$1 and key='learning-v1' and data->>'revision'='first' returning key",[a,data])).rows.length,0);
    const patch=async(from,to,sets,owner=a)=>(await db.query('select public.breeze_patch_study_sets($1::uuid,$2,$3,$4::jsonb) as ok',[owner,from,to,JSON.stringify(sets)])).rows[0].ok;
    assert.equal(await patch('second','third',[{id:'set-a',cards:[{word:'one'}]}]),true);
    const patched=(await db.query('select data from public.study_state')).rows[0].data;
    assert.deepEqual(patched.payload.sets.sets,[{id:'set-a',cards:[{word:'one'}]},{id:'set-b',cards:[]}]);
    assert.deepEqual(patched.payload.tests,{kept:true});
    assert.equal(await patch('second','stale',[]),false);
    assert.equal(await patch('third','unknown',[{id:'missing'}]),false);
    await assert.rejects(patch('third','bad',[{id:'set-a'},{id:'set-a'}]),/Invalid study set patch/);
    await assert.rejects(db.query("update public.study_state set data='{}' where user_id=$1",[a]),/check constraint/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[b]);
    assert.equal((await db.query('select * from public.study_state')).rows.length,0);
    await db.query("insert into public.study_state values ($1,'learning-v1',$2)",[b,JSON.stringify({...patched,revision:'third'})]);
    await assert.rejects(patch('third','wrong-owner',[{id:'set-a',cards:[{word:'intrusion'}]}]),/Study account changed/);
    assert.deepEqual((await db.query('select data from public.study_state')).rows[0].data,patched);
    assert.equal((await db.query("delete from public.study_state where user_id=$1 returning key",[a])).rows.length,0);
    await db.exec('reset role;set role anon');
    await assert.rejects(db.query('select * from public.study_state'),/permission denied/);
    await db.exec('reset role');
    await db.query('delete from auth.users where id=$1',[a]);
    assert.equal((await db.query('select * from public.study_state where user_id=$1',[a])).rows.length,0);
  }finally{await db.close();}
});
