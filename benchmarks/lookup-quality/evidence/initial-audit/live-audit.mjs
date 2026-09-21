import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
const root=new URL('../breeze-reader-layout-stability/',import.meta.url);
const config=readFileSync(new URL('config.js',root),'utf8');
const key=config.match(/SB_KEY:\s*'([^']+)'/)[1];
const endpoint=config.match(/SB_URL:\s*'([^']+)'/)[1]+'/functions/v1/dict';
const device='audit-'+randomUUID();
const cases=[
 ['apple-cart-idiom','His reckless announcement upset the apple cart.','apple'],
 ['apple-cart-idiom-repeat','His reckless announcement upset the apple cart.','apple'],
 ['apple-literal','She picked an apple from the tree.','apple'],
 ['apple-company',"Apple's latest device sold out within hours.","Apple's"],
 ['apple-possessive-literal',"The apple's skin was bright red.","apple's"],
 ['give-up','She gave the plan up after the meeting.','gave'],
 ['feather','Winning the award was a feather in your cap.','feather'],
 ['ordinary-collocation','They made a difficult decision after lunch.','decision'],
 ['apple-cart-wide','Everyone agreed to keep the existing arrangement. His reckless announcement upset the apple cart. The entire plan collapsed as a result.','apple'],
 ['bank-polysemy','He visited the bank for a loan. He sat by the bank of the river. The water was rising.','bank',11]
];
const results=[];
for(const [id,sentence,clicked,explicit] of cases){
 const tokens=[...sentence.matchAll(/[A-Za-z](?:[A-Za-z'’\-]*[A-Za-z])?/g)].map(m=>({text:m[0]}));
 const clickedIndex=explicit??tokens.findIndex(t=>t.text===clicked);
 const payload={op:'look',word:clicked.toLowerCase().replace(/'s$/,''),clicked,sentence,tokens,clickedIndex,device,retry:id.endsWith('wide')};
 const started=performance.now();const r=await fetch(endpoint,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(45000)});
 const response=await r.json();const row={id,sentence,clicked,clickedIndex,status:r.status,ms:Math.round(performance.now()-started),response};results.push(row);console.log(JSON.stringify(row));
 if(r.status===429)break;
}
const source=await fetch('https://breeze.io.kr/scripts/dictionary/dictionary.js',{cache:'no-store'});
const deployed=await source.text();const local=readFileSync(new URL('scripts/dictionary/dictionary.js',root),'utf8');
const hash=s=>createHash('sha256').update(s).digest('hex');
const artifact={at:new Date().toISOString(),source:{url:source.url,status:source.status,localHash:hash(local),deployedHash:hash(deployed),matches:local===deployed},results};
writeFileSync(new URL('live-results.json',import.meta.url),JSON.stringify(artifact,null,2));
console.log(JSON.stringify(artifact.source));
