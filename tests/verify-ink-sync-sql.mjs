import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const a='11111111-1111-1111-1111-111111111111';
const b='22222222-2222-2222-2222-222222222222';
const book='ab'.repeat(32);
const idA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const idB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const idC='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const pen=id=>({id,color:'#111111',width:1.5,points:[[1,2],[3,4]]});

async function database(){
  const db=new PGlite();
  await db.exec(`create role authenticated;create role anon;create role service_role bypassrls;create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated, service_role;
    grant execute on function auth.uid() to authenticated, service_role;
    insert into auth.users values ('${a}'),('${b}');`);
  await db.exec(readFileSync(new URL('../server/sync/book-cloud.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../server/sync/book-ink.sql',import.meta.url),'utf8'));
  await db.exec(`insert into public.book_cloud (user_id,book_id,kind,byte_size,object_key,status)
    values ('${a}','${book}','pdf',10,'${a}/${book}','ready')`);
  return db;
}
function asUser(db,user){
  return db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${user}',false);`);
}
async function merge(db,user,ops,page=1,bookId=book){
  const result=await db.query('select public.breeze_merge_book_ink($1::uuid,$2,$3,$4::jsonb) as data',[user,bookId,page,JSON.stringify(ops)]);
  return result.rows[0].data;
}

test('owners merge strokes, other accounts cannot read or write them',async()=>{
  const db=await database();
  try{
    await asUser(db,a);
    const first=await merge(db,a,[{id:idA,rev:1,deleted:false,stroke:pen(idA)}]);
    assert.equal(first.ok,true);
    const second=await merge(db,a,[{id:idB,rev:1,deleted:false,stroke:{...pen(idB),tool:'highlighter',strokeId:idC,color:'#ffe34d',width:12,opacity:0.3}}]);
    assert.deepEqual(second.applied,[idB]);
    const rows=await db.query('select stroke_id,rev,deleted from public.book_ink order by stroke_id');
    assert.equal(rows.rows.length,2);
    await db.exec(`select set_config('request.jwt.claim.sub','${b}',false)`);
    assert.equal((await db.query('select stroke_id from public.book_ink')).rows.length,0);
    await assert.rejects(merge(db,a,[{id:idC,rev:1,deleted:false,stroke:pen(idC)}]),/Ink account changed|permission denied/);
    await db.exec('reset role');
    const grants=await db.query(`select has_table_privilege('service_role','public.book_ink','INSERT') as insert,
      has_table_privilege('service_role','public.book_ink','SELECT') as select,
      has_table_privilege('authenticated','public.book_ink','INSERT') as user_insert`);
    assert.equal(grants.rows[0].insert,true);
    assert.equal(grants.rows[0].select,true);
    assert.equal(grants.rows[0].user_insert,false);
    await db.exec('set role authenticated');
    await db.exec(`select set_config('request.jwt.claim.sub','${a}',false)`);
    await assert.rejects(db.exec(`insert into public.book_ink (user_id,book_id,page,stroke_id,rev,deleted,payload)
      values ('${a}','${book}',1,'${idC}',1,false,'{"id":"${idC}"}')`),/permission denied|row-level security/);
  }finally{await db.close();}
});

test('concurrent eraser and add merge; a tie keeps the tombstone',async()=>{
  const db=await database();
  try{
    await asUser(db,a);
    assert.equal((await merge(db,a,[
      {id:idA,rev:1,deleted:false,stroke:pen(idA)},
      {id:idB,rev:1,deleted:false,stroke:pen(idB)}
    ])).ok,true);
    const erased=await merge(db,a,[{id:idA,rev:2,deleted:true},{id:idC,rev:1,deleted:false,stroke:pen(idC)}]);
    assert.equal(erased.ok,true);
    const live=await db.query(`select stroke_id::text as id,deleted from public.book_ink order by stroke_id`);
    assert.deepEqual(live.rows.map(row=>({id:row.id,deleted:row.deleted})),[
      {id:idA,deleted:true},{id:idB,deleted:false},{id:idC,deleted:false}
    ]);
    const tie=await merge(db,a,[{id:idA,rev:2,deleted:false,stroke:pen(idA)}]);
    assert.deepEqual(tie.applied,[idA]);
    assert.equal((await db.query(`select deleted from public.book_ink where stroke_id='${idA}'`)).rows[0].deleted,true);
    const undo=await merge(db,a,[{id:idA,rev:3,deleted:false,stroke:pen(idA)}]);
    assert.equal(undo.ok,true);
    assert.equal((await db.query(`select deleted,payload->>'id' as id from public.book_ink where stroke_id='${idA}'`)).rows[0].deleted,false);
    const stale=await merge(db,a,[{id:idA,rev:2,deleted:true}]);
    assert.equal((await db.query(`select deleted from public.book_ink where stroke_id='${idA}'`)).rows[0].deleted,false);
  }finally{await db.close();}
});

test('unlinked and deleted books reject ink and drop stored strokes',async()=>{
  const db=await database();
  try{
    await asUser(db,a);
    assert.equal((await merge(db,a,[{id:idA,rev:1,deleted:false,stroke:pen(idA)}])).ok,true);
    await db.exec('reset role');
    await db.exec(`update public.book_cloud set status='deleted', tombstone='gone' where user_id='${a}'`);
    assert.equal((await db.query('select count(*)::int as n from public.book_ink')).rows[0].n,0);
    await asUser(db,a);
    const blocked=await merge(db,a,[{id:idB,rev:1,deleted:false,stroke:pen(idB)}]);
    assert.equal(blocked.ok,false);
    assert.equal(blocked.error,'not_linked');
    assert.equal((await db.query('select count(*)::int as n from public.book_ink')).rows[0].n,0);
  }finally{await db.close();}
});

test('a bad stroke does not roll back the earlier stroke in the same batch',async()=>{
  const db=await database();
  try{
    await asUser(db,a);
    const result=await merge(db,a,[
      {id:idA,rev:1,deleted:false,stroke:pen(idA)},
      {id:'not-a-uuid',rev:1,deleted:false,stroke:pen(idB)}
    ]);
    assert.equal(result.ok,false);
    assert.equal(result.error,'bad_stroke');
    assert.deepEqual(result.applied,[idA]);
    const rows=await db.query('select stroke_id::text as id from public.book_ink');
    assert.deepEqual(rows.rows.map(row=>row.id),[idA]);
  }finally{await db.close();}
});

test('page and byte caps stop the overflow and keep the rows already accepted',async()=>{
  const db=await database();
  try{
    await db.exec('reset role');
    const filler=[];
    for(let index=0;index<4000;index++){
      const hex=index.toString(16).padStart(12,'0');
      filler.push(`('${a}','${book}',1,'${hex.slice(0,8)}-aaaa-4aaa-8aaa-${hex}',1,false,'{"id":"${hex.slice(0,8)}-aaaa-4aaa-8aaa-${hex}","color":"#111111","width":1.5,"points":[[1,1]]}'::jsonb)`);
    }
    await db.exec(`insert into public.book_ink (user_id,book_id,page,stroke_id,rev,deleted,payload) values ${filler.join(',')}`);
    await asUser(db,a);
    const capped=await merge(db,a,[{id:idA,rev:1,deleted:false,stroke:pen(idA)}]);
    assert.equal(capped.error,'ink_cap');
    assert.deepEqual(capped.applied,[]);
    assert.equal((await db.query(`select count(*)::int as n from public.book_ink where stroke_id='${idA}'`)).rows[0].n,0);
  }finally{await db.close();}
});
