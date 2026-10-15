import test from 'node:test';
import assert from 'node:assert/strict';
import {handleBookCloud, deleteAccountBookCloud} from '../server/books/handler.ts';

const user='11111111-1111-1111-1111-111111111111';
const book='ab'.repeat(32);
const env=names=>({get:name=>names[name]});
const ready={
  R2_ACCOUNT_ID:'dc26cb1d2297ca2206a0434ff88e24b4',
  R2_BUCKET:'breeze-books',
  R2_ACCESS_KEY_ID:'access',
  R2_SECRET_ACCESS_KEY:'secret'
};

function request(body,token='jwt'){
  return new Request('https://example.test/book-cloud',{method:'POST',headers:token?{Authorization:'Bearer '+token}:{},body:JSON.stringify(body)});
}
function chain(result){
  const node={eq(){return node;},maybeSingle:async()=>result,then(resolve,reject){return Promise.resolve(result).then(resolve,reject);}};
  return {select(){return node;},insert:async()=>({}),update(){return node;}};
}

test('missing R2 secrets fail before auth and before any R2 call',async()=>{
  let fetched=false,authed=false;
  const admin={auth:{getUser:async()=>{authed=true;return {data:{user:{id:user}}};}},from(){throw new Error('table');}};
  const response=await handleBookCloud(request({op:'reserve',bookId:book}),env({}),admin,async()=>{fetched=true;throw new Error('network');});
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{ok:false,error:'r2_not_configured',message:'R2 설정이 없습니다.'});
  assert.equal(fetched,false);
  assert.equal(authed,false);
});

test('reserve builds the object key on the server and another account cannot choose it',async()=>{
  const writes=[];
  const admin={
    auth:{getUser:async()=>({data:{user:{id:user}}})},
    from(){
      const node=chain({data:null});
      node.select=()=>node;
      node.eq=()=>node;
      node.maybeSingle=async()=>({data:null});
      node.then=(resolve,reject)=>Promise.resolve({data:[]}).then(resolve,reject);
      node.insert=async record=>{writes.push(record);return {};};
      return node;
    }
  };
  const response=await handleBookCloud(request({op:'reserve',bookId:book,size:12,kind:'epub',title:'Sample',acknowledgedTombstone:''}),env(ready),admin,async()=>{throw new Error('no put yet');});
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.ok,true);
  assert.equal(writes[0].object_key,user+'/'+book);
  assert.equal(body.url.includes(user+'/'+book),true);
  assert.equal(writes[0].user_id,user);
});

test('download and remove refuse a book id that is not owned',async()=>{
  const admin={
    auth:{getUser:async()=>({data:{user:{id:user}}})},
    from(){return chain({data:null});}
  };
  const download=await handleBookCloud(request({op:'download',bookId:book}),env(ready),admin);
  assert.equal(download.status,404);
  const remove=await handleBookCloud(request({op:'remove',bookId:book}),env(ready),admin);
  assert.equal((await remove.json()).removed,true);
});

test('account deletion is a no-op when the table is missing and fails closed when objects exist without R2',async()=>{
  const missing={from(){return {select:()=>({eq:async()=>({error:{code:'42P01',message:'book_cloud does not exist'}})})};}};
  assert.deepEqual(await deleteAccountBookCloud(missing,env({}),user),{ok:true});
  let fetched=false;
  const present={from(){return {select:()=>({eq:async()=>({data:[{object_key:user+'/'+book}]})})};}};
  const blocked=await deleteAccountBookCloud(present,env({}),user,async()=>{fetched=true;return new Response(null,{status:204});});
  assert.equal(blocked.ok,false);
  assert.equal(fetched,false);
});
