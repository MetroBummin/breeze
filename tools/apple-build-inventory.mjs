// Read-only metadata inventory through the existing trusted Apple release client.
import assert from 'node:assert/strict';
const idPattern=/^[A-Za-z0-9-]{1,100}$/;
function resource(value,type){assert.ok(value?.type===type&&idPattern.test(value.id),'Invalid inventory resource');return value;}
function number(value){const s=String(value);assert.match(s,/^[1-9]\d{0,17}$/,'Non-integer Apple build counter');return s;}
const descending=(a,b)=>BigInt(a.number)>BigInt(b.number)?-1:BigInt(a.number)<BigInt(b.number)?1:0;
export async function inspectAppleBuildInventory(client,appId){
 assert.match(appId,/^[1-9]\d{0,19}$/);
 const app=resource((await client.request('GET',`/v1/apps/${appId}`)).data,'apps');
 assert.equal(app.id,appId);assert.equal(app.attributes?.bundleId,'kr.io.breeze.app');
 const builds=(await client.list(`/v1/apps/${appId}/builds?limit=200`)).map(value=>{
  const b=resource(value,'builds');return {id:b.id,number:number(b.attributes?.version),uploadedDate:b.attributes.uploadedDate,
   processingState:b.attributes.processingState,expired:b.attributes.expired,buildAudienceType:b.attributes.buildAudienceType};
 }).sort(descending);
 const product=resource((await client.request('GET',`/v1/apps/${appId}/ciProduct`)).data,'ciProducts');
 const runs=(await client.list(`/v1/ciProducts/${product.id}/buildRuns?limit=200`)).map(value=>{
  const r=resource(value,'ciBuildRuns'),a=r.attributes;return {id:r.id,number:number(a?.number),
   executionProgress:a.executionProgress,completionStatus:a.completionStatus,isPullRequestBuild:a.isPullRequestBuild,
   sourceCommit:a.sourceCommit?.commitSha??null,startedDate:a.startedDate??null};
 }).sort(descending);
 // Explicit relationships identify the uploaded binaries for recent runs; equal
 // counters alone do not prove that a TestFlight build belongs to a source SHA.
 for(const run of runs.slice(0,5))run.buildIds=(await client.list(`/v1/ciBuildRuns/${run.id}/builds?limit=200`)).map(b=>resource(b,'builds').id);
 const max=[builds[0],runs[0]].filter(Boolean).sort(descending)[0]?.number??null;
 return {appId,highestUploadedBuildNumber:builds[0]?.number??null,highestCloudRunNumber:runs[0]?.number??null,
  highestObservedNumber:max,buildCount:builds.length,cloudRunCount:runs.length,builds:builds.slice(0,20),cloudRuns:runs.slice(0,20),
  readiness:'Metadata only; VALID is not proof of tester installation or App Review submission.'};
}
