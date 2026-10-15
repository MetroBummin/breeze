import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
test('word delta SQL keeps old-client snapshots, isolates owners, handles retry and CAS conflicts',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role authenticated; create role anon; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon;
      create table words(user_id uuid,key text,data jsonb,primary key(user_id,key));
      alter table words enable row level security;
      create policy owner on words for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
      grant select,insert,update,delete on words to authenticated;
      insert into words values('00000000-0000-0000-0000-000000000001','__breeze_wordbook_v1__',
      '{"v":1,"revision":"r1","legacyImportedAt":1,"words":{"bank":{"word":"bank","ko":"은행"},"old":{"word":"old","ko":"옛"}},"dead":{}}'),
      ('00000000-0000-0000-0000-000000000002','__breeze_wordbook_v1__','{"v":1,"revision":"r1","words":{},"dead":{}}');`);
    await db.exec(readFileSync(new URL('../server/sync/wordbook-patch.sql',import.meta.url),'utf8'));
    await db.exec("set role authenticated; set test.uid='00000000-0000-0000-0000-000000000001'");
    const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
    const patch=async(from,to,w,d,owner=a)=>(await db.query('select breeze_patch_wordbook($1::uuid,$2,$3,$4::jsonb,$5::jsonb) as ok',[owner,from,to,JSON.stringify(w),JSON.stringify(d)])).rows[0].ok;
    assert.equal(await patch('r1','r2',{new:{word:'new',ko:'새',custom:null},old:null},{old:20}),true);
    assert.equal(await patch('r1','r2',{new:{word:'new',ko:'새'},old:null},{old:20}),true);
    assert.equal(await patch('r1','stale',{bad:{word:'bad',ko:'나쁨'}},{}),false);
    const {data}=(await db.query('select data from words')).rows[0];
    assert.deepEqual(Object.keys(data.words).sort(),['bank','new']);
    assert.equal(data.words.new.custom,null);assert.equal(data.legacyImportedAt,1);assert.equal(data.dead.old,20);
    await db.exec("set test.uid='00000000-0000-0000-0000-000000000002'");
    await assert.rejects(patch('r1','r3',{intrusion:{ko:'no'}},{}),/Wordbook account changed/);
    assert.equal(await patch('r2','r3',{intrusion:{ko:'no'}},{},b),false);
    assert.deepEqual((await db.query('select data from words')).rows[0].data.words,{});
    await db.exec("set role anon");
    await assert.rejects(patch('r1','r2',{},{}),/permission denied/);
  }finally{await db.close();}
});
