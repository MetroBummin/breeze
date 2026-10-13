import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectAppleBuildInventory} from '../tools/apple-build-inventory.mjs';
const appId='6804570182';
function fixture(){
 const calls=[];
 const build=(id,version)=>({type:'builds',id,attributes:{version,processingState:'VALID',expired:false,buildAudienceType:'APP_STORE_ELIGIBLE'}});
 const run=(id,number,sha)=>({type:'ciBuildRuns',id,attributes:{number,executionProgress:'COMPLETE',completionStatus:'SUCCEEDED',sourceCommit:{commitSha:sha},isPullRequestBuild:false}});
 const responses=new Map([
  [`/v1/apps/${appId}`,{data:{type:'apps',id:appId,attributes:{bundleId:'kr.io.breeze.app'}}}],
  [`/v1/apps/${appId}/ciProduct`,{data:{type:'ciProducts',id:'product'}}],
  [`/v1/apps/${appId}/builds?limit=200`,[build('old','99'),build('current','274')]],
  ['/v1/ciProducts/product/buildRuns?limit=200',[run('latest',276,'b'.repeat(40)),run('old',274,'a'.repeat(40))]],
  ['/v1/ciBuildRuns/latest/builds?limit=200',[]],
  ['/v1/ciBuildRuns/old/builds?limit=200',[build('current','274')]]
 ]);
 const client={async request(method,path){calls.push({method,path});assert.equal(method,'GET');assert.ok(responses.has(path),path);return responses.get(path);},async list(path){return this.request('GET',path);}};
 return {client,calls,responses};
}
test('inventory reports uploaded and reserved counters separately and uses actual source/build relationships',async()=>{
 const {client,calls}=fixture();const result=await inspectAppleBuildInventory(client,appId);
 assert.equal(result.highestUploadedBuildNumber,'274');assert.equal(result.highestCloudRunNumber,'276');assert.equal(result.highestObservedNumber,'276');
 assert.deepEqual(result.cloudRuns[0].buildIds,[]);assert.deepEqual(result.cloudRuns[1].buildIds,['current']);assert.equal(result.cloudRuns[1].sourceCommit,'a'.repeat(40));
 assert.ok(calls.every(c=>c.method==='GET'));assert.equal(result.builds[0].number,'274');
});
test('wrong app and malformed counters fail closed without misleading maxima',async()=>{
 const f=fixture();f.responses.get(`/v1/apps/${appId}`).data.attributes.bundleId='foreign';await assert.rejects(inspectAppleBuildInventory(f.client,appId));assert.equal(f.calls.length,1);
 const g=fixture();g.responses.get(`/v1/apps/${appId}/builds?limit=200`)[0].attributes.version='1.2';await assert.rejects(inspectAppleBuildInventory(g.client,appId),/Non-integer/);
 await assert.rejects(inspectAppleBuildInventory(g.client,'../foreign'));
});
test('read denial propagates and never tries a write or alternate app',async()=>{
 const {client,calls}=fixture();client.list=async path=>{calls.push({method:'GET',path});throw Error('ASC HTTP 403');};
 await assert.rejects(inspectAppleBuildInventory(client,appId),/403/);assert.equal(calls.length,2);
});
