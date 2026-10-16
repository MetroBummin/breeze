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
