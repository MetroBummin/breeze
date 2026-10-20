import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const a='11111111-1111-1111-1111-111111111111';
const b='22222222-2222-2222-2222-222222222222';
const book='ab'.repeat(32);

test('book cloud rows stay owner-readable, capped, and position writes are conditional',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role authenticated;create role anon;create role service_role bypassrls;create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
      insert into auth.users values ('${a}'),('${b}');`);
    await db.exec(readFileSync(new URL('../server/sync/book-cloud.sql',import.meta.url),'utf8'));
    await db.exec('set role service_role');
    await db.exec(`insert into public.book_cloud (user_id,book_id,kind,byte_size,object_key,status)
      values ('${a}','${book}','epub',10,'${a}/${book}','ready')`);
    assert.equal((await db.query('select book_id from public.book_cloud')).rows.length,1);
    await db.exec('reset role');
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
    assert.equal((await db.query('select book_id from public.book_cloud')).rows.length,1);
    await assert.rejects(db.query(`insert into public.book_cloud (user_id,book_id,kind,byte_size,object_key,status) values ('${a}','${'cd'.repeat(32)}','pdf',1,'${a}/${'cd'.repeat(32)}','ready')`),/permission denied|row-level security/);
    const put=async(expected,next,locator,owner=a)=> (await db.query('select public.breeze_put_book_position($1::uuid,$2,$3,$4,$5::jsonb) as data',[owner,book,expected,next,JSON.stringify(locator)])).rows[0].data;
    assert.equal((await put(null,'rev-1',{p:0.25,mode:'text'})).ok,true);
    assert.equal((await put('rev-1','rev-2',{p:0.5,mode:'text'})).ok,true);
    const stale=await put('rev-1','rev-3',{p:0.1,mode:'text'});
    assert.equal(stale.ok,false);
    assert.equal(stale.revision,'rev-2');
    assert.equal(stale.locator.p,0.5);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[b]);
    assert.equal((await db.query('select book_id from public.book_cloud')).rows.length,0);
    await assert.rejects(put('rev-2','stolen',{p:1},a),/Book account changed|permission denied/);
    await db.exec('reset role');
    const filler=Array.from({length:40},(_,index)=>`('${a}','${index.toString(16).padStart(64,'0')}','txt',1,'${a}/${index.toString(16).padStart(64,'0')}','ready')`).join(',');
    await assert.rejects(db.exec(`insert into public.book_cloud (user_id,book_id,kind,byte_size,object_key,status) values ${filler}`),/book_cap/);
  }finally{await db.close();}
});

test('each device keeps its own place and a stale upload cannot remove another',async()=>{
  const db=new PGlite();
  const phone='phone-device';
  const tablet='tablet-device';
  try{
    await db.exec(`create role authenticated;create role anon;create role service_role bypassrls;create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
      insert into auth.users values ('${a}'),('${b}');`);
    await db.exec(readFileSync(new URL('../server/sync/book-cloud.sql',import.meta.url),'utf8'));
    await db.exec('set role service_role');
    await db.exec(`insert into public.book_cloud (user_id,book_id,kind,byte_size,object_key,status)
      values ('${a}','${book}','epub',10,'${a}/${book}','ready')`);
    await db.exec('reset role');
    await db.query(`insert into public.positions (user_id,book_id,data) values ($1,$2,$3::jsonb)`,
      [a,book,JSON.stringify({v:1,revision:'rev-1',locator:{p:0.2,t:1000,mode:'text'}})]);
    await db.exec(readFileSync(new URL('../server/sync/book-device-position.sql',import.meta.url),'utf8'));
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
    const legacy=(await db.query(`select locator from public.book_device_positions where device_id='legacy'`)).rows;
    assert.equal(legacy.length,1);
    assert.equal(legacy[0].locator.p,0.2);
    const put=async(expected,next,locator)=> (await db.query('select public.breeze_put_book_position($1::uuid,$2,$3,$4,$5::jsonb) as data',[a,book,expected,next,JSON.stringify(locator)])).rows[0].data;
    const device=async(id,locator,owner=a,target=book)=>db.query('select public.breeze_put_device_book_position($1::uuid,$2,$3,$4::jsonb) as data',[owner,target,id,JSON.stringify(locator)]);
    assert.equal((await put('rev-1','rev-2',{p:0.4,t:2000,mode:'text'})).ok,true);
    assert.equal((await db.query(`select locator from public.book_device_positions where device_id='legacy'`)).rows[0].locator.p,0.4);
    const stale=await put('rev-1','rev-3',{p:0.1,t:9000,mode:'text'});
    assert.equal(stale.ok,false);
    assert.equal((await db.query(`select locator from public.book_device_positions where device_id='legacy'`)).rows[0].locator.p,0.4);
    assert.equal((await db.query('select count(*)::int as n from public.book_device_positions')).rows[0].n,1);
    assert.equal((await device(phone,{p:0.8,t:5000,mode:'text'})).rows[0].data.ok,true);
    assert.equal((await device(tablet,{p:0.9,t:8000,mode:'text'})).rows[0].data.ok,true);
    assert.equal((await device(phone,{p:0.1,t:1000,mode:'text'})).rows[0].data.ok,true);
    const rows=(await db.query(`select device_id,locator->>'p' as p,(extract(epoch from read_at)*1000)::bigint as ms from public.book_device_positions order by device_id`)).rows;
    assert.deepEqual(rows.map(row=>row.device_id),['legacy',phone,tablet]);
    assert.equal(rows.find(row=>row.device_id===phone).p,'0.1');
    assert.equal(Number(rows.find(row=>row.device_id===phone).ms),1000);
    assert.equal(rows.find(row=>row.device_id===tablet).p,'0.9');
    assert.equal(Number(rows.find(row=>row.device_id===tablet).ms),8000);
    assert.equal((await db.query(`select data->'locator'->>'p' as p from public.positions`)).rows[0].p,'0.4');
    await assert.rejects(device('legacy',{p:1,t:1,mode:'text'}),/Invalid reading position/);
    await assert.rejects(device(phone,{p:1,t:1,mode:'text'},a,'cd'.repeat(32)),/not linked/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[b]);
    await assert.rejects(device(phone,{p:1,t:1,mode:'text'},a),/Book account changed/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
    await assert.rejects(db.query(`insert into public.book_device_positions (user_id,book_id,device_id,locator,read_at) values ('${a}','${book}','direct','{}'::jsonb,now())`),/permission denied|row-level security/);
    assert.equal((await db.query('select count(*)::int as n from public.book_device_positions')).rows[0].n,3);
  }finally{await db.close();}
});
