import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const config=readFileSync(new URL('../config.js',import.meta.url),'utf8');
const baseUrl=config.match(/SB_URL:\s*'([^']+)'/)?.[1];
const publicKey=config.match(/SB_KEY:\s*'([^']+)'/)?.[1];
assert.ok(baseUrl&&publicKey,'Supabase public client config is missing');
const endpoint=baseUrl.replace(/\/$/,'')+'/functions/v1/dict';
const device='jev-live-'+crypto.randomUUID();

async function request(payload){
  const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',apikey:publicKey,
    authorization:'Bearer '+publicKey},body:JSON.stringify(payload)});
  return {status:response.status,body:await response.json().catch(()=>({error:'invalid_json'}))};
}
const senseFixtures=[
  {word:'bank',sentence:'She deposited the check at the bank.',senses:['강둑','은행'],expected:'sense_1'},
  {word:'bright',sentence:'The bright student solved the puzzle immediately.',senses:['빛이 밝은','영리한'],expected:'sense_1'},
  {word:'run',sentence:'She runs a growing software company.',senses:['달리다'],expected:'NEW'},
  {word:'charge',sentence:'The prosecutor will charge him with fraud.',senses:['요금','충전하다'],expected:'NEW'},
];
const senseResults=[];
for(let repeat=1;repeat<=2;repeat++)for(const fixture of senseFixtures){
  const result=await request({op:'judge',word:fixture.word,sentence:fixture.sentence,
    senses:fixture.senses.map(meaning=>({meaning}))});
  assert.equal(result.status,200,`${fixture.word}: judge failed`);
  assert.equal(result.body.selected,fixture.expected,`${fixture.word}: wrong live sense selection`);
  senseResults.push({repeat,word:fixture.word,selected:result.body.selected,confidence:result.body.confidence});
}

function routeTokens(sentence){
  return sentence.match(/[A-Za-z](?:[A-Za-z'’\\-]*[A-Za-z])?/g)||[];
}
function routeClickedIndex(word,tokens){
  const wanted=word.toLowerCase();
  return tokens.findIndex(token=>{
    const lower=token.toLowerCase();
    return lower===wanted||lower.startsWith(wanted);
  });
}
async function runFlow({word,sentence,senses,sameContext=false,breakRoute=false}){
  const calls={route:0,look:0};
  if(sameContext)return {calls,result:'saved'};
  const tokens=routeTokens(sentence),clickedIndex=breakRoute?999:routeClickedIndex(word,tokens);
  calls.route++;
  const routed=await request({op:'route',word,sentence,clickedIndex,
    tokens:tokens.map(text=>({text})),senses:senses.map(meaning=>({meaning}))});
  if(routed.status===200&&routed.body.selected!=='NONE'){
    return {calls,result:routed.body.selected};
  }
  calls.look++;
  const generated=await request({op:'look',word,clicked:word,cands:[word],sentence,device});
  assert.equal(generated.status,200);assert.ok(generated.body.ko);
  return {calls,result:routed.status===200?'NONE':'route-fallback'};
}

const flows={
  sameSentence:await runFlow({word:'bank',sentence:'She deposited the check at the bank.',senses:['강둑','은행'],sameContext:true}),
  existingSense:await runFlow({word:'bank',sentence:'She deposited the check at the bank.',senses:['강둑','은행']}),
  newSense:await runFlow({word:'run',sentence:'She runs a growing software company.',senses:['달리다']}),
  routeFailure:await runFlow({word:'bright',sentence:'The bright student solved it.',senses:['빛이 밝은'],breakRoute:true}),
};
assert.deepEqual(flows.sameSentence.calls,{route:0,look:0});
assert.deepEqual(flows.existingSense.calls,{route:1,look:0});
assert.deepEqual(flows.newSense.calls,{route:1,look:1});
assert.deepEqual(flows.routeFailure.calls,{route:1,look:1});
console.log(JSON.stringify({senseCalls:senseResults.length,senseResults,flows},null,2));
