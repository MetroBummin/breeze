import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const config=readFileSync(new URL('../config.js',import.meta.url),'utf8');
const baseUrl=config.match(/SB_URL:\s*'([^']+)'/)?.[1];
const publicKey=config.match(/SB_KEY:\s*'([^']+)'/)?.[1];
assert.ok(baseUrl&&publicKey,'Supabase public client config is missing');
const endpoint=baseUrl.replace(/\/$/,'')+'/functions/v1/dict';
const tokenRe=/[A-Za-z](?:[A-Za-z'’\-]*[A-Za-z])?/g;
const threshold=0.75;

const fixtures=[
  ['take-care','I will take care of the plants.',2,[2,3,4]],
  ['looks-forward','Mina looks forward to meeting you.',1,[1,2,3]],
  ['give-up','Please give up smoking now.',1,[1,2]],
  ['interested-in','She is interested in modern art.',2,[1,2,3]],
  ['take-gap','She took the difficult issue into account before deciding.',1,[1,5,6]],
  ['give-gap','He gave the risky idea up after lunch.',1,[1,5]],
  ['put-gap','They put this ambitious plan into practice immediately.',1,[1,5,6]],
  ['takes-form','He takes care of every detail.',1,[1,2,3]],
  ['taken-form','The plants were taken care of during winter.',3,[3,4,5]],
  ['giving-form','She is giving the old habit up gradually.',2,[2,6]],
  ['plain-took','She took the red book from the shelf.',1,[]],
  ['plain-gave','He gave his friend a book.',1,[]],
  ['plain-run','The athlete ran quickly across the field.',2,[]],
  ['plain-interesting','The lecture was interesting and concise.',3,[]],
  ['ambiguous-look-direction','She looked forward across the field.',1,[]],
  ['ambiguous-account','His account of the event was detailed.',1,[]],
  ['long-gap',
    'After reviewing every proposal that the committee had received during the unusually busy month, she finally took the most difficult budget issue into account before announcing a careful decision to the waiting staff.',
    16,[16,22,23]],
];

function tokens(sentence){return [...sentence.matchAll(tokenRe)].map(match=>({text:match[0]}));}
async function call(payload){
  const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',apikey:publicKey,
    authorization:'Bearer '+publicKey},body:JSON.stringify(payload)});
  const body=await response.json().catch(()=>({error:'invalid_json'}));
  assert.equal(response.status,200,`live ${payload.op} failed: ${response.status} ${body.error||''}`);
  return body;
}
const same=(a,b)=>a.length===b.length&&a.every((value,index)=>value===b[index]);
const results=[];
for(let repeat=1;repeat<=2;repeat++){
  for(const [name,sentence,clickedIndex,expected] of fixtures){
    const list=tokens(sentence);
    assert.ok(list[clickedIndex],`${name}: clicked index drifted before request`);
    const out=await call({op:'phrase',sentence,tokens:list,clickedIndex});
    const raw=(out.candidates||out.members||[]).map(item=>({index:item.index,confidence:item.confidence}));
    const high=raw.filter(item=>item.confidence>=threshold).map(item=>item.index).sort((a,b)=>a-b);
    const predicted=high.includes(clickedIndex)&&high.length>=2;
    const pass=expected.length?same(high,expected):!predicted;
    results.push({repeat,name,clickedIndex,expected,serverAccepted:out.accepted,raw,high,predicted,pass});
  }
}
const positives=results.filter(row=>row.expected.length),negatives=results.filter(row=>!row.expected.length);
const positiveSelected=positives.flatMap(row=>row.raw.filter(item=>row.expected.includes(item.index)).map(item=>item.confidence));
const extraYes=results.flatMap(row=>row.raw.filter(item=>!row.expected.includes(item.index)).map(item=>item.confidence));
const min=list=>list.length?Math.min(...list):null,max=list=>list.length?Math.max(...list):null;
const summary={calls:results.length,pass:results.filter(row=>row.pass).length,fail:results.filter(row=>!row.pass).length,
  serverAccepted:results.filter(row=>row.serverAccepted).length,
  positiveConfidence:{min:min(positiveSelected),max:max(positiveSelected)},
  extraYesConfidence:{min:min(extraYes),max:max(extraYes)},
  failures:results.filter(row=>!row.pass),results};
console.log(JSON.stringify(summary,null,2));
if(summary.fail)process.exitCode=1;
